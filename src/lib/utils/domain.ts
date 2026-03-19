/**
 * Domain Utilities
 *
 * WHY: Centralized utilities for domain/subdomain URL building
 * HOW: Provides cached helpers to build URLs based on organization domains
 *
 * USAGE:
 * - Server: Use getOrganizationUrl from domain-lookup.service
 * - Client: Use buildOrganizationUrl with cached org data
 * - Anywhere: Use getCurrentDomain to get current domain from headers/window
 */

import 'server-only'
import { headers } from 'next/headers'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochi.test'

/**
 * Get current domain from request headers
 *
 * Server-side only - reads from Next.js headers
 *
 * @returns Current hostname (e.g., "acme.mochi.test:3000" or "mycompany.com")
 */
export async function getCurrentDomain(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get('host') || headersList.get('x-forwarded-host')

  if (!host) {
    // Fallback to platform domain
    const isDevelopment = ROOT_DOMAIN.includes('localhost') || ROOT_DOMAIN.includes('.test')
    const port = isDevelopment ? ':3000' : ''
    return `${ROOT_DOMAIN}${port}`
  }

  return host
}

/**
 * Build organization URL from cached data
 *
 * This is a pure utility function that works with cached org data.
 * Use this on the client side with data from useOrganization hook.
 *
 * @param slug - Organization slug
 * @param customDomain - Optional custom domain
 * @returns Full organization URL
 *
 * @example
 * ```ts
 * const org = organizations.find(o => o.id === orgId)
 * const url = buildOrganizationUrl(org.slug, org.customDomain)
 * // Returns: "http://acme.mochi.test:3000" or "https://mycompany.com"
 * ```
 */
export function buildOrganizationUrl(slug: string, customDomain?: string | null): string {
  // Use custom domain if available
  if (customDomain) {
    const protocol = customDomain.includes('localhost') ? 'http' : 'https'
    return `${protocol}://${customDomain}`
  }

  // Otherwise use subdomain
  const isDevelopment = ROOT_DOMAIN.includes('localhost') || ROOT_DOMAIN.includes('.test')
  const port = isDevelopment ? ':3000' : ''
  const protocol = isDevelopment ? 'http' : 'https'

  return `${protocol}://${slug}.${ROOT_DOMAIN}${port}`
}

/**
 * Build full URL with path
 *
 * @param baseUrl - Base URL from buildOrganizationUrl
 * @param path - Path to append (e.g., "/accept-invitation")
 * @param params - Optional query parameters
 * @returns Full URL with path and query params
 *
 * @example
 * ```ts
 * const baseUrl = buildOrganizationUrl(org.slug, org.customDomain)
 * const url = buildUrl(baseUrl, '/accept-invitation', { id: '123' })
 * // Returns: "http://acme.mochi.test:3000/accept-invitation?id=123"
 * ```
 */
export function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string>
): string {
  const url = new URL(path, baseUrl)

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }

  return url.toString()
}

/**
 * Check if current request is on platform domain
 *
 * Platform domain is the root domain without subdomain (e.g., mochi.test, not acme.mochi.test)
 * Used for determining if we're in platform-level UI vs org-level UI
 *
 * @returns true if on platform domain, false if on subdomain/custom domain
 */
export async function isPlatformDomain(): Promise<boolean> {
  const domain = await getCurrentDomain()
  const cleanDomain = domain.split(':')[0] // Remove port

  // Check if it's exactly the root domain (no subdomain)
  return cleanDomain === ROOT_DOMAIN
}

/**
 * Extract subdomain from current domain
 *
 * @returns Subdomain string or null if not on a subdomain
 *
 * @example
 * ```ts
 * // On acme.mochi.test:3000
 * await getSubdomain() // Returns: "acme"
 *
 * // On mochi.test:3000
 * await getSubdomain() // Returns: null
 * ```
 */
export async function getSubdomain(): Promise<string | null> {
  const domain = await getCurrentDomain()
  const host = domain.split(':')[0]

  if (host === ROOT_DOMAIN) return null
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null

  const subdomain = host.replace(`.${ROOT_DOMAIN}`, '')
  if (subdomain.includes('.')) return null // Only first-level subdomains

  return subdomain
}

/**
 * Extract custom domain from current domain
 *
 * WHY: Identifies when the app is accessed from a customer's custom domain
 * (e.g., mycompany.com) rather than a subdomain (acme.mochi.test) or root domain.
 *
 * IMPORTANT: localhost, 127.0.0.1, and raw IPs are explicitly excluded.
 * Without this, localhost is misidentified as a custom domain, which causes
 * the protected layout access control to redirect to /unauthorized (no org
 * has customDomain === "localhost"). This mirrors proxy.ts's isCustomDomain().
 *
 * @returns Custom domain string or null if not on a custom domain
 *
 * @example
 * ```ts
 * // On mycompany.com
 * await getCustomDomain() // Returns: "mycompany.com"
 *
 * // On acme.mochi.test
 * await getCustomDomain() // Returns: null
 *
 * // On localhost:3000
 * await getCustomDomain() // Returns: null
 * ```
 */
export async function getCustomDomain(): Promise<string | null> {
  const domain = await getCurrentDomain()
  const cleanDomain = domain.split(':')[0]

  if (cleanDomain === ROOT_DOMAIN) return null
  if (cleanDomain.endsWith(`.${ROOT_DOMAIN}`)) return null

  /** Exclude localhost and IP addresses — mirrors proxy.ts isCustomDomain() */
  if (cleanDomain === 'localhost' || cleanDomain.startsWith('127.0.0.1')) return null
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanDomain)) return null

  return cleanDomain
}
