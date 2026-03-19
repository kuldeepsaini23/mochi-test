/**
 * ============================================================================
 * MOCHI AI - MODULE EXPORTS
 * ============================================================================
 *
 * Central export point for the Mochi AI streaming chat system.
 * Import from '@/lib/ai/mochi' for all Mochi AI functionality.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiAIModule, MochiAIExports
 * ============================================================================
 */

// Types
export type {
  MochiAIStatus,
  MochiAIState,
  MochiToolCallStatus,
  MochiToolCall,
  MochiMessage,
  MochiHumanInput,
  UseMochiAIResult,
} from './types'

// Constants
export {
  MOCHI_AI_ENDPOINT,
  MAX_PROMPT_LENGTH,
  MAX_STEPS,
  GENERATION_TIMEOUT_MS,
  MOCHI_ERROR_CODES,
} from './constants'

// Prompts
export { MOCHI_SYSTEM_PROMPT } from './prompts'

// Tools
export { createAllMochiTools } from './tools'
