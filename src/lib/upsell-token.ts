/**
 * ============================================================================
 * UPSELL TOKEN — Secure One-Click Upsell Token System
 * ============================================================================
 *
 * SOURCE OF TRUTH: UpsellToken, OneClickUpsellToken, UpsellTokenPayload
 *
 * Creates and verifies short-lived, encrypted tokens for one-click upsell
 * payments. After a customer completes a purchase, we generate a token
 * containing their Stripe customer ID and payment method ID. This token
 * is passed as a URL parameter to the upsell page, where clicking the
 * upsell button triggers a server-side charge using the stored payment method.
 *
 * SECURITY DESIGN:
 * - Tokens are AES-256-GCM encrypted with a server-side secret
 * - HMAC-SHA256 signature prevents tampering
 * - 15-minute expiry prevents replay attacks
 * - Payment method ID is NEVER exposed to the client
 * - One-time use is enforced by the caller (track used tokens)
 *
 * WHY NOT JWT: We don't have a JWT library in the project, and this is
 * simpler — we only need encrypt/decrypt, not a full token standard.
 *
 * WHY NOT DATABASE: Avoids schema migration. The token is stateless —
 * all data is self-contained and verified via cryptographic signature.
 * ============================================================================
 */

import crypto from 'crypto'

/**
 * The secret used for encrypting/signing upsell tokens.
 * Falls back to a hash of BETTER_AUTH_SECRET if UPSELL_TOKEN_SECRET isn't set.
 * In production, UPSELL_TOKEN_SECRET should be a dedicated 32-byte hex key.
 *
 * SOURCE OF TRUTH: UpsellTokenSecret
 */
function getTokenSecret(): Buffer {
  const secret = process.env.UPSELL_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error('UPSELL_TOKEN_SECRET or BETTER_AUTH_SECRET must be set')
  }
  /* Derive a 32-byte key from the secret using SHA-256 */
  return crypto.createHash('sha256').update(secret).digest()
}

/** How long an upsell token is valid (15 minutes in milliseconds) */
const TOKEN_EXPIRY_MS = 15 * 60 * 1000

/**
 * Payload stored inside the encrypted upsell token.
 *
 * SOURCE OF TRUTH: UpsellTokenPayload
 */
export interface UpsellTokenPayload {
  /** Stripe customer ID from the original payment (cus_xxx) */
  stripeCustomerId: string
  /** Stripe payment method ID from the original payment (pm_xxx) */
  stripePaymentMethodId: string
  /** The connected account ID for the merchant */
  connectedAccountId: string
  /** Organization ID that owns the product */
  organizationId: string
  /** The original transaction ID (for linking upsell to original purchase) */
  originalTransactionId: string
  /** Lead ID from the original purchase — needed for automation triggers */
  leadId: string | null
  /** Whether the original payment was in test mode */
  testMode: boolean
  /** Token creation timestamp (epoch ms) — used for expiry check */
  createdAt: number
}

/**
 * Create an encrypted upsell token containing the payment method details.
 * This token is safe to pass as a URL parameter — it's encrypted and signed.
 *
 * @param payload - The upsell payment details to encrypt into the token
 * @returns Base64URL-encoded encrypted token string
 *
 * SOURCE OF TRUTH: CreateUpsellToken
 */
export function createUpsellToken(payload: Omit<UpsellTokenPayload, 'createdAt'>): string {
  const key = getTokenSecret()
  const iv = crypto.randomBytes(12)

  const fullPayload: UpsellTokenPayload = {
    ...payload,
    createdAt: Date.now(),
  }

  const plaintext = JSON.stringify(fullPayload)

  /* AES-256-GCM provides both encryption and authentication */
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  /**
   * Token format: iv (12 bytes) + authTag (16 bytes) + ciphertext
   * Encoded as base64url for safe URL parameter usage.
   */
  const tokenBuffer = Buffer.concat([iv, authTag, encrypted])
  return tokenBuffer.toString('base64url')
}

/**
 * Verify and decrypt an upsell token. Returns the payload if valid,
 * or throws an error if the token is invalid, expired, or tampered with.
 *
 * @param token - The base64url-encoded token string from the URL
 * @returns The decrypted UpsellTokenPayload
 * @throws Error if token is invalid, expired, or tampered
 *
 * SOURCE OF TRUTH: VerifyUpsellToken
 */
export function verifyUpsellToken(token: string): UpsellTokenPayload {
  const key = getTokenSecret()

  const tokenBuffer = Buffer.from(token, 'base64url')

  /* Minimum size: 12 (iv) + 16 (authTag) + 1 (at least 1 byte ciphertext) */
  if (tokenBuffer.length < 29) {
    throw new Error('Invalid upsell token: too short')
  }

  const iv = tokenBuffer.subarray(0, 12)
  const authTag = tokenBuffer.subarray(12, 28)
  const ciphertext = tokenBuffer.subarray(28)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  let decrypted: string
  try {
    decrypted = decipher.update(ciphertext) + decipher.final('utf8')
  } catch {
    throw new Error('Invalid upsell token: decryption failed (tampered or wrong key)')
  }

  const payload = JSON.parse(decrypted) as UpsellTokenPayload

  /* Check token expiry */
  const age = Date.now() - payload.createdAt
  if (age > TOKEN_EXPIRY_MS) {
    throw new Error('Upsell token has expired. Please complete a new purchase to access this offer.')
  }

  return payload
}
