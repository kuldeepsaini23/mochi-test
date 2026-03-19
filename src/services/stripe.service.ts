/**
 * Stripe Service - Centralized Stripe Operations
 *
 * WHY: Single source of truth for all Stripe-related business logic
 * HOW: Used by webhook handlers and tRPC procedures
 *
 * This service provides utilities for working with Stripe subscriptions,
 * including data mapping and type conversions.
 */

import Stripe from 'stripe'
import { prisma } from '@/lib/config'

/**
 * Type for Stripe subscription with additional fields
 * Stripe types don't expose these but they exist on the API object
 */
type StripeSubscriptionData = {
  current_period_start?: number
  current_period_end?: number
  cancel_at_period_end?: boolean
  trial_start?: number | null
  trial_end?: number | null
}

/**
 * Map Stripe subscription to database subscription data
 *
 * Converts Stripe's subscription object to our database schema format.
 * Handles Unix timestamp conversion to JavaScript Dates and normalizes
 * field names from snake_case (Stripe) to camelCase (our DB).
 *
 * @param subscription - Stripe subscription object from webhook/API
 * @param planKey - Optional plan identifier (e.g., 'pro', 'enterprise')
 * @returns Database-ready subscription data object
 *
 * @example
 * ```ts
 * const stripeSubscription = await stripe.subscriptions.retrieve('sub_123')
 * const dbData = mapSubscriptionData(stripeSubscription, 'pro')
 * await prisma.subscription.create({ data: { ...dbData, referenceId: orgId } })
 * ```
 */
export function mapSubscriptionData(subscription: Stripe.Subscription, planKey?: string) {
  const subData = subscription as unknown as StripeSubscriptionData

  // Note: current_period_end was deprecated at subscription level in Stripe API 2025-03-31
  // For older API versions, it exists at subscription level
  // For newer versions, it's at items.data level
  const periodEnd = subData.current_period_end ||
                   subscription.items.data[0]?.current_period_end
  const periodStart = subData.current_period_start ||
                     subscription.items.data[0]?.current_period_start

  const mapped = {
    id: crypto.randomUUID(),
    plan: planKey || 'unknown',
    stripeCustomerId:
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    periodStart: periodStart ? new Date(periodStart * 1000) : null,
    periodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: subData.cancel_at_period_end ?? false,
    trialStart: subData.trial_start ? new Date(subData.trial_start * 1000) : null,
    trialEnd: subData.trial_end ? new Date(subData.trial_end * 1000) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  return mapped
}

/**
 * Create or update subscription record in database
 *
 * Creates a new subscription record linked to an organization.
 * If a subscription with the same Stripe ID already exists, it updates it instead.
 *
 * @param subscription - Stripe subscription object
 * @param organizationId - Organization ID to link subscription to
 * @param planKey - Optional plan identifier
 * @returns The created or updated subscription record
 *
 * @example
 * ```ts
 * // In webhook handler
 * await upsertSubscription(stripeSubscription, organization.id, 'pro')
 * ```
 */
export async function upsertSubscription(
  subscription: Stripe.Subscription,
  organizationId: string,
  planKey?: string
) {
  const subscriptionData = mapSubscriptionData(subscription, planKey)

  // Check if subscription already exists
  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  })

  if (existing) {
    // Update existing subscription
    const updated = await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        plan: subscriptionData.plan, // CRITICAL: Update plan for upgrades/downgrades
        status: subscriptionData.status,
        periodStart: subscriptionData.periodStart,
        periodEnd: subscriptionData.periodEnd,
        cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
        trialStart: subscriptionData.trialStart,
        trialEnd: subscriptionData.trialEnd,
        updatedAt: new Date(),
      },
    })

    return updated
  }

  // Create new subscription with organization relation
  return await prisma.subscription.create({
    data: {
      ...subscriptionData,
      referenceId: organizationId,
    },
  })
}

/**
 * Update user's Stripe customer ID and onboarding status
 *
 * Marks a user as fully onboarded and links their Stripe customer ID.
 * Called after successful subscription creation.
 *
 * @param userId - User ID to update
 * @param stripeCustomerId - Stripe customer ID from subscription
 *
 * @example
 * ```ts
 * await markUserOnboarded(userId, subscription.customer)
 * ```
 */
export async function markUserOnboarded(userId: string, stripeCustomerId: string) {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingComplete: true,
      stripeCustomerId,
    },
  })
}
