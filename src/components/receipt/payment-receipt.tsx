/**
 * Payment Receipt Component
 *
 * Reusable receipt display for individual payments.
 * Can be used in public routes, website builder, internal pages, or anywhere.
 *
 * DESIGN: Rounded, modern, minimal — matching pipeline ticket card styling.
 * - Uses the same ring-1 ring-border + dark:bg-muted/40 pattern as ticket cards
 * - Compact, flowing layout — no heavy separators or boxy sections
 * - Big total amount at the top (hero style)
 * - Subtle grouped sections with rounded inner containers
 * - MarqueeFade on scrollable product list
 * - Staged animation: header first, then card stretches to reveal products
 * - Full dark mode support via shadcn tokens
 *
 * SECURITY: Only displays sanitized PublicReceiptData — zero PII.
 *
 * SOURCE OF TRUTH KEYWORDS: PaymentReceipt, ReceiptComponent, ReceiptDisplay
 */

'use client'

import { useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Package, Download, RotateCcw, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { cn, formatCurrency } from '@/lib/utils'
import { BILLING_TYPES } from '@/constants/billing'
import type { PublicReceiptData } from '@/types/receipt'

// ============================================================================
// INTERNAL FORMATTERS
// ============================================================================

/**
 * Format a date for receipt display.
 * Self-contained — no dependency on dashboard utils for reusability.
 */
function formatReceiptDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format billing type as a human-readable label.
 */
function formatBillingLabel(billingType: string): string {
  switch (billingType) {
    case BILLING_TYPES.ONE_TIME:
      return 'One-time'
    case BILLING_TYPES.RECURRING:
      return 'Subscription'
    case BILLING_TYPES.SPLIT_PAYMENT:
      return 'Installments'
    default:
      return billingType
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Max height for the scrollable product list before it clips */
const ITEMS_MAX_HEIGHT = 240

// ============================================================================
// COMPONENT
// ============================================================================

interface PaymentReceiptProps {
  /** Sanitized receipt data (no PII) */
  receipt: PublicReceiptData
  /** Optional class for outer container */
  className?: string
  /** Access token of the linked invoice (null if not generated yet) */
  invoiceAccessToken?: string | null
  /** Callback to generate an invoice from this receipt */
  onGenerateInvoice?: () => void
  /** Callback to download/view the linked invoice */
  onDownloadInvoice?: () => void
  /** Whether the invoice is currently being generated */
  isGeneratingInvoice?: boolean
}

/**
 * PaymentReceipt — Pure presentational component.
 *
 * Takes receipt data as props and renders a beautiful receipt card.
 * No data fetching, no business logic, no side effects.
 *
 * ANIMATION SEQUENCE:
 * 1. Card fades in with header content (amount, date, billing type)
 * 2. After ~1s delay, card stretches downward to reveal product list + footer
 * 3. Individual product rows slide in left→right with motion blur
 */
export function PaymentReceipt({
  receipt,
  className,
  invoiceAccessToken,
  onGenerateInvoice,
  onDownloadInvoice,
  isGeneratingInvoice = false,
}: PaymentReceiptProps) {
  const hasRefund = receipt.refundedAmount > 0
  const netAmount = receipt.amount - receipt.refundedAmount
  const isFullyRefunded = receipt.refundedAmount >= receipt.amount

  /** Scroll state for MarqueeFade on the product list */
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  /**
   * Track scroll position to toggle fade edges.
   * Top fade shows when scrolled down, bottom fade shows when more content below.
   */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowTopFade(el.scrollTop > 4)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }, [])

  /**
   * Measure whether the product list overflows on mount
   * to decide if bottom fade is needed initially.
   */
  const measureOverflow = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    ;(scrollRef as React.MutableRefObject<HTMLDivElement>).current = node
    /* Small delay so the DOM has rendered item content */
    requestAnimationFrame(() => {
      setShowBottomFade(node.scrollHeight > node.clientHeight + 4)
    })
  }, [])

  /**
   * Build the payment label based on billing type.
   * ONE_TIME: just "Payment" — no numbering needed
   * SPLIT_PAYMENT: "Payment 2 of 5"
   * RECURRING: "Payment #3" — no "of" since total is unlimited
   */
  const paymentLabel =
    receipt.billingType === BILLING_TYPES.ONE_TIME
      ? 'Payment'
      : receipt.billingType === BILLING_TYPES.SPLIT_PAYMENT && receipt.totalPayments > 1
        ? `Payment ${receipt.paymentNumber} of ${receipt.totalPayments}`
        : `Payment #${receipt.paymentNumber}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn('w-full max-w-sm', className)}
    >
      {/* ================================================================ */}
      {/* Outer card — matches pipeline ticket card styling                */}
      {/* ================================================================ */}
      <div
        className={cn(
          'dark:bg-muted/40 backdrop-blur-lg bg-card rounded-2xl',
          'dark:border-t dark:ring-background',
          'p-5 dark:ring-1 dark:shadow-sm ring-1 ring-border',
          'overflow-hidden',
        )}
      >
        {/* ============================================================ */}
        {/* Hero — Big total amount + payment info                       */}
        {/* Renders immediately when card appears                        */}
        {/* ============================================================ */}
        <motion.div
          initial={{ opacity: 0, x: -10, filter: 'blur(3px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mb-5"
        >
          <p className="text-xs text-muted-foreground mb-1">
            {paymentLabel}
          </p>
          <p
            className={cn(
              'text-3xl font-bold tracking-tight',
              isFullyRefunded
                ? 'text-red-600 dark:text-red-400 line-through'
                : 'text-foreground'
            )}
          >
            {formatCurrency(netAmount, receipt.currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {receipt.paidAt ? formatReceiptDate(receipt.paidAt) : 'Pending'}
            {' \u00B7 '}
            {formatBillingLabel(receipt.billingType)}
          </p>
        </motion.div>

        {/* ============================================================ */}
        {/* Body — stretches in after ~1s delay                          */}
        {/* ============================================================ */}
        <AnimatePresence>
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={{
              height: { duration: 0.6, delay: 0.9, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.4, delay: 1.1, ease: 'easeOut' },
            }}
            className="overflow-hidden"
          >
            {/* Refund notice (if applicable) */}
            {hasRefund && (
              <motion.div
                initial={{ opacity: 0, x: -10, filter: 'blur(3px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.35, delay: 1.3, ease: [0.16, 1, 0.3, 1] }}
                className="mb-4 rounded-xl bg-red-500/5 dark:bg-red-500/10 ring-1 ring-red-500/10 px-3.5 py-2.5 flex items-center justify-between"
              >
                <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <RotateCcw className="h-3 w-3" />
                  {isFullyRefunded ? 'Fully refunded' : 'Partially refunded'}
                </span>
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  -{formatCurrency(receipt.refundedAmount, receipt.currency)}
                </span>
              </motion.div>
            )}

            {/* Items label — outside the container */}
            <motion.p
              initial={{ opacity: 0, x: -8, filter: 'blur(2px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.3, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-[11px] font-medium text-muted-foreground mb-2 px-0.5"
            >
              Items
            </motion.p>

            {/* ======================================================== */}
            {/* Items container — scrollable with MarqueeFade             */}
            {/* ======================================================== */}
            <motion.div
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.4, delay: 1.3, ease: 'easeOut' }}
              className="rounded-xl bg-muted/50 dark:bg-background/30 ring-1 ring-border/50 overflow-hidden"
            >
              <MarqueeFade
                showTopFade={showTopFade}
                showBottomFade={showBottomFade}
                fadeHeight={20}
              >
                <div
                  ref={measureOverflow}
                  onScroll={handleScroll}
                  className="overflow-y-auto"
                  style={{ maxHeight: ITEMS_MAX_HEIGHT }}
                >
                  {receipt.items.map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -12, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                      transition={{
                        duration: 0.35,
                        delay: 1.4 + index * 0.08,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className={cn(
                        'flex items-center gap-3 px-3.5 py-2.5',
                        index < receipt.items.length - 1 && 'border-b border-border/30'
                      )}
                    >
                      {/* Product image */}
                      {item.productImage ? (
                        <Avatar className="h-8 w-8 rounded-lg">
                          <AvatarImage
                            src={item.productImage}
                            alt={item.productName}
                            className="object-cover"
                          />
                          <AvatarFallback className="rounded-lg bg-muted">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {item.priceName}
                          {item.quantity > 1 && ` \u00D7 ${item.quantity}`}
                        </p>
                      </div>

                      {/* Amount */}
                      <p className="text-sm font-medium shrink-0">
                        {formatCurrency(item.totalAmount, receipt.currency)}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </MarqueeFade>
            </motion.div>

            {/* Original amount (only shown when refunded) */}
            {hasRefund && (
              <motion.div
                initial={{ opacity: 0, x: -8, filter: 'blur(2px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.3, delay: 1.6, ease: [0.16, 1, 0.3, 1] }}
                className="mt-3 px-1 flex items-center justify-between"
              >
                <span className="text-xs text-muted-foreground">Original amount</span>
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(receipt.amount, receipt.currency)}
                </span>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* Footer — Download + meta                                 */}
            {/* ======================================================== */}
            <motion.div
              initial={{ opacity: 0, x: -8, filter: 'blur(2px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.35, delay: 1.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 space-y-3"
            >
              {/* Invoice action buttons — generate or download depending on state */}
              {invoiceAccessToken ? (
                /* Invoice exists — show download button */
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl h-9 text-xs"
                  onClick={onDownloadInvoice}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download Invoice
                </Button>
              ) : onGenerateInvoice ? (
                /* No invoice yet — show generate button */
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl h-9 text-xs"
                  onClick={onGenerateInvoice}
                  disabled={isGeneratingInvoice}
                >
                  {isGeneratingInvoice ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {isGeneratingInvoice ? 'Generating...' : 'Generate Invoice'}
                </Button>
              ) : null}
              <p className="text-[10px] text-muted-foreground/60 text-center">
                {formatReceiptDate(receipt.createdAt)}
              </p>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
