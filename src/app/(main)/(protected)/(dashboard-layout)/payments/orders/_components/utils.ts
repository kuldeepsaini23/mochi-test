/**
 * Orders Utilities
 *
 * Helper functions for formatting and displaying order data.
 * Focuses on order status, fulfillment status and tracking information.
 *
 * IMPORTANT: Orders are NOT Transactions!
 * Orders are specifically for e-commerce products that require fulfillment.
 *
 * SOURCE OF TRUTH: OrderStatus, FulfillmentStatus, TransactionPaymentStatus
 */

import type { FulfillmentStatus, TransactionPaymentStatus, OrderStatus } from '@/generated/prisma'

/**
 * Get display properties for fulfillment status
 *
 * @param status - FulfillmentStatus enum value
 * @returns Object with label, icon color class, and badge variant
 */
export function getFulfillmentStatusDisplay(status: FulfillmentStatus): {
  label: string
  colorClass: string
  badgeClass: string
} {
  const statusMap: Record<
    FulfillmentStatus,
    { label: string; colorClass: string; badgeClass: string }
  > = {
    UNFULFILLED: {
      label: 'Unfulfilled',
      colorClass: 'text-amber-500',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    PARTIALLY_FULFILLED: {
      label: 'Partial',
      colorClass: 'text-blue-500',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    FULFILLED: {
      label: 'Fulfilled',
      colorClass: 'text-emerald-500',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    CANCELED: {
      label: 'Canceled',
      colorClass: 'text-muted-foreground',
      badgeClass: 'bg-muted text-muted-foreground',
    },
  }

  return statusMap[status] || statusMap.UNFULFILLED
}

/**
 * Get display properties for order status
 *
 * @param status - OrderStatus enum value
 * @returns Object with label and badge class
 */
export function getOrderStatusDisplay(status: OrderStatus): {
  label: string
  badgeClass: string
} {
  const statusMap: Record<OrderStatus, { label: string; badgeClass: string }> = {
    PENDING: {
      label: 'Pending',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    CONFIRMED: {
      label: 'Confirmed',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    PROCESSING: {
      label: 'Processing',
      badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    },
    SHIPPED: {
      label: 'Shipped',
      badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    },
    DELIVERED: {
      label: 'Delivered',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    CANCELED: {
      label: 'Canceled',
      badgeClass: 'bg-muted text-muted-foreground',
    },
    REFUNDED: {
      label: 'Refunded',
      badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
    },
  }

  return statusMap[status] || statusMap.PENDING
}

/**
 * Get display properties for payment status (simplified for orders view)
 *
 * @param status - TransactionPaymentStatus enum value
 * @returns Object with label and badge class
 */
export function getPaymentStatusDisplay(status: TransactionPaymentStatus): {
  label: string
  badgeClass: string
} {
  const statusMap: Record<
    TransactionPaymentStatus,
    { label: string; badgeClass: string }
  > = {
    AWAITING_PAYMENT: {
      label: 'Awaiting',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    TRIALING: {
      label: 'Trial',
      badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    },
    PARTIALLY_PAID: {
      label: 'Partial',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    PAID: {
      label: 'Paid',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    ACTIVE: {
      label: 'Active',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    FAILED: {
      label: 'Failed',
      badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
    },
    CANCELED: {
      label: 'Canceled',
      badgeClass: 'bg-muted text-muted-foreground',
    },
    DISPUTED: {
      label: 'Disputed',
      badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
    },
  }

  return statusMap[status] || statusMap.AWAITING_PAYMENT
}

/**
 * Format order ID for display
 * Shows first 8 characters of the ID with a # prefix
 *
 * @param id - Full order/transaction ID
 * @returns Formatted order ID string
 */
export function formatOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`
}

/**
 * Format date for orders table
 *
 * @param dateString - ISO date string
 * @returns Formatted date string
 */
export function formatOrderDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Get customer display name from lead
 *
 * @param lead - Lead object from transaction
 * @returns Display name string
 */
export function getCustomerDisplayName(lead: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
} | null): string {
  if (!lead) return 'Unknown Customer'

  const firstName = lead.firstName || ''
  const lastName = lead.lastName || ''
  const fullName = `${firstName} ${lastName}`.trim()

  return fullName || lead.email || 'Unknown Customer'
}

/**
 * Get customer initials for avatar
 *
 * @param lead - Lead object from transaction
 * @returns Initials string (2 characters max)
 */
export function getCustomerInitials(lead: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
} | null): string {
  if (!lead) return '?'

  const firstName = lead.firstName || ''
  const lastName = lead.lastName || ''

  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase()
  }

  if (firstName) {
    return firstName.slice(0, 2).toUpperCase()
  }

  if (lead.email) {
    return lead.email.slice(0, 2).toUpperCase()
  }

  return '?'
}

/**
 * Get tracking URL with carrier-specific handling
 *
 * @param trackingNumber - Tracking number
 * @param carrier - Shipping carrier
 * @param customUrl - Custom tracking URL if provided
 * @returns Tracking URL string or null
 */
export function getTrackingUrl(
  trackingNumber: string,
  carrier: string | null,
  customUrl: string | null
): string | null {
  if (customUrl) return customUrl

  if (!carrier) return null

  // Common carrier tracking URLs
  const carrierUrls: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
  }

  const carrierKey = carrier.toLowerCase()
  return carrierUrls[carrierKey] || null
}

/** Re-export formatCurrency from global source of truth */
export { formatCurrency } from '@/lib/utils'
