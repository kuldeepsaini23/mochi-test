/**
 * Domain Lookup Service
 *
 * Handles looking up organizations and teams by their domains/subdomains.
 * Used primarily for OAuth callbacks to redirect users to their correct domain.
 *
 * ARCHITECTURE:
 * - Organizations can have:
 *   1. Subdomain: {slug}.mochi.test
 *   2. Custom domain: mycompany.com (stored in customDomain field)
 * - Teams are accessed via paths on the org domain: {orgDomain}/{teamSlug}
 */

import 'server-only'
import { prisma } from '@/lib/config'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochi.test'

/**
 * Get organization's full URL (subdomain or custom domain)
 *
 * @param organizationId - Organization ID
 * @returns Full URL for the organization
 *
 * @example
 * ```ts
 * // Organization with slug "acme"
 * await getOrganizationUrl("org-123") // "http://acme.mochi.test:3000"
 *
 * // Organization with custom domain "mycompany.com"
 * await getOrganizationUrl("org-456") // "https://mycompany.com"
 * ```
 */
export async function getOrganizationUrl(
  organizationId: string
): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      slug: true,
      customDomain: true,
    },
  })

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`)
  }

  // Use custom domain if available
  if (org.customDomain) {
    // Custom domains should use HTTPS in production
    const protocol = org.customDomain.includes('localhost') ? 'http' : 'https'
    return `${protocol}://${org.customDomain}`
  }

  // Otherwise use subdomain
  // In development, include port number
  const isDevelopment = ROOT_DOMAIN.includes('localhost') || ROOT_DOMAIN.includes('.test')
  const port = isDevelopment ? ':3000' : ''
  const protocol = isDevelopment ? 'http' : 'https'

  return `${protocol}://${org.slug}.${ROOT_DOMAIN}${port}`
}

/**
 * Find organization by slug or custom domain
 *
 * @param identifier - Either slug or custom domain
 * @returns Organization with domain info, or null if not found
 */
export async function findOrganizationByDomain(identifier: string): Promise<{
  id: string
  slug: string
  customDomain: string | null
} | null> {
  // Try to find by slug first
  let org = await prisma.organization.findUnique({
    where: { slug: identifier },
    select: {
      id: true,
      slug: true,
      customDomain: true,
    },
  })

  // If not found by slug, try custom domain
  if (!org && identifier) {
    org = await prisma.organization.findUnique({
      where: { customDomain: identifier },
      select: {
        id: true,
        slug: true,
        customDomain: true,
      },
    })
  }

  return org
}
