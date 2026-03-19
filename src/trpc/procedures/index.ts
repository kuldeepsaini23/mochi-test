/**
 * Procedures - Building Blocks
 *
 * Import these in your routers to add auth/permission checks
 *
 * @example
 * ```ts
 * import { protectedProcedure, organizationProcedure } from '@/trpc/procedures'
 *
 * export const myRouter = router({
 *   getData: protectedProcedure.query(() => { ... }),
 *   getOrgData: organizationProcedure().query(() => { ... }),
 * })
 * ```
 */

// Re-export all procedures
export { router, baseProcedure } from './base'
export { protectedProcedure } from './auth'
export { organizationProcedure } from './organization'
export {
  portalProcedure,
  hasPortalPermission,
  getPortalRolePermissions,
  PORTAL_ROLE_PERMISSIONS,
} from './portal'

// Feature gate helpers
export {
  withFeatureGate,
  withBooleanFeature,
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
  withFeatureGateAndIncrement,
} from './feature-gates'
