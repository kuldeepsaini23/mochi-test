/**
 * Public Invoice View — Server Page
 *
 * Fetches an invoice by its public accessToken and renders the
 * read-only view with an optional payment form. No authentication
 * required — the accessToken IS the security.
 *
 * Pattern mirrors: src/app/(main)/(public)/contract/view/[accessToken]/page.tsx
 *
 * SOURCE OF TRUTH KEYWORDS: PublicInvoicePage, InvoiceViewPage
 */

import { notFound } from 'next/navigation'
import { createCaller } from '@/trpc/server'
import { InvoiceViewClient } from './_components/invoice-view-client'

interface PageProps {
  params: Promise<{ accessToken: string }>
}

export default async function PublicInvoiceViewPage({ params }: PageProps) {
  const { accessToken } = await params

  /** Fetch the invoice by accessToken — public endpoint, no auth required */
  const api = await createCaller()
  let invoice
  try {
    invoice = await api.invoices.getByAccessToken({ accessToken })
  } catch {
    notFound()
  }

  if (!invoice) notFound()

  return (
    <InvoiceViewClient
      invoice={invoice}
      accessToken={accessToken}
    />
  )
}
