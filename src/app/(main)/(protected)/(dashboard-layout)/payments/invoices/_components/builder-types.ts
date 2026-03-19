/**
 * Invoice Builder Shared Types
 *
 * Local types used across the invoice builder components
 * (navbar, items panel, preview, main builder).
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceBuilderTypes, InvoiceItemLocal
 */

import type { BillingType, BillingInterval, InvoiceStatus } from '@/generated/prisma'

// ============================================================================
// LOCAL ITEM TYPE
// ============================================================================

/**
 * Local representation of an invoice line item during editing.
 *
 * WHY separate from Prisma type: The builder needs a temporary `tempId`
 * for React keys and in-memory tracking before items are persisted.
 * When saving, tempId is stripped and items are synced via syncInvoiceItems.
 */
export type InvoiceItemLocal = {
  /** Temporary ID for React keys and in-memory editing */
  tempId: string
  /** Product reference — null for ad-hoc items */
  productId: string | null
  /** Price reference — null for ad-hoc items */
  priceId: string | null
  /** Display name for the line item */
  name: string
  /** Optional description for the line item */
  description: string | null
  /** Number of units */
  quantity: number
  /** Price per unit in cents */
  unitAmount: number
  /** Billing type — mostly ONE_TIME for invoices */
  billingType: BillingType
  /** Billing interval for recurring items */
  interval: BillingInterval | null
  /** How many intervals between payments */
  intervalCount: number | null
  /** Whether this is a custom ad-hoc item (not linked to a product) */
  isAdHoc: boolean
  /** Product image URL — client-only, populated from product picker selection */
  imageUrl?: string | null
}

// ============================================================================
// BUILDER PROPS
// ============================================================================

/** Props for the main InvoiceBuilder component */
export type InvoiceBuilderProps = {
  invoiceId: string
  organizationId: string
  onClose: () => void
}

/** Computed total from items */
export function computeInvoiceTotal(items: InvoiceItemLocal[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0)
}

/** Convert local items to the format expected by the tRPC updateItems mutation */
export function itemsToInput(items: InvoiceItemLocal[]) {
  return items.map((item) => ({
    productId: item.productId,
    priceId: item.priceId,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    billingType: item.billingType as 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT',
    interval: item.interval as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | null,
    intervalCount: item.intervalCount,
    isAdHoc: item.isAdHoc,
  }))
}

/** Type re-exports for convenience */
export type { InvoiceStatus, BillingType, BillingInterval }
