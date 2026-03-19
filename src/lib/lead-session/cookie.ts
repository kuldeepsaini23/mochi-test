/**
 * Lead Session Cookie Management (Server-Side)
 *
 * Handles cookie creation and configuration for server contexts.
 * Works with subdomains and custom domains.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadSessionCookie, StickyFormCookie
 *
 * COOKIE STRATEGY:
 * - HttpOnly: Prevents XSS token theft (server-set cookies only)
 * - Secure: Only sent over HTTPS in production
 * - SameSite=Lax: Protects against CSRF while allowing navigation
 * - Domain: Uses root domain with leading dot for subdomain sharing
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Cookie name used for lead session tokens */
export const LEAD_SESSION_COOKIE_NAME = 'mochi_lead_sid'

/** Cookie max age in seconds (10 years - effectively forever) */
export const COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60 // 315,360,000 seconds

// ============================================================================
// TYPES
// ============================================================================

/**
 * Cookie configuration object for setting cookies
 */
export interface CookieConfig {
  name: string
  value: string
  maxAge: number
  path: string
  sameSite: 'lax' | 'strict' | 'none'
  secure: boolean
  httpOnly: boolean
  domain?: string
}

/**
 * Options for creating a cookie configuration
 */
export interface CreateCookieOptions {
  /** The token value to store in the cookie */
  token: string
  /** The domain the cookie should be set for (optional) */
  domain?: string
  /** Whether to use HttpOnly flag (default: true for server, false for client) */
  httpOnly?: boolean
}

// ============================================================================
// DOMAIN UTILITIES
// ============================================================================

/**
 * Determines the cookie domain based on the request hostname
 *
 * WHY: Different domains require different cookie scoping strategies
 * HOW: Subdomains share via root domain, custom domains use exact match
 *
 * @param hostname - The hostname from the request (e.g., "acme.mochi.test")
 * @returns The cookie domain or null for localhost
 *
 * @example
 * ```ts
 * getCookieDomain('acme.mochi.test') // Returns '.mochi.test'
 * getCookieDomain('webprodigies.com') // Returns 'webprodigies.com'
 * getCookieDomain('localhost:3000') // Returns null
 * ```
 */
export function getCookieDomain(hostname: string): string | null {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochi.test'

  // Strip port if present
  const host = hostname.split(':')[0]

  // Local development - no domain restriction
  if (host === 'localhost' || host === '127.0.0.1') {
    return null
  }

  // Subdomain of platform - use root domain with leading dot for sharing
  if (host.endsWith(`.${rootDomain}`)) {
    return `.${rootDomain}`
  }

  // Custom domain - use exact domain
  return host
}

/**
 * Checks if running in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

// ============================================================================
// COOKIE CONFIGURATION
// ============================================================================

/**
 * Creates a cookie configuration object for setting the lead session cookie
 *
 * WHY: Standardize cookie configuration across the application
 * HOW: Returns a config object compatible with Set-Cookie header
 *
 * @example
 * ```ts
 * const config = createCookieConfig({
 *   token: 'v1.xyz...abc',
 *   domain: 'acme.mochi.test',
 * })
 *
 * // Use with Next.js cookies API
 * cookies().set(config.name, config.value, {
 *   maxAge: config.maxAge,
 *   path: config.path,
 *   sameSite: config.sameSite,
 *   secure: config.secure,
 *   httpOnly: config.httpOnly,
 *   domain: config.domain,
 * })
 * ```
 */
export function createCookieConfig(options: CreateCookieOptions): CookieConfig {
  const cookieDomain = options.domain
    ? getCookieDomain(options.domain)
    : undefined

  return {
    name: LEAD_SESSION_COOKIE_NAME,
    value: options.token,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: isProduction(),
    httpOnly: options.httpOnly ?? true,
    ...(cookieDomain && { domain: cookieDomain }),
  }
}

/**
 * Generates a Set-Cookie header string
 *
 * WHY: For use in API routes and middleware where direct header setting is needed
 * HOW: Formats all cookie attributes into a single header string
 *
 * @example
 * ```ts
 * const cookieHeader = createSetCookieHeader({
 *   token: 'v1.xyz...abc',
 *   domain: 'acme.mochi.test',
 * })
 *
 * return new Response(null, {
 *   headers: { 'Set-Cookie': cookieHeader }
 * })
 * ```
 */
export function createSetCookieHeader(options: CreateCookieOptions): string {
  const config = createCookieConfig(options)

  const parts: string[] = [
    `${config.name}=${encodeURIComponent(config.value)}`,
    `Max-Age=${config.maxAge}`,
    `Path=${config.path}`,
    `SameSite=${config.sameSite.charAt(0).toUpperCase() + config.sameSite.slice(1)}`,
  ]

  if (config.secure) {
    parts.push('Secure')
  }

  if (config.httpOnly) {
    parts.push('HttpOnly')
  }

  if (config.domain) {
    parts.push(`Domain=${config.domain}`)
  }

  return parts.join('; ')
}

/**
 * Generates a header string to clear the lead session cookie
 *
 * WHY: Properly expire/clear the cookie when session is revoked
 * HOW: Set Max-Age=0 and Expires in the past
 *
 * @example
 * ```ts
 * const clearHeader = createClearCookieHeader('acme.mochi.test')
 *
 * return new Response(null, {
 *   headers: { 'Set-Cookie': clearHeader }
 * })
 * ```
 */
export function createClearCookieHeader(domain?: string): string {
  const cookieDomain = domain ? getCookieDomain(domain) : undefined

  const parts: string[] = [
    `${LEAD_SESSION_COOKIE_NAME}=`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Path=/',
  ]

  if (cookieDomain) {
    parts.push(`Domain=${cookieDomain}`)
  }

  return parts.join('; ')
}

// ============================================================================
// COOKIE PARSING
// ============================================================================

/**
 * Parses a Cookie header string into key-value pairs
 *
 * WHY: Extract specific cookie values from incoming requests
 * HOW: Split by semicolons and parse key=value pairs
 *
 * @example
 * ```ts
 * const cookies = parseCookies(request.headers.get('Cookie') || '')
 * const token = cookies[LEAD_SESSION_COOKIE_NAME]
 * ```
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}

  if (!cookieHeader) {
    return cookies
  }

  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=')
    if (name) {
      // Join value parts back together (in case value contains '=')
      const value = valueParts.join('=')
      cookies[name.trim()] = decodeURIComponent(value)
    }
  }

  return cookies
}

/**
 * Extracts the lead session token from a Cookie header
 *
 * WHY: Convenience function for common use case
 * HOW: Parse cookies and return the specific token
 *
 * @example
 * ```ts
 * const token = extractSessionToken(request.headers.get('Cookie'))
 * if (token) {
 *   const validation = await validateSession({ token, organizationId })
 * }
 * ```
 */
export function extractSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null
  }

  const cookies = parseCookies(cookieHeader)
  return cookies[LEAD_SESSION_COOKIE_NAME] || null
}
