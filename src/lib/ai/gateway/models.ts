/**
 * ============================================================================
 * AI GATEWAY - CLIENT-SAFE MODEL LIST
 * ============================================================================
 *
 * Curated list of AI models available through the Vercel AI Gateway.
 * This file is intentionally free of server-only imports so it can be
 * imported from client components (e.g. model selector dropdowns).
 *
 * SOURCE OF TRUTH KEYWORDS: AIGatewayModels, GatewayModelList, AIModelSelector
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents a single model available through the AI Gateway.
 *
 * SOURCE OF TRUTH KEYWORDS: GatewayModel, AIGatewayModelEntry
 */
export interface GatewayModel {
  /** Gateway model ID in "provider/model" format (e.g. "anthropic/claude-sonnet-4.5") */
  id: string
  /** Human-readable label for the UI dropdown */
  label: string
  /** Provider name for grouping/display */
  provider: string
}

// ============================================================================
// MODEL LIST
// ============================================================================

/**
 * Curated list of models available through the Vercel AI Gateway.
 * Default model (Kimi K2.5) is listed first.
 * Add or remove models here to update the Mochi AI model dropdown.
 */
export const AI_GATEWAY_MODELS: GatewayModel[] = [
  // Moonshot (default)
  { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5', provider: 'Moonshot' },

  // Anthropic
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', provider: 'Anthropic' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', provider: 'Anthropic' },

  // OpenAI
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },

  // Google
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google' },

  // DeepSeek
  { id: 'deepseek/deepseek-v3', label: 'DeepSeek V3', provider: 'DeepSeek' },

  // Mistral
  { id: 'mistral/mistral-large-3', label: 'Mistral Large 3', provider: 'Mistral' },

  // xAI
  { id: 'xai/grok-3', label: 'Grok 3', provider: 'xAI' },
] as const

/**
 * Set of valid model IDs for quick validation lookups.
 * Used by API routes to validate incoming modelId requests.
 */
export const VALID_MODEL_IDS = new Set(AI_GATEWAY_MODELS.map((m) => m.id))

/**
 * Default model ID — used when no model is explicitly selected.
 */
export const DEFAULT_MODEL_ID = 'moonshotai/kimi-k2.5'

/**
 * Groups the flat models list by provider for use in grouped dropdowns.
 * Returns an array of { provider, models[] } for rendering SelectGroup items.
 */
export function getModelsByProvider(): { provider: string; models: GatewayModel[] }[] {
  const grouped = new Map<string, GatewayModel[]>()
  for (const model of AI_GATEWAY_MODELS) {
    const existing = grouped.get(model.provider) || []
    existing.push(model)
    grouped.set(model.provider, existing)
  }
  return Array.from(grouped.entries()).map(([provider, models]) => ({ provider, models }))
}
