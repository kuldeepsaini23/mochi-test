/**
 * Usage Router
 *
 * Provides endpoints to query organization feature usage and tier information.
 * Used for displaying usage stats, limits, and upgrade prompts in the UI.
 *
 * All endpoints require organization membership.
 */

import { z } from 'zod'
import { createTRPCRouter, organizationProcedure } from '../init'
import { FEATURES, type FeatureKey } from '@/lib/config/feature-gates'
import { calculateRealStorageUsageKb } from '@/services/storage.service'
import { syncUsageCount } from '@/services/feature-gate.service'

export const usageRouter = createTRPCRouter({
  /**
   * Get Feature Gates (Combined Tier + Usage)
   *
   * SOURCE OF TRUTH for client-side feature gate checks.
   * Returns everything needed in ONE query for hydration.
   *
   * WHY: Single prefetch in layout, instant client-side access
   * HOW: Combines tier features with current usage metrics
   *
   * PREFETCH: In dashboard layout server component
   * CLIENT: Use via useFeatureGates() hook (no loading state)
   *
   * SOURCE OF TRUTH KEYWORDS: FeatureGatesData, ClientFeatureGates
   */
  getFeatureGates: organizationProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get tier, usage, and real storage usage in parallel
      const [tierData, usageMetrics, realStorageKb] = await Promise.all([
        ctx.getOrganizationTier(input.organizationId),
        ctx.getAllUsageMetrics(input.organizationId),
        calculateRealStorageUsageKb(input.organizationId),
      ])

      /* Reconcile the storage_kb counter with reality.
       * The counter can drift from old code or partial failures — this
       * self-heals every time the feature gates are fetched. */
      const currentStorageUsage = usageMetrics['storage_kb.limit']?.currentUsage ?? 0
      if (currentStorageUsage !== realStorageKb) {
        await syncUsageCount(input.organizationId, 'storage_kb.limit', realStorageKb)
        // Patch the in-memory metrics so the response reflects the corrected value
        if (usageMetrics['storage_kb.limit']) {
          usageMetrics['storage_kb.limit'].currentUsage = realStorageKb
        }
      }

      // Build feature gates map with computed "atLimit" flag
      const gates: Record<
        string,
        {
          usage: number
          limit: number | null
          atLimit: boolean
          isUnlimited: boolean
          featureName: string
        }
      > = {}

      // Process all limit-based features
      for (const [key, config] of Object.entries(FEATURES.organization)) {
        if (config.type !== 'limit') continue

        const featureKey = key as FeatureKey
        const metrics = usageMetrics[featureKey]
        const limit = tierData.features[featureKey] as number | null

        const isUnlimited = limit === null || limit === -1
        const usage = metrics?.currentUsage || 0

        /**
         * Check if feature is blocked during free trial
         * WHY: Some limit features (e.g., email_domains.limit) are not available
         * during free trials even though the plan has a non-zero limit.
         * Server-side checkFeatureGate() also performs this check — this keeps
         * client and server in sync so the UI shows upgrade instead of letting
         * the user attempt an action that the server will reject.
         */
        const blockedByTrial =
          tierData.isOnTrial && !config.availableOnFreeTrial

        const atLimit =
          blockedByTrial || (!isUnlimited && usage >= (limit || 0))

        gates[featureKey] = {
          usage,
          limit,
          atLimit,
          isUnlimited,
          featureName: config.name,
        }
      }

      // Process all boolean features (e.g., dynamic_pages, custom_domain, analytics)
      // WHY: Boolean features need to appear in the gates map so useFeatureGate()
      // can check them client-side. Without this, useFeatureGate('dynamic_pages')
      // returns null and the UI gate never blocks free-tier users.
      // HOW: atLimit = true when the feature is disabled (false) for this tier
      //       OR when on trial and feature is not available on free trial
      for (const [key, config] of Object.entries(FEATURES.organization)) {
        if (config.type !== 'boolean') continue

        const featureKey = key as FeatureKey
        const featureValue = tierData.features[featureKey] as boolean

        /**
         * Block boolean features during trial if not available on free trial
         * WHY: Matches server-side checkBooleanFeature() which also checks this
         */
        const blockedByTrial =
          tierData.isOnTrial && !config.availableOnFreeTrial

        gates[featureKey] = {
          usage: 0,
          limit: null,
          atLimit: blockedByTrial || !featureValue, // blocked by trial OR disabled on tier
          isUnlimited: false,
          featureName: config.name,
        }
      }

      return {
        tier: tierData.tier,
        planName: tierData.planName,
        isOnTrial: tierData.isOnTrial,
        isPortalOrganization: tierData.isPortalOrganization ?? false,
        gates,
      }
    }),

  /**
   * Get organization tier details
   *
   * Returns the active plan tier, limits, and tier configuration.
   * Cached per request via context helper.
   *
   * @returns {
   *   tier: 'free' | 'starter' | 'pro' | 'enterprise',
   *   limits: Record<string, number | boolean>,
   *   plan: StudioPlan | null
   * }
   *
   * CLIENT CACHE: Use staleTime: Infinity, invalidate on plan changes
   */
  getTier: organizationProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tierData = await ctx.getOrganizationTier(input.organizationId)
      return tierData
    }),

  /**
   * Get all usage metrics for organization
   *
   * Returns comprehensive usage data for all limit-based features.
   * Includes current usage, limits, available quota, and percentage used.
   *
   * @returns Record<featureKey, {
   *   featureKey: string,
   *   currentUsage: number,
   *   limit: number | null,
   *   available: number | null,
   *   percentage: number | null
   * }>
   *
   * CLIENT CACHE: Use staleTime: 60000 (1 min), invalidate after mutations
   */
  getUsageMetrics: organizationProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const metrics = await ctx.getAllUsageMetrics(input.organizationId)
      return metrics
    }),

  /**
   * Get usage for a specific feature
   *
   * Returns detailed usage information for a single feature.
   * Useful for checking before attempting an action.
   *
   * @example
   * ```ts
   * const usage = await trpc.usage.getFeatureUsage.query({
   *   organizationId: 'org_123',
   *   featureKey: 'clients.limit'
   * })
   * // { currentUsage: 5, limit: 10, available: 5, percentage: 50 }
   * ```
   *
   * CLIENT CACHE: Use staleTime: 60000 (1 min), invalidate after mutations
   */
  getFeatureUsage: organizationProcedure()
    .input(
      z.object({
        organizationId: z.string(),
        featureKey: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const allMetrics = await ctx.getAllUsageMetrics(input.organizationId)
      const featureMetrics = allMetrics[input.featureKey]

      if (!featureMetrics) {
        // Feature doesn't exist or isn't a limit-based feature
        return null
      }

      return featureMetrics
    }),

  /**
   * Check if organization can perform action
   *
   * Checks if an organization has quota available for a feature.
   * Returns boolean without throwing errors.
   *
   * Useful for:
   * - Showing/hiding UI elements
   * - Displaying upgrade prompts
   * - Pre-flight checks before mutations
   *
   * @example
   * ```ts
   * const canCreate = await trpc.usage.canPerformAction.query({
   *   organizationId: 'org_123',
   *   featureKey: 'clients.limit',
   *   quantity: 1
   * })
   * if (!canCreate.allowed) {
   *   // Show upgrade prompt
   * }
   * ```
   */
  canPerformAction: organizationProcedure()
    .input(
      z.object({
        organizationId: z.string(),
        featureKey: z.string(),
        quantity: z.number().optional().default(1),
      })
    )
    .query(async ({ input }) => {
      const { checkFeatureGate } = await import('@/services/feature-gate.service')

      const result = await checkFeatureGate(
        input.organizationId,
        input.featureKey as any,
        input.quantity
      )

      return result
    }),

  /**
   * Check if boolean feature is enabled
   *
   * Returns whether a boolean feature (like white_label, custom_domain)
   * is enabled for the organization's current tier.
   *
   * @example
   * ```ts
   * const hasWhiteLabel = await trpc.usage.hasFeature.query({
   *   organizationId: 'org_123',
   *   featureKey: 'white_label'
   * })
   * ```
   */
  hasFeature: organizationProcedure()
    .input(
      z.object({
        organizationId: z.string(),
        featureKey: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { checkBooleanFeature } = await import('@/services/feature-gate.service')

      const enabled = await checkBooleanFeature(
        input.organizationId,
        input.featureKey as any
      )

      return { enabled }
    }),
})
