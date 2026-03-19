/**
 * Utility functions for checkout
 *
 * SOURCE OF TRUTH KEYWORDS: CheckoutUtils, formatCurrency, getBillingDescription
 */

import type { Price } from './types'
import { formatCurrency } from '@/lib/utils'

/** Re-export formatCurrency from global source of truth */
export { formatCurrency }

// Get payment amount for button (first installment for split, full for others)
export const getPaymentAmount = (price: Price) => {
  if (price.billingType === 'SPLIT_PAYMENT' && price.installments) {
    return Math.ceil(price.amount / price.installments)
  }
  return price.amount
}

// Billing type description
export const getBillingDescription = (price: Price) => {
  /** One-time prices don't need a label — it's self-evident */
  if (price.billingType === 'ONE_TIME') return ''
  if (price.billingType === 'RECURRING') {
    const interval = price.interval?.toLowerCase() || 'month'
    const count = price.intervalCount || 1
    if (count === 1) return `per ${interval}`
    return `every ${count} ${interval}s`
  }
  if (price.billingType === 'SPLIT_PAYMENT') {
    const installments = price.installments || 1
    const interval = price.installmentInterval?.toLowerCase() || 'month'
    const perPayment = Math.ceil(price.amount / installments)
    return `${installments} payments of ${formatCurrency(perPayment, price.currency)} / ${interval}`
  }
  return ''
}
