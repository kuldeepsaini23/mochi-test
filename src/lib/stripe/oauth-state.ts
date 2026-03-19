/**
 * STRIPE OAUTH STATE SIGNING & VERIFICATION
 *
 * Prevents CSRF/state forgery attacks on the Stripe OAuth callback.
 * The state parameter is HMAC-signed so attackers cannot craft a valid
 * state pointing to a victim's organization ID.
 *
 * Uses the same HMAC-SHA256 + timingSafeEqual pattern as:
 * - src/lib/internal-service-token.ts
 * - src/lib/lead-session/token.ts
 * - src/lib/portal/security.ts
 *
 * SOURCE OF TRUTH KEYWORDS: StripeOAuthState, OAuthStateSigning, StripeStateForgery
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** Max age for OAuth state tokens (10 minutes) */
const STATE_MAX_AGE_MS = 10 * 60 * 1000

/**
 * Get the signing secret for OAuth state.
 * Uses BETTER_AUTH_SECRET with domain-specific key derivation
 * so tokens from other subsystems can't be cross-used.
 */
function getSigningSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'BETTER_AUTH_SECRET is required in production for Stripe OAuth state signing'
      )
    }

    // Dev fallback — still HMAC-signed, just with a predictable base
    console.warn('[stripe-oauth] No BETTER_AUTH_SECRET set, using dev fallback')
    return createHmac('sha256', 'stripe-oauth-dev-key')
      .update('dev-fallback')
      .digest('hex')
  }

  // Domain-specific key derivation to prevent cross-subsystem token reuse
  return createHmac('sha256', 'stripe-oauth-state')
    .update(secret)
    .digest('hex')
}

/**
 * Sign a payload string with HMAC-SHA256.
 * Returns a hex-encoded signature.
 */
function sign(payload: string): string {
  const secret = getSigningSecret()
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Create a signed OAuth state parameter for Stripe.
 * Format: org-{organizationId}-{timestamp}-{signature}
 *
 * The signature covers both the organizationId and timestamp,
 * preventing an attacker from forging a valid state for any org.
 *
 * @param organizationId - The organization initiating the OAuth flow
 * @returns Signed state string to pass as the OAuth state parameter
 */
export function createSignedOAuthState(organizationId: string): string {
  const timestamp = Date.now().toString()
  const payload = `org-${organizationId}-${timestamp}`
  const signature = sign(payload)
  return `${payload}-${signature}`
}

/** Result of verifying an OAuth state parameter */
interface OAuthStateResult {
  valid: boolean
  entityType: 'org' | null
  entityId: string | null
  error?: string
}

/**
 * Verify and parse a signed OAuth state parameter.
 * Checks the HMAC signature and ensures the state hasn't expired.
 *
 * @param state - The state parameter from the OAuth callback
 * @returns Verification result with parsed entity type and ID
 */
export function verifyOAuthState(state: string): OAuthStateResult {
  if (!state) {
    return { valid: false, entityType: null, entityId: null, error: 'Missing state parameter' }
  }

  // The signature is the last 64 chars (hex-encoded SHA-256 = 64 chars)
  // Format: org-{organizationId}-{timestamp}-{signature}
  const signatureLength = 64
  if (state.length <= signatureLength + 1) {
    return { valid: false, entityType: null, entityId: null, error: 'Invalid state format' }
  }

  const signatureSeparatorIndex = state.length - signatureLength - 1
  if (state[signatureSeparatorIndex] !== '-') {
    return { valid: false, entityType: null, entityId: null, error: 'Invalid state format' }
  }

  const payload = state.substring(0, signatureSeparatorIndex)
  const providedSignature = state.substring(signatureSeparatorIndex + 1)

  // Verify HMAC signature using timing-safe comparison
  const expectedSignature = sign(payload)
  const sigBuffer = Buffer.from(providedSignature, 'hex')
  const expectedBuffer = Buffer.from(expectedSignature, 'hex')

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, entityType: null, entityId: null, error: 'Invalid state signature' }
  }

  // Parse the verified payload: org-{organizationId}-{timestamp}
  // Timestamp is the last segment before the signature
  const lastDashIndex = payload.lastIndexOf('-')
  if (lastDashIndex === -1) {
    return { valid: false, entityType: null, entityId: null, error: 'Invalid state payload' }
  }

  const timestampStr = payload.substring(lastDashIndex + 1)
  const timestamp = parseInt(timestampStr, 10)
  if (isNaN(timestamp)) {
    return { valid: false, entityType: null, entityId: null, error: 'Invalid state timestamp' }
  }

  // Check expiry — OAuth flows should complete within 10 minutes
  const age = Date.now() - timestamp
  if (age > STATE_MAX_AGE_MS) {
    return { valid: false, entityType: null, entityId: null, error: 'State parameter has expired' }
  }

  // Extract entity type and ID from the payload prefix
  const prefixAndId = payload.substring(0, lastDashIndex)
  if (!prefixAndId.startsWith('org-')) {
    return { valid: false, entityType: null, entityId: null, error: 'Unknown entity type in state' }
  }

  const organizationId = prefixAndId.substring(4) // Remove "org-" prefix
  if (!organizationId) {
    return { valid: false, entityType: null, entityId: null, error: 'Missing organization ID in state' }
  }

  return { valid: true, entityType: 'org', entityId: organizationId }
}
