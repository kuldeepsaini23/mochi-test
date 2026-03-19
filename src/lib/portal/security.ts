/**
 * Portal Security Utilities
 *
 * SOURCE OF TRUTH: Portal Security Utils
 * Pure utility functions for token generation, hashing, and security operations.
 * NO database calls - just cryptographic helpers.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { getPortalSecret } from './config'

// ============================================================================
// TOKEN GENERATION
// ============================================================================

/**
 * Generate a cryptographically secure random token
 * Used for session tokens, invitation tokens, etc.
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url')
}

// ============================================================================
// HASHING
// ============================================================================

/**
 * Hash a token using HMAC-SHA256
 * Used for storing session tokens and invitation tokens securely
 */
export function hashToken(token: string): string {
  return createHmac('sha256', getPortalSecret()).update(token).digest('hex')
}

/**
 * Verify a token against its hash using timing-safe comparison
 */
export function verifyTokenHash(token: string, hash: string): boolean {
  const tokenHash = hashToken(token)

  const tokenBuffer = Buffer.from(tokenHash, 'hex')
  const hashBuffer = Buffer.from(hash, 'hex')

  if (tokenBuffer.length !== hashBuffer.length) {
    return false
  }

  return timingSafeEqual(tokenBuffer, hashBuffer)
}

/**
 * Get the last N characters of a token for identification/logging
 * Never log full tokens - only the suffix for debugging
 */
export function getTokenSuffix(token: string, length: number = 8): string {
  if (token.length <= length) {
    return token
  }
  return token.slice(-length)
}

// ============================================================================
// SIGNED TOKENS (FOR INVITATIONS)
// ============================================================================

/**
 * Payload structure for signed tokens
 */
export interface SignedTokenPayload {
  type: 'portal_invitation' | 'portal_action'
  sub: string
  iat: number
  exp: number
  data?: Record<string, unknown>
}

/**
 * Create a signed token with expiration
 */
export function createSignedToken(
  payload: Omit<SignedTokenPayload, 'iat'>
): string {
  const fullPayload: SignedTokenPayload = {
    ...payload,
    iat: Date.now(),
  }

  const payloadBase64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url')
  const signature = createHmac('sha256', getPortalSecret())
    .update(payloadBase64)
    .digest('base64url')

  return `${payloadBase64}.${signature}`
}

/**
 * Verify and decode a signed token
 */
export function verifySignedToken(token: string): {
  valid: boolean
  payload?: SignedTokenPayload
  error?: string
} {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' }
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid token format' }
  }

  const [payloadBase64, providedSignature] = parts

  try {
    const expectedSignature = createHmac('sha256', getPortalSecret())
      .update(payloadBase64)
      .digest('base64url')

    const providedBuffer = Buffer.from(providedSignature, 'base64url')
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url')

    if (providedBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'Invalid signature' }
    }

    if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
      return { valid: false, error: 'Invalid signature' }
    }

    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8')
    const payload: SignedTokenPayload = JSON.parse(payloadJson)

    if (Date.now() > payload.exp) {
      return { valid: false, error: 'Token expired' }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, error: 'Failed to parse token' }
  }
}

// ============================================================================
// REQUEST HELPERS
// ============================================================================

/**
 * Extract client IP address from request headers
 */
export function extractClientIp(headers: Headers): string {
  const headerNames = [
    'cf-connecting-ip',
    'x-real-ip',
    'x-forwarded-for',
    'x-client-ip',
  ]

  for (const headerName of headerNames) {
    const value = headers.get(headerName)
    if (value) {
      return value.split(',')[0].trim()
    }
  }

  return 'unknown'
}

/**
 * Extract user agent from request headers
 */
export function extractUserAgent(headers: Headers): string {
  return headers.get('user-agent') || 'unknown'
}

// ============================================================================
// COOKIE CONFIG
// ============================================================================

export const PORTAL_SESSION_COOKIE = 'portal_session'

/**
 * Get secure cookie options for portal session
 */
export function getPortalCookieOptions(sessionTimeoutHours: number = 4) {
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: sessionTimeoutHours * 60 * 60,
  }
}
