/**
 * Stripe Webhook Service - Business Logic for Stripe Events
 *
 * WHY: Separates webhook event handling logic from HTTP layer
 * HOW: Called by webhook route handler after signature verification
 *
 * This service contains all business logic for processing Stripe webhook events.
 * The route handler only handles HTTP concerns (signature verification, responses).
 *
 * ARCHITECTURE:
 * Route Handler (route.ts) → Webhook Service (this file) → Domain Services (organization, stripe)
 */

import Stripe from 'stripe'
import { prisma } from '@/lib/config'
import { realtime } from '@/lib/realtime'
import { createStudioOrganization } from './organization.service'
import { upsertSubscription, markUserOnboarded } from './stripe.service'
// REMOVED: syncOrganizationPlan, deactivateAllPlans - StudioPlan is now ONLY for SaaS configuration
// Subscription tier is tracked in Subscription.plan field, NOT StudioPlan table

/**
 * Type for Stripe Invoice with subscription field
 * Stripe types don't always expose these but they exist on the API object
 */
type StripeInvoiceData = {
  subscription?: string | Stripe.Subscription
  attempt_count?: number | null
}

/**
 * Check if user already has a studio organization
 *
 * Prevents duplicate organization creation during webhook processing.
 * Returns existing organization info if found.
 *
 * @param userId - User ID to check
 * @returns Organization info if exists, null otherwise
 */
async function getUserOrganization(userId: string) {
  const member = await prisma.member.findFirst({
    where: {
      userId,
      role: 'owner',
    },
    include: {
      organization: true,
    },
  })

  return member
    ? {
        organizationId: member.organizationId,
        organization: member.organization,
      }
    : null
}

/**
 * Handle subscription creation from Stripe webhook
 *
 * FLOW:
 * 1. Parse subscription metadata (userId, studioData, planKey)
 * 2. Check if user already has an organization
 * 3. If yes: Create subscription for existing org
 * 4. If no: Create new organization + subscription
 * 5. Mark user as onboarded
 *
 * This is the MAIN entry point for subscription creation webhooks.
 *
 * @param subscription - Stripe subscription object from webhook event
 * @throws Will throw if metadata is missing or database operations fail
 *
 * @example
 * ```ts
 * // In webhook route handler
 * case 'customer.subscription.created':
 *   await handleSubscriptionCreated(event.data.object)
 *   break
 * ```
 */
export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
): Promise<void> {
  const metadata = subscription.metadata
  const planKey = metadata.planKey
  const isUpgrade = metadata.upgrade === 'true'

  // ============================================================================
  // UPGRADE PATH: Subscription created from upgradeOrganization mutation
  // ============================================================================
  // When a free-plan user upgrades, a NEW Stripe subscription is created.
  // The organization already exists — we just need to upsert the subscription
  // record and handle trial fingerprint tracking. No onboarding flow needed.
  if (isUpgrade) {
    const organizationId = metadata.organizationId
    if (!organizationId) {
      throw new Error('Upgrade subscription missing organizationId in metadata')
    }

    // Idempotency check — skip if subscription already recorded
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        referenceId: organizationId,
        stripeSubscriptionId: subscription.id,
      },
    })
    if (existingSubscription) return

    // Upsert subscription record for the existing organization
    await upsertSubscription(subscription, organizationId, planKey)

    // Clear churned status — this org is re-subscribing after cancellation
    // NOTE: churnedAt field added to schema — pending prisma generate, cast data to bypass TS check
    await prisma.organization.update({
      where: { id: organizationId },
      data: { churnedAt: null } as Record<string, unknown>,
    })

    // If subscription has a trial, mark the org owner's fingerprints as trial used
    // so they can't abuse trial periods with the same card
    if (subscription.trial_end && subscription.status === 'trialing') {
      const owner = await prisma.member.findFirst({
        where: { organizationId, role: 'owner' },
        select: { userId: true },
      })
      if (owner) {
        const { markUserFingerprintsAsTrialUsed } = await import(
          './card-fingerprint.service'
        )
        await markUserFingerprintsAsTrialUsed(owner.userId)
      }
    }

    return
  }

  // ============================================================================
  // ONBOARDING PATH: Subscription created during new user signup
  // ============================================================================
  // Requires userId and studioData to create the organization from scratch.
  const userId = metadata.userId
  const studioDataString = metadata.studioData

  if (!userId || !studioDataString) {
    throw new Error(
      'Invalid subscription metadata: missing userId or studioData'
    )
  }

  const studioData = JSON.parse(studioDataString)

  // Check if user already has an organization
  const existingOrg = await getUserOrganization(userId)

  let organizationId: string

  if (existingOrg) {
    // Check if subscription already exists (idempotency)
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        referenceId: existingOrg.organizationId,
        stripeSubscriptionId: subscription.id,
      },
    })

    if (existingSubscription) {
      return
    }

    organizationId = existingOrg.organizationId
  } else {
    // Create new organization (includes onboarding survey data if provided)
    const result = await createStudioOrganization({
      userId,
      studioName: studioData.studioName,
      phoneNumber: studioData.phoneNumber,
      country: studioData.country,
      address: studioData.address,
      city: studioData.city,
      state: studioData.state,
      zipCode: studioData.zipCode,
      referralSource: studioData.referralSource,
      role: studioData.role,
      teamSize: studioData.teamSize,
      intendedUse: studioData.intendedUse,
      niche: studioData.niche,
    })

    organizationId = result.organizationId
  }

  // Create subscription record
  await upsertSubscription(subscription, organizationId, planKey)

  // Mark user as onboarded with Stripe customer ID
  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id
  await markUserOnboarded(userId, stripeCustomerId)

  // If subscription has a trial, mark all user's fingerprints as trial used
  if (subscription.trial_end && subscription.status === 'trialing') {
    const { markUserFingerprintsAsTrialUsed } = await import(
      './card-fingerprint.service'
    )
    await markUserFingerprintsAsTrialUsed(userId)
  }

  // Emit realtime event to notify frontend that onboarding is complete
  // This replaces polling - frontend will receive instant notification
  await realtime.emit('onboarding.completed', {
    userId,
    organizationId,
    organizationName: studioData.studioName,
  })
}

/**
 * Handle subscription updates from Stripe webhook
 *
 * CRITICAL: This handles many important transitions:
 * - Trial → Paid (when trial ends and payment succeeds)
 * - Plan changes (upgrades/downgrades)
 * - Status changes (active → past_due → canceled)
 * - Billing cycle updates
 *
 * BUSINESS LOGIC:
 * 1. Update subscription record with new data
 * 2. Detect if plan changed (compare Stripe price ID)
 * 3. Detect if status changed (trial → active, etc.)
 * 4. Sync StudioPlan to match current subscription
 *
 * @param subscription - Updated Stripe subscription object
 *
 * @example
 * ```ts
 * case 'customer.subscription.updated':
 *   await handleSubscriptionUpdated(event.data.object)
 *   break
 * ```
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const existingSubscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  })

  if (!existingSubscription) {
    return
  }

  const organizationId = existingSubscription.referenceId
  const oldStatus = existingSubscription.status
  const newStatus = subscription.status

  // Get current and new price IDs to detect plan changes
  const newPriceId = subscription.items.data[0]?.price.id
  const metadata = subscription.metadata
  const planKey = metadata.planKey || 'free'

  // Update subscription record
  await upsertSubscription(subscription, organizationId, planKey)

  // Handle specific transitions
  const isTrialEnding = oldStatus === 'trialing' && newStatus === 'active'
  const isBecomingPastDue = newStatus === 'past_due'
  const isReactivating = oldStatus === 'past_due' && newStatus === 'active'
  const isCanceledAtPeriodEnd = subscription.cancel_at_period_end === true
  const wasCanceledAtPeriodEnd = existingSubscription.cancelAtPeriodEnd === true

  // Detect when user cancels subscription (will end at period end)
  if (isCanceledAtPeriodEnd && !wasCanceledAtPeriodEnd) {
    // Note: current_period_end was deprecated in Stripe API 2025-03-31
    // For older API versions, it exists at subscription level
    // For newer versions, it's at items.data level
    const periodEnd =
      (subscription as any).current_period_end ||
      subscription.items.data[0]?.current_period_end

    const periodEndDate = periodEnd ? new Date(periodEnd * 1000) : null

    // Send cancellation email to organization owner
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          where: { role: 'owner' },
          include: { user: true },
          take: 1,
        },
      },
    })

    const owner = organization?.members[0]?.user
    if (owner?.email && organization) {
      const { sendSubscriptionEventEmail } = await import('./email.service')
      try {
        await sendSubscriptionEventEmail({
          to: owner.email,
          subject: `Subscription Canceled - ${organization.name}`,
          organizationName: organization.name,
          planName: planKey,
          eventDate: new Date(),
          periodEnd: periodEndDate || undefined,
        })
      } catch (error) {
        // Email send failed silently
      }
    }
  }

  // Clear churned status when subscription becomes active (reactivation or trial→active)
  // NOTE: churnedAt field added to schema — pending prisma generate, cast data to bypass TS check
  if (newStatus === 'active' && oldStatus !== 'active') {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { churnedAt: null } as Record<string, unknown>,
    })
  }

  // Detect when user re-activates a canceled subscription
  if (!isCanceledAtPeriodEnd && wasCanceledAtPeriodEnd) {
    // Send reactivation email to organization owner
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          where: { role: 'owner' },
          include: { user: true },
          take: 1,
        },
      },
    })

    const owner = organization?.members[0]?.user
    if (owner?.email && organization) {
      const { sendSubscriptionEventEmail } = await import('./email.service')
      try {
        await sendSubscriptionEventEmail({
          to: owner.email,
          subject: `Subscription Reactivated - ${organization.name}`,
          organizationName: organization.name,
          planName: planKey,
          eventDate: new Date(),
        })
      } catch (error) {
        // Email send failed silently
      }
    }
  }
}

/**
 * Handle subscription cancellation from Stripe webhook
 *
 * SOURCE OF TRUTH: handleSubscriptionDeleted, subscription-downgrade
 *
 * CRITICAL: This event fires when the subscription is actually deleted at the end of the billing period.
 * This is NOT the same as marking cancel_at_period_end=true (that's subscription.updated).
 *
 * BEHAVIOR: Downgrade to free plan instead of destroying the organization.
 * By deleting the Subscription DB record, getOrganizationTier() in feature-gate.service.ts
 * automatically returns { tier: 'free' } — no fake subscription record needed.
 * The organization and all its data remain intact with free-tier feature limits.
 *
 * The churnedAt timestamp is set on the organization so the portal can distinguish
 * between "never paid" orgs (churnedAt=null) and "paid then cancelled" orgs (churnedAt=date).
 *
 * @param subscription - Canceled Stripe subscription object
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const existingSubscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  })

  if (!existingSubscription) return

  const organizationId = existingSubscription.referenceId

  // Delete the subscription record — getOrganizationTier() returns 'free' tier
  // when no subscription exists, naturally downgrading the organization
  await prisma.subscription.delete({
    where: { id: existingSubscription.id },
  })

  // Mark the organization as churned so portal can distinguish from never-paid free orgs
  // NOTE: churnedAt field added to schema — pending prisma generate, cast data to bypass TS check
  await prisma.organization.update({
    where: { id: organizationId },
    data: { churnedAt: new Date() } as Record<string, unknown>,
  })

  console.log(
    `[subscription.deleted] Organization ${organizationId} downgraded to free plan (subscription ${subscription.id} removed)`
  )
}

/**
 * Handle checkout session completion
 *
 * Currently a no-op since organization creation happens in subscription.created.
 * Kept for future enhancements (e.g., one-time payments, setup intents).
 *
 * @param session - Completed checkout session object
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  // Organization creation happens in customer.subscription.created
  // This event is just logged for audit purposes
}

/**
 * Handle trial will end warning (3 days before trial expires)
 *
 * Stripe sends this 3 days before trial ends.
 * Use this to notify users to add payment method or prepare for billing.
 *
 * @param subscription - Subscription with upcoming trial end
 *
 * @example
 * ```ts
 * case 'customer.subscription.trial_will_end':
 *   await handleTrialWillEnd(event.data.object)
 *   break
 * ```
 */
export async function handleTrialWillEnd(
  subscription: Stripe.Subscription
): Promise<void> {
  const existingSubscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  })

  if (!existingSubscription) {
    return
  }

  // TODO: Send email/notification to organization owner
  // TODO: Show in-app banner about trial ending
  // For now, just skip. You can add notification logic here later.
}

/**
 * Handle successful invoice payment
 *
 * Called when invoice is successfully paid.
 * Important for confirming trial-to-paid transitions.
 *
 * @param invoice - Paid invoice object
 *
 * @example
 * ```ts
 * case 'invoice.payment_succeeded':
 *   await handleInvoicePaymentSucceeded(event.data.object)
 *   break
 * ```
 */
export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  const invoiceData = invoice as unknown as StripeInvoiceData

  if (!invoiceData.subscription) {
    return
  }

  const subscriptionId =
    typeof invoiceData.subscription === 'string'
      ? invoiceData.subscription
      : invoiceData.subscription.id

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  })

  if (!subscription) {
    return
  }

  // TODO: Send payment confirmation email
  // TODO: Log payment in audit trail
}

/**
 * Handle failed invoice payment
 *
 * CRITICAL: This is the PRIMARY entry point for payment failures
 *
 * FLOW:
 * 1. Payment fails → invoice.payment_failed webhook fires
 * 2. Send email notification to organization owner
 * 3. Stripe automatically retries (Smart Retries: 3 attempts over ~2 weeks)
 * 4. During retries, subscription status becomes 'past_due'
 * 5. Frontend shows orange banner for 'past_due' status
 * 6. If all retries fail → subscription becomes 'unpaid' (if configured) or 'canceled'
 * 7. When subscription.deleted fires → we delete all organization data
 *
 * NO REDUNDANT DATA STORAGE:
 * - Stripe manages retry schedule
 * - Stripe tracks attempt count
 * - Stripe handles grace period via 'past_due' status
 * - We only use subscription.status from our DB (which mirrors Stripe)
 *
 * @param invoice - Failed invoice object
 *
 * @example
 * ```ts
 * case 'invoice.payment_failed':
 *   await handleInvoicePaymentFailed(event.data.object)
 *   break
 * ```
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const invoiceData = invoice as unknown as StripeInvoiceData

  if (!invoiceData.subscription) {
    return
  }

  const subscriptionId =
    typeof invoiceData.subscription === 'string'
      ? invoiceData.subscription
      : invoiceData.subscription.id

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    include: {
      organization: {
        include: {
          members: {
            where: { role: 'owner' },
            include: { user: true },
            take: 1,
          },
        },
      },
    },
  })

  if (!subscription) {
    return
  }

  const attemptCount = invoiceData.attempt_count ?? 1

  // Get organization owner email for notification
  const owner = subscription.organization.members[0]?.user
  if (!owner?.email) {
    return
  }

  // Send payment failure email
  //TODO: Don't forget to use the custom domain, or the platform custom subdomain for this in the future.
  const { sendPaymentFailedEmail } = await import('./email.service')
  const updatePaymentLink = `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`
  const nextRetryDate = invoice.next_payment_attempt
    ? new Date(invoice.next_payment_attempt * 1000)
    : undefined

  try {
    await sendPaymentFailedEmail({
      to: owner.email,
      subject: `Payment Failed - Action Required for ${subscription.organization.name}`,
      organizationName: subscription.organization.name,
      attemptCount,
      nextRetryDate,
      updatePaymentLink,
    })
  } catch (error) {
    // Email send failed silently
  }

  // NOTE: Stripe will automatically retry based on Smart Retries settings
  // subscription.updated webhook will fire when status becomes 'past_due'
  // The frontend will detect 'past_due' status and show orange banner
}
