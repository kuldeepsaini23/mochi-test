/**
 * Invoice Utility Functions
 *
 * Formatting helpers for invoice display throughout the dashboard.
 * Self-contained — no dependencies on dashboard-specific utils for portability.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceUtils, InvoiceFormatters
 */

import type { InvoiceStatus } from '@/generated/prisma'
import { formatCurrency } from '@/lib/utils'

// ============================================================================
// STATUS DISPLAY CONFIG
// ============================================================================

/**
 * Visual configuration for each invoice status.
 * Maps status enum to display label + badge styling classes.
 */
export const INVOICE_STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; bgClass: string; colorClass: string; dotClass: string }
> = {
  DRAFT: {
    label: 'Draft',
    bgClass: 'bg-muted',
    colorClass: 'text-muted-foreground',
    dotClass: 'bg-muted-foreground',
  },
  SENT: {
    label: 'Sent',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    colorClass: 'text-blue-700 dark:text-blue-400',
    dotClass: 'bg-blue-500',
  },
  PAID: {
    label: 'Paid',
    bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  OVERDUE: {
    label: 'Overdue',
    bgClass: 'bg-red-100 dark:bg-red-900/30',
    colorClass: 'text-red-700 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
  CANCELED: {
    label: 'Canceled',
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    colorClass: 'text-amber-700 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
}

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format a monetary amount in cents to a displayable string.
 * Delegates to the global formatCurrency (SOURCE OF TRUTH) for proper
 * currency-aware decimals (USD=2, JPY=0, BHD=3) and smart rounding.
 *
 * @param amountInCents - Amount in cents (e.g. 5000 = $50.00)
 * @param currency - ISO 4217 currency code (default: "usd")
 */
export function formatInvoiceAmount(amountInCents: number, currency = 'usd'): string {
  return formatCurrency(amountInCents, currency)
}

/**
 * Format a date for invoice display (e.g., "Jan 15, 2026").
 * Self-contained — no external date library dependency.
 */
export function formatInvoiceDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Get the full display name for a lead.
 * Falls back to email if no name is available.
 */
export function getInvoiceRecipientName(
  lead: { firstName: string | null; lastName: string | null; email: string } | null | undefined
): string {
  if (!lead) return 'No recipient'
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ')
  return name || lead.email
}
