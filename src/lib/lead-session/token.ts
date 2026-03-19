/**
 * Lead Session Token Generator
 *
 * Creates secure, opaque tokens for lead identification across forms,
 * chat widgets, and embedded components. Tokens are HMAC-SHA256 signed
 * and bound to a specific organization.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadSessionToken, StickyForm, LeadIdentification
 *
 * SECURITY MODEL:
 * - Tokens are cryptographically random (32 bytes = 256 bits entropy)
 * - HMAC-SHA256 signature binds token to organization
 * - Only token hash is stored in database (never raw token)
 * - Timing-safe comparison prevents timing attacks
 *
 * TOKEN FORMAT: v1.{random_payload}.{signature}
 * - version: "v1" for future-proofing
 * - random_payload: 32 bytes, base64url encoded
 * - signature: HMAC-SHA256(version.payload.organizationId), base64url encoded
 */

import { randomBytes, createHmac, timingSafeEqual } from 'crypto'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Current token version for future-proofing format changes */
const TOKEN_VERSION = 'v1'

/** Number of random bytes in the payload (256-bit entropy) */
const PAYLOAD_BYTES = 32

/** Environment variable name for the token secret */
const TOKEN_SECRET_ENV = 'LEAD_SESSION_TOKEN_SECRET'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for creating a new lead session token
 */
export interface CreateTokenOptions {
  /** The organization ID this token is bound to */
  organizationId: string
  /** The lead ID this token identifies */
  leadId: string
}

/**
 * Result of creating a new token
 */
export interface TokenResult {
  /** Full token to send to client for cookie storage */
  token: string
  /** SHA-256 hash of token for database lookup (never store raw token) */
  tokenHash: string
  /** Last 8 characters of token for debugging/support reference */
  tokenSuffix: string
}

/**
 * Parsed components of a token
 */
export interface TokenComponents {
  version: string
  payload: string
  signature: string
}

// ============================================================================
// SECRET KEY MANAGEMENT
// ============================================================================

/**
 * Retrieves the secret key for token signing
 *
 * WHY: Centralizes secret key access with proper fallback for development/build
 * HOW: Uses environment variable in production, derives from other secrets in dev
 *
 * BUILD SAFETY:
 * During Docker build, Next.js may evaluate this code path. We provide a
 * build-time fallback to prevent build failures. This fallback is NEVER
 * used for actual token operations - only during static analysis.
 */
function getSecretKey(): string {
  const secret = process.env[TOKEN_SECRET_ENV]

  if (!secret) {
    // In production runtime, this MUST be set
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `${TOKEN_SECRET_ENV} environment variable is required in production`
      )
    }

    // In development, derive from other secrets (still secure, just not ideal)
    const fallback = process.env.BETTER_AUTH_SECRET || process.env.DATABASE_URL
    if (fallback) {
      // Derive a key from the fallback using HMAC
      return createHmac('sha256', 'lead-session-dev-key')
        .update(fallback)
        .digest('hex')
    }

    /**
     * BUILD-TIME FALLBACK:
     * If we reach here, we're likely in a Docker build context where no
     * secrets are available. Return a placeholder that allows the build
     * to complete. This is safe because:
     * 1. Token operations don't happen during build (only at runtime)
     * 2. In production runtime, NODE_ENV='production' so we'd throw above
     * 3. This placeholder is never used for actual cryptographic operations
     */
    console.warn(
      `[LeadSession] No secret available - using build-time placeholder. ` +
      `This is OK during Docker build, but LEAD_SESSION_TOKEN_SECRET must be set at runtime.`
    )
    return 'build-time-placeholder-not-for-production-use'
  }

  return secret
}

// ============================================================================
// TOKEN OPERATIONS
// ============================================================================

/**
 * Creates a secure lead session token
 *
 * WHY: Generate opaque, unforgeable tokens for lead identification
 * HOW: Random payload + HMAC signature bound to organization
 *
 * @example
 * ```ts
 * const { token, tokenHash, tokenSuffix } = createLeadSessionToken({
 *   organizationId: 'org_abc123',
 *   leadId: 'lead_xyz789',
 * })
 *
 * // Store tokenHash in database
 * await prisma.leadSession.create({
 *   data: { tokenHash, tokenSuffix, leadId, organizationId }
 * })
 *
 * // Send token to client for cookie storage
 * setCookie('mochi_lead_sid', token)
 * ```
 */
export function createLeadSessionToken(options: CreateTokenOptions): TokenResult {
  const secret = getSecretKey()

  // Generate cryptographically random payload (256-bit entropy)
  const payload = randomBytes(PAYLOAD_BYTES).toString('base64url')

  // Create signature binding token to organization
  // Format: version.payload.organizationId
  const signatureData = `${TOKEN_VERSION}.${payload}.${options.organizationId}`
  const signature = createHmac('sha256', secret)
    .update(signatureData)
    .digest('base64url')

  // Assemble full token: version.payload.signature
  const token = `${TOKEN_VERSION}.${payload}.${signature}`

  // Create hash for database lookup (never store raw token)
  const tokenHash = createHmac('sha256', secret)
    .update(token)
    .digest('hex')

  // Keep last 8 chars for support/debugging reference
  const tokenSuffix = token.slice(-8)

  return { token, tokenHash, tokenSuffix }
}

/**
 * Parses a token string into its components
 *
 * WHY: Separate parsing from validation for cleaner code
 * HOW: Split by dots and validate structure
 *
 * @returns Parsed components or null if invalid format
 */
export function parseToken(token: string): TokenComponents | null {
  if (!token || typeof token !== 'string') {
    return null
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [version, payload, signature] = parts

  // Check version
  if (version !== TOKEN_VERSION) {
    return null
  }

  // Basic validation that parts are non-empty
  if (!payload || !signature) {
    return null
  }

  return { version, payload, signature }
}

/**
 * Validates a token's signature against an organization
 *
 * WHY: Ensure token was created for this organization (prevents cross-org attacks)
 * HOW: Recalculate HMAC and compare with timing-safe equality
 *
 * @example
 * ```ts
 * const isValid = validateTokenSignature(token, 'org_abc123')
 * if (!isValid) {
 *   throw new Error('Invalid or forged token')
 * }
 * ```
 */
export function validateTokenSignature(
  token: string,
  organizationId: string
): boolean {
  const components = parseToken(token)
  if (!components) {
    return false
  }

  const secret = getSecretKey()

  // Recalculate expected signature
  const signatureData = `${components.version}.${components.payload}.${organizationId}`
  const expectedSignature = createHmac('sha256', secret)
    .update(signatureData)
    .digest('base64url')

  // Use timing-safe comparison to prevent timing attacks
  try {
    const providedBuffer = Buffer.from(components.signature, 'base64url')
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url')

    // Lengths must match for timingSafeEqual
    if (providedBuffer.length !== expectedBuffer.length) {
      return false
    }

    return timingSafeEqual(providedBuffer, expectedBuffer)
  } catch {
    // Buffer conversion failed - invalid signature format
    return false
  }
}

/**
 * Hashes a token for database lookup
 *
 * WHY: Never store raw tokens in database for security
 * HOW: HMAC-SHA256 with secret key produces consistent hash
 *
 * @example
 * ```ts
 * const tokenHash = hashToken(clientToken)
 * const session = await prisma.leadSession.findUnique({
 *   where: { tokenHash }
 * })
 * ```
 */
export function hashToken(token: string): string {
  const secret = getSecretKey()
  return createHmac('sha256', secret)
    .update(token)
    .digest('hex')
}

/**
 * Extracts the suffix from a token for debugging
 *
 * WHY: Allow support to reference tokens without exposing full token
 * HOW: Returns last 8 characters of the token
 */
export function getTokenSuffix(token: string): string {
  return token.slice(-8)
}
