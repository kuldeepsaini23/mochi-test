/**
 * ============================================================================
 * UNIFIED RECEIPT ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedReceipt, unified-receipt, receipt-element-unified
 *
 * This component handles BOTH canvas and preview/published modes using the
 * SAME PaymentReceipt component. Zero code drift between canvas and live.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * BOTH MODES use the real PaymentReceipt component. Theme is forced via
 * inline CSS variable overrides on the wrapper div (RECEIPT_THEME_VARS).
 * The wrapper always has `className="dark"` so `dark:` Tailwind variants
 * fire, but the CSS variables they resolve through are overridden to match
 * the target theme. 100% self-contained — no global CSS changes needed.
 *
 * CANVAS MODE (mode='canvas'):
 *   - Renders PaymentReceipt with MOCK_RECEIPT_DATA (sample products/amounts)
 *   - No data fetching, no tRPC calls, no animations
 *   - Non-interactive — just a visual preview in the builder
 *
 * PREVIEW MODE (mode='preview'):
 *   - PRIMARY: Reads receipt data from sessionStorage (instant, no server wait)
 *   - FALLBACK: Reads `transactionId` from URL params → DB query for backward compat
 *   - Invoice workflow: Generate Invoice → Download Invoice (once webhook processes)
 *
 * ============================================================================
 * DATA STRATEGY (instant display via sessionStorage)
 * ============================================================================
 *
 * After Stripe payment, the payment/checkout element writes receipt display
 * data to sessionStorage BEFORE redirecting. This receipt element reads it
 * instantly on mount — no webhook wait, no realtime SSE, no polling.
 *
 * sessionStorage is same-origin only (no cross-site access), ephemeral
 * (clears on tab close), and contains zero PII. The authoritative data
 * lives in the DB via webhooks — sessionStorage is a fast display optimization.
 *
 * Backward compatibility: Old links with ?transactionId=xxx still work
 * via a DB query fallback (simple fetch with retry, no realtime).
 *
 * ============================================================================
 */

'use client'

import React, { useState, useEffect, useCallback, memo } from 'react'
import {
  Receipt,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import type { ReceiptElement as ReceiptElementType, Breakpoint } from '../../_lib/types'
import {
  computeElementPositionStyles,
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'
import { PaymentReceipt } from '@/components/receipt/payment-receipt'
import { trpc } from '@/trpc/react-provider'
import type { PublicReceiptData } from '@/types/receipt'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum height for placeholder states (loading, empty, error) */
const PLACEHOLDER_MIN_HEIGHT = 300

/** sessionStorage key for receipt display data written by payment/checkout elements */
const RECEIPT_STORAGE_KEY = 'mochi_receipt'

/**
 * Mock receipt data for canvas mode.
 * Uses the SAME PaymentReceipt component as live mode — zero visual drift.
 * Any design updates to PaymentReceipt automatically apply to both modes.
 *
 * SOURCE OF TRUTH: MockReceiptData, CanvasMockReceipt
 */
const MOCK_RECEIPT_DATA: PublicReceiptData = {
  paymentId: '',
  paymentNumber: 1,
  paidAt: new Date().toISOString(),
  amount: 9900,
  refundedAmount: 0,
  currency: 'usd',
  billingType: 'ONE_TIME',
  totalPayments: 1,
  items: [
    {
      productName: 'Pro Plan',
      productImage: null,
      priceName: 'Monthly',
      quantity: 1,
      unitAmount: 7900,
      totalAmount: 7900,
      billingType: 'RECURRING',
      interval: 'MONTH',
      intervalCount: 1,
    },
    {
      productName: 'Setup Fee',
      productImage: null,
      priceName: 'One-time',
      quantity: 1,
      unitAmount: 2000,
      totalAmount: 2000,
      billingType: 'ONE_TIME',
      interval: null,
      intervalCount: null,
    },
  ],
  createdAt: new Date().toISOString(),
  invoiceAccessToken: null,
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedReceipt component.
 *
 * SOURCE OF TRUTH: UnifiedReceiptProps
 */
interface UnifiedReceiptProps {
  /** The receipt element data — SOURCE OF TRUTH: ReceiptElement from types.ts */
  element: ReceiptElementType
}

// ============================================================================
// THEME WRAPPER — Forces light/dark via inline CSS variable overrides
// ============================================================================

/**
 * CSS variable overrides for each theme. Applied as inline styles on the
 * wrapper div so PaymentReceipt's Tailwind classes (bg-card, text-foreground,
 * bg-muted, ring-border, etc.) resolve to the correct theme colors — even
 * when the page's global theme is the opposite.
 *
 * Values are copied from :root (light) and .dark in globals.css.
 * We ALSO set `color` so children that don't have an explicit text-color
 * class (product name, button text) inherit the correct foreground.
 *
 * SOURCE OF TRUTH: ReceiptThemeVars, receipt-theme-inline-overrides
 */
const RECEIPT_THEME_VARS: Record<'light' | 'dark', React.CSSProperties> = {
  light: {
    /* Explicit color so children inherit light foreground (not dark body's white) */
    color: 'oklch(0 0 0)',
    /* CSS variable overrides — mirrors :root values from globals.css */
    '--background': 'oklch(0.99 0 0)',
    '--foreground': 'oklch(0 0 0)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0 0 0)',
    '--primary': 'oklch(0 0 0)',
    '--primary-foreground': 'oklch(1 0 0)',
    '--secondary': 'oklch(0.94 0 0)',
    '--secondary-foreground': 'oklch(0 0 0)',
    '--muted': 'oklch(0.97 0 0)',
    '--muted-foreground': 'oklch(0.44 0 0)',
    '--accent': 'oklch(0.94 0 0)',
    '--accent-foreground': 'oklch(0 0 0)',
    '--destructive': 'oklch(0.63 0.19 23.03)',
    '--destructive-foreground': 'oklch(1 0 0)',
    '--border': 'oklch(0.92 0 0)',
    '--input': 'oklch(0.94 0 0)',
    '--ring': 'oklch(0 0 0)',
  } as React.CSSProperties,
  dark: {
    color: 'oklch(1 0 0)',
    '--background': 'oklch(0 0 0)',
    '--foreground': 'oklch(1 0 0)',
    '--card': 'oklch(0.14 0 0)',
    '--card-foreground': 'oklch(1 0 0)',
    '--primary': 'oklch(1 0 0)',
    '--primary-foreground': 'oklch(0 0 0)',
    '--secondary': 'oklch(0.25 0 0)',
    '--secondary-foreground': 'oklch(1 0 0)',
    '--muted': 'oklch(0.23 0 0)',
    '--muted-foreground': 'oklch(0.72 0 0)',
    '--accent': 'oklch(0.32 0 0)',
    '--accent-foreground': 'oklch(1 0 0)',
    '--destructive': 'oklch(0.69 0.2 23.91)',
    '--destructive-foreground': 'oklch(0 0 0)',
    '--border': 'oklch(0.26 0 0)',
    '--input': 'oklch(0.32 0 0)',
    '--ring': 'oklch(0.72 0 0)',
  } as React.CSSProperties,
}

/**
 * Wraps PaymentReceipt in a div that forces the correct theme regardless
 * of the page's global theme setting.
 *
 * HOW IT WORKS:
 * - Always keeps `className="dark"` so Tailwind's `dark:` variants fire
 *   (the builder dashboard is always dark, and `dark:` variants in
 *   PaymentReceipt are the "styled" path — we WANT them to activate)
 * - Overrides ALL CSS custom properties via inline styles to match the
 *   target theme. Since `dark:bg-muted/40`, `text-foreground`, `ring-border`
 *   etc. all resolve through CSS variables, overriding the variables forces
 *   the correct visual output regardless of the global theme.
 * - Sets explicit `color` so children that inherit text color (product names,
 *   button text) get the correct foreground instead of body's dark-mode white.
 *
 * This approach is 100% self-contained — ZERO global CSS changes needed.
 *
 * SOURCE OF TRUTH: ReceiptThemeWrapper
 */
function ReceiptThemeWrapper({
  theme,
  children,
}: {
  theme: 'light' | 'dark'
  children: React.ReactNode
}) {
  return (
    <div
      className="dark"
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        padding: 16,
        colorScheme: theme,
        ...RECEIPT_THEME_VARS[theme],
      }}
    >
      {children}
    </div>
  )
}

// ============================================================================
// PREVIEW RECEIPT — Instant display via sessionStorage + DB fallback
// ============================================================================

/**
 * Preview/published mode receipt component.
 * Uses the REAL PaymentReceipt component with full invoice generation support.
 *
 * DATA STRATEGY (2-tier):
 * 1. PRIMARY — sessionStorage: Payment/checkout element writes receipt data
 *    before redirecting. This component reads it instantly on mount.
 *    No server round-trip, no webhook wait, no spinner.
 * 2. FALLBACK — DB query: For backward compatibility with old links that
 *    have ?transactionId=xxx. Simple tRPC fetch with retry (no realtime/SSE).
 *
 * INVOICE SUPPORT:
 * - Uses tRPC `invoices.generateFromReceipt` mutation
 * - Tracks invoiceAccessToken in local state
 * - Invoice button only shown when paymentId is available (DB path only,
 *   since sessionStorage path doesn't have a TransactionPayment yet)
 *
 * SOURCE OF TRUTH: PreviewReceipt, ReceiptSessionStorageStrategy
 */
function PreviewReceipt({ theme }: { theme: 'light' | 'dark' }) {
  const searchParams = useSearchParams()
  const transactionId = searchParams.get('transactionId')

  /**
   * Receipt data from sessionStorage — set on mount if available.
   * This is the PRIMARY data source for instant display.
   */
  const [sessionData, setSessionData] = useState<PublicReceiptData | null>(null)

  /**
   * Track the invoice access token locally.
   * Starts from the receipt data (may already have an invoice),
   * updates when a new invoice is generated.
   */
  const [localInvoiceToken, setLocalInvoiceToken] = useState<string | null>(null)

  /**
   * On mount, try to read receipt data from sessionStorage.
   * Written by unified-payment.tsx or unified-checkout.tsx before redirect.
   * Cleared after reading to prevent stale data on future page visits.
   */
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(RECEIPT_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as PublicReceiptData
        setSessionData(parsed)
        sessionStorage.removeItem(RECEIPT_STORAGE_KEY)
      }
    } catch {
      /* Parse failure is non-critical — falls through to DB fallback */
    }
  }, [])

  /**
   * FALLBACK: Fetch receipt data via tRPC when no sessionStorage data exists
   * but transactionId is in the URL (backward compatibility for old links).
   * Retries up to 3 times with 2s intervals to handle webhook processing delay.
   */
  const { data: dbData, isLoading: isDbLoading, isError: isDbError } = trpc.transactions.getReceiptByTransaction.useQuery(
    { transactionId: transactionId ?? '' },
    {
      enabled: !!transactionId && !sessionData,
      retry: 3,
      retryDelay: 2000,
    }
  )

  /** The effective receipt data — sessionStorage takes priority over DB */
  const receiptData = sessionData ?? dbData ?? null

  /**
   * Sync invoiceAccessToken from server data when receipt loads.
   * The receipt may already have a linked invoice from a previous visit.
   */
  useEffect(() => {
    if (dbData?.invoiceAccessToken) {
      setLocalInvoiceToken(dbData.invoiceAccessToken)
    }
  }, [dbData?.invoiceAccessToken])

  /**
   * tRPC mutation for generating an invoice from this receipt.
   * On success, updates localInvoiceToken so the button switches to "Download".
   */
  const generateInvoice = trpc.invoices.generateFromReceipt.useMutation({
    onSuccess: (result) => {
      setLocalInvoiceToken(result.accessToken)
    },
  })

  /**
   * Handle "Generate Invoice" button click.
   * Only available when paymentId exists (DB path — webhook has processed).
   * sessionStorage path won't have paymentId since TransactionPayment
   * doesn't exist until the webhook fires.
   */
  const handleGenerateInvoice = useCallback(() => {
    const paymentId = receiptData?.paymentId
    if (paymentId) {
      generateInvoice.mutate({ paymentId })
    }
  }, [receiptData?.paymentId, generateInvoice])

  /**
   * Handle "Download Invoice" button click.
   * Opens the invoice public view in a new tab for printing/downloading.
   */
  const handleDownloadInvoice = useCallback(() => {
    if (localInvoiceToken) {
      window.open(`/invoice/${localInvoiceToken}?print=true`, '_blank')
    }
  }, [localInvoiceToken])

  // ========================================================================
  // STATE 1: No data source at all — show empty state
  // ========================================================================
  if (!transactionId && !sessionData) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: PLACEHOLDER_MIN_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 12,
        }}
      >
        <Receipt className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground/60 text-center">
          Complete a payment to see your receipt here
        </p>
      </div>
    )
  }

  // ========================================================================
  // STATE 2: Data loaded — render real PaymentReceipt with invoice support
  // ========================================================================
  if (receiptData) {
    /**
     * Determine the effective invoice token.
     * Priority: local state (from mutation) → server data (from DB).
     */
    const effectiveInvoiceToken = localInvoiceToken ?? receiptData.invoiceAccessToken

    /**
     * Invoice generation requires a paymentId (TransactionPayment record).
     * sessionStorage path won't have this yet — hide invoice button.
     * DB path will have it after webhook processes.
     */
    const hasPaymentId = !!receiptData.paymentId

    return (
      <ReceiptThemeWrapper theme={theme}>
        <PaymentReceipt
          receipt={receiptData}
          invoiceAccessToken={effectiveInvoiceToken}
          onGenerateInvoice={hasPaymentId ? handleGenerateInvoice : undefined}
          onDownloadInvoice={handleDownloadInvoice}
          isGeneratingInvoice={generateInvoice.isPending}
        />
      </ReceiptThemeWrapper>
    )
  }

  // ========================================================================
  // STATE 3: DB fallback loading — waiting for tRPC query
  // ========================================================================
  if (isDbLoading) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: PLACEHOLDER_MIN_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 12,
        }}
      >
        <Loader2 className="h-8 w-8 text-primary/60 animate-spin" />
        <p className="text-sm text-muted-foreground/80">
          Loading your receipt...
        </p>
      </div>
    )
  }

  // ========================================================================
  // STATE 4: DB fallback error — query failed after retries
  // ========================================================================
  if (isDbError) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: PLACEHOLDER_MIN_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 12,
        }}
      >
        <AlertCircle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm text-muted-foreground/80 text-center">
          Unable to load receipt
        </p>
        <p className="text-xs text-muted-foreground/50 text-center">
          Please refresh the page to try again.
        </p>
      </div>
    )
  }

  // ========================================================================
  // STATE 5: Waiting — should not normally reach here
  // ========================================================================
  return (
    <div
      style={{
        width: '100%',
        minHeight: PLACEHOLDER_MIN_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 12,
      }}
    >
      <Loader2 className="h-8 w-8 text-primary/60 animate-spin" />
      <p className="text-sm text-muted-foreground/80">
        Loading your receipt...
      </p>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Unified receipt element that renders in both canvas and preview modes.
 *
 * BOTH modes use the SAME PaymentReceipt component — zero code drift.
 * Theme is forced via ReceiptThemeWrapper (Tailwind class-based dark mode).
 * Canvas uses MOCK_RECEIPT_DATA, preview uses real sessionStorage/DB data.
 *
 * SOURCE OF TRUTH: UnifiedReceipt, ReceiptUnifiedComponent
 */
export const UnifiedReceipt = memo(function UnifiedReceipt({ element }: UnifiedReceiptProps) {
  const { mode, breakpoint } = useRenderMode()
  const isPreview = mode === 'preview'

  /**
   * Determine the active breakpoint for responsive style resolution.
   * Canvas always uses 'desktop'; preview uses the context breakpoint.
   */
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  /** Get theme from element, default to dark */
  const theme = element.theme ?? 'dark'

  // ==========================================================================
  // CANVAS MODE — Real PaymentReceipt with mock data (ElementWrapper handles chrome)
  // ==========================================================================

  if (!isPreview) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: 'fit-content',
          backgroundColor: element.styles?.backgroundColor as string ?? 'transparent',
          borderRadius: element.styles?.borderRadius as number ?? 8,
          overflow: 'hidden',
        }}
      >
        <ReceiptThemeWrapper theme={theme}>
          <PaymentReceipt receipt={MOCK_RECEIPT_DATA} />
        </ReceiptThemeWrapper>
      </div>
    )
  }

  // ==========================================================================
  // PREVIEW MODE — Positioned wrapper with real receipt data
  // ==========================================================================

  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    autoWidthDefault: false,
    autoHeightDefault: true,
  })

  const containerStyle: React.CSSProperties = {
    ...positionStyles,
    ...sizeStyles,
    backgroundColor: element.styles?.backgroundColor as string ?? 'transparent',
    borderRadius: element.styles?.borderRadius as number ?? 8,
    overflow: 'visible',
  }

  return (
    <div data-receipt-element-id={element.id} style={containerStyle}>
      <PreviewReceipt theme={theme} />
    </div>
  )
})

// ============================================================================
// META HOOK — Size styles for canvas wrapper
// ============================================================================

/**
 * Hook to compute receipt-specific size styles for the canvas wrapper.
 *
 * SOURCE OF TRUTH: useUnifiedReceiptMeta, receipt-meta-hook
 *
 * Returns size style overrides that the CanvasReceiptElement wrapper passes
 * to ElementWrapper as `sizeStyleOverrides`. Receipts use autoHeight by default
 * because receipt content varies based on the number of line items.
 */
export function useUnifiedReceiptMeta(element: ReceiptElementType) {
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: true,
  })

  return { sizeStyles }
}
