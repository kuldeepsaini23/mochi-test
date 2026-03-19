'use client'

/**
 * Invoice View Client — Public Invoice Display + Payment
 *
 * Renders the full invoice document for the recipient and provides
 * a Stripe PaymentElement for completing payment. Supports three states:
 *  - SENT/OVERDUE: Shows invoice + "Pay Now" button → opens payment modal
 *  - PAID: Shows invoice + green "Paid" confirmation badge
 *
 * Stripe Elements initialisation:
 *  - Uses {mode, amount, currency} approach (same as checkout-client.tsx)
 *  - loadStripe called with connected account's stripeAccount param
 *  - clientSecret obtained on-demand when user submits the form
 *
 * Layout follows the contract public signing page aesthetic —
 * dark sidebar background, centered document card, theme toggle top-right.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceViewClient, PublicInvoiceClient
 */

import { useState, useMemo, useEffect } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { type StripeElementsOptions, type Appearance } from '@stripe/stripe-js'
import { getStripePromise } from '@/lib/stripe/get-stripe-promise'
import { useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { CheckCircle2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ThemeToggle } from '@/components/theme-toggle'
import { InvoicePaymentForm } from './invoice-payment-form'
import type { InvoicePublicData } from '@/services/invoice.service'
import { formatCurrency } from '@/lib/utils'

// getStripePromise imported from @/lib/stripe/get-stripe-promise

// ============================================================================
// HELPERS
// ============================================================================

/** Format an amount in cents to a human-readable currency string.
 *  Delegates to global formatCurrency (SOURCE OF TRUTH) for proper
 *  currency-aware decimals (USD=2, JPY=0, BHD=3) and smart rounding. */
function formatAmount(amountCents: number, currency: string): string {
  return formatCurrency(amountCents, currency)
}

/** Format a date to a readable string */
function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceViewClientProps {
  invoice: InvoicePublicData
  accessToken: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoiceViewClient({ invoice, accessToken }: InvoiceViewClientProps) {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [isPaid, setIsPaid] = useState(invoice.status === 'PAID')
  const { resolvedTheme } = useTheme()
  const searchParams = useSearchParams()

  /**
   * Auto-trigger print dialog when ?print=true is in the URL.
   * Used when opening the invoice from the receipt page "Download Invoice" button.
   */
  useEffect(() => {
    if (searchParams.get('print') === 'true') {
      /* Small delay to ensure the page has fully rendered before printing */
      const timer = setTimeout(() => window.print(), 500)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  /**
   * Handle download/print button click.
   * Uses the browser's native print dialog which supports "Save as PDF".
   */
  const handleDownload = () => {
    window.print()
  }

  /** Stripe promise — only created when connected account exists */
  const stripePromise = useMemo(() => {
    if (!invoice.organization.stripeConnectedAccountId) return null
    return getStripePromise(invoice.organization.stripeConnectedAccountId)
  }, [invoice.organization.stripeConnectedAccountId])

  /** Stripe Elements appearance — matches checkout-client.tsx theme */
  const appearance: Appearance = useMemo(
    () => ({
      theme: resolvedTheme === 'dark' ? 'night' : 'stripe',
      variables: {
        colorPrimary: '#6366f1',
        colorBackground: resolvedTheme === 'dark' ? '#000000' : '#fafafa',
        colorText: resolvedTheme === 'dark' ? '#ffffff' : '#0a0a0a',
        colorTextSecondary: resolvedTheme === 'dark' ? '#a1a1aa' : '#71717a',
        colorTextPlaceholder: '#71717a',
        colorDanger: '#dc2626',
        colorInputBackground: resolvedTheme === 'dark' ? '#1a1a1a' : '#ffffff',
        colorInputBorder: resolvedTheme === 'dark' ? '#3f3f46' : '#e4e4e7',
        borderRadius: '8px',
        spacingUnit: '4px',
        spacingGridRow: '16px',
      },
      rules: {
        '.Input': {
          border: `1px solid ${resolvedTheme === 'dark' ? '#3f3f46' : '#e4e4e7'}`,
          backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
          boxShadow: 'none',
          padding: '10px 12px',
        },
        '.Input:focus': {
          border: '1px solid #6366f1',
          boxShadow: '0 0 0 1px #6366f1',
        },
        '.Input--invalid': {
          border: '1px solid #dc2626',
        },
        '.Label': {
          color: resolvedTheme === 'dark' ? '#ffffff' : '#0a0a0a',
          fontWeight: '500',
          fontSize: '14px',
          marginBottom: '6px',
        },
        '.Tab': {
          border: `1px solid ${resolvedTheme === 'dark' ? '#3f3f46' : '#e4e4e7'}`,
          backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
        },
        '.Tab:hover': {
          backgroundColor: resolvedTheme === 'dark' ? '#1a1a1a' : '#f4f4f5',
        },
        '.Tab--selected': {
          border: '1px solid #6366f1',
          backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
        },
        '.TabLabel': {
          color: resolvedTheme === 'dark' ? '#a1a1aa' : '#71717a',
        },
        '.TabLabel--selected': {
          color: resolvedTheme === 'dark' ? '#ffffff' : '#0a0a0a',
        },
        '.TabIcon': {
          fill: resolvedTheme === 'dark' ? '#a1a1aa' : '#71717a',
        },
        '.TabIcon--selected': {
          fill: '#6366f1',
        },
        '.Block': {
          backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
          border: `1px solid ${resolvedTheme === 'dark' ? '#3f3f46' : '#e4e4e7'}`,
        },
      },
    }),
    [resolvedTheme]
  )

  /**
   * Detect trial and recurring items to determine Elements mode.
   * - Trial items → 'setup' mode (SetupIntent, no charge upfront)
   * - Recurring items → 'subscription' mode
   * - All ONE_TIME, no trial → 'payment' mode (standard PaymentIntent)
   * SOURCE OF TRUTH: InvoiceElementsMode
   */
  const hasTrialItem = invoice.items.some((item) => item.trialDays && item.trialDays > 0)
  const hasRecurringItem = invoice.items.some((item) => item.billingType === 'RECURRING')
  const maxTrialDays = Math.max(0, ...invoice.items.map((item) => item.trialDays ?? 0))

  /** Stripe Elements options — mode depends on billing type + trial */
  const elementsOptions: StripeElementsOptions | null = useMemo(() => {
    if (invoice.totalAmount <= 0) return null

    /** Trial → setup mode (collects payment method without charging) */
    if (hasTrialItem) {
      return {
        mode: 'setup' as const,
        currency: invoice.currency,
        appearance,
      }
    }

    /** Recurring → subscription mode */
    if (hasRecurringItem) {
      return {
        mode: 'subscription' as const,
        amount: invoice.totalAmount,
        currency: invoice.currency,
        appearance,
      }
    }

    /** Standard ONE_TIME → payment mode */
    return {
      mode: 'payment' as const,
      amount: invoice.totalAmount,
      currency: invoice.currency,
      appearance,
    }
  }, [invoice.totalAmount, invoice.currency, appearance, hasTrialItem, hasRecurringItem])

  /** Build recipient display name from lead data */
  const recipientName = invoice.lead
    ? [invoice.lead.firstName, invoice.lead.lastName].filter(Boolean).join(' ') ||
      invoice.lead.email
    : null

  /** Whether the invoice can be paid */
  const isPayable =
    !isPaid &&
    (invoice.status === 'SENT' || invoice.status === 'OVERDUE') &&
    invoice.totalAmount > 0 &&
    !!stripePromise &&
    !!elementsOptions

  /** Handle successful payment — close modal, show paid badge */
  const handlePaymentSuccess = () => {
    setIsPaid(true)
    setPaymentOpen(false)
  }

  return (
    <div data-invoice-print className="min-h-screen bg-muted dark:bg-sidebar flex flex-col relative print:h-auto print:min-h-0 print:overflow-visible print:bg-white print:block">
      {/* Top-right controls — hidden in print */}
      <div className="absolute top-4 right-4 z-10 print:hidden flex items-center gap-2">
        {/* Download/Print button — available for all invoice statuses */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="h-8 rounded-lg text-xs gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
        <div className="[&_button]:h-8 [&_button]:w-8 [&_button]:border-0 [&_button]:bg-transparent">
          <ThemeToggle />
        </div>
      </div>

      {/* Main content — centered invoice card with breathing room */}
      <div className="flex-1 flex items-start justify-center overflow-y-auto py-8 px-4 sm:py-12 sm:px-8 print:py-0 print:px-0 print:overflow-visible">
        <div className="w-full max-w-2xl space-y-6">
          {/* Invoice document — clean card with refined shadow, forced white for print */}
          <div data-invoice-card className="bg-card dark:bg-card rounded-2xl p-8 sm:p-10 space-y-8 print:bg-white print:rounded-none print:shadow-none print:p-0">
            {/* Header — org info + INVOICE title */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {invoice.organization.logo ? (
                  <img
                    src={invoice.organization.logo}
                    alt={invoice.organization.name}
                    className="h-10 w-10 rounded-xl object-cover"
                  />
                ) : (
                  <div data-print="logo-fallback" className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {invoice.organization.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold">{invoice.organization.name}</p>
                  {/* Organization address — shown when set in org settings */}
                  {invoice.organization.address && (
                    <p data-print="muted" className="text-xs text-muted-foreground">{invoice.organization.address}</p>
                  )}
                  {/* Organization contact email — shown when set in org settings */}
                  {invoice.organization.contactEmail && (
                    <p data-print="muted" className="text-xs text-muted-foreground">{invoice.organization.contactEmail}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <h1 data-print="invoice-title" className="text-xl font-bold tracking-tight text-foreground">INVOICE</h1>
                <p data-print="invoice-number" className="text-xs text-muted-foreground font-mono mt-0.5">
                  {invoice.invoiceNumber}
                </p>
              </div>
            </div>

            {/* Status + dates row */}
            <div className="flex items-center justify-between">
              {/* Status badges — refined with subtle border for definition */}
              {isPaid ? (
                <span data-print="badge-paid" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                  <span className="badge-dot w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Paid
                </span>
              ) : invoice.status === 'OVERDUE' ? (
                <span data-print="badge-overdue" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                  <span className="badge-dot w-1.5 h-1.5 rounded-full bg-red-500" />
                  Overdue
                </span>
              ) : (
                <span data-print="badge-sent" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  <span className="badge-dot w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Sent
                </span>
              )}
              <div className="text-right space-y-0.5">
                <p data-print="date-text" className="text-xs text-muted-foreground">
                  <span data-print="date-label" className="text-muted-foreground/60">Issued: </span>
                  {formatDate(invoice.createdAt)}
                </p>
                {invoice.dueDate && (
                  <p data-print="date-text" className="text-xs text-muted-foreground">
                    <span data-print="date-label" className="text-muted-foreground/60">Due: </span>
                    {formatDate(invoice.dueDate)}
                  </p>
                )}
              </div>
            </div>

            {/* Bill To + Pay button row — recipient on left, pay action on right */}
            <div className="flex items-start justify-between gap-4">
              {recipientName ? (
                <div className="space-y-1">
                  <p data-print="section-label" className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">
                    Bill To
                  </p>
                  <div>
                    <p className="text-sm font-medium">{recipientName}</p>
                    {invoice.lead?.email && (
                      <p data-print="muted" className="text-xs text-muted-foreground">{invoice.lead.email}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div />
              )}

              {/* Pay button — positioned to the right of Bill To, hidden in print */}
              {isPayable && (
                <Button
                  size="lg"
                  onClick={() => setPaymentOpen(true)}
                  className="text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-sm shrink-0 print:hidden"
                >
                  {hasTrialItem
                    ? `Start ${maxTrialDays}-day free trial`
                    : `Pay ${formatAmount(invoice.totalAmount, invoice.currency)}`
                  }
                </Button>
              )}

              {/* Stripe not connected — shown inline when no pay button, hidden in print */}
              {!isPaid &&
                !isPayable &&
                (invoice.status === 'SENT' || invoice.status === 'OVERDUE') &&
                !invoice.organization.stripeConnectedAccountId && (
                  <p className="text-xs text-muted-foreground text-right max-w-[200px] print:hidden">
                    Online payment is not available. Please contact the sender.
                  </p>
                )}
            </div>

            {/* Invoice name (only if not "Untitled Invoice") */}
            {invoice.name && invoice.name !== 'Untitled Invoice' && (
              <div>
                <p className="text-sm font-medium text-foreground">{invoice.name}</p>
              </div>
            )}

            {/* Items table — softer borders and rounded corners */}
            {invoice.items.length > 0 && (
              <div className="rounded-xl overflow-hidden">
                {/* Table header */}
                <div data-print="table-header" className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-4 py-2 bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Total</span>
                </div>

                {/* Table rows */}
                {invoice.items.map((item, idx) => (
                  <div
                    key={idx}
                    data-print="item-row"
                    className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-4 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">{item.name}</p>
                      {item.description && (
                        <p data-print="item-description" className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.description}
                        </p>
                      )}
                      {item.billingType !== 'ONE_TIME' && item.interval && (
                        <p data-print="item-description" className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {item.billingType === 'RECURRING' ? 'Recurring' : 'Split'}{' '}
                          / {item.interval.toLowerCase()}
                        </p>
                      )}
                      {/* Trial badge — shows free trial duration for items with trialDays */}
                      {item.trialDays && item.trialDays > 0 && (
                        <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                          {item.trialDays}-day free trial
                        </span>
                      )}
                    </div>
                    <span className="text-right tabular-nums">{item.quantity}</span>
                    <span className="text-right tabular-nums">
                      {formatAmount(item.unitAmount, invoice.currency)}
                    </span>
                    <span className="text-right tabular-nums font-medium">
                      {formatAmount(item.totalAmount, invoice.currency)}
                    </span>
                  </div>
                ))}

                {/* Total row */}
                <div data-print="table-total" className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-4 py-3 bg-muted/30">
                  <span className="text-sm font-semibold col-span-3">Total</span>
                  <span className="text-right text-sm font-bold tabular-nums">
                    {formatAmount(invoice.totalAmount, invoice.currency)}
                  </span>
                </div>
              </div>
            )}

            {/* PAID confirmation badge — larger and more elegant */}
            {isPaid && (
              <div className="flex justify-center">
                <div data-print="paid-stamp" className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl border-2 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/20">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xl font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                    PAID
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Security note — bottom spacing for breathing room */}
          <p className="text-xs text-center text-muted-foreground pb-8 print:hidden">
            Powered by Stripe. Your payment details are never stored.
          </p>

          {/* Payment dialog — rendered with Stripe Elements provider, hidden in print */}
          {isPayable && stripePromise && elementsOptions && (
            <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
              <DialogContent className="sm:max-w-lg print:hidden">
                <DialogHeader>
                  <DialogTitle className="text-lg text-center">
                    {hasTrialItem
                      ? `Start ${maxTrialDays}-day free trial`
                      : `Pay ${formatAmount(invoice.totalAmount, invoice.currency)}`
                    }
                  </DialogTitle>
                </DialogHeader>
                <Elements stripe={stripePromise} options={elementsOptions}>
                  <InvoicePaymentForm
                    accessToken={accessToken}
                    totalAmount={invoice.totalAmount}
                    currency={invoice.currency}
                    customerEmail={invoice.lead?.email ?? undefined}
                    customerName={
                      invoice.lead
                        ? [invoice.lead.firstName, invoice.lead.lastName]
                            .filter(Boolean)
                            .join(' ') || undefined
                        : undefined
                    }
                    onSuccess={handlePaymentSuccess}
                    isTrial={hasTrialItem}
                    trialDays={maxTrialDays}
                  />
                </Elements>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Print styles — forces a clean, formal, white & black invoice     */}
      {/* regardless of light/dark mode. Uses [data-invoice-print] scope   */}
      {/* so overrides only affect this component. The printed PDF always  */}
      {/* looks like a proper formal invoice document on white paper.      */}
      {/* ================================================================ */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* ---- Page setup — clean margins, no browser chrome ---- */
          @page {
            margin: 0.5in;
          }

          /* ---- Force light color scheme on the entire document ---- */
          :root {
            color-scheme: light !important;
          }

          /* ---- Nuclear: force ALL ancestor wrappers to white bg ---- */
          /* This kills the dark:bg-sidebar, body bg, #__next bg, etc. */
          html, body, #__next, #__next > div,
          .dark, [data-theme], [data-theme="dark"] {
            background: #ffffff !important;
            background-color: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* ---- Override dark mode CSS variables for print ---- */
          /* CRITICAL: App uses oklch() format — bare HSL values are invalid! */
          /* Override both :root and .dark to force light-mode palette */
          :root, .dark, [data-theme="dark"] {
            --background: oklch(0.99 0 0) !important;
            --foreground: oklch(0 0 0) !important;
            --card: oklch(1 0 0) !important;
            --card-foreground: oklch(0 0 0) !important;
            --muted: oklch(0.97 0 0) !important;
            --muted-foreground: oklch(0.44 0 0) !important;
            --border: oklch(0.92 0 0) !important;
            --ring: oklch(0 0 0) !important;
            --sidebar: oklch(0.99 0 0) !important;
            --sidebar-foreground: oklch(0 0 0) !important;
            --primary: oklch(0 0 0) !important;
            --primary-foreground: oklch(1 0 0) !important;
            --accent: oklch(0.94 0 0) !important;
            --accent-foreground: oklch(0 0 0) !important;
            --popover: oklch(0.99 0 0) !important;
            --popover-foreground: oklch(0 0 0) !important;
          }

          /* ---- Scoped print overrides — match dark: specificity ---- */
          /* .dark [data-invoice-print] specificity matches .dark .dark\:bg-sidebar */
          .dark [data-invoice-print],
          [data-invoice-print] {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #0a0a0a !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* ---- Force all text inside invoice to be dark ---- */
          [data-invoice-print] p,
          [data-invoice-print] span,
          [data-invoice-print] h1,
          [data-invoice-print] div {
            color: inherit !important;
          }

          /* ---- Invoice card — white bg, no shadow, no decorations ---- */
          [data-invoice-card] {
            background: #ffffff !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            outline: none !important;
          }

          /* ---- Muted / secondary text — visible dark gray ---- */
          [data-invoice-print] [data-print="muted"] {
            color: #525252 !important;
          }
          [data-invoice-print] [data-print="muted-light"] {
            color: #737373 !important;
          }

          /* ---- Table header & total row — subtle gray bg for structure ---- */
          [data-print="table-header"] {
            background: #f5f5f5 !important;
            color: #525252 !important;
          }
          [data-print="table-header"] span {
            color: #525252 !important;
          }
          [data-print="table-total"] {
            background: #f5f5f5 !important;
          }

          /* ---- Status badges — always light-mode colors ---- */
          [data-print="badge-paid"] {
            background: #d1fae5 !important;
            color: #047857 !important;
          }
          [data-print="badge-paid"] span {
            color: #047857 !important;
          }
          [data-print="badge-paid"] .badge-dot {
            background: #10b981 !important;
          }
          [data-print="badge-overdue"] {
            background: #fee2e2 !important;
            color: #b91c1c !important;
          }
          [data-print="badge-overdue"] span {
            color: #b91c1c !important;
          }
          [data-print="badge-overdue"] .badge-dot {
            background: #ef4444 !important;
          }
          [data-print="badge-sent"] {
            background: #dbeafe !important;
            color: #1d4ed8 !important;
          }
          [data-print="badge-sent"] span {
            color: #1d4ed8 !important;
          }
          [data-print="badge-sent"] .badge-dot {
            background: #3b82f6 !important;
          }

          /* ---- PAID stamp — force green on white ---- */
          [data-print="paid-stamp"] {
            background: #ecfdf5 !important;
            border-color: #10b981 !important;
          }
          [data-print="paid-stamp"] span,
          [data-print="paid-stamp"] svg {
            color: #047857 !important;
          }

          /* ---- Logo fallback — light bg ---- */
          [data-print="logo-fallback"] {
            background: #eef2ff !important;
          }
          [data-print="logo-fallback"] span {
            color: #4f46e5 !important;
          }

          /* ---- Item rows — ensure text is black ---- */
          [data-print="item-row"] span {
            color: #0a0a0a !important;
          }
          [data-print="item-row"] p {
            color: #0a0a0a !important;
          }
          [data-print="item-description"] {
            color: #525252 !important;
          }

          /* ---- Dates text — dark gray ---- */
          [data-print="date-text"] {
            color: #525252 !important;
          }
          [data-print="date-label"] {
            color: #737373 !important;
          }

          /* ---- Bill To label ---- */
          [data-print="section-label"] {
            color: #737373 !important;
          }

          /* ---- Invoice title ---- */
          [data-print="invoice-title"] {
            color: #0a0a0a !important;
          }
          [data-print="invoice-number"] {
            color: #525252 !important;
          }

          /* ---- Prevent page breaks inside the invoice ---- */
          [data-invoice-card] {
            page-break-inside: avoid;
          }
        }
      ` }} />
    </div>
  )
}
