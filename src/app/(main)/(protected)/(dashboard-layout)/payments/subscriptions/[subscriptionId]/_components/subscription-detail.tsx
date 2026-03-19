/**
 * Subscription Detail — Dedicated Subscription View
 *
 * Subscription-focused detail page that reuses the Transaction model
 * but presents data in a subscription-specific layout:
 * - Hero section with recurring amount + interval suffix
 * - Trial status and timeline info
 * - Products list with billing badges
 * - Subscription info (next payment, current period)
 * - Payment history timeline via ActivityFeed
 * - Customer section and financial summary
 *
 * Follows the same patterns as transaction-detail.tsx:
 * - Same UI components (Badge, Avatar, Button, etc.)
 * - Same utility functions from transactions/_components/utils
 * - CancelSubscriptionDialog imported from transactions folder (no duplication)
 *
 * SOURCE OF TRUTH KEYWORDS: SubscriptionDetail, SubscriptionView, TransactionWithRelations
 */

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  Mail,
  Phone,
  ExternalLink,
  MapPin,
  RotateCcw,
  Copy,
  CalendarDays,
} from 'lucide-react'
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
  formatDate,
  formatDateTime,
  getCustomerDisplayName,
  getCustomerInitials,
} from '../../../transactions/_components/utils'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import { BILLING_TYPES } from '@/constants/billing'
import type { TransactionPaymentStatus } from '@/generated/prisma'
import type { TransactionWithRelations, TransactionItem } from '@/types/transaction'
import { CancelSubscriptionDialog } from '../../../transactions/[transactionId]/_components/cancel-dialogs'
import { RefundPaymentDialog } from '../../../transactions/[transactionId]/_components/refund-dialogs'
import { ActivityFeed } from '../../../transactions/[transactionId]/_components/payment-stepper'
import { useRefundValidation } from '../../../transactions/[transactionId]/_components/use-refund-validation'
import { useDashboardCache } from '@/hooks/use-dashboard-cache'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Status dot color — matches the 4-state palette from transaction-detail.
 * Green for active, violet for trialing, red for failed/disputed, gray for canceled.
 */
function getStatusDotColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-500'
    case 'TRIALING':
      return 'bg-violet-500'
    case 'FAILED':
    case 'DISPUTED':
      return 'bg-destructive'
    case 'CANCELED':
    default:
      return 'bg-muted-foreground/40'
  }
}

/**
 * Derives a human-readable billing label for a subscription item.
 * Used in the billing badge next to each product.
 * SOURCE OF TRUTH: SubscriptionItemBillingLabel
 */
function getItemBillingLabel(item: TransactionItem): string {
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

/**
 * Derives a short interval suffix like "mo", "yr", "wk", "day".
 * Used in the hero section for amount display (e.g. "$29.99/mo").
 * SOURCE OF TRUTH: SubscriptionIntervalLabel
 */
function getIntervalLabel(items: TransactionItem[]): string {
  const recurringItem = items.find((item) => item.billingType !== 'ONE_TIME')
  if (!recurringItem?.interval) return 'mo'
  const count = recurringItem.intervalCount || 1
  const base =
    recurringItem.interval === 'MONTH' ? 'mo'
      : recurringItem.interval === 'YEAR' ? 'yr'
        : recurringItem.interval === 'WEEK' ? 'wk'
          : 'day'
  return count > 1 ? `${count} ${base}` : base
}

/**
 * Computes how many days remain in a trial period.
 * Returns null if there's no trial or it has already ended.
 */
function getTrialDaysRemaining(trialEndsAt: Date | string | null): number | null {
  if (!trialEndsAt) return null
  const endDate = new Date(trialEndsAt)
  const now = new Date()
  if (endDate <= now) return 0
  return Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ============================================================================
// COMPONENT
// ============================================================================

interface SubscriptionDetailProps {
  transaction: TransactionWithRelations
  organizationId: string
  userRole: string
  userPermissions: string[]
}

export function SubscriptionDetail({
  transaction: initialTransaction,
  organizationId,
  userRole,
  userPermissions,
}: SubscriptionDetailProps) {
  const utils = trpc.useUtils()
  const { invalidateRevenueCharts } = useDashboardCache()

  /** Determine if user can cancel subscriptions */
  const canCancel = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.TRANSACTIONS_CANCEL),
    [userRole, userPermissions]
  )

  /** Determine if user can process refunds */
  const canRefund = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.TRANSACTIONS_REFUND),
    [userRole, userPermissions]
  )

  const [transaction, setTransaction] = useState(initialTransaction)
  const [cancelSubscriptionDialogOpen, setCancelSubscriptionDialogOpen] = useState(false)
  const [refundPaymentDialogOpen, setRefundPaymentDialogOpen] = useState(false)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [refundReason, setRefundReason] = useState<'duplicate' | 'fraudulent' | 'requested_by_customer'>(
    'requested_by_customer'
  )

  /** Refund validation for individual payments */
  const selectedPayment = selectedPaymentId ? transaction.payments.find((p) => p.id === selectedPaymentId) : null
  const paymentRefundableAmount = selectedPayment ? selectedPayment.amount - selectedPayment.refundedAmount : 0
  const paymentRefund = useRefundValidation(paymentRefundableAmount)

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  /**
   * Cancel subscription mutation — cancels the Stripe subscription
   * and updates the transaction status to CANCELED.
   */
  const cancelSubscriptionMutation = trpc.transactions.cancelSubscription.useMutation({
    onMutate: async () => {
      setTransaction((prev) => ({
        ...prev,
        paymentStatus: 'CANCELED' as TransactionPaymentStatus,
        canceledAt: new Date(),
      }))
    },
    onError: () => {
      setTransaction(initialTransaction)
      toast.error('Failed to cancel subscription')
    },
    onSuccess: () => {
      toast.success('Subscription canceled successfully')
      utils.transactions.list.invalidate()
      utils.transactions.getById.invalidate({ organizationId, transactionId: transaction.id })
      invalidateRevenueCharts()
    },
    onSettled: () => setCancelSubscriptionDialogOpen(false),
  })

  /**
   * Refund individual payment mutation — processes a refund through Stripe
   * for a specific payment within the subscription.
   */
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

  /** Handle individual payment refund submission */
  const handleRefundPayment = () => {
    if (!selectedPaymentId) return
    const amount = paymentRefund.amount ? Math.round(parseFloat(paymentRefund.amount) * 100) : undefined
    refundPaymentMutation.mutate({
      organizationId,
      transactionId: transaction.id,
      paymentId: selectedPaymentId,
      amount,
      reason: refundReason,
    })
  }

  /** Open the refund dialog for a specific payment */
  const openPaymentRefundDialog = (paymentId: string) => {
    setSelectedPaymentId(paymentId)
    paymentRefund.resetAmount()
    setRefundReason('requested_by_customer')
    setRefundPaymentDialogOpen(true)
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

  /**
   * Determine if cancel action is available.
   * Subscription can be canceled when it has a Stripe subscription ID
   * and the status is ACTIVE, PARTIALLY_PAID, or TRIALING.
   */
  const hasActiveSubscription = !!transaction.stripeSubscriptionId
  const isSubscriptionCancelable =
    canCancel &&
    hasActiveSubscription &&
    (transaction.paymentStatus === 'ACTIVE' ||
      transaction.paymentStatus === 'PARTIALLY_PAID' ||
      transaction.paymentStatus === 'TRIALING')

  /**
   * Separate recurring items from one-time items.
   * Mixed-cart checkouts bundle ONE_TIME items onto the RECURRING Transaction's first invoice.
   * These are not part of the subscription itself, so we display them separately.
   */
  const recurringItems = useMemo(
    () => transaction.items.filter((item) => item.billingType !== 'ONE_TIME'),
    [transaction.items]
  )
  const oneTimeItems = useMemo(
    () => transaction.items.filter((item) => item.billingType === 'ONE_TIME'),
    [transaction.items]
  )

  /** Recurring-only amount — the true subscription price per period */
  const recurringAmount = useMemo(
    () => recurringItems.reduce((sum, item) => sum + item.totalAmount, 0),
    [recurringItems]
  )

  /** Short interval label for display (e.g. "mo", "yr") */
  const intervalLabel = useMemo(() => getIntervalLabel(transaction.items), [transaction.items])

  /** Trial status info — used in the hero subtitle */
  const trialDaysRemaining = useMemo(
    () => getTrialDaysRemaining(transaction.trialEndsAt),
    [transaction.trialEndsAt]
  )
  const isTrialing = transaction.paymentStatus === 'TRIALING'
  const isCanceled = transaction.paymentStatus === 'CANCELED'
  const isActive = transaction.paymentStatus === 'ACTIVE'

  /**
   * Payment steps for the activity feed — tailored for subscription view.
   * Shows all collected payments + upcoming next payment for active subscriptions.
   * SOURCE OF TRUTH: SubscriptionPaymentSteps
   */
  const paymentSteps = useMemo(() => {
    const steps: {
      number: number
      status: 'completed' | 'current' | 'upcoming' | 'failed'
      amount: number
      date?: Date | string
      label: string
      amountSuffix?: string
    }[] = []

    /* One step per collected payment */
    transaction.payments.forEach((payment) => {
      steps.push({
        number: payment.paymentNumber,
        status: payment.status === 'SUCCEEDED' ? 'completed' : payment.status === 'FAILED' ? 'failed' : 'current',
        amount: payment.amount,
        date: payment.paidAt || payment.createdAt,
        label: `Payment ${payment.paymentNumber}`,
      })
    })

    /**
     * Add an upcoming "Next Payment" step for active subscriptions.
     * Shows the recurring charge amount with interval suffix.
     * SOURCE OF TRUTH: SubscriptionNextPaymentLabel
     */
    if (isActive) {
      steps.push({
        number: steps.length + 1,
        status: 'upcoming',
        /** Use recurringAmount — excludes one-time items from mixed-cart first invoice */
        amount: recurringAmount,
        date: undefined,
        label: 'Next Payment',
        amountSuffix: `/${intervalLabel}`,
      })
    }

    return steps
  }, [transaction, isActive, intervalLabel, recurringAmount])

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <>
      <div className="max-w-3xl">
        {/* Back link — navigates to subscriptions list */}
        <Link
          href="/payments/subscriptions"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3 w-3" />
          Subscriptions
        </Link>

        {/* ================================================================ */}
        {/* HERO SECTION — Amount with interval, status, trial info          */}
        {/* ================================================================ */}
        <div className="relative rounded-xl bg-muted/30 p-6 mb-8">
          {/* Action button — cancel subscription, top right */}
          <div className="absolute top-4 right-4 flex items-center gap-1">
            {isSubscriptionCancelable && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 text-destructive hover:text-destructive"
                onClick={() => setCancelSubscriptionDialogOpen(true)}
              >
                Cancel Subscription
              </Button>
            )}
          </div>

          {/* Label */}
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {isTrialing ? 'Subscription (Trial)' : 'Subscription'}
          </p>

          {/* Big amount with interval suffix — e.g. "$29.99/mo" */}
          {/* Uses recurringAmount (excludes one-time items) for the true subscription price */}
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            {formatCurrency(recurringAmount, transaction.currency)}
            <span className="text-lg font-normal text-muted-foreground">/{intervalLabel}</span>
          </p>

          {/* Context subtitle — varies by subscription state */}
          <p className="text-sm text-muted-foreground mt-1">
            {isTrialing && trialDaysRemaining !== null && trialDaysRemaining > 0 && (
              <>
                Trial · {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} remaining
                {transaction.trialEndsAt && <> · ends {formatDate(transaction.trialEndsAt)}</>}
              </>
            )}
            {isTrialing && (trialDaysRemaining === null || trialDaysRemaining === 0) && (
              <>Trial · {transaction.trialDays ? `${transaction.trialDays}-day trial` : 'Trial period'}</>
            )}
            {isActive && (
              <>Active · Started {formatDate(transaction.createdAt)}</>
            )}
            {isCanceled && (
              <>
                Canceled
                {transaction.canceledAt && <> · {formatDate(transaction.canceledAt)}</>}
              </>
            )}
            {!isTrialing && !isActive && !isCanceled && (
              <>{statusDisplay.label} · {formatDate(transaction.createdAt)}</>
            )}
          </p>

          {/* Customer name subtitle */}
          {lead && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {displayName}
            </p>
          )}

          {/* Status line — dot + status */}
          <div className="flex items-center gap-2 mt-2">
            <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', getStatusDotColor(transaction.paymentStatus))} />
            <span className="text-xs text-muted-foreground">
              {statusDisplay.label} · {transaction.successfulPayments} payment{transaction.successfulPayments !== 1 ? 's' : ''} collected
            </span>
          </div>

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
        {/* ITEMS — Recurring products included in this subscription          */}
        {/* Only shows recurring/split items. ONE_TIME items are displayed    */}
        {/* separately below since they were bundled on the first invoice.    */}
        {/* ================================================================ */}
        <div className="pb-6 mb-6 border-b border-border/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Subscription Products</p>
          <div className="space-y-3">
            {recurringItems.map((item) => (
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
                    {item.quantity > 1 && ` x ${item.quantity}`}
                  </p>
                </div>

                {/* Billing type badge — "Monthly", "Yearly", etc. */}
                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 h-5 shrink-0">
                  {getItemBillingLabel(item)}
                </Badge>

                {/* Item price with trial badge if applicable */}
                {(() => {
                  /** Trial items show trial badge + "then $X/mo" */
                  const isOnTrial = isTrialing &&
                    item.billingType !== 'ONE_TIME' &&
                    transaction.trialDays != null && transaction.trialDays > 0

                  if (isOnTrial) {
                    return (
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                          >
                            {transaction.trialDays}d trial
                          </Badge>
                          <span className="text-sm font-medium text-muted-foreground">$0</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          then {formatCurrency(item.totalAmount, transaction.currency)}
                          {item.interval === 'MONTH' && '/mo'}
                          {item.interval === 'YEAR' && '/yr'}
                          {item.interval === 'WEEK' && '/wk'}
                        </p>
                      </div>
                    )
                  }

                  /** Regular recurring items — amount with interval suffix */
                  const suffix = item.interval === 'MONTH' ? '/mo'
                    : item.interval === 'YEAR' ? '/yr'
                      : item.interval === 'WEEK' ? '/wk'
                        : item.interval === 'DAY' ? '/day'
                          : ''
                  return (
                    <p className="text-sm tabular-nums shrink-0 font-medium">
                      {formatCurrency(item.totalAmount, transaction.currency)}{suffix}
                    </p>
                  )
                })()}
              </div>
            ))}
          </div>

          {/* One-time charges — shown separately when present (from mixed-cart first invoice) */}
          {oneTimeItems.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/20">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                One-time charges (first invoice)
              </p>
              <div className="space-y-2">
                {oneTimeItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    {item.productImage ? (
                      <Avatar className="h-7 w-7 rounded-md">
                        <AvatarImage src={item.productImage} alt={item.productName} className="object-cover" />
                        <AvatarFallback className="rounded-md bg-muted">
                          <Package className="h-3 w-3 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.priceName}
                        {item.quantity > 1 && ` x ${item.quantity}`}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 h-5 shrink-0">
                      One-time
                    </Badge>
                    <p className="text-sm tabular-nums shrink-0 font-medium">
                      {formatCurrency(item.totalAmount, transaction.currency)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* SUBSCRIPTION INFO — Next payment, current period, etc.          */}
        {/* ================================================================ */}
        <div className="pb-6 mb-6 border-b border-border/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Subscription Details
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {/* Recurring amount per period — excludes one-time items from mixed carts */}
            <span className="text-muted-foreground">Recurring Amount</span>
            <span className="text-right font-medium">
              {formatCurrency(recurringAmount, transaction.currency)}/{intervalLabel}
            </span>

            {/* Started date */}
            <span className="text-muted-foreground">Started</span>
            <span className="text-right font-medium">
              {formatDate(transaction.createdAt)}
            </span>

            {/* Trial info — only shown if subscription has/had a trial */}
            {transaction.trialDays != null && transaction.trialDays > 0 && (
              <>
                <span className="text-muted-foreground">Trial Period</span>
                <span className="text-right font-medium">
                  {transaction.trialDays} days
                  {transaction.trialEndsAt && (
                    <span className="text-muted-foreground font-normal">
                      {' '}(ends {formatDate(transaction.trialEndsAt)})
                    </span>
                  )}
                </span>
              </>
            )}

            {/* Last payment date — when the most recent payment was collected */}
            {transaction.lastPaidAt && (
              <>
                <span className="text-muted-foreground">Last Payment</span>
                <span className="text-right font-medium">
                  {formatDate(transaction.lastPaidAt)}
                </span>
              </>
            )}

            {/* Canceled date — only shown for canceled subscriptions */}
            {transaction.canceledAt && (
              <>
                <span className="text-muted-foreground">Canceled</span>
                <span className="text-right font-medium text-destructive">
                  {formatDate(transaction.canceledAt)}
                </span>
              </>
            )}

            {/* Stripe subscription ID — for reference */}
            {transaction.stripeSubscriptionId && (
              <>
                <span className="text-muted-foreground">Stripe ID</span>
                <span className="text-right font-mono text-xs text-muted-foreground truncate">
                  {transaction.stripeSubscriptionId}
                </span>
              </>
            )}
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
            {/* Total collected across all payments */}
            <span className="text-muted-foreground">Total Collected</span>
            <span className="text-right font-medium">
              {formatCurrency(transaction.paidAmount, transaction.currency)}
            </span>

            {/* Refunded amount — only shown when refunds exist */}
            {transaction.refundedAmount > 0 && (
              <>
                <span className="text-muted-foreground">Refunded</span>
                <span className="text-right font-medium text-destructive">
                  -{formatCurrency(transaction.refundedAmount, transaction.currency)}
                </span>
                <span className="text-muted-foreground">Net Received</span>
                <span className="text-right font-semibold">
                  {formatCurrency(transaction.paidAmount - transaction.refundedAmount, transaction.currency)}
                </span>
              </>
            )}

            {/* Payment count */}
            <span className="text-muted-foreground">Payments</span>
            <span className="text-right font-medium">
              {transaction.successfulPayments} successful
            </span>
          </div>
        </div>

        {/* ================================================================ */}
        {/* PAYMENT HISTORY — Timeline of all subscription payments          */}
        {/* ================================================================ */}
        {paymentSteps.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Payment History
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

        {/* Empty state for subscriptions with no payments yet (e.g. trialing) */}
        {paymentSteps.length === 0 && isTrialing && (
          <div className="text-center py-8">
            <CalendarDays className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No payments yet — trial in progress
            </p>
            {transaction.trialEndsAt && (
              <p className="text-xs text-muted-foreground mt-1">
                First payment expected {formatDate(transaction.trialEndsAt)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* DIALOGS                                                           */}
      {/* ================================================================ */}

      {/* Cancel subscription dialog — imported from transactions, not duplicated */}
      <CancelSubscriptionDialog
        open={cancelSubscriptionDialogOpen}
        onOpenChange={setCancelSubscriptionDialogOpen}
        onConfirm={() => cancelSubscriptionMutation.mutate({ organizationId, transactionId: transaction.id })}
        isLoading={cancelSubscriptionMutation.isPending}
        billingType={BILLING_TYPES.RECURRING}
        totalPayments={transaction.totalPayments}
        successfulPayments={transaction.successfulPayments}
      />

      {/* Refund individual payment dialog */}
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
