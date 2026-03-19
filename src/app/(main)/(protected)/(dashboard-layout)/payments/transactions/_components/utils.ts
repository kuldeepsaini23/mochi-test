/**
 * Transaction Utility Functions
 *
 * NEW ARCHITECTURE:
 * - Uses TransactionPaymentStatus (not TransactionStatus)
 * - Refund state computed from amounts, not status enum
 * - Displays both payment status and refund state separately
 *
 * SOURCE OF TRUTH KEYWORDS: TransactionUtils, formatCurrency, getStatusDisplay
 */

import type { TransactionPaymentStatus, PaymentStatus } from '@/generated/prisma'
import { BILLING_TYPES } from '@/constants/billing'

/** Re-export formatCurrency from global source of truth */
export { formatCurrency } from '@/lib/utils'

/**
 * Get display info for transaction payment status
 *
 * NEW ARCHITECTURE:
 * - Uses TransactionPaymentStatus enum
 * - Refund state handled separately in getRefundStatusDisplay
 */
export function getStatusDisplay(status: TransactionPaymentStatus): {
  label: string
  color: string
  bgColor: string
  icon?: 'check' | 'clock' | 'x' | 'refresh' | 'alert'
} {
  switch (status) {
    case 'AWAITING_PAYMENT':
      return {
        label: 'Awaiting Payment',
        color: 'text-gray-600',
        bgColor: 'bg-gray-500/10',
        icon: 'clock',
      }
    case 'PARTIALLY_PAID':
      return {
        label: 'Partially Paid',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-500/10',
        icon: 'clock',
      }
    case 'PAID':
      return {
        label: 'Paid',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-500/10',
        icon: 'check',
      }
    case 'TRIALING':
      return {
        label: 'Trial Active',
        color: 'text-violet-600',
        bgColor: 'bg-violet-500/10',
        icon: 'clock',
      }
    case 'ACTIVE':
      return {
        label: 'Active',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-500/10',
        icon: 'refresh',
      }
    case 'FAILED':
      return {
        label: 'Failed',
        color: 'text-red-600',
        bgColor: 'bg-red-500/10',
        icon: 'x',
      }
    case 'CANCELED':
      return {
        label: 'Canceled',
        color: 'text-gray-600',
        bgColor: 'bg-gray-500/10',
        icon: 'x',
      }
    case 'DISPUTED':
      return {
        label: 'Disputed',
        color: 'text-red-600',
        bgColor: 'bg-red-500/10',
        icon: 'alert',
      }
    default:
      return {
        label: status,
        color: 'text-gray-600',
        bgColor: 'bg-gray-500/10',
      }
  }
}

/**
 * Get refund status display based on amounts
 *
 * NEW ARCHITECTURE:
 * - Refund state computed from paidAmount and refundedAmount
 * - Not stored in status enum
 */
export function getRefundStatusDisplay(
  paidAmount: number,
  refundedAmount: number
): {
  label: string
  color: string
  bgColor: string
  icon: 'refresh'
} | null {
  if (refundedAmount === 0) return null

  const isFullyRefunded = refundedAmount >= paidAmount

  if (isFullyRefunded) {
    return {
      label: 'Refunded',
      color: 'text-gray-600',
      bgColor: 'bg-gray-500/10',
      icon: 'refresh',
    }
  }

  return {
    label: 'Partially Refunded',
    color: 'text-gray-600',
    bgColor: 'bg-gray-500/10',
    icon: 'refresh',
  }
}

/**
 * Get display info for individual payment status
 *
 * NEW ARCHITECTURE:
 * - Removed REFUNDED and PARTIALLY_REFUNDED from PaymentStatus
 * - Refund state tracked via payment.refundedAmount field
 */
export function getPaymentStatusDisplay(status: PaymentStatus): {
  label: string
  color: string
} {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', color: 'text-yellow-600' }
    case 'SUCCEEDED':
      return { label: 'Paid', color: 'text-emerald-600' }
    case 'FAILED':
      return { label: 'Failed', color: 'text-red-600' }
    default:
      return { label: status, color: 'text-gray-600' }
  }
}

/**
 * Format billing type for display
 */
export function formatBillingType(billingType: string): string {
  switch (billingType) {
    case BILLING_TYPES.ONE_TIME:
      return 'One-time'
    case BILLING_TYPES.RECURRING:
      return 'Recurring'
    case BILLING_TYPES.SPLIT_PAYMENT:
      return 'Installments'
    default:
      return billingType
  }
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Get customer display name from lead
 */
export function getCustomerDisplayName(lead: {
  firstName: string | null
  lastName: string | null
  email: string
} | null): string {
  if (!lead) return 'Unknown Customer'

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ')
  return name || lead.email
}

/**
 * Get customer initials
 */
export function getCustomerInitials(lead: {
  firstName: string | null
  lastName: string | null
  email: string
} | null): string {
  if (!lead) return '?'

  if (lead.firstName && lead.lastName) {
    return `${lead.firstName[0]}${lead.lastName[0]}`.toUpperCase()
  }

  if (lead.firstName) {
    return lead.firstName.slice(0, 2).toUpperCase()
  }

  return lead.email.slice(0, 2).toUpperCase()
}

/**
 * Get progress percentage for payment tracking
 *
 * NEW ARCHITECTURE:
 * - Uses successfulPayments instead of completedPayments
 */
export function getPaymentProgress(successfulPayments: number, totalPayments: number): number {
  if (totalPayments === 0) return 0
  return Math.round((successfulPayments / totalPayments) * 100)
}

/**
 * Format payment progress text
 *
 * NEW ARCHITECTURE:
 * - Uses successfulPayments instead of completedPayments
 */
export function formatPaymentProgress(successfulPayments: number, totalPayments: number): string {
  if (totalPayments === 1) return 'Paid in full'
  return `${successfulPayments}/${totalPayments} payments`
}
