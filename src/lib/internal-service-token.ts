/**
 * Internal Service Token (IST)
 *
 * Secure token system for internal service-to-service authentication.
 * Used by Trigger.dev tasks, automation workflows, and other internal services
 * to call tRPC endpoints with pre-validated permissions.
 *
 * SECURITY MODEL:
 * - Tokens are signed with HMAC-SHA256 using a secret key
 * - Tokens have short TTL (default 5 minutes) to limit exposure
 * - Token contains: actor info, permissions, organization context
 * - Same permission checks apply - token just provides the identity
 *
 * FLOW:
 * 1. User makes request → tRPC validates session → creates IST for task
 * 2. Trigger task receives IST → calls tRPC with IST header
 * 3. tRPC context validates IST → populates ctx.user from token
 * 4. Same organizationProcedure checks run (permissions, feature gates, etc.)
 */

import { createHmac, timingSafeEqual } from 'crypto'

// ============================================================================
// TYPES
// ============================================================================

export type ActorType = 'user' | 'system' | 'automation'

export interface ISTPayload {
  /** Actor ID - userId for users, system identifier for automated actions */
  actorId: string
  /** Type of actor performing the action */
  actorType: ActorType
  /** Organization this token is scoped to */
  organizationId: string
  /** Actor's role in the organization */
  role: string
  /** Pre-validated permissions array (e.g., ['leads:read', 'leads:create']) */
  permissions: string[]
  /** Token creation timestamp (Unix ms) */
  iat: number
  /** Token expiration timestamp (Unix ms) */
  exp: number
  /** Optional: Original user ID if automation triggered by user action */
  triggeredBy?: string
  /** Optional: Source of the action (e.g., 'ai-agent', 'webhook', 'scheduled') */
  source?: string
}

export interface ISTCreateOptions {
  actorId: string
  actorType: ActorType
  organizationId: string
  role: string
  permissions: string[]
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number
  /** Who triggered this action (for audit trail) */
  triggeredBy?: string
  /** Source identifier */
  source?: string
}

export interface ISTValidationResult {
  valid: boolean
  payload?: ISTPayload
  error?: string
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const IST_HEADER_NAME = 'x-internal-service-token'
const DEFAULT_TTL_SECONDS = 300 // 5 minutes
const MAX_TTL_SECONDS = 3600 // 1 hour max

/**
 * Get the IST secret key from environment
 * Falls back to a derived key in development only
 */
function getSecretKey(): string {
  const secret = process.env.INTERNAL_SERVICE_TOKEN_SECRET

  if (!secret) {
    // In production, this MUST be set
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'INTERNAL_SERVICE_TOKEN_SECRET environment variable is required in production'
      )
    }

    // In development, derive from other secrets (still secure, just not ideal)
    const fallback = process.env.BETTER_AUTH_SECRET || process.env.DATABASE_URL
    if (!fallback) {
      throw new Error(
        'No secret available for IST. Set INTERNAL_SERVICE_TOKEN_SECRET or BETTER_AUTH_SECRET'
      )
    }

    // Derive a key from the fallback
    return createHmac('sha256', 'ist-dev-key')
      .update(fallback)
      .digest('hex')
  }

  return secret
}

// ============================================================================
// TOKEN OPERATIONS
// ============================================================================

/**
 * Create a signed Internal Service Token
 *
 * @example
 * ```ts
 * const token = createInternalServiceToken({
 *   actorId: ctx.user.id,
 *   actorType: 'user',
 *   organizationId: input.organizationId,
 *   role: ctx.memberRole,
 *   permissions: ['leads:read', 'leads:create'],
 *   source: 'ai-agent',
 * })
 * ```
 */
export function createInternalServiceToken(options: ISTCreateOptions): string {
  const secret = getSecretKey()

  const now = Date.now()
  const ttl = Math.min(options.ttlSeconds ?? DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS)

  const payload: ISTPayload = {
    actorId: options.actorId,
    actorType: options.actorType,
    organizationId: options.organizationId,
    role: options.role,
    permissions: options.permissions,
    iat: now,
    exp: now + ttl * 1000,
    ...(options.triggeredBy && { triggeredBy: options.triggeredBy }),
    ...(options.source && { source: options.source }),
  }

  // Encode payload as base64
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url')

  // Create signature
  const signature = createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url')

  // Return token: payload.signature
  return `${payloadBase64}.${signature}`
}

/**
 * Validate an Internal Service Token
 *
 * @example
 * ```ts
 * const result = validateInternalServiceToken(token)
 * if (result.valid) {
 *   console.log('Actor:', result.payload.actorId)
 * } else {
 *   console.error('Invalid token:', result.error)
 * }
 * ```
 */
export function validateInternalServiceToken(token: string): ISTValidationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' }
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid token format' }
  }

  const [payloadBase64, providedSignature] = parts

  try {
    const secret = getSecretKey()

    // Verify signature using timing-safe comparison
    const expectedSignature = createHmac('sha256', secret)
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

    // Parse payload
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8')
    const payload: ISTPayload = JSON.parse(payloadJson)

    // Check expiration
    if (Date.now() > payload.exp) {
      return { valid: false, error: 'Token expired' }
    }

    // Validate required fields
    if (!payload.actorId || !payload.organizationId || !payload.role) {
      return { valid: false, error: 'Missing required fields in payload' }
    }

    return { valid: true, payload }
  } catch (error) {
    return { valid: false, error: 'Failed to parse token' }
  }
}

/**
 * Extract IST from request headers
 */
export function extractISTFromHeaders(headers: Headers | Record<string, string | undefined>): string | null {
  if (headers instanceof Headers) {
    return headers.get(IST_HEADER_NAME)
  }
  return headers[IST_HEADER_NAME] ?? null
}

/**
 * Get the header name for IST
 */
export function getISTHeaderName(): string {
  return IST_HEADER_NAME
}

// ============================================================================
// HELPER: Create token for Trigger tasks
// ============================================================================

/**
 * Create an IST for a Trigger.dev task
 *
 * Use this when triggering a task that needs to call tRPC endpoints.
 * The token carries the user's validated permissions to the task.
 *
 * @example
 * ```ts
 * // In tRPC procedure that triggers a task
 * const token = createTriggerTaskToken({
 *   user: ctx.user,
 *   organizationId: input.organizationId,
 *   memberRole: ctx.memberRole,
 *   permissions: await getPermissionsForUser(ctx.user.id, input.organizationId),
 *   source: 'ai-agent',
 * })
 *
 * await mochiAgentTask.trigger({
 *   organizationId: input.organizationId,
 *   internalToken: token,
 *   // ... other payload
 * })
 * ```
 */
export function createTriggerTaskToken(options: {
  user: { id: string; name?: string | null; email: string }
  organizationId: string
  memberRole: string
  permissions: string[]
  source?: string
  ttlSeconds?: number
}): string {
  return createInternalServiceToken({
    actorId: options.user.id,
    actorType: 'user',
    organizationId: options.organizationId,
    role: options.memberRole,
    permissions: options.permissions,
    triggeredBy: options.user.id,
    source: options.source ?? 'trigger-task',
    ttlSeconds: options.ttlSeconds ?? 300,
  })
}

/**
 * Create an IST for automated/system actions
 *
 * Use this for scheduled tasks, webhook handlers, etc.
 * that don't have a user session but need to perform actions.
 *
 * @example
 * ```ts
 * // In a scheduled task or webhook handler
 * const token = createSystemToken({
 *   organizationId: webhook.organizationId,
 *   source: 'email-webhook',
 *   // System gets full permissions for the org
 * })
 * ```
 */
export function createSystemToken(options: {
  organizationId: string
  source: string
  ttlSeconds?: number
}): string {
  return createInternalServiceToken({
    actorId: `system:${options.source}`,
    actorType: 'system',
    organizationId: options.organizationId,
    role: 'system', // System role - needs to be handled in permission checks
    permissions: [], // Empty = system has context-dependent permissions
    source: options.source,
    ttlSeconds: options.ttlSeconds ?? 60, // Shorter TTL for system tokens
  })
}
