/**
 * Client-Side Permission Hook
 *
 * WHY: Check permissions instantly from cached data without API calls
 * HOW: Reads from prefetched getUserOrganizations query data
 *
 * IMPORTANT: This is for UI optimization only. Server-side checks still
 * happen via organizationProcedure - never rely on this alone!
 *
 * RECOMMENDED: Use useActiveOrganization().hasPermission() instead of this hook
 * when checking permissions for the current active organization. This hook is
 * useful when you need to check permissions for a specific organization ID
 * that may not be the active one.
 *
 * SOURCE OF TRUTH KEYWORDS: UsePermission, PermissionHook, RBAC
 */

'use client'

import { trpc } from '@/trpc/react-provider'
import type { Permission } from '@/lib/better-auth/permissions'

/**
 * Check if user has permission for a specific organization (client-side)
 *
 * @param organizationId - Organization ID to check permissions for
 * @param permission - Permission to check (e.g., 'billing:read')
 * @returns boolean - true if user has permission, false otherwise
 *
 * NOTE: For active organization permission checks, prefer useActiveOrganization().hasPermission()
 *
 * @example
 * ```tsx
 * // For specific org permission check
 * const hasAccess = usePermission(someOrgId, 'billing:read')
 *
 * // For active org, prefer:
 * const { hasPermission } = useActiveOrganization()
 * const hasAccess = hasPermission('billing:read')
 * ```
 */
export function usePermission(
  organizationId: string | undefined,
  permission: Permission
): boolean {
  /**
   * Get organizations data
   *
   * CRITICAL: staleTime: 0 allows proper hydration from server on navigation
   * WHY: When navigating between subdomains, we need fresh data from the server.
   * The data is prefetched in protected layout, so this hydrates instantly.
   *
   * Previous bug: staleTime: Infinity caused stale permissions to persist
   * across subdomain navigation, showing wrong org's permissions.
   */
  const { data: organizations } = trpc.organization.getUserOrganizations.useQuery(undefined, {
    staleTime: 0, // Allow hydration from server on navigation
    gcTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: true, // Catch external permission changes
  })

  if (!organizationId || !organizations) {
    return false
  }

  // Find the organization
  const org = organizations.find((o) => o.id === organizationId)

  if (!org) {
    return false
  }

  // Owners have full access (empty permissions array = full access)
  if (org.role === 'owner') {
    return true
  }

  // Check if user has the specific permission
  return org.permissions.includes(permission)
}
