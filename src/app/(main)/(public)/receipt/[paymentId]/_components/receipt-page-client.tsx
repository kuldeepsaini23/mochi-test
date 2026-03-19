'use client'

/**
 * Receipt Page Client Wrapper
 *
 * Client component that wraps the PaymentReceipt in a centered page layout.
 * Handles invoice generation via tRPC and passes invoice state to the receipt component.
 *
 * SOURCE OF TRUTH KEYWORDS: ReceiptPageClient, ReceiptPageWrapper
 */

import { useState } from 'react'
import { PaymentReceipt } from '@/components/receipt/payment-receipt'
import { ThemeToggle } from '@/components/theme-toggle'
import { trpc } from '@/trpc/react-provider'
import type { PublicReceiptData } from '@/types/receipt'

interface ReceiptPageClientProps {
  receipt: PublicReceiptData
  /** Payment ID used to generate invoices from this receipt */
  paymentId: string
}

export function ReceiptPageClient({ receipt, paymentId }: ReceiptPageClientProps) {
  /**
   * Track the invoice access token locally — starts from server data
   * and updates when a new invoice is generated.
   */
  const [invoiceAccessToken, setInvoiceAccessToken] = useState<string | null>(
    receipt.invoiceAccessToken
  )

  /** tRPC mutation for generating an invoice from this receipt */
  const generateInvoice = trpc.invoices.generateFromReceipt.useMutation({
    onSuccess: (data) => {
      setInvoiceAccessToken(data.accessToken)
    },
  })

  /**
   * Handle "Generate Invoice" button click.
   * Calls the backend to create a PAID invoice from this payment receipt.
   */
  const handleGenerateInvoice = () => {
    generateInvoice.mutate({ paymentId })
  }

  /**
   * Handle "Download Invoice" button click.
   * Opens the invoice public view in a new tab for printing/downloading.
   */
  const handleDownloadInvoice = () => {
    if (invoiceAccessToken) {
      window.open(`/invoice/${invoiceAccessToken}?print=true`, '_blank')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-muted dark:bg-sidebar">
      {/* Theme toggle — top right corner */}
      <div className="fixed top-4 right-4 z-20 print:hidden">
        <ThemeToggle />
      </div>

      {/* Receipt card with invoice generation capabilities */}
      <PaymentReceipt
        receipt={receipt}
        invoiceAccessToken={invoiceAccessToken}
        onGenerateInvoice={handleGenerateInvoice}
        onDownloadInvoice={handleDownloadInvoice}
        isGeneratingInvoice={generateInvoice.isPending}
      />
    </div>
  )
}
