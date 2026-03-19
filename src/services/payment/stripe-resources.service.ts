/**
 * Stripe Resources Service
 *
 * Handles getting or creating Stripe resources (customers, products, prices)
 * on connected accounts or the platform account (test mode).
 *
 * These helpers are shared across payment-link.service.ts, invoice.service.ts,
 * and any other service that needs to resolve Stripe resources before creating
 * payments or subscriptions.
 *
 * SOURCE OF TRUTH: StripeResourceHelpers, StripeGetOrCreatePrice, StripeGetOrCreateTrialPrice
 */

import 'server-only'
import { stripe } from '@/lib/config'
import type Stripe from 'stripe'
import { BillingInterval } from '@/generated/prisma'
import { getConnectedAccountOptions } from '@/lib/stripe/test-mode'
// ============================================================================
// TYPES
// ============================================================================

/**
 * Customer data required for Stripe customer creation.
 * SOURCE OF TRUTH: CustomerData
 */
export type CustomerData = {
  firstName: string
  lastName: string
  email: string
}

// ============================================================================
// STRIPE INTERVAL CONVERSION
// ============================================================================

/**
 * Converts a Prisma BillingInterval enum to the Stripe-compatible interval string.
 * Used when creating recurring prices on Stripe.
 */
export function toStripeInterval(interval: BillingInterval): Stripe.Price.Recurring.Interval {
  switch (interval) {
    case 'DAY': return 'day'
    case 'WEEK': return 'week'
    case 'MONTH': return 'month'
    case 'YEAR': return 'year'
    default: return 'month'
  }
}

// ============================================================================
// STRIPE CUSTOMER
// ============================================================================

/**
 * Get or create a Stripe customer on the target account.
 *
 * Searches by email first to avoid duplicates. If a customer exists, updates
 * their name/metadata. Otherwise creates a new customer.
 *
 * Uses centralized test mode utilities for account selection.
 * TEST MODE: When connectedAccountId is null, creates customer on platform account.
 * LIVE MODE: Creates customer on the connected account.
 *
 * @param connectedAccountId - The connected account ID, or null for platform account (test mode)
 * @param customer - Customer data (email, name)
 * @param stripeInstance - The Stripe instance to use
 */
export async function getOrCreateStripeCustomer(
  connectedAccountId: string | null,
  customer: CustomerData,
  stripeInstance: Stripe = stripe
): Promise<Stripe.Customer> {
  // Use centralized utility for account options
  const stripeOptions = getConnectedAccountOptions(connectedAccountId)

  const existing = await stripeInstance.customers.list(
    { email: customer.email, limit: 1 },
    stripeOptions
  )

  const customerData: Stripe.CustomerCreateParams = {
    email: customer.email,
    name: `${customer.firstName} ${customer.lastName}`,
    metadata: { firstName: customer.firstName, lastName: customer.lastName },
  }

  if (existing.data.length > 0) {
    return await stripeInstance.customers.update(existing.data[0].id, customerData, stripeOptions)
  }

  return await stripeInstance.customers.create(customerData, stripeOptions)
}

// ============================================================================
// STRIPE PRODUCT
// ============================================================================

/**
 * Get or create a Stripe product on the target account.
 *
 * Searches by mochiProductId metadata to avoid duplicates.
 *
 * Uses centralized test mode utilities for account selection.
 * TEST MODE: When connectedAccountId is null, creates product on platform account.
 * LIVE MODE: Creates product on connected account.
 */
export async function getOrCreateStripeProduct(
  connectedAccountId: string | null,
  product: { id: string; name: string; description: string | null; imageUrl: string | null },
  stripeInstance: Stripe = stripe
): Promise<string> {
  const stripeOptions = getConnectedAccountOptions(connectedAccountId)

  const existing = await stripeInstance.products.search(
    { query: `metadata['mochiProductId']:'${product.id}'` },
    stripeOptions
  )

  if (existing.data.length > 0) return existing.data[0].id

  const stripeProduct = await stripeInstance.products.create(
    {
      name: product.name,
      description: product.description || undefined,
      images: product.imageUrl ? [product.imageUrl] : undefined,
      metadata: { mochiProductId: product.id },
    },
    stripeOptions
  )

  return stripeProduct.id
}

// ============================================================================
// STRIPE PRICE
// ============================================================================

/**
 * Get or create a Stripe price on the target account.
 *
 * SOURCE OF TRUTH: StripeGetOrCreatePrice
 *
 * Supports BOTH recurring and one-time prices:
 * - Recurring: pass interval + intervalCount -> creates price with recurring config
 * - One-time: omit interval (null/undefined) -> creates price without recurring
 *
 * TEST MODE: When connectedAccountId is null, creates price on platform test account.
 * LIVE MODE: Creates price on connected account.
 *
 * Uses mochiPriceId metadata to deduplicate — searches for existing price first.
 */
export async function getOrCreateStripePrice(
  connectedAccountId: string | null,
  stripeProductId: string,
  price: {
    id: string
    name: string
    amount: number
    currency: string
    interval?: BillingInterval | null
    intervalCount?: number | null
  },
  stripeInstance: Stripe = stripe
): Promise<string> {
  const stripeOptions = getConnectedAccountOptions(connectedAccountId)

  const existing = await stripeInstance.prices.search(
    { query: `metadata['mochiPriceId']:'${price.id}'` },
    stripeOptions
  )

  if (existing.data.length > 0) return existing.data[0].id

  const createParams: Stripe.PriceCreateParams = {
    product: stripeProductId,
    unit_amount: price.amount,
    currency: price.currency,
    nickname: price.name,
    metadata: { mochiPriceId: price.id },
  }

  /** Only add recurring config for subscription prices (RECURRING/SPLIT_PAYMENT) */
  if (price.interval) {
    createParams.recurring = {
      interval: toStripeInterval(price.interval),
      interval_count: price.intervalCount || 1,
    }
  }

  const stripePrice = await stripeInstance.prices.create(createParams, stripeOptions)

  return stripePrice.id
}

// ============================================================================
// STRIPE TRIAL PRICE
// ============================================================================

/**
 * Get or create a RECURRING Stripe price for a ONE_TIME product that needs a trial subscription.
 *
 * SOURCE OF TRUTH: StripeGetOrCreateTrialPrice, OneTimeTrialConversion
 *
 * When a ONE_TIME product has trialDays configured, we need to create a subscription
 * to leverage Stripe's trial_period_days feature. This function creates a monthly
 * recurring price with a special metadata key (mochiTrialPriceId) to distinguish
 * it from the regular one-time price (mochiPriceId).
 *
 * The subscription using this price should be created with cancel_at_period_end: true
 * so it auto-cancels after the first charge post-trial.
 *
 * @param connectedAccountId - null for test mode (platform account), string for live mode
 * @param stripeProductId - The Stripe product ID to attach the price to
 * @param price - The Mochi price record (amount, currency, id for metadata)
 * @param stripeInstance - Stripe SDK instance (test or live)
 * @returns The Stripe price ID (existing or newly created)
 */
export async function getOrCreateStripeTrialPrice(
  connectedAccountId: string | null,
  stripeProductId: string,
  price: {
    id: string
    name: string
    amount: number
    currency: string
  },
  stripeInstance: Stripe = stripe
): Promise<string> {
  const stripeOptions = getConnectedAccountOptions(connectedAccountId)

  /** Search for existing trial price by the special mochiTrialPriceId metadata key */
  const existing = await stripeInstance.prices.search(
    { query: `metadata['mochiTrialPriceId']:'${price.id}'` },
    stripeOptions
  )

  if (existing.data.length > 0) return existing.data[0].id

  /**
   * Create a monthly recurring price — the trial subscription will charge this amount
   * once after the trial period ends, then auto-cancel via cancel_at_period_end.
   */
  const stripePrice = await stripeInstance.prices.create(
    {
      product: stripeProductId,
      unit_amount: price.amount,
      currency: price.currency,
      nickname: `${price.name} (trial)`,
      recurring: {
        interval: 'month',
        interval_count: 1,
      },
      metadata: { mochiTrialPriceId: price.id },
    },
    stripeOptions
  )

  return stripePrice.id
}
