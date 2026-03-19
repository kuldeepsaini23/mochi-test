/**
 * Portal Procedures
 *
 * SOURCE OF TRUTH: Portal Auth Middleware
 * Building blocks for portal-scoped operations.
 * Validates portal admin access and role permissions.
 *
 * AUTHENTICATION FLOW:
 * 1. Check if portal is enabled (ENV)
 * 2. Verify user is authenticated via better-auth
 * 3. Check if user's email exists in PortalAdmin table
 * 4. Verify portal admin is active
 * 5. Check role-based permissions
 */

import { protectedProcedure } from './auth'
import { createStructuredError } from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { portalConfig } from '@/lib/portal'
import {
  getPortalAdminByEmail,
  hasAnyPortalAdmins,
  createInitialPortalOwner,
} from '@/services/portal.service'
import type {
  PortalRoleType,
  PortalPermission,
  PortalAdminWithUser,
} from '@/lib/portal/types'

// ============================================================================
// PORTAL ROLE PERMISSIONS MAP
// ============================================================================

/**
 * Permission matrix for portal roles
 * Defines what each role can do in the portal
 */
const PORTAL_ROLE_PERMISSIONS: Record<PortalRoleType, PortalPermission[]> = {
  OWNER: [
    // Full access to everything
    'organizations:view',
    'organizations:create',
    'organizations:update',
    'organizations:delete',
    'organizations:impersonate',
    'users:view',
    'users:create',
    'users:update',
    'users:delete',
    'subscriptions:view',
    'subscriptions:update',
    'analytics:view',
    'analytics:export',
    'settings:view',
    'settings:update',
    'admins:view',
    'admins:create',
    'admins:update',
    'admins:delete',
    'audit-logs:view',
    'invitations:view',
    'invitations:create',
    'invitations:delete',
    'templates:view',
    'templates:update',
  ],
  ADMIN: [
    // Can manage organizations, users, view analytics
    // Cannot manage other admins or settings
    'organizations:view',
    'organizations:update',
    'organizations:impersonate',
    'users:view',
    'users:update',
    'subscriptions:view',
    'subscriptions:update',
    'analytics:view',
    'analytics:export',
    'audit-logs:view',
    'templates:view',
    'templates:update',
  ],
  SUPPORT: [
    // Read-only + impersonation for support purposes
    'organizations:view',
    'organizations:impersonate',
    'users:view',
    'subscriptions:view',
    'audit-logs:view',
    'templates:view',
  ],
  VIEWER: [
    // Read-only access to analytics and reports
    'analytics:view',
    'organizations:view',
    'users:view',
    'subscriptions:view',
    'templates:view',
  ],
}

/**
 * Check if a role has a specific permission
 */
function roleHasPermission(
  role: PortalRoleType,
  permission: PortalPermission
): boolean {
  return PORTAL_ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

// ============================================================================
// PORTAL PROCEDURE OPTIONS
// ============================================================================

type PortalProcedureOptions = {
  /**
   * Require specific portal roles
   * If not specified, any active portal admin can access
   */
  requireRole?: PortalRoleType[]
  /**
   * Require specific permission
   * Permission format: "resource:action" (e.g., "organizations:update")
   */
  requirePermission?: PortalPermission
}

// ============================================================================
// PORTAL PROCEDURE
// ============================================================================

/**
 * Portal Procedure
 *
 * Requires: Auth + Portal Admin access + Optional role/permission check
 * Context: Adds { portalAdmin } to ctx
 *
 * AUTOMATIC INITIAL SETUP:
 * - If no portal admins exist and PORTAL_INITIAL_OWNER_EMAIL matches
 *   the authenticated user's email, creates them as OWNER automatically.
 *
 * @example
 * ```ts
 * // Any portal admin can access
 * getDashboard: portalProcedure()
 *   .query(({ ctx }) => ctx.portalAdmin)
 *
 * // Only OWNER can access
 * deleteOrg: portalProcedure({ requireRole: ['OWNER'] })
 *   .mutation(({ ctx }) => { ... })
 *
 * // Requires specific permission
 * updateUser: portalProcedure({ requirePermission: 'users:update' })
 *   .mutation(({ ctx }) => { ... })
 * ```
 */
export function portalProcedure(options?: PortalProcedureOptions) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    // 1. Check if portal is enabled
    if (!portalConfig.enabled) {
      throw createStructuredError(
        'FORBIDDEN',
        'Client Portal is not enabled',
        {
          errorCode: ERROR_CODES.PORTAL_DISABLED,
          message: 'The Client Portal feature is disabled',
        }
      )
    }

    // 2. Get user email from session
    const userEmail = ctx.user.email

    if (!userEmail) {
      throw createStructuredError(
        'UNAUTHORIZED',
        'User email is required for portal access',
        {
          errorCode: ERROR_CODES.PORTAL_ACCESS_DENIED,
          message: 'Could not determine user email',
        }
      )
    }

    // 3. Check if user is a portal admin
    let portalAdmin = await getPortalAdminByEmail(userEmail)

    // 4. Auto-create initial owner if no admins exist
    if (!portalAdmin) {
      const hasAdmins = await hasAnyPortalAdmins()

      if (
        !hasAdmins &&
        portalConfig.initialOwnerEmail &&
        userEmail.toLowerCase() === portalConfig.initialOwnerEmail.toLowerCase()
      ) {
        // Create initial owner automatically
        portalAdmin = await createInitialPortalOwner(userEmail, ctx.user.id)
      }
    }

    // 5. Verify portal admin exists
    if (!portalAdmin) {
      throw createStructuredError(
        'FORBIDDEN',
        'You do not have access to the Client Portal',
        {
          errorCode: ERROR_CODES.PORTAL_ACCESS_DENIED,
          message: 'User is not a portal administrator',
        }
      )
    }

    // 6. Check if admin is active
    if (!portalAdmin.isActive) {
      throw createStructuredError(
        'FORBIDDEN',
        'Your portal access has been deactivated',
        {
          errorCode: ERROR_CODES.PORTAL_ADMIN_INACTIVE,
          message: 'Portal admin account is inactive',
        }
      )
    }

    // 7. Check role if specified
    if (options?.requireRole && !options.requireRole.includes(portalAdmin.role)) {
      throw createStructuredError(
        'FORBIDDEN',
        'You do not have the required role for this action',
        {
          errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          required: options.requireRole,
          current: portalAdmin.role,
          message: `Portal role ${portalAdmin.role} does not have access`,
        }
      )
    }

    // 8. Check permission if specified
    if (options?.requirePermission) {
      const hasPermission = roleHasPermission(
        portalAdmin.role,
        options.requirePermission
      )

      if (!hasPermission) {
        const [resource, action] = options.requirePermission.split(':')
        throw createStructuredError(
          'FORBIDDEN',
          `You don't have permission to ${action} ${resource}`,
          {
            errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            required: [options.requirePermission],
            current: portalAdmin.role,
            message: `Missing required permission: ${options.requirePermission}`,
          }
        )
      }
    }

    // 9. Return enriched context
    return next({
      ctx: {
        ...ctx,
        portalAdmin,
      },
    })
  })
}

// ============================================================================
// PORTAL ROLE HELPERS
// ============================================================================

/**
 * Check if a portal admin has a specific permission
 */
export function hasPortalPermission(
  admin: PortalAdminWithUser,
  permission: PortalPermission
): boolean {
  return roleHasPermission(admin.role, permission)
}

/**
 * Get all permissions for a portal role
 */
export function getPortalRolePermissions(
  role: PortalRoleType
): PortalPermission[] {
  return PORTAL_ROLE_PERMISSIONS[role] || []
}

/**
 * Export the permissions map for use in UI
 */
export { PORTAL_ROLE_PERMISSIONS }
