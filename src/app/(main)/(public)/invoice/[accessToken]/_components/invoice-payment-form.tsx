'use client'

/**
 * Invoice Payment Form — Stripe PaymentElement
 *
 * Minimal payment form used inside the invoice payment dialog.
 * Uses Stripe PaymentElement for 100+ payment methods with a single integration.
 * Delegates payment confirmation logic to the shared usePaymentConfirmation hook.
 *
 * Flow:
 *  1. User sees pre-filled name/email (from lead) + Stripe PaymentElement
 *  2. On submit → validate elements → call createPaymentSession tRPC → get clientSecret
 *  3. Confirm payment via shared hook (handles trial/regular, polling, status mapping)
 *  4. Show success/failure via shared PaymentStatusMessages
 *
 * Pattern mirrors: src/app/(main)/(public)/pay/[code]/_components/checkout-form.tsx
 *
 * SOURCE OF TRUTH KEYWORDS: InvoicePaymentForm, InvoiceStripeForm
 */

import { PaymentElement, useElements } from '@stripe/react-stripe-js'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { usePaymentConfirmation } from '@/lib/stripe/use-payment-confirmation'
import {
  PaymentSuccessMessage,
  PaymentFailedMessage,
} from '@/lib/stripe/payment-status-ui'

// ============================================================================
// TYPES
// ============================================================================

interface InvoicePaymentFormProps {
  /** Public access token for the invoice */
  accessToken: string
  /** Invoice total in cents — for display on the submit button */
  totalAmount: number
  /** Currency code (e.g. "usd") */
  currency: string
  /** Pre-filled customer email from lead data */
  customerEmail?: string
  /** Pre-filled customer name from lead data */
  customerName?: string
  /** Called when payment is confirmed as successful */
  onSuccess: () => void
  /**
   * Whether this invoice payment is a free trial.
   * When true, uses confirmSetup() instead of confirmPayment().
   * SOURCE OF TRUTH: InvoiceTrialPaymentFlag
   */
  isTrial?: boolean
  /** Number of trial days (for display in the trial banner) */
  trialDays?: number
}

// ============================================================================
// HELPERS
// ============================================================================

/** Format an amount in cents to a human-readable currency string */
function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amountCents / 100)
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoicePaymentForm({
  accessToken,
  totalAmount,
  currency,
  customerEmail,
  customerName,
  onSuccess,
  isTrial = false,
  trialDays = 0,
}: InvoicePaymentFormProps) {
  const elements = useElements()

  /**
   * Shared payment confirmation hook — manages payment state lifecycle,
   * PaymentElement readiness, Stripe confirm flows, and async polling.
   * Passes onSuccess so the hook fires it on successful payment/poll completion.
   * SOURCE OF TRUTH: UsePaymentConfirmation
   */
  const {
    paymentState,
    setPaymentState,
    paymentError,
    setPaymentError,
    paymentReady,
    handlePaymentElementChange,
    confirmStripePayment,
    isProcessing,
    isConfirming,
    resetPayment,
  } = usePaymentConfirmation({ onSuccess })

  /** tRPC mutation to create the payment session (Stripe PaymentIntent) */
  const createSessionMutation = trpc.invoices.createPaymentSession.useMutation()

  // --------------------------------------------------------------------------
  // SUBMIT HANDLER
  // --------------------------------------------------------------------------

  /**
   * Handle form submission:
   *  1. Validate Stripe Elements
   *  2. Create payment session (gets clientSecret from server)
   *  3. Confirm payment via shared hook (handles trial/regular flows)
   *
   * TRIAL PATH: When isTrial is true (from server result), uses confirmSetup()
   * instead of confirmPayment() — collects payment method without charging.
   * SOURCE OF TRUTH: InvoicePaymentConfirmation
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!elements) return

    setPaymentState({ status: 'processing' })
    setPaymentError(null)

    try {
      /** Step 1: Validate payment info with Stripe Elements */
      const { error: submitError } = await elements.submit()
      if (submitError) {
        throw new Error(submitError.message || 'Payment validation failed')
      }

      /** Step 2: Create payment session via tRPC (returns clientSecret + isTrial flag) */
      const result = await createSessionMutation.mutateAsync({
        accessToken,
        customerEmail,
        customerName,
      })

      if (!result.clientSecret) {
        throw new Error('Payment initialization failed. Please try again.')
      }

      /** Step 3: Confirm payment via shared hook — handles trial (SetupIntent)
       * and regular (PaymentIntent) flows, polling, and status mapping. */
      const returnUrl = `${window.location.origin}/invoice/${accessToken}`
      await confirmStripePayment({
        elements,
        clientSecret: result.clientSecret,
        returnUrl,
        isTrial: result.isTrial ?? false,
        billingDetails: {
          name: customerName || undefined,
          email: customerEmail || undefined,
        },
      })
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred'
      setPaymentError(errorMessage)
      setPaymentState({ status: 'failed', message: errorMessage })
    }
  }

  // --------------------------------------------------------------------------
  // SUCCESS STATE
  // --------------------------------------------------------------------------

  if (paymentState.status === 'succeeded') {
    return (
      <PaymentSuccessMessage
        isTrial={isTrial}
        trialDays={trialDays}
        className="py-8"
      />
    )
  }

  // --------------------------------------------------------------------------
  // FAILED STATE
  // --------------------------------------------------------------------------

  if (paymentState.status === 'failed') {
    return (
      <PaymentFailedMessage
        message={paymentState.message}
        onRetry={resetPayment}
        className="py-8"
      />
    )
  }

  // --------------------------------------------------------------------------
  // FORM
  // --------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Stripe Payment Element — renders card/bank/wallet payment methods */}
      <div className="space-y-1.5">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
          onChange={handlePaymentElementChange}
        />
        {paymentError && (
          <p className="text-xs text-destructive">{paymentError}</p>
        )}
      </div>

      {/* Trial banner — info about the free trial period */}
      {isTrial && trialDays > 0 && (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm">
          <p className="font-medium text-indigo-400">
            {trialDays}-day free trial
          </p>
          <p className="text-muted-foreground mt-0.5">
            You won&apos;t be charged until your trial ends. Then{' '}
            {formatAmount(totalAmount, currency)}.
          </p>
        </div>
      )}

      {/* Submit button — rounded-xl for modern aesthetic */}
      <Button
        type="submit"
        size="lg"
        className="w-full rounded-xl"
        disabled={!elements || isProcessing || !paymentReady}
      >
        {isConfirming ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isTrial ? 'Setting up trial...' : 'Confirming payment...'}
          </>
        ) : isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : isTrial ? (
          <>Start {trialDays}-day free trial</>
        ) : (
          <>Pay {formatAmount(totalAmount, currency)}</>
        )}
      </Button>

      {/* Security note */}
      <p className="text-xs text-center text-muted-foreground">
        Your payment is secured by Stripe. We never store your payment details.
      </p>
    </form>
  )
}
