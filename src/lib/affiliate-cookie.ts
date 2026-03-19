/**
 * Affiliate Cookie Management
 *
 * WHY: Track affiliate referrals via cookie with 3-month expiration
 * HOW: Set cookie when user clicks affiliate link, read on sign-up
 *
 * SECURITY:
 * - Affiliate codes are validated against a strict allowlist pattern
 * - Cookie value is sanitized with encodeURIComponent as a defense-in-depth measure
 * - Secure flag is set in production to prevent transmission over plain HTTP
 */

const AFFILIATE_COOKIE_NAME = 'mochi_affiliate'
const AFFILIATE_COOKIE_DAYS = 90 // 3 months

/** Only allow safe alphanumeric characters, hyphens, and underscores in affiliate codes */
const AFFILIATE_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/

/**
 * Set affiliate cookie
 *
 * SECURITY: Validates the affiliate code format and encodes the value
 * to prevent cookie injection attacks. Adds Secure flag in production
 * so the cookie is never sent over unencrypted connections.
 */
export function setAffiliateCookie(affiliateCode: string): void {
  /** Reject codes that don't match the safe pattern to prevent injection */
  if (!AFFILIATE_CODE_PATTERN.test(affiliateCode)) {
    console.warn('[affiliate-cookie] Invalid affiliate code format, ignoring:', affiliateCode)
    return
  }

  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + AFFILIATE_COOKIE_DAYS)

  /** Encode the value as defense-in-depth even after validation */
  const safeCode = encodeURIComponent(affiliateCode)

  /** Add Secure flag in production to prevent cookie leakage over HTTP */
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const securePart = isSecure ? '; Secure' : ''

  document.cookie = `${AFFILIATE_COOKIE_NAME}=${safeCode}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax${securePart}`
}

/**
 * Get affiliate cookie value
 */
export function getAffiliateCookie(): string | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === AFFILIATE_COOKIE_NAME) {
      return value
    }
  }
  return null
}

/**
 * Clear affiliate cookie
 */
export function clearAffiliateCookie(): void {
  document.cookie = `${AFFILIATE_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
}
