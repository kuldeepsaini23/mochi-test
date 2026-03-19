/**
 * Portal Library Exports
 *
 * SOURCE OF TRUTH: Portal Lib
 * Re-exports all portal utilities for easy importing.
 */

// Config
export {
  portalConfig,
  validatePortalConfig,
  getPortalSecret,
  isPortalEnabled,
  getPortalUrl,
  isPortalRoute,
  getPortalSessionExpiry,
} from './config'

// Security utilities
export {
  generateSecureToken,
  hashToken,
  verifyTokenHash,
  getTokenSuffix,
  createSignedToken,
  verifySignedToken,
  extractClientIp,
  extractUserAgent,
  PORTAL_SESSION_COOKIE,
  getPortalCookieOptions,
  type SignedTokenPayload,
} from './security'

// Types
export * from './types'
