/**
 * Wallet Service - Single Source of Truth for Organization Wallet Operations
 *
 * WHY: Centralized wallet management for usage-based billing
 * HOW: Manages wallet balance, charges, top-ups, and auto-top-up logic
 *
 * ARCHITECTURE:
 * - This is the ONLY place wallet operations should happen
 * - All routers must use this service for wallet operations
 * - Handles auto-top-up when balance drops below threshold
 * - Uses Stripe for payment processing
 *
 * KEY CONCEPTS:
 * - Amounts are in MILLICENTS to handle sub-cent pricing (1000 = $1.00)
 * - WHY MILLICENTS: Sub-cent pricing ($0.015 starter, $0.008 enterprise)
 *   can't be integer cents without precision loss. Millicents give clean integers.
 * - Auto-top-up triggers when balance < threshold (default: $0)
 * - Minimum top-up amount is $1.00 (1000 millicents)
 * - Organizations start with $1.00 (1000 millicents) free credit
 *
 * STRIPE BOUNDARY:
 * - Stripe always works in CENTS. Conversions happen at the boundary:
 *   TO Stripe: millicents / 10 = cents
 *   FROM Stripe: cents * 10 = millicents
 * - Top-up amounts are always whole dollars so millicents/10 is always clean.
 *
 * SOURCE OF TRUTH: WalletService, OrganizationWallet, WalletTransaction
 */

import 'server-only'

import { prisma } from '@/lib/config'
import { stripe } from '@/lib/config/stripe'
import { logActivity } from './activity-log.service'
import type {
  OrganizationWallet,
  WalletTransaction,
  WalletTransactionType,
  WalletTransactionStatus,
  WalletChargeCategory,
} from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for charging the wallet
 * SOURCE OF TRUTH: ChargeWalletInput
 */
export interface ChargeWalletInput {
  organizationId: string
  amount: number // Amount in MILLICENTS (positive number, 1000 = $1.00)
  category: WalletChargeCategory
  description: string
  metadata?: Record<string, unknown>
}

/**
 * Input for manual top-up
 * SOURCE OF TRUTH: TopUpWalletInput
 */
export interface TopUpWalletInput {
  organizationId: string
  amount: number // Amount in MILLICENTS (minimum 1000 = $1.00)
  paymentMethodId?: string // Optional - uses default if not provided
}

/**
 * Result of a charge operation
 * SOURCE OF TRUTH: ChargeResult
 */
export interface ChargeResult {
  success: boolean
  transaction: WalletTransaction
  newBalance: number
  autoTopUpTriggered: boolean
  autoTopUpTransaction?: WalletTransaction
}

/**
 * Wallet with formatted amounts for display
 * SOURCE OF TRUTH: WalletWithDetails
 */
export interface WalletWithDetails {
  id: string
  organizationId: string
  balance: number // In millicents
  balanceFormatted: string // e.g., "$47.52"
  currency: string
  autoTopUpEnabled: boolean
  autoTopUpThreshold: number
  autoTopUpAmount: number
  createdAt: Date
  updatedAt: Date
}

/**
 * Input for listing transactions
 * SOURCE OF TRUTH: ListTransactionsInput
 */
export interface ListTransactionsInput {
  walletId: string
  page?: number
  pageSize?: number
  type?: WalletTransactionType
  search?: string
}

/**
 * Result of listing transactions
 * SOURCE OF TRUTH: ListTransactionsResult
 */
export interface ListTransactionsResult {
  transactions: WalletTransaction[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Initial free credit for new wallets (1000 millicents = $1.00) */
const INITIAL_FREE_CREDIT = 1000

/**
 * Beta test mode flag — when true, disables auto top-up and manual top-up.
 * Set to false to enable live Stripe payments and auto-top-up.
 */
export const BETA_TEST_MODE = true

/** Minimum top-up amount (1000 millicents = $1.00) */
const MINIMUM_TOP_UP_AMOUNT = 1000

/** Default auto-top-up threshold (0 millicents = $0.00) */
const DEFAULT_AUTO_TOP_UP_THRESHOLD = 0

/** Default auto-top-up amount (1000 millicents = $1.00) */
const DEFAULT_AUTO_TOP_UP_AMOUNT = 1000

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format millicents to currency string
 * WHY: Wallet amounts are stored in millicents (1000 = $1.00)
 * Smart decimals: shows 3 decimal places when sub-cent precision exists ($0.015),
 * otherwise shows 2 ($50.08) or 0 for whole dollars ($50).
 */
function formatMillicents(millicents: number, currency: string = 'USD'): string {
  const amount = millicents / 1000
  const isWholeNumber = amount % 1 === 0
  /** Check if the third decimal is non-zero (sub-cent value like $0.015, $0.008) */
  const hasSubCentPrecision = !isWholeNumber && Math.round(amount * 1000) % 10 !== 0

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: isWholeNumber ? 0 : 2,
    maximumFractionDigits: hasSubCentPrecision ? 3 : 2,
  }).format(amount)
}

/**
 * Convert millicents to Stripe cents
 * WHY: Stripe API always expects amounts in cents (100 = $1.00)
 * HOW: Divide by 10 and round to nearest cent
 */
function toStripeCents(millicents: number): number {
  return Math.round(millicents / 10)
}

/**
 * Get Stripe customer ID for an organization
 */
async function getStripeCustomerId(organizationId: string): Promise<string | null> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      referenceId: organizationId,
      status: { in: ['active', 'trialing', 'past_due'] },
    },
    select: { stripeCustomerId: true },
  })

  return subscription?.stripeCustomerId || null
}

// ============================================================================
// WALLET CREATION & RETRIEVAL
// ============================================================================

/**
 * Create a new wallet for an organization
 * Called automatically when organization is created
 *
 * @param organizationId - Organization ID to create wallet for
 * @param userId - Optional user ID for activity logging
 * @returns The created wallet
 */
export async function createWallet(
  organizationId: string,
  userId?: string
): Promise<OrganizationWallet> {
  // Check if wallet already exists
  const existingWallet = await prisma.organizationWallet.findUnique({
    where: { organizationId },
  })

  if (existingWallet) {
    return existingWallet
  }

  // Create wallet with initial free credit in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the wallet
    const wallet = await tx.organizationWallet.create({
      data: {
        organizationId,
        balance: INITIAL_FREE_CREDIT,
        currency: 'USD',
        autoTopUpEnabled: true,
        autoTopUpThreshold: DEFAULT_AUTO_TOP_UP_THRESHOLD,
        autoTopUpAmount: DEFAULT_AUTO_TOP_UP_AMOUNT,
      },
    })

    // Create the initial free credit transaction
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'TOP_UP',
        status: 'COMPLETED',
        category: 'FREE_CREDIT',
        amount: INITIAL_FREE_CREDIT,
        currency: 'USD',
        balanceAfter: INITIAL_FREE_CREDIT,
        description: 'Initial free credit',
      },
    })

    return wallet
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'wallet',
      entityId: result.id,
    })
  }

  return result
}

/**
 * Get wallet for an organization
 * Creates wallet if it doesn't exist (for backwards compatibility)
 *
 * @param organizationId - Organization ID to get wallet for
 * @returns The wallet or null if organization doesn't exist
 */
export async function getWallet(organizationId: string): Promise<OrganizationWallet | null> {
  let wallet = await prisma.organizationWallet.findUnique({
    where: { organizationId },
  })

  // Auto-create wallet if it doesn't exist (backwards compatibility)
  if (!wallet) {
    // Verify organization exists first
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    })

    if (!org) {
      return null
    }

    wallet = await createWallet(organizationId)
  }

  return wallet
}

/**
 * Get wallet with formatted details for display
 *
 * @param organizationId - Organization ID
 * @returns Wallet with formatted amounts or null
 */
export async function getWalletWithDetails(organizationId: string): Promise<WalletWithDetails | null> {
  const wallet = await getWallet(organizationId)

  if (!wallet) {
    return null
  }

  return {
    id: wallet.id,
    organizationId: wallet.organizationId,
    balance: wallet.balance,
    balanceFormatted: formatMillicents(wallet.balance, wallet.currency),
    currency: wallet.currency,
    autoTopUpEnabled: wallet.autoTopUpEnabled,
    autoTopUpThreshold: wallet.autoTopUpThreshold,
    autoTopUpAmount: wallet.autoTopUpAmount,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  }
}

// ============================================================================
// CHARGING (DEDUCTING FUNDS)
// ============================================================================

/**
 * Charge the wallet (deduct funds for usage)
 * This is the main function other services should call to charge for usage
 *
 * FLOW: Pre-flight check → auto-top-up if needed → then charge
 * WHY: We top up BEFORE charging so the balance never goes negative.
 * If auto-top-up fails (no payment method, card declined), the charge
 * still proceeds — usage already happened and must be recorded.
 *
 * @param input - Charge details (amount in MILLICENTS)
 * @returns Charge result with transaction details
 */
export async function chargeWallet(input: ChargeWalletInput): Promise<ChargeResult> {
  const { organizationId, amount, category, description, metadata } = input

  // Validate amount is positive
  if (amount <= 0) {
    throw new Error('Charge amount must be positive')
  }

  // Get or create wallet
  const wallet = await getWallet(organizationId)
  if (!wallet) {
    throw new Error('Organization not found')
  }

  const chargeAmount = -Math.abs(amount)
  let currentBalance = wallet.balance

  // ── PRE-CHARGE AUTO-TOP-UP ──
  // Check if the charge WOULD drop the balance below threshold.
  // If so, top up FIRST so the balance stays positive after the charge.
  let autoTopUpTriggered = false
  let autoTopUpTransaction: WalletTransaction | undefined

  const projectedBalance = currentBalance + chargeAmount

  if (!BETA_TEST_MODE && wallet.autoTopUpEnabled && projectedBalance < wallet.autoTopUpThreshold) {
    try {
      const topUpResult = await performAutoTopUp(organizationId, wallet, currentBalance)
      if (topUpResult) {
        autoTopUpTriggered = true
        autoTopUpTransaction = topUpResult.transaction
        currentBalance = topUpResult.newBalance // Balance is now topped up
      }
    } catch (error) {
      // Log error but don't block the charge — usage already happened
      console.error('Pre-charge auto top-up failed:', error)
    }
  }

  // ── PERFORM THE CHARGE ──
  // Deduct from the (potentially topped-up) balance
  const newBalance = currentBalance + chargeAmount

  const result = await prisma.$transaction(async (tx) => {
    // Create the charge transaction
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'CHARGE',
        status: 'COMPLETED',
        category,
        amount: chargeAmount,
        currency: wallet.currency,
        balanceAfter: newBalance,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })

    // Update wallet balance
    await tx.organizationWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    return { transaction, newBalance }
  })

  return {
    success: true,
    transaction: result.transaction,
    newBalance,
    autoTopUpTriggered,
    autoTopUpTransaction,
  }
}

// ============================================================================
// TOP-UP (ADDING FUNDS)
// ============================================================================

/**
 * Perform auto top-up when balance is (or would be) below threshold
 * Uses the default payment method on file
 *
 * STRIPE BOUNDARY: Converts millicents to cents before sending to Stripe
 *
 * Called PRE-CHARGE: when the projected post-charge balance would be below
 * the auto-top-up threshold, this runs BEFORE the charge so the balance
 * stays positive.
 *
 * @param organizationId - Organization ID
 * @param wallet - Wallet config (for autoTopUpAmount, currency, etc.)
 * @param currentBalance - The current wallet balance at time of invocation
 * @returns Top-up result or null if failed
 */
async function performAutoTopUp(
  organizationId: string,
  wallet: OrganizationWallet,
  currentBalance: number
): Promise<{ transaction: WalletTransaction; newBalance: number } | null> {
  const stripeCustomerId = await getStripeCustomerId(organizationId)

  if (!stripeCustomerId) {
    console.error('Auto top-up failed: No Stripe customer found')
    return null
  }

  // Get customer with default payment method
  const customer = await stripe.customers.retrieve(stripeCustomerId)
  if (customer.deleted) {
    console.error('Auto top-up failed: Customer deleted')
    return null
  }

  const defaultPaymentMethodId =
    typeof customer.invoice_settings.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings.default_payment_method?.id

  if (!defaultPaymentMethodId) {
    console.error('Auto top-up failed: No default payment method')
    return null
  }

  // Convert millicents to Stripe cents for the payment intent
  const stripeAmountCents = toStripeCents(wallet.autoTopUpAmount)

  // Create payment intent for auto top-up
  const paymentIntent = await stripe.paymentIntents.create({
    amount: stripeAmountCents,
    currency: wallet.currency.toLowerCase(),
    customer: stripeCustomerId,
    payment_method: defaultPaymentMethodId,
    confirm: true,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    metadata: {
      type: 'wallet_auto_top_up',
      organizationId,
      walletId: wallet.id,
    },
  })

  if (paymentIntent.status !== 'succeeded') {
    console.error('Auto top-up failed: Payment not succeeded', paymentIntent.status)
    return null
  }

  // Use currentBalance (post-charge) instead of stale wallet.balance
  const newBalance = currentBalance + wallet.autoTopUpAmount

  const transaction = await prisma.$transaction(async (tx) => {
    const txn = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'TOP_UP',
        status: 'COMPLETED',
        category: 'AUTO_TOP_UP',
        amount: wallet.autoTopUpAmount,
        currency: wallet.currency,
        balanceAfter: newBalance,
        description: 'Auto top-up triggered',
        stripePaymentIntentId: paymentIntent.id,
      },
    })

    await tx.organizationWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    return txn
  })

  return { transaction, newBalance }
}

/**
 * Manual top-up - add funds to wallet
 *
 * STRIPE BOUNDARY: Converts millicents to cents before sending to Stripe,
 * but stores the original millicent amount in the wallet.
 *
 * @param input - Top-up details (amount in MILLICENTS)
 * @returns The transaction and new balance
 */
export async function topUpWallet(input: TopUpWalletInput): Promise<{
  transaction: WalletTransaction
  newBalance: number
  clientSecret?: string
}> {
  const { organizationId, amount, paymentMethodId } = input

  // Validate minimum amount
  if (amount < MINIMUM_TOP_UP_AMOUNT) {
    throw new Error(`Minimum top-up amount is $${MINIMUM_TOP_UP_AMOUNT / 1000}`)
  }

  const wallet = await getWallet(organizationId)
  if (!wallet) {
    throw new Error('Organization not found')
  }

  const stripeCustomerId = await getStripeCustomerId(organizationId)
  if (!stripeCustomerId) {
    throw new Error('No payment method on file. Please add a payment method first.')
  }

  // Determine which payment method to use
  let pmId = paymentMethodId

  if (!pmId) {
    // Use default payment method
    const customer = await stripe.customers.retrieve(stripeCustomerId)
    if (customer.deleted) {
      throw new Error('Customer not found')
    }

    pmId =
      typeof customer.invoice_settings.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings.default_payment_method?.id

    if (!pmId) {
      throw new Error('No default payment method. Please add a payment method first.')
    }
  }

  // Convert millicents to Stripe cents for the payment intent
  const stripeAmountCents = toStripeCents(amount)

  // Create payment intent with Stripe (in cents)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: stripeAmountCents,
    currency: wallet.currency.toLowerCase(),
    customer: stripeCustomerId,
    payment_method: pmId,
    confirm: true,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    metadata: {
      type: 'wallet_manual_top_up',
      organizationId,
      walletId: wallet.id,
    },
  })

  // If payment requires additional action, return client secret
  if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_confirmation') {
    // Create pending transaction (amount stored in millicents)
    const pendingTxn = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'TOP_UP',
        status: 'PENDING',
        category: 'MANUAL_TOP_UP',
        amount,
        currency: wallet.currency,
        balanceAfter: wallet.balance, // Will be updated when payment succeeds
        description: 'Manual top-up (pending)',
        stripePaymentIntentId: paymentIntent.id,
      },
    })

    return {
      transaction: pendingTxn,
      newBalance: wallet.balance,
      clientSecret: paymentIntent.client_secret ?? undefined,
    }
  }

  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Payment failed: ${paymentIntent.status}`)
  }

  // Payment succeeded - update wallet (amount in millicents)
  const newBalance = wallet.balance + amount

  const transaction = await prisma.$transaction(async (tx) => {
    const txn = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'TOP_UP',
        status: 'COMPLETED',
        category: 'MANUAL_TOP_UP',
        amount,
        currency: wallet.currency,
        balanceAfter: newBalance,
        description: 'Manual top-up',
        stripePaymentIntentId: paymentIntent.id,
      },
    })

    await tx.organizationWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    return txn
  })

  return { transaction, newBalance }
}

/**
 * Complete a pending top-up after successful payment
 * Called from Stripe webhook when payment_intent.succeeded
 *
 * @param stripePaymentIntentId - The Stripe payment intent ID
 */
export async function completePendingTopUp(stripePaymentIntentId: string): Promise<void> {
  const pendingTxn = await prisma.walletTransaction.findFirst({
    where: {
      stripePaymentIntentId,
      status: 'PENDING',
    },
    include: {
      wallet: true,
    },
  })

  if (!pendingTxn) {
    console.log('No pending transaction found for payment intent:', stripePaymentIntentId)
    return
  }

  const newBalance = pendingTxn.wallet.balance + pendingTxn.amount

  await prisma.$transaction(async (tx) => {
    await tx.walletTransaction.update({
      where: { id: pendingTxn.id },
      data: {
        status: 'COMPLETED',
        balanceAfter: newBalance,
        description: 'Manual top-up',
      },
    })

    await tx.organizationWallet.update({
      where: { id: pendingTxn.walletId },
      data: { balance: newBalance },
    })
  })
}

// ============================================================================
// TRANSACTIONS
// ============================================================================

/**
 * List wallet transactions with pagination and filtering
 *
 * @param input - Filter and pagination options
 * @returns Paginated list of transactions
 */
export async function listTransactions(input: ListTransactionsInput): Promise<ListTransactionsResult> {
  const { walletId, page = 1, pageSize = 10, type, search } = input

  /**
   * Build where clause for Prisma query
   * NOTE: category is an enum, so we can only filter by exact match
   * Search only applies to description field
   */
  const where = {
    walletId,
    ...(type && { type }),
    ...(search && {
      description: { contains: search, mode: 'insensitive' as const },
    }),
  }

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.walletTransaction.count({ where }),
  ])

  return {
    transactions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get transactions by organization ID (convenience method)
 *
 * @param organizationId - Organization ID
 * @param options - Filter and pagination options
 * @returns Paginated list of transactions
 */
export async function getTransactionsByOrganization(
  organizationId: string,
  options: Omit<ListTransactionsInput, 'walletId'> = {}
): Promise<ListTransactionsResult> {
  const wallet = await getWallet(organizationId)

  if (!wallet) {
    return {
      transactions: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    }
  }

  return listTransactions({
    walletId: wallet.id,
    ...options,
  })
}

// ============================================================================
// SETTINGS
// ============================================================================

/**
 * Update wallet auto-top-up settings
 *
 * @param organizationId - Organization ID
 * @param settings - New settings (amounts in MILLICENTS)
 * @param userId - Optional user ID for activity logging
 * @returns Updated wallet
 */
export async function updateAutoTopUpSettings(
  organizationId: string,
  settings: {
    autoTopUpEnabled?: boolean
    autoTopUpAmount?: number
    autoTopUpThreshold?: number
  },
  userId?: string
): Promise<OrganizationWallet> {
  const wallet = await getWallet(organizationId)

  if (!wallet) {
    throw new Error('Organization not found')
  }

  // Validate auto-top-up amount if provided
  if (settings.autoTopUpAmount !== undefined && settings.autoTopUpAmount < MINIMUM_TOP_UP_AMOUNT) {
    throw new Error(`Minimum auto top-up amount is $${MINIMUM_TOP_UP_AMOUNT / 1000}`)
  }

  const updatedWallet = await prisma.organizationWallet.update({
    where: { id: wallet.id },
    data: {
      ...(settings.autoTopUpEnabled !== undefined && { autoTopUpEnabled: settings.autoTopUpEnabled }),
      ...(settings.autoTopUpAmount !== undefined && { autoTopUpAmount: settings.autoTopUpAmount }),
      ...(settings.autoTopUpThreshold !== undefined && { autoTopUpThreshold: settings.autoTopUpThreshold }),
    },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'wallet',
      entityId: updatedWallet.id,
    })
  }

  return updatedWallet
}

// ============================================================================
// PRE-FLIGHT BALANCE CHECK
// ============================================================================

/**
 * Result of a pre-flight balance check
 * SOURCE OF TRUTH: BalanceCheckResult, PreFlightBalanceCheck
 */
export interface BalanceCheckResult {
  /** Whether the organization is allowed to proceed with usage */
  allowed: boolean
  /** Current wallet balance in millicents */
  balance: number
  /** Human-readable reason if blocked */
  reason?: string
}

/**
 * Pre-flight balance check — call BEFORE starting usage (AI generation, etc.)
 *
 * WHY: Prevents usage when the organization has no funds, avoiding negative balances.
 * Without this, AI generation runs first and charges after, allowing the balance
 * to go negative when auto-top-up is disabled or unavailable.
 *
 * HOW: Checks wallet balance and attempts auto-top-up if enabled and needed.
 *
 * FLOW:
 * 1. Balance > 0 → allowed (enough funds for at least some usage)
 * 2. Balance <= 0, beta mode → blocked (no auto-top-up in beta)
 * 3. Balance <= 0, auto-top-up enabled → attempt top-up → allowed if succeeded
 * 4. Balance <= 0, auto-top-up disabled → blocked
 *
 * SOURCE OF TRUTH: ensureSufficientBalance, PreFlightBalanceCheck
 *
 * @param organizationId - Organization to check
 * @returns Object with allowed flag, current balance, and optional block reason
 */
export async function ensureSufficientBalance(
  organizationId: string
): Promise<BalanceCheckResult> {
  const wallet = await getWallet(organizationId)
  if (!wallet) {
    return { allowed: false, balance: 0, reason: 'Organization not found' }
  }

  // If balance is positive, allow usage
  if (wallet.balance > 0) {
    return { allowed: true, balance: wallet.balance }
  }

  // Balance is <= 0 — check if we can auto-top-up
  if (BETA_TEST_MODE) {
    return {
      allowed: false,
      balance: wallet.balance,
      reason: 'Insufficient wallet balance. Top-ups are disabled during beta.',
    }
  }

  // Production mode: try auto-top-up if enabled
  if (wallet.autoTopUpEnabled) {
    try {
      const topUpResult = await performAutoTopUp(organizationId, wallet, wallet.balance)
      if (topUpResult) {
        return { allowed: true, balance: topUpResult.newBalance }
      }
    } catch (error) {
      console.error('Pre-flight auto top-up failed:', error)
    }

    // Auto-top-up was enabled but failed (no payment method, card declined, etc.)
    return {
      allowed: false,
      balance: wallet.balance,
      reason: 'Insufficient wallet balance. Auto top-up failed — please check your payment method.',
    }
  }

  // Auto-top-up disabled, balance depleted
  return {
    allowed: false,
    balance: wallet.balance,
    reason: 'Insufficient wallet balance. Please add funds to continue.',
  }
}

// ============================================================================
// USAGE CHARGING HELPERS - TIER-AWARE
// ============================================================================

/**
 * Record a $0 audit transaction for portal tier (or any zero-cost charge)
 *
 * WHY: chargeWallet() requires amount > 0, but portal tier has $0 costs.
 * We still want an audit trail of usage, so we record a zero-amount transaction directly.
 *
 * @param organizationId - Organization to record usage for
 * @param category - Charge category (EMAIL, AI_USAGE, etc.)
 * @param description - Description for transaction
 * @param metadata - Metadata to store with the transaction
 * @returns ChargeResult with the zero-amount transaction
 */
async function recordZeroCostTransaction(
  organizationId: string,
  category: WalletChargeCategory,
  description: string,
  metadata?: Record<string, unknown>
): Promise<ChargeResult> {
  const wallet = await getWallet(organizationId)
  if (!wallet) throw new Error('Organization not found')

  const transaction = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'CHARGE',
      status: 'COMPLETED',
      category,
      amount: 0,
      currency: wallet.currency,
      balanceAfter: wallet.balance,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  })

  return {
    success: true,
    transaction,
    newBalance: wallet.balance,
    autoTopUpTriggered: false,
  }
}

/**
 * Charge for email usage (single email) with TIER-AWARE pricing
 *
 * SOURCE OF TRUTH: chargeForEmail, TierAwareEmailCharging
 *
 * WHY: Different tiers pay different amounts for email sending
 * HOW: Gets organization tier, then applies tier-specific pricing in MILLICENTS
 *
 * PRICING BY TIER (in millicents):
 * - free: 20 millicents ($0.02 per email)
 * - starter: 15 millicents ($0.015 per email)
 * - pro: 10 millicents ($0.01 per email)
 * - enterprise: 8 millicents ($0.008 per email)
 * - portal: 0 millicents ($0 - platform pays Resend costs)
 *
 * @param organizationId - Organization to charge
 * @param description - Description for transaction (e.g., "Marketing email to john@example.com")
 * @param metadata - Optional metadata (recipient, template ID, etc.)
 * @returns Charge result with transaction details (includes tier and rate in metadata)
 */
export async function chargeForEmail(
  organizationId: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<ChargeResult> {
  // Get organization tier first
  const { getOrganizationTier } = await import('@/services/feature-gate.service')
  const tierInfo = await getOrganizationTier(organizationId)
  const tier = tierInfo.tier

  // Get tier-specific email cost in millicents
  const { getEmailCostMillicentsByTier } = await import('@/lib/config/usage-pricing')
  const costInMillicents = await getEmailCostMillicentsByTier(tier)

  const chargeMetadata = {
    ...metadata,
    appliedTier: tier,
    appliedRateMillicents: costInMillicents,
  }

  // Portal tier has $0 cost — record audit transaction without calling chargeWallet
  // (chargeWallet requires amount > 0)
  if (costInMillicents <= 0) {
    return recordZeroCostTransaction(organizationId, 'EMAIL', description, chargeMetadata)
  }

  return chargeWallet({
    organizationId,
    amount: costInMillicents,
    category: 'EMAIL',
    description,
    metadata: chargeMetadata,
  })
}

/**
 * Charge for multiple emails (batch) with TIER-AWARE pricing
 *
 * SOURCE OF TRUTH: chargeForEmailBatch, TierAwareBatchEmailCharging
 *
 * WHY: Efficient charging for bulk email operations with tier-specific pricing
 * HOW: Gets per-email cost in millicents based on tier and multiplies by count
 *
 * @param organizationId - Organization to charge
 * @param emailCount - Number of emails sent
 * @param description - Description for transaction (e.g., "Campaign: Welcome Series - 100 emails")
 * @param metadata - Optional metadata (campaign ID, recipient count, etc.)
 * @returns Charge result with transaction details (includes tier and rate in metadata)
 */
export async function chargeForEmailBatch(
  organizationId: string,
  emailCount: number,
  description: string,
  metadata?: Record<string, unknown>
): Promise<ChargeResult> {
  if (emailCount <= 0) {
    throw new Error('Email count must be positive')
  }

  // Get organization tier first
  const { getOrganizationTier } = await import('@/services/feature-gate.service')
  const tierInfo = await getOrganizationTier(organizationId)
  const tier = tierInfo.tier

  // Get tier-specific email cost in millicents
  const { getEmailCostMillicentsByTier } = await import('@/lib/config/usage-pricing')
  const costPerEmail = await getEmailCostMillicentsByTier(tier)
  const totalCost = costPerEmail * emailCount

  const chargeMetadata = {
    ...metadata,
    emailCount,
    costPerEmail,
    appliedTier: tier,
    appliedRateMillicents: costPerEmail,
  }

  // Portal tier has $0 cost — record audit transaction without calling chargeWallet
  if (totalCost <= 0) {
    return recordZeroCostTransaction(organizationId, 'EMAIL', description, chargeMetadata)
  }

  return chargeWallet({
    organizationId,
    amount: totalCost,
    category: 'EMAIL',
    description,
    metadata: chargeMetadata,
  })
}

/**
 * Charge for AI usage (per 1K tokens) with TIER-AWARE pricing
 *
 * SOURCE OF TRUTH: chargeForAIUsage, TierAwareAICharging
 *
 * WHY: AI agent usage (generateText) consumes tokens that cost money
 * HOW: Gets organization tier, applies per-1K-token rate, charges wallet
 *
 * FORMULA: Math.ceil((totalTokens / 1000) * costPerCreditMillicents)
 * - Uses Math.ceil so partial blocks are always rounded up (no free tokens)
 *
 * PRICING BY TIER (per 1K tokens, in millicents):
 * - free: 2 millicents ($0.002)
 * - starter: 2 millicents ($0.0015 → rounded)
 * - pro: 1 millicent ($0.001)
 * - enterprise: 1 millicent ($0.0008 → rounded)
 * - portal: 0 millicents ($0 - platform absorbs AI costs)
 *
 * @param organizationId - Organization to charge
 * @param totalTokens - Total tokens used (promptTokens + completionTokens)
 * @param model - AI model name for metadata tracking
 * @param description - Description for transaction (e.g., "Mochi AI chat")
 * @param metadata - Optional additional metadata
 * @returns Charge result with transaction details (includes tier, rate, and token count in metadata)
 */
export async function chargeForAIUsage(
  organizationId: string,
  totalTokens: number,
  model: string,
  description: string,
  metadata?: Record<string, unknown>
): Promise<ChargeResult> {
  if (totalTokens <= 0) {
    throw new Error('Total tokens must be positive')
  }

  // Get organization tier for tier-specific pricing
  const { getOrganizationTier } = await import('@/services/feature-gate.service')
  const tierInfo = await getOrganizationTier(organizationId)
  const tier = tierInfo.tier

  // Get tier-specific cost per 1K tokens in millicents
  const { getAICreditCostMillicentsByTier } = await import('@/lib/config/usage-pricing')
  const costPerCreditMillicents = await getAICreditCostMillicentsByTier(tier)

  // Calculate total cost: ceil rounds up so partial blocks aren't free
  const totalCost = Math.ceil((totalTokens / 1000) * costPerCreditMillicents)

  const chargeMetadata = {
    ...metadata,
    totalTokens,
    model,
    appliedTier: tier,
    appliedRateMillicents: costPerCreditMillicents,
  }

  // Portal tier has $0 cost — record audit transaction without calling chargeWallet
  if (totalCost <= 0) {
    return recordZeroCostTransaction(organizationId, 'AI_USAGE', description, chargeMetadata)
  }

  // Charge wallet for non-zero cost tiers
  return chargeWallet({
    organizationId,
    amount: totalCost,
    category: 'AI_USAGE',
    description,
    metadata: chargeMetadata,
  })
}

// ============================================================================
// FAILED CHARGE RECORDING - AUDIT TRAIL FOR CHARGE FAILURES
// ============================================================================

/**
 * Token breakdown for AI usage — separates prompt from completion tokens.
 * Used in metadata for failed charge audit records.
 *
 * SOURCE OF TRUTH: AITokenBreakdown, FailedChargeTokenBreakdown
 */
export interface AITokenBreakdown {
  promptTokens: number
  completionTokens: number
}

/**
 * Record a FAILED wallet charge transaction for audit/recovery purposes.
 *
 * WHY: When chargeForAIUsage fails after retries, we still need an audit
 * trail so that:
 *  1. Finance can see which charges were lost and investigate
 *  2. An automated recovery job can retry these later
 *  3. We never silently lose revenue — every AI call is accounted for
 *
 * HOW: Creates a WalletTransaction with status FAILED and stores all
 * relevant details (tokens, model, tier, cost, failure reason) in metadata.
 * The transaction amount is set to the negative expected cost (same as a
 * completed charge) so queries for total lost revenue are straightforward.
 *
 * NOTE: This function itself must never throw — it's called from a last-resort
 * catch block. If even this fails, the caller logs a CRITICAL error.
 *
 * SOURCE OF TRUTH: recordFailedAICharge, FailedAIChargeAudit
 *
 * @param organizationId - Organization that should have been charged
 * @param totalTokens - Total tokens consumed by the AI generation
 * @param model - AI model identifier (e.g., "anthropic/claude-sonnet-4.5")
 * @param description - Human-readable description (e.g., "Mochi AI chat")
 * @param errorMessage - The error message from the failed charge attempt
 * @param tokenBreakdown - Optional breakdown of prompt vs completion tokens
 */
export async function recordFailedAICharge(
  organizationId: string,
  totalTokens: number,
  model: string,
  description: string,
  errorMessage: string,
  tokenBreakdown?: AITokenBreakdown
): Promise<void> {
  /** Get the wallet — we need its ID to create the transaction record */
  const wallet = await getWallet(organizationId)
  if (!wallet) {
    console.error('[Wallet] recordFailedAICharge: Organization wallet not found', organizationId)
    return
  }

  /**
   * Look up the org's tier and per-1K-token cost to calculate what
   * SHOULD have been charged. Uses the same dynamic import pattern
   * as chargeForAIUsage to avoid circular dependencies.
   */
  const { getOrganizationTier } = await import('@/services/feature-gate.service')
  const tierInfo = await getOrganizationTier(organizationId)
  const tier = tierInfo.tier

  const { getAICreditCostMillicentsByTier } = await import('@/lib/config/usage-pricing')
  const costPerCreditMillicents = await getAICreditCostMillicentsByTier(tier)

  /** Calculate expected cost — ceil rounds up so partial blocks aren't free */
  const expectedCost = Math.ceil((totalTokens / 1000) * costPerCreditMillicents)

  /** Create a FAILED transaction as an audit trail for later recovery */
  await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'CHARGE',
      status: 'FAILED',
      category: 'AI_USAGE',
      /** Negative amount mirrors the charge convention used in chargeWallet */
      amount: -Math.abs(expectedCost),
      currency: wallet.currency,
      /** Balance unchanged since the charge never went through */
      balanceAfter: wallet.balance,
      description: `[FAILED] ${description}`,
      metadata: JSON.stringify({
        totalTokens,
        model,
        appliedTier: tier,
        appliedRateMillicents: costPerCreditMillicents,
        expectedCostMillicents: expectedCost,
        failureReason: errorMessage,
        ...(tokenBreakdown && {
          promptTokens: tokenBreakdown.promptTokens,
          completionTokens: tokenBreakdown.completionTokens,
        }),
      }),
    },
  })
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  INITIAL_FREE_CREDIT,
  MINIMUM_TOP_UP_AMOUNT,
  DEFAULT_AUTO_TOP_UP_THRESHOLD,
  DEFAULT_AUTO_TOP_UP_AMOUNT,
  formatMillicents,
}
