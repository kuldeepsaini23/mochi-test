/**
 * Transaction Types
 *
 * Shared types for transaction components.
 * These types are serialization-safe and handle both Date and string
 * since tRPC serializes dates to strings over the wire.
 *
 * NEW ARCHITECTURE:
 * - TransactionStatus renamed to TransactionPaymentStatus
 * - Removed completedPayments, nextPaymentDate, completedAt, refundedAt
 * - Added originalAmount, paidAmount, billingType, successfulPayments
 * - Added firstPaidAt, lastPaidAt, fullyPaidAt
 */

import type {
  TransactionPaymentStatus,
  PaymentStatus,
  BillingType,
  BillingInterval,
} from '@/generated/prisma'

// Date fields can be Date objects (server) or strings (after tRPC serialization)
type DateOrString = Date | string

/**
 * Lead data included in transaction queries
 */
export interface TransactionLead {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  phone: string | null
  avatarUrl: string | null
  country: string | null
}

/**
 * Transaction item (product/price snapshot)
 */
export interface TransactionItem {
  id: string
  transactionId: string
  productId: string
  priceId: string
  productName: string
  productImage: string | null
  priceName: string
  quantity: number
  unitAmount: number
  totalAmount: number
  billingType: BillingType | string
  interval: BillingInterval | string | null
  intervalCount: number | null
  installments: number | null
  createdAt: DateOrString
}

/**
 * Payment refund record (NEW)
 */
export interface PaymentRefund {
  id: string
  paymentId: string
  amount: number
  currency: string
  reason: string | null
  stripeRefundId: string
  createdAt: DateOrString
  processedAt: DateOrString | null
}

/**
 * Transaction payment record
 * NEW: Removed dueDate, added stripeChargeId for refund tracking
 */
export interface TransactionPayment {
  id: string
  transactionId: string
  amount: number
  currency: string
  status: PaymentStatus
  paymentNumber: number
  stripePaymentIntentId: string | null
  stripeInvoiceId: string | null
  stripeChargeId: string | null
  refundedAmount: number
  paidAt: DateOrString | null
  failedAt: DateOrString | null
  createdAt: DateOrString
  updatedAt: DateOrString
  failureReason: string | null
  refunds?: PaymentRefund[]
}

/**
 * Full transaction with all relations
 * NEW ARCHITECTURE FIELDS:
 * - originalAmount: Total purchase price (immutable)
 * - paidAmount: Sum of successful payments
 * - billingType: ONE_TIME, RECURRING, or SPLIT_PAYMENT
 * - paymentStatus: Payment lifecycle state (was "status")
 * - successfulPayments: Count of successful payments (was "completedPayments")
 * - firstPaidAt/lastPaidAt/fullyPaidAt: Payment timeline tracking
 *
 * REMOVED FIELDS:
 * - nextPaymentDate (not needed, Stripe handles subscription scheduling)
 * - completedAt (replaced by fullyPaidAt)
 * - refundedAt (refunds tracked via refundedAmount, not separate timestamp)
 */
export interface TransactionWithRelations {
  id: string
  organizationId: string
  leadId: string | null
  originalAmount: number
  paidAmount: number
  refundedAmount: number
  currency: string
  billingType: BillingType
  paymentStatus: TransactionPaymentStatus
  totalPayments: number
  successfulPayments: number
  stripePaymentIntentId: string | null
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  paymentLinkId: string | null
  createdAt: DateOrString
  updatedAt: DateOrString
  firstPaidAt: DateOrString | null
  lastPaidAt: DateOrString | null
  fullyPaidAt: DateOrString | null
  canceledAt: DateOrString | null
  /** Free trial duration in days — null if no trial. SOURCE OF TRUTH: TransactionTrialFields */
  trialDays: number | null
  /** When the trial period ends — null if no trial. SOURCE OF TRUTH: TransactionTrialFields */
  trialEndsAt: DateOrString | null
  /**
   * Groups transactions from the same cart checkout.
   * A mixed cart creates separate Transactions per billing group,
   * all sharing the same checkoutSessionId.
   * SOURCE OF TRUTH: CheckoutSessionGrouping
   */
  checkoutSessionId: string | null
  metadata: Record<string, unknown> | null
  lead: TransactionLead | null
  items: TransactionItem[]
  payments: TransactionPayment[]
}

/**
 * SOURCE OF TRUTH: OrderNote
 * Order note/timeline entry
 */
export interface OrderNote {
  id: string
  transactionId: string
  content: string
  isInternal: boolean
  createdBy: string
  createdAt: DateOrString
}

/**
 * List transactions response
 */
export interface ListTransactionsResponse {
  transactions: TransactionWithRelations[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  statusCounts: Record<string, number>
}
