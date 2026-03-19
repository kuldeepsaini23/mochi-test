/**
 * Payment Result Client Component
 *
 * Handles the redirect from Stripe after 3DS/redirect-based payments.
 * Verifies payment status and shows appropriate feedback.
 *
 * URL Parameters from Stripe:
 * - payment_intent: The PaymentIntent ID
 * - payment_intent_client_secret: Client secret for verification
 * - redirect_status: 'succeeded', 'processing', or 'failed'
 *
 * Our custom parameters:
 * - transaction_id: Our internal transaction ID (optional)
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { CheckCircle, XCircle, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// ============================================================================
// TYPES
// ============================================================================

type PaymentResult =
  | { status: 'loading' }
  | { status: 'succeeded' }
  | { status: 'processing' }
  | { status: 'requires_action'; message: string }
  | { status: 'requires_payment_method'; message: string }
  | { status: 'failed'; message: string }
  | { status: 'error'; message: string }

// ============================================================================
// COMPONENT
// ============================================================================

export function PaymentResultClient() {
  const searchParams = useSearchParams()
  const [result, setResult] = useState<PaymentResult>({ status: 'loading' })

  // Get URL parameters
  const paymentIntentClientSecret = searchParams.get('payment_intent_client_secret')
  const redirectStatus = searchParams.get('redirect_status')

  // Verify payment status with Stripe
  const verifyPayment = useCallback(async () => {
    // If no client secret, check redirect_status from URL
    if (!paymentIntentClientSecret) {
      if (redirectStatus === 'succeeded') {
        setResult({ status: 'succeeded' })
      } else if (redirectStatus === 'processing') {
        setResult({ status: 'processing' })
      } else if (redirectStatus === 'failed') {
        setResult({ status: 'failed', message: 'Your payment was not successful. Please try again.' })
      } else {
        setResult({ status: 'error', message: 'Invalid payment verification link.' })
      }
      return
    }

    try {
      /**
       * Load Stripe with the connected account ID if provided in the URL.
       * Redirect-based payment methods (Klarna, Affirm, etc.) create PaymentIntents
       * on the connected account, so we need the stripeAccount option to retrieve them.
       * Without it, Stripe returns "No such payment_intent" because it looks on the
       * platform account instead of the connected account.
       */
      const stripeAccountId = searchParams.get('stripe_account')
      const stripeKey = searchParams.get('test_mode') === 'true'
        ? process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY!
        : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!

      const stripe = await loadStripe(stripeKey, {
        ...(stripeAccountId && { stripeAccount: stripeAccountId }),
      })

      if (!stripe) {
        setResult({ status: 'error', message: 'Failed to load payment verification.' })
        return
      }

      // Retrieve payment intent status
      const { paymentIntent, error } = await stripe.retrievePaymentIntent(
        paymentIntentClientSecret
      )

      if (error) {
        /**
         * If retrievePaymentIntent fails (e.g. connected account mismatch or async
         * payment methods like Affirm/Klarna), fall back to the redirect_status URL
         * parameter provided by Stripe. The webhook is the source of truth for
         * transaction completion — this page only provides user feedback.
         */
        console.warn('[PaymentSuccess] retrievePaymentIntent failed, falling back to redirect_status:', error.message)
        if (redirectStatus === 'succeeded') {
          setResult({ status: 'succeeded' })
        } else if (redirectStatus === 'processing') {
          setResult({ status: 'processing' })
        } else if (redirectStatus === 'failed') {
          setResult({ status: 'failed', message: 'Your payment was not successful. Please try again.' })
        } else {
          setResult({ status: 'error', message: error.message || 'Failed to verify payment.' })
        }
        return
      }

      if (!paymentIntent) {
        setResult({ status: 'error', message: 'Payment not found.' })
        return
      }

      // Handle payment intent status
      switch (paymentIntent.status) {
        case 'succeeded':
          setResult({ status: 'succeeded' })
          break

        case 'processing':
          setResult({ status: 'processing' })
          break

        case 'requires_action':
          // This shouldn't normally happen after redirect, but handle it
          setResult({
            status: 'requires_action',
            message: 'Additional authentication required. Please complete the verification.',
          })
          break

        case 'requires_payment_method':
          // Payment method failed during 3DS or redirect
          setResult({
            status: 'requires_payment_method',
            message: 'Your payment method was declined. Please try again with a different payment method.',
          })
          break

        case 'canceled':
          setResult({
            status: 'failed',
            message: 'Payment was canceled.',
          })
          break

        default:
          // Unknown status - treat as processing
          setResult({ status: 'processing' })
      }
    } catch (err) {
      /**
       * Catch-all: if anything throws, still fall back to redirect_status
       * so the user sees the correct result for async payment methods.
       */
      console.error('[PaymentSuccess] Verification error:', err)
      if (redirectStatus === 'succeeded') {
        setResult({ status: 'succeeded' })
      } else if (redirectStatus === 'processing') {
        setResult({ status: 'processing' })
      } else if (redirectStatus === 'failed') {
        setResult({ status: 'failed', message: 'Your payment was not successful. Please try again.' })
      } else {
        setResult({
          status: 'error',
          message: 'Failed to verify payment status. Please check your email for confirmation.',
        })
      }
    }
  }, [paymentIntentClientSecret, redirectStatus, searchParams])

  // Verify on mount
  useEffect(() => {
    verifyPayment()
  }, [verifyPayment])

  // Render based on result
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {result.status === 'loading' && <LoadingState />}
        {result.status === 'succeeded' && <SuccessState />}
        {result.status === 'processing' && <ProcessingState />}
        {result.status === 'requires_action' && <RequiresActionState message={result.message} />}
        {result.status === 'requires_payment_method' && <FailedState message={result.message} />}
        {result.status === 'failed' && <FailedState message={result.message} />}
        {result.status === 'error' && <ErrorState message={result.message} />}
      </div>
    </div>
  )
}

// ============================================================================
// STATE COMPONENTS
// ============================================================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <h1 className="text-2xl font-semibold">Verifying Payment</h1>
      <p className="text-muted-foreground">
        Please wait while we confirm your payment...
      </p>
    </div>
  )
}

function SuccessState() {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
        <CheckCircle className="h-8 w-8 text-emerald-500" />
      </div>
      <h1 className="text-2xl font-semibold">Payment Successful!</h1>
      <p className="text-muted-foreground">
        Thank you for your purchase. You will receive a confirmation email shortly.
      </p>
      <div className="pt-4">
        <Button asChild>
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  )
}

function ProcessingState() {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center">
        <Clock className="h-8 w-8 text-blue-500" />
      </div>
      <h1 className="text-2xl font-semibold">Payment Processing</h1>
      <p className="text-muted-foreground">
        Your payment is being processed. This may take a few minutes.
        You will receive a confirmation email once the payment is complete.
      </p>
      <div className="pt-4">
        <Button variant="outline" asChild>
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  )
}

function RequiresActionState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-yellow-500" />
      </div>
      <h1 className="text-2xl font-semibold">Action Required</h1>
      <p className="text-muted-foreground">{message}</p>
      <div className="pt-4">
        <Button variant="outline" asChild>
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  )
}

function FailedState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
        <XCircle className="h-8 w-8 text-red-500" />
      </div>
      <h1 className="text-2xl font-semibold">Payment Failed</h1>
      <p className="text-muted-foreground">{message}</p>
      <div className="pt-4 flex gap-3">
        <Button variant="outline" asChild>
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="h-16 w-16 rounded-full bg-gray-500/10 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-gray-500" />
      </div>
      <h1 className="text-2xl font-semibold">Verification Error</h1>
      <p className="text-muted-foreground">{message}</p>
      <div className="pt-4">
        <Button variant="outline" asChild>
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  )
}
