'use client'

/**
 * ============================================================================
 * USE CONTRACT AI - PASSIVE STREAMING RECEIVER
 * ============================================================================
 *
 * React hook for AI-powered contract content generation with realtime
 * streaming into a Lexical editor. Receives markdown chunks from the
 * Mochi chat stream's ```contract code fences via the event bus.
 *
 * This is a PASSIVE RECEIVER — it does NOT fetch from any endpoint.
 * The flow is:
 * 1. Mochi chat stream outputs ```contract:{mode} fence
 * 2. pipeContractContent() transform separates it into data-contract events
 * 3. use-mochi-ai.ts emits events to the Mochi event bus
 * 4. Contract builder listens for events and calls this hook's methods:
 *    - startReceiving(mode) — initializes state for the stream
 *    - receiveChunk(delta) — accumulates markdown, progressive editor updates
 *    - receiveComplete() — final pass with marker processing
 *
 * Progressive rendering: The editor updates every ~100ms during streaming
 * via $convertFromMarkdownString with `discrete: true`, giving a live
 * "typewriter" effect as the AI generates content. The first chunk fires
 * immediately (no throttle delay). Markers (signatures, input fields) are
 * only processed in the final pass to avoid partial-marker issues.
 *
 * SOURCE OF TRUTH KEYWORDS: useContractAI, ContractAIHook, ContractStreaming
 * ============================================================================
 */

import { useCallback, useRef, useState } from 'react'
import { $getRoot, type LexicalEditor } from 'lexical'

import { PROGRESSIVE_UPDATE_MS } from '@/lib/ai/contracts/constants'
import type {
  ContractAIState,
  ContractAIMode,
  UseContractAIResult,
} from '@/lib/ai/contracts/types'
import {
  applyMarkdownToEditor,
  applyProgressiveMarkdown,
  applyProgressiveAppendMarkdown,
  extractContractVars,
} from '@/lib/ai/contracts/post-processor'
import type { ContractVariable } from '../_lib/types'
import { variableRegistry } from '@/lib/ai/variables'

// ============================================================================
// INITIAL STATE
// ============================================================================

const INITIAL_STATE: ContractAIState = {
  status: 'idle',
  error: null,
  streamedMarkdown: '',
}

// ============================================================================
// HOOK OPTIONS
// ============================================================================

interface UseContractAIOptions {
  /** The Lexical editor instance to stream content into */
  editor: LexicalEditor | null
  /** Organization ID for API authorization */
  organizationId: string
  /** Contract ID being edited */
  contractId: string
  /**
   * Existing contract variables — passed to the post-processor for
   * name-based dedup (reuses IDs instead of creating duplicates).
   */
  contractVariables?: ContractVariable[]
  /** Callback fired when generation completes successfully */
  onComplete?: () => void
  /** Callback fired when generation fails */
  onError?: (error: string) => void
  /**
   * Callback fired when AI generates [CONTRACT_VAR: ...] markers.
   * Receives the extracted ContractVariable objects to merge into
   * the builder's state. Called during the final pass, BEFORE the
   * markdown is applied to the editor.
   */
  onVariablesCreated?: (variables: ContractVariable[]) => void
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for AI-powered contract content — passive receiver from Mochi chat stream.
 *
 * @example
 * ```tsx
 * const contractAI = useContractAI({
 *   editor,
 *   organizationId,
 *   contractId,
 *   onComplete: () => toast.success('Contract generated!'),
 * })
 *
 * // Called by the contract builder's event listener:
 * contractAI.startReceiving('generate')
 * contractAI.receiveChunk('# Service Agreement\n...')
 * contractAI.receiveComplete()
 * ```
 */
export function useContractAI(options: UseContractAIOptions): UseContractAIResult {
  const { editor, contractVariables, onComplete, onError, onVariablesCreated } = options

  const [state, setState] = useState<ContractAIState>(INITIAL_STATE)

  /** Accumulated markdown ref — updated on each chunk without re-renders */
  const markdownRef = useRef<string>('')

  /** Throttle timer ref for progressive editor updates */
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Tracks whether we've applied the very first progressive update (no delay for first) */
  const firstUpdateAppliedRef = useRef(false)

  /**
   * Current generation mode — used by progressive update to decide whether
   * to use replace-all or append-preserving behavior.
   */
  const currentModeRef = useRef<ContractAIMode>('generate')

  /**
   * Count of existing root children BEFORE streaming starts (append mode only).
   * Used to identify which children in the root are "original" vs "streamed".
   *
   * WHY count instead of LexicalNode[]: Lexical node objects are tied to the
   * editor.update() session that created them. Storing node references from
   * one update and passing them to another causes invalid cross-session refs.
   * A count is session-independent — we capture actual nodes INSIDE the same
   * editor.update() call where they're used (in applyProgressiveAppendMarkdown).
   */
  const existingChildCountRef = useRef<number>(0)

  /**
   * Applies accumulated markdown to the editor immediately.
   * Called by the throttle timer and the first-chunk fast path.
   *
   * Branches on mode:
   * - generate/update: Replace entire editor content (AI outputs full document)
   * - append: Preserve existing content, stream new content at the end
   */
  const applyCurrentMarkdown = useCallback(() => {
    const currentMarkdown = markdownRef.current
    if (!currentMarkdown || !editor) return

    try {
      if (currentModeRef.current === 'append') {
        /**
         * Append mode: pass the count of original children so the
         * progressive updater knows which children to preserve.
         */
        applyProgressiveAppendMarkdown(editor, currentMarkdown, existingChildCountRef.current)
      } else {
        /** Generate/update mode: replace entire editor with streamed content */
        applyProgressiveMarkdown(editor, currentMarkdown)
      }
    } catch (err) {
      /**
       * Progressive updates are best-effort — partial markdown may
       * cause conversion issues. The final pass will fix everything.
       */
      console.warn('[Contract AI] Progressive update skipped:', err)
    }
  }, [editor])

  /**
   * Throttled progressive update: converts accumulated markdown to Lexical
   * state at regular intervals during streaming. Skips marker processing
   * since markers might be partially streamed.
   *
   * The FIRST update fires immediately (no delay) so the user sees content
   * appear as soon as the first chunk arrives. Subsequent updates are throttled.
   */
  const scheduleProgressiveUpdate = useCallback(() => {
    if (!editor) return

    /**
     * Fast path: apply the first update immediately so users see content
     * appear right away instead of waiting for the throttle delay.
     */
    if (!firstUpdateAppliedRef.current) {
      firstUpdateAppliedRef.current = true
      applyCurrentMarkdown()
      return
    }

    /** Throttle subsequent updates to avoid excessive DOM thrashing */
    if (throttleTimerRef.current) return

    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null
      applyCurrentMarkdown()
    }, PROGRESSIVE_UPDATE_MS)
  }, [editor, applyCurrentMarkdown])

  /**
   * Start receiving content from a ```contract code fence in the chat stream.
   * Initializes state and prepares the editor for streaming content.
   */
  const startReceiving = useCallback(
    (mode: ContractAIMode) => {
      /** Reset accumulated markdown and first-update flag */
      markdownRef.current = ''
      firstUpdateAppliedRef.current = false
      currentModeRef.current = mode
      existingChildCountRef.current = 0

      /**
       * For append mode: capture the current child count so progressive
       * updates know which children to preserve vs replace.
       */
      if (editor && mode === 'append') {
        editor.getEditorState().read(() => {
          existingChildCountRef.current = $getRoot().getChildrenSize()
        })
      }

      /** Update state to streaming */
      setState({
        status: 'streaming',
        error: null,
        streamedMarkdown: '',
      })
    },
    [editor]
  )

  /**
   * Receive a streaming markdown chunk from the chat stream.
   * Accumulates markdown and schedules throttled progressive editor updates.
   */
  const receiveChunk = useCallback(
    (delta: string) => {
      /** Accumulate the markdown text */
      markdownRef.current += delta

      /** Update state with latest markdown (for preview display) */
      setState((prev) => ({
        ...prev,
        streamedMarkdown: markdownRef.current,
      }))

      /** Schedule a throttled progressive editor update */
      scheduleProgressiveUpdate()
    },
    [scheduleProgressiveUpdate]
  )

  /**
   * Signal that the ```contract code fence has closed — do final processing.
   * Extracts contract variables from markers, applies full markdown with
   * marker replacement, and fires the onComplete callback.
   */
  const receiveComplete = useCallback(() => {
    /** Clear any pending throttled update */
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current)
      throttleTimerRef.current = null
    }

    /** Update state to processing (final conversion) */
    setState((prev) => ({ ...prev, status: 'processing' }))

    /**
     * Final pass: extract contract variables from markers, then apply
     * the processed markdown with full marker + variable processing.
     *
     * Flow:
     * 1. extractContractVars() finds [CONTRACT_VAR: ...] markers in raw markdown,
     *    replaces them with {{contract.{id}}} references, returns new variables
     * 2. onVariablesCreated() merges new variables into the builder's state
     * 3. applyMarkdownToEditor() converts markdown → Lexical, processes
     *    SIGNATURE/INPUT_FIELD markers, and replaces {{contract.{id}}}
     *    text nodes with VariableNode pills
     */
    const finalMarkdown = markdownRef.current

    console.log(`[ContractAI] receiveComplete — editor: ${!!editor}, markdown length: ${finalMarkdown.length}, existing vars: ${contractVariables?.length ?? 0}`)

    /**
     * Two-phase processing: variable extraction is CRITICAL (must always
     * trigger onComplete → deferred save), while editor application is
     * best-effort (failures shouldn't prevent variable persistence).
     *
     * WHY: If applyMarkdownToEditor throws (e.g., Lexical flushSync conflict
     * in background mode), the old single try-catch prevented onComplete()
     * from firing → deferred save never triggered → variables were added to
     * React state but never persisted to DB → next refetch overwrites with
     * stale data → variables lost.
     */
    let extractedVars: ContractVariable[] = []
    let processedMarkdown = finalMarkdown

    try {
      if (editor && finalMarkdown.trim()) {
        /**
         * Phase 1: Extract contract variables from [CONTRACT_VAR: ...] markers.
         * Pass existing variables for name-based dedup — if the AI re-references
         * an existing variable by name, we reuse its ID instead of creating a duplicate.
         */
        const extracted = extractContractVars(finalMarkdown, contractVariables)
        processedMarkdown = extracted.processedMarkdown
        extractedVars = extracted.contractVariables

        console.log(`[ContractAI] extractContractVars — found ${extractedVars.length} vars:`, extractedVars.map(v => v.name))

        /** Notify parent to add new variables to state (for future editing sessions) */
        if (extractedVars.length > 0) {
          onVariablesCreated?.(extractedVars)

          /**
           * Register new variables in the global registry so subscribers
           * (e.g., the Variables sidebar) auto-update without prop drilling.
           */
          variableRegistry.register(
            'contract',
            extractedVars.map((v) => ({
              id: v.id,
              feature: 'contract',
              name: v.name,
              value: v.value,
              key: `contract.${v.id}`,
            }))
          )
        }
      } else {
        console.warn(`[ContractAI] receiveComplete SKIPPED — editor: ${!!editor}, markdown empty: ${!finalMarkdown.trim()}`)
      }
    } catch (error) {
      console.error('[ContractAI] Variable extraction FAILED:', error)
    }

    /**
     * Phase 2: Apply processed markdown to the Lexical editor.
     * Separated so that editor failures don't block variable persistence.
     */
    try {
      if (editor && processedMarkdown.trim()) {
        const contractVarKeys = new Set(extractedVars.map((v) => `contract.${v.id}`))
        const applyMode = currentModeRef.current === 'append' ? 'append' : 'replace'
        console.log(`[ContractAI] Applying to editor — mode: ${applyMode}, varKeys: ${contractVarKeys.size}`)
        applyMarkdownToEditor(editor, processedMarkdown, applyMode, contractVarKeys)
        console.log('[ContractAI] applyMarkdownToEditor completed successfully')
      }
    } catch (error) {
      /**
       * Editor application failed — content may render with raw markers.
       * The ContractLoadParserPlugin will repair these on next load.
       * Variables were already extracted and notified in Phase 1.
       */
      console.error('[ContractAI] applyMarkdownToEditor FAILED (vars still saved):', error)
    }

    /** Done — update state to complete and ALWAYS fire onComplete for deferred save */
    setState((prev) => ({
      ...prev,
      status: 'complete',
      streamedMarkdown: finalMarkdown,
    }))

    console.log('[ContractAI] Calling onComplete callback')
    onComplete?.()
  }, [editor, contractVariables, onComplete, onError, onVariablesCreated])

  /** Abort the current generation — clears throttle timer and resets state */
  const abort = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current)
      throttleTimerRef.current = null
    }
    setState((prev) => ({
      ...prev,
      status: 'aborted',
      error: null,
    }))
  }, [])

  /** Reset state to idle */
  const reset = useCallback(() => {
    abort()
    markdownRef.current = ''
    firstUpdateAppliedRef.current = false
    currentModeRef.current = 'generate'
    existingChildCountRef.current = 0
    setState(INITIAL_STATE)
  }, [abort])

  return { state, startReceiving, receiveChunk, receiveComplete, abort, reset }
}
