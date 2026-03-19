/**
 * ============================================================================
 * CONTRACT AI - BARREL EXPORTS
 * ============================================================================
 *
 * Central export point for the contract AI generation system.
 * Import from '@/lib/ai/contracts' for all contract AI functionality.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractAIExports, ContractAIModule
 * ============================================================================
 */

export {
  PROGRESSIVE_UPDATE_MS,
} from './constants'

export type {
  ContractAIStreamStatus,
  ContractAIState,
  ContractAIMode,
  UseContractAIResult,
} from './types'

export {
  getContractSystemPrompt,
  getContractInlinePrompt,
  buildUserPrompt,
} from './prompts'

export {
  applyMarkdownToEditor,
  applyProgressiveMarkdown,
  applyProgressiveAppendMarkdown,
  extractContractVars,
  ensureMarkerSeparation,
} from './post-processor'

export type {
  ContractVarExtractionResult,
} from './post-processor'
