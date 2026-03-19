/**
 * Stripe Client Singleton - Single Source of Truth
 *
 * WHY: Centralized Stripe instance to prevent duplication and ensure consistency
 * HOW: Import this instance everywhere instead of creating new Stripe clients
 *
 * Used by:
 * - Stripe webhook handler
 * - Payment router (subscription creation)
 * - Features router (price fetching)
 */

import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required')
}

/**
 * SOURCE OF TRUTH: StripeLiveInstance
 * Production Stripe instance using live API keys.
 * Used for real payment processing.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover' as any,
})

/**
 * SOURCE OF TRUTH: StripeTestInstance
 *
 * Test Stripe instance using TEST API keys.
 * Used when testMode is enabled on payment elements.
 *
 * IMPORTANT: This allows accepting test cards (4242 4242 4242 4242)
 * without processing real payments.
 *
 * Falls back to the live instance if test key is not configured.
 * This ensures backwards compatibility in environments without test keys.
 */
export const stripeTest = process.env.STRIPE_TEST_SECRET_KEY
  ? new Stripe(process.env.STRIPE_TEST_SECRET_KEY, {
      apiVersion: '2025-10-29.clover' as any,
    })
  : stripe // Fallback to live if no test key configured

/**
 * Get the appropriate Stripe instance based on test mode.
 *
 * @param testMode - When true, returns the test Stripe instance
 * @returns The appropriate Stripe instance for the mode
 */
export function getStripeInstance(testMode?: boolean): Stripe {
  return testMode ? stripeTest : stripe
}
