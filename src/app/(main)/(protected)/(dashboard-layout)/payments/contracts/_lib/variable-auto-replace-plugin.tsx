'use client'

/**
 * VariableAutoReplacePlugin — Converts typed {{variable.key}} into VariableNode pills
 *
 * Registers a Lexical TextNode transform that scans every text node for
 * `{{...}}` patterns. When the content inside the braces matches a known
 * variable key (from SHARED_CATEGORIES), the text is split and the matched
 * portion is replaced with an inline VariableNode pill.
 *
 * WHY: Users may type `{{lead.lastName}}` directly instead of using the
 * slash command or header picker. This plugin makes that workflow seamless —
 * the typed text auto-converts into the visual pill the moment the closing
 * `}}` is typed.
 *
 * SOURCE OF TRUTH: SHARED_CATEGORIES from @/lib/variables/variable-categories.ts
 * Keywords: VARIABLE_AUTO_REPLACE, VARIABLE_TRANSFORM, AUTO_VARIABLE_PLUGIN
 */

import { createContext, useContext, useEffect } from 'react'
import { TextNode } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { SHARED_CATEGORIES } from '@/lib/variables/variable-categories'
import { $createVariableNode } from '@/components/editor/nodes/variable-node'

// ============================================================================
// VALID VARIABLE KEYS — Set for O(1) lookup
// ============================================================================

/**
 * Set of all known variable keys from SHARED_CATEGORIES.
 * Built once at module load. Only keys in this set get auto-replaced —
 * random text like {{notAVariable}} stays as plain text.
 */
const VALID_VARIABLE_KEYS = new Set<string>()
SHARED_CATEGORIES.forEach((category) => {
  category.variables.forEach((variable) => {
    VALID_VARIABLE_KEYS.add(variable.key)
  })
})

// ============================================================================
// CONTRACT VARIABLE KEYS CONTEXT
// ============================================================================

/**
 * Context providing additional valid variable keys for contract variables.
 * WHY: Contract variables are dynamic (user-defined), so their keys
 * can't be in the static VALID_VARIABLE_KEYS set. The contract builder
 * provides this context with keys like `contract.{id}`.
 *
 * SOURCE OF TRUTH: ContractVariableKeysContext, ContractVariableKeysProvider
 */
const ContractVariableKeysContext = createContext<Set<string>>(new Set())

/**
 * Provider for dynamic contract variable keys.
 * Wrap the editor with this to enable auto-replace for contract variables.
 */
export function ContractVariableKeysProvider({
  keys,
  children,
}: {
  keys: Set<string>
  children: React.ReactNode
}) {
  return (
    <ContractVariableKeysContext.Provider value={keys}>
      {children}
    </ContractVariableKeysContext.Provider>
  )
}

/**
 * Regex to match `{{variableKey}}` patterns in text.
 * Captures the key between the double braces (non-greedy).
 */
const VARIABLE_PATTERN = /\{\{([^{}]+?)\}\}/g

// ============================================================================
// PLUGIN COMPONENT
// ============================================================================

/**
 * VariableAutoReplacePlugin — Drop into any LexicalComposer that has
 * VariableNode registered in its node list. Runs as a TextNode transform.
 */
export function VariableAutoReplacePlugin(): null {
  const [editor] = useLexicalComposerContext()
  /** Dynamic contract variable keys from context (user-defined variables) */
  const contractKeys = useContext(ContractVariableKeysContext)

  useEffect(() => {
    /**
     * Register a transform on every TextNode mutation.
     * Lexical calls this whenever a TextNode is created or modified.
     *
     * Strategy:
     * 1. Get the text content of the node
     * 2. Find the first `{{key}}` match where `key` is a valid variable
     * 3. Split the TextNode at the match boundaries
     * 4. Replace the middle segment with a VariableNode
     * 5. Lexical re-runs the transform on remaining text nodes (handles multiple matches)
     */
    const removeTransform = editor.registerNodeTransform(TextNode, (node) => {
      const text = node.getTextContent()

      /** Reset regex lastIndex since we reuse the global regex */
      VARIABLE_PATTERN.lastIndex = 0
      const match = VARIABLE_PATTERN.exec(text)

      if (!match) return

      const variableKey = match[1]

      /** Only replace if the key matches a known static OR dynamic contract variable */
      if (!VALID_VARIABLE_KEYS.has(variableKey) && !contractKeys.has(variableKey)) return

      const matchStart = match.index
      const matchEnd = matchStart + match[0].length

      /**
       * Split strategy:
       * - If there's text BEFORE the match, splitText at matchStart gives [before, rest]
       * - Then splitText the rest at the match length gives [matchText, after]
       * - Replace the matchText node with a VariableNode
       */
      let targetNode: TextNode = node

      /** Split off text before the match */
      if (matchStart > 0) {
        ;[, targetNode] = node.splitText(matchStart)
      }

      /** Split off text after the match (relative to targetNode) */
      const matchLength = match[0].length
      const [matchTextNode] = targetNode.splitText(matchLength)

      /** Replace the matched text node with a VariableNode */
      const variableNode = $createVariableNode({ variableKey })
      matchTextNode.replace(variableNode)
    })

    return removeTransform
  }, [editor, contractKeys])

  return null
}
