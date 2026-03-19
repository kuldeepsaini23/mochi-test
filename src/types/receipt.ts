/**
 * Receipt Types — Public Receipt System
 *
 * Sanitized types for public receipt display.
 * Strips ALL sensitive data (emails, phones, Stripe IDs, personal info).
 * Used by the reusable PaymentReceipt component and public receipt route.
 *
 * SOURCE OF TRUTH KEYWORDS: ReceiptData, PublicReceipt, PaymentReceipt, ReceiptItem
 */

import type { BillingType, BillingInterval } from '@/generated/prisma'

/**
 * Sanitized transaction item for receipt display.
 *
 * WHY: Snapshot of what the customer purchased — safe for public display.
 * No product IDs, price IDs, or internal references exposed.
 */
export interface ReceiptItem {
  /** Product name at time of purchase */
  productName: string
  /** Product image URL (optional) */
  productImage: string | null
  /** Price tier name (e.g. "Monthly Plan", "Basic") */
  priceName: string
  /** Quantity purchased */
  quantity: number
  /** Price per unit in cents */
  unitAmount: number
  /** Total for this line item in cents (quantity × unitAmount) */
  totalAmount: number
  /** Billing type for this specific item */
  billingType: BillingType
  /** Billing interval (DAY, WEEK, MONTH, YEAR) — null for ONE_TIME */
  interval: BillingInterval | null
  /** How many intervals between payments (e.g. 2 for "every 2 months") */
  intervalCount: number | null
}

/**
 * Public receipt data — stripped of ALL sensitive information.
 *
 * WHAT'S INCLUDED:
 * - Payment amount, date, number, billing type
 * - Products purchased (from parent transaction)
 * - Refund information if applicable
 * - Currency for formatting
 * - Total payments count (for "Payment X of Y" display)
 *
 * WHAT'S EXCLUDED:
 * - Customer email, phone, name, address
 * - Stripe IDs (payment intent, invoice, charge, subscription)
 * - Lead ID, organization ID, transaction ID
 * - Any PII or sensitive business data
 *
 * SOURCE OF TRUTH KEYWORDS: PublicReceiptData, ReceiptPayload
 */
export interface PublicReceiptData {
  /**
   * TransactionPayment CUID — used for invoice generation.
   * Already publicly exposed via receipt page URLs (/receipt/[paymentId]).
   * Needed by the website builder receipt element to call generateFromReceipt.
   *
   * SOURCE OF TRUTH: ReceiptPaymentId
   */
  paymentId: string
  /** Which payment this is in the sequence (1, 2, 3...) */
  paymentNumber: number
  /** When this specific payment was completed */
  paidAt: Date | string | null
  /** Amount paid in this specific payment (in cents) */
  amount: number
  /** Total refunded on this specific payment (in cents) */
  refundedAmount: number
  /** Payment currency (e.g. "usd", "eur") */
  currency: string
  /** Billing type of the parent transaction */
  billingType: BillingType
  /** Total expected payments (1 for ONE_TIME, N for SPLIT, 0 for RECURRING/unlimited) */
  totalPayments: number
  /** All products purchased in this transaction */
  items: ReceiptItem[]
  /** When this payment record was created */
  createdAt: Date | string
  /** Access token for the linked invoice (null if no invoice generated yet) */
  invoiceAccessToken: string | null
}
