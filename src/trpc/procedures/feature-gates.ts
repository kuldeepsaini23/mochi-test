/**
 * Feature Gate Helpers — Handler-Level Checks & Usage Tracking
 *
 * ============================================================================
 * WHEN TO USE PROCEDURE-LEVEL vs HANDLER-LEVEL FEATURE GATES
 * ============================================================================
 *
 * PROCEDURE-LEVEL (preferred for simple cases):
 *   Pass `requireFeature` to `organizationProcedure()` — the check runs BEFORE
 *   the handler with a default increment of 1. See `src/trpc/procedures/organization.ts`.
 *
 *   Example:
 *     create: organizationProcedure({ requireFeature: 'forms.limit' })
 *
 * HANDLER-LEVEL (use `withFeatureGate()` from this file):
 *   Use when procedure-level cannot express the logic:
 *   - Variable increment amounts (e.g., storage_kb uses file size in MB)
 *   - Conditional checks (e.g., only when a field is non-null)
 *   - Multi-feature checks (e.g., template install across categories)
 *   - Reconciliation before check (e.g., syncUsageCount then withFeatureGate)
 *
 * ============================================================================
 * USAGE TRACKING (always in handler, regardless of gate level)
 * ============================================================================
 *
 * `incrementUsageAndInvalidate()` — call after successful creation
 * `decrementUsageAndInvalidate()` — call after successful deletion
 * These always stay in the handler because they run AFTER the action succeeds.
 *
 * B2B MODEL: Platform → Organizations. All feature gates are org-scoped.
 *
 * @example Procedure-level gate + handler-level tracking
 * ```ts
 * create: organizationProcedure({
 *   requirePermission: permissions.FORMS_CREATE,
 *   requireFeature: 'forms.limit',
 * })
 *   .input(createFormSchema)
 *   .mutation(async ({ ctx, input }) => {
 *     const form = await formService.createForm(...)
 *     await incrementUsageAndInvalidate(ctx, input.organizationId, 'forms.limit')
 *     return form
 *   })
 * ```
 *
 * @example Handler-level gate (variable increment)
 * ```ts
 * getUploadUrl: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
 *   .mutation(async ({ ctx, input }) => {
 *     const fileSizeMb = Math.round(input.contentLength / (1024 * 1024))
 *     await withFeatureGate(ctx, input.organizationId, 'storage_kb.limit', Math.max(1, fileSizeMb))
 *     // ... upload logic ...
 *   })
 * ```
 */

import type { Context } from '@/trpc/init'
import {
  requireFeatureGate,
  requireBooleanFeature,
  incrementUsage,
  decrementUsage,
} from '@/services/feature-gate.service'
import type { FeatureKey } from '@/lib/config/feature-gates'

// ============================================================================
// Feature Gate Helpers
// ============================================================================

/**
 * Check a feature gate and throw if it fails.
 * Use this before performing an action that consumes a limit.
 *
 * @param ctx - tRPC context
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to check
 * @param incrementBy - How many units this action will consume (default: 1)
 * @throws TRPCError if gate check fails
 *
 * @example
 * ```ts
 * await withFeatureGate(ctx, organizationId, 'websites.limit')
 * ```
 */
export async function withFeatureGate(
  ctx: Context,
  organizationId: string,
  featureKey: FeatureKey,
  incrementBy: number = 1
): Promise<void> {
  return requireFeatureGate(organizationId, featureKey, incrementBy)
}

/**
 * Check a boolean feature and throw if not enabled.
 *
 * @param ctx - tRPC context
 * @param organizationId - The organization ID
 * @param featureKey - The boolean feature key
 * @param customMessage - Optional custom error message
 * @throws TRPCError if feature is not enabled
 *
 * @example
 * ```ts
 * await withBooleanFeature(ctx, organizationId, 'custom_domain')
 * ```
 */
export async function withBooleanFeature(
  ctx: Context,
  organizationId: string,
  featureKey: FeatureKey,
  customMessage?: string
): Promise<void> {
  return requireBooleanFeature(organizationId, featureKey, customMessage)
}

// ============================================================================
// Usage Tracking Helpers
// ============================================================================

/**
 * Increment usage for a feature and invalidate caches.
 * Call this after successfully performing an action.
 *
 * This helper:
 * 1. Increments the usage counter in the database
 * 2. Clears the request-scoped cache (automatic on next request)
 * 3. Returns the cache invalidation keys for client-side invalidation
 *
 * @param ctx - tRPC context
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to increment
 * @param incrementBy - How many units to increment (default: 1)
 * @returns Object with invalidation info for client-side cache updates
 *
 * @example
 * ```ts
 * // In a mutation:
 * const website = await createWebsite(...)
 * await incrementUsageAndInvalidate(ctx, organizationId, 'websites.limit')
 * ```
 */
export async function incrementUsageAndInvalidate(
  ctx: Context,
  organizationId: string,
  featureKey: FeatureKey,
  incrementBy: number = 1
): Promise<{ invalidateKeys: string[] }> {
  await incrementUsage(organizationId, featureKey, incrementBy)

  // Return cache keys that should be invalidated on client
  // The client-side tRPC utils can use these to invalidate React Query cache
  return {
    invalidateKeys: [
      `usage.${organizationId}`,
      `usage.${organizationId}.${featureKey}`,
      `tier.${organizationId}`,
    ],
  }
}

/**
 * Decrement usage for a feature and invalidate caches.
 * Call this after deleting a resource.
 *
 * @param ctx - tRPC context
 * @param organizationId - The organization ID
 * @param featureKey - The feature key to decrement
 * @param decrementBy - How many units to decrement (default: 1)
 * @returns Object with invalidation info for client-side cache updates
 *
 * @example
 * ```ts
 * // In a delete mutation:
 * await deleteWebsite(websiteId)
 * await decrementUsageAndInvalidate(ctx, organizationId, 'websites.limit')
 * ```
 */
export async function decrementUsageAndInvalidate(
  ctx: Context,
  organizationId: string,
  featureKey: FeatureKey,
  decrementBy: number = 1
): Promise<{ invalidateKeys: string[] }> {
  await decrementUsage(organizationId, featureKey, decrementBy)

  return {
    invalidateKeys: [
      `usage.${organizationId}`,
      `usage.${organizationId}.${featureKey}`,
      `tier.${organizationId}`,
    ],
  }
}

// ============================================================================
// Combined Helper
// ============================================================================

/**
 * Complete feature gate flow: check → action → increment.
 * Use this wrapper when you want a single function to handle everything.
 *
 * @param ctx - tRPC context
 * @param organizationId - The organization ID
 * @param featureKey - The feature key
 * @param action - The action to perform if gate passes
 * @param incrementBy - How many units to consume (default: 1)
 * @returns The result of the action
 *
 * @example
 * ```ts
 * return withFeatureGateAndIncrement(
 *   ctx,
 *   organizationId,
 *   'websites.limit',
 *   async () => {
 *     return await createWebsite(input)
 *   }
 * )
 * ```
 */
export async function withFeatureGateAndIncrement<T>(
  ctx: Context,
  organizationId: string,
  featureKey: FeatureKey,
  action: () => Promise<T>,
  incrementBy: number = 1
): Promise<T> {
  // Check gate first
  await withFeatureGate(ctx, organizationId, featureKey, incrementBy)

  // Perform action
  const result = await action()

  // Increment usage (this also invalidates caches)
  await incrementUsageAndInvalidate(ctx, organizationId, featureKey, incrementBy)

  return result
}
