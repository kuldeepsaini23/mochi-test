/**
 * Portal Configuration
 *
 * SOURCE OF TRUTH: Portal ENV Configuration
 * Centralizes all portal-related environment variables with type safety.
 * Provides defaults for development and validates required values in production.
 */

import { createHmac } from 'crypto'

// ============================================================================
// PORTAL CONFIGURATION
// ============================================================================

/**
 * Portal configuration object
 * All portal-related settings derived from environment variables
 */
export const portalConfig = {
  /**
   * Whether the portal feature is enabled
   * Set PORTAL_ENABLED=false to completely disable portal access
   */
  enabled: process.env.PORTAL_ENABLED === 'true',

  /**
   * Initial owner email for first-time setup
   * This email will be automatically added as OWNER role when portal is first accessed
   */
  initialOwnerEmail: process.env.PORTAL_INITIAL_OWNER_EMAIL || '',

  /**
   * Portal session timeout in hours
   * Portal sessions are stricter than regular sessions for security
   */
  sessionTimeoutHours: parseInt(
    process.env.PORTAL_SESSION_TIMEOUT_HOURS || '4',
    10
  ),

  /**
   * Portal URL path prefix
   * The portal will be accessible at {ROOT_DOMAIN}{pathPrefix}
   */
  pathPrefix: process.env.PORTAL_PATH_PREFIX || '/portal',

  /**
   * Whether audit logging is enabled
   * Strongly recommended for production environments
   */
  auditLoggingEnabled: process.env.PORTAL_AUDIT_LOGGING_ENABLED === 'true',

  /**
   * Portal secret for signing tokens
   * Used for invitation tokens and other portal-specific security tokens
   * Falls back to undefined when unset — getPortalSecret() handles dev fallback and prod enforcement
   */
  secret: process.env.PORTAL_SECRET || undefined,
} as const

// ============================================================================
// CONFIGURATION VALIDATION
// ============================================================================

/**
 * Validates portal configuration
 * Throws errors in production if required values are missing
 *
 * @returns Object with validation results
 */
export function validatePortalConfig(): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  const isProduction = process.env.NODE_ENV === 'production'

  // Check if portal is enabled
  if (!portalConfig.enabled) {
    return { valid: true, errors: [], warnings: ['Portal is disabled'] }
  }

  // Validate required secrets in production
  if (!portalConfig.secret) {
    if (isProduction) {
      errors.push('PORTAL_SECRET is required in production')
    } else {
      warnings.push(
        'PORTAL_SECRET not set - using derived key for development'
      )
    }
  }

  // Validate initial owner email
  if (!portalConfig.initialOwnerEmail) {
    warnings.push(
      'PORTAL_INITIAL_OWNER_EMAIL not set - first portal admin must be created manually'
    )
  } else if (!isValidEmail(portalConfig.initialOwnerEmail)) {
    errors.push('PORTAL_INITIAL_OWNER_EMAIL is not a valid email address')
  }

  // Validate session timeout
  if (
    portalConfig.sessionTimeoutHours < 1 ||
    portalConfig.sessionTimeoutHours > 24
  ) {
    warnings.push(
      'PORTAL_SESSION_TIMEOUT_HOURS should be between 1 and 24 hours'
    )
  }

  // Validate path prefix
  if (!portalConfig.pathPrefix.startsWith('/')) {
    errors.push('PORTAL_PATH_PREFIX must start with /')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Get the portal secret with fallback for development
 * In production, throws if secret is not set
 */
export function getPortalSecret(): string {
  if (portalConfig.secret) {
    return portalConfig.secret
  }

  // In production, secret is required
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PORTAL_SECRET environment variable is required in production')
  }

  // In development, derive from other secrets
  const fallback = process.env.BETTER_AUTH_SECRET || process.env.DATABASE_URL
  if (!fallback) {
    throw new Error(
      'No secret available for portal. Set PORTAL_SECRET or BETTER_AUTH_SECRET'
    )
  }

  // Return a derived key (not ideal but works for development)
  return createHmac('sha256', 'portal-dev-key').update(fallback).digest('hex')
}

/**
 * Check if the portal feature is enabled
 * Use this before any portal-related operations
 */
export function isPortalEnabled(): boolean {
  return portalConfig.enabled
}

/**
 * Get the full portal URL
 */
export function getPortalUrl(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}${portalConfig.pathPrefix}`
}

/**
 * Check if a path is a portal route
 */
export function isPortalRoute(pathname: string): boolean {
  return pathname.startsWith(portalConfig.pathPrefix)
}

/**
 * Get portal session expiry date
 */
export function getPortalSessionExpiry(): Date {
  const now = new Date()
  now.setHours(now.getHours() + portalConfig.sessionTimeoutHours)
  return now
}

// ============================================================================
// PORTAL OWNER IDENTIFICATION
// ============================================================================

/**
 * Check if an email belongs to the portal owner
 *
 * SOURCE OF TRUTH: Portal Owner Email Check
 *
 * SECURITY: This function performs a case-insensitive but exact match against
 * the PORTAL_INITIAL_OWNER_EMAIL environment variable. This is the single
 * source of truth for determining if a user is the portal owner.
 *
 * WHY: Portal owners get special privileges:
 * - Their organization is marked as isPortalOrganization=true
 * - Their organization uses the hidden 'portal' tier with unlimited features
 * - They bypass all tier-based restrictions
 *
 * HOW: Case-insensitive comparison with trimmed values to handle common
 * input variations while maintaining security.
 *
 * @param email - The email address to check
 * @returns true if the email matches PORTAL_INITIAL_OWNER_EMAIL
 *
 * @example
 * ```ts
 * // Assuming PORTAL_INITIAL_OWNER_EMAIL=admin@example.com
 * isPortalOwnerEmail('admin@example.com')    // true
 * isPortalOwnerEmail('ADMIN@EXAMPLE.COM')    // true (case-insensitive)
 * isPortalOwnerEmail(' admin@example.com ')  // true (trimmed)
 * isPortalOwnerEmail('other@example.com')    // false
 * ```
 */
export function isPortalOwnerEmail(email: string): boolean {
  // Portal must be enabled and have an initial owner email configured
  if (!portalConfig.enabled || !portalConfig.initialOwnerEmail) {
    return false
  }

  // Case-insensitive comparison with trimmed values
  // SECURITY: Exact match required - no partial matching or wildcards
  return (
    email.toLowerCase().trim() ===
    portalConfig.initialOwnerEmail.toLowerCase().trim()
  )
}
