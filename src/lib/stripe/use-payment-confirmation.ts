'use client'

/**
 * Shared Payment Confirmation Hook
 *
 * Extracts ALL duplicated payment confirmation logic from checkout-form.tsx
 * and invoice-payment-form.tsx into a single reusable hook. Handles:
 *
 * - Payment state management (idle → processing → confirming → succeeded/failed)
 * - PaymentElement readiness tracking
 * - Stripe confirmPayment / confirmSetup (trial) flows
 * - Polling for async payment statuses (bank transfers, 3DS, etc.)
 * - Error mapping via getPaymentErrorMessage
 *
 * SOURCE OF TRUTH: PaymentState, PaymentConfirmationState, UsePaymentConfirmation
 */

import { useState, useEffect, useCallback } from 'react'
import { useStripe } from '@stripe/react-stripe-js'
import type {
  StripePaymentElementChangeEvent,
  StripeElements,
  PaymentIntent,
  SetupIntent,
} from '@stripe/stripe-js'

import { getPaymentErrorMessage } from '@/lib/stripe/payment-errors'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Discriminated union for tracking payment progress through the Stripe flow.
 * SOURCE OF TRUTH: PaymentState
 */
export type PaymentState =
  | { status: 'idle' }
  | { status: 'processing' }
  | { status: 'confirming'; clientSecret: string }
  | { status: 'succeeded' }
  | { status: 'failed'; message: string }

/**
 * Parameters for confirmStripePayment — handles both trial (SetupIntent)
 * and regular (PaymentIntent) confirmation flows.
 */
export interface ConfirmPaymentParams {
  /** Stripe Elements instance from useElements() */
  elements: StripeElements
  /** Client secret from the server-created PaymentIntent or SetupIntent */
  clientSecret: string
  /** URL to redirect after payment if Stripe requires a redirect (e.g. 3DS) */
  returnUrl: string
  /** When true, uses confirmSetup() for $0 upfront trial subscriptions */
  isTrial: boolean
  /** Billing details to attach to the PaymentMethod */
  billingDetails?: { name?: string; email?: string }
}

/**
 * Return type from confirmStripePayment — provides the raw Stripe result
 * so callers can inspect the paymentIntent/setupIntent if needed.
 */
export interface ConfirmPaymentResult {
  /** The confirmed PaymentIntent (undefined for trials or deferred subscriptions) */
  paymentIntent?: PaymentIntent
  /** The confirmed SetupIntent (only for trial flows) */
  setupIntent?: SetupIntent
}

/**
 * Options for the usePaymentConfirmation hook.
 */
export interface UsePaymentConfirmationOptions {
  /** Called when payment succeeds (after confirm or poll completes) */
  onSuccess?: () => void
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Shared hook for Stripe payment confirmation logic.
 *
 * Manages the full lifecycle: idle → processing → confirming → succeeded/failed.
 * Handles both PaymentIntent (regular) and SetupIntent (trial) flows.
 * Polls for async payment statuses when the result isn't immediately available.
 *
 * @param options.onSuccess - Optional callback fired when payment succeeds
 *
 * @example
 * ```tsx
 * const {
 *   paymentState, setPaymentState,
 *   paymentReady, handlePaymentElementChange,
 *   confirmStripePayment, isProcessing,
 * } = usePaymentConfirmation({ onSuccess: () => router.push('/success') })
 * ```
 */
export function usePaymentConfirmation(
  options?: UsePaymentConfirmationOptions
) {
  const stripe = useStripe()

  const [paymentState, setPaymentState] = useState<PaymentState>({
    status: 'idle',
  })
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentReady, setPaymentReady] = useState(false)

  // --------------------------------------------------------------------------
  // POLL FOR PAYMENT STATUS
  // --------------------------------------------------------------------------

  /**
   * Poll Stripe for the final payment intent status.
   *
   * Handles async payment methods (bank transfers, etc.) and 3DS verification.
   * - Max 30 attempts at 1-second intervals
   * - On timeout: optimistically show success (webhook is source of truth)
   * - On network error: retry up to 5 times with 2s delay, then assume success
   *
   * Status mapping:
   * - succeeded → success
   * - processing / requires_action / requires_confirmation → retry
   * - requires_payment_method → failed
   * - canceled → failed
   */
  const pollPaymentStatus = useCallback(
    async (clientSecret: string, attempts = 0): Promise<void> => {
      if (!stripe) return

      /* After 30 seconds of polling, optimistically show success.
       * The webhook will handle the actual status update server-side. */
      if (attempts >= 30) {
        setPaymentState({ status: 'succeeded' })
        options?.onSuccess?.()
        return
      }

      try {
        const { paymentIntent } = await stripe.retrievePaymentIntent(
          clientSecret
        )

        /* For subscriptions, we might not have a PaymentIntent directly.
         * Show success since the subscription was created. */
        if (!paymentIntent) {
          setPaymentState({ status: 'succeeded' })
          options?.onSuccess?.()
          return
        }

        switch (paymentIntent.status) {
          case 'succeeded':
            setPaymentState({ status: 'succeeded' })
            options?.onSuccess?.()
            break

          case 'processing':
          case 'requires_action':
          case 'requires_confirmation':
            /* Still in progress — wait 1s and poll again */
            await new Promise((resolve) => setTimeout(resolve, 1000))
            return pollPaymentStatus(clientSecret, attempts + 1)

          case 'requires_payment_method':
            setPaymentState({
              status: 'failed',
              message:
                'Payment failed. Please try a different payment method.',
            })
            break

          case 'canceled':
            setPaymentState({
              status: 'failed',
              message: 'Payment was canceled.',
            })
            break

          default:
            /* Unknown status — treat as still processing */
            await new Promise((resolve) => setTimeout(resolve, 1000))
            return pollPaymentStatus(clientSecret, attempts + 1)
        }
      } catch {
        /* Network error — retry up to 5 times with 2s delay,
         * then assume success and let the webhook handle it. */
        if (attempts < 5) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return pollPaymentStatus(clientSecret, attempts + 1)
        }
        setPaymentState({ status: 'succeeded' })
        options?.onSuccess?.()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stripe]
  )

  /** Start polling automatically when entering the confirming state */
  useEffect(() => {
    if (paymentState.status === 'confirming') {
      pollPaymentStatus(paymentState.clientSecret)
    }
  }, [paymentState, pollPaymentStatus])

  // --------------------------------------------------------------------------
  // PAYMENT ELEMENT CHANGE HANDLER
  // --------------------------------------------------------------------------

  /**
   * Handle PaymentElement onChange — tracks readiness and clears errors
   * when the user starts editing their payment method.
   */
  const handlePaymentElementChange = (
    event: StripePaymentElementChangeEvent
  ) => {
    setPaymentReady(event.complete)
    if (!event.complete && event.value.type) {
      setPaymentError(null)
    }
  }

  // --------------------------------------------------------------------------
  // CONFIRM STRIPE PAYMENT
  // --------------------------------------------------------------------------

  /**
   * Confirm payment with Stripe — handles both trial (SetupIntent) and
   * regular (PaymentIntent) flows.
   *
   * Trial flow:
   *   1. Call stripe.confirmSetup() with redirect: 'if_required'
   *   2. If SetupIntent.status === 'succeeded' → success
   *   3. Otherwise → enter confirming state for polling
   *
   * Regular flow:
   *   1. Call stripe.confirmPayment() with redirect: 'if_required'
   *   2. Map PaymentIntent.status to the appropriate PaymentState
   *   3. succeeded → success, processing/requires_action → confirming,
   *      requires_payment_method/canceled → throw error
   *
   * @returns The raw Stripe result for callers that need to inspect it
   * @throws Error with user-friendly message on confirmation failure
   */
  const confirmStripePayment = async (
    params: ConfirmPaymentParams
  ): Promise<ConfirmPaymentResult> => {
    if (!stripe) {
      throw new Error('Stripe has not loaded yet. Please try again.')
    }

    if (params.isTrial) {
      /* TRIAL PATH: confirmSetup collects payment method for future charging */
      const setupResult = await stripe.confirmSetup({
        elements: params.elements,
        clientSecret: params.clientSecret,
        confirmParams: {
          return_url: `${params.returnUrl}${params.returnUrl.includes('?') ? '&' : '?'}trial=true`,
        },
        redirect: 'if_required',
      })

      if (setupResult.error) {
        const errorMessage = getPaymentErrorMessage(setupResult.error)
        throw new Error(errorMessage)
      }

      /* Check SetupIntent status */
      const setupIntent = setupResult.setupIntent as SetupIntent | undefined
      if (!setupIntent || setupIntent.status === 'succeeded') {
        setPaymentState({ status: 'succeeded' })
        options?.onSuccess?.()
      } else {
        /* Still processing — enter confirming state for polling */
        setPaymentState({
          status: 'confirming',
          clientSecret: params.clientSecret,
        })
      }

      return { setupIntent: setupIntent ?? undefined }
    }

    /* STANDARD PATH: confirmPayment charges immediately */
    const confirmResult = await stripe.confirmPayment({
      elements: params.elements,
      clientSecret: params.clientSecret,
      confirmParams: {
        return_url: params.returnUrl,
        payment_method_data: {
          billing_details: {
            name: params.billingDetails?.name || undefined,
            email: params.billingDetails?.email || undefined,
          },
        },
      },
      redirect: 'if_required',
    })

    if (confirmResult.error) {
      const errorMessage = getPaymentErrorMessage(confirmResult.error)
      throw new Error(errorMessage)
    }

    /* Handle the PaymentIntent status */
    const paymentIntent = confirmResult.paymentIntent as
      | PaymentIntent
      | undefined

    if (!paymentIntent) {
      /* For subscriptions with deferred payment, we may not have a
       * PaymentIntent in the response. Enter confirming state to poll. */
      setPaymentState({
        status: 'confirming',
        clientSecret: params.clientSecret,
      })
      return {}
    }

    switch (paymentIntent.status) {
      case 'succeeded':
        setPaymentState({ status: 'succeeded' })
        options?.onSuccess?.()
        break

      case 'processing':
      case 'requires_action':
      case 'requires_confirmation':
        setPaymentState({
          status: 'confirming',
          clientSecret: params.clientSecret,
        })
        break

      case 'requires_payment_method':
        throw new Error(
          'Your payment method was declined. Please try a different payment method.'
        )

      case 'canceled':
        throw new Error('Payment was canceled.')

      default:
        setPaymentState({
          status: 'confirming',
          clientSecret: params.clientSecret,
        })
    }

    return { paymentIntent }
  }

  // --------------------------------------------------------------------------
  // RESET
  // --------------------------------------------------------------------------

  /** Reset all payment state back to idle — used for "Try Again" flows */
  const resetPayment = () => {
    setPaymentState({ status: 'idle' })
    setPaymentError(null)
    setPaymentReady(false)
  }

  // --------------------------------------------------------------------------
  // DERIVED STATE
  // --------------------------------------------------------------------------

  /** True when payment is being processed or confirmed (disable form inputs) */
  const isProcessing =
    paymentState.status === 'processing' ||
    paymentState.status === 'confirming'

  /** True specifically when polling for final status */
  const isConfirming = paymentState.status === 'confirming'

  return {
    /* State */
    paymentState,
    setPaymentState,
    paymentError,
    setPaymentError,
    paymentReady,
    setPaymentReady,

    /* Handlers */
    handlePaymentElementChange,
    pollPaymentStatus,
    confirmStripePayment,
    resetPayment,

    /* Derived */
    isProcessing,
    isConfirming,
  }
}
