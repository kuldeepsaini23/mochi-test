/**
 * Activity Feed — Minimal Payment History
 *
 * Flat list of payments for all billing types.
 * Each row: small status dot + label + date + amount.
 * Hover-reveal action buttons for refund/receipt.
 * Replaces the old PaymentStepper vertical timeline.
 *
 * SOURCE OF TRUTH KEYWORDS: ActivityFeed, PaymentActivity
 */

'use client'

import { RotateCcw, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../../_components/utils'
import type { PaymentStatus } from '@/generated/prisma'

/** Shape of each step in the activity feed */
export interface PaymentStep {
  number: number
  status: 'completed' | 'current' | 'upcoming' | 'failed'
  amount: number
  date?: Date | string
  label: string
}

/**
 * Shape of each payment record from the transaction.
 * Uses PaymentStatus from Prisma for SOURCE OF TRUTH compliance.
 */
export interface Payment {
  id: string
  paymentNumber: number
  amount: number
  refundedAmount: number
  status: PaymentStatus
  stripeInvoiceId: string | null
  paidAt: Date | string | null
  failedAt: Date | string | null
  dueDate?: Date | string | null
  createdAt: Date | string
}

interface ActivityFeedProps {
  steps: PaymentStep[]
  payments: Payment[]
  currency: string
  canRefund: boolean
  onRefundPayment: (paymentId: string) => void
  /** Callback to copy receipt link for a specific payment */
  onCopyReceipt?: (paymentId: string) => void
}

/**
 * ActivityFeed — minimal flat list of payment events.
 * No vertical lines, no large icons. Just rows with dots.
 */
export function ActivityFeed({
  steps,
  payments,
  currency,
  canRefund,
  onRefundPayment,
  onCopyReceipt,
}: ActivityFeedProps) {
  return (
    <div className="space-y-0">
      {steps.map((step) => {
        const payment = payments.find((p) => p.paymentNumber === step.number)

        /** Can refund this payment if it succeeded and has a Stripe invoice */
        const isPaymentRefundable =
          canRefund &&
          payment &&
          step.status === 'completed' &&
          payment.status === 'SUCCEEDED' &&
          !!payment.stripeInvoiceId

        /** Was this payment partially or fully refunded */
        const hasRefund = (payment?.refundedAmount || 0) > 0

        /** Net amount after refund */
        const netAmount = hasRefund
          ? (payment?.amount || step.amount) - (payment?.refundedAmount || 0)
          : step.amount

        return (
          <div
            key={step.number}
            className={cn(
              'group flex items-center justify-between py-2.5',
              step.status === 'upcoming' && 'opacity-50'
            )}
          >
            {/* Left: status dot + label + date */}
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Small status indicator — 2px dot, colored by status */}
              <div
                className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  step.status === 'completed'
                    ? 'bg-emerald-500'
                    : step.status === 'failed'
                      ? 'bg-destructive'
                      : step.status === 'current'
                        ? 'bg-primary'
                        : 'bg-muted-foreground/30'
                )}
              />
              <span
                className={cn(
                  'text-sm',
                  step.status === 'failed'
                    ? 'text-destructive'
                    : step.status === 'upcoming'
                      ? 'text-muted-foreground'
                      : 'text-foreground'
                )}
              >
                {step.label}
              </span>
              {step.date && (
                <span className="text-xs text-muted-foreground">{formatDate(step.date)}</span>
              )}
            </div>

            {/* Right: amount + hover-reveal actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Amount display */}
              <div className="text-right">
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    step.status === 'failed' ? 'text-destructive' : 'font-medium'
                  )}
                >
                  {formatCurrency(hasRefund ? netAmount : step.amount, currency)}
                </span>
                {/* Simple refund label */}
                {hasRefund && (
                  <p className="text-[10px] text-muted-foreground">
                    -{formatCurrency(payment?.refundedAmount || 0, currency)} refunded
                  </p>
                )}
              </div>

              {/* Hover-reveal action buttons */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {isPaymentRefundable && payment && payment.amount > (payment.refundedAmount || 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onRefundPayment(payment.id)}
                    title="Refund"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                {onCopyReceipt && payment && step.status === 'completed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onCopyReceipt(payment.id)}
                    title="Copy receipt link"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}

    </div>
  )
}
