/**
 * Checkout Form Component
 *
 * Handles checkout with:
 * - Name and email fields
 * - Stripe Payment Element (100+ payment methods)
 * - Proper handling of 3DS, async payments, and all payment statuses
 *
 * Uses tRPC to create payment intent/subscription based on billing type.
 * Delegates payment confirmation logic to the shared usePaymentConfirmation hook.
 *
 * PAYMENT FLOW:
 * 1. Create PaymentIntent/Subscription via tRPC (server creates transaction in AWAITING_PAYMENT)
 * 2. Submit payment details to Stripe Elements
 * 3. Confirm payment via shared hook (handles trial/regular, polling, status mapping)
 * 4. Show success/failure via shared PaymentStatusMessages
 *
 * SOURCE OF TRUTH: CheckoutForm, PaymentLinkCheckout
 */

'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PaymentElement, useElements } from '@stripe/react-stripe-js'
import { Loader2, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import type { Price, CheckoutFormData } from './types'
import { formatCurrency, getPaymentAmount } from './utils'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import { checkoutSchema } from '@/lib/stripe/checkout-schema'
import { usePaymentConfirmation } from '@/lib/stripe/use-payment-confirmation'
import {
  PaymentSuccessMessage,
  PaymentFailedMessage,
} from '@/lib/stripe/payment-status-ui'

// ============================================================================
// CHECKOUT FORM
// ============================================================================

interface CheckoutFormProps {
  paymentLinkId: string
  priceId: string
  price: Price
  /**
   * SOURCE OF TRUTH: ProductTestMode
   * When true, displays test mode badge and indicates test payments.
   */
  testMode?: boolean
}

export function CheckoutForm({
  paymentLinkId,
  priceId,
  price,
  testMode,
}: CheckoutFormProps) {
  const elements = useElements()

  /**
   * Shared payment confirmation hook — manages payment state lifecycle,
   * PaymentElement readiness, Stripe confirm flows, and async polling.
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
  } = usePaymentConfirmation()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
  })

  const createIntentMutation = trpc.products.createCheckoutIntent.useMutation()

  /**
   * Handle form submission:
   *  1. Create payment intent/subscription via tRPC
   *  2. Validate payment info with Stripe Elements
   *  3. Confirm payment via shared hook (handles trial/regular flows)
   *  4. Track conversion event on success
   */
  const onSubmit = async (data: CheckoutFormData) => {
    if (!elements) return

    setPaymentState({ status: 'processing' })
    setPaymentError(null)

    try {
      /* Step 1: Create payment intent/subscription via tRPC.
       * Server creates transaction in AWAITING_PAYMENT status. */
      const result = await createIntentMutation.mutateAsync({
        paymentLinkId,
        priceId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
      })

      if (!result.clientSecret) {
        throw new Error('Payment initialization failed. Please try again.')
      }

      /* Step 2: Validate payment info with Stripe Elements */
      const { error: submitError } = await elements.submit()
      if (submitError) {
        throw new Error(submitError.message || 'Payment validation failed')
      }

      /* Step 3: Confirm payment via shared hook — handles trial (SetupIntent)
       * and regular (PaymentIntent) flows, polling, and status mapping. */
      const returnUrl = `${window.location.origin}/pay/success?transaction_id=${result.transactionId}`
      await confirmStripePayment({
        elements,
        clientSecret: result.clientSecret,
        returnUrl,
        isTrial: result.isTrial ?? false,
        billingDetails: {
          name: `${data.firstName} ${data.lastName}`,
          email: data.email,
        },
      })

      /* Step 4: Track conversion event */
      trackEvent(CLARITY_EVENTS.PAYMENT_COMPLETED)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred'
      console.error('[Checkout] Payment error:', errorMessage)
      setPaymentError(errorMessage)
      setPaymentState({ status: 'failed', message: errorMessage })
    }
  }

  // --------------------------------------------------------------------------
  // SUCCESS STATE — payment confirmed (or trial started)
  // --------------------------------------------------------------------------

  if (paymentState.status === 'succeeded') {
    /** Trial success message ONLY for RECURRING/SPLIT — SOURCE OF TRUTH: RecurringOnlyTrialGuard */
    const isRecurringOrSplit =
      price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT'
    const hasTrial = Boolean(
      isRecurringOrSplit && price.trialDays && price.trialDays > 0
    )
    return (
      <PaymentSuccessMessage isTrial={hasTrial} trialDays={price.trialDays} />
    )
  }

  // --------------------------------------------------------------------------
  // FAILED STATE — show error with retry option
  // --------------------------------------------------------------------------

  if (paymentState.status === 'failed') {
    return (
      <PaymentFailedMessage
        message={paymentState.message}
        onRetry={resetPayment}
      />
    )
  }

  // --------------------------------------------------------------------------
  // FORM
  // --------------------------------------------------------------------------

  /* Calculate display amount and detect trial */
  const displayAmount = getPaymentAmount(price)
  const isSplitPayment = price.billingType === 'SPLIT_PAYMENT'
  /** Trial ONLY for RECURRING/SPLIT — Stripe has no trial for ONE_TIME. SOURCE OF TRUTH: RecurringOnlyTrialGuard */
  const isRecurringOrSplit =
    price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT'
  const isTrial = Boolean(
    isRecurringOrSplit && price.trialDays && price.trialDays > 0
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Test Mode Badge - displayed when testMode is enabled */}
      {testMode && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 border border-amber-500/30 rounded text-xs font-medium text-amber-500">
          <FlaskConical className="h-3.5 w-3.5" />
          <span>Test Mode</span>
        </div>
      )}

      {/* Contact Information */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Contact</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName" className="text-sm">
              First Name
            </Label>
            <Input
              id="firstName"
              {...register('firstName')}
              placeholder="John"
              disabled={isProcessing}
              className={cn('h-10', errors.firstName && 'border-destructive')}
            />
            {errors.firstName && (
              <p className="text-xs text-destructive">
                {errors.firstName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lastName" className="text-sm">
              Last Name
            </Label>
            <Input
              id="lastName"
              {...register('lastName')}
              placeholder="Doe"
              disabled={isProcessing}
              className={cn('h-10', errors.lastName && 'border-destructive')}
            />
            {errors.lastName && (
              <p className="text-xs text-destructive">
                {errors.lastName.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            {...register('email')}
            placeholder="john@example.com"
            disabled={isProcessing}
            className={cn('h-10', errors.email && 'border-destructive')}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
      </div>

      {/* Payment Element */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Payment</h2>
        <div className="space-y-1.5">
          <PaymentElement
            options={{
              layout: 'tabs',
              business: { name: 'Checkout' },
            }}
            onChange={handlePaymentElementChange}
          />
          {paymentError && (
            <p className="text-xs text-destructive">{paymentError}</p>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!elements || isProcessing || !paymentReady}
      >
        {isConfirming ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Confirming...
          </>
        ) : isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : isTrial ? (
          <>Start {price.trialDays}-day free trial</>
        ) : (
          <>
            Pay {formatCurrency(displayAmount, price.currency)}
            {isSplitPayment && price.installments && (
              <span className="ml-1 text-sm opacity-80">
                1/{price.installments}
              </span>
            )}
          </>
        )}
      </Button>

      {/* Security Note */}
      <p className="text-xs text-center text-muted-foreground">
        Your payment is secured by Stripe. We never store your payment details.
      </p>
    </form>
  )
}
