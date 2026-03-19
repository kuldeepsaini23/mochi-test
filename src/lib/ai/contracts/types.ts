/**
 * ============================================================================
 * CONTRACT AI - TYPE DEFINITIONS
 * ============================================================================
 *
 * Type definitions for the AI-powered contract content generation system.
 * Covers streaming state, generation modes, and hook return types.
 *
 * With the modular stream architecture, contract content streams INLINE
 * through the Mochi chat stream (via ```contract code fences). The hook
 * is now a PASSIVE RECEIVER — it receives chunks from the event bus
 * instead of fetching from a dedicated endpoint.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractAITypes, ContractAIStreamState,
 * ContractAIMode, UseContractAIResult
 * ============================================================================
 */

// ============================================================================
// STREAMING STATE
// ============================================================================

/**
 * Status of the contract AI content receiver.
 *
 * - idle: No generation in progress
 * - streaming: Receiving markdown chunks from the chat stream fence
 * - processing: Fence closed, converting final markdown to Lexical state
 * - complete: Content applied to editor successfully
 * - error: Processing failed
 * - aborted: User cancelled / stream interrupted
 */
export type ContractAIStreamStatus =
  | 'idle'
  | 'streaming'
  | 'processing'
  | 'complete'
  | 'error'
  | 'aborted'

/**
 * State managed by the useContractAI hook.
 * Tracks the current status, any error, and accumulated markdown.
 */
export interface ContractAIState {
  /** Current streaming status */
  status: ContractAIStreamStatus
  /** Error message if status is 'error' */
  error: string | null
  /** Accumulated markdown text received so far (for preview) */
  streamedMarkdown: string
}

// ============================================================================
// GENERATION MODES
// ============================================================================

/**
 * Determines how AI-generated content interacts with existing editor content.
 *
 * - generate: Create a full contract from scratch (replaces existing content)
 * - update: Rewrite/modify existing content based on instructions
 * - append: Add a new section to the end of existing content
 */
export type ContractAIMode = 'generate' | 'update' | 'append'

// ============================================================================
// HOOK RETURN TYPE
// ============================================================================

/**
 * Return type of the useContractAI hook.
 *
 * The hook is a PASSIVE RECEIVER — it does not fetch from any endpoint.
 * Instead, the contract builder's event listener calls these methods
 * when receiving data-contract events from the Mochi chat stream.
 */
export interface UseContractAIResult {
  /** Current state of the AI content receiver */
  state: ContractAIState
  /**
   * Start receiving content from a ```contract code fence in the chat stream.
   * Initializes state and prepares the editor for streaming content.
   * @param mode - How to apply content: 'generate' (replace), 'update' (replace), 'append' (add to end)
   */
  startReceiving: (mode: ContractAIMode) => void
  /**
   * Receive a streaming markdown chunk from the chat stream.
   * Accumulates markdown and schedules throttled progressive editor updates.
   * @param delta - The markdown text chunk to append
   */
  receiveChunk: (delta: string) => void
  /**
   * Signal that the ```contract code fence has closed — do final processing.
   * Extracts contract variables, applies full markdown with marker replacement,
   * and fires the onComplete callback.
   */
  receiveComplete: () => void
  /** Abort the current generation (clears throttle timer, resets state) */
  abort: () => void
  /** Reset state to idle */
  reset: () => void
}
