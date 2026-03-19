import { cache } from 'react'
import { TRPCError } from '@trpc/server'
import { prisma } from '@/lib/config/prisma'
import {
  PLANS,
  FEATURES,
  type FeatureKey,
} from '@/lib/config/feature-gates'

/**
 * Feature Gate Service
 *
 * Handles organization feature gate checks and consumption tracking.
 * Implements limit-based features from the feature gates configuration.
 *
 * Flow:
 * 1. Check permissions first (handled in procedures)
 * 2. Check feature gates (this service)
 * 3. Perform action
 * 4. Increment usage counter
 * 5. Invalidate cache
 */

// ============================================================================
// Types
// ============================================================================

export type FeatureGateCheckResult = {
  allowed: boolean
  reason?: string
  currentUsage?: number
  limit?: number
}

export type UsageMetricsData = {
  featureKey: string
  currentUsage: number
  limit: number | null
  available: number | null
  percentage: number | null
}

// ============================================================================
// Get Organization Tier
// ============================================================================

/**
 * Get the active plan tier for an organization.
 * Cached per request to avoid duplicate queries.
 *
 * SOURCE OF TRUTH: Organization Tier Determination
 *
 * PORTAL ORGANIZATION BYPASS:
 * Portal organizations (isPortalOrganization=true) receive the hidden 'portal' tier
 * with unlimited features, completely bypassing subscription-based tier logic.
 * This check happens FIRST before any subscription validation.
 *
 * SECURITY: Validates subscription status and expiration before returning tier.
 * If subscription is expired or inactive, returns FREE tier regardless of stored plan.
 */
export const getOrganizationTier = cache(async (organizationId: string) => {
  // ============================================================================
  // PORTAL ORGANIZATION CHECK - MUST BE FIRST!
  // ============================================================================
  // Portal organizations get the hidden 'portal' tier with unlimited features.
  // This bypasses ALL subscription-based tier logic.
  // SECURITY: The isPortalOrganization flag can only be set during organization
  // creation when the creator's email matches PORTAL_INITIAL_OWNER_EMAIL.
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { isPortalOrganization: true },
  })

  // If this is a portal organization, return the hidden portal tier immediately
  if (organization?.isPortalOrganization) {
    return {
      tier: 'portal' as const,
      planName: PLANS.portal.name,
      isOnTrial: false,
      features: PLANS.portal.features,
      subscription: null,
      billingInterval: null,
      isPortalOrganization: true, // Flag for UI awareness (e.g., hide upgrade prompts)
    }
  }

  // ============================================================================
  // STANDARD SUBSCRIPTION-BASED TIER LOGIC
  // ============================================================================
  // Get the organization's subscription
  const subscription = await prisma.subscription.findFirst({
    where: {
      referenceId: organizationId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // If no subscription exists, default to free plan
  if (!subscription) {
    return {
      tier: 'free' as const,
      planName: PLANS.free.name,
      isOnTrial: false,
      features: PLANS.free.features,
      subscription: null,
      billingInterval: null,
      isPortalOrganization: false,
    }
  }

  // Get plan tier from subscription.plan field (e.g., "starter", "pro", "enterprise")
  const planTierKey = subscription.plan.toLowerCase()

  /**
   * Determine billing interval from subscription period dates
   * WHY: We can calculate this from periodStart and periodEnd without querying Stripe
   * HOW: Monthly subscriptions have ~30 day periods, yearly have ~365 day periods
   *
   * SOURCE OF TRUTH: Subscription.periodStart and Subscription.periodEnd from database
   */
  let billingInterval: 'monthly' | 'yearly' | null = null
  const tierConfig = PLANS[planTierKey as keyof typeof PLANS]
  if (tierConfig && subscription.periodStart && subscription.periodEnd) {
    const periodStartMs = subscription.periodStart.getTime()
    const periodEndMs = subscription.periodEnd.getTime()
    const periodDays = Math.round((periodEndMs - periodStartMs) / (1000 * 60 * 60 * 24))

    // Monthly periods are typically 28-31 days, yearly are ~365 days
    // Using 60 days as threshold to distinguish (any period > 60 days is yearly)
    billingInterval = periodDays > 60 ? 'yearly' : 'monthly'
  }

  // SECURITY CHECK: Validate subscription status and expiration
  // For paid plans (not free), we MUST have a valid, active subscription
  if (planTierKey !== 'free') {
    const now = new Date()

    // Check if subscription has expired based on periodEnd
    // IMPORTANT: Even if cancelAtPeriodEnd=true, user keeps access until periodEnd expires
    // This handles both scenarios:
    // 1. Trial canceled: User keeps access until trial_end date
    // 2. Paid subscription canceled: User keeps access until current_period_end date
    // Only when periodEnd is reached, access is revoked OR when subscription.deleted fires
    if (subscription.periodEnd && subscription.periodEnd < now) {
      return {
        tier: 'free' as const,
        planName: PLANS.free.name,
        isOnTrial: false,
        features: PLANS.free.features,
        subscription: null,
        billingInterval: null,
        isPortalOrganization: false,
      }
    }

    // Check subscription status - must be active, trialing, past_due, or incomplete
    const validStatuses = ['active', 'trialing', 'past_due', 'incomplete']
    if (!validStatuses.includes(subscription.status)) {
      // Don't auto-downgrade - let admin handle this manually
    }

    // Check if trial has expired
    const isOnTrial =
      subscription.status === 'trialing' &&
      subscription.trialEnd &&
      subscription.trialEnd > now

    // If trialing status but trial has expired, downgrade to free
    if (subscription.status === 'trialing' && !isOnTrial) {
      return {
        tier: 'free' as const,
        planName: PLANS.free.name,
        isOnTrial: false,
        features: PLANS.free.features,
        subscription: null,
        billingInterval: null,
        isPortalOrganization: false,
      }
    }

    // Subscription is valid - return the paid tier
    const tierKey = planTierKey as keyof typeof PLANS

    if (!tierConfig) {
      return {
        tier: 'free' as const,
        planName: PLANS.free.name,
        isOnTrial: false,
        features: PLANS.free.features,
        subscription: null,
        billingInterval: null,
        isPortalOrganization: false,
      }
    }

    const result = {
      tier: tierKey,
      planName: tierConfig.name,
      isOnTrial,
      features: tierConfig.features,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        periodEnd: subscription.periodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      billingInterval,
      isPortalOrganization: false,
    }

    return result
  }

  // Free plan - no subscription validation needed
  return {
    tier: 'free' as const,
    planName: PLANS.free.name,
    isOnTrial: false,
    features: PLANS.free.features,
    subscription: null,
    billingInterval: null,
    isPortalOrganization: false,
  }
})

// ============================================================================
// Get Usage Metrics
// ============================================================================

/**
 * Get usage metrics for a specific feature.
 * Cached per request.
 */
export const getUsageMetrics = cache(
  async (organizationId: string, featureKey: FeatureKey) => {
    const metrics = await prisma.usageMetrics.findUnique({
      where: {
        organizationId_featureKey: {
          organizationId,
          featureKey,
        },
      },
    })

    return metrics || null
  }
)

/**
 * Get all usage metrics for an organization.
 * Cached per request.
 */
export const getAllUsageMetrics = cache(async (organizationId: string) => {
  const tier = await getOrganizationTier(organizationId)
  const metrics = await prisma.usageMetrics.findMany({
    where: {
      organizationId,
    },
  })

  // Build comprehensive usage data
  const usageData: Record<string, UsageMetricsData> = {}

  // Get all limit-based features from FEATURES config
  const limitFeatures = Object.entries(FEATURES.organization).filter(
    ([_, config]) => config.type === 'limit'
  )

  for (const [featureKey, _] of limitFeatures) {
    const metric = metrics.find((m) => m.featureKey === featureKey)
    const currentUsage = metric?.currentUsage || 0

    // Get the limit from organization features
    const limit = tier.features[featureKey as keyof typeof tier.features] as number | null

    // Handle -1 as unlimited (same as null)
    const isUnlimited = limit === null || limit === -1

    usageData[featureKey] = {
      featureKey,
      currentUsage,
      limit,
      available: !isUnlimited ? Math.max(0, limit - currentUsage) : null,
      percentage:
        !isUnlimited && limit > 0 ? (currentUsage / limit) * 100 : null,
    }
  }

  return usageData
})

// ============================================================================
// Feature Gate Checks
// ============================================================================

/**
 * Check if an organization can perform an action based on feature limits.
 * This is the main gate checking function.
 *
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to check (e.g., "websites.limit")
 * @param incrementBy - How many units this action will consume (default: 1)
 * @returns Result indicating if action is allowed
 */
export async function checkFeatureGate(
  organizationId: string,
  featureKey: FeatureKey,
  incrementBy: number = 1
): Promise<FeatureGateCheckResult> {
  // Get organization tier
  const tier = await getOrganizationTier(organizationId)

  // Get feature config
  const featureConfig = FEATURES.organization[featureKey]

  if (!featureConfig) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Unknown feature key: ${featureKey}`,
    })
  }

  // Check if user is on free trial and feature is not available on trial
  if (
    tier.isOnTrial &&
    'availableOnFreeTrial' in featureConfig &&
    !featureConfig.availableOnFreeTrial
  ) {
    return {
      allowed: false,
      reason: `${featureConfig.name} is not available during your free trial. Please upgrade to a paid plan to access this feature.`,
    }
  }

  // Only check LIMIT type features
  if (featureConfig.type !== 'limit') {
    return { allowed: true }
  }

  // Get the limit from organization features
  const limit = tier.features[featureKey] as number | undefined

  // If limit is undefined, null, or -1 (UNLIMITED), feature is unlimited
  if (limit === undefined || limit === null || limit === -1) {
    return { allowed: true }
  }

  // Get current usage
  const metrics = await getUsageMetrics(organizationId, featureKey)
  const currentUsage = metrics?.currentUsage || 0

  // Check if adding incrementBy would exceed the limit
  const wouldExceed = currentUsage + incrementBy > limit

  if (wouldExceed) {
    return {
      allowed: false,
      reason: `You have reached your plan limit for ${featureKey}. Current usage: ${currentUsage}/${limit}. Upgrade your plan to continue.`,
      currentUsage,
      limit,
    }
  }

  return {
    allowed: true,
    currentUsage,
    limit,
  }
}

/**
 * Check if an organization can access a boolean feature.
 *
 * @param organizationId - The organization ID
 * @param featureKey - The boolean feature key to check
 * @returns true if feature is enabled for this tier
 */
export async function checkBooleanFeature(
  organizationId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  const tier = await getOrganizationTier(organizationId)
  const featureConfig = FEATURES.organization[featureKey]

  if (!featureConfig || featureConfig.type !== 'boolean') {
    return false
  }

  // Check if user is on free trial and feature is not available on trial
  if (
    tier.isOnTrial &&
    'availableOnFreeTrial' in featureConfig &&
    !featureConfig.availableOnFreeTrial
  ) {
    return false
  }

  // Get the value from organization features
  const enabled = tier.features[featureKey] as boolean | undefined
  return enabled === true
}

// ============================================================================
// Usage Tracking
// ============================================================================

/**
 * Increment usage for a feature after successful action.
 * Creates the usage metric if it doesn't exist.
 *
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to increment
 * @param incrementBy - How many units to increment (default: 1)
 */
export async function incrementUsage(
  organizationId: string,
  featureKey: FeatureKey,
  incrementBy: number = 1
): Promise<void> {
  await prisma.usageMetrics.upsert({
    where: {
      organizationId_featureKey: {
        organizationId,
        featureKey,
      },
    },
    update: {
      currentUsage: {
        increment: incrementBy,
      },
      updatedAt: new Date(),
    },
    create: {
      organizationId,
      featureKey,
      currentUsage: incrementBy,
    },
  })
}

/**
 * Decrement usage for a feature (e.g., when deleting a resource).
 *
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to decrement
 * @param decrementBy - How many units to decrement (default: 1)
 */
export async function decrementUsage(
  organizationId: string,
  featureKey: FeatureKey,
  decrementBy: number = 1
): Promise<void> {
  const metrics = await getUsageMetrics(organizationId, featureKey)

  if (!metrics) {
    // Nothing to decrement
    return
  }

  const newUsage = Math.max(0, metrics.currentUsage - decrementBy)

  await prisma.usageMetrics.update({
    where: {
      organizationId_featureKey: {
        organizationId,
        featureKey,
      },
    },
    data: {
      currentUsage: newUsage,
      updatedAt: new Date(),
    },
  })
}

/**
 * Sync the usage counter to an actual count from the database.
 *
 * WHY: Counter-based tracking (increment/decrement) can drift out of sync
 * with reality due to partial failures, race conditions, or code path
 * mismatches (e.g., domain deleted via one path but created via another).
 * This function reconciles the UsageMetrics counter with the true count.
 *
 * SOURCE OF TRUTH KEYWORDS: SyncUsageCount, ReconcileUsage
 *
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to sync
 * @param actualCount - The real count from the database (caller queries the source table)
 */
export async function syncUsageCount(
  organizationId: string,
  featureKey: FeatureKey,
  actualCount: number
): Promise<void> {
  await prisma.usageMetrics.upsert({
    where: {
      organizationId_featureKey: {
        organizationId,
        featureKey,
      },
    },
    update: {
      currentUsage: actualCount,
      updatedAt: new Date(),
    },
    create: {
      organizationId,
      featureKey,
      currentUsage: actualCount,
    },
  })
}

/**
 * Reset usage for a feature (e.g., at the start of a billing cycle).
 *
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to reset
 */
export async function resetUsage(
  organizationId: string,
  featureKey: FeatureKey
): Promise<void> {
  await prisma.usageMetrics.update({
    where: {
      organizationId_featureKey: {
        organizationId,
        featureKey,
      },
    },
    data: {
      currentUsage: 0,
      lastResetAt: new Date(),
      updatedAt: new Date(),
    },
  })
}

/**
 * Require a feature gate to pass, throwing an error if it fails.
 * Use this in procedures that consume a limit-based feature.
 *
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to check
 * @param incrementBy - How many units this action will consume
 * @throws TRPCError if gate check fails
 */
export async function requireFeatureGate(
  organizationId: string,
  featureKey: FeatureKey,
  incrementBy: number = 1
): Promise<void> {
  const result = await checkFeatureGate(organizationId, featureKey, incrementBy)

  if (!result.allowed) {
    // Get tier info for structured error
    const tier = await getOrganizationTier(organizationId)

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: result.reason || 'Feature limit exceeded',
      cause: {
        type: 'FEATURE_LIMIT_EXCEEDED',
        featureKey,
        currentUsage: result.currentUsage,
        limit: result.limit,
        currentTier: tier.tier,
        organizationId,
        message: result.reason || 'Feature limit exceeded',
      },
    })
  }
}

/**
 * Require a boolean feature to be enabled, throwing an error if not.
 *
 * @param organizationId - The organization ID
 * @param featureKey - The boolean feature key to check
 * @param customMessage - Optional custom error message
 * @throws TRPCError if feature is not enabled
 */
export async function requireBooleanFeature(
  organizationId: string,
  featureKey: FeatureKey,
  customMessage?: string
): Promise<void> {
  const enabled = await checkBooleanFeature(organizationId, featureKey)

  if (!enabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        customMessage ||
        `This feature (${featureKey}) is not available on your current plan. Please upgrade to access it.`,
    })
  }
}
