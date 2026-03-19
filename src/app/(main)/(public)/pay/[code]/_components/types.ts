/**
 * Checkout Types
 *
 * Shared types for the checkout page components.
 * Uses Stripe Payment Element for 100+ payment methods support.
 */

export interface Price {
  id: string
  name: string
  amount: number
  currency: string
  billingType: 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT'
  interval: string | null
  intervalCount: number | null
  installments: number | null
  installmentInterval: string | null
  features: { id: string; name: string }[]
  /**
   * Free trial period in days. When > 0, Stripe creates a SetupIntent
   * instead of PaymentIntent so the customer is charged after the trial.
   * SOURCE OF TRUTH: PaymentLinkTrialDays, ProductPriceTrialDays
   */
  trialDays?: number | null
}

export interface Organization {
  id: string
  name: string
  logo: string | null
  stripeConnectedAccountId?: string | null
}

export interface Product {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  /**
   * SOURCE OF TRUTH: ProductTestMode
   * When true, this product uses test Stripe API keys for payments.
   */
  testMode?: boolean
}

export interface CheckoutFormData {
  firstName: string
  lastName: string
  email: string
}
