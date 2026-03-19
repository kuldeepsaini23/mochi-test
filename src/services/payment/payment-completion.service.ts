/**
 * ============================================================================
 * PAYMENT COMPLETION SERVICE
 * ============================================================================
 *
 * SOURCE OF TRUTH: PaymentCompletionService, TransactionLifecycle,
 * SubscriptionPaymentHandling, ChargebackHandling
 *
 * Handles the lifecycle of payment transactions after Stripe webhook events:
 * - ONE_TIME: completeTransaction / failTransaction
 * - RECURRING/SPLIT_PAYMENT: handleSubscriptionPayment / handleSubscriptionPaymentFailed
 * - Cancellation: handleSubscriptionCanceled
 * - Disputes: handleChargeback
 * - Charge backfill: backfillChargeId
 *
 * These functions are called by webhook handlers:
 * - /api/stripe/connect-webhook (live mode)
 * - /api/stripe/webhook (test mode, via platform webhook)
 * - invoice.service.ts (invoice payment completion)
 *
 * ============================================================================
 */

import 'server-only'
import { prisma, stripe } from '@/lib/config'
import { BILLING_TYPES } from '@/constants/billing'
import {
  decrementInventoryForOrder,
} from '@/services/inventory.service'
import { createOrder } from '@/services/order.service'
import { realtime } from '@/lib/realtime'
import {
  classifySubscriptionEvent,
  dispatchSubscriptionTriggers,
  firePerProductPaymentTriggers,
  fireSubscriptionCancelledTriggers,
} from '@/services/payment/payment-triggers.service'
import { firePaymentNotification, formatPaymentAmount } from '@/lib/stripe/webhook-utils'

// ============================================================================
// ONE_TIME PAYMENT HANDLERS
// ============================================================================

/**
 * Complete a ONE_TIME payment transaction
 * Called when: payment_intent.succeeded (with our transactionId metadata)
 *
 * NEW ARCHITECTURE:
 * - Sets paymentStatus to PAID (instead of old COMPLETED status)
 * - Updates paidAmount with Stripe's amount (source of truth)
 * - Sets fullyPaidAt timestamp
 * - Increments successfulPayments count
 */
export async function completeTransaction(
  paymentIntentId: string,
  stripeAmount: number,
  stripeChargeId?: string
) {
  /**
   * IDEMPOTENCY CHECK: Prevent duplicate payment processing
   * For 3DS payments, Stripe may send multiple webhook events
   * Check if we've already processed this payment intent
   */
  console.log(`🔔 [NOTIF-DEBUG] completeTransaction ENTERED — PI=${paymentIntentId}, amount=${stripeAmount}`)

  const existingPayment = await prisma.transactionPayment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { transaction: true },
  })

  if (existingPayment) {
    console.log(`🔔 [NOTIF-DEBUG] completeTransaction IDEMPOTENCY HIT — PI=${paymentIntentId} already processed, returning early (NO notification)`)
    return existingPayment.transaction
  }

  const transaction = await prisma.transaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    include: {
      items: true, // Include items for inventory decrement
    },
  })

  if (!transaction) return null
  console.log(`🔔 [NOTIF-DEBUG] completeTransaction PROCESSING — txn=${transaction.id}, items=${transaction.items.length}, org=${transaction.organizationId}`)

  /**
   * Update transaction with new architecture:
   * - paymentStatus: PAID (all payments completed for ONE_TIME)
   * - paidAmount: Total paid (equals stripeAmount for ONE_TIME)
   * - fullyPaidAt: Timestamp when fully paid
   * - successfulPayments: Number of successful payments (1 for ONE_TIME)
   * - firstPaidAt/lastPaidAt: Track payment timeline
   */
  const now = new Date()
  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      paymentStatus: 'PAID',
      paidAmount: stripeAmount,
      successfulPayments: 1,
      firstPaidAt: now,
      lastPaidAt: now,
      fullyPaidAt: now,
    },
  })

  /**
   * INVENTORY MANAGEMENT:
   * Decrement inventory for each item in the transaction
   * This is called after successful payment to reduce stock levels
   */
  if (transaction.items.length > 0) {
    await decrementInventoryForOrder(
      transaction.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      transaction.id,
      transaction.organizationId
    )
  }

  // Increment lead CLTV by Stripe's amount (source of truth)
  if (transaction.leadId) {
    await prisma.lead.update({
      where: { id: transaction.leadId },
      data: {
        cltv: { increment: stripeAmount / 100 },
        status: 'ACTIVE',
        lastActivityAt: now,
      },
    })
  }

  /**
   * Create TransactionPayment record with stripeChargeId for refund tracking
   * The stripeChargeId allows us to look up this payment when refund webhooks arrive
   */
  await prisma.transactionPayment.create({
    data: {
      transactionId: transaction.id,
      amount: stripeAmount, // Use Stripe's amount, not our DB amount
      currency: transaction.currency,
      status: 'SUCCEEDED',
      paymentNumber: 1,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: stripeChargeId, // For refund webhook lookups
      paidAt: now,
    },
  })

  /**
   * Emit realtime event so the receipt element on the confirmation page
   * can fetch the receipt data instantly instead of polling.
   * Fire-and-forget — failure here should never block payment completion.
   */
  realtime
    .emit('payments.completed', {
      organizationId: transaction.organizationId,
      transactionId: transaction.id,
    })
    .catch(() => {})

  /**
   * PAYMENT NOTIFICATION — ONE per checkout, regardless of item count.
   * SOURCE OF TRUTH: OneNotificationPerCheckout
   *
   * Fires here (inside completeTransaction) instead of in the webhook handler so:
   * 1. It's protected by the idempotency check (existingPayment guard above)
   * 2. It fires exactly ONCE per transaction — not per product, not per webhook retry
   * 3. It has direct access to transaction data (no resolution/lookup needed)
   *
   * The per-product automation triggers below fire SEPARATELY for product-specific
   * automation matching (email sequences, tag updates, etc.). Those are automation
   * actions — not payment notifications.
   */
  if (transaction.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: transaction.leadId },
      select: { firstName: true, lastName: true },
    })
    const customerName = lead
      ? [lead.firstName, lead.lastName].filter(Boolean).join(' ') || undefined
      : undefined
    const formattedAmount = formatPaymentAmount(stripeAmount, transaction.currency)
    console.log(`🔔 [NOTIF-DEBUG] completeTransaction: about to fire notification for txn=${transaction.id}, PI=${paymentIntentId}, items=${transaction.items.length}`)
    firePaymentNotification(transaction.organizationId, formattedAmount, customerName, '[payment]')
  }

  /**
   * Fire per-product automation triggers for each item in the transaction.
   * Each product/price gets its own trigger so product-specific automations match.
   */
  console.log(`🔔 [NOTIF-DEBUG] completeTransaction: about to fire per-product triggers for txn=${transaction.id}, items=${transaction.items.length}`)
  await firePerProductPaymentTriggers(transaction, stripeAmount, false)

  /**
   * ORDER CREATION FOR CART CHECKOUT
   * SOURCE OF TRUTH: CartCheckoutOrderCreation
   *
   * Create an Order for e-commerce cart checkouts when payment succeeds.
   * Only create Order if this is a cart checkout (identified by metadata.source).
   * Order starts as CONFIRMED (payment received) and UNFULFILLED.
   */
  const metadata = transaction.metadata as Record<string, unknown> | null
  const isCartCheckout = metadata?.source === 'cart_checkout'

  if (isCartCheckout) {
    // Check if order already exists for this transaction (idempotency)
    const existingOrder = await prisma.order.findUnique({
      where: { transactionId: transaction.id },
    })

    if (!existingOrder) {
      await createOrder({
        organizationId: transaction.organizationId,
        transactionId: transaction.id,
        status: 'CONFIRMED', // Payment received, ready for fulfillment
        fulfillmentStatus: 'UNFULFILLED',
        metadata: {
          createdFrom: 'cart_checkout',
          customerEmail: metadata?.customerEmail,
          customerName: metadata?.customerName,
          checkoutSessionId: (transaction as Record<string, unknown>).checkoutSessionId,
        },
      })
    }
  }

  return updated
}

/**
 * Fail a ONE_TIME payment transaction
 * Called when: payment_intent.payment_failed (with our transactionId metadata)
 *
 * NEW ARCHITECTURE:
 * - Sets paymentStatus to FAILED (payment lifecycle state)
 * - Creates TransactionPayment record with FAILED status for audit trail
 */
export async function failTransaction(paymentIntentId: string, failureReason?: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  })

  if (!transaction) return null

  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: { paymentStatus: 'FAILED' },
  })

  const paymentCount = await prisma.transactionPayment.count({
    where: { transactionId: transaction.id },
  })

  await prisma.transactionPayment.create({
    data: {
      transactionId: transaction.id,
      amount: transaction.originalAmount,
      currency: transaction.currency,
      status: 'FAILED',
      paymentNumber: paymentCount + 1,
      stripePaymentIntentId: paymentIntentId,
      failedAt: new Date(),
      failureReason,
    },
  })

  return updated
}

// ============================================================================
// SUBSCRIPTION PAYMENT HANDLERS
// ============================================================================

/**
 * Handle successful RECURRING or SPLIT_PAYMENT invoice payment
 * Called when: invoice.payment_succeeded (subscription invoices only)
 *
 * NEW ARCHITECTURE:
 * - For RECURRING: Sets paymentStatus to ACTIVE (ongoing subscription)
 * - For SPLIT_PAYMENT: PARTIALLY_PAID until all installments paid, then PAID
 * - Updates paidAmount with cumulative total from Stripe
 * - Tracks firstPaidAt, lastPaidAt, fullyPaidAt timestamps
 * - Uses Stripe invoice amount as source of truth
 * - IDEMPOTENT: Uses stripeInvoiceId to prevent duplicate payment records
 */
export async function handleSubscriptionPayment(
  subscriptionId: string,
  invoiceId: string,
  paymentIntentId: string | undefined,
  stripeInvoiceAmount: number,
  stripeChargeId?: string,
  connectedAccountId?: string,
  /** Fallback transaction ID from webhook resolver — used for trial-split subscriptions
   * SOURCE OF TRUTH: CartTrialSplitWebhookFallback */
  resolvedTransactionId?: string,
  /**
   * Stripe invoice billing_reason — critical for distinguishing mixed cart first invoice
   * (subscription_create) from post-trial first real payment (subscription_cycle).
   * Without this, TRIAL_STARTED would incorrectly fire on post-trial payments because
   * successfulPayments === 0 in both cases (trial $0 invoices don't increment it).
   * SOURCE OF TRUTH: BillingReasonTrialGuard
   */
  billingReason?: string
) {
  /**
   * IDEMPOTENCY CHECK: Prevent duplicate payment processing
   * For 3DS payments, Stripe may send multiple webhook events
   * Check if we've already processed this invoice
   */
  const existingPayment = await prisma.transactionPayment.findUnique({
    where: { stripeInvoiceId: invoiceId },
    include: { transaction: true },
  })

  if (existingPayment) {
    return existingPayment.transaction
  }

  let transaction = await prisma.transaction.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    include: {
      items: true, // Include items for inventory decrement on first payment
    },
  })

  /**
   * Fallback: When a trial-split subscription fires its first invoice (after trial ends),
   * its subscription ID is NOT stored in Transaction.stripeSubscriptionId (only the main
   * subscription's ID is). The webhook resolver found the transactionId via Stripe metadata
   * (Tier 1/2), so we use it as a fallback lookup.
   *
   * SOURCE OF TRUTH: CartTrialSplitWebhookFallback
   */
  if (!transaction && resolvedTransactionId) {
    transaction = await prisma.transaction.findUnique({
      where: { id: resolvedTransactionId },
      include: {
        items: true,
      },
    })
  }

  if (!transaction) return null

  /**
   * CLASSIFY THE INVOICE: Determine what kind of subscription event this is.
   * This is the SINGLE decision point for all trigger routing — no scattered boolean flags.
   * SOURCE OF TRUTH: SubscriptionEventType, PaymentTriggerClassification
   */
  const eventType = classifySubscriptionEvent(
    stripeInvoiceAmount,
    transaction.trialDays,
    transaction.successfulPayments,
    billingReason
  )
  const isTrialInvoice = eventType === 'TRIAL_INVOICE'

  const newSuccessfulPayments = isTrialInvoice
    ? transaction.successfulPayments
    : transaction.successfulPayments + 1
  const totalInstallments = transaction.totalPayments
  const billingType = transaction.billingType
  const newPaidAmount = transaction.paidAmount + stripeInvoiceAmount

  /**
   * isFirstRealCharge: True when this is the first time real money is collected.
   * Used ONLY for inventory decrement and order creation — NOT for trigger routing.
   * Trigger routing uses eventType via dispatchSubscriptionTriggers().
   */
  const isFirstRealCharge =
    eventType === 'FIRST_PAYMENT' ||
    eventType === 'MIXED_CART_WITH_TRIAL' ||
    eventType === 'POST_TRIAL_FIRST_CHARGE'

  /**
   * Determine payment status based on billing type and trial state:
   * - Trial invoice ($0): Keep TRIALING — no real charge occurred
   * - RECURRING: ACTIVE (ongoing subscription, no end date)
   * - SPLIT_PAYMENT: PARTIALLY_PAID until all installments paid, then PAID
   */
  let paymentStatus: 'ACTIVE' | 'PAID' | 'PARTIALLY_PAID' | 'TRIALING' = 'ACTIVE'
  let fullyPaidAt: Date | null = null

  if (isTrialInvoice) {
    paymentStatus = 'TRIALING'
  } else if (billingType === BILLING_TYPES.SPLIT_PAYMENT && totalInstallments > 0) {
    if (newSuccessfulPayments >= totalInstallments) {
      paymentStatus = 'PAID'
      fullyPaidAt = new Date()
    } else {
      paymentStatus = 'PARTIALLY_PAID'
    }
  } else if (billingType === BILLING_TYPES.RECURRING) {
    paymentStatus = 'ACTIVE'
  }

  const now = new Date()
  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      paymentStatus,
      paidAmount: newPaidAmount,
      successfulPayments: newSuccessfulPayments,
      /** Don't set firstPaidAt/lastPaidAt for $0 trial invoices — no real payment occurred */
      firstPaidAt: isTrialInvoice ? transaction.firstPaidAt : (transaction.firstPaidAt || now),
      lastPaidAt: isTrialInvoice ? transaction.lastPaidAt : now,
      fullyPaidAt: fullyPaidAt || transaction.fullyPaidAt,
    },
  })

  /**
   * Increment lead CLTV by Stripe's invoice amount.
   * Skip for $0 trial invoices — no money was actually collected.
   */
  if (!isTrialInvoice && transaction.leadId) {
    await prisma.lead.update({
      where: { id: transaction.leadId },
      data: {
        cltv: { increment: stripeInvoiceAmount / 100 },
        lastActivityAt: now,
      },
    })
  }

  /**
   * Create TransactionPayment record with stripeChargeId for refund tracking
   */
  await prisma.transactionPayment.create({
    data: {
      transactionId: transaction.id,
      amount: stripeInvoiceAmount,
      currency: transaction.currency,
      status: 'SUCCEEDED',
      paymentNumber: newSuccessfulPayments,
      stripePaymentIntentId: paymentIntentId,
      stripeInvoiceId: invoiceId,
      stripeChargeId: stripeChargeId, // For refund webhook lookups
      paidAt: now,
    },
  })

  /**
   * Emit realtime event so the receipt element on the confirmation page
   * can fetch the receipt data instantly instead of polling.
   * Fire-and-forget — failure here should never block payment completion.
   */
  realtime
    .emit('payments.completed', {
      organizationId: transaction.organizationId,
      transactionId: transaction.id,
    })
    .catch(() => {})

  /**
   * PAYMENT NOTIFICATION — ONE per subscription payment, regardless of item count.
   * SOURCE OF TRUTH: OneNotificationPerCheckout
   *
   * Same pattern as completeTransaction(): fires inside the idempotent function
   * so it never duplicates. Covers RECURRING renewals, SPLIT_PAYMENT installments,
   * and first charges. Trial $0 invoices skip (no money charged).
   */
  if (!isTrialInvoice && transaction.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: transaction.leadId },
      select: { firstName: true, lastName: true },
    })
    const customerName = lead
      ? [lead.firstName, lead.lastName].filter(Boolean).join(' ') || undefined
      : undefined
    const formattedAmount = formatPaymentAmount(stripeInvoiceAmount, transaction.currency)
    firePaymentNotification(transaction.organizationId, formattedAmount, customerName, '[payment]')
  }

  /**
   * DISPATCH TRIGGERS: Route to correct automation triggers based on classified event type.
   * All trigger routing logic lives in dispatchSubscriptionTriggers() — no boolean flags here.
   * SOURCE OF TRUTH: PaymentTriggerDispatch
   */
  await dispatchSubscriptionTriggers(eventType, transaction, stripeInvoiceAmount, newSuccessfulPayments)

  /**
   * INVENTORY MANAGEMENT:
   * Decrement inventory on the FIRST real charge only.
   * Renewals don't decrement — the order was already placed.
   * Trial invoices ($0) don't decrement — no purchase yet.
   */
  if (isFirstRealCharge && transaction.items.length > 0) {
    await decrementInventoryForOrder(
      transaction.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      transaction.id,
      transaction.organizationId
    )
  }

  /**
   * ORDER CREATION FOR CART CHECKOUT (First Real Charge Only)
   * SOURCE OF TRUTH: CartCheckoutSubscriptionOrderCreation
   *
   * Create an Order for e-commerce cart checkouts on first real charge.
   * Subscription cart checkouts contain recurring items (and optionally one-time items).
   * The Order is created once when the subscription is activated (first invoice paid).
   */
  if (isFirstRealCharge) {
    const metadata = transaction.metadata as Record<string, unknown> | null
    const isCartCheckout = metadata?.source === 'cart_checkout'

    if (isCartCheckout) {
      // Check if order already exists for this transaction (idempotency)
      const existingOrder = await prisma.order.findUnique({
        where: { transactionId: transaction.id },
      })

      if (!existingOrder) {
        await createOrder({
          organizationId: transaction.organizationId,
          transactionId: transaction.id,
          status: 'CONFIRMED', // Payment received, ready for fulfillment
          fulfillmentStatus: 'UNFULFILLED',
          metadata: {
            createdFrom: 'cart_checkout_subscription',
            customerEmail: metadata?.customerEmail,
            customerName: metadata?.customerName,
            hasRecurringItems: metadata?.hasRecurringItems,
            hasOneTimeItems: metadata?.hasOneTimeItems,
            checkoutSessionId: (transaction as Record<string, unknown>).checkoutSessionId,
          },
        })
      }
    }
  }

  /**
   * SPLIT PAYMENT COMPLETION: Cancel the subscription after the last installment.
   * Subscriptions are created WITHOUT cancel_at (to avoid Stripe prorating the
   * final invoice). Instead, we cancel here once all installments are collected.
   * Test mode cancellation is handled separately in the platform webhook.
   */
  if (paymentStatus === 'PAID' && billingType === BILLING_TYPES.SPLIT_PAYMENT) {
    try {
      const cancelOptions = connectedAccountId
        ? { stripeAccount: connectedAccountId }
        : undefined

      await stripe.subscriptions.cancel(subscriptionId, cancelOptions)
      console.log(`[split-payment] Canceled subscription ${subscriptionId} after final installment`)
    } catch (error) {
      console.error(`[split-payment] Failed to cancel subscription ${subscriptionId}:`, error)
    }
  }

  return updated
}

/**
 * Handle failed RECURRING or SPLIT_PAYMENT invoice payment
 * Called when: invoice.payment_failed (subscription invoices only)
 *
 * NEW ARCHITECTURE:
 * - Sets paymentStatus to FAILED (payment lifecycle state)
 * - DOES NOT create TransactionPayment record (to avoid blocking 3DS success)
 *
 * IMPORTANT: For 3DS payments, invoice.payment_failed fires during authentication,
 * but invoice.paid fires after success. We must NOT create a payment record here
 * or it will block the successful payment with our idempotency check.
 *
 * NOTE: Stripe will retry based on Smart Retries settings. If all retries
 * fail, the subscription may be canceled (triggers customer.subscription.deleted)
 */
export async function handleSubscriptionPaymentFailed(subscriptionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  })

  if (!transaction) return null

  /**
   * Only update transaction status, don't create payment record
   * This allows invoice.paid to create the SUCCEEDED record after 3DS completes
   */
  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: { paymentStatus: 'FAILED' },
  })

  return updated
}

// ============================================================================
// SUBSCRIPTION LIFECYCLE HANDLERS
// ============================================================================

/**
 * Backfill missing charge ID for subscription payment
 * Called when: charge.succeeded (for invoice-based payments)
 *
 * RACE CONDITION FIX:
 * Stripe fires invoice.paid BEFORE charge.succeeded, so the TransactionPayment
 * record may be created without a stripeChargeId. This function backfills it
 * when the charge.succeeded webhook fires.
 *
 * This is critical for:
 * - Refund processing (needs charge ID to find the payment)
 * - Connect account dashboard refunds (Stripe sends charge ID, not invoice ID)
 * - Payment tracking and reconciliation
 *
 * @param invoiceId - Stripe invoice ID
 * @param chargeId - Stripe charge ID to backfill
 * @returns Updated payment record or null if not found
 */
export async function backfillChargeId(invoiceId: string, chargeId: string) {
  /**
   * Find the payment record by invoice ID
   * Only update if the charge ID is currently null (avoid overwriting)
   */
  const payment = await prisma.transactionPayment.findUnique({
    where: { stripeInvoiceId: invoiceId },
  })

  if (!payment) {
    return null
  }

  if (payment.stripeChargeId) {
    return payment
  }

  const updated = await prisma.transactionPayment.update({
    where: { id: payment.id },
    data: { stripeChargeId: chargeId },
  })

  return updated
}

/**
 * Handle RECURRING or SPLIT_PAYMENT subscription canceled
 * Called when: customer.subscription.deleted (with our transactionId metadata)
 *
 * NEW ARCHITECTURE:
 * - Sets paymentStatus to CANCELED
 * - Sets canceledAt timestamp
 * - Fires SUBSCRIPTION_CANCELLED automation triggers per product
 *
 * For SPLIT_PAYMENT: May occur if payments fail and subscription is canceled
 * For RECURRING: Customer or merchant canceled the subscription
 *
 * @param subscriptionId - Stripe subscription ID
 * @param cancelReason - Optional reason from Stripe cancellation_details
 */
export async function handleSubscriptionCanceled(subscriptionId: string, cancelReason?: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    include: { items: true },
  })

  if (!transaction) return null

  /**
   * Don't override PAID status for completed split payments.
   * When all installments are collected, handleSubscriptionPayment() cancels
   * the Stripe subscription to prevent extra charges. That cancellation fires
   * customer.subscription.deleted → this handler. The transaction is already
   * PAID at that point, so we should NOT overwrite it to CANCELED.
   * Also skip triggers — this is an expected programmatic cancellation, not a churn event.
   */
  if (transaction.paymentStatus === 'PAID') {
    return transaction
  }

  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: { paymentStatus: 'CANCELED', canceledAt: new Date() },
  })

  /**
   * Fire SUBSCRIPTION_CANCELLED triggers after status update.
   * This covers both user-initiated cancellations and payment-failure cancellations.
   * Fire-and-forget — never block the cancellation flow.
   */
  await fireSubscriptionCancelledTriggers(
    {
      id: transaction.id,
      organizationId: transaction.organizationId,
      leadId: transaction.leadId,
      currency: transaction.currency,
      items: transaction.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        priceId: item.priceId,
        priceName: item.priceName,
      })),
    },
    cancelReason
  )

  return updated
}

/**
 * Handle chargeback/dispute for any payment type
 * Called when: charge.dispute.created
 *
 * NEW ARCHITECTURE:
 * - Sets paymentStatus to DISPUTED
 * - Stores chargeback metadata
 * - Decrements lead CLTV by disputed amount
 *
 * Chargebacks can occur for any billing type (ONE_TIME, RECURRING, SPLIT_PAYMENT).
 */
export async function handleChargeback(
  paymentIntentId: string,
  disputeAmount: number,
  disputeReason?: string
) {
  // First try to find by direct payment intent (ONE_TIME)
  let transaction = await prisma.transaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  })

  // If not found, check transaction payments (RECURRING/SPLIT_PAYMENT)
  if (!transaction) {
    const payment = await prisma.transactionPayment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { transaction: true },
    })
    transaction = payment?.transaction || null
  }

  if (!transaction) return null

  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      paymentStatus: 'DISPUTED',
      metadata: {
        ...(transaction.metadata as Record<string, unknown> || {}),
        chargebackReason: disputeReason,
        chargebackAmount: disputeAmount,
        chargebackAt: new Date().toISOString(),
      },
    },
  })

  // Decrement lead CLTV by the disputed amount
  if (transaction.leadId) {
    await prisma.lead.update({
      where: { id: transaction.leadId },
      data: {
        cltv: { decrement: disputeAmount / 100 },
        lastActivityAt: new Date(),
      },
    })
  }

  return updated
}
