/**
 * ============================================================================
 * PUBLIC RECEIPT VIEW — Server Page
 * ============================================================================
 *
 * Displays a payment receipt for a specific TransactionPayment.
 * No authentication required — the paymentId (CUID) IS the security.
 * Invalid or non-existent payment IDs result in a 404.
 *
 * SECURITY:
 * - Payment ID is a CUID (128-bit cryptographic randomness) — unguessable
 * - Only shows receipts for SUCCEEDED payments
 * - Zero PII displayed (no emails, phones, names, Stripe IDs)
 * - noindex/nofollow robots meta — receipts don't appear in search engines
 *
 * PATTERN: Follows src/app/(main)/(public)/contract/view/[accessToken]/page.tsx
 *
 * SOURCE OF TRUTH KEYWORDS: PublicReceiptPage, ReceiptViewPage, ReceiptRoute
 */

import { notFound } from 'next/navigation'
import { createCaller } from '@/trpc/server'
import { ReceiptPageClient } from './_components/receipt-page-client'

interface PageProps {
  params: Promise<{ paymentId: string }>
}

export default async function PublicReceiptPage({ params }: PageProps) {
  const { paymentId } = await params

  /** Fetch receipt data via tRPC — public endpoint, no auth */
  const api = await createCaller()
  let receipt
  try {
    receipt = await api.transactions.getPaymentReceipt({ paymentId })
  } catch {
    notFound()
  }

  if (!receipt) notFound()

  return <ReceiptPageClient receipt={receipt} paymentId={paymentId} />
}

/**
 * Page metadata — prevents search engine indexing of receipt pages.
 */
export async function generateMetadata() {
  return {
    title: 'Payment Receipt',
    description: 'View your payment receipt',
    robots: 'noindex, nofollow',
  }
}
