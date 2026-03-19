/**
 * Checkout Service
 *
 * Consolidates all checkout flows: payment link checkout, embedded payment
 * element checkout, and cart checkout into a single service file.
 *
 * THREE CHECKOUT SOURCES:
 * 1. Payment Link: createCheckoutIntent() — routes by billing type
 * 2. Embedded Element: createEmbeddedCheckoutIntent() — direct product/price
 * 3. Cart: createCartCheckoutSession() — mixed items with validation
 *
 * BILLING TYPE ROUTING:
 * - ONE_TIME → PaymentIntent
 * - RECURRING → Subscription (with optional trial)
 * - SPLIT_PAYMENT → Subscription (auto-cancel after last installment)
 *
 * TEST MODE:
 * All checkout functions support test mode via centralized test-mode utilities.
 * In test mode: payments on platform's test account, no DB records, triggers
 * fire from Stripe metadata.
 *
 * SOURCE OF TRUTH: CheckoutService, PaymentLinkCheckout, EmbeddedCheckout, CartCheckout
 */

import 'server-only'
import { prisma, getStripeInstance } from '@/lib/config'
import type Stripe from 'stripe'
import { BillingInterval, BillingType, TransactionPaymentStatus } from '@/generated/prisma'
import { BILLING_TYPES } from '@/constants/billing'
import {
  getStripeTransactionFee,
  calculatePlatformFeeCents,
  type PlanKey,
} from '@/lib/config/feature-gates'
import { getOrganizationTier } from '@/services/feature-gate.service'
import {
  getStripePaymentConfig,
  buildPaymentMetadata,
  getConnectedAccountOptions,
} from '@/lib/stripe/test-mode'
import {
  checkAvailability,
} from '@/services/inventory.service'
import {
  getOrCreateStripeCustomer,
  getOrCreateStripeProduct,
  getOrCreateStripePrice,
  getOrCreateStripeTrialPrice,
  toStripeInterval,
  type CustomerData,
} from '@/services/payment/stripe-resources.service'
import {
  encodeTriggerItemsMetadata,
} from '@/services/payment/payment-triggers.service'

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CheckoutIntentInput = {
  paymentLinkId: string
  priceId: string
  customer: CustomerData
  /**
   * SOURCE OF TRUTH: PaymentTestMode
   * When true, uses Stripe TEST API keys for payment processing.
   * Allows testing with test credit cards (4242 4242 4242 4242).
   */
  testMode?: boolean
}

/**
 * SOURCE OF TRUTH: OrderBumpItem, EmbeddedOrderBump
 *
 * Optional add-on product included in the same payment.
 * Order bumps support ONE_TIME and RECURRING billing types (not SPLIT_PAYMENT).
 * - ONE_TIME bump: added to PaymentIntent amount or subscription's add_invoice_items
 * - RECURRING bump: added as subscription item or triggers mixed billing mode
 */
export type OrderBumpItem = {
  productId: string
  priceId: string
}

/**
 * SOURCE OF TRUTH: EmbeddedCheckoutIntentInput
 *
 * Input for creating a checkout intent directly from product/price IDs
 * without requiring a payment link. Used by the website builder's
 * embedded payment element.
 */
export type EmbeddedCheckoutIntentInput = {
  organizationId: string
  productId: string
  priceId: string
  customer: CustomerData
  /**
   * SOURCE OF TRUTH: PaymentTestMode
   * When true, uses Stripe TEST API keys for payment processing.
   * Allows testing with test credit cards (4242 4242 4242 4242).
   */
  testMode?: boolean
  /**
   * SOURCE OF TRUTH: EmbeddedOrderBumpInput
   * Optional order bump — an add-on product to include in the same payment.
   * Supports ONE_TIME and RECURRING billing types on the bump (not SPLIT_PAYMENT).
   * When the bump billing type differs from the main product, mixed billing mode
   * routes the checkout through Stripe subscription with add_invoice_items.
   */
  orderBump?: OrderBumpItem
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================


/**
 * Validated order bump data after server-side validation.
 * Contains the full price + product records from the DB.
 * Includes interval/intervalCount for RECURRING bumps used in mixed billing.
 *
 * SOURCE OF TRUTH: ValidatedOrderBump, MixedBillingOrderBump
 */
type ValidatedOrderBump = {
  price: {
    id: string
    name: string
    amount: number
    currency: string
    billingType: string
    /** Billing interval — present for RECURRING bumps, null for ONE_TIME */
    interval: BillingInterval | null
    /** Number of intervals between charges — present for RECURRING bumps */
    intervalCount: number | null
    /** Free trial period in days — when set, subscription starts in trialing state */
    trialDays: number | null
    productId: string
    product: {
      id: string
      name: string
      description: string | null
      imageUrl: string | null
    }
  }
  product: {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
  }
}

/**
 * SOURCE OF TRUTH: CheckoutContext, PreparedCheckout
 *
 * Shared context prepared for ALL checkout flows before routing to billing-type handlers.
 * Replaces the 8x copy-pasted sequence of: org resolution, getStripePaymentConfig,
 * customer creation, lead creation, tier lookup.
 */
type CheckoutContext = {
  /** Organization ID owning the products */
  organizationId: string
  /** Connected Stripe account ID (raw, before test mode adjustment) */
  connectedAccountId: string
  /** Stripe SDK instance (test or live based on testMode) */
  stripeInstance: Stripe
  /** Stripe customer on the correct account */
  stripeCustomer: Stripe.Customer
  /** Lead/contact ID for the customer in this org */
  leadId: string | null
  /** Organization's subscription tier for platform fee calculation */
  tier: PlanKey
  /** Tier-specific platform fee rates */
  feeConfig: ReturnType<typeof getStripeTransactionFee>
  /** Centralized test mode configuration (stripeOptions, metadata, fees, effectiveAccountId) */
  paymentConfig: ReturnType<typeof getStripePaymentConfig>
  /** Whether this checkout is in test mode */
  testMode: boolean
  /** Payment link ID — present for payment link flow, null for embedded/cart */
  paymentLinkId: string | null
  /** Checkout source for metadata */
  source: 'payment_link' | 'embedded_payment' | 'cart_checkout' | 'invoice_payment'
}

/**
 * Shared price shape accepted by the unified handlers.
 * Both PaymentLink prices and Embedded prices conform to this.
 */
type UnifiedPrice = {
  id: string
  name: string
  amount: number
  currency: string
  billingType: string
  interval: BillingInterval | null
  intervalCount: number | null
  installments: number | null
  installmentInterval: BillingInterval | null
  installmentIntervalCount: number | null
  trialDays: number | null
  productId: string
  product: {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
  }
}


// ============================================================================
// INTERNAL HELPERS — stock, transaction items, Stripe linking
// ============================================================================

/**
 * Validate stock availability for one or more products before Stripe API calls.
 * Aggregates all out-of-stock errors into a single throw so the customer
 * sees every unavailable item at once rather than one-at-a-time.
 *
 * SOURCE OF TRUTH: ValidateStockAvailability, StockCheckHelper
 *
 * @param organizationId - Org that owns the inventory records
 * @param items - Array of { productId, productName, quantity } to check
 * @throws Error listing every out-of-stock item
 */
async function validateStockAvailability(
  organizationId: string,
  items: Array<{ productId: string; productName: string; quantity: number }>
) {
  const outOfStock: string[] = []
  for (const item of items) {
    const availability = await checkAvailability(organizationId, item.productId, item.quantity)
    if (!availability.available) {
      outOfStock.push(`"${item.productName}"`)
    }
  }
  if (outOfStock.length > 0) {
    throw new Error(
      outOfStock.length === 1
        ? `${outOfStock[0]} is currently out of stock`
        : `Out of stock: ${outOfStock.join(', ')}`
    )
  }
}

/**
 * Build the TransactionItems array for a main price + optional order bump.
 * Used by processOneTimePayment, processRecurringSubscription, and processMixedBillingEmbedded
 * to avoid repeating the same item shape construction.
 *
 * SOURCE OF TRUTH: BuildTransactionItems, TransactionItemFactory
 *
 * @param mainPrice - The primary UnifiedPrice with product info
 * @param mainBillingType - Billing type to assign to the main item
 * @param orderBump - Optional validated order bump
 * @returns Array of transaction item objects ready for prisma create
 */
function buildTransactionItems(
  mainPrice: UnifiedPrice,
  mainBillingType: BillingType,
  orderBump?: ValidatedOrderBump | null
): Array<{
  productId: string
  priceId: string
  productName: string
  productImage: string | null
  priceName: string
  quantity: number
  unitAmount: number
  totalAmount: number
  billingType: BillingType
  interval?: BillingInterval | null
  intervalCount?: number | null
}> {
  const items: Array<{
    productId: string
    priceId: string
    productName: string
    productImage: string | null
    priceName: string
    quantity: number
    unitAmount: number
    totalAmount: number
    billingType: BillingType
    interval?: BillingInterval | null
    intervalCount?: number | null
  }> = [
    {
      productId: mainPrice.productId,
      priceId: mainPrice.id,
      productName: mainPrice.product.name,
      productImage: mainPrice.product.imageUrl,
      priceName: mainPrice.name,
      quantity: 1,
      unitAmount: mainPrice.amount,
      totalAmount: mainPrice.amount,
      billingType: mainBillingType,
      ...(mainBillingType === 'RECURRING' && {
        interval: mainPrice.interval,
        intervalCount: mainPrice.intervalCount,
      }),
    },
  ]

  if (orderBump) {
    const bumpBillingType = orderBump.price.billingType as BillingType
    const bumpIsRecurring = bumpBillingType === BILLING_TYPES.RECURRING
    items.push({
      productId: orderBump.product.id,
      priceId: orderBump.price.id,
      productName: orderBump.product.name,
      productImage: orderBump.product.imageUrl,
      priceName: orderBump.price.name,
      quantity: 1,
      unitAmount: orderBump.price.amount,
      totalAmount: orderBump.price.amount,
      billingType: bumpBillingType,
      ...(bumpIsRecurring && {
        interval: orderBump.price.interval,
        intervalCount: orderBump.price.intervalCount,
      }),
    })
  }

  return items
}

/**
 * Link a Transaction record to its Stripe payment object (PaymentIntent or Subscription).
 * Only runs in live mode — skipped when transactionId is empty/null (test mode).
 *
 * SOURCE OF TRUTH: LinkTransactionToStripe, TransactionStripeLinking
 *
 * @param transactionId - The Transaction record ID (empty string or null in test mode)
 * @param data - Stripe IDs to attach (stripePaymentIntentId and/or stripeSubscriptionId)
 */
async function linkTransactionToStripe(
  transactionId: string | null,
  data: {
    stripePaymentIntentId?: string | null
    stripeSubscriptionId?: string | null
  }
) {
  if (!transactionId) return
  await prisma.transaction.update({
    where: { id: transactionId },
    data,
  })
}


// ============================================================================
// SHARED PIPELINE: prepareCheckoutContext
// ============================================================================

/**
 * Prepare the shared checkout context used by ALL billing-type handlers.
 *
 * SOURCE OF TRUTH: PrepareCheckoutContext, SharedCheckoutPipeline
 *
 * This replaces the duplicated sequence that was copy-pasted across all 6+ handlers:
 * 1. Get Stripe instance (test vs live)
 * 2. Get test mode config (stripeOptions, metadata, fees, effectiveAccountId)
 * 3. Create/get Stripe customer on the correct account
 * 4. Create/update lead in the organization
 * 5. Get organization tier for platform fee calculation
 * 6. Get fee config for the tier
 *
 * @param organizationId - The org that owns the products
 * @param connectedAccountId - Raw Stripe Connect account ID
 * @param customer - Customer contact info from the checkout form
 * @param testMode - Whether this checkout uses test Stripe keys
 * @param paymentLinkId - Payment link ID if from payment link flow, null otherwise
 * @param source - Which checkout flow initiated this
 */
async function prepareCheckoutContext(
  organizationId: string,
  connectedAccountId: string,
  customer: CustomerData,
  testMode: boolean,
  paymentLinkId: string | null,
  source: 'payment_link' | 'embedded_payment' | 'cart_checkout' | 'invoice_payment'
): Promise<CheckoutContext> {
  /** Get appropriate Stripe instance based on test mode */
  const stripeInstance = getStripeInstance(testMode)

  /** Centralized test mode config — determines stripeOptions, metadata, fees, effectiveAccountId */
  const paymentConfig = getStripePaymentConfig({ testMode, connectedAccountId }, {})

  /** Create Stripe customer on the correct account (platform for test, connected for live) */
  const stripeCustomer = await getOrCreateStripeCustomer(
    paymentConfig.effectiveAccountId,
    customer,
    stripeInstance
  )

  /** Map internal source identifiers to human-readable lead source labels */
  const sourceLabels = {
    payment_link: 'Payment Link',
    embedded_payment: 'Embedded Payment',
    cart_checkout: 'Cart Checkout',
    invoice_payment: 'Invoice Payment',
  } as const

  /** Create or update lead (contacts tracked in both test and live mode) */
  const leadId = await createOrUpdateLead(organizationId, customer, sourceLabels[source])

  /** Get organization tier for tier-specific platform fee calculation */
  const tierInfo = await getOrganizationTier(organizationId)
  const tier = tierInfo.tier as PlanKey
  const feeConfig = getStripeTransactionFee(tier)

  return {
    organizationId,
    connectedAccountId,
    stripeInstance,
    stripeCustomer,
    leadId,
    tier,
    feeConfig,
    paymentConfig,
    testMode,
    paymentLinkId,
    source,
  }
}


// ============================================================================
// SHARED PIPELINE: createCheckoutTransaction
// ============================================================================

/**
 * Create a Transaction record in the database for live mode checkouts.
 *
 * SOURCE OF TRUTH: CreateCheckoutTransaction, SharedTransactionFactory
 *
 * In test mode, returns empty string (no DB record — triggers fire from Stripe metadata).
 * In live mode, creates a Transaction with the provided items and metadata.
 *
 * @param ctx - The prepared checkout context
 * @param params - Transaction-specific parameters
 * @returns Transaction ID (empty string in test mode)
 */
async function createCheckoutTransaction(
  ctx: CheckoutContext,
  params: {
    originalAmount: number
    currency: string
    billingType: BillingType
    paymentStatus: TransactionPaymentStatus
    totalPayments: number
    items: Array<{
      productId: string
      priceId: string
      productName: string
      productImage: string | null
      priceName: string
      quantity: number
      unitAmount: number
      totalAmount: number
      billingType: BillingType
      interval?: BillingInterval | null
      intervalCount?: number | null
      installments?: number | null
    }>
    /** Additional metadata to merge into the transaction */
    extraMetadata?: Record<string, unknown>
    /** Trial fields for recurring subscriptions */
    trialDays?: number | null
    trialEndsAt?: Date | null
    /** Checkout session ID for grouping related transactions */
    checkoutSessionId?: string
  }
): Promise<string> {
  /** Test mode: skip all DB records — triggers fire from Stripe metadata */
  if (ctx.testMode) return ''

  const transaction = await prisma.transaction.create({
    data: {
      organizationId: ctx.organizationId,
      leadId: ctx.leadId,
      originalAmount: params.originalAmount,
      paidAmount: 0,
      refundedAmount: 0,
      currency: params.currency,
      billingType: params.billingType,
      paymentStatus: params.paymentStatus,
      totalPayments: params.totalPayments,
      successfulPayments: 0,
      stripeCustomerId: ctx.stripeCustomer.id,
      paymentLinkId: ctx.paymentLinkId,
      ...(params.checkoutSessionId && { checkoutSessionId: params.checkoutSessionId }),
      ...(params.trialDays && params.trialDays > 0 && {
        trialDays: params.trialDays,
        trialEndsAt: params.trialEndsAt ?? new Date(Date.now() + params.trialDays * 24 * 60 * 60 * 1000),
      }),
      metadata: {
        customerEmail: ctx.stripeCustomer.email ?? '',
        customerName: ctx.stripeCustomer.name ?? '',
        appliedTier: ctx.tier,
        source: ctx.source,
        ...(params.extraMetadata ?? {}),
      },
      items: {
        create: params.items,
      },
    },
  })

  return transaction.id
}


// ============================================================================
// ENTRY POINT 1: PAYMENT LINK CHECKOUT
// ============================================================================

/**
 * Create checkout intent based on billing type from a payment link.
 *
 * Routes to appropriate handler:
 * - ONE_TIME → PaymentIntent
 * - RECURRING → Subscription
 * - SPLIT_PAYMENT → Subscription (canceled by webhook after last installment)
 *
 * TEST MODE:
 * SOURCE OF TRUTH: ProductTestMode
 * The testMode is determined by the PRODUCT's testMode field, NOT client input.
 * This ensures users can't bypass test mode by manipulating client requests.
 * When testMode is enabled on the product, payments go to platform's test account.
 */
export async function createCheckoutIntent(input: CheckoutIntentInput) {
  const { paymentLinkId, priceId, customer } = input

  /** Get payment link with organization */
  const link = await getPaymentLinkWithOrg(paymentLinkId)
  if (!link) throw new Error('Payment link not found')

  /** Extract connected account ID from the payment link's related organization */
  const connectedAccountId =
    link.product?.organization.stripeConnectedAccountId ||
    link.price?.product.organization.stripeConnectedAccountId ||
    null
  if (!connectedAccountId) throw new Error('Organization has not connected Stripe')

  /** Get price with product (includes testMode) */
  const price = await getPriceWithProduct(priceId)
  if (!price) throw new Error('Price not found')

  /**
   * SOURCE OF TRUTH: ProductTestMode
   * Use the product's testMode field as the authoritative source.
   */
  const testMode = price.product.testMode ?? false

  /** Prepare shared checkout context */
  const ctx = await prepareCheckoutContext(
    link.organizationId,
    connectedAccountId,
    customer,
    testMode,
    link.id,
    'payment_link'
  )

  /** Route based on billing type */
  switch (price.billingType) {
    case BILLING_TYPES.ONE_TIME:
      return processOneTimePayment(ctx, price as UnifiedPrice)

    case BILLING_TYPES.RECURRING:
      return processRecurringSubscription(ctx, price as UnifiedPrice)

    case BILLING_TYPES.SPLIT_PAYMENT:
      return processSplitPayment(ctx, price as UnifiedPrice)

    default:
      throw new Error(`Unsupported billing type: ${price.billingType}`)
  }
}


// ============================================================================
// ENTRY POINT 2: EMBEDDED PAYMENT ELEMENT CHECKOUT
// ============================================================================

/**
 * Create embedded checkout intent directly from product/price IDs.
 *
 * SOURCE OF TRUTH: EmbeddedPaymentCheckout
 *
 * This function enables the website builder's embedded payment element
 * to process payments without requiring a payment link.
 *
 * IMPORTANT: This is a public-facing endpoint and validates
 * that the price belongs to the product and organization.
 */
export async function createEmbeddedCheckoutIntent(input: EmbeddedCheckoutIntentInput) {
  const { organizationId, productId, priceId, customer, testMode, orderBump } = input

  /** Get organization with Stripe Connect info */
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, stripeConnectedAccountId: true },
  })

  if (!organization) throw new Error('Organization not found')
  if (!organization.stripeConnectedAccountId) throw new Error('Organization has not connected Stripe')

  /** Get price with product and validate ownership */
  const price = await prisma.productPrice.findUnique({
    where: { id: priceId },
    include: {
      product: {
        include: {
          organization: { select: { id: true } },
        },
      },
    },
  })

  if (!price) throw new Error('Price not found')
  if (price.productId !== productId) throw new Error('Price does not belong to the specified product')
  if (price.product.organizationId !== organizationId) throw new Error('Product does not belong to the specified organization')
  if (!price.active || price.deletedAt) throw new Error('Price is not active')
  if (!price.product.active || price.product.deletedAt) throw new Error('Product is not active')

  /**
   * Validate and resolve order bump if provided.
   * SOURCE OF TRUTH: OrderBumpValidation, MixedBillingOrderBump
   */
  let validatedBump: ValidatedOrderBump | null = null
  if (orderBump) {
    const bumpPrice = await prisma.productPrice.findUnique({
      where: { id: orderBump.priceId },
      include: {
        product: {
          include: {
            organization: { select: { id: true } },
          },
        },
      },
    })

    if (!bumpPrice) throw new Error('Order bump price not found')
    if (bumpPrice.productId !== orderBump.productId) throw new Error('Order bump price does not belong to the specified product')
    if (bumpPrice.product.organizationId !== organizationId) throw new Error('Order bump product does not belong to this organization')
    if (bumpPrice.billingType === 'SPLIT_PAYMENT') throw new Error('Order bump cannot be a split payment price')
    if (!bumpPrice.active || bumpPrice.deletedAt || !bumpPrice.product.active || bumpPrice.product.deletedAt) {
      throw new Error('Order bump product or price is not active')
    }

    validatedBump = {
      price: bumpPrice,
      product: bumpPrice.product,
    }
  }

  /** Prepare shared checkout context */
  const ctx = await prepareCheckoutContext(
    organizationId,
    organization.stripeConnectedAccountId,
    customer,
    testMode ?? false,
    null,
    'embedded_payment'
  )

  /**
   * Route based on billing type with mixed billing detection.
   * SOURCE OF TRUTH: MixedBillingRouting, EmbeddedCheckoutRouting
   */
  const bumpIsRecurring = validatedBump?.price.billingType === BILLING_TYPES.RECURRING

  switch (price.billingType) {
    case BILLING_TYPES.ONE_TIME:
      /**
       * Main=ONE_TIME, Bump=RECURRING → mixed billing via subscription mode.
       * The RECURRING bump becomes a subscription item, and the ONE_TIME main
       * product is charged on the first invoice via add_invoice_items.
       */
      if (validatedBump && bumpIsRecurring) {
        return processMixedBillingEmbedded(ctx, price as UnifiedPrice, validatedBump)
      }
      /** Main=ONE_TIME, Bump=ONE_TIME (or no bump) → standard PaymentIntent */
      return processOneTimePayment(ctx, price as UnifiedPrice, validatedBump)

    case BILLING_TYPES.RECURRING:
      /**
       * Main=RECURRING → pass bump along to the recurring handler.
       * It handles both ONE_TIME bumps (add_invoice_items) and
       * RECURRING bumps (additional subscription item) internally.
       */
      return processRecurringSubscription(ctx, price as UnifiedPrice, validatedBump)

    case BILLING_TYPES.SPLIT_PAYMENT:
      /** Split payment — no bumps supported */
      return processSplitPayment(ctx, price as UnifiedPrice)

    default:
      throw new Error(`Unsupported billing type: ${price.billingType}`)
  }
}


// ============================================================================
// UNIFIED HANDLER: ONE-TIME PAYMENT
// ============================================================================

/**
 * Process a one-time payment via PaymentIntent.
 *
 * SOURCE OF TRUTH: UnifiedOneTimePayment
 *
 * Unified handler for both payment link and embedded checkout flows.
 * Handles optional order bumps (ONE_TIME only — RECURRING bumps route to mixed billing).
 *
 * @param ctx - Prepared checkout context from prepareCheckoutContext()
 * @param price - The main product price
 * @param orderBump - Optional ONE_TIME order bump
 */
async function processOneTimePayment(
  ctx: CheckoutContext,
  price: UnifiedPrice,
  orderBump?: ValidatedOrderBump | null
) {
  /** Stock validation — prevent overselling before any Stripe API calls */
  const stockItems = [{ productId: price.productId, productName: price.product.name, quantity: 1 }]
  if (orderBump) stockItems.push({ productId: orderBump.product.id, productName: orderBump.product.name, quantity: 1 })
  await validateStockAvailability(ctx.organizationId, stockItems)

  /** Calculate total amount including order bump if present */
  const bumpAmount = orderBump?.price.amount ?? 0
  const totalAmount = price.amount + bumpAmount

  /** Build transaction items — main product + optional bump */
  const transactionItems = buildTransactionItems(price, 'ONE_TIME', orderBump)

  /** Create transaction record (live mode only) */
  const transactionId = await createCheckoutTransaction(ctx, {
    originalAmount: totalAmount,
    currency: price.currency,
    billingType: BILLING_TYPES.ONE_TIME,
    paymentStatus: 'AWAITING_PAYMENT',
    totalPayments: 1,
    items: transactionItems,
    extraMetadata: {
      ...(orderBump && { hasOrderBump: 'true' }),
    },
  })

  /**
   * Build payment metadata using centralized utility.
   * In test mode: transactionId is empty, trigger data included for automation firing.
   */
  const paymentMetadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    transactionId,
    ...(ctx.paymentLinkId && { paymentLinkId: ctx.paymentLinkId }),
    priceId: price.id,
    productId: price.productId,
    organizationId: ctx.organizationId,
    billingType: BILLING_TYPES.ONE_TIME,
    appliedTier: ctx.tier,
    source: ctx.source,
    ...(orderBump && {
      hasOrderBump: 'true',
      bumpProductId: orderBump.product.id,
      bumpPriceId: orderBump.price.id,
      bumpAmount: String(orderBump.price.amount),
    }),
    ...(ctx.testMode && ctx.leadId && {
      leadId: ctx.leadId,
      productName: price.product.name,
      priceName: price.name,
    }),
  })

  /** Build PaymentIntent description — includes bump product if present */
  const description = orderBump
    ? `${price.product.name} - ${price.name} + ${orderBump.product.name} (order bump)`
    : `${price.product.name} - ${price.name}`

  /**
   * Build PaymentIntent params.
   * Uses automatic_payment_methods to enable all Stripe-dashboard-enabled methods
   * (cards, Apple Pay, Google Pay, Link, etc.).
   */
  const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
    amount: totalAmount,
    currency: price.currency,
    customer: ctx.stripeCustomer.id,
    description,
    automatic_payment_methods: { enabled: true },
    metadata: paymentMetadata,
  }

  /** Only add application_fee_amount in live mode */
  if (ctx.paymentConfig.includeApplicationFee) {
    paymentIntentParams.application_fee_amount = calculatePlatformFeeCents(totalAmount, ctx.tier)
  }

  /** Create PaymentIntent on the correct account */
  const paymentIntent = await ctx.stripeInstance.paymentIntents.create(
    paymentIntentParams,
    ctx.paymentConfig.stripeOptions
  )

  if (!paymentIntent.client_secret) {
    throw new Error('Failed to create payment: No client secret returned')
  }

  /** Link Transaction to PaymentIntent — only in live mode */
  await linkTransactionToStripe(transactionId, { stripePaymentIntentId: paymentIntent.id })

  return {
    clientSecret: paymentIntent.client_secret,
    transactionId: transactionId || null,
    type: 'payment_intent' as const,
    testMode: ctx.testMode,
    isTrial: false,
  }
}


// ============================================================================
// UNIFIED HANDLER: RECURRING SUBSCRIPTION
// ============================================================================

/**
 * Process a recurring subscription.
 *
 * SOURCE OF TRUTH: UnifiedRecurringSubscription
 *
 * Unified handler for both payment link and embedded checkout flows.
 * Handles optional order bumps:
 * - RECURRING bump → additional subscription item
 * - ONE_TIME bump → add_invoice_items (charged on first invoice only)
 *
 * @param ctx - Prepared checkout context
 * @param price - The main recurring price
 * @param orderBump - Optional order bump (ONE_TIME or RECURRING)
 */
async function processRecurringSubscription(
  ctx: CheckoutContext,
  price: UnifiedPrice,
  orderBump?: ValidatedOrderBump | null
) {
  if (!price.interval) throw new Error('Interval required for recurring price')

  /** Stock validation */
  const stockItems = [{ productId: price.productId, productName: price.product.name, quantity: 1 }]
  if (orderBump) stockItems.push({ productId: orderBump.product.id, productName: orderBump.product.name, quantity: 1 })
  await validateStockAvailability(ctx.organizationId, stockItems)

  /** Get or create Stripe product and price on the correct account */
  const stripeProductId = await getOrCreateStripeProduct(
    ctx.paymentConfig.effectiveAccountId, price.product, ctx.stripeInstance
  )
  const stripePriceId = await getOrCreateStripePrice(
    ctx.paymentConfig.effectiveAccountId, stripeProductId, {
      id: price.id,
      name: price.name,
      amount: price.amount,
      currency: price.currency,
      interval: price.interval,
      intervalCount: price.intervalCount || 1,
    }, ctx.stripeInstance
  )

  /**
   * If an order bump is present, resolve its Stripe product/price.
   * - RECURRING bump: needs a recurring Stripe price (subscription item)
   * - ONE_TIME bump: needs a one-time Stripe price (add_invoice_items)
   */
  let bumpStripePriceId: string | null = null
  if (orderBump) {
    const bumpStripeProductId = await getOrCreateStripeProduct(
      ctx.paymentConfig.effectiveAccountId, orderBump.price.product, ctx.stripeInstance
    )
    const bumpIsRecurring = orderBump.price.billingType === BILLING_TYPES.RECURRING
    bumpStripePriceId = await getOrCreateStripePrice(
      ctx.paymentConfig.effectiveAccountId, bumpStripeProductId, {
        id: orderBump.price.id,
        name: orderBump.price.name,
        amount: orderBump.price.amount,
        currency: orderBump.price.currency,
        interval: bumpIsRecurring ? orderBump.price.interval : null,
        intervalCount: bumpIsRecurring ? (orderBump.price.intervalCount || 1) : null,
      }, ctx.stripeInstance
    )
  }

  /** Build transaction items — main product is RECURRING, bump matches its own billing type */
  const transactionItems = buildTransactionItems(price, 'RECURRING', orderBump)

  /**
   * Detect mixed trial states between main product and RECURRING order bump.
   * When one has trial and the other doesn't, we must split into separate subscriptions.
   *
   * SOURCE OF TRUTH: EmbeddedTrialSplit, PaymentElementMixedTrial
   */
  const mainHasTrial = Boolean(price.trialDays && price.trialDays > 0)
  const bumpIsRecurringLocal = Boolean(orderBump && orderBump.price.billingType === BILLING_TYPES.RECURRING)
  const bumpHasTrial = Boolean(bumpIsRecurringLocal && orderBump?.price.trialDays && orderBump.price.trialDays > 0)
  const hasMixedTrialState = Boolean(
    bumpIsRecurringLocal && ((mainHasTrial && !bumpHasTrial) || (!mainHasTrial && bumpHasTrial))
  )

  /**
   * Create transaction record(s).
   * When mixed trial state: create TWO Transactions linked by checkoutSessionId.
   * When no mixed trial: create a single Transaction.
   * SOURCE OF TRUTH: TransactionTrialFields, CheckoutSessionGrouping
   */
  let transactionId = ''
  const embeddedCheckoutSessionId = hasMixedTrialState ? crypto.randomUUID() : undefined

  if (!ctx.testMode) {
    const hasTrial = !hasMixedTrialState && mainHasTrial

    if (hasMixedTrialState) {
      /**
       * MIXED TRIAL STATE: Create TWO Transactions linked by checkoutSessionId.
       * The non-trial item gets the main subscription (charges immediately).
       */
      const trialItemForMetadata = mainHasTrial
        ? [{ priceId: price.id, quantity: 1, trialDays: price.trialDays! }]
        : [{ priceId: orderBump!.price.id, quantity: 1, trialDays: orderBump!.price.trialDays! }]

      const mainItem = mainHasTrial ? transactionItems[1] : transactionItems[0]
      const mainAmount = mainHasTrial ? (orderBump?.price.amount ?? 0) : price.amount

      const mainTxn = await prisma.transaction.create({
        data: {
          organizationId: ctx.organizationId,
          leadId: ctx.leadId,
          originalAmount: mainAmount,
          paidAmount: 0,
          refundedAmount: 0,
          currency: price.currency,
          billingType: BILLING_TYPES.RECURRING,
          paymentStatus: 'AWAITING_PAYMENT',
          totalPayments: 0,
          successfulPayments: 0,
          stripeCustomerId: ctx.stripeCustomer.id,
          paymentLinkId: ctx.paymentLinkId,
          checkoutSessionId: embeddedCheckoutSessionId,
          metadata: {
            customerEmail: ctx.stripeCustomer.email ?? '',
            customerName: ctx.stripeCustomer.name ?? '',
            interval: price.interval,
            intervalCount: price.intervalCount,
            appliedTier: ctx.tier,
            appliedFeePercent: Math.round(ctx.feeConfig.percentage * 10000) / 100,
            source: ctx.source,
            hasOrderBump: 'true',
            checkoutSessionId: embeddedCheckoutSessionId,
            pendingTrialItems: JSON.stringify(trialItemForMetadata),
          },
          items: {
            create: [mainItem],
          },
        },
      })
      transactionId = mainTxn.id
    } else {
      /** Single Transaction — all items share the same trial state */
      transactionId = await createCheckoutTransaction(ctx, {
        originalAmount: price.amount + (orderBump?.price.amount ?? 0),
        currency: price.currency,
        billingType: BILLING_TYPES.RECURRING,
        paymentStatus: hasTrial ? 'TRIALING' : 'AWAITING_PAYMENT',
        totalPayments: 0,
        trialDays: hasTrial ? price.trialDays : null,
        items: transactionItems,
        extraMetadata: {
          interval: price.interval,
          intervalCount: price.intervalCount,
          appliedFeePercent: Math.round(ctx.feeConfig.percentage * 10000) / 100,
          ...(orderBump && { hasOrderBump: 'true' }),
        },
      })
    }
  }

  /** Build subscription metadata */
  const subscriptionMetadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    transactionId,
    ...(ctx.paymentLinkId && { paymentLinkId: ctx.paymentLinkId }),
    priceId: price.id,
    productId: price.productId,
    organizationId: ctx.organizationId,
    billingType: BILLING_TYPES.RECURRING,
    appliedTier: ctx.tier,
    source: ctx.source,
    ...(price.trialDays && price.trialDays > 0 && !hasMixedTrialState && {
      trialDays: String(price.trialDays),
    }),
    ...(orderBump && {
      hasOrderBump: 'true',
      bumpProductId: orderBump.product.id,
      bumpPriceId: orderBump.price.id,
      bumpBillingType: orderBump.price.billingType,
      bumpAmount: String(orderBump.price.amount),
    }),
    ...(ctx.testMode && ctx.leadId && {
      leadId: ctx.leadId,
      productName: price.product.name,
      priceName: price.name,
    }),
  })

  /** Build subscription items — main product always included */
  const subscriptionItemsList: Stripe.SubscriptionCreateParams.Item[] = [
    { price: stripePriceId },
  ]
  if (orderBump && bumpStripePriceId && orderBump.price.billingType === BILLING_TYPES.RECURRING) {
    subscriptionItemsList.push({ price: bumpStripePriceId })
  }

  /** Build subscription params */
  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: ctx.stripeCustomer.id,
    items: subscriptionItemsList,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payments', 'pending_setup_intent'],
    metadata: subscriptionMetadata,
  }

  /**
   * Handle trial period based on mixed trial state.
   * SOURCE OF TRUTH: EmbeddedRecurringTrialDays, EmbeddedTrialSplit
   */
  if (hasMixedTrialState) {
    if (mainHasTrial) {
      /** Main has trial — subscription contains only the bump (non-trial, charges immediately) */
      subscriptionParams.items = [{ price: bumpStripePriceId! }]
    } else {
      /** Bump has trial — subscription contains only the main (non-trial, charges immediately) */
      subscriptionParams.items = [{ price: stripePriceId }]
    }
  } else if (price.trialDays && price.trialDays > 0) {
    /** Uniform trial: all items share the same trial period */
    subscriptionParams.trial_period_days = price.trialDays
  }

  /** If bump is ONE_TIME, add as add_invoice_items (charged on first invoice only) */
  if (orderBump && bumpStripePriceId && orderBump.price.billingType === BILLING_TYPES.ONE_TIME) {
    subscriptionParams.add_invoice_items = [{ price: bumpStripePriceId }]
  }

  /** Only add application_fee_percent in live mode */
  if (ctx.paymentConfig.includeApplicationFee) {
    subscriptionParams.application_fee_percent = Math.round(ctx.feeConfig.percentage * 10000) / 100
  }

  /** Create subscription on the correct account */
  const subscription = await ctx.stripeInstance.subscriptions.create(
    subscriptionParams,
    ctx.paymentConfig.stripeOptions
  )

  const { clientSecret, paymentIntentId, isTrial } = await getSubscriptionClientSecret(
    subscription,
    ctx.paymentConfig.effectiveAccountId,
    'subscription',
    ctx.stripeInstance
  )

  /** Link Transaction to Subscription — only in live mode */
  await linkTransactionToStripe(transactionId, {
    stripeSubscriptionId: subscription.id,
    stripePaymentIntentId: paymentIntentId,
  })

  return {
    clientSecret,
    transactionId: transactionId || null,
    subscriptionId: subscription.id,
    type: 'subscription' as const,
    testMode: ctx.testMode,
    isTrial: !hasMixedTrialState && isTrial,
    /** Flag for frontend to call completeTrialSubscriptions() after payment */
    ...(hasMixedTrialState && { hasPendingTrialItems: true }),
  }
}


// ============================================================================
// UNIFIED HANDLER: SPLIT PAYMENT (Installments)
// ============================================================================

/**
 * Process a split payment (installment plan) via Subscription.
 *
 * SOURCE OF TRUTH: UnifiedSplitPayment
 *
 * Unified handler for both payment link and embedded checkout flows.
 * No order bumps supported for split payments.
 *
 * @param ctx - Prepared checkout context
 * @param price - The split payment price
 */
async function processSplitPayment(
  ctx: CheckoutContext,
  price: UnifiedPrice
) {
  if (!price.installments) throw new Error('Installments required for split payment')

  /** Stock validation */
  await validateStockAvailability(ctx.organizationId, [
    { productId: price.productId, productName: price.product.name, quantity: 1 },
  ])

  const installments = price.installments
  const installmentAmount = Math.floor(price.amount / installments)
  const interval = price.installmentInterval || 'MONTH'
  const intervalCount = price.installmentIntervalCount || 1

  /** Get or create Stripe product */
  const stripeProductId = await getOrCreateStripeProduct(
    ctx.paymentConfig.effectiveAccountId, price.product, ctx.stripeInstance
  )

  /** Create recurring price for installment amount */
  const stripePrice = await ctx.stripeInstance.prices.create(
    {
      product: stripeProductId,
      unit_amount: installmentAmount,
      currency: price.currency,
      recurring: {
        interval: toStripeInterval(interval),
        interval_count: intervalCount,
      },
      metadata: {
        mochiPriceId: price.id,
        billingType: BILLING_TYPES.SPLIT_PAYMENT,
        totalInstallments: String(installments),
      },
    },
    ctx.paymentConfig.stripeOptions
  )

  /** Create transaction record (live mode only) */
  const transactionId = await createCheckoutTransaction(ctx, {
    originalAmount: price.amount,
    currency: price.currency,
    billingType: BILLING_TYPES.SPLIT_PAYMENT,
    paymentStatus: 'AWAITING_PAYMENT',
    totalPayments: installments,
    items: [{
      productId: price.productId,
      priceId: price.id,
      productName: price.product.name,
      productImage: price.product.imageUrl,
      priceName: price.name,
      quantity: 1,
      unitAmount: price.amount,
      totalAmount: price.amount,
      billingType: BILLING_TYPES.SPLIT_PAYMENT,
      interval: price.installmentInterval,
      intervalCount: price.installmentIntervalCount,
      installments: price.installments,
    }],
    extraMetadata: {
      installments,
      installmentAmount,
      installmentInterval: interval,
      installmentIntervalCount: intervalCount,
      appliedFeePercent: Math.round(ctx.feeConfig.percentage * 10000) / 100,
    },
  })

  /** Build subscription metadata */
  const subscriptionMetadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    transactionId,
    ...(ctx.paymentLinkId && { paymentLinkId: ctx.paymentLinkId }),
    priceId: price.id,
    productId: price.productId,
    organizationId: ctx.organizationId,
    billingType: BILLING_TYPES.SPLIT_PAYMENT,
    totalInstallments: String(installments),
    appliedTier: ctx.tier,
    source: ctx.source,
    ...(ctx.testMode && ctx.leadId && {
      leadId: ctx.leadId,
      productName: price.product.name,
      priceName: price.name,
    }),
  })

  /**
   * NO cancel_at — subscription cancellation is handled by the webhook handler
   * after the last installment is paid.
   */
  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: ctx.stripeCustomer.id,
    items: [{ price: stripePrice.id }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payments'],
    metadata: subscriptionMetadata,
  }

  /** Only add application_fee_percent in live mode */
  if (ctx.paymentConfig.includeApplicationFee) {
    subscriptionParams.application_fee_percent = Math.round(ctx.feeConfig.percentage * 10000) / 100
  }

  /** Create subscription on the correct account */
  const subscription = await ctx.stripeInstance.subscriptions.create(
    subscriptionParams,
    ctx.paymentConfig.stripeOptions
  )

  const { clientSecret, paymentIntentId } = await getSubscriptionClientSecret(
    subscription,
    ctx.paymentConfig.effectiveAccountId,
    'split payment',
    ctx.stripeInstance
  )

  /** Link Transaction to Subscription — only in live mode */
  await linkTransactionToStripe(transactionId, {
    stripeSubscriptionId: subscription.id,
    stripePaymentIntentId: paymentIntentId,
  })

  return {
    clientSecret,
    transactionId: transactionId || null,
    subscriptionId: subscription.id,
    type: 'subscription' as const,
    testMode: ctx.testMode,
    isTrial: false,
  }
}


// ============================================================================
// MIXED BILLING HANDLER (Embedded Only: ONE_TIME main + RECURRING bump)
// ============================================================================

/**
 * Process mixed billing checkout for embedded payment element.
 *
 * SOURCE OF TRUTH: MixedBillingEmbedded, EmbeddedMixedBillingCheckout
 *
 * Handles the case where the main product is ONE_TIME but the order bump
 * is RECURRING. Stripe needs subscription mode because at least one item recurs.
 * - RECURRING bump → subscription.items (recurring charge each period)
 * - ONE_TIME main → subscription.add_invoice_items (charged on first invoice only)
 *
 * @param ctx - Prepared checkout context
 * @param mainPrice - The ONE_TIME main product price
 * @param orderBump - The RECURRING order bump product/price
 */
async function processMixedBillingEmbedded(
  ctx: CheckoutContext,
  mainPrice: UnifiedPrice,
  orderBump: ValidatedOrderBump
) {
  if (!orderBump.price.interval) {
    throw new Error('Interval required for recurring order bump price')
  }

  /** Stock validation for both items */
  await validateStockAvailability(ctx.organizationId, [
    { productId: mainPrice.productId, productName: mainPrice.product.name, quantity: 1 },
    { productId: orderBump.product.id, productName: orderBump.product.name, quantity: 1 },
  ])

  /**
   * Get or create Stripe products and prices for both items.
   * SOURCE OF TRUTH: MixedBillingStripeSetup
   */
  const effectiveAccountId = ctx.paymentConfig.effectiveAccountId

  /** Bump product/price (RECURRING — becomes the subscription item) */
  const bumpStripeProductId = await getOrCreateStripeProduct(
    effectiveAccountId, orderBump.price.product, ctx.stripeInstance
  )
  const bumpStripePriceId = await getOrCreateStripePrice(effectiveAccountId, bumpStripeProductId, {
    id: orderBump.price.id,
    name: orderBump.price.name,
    amount: orderBump.price.amount,
    currency: orderBump.price.currency,
    interval: orderBump.price.interval,
    intervalCount: orderBump.price.intervalCount || 1,
  }, ctx.stripeInstance)

  /** Main product/price (ONE_TIME — goes into add_invoice_items) */
  const mainStripeProductId = await getOrCreateStripeProduct(
    effectiveAccountId, mainPrice.product, ctx.stripeInstance
  )
  const mainStripePriceId = await getOrCreateStripePrice(effectiveAccountId, mainStripeProductId, {
    id: mainPrice.id,
    name: mainPrice.name,
    amount: mainPrice.amount,
    currency: mainPrice.currency,
    interval: null,
    intervalCount: null,
  }, ctx.stripeInstance)

  /**
   * Create transaction records — TWO Transactions (ONE_TIME + RECURRING)
   * linked by checkoutSessionId.
   * SOURCE OF TRUTH: CheckoutSessionGrouping
   */
  const mixedCheckoutSessionId = crypto.randomUUID()
  let transactionId = ''

  if (!ctx.testMode) {
    const baseMetadata = {
      customerEmail: ctx.stripeCustomer.email ?? '',
      customerName: ctx.stripeCustomer.name ?? '',
      appliedTier: ctx.tier,
      appliedFeePercent: Math.round(ctx.feeConfig.percentage * 10000) / 100,
      source: ctx.source,
      mixedBilling: 'true',
      hasOrderBump: 'true',
      checkoutSessionId: mixedCheckoutSessionId,
    }

    /** ONE_TIME Transaction for the main product */
    await prisma.transaction.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: ctx.leadId,
        originalAmount: mainPrice.amount,
        paidAmount: 0,
        refundedAmount: 0,
        currency: mainPrice.currency,
        billingType: BILLING_TYPES.ONE_TIME,
        paymentStatus: 'AWAITING_PAYMENT',
        totalPayments: 1,
        successfulPayments: 0,
        stripeCustomerId: ctx.stripeCustomer.id,
        paymentLinkId: null,
        checkoutSessionId: mixedCheckoutSessionId,
        metadata: { ...baseMetadata, billingGroup: 'one_time' },
        items: {
          create: [{
            productId: mainPrice.productId,
            priceId: mainPrice.id,
            productName: mainPrice.product.name,
            productImage: mainPrice.product.imageUrl,
            priceName: mainPrice.name,
            quantity: 1,
            unitAmount: mainPrice.amount,
            totalAmount: mainPrice.amount,
            billingType: 'ONE_TIME' as const,
          }],
        },
      },
    })

    /**
     * RECURRING Transaction for the order bump.
     * This is the primary transaction linked to the Stripe subscription.
     * SOURCE OF TRUTH: MixedBillingTrialTransaction
     */
    const bumpTrialDays = orderBump.price.trialDays ?? 0
    const recurringTxn = await prisma.transaction.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: ctx.leadId,
        originalAmount: orderBump.price.amount,
        paidAmount: 0,
        refundedAmount: 0,
        currency: mainPrice.currency,
        billingType: BILLING_TYPES.RECURRING,
        paymentStatus: bumpTrialDays > 0 ? 'TRIALING' : 'AWAITING_PAYMENT',
        totalPayments: 0,
        successfulPayments: 0,
        stripeCustomerId: ctx.stripeCustomer.id,
        paymentLinkId: null,
        checkoutSessionId: mixedCheckoutSessionId,
        ...(bumpTrialDays > 0 && {
          trialDays: bumpTrialDays,
          trialEndsAt: new Date(Date.now() + bumpTrialDays * 24 * 60 * 60 * 1000),
        }),
        metadata: { ...baseMetadata, billingGroup: 'recurring' },
        items: {
          create: [{
            productId: orderBump.product.id,
            priceId: orderBump.price.id,
            productName: orderBump.product.name,
            productImage: orderBump.product.imageUrl,
            priceName: orderBump.price.name,
            quantity: 1,
            unitAmount: orderBump.price.amount,
            totalAmount: orderBump.price.amount,
            billingType: 'RECURRING' as const,
            interval: orderBump.price.interval,
            intervalCount: orderBump.price.intervalCount,
          }],
        },
      },
    })
    transactionId = recurringTxn.id
  }

  /**
   * Build subscription metadata via centralized buildPaymentMetadata().
   * FIX: Previously built manually, missing consistent test mode fields.
   */
  const mixedBillingMetadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    transactionId,
    priceId: mainPrice.id,
    productId: mainPrice.productId,
    organizationId: ctx.organizationId,
    billingType: BILLING_TYPES.RECURRING,
    appliedTier: ctx.tier,
    source: ctx.source,
    mixedBilling: 'true',
    hasOrderBump: 'true',
    bumpProductId: orderBump.product.id,
    bumpPriceId: orderBump.price.id,
    bumpBillingType: BILLING_TYPES.RECURRING,
    bumpAmount: String(orderBump.price.amount),
    ...(ctx.testMode && ctx.leadId && { leadId: ctx.leadId }),
    ...(ctx.testMode && {
      productName: mainPrice.product.name,
      priceName: mainPrice.name,
    }),
  })

  /** Build subscription params */
  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: ctx.stripeCustomer.id,
    items: [{ price: bumpStripePriceId }],
    add_invoice_items: [{ price: mainStripePriceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payments', 'pending_setup_intent'],
    metadata: mixedBillingMetadata,
  }

  /** Trial support — trial comes from the bump price since it drives the subscription */
  if (orderBump.price.trialDays && orderBump.price.trialDays > 0) {
    subscriptionParams.trial_period_days = orderBump.price.trialDays
    subscriptionParams.metadata = {
      ...subscriptionParams.metadata,
      trialDays: String(orderBump.price.trialDays),
    }
  }

  /** Only add application_fee_percent for live mode */
  if (ctx.paymentConfig.includeApplicationFee) {
    subscriptionParams.application_fee_percent = Math.round(ctx.feeConfig.percentage * 10000) / 100
  }

  /** Create subscription on the correct account */
  const subscription = await ctx.stripeInstance.subscriptions.create(
    subscriptionParams,
    ctx.paymentConfig.stripeOptions
  )

  const { clientSecret, paymentIntentId, isTrial } = await getSubscriptionClientSecret(
    subscription,
    ctx.paymentConfig.effectiveAccountId,
    'mixed billing subscription',
    ctx.stripeInstance
  )

  /** Link Transaction to Subscription — only in live mode */
  await linkTransactionToStripe(transactionId, {
    stripeSubscriptionId: subscription.id,
    stripePaymentIntentId: paymentIntentId,
  })

  return {
    clientSecret,
    transactionId: transactionId || null,
    subscriptionId: subscription.id,
    type: 'subscription' as const,
    testMode: ctx.testMode,
    isTrial,
  }
}


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get client secret from subscription's invoice payment intent.
 * For Stripe API 2025-06-30.basil and later (including clover),
 * payment_intent is accessed via latest_invoice.payments.data[0].payment.payment_intent
 *
 * TEST MODE: When connectedAccountId is null, retrieves from platform account.
 * LIVE MODE: Retrieves from the connected account.
 *
 * @param subscription - The Stripe subscription object
 * @param connectedAccountId - The connected account ID, or null for platform account (test mode)
 * @param context - Context string for error messages
 * @param stripeInstance - Optional Stripe instance (defaults to live, pass test instance for test mode)
 */
export async function getSubscriptionClientSecret(
  subscription: Stripe.Subscription,
  connectedAccountId: string | null,
  context: string,
  stripeInstance: Stripe = getStripeInstance()
): Promise<{ clientSecret: string; paymentIntentId: string | null; isTrial: boolean }> {
  const invoice = subscription.latest_invoice
  if (!invoice || typeof invoice === 'string') {
    throw new Error(`Failed to create ${context}: Invoice not expanded`)
  }

  /** For API versions 2025-06-30.basil and later (clover), access via payments array */
  const invoiceWithPayments = invoice as unknown as {
    payments?: {
      data?: Array<{
        payment?: {
          payment_intent?: string | null
        }
      }>
    }
  }

  const paymentIntentId = invoiceWithPayments.payments?.data?.[0]?.payment?.payment_intent
  const stripeOptions = connectedAccountId ? { stripeAccount: connectedAccountId } : undefined

  /**
   * Standard path: PaymentIntent exists on the invoice (non-trial subscriptions).
   * Retrieve the full PaymentIntent to get the client secret for Payment Element.
   */
  if (paymentIntentId) {
    const paymentIntent = await stripeInstance.paymentIntents.retrieve(
      paymentIntentId,
      stripeOptions
    )

    if (!paymentIntent.client_secret) {
      throw new Error(`Failed to create ${context}: No client secret`)
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      isTrial: false,
    }
  }

  /**
   * Trial path: When a subscription has trial_period_days, Stripe does NOT create
   * a PaymentIntent. Instead it creates a pending_setup_intent to collect the
   * payment method for charging after the trial ends.
   *
   * SOURCE OF TRUTH: TrialSubscriptionSetupIntent
   */
  if (subscription.pending_setup_intent) {
    const setupIntentId = typeof subscription.pending_setup_intent === 'string'
      ? subscription.pending_setup_intent
      : subscription.pending_setup_intent.id

    const setupIntent = await stripeInstance.setupIntents.retrieve(
      setupIntentId,
      stripeOptions
    )

    if (!setupIntent.client_secret) {
      throw new Error(`Failed to create ${context}: No setup intent client secret`)
    }

    return {
      clientSecret: setupIntent.client_secret,
      paymentIntentId: null,
      isTrial: true,
    }
  }

  throw new Error(`Failed to create ${context}: Neither payment intent nor setup intent available`)
}

/** Fetch payment link with all related org/product data */
async function getPaymentLinkWithOrg(paymentLinkId: string) {
  return await prisma.paymentLink.findUnique({
    where: { id: paymentLinkId },
    include: {
      product: {
        include: {
          organization: { select: { id: true, stripeConnectedAccountId: true } },
        },
      },
      price: {
        include: {
          product: {
            include: {
              organization: { select: { id: true, stripeConnectedAccountId: true } },
            },
          },
        },
      },
    },
  })
}

/**
 * Get price with product data including testMode.
 *
 * SOURCE OF TRUTH: PaymentLinkProductTestMode
 * The product.testMode field determines whether this price uses test Stripe keys.
 */
async function getPriceWithProduct(priceId: string) {
  return await prisma.productPrice.findUnique({
    where: { id: priceId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          organizationId: true,
          active: true,
          deletedAt: true,
          testMode: true,
        },
      },
    },
  })
}

/**
 * Create or update a lead/contact for the organization.
 * Sets `source` to match the payment flow that initiated the checkout
 * so lead attribution is accurate across all entry points.
 * SOURCE OF TRUTH: LeadPaymentSource
 */
async function createOrUpdateLead(
  organizationId: string,
  customer: CustomerData,
  source: 'Payment Link' | 'Embedded Payment' | 'Cart Checkout' | 'Invoice Payment'
): Promise<string | null> {
  try {
    const existing = await prisma.lead.findFirst({
      where: { organizationId, email: customer.email },
    })

    if (existing) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          lastActivityAt: new Date(),
          /** Clear deletedAt to restore previously soft-deleted leads */
          deletedAt: null,
        },
      })
      return existing.id
    }

    const newLead = await prisma.lead.create({
      data: {
        organizationId,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        source,
        status: 'LEAD',
      },
    })
    return newLead.id
  } catch {
    return null
  }
}

/** Get transaction by ID */
export async function getTransactionById(transactionId: string) {
  return await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      lead: true,
      items: true,
      payments: { orderBy: { paymentNumber: 'asc' } },
    },
  })
}


// ============================================================================
// CART CHECKOUT SESSION - Mixed Cart Support (Subscriptions + One-time)
// ============================================================================

/**
 * SOURCE OF TRUTH: CartCheckoutSession, MixedCart, EcommerceCheckout
 *
 * Cart item structure for checkout session creation.
 */
export interface CartCheckoutItem {
  stripePriceId: string
  quantity: number
  billingType: 'ONE_TIME' | 'RECURRING'
  name: string
  priceInCents: number
  currency: string
}

/**
 * Input for creating a cart checkout intent.
 * SOURCE OF TRUTH: CartCheckoutSessionInput
 */
export interface CartCheckoutSessionInput {
  organizationId: string
  items: CartCheckoutItem[]
  customer: CustomerData
  /** @deprecated No longer used - kept for backwards compatibility */
  successUrl?: string
  /** @deprecated No longer used - kept for backwards compatibility */
  cancelUrl?: string
  /**
   * TEST MODE: When true, uses platform's test Stripe account.
   * SOURCE OF TRUTH: CartTestMode
   */
  testMode?: boolean
}

/**
 * Resolve Stripe price IDs for cart items on the correct Stripe account.
 *
 * SOURCE OF TRUTH: CartStripePriceResolution
 *
 * In LIVE mode, price IDs point to the connected account — no resolution needed.
 * In TEST MODE, creates matching products/prices on the platform test account.
 */
async function resolveCartStripePrices(
  items: CartCheckoutItem[],
  priceMap: Map<string | null, { id: string; name: string; amount: number; currency: string; interval: BillingInterval | null; intervalCount: number | null; product: { id: string; name: string; description: string | null; imageUrl: string | null } }>,
  connectedAccountId: string | null,
  stripeInstance: Stripe
): Promise<CartCheckoutItem[]> {
  /** In live mode, prices already exist on the connected account */
  if (connectedAccountId) {
    return items
  }

  /** Test mode: resolve each item's product and price on the platform test account */
  const resolved: CartCheckoutItem[] = []

  for (const item of items) {
    const dbPrice = priceMap.get(item.stripePriceId)
    if (!dbPrice) {
      throw new Error(`Price not found in database for stripePriceId: ${item.stripePriceId}`)
    }

    const stripeProductId = await getOrCreateStripeProduct(null, dbPrice.product, stripeInstance)
    const resolvedPriceId = await getOrCreateStripePrice(null, stripeProductId, {
      id: dbPrice.id,
      name: dbPrice.name,
      amount: dbPrice.amount,
      currency: dbPrice.currency,
      interval: dbPrice.interval,
      intervalCount: dbPrice.intervalCount,
    }, stripeInstance)

    resolved.push({ ...item, stripePriceId: resolvedPriceId })
  }

  return resolved
}


// ============================================================================
// CART VALIDATION
// ============================================================================

const LOW_STOCK_THRESHOLD = 5

/**
 * SOURCE OF TRUTH: ValidatedCartItem — the return type for cart validation results.
 */
export type ValidatedCartItem = {
  stripePriceId: string
  valid: boolean
  reason: 'ok' | 'price_not_found' | 'product_deleted' | 'out_of_stock'
  availableQuantity: number | null
  lowStock: boolean
  productName?: string
  productImage?: string | null
  priceInCents?: number
  currency?: string
  billingType?: 'ONE_TIME' | 'RECURRING'
  billingInterval?: BillingInterval | null
  intervalCount?: number | null
  trialDays?: number | null
}

/**
 * Validate cart items before checkout — checks price existence, product status, and inventory.
 *
 * SOURCE OF TRUTH: CartItemValidation, ValidateCartItems
 */
export async function validateCartItems(
  organizationId: string,
  items: Array<{ stripePriceId: string; quantity: number }>
): Promise<Array<ValidatedCartItem>> {
  const stripePriceIds = items.map((item) => item.stripePriceId)
  const prices = await prisma.productPrice.findMany({
    where: { stripePriceId: { in: stripePriceIds } },
    include: { product: true },
  })

  const priceMap = new Map(prices.map((p) => [p.stripePriceId, p]))

  function buildPricingMetadata(priceRecord: (typeof prices)[number]) {
    return {
      productName: priceRecord.product.name,
      productImage: priceRecord.product.imageUrl,
      priceInCents: priceRecord.amount,
      currency: priceRecord.currency,
      /** SPLIT_PAYMENT treated as ONE_TIME — split payments not supported in cart */
      billingType: (priceRecord.billingType === 'RECURRING' ? 'RECURRING' : 'ONE_TIME') as 'ONE_TIME' | 'RECURRING',
      billingInterval: priceRecord.interval ?? null,
      intervalCount: priceRecord.intervalCount ?? null,
      trialDays: priceRecord.trialDays ?? null,
    }
  }

  const results = await Promise.all(
    items.map(async (item): Promise<ValidatedCartItem> => {
      const priceRecord = priceMap.get(item.stripePriceId)

      if (!priceRecord) {
        return {
          stripePriceId: item.stripePriceId,
          valid: false as const,
          reason: 'price_not_found' as const,
          availableQuantity: null,
          lowStock: false,
        }
      }

      if (priceRecord.product.deletedAt !== null) {
        return {
          stripePriceId: item.stripePriceId,
          valid: false as const,
          reason: 'product_deleted' as const,
          availableQuantity: null,
          lowStock: false,
          ...buildPricingMetadata(priceRecord),
        }
      }

      const availability = await checkAvailability(
        organizationId,
        priceRecord.product.id,
        item.quantity
      )

      const availableQuantity = availability.trackInventory
        ? availability.currentQuantity
        : null
      const lowStock = availability.trackInventory
        && availability.currentQuantity <= LOW_STOCK_THRESHOLD
        && availability.currentQuantity > 0

      if (!availability.available) {
        return {
          stripePriceId: item.stripePriceId,
          valid: false as const,
          reason: 'out_of_stock' as const,
          availableQuantity,
          lowStock: false,
          ...buildPricingMetadata(priceRecord),
        }
      }

      return {
        stripePriceId: item.stripePriceId,
        valid: true as const,
        reason: 'ok' as const,
        availableQuantity,
        lowStock,
        ...buildPricingMetadata(priceRecord),
      }
    })
  )

  return results
}


// ============================================================================
// CART CHECKOUT ENTRY POINT
// ============================================================================

/**
 * Create a payment intent for a shopping cart using native Stripe Elements.
 *
 * SOURCE OF TRUTH: CreateCartCheckoutIntent, MixedCartPayment, EcommerceCartPayment
 *
 * MIXED CART SUPPORT:
 * - ONE_TIME only: Creates PaymentIntent with total amount
 * - Has RECURRING items: Creates Subscription with payment_behavior: 'default_incomplete'
 *   - Recurring prices go in subscription items
 *   - One-time prices go in add_invoice_items (charged on first invoice)
 */
export async function createCartCheckoutSession(input: CartCheckoutSessionInput) {
  const { organizationId, items, customer, testMode } = input

  if (!items.length) throw new Error('Cart is empty')

  /** Get organization details */
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, stripeConnectedAccountId: true },
  })

  if (!organization) throw new Error('Organization not found')
  if (!organization.stripeConnectedAccountId) throw new Error('Organization has not connected Stripe')

  /** Prepare shared checkout context */
  const ctx = await prepareCheckoutContext(
    organizationId,
    organization.stripeConnectedAccountId,
    customer,
    testMode ?? false,
    null,
    'cart_checkout'
  )

  /** Effective account for price resolution (null in test mode) */
  const connectedAccountId = ctx.paymentConfig.effectiveAccountId

  /**
   * Look up price/product info from stripePriceId for each cart item.
   * Needed to create TransactionItems with product references.
   */
  const stripePriceIds = items.map((item) => item.stripePriceId)
  const prices = await prisma.productPrice.findMany({
    where: { stripePriceId: { in: stripePriceIds } },
    include: { product: true },
  })
  const priceMap = new Map(prices.map((p) => [p.stripePriceId, p]))

  /** Fail fast if any items reference deleted/missing prices */
  const invalidItems = items.filter((item) => !priceMap.has(item.stripePriceId))
  if (invalidItems.length > 0) {
    const names = invalidItems.map((i) => i.name).join(', ')
    throw new Error(`Items no longer available: ${names}. Please remove them from your cart and try again.`)
  }

  /** Resolve Stripe price IDs for the correct account */
  const resolvedItems = await resolveCartStripePrices(items, priceMap, connectedAccountId, ctx.stripeInstance)

  /** Categorize items by billing type */
  const recurringItems = resolvedItems.filter((item) => item.billingType === 'RECURRING')
  const oneTimeItems = resolvedItems.filter((item) => item.billingType === 'ONE_TIME')
  const hasRecurringItems = recurringItems.length > 0

  /**
   * TRIAL SPLIT DETECTION
   * Stripe's trial_period_days is subscription-level. Items with different trial
   * durations MUST go in separate subscriptions.
   * SOURCE OF TRUTH: CartTrialSplitDecision, PerTrialPeriodSubscription
   */
  const uniqueTrialPeriods = new Set(
    recurringItems.map((item) => {
      const dbPrice = priceMap.get(item.stripePriceId)
      return dbPrice?.trialDays ?? 0
    })
  )
  const needsTrialSplit = uniqueTrialPeriods.size > 1

  /** Group recurring items by trial period when splitting is needed */
  let mainRecurringItems = recurringItems
  let mainTrialDays = 0
  const pendingTrialItemsForMetadata: Array<{ priceId: string; quantity: number; trialDays: number }> = []

  if (needsTrialSplit) {
    const trialGroupMap = new Map<number, CartCheckoutItem[]>()
    for (const item of recurringItems) {
      const dbPrice = priceMap.get(item.stripePriceId)
      const td = dbPrice?.trialDays ?? 0
      const group = trialGroupMap.get(td) || []
      group.push(item)
      trialGroupMap.set(td, group)
    }

    /** Prefer non-trial (trialDays=0) as main group since it needs immediate payment */
    if (trialGroupMap.has(0)) {
      mainRecurringItems = trialGroupMap.get(0)!
      mainTrialDays = 0
      trialGroupMap.delete(0)
    } else {
      let bestKey = 0
      let bestSize = 0
      for (const [td, groupItems] of trialGroupMap.entries()) {
        if (groupItems.length > bestSize) {
          bestKey = td
          bestSize = groupItems.length
        }
      }
      mainRecurringItems = trialGroupMap.get(bestKey)!
      mainTrialDays = bestKey
      trialGroupMap.delete(bestKey)
    }

    for (const [trialDays, groupItems] of trialGroupMap.entries()) {
      for (const item of groupItems) {
        const dbPrice = priceMap.get(item.stripePriceId)
        pendingTrialItemsForMetadata.push({
          priceId: dbPrice?.id || '',
          quantity: item.quantity,
          trialDays,
        })
      }
    }
  }

  /** Inventory validation — aggregate all out-of-stock errors */
  const outOfStockItems: Array<{ name: string; currentStock: number; requested: number }> = []
  for (const item of items) {
    const priceRecord = priceMap.get(item.stripePriceId)
    if (!priceRecord?.product) {
      throw new Error(`Product data missing for price "${item.stripePriceId}"`)
    }
    const availability = await checkAvailability(organizationId, priceRecord.product.id, item.quantity)
    if (!availability.available) {
      outOfStockItems.push({
        name: item.name,
        currentStock: availability.currentQuantity,
        requested: item.quantity,
      })
    }
  }
  if (outOfStockItems.length > 0) {
    const details = outOfStockItems
      .map((i) => `"${i.name}" (${i.currentStock} available, ${i.requested} requested)`)
      .join(', ')
    throw new Error(`Out of stock: ${details}`)
  }

  /** Build TransactionItems from ORIGINAL items (use original stripePriceId for DB lookup) */
  const transactionItems = items.map((item) => {
    const price = priceMap.get(item.stripePriceId)
    return {
      productId: price?.productId || '',
      priceId: price?.id || '',
      productName: price?.product?.name || item.name,
      productImage: price?.product?.imageUrl || null,
      priceName: price?.name || item.name,
      quantity: item.quantity,
      unitAmount: item.priceInCents,
      totalAmount: item.priceInCents * item.quantity,
      billingType: item.billingType as 'ONE_TIME' | 'RECURRING',
      interval: price?.interval,
      intervalCount: price?.intervalCount,
    }
  })

  /** Generate checkoutSessionId to link all transactions from this cart checkout */
  const checkoutSessionId = crypto.randomUUID()

  /** Compute trial days for the RECURRING transaction record */
  const maxTrialDaysForTransaction = needsTrialSplit
    ? mainTrialDays
    : items
        .filter((item) => item.billingType === 'RECURRING')
        .reduce((max, item) => {
          const dbPrice = priceMap.get(item.stripePriceId)
          const trial = dbPrice?.trialDays ?? 0
          return trial > max ? trial : max
        }, 0)

  /** Split transaction items by billing type */
  const oneTimeTransactionItems = transactionItems.filter((i) => i.billingType === 'ONE_TIME')
  const recurringTransactionItems = transactionItems.filter((i) => i.billingType === 'RECURRING')

  /** Primary transaction ID — linked to PaymentIntent or first subscription */
  let transactionId: string | null = null

  if (!ctx.testMode) {
    const currency = items[0]?.currency?.toLowerCase() || 'usd'
    const baseMetadata = {
      customerEmail: customer.email,
      customerName: `${customer.firstName} ${customer.lastName}`,
      source: 'cart_checkout',
      checkoutSessionId,
    }

    /**
     * Create RECURRING Transaction if there are recurring items.
     * MIXED CART: one-time items included on this transaction because
     * Stripe charges them together on the first invoice via add_invoice_items.
     * SOURCE OF TRUTH: CartMixedTransactionGrouping
     */
    if (recurringTransactionItems.length > 0) {
      const mainGroupPriceIds = new Set(
        mainRecurringItems.map((item) => {
          const dbPrice = priceMap.get(item.stripePriceId)
          return dbPrice?.id || ''
        })
      )
      const mainGroupTxnItems = recurringTransactionItems.filter(
        (i) => mainGroupPriceIds.has(i.priceId)
      )

      const allItemsForRecurringTxn = hasRecurringItems
        ? [...mainGroupTxnItems, ...oneTimeTransactionItems]
        : mainGroupTxnItems

      const totalAmount = allItemsForRecurringTxn.reduce((sum, i) => sum + i.totalAmount, 0)
      const recurringTxn = await prisma.transaction.create({
        data: {
          organizationId,
          leadId: ctx.leadId,
          originalAmount: totalAmount,
          paidAmount: 0,
          refundedAmount: 0,
          currency,
          billingType: BILLING_TYPES.RECURRING,
          paymentStatus: maxTrialDaysForTransaction > 0 ? 'TRIALING' : 'AWAITING_PAYMENT',
          totalPayments: 0,
          successfulPayments: 0,
          stripeCustomerId: ctx.stripeCustomer.id,
          paymentLinkId: null,
          checkoutSessionId,
          ...(maxTrialDaysForTransaction > 0 && {
            trialDays: maxTrialDaysForTransaction,
            trialEndsAt: new Date(Date.now() + maxTrialDaysForTransaction * 24 * 60 * 60 * 1000),
          }),
          metadata: {
            ...baseMetadata,
            billingGroup: 'recurring',
            itemCount: allItemsForRecurringTxn.length,
            hasRecurringItems: true,
            hasOneTimeItems: oneTimeTransactionItems.length > 0,
            ...(pendingTrialItemsForMetadata.length > 0 && {
              pendingTrialItems: JSON.stringify(pendingTrialItemsForMetadata),
            }),
          },
          items: {
            create: allItemsForRecurringTxn,
          },
        },
      })
      transactionId = recurringTxn.id
    } else if (oneTimeTransactionItems.length > 0) {
      /** ONE_TIME-only cart: standalone PaymentIntent transaction */
      const oneTimeTotal = oneTimeTransactionItems.reduce((sum, i) => sum + i.totalAmount, 0)
      const oneTimeTxn = await prisma.transaction.create({
        data: {
          organizationId,
          leadId: ctx.leadId,
          originalAmount: oneTimeTotal,
          paidAmount: 0,
          refundedAmount: 0,
          currency,
          billingType: BILLING_TYPES.ONE_TIME,
          paymentStatus: 'AWAITING_PAYMENT',
          totalPayments: 1,
          successfulPayments: 0,
          stripeCustomerId: ctx.stripeCustomer.id,
          paymentLinkId: null,
          checkoutSessionId,
          metadata: {
            ...baseMetadata,
            billingGroup: 'one_time',
            itemCount: oneTimeTransactionItems.length,
          },
          items: {
            create: oneTimeTransactionItems,
          },
        },
      })
      transactionId = oneTimeTxn.id
    }
  }

  /** Encode trigger items for test mode webhook automation firing (split across metadata keys if needed) */
  const triggerItemsMeta = ctx.testMode
    ? encodeTriggerItemsMetadata(transactionItems.map((item) => ({
        productId: item.productId,
        priceId: item.priceId,
        productName: item.productName,
        priceName: item.priceName,
        billingType: item.billingType,
      })))
    : undefined

  /**
   * Route to handler based on cart contents.
   * SOURCE OF TRUTH: CartCheckoutRouting
   */
  if (hasRecurringItems) {
    if (needsTrialSplit) {
      const result = await createCartSubscription(
        ctx, mainRecurringItems, oneTimeItems, transactionId,
        ctx.leadId ?? undefined, triggerItemsMeta,
        mainTrialDays, checkoutSessionId, pendingTrialItemsForMetadata
      )
      return { ...result, hasPendingTrialItems: true, checkoutSessionId }
    }

    /** Standard path: all recurring items share the same trial state */
    const maxTrialDays = items
      .filter((item) => item.billingType === 'RECURRING')
      .reduce((max, item) => {
        const dbPrice = priceMap.get(item.stripePriceId)
        const trial = dbPrice?.trialDays ?? 0
        return trial > max ? trial : max
      }, 0)

    return createCartSubscription(
      ctx, recurringItems, oneTimeItems, transactionId,
      ctx.leadId ?? undefined, triggerItemsMeta,
      maxTrialDays, checkoutSessionId
    )
  } else {
    return createCartPaymentIntent(
      ctx, oneTimeItems, transactionId,
      ctx.leadId ?? undefined, triggerItemsMeta, checkoutSessionId
    )
  }
}


// ============================================================================
// CART PAYMENT HANDLERS (Internal)
// ============================================================================

/**
 * Create PaymentIntent for one-time only cart.
 *
 * SOURCE OF TRUTH: CartPaymentIntent, OneTimeCartPayment
 */
async function createCartPaymentIntent(
  ctx: CheckoutContext,
  items: CartCheckoutItem[],
  transactionId: string | null,
  leadId?: string,
  triggerItemsMeta?: Record<string, string>,
  checkoutSessionId?: string
) {
  const totalAmount = items.reduce(
    (sum, item) => sum + item.priceInCents * item.quantity,
    0
  )

  if (totalAmount <= 0) throw new Error('Invalid cart total')

  const itemDescriptions = items
    .map((item) => `${item.name} x${item.quantity}`)
    .join(', ')

  /**
   * Build cart payment metadata via centralized buildPaymentMetadata().
   * FIX: Previously built manually, missing simulatedConnectedAccountId in test mode
   * which broke webhook routing for test mode cart payments.
   */
  const cartPaymentMetadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    organizationId: ctx.organizationId,
    cartCheckout: 'true',
    billingType: 'ONE_TIME',
    transactionId: transactionId ?? '',
    appliedTier: ctx.tier,
    source: ctx.source,
    ...(checkoutSessionId && { checkoutSessionId }),
    itemCount: String(items.length),
    items: JSON.stringify(items.map((i) => ({ name: i.name, qty: i.quantity, price: i.priceInCents }))),
    ...(ctx.testMode && leadId && { leadId }),
    ...(ctx.testMode && triggerItemsMeta),
  })

  /**
   * Build PaymentIntent params.
   * Application fee ensures the platform collects its revenue share.
   */
  /**
   * Cart PaymentIntent — automatic_payment_methods enables all dashboard-enabled
   * methods (cards, Apple Pay, Google Pay, Link, etc.).
   */
  const cartPiParams: Stripe.PaymentIntentCreateParams = {
    amount: totalAmount,
    currency: items[0]?.currency?.toLowerCase() || 'usd',
    customer: ctx.stripeCustomer.id,
    description: itemDescriptions,
    automatic_payment_methods: { enabled: true },
    metadata: cartPaymentMetadata,
  }

  /** Only add application_fee_amount in live mode (test mode has no connected account) */
  if (ctx.paymentConfig.includeApplicationFee) {
    cartPiParams.application_fee_amount = calculatePlatformFeeCents(totalAmount, ctx.tier)
  }

  /** Create PaymentIntent on the correct account */
  const paymentIntent = await ctx.stripeInstance.paymentIntents.create(
    cartPiParams,
    ctx.paymentConfig.stripeOptions
  )

  if (!paymentIntent.client_secret) {
    throw new Error('Failed to create payment: No client secret returned')
  }

  /** Link Transaction to PaymentIntent */
  await linkTransactionToStripe(transactionId, { stripePaymentIntentId: paymentIntent.id })

  return {
    clientSecret: paymentIntent.client_secret,
    type: 'payment_intent' as const,
    paymentIntentId: paymentIntent.id,
    testMode: ctx.testMode,
    transactionId: transactionId ?? null,
    checkoutSessionId: checkoutSessionId ?? null,
    isTrial: false,
  }
}

/**
 * Create Subscription for cart checkout.
 *
 * SOURCE OF TRUTH: CartSubscription, MixedCartSubscription
 *
 * ITEM HANDLING:
 * - recurringItems → subscription.items
 * - oneTimeItems → add_invoice_items (charged on first invoice only)
 */
async function createCartSubscription(
  ctx: CheckoutContext,
  recurringItems: CartCheckoutItem[],
  oneTimeItems: CartCheckoutItem[],
  transactionId: string | null,
  leadId?: string,
  triggerItemsMeta?: Record<string, string>,
  maxTrialDays?: number,
  checkoutSessionId?: string,
  pendingTrialItemsForMetadata?: Array<{ priceId: string; quantity: number; trialDays: number }>
) {
  /** Build subscription items from recurring cart items */
  const subscriptionItems: Stripe.SubscriptionCreateParams.Item[] = recurringItems.map((item) => ({
    price: item.stripePriceId,
    quantity: item.quantity,
  }))

  /** Build invoice items from one-time cart items */
  const invoiceItems: Stripe.SubscriptionCreateParams.AddInvoiceItem[] = oneTimeItems.map((item) => ({
    price: item.stripePriceId,
    quantity: item.quantity,
  }))

  const allItems = [...recurringItems, ...oneTimeItems]
  const itemDescriptions = allItems
    .map((item) => `${item.name} x${item.quantity}`)
    .join(', ')

  /**
   * Build cart subscription metadata via centralized buildPaymentMetadata().
   * FIX: Previously built manually, missing simulatedConnectedAccountId in test mode
   * which broke webhook routing for test mode cart subscriptions.
   */
  const cartSubMetadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    organizationId: ctx.organizationId,
    cartCheckout: 'true',
    billingType: 'RECURRING',
    transactionId: transactionId ?? '',
    appliedTier: ctx.tier,
    source: ctx.source,
    ...(checkoutSessionId && { checkoutSessionId }),
    ...(pendingTrialItemsForMetadata && pendingTrialItemsForMetadata.length > 0 && {
      pendingTrialItems: JSON.stringify(pendingTrialItemsForMetadata),
    }),
    itemCount: String(allItems.length),
    hasOneTimeItems: oneTimeItems.length > 0 ? 'true' : 'false',
    description: itemDescriptions,
    ...(ctx.testMode && leadId && { leadId }),
    ...(ctx.testMode && triggerItemsMeta),
    ...(maxTrialDays && maxTrialDays > 0 && { trialDays: String(maxTrialDays) }),
  })

  /** Build subscription params */
  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: ctx.stripeCustomer.id,
    items: subscriptionItems,
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payments', 'pending_setup_intent'],
    metadata: cartSubMetadata,
  }

  /** Only add application_fee_percent in live mode (test mode has no connected account) */
  if (ctx.paymentConfig.includeApplicationFee) {
    subscriptionParams.application_fee_percent = Math.round(ctx.feeConfig.percentage * 10000) / 100
  }

  /** Add trial period if any recurring item has trialDays */
  if (maxTrialDays && maxTrialDays > 0) {
    subscriptionParams.trial_period_days = maxTrialDays
  }

  /** Add one-time items to first invoice */
  if (invoiceItems.length > 0) {
    subscriptionParams.add_invoice_items = invoiceItems
  }

  /** Create subscription on the correct account */
  const subscription = await ctx.stripeInstance.subscriptions.create(
    subscriptionParams,
    ctx.paymentConfig.stripeOptions
  )

  /** Extract client secret — cancel subscription if extraction fails */
  let clientSecret: string
  let paymentIntentId: string | null
  let isTrial = false
  try {
    const result = await getSubscriptionClientSecret(
      subscription,
      ctx.paymentConfig.effectiveAccountId,
      'cart subscription payment',
      ctx.stripeInstance
    )
    clientSecret = result.clientSecret
    paymentIntentId = result.paymentIntentId
    isTrial = result.isTrial
  } catch (error) {
    await ctx.stripeInstance.subscriptions.cancel(subscription.id, ctx.paymentConfig.stripeOptions)
    throw error
  }

  /** Link Transaction to Subscription */
  await linkTransactionToStripe(transactionId, { stripeSubscriptionId: subscription.id })

  return {
    clientSecret,
    type: 'subscription' as const,
    subscriptionId: subscription.id,
    paymentIntentId,
    testMode: ctx.testMode,
    transactionId: transactionId ?? null,
    checkoutSessionId: checkoutSessionId ?? null,
    isTrial,
  }
}


// ============================================================================
// TRIAL SPLIT COMPLETION
// ============================================================================

/**
 * Complete pending trial subscriptions after the main cart payment succeeds.
 * Called by the frontend after Stripe payment confirmation.
 *
 * Creates one subscription per unique trial period group. Uses Promise.all()
 * for parallel creation to minimize latency.
 *
 * SECURITY:
 * - Requires both checkoutSessionId AND subscriptionId for validation
 * - Pending trial items read from server-stored metadata (never from client)
 * - Payment method retrieved server-side from the completed subscription
 * - pendingTrialItems cleared after processing to prevent replay attacks
 *
 * SOURCE OF TRUTH: CartTrialSplit, CompleteTrialSubscriptions
 */
export async function completeTrialSubscriptions(
  checkoutSessionId: string,
  primarySubscriptionId: string,
  organizationId: string
): Promise<{ success: boolean; trialSubscriptionIds: string[] }> {
  /** Find the parent transaction by checkoutSessionId + primarySubscriptionId */
  const transactions = await prisma.transaction.findMany({
    where: {
      checkoutSessionId,
      organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      metadata: true,
    },
  })

  const transaction = transactions.find(
    (t) => t.stripeSubscriptionId === primarySubscriptionId
  )

  if (!transaction) {
    throw new Error(
      `Transaction not found for checkoutSessionId=${checkoutSessionId}, primarySubscriptionId=${primarySubscriptionId}. ` +
      `Found ${transactions.length} transaction(s) in this checkout session.`
    )
  }

  if (!transaction.stripeCustomerId) {
    throw new Error('Transaction has no Stripe customer')
  }

  /** Read pending trial items from server-stored metadata */
  const metadata = transaction.metadata as Record<string, unknown> | null
  const pendingTrialItemsRaw = metadata?.pendingTrialItems as string | undefined

  if (!pendingTrialItemsRaw) {
    return { success: true, trialSubscriptionIds: [] }
  }

  const pendingTrialItems = JSON.parse(pendingTrialItemsRaw) as Array<{
    priceId: string
    quantity: number
    trialDays: number
  }>

  if (pendingTrialItems.length === 0) {
    return { success: true, trialSubscriptionIds: [] }
  }

  /** Determine test mode and get Stripe instance */
  const testMode = (metadata as Record<string, unknown>)?.testMode === 'true'
  const stripeInstance = getStripeInstance(testMode)

  /** Get organization's connected account for live mode */
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })
  const connectedAccountId = testMode ? null : (org?.stripeConnectedAccountId ?? null)
  const effectiveAccountId = testMode ? null : connectedAccountId
  const stripeOptions = connectedAccountId ? { stripeAccount: connectedAccountId } : undefined

  /**
   * Retrieve the completed subscription to get the saved payment method.
   * SOURCE OF TRUTH: TrialSplitPaymentMethodRetrieval
   */
  const completedSub = await stripeInstance.subscriptions.retrieve(
    primarySubscriptionId,
    stripeOptions
  )

  if (completedSub.status !== 'active' && completedSub.status !== 'trialing') {
    throw new Error('Primary subscription payment has not completed — cannot create trial subscriptions')
  }

  /** Get payment method — try subscription, then SetupIntent, then customer */
  let paymentMethodId: string | null | undefined = typeof completedSub.default_payment_method === 'string'
    ? completedSub.default_payment_method
    : (completedSub.default_payment_method as { id: string } | null)?.id

  if (!paymentMethodId) {
    if (completedSub.pending_setup_intent) {
      const setupIntentId = typeof completedSub.pending_setup_intent === 'string'
        ? completedSub.pending_setup_intent
        : completedSub.pending_setup_intent.id
      const setupIntent = await stripeInstance.setupIntents.retrieve(setupIntentId, stripeOptions)
      paymentMethodId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : (setupIntent.payment_method as { id: string } | null)?.id ?? null
    }

    if (!paymentMethodId && transaction.stripeCustomerId) {
      const paymentMethods = await stripeInstance.paymentMethods.list(
        { customer: transaction.stripeCustomerId, type: 'card', limit: 1 },
        stripeOptions
      )
      paymentMethodId = paymentMethods.data[0]?.id ?? null
    }
  }

  if (!paymentMethodId) {
    throw new Error('No payment method found on completed subscription or customer')
  }

  /** Get organization tier for platform fee calculation */
  const tierInfo = await getOrganizationTier(organizationId)
  const tier = tierInfo.tier as PlanKey
  const feeConfig = getStripeTransactionFee(tier)
  const applicationFeePercent = testMode ? undefined : Math.round(feeConfig.percentage * 10000) / 100

  /** Group pending items by trialDays — one subscription per group */
  const groupedByTrial = new Map<number, typeof pendingTrialItems>()
  for (const item of pendingTrialItems) {
    const group = groupedByTrial.get(item.trialDays) || []
    group.push(item)
    groupedByTrial.set(item.trialDays, group)
  }

  /** Read leadId and currency from parent transaction */
  const parentTxn = await prisma.transaction.findUnique({
    where: { id: transaction.id },
    select: { leadId: true, currency: true },
  })

  const subscriptionPromises = Array.from(groupedByTrial.entries()).map(
    async ([trialDays, groupItems]) => {
      const subscriptionItemsList: Array<{ price: string; quantity: number }> = []
      const validatedItems: Array<{
        price: NonNullable<Awaited<ReturnType<typeof prisma.productPrice.findUnique>>>
        product: { id: string; name: string; description: string | null; imageUrl: string | null }
        quantity: number
      }> = []

      for (const item of groupItems) {
        const price = await prisma.productPrice.findUnique({
          where: { id: item.priceId },
          include: { product: true },
        })

        if (!price || price.product.organizationId !== organizationId) continue
        if (!price.interval) continue

        const stripeProductId = await getOrCreateStripeProduct(effectiveAccountId, price.product, stripeInstance)
        const stripePriceId = await getOrCreateStripePrice(effectiveAccountId, stripeProductId, {
          id: price.id,
          name: price.name,
          amount: price.amount,
          currency: price.currency,
          interval: price.interval,
          intervalCount: price.intervalCount || 1,
        }, stripeInstance)

        subscriptionItemsList.push({ price: stripePriceId, quantity: item.quantity })
        validatedItems.push({ price, product: price.product, quantity: item.quantity })
      }

      if (subscriptionItemsList.length === 0) return null

      /** Create a NEW Transaction for this trial group (live mode only) */
      let trialTransactionId = ''
      if (!testMode) {
        const trialGroupTotal = validatedItems.reduce(
          (sum, item) => sum + (item.price!.amount * item.quantity), 0
        )

        const trialTxn = await prisma.transaction.create({
          data: {
            organizationId,
            leadId: parentTxn?.leadId ?? null,
            originalAmount: trialGroupTotal,
            paidAmount: 0,
            refundedAmount: 0,
            currency: parentTxn?.currency || 'usd',
            billingType: 'RECURRING',
            paymentStatus: 'TRIALING',
            totalPayments: 0,
            successfulPayments: 0,
            stripeCustomerId: transaction.stripeCustomerId!,
            paymentLinkId: null,
            checkoutSessionId: checkoutSessionId,
            trialDays,
            trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
            metadata: {
              source: 'cart_trial_split',
              billingGroup: `trial_${trialDays}d`,
              parentTransactionId: transaction.id,
            },
            items: {
              create: validatedItems.map((item) => ({
                productId: item.product.id,
                priceId: item.price!.id,
                productName: item.product.name,
                productImage: item.product.imageUrl,
                priceName: item.price!.name,
                quantity: item.quantity,
                unitAmount: item.price!.amount,
                totalAmount: item.price!.amount * item.quantity,
                billingType: 'RECURRING' as const,
                interval: item.price!.interval,
                intervalCount: item.price!.intervalCount,
              })),
            },
          },
        })
        trialTransactionId = trialTxn.id
      }

      /** Create the trial subscription with saved payment method */
      const trialSubParams: Stripe.SubscriptionCreateParams = {
        customer: transaction.stripeCustomerId!,
        items: subscriptionItemsList,
        trial_period_days: trialDays,
        default_payment_method: paymentMethodId,
        metadata: {
          transactionId: trialTransactionId,
          organizationId,
          billingType: 'RECURRING',
          source: 'cart_trial_split',
          trialDays: String(trialDays),
          ...(checkoutSessionId && { checkoutSessionId }),
          ...(testMode && {
            testMode: 'true',
            simulatedConnectedAccountId: connectedAccountId ?? '',
          }),
        },
      }

      if (applicationFeePercent) {
        trialSubParams.application_fee_percent = applicationFeePercent
      }

      const trialSub = await stripeInstance.subscriptions.create(trialSubParams, stripeOptions)

      /** Link trial Transaction to its Stripe subscription */
      if (trialTransactionId) {
        await prisma.transaction.update({
          where: { id: trialTransactionId },
          data: { stripeSubscriptionId: trialSub.id },
        })
      }

      return trialSub.id
    }
  )

  const results = await Promise.all(subscriptionPromises)
  const trialSubscriptionIds = results.filter((id): id is string => id !== null)

  /** Clear pendingTrialItems from metadata to prevent replay attacks */
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      metadata: {
        ...(metadata as Record<string, unknown>),
        pendingTrialItems: null,
      },
    },
  })

  return { success: true, trialSubscriptionIds }
}


// ============================================================================
// ENTRY POINT 4: INVOICE PAYMENT CHECKOUT
// ============================================================================

/**
 * Input for creating an invoice checkout session through the unified pipeline.
 *
 * SOURCE OF TRUTH: InvoiceCheckoutSessionInput, InvoiceUnifiedCheckout
 */
export type InvoiceCheckoutSessionInput = {
  /** Public access token identifying the invoice */
  accessToken: string
  /** Customer contact info from the invoice payment form */
  customer: {
    email: string
    firstName: string
    lastName: string
  }
}

/**
 * Result from creating an invoice checkout session.
 *
 * SOURCE OF TRUTH: InvoiceCheckoutResult, InvoiceUnifiedCheckoutResult
 */
export type InvoiceCheckoutResult = {
  /** Stripe client secret for frontend PaymentElement/SetupElement confirmation */
  clientSecret: string
  /** Invoice ID that this payment belongs to */
  invoiceId: string
  /** Total amount in cents */
  totalAmount: number
  /** Currency code (e.g. "usd") */
  currency: string
  /** Whether this is a trial subscription (SetupIntent, not PaymentIntent) */
  isTrial: boolean
  /** Payment type — 'payment_intent' or 'subscription' */
  type: 'payment_intent' | 'subscription'
  /** Transaction ID (present in live mode, undefined in test mode) */
  transactionId?: string
}

/**
 * Create a checkout session for an invoice payment — routes through the unified pipeline.
 *
 * This is the 4th entry point into the checkout pipeline, alongside:
 * 1. createCheckoutIntent (payment links)
 * 2. createEmbeddedCheckoutIntent (embedded payment elements)
 * 3. createCartCheckoutSession (shopping cart)
 *
 * ROUTING LOGIC (same as all other entry points):
 * 1. Has RECURRING items → Subscription (recurring → items, ONE_TIME → add_invoice_items)
 * 2. All ONE_TIME + any has trialDays → Trialing subscription with cancel_at_period_end
 * 3. All ONE_TIME, no trial → Standard PaymentIntent
 *
 * TRANSACTION HANDLING:
 * Creates a Transaction via createCheckoutTransaction() in AWAITING_PAYMENT status.
 * The webhook handler (completeInvoicePayment / handleSubscriptionPayment) then
 * finds the existing Transaction by stripePaymentIntentId — no duplicate creation.
 *
 * SOURCE OF TRUTH KEYWORDS: CreateInvoiceCheckoutSession, InvoiceUnifiedPipeline
 *
 * @param input - Access token + customer contact info
 * @returns Client secret + invoice metadata for frontend confirmation
 * @throws Error if invoice not found, not payable, or Stripe not connected
 */
export async function createInvoiceCheckoutSession(
  input: InvoiceCheckoutSessionInput
): Promise<InvoiceCheckoutResult> {
  // -----------------------------------------------------------------------
  // 1. Fetch and validate the invoice
  // -----------------------------------------------------------------------

  /** Fetch invoice with items, organization, and lead for payment context */
  const invoice = await prisma.invoice.findFirst({
    where: {
      accessToken: input.accessToken,
      status: { in: ['SENT', 'OVERDUE'] },
    },
    include: {
      items: true,
      organization: {
        select: {
          id: true,
          stripeConnectedAccountId: true,
        },
      },
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  })

  if (!invoice) {
    throw new Error('Invoice not found or not payable')
  }

  if (!invoice.items.length) {
    throw new Error('Invoice has no items')
  }

  if (invoice.totalAmount <= 0) {
    throw new Error('Invoice total must be greater than zero')
  }

  const connectedAccountId = invoice.organization.stripeConnectedAccountId
  if (!connectedAccountId) {
    throw new Error('Organization has not connected Stripe')
  }

  // -----------------------------------------------------------------------
  // 2. Prepare unified checkout context via shared pipeline
  // -----------------------------------------------------------------------

  /**
   * Invoices always use live mode — no test mode toggle on invoices.
   * SOURCE OF TRUTH: InvoiceTestMode
   */
  const testMode = false

  /**
   * Use prepareCheckoutContext() for consistent org/customer/lead/tier setup.
   * The customer data comes from the payment form, and the source is 'invoice_payment'
   * for lead attribution and metadata tagging.
   */
  const ctx = await prepareCheckoutContext(
    invoice.organizationId,
    connectedAccountId,
    {
      email: input.customer.email,
      firstName: input.customer.firstName,
      lastName: input.customer.lastName,
    },
    testMode,
    null, // no paymentLinkId for invoices
    'invoice_payment'
  )

  // -----------------------------------------------------------------------
  // 3. Analyze items — separate RECURRING from ONE_TIME, detect trial
  // -----------------------------------------------------------------------

  const recurringItems = invoice.items.filter((item) => item.billingType === 'RECURRING')
  const oneTimeItems = invoice.items.filter((item) => item.billingType !== 'RECURRING')
  const maxTrialDays = Math.max(0, ...invoice.items.map((item) => item.trialDays ?? 0))
  const hasRecurring = recurringItems.length > 0

  // -----------------------------------------------------------------------
  // 4. Route by billing type (same logic as all other checkout entry points)
  // -----------------------------------------------------------------------

  /**
   * ROUTE 1: Has RECURRING items → Subscription flow (mixed cart pattern).
   * Recurring items become subscription.items, ONE_TIME items become add_invoice_items.
   */
  if (hasRecurring) {
    return processInvoiceSubscription(
      invoice,
      recurringItems,
      oneTimeItems,
      ctx,
      maxTrialDays
    )
  }

  /**
   * ROUTE 2: All ONE_TIME + trial → Trialing subscription with cancel_at_period_end.
   * Uses SetupIntent ($0 upfront), charges total after trial ends.
   */
  if (maxTrialDays > 0) {
    return processInvoiceOneTimeTrial(
      invoice,
      oneTimeItems,
      ctx,
      maxTrialDays
    )
  }

  /**
   * ROUTE 3: All ONE_TIME, no trial → Standard PaymentIntent.
   */
  return processInvoicePaymentIntent(invoice, ctx)
}


// ============================================================================
// INVOICE CHECKOUT HANDLERS (Internal — called by createInvoiceCheckoutSession)
// ============================================================================

/**
 * Resolve a Stripe price ID for an invoice item.
 *
 * Product-linked items (have priceId + productId): Look up ProductPrice,
 * sync product + price to Stripe, return the Stripe price ID.
 *
 * Ad-hoc items (no productId): Create inline Stripe product + price
 * for the custom amount.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceStripePriceResolution, InvoiceItemPriceSync
 *
 * @param item - The invoice item to resolve
 * @param connectedAccountId - Stripe account to create resources on (null for test/platform)
 * @param stripeInstance - Stripe SDK instance
 * @returns Stripe price ID for the item
 */
async function resolveInvoiceItemStripePrice(
  item: { id: string; name: string; priceId: string | null; productId: string | null; unitAmount: number; billingType: string; interval: string | null; intervalCount: number | null },
  connectedAccountId: string | null,
  stripeInstance: Stripe
): Promise<string> {
  if (item.priceId && item.productId) {
    /**
     * Product-linked item: look up Mochi ProductPrice, sync product + price
     * to the connected Stripe account, return the Stripe price ID.
     */
    const productPrice = await prisma.productPrice.findUnique({
      where: { id: item.priceId },
      include: {
        product: {
          select: { id: true, name: true, description: true, imageUrl: true },
        },
      },
    })

    if (!productPrice || !productPrice.product) {
      throw new Error(`Product price ${item.priceId} not found for invoice item "${item.name}"`)
    }

    /** Sync product to the connected account */
    const stripeProductId = await getOrCreateStripeProduct(
      connectedAccountId,
      productPrice.product,
      stripeInstance
    )

    /** Sync price (handles both recurring + one-time automatically) */
    return getOrCreateStripePrice(
      connectedAccountId,
      stripeProductId,
      {
        id: productPrice.id,
        name: productPrice.name,
        amount: productPrice.amount,
        currency: productPrice.currency,
        interval: productPrice.interval,
        intervalCount: productPrice.intervalCount,
      },
      stripeInstance
    )
  }

  /**
   * Ad-hoc item: no linked product — create inline Stripe product + price.
   * This handles custom line items added directly to the invoice.
   */
  const stripeOptions = getConnectedAccountOptions(connectedAccountId)

  const adHocProduct = await stripeInstance.products.create(
    {
      name: item.name,
      metadata: { source: 'invoice_adhoc', invoiceItemId: item.id },
    },
    stripeOptions
  )

  const priceParams: Stripe.PriceCreateParams = {
    product: adHocProduct.id,
    unit_amount: item.unitAmount,
    currency: 'usd',
    metadata: { source: 'invoice_adhoc' },
  }

  /** Add recurring config if the ad-hoc item is RECURRING */
  if (item.billingType === 'RECURRING' && item.interval) {
    priceParams.recurring = {
      interval: toStripeInterval(item.interval as BillingInterval),
      interval_count: item.intervalCount || 1,
    }
  }

  const stripePrice = await stripeInstance.prices.create(priceParams, stripeOptions)
  return stripePrice.id
}

/**
 * Standard PaymentIntent flow for pure ONE_TIME invoices without trial.
 *
 * Creates a Transaction via createCheckoutTransaction(), builds a PaymentIntent,
 * and links both the Transaction and Invoice to the PaymentIntent for webhook
 * reconciliation.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoicePaymentIntentHandler, InvoiceOneTimePayment
 */
async function processInvoicePaymentIntent(
  invoice: {
    id: string
    invoiceNumber: string
    name: string
    totalAmount: number
    currency: string
    organizationId: string
    items: Array<{
      id: string; name: string; productId: string | null; priceId: string | null
      unitAmount: number; totalAmount: number; quantity: number; billingType: string
      interval: string | null; intervalCount: number | null; trialDays: number | null
    }>
    lead: { id: string; firstName: string | null; lastName: string | null; email: string } | null
  },
  ctx: CheckoutContext
): Promise<InvoiceCheckoutResult> {
  /**
   * Build TransactionItems from invoice items.
   * Ad-hoc items (no product) use empty strings for productId/priceId since
   * TransactionItem schema requires non-nullable fields.
   */
  const transactionItems = invoice.items.map((item) => ({
    productId: item.productId ?? '',
    priceId: item.priceId ?? '',
    productName: item.name,
    productImage: null as string | null,
    priceName: item.productId ? 'Standard' : 'Custom',
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    totalAmount: item.totalAmount,
    billingType: item.billingType as BillingType,
  }))

  /** Create Transaction in AWAITING_PAYMENT status (skips in test mode) */
  const transactionId = await createCheckoutTransaction(ctx, {
    originalAmount: invoice.totalAmount,
    currency: invoice.currency,
    billingType: 'ONE_TIME' as BillingType,
    paymentStatus: 'AWAITING_PAYMENT',
    totalPayments: 1,
    items: transactionItems,
    extraMetadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    },
  })

  /** Calculate tier-specific platform fee (live mode only) */
  const applicationFeeAmount = ctx.paymentConfig.includeApplicationFee
    ? calculatePlatformFeeCents(invoice.totalAmount, ctx.tier)
    : undefined

  /** Build metadata using centralized utility for consistent webhook reconciliation */
  const metadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    transactionId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    organizationId: invoice.organizationId,
    source: 'invoice_payment',
    billingType: 'ONE_TIME',
    appliedTier: ctx.tier,
  })

  /** Create PaymentIntent on the connected account */
  const paymentIntent = await ctx.stripeInstance.paymentIntents.create(
    {
      amount: invoice.totalAmount,
      currency: invoice.currency,
      customer: ctx.stripeCustomer.id,
      description: `Invoice ${invoice.invoiceNumber} – ${invoice.name}`,
      automatic_payment_methods: { enabled: true },
      ...(applicationFeeAmount != null && { application_fee_amount: applicationFeeAmount }),
      metadata,
    },
    ctx.paymentConfig.stripeOptions
  )

  if (!paymentIntent.client_secret) {
    throw new Error('Failed to create payment: No client secret returned')
  }

  /** Link Transaction to PaymentIntent for webhook lookup */
  await linkTransactionToStripe(transactionId, { stripePaymentIntentId: paymentIntent.id })

  /** Link PaymentIntent to the Invoice record for webhook reconciliation */
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { stripePaymentIntentId: paymentIntent.id },
  })

  return {
    clientSecret: paymentIntent.client_secret,
    invoiceId: invoice.id,
    totalAmount: invoice.totalAmount,
    currency: invoice.currency,
    isTrial: false,
    type: 'payment_intent',
    transactionId: transactionId || undefined,
  }
}

/**
 * Subscription flow for invoices with RECURRING items (optionally mixed with ONE_TIME).
 *
 * Follows the same pattern as createCartSubscription():
 * - RECURRING items → subscription.items (billed every cycle)
 * - ONE_TIME items → add_invoice_items (charged on first invoice only)
 * - trial_period_days if any item has trialDays > 0
 *
 * Creates a Transaction and links it + the Invoice to the Subscription for
 * webhook reconciliation.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceSubscriptionHandler, InvoiceRecurringPayment
 */
async function processInvoiceSubscription(
  invoice: {
    id: string
    invoiceNumber: string
    name: string
    totalAmount: number
    currency: string
    organizationId: string
    items: Array<{
      id: string; name: string; productId: string | null; priceId: string | null
      unitAmount: number; totalAmount: number; quantity: number; billingType: string
      interval: string | null; intervalCount: number | null; trialDays: number | null
    }>
    lead: { id: string; firstName: string | null; lastName: string | null; email: string } | null
  },
  recurringItems: Array<{
    id: string; name: string; productId: string | null; priceId: string | null
    unitAmount: number; totalAmount: number; quantity: number; billingType: string
    interval: string | null; intervalCount: number | null; trialDays: number | null
  }>,
  oneTimeItems: Array<{
    id: string; name: string; productId: string | null; priceId: string | null
    unitAmount: number; totalAmount: number; quantity: number; billingType: string
    interval: string | null; intervalCount: number | null; trialDays: number | null
  }>,
  ctx: CheckoutContext,
  maxTrialDays: number
): Promise<InvoiceCheckoutResult> {
  /** Resolve Stripe prices for RECURRING items → subscription.items */
  const subscriptionItems: Stripe.SubscriptionCreateParams.Item[] = []
  for (const item of recurringItems) {
    const stripePriceId = await resolveInvoiceItemStripePrice(
      item, ctx.paymentConfig.effectiveAccountId, ctx.stripeInstance
    )
    subscriptionItems.push({ price: stripePriceId, quantity: item.quantity })
  }

  /** Resolve Stripe prices for ONE_TIME items → add_invoice_items (first invoice only) */
  const addInvoiceItems: Stripe.SubscriptionCreateParams.AddInvoiceItem[] = []
  for (const item of oneTimeItems) {
    const stripePriceId = await resolveInvoiceItemStripePrice(
      item, ctx.paymentConfig.effectiveAccountId, ctx.stripeInstance
    )
    addInvoiceItems.push({ price: stripePriceId, quantity: item.quantity })
  }

  /** Build TransactionItems from all invoice items */
  const transactionItems = invoice.items.map((item) => ({
    productId: item.productId ?? '',
    priceId: item.priceId ?? '',
    productName: item.name,
    productImage: null as string | null,
    priceName: item.productId ? 'Standard' : 'Custom',
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    totalAmount: item.totalAmount,
    billingType: item.billingType as BillingType,
    ...(item.billingType === 'RECURRING' && {
      interval: item.interval as BillingInterval | null,
      intervalCount: item.intervalCount,
    }),
  }))

  /** Create Transaction record — TRIALING if trial, else AWAITING_PAYMENT */
  const transactionId = await createCheckoutTransaction(ctx, {
    originalAmount: invoice.totalAmount,
    currency: invoice.currency,
    billingType: 'RECURRING' as BillingType,
    paymentStatus: maxTrialDays > 0 ? 'TRIALING' : 'AWAITING_PAYMENT',
    totalPayments: 0,
    trialDays: maxTrialDays > 0 ? maxTrialDays : null,
    items: transactionItems,
    extraMetadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    },
  })

  /** Platform fee as percentage for subscriptions (Stripe applies per-invoice) */
  const applicationFeePercent = ctx.paymentConfig.includeApplicationFee
    ? Math.round(ctx.feeConfig.percentage * 10000) / 100
    : undefined

  /** Build metadata for webhook reconciliation */
  const subscriptionMetadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    transactionId,
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    source: 'invoice_payment',
    billingType: 'RECURRING',
    appliedTier: ctx.tier,
    ...(maxTrialDays > 0 && { trialDays: String(maxTrialDays) }),
  })

  /** Build subscription params — incomplete payment for frontend confirmation */
  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: ctx.stripeCustomer.id,
    items: subscriptionItems,
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payments', 'pending_setup_intent'],
    ...(applicationFeePercent != null && { application_fee_percent: applicationFeePercent }),
    metadata: subscriptionMetadata,
  }

  /** Add trial period if any item has trialDays */
  if (maxTrialDays > 0) {
    subscriptionParams.trial_period_days = maxTrialDays
  }

  /** Add ONE_TIME items to first invoice if any */
  if (addInvoiceItems.length > 0) {
    subscriptionParams.add_invoice_items = addInvoiceItems
  }

  console.log(`[invoice-checkout-sub] Creating subscription: customer=${ctx.stripeCustomer.id}, recurring=${subscriptionItems.length}, oneTime=${addInvoiceItems.length}, trialDays=${maxTrialDays}`)
  const subscription = await ctx.stripeInstance.subscriptions.create(
    subscriptionParams, ctx.paymentConfig.stripeOptions
  )
  console.log(`[invoice-checkout-sub] Subscription created: ${subscription.id}, status=${subscription.status}`)

  /** Extract client secret — cancel subscription if extraction fails */
  let clientSecret: string
  let isTrial = false
  try {
    const result = await getSubscriptionClientSecret(
      subscription,
      ctx.paymentConfig.effectiveAccountId,
      'invoice subscription payment',
      ctx.stripeInstance
    )
    clientSecret = result.clientSecret
    isTrial = result.isTrial
    console.log(`[invoice-checkout-sub] Client secret extracted: isTrial=${isTrial}`)
  } catch (error) {
    console.error(`[invoice-checkout-sub] Failed to get client secret, canceling subscription ${subscription.id}:`, error)
    await ctx.stripeInstance.subscriptions.cancel(subscription.id, ctx.paymentConfig.stripeOptions)
    throw error
  }

  /** Link Transaction to Subscription for webhook lookup */
  await linkTransactionToStripe(transactionId, { stripeSubscriptionId: subscription.id })

  /** Link Subscription to Invoice for webhook reconciliation */
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { stripeSubscriptionId: subscription.id },
  })

  return {
    clientSecret,
    invoiceId: invoice.id,
    totalAmount: invoice.totalAmount,
    currency: invoice.currency,
    isTrial,
    type: 'subscription',
    transactionId: transactionId || undefined,
  }
}

/**
 * ONE_TIME trial flow for invoices — trialing subscription with cancel_at_period_end.
 *
 * Used when ALL items are ONE_TIME but at least one has trialDays > 0.
 * Creates a monthly recurring price, charges the total once after trial ends,
 * then auto-cancels via cancel_at_period_end: true.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceOneTimeTrialHandler, InvoiceTrialPayment
 */
async function processInvoiceOneTimeTrial(
  invoice: {
    id: string
    invoiceNumber: string
    name: string
    totalAmount: number
    currency: string
    organizationId: string
    items: Array<{
      id: string; name: string; productId: string | null; priceId: string | null
      unitAmount: number; totalAmount: number; quantity: number; billingType: string
      interval: string | null; intervalCount: number | null; trialDays: number | null
    }>
    lead: { id: string; firstName: string | null; lastName: string | null; email: string } | null
  },
  oneTimeItems: Array<{
    id: string; name: string; productId: string | null; priceId: string | null
    unitAmount: number; totalAmount: number; quantity: number; billingType: string
    interval: string | null; intervalCount: number | null; trialDays: number | null
  }>,
  ctx: CheckoutContext,
  maxTrialDays: number
): Promise<InvoiceCheckoutResult> {
  /**
   * Resolve a trial price for the invoice.
   * Single product-linked item → use getOrCreateStripeTrialPrice for deduplication.
   * Multiple items or ad-hoc → create inline bundle price for the total.
   */
  const trialStripePriceId = await resolveInvoiceTrialPrice(
    invoice, oneTimeItems, ctx.paymentConfig.effectiveAccountId, ctx.stripeInstance
  )

  /** Build TransactionItems from invoice items */
  const transactionItems = invoice.items.map((item) => ({
    productId: item.productId ?? '',
    priceId: item.priceId ?? '',
    productName: item.name,
    productImage: null as string | null,
    priceName: item.productId ? 'Standard' : 'Custom',
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    totalAmount: item.totalAmount,
    billingType: 'ONE_TIME' as BillingType,
  }))

  /** Create Transaction in TRIALING status */
  const transactionId = await createCheckoutTransaction(ctx, {
    originalAmount: invoice.totalAmount,
    currency: invoice.currency,
    billingType: 'ONE_TIME' as BillingType,
    paymentStatus: 'TRIALING',
    totalPayments: 1,
    trialDays: maxTrialDays,
    items: transactionItems,
    extraMetadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      isOneTimeTrial: 'true',
    },
  })

  /** Platform fee as percentage — applied when trial ends and Stripe charges */
  const applicationFeePercent = ctx.paymentConfig.includeApplicationFee
    ? Math.round(ctx.feeConfig.percentage * 10000) / 100
    : undefined

  /** Build metadata for webhook reconciliation */
  const trialMetadata = buildPaymentMetadata(ctx.testMode, ctx.connectedAccountId, {
    transactionId,
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    source: 'invoice_payment',
    billingType: 'ONE_TIME',
    isOneTimeTrial: 'true',
    appliedTier: ctx.tier,
    trialDays: String(maxTrialDays),
  })

  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: ctx.stripeCustomer.id,
    items: [{ price: trialStripePriceId }],
    trial_period_days: maxTrialDays,
    cancel_at_period_end: true,
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payments', 'pending_setup_intent'],
    ...(applicationFeePercent != null && { application_fee_percent: applicationFeePercent }),
    metadata: trialMetadata,
  }

  console.log(`[invoice-checkout-trial] Creating ONE_TIME trial subscription: customer=${ctx.stripeCustomer.id}, trialDays=${maxTrialDays}, feePercent=${applicationFeePercent}`)
  const subscription = await ctx.stripeInstance.subscriptions.create(
    subscriptionParams, ctx.paymentConfig.stripeOptions
  )
  console.log(`[invoice-checkout-trial] Subscription created: ${subscription.id}, status=${subscription.status}`)

  /** Extract SetupIntent client secret (trials always use SetupIntent) */
  let clientSecret: string
  try {
    const result = await getSubscriptionClientSecret(
      subscription,
      ctx.paymentConfig.effectiveAccountId,
      'invoice one-time trial',
      ctx.stripeInstance
    )
    clientSecret = result.clientSecret
    console.log(`[invoice-checkout-trial] Client secret extracted: isTrial=${result.isTrial}`)
  } catch (error) {
    console.error(`[invoice-checkout-trial] Failed to get client secret, canceling subscription ${subscription.id}:`, error)
    await ctx.stripeInstance.subscriptions.cancel(subscription.id, ctx.paymentConfig.stripeOptions)
    throw error
  }

  /** Link Transaction to Subscription */
  await linkTransactionToStripe(transactionId, { stripeSubscriptionId: subscription.id })

  /** Link Subscription to Invoice for webhook reconciliation */
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { stripeSubscriptionId: subscription.id },
  })

  return {
    clientSecret,
    invoiceId: invoice.id,
    totalAmount: invoice.totalAmount,
    currency: invoice.currency,
    isTrial: true,
    type: 'subscription',
    transactionId: transactionId || undefined,
  }
}

/**
 * Resolve a Stripe trial price for a ONE_TIME invoice with trial.
 *
 * Single product-linked item → uses getOrCreateStripeTrialPrice() for deduplication.
 * Multiple items or ad-hoc → creates an inline monthly bundle price for the total.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceTrialPriceResolution, InvoiceTrialBundlePrice
 */
async function resolveInvoiceTrialPrice(
  invoice: { id: string; invoiceNumber: string; totalAmount: number; currency: string },
  oneTimeItems: Array<{
    id: string; name: string; priceId: string | null; productId: string | null
    unitAmount: number; totalAmount: number; quantity: number; billingType: string
  }>,
  connectedAccountId: string | null,
  stripeInstance: Stripe
): Promise<string> {
  /**
   * Single product-linked item: use the standard trial price helper
   * for deduplication by mochiTrialPriceId metadata.
   */
  if (oneTimeItems.length === 1 && oneTimeItems[0].priceId && oneTimeItems[0].productId) {
    const item = oneTimeItems[0]
    const productPrice = await prisma.productPrice.findUnique({
      where: { id: item.priceId! },
      include: {
        product: { select: { id: true, name: true, description: true, imageUrl: true } },
      },
    })

    if (productPrice?.product) {
      const stripeProductId = await getOrCreateStripeProduct(
        connectedAccountId,
        productPrice.product,
        stripeInstance
      )

      return getOrCreateStripeTrialPrice(
        connectedAccountId,
        stripeProductId,
        {
          id: productPrice.id,
          name: productPrice.name,
          amount: productPrice.amount,
          currency: productPrice.currency,
        },
        stripeInstance
      )
    }
  }

  /**
   * Multiple items or ad-hoc: create a single monthly bundle price for the invoice total.
   * This aggregates all items into one subscription line item.
   */
  const stripeOptions = getConnectedAccountOptions(connectedAccountId)

  const bundleProduct = await stripeInstance.products.create(
    {
      name: `Invoice ${invoice.invoiceNumber}`,
      metadata: { source: 'invoice_trial_bundle', invoiceId: invoice.id },
    },
    stripeOptions
  )

  const trialPrice = await stripeInstance.prices.create(
    {
      product: bundleProduct.id,
      unit_amount: invoice.totalAmount,
      currency: invoice.currency,
      recurring: { interval: 'month', interval_count: 1 },
      nickname: `Invoice ${invoice.invoiceNumber} (trial)`,
      metadata: { source: 'invoice_trial_bundle', invoiceId: invoice.id },
    },
    stripeOptions
  )

  return trialPrice.id
}
