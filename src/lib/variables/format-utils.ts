/**
 * Formatting Utilities (Client-Safe)
 *
 * These utilities can be safely used in both client and server components.
 * They don't import any server-only dependencies (Prisma, Stripe, etc.).
 *
 * SOURCE OF TRUTH KEYWORDS: VariableFormatUtils, ClientSafeFormatting
 */

/** Re-export formatCurrency from the single source of truth */
export { formatCurrency } from '@/lib/utils'

/**
 * Format a date for display.
 *
 * @param date - Date to format (ISO string or Date object)
 * @param format - Format type
 * @returns Formatted date string
 */
export function formatDate(
  date: string | Date,
  format: 'date' | 'time' | 'datetime' = 'date'
): string {
  if (!date) return ''

  const d = typeof date === 'string' ? new Date(date) : date

  if (isNaN(d.getTime())) return ''

  switch (format) {
    case 'date':
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    case 'time':
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    case 'datetime':
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    default:
      return d.toISOString()
  }
}
