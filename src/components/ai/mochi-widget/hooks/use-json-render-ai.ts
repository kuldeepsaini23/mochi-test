'use client'

/**
 * ============================================================================
 * USE JSON RENDER AI - PASSIVE STREAMING RECEIVER
 * ============================================================================
 *
 * React hook for receiving streaming UI specs from the Mochi chat stream.
 * Follows the exact same passive receiver pattern as use-contract-ai.ts.
 *
 * Flow:
 * 1. Mochi chat stream outputs ```ui-spec code fence
 * 2. pipeContentFences() transform separates it into data-ui-spec events
 * 3. use-mochi-ai.ts emits events to the Mochi event bus
 * 4. MochiWidget listens for events and calls this hook's methods:
 *    - startReceiving() — initialize receiver state
 *    - receiveDelta(chars) — buffer characters, parse complete JSONL lines
 *    - receiveComplete() — flush buffer, finalize spec, fire onComplete
 *
 * IMPORTANT: The content fence transform emits character-by-character deltas
 * (e.g., "B", "u", "t", "t", "o", "n") NOT complete JSONL lines. This hook
 * buffers those characters into a line buffer. When a newline arrives, the
 * complete line is JSON-parsed into a patch object and applied to the spec
 * via applySpecPatch() from @json-render/core.
 *
 * NOTE: We use applySpecPatch (takes parsed patch objects) NOT
 * createSpecStreamCompiler (which expects a different streaming protocol).
 * applySpecPatch correctly builds the spec tree from RFC 6902 JSON patches.
 *
 * When the stream completes, the onComplete callback is fired with the
 * finalized Spec. The MochiWidget uses this to trigger spec-to-canvas
 * conversion and push elements to the website builder.
 *
 * SOURCE OF TRUTH KEYWORDS: useJsonRenderAI, JsonRenderHook, UISpecReceiver
 * ============================================================================
 */

import { useCallback, useRef, useState } from 'react'
import { applySpecPatch } from '@json-render/core'
import type { Spec, JsonPatch } from '@json-render/core'
import type {
  UIRenderState,
  UseJsonRenderAIOptions,
  UseJsonRenderAIResult,
} from '@/lib/ai/ui-render/types'

// ============================================================================
// INITIAL STATE
// ============================================================================

const INITIAL_STATE: UIRenderState = {
  status: 'idle',
  error: null,
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for receiving streaming json-render UI specs — passive receiver
 * from the Mochi chat stream's ```ui-spec code fences.
 *
 * Buffers character deltas into complete JSONL lines, parses each line
 * as a JSON patch, and applies it to the accumulated spec via applySpecPatch.
 *
 * @param options - Optional configuration including onComplete callback
 */
export function useJsonRenderAI(options?: UseJsonRenderAIOptions): UseJsonRenderAIResult {
  const [state, setState] = useState<UIRenderState>(INITIAL_STATE)
  const [spec, setSpec] = useState<Spec | null>(null)

  /**
   * Store onComplete in a ref to avoid stale closure issues.
   * The callback may change between renders but we always want the latest.
   */
  const onCompleteRef = useRef(options?.onComplete)
  onCompleteRef.current = options?.onComplete

  /** Ref for the per-patch callback — fires each time a JSONL line is applied */
  const onPatchAppliedRef = useRef(options?.onPatchApplied)
  onPatchAppliedRef.current = options?.onPatchApplied

  /**
   * Accumulated spec ref — built incrementally by applying patches.
   * Using a ref (not state) because we apply multiple patches per render
   * cycle and need the latest value without waiting for React batching.
   * The state `spec` is synced after each patch for UI updates.
   */
  const specRef = useRef<Record<string, unknown>>({})

  /**
   * Line buffer — accumulates character-by-character deltas from the
   * content fence transform until a newline completes a JSONL line.
   *
   * WHY: The content fence transform streams individual characters
   * (e.g., "{", '"', "o", "p") because the AI model produces token-by-token
   * output. We need complete JSON lines to parse patch objects.
   */
  const lineBufferRef = useRef('')

  /**
   * Tracks whether the AI sent valid JSONL content inside the ui-spec fence.
   * Set to true after successfully validating the first non-empty line.
   * Set to false if the first line is not JSON — meaning the AI put
   * markdown/text inside the fence instead of JSONL patches.
   *
   * WHY: Sometimes the AI wraps its entire markdown response inside a
   * ```ui-spec fence instead of outputting JSONL patches. When this happens,
   * every line fails JSON.parse and floods the console with errors. This
   * flag detects the problem on the FIRST line and silently ignores the
   * rest, preventing noise and wasted processing.
   */
  const validContentRef = useRef<boolean | null>(null)

  /**
   * Parse a complete JSONL line and apply it as a patch to the spec.
   * Each line should be a valid JSON object with { op, path, value }.
   */
  const applyLine = useCallback((line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return

    /**
     * Early-bail: If we already determined this fence contains non-JSONL
     * content (markdown, bullet points, descriptions), skip all lines
     * silently. The AI occasionally wraps its response text in a ui-spec
     * fence instead of outputting real JSONL patches.
     */
    if (validContentRef.current === false) return

    /**
     * First-line validation: Check if the first non-empty line starts
     * with '{' (the only valid start for a JSONL patch object). If it
     * doesn't, this fence contains garbage — mark as invalid and bail.
     */
    if (validContentRef.current === null) {
      if (!trimmed.startsWith('{')) {
        console.warn(
          '[JsonRenderAI] Fence contains non-JSONL content (AI sent markdown instead of patches). Ignoring fence.',
          trimmed.slice(0, 60)
        )
        validContentRef.current = false
        return
      }
      validContentRef.current = true
    }

    try {
      /** Parse the JSONL line into a patch operation object */
      const patch = JSON.parse(trimmed) as JsonPatch
      if (!patch.op || !patch.path) {
        console.warn('[JsonRenderAI] Invalid patch (missing op/path):', trimmed.slice(0, 80))
        return
      }

      /**
       * Apply the patch to the accumulated spec.
       * applySpecPatch takes the current spec and a parsed patch object,
       * returns the new spec with the patch applied.
       */
      specRef.current = applySpecPatch(specRef.current as unknown as Spec, patch) as unknown as Record<string, unknown>
      const updated = specRef.current as unknown as Spec
      setSpec(updated)

      /**
       * Fire per-patch callback for live streaming to canvas.
       * The MochiWidget uses this to convert and push each new element
       * immediately as it arrives, not waiting for the full spec.
       */
      if (onPatchAppliedRef.current) {
        onPatchAppliedRef.current(updated, patch)
      }
    } catch (err) {
      /**
       * Individual patch failures are non-fatal — skip the line and
       * continue accumulating. Common skips: empty lines, malformed JSON.
       */
      console.warn('[JsonRenderAI] Patch skipped:', trimmed.slice(0, 80), err)
    }
  }, [])

  /**
   * Start receiving a new UI spec stream.
   * Resets the spec, line buffer, and state for a fresh build.
   */
  const startReceiving = useCallback(() => {
    console.log('[JsonRenderAI] startReceiving')
    specRef.current = {}
    lineBufferRef.current = ''
    /** Reset content validation — will be checked on the first real line */
    validContentRef.current = null
    setSpec(null)
    setState({ status: 'receiving', error: null })
  }, [])

  /**
   * Receive a character delta from the content fence stream.
   *
   * Characters are accumulated in the line buffer. When a newline
   * is received, the complete line is parsed as a JSON patch and
   * applied to the spec via applySpecPatch.
   *
   * @param delta - One or more characters from the fence content
   */
  const receiveDelta = useCallback((delta: string) => {
    if (!delta) return

    for (let i = 0; i < delta.length; i++) {
      const ch = delta.charAt(i)

      if (ch === '\n') {
        /** Newline completes the current line — parse and apply */
        if (lineBufferRef.current.trim()) {
          applyLine(lineBufferRef.current)
        }
        lineBufferRef.current = ''
      } else {
        lineBufferRef.current += ch
      }
    }
  }, [applyLine])

  /**
   * Signal that the ```ui-spec code fence has closed.
   * Flushes any remaining buffered content, finalizes the spec,
   * transitions to complete status, and fires onComplete.
   */
  const receiveComplete = useCallback(() => {
    try {
      /** Flush any remaining content in the line buffer */
      if (lineBufferRef.current.trim()) {
        applyLine(lineBufferRef.current)
        lineBufferRef.current = ''
      }

      /** The accumulated spec is the final result */
      const finalSpec = specRef.current as unknown as Spec
      const hasContent = finalSpec.root && finalSpec.elements && Object.keys(finalSpec.elements).length > 0

      console.log(
        '[JsonRenderAI] receiveComplete —',
        hasContent ? `root: ${finalSpec.root}, elements: ${Object.keys(finalSpec.elements).length}` : 'EMPTY spec'
      )

      setState({ status: 'complete', error: null })
      setSpec(finalSpec)

      /** Fire onComplete to trigger spec-to-canvas conversion */
      if (hasContent && onCompleteRef.current) {
        onCompleteRef.current(finalSpec)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'UI spec processing failed'
      console.error('[JsonRenderAI] receiveComplete error:', err)
      setState({ status: 'error', error: errorMessage })
    }
  }, [applyLine])

  /** Reset state to idle and clear the spec + buffer */
  const reset = useCallback(() => {
    specRef.current = {}
    lineBufferRef.current = ''
    validContentRef.current = null
    setSpec(null)
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    spec,
    isReceiving: state.status === 'receiving',
    startReceiving,
    receiveDelta,
    receiveComplete,
    reset,
  }
}
