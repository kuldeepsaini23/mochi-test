/**
 * Client-Side Domain Hook
 *
 * WHY: Access organization domain info instantly from cached data without API calls
 * HOW: Reads from prefetched getUserOrganizations query data
 *
 * IMPORTANT: This is for UI optimization only. Always use server-side
 * domain lookup for critical operations like redirects.
 */

'use client'

import { trpc } from '@/trpc/react-provider'
import { buildOrganizationUrl, buildUrl } from '@/lib/utils/domain-client'

export interface OrganizationDomain {
  id: string
  slug: string
  customDomain: string | null
  url: string
}

/**
 * Get organization domain info from cache
 *
 * @param organizationId - Organization ID to get domain for
 * @returns Domain info or null if not found
 *
 * @example
 * ```tsx
 * const domain = useDomain(orgId)
 *
 * if (domain) {
 *   const inviteUrl = buildUrl(domain.url, '/accept-invitation', { id: '123' })
 *   // Returns: "http://acme.mochi.test:3000/accept-invitation?id=123"
 * }
 * ```
 */
export function useDomain(
  organizationId: string | undefined
): OrganizationDomain | null {
  // Get cached organizations data (prefetched in layout, never refetches)
  const { data: organizations } = trpc.organization.getUserOrganizations.useQuery(undefined, {
    staleTime: Infinity, // ✅ Never refetch (only invalidate manually on domain changes)
    gcTime: Infinity, // ✅ Keep in cache indefinitely
  })

  if (!organizationId || !organizations) {
    return null
  }

  // Find the organization
  const org = organizations.find((o) => o.id === organizationId)

  if (!org) {
    return null
  }

  // Build full URL from slug/customDomain
  const url = buildOrganizationUrl(org.slug, org.customDomain)

  return {
    id: org.id,
    slug: org.slug,
    customDomain: org.customDomain,
    url,
  }
}

/**
 * Get all organization domains from cache
 *
 * @returns Array of all organization domains
 *
 * @example
 * ```tsx
 * const domains = useAllDomains()
 *
 * domains.forEach(domain => {
 *   console.log(domain.url) // Full URL for each org
 * })
 * ```
 */
export function useAllDomains(): OrganizationDomain[] {
  const { data: organizations } = trpc.organization.getUserOrganizations.useQuery(undefined, {
    staleTime: Infinity,
    gcTime: Infinity,
  })

  if (!organizations) {
    return []
  }

  return organizations.map((org) => ({
    id: org.id,
    slug: org.slug,
    customDomain: org.customDomain,
    url: buildOrganizationUrl(org.slug, org.customDomain),
  }))
}

// Re-export buildUrl for convenience
export { buildUrl }
