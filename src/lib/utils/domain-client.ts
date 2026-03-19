/**
 * Client-Side Domain Utilities
 *
 * WHY: Browser-safe domain utilities for client components
 * HOW: Uses window.location instead of Next.js headers
 */

'use client'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochi.test'

/**
 * Get current domain from browser
 *
 * Client-side only - reads from window.location
 *
 * @returns Current hostname (e.g., "acme.mochi.test:3000" or "mycompany.com")
 */
export function getCurrentDomain(): string {
  if (typeof window === 'undefined') {
    return ROOT_DOMAIN
  }

  return window.location.host
}

/**
 * Build organization URL from cached data
 *
 * @param slug - Organization slug
 * @param customDomain - Optional custom domain
 * @returns Full organization URL
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
 * @param path - Path to append
 * @param params - Optional query parameters
 * @returns Full URL
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
 * Check if current page is on platform domain
 *
 * @returns true if on platform domain
 */
export function isPlatformDomain(): boolean {
  const domain = getCurrentDomain()
  const cleanDomain = domain.split(':')[0]

  return cleanDomain === ROOT_DOMAIN
}

/**
 * Extract subdomain from current domain
 *
 * @returns Subdomain string or null
 */
export function getSubdomain(): string | null {
  const domain = getCurrentDomain()
  const host = domain.split(':')[0]

  if (host === ROOT_DOMAIN) return null
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null

  const subdomain = host.replace(`.${ROOT_DOMAIN}`, '')
  if (subdomain.includes('.')) return null

  return subdomain
}

/**
 * Extract custom domain from current domain
 *
 * WHY: Identifies when the app is accessed from a customer's custom domain.
 * Excludes localhost, 127.0.0.1, and raw IPs to mirror proxy.ts behavior.
 * Without this, localhost is misidentified as a custom domain.
 *
 * @returns Custom domain string or null
 */
export function getCustomDomain(): string | null {
  const domain = getCurrentDomain()
  const cleanDomain = domain.split(':')[0]

  if (cleanDomain === ROOT_DOMAIN) return null
  if (cleanDomain.endsWith(`.${ROOT_DOMAIN}`)) return null

  /** Exclude localhost and IP addresses — mirrors proxy.ts isCustomDomain() */
  if (cleanDomain === 'localhost' || cleanDomain.startsWith('127.0.0.1')) return null
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanDomain)) return null

  return cleanDomain
}
