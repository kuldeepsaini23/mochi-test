'use client'

/**
 * Shared Payment Status UI Components
 *
 * Reusable success and failure message components for payment forms.
 * Extracted from the duplicated UI in checkout-form.tsx and
 * invoice-payment-form.tsx to provide consistent payment feedback
 * across all Stripe payment flows.
 *
 * SOURCE OF TRUTH: PaymentStatusUI, PaymentSuccessMessage, PaymentFailedMessage
 */

import { CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

export interface PaymentSuccessProps {
  /** When true, shows "Trial Started" instead of "Payment Successful" */
  isTrial?: boolean
  /** Number of trial days — displayed in the trial success message */
  trialDays?: number | null
  /** Optional className override for the outer container */
  className?: string
}

export interface PaymentFailedProps {
  /** Error message to display to the user */
  message: string
  /** Called when user clicks "Try Again" — should reset payment state to idle */
  onRetry: () => void
  /** Optional className override for the outer container */
  className?: string
}

// ============================================================================
// SUCCESS MESSAGE
// ============================================================================

/**
 * Payment success message — shows a green checkmark with contextual copy.
 * Handles both regular payments ("Payment Successful") and trial starts
 * ("Trial Started" with trial day count).
 *
 * Uses emerald color palette with a 64px circle icon for visual prominence.
 */
export function PaymentSuccessMessage({
  isTrial,
  trialDays,
  className,
}: PaymentSuccessProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center space-y-4',
        className
      )}
    >
      {/* Large circle icon — emerald green with translucent background */}
      <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
        <CheckCircle className="h-8 w-8 text-emerald-500" />
      </div>

      <h2 className="text-2xl font-semibold">
        {isTrial ? 'Trial Started' : 'Payment Successful'}
      </h2>

      <p className="text-muted-foreground max-w-sm">
        {isTrial
          ? `Your ${trialDays}-day free trial has started. You won't be charged until the trial ends.`
          : 'Thank you for your purchase. You will receive a confirmation email shortly.'}
      </p>
    </div>
  )
}

// ============================================================================
// FAILED MESSAGE
// ============================================================================

/**
 * Payment failure message — shows a red alert icon with the error message
 * and a "Try Again" button that resets the payment form.
 *
 * Uses red color palette with a 64px circle icon for visual prominence.
 */
export function PaymentFailedMessage({
  message,
  onRetry,
  className,
}: PaymentFailedProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center space-y-4',
        className
      )}
    >
      {/* Large circle icon — red with translucent background */}
      <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
      </div>

      <h2 className="text-2xl font-semibold">Payment Failed</h2>

      <p className="text-muted-foreground max-w-sm">{message}</p>

      <Button onClick={onRetry} variant="outline">
        Try Again
      </Button>
    </div>
  )
}
