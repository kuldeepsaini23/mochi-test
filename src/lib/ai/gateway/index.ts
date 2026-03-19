/**
 * ============================================================================
 * AI GATEWAY - SERVER-SIDE CONFIGURATION
 * ============================================================================
 *
 * Shared gateway configuration used by the Mochi AI route.
 * Uses the Vercel AI Gateway (built into the `ai` package) for unified
 * multi-provider access with automatic fallback support.
 *
 * The gateway routes requests through Vercel's infrastructure, which means:
 * - Single API key for all providers (no per-provider keys needed)
 * - Automatic provider-level fallback if the primary model errors
 * - No token markup — pass-through pricing
 *
 * SOURCE OF TRUTH KEYWORDS: AIGatewayConfig, GatewaySetup, AIGatewayServer
 * ============================================================================
 */

import 'server-only'
import { gateway } from 'ai'
import { VALID_MODEL_IDS, DEFAULT_MODEL_ID } from './models'

// Re-export client-safe items for convenience
export { AI_GATEWAY_MODELS, VALID_MODEL_IDS, DEFAULT_MODEL_ID } from './models'
export type { GatewayModel } from './models'

// ============================================================================
// ENV CONFIGURATION
// ============================================================================

/**
 * Default model from environment, with static fallback.
 * Reads AI_GATEWAY_DEFAULT_MODEL at startup.
 */
const ENV_DEFAULT_MODEL = process.env.AI_GATEWAY_DEFAULT_MODEL || DEFAULT_MODEL_ID

/**
 * Fallback model from environment.
 * Used in providerOptions.gateway.models as automatic fallback
 * when the primary model fails (e.g. rate limit, outage).
 */
const ENV_FALLBACK_MODEL = process.env.AI_GATEWAY_FALLBACK_MODEL || 'openai/gpt-5-nano'

// ============================================================================
// GATEWAY HELPERS
// ============================================================================

/**
 * Resolves and validates a model ID for use with the gateway.
 * Returns the env default if modelId is not provided or not in the allowed list.
 *
 * @param modelId - Optional model ID from the client request
 * @returns A validated model ID string
 */
export function resolveModelId(modelId?: string): string {
  if (modelId && VALID_MODEL_IDS.has(modelId)) {
    return modelId
  }
  return ENV_DEFAULT_MODEL
}

/**
 * Creates a gateway model instance with automatic fallback configuration.
 *
 * Uses the Vercel AI Gateway's providerOptions to set up a fallback chain:
 * if the primary model fails (rate limit, outage, etc.), the gateway
 * automatically retries with the fallback model.
 *
 * @param modelId - The primary model ID (e.g. "anthropic/claude-sonnet-4.5")
 * @returns A model instance ready to pass to streamText/generateText
 *
 * @example
 * ```ts
 * const model = createGatewayModel('anthropic/claude-sonnet-4.5')
 * const result = streamText({ model, prompt: 'Hello' })
 * ```
 */
export function createGatewayModel(modelId: string) {
  return gateway(modelId)
}

/**
 * Returns the providerOptions object for gateway fallback configuration.
 * Pass this as `providerOptions` in streamText/generateText calls.
 *
 * @param primaryModelId - The primary model being used
 * @returns Provider options with fallback model chain
 */
export function getGatewayProviderOptions(primaryModelId: string) {
  return {
    gateway: {
      models: [primaryModelId, ENV_FALLBACK_MODEL],
    },
  }
}
