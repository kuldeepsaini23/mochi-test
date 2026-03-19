/**
 * ============================================================================
 * AI STREAM UTILITIES - MODULE EXPORTS
 * ============================================================================
 *
 * Modular stream transforms for the Mochi AI streaming pipeline.
 * Each transform detects feature-specific code fences and separates
 * content from chat text.
 *
 * SOURCE OF TRUTH KEYWORDS: AIStreamModule, StreamTransformExports
 * ============================================================================
 */

export {
  createContentFenceTransform,
  pipeContentFences,
  pipeContractContent,
} from './content-fence-transform'
export type { ContentFenceConfig } from './content-fence-transform'
export {
  registerStrategy,
  getAllFenceNames,
  getActivePromptExtensions,
} from './execution-strategies'
export type { ExecutionStrategy } from './execution-strategies'
