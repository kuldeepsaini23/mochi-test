/**
 * ============================================================================
 * AI MODULE - TOP-LEVEL BARREL EXPORTS
 * ============================================================================
 *
 * Unified export point for all AI sub-modules.
 * Prefer importing from the specific sub-module for tree-shaking:
 *   import { createAllMochiTools } from '@/lib/ai/mochi'
 *   import { getContractSystemPrompt } from '@/lib/ai/contracts'
 *   import { getContractSystemPrompt } from '@/lib/ai/contracts'
 *   import { createGatewayModel } from '@/lib/ai/gateway'
 *
 * This barrel re-exports key items from each sub-module for convenience.
 *
 * SOURCE OF TRUTH KEYWORDS: AIModuleExports, AIBarrelExport
 * ============================================================================
 */

// ============================================================================
// MOCHI AI — Core AI assistant system (tools, prompts, events)
// ============================================================================
export { createAllMochiTools, MOCHI_SYSTEM_PROMPT, MOCHI_AI_ENDPOINT } from './mochi'
export type { MochiAIEvent, MochiEventFeature, MochiEventAction } from './mochi/events'
export { emitMochiEvent, subscribeMochiEvent, useMochiEvents } from './mochi/events'

// ============================================================================
// CONTRACT AI — Contract content generation (prompts, post-processing)
// ============================================================================
export { getContractSystemPrompt, buildUserPrompt, applyMarkdownToEditor } from './contracts'
export type { ContractAIMode } from './contracts'

// ============================================================================
// GATEWAY — AI provider routing and model management
// ============================================================================
export { AI_GATEWAY_MODELS, VALID_MODEL_IDS, DEFAULT_MODEL_ID } from './gateway/models'
export type { GatewayModel } from './gateway/models'
