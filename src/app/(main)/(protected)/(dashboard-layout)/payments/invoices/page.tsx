/**
 * Invoices Page — Entry Point
 *
 * WHY: Delegates to InvoicesPageContent for client-side rendering
 * HOW: Minimal server component wrapper (same pattern as contracts page)
 *
 * URL STRUCTURE:
 * - /payments/invoices — Invoice listing
 * - /payments/invoices?invoice=xxx — Opens invoice builder overlay
 *
 * PERMISSION: invoices:read required
 *
 * SOURCE OF TRUTH: Invoice model from Prisma
 * Keywords: INVOICES_PAGE, INVOICE_LISTING
 */

import { InvoicesPageContent } from './_components/invoices-page-content'

export default function InvoicesPage() {
  return <InvoicesPageContent />
}

export const metadata = {
  title: 'Invoices | Mochi',
  description: 'Create, manage, and send invoices for payment',
}
