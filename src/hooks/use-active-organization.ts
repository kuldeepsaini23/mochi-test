/**
 * Active Organization Hook
 *
 * WHY: Single source of truth for the currently active organization
 * HOW: Uses getActiveOrganization tRPC query which respects domain-first approach
 *
 * DOMAIN-FIRST APPROACH:
 * 1. On subdomain (acme.mochi.test) → that org IS the active org
 * 2. On custom domain (mycompany.com) → that org IS the active org
 * 3. On root domain (mochi.test) → use session.activeOrganizationId
 *
 * CRITICAL: All components MUST use this hook instead of manually
 * determining the active org from getUserOrganizations list.
 *
 * Manual patterns like this are WRONG:
 * ❌ const activeOrg = organizations?.find((org) => org.role === 'owner') || organizations?.[0]
 *
 * Correct pattern:
 * ✅ const { activeOrganization } = useActiveOrganization()
 *
 * SOURCE OF TRUTH KEYWORDS: UseActiveOrganization, ActiveOrgHook, OrgContext, MultiTenancy
 */

'use client'

import { trpc } from '@/trpc/react-provider'
import type { Permission } from '@/lib/better-auth/permissions'

/**
 * Return type for useActiveOrganization hook
 *
 * NOTE: createdAt is a string from the API (JSON serialization)
 *
 * SOURCE OF TRUTH: ActiveOrganizationData, OrgHookReturn
 */
export interface ActiveOrganizationData {
  /** Active organization object */
  activeOrganization: {
    id: string
    name: string
    slug: string
    customDomain: string | null
    stripeConnectedAccountId: string | null
    /** Organization's Stripe account currency (ISO 4217 lowercase e.g., 'usd', 'eur') */
    stripeAccountCurrency: string | null
    role: string
    permissions: string[]
    createdAt: string // Serialized from Date via JSON
  } | null | undefined

  /** Whether the user is the owner of the active organization */
  isOwner: boolean

  /** Loading state */
  isLoading: boolean

  /** Check if user has a specific permission in the active organization */
  hasPermission: (permission: Permission) => boolean
}

/**
 * Hook to get the currently active organization
 *
 * This hook is the SINGLE source of truth for which organization
 * the user is currently working in. It respects:
 * - Subdomain context (acme.mochi.test → acme org)
 * - Custom domain context (mycompany.com → that company's org)
 * - Session activeOrganizationId (on root domain)
 *
 * @returns Active organization data with helper functions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { activeOrganization, isOwner, hasPermission, isLoading } = useActiveOrganization()
 *
 *   if (isLoading) return <Loading />
 *   if (!activeOrganization) return <NoOrganization />
 *
 *   // Check permission
 *   if (!hasPermission('billing:read')) {
 *     return <AccessDenied />
 *   }
 *
 *   return <Content org={activeOrganization} />
 * }
 * ```
 */
export function useActiveOrganization(): ActiveOrganizationData {
  /**
   * Fetch active organization
   *
   * NOTE: This uses staleTime: 0 on purpose!
   * WHY: When navigating between subdomains, we need fresh data from the server.
   * The server's getActiveOrganization respects the subdomain, so the hydrated
   * data will be correct for the current domain.
   *
   * The data is prefetched in protected layout, so this will hydrate instantly
   * from the server-rendered data on initial load.
   */
  const { data: activeOrganization, isLoading } =
    trpc.organization.getActiveOrganization.useQuery(undefined, {
      // Allow hydration from server but don't use stale client cache on navigation
      // The server prefetches this, so it hydrates instantly
      staleTime: 0,
      // Keep in cache for the session
      gcTime: 1000 * 60 * 30, // 30 minutes
      // Refetch on window focus to catch external permission changes
      refetchOnWindowFocus: true,
    })

  /**
   * Check if user is owner of active organization
   */
  const isOwner = activeOrganization?.role === 'owner'

  /**
   * Check if user has a specific permission in the active organization
   *
   * @param permission - Permission string (e.g., 'billing:read')
   * @returns true if user has permission, false otherwise
   *
   * NOTE: Owners have ALL permissions (empty permissions array = full access)
   */
  const hasPermission = (permission: Permission): boolean => {
    if (!activeOrganization) return false

    // Owners have full access
    if (isOwner) return true

    // Check if user has the specific permission
    return activeOrganization.permissions.includes(permission)
  }

  return {
    activeOrganization,
    isOwner,
    isLoading,
    hasPermission,
  }
}

/**
 * Hook to get active organization ID only
 *
 * Lightweight version when you only need the ID
 *
 * @returns Active organization ID or undefined
 */
export function useActiveOrganizationId(): string | undefined {
  const { activeOrganization } = useActiveOrganization()
  return activeOrganization?.id
}
