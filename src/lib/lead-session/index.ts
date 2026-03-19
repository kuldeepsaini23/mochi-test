/**
 * Lead Session Module
 *
 * Unified exports for lead session (sticky forms) functionality.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadSession, StickyForm, LeadIdentification
 *
 * @example
 * ```ts
 * // Server-side (token generation)
 * import { createLeadSessionToken, validateTokenSignature } from '@/lib/lead-session'
 *
 * // Client-side (cookie management)
 * import { getSessionToken, setSessionToken } from '@/lib/lead-session/client'
 *
 * // Embedded contexts
 * import { getEmbedSessionToken, setEmbedSessionToken } from '@/lib/lead-session/embed'
 * ```
 */

// Re-export server-side token utilities (these are server-only)
export {
  createLeadSessionToken,
  validateTokenSignature,
  hashToken,
  parseToken,
  getTokenSuffix,
  type CreateTokenOptions,
  type TokenResult,
  type TokenComponents,
} from './token'

// Re-export server-side cookie utilities
export {
  LEAD_SESSION_COOKIE_NAME,
  COOKIE_MAX_AGE_SECONDS,
  createCookieConfig,
  createSetCookieHeader,
  createClearCookieHeader,
  getCookieDomain,
  parseCookies,
  extractSessionToken,
  type CookieConfig,
  type CreateCookieOptions,
} from './cookie'
