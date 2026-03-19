'use client'

/**
 * ============================================================================
 * CONTRACT LOAD PARSER PLUGIN — Load-Time Safety Net
 * ============================================================================
 *
 * A Lexical plugin that runs ONCE when the contract builder opens.
 * Scans the loaded editor state for unprocessed markers that slipped
 * through the real-time or background streaming pipeline and converts
 * them into proper Lexical nodes.
 *
 * Catches:
 * - [CONTRACT_VAR: name="..." defaultValue="..."] → VariableNode pills
 * - [SIGNATURE: signerName="..." ...] → SignatureNode decorators
 * - [INPUT_FIELD: label="..." ...] → InputFieldNode decorators
 * - {{contract.xxx}} orphaned text → VariableNode pills
 *
 * WHY: The AI sometimes creates contract variables during streaming, and
 * the system tries to parse them in real time. If the final pass fails
 * (race condition, background mode, partial stream), markers are saved
 * as plain text in the Lexical state. This plugin ensures they're always
 * reconstructed correctly when the contract builder loads.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractLoadParserPlugin, LoadTimeParser
 * ============================================================================
 */

import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { repairUnprocessedMarkers } from '@/lib/ai/contracts/post-processor'
import type { ContractVariable } from './types'

/**
 * Props for the ContractLoadParserPlugin.
 */
interface ContractLoadParserPluginProps {
  /** Current contract variables — used for name-based dedup during repair */
  contractVariables: ContractVariable[]
  /**
   * Callback fired when the parser discovers new variables from unprocessed
   * [CONTRACT_VAR: ...] markers. The parent should merge these into state
   * and trigger a save so they're persisted.
   */
  onVariablesDiscovered: (variables: ContractVariable[]) => void
}

/**
 * ContractLoadParserPlugin — Runs once on mount to repair broken markers.
 *
 * Uses a ref guard to ensure the repair pass runs exactly once per mount,
 * even if React strict mode double-fires the effect. The repair function
 * runs inside editor.update() so it has full access to the Lexical tree.
 *
 * @example
 * ```tsx
 * <ContractLoadParserPlugin
 *   contractVariables={contractVariables}
 *   onVariablesDiscovered={handleBatchAddVariables}
 * />
 * ```
 */
export function ContractLoadParserPlugin({
  contractVariables,
  onVariablesDiscovered,
}: ContractLoadParserPluginProps): null {
  const [editor] = useLexicalComposerContext()

  /** Guard: ensure the repair pass runs exactly once per mount */
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true

    /**
     * Small delay to ensure Lexical has fully hydrated the editor state
     * from the initial config. The editorState callback in initialConfig
     * runs synchronously, but node transforms (VariableAutoReplacePlugin)
     * may fire in the next microtask. We wait one frame to avoid racing
     * with the auto-replace plugin.
     */
    requestAnimationFrame(() => {
      editor.update(
        () => {
          const discovered = repairUnprocessedMarkers(contractVariables)

          if (discovered.length > 0) {
            /**
             * Schedule the callback outside the editor.update() to avoid
             * triggering React state updates during a Lexical update
             * (which would cause "Cannot update during render" warnings).
             */
            setTimeout(() => {
              onVariablesDiscovered(discovered)
            }, 0)
          }
        },
        { discrete: true }
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
