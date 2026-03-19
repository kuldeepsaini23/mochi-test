/**
 * Checkout Client Component
 *
 * Handles checkout UI with Stripe Payment Element.
 * Supports single price and multi-price layouts.
 *
 * LAYOUTS:
 * - Single price: Form always visible (responsive)
 * - Multi-price desktop: Form on right side
 * - Multi-price mobile: Form in overlay
 */

'use client'

import { useState, useMemo } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { type StripeElementsOptions, type Appearance } from '@stripe/stripe-js'
import { getStripePromise } from '@/lib/stripe/get-stripe-promise'
import { useTheme } from 'next-themes'
import type { Price, Organization, Product } from './types'
import { SinglePriceLayout } from './single-price-layout'
import { MultiPriceLayout } from './multi-price-layout'
import { MobileCheckoutOverlay } from './mobile-checkout-overlay'
import { getPaymentAmount } from './utils'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CheckoutClientProps {
  paymentLinkId: string
  organization: Organization
  product: Product
  prices: Price[]
  defaultPriceId?: string | null
}

export function CheckoutClient({
  paymentLinkId,
  organization,
  product,
  prices,
  defaultPriceId,
}: CheckoutClientProps) {
  const [selectedPriceId, setSelectedPriceId] = useState(defaultPriceId || prices[0]?.id)
  const [mobileCheckoutOpen, setMobileCheckoutOpen] = useState(false)
  const { resolvedTheme } = useTheme()

  const stripePromise = useMemo(
    () => getStripePromise(organization.stripeConnectedAccountId, product.testMode),
    [organization.stripeConnectedAccountId, product.testMode]
  )

  const selectedPrice = prices.find((p) => p.id === selectedPriceId)
  const hasMultiplePrices = prices.length > 1

  // Stripe Elements appearance
  const appearance: Appearance = useMemo(
    () => ({
      theme: resolvedTheme === 'dark' ? 'night' : 'stripe',
      variables: {
        colorPrimary: '#6366f1',
        colorBackground: resolvedTheme === 'dark' ? '#000000' : '#fafafa',
        colorText: resolvedTheme === 'dark' ? '#ffffff' : '#0a0a0a',
        colorTextSecondary: resolvedTheme === 'dark' ? '#a1a1aa' : '#71717a',
        colorTextPlaceholder: '#71717a',
        colorDanger: '#dc2626',
        colorInputBackground: resolvedTheme === 'dark' ? '#1a1a1a' : '#ffffff',
        colorInputBorder: resolvedTheme === 'dark' ? '#3f3f46' : '#e4e4e7',
        borderRadius: '8px',
        spacingUnit: '4px',
        spacingGridRow: '16px',
      },
      rules: {
        '.Input': {
          border: `1px solid ${resolvedTheme === 'dark' ? '#3f3f46' : '#e4e4e7'}`,
          backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
          boxShadow: 'none',
          padding: '10px 12px',
        },
        '.Input:focus': {
          border: '1px solid #6366f1',
          boxShadow: '0 0 0 1px #6366f1',
        },
        '.Input--invalid': {
          border: '1px solid #dc2626',
        },
        '.Label': {
          color: resolvedTheme === 'dark' ? '#ffffff' : '#0a0a0a',
          fontWeight: '500',
          fontSize: '14px',
          marginBottom: '6px',
        },
        '.Tab': {
          border: `1px solid ${resolvedTheme === 'dark' ? '#3f3f46' : '#e4e4e7'}`,
          backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
        },
        '.Tab:hover': {
          backgroundColor: resolvedTheme === 'dark' ? '#1a1a1a' : '#f4f4f5',
        },
        '.Tab--selected': {
          border: '1px solid #6366f1',
          backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
        },
        '.TabLabel': {
          color: resolvedTheme === 'dark' ? '#a1a1aa' : '#71717a',
        },
        '.TabLabel--selected': {
          color: resolvedTheme === 'dark' ? '#ffffff' : '#0a0a0a',
        },
        '.TabIcon': {
          fill: resolvedTheme === 'dark' ? '#a1a1aa' : '#71717a',
        },
        '.TabIcon--selected': {
          fill: '#6366f1',
        },
        '.Block': {
          backgroundColor: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
          border: `1px solid ${resolvedTheme === 'dark' ? '#3f3f46' : '#e4e4e7'}`,
        },
      },
    }),
    [resolvedTheme]
  )

  /**
   * Stripe Elements options — adapts mode based on billing type and trial.
   * Free trials use 'setup' mode (SetupIntent) to collect payment method
   * without charging until the trial ends.
   * SOURCE OF TRUTH: PaymentLinkElementsMode
   */
  /**
   * Stripe Elements options — adapts mode based on billing type and trial.
   * No explicit paymentMethodTypes — lets the server-side automatic_payment_methods
   * control which methods appear (cards, Apple Pay, Google Pay, Link, etc.).
   *
   * SOURCE OF TRUTH: ElementsPaymentMethodTypes
   */
  const getElementsOptions = (price: Price): StripeElementsOptions => {
    /**
     * Trial is ONLY valid for RECURRING/SPLIT_PAYMENT billing types.
     * Stripe does not natively support trials on one-time purchases.
     * SOURCE OF TRUTH: RecurringOnlyTrialGuard, PaymentLinkElementsMode
     */
    const isSubscription = price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT'
    const isTrial = Boolean(isSubscription && price.trialDays && price.trialDays > 0)

    /** Trial RECURRING/SPLIT → setup mode (no charge upfront) */
    if (isTrial) {
      return { mode: 'setup', currency: price.currency, appearance }
    }

    return {
      mode: isSubscription ? 'subscription' : 'payment',
      amount: getPaymentAmount(price),
      currency: price.currency,
      appearance,
    }
  }

  // Mobile checkout overlay
  if (mobileCheckoutOpen && hasMultiplePrices && selectedPrice) {
    return (
      <Elements stripe={stripePromise} options={getElementsOptions(selectedPrice)}>
        <MobileCheckoutOverlay
          paymentLinkId={paymentLinkId}
          product={product}
          price={selectedPrice}
          onBack={() => setMobileCheckoutOpen(false)}
          testMode={product.testMode}
        />
      </Elements>
    )
  }

  // Single price layout
  if (!hasMultiplePrices && selectedPrice) {
    return (
      <Elements stripe={stripePromise} options={getElementsOptions(selectedPrice)}>
        <SinglePriceLayout
          paymentLinkId={paymentLinkId}
          organization={organization}
          product={product}
          price={selectedPrice}
          testMode={product.testMode}
        />
      </Elements>
    )
  }

  // Multi-price layout
  if (selectedPrice) {
    return (
      <Elements stripe={stripePromise} options={getElementsOptions(selectedPrice)}>
        <MultiPriceLayout
          paymentLinkId={paymentLinkId}
          organization={organization}
          product={product}
          prices={prices}
          selectedPriceId={selectedPriceId!}
          selectedPrice={selectedPrice}
          onPriceSelect={setSelectedPriceId}
          onMobileCheckout={() => setMobileCheckoutOpen(true)}
          testMode={product.testMode}
        />
      </Elements>
    )
  }

  return null
}
