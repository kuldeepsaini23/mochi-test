/**
 * Lead Session Client Utilities
 *
 * Client-side utilities for managing lead session cookies.
 * For use in browser contexts - forms, chat widgets, embeds.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadSessionClient, StickyFormClient
 *
 * IMPORTANT: This file runs in the browser, not on the server.
 * Do not import server-only modules here.
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
 * Options for setting the session cookie
 */
export interface SetSessionOptions {
  /** Optional domain to set the cookie on */
  domain?: string
}

// ============================================================================
// COOKIE OPERATIONS
// ============================================================================

/**
 * Get the current session token from cookie
 *
 * WHY: Retrieve stored session token for validation
 * HOW: Parse document.cookie and extract the token
 *
 * @returns The session token or null if not found
 *
 * @example
 * ```ts
 * const token = getSessionToken()
 * if (token) {
 *   const validation = await trpc.leadSession.validate.query({
 *     organizationId,
 *     token,
 *   })
 * }
 * ```
 */
export function getSessionToken(): string | null {
  if (typeof document === 'undefined') {
    return null
  }

  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=')
    if (name === LEAD_SESSION_COOKIE_NAME) {
      // Join value parts back together (in case value contains '=')
      return decodeURIComponent(valueParts.join('='))
    }
  }

  return null
}

/**
 * Set the session token in cookie
 *
 * WHY: Store session token for future visits
 * HOW: Set document.cookie with appropriate attributes
 *
 * @param token - The session token to store
 * @param options - Optional settings like domain
 *
 * @example
 * ```ts
 * const result = await trpc.leadSession.create.mutate({
 *   organizationId: 'org_xxx',
 *   email: 'user@example.com',
 * })
 *
 * if (result.success && result.token) {
 *   setSessionToken(result.token)
 * }
 * ```
 */
export function setSessionToken(
  token: string,
  options?: SetSessionOptions
): void {
  if (typeof document === 'undefined') {
    return
  }

  const parts: string[] = [
    `${LEAD_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `max-age=${COOKIE_MAX_AGE_SECONDS}`,
    'path=/',
    'samesite=lax',
  ]

  // Add secure flag in production (detected by protocol)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('secure')
  }

  // Add domain if specified
  if (options?.domain) {
    const cookieDomain = getCookieDomain(options.domain)
    if (cookieDomain) {
      parts.push(`domain=${cookieDomain}`)
    }
  }

  document.cookie = parts.join('; ')
}

/**
 * Clear the session token cookie
 *
 * WHY: Allow users to clear their session (e.g., logout, privacy)
 * HOW: Set cookie with expired date
 *
 * @param domain - Optional domain to clear the cookie from
 *
 * @example
 * ```ts
 * // User clicks "forget me" button
 * clearSessionToken()
 * ```
 */
export function clearSessionToken(domain?: string): void {
  if (typeof document === 'undefined') {
    return
  }

  const parts: string[] = [
    `${LEAD_SESSION_COOKIE_NAME}=`,
    'max-age=0',
    'expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'path=/',
  ]

  if (domain) {
    const cookieDomain = getCookieDomain(domain)
    if (cookieDomain) {
      parts.push(`domain=${cookieDomain}`)
    }
  }

  document.cookie = parts.join('; ')
}

/**
 * Check if we have an existing session
 *
 * WHY: Quick check before making validation API call
 * HOW: Check if cookie exists
 *
 * @returns true if a session token exists
 *
 * @example
 * ```ts
 * if (hasSession()) {
 *   // Validate and prefill form
 * } else {
 *   // Show email capture form
 * }
 * ```
 */
export function hasSession(): boolean {
  return getSessionToken() !== null
}

// ============================================================================
// DOMAIN UTILITIES
// ============================================================================

/**
 * Determines the cookie domain based on the hostname
 *
 * WHY: Different domains require different cookie scoping strategies
 * HOW: Subdomains share via root domain, custom domains use exact match
 *
 * @param hostname - The hostname (e.g., "acme.mochi.test")
 * @returns The cookie domain or null for localhost
 */
function getCookieDomain(hostname: string): string | null {
  // Get root domain from environment (NEXT_PUBLIC_ vars are inlined at build time)
  // This works in browser because Next.js replaces process.env.NEXT_PUBLIC_* at build
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

// ============================================================================
// STORAGE UTILITIES (for cross-origin fallback)
// ============================================================================

/**
 * Get session token from localStorage (fallback for cross-origin)
 *
 * WHY: Cookies may be blocked in third-party contexts (iframes)
 * HOW: Use localStorage as fallback storage
 */
export function getSessionTokenFromStorage(): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  try {
    return localStorage.getItem(LEAD_SESSION_COOKIE_NAME)
  } catch {
    // localStorage may be blocked in some contexts
    return null
  }
}

/**
 * Set session token in localStorage (fallback for cross-origin)
 *
 * WHY: Cookies may be blocked in third-party contexts (iframes)
 * HOW: Use localStorage as fallback storage
 */
export function setSessionTokenInStorage(token: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(LEAD_SESSION_COOKIE_NAME, token)
  } catch {
    // localStorage may be blocked in some contexts
  }
}

/**
 * Clear session token from localStorage
 */
export function clearSessionTokenFromStorage(): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.removeItem(LEAD_SESSION_COOKIE_NAME)
  } catch {
    // localStorage may be blocked in some contexts
  }
}

/**
 * Get session token from any available storage
 *
 * WHY: Provide single function that tries all storage options
 * HOW: Try cookie first, then localStorage
 *
 * @returns The session token or null if not found
 */
export function getSessionTokenAny(): string | null {
  // Try cookie first (preferred)
  const cookieToken = getSessionToken()
  if (cookieToken) {
    return cookieToken
  }

  // Fall back to localStorage
  return getSessionTokenFromStorage()
}

/**
 * Set session token in all available storage
 *
 * WHY: Maximize chances of token being available later
 * HOW: Set in both cookie and localStorage
 */
export function setSessionTokenAll(
  token: string,
  options?: SetSessionOptions
): void {
  setSessionToken(token, options)
  setSessionTokenInStorage(token)
}

/**
 * Clear session token from all storage
 */
export function clearSessionTokenAll(domain?: string): void {
  clearSessionToken(domain)
  clearSessionTokenFromStorage()
}
