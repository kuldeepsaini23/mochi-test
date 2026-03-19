/**
 * Products Utility Functions
 *
 * Shared formatting and helper functions for products UI
 *
 * SOURCE OF TRUTH KEYWORDS: ProductsUtils, formatCurrency, BillingInterval
 */

import { DEFAULT_CURRENCY } from '@/constants/currencies'
import { formatCurrency as globalFormatCurrency } from '@/lib/utils'

type BillingInterval = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

interface Price {
  billingType: 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT'
  interval?: BillingInterval | null
  intervalCount?: number | null
  installments?: number | null
  installmentInterval?: BillingInterval | null
  installmentIntervalCount?: number | null
}

/**
 * Format currency amount using global source of truth
 */
export function formatCurrency(amountInCents: number, currency: string = DEFAULT_CURRENCY): string {
  return globalFormatCurrency(amountInCents, currency)
}

/**
 * Format interval for display
 */
export function formatInterval(
  interval: BillingInterval | null | undefined,
  count: number | null | undefined = 1
): string {
  if (!interval) return ''

  const intervalMap: Record<BillingInterval, { singular: string; plural: string }> = {
    DAY: { singular: 'day', plural: 'days' },
    WEEK: { singular: 'week', plural: 'weeks' },
    MONTH: { singular: 'month', plural: 'months' },
    YEAR: { singular: 'year', plural: 'years' },
  }

  const intervalInfo = intervalMap[interval]
  const actualCount = count || 1

  if (actualCount === 1) {
    return intervalInfo.singular
  }

  return `${actualCount} ${intervalInfo.plural}`
}

/**
 * Format interval as adjective (e.g., "weekly", "monthly", "every 2 weeks")
 */
export function formatIntervalAdjective(
  interval: BillingInterval | null | undefined,
  count: number | null | undefined = 1
): string {
  if (!interval) return ''

  const actualCount = count || 1

  // For count of 1, use the adjective form
  if (actualCount === 1) {
    const adjectiveMap: Record<BillingInterval, string> = {
      DAY: 'daily',
      WEEK: 'weekly',
      MONTH: 'monthly',
      YEAR: 'yearly',
    }
    return adjectiveMap[interval]
  }

  // For count > 1, use "every X intervals" format
  return `every ${formatInterval(interval, count)}`
}

/**
 * Format billing type for badge/display
 */
export function formatBillingType(price: Price): string {
  switch (price.billingType) {
    case 'ONE_TIME':
      return 'One-time'
    case 'RECURRING':
      return `Every ${formatInterval(price.interval, price.intervalCount)}`
    case 'SPLIT_PAYMENT': {
      const count = price.installmentIntervalCount || 1
      if (count === 1) {
        // "5 monthly payments"
        const intervalAdj = formatIntervalAdjective(
          price.installmentInterval,
          price.installmentIntervalCount
        )
        return `Payment split into ${price.installments} ${intervalAdj} payments`
      }
      // "5 payments every 2 weeks"
      const interval = formatInterval(
        price.installmentInterval,
        price.installmentIntervalCount
      )
      return `${price.installments} payments every ${interval}`
    }
    default:
      return 'Unknown'
  }
}

/**
 * Format full billing description
 */
export function formatBillingDescription(price: Price, amount: number, currency: string): string {
  const formattedAmount = formatCurrency(amount, currency)

  switch (price.billingType) {
    case 'ONE_TIME':
      return `${formattedAmount} one-time payment`
    case 'RECURRING':
      return `${formattedAmount} every ${formatInterval(price.interval, price.intervalCount)}`
    case 'SPLIT_PAYMENT': {
      const installmentAmount = Math.ceil(amount / (price.installments || 1))
      const formattedInstallment = formatCurrency(installmentAmount, currency)
      return `${price.installments} payments of ${formattedInstallment} every ${formatInterval(
        price.installmentInterval,
        price.installmentIntervalCount
      )}`
    }
    default:
      return formattedAmount
  }
}

/**
 * Billing interval options for select
 */
export const BILLING_INTERVALS = [
  { value: 'DAY', label: 'Day(s)' },
  { value: 'WEEK', label: 'Week(s)' },
  { value: 'MONTH', label: 'Month(s)' },
  { value: 'YEAR', label: 'Year(s)' },
] as const

/**
 * Billing type options for select
 */
export const BILLING_TYPES = [
  { value: 'ONE_TIME', label: 'One-time Payment', description: 'Customer pays once' },
  {
    value: 'RECURRING',
    label: 'Recurring Subscription',
    description: 'Customer pays on a regular schedule',
  },
  {
    value: 'SPLIT_PAYMENT',
    label: 'Split Payments',
    description: 'Total amount split into multiple payments',
  },
] as const
