/**
 * Transaction Detail — Mini Dashboard Layout
 *
 * Single-column layout with a hero stat area showing TOTAL PAID,
 * items with billing type badges, customer info, financial summary,
 * and a minimal activity feed at the bottom.
 *
 * All logic, mutations, state, and hooks preserved.
 * Only the rendering and a few derived values changed.
 *
 * SOURCE OF TRUTH KEYWORDS: TransactionDetail, TransactionView
 */

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Package, Mail, Phone, ExternalLink, MapPin, RotateCcw, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { permissions } from '@/lib/better-auth/permissions'
import {
  formatCurrency,
  getStatusDisplay,
  getRefundStatusDisplay,
  formatDateTime,
  getCustomerDisplayName,
  getCustomerInitials,
  formatBillingType,
} from '../../_components/utils'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import { BILLING_TYPES } from '@/constants/billing'
import type { TransactionPaymentStatus } from '@/generated/prisma'
import type { TransactionWithRelations, TransactionItem } from '@/types/transaction'
import { CancelTransactionDialog } from './cancel-dialogs'
import { RefundTransactionDialog, RefundPaymentDialog } from './refund-dialogs'
import { ActivityFeed } from './payment-stepper'
import { useRefundValidation } from './use-refund-validation'
import { useDashboardCache } from '@/hooks/use-dashboard-cache'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Status dot color — 4 states only: green, red, amber, gray.
 * Used in the hero subtitle status indicator.
 */
function getStatusDotColor(status: string): string {
  switch (status) {
    case 'PAID':
    case 'ACTIVE':
      return 'bg-emerald-500'
    case 'FAILED':
    case 'DISPUTED':
      return 'bg-destructive'
    case 'TRIALING':
      return 'bg-violet-500'
    case 'PARTIALLY_PAID':
    case 'AWAITING_PAYMENT':
      return 'bg-amber-500'
    default:
      return 'bg-muted-foreground/40'
  }
}

/**
 * Derives a human-readable billing label for an item.
 * Used to show badges like "Monthly", "Yearly", "3 Installments", "One-time".
 */
function getItemBillingLabel(item: TransactionItem): string {
  if (item.billingType === 'ONE_TIME') return 'One-time'
  if (item.billingType === 'SPLIT_PAYMENT') {
    return item.installments ? `${item.installments} Installments` : 'Installments'
  }
  /* RECURRING — derive from interval */
  const count = item.intervalCount || 1
  switch (item.interval) {
    case 'MONTH':
      return count > 1 ? `Every ${count} months` : 'Monthly'
    case 'YEAR':
      return count > 1 ? `Every ${count} years` : 'Yearly'
    case 'WEEK':
      return count > 1 ? `Every ${count} weeks` : 'Weekly'
    case 'DAY':
      return count > 1 ? `Every ${count} days` : 'Daily'
    default:
      return 'Recurring'
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

interface TransactionDetailProps {
  transaction: TransactionWithRelations
  organizationId: string
  userRole: string
  userPermissions: string[]
}

export function TransactionDetail({
  transaction: initialTransaction,
  organizationId,
  userRole,
  userPermissions,
}: TransactionDetailProps) {
  const utils = trpc.useUtils()
  const { invalidateRevenueCharts } = useDashboardCache()

  const canCancel = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.TRANSACTIONS_CANCEL),
    [userRole, userPermissions]
  )
  const canRefund = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.TRANSACTIONS_REFUND),
    [userRole, userPermissions]
  )

  const [transaction, setTransaction] = useState(initialTransaction)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundPaymentDialogOpen, setRefundPaymentDialogOpen] = useState(false)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [refundReason, setRefundReason] = useState<'duplicate' | 'fraudulent' | 'requested_by_customer'>(
    'requested_by_customer'
  )

  const transactionRefundableAmount = transaction.paidAmount - transaction.refundedAmount
  const transactionRefund = useRefundValidation(transactionRefundableAmount)
  const selectedPayment = selectedPaymentId ? transaction.payments.find((p) => p.id === selectedPaymentId) : null
  const paymentRefundableAmount = selectedPayment ? selectedPayment.amount - selectedPayment.refundedAmount : 0
  const paymentRefund = useRefundValidation(paymentRefundableAmount)

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  const cancelMutation = trpc.transactions.cancel.useMutation({
    onMutate: async () => {
      setTransaction((prev) => ({ ...prev, paymentStatus: 'CANCELED' as TransactionPaymentStatus, canceledAt: new Date() }))
    },
    onError: () => { setTransaction(initialTransaction); toast.error('Failed to cancel transaction') },
    onSuccess: () => {
      toast.success('Transaction canceled')
      utils.transactions.list.invalidate()
      utils.transactions.getById.invalidate({ organizationId, transactionId: transaction.id })
      invalidateRevenueCharts()
    },
    onSettled: () => setCancelDialogOpen(false),
  })

  const refundTransactionMutation = trpc.transactions.refundTransaction.useMutation({
    onSuccess: () => {
      toast.success('Refund processed in Stripe. Status will update shortly via webhook.')
      utils.transactions.list.invalidate()
      utils.transactions.getById.invalidate({ organizationId, transactionId: transaction.id })
      invalidateRevenueCharts()
      setRefundDialogOpen(false)
      transactionRefund.resetAmount()
    },
    onError: (error) => toast.error(error.message || 'Failed to process refund in Stripe'),
  })

  const refundPaymentMutation = trpc.transactions.refundPayment.useMutation({
    onSuccess: () => {
      toast.success('Refund processed in Stripe. Status will update shortly via webhook.')
      utils.transactions.list.invalidate()
      utils.transactions.getById.invalidate({ organizationId, transactionId: transaction.id })
      invalidateRevenueCharts()
      setRefundPaymentDialogOpen(false)
      setSelectedPaymentId(null)
      paymentRefund.resetAmount()
    },
    onError: (error) => toast.error(error.message || 'Failed to process refund in Stripe'),
  })

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleRefundTransaction = () => {
    const amount = transactionRefund.amount ? Math.round(parseFloat(transactionRefund.amount) * 100) : undefined
    refundTransactionMutation.mutate({ organizationId, transactionId: transaction.id, amount, reason: refundReason })
  }

  const handleRefundPayment = () => {
    if (!selectedPaymentId) return
    const amount = paymentRefund.amount ? Math.round(parseFloat(paymentRefund.amount) * 100) : undefined
    refundPaymentMutation.mutate({ organizationId, transactionId: transaction.id, paymentId: selectedPaymentId, amount, reason: refundReason })
  }

  const openPaymentRefundDialog = (paymentId: string) => {
    setSelectedPaymentId(paymentId)
    paymentRefund.resetAmount()
    setRefundReason('requested_by_customer')
    setRefundPaymentDialogOpen(true)
  }

  const openTransactionRefundDialog = () => {
    transactionRefund.resetAmount()
    setRefundReason('requested_by_customer')
    setRefundDialogOpen(true)
  }

  /**
   * Copy receipt link to clipboard.
   * Uses execCommand('copy') as primary — navigator.clipboard is undefined on non-HTTPS.
   */
  const copyReceiptLink = (paymentId: string) => {
    const receiptUrl = `${window.location.origin}/receipt/${paymentId}`
    const input = document.createElement('input')
    input.setAttribute('value', receiptUrl)
    input.style.position = 'fixed'
    input.style.left = '0'
    input.style.top = '0'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)
    input.select()
    input.setSelectionRange(0, receiptUrl.length)
    try {
      const successful = document.execCommand('copy')
      if (successful) {
        toast.success('Receipt link copied to clipboard')
      } else {
        navigator.clipboard?.writeText(receiptUrl)
          .then(() => toast.success('Receipt link copied to clipboard'))
          .catch(() => toast.error('Failed to copy receipt link'))
      }
    } catch {
      toast.error('Failed to copy receipt link')
    }
    document.body.removeChild(input)
  }

  // ========================================================================
  // DERIVED DATA
  // ========================================================================

  const lead = transaction.lead
  const displayName = getCustomerDisplayName(lead)
  const initials = getCustomerInitials(lead)
  const avatarBg = lead ? getConsistentColor(displayName) : '#6b7280'
  const avatarText = getTextColorForBackground(avatarBg)
  const statusDisplay = getStatusDisplay(transaction.paymentStatus)
  const refundDisplay = getRefundStatusDisplay(transaction.paidAmount, transaction.refundedAmount)

  const isCancelable = canCancel && !['PAID', 'CANCELED', 'FAILED', 'DISPUTED'].includes(transaction.paymentStatus)
  const billingType = transaction.billingType
  const isMultiPayment = billingType === BILLING_TYPES.RECURRING || billingType === BILLING_TYPES.SPLIT_PAYMENT
  const isTransactionRefundable = canRefund && billingType === 'ONE_TIME' && transaction.paymentStatus === 'PAID' && !!transaction.stripePaymentIntentId && transactionRefundableAmount > 0

  /**
   * Payment steps for the activity feed — covers ALL billing types.
   * ONE_TIME gets a single entry, SPLIT_PAYMENT gets N entries, RECURRING gets all + upcoming.
   */
  const paymentSteps = useMemo(() => {
    const steps: { number: number; status: 'completed' | 'current' | 'upcoming' | 'failed'; amount: number; date?: Date | string; label: string }[] = []

    /* ONE_TIME — single payment entry */
    if (billingType === BILLING_TYPES.ONE_TIME) {
      if (transaction.payments.length > 0) {
        const payment = transaction.payments[0]
        steps.push({
          number: 1,
          status: payment.status === 'SUCCEEDED' ? 'completed' : payment.status === 'FAILED' ? 'failed' : 'current',
          amount: payment.amount,
          date: payment.paidAt || payment.createdAt,
          label: 'Payment',
        })
      }
      return steps
    }

    /* SPLIT_PAYMENT — one step per installment */
    if (billingType === BILLING_TYPES.SPLIT_PAYMENT) {
      /** Each Transaction is self-contained — originalAmount / totalPayments = per-installment amount */
      const expectedInstallmentAmount = Math.floor(transaction.originalAmount / transaction.totalPayments)
      for (let i = 1; i <= transaction.totalPayments; i++) {
        const payment = transaction.payments.find((p) => p.paymentNumber === i)
        let status: 'completed' | 'current' | 'upcoming' | 'failed' = 'upcoming'
        let date: Date | string | undefined
        let amount = expectedInstallmentAmount
        if (payment) {
          amount = payment.amount
          if (payment.status === 'SUCCEEDED') { status = 'completed'; date = payment.paidAt || payment.createdAt }
          else if (payment.status === 'FAILED') { status = 'failed'; date = payment.failedAt || payment.createdAt }
          else { status = 'current'; date = undefined }
        } else if (i === transaction.successfulPayments + 1) { status = 'current'; date = undefined }
        steps.push({ number: i, status, amount, date, label: `Payment ${i}` })
      }
      return steps
    }

    /* RECURRING — one step per collected payment (no upcoming; that belongs on subscription detail) */
    transaction.payments.forEach((payment) => {
      steps.push({
        number: payment.paymentNumber,
        status: payment.status === 'SUCCEEDED' ? 'completed' : payment.status === 'FAILED' ? 'failed' : 'current',
        amount: payment.amount,
        date: payment.paidAt || payment.createdAt,
        label: `Payment ${payment.paymentNumber}`,
      })
    })
    return steps
  }, [transaction, billingType])

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <>
      <div className="max-w-3xl">
        {/* Back link */}
        <Link
          href="/payments/transactions"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3 w-3" />
          Transactions
        </Link>

        {/* ================================================================ */}
        {/* HERO STAT AREA — the mini-dashboard feel                         */}
        {/* ================================================================ */}
        <div className="relative rounded-xl bg-muted/30 p-6 mb-8">
          {/* Action buttons — top right */}
          <div className="absolute top-4 right-4 flex items-center gap-1">
            {!isMultiPayment && transaction.payments.length > 0 && transaction.payments[0].status === 'SUCCEEDED' && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => copyReceiptLink(transaction.payments[0].id)}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Receipt
              </Button>
            )}
            {isTransactionRefundable && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={openTransactionRefundDialog}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Refund
              </Button>
            )}
            {/* Cancel pending transaction (ONE_TIME only — subscription cancellation lives on subscription detail) */}
            {isCancelable && (
              <Button variant="ghost" size="sm" className="text-xs h-8 text-destructive hover:text-destructive" onClick={() => setCancelDialogOpen(true)}>
                Cancel
              </Button>
            )}
          </div>

          {/* Label */}
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Total Paid
          </p>

          {/* Big number — paidAmount, not originalAmount */}
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            {formatCurrency(transaction.paidAmount, transaction.currency)}
          </p>

          {/* Context subtitle — varies by billing type */}
          <p className="text-sm text-muted-foreground mt-1">
            {billingType === BILLING_TYPES.SPLIT_PAYMENT && (
              <>of {formatCurrency(transaction.originalAmount, transaction.currency)} · {transaction.successfulPayments} of {transaction.totalPayments} payments</>
            )}
            {/* Recurring subtitle — mirrors ONE_TIME: status + refund info */}
            {billingType === BILLING_TYPES.RECURRING && (
              <>{statusDisplay.label}{refundDisplay ? ` · ${refundDisplay.label}` : ''}</>
            )}
            {billingType === BILLING_TYPES.ONE_TIME && (
              <>{statusDisplay.label}{refundDisplay ? ` · ${refundDisplay.label}` : ''}</>
            )}
          </p>

          {/* Status line — dot + status + billing type + date */}
          <div className="flex items-center gap-2 mt-2">
            <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', getStatusDotColor(transaction.paymentStatus))} />
            <span className="text-xs text-muted-foreground">
              {statusDisplay.label} · {formatBillingType(billingType)} · {formatDateTime(transaction.createdAt)}
            </span>
          </div>

          {/* Segmented progress bar — SPLIT_PAYMENT only */}
          {billingType === BILLING_TYPES.SPLIT_PAYMENT && (
            <div className="mt-4">
              <div className="flex gap-1">
                {Array.from({ length: transaction.totalPayments }, (_, i) => {
                  const paymentNum = i + 1
                  const payment = transaction.payments.find((p) => p.paymentNumber === paymentNum)
                  const isCompleted = payment?.status === 'SUCCEEDED'
                  const isFailed = payment?.status === 'FAILED'
                  return (
                    <div
                      key={paymentNum}
                      className={cn(
                        'h-2 flex-1 rounded-full transition-colors',
                        isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-destructive' : 'bg-muted-foreground/20'
                      )}
                    />
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {Math.round((transaction.successfulPayments / transaction.totalPayments) * 100)}% complete
              </p>
            </div>
          )}

          {/* Refund notice — inline, only when refunds exist */}
          {transaction.refundedAmount > 0 && (
            <div className="flex items-center gap-1.5 mt-3 text-sm">
              <RotateCcw className="h-3.5 w-3.5 text-destructive" />
              <span className="text-muted-foreground">
                {transaction.refundedAmount >= transaction.paidAmount ? 'Fully refunded' : 'Partially refunded'}
              </span>
              <span className="text-destructive font-medium">
                -{formatCurrency(transaction.refundedAmount, transaction.currency)}
              </span>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* ITEMS — right below hero, with billing type badges              */}
        {/* ================================================================ */}
        <div className="pb-6 mb-6 border-b border-border/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Items</p>
          <div className="space-y-3">
            {transaction.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                {/* Product image or fallback icon */}
                {item.productImage ? (
                  <Avatar className="h-9 w-9 rounded-lg">
                    <AvatarImage src={item.productImage} alt={item.productName} className="object-cover" />
                    <AvatarFallback className="rounded-lg bg-muted">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.priceName}
                    {item.quantity > 1 && ` × ${item.quantity}`}
                  </p>
                </div>
                {/* Billing type badge */}
                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 h-5 shrink-0">
                  {getItemBillingLabel(item)}
                </Badge>

                {/* Item price — flat amount, no interval suffixes (subscription context lives elsewhere) */}
                <p className="text-sm tabular-nums shrink-0 font-medium">
                  {formatCurrency(item.totalAmount, transaction.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ================================================================ */}
        {/* CUSTOMER                                                         */}
        {/* ================================================================ */}
        <div className="pb-6 mb-6 border-b border-border/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Customer</p>
          {lead ? (
            <div className="flex items-start gap-3">
              <Avatar className="h-9 w-9 mt-0.5">
                <AvatarImage src={lead.avatarUrl || undefined} alt={displayName} />
                <AvatarFallback style={{ backgroundColor: avatarBg, color: avatarText }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{displayName}</p>
                  <Link
                    href={`/leads?id=${lead.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>
                  {lead.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
                  {lead.country && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.country}</span>}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No customer linked</p>
          )}
        </div>

        {/* ================================================================ */}
        {/* FINANCIAL SUMMARY                                                */}
        {/* ================================================================ */}
        <div className="pb-6 mb-6 border-b border-border/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Summary</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <span className="text-muted-foreground">Total Paid</span>
            <span className="text-right font-medium">{formatCurrency(transaction.paidAmount, transaction.currency)}</span>

            {transaction.refundedAmount > 0 && (
              <>
                <span className="text-muted-foreground">Refunded</span>
                <span className="text-right font-medium text-destructive">-{formatCurrency(transaction.refundedAmount, transaction.currency)}</span>
                <span className="text-muted-foreground">Net Received</span>
                <span className="text-right font-semibold">{formatCurrency(transaction.paidAmount - transaction.refundedAmount, transaction.currency)}</span>
              </>
            )}
          </div>
        </div>

        {/* ================================================================ */}
        {/* ACTIVITY FEED — payments at the bottom                           */}
        {/* ================================================================ */}
        {paymentSteps.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {billingType === BILLING_TYPES.SPLIT_PAYMENT ? 'Payment Plan' : 'Payments'}
            </p>
            <ActivityFeed
              steps={paymentSteps}
              payments={transaction.payments}
              currency={transaction.currency}
              canRefund={canRefund}
              onRefundPayment={openPaymentRefundDialog}
              onCopyReceipt={copyReceiptLink}
            />
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CancelTransactionDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={() => cancelMutation.mutate({ organizationId, transactionId: transaction.id })}
        isLoading={cancelMutation.isPending}
      />
      <RefundTransactionDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        transactionAmount={transactionRefundableAmount}
        currency={transaction.currency}
        refundAmount={transactionRefund.amount}
        onRefundAmountChange={transactionRefund.setAmount}
        refundReason={refundReason}
        onRefundReasonChange={setRefundReason}
        refundError={transactionRefund.error}
        onSubmit={handleRefundTransaction}
        isSubmitting={refundTransactionMutation.isPending}
      />
      <RefundPaymentDialog
        open={refundPaymentDialogOpen}
        onOpenChange={setRefundPaymentDialogOpen}
        paymentAmount={paymentRefundableAmount || null}
        currency={transaction.currency}
        refundAmount={paymentRefund.amount}
        onRefundAmountChange={paymentRefund.setAmount}
        refundReason={refundReason}
        onRefundReasonChange={setRefundReason}
        refundError={paymentRefund.error}
        onSubmit={handleRefundPayment}
        isSubmitting={refundPaymentMutation.isPending}
      />
    </>
  )
}
