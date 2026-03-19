/**
 * Shared Stripe initialization utility for client-side payment components.
 *
 * Handles test mode vs live mode Stripe key selection and connected account routing.
 * Used by all payment surfaces: payment links, checkout elements, payment elements, invoices.
 *
 * TEST MODE: Uses test publishable key, NO stripeAccount (platform test account)
 * LIVE MODE: Uses live publishable key WITH stripeAccount (connected account)
 *
 * SOURCE OF TRUTH: StripeClientInit, PaymentStripePromise
 */
'use client'

import { loadStripe } from '@stripe/stripe-js'

/**
 * Create a Stripe.js promise configured for the correct mode and account.
 *
 * @param connectedAccountId - The connected Stripe account ID for live payments
 * @param testMode - When true, uses test Stripe keys without connected account
 * @returns A Stripe.js promise ready for use with Elements provider
 */
export const getStripePromise = (connectedAccountId?: string | null, testMode?: boolean) => {
  const stripeKey = testMode
    ? process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY!
    : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!

  /* TEST MODE: Don't use stripeAccount — payments go to platform's test account */
  /* LIVE MODE: Use stripeAccount for direct charges to connected account */
  return loadStripe(stripeKey, {
    ...(!testMode && connectedAccountId && { stripeAccount: connectedAccountId }),
  })
}
