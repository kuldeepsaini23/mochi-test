/**
 * ============================================================================
 * MOCHI AI - CONSTANTS
 * ============================================================================
 *
 * Configuration constants for the Mochi AI streaming chat system.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiAIConstants, MochiAIConfig
 * ============================================================================
 */

/**
 * API endpoint for Mochi AI chat streaming
 */
export const MOCHI_AI_ENDPOINT = '/api/ai/chat'

/**
 * Maximum prompt length in characters.
 * Prevents abuse and excessive token usage.
 */
export const MAX_PROMPT_LENGTH = 2000

/**
 * Maximum number of multi-step tool calling rounds.
 * Complex prompts (e.g. "create pipeline + 4 lanes + ticket + calendar event") need
 * many sequential tool calls. 30 steps allows the AI to handle ~20+ chained
 * operations with room for extra lookups and confirmation (askUser) steps.
 * If the limit is reached, the client shows a helpful "clear and retry" message.
 */
export const MAX_STEPS = 30

/**
 * Timeout for AI generation in milliseconds (120 seconds).
 * Multi-step tool chains can take a while — especially when calling external
 * APIs (Stripe) or doing multiple DB operations in sequence.
 */
export const GENERATION_TIMEOUT_MS = 120_000

/**
 * Error codes for structured error handling in the Mochi AI system.
 */
export const MOCHI_ERROR_CODES = {
  /** Authentication failed - no session */
  UNAUTHORIZED: 'MOCHI_AI_UNAUTHORIZED',
  /** Organization access denied or missing AI permission */
  FORBIDDEN: 'MOCHI_AI_FORBIDDEN',
  /** Invalid request body */
  INVALID_REQUEST: 'MOCHI_AI_INVALID_REQUEST',
  /** Prompt exceeds max length */
  PROMPT_TOO_LONG: 'MOCHI_AI_PROMPT_TOO_LONG',
  /** Wallet balance insufficient — usage blocked until funds are added */
  INSUFFICIENT_BALANCE: 'MOCHI_AI_INSUFFICIENT_BALANCE',
  /** AI generation failed */
  GENERATION_FAILED: 'MOCHI_AI_GENERATION_FAILED',
  /** Stream processing error */
  STREAM_ERROR: 'MOCHI_AI_STREAM_ERROR',
  /** Request timed out */
  TIMEOUT: 'MOCHI_AI_TIMEOUT',
} as const
