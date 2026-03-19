/**
 * Transaction Service (DAL)
 *
 * Data Access Layer for transaction operations.
 * This is the ONLY place that should interact with Prisma for transactions.
 *
 * Transactions track all payments including one-time, recurring, and installments.
 * tRPC routers call these functions after security checks.
 */

import 'server-only'
import { prisma, stripe } from '@/lib/config'
import { TransactionPaymentStatus, PaymentStatus, Prisma, BillingType } from '@/generated/prisma'
import { logActivity } from './activity-log.service'
import type {
  TransactionWithRelations,
  ListTransactionsResponse,
} from '@/types/transaction'
import type { PublicReceiptData } from '@/types/receipt'

// Re-export types for consumers
export type { TransactionWithRelations, ListTransactionsResponse }

// Prisma query result type (internal use)
type PrismaTransactionWithRelations = Prisma.TransactionGetPayload<{
  include: {
    lead: {
      select: {
        id: true
        firstName: true
        lastName: true
        email: true
        phone: true
        avatarUrl: true
        country: true
      }
    }
    items: true
    payments: {
      orderBy: { paymentNumber: 'asc' }
    }
  }
}>

// Convert Prisma result to our serialization-safe type
function toTransactionWithRelations(
  prismaTransaction: PrismaTransactionWithRelations
): TransactionWithRelations {
  return {
    ...prismaTransaction,
    metadata: prismaTransaction.metadata as Record<string, unknown> | null,
  }
}

export type ListTransactionsInput = {
  organizationId: string
  search?: string
  page?: number
  pageSize?: number
  paymentStatus?: TransactionPaymentStatus[]
  /** Filter by billing type (ONE_TIME, RECURRING, SPLIT_PAYMENT). SOURCE OF TRUTH: BillingTypeFilter */
  billingType?: BillingType
  leadId?: string
  productId?: string
  fromDate?: Date
  toDate?: Date
}

export type TransactionCreateInput = {
  organizationId: string
  leadId?: string
  originalAmount: number
  currency?: string
  billingType: 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT'
  paymentStatus?: TransactionPaymentStatus
  totalPayments?: number
  stripePaymentIntentId?: string
  stripeSubscriptionId?: string
  stripeCustomerId?: string
  paymentLinkId?: string
  /**
   * Groups transactions from the same cart checkout.
   * A mixed cart creates separate Transactions per billing group,
   * all sharing the same checkoutSessionId.
   * SOURCE OF TRUTH: CheckoutSessionGrouping
   */
  checkoutSessionId?: string
  metadata?: Record<string, unknown>
  items: {
    productId: string
    priceId: string
    productName: string
    productImage?: string | null
    priceName: string
    quantity?: number
    unitAmount: number
    totalAmount: number
    billingType: 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT'
    interval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | null
    intervalCount?: number | null
    installments?: number | null
  }[]
}

export type TransactionUpdateInput = {
  paymentStatus?: TransactionPaymentStatus
  paidAmount?: number
  successfulPayments?: number
  firstPaidAt?: Date | null
  lastPaidAt?: Date | null
  fullyPaidAt?: Date | null
  canceledAt?: Date | null
  refundedAt?: Date | null
  metadata?: Record<string, unknown>
}

// ============================================================================
// WEBHOOK NOTIFICATION HELPERS
// ============================================================================

/**
 * Look up a Transaction by its Stripe PaymentIntent ID and return
 * the organizationId, currency, and lead name for payment notifications.
 *
 * WHY: Webhook handlers need org/customer info after payment completion.
 * The completeTransaction/handleSubscriptionPayment functions return raw
 * Transaction records without the Lead relation included.
 *
 * SOURCE OF TRUTH KEYWORDS: TransactionNotificationLookup, WebhookPaymentNotification
 *
 * @param paymentIntentId - Stripe PaymentIntent ID to look up
 * @returns Object with organizationId, currency, and optional lead name fields, or null
 */
export async function findTransactionByPaymentIntentForNotification(paymentIntentId: string) {
  return await prisma.transaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: {
      organizationId: true,
      currency: true,
      lead: { select: { firstName: true, lastName: true } },
    },
  })
}

/**
 * Look up a Transaction by its Stripe Subscription ID and return
 * the organizationId, currency, and lead name for subscription payment notifications.
 *
 * WHY: Webhook handlers need org/customer info for subscription payment notifications
 * (covers RECURRING renewals and SPLIT_PAYMENT installments).
 *
 * SOURCE OF TRUTH KEYWORDS: SubscriptionNotificationLookup, WebhookSubscriptionNotification
 *
 * @param subscriptionId - Stripe Subscription ID to look up
 * @returns Object with organizationId, currency, and optional lead name fields, or null
 */
export async function findTransactionBySubscriptionForNotification(subscriptionId: string) {
  return await prisma.transaction.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: {
      organizationId: true,
      currency: true,
      lead: { select: { firstName: true, lastName: true } },
    },
  })
}

/**
 * Look up a Transaction by its Stripe Subscription ID to get just the transaction ID.
 *
 * WHY: Webhook handlers need to check if a subscription has an associated Transaction
 * record when the subscription metadata is missing. Used as a fallback in
 * customer.subscription.deleted events.
 *
 * SOURCE OF TRUTH KEYWORDS: TransactionSubscriptionLookup, WebhookSubscriptionFallback
 *
 * @param subscriptionId - Stripe Subscription ID to look up
 * @returns Object with transaction id, or null if not found
 */
export async function findTransactionIdBySubscriptionId(subscriptionId: string) {
  return await prisma.transaction.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  })
}

// ============================================================================
// LIST TRANSACTIONS
// ============================================================================

/**
 * List transactions with pagination, search, and filters
 */
export async function listTransactions(input: ListTransactionsInput) {
  const {
    organizationId,
    search,
    page = 1,
    pageSize = 10,
    paymentStatus,
    billingType,
    leadId,
    productId,
    fromDate,
    toDate,
  } = input

  // Build where clause
  const where: Prisma.TransactionWhereInput = {
    organizationId,
    ...(paymentStatus && paymentStatus.length > 0 && { paymentStatus: { in: paymentStatus } }),
    ...(billingType && { billingType }),
    ...(leadId && { leadId }),
    ...(productId && {
      items: {
        some: { productId },
      },
    }),
    ...(fromDate && { createdAt: { gte: fromDate } }),
    ...(toDate && { createdAt: { lte: toDate } }),
    ...(search && {
      OR: [
        { lead: { firstName: { contains: search, mode: 'insensitive' as const } } },
        { lead: { lastName: { contains: search, mode: 'insensitive' as const } } },
        { lead: { email: { contains: search, mode: 'insensitive' as const } } },
        { items: { some: { productName: { contains: search, mode: 'insensitive' as const } } } },
        { stripePaymentIntentId: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  // Get total count
  const total = await prisma.transaction.count({ where })

  // Get paginated transactions
  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          country: true,
        },
      },
      items: true,
      payments: {
        orderBy: { paymentNumber: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  // Get status counts for filters
  const statusCounts = await prisma.transaction.groupBy({
    by: ['paymentStatus'],
    where: { organizationId },
    _count: { paymentStatus: true },
  })

  const statusCountsMap = statusCounts.reduce(
    (acc, item) => {
      acc[item.paymentStatus] = item._count?.paymentStatus || 0
      return acc
    },
    {} as Record<string, number>
  )

  return {
    transactions: transactions.map(toTransactionWithRelations),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    statusCounts: statusCountsMap,
  }
}

// ============================================================================
// STRIPE WEBHOOK HELPERS (Subscription Resolution)
// ============================================================================
// Used by webhook-utils.ts to resolve transaction ID from Stripe subscription ID.
// SOURCE OF TRUTH KEYWORDS: FindTransactionBySubscription, SubscriptionTransactionLookup

/**
 * Find a transaction by its Stripe subscription ID.
 *
 * WHY: Stripe webhook renewal invoices often don't include metadata with the
 * transactionId. As a last-resort fallback (Tier 3), we look up the transaction
 * directly in the database by the Stripe subscription ID stored during creation.
 *
 * SOURCE OF TRUTH: FindTransactionByStripeSubscriptionId, WebhookTier3Fallback
 *
 * @param stripeSubscriptionId - The Stripe subscription ID to look up
 * @returns Transaction ID or null if not found
 */
export async function findTransactionByStripeSubscriptionId(
  stripeSubscriptionId: string
): Promise<{ id: string } | null> {
  return await prisma.transaction.findFirst({
    where: { stripeSubscriptionId },
    select: { id: true },
  })
}

// ============================================================================
// CHECKOUT SESSION GROUPING
// ============================================================================

/**
 * Get all transactions sharing the same checkoutSessionId.
 *
 * WHY: In the new transaction architecture, a mixed cart creates MULTIPLE
 * Transaction records (one per billing group) linked by checkoutSessionId.
 * This function retrieves all sibling transactions from the same checkout.
 *
 * SOURCE OF TRUTH KEYWORDS: CheckoutSessionGrouping, GetTransactionsByCheckoutSession
 *
 * @param checkoutSessionId - The shared checkout session identifier
 * @returns Array of transactions with their items, sorted by creation time
 */
export async function getTransactionsByCheckoutSession(
  checkoutSessionId: string
): Promise<TransactionWithRelations[]> {
  const transactions = await prisma.transaction.findMany({
    // checkoutSessionId: pending prisma generate
    where: { checkoutSessionId },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          country: true,
        },
      },
      items: true,
      payments: {
        orderBy: { paymentNumber: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Type assertion needed until prisma generate runs (checkoutSessionId in where breaks inference)
  return (transactions as unknown as PrismaTransactionWithRelations[]).map(toTransactionWithRelations)
}

// ============================================================================
// GET SINGLE TRANSACTION
// ============================================================================

/**
 * Get a single transaction by ID with all relations
 */
export async function getTransactionById(
  organizationId: string,
  transactionId: string
): Promise<TransactionWithRelations | null> {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      organizationId,
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          country: true,
        },
      },
      items: true,
      payments: {
        orderBy: { paymentNumber: 'asc' },
      },
    },
  })

  return transaction ? toTransactionWithRelations(transaction) : null
}

// ============================================================================
// CREATE TRANSACTION
// ============================================================================

/**
 * Create a new transaction with items
 *
 * @param input - Transaction creation data
 * @param userId - Optional user ID for activity logging
 */
export async function createTransaction(input: TransactionCreateInput, userId?: string) {
  const {
    organizationId,
    leadId,
    originalAmount,
    currency = 'usd',
    billingType,
    paymentStatus = 'AWAITING_PAYMENT',
    totalPayments = 1,
    stripePaymentIntentId,
    stripeSubscriptionId,
    stripeCustomerId,
    paymentLinkId,
    checkoutSessionId,
    metadata,
    items,
  } = input

  const transaction = await prisma.transaction.create({
    data: {
      organizationId,
      leadId,
      originalAmount,
      paidAmount: 0,
      refundedAmount: 0,
      currency,
      billingType,
      paymentStatus,
      totalPayments,
      successfulPayments: 0,
      stripePaymentIntentId,
      stripeSubscriptionId,
      stripeCustomerId,
      paymentLinkId,
      // checkoutSessionId: pending prisma generate
      checkoutSessionId,
      metadata: metadata as Prisma.InputJsonValue,
      items: {
        create: items.map((item) => ({
          productId: item.productId,
          priceId: item.priceId,
          productName: item.productName,
          productImage: item.productImage,
          priceName: item.priceName,
          quantity: item.quantity ?? 1,
          unitAmount: item.unitAmount,
          totalAmount: item.totalAmount,
          billingType: item.billingType,
          interval: item.interval,
          intervalCount: item.intervalCount,
          installments: item.installments,
        })),
      },
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          country: true,
        },
      },
      items: true,
      payments: {
        orderBy: { paymentNumber: 'asc' },
      },
    },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'transaction',
      entityId: transaction.id,
    })
  }

  return transaction
}

// ============================================================================
// UPDATE TRANSACTION
// ============================================================================

/**
 * Update a transaction
 *
 * @param organizationId - Organization ID for ownership verification and activity logging
 * @param transactionId - Transaction ID to update
 * @param data - Update data
 * @param userId - Optional user ID for activity logging
 */
export async function updateTransaction(
  organizationId: string,
  transactionId: string,
  data: TransactionUpdateInput,
  userId?: string
) {
  // Verify ownership
  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId },
  })

  if (!existing) {
    throw new Error('Transaction not found')
  }

  const transaction = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      ...data,
      metadata: data.metadata as Prisma.InputJsonValue,
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          country: true,
        },
      },
      items: true,
      payments: {
        orderBy: { paymentNumber: 'asc' },
      },
    },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'transaction',
      entityId: transaction.id,
    })
  }

  return transaction
}

// ============================================================================
// RECORD PAYMENT
// ============================================================================

/**
 * Record a payment against a transaction (for installments/recurring)
 */
export async function recordPayment(
  organizationId: string,
  transactionId: string,
  payment: {
    amount: number
    currency?: string
    status?: PaymentStatus
    paymentNumber: number
    stripePaymentIntentId?: string
    stripeInvoiceId?: string
    stripeChargeId?: string
    paidAt?: Date
    failedAt?: Date
    failureReason?: string
  }
) {
  // Verify ownership
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  // Create payment record
  const paymentRecord = await prisma.transactionPayment.create({
    data: {
      transactionId,
      amount: payment.amount,
      currency: payment.currency || transaction.currency,
      status: payment.status || 'PENDING',
      paymentNumber: payment.paymentNumber,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      stripeInvoiceId: payment.stripeInvoiceId,
      stripeChargeId: payment.stripeChargeId,
      paidAt: payment.paidAt,
      failedAt: payment.failedAt,
      failureReason: payment.failureReason,
    },
  })

  /**
   * Update transaction payment tracking if payment succeeded
   * NEW ARCHITECTURE: Update paidAmount and successfulPayments
   */
  if (payment.status === 'SUCCEEDED') {
    const newSuccessfulPayments = transaction.successfulPayments + 1
    const newPaidAmount = transaction.paidAmount + payment.amount
    const now = new Date()

    // Determine new payment status based on billing type
    let newPaymentStatus: TransactionPaymentStatus = transaction.paymentStatus
    let fullyPaidAt: Date | null = null

    if (transaction.billingType === 'ONE_TIME') {
      newPaymentStatus = 'PAID'
      fullyPaidAt = now
    } else if (transaction.billingType === 'SPLIT_PAYMENT') {
      if (newSuccessfulPayments >= transaction.totalPayments) {
        newPaymentStatus = 'PAID'
        fullyPaidAt = now
      } else {
        newPaymentStatus = 'PARTIALLY_PAID'
      }
    } else if (transaction.billingType === 'RECURRING') {
      newPaymentStatus = 'ACTIVE'
    }

    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        successfulPayments: newSuccessfulPayments,
        paidAmount: newPaidAmount,
        paymentStatus: newPaymentStatus,
        firstPaidAt: transaction.firstPaidAt || now,
        lastPaidAt: now,
        ...(fullyPaidAt && { fullyPaidAt }),
      },
    })
  }

  return paymentRecord
}

// ============================================================================
// UPDATE PAYMENT STATUS
// ============================================================================

/**
 * Update a payment status (e.g., from webhook)
 *
 * NEW ARCHITECTURE:
 * - Updates successfulPayments count and paidAmount on success
 * - Determines paymentStatus based on billingType
 * - Tracks payment timeline with firstPaidAt, lastPaidAt, fullyPaidAt
 */
export async function updatePaymentStatus(
  paymentId: string,
  data: {
    status: PaymentStatus
    paidAt?: Date
    failedAt?: Date
    failureReason?: string
  }
) {
  const payment = await prisma.transactionPayment.update({
    where: { id: paymentId },
    data,
    include: {
      transaction: true,
    },
  })

  // Update transaction counts and status based on successful payment
  if (data.status === 'SUCCEEDED') {
    const transaction = payment.transaction
    const newSuccessfulPayments = transaction.successfulPayments + 1
    const newPaidAmount = transaction.paidAmount + payment.amount
    const now = new Date()

    // Determine new payment status based on billing type
    let newPaymentStatus: TransactionPaymentStatus = transaction.paymentStatus
    let fullyPaidAt: Date | null = null

    if (transaction.billingType === 'ONE_TIME') {
      newPaymentStatus = 'PAID'
      fullyPaidAt = now
    } else if (transaction.billingType === 'SPLIT_PAYMENT') {
      if (newSuccessfulPayments >= transaction.totalPayments) {
        newPaymentStatus = 'PAID'
        fullyPaidAt = now
      } else {
        newPaymentStatus = 'PARTIALLY_PAID'
      }
    } else if (transaction.billingType === 'RECURRING') {
      newPaymentStatus = 'ACTIVE'
    }

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        successfulPayments: newSuccessfulPayments,
        paidAmount: newPaidAmount,
        paymentStatus: newPaymentStatus,
        firstPaidAt: transaction.firstPaidAt || now,
        lastPaidAt: now,
        ...(fullyPaidAt && { fullyPaidAt }),
      },
    })
  }

  return payment
}

// ============================================================================
// CANCEL TRANSACTION
// ============================================================================

/**
 * Cancel a transaction - handles ALL billing types properly
 *
 * This function:
 * - For ONE_TIME: Cancels the PaymentIntent with Stripe if still pending
 * - For RECURRING/SPLIT_PAYMENT: Cancels the Stripe subscription
 * - Updates local transaction status to CANCELED
 *
 * IMPORTANT: This is the unified cancel function that handles Stripe cancellation
 * for all payment types. Use this instead of just updating the local status.
 *
 * @param organizationId - Organization ID for ownership verification and activity logging
 * @param transactionId - Transaction ID to cancel
 * @param userId - Optional user ID for activity logging
 */
export async function cancelTransaction(
  organizationId: string,
  transactionId: string,
  userId?: string
) {
  // Get transaction with full details
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId },
    include: {
      items: true,
    },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  // Don't cancel already completed/canceled/disputed transactions
  if (['PAID', 'CANCELED', 'DISPUTED'].includes(transaction.paymentStatus)) {
    throw new Error(`Cannot cancel a transaction with status: ${transaction.paymentStatus}`)
  }

  // Get organization for connected account ID
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })

  if (!organization?.stripeConnectedAccountId) {
    throw new Error('Organization does not have a connected Stripe account')
  }

  const billingType = transaction.items[0]?.billingType

  // Handle cancellation based on billing type
  if (transaction.stripeSubscriptionId) {
    // RECURRING or SPLIT_PAYMENT with active subscription
    try {
      await stripe.subscriptions.cancel(transaction.stripeSubscriptionId, {
        stripeAccount: organization.stripeConnectedAccountId,
      })
    } catch (err) {
      // If subscription is already canceled on Stripe, continue
      const stripeError = err as { code?: string }
      if (stripeError.code !== 'resource_missing') {
        throw err
      }
    }
  } else if (transaction.stripePaymentIntentId && billingType === 'ONE_TIME') {
    // ONE_TIME payment - cancel the PaymentIntent if it's still cancelable
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        transaction.stripePaymentIntentId,
        { stripeAccount: organization.stripeConnectedAccountId }
      )

      // Only cancel if payment intent is in a cancelable state
      if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(paymentIntent.status)) {
        await stripe.paymentIntents.cancel(transaction.stripePaymentIntentId, {
          stripeAccount: organization.stripeConnectedAccountId,
        })
      }
      // If already succeeded, we can't cancel - would need to refund instead
      // If already canceled, no action needed
    } catch (err) {
      // If payment intent is already canceled or in invalid state, continue
      const stripeError = err as { code?: string }
      if (stripeError.code !== 'resource_missing' && stripeError.code !== 'payment_intent_unexpected_state') {
        console.error('[Transaction] Failed to cancel PaymentIntent:', err)
        // Don't throw - still update local status
      }
    }
  }

  // Update local transaction status
  const canceledTransaction = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      paymentStatus: 'CANCELED',
      canceledAt: new Date(),
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          country: true,
        },
      },
      items: true,
      payments: {
        orderBy: { paymentNumber: 'asc' },
      },
    },
  })

  // Log activity for audit trail (cancel is an update action)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'transaction',
      entityId: transactionId,
    })
  }

  return canceledTransaction
}

// ============================================================================
// CANCEL SUBSCRIPTION
// ============================================================================

/**
 * Cancel ALL Stripe subscriptions for a transaction, including sibling
 * transactions from the same checkout session.
 *
 * NEW ARCHITECTURE: Trial-split subscriptions now have their own Transaction
 * records linked via checkoutSessionId. Instead of reading subscription IDs
 * from metadata, we find all sibling transactions and cancel their
 * subscriptions too.
 *
 * Flow:
 * 1. Cancel the main subscription via `cancelTransaction()` (handles Stripe + local status)
 * 2. Find sibling transactions via checkoutSessionId
 * 3. Cancel all sibling subscription transactions in parallel
 *
 * SOURCE OF TRUTH: CheckoutSessionGrouping, SubscriptionCancellationAll
 */
export async function cancelSubscription(
  organizationId: string,
  transactionId: string
) {
  // Validate it has a subscription before calling unified cancel
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  if (!transaction.stripeSubscriptionId) {
    throw new Error('Transaction does not have an active subscription')
  }

  // Cancel the main subscription via the unified cancel function
  const result = await cancelTransaction(organizationId, transactionId)

  /**
   * Find and cancel sibling subscription transactions via checkoutSessionId.
   * Each sibling is a separate Transaction with its own stripeSubscriptionId
   * (e.g., trial-split subscriptions from the same cart checkout).
   *
   * SOURCE OF TRUTH: CheckoutSessionGrouping, SiblingSubscriptionCancellation
   */
  // checkoutSessionId: pending prisma generate
  const checkoutSessionId = (transaction as Record<string, unknown>).checkoutSessionId as string | null
  if (checkoutSessionId) {
    const siblings = await prisma.transaction.findMany({
      // checkoutSessionId: pending prisma generate
      where: {
        checkoutSessionId,
        id: { not: transactionId },
        stripeSubscriptionId: { not: null },
        paymentStatus: { notIn: ['PAID', 'CANCELED'] },
      },
    })

    if (siblings.length > 0) {
      /** Cancel all sibling subscription transactions in parallel */
      await Promise.allSettled(
        siblings.map(async (sibling) => {
          try {
            await cancelTransaction(organizationId, sibling.id)
          } catch (err) {
            console.error(`[Transaction] Failed to cancel sibling transaction ${sibling.id}:`, err)
          }
        })
      )
    }
  }

  return result
}

// ============================================================================
// GET TRANSACTION STATS
// ============================================================================

/**
 * Get transaction statistics for an organization
 *
 * NEW ARCHITECTURE:
 * - Uses paidAmount for revenue calculations (actual money received)
 * - Groups by paymentStatus instead of status
 * - Revenue calculation: paidAmount - refundedAmount = net revenue
 */
export async function getTransactionStats(organizationId: string) {
  const [totalRevenue, statusBreakdown, recentTransactions] = await Promise.all([
    // Total revenue (sum of paidAmount - refundedAmount)
    prisma.transaction.aggregate({
      where: {
        organizationId,
      },
      _sum: {
        paidAmount: true,
        refundedAmount: true,
      },
    }),
    // Status breakdown
    prisma.transaction.groupBy({
      by: ['paymentStatus'],
      where: { organizationId },
      _count: { paymentStatus: true },
      _sum: {
        paidAmount: true,
        refundedAmount: true,
      },
    }),
    // Recent transactions count (last 30 days)
    prisma.transaction.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ])

  // Calculate net revenue (paid - refunded)
  const netRevenue = (totalRevenue._sum.paidAmount || 0) - (totalRevenue._sum.refundedAmount || 0)

  return {
    totalRevenue: netRevenue,
    statusBreakdown: statusBreakdown.map((item) => ({
      status: item.paymentStatus,
      count: item._count.paymentStatus || 0,
      totalAmount: (item._sum.paidAmount || 0) - (item._sum.refundedAmount || 0),
    })),
    recentTransactionsCount: recentTransactions,
  }
}

// ============================================================================
// GET TRANSACTIONS FOR LEAD
// ============================================================================

/**
 * Get all transactions for a specific lead
 */
export async function getTransactionsForLead(
  organizationId: string,
  leadId: string
) {
  return await prisma.transaction.findMany({
    where: {
      organizationId,
      leadId,
    },
    include: {
      items: true,
      payments: {
        orderBy: { paymentNumber: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get transactions for a lead with cursor-based pagination.
 * Returns items + nextCursor for infinite scroll.
 *
 * Uses the limit+1 pattern: fetches one extra record to determine if there
 * are more pages without running a separate count query.
 *
 * Maps through toTransactionWithRelations to produce serialization-safe types
 * and break the deep Prisma inference chain (prevents "excessively deep" TS errors
 * when tRPC infers the return type through useInfiniteQuery).
 *
 * SOURCE OF TRUTH: TransactionLeadPaginated, InfiniteTransactions
 */
export async function getTransactionsForLeadPaginated(
  organizationId: string,
  leadId: string,
  limit: number,
  cursor?: string | null
): Promise<{ items: TransactionWithRelations[]; nextCursor: string | undefined }> {
  const transactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      leadId,
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          country: true,
        },
      },
      items: true,
      payments: {
        orderBy: { paymentNumber: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Fetch one extra to determine hasMore
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  /** If we got more records than the limit, there are more pages */
  const hasMore = transactions.length > limit
  const raw = hasMore ? transactions.slice(0, limit) : transactions
  const nextCursor = hasMore ? raw[raw.length - 1].id : undefined

  return { items: raw.map(toTransactionWithRelations), nextCursor }
}

// ============================================================================
// REFUND OPERATIONS
// ============================================================================

/**
 * Refund an entire transaction (for ONE_TIME payments)
 * Creates a Stripe refund for the payment intent
 */
export async function refundTransaction(
  organizationId: string,
  transactionId: string,
  amount?: number, // Optional partial refund amount in cents
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
) {
  // Get transaction
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  if (!transaction.stripePaymentIntentId) {
    throw new Error('No payment intent found for this transaction')
  }

  // Get organization's Stripe Connect account
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })

  if (!organization?.stripeConnectedAccountId) {
    throw new Error('No Stripe Connect account found for this organization')
  }

  // Create refund in Stripe
  const refund = await stripe.refunds.create(
    {
      payment_intent: transaction.stripePaymentIntentId,
      amount, // If undefined, refunds full amount
      reason: reason || 'requested_by_customer',
    },
    { stripeAccount: organization.stripeConnectedAccountId }
  )

  // Webhook will handle updating the transaction status
  return refund
}

/**
 * Refund a specific payment in a subscription/installment plan
 * Creates a Stripe refund for the charge associated with the invoice
 */
export async function refundPayment(
  organizationId: string,
  transactionId: string,
  paymentId: string,
  amount?: number, // Optional partial refund amount in cents
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
) {
  // Get payment
  const payment = await prisma.transactionPayment.findFirst({
    where: {
      id: paymentId,
      transactionId,
    },
  })

  if (!payment) {
    throw new Error('Payment not found')
  }

  if (payment.status !== 'SUCCEEDED') {
    throw new Error('Can only refund successful payments')
  }

  /**
   * Get organization's Stripe Connect account for refund processing
   */
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })

  if (!organization?.stripeConnectedAccountId) {
    throw new Error('No Stripe Connect account found for this organization')
  }

  /**
   * NEW ARCHITECTURE: stripeChargeId is stored on the payment record
   * during webhook processing (both ONE_TIME and subscription payments).
   * This is set when we receive payment_intent.succeeded or invoice.paid events.
   */
  if (!payment.stripeChargeId) {
    throw new Error('No charge ID found for this payment. Payment may not have been processed yet.')
  }

  const chargeId = payment.stripeChargeId

  // Create refund for the charge in Stripe
  const refund = await stripe.refunds.create(
    {
      charge: chargeId,
      amount, // If undefined, refunds full amount
      reason: reason || 'requested_by_customer',
    },
    { stripeAccount: organization.stripeConnectedAccountId }
  )

  // DO NOT update payment status here - webhook will handle it
  // This ensures Stripe is the source of truth and prevents data inconsistencies
  // The charge.refunded webhook will update the payment and transaction status
  return refund
}

// ============================================================================
// PUBLIC RECEIPT
// ============================================================================

/**
 * Get public receipt data for a specific payment.
 *
 * PUBLIC ENDPOINT — no organization check. The payment ID (CUID) is
 * effectively unguessable (128-bit entropy) and serves as the access token.
 *
 * WHY: Allow customers to view payment receipts via shareable links.
 * HOW: Fetches payment + parent transaction items, strips all sensitive data.
 *
 * SECURITY:
 * - Only returns data for SUCCEEDED payments (no receipts for pending/failed)
 * - Zero PII in output (no emails, phones, names, Stripe IDs)
 * - Read-only — no mutations possible
 *
 * @param paymentId - TransactionPayment.id (CUID)
 * @returns Sanitized PublicReceiptData or null if not found / not paid
 *
 * SOURCE OF TRUTH KEYWORDS: getPublicReceiptData, PublicReceiptService
 */
export async function getPublicReceiptData(
  paymentId: string
): Promise<PublicReceiptData | null> {
  /** Fetch payment with parent transaction, items, and linked invoice in a single query */
  const payment = await prisma.transactionPayment.findUnique({
    where: { id: paymentId },
    include: {
      transaction: {
        include: {
          items: true,
        },
      },
      invoice: {
        select: { accessToken: true },
      },
    },
  })

  /* Payment not found */
  if (!payment) return null

  /* Only show receipts for successful payments */
  if (payment.status !== 'SUCCEEDED') return null

  /**
   * Cast to include the invoice relation which may not be in the generated types yet.
   * The `invoice` relation was just added to TransactionPayment in the Prisma schema.
   */
  const paymentData = payment as typeof payment & { invoice?: { accessToken: string | null } | null }

  /**
   * Build sanitized receipt data.
   * Maps every field explicitly — no spread operators that could leak fields.
   */
  return {
    paymentId: payment.id,
    paymentNumber: payment.paymentNumber,
    paidAt: payment.paidAt,
    amount: payment.amount,
    refundedAmount: payment.refundedAmount,
    currency: payment.currency,
    billingType: payment.transaction.billingType,
    totalPayments: payment.transaction.totalPayments,
    items: payment.transaction.items.map((item) => ({
      productName: item.productName,
      productImage: item.productImage,
      priceName: item.priceName,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      totalAmount: item.totalAmount,
      billingType: item.billingType,
      interval: item.interval,
      intervalCount: item.intervalCount,
    })),
    createdAt: payment.createdAt,
    /** Access token for the linked invoice, null if no invoice has been generated yet */
    invoiceAccessToken: paymentData.invoice?.accessToken ?? null,
  }
}

/**
 * Get receipt data by transaction ID.
 *
 * PUBLIC ENDPOINT — no organization check. Transaction IDs are CUIDs with
 * 128-bit cryptographic entropy, making them effectively unguessable.
 *
 * WHY: The receipt element on published pages uses `transactionId` from URL
 * search params to fetch receipt data. Unlike `getPublicReceiptData` which
 * takes a paymentId, this resolves the LATEST SUCCEEDED payment for the
 * given transaction — so customers always see their most recent payment.
 *
 * HOW: Finds the latest succeeded TransactionPayment for the transaction,
 * then strips all sensitive data using the same sanitization as getPublicReceiptData.
 *
 * SECURITY:
 * - Only returns data for SUCCEEDED payments (no receipts for pending/failed)
 * - Zero PII in output (no emails, phones, names, Stripe IDs)
 * - Read-only — no mutations possible
 * - Returns null if no succeeded payment found yet (webhook may be pending)
 *
 * @param transactionId - Transaction.id (CUID)
 * @returns Sanitized PublicReceiptData or null if not found / no succeeded payment
 *
 * SOURCE OF TRUTH KEYWORDS: getReceiptByTransaction, ReceiptByTransactionService
 */
export async function getReceiptByTransaction(
  transactionId: string
): Promise<PublicReceiptData | null> {
  /**
   * Find the LATEST succeeded payment for this transaction.
   * Orders by paidAt descending so the most recent successful payment is returned.
   * Includes parent transaction items and linked invoice for the receipt.
   */
  const payment = await prisma.transactionPayment.findFirst({
    where: {
      transactionId,
      status: 'SUCCEEDED',
    },
    orderBy: { paidAt: 'desc' },
    include: {
      transaction: {
        include: {
          items: true,
        },
      },
      invoice: {
        select: { accessToken: true },
      },
    },
  })

  /* No succeeded payment found — webhook may still be pending */
  if (!payment) return null

  /**
   * Cast to include the invoice relation which may not be in the generated types yet.
   * Same cast pattern used in getPublicReceiptData above.
   */
  const paymentData = payment as typeof payment & { invoice?: { accessToken: string | null } | null }

  /**
   * Build sanitized receipt data.
   * Maps every field explicitly — no spread operators that could leak fields.
   */
  return {
    paymentId: payment.id,
    paymentNumber: payment.paymentNumber,
    paidAt: payment.paidAt,
    amount: payment.amount,
    refundedAmount: payment.refundedAmount,
    currency: payment.currency,
    billingType: payment.transaction.billingType,
    totalPayments: payment.transaction.totalPayments,
    items: payment.transaction.items.map((item) => ({
      productName: item.productName,
      productImage: item.productImage,
      priceName: item.priceName,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      totalAmount: item.totalAmount,
      billingType: item.billingType,
      interval: item.interval,
      intervalCount: item.intervalCount,
    })),
    createdAt: payment.createdAt,
    /** Access token for the linked invoice, null if no invoice has been generated yet */
    invoiceAccessToken: paymentData.invoice?.accessToken ?? null,
  }
}

