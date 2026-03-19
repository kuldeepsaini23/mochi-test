/**
 * Permission Service
 *
 * WHY: Centralized permission checking using Better Auth's native APIs
 * HOW: Uses auth.api.hasPermission() to check if user has required permissions
 *
 * ARCHITECTURE:
 * - Studio owners always have full access (Better Auth handles this internally)
 * - Other members: Check permissions using Better Auth's hasPermission API
 * - Permissions stored in OrganizationRole table as JSON
 * - Format: { "resource": ["action1", "action2"] }
 *
 * SECURITY:
 * - Always check on server-side (never trust client)
 * - Use Better Auth's native APIs (don't query DB directly)
 * - Throw errors for unauthorized access
 */

import 'server-only'

import { auth } from '@/lib/better-auth/auth'
import { headers } from 'next/headers'
import type { OrganizationResource } from '@/lib/better-auth/permissions'

/**
 * Check if user has permission for a resource and action
 *
 * @param resource - The resource to check (e.g., 'clients', 'member')
 * @param action - The action to check (e.g., 'read', 'create')
 * @param organizationId - Optional organization ID for organization-scoped check
 * @returns true if user has permission, false otherwise
 *
 * @example
 * ```ts
 * const canCreateClients = await hasPermission('clients', 'create')
 * if (!canCreateClients) {
 *   throw new Error('Unauthorized')
 * }
 * ```
 */
export async function hasPermission(
  resource: OrganizationResource,
  action: string,
  organizationId?: string
): Promise<boolean> {
  try {
    // Get current session
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) {
      return false
    }

    // Use Better Auth's hasPermission API
    // IMPORTANT: Use "permission" (SINGULAR), not "permissions" (plural)
    const result = await auth.api.hasPermission({
      headers: await headers(),
      body: {
        permission: {  // ← SINGULAR (not "permissions")
          [resource]: [action],
        },
        organizationId,  // Pass organizationId to set context
      },
    })

    return result?.success === true
  } catch (error) {
    return false
  }
}

/**
 * Check if user has ALL of the specified permissions
 *
 * @param permissions - Array of permission strings (e.g., ['clients:read', 'clients:update'])
 * @param organizationId - Optional organization ID
 * @returns true if user has ALL permissions, false otherwise
 *
 * @example
 * ```ts
 * const canManageClients = await hasAllPermissions([
 *   'clients:read',
 *   'clients:update',
 *   'clients:delete',
 * ])
 * ```
 */
export async function hasAllPermissions(
  permissions: string[],
  organizationId?: string
): Promise<boolean> {
  // Convert permission strings to Better Auth format
  // Input: ['clients:read', 'clients:update']
  // Output: { clients: ['read', 'update'] }
  const permissionMap: Record<string, string[]> = {}

  for (const permission of permissions) {
    const [resource, action] = permission.split(':')
    if (!permissionMap[resource]) {
      permissionMap[resource] = []
    }
    permissionMap[resource].push(action)
  }

  try {
    // Get current session
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) {
      return false
    }

    // Use Better Auth's hasPermission API
    const result = await auth.api.hasPermission({
      headers: await headers(),
      body: {
        permissions: permissionMap,  // Changed from "permission" to "permissions" (plural)
        organizationId,
      },
    })

    return result?.success === true
  } catch (error) {
    return false
  }
}

/**
 * Check if user has ANY of the specified permissions
 *
 * @param permissions - Array of permission strings
 * @param organizationId - Optional organization ID
 * @returns true if user has at least ONE permission, false otherwise
 *
 * @example
 * ```ts
 * const canAccessClients = await hasAnyPermission([
 *   'clients:read',
 *   'clients:update',
 * ])
 * ```
 */
export async function hasAnyPermission(
  permissions: string[],
  organizationId?: string
): Promise<boolean> {
  // Check each permission individually
  for (const permission of permissions) {
    const [resource, action] = permission.split(':')
    const hasAccess = await hasPermission(
      resource as OrganizationResource,
      action,
      organizationId
    )

    if (hasAccess) {
      return true
    }
  }

  return false
}

/**
 * Require permission - throws error if user doesn't have permission
 *
 * @param resource - The resource to check
 * @param action - The action to check
 * @param organizationId - Optional organization ID
 * @throws Error if user doesn't have permission
 *
 * @example
 * ```ts
 * await requirePermission('clients', 'create')
 * // Continues execution if user has permission
 * // Throws error if user doesn't have permission
 * ```
 */
export async function requirePermission(
  resource: OrganizationResource,
  action: string,
  organizationId?: string
): Promise<void> {
  const hasAccess = await hasPermission(resource, action, organizationId)

  if (!hasAccess) {
    throw new Error(
      `Permission denied: You don't have permission to ${action} ${resource}`
    )
  }
}

/**
 * Get user's role in organization
 *
 * @param organizationId - The organization ID
 * @returns The user's role name or null if not a member
 */
export async function getUserRole(
  organizationId: string
): Promise<string | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) {
      return null
    }

    // Get organization member details
    const members = await auth.api.listMembers({
      headers: await headers(),
      query: {
        organizationId,
      },
    })

    const member = members?.members?.find(
      (m) => m.user.id === session.user.id
    )

    return member?.role || null
  } catch (error) {
    return null
  }
}
