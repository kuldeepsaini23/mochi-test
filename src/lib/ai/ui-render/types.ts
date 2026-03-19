/**
 * ============================================================================
 * UI RENDER - TYPE DEFINITIONS
 * ============================================================================
 *
 * Types for the json-render UI generation pipeline.
 * Used by the catalog, receiver hook, render panel, and spec-to-canvas converter.
 *
 * SOURCE OF TRUTH KEYWORDS: UIRenderTypes, JsonRenderSpec, UIRenderState
 * ============================================================================
 */

import type { Spec } from '@json-render/core'

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * Status of the json-render streaming receiver.
 *
 * Flow: idle -> receiving -> processing -> complete
 * Error path: any -> error
 */
export type UIRenderStatus =
  | 'idle'
  | 'receiving'
  | 'processing'
  | 'complete'
  | 'error'

/**
 * State for the useJsonRenderAI hook.
 *
 * SOURCE OF TRUTH KEYWORDS: UIRenderState
 */
export interface UIRenderState {
  /** Current receiver status */
  status: UIRenderStatus
  /** Error message if status is 'error' */
  error: string | null
}

// ============================================================================
// HOOK TYPES
// ============================================================================

/**
 * Options for the useJsonRenderAI hook.
 *
 * SOURCE OF TRUTH KEYWORDS: UseJsonRenderAIOptions
 */
export interface UseJsonRenderAIOptions {
  /**
   * Callback fired when the UI spec stream completes with a finalized Spec.
   * Used for any final cleanup after all elements have been streamed.
   */
  onComplete?: (spec: Spec) => void

  /**
   * Callback fired each time a new JSONL patch line is applied to the spec.
   * Receives the full accumulated spec after this patch was applied, plus
   * the raw patch that was just applied (so the caller can extract the
   * newly added element and push it to the canvas immediately).
   *
   * This enables LIVE STREAMING — elements appear on the canvas as
   * the AI generates them, not waiting for the full spec to complete.
   */
  onPatchApplied?: (spec: Spec, patch: { op: string; path: string; value?: unknown }) => void
}

/**
 * Return type for the useJsonRenderAI hook — passive receiver pattern.
 *
 * SOURCE OF TRUTH KEYWORDS: UseJsonRenderAIResult
 */
export interface UseJsonRenderAIResult {
  /** Current receiver state */
  state: UIRenderState
  /** The accumulated json-render spec (null when idle) */
  spec: Spec | null
  /** Whether the receiver is actively receiving patches */
  isReceiving: boolean
  /** Start receiving a new UI spec stream */
  startReceiving: () => void
  /** Receive character delta(s) from the content fence stream */
  receiveDelta: (delta: string) => void
  /** Signal that the ui-spec fence has closed */
  receiveComplete: () => void
  /** Reset state to idle */
  reset: () => void
}
