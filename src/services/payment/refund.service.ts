/**
 * Refund Service
 *
 * Handles refund processing for ALL payment types (ONE_TIME, RECURRING, SPLIT_PAYMENT)
 * through a single unified pipeline.
 *
 * ARCHITECTURE:
 * - Creates PaymentRefund records for complete audit trail
 * - Recalculates refundedAmount from SUM of PaymentRefund records (idempotent)
 * - Uses stripeRefundId for duplicate webhook prevention
 * - Decrements lead CLTV on each refund event
 * - Increments inventory on full refund when transaction has items (ONE_TIME orders)
 *
 * SOURCE OF TRUTH: RefundService, PaymentRefundProcessing, UnifiedRefund
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { incrementInventoryForRefund } from '@/services/inventory.service'

/**
 * Process a refund for any payment type (ONE_TIME, RECURRING, SPLIT_PAYMENT).
 *
 * Unified refund pipeline that handles all billing types through one code path.
 * The only billing-type-specific behavior is inventory increment on full refund,
 * which naturally only applies when the transaction has items (ONE_TIME orders).
 * Subscription payments have no items, so the inventory check is a no-op.
 *
 * Steps:
 * 1. Find payment by stripeChargeId (with transaction + items include)
 * 2. Idempotency check via stripeRefundId unique constraint
 * 3. Create PaymentRefund record for audit trail
 * 4. Recalculate payment.refundedAmount from SUM of all PaymentRefund records
 * 5. Recalculate transaction.refundedAmount from SUM of all payments
 * 6. Decrement lead CLTV by this refund amount
 * 7. Increment inventory if full refund AND transaction has items
 *
 * @param stripeChargeId - The Stripe charge ID to look up the payment
 * @param stripeRefundId - The Stripe refund ID (used for idempotency)
 * @param refundAmount - The refund amount in cents
 * @param refundReason - Optional reason string from Stripe
 * @returns The updated transaction, or null if payment not found
 *
 * SOURCE OF TRUTH: RefundService, PaymentRefundProcessing, UnifiedRefund
 */
export async function processRefund(
  stripeChargeId: string,
  stripeRefundId: string,
  refundAmount: number,
  refundReason?: string
) {
  /**
   * Find the payment by charge ID, including transaction items for inventory.
   * Items include is lightweight (empty array for subscriptions) and enables
   * unified inventory handling without a separate query.
   */
  const payment = await prisma.transactionPayment.findUnique({
    where: { stripeChargeId },
    include: {
      transaction: {
        include: {
          items: true,
        },
      },
      refunds: true,
    },
  })

  if (!payment) {
    return null
  }

  /**
   * IDEMPOTENCY CHECK: Prevent duplicate refund processing.
   * If this stripeRefundId already exists, it's a duplicate webhook — skip processing.
   */
  const existingRefund = await prisma.paymentRefund.findUnique({
    where: { stripeRefundId },
  })

  if (existingRefund) {
    return payment.transaction
  }

  /**
   * Create PaymentRefund event record.
   * This creates a complete audit trail of all refunds on this payment.
   */
  const now = new Date()
  await prisma.paymentRefund.create({
    data: {
      paymentId: payment.id,
      amount: refundAmount,
      currency: payment.currency,
      reason: refundReason,
      stripeRefundId: stripeRefundId,
      processedAt: now,
    },
  })

  /**
   * Recalculate payment.refundedAmount from SUM of all PaymentRefund records.
   * This ensures accuracy even if webhooks arrive out of order or are duplicated.
   */
  const totalRefundedOnPayment = await prisma.paymentRefund.aggregate({
    where: { paymentId: payment.id },
    _sum: { amount: true },
  })

  const newPaymentRefundedAmount = totalRefundedOnPayment._sum.amount || 0

  await prisma.transactionPayment.update({
    where: { id: payment.id },
    data: {
      refundedAmount: newPaymentRefundedAmount,
    },
  })

  /**
   * Recalculate transaction.refundedAmount from SUM of all payment refunds.
   * For ONE_TIME there's one payment, for subscriptions there may be many.
   */
  const allPayments = await prisma.transactionPayment.findMany({
    where: { transactionId: payment.transactionId },
    select: { refundedAmount: true },
  })

  const newTransactionRefundedAmount = allPayments.reduce(
    (sum, p) => sum + p.refundedAmount,
    0
  )

  const updated = await prisma.transaction.update({
    where: { id: payment.transactionId },
    data: {
      refundedAmount: newTransactionRefundedAmount,
    },
  })

  /**
   * Decrement lead CLTV by THIS refund amount only (not total refunded).
   * This ensures CLTV is accurate even with duplicate webhooks since we
   * already returned early above if the refund was already processed.
   */
  if (payment.transaction.leadId) {
    await prisma.lead.update({
      where: { id: payment.transaction.leadId },
      data: {
        cltv: { decrement: refundAmount / 100 },
        lastActivityAt: now,
      },
    })
  }

  /**
   * INVENTORY MANAGEMENT:
   * Increment inventory when a transaction is fully refunded AND has items.
   *
   * This naturally handles the billing type difference:
   * - ONE_TIME orders have items → inventory gets incremented on full refund
   * - RECURRING/SPLIT subscriptions have no items → this is a no-op
   *
   * For partial refunds, inventory is NOT automatically adjusted — the merchant
   * should manually adjust if items are being returned.
   */
  const isFullRefund = newTransactionRefundedAmount >= payment.transaction.originalAmount
  if (isFullRefund && payment.transaction.items.length > 0) {
    await incrementInventoryForRefund(
      payment.transaction.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      payment.transaction.id,
      payment.transaction.organizationId
    )
  }

  return updated
}
