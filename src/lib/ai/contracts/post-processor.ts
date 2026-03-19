/**
 * ============================================================================
 * CONTRACT AI - POST PROCESSOR
 * ============================================================================
 *
 * Converts AI-generated markdown into Lexical editor state.
 * Handles the bridge between raw markdown output and the Lexical editor:
 *
 * 1. extractContractVars() — Pre-processes markdown to extract
 *    [CONTRACT_VAR: ...] markers and replace them with {{contract.{id}}}
 *    references. Creates real ContractVariable objects for the builder.
 * 2. $convertFromMarkdownString() — Converts standard markdown to Lexical nodes
 * 3. replaceMarkerNodes() — Replaces [SIGNATURE:...] and [INPUT_FIELD:...]
 *    marker paragraphs with Lexical DecoratorNodes
 * 4. replaceContractVariableTextNodes() — Replaces {{contract.{id}}} text
 *    patterns with VariableNode pills (bypasses VariableAutoReplacePlugin
 *    for AI-generated content since the context hasn't re-rendered yet)
 * 5. VariableAutoReplacePlugin handles {{lead.*}} etc. automatically via
 *    TextNode transforms (fires after editor.update completes)
 *
 * SOURCE OF TRUTH KEYWORDS: ContractAIPostProcessor, ApplyMarkdownToEditor,
 * ContractMarkerParser, ExtractContractVars
 * ============================================================================
 */

import {
  $getRoot,
  $isElementNode,
  $isTextNode,
  TextNode,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical'
import { $convertFromMarkdownString } from '@lexical/markdown'
import { TRANSFORMERS } from '@lexical/markdown'
import {
  $createSignatureNode,
} from '@/components/editor/nodes/signature-node'
import {
  $createInputFieldNode,
  type InputFieldType,
} from '@/components/editor/nodes/input-field-node'
import { $createVariableNode } from '@/components/editor/nodes/variable-node'
import { nanoid } from 'nanoid'
import type { ContractVariable } from '@/app/(main)/(protected)/(dashboard-layout)/payments/contracts/_lib/types'

// ============================================================================
// MARKER REGEX PATTERNS
// ============================================================================

/**
 * Matches a [SIGNATURE: key="value" ...] marker on its own line.
 * Captures the attributes string for parsing.
 */
const SIGNATURE_MARKER_REGEX = /^\[SIGNATURE:\s*(.+)\]$/

/**
 * Matches a [INPUT_FIELD: key="value" ...] marker on its own line.
 * Captures the attributes string for parsing.
 */
const INPUT_FIELD_MARKER_REGEX = /^\[INPUT_FIELD:\s*(.+)\]$/

/**
 * Matches [CONTRACT_VAR: name="..." defaultValue="..."] markers in raw markdown.
 * Global flag for replacing all occurrences during pre-processing.
 */
const CONTRACT_VAR_MARKER_REGEX = /\[CONTRACT_VAR:\s*([^\]]+)\]/g

/**
 * Matches {{contract.{id}}} patterns in TextNode content.
 * Used to replace inline text with VariableNode pills in the final pass.
 */
const CONTRACT_VAR_INLINE_REGEX = /\{\{(contract\.[a-zA-Z0-9_-]+)\}\}/g

/** Valid input field types — constrains parsed values */
const VALID_FIELD_TYPES = new Set<InputFieldType>(['text', 'date', 'number', 'email'])

// ============================================================================
// ATTRIBUTE PARSER
// ============================================================================

/**
 * Parses key="value" pairs from a marker attribute string.
 * WHY: Signature, input field, and contract variable markers use a simple
 * attribute format that the AI can reliably produce and we can reliably parse.
 *
 * @example
 * parseMarkerAttributes('signerName="Client" signerRole="CEO" required=true')
 * // => { signerName: "Client", signerRole: "CEO", required: "true" }
 */
function parseMarkerAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  /** Match key="value" (quoted) or key=value (unquoted) pairs */
  const regex = /(\w+)=(?:"([^"]*)"|(\S+))/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(str)) !== null) {
    const key = match[1]
    /** Prefer quoted value (group 2), fall back to unquoted (group 3) */
    const value = match[2] ?? match[3]
    if (key && value !== undefined) {
      attrs[key] = value
    }
  }
  return attrs
}

// ============================================================================
// MARKER LINE SEPARATION (PRE-PROCESSING)
// ============================================================================

/**
 * Ensures SIGNATURE and INPUT_FIELD markers each have blank lines around them.
 *
 * WHY: In standard markdown, consecutive lines without a blank line become a
 * single paragraph. If the AI outputs:
 *   [INPUT_FIELD: label="Name" ...]
 *   [INPUT_FIELD: label="Email" ...]
 * ...markdown merges them into ONE paragraph. The replaceMarkerNodes() regex
 * requires the ENTIRE paragraph text to match a single marker, so merged
 * markers are silently ignored and render as raw text.
 *
 * This pre-processor scans raw markdown for marker lines and wraps each one
 * with blank lines, forcing the markdown parser to create separate paragraphs.
 * Multiple consecutive blank lines are harmless in markdown.
 *
 * @param markdown - Raw AI-generated markdown (before conversion)
 * @returns Markdown with blank lines guaranteed around each marker line
 */
export function ensureMarkerSeparation(markdown: string): string {
  const lines = markdown.split('\n')
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const isMarker =
      /^\[(?:SIGNATURE|INPUT_FIELD):\s*.+\]$/.test(trimmed)

    if (isMarker) {
      /** Add blank line before marker if previous line isn't blank */
      if (result.length > 0 && result[result.length - 1].trim() !== '') {
        result.push('')
      }
      result.push(lines[i])
      /** Add blank line after marker */
      result.push('')
    } else {
      result.push(lines[i])
    }
  }

  return result.join('\n')
}

// ============================================================================
// CONTRACT VARIABLE EXTRACTION (PRE-PROCESSING)
// ============================================================================

/**
 * Result of extracting contract variables from AI-generated markdown.
 */
export interface ContractVarExtractionResult {
  /** Markdown with [CONTRACT_VAR: ...] markers replaced by {{contract.{id}}} refs */
  processedMarkdown: string
  /** New ContractVariable objects to add to the builder's state */
  contractVariables: ContractVariable[]
}

/**
 * Extracts [CONTRACT_VAR: ...] markers from raw markdown and replaces them
 * with inline {{contract.{id}}} references.
 *
 * WHY: The AI can't create real contract variables — it doesn't know nanoid IDs.
 * Instead, it outputs a marker with name and defaultValue. We generate the ID,
 * create a ContractVariable object, and replace the marker with the variable
 * reference that the editor can render as a pill.
 *
 * NAME-BASED DEDUP: When `existingVariables` is provided (update/append modes),
 * markers whose name matches an existing variable REUSE that variable's ID
 * instead of creating a duplicate. This preserves variable identity across
 * AI regenerations — the same "Venue" variable keeps its ID, so any references
 * elsewhere in the contract remain valid.
 *
 * This runs BEFORE markdown → Lexical conversion because we need to modify
 * the raw text (markers → references) before $convertFromMarkdownString.
 *
 * @param markdown - Raw AI-generated markdown with potential [CONTRACT_VAR: ...] markers
 * @param existingVariables - Optional existing contract variables for name-based dedup
 * @returns processedMarkdown with markers replaced + array of new ContractVariable objects
 *
 * @example
 * extractContractVars('The venue is [CONTRACT_VAR: name="Venue" defaultValue="TBD"].')
 * // => {
 * //   processedMarkdown: 'The venue is {{contract.abc123}}.',
 * //   contractVariables: [{ id: 'abc123', name: 'Venue', value: 'TBD' }]
 * // }
 */
export function extractContractVars(
  markdown: string,
  existingVariables?: ContractVariable[]
): ContractVarExtractionResult {
  const contractVariables: ContractVariable[] = []

  /**
   * Build a name → existing variable lookup for dedup.
   * Case-insensitive matching (AI might capitalize differently).
   */
  const existingByName = new Map<string, ContractVariable>()
  if (existingVariables) {
    for (const v of existingVariables) {
      existingByName.set(v.name.toLowerCase(), v)
    }
  }

  /** Track names we've already processed in this pass to avoid self-duplication */
  const processedNames = new Map<string, string>()

  /** Replace each marker with a {{contract.{id}}} reference */
  const processedMarkdown = markdown.replace(CONTRACT_VAR_MARKER_REGEX, (_match, attrStr: string) => {
    const attrs = parseMarkerAttributes(attrStr)
    const name = attrs.name || 'Variable'
    const nameLower = name.toLowerCase()
    const value = attrs.defaultValue || ''

    /**
     * Dedup priority:
     * 1. Already processed in this pass (same AI output references same var twice)
     * 2. Existing variable with matching name (preserves ID across regenerations)
     * 3. New variable with fresh ID
     */
    let id: string

    if (processedNames.has(nameLower)) {
      /** Already created in this pass — reuse the same ID */
      id = processedNames.get(nameLower)!
    } else if (existingByName.has(nameLower)) {
      /** Matches an existing variable — reuse its ID to preserve identity */
      const existing = existingByName.get(nameLower)!
      id = existing.id
      contractVariables.push({ id, name, value: value || existing.value })
      processedNames.set(nameLower, id)
    } else {
      /** Brand new variable — generate a fresh ID */
      id = nanoid(10)
      contractVariables.push({ id, name, value })
      processedNames.set(nameLower, id)
    }

    return `{{contract.${id}}}`
  })

  return { processedMarkdown, contractVariables }
}

// ============================================================================
// MARKER REPLACEMENT (POST-CONVERSION)
// ============================================================================

/**
 * Walks all root children and replaces marker paragraphs with
 * actual contract-specific DecoratorNodes.
 *
 * WHY: The AI outputs markers like [SIGNATURE: ...] as plain text
 * paragraphs. After markdown conversion, we scan for these paragraphs
 * and replace them with proper Lexical decorator nodes that render
 * as interactive signature blocks and input fields.
 */
function replaceMarkerNodes(): void {
  const root = $getRoot()
  const children = root.getChildren()

  for (const child of children) {
    /** Only check element nodes (paragraphs, headings, etc.) that contain text */
    if (!$isElementNode(child)) continue

    const textContent = child.getTextContent().trim()
    if (!textContent) continue

    /** Check for signature marker */
    const sigMatch = textContent.match(SIGNATURE_MARKER_REGEX)
    if (sigMatch) {
      const attrs = parseMarkerAttributes(sigMatch[1])
      const signatureNode = $createSignatureNode({
        signerName: attrs.signerName || 'Signer',
        signerRole: attrs.signerRole || '',
        required: attrs.required !== 'false',
        showDate: attrs.showDate !== 'false',
      })
      child.replace(signatureNode)
      continue
    }

    /** Check for input field marker */
    const inputMatch = textContent.match(INPUT_FIELD_MARKER_REGEX)
    if (inputMatch) {
      const attrs = parseMarkerAttributes(inputMatch[1])
      const fieldType = VALID_FIELD_TYPES.has(attrs.fieldType as InputFieldType)
        ? (attrs.fieldType as InputFieldType)
        : 'text'

      const inputNode = $createInputFieldNode({
        label: attrs.label || 'Field',
        fieldType,
        placeholder: attrs.placeholder || '',
        required: attrs.required !== 'false',
      })
      child.replace(inputNode)
      continue
    }
  }
}

/**
 * Walks all TextNodes in the editor tree and replaces {{contract.{id}}}
 * patterns with VariableNode pills.
 *
 * WHY: The VariableAutoReplacePlugin relies on ContractVariableKeysContext
 * which hasn't re-rendered yet when the final pass runs. We bypass the
 * plugin entirely by directly creating VariableNode instances for
 * AI-generated contract variable references.
 *
 * @param validKeys - Set of contract variable keys (e.g., "contract.abc123")
 *   to replace. Only patterns matching these keys become pills.
 */
function replaceContractVariableTextNodes(validKeys: Set<string>): void {
  if (validKeys.size === 0) return

  const root = $getRoot()

  /**
   * Recursively collect all TextNodes from the tree.
   * WHY: We can't modify nodes while iterating children of the same parent
   * (splitText/replace changes the tree). Collecting first is safe.
   */
  const textNodes: TextNode[] = []
  function collectTextNodes(node: LexicalNode): void {
    if ($isTextNode(node)) {
      textNodes.push(node)
    } else if ($isElementNode(node)) {
      node.getChildren().forEach(collectTextNodes)
    }
  }
  root.getChildren().forEach(collectTextNodes)

  /**
   * For each TextNode, find {{contract.xxx}} patterns and replace them.
   * Strategy: find the first match, split the TextNode, replace with
   * VariableNode, and continue on the remaining text (Lexical re-runs
   * transforms on new nodes, but we do it manually here for reliability).
   */
  for (const textNode of textNodes) {
    /** Skip nodes that have been detached from the tree during prior replacements */
    if (!textNode.isAttached()) continue

    let currentNode: TextNode | null = textNode

    while (currentNode) {
      const text = currentNode.getTextContent()
      CONTRACT_VAR_INLINE_REGEX.lastIndex = 0
      const match = CONTRACT_VAR_INLINE_REGEX.exec(text)
      if (!match) break

      const variableKey = match[1]
      if (!validKeys.has(variableKey)) break

      const matchStart = match.index
      const matchEnd = matchStart + match[0].length

      /** Split off text before the match */
      let targetNode: TextNode = currentNode
      if (matchStart > 0) {
        ;[, targetNode] = currentNode.splitText(matchStart)
      }

      /** Split off text after the match */
      const matchLength = match[0].length
      const parts = targetNode.splitText(matchLength)
      const matchTextNode = parts[0]

      /** Replace matched text with a VariableNode pill */
      const variableNode = $createVariableNode({ variableKey })
      matchTextNode.replace(variableNode)

      /** Continue processing the remaining text (after the match) */
      currentNode = parts.length > 1 ? parts[1] : null
    }
  }
}

// ============================================================================
// APPEND HELPER — save/restore existing nodes around $convertFromMarkdownString
// ============================================================================

/**
 * Converts markdown to Lexical nodes, then appends them AFTER the given
 * existing children — without destroying the existing content.
 *
 * WHY: `$convertFromMarkdownString` always clears $getRoot() internally.
 * There's no "convert markdown to nodes" API that doesn't clear the tree.
 * Workaround: detach existing children first, let the conversion populate
 * root with new nodes, then re-assemble: existing + new.
 *
 * MUST be called inside editor.update().
 *
 * @param existingChildren - Children already in the root BEFORE streaming started.
 *   These are detached from root, preserved in memory, then re-attached first.
 * @param newMarkdown - New markdown to convert and append after existing content
 */
function convertAndAppendMarkdown(
  existingChildren: LexicalNode[],
  newMarkdown: string
): void {
  const root = $getRoot()

  /**
   * 1. Detach ALL current children from root (both existing and
   *    any previously-streamed content from the last progressive update).
   *    This leaves root empty for $convertFromMarkdownString.
   */
  root.clear()

  /**
   * 2. Convert new markdown — populates the now-empty root with new nodes.
   *    $convertFromMarkdownString internally clears root then adds nodes,
   *    but root is already empty so the clear is a no-op.
   */
  $convertFromMarkdownString(newMarkdown, TRANSFORMERS)

  /** 3. Save the newly-converted children */
  const newChildren = [...root.getChildren()]

  /** 4. Clear root again to rebuild in the right order */
  root.clear()

  /** 5. Re-attach existing children first (original contract content) */
  for (const child of existingChildren) {
    root.append(child)
  }

  /** 6. Append new children after existing content */
  for (const child of newChildren) {
    root.append(child)
  }
}

// ============================================================================
// MAIN EXPORTS
// ============================================================================

/**
 * Applies AI-generated markdown to a Lexical editor.
 *
 * This is the main entry point for converting AI output into editor content.
 * The function handles two modes:
 *
 * **Replace mode** (generate / update):
 * - Clears existing content, converts markdown, processes all markers
 *
 * **Append mode**:
 * - Preserves existing content, appends new converted nodes after it
 * - Uses save/restore pattern since $convertFromMarkdownString always clears root
 *
 * After conversion, both modes process:
 * - [SIGNATURE: ...] markers → SignatureNode decorators
 * - [INPUT_FIELD: ...] markers → InputFieldNode decorators
 * - {{contract.{id}}} patterns → VariableNode pills
 * - {{lead.*}} etc. handled by VariableAutoReplacePlugin after update completes
 *
 * @param editor - The Lexical editor instance
 * @param markdown - The AI-generated markdown text (pre-processed by extractContractVars)
 * @param mode - 'replace' clears existing content, 'append' adds after existing
 * @param contractVarKeys - Optional set of contract variable keys for inline replacement
 */
export function applyMarkdownToEditor(
  editor: LexicalEditor,
  markdown: string,
  mode: 'replace' | 'append',
  contractVarKeys?: Set<string>
): void {
  /**
   * Pre-process: ensure marker lines have blank lines around them.
   * This prevents markdown from merging consecutive markers into a
   * single paragraph (which would break replaceMarkerNodes() regex).
   */
  const separatedMarkdown = ensureMarkerSeparation(markdown)

  editor.update(
    () => {
      const root = $getRoot()

      if (mode === 'append') {
        /**
         * Append mode: save existing children, convert new markdown,
         * then re-assemble with existing first + new after.
         */
        const existingChildren = [...root.getChildren()]
        convertAndAppendMarkdown(existingChildren, separatedMarkdown)
      } else {
        /**
         * Replace mode: clear root and convert markdown.
         * $convertFromMarkdownString clears internally, but we clear
         * explicitly first for clarity.
         */
        root.clear()
        $convertFromMarkdownString(separatedMarkdown, TRANSFORMERS)
      }

      /**
       * Replace contract-specific marker paragraphs with decorator nodes.
       * Runs on ALL root children (existing + new for append mode).
       * [SIGNATURE: ...] → SignatureNode
       * [INPUT_FIELD: ...] → InputFieldNode
       */
      replaceMarkerNodes()

      /**
       * Replace {{contract.{id}}} text patterns with VariableNode pills.
       * WHY: The VariableAutoReplacePlugin won't catch these because the
       * ContractVariableKeysContext hasn't re-rendered yet with the new keys.
       */
      if (contractVarKeys && contractVarKeys.size > 0) {
        replaceContractVariableTextNodes(contractVarKeys)
      }
    },
    { discrete: true }
  )
}

/**
 * Applies markdown to the editor for progressive streaming updates.
 * Used in replace/update modes where the AI outputs the full document.
 *
 * WHY: During streaming, we update the editor every ~100ms with the
 * latest accumulated markdown. Processing markers mid-stream would
 * cause issues if a marker is partially streamed.
 *
 * @param editor - The Lexical editor instance
 * @param markdown - The accumulated markdown so far
 */
export function applyProgressiveMarkdown(
  editor: LexicalEditor,
  markdown: string
): void {
  const separatedMarkdown = ensureMarkerSeparation(markdown)
  editor.update(
    () => {
      $convertFromMarkdownString(separatedMarkdown, TRANSFORMERS)
    },
    { discrete: true }
  )
}

/**
 * Applies streaming markdown to the editor in APPEND mode —
 * preserves existing content and only streams new content at the end.
 *
 * On each call, the first `existingChildCount` children in the root
 * are treated as "original" content (present before streaming started).
 * They're saved, root is cleared for markdown conversion, then
 * re-assembled: original children first + newly converted nodes after.
 *
 * WHY count instead of LexicalNode[]: Lexical node objects are tied to
 * the editor.update() session that created them. Passing nodes captured
 * in one editor.update() call into another causes invalid cross-session
 * references. Using a count lets us capture the ACTUAL mutable nodes
 * inside the same editor.update() where they're used.
 *
 * @param editor - The Lexical editor instance
 * @param newMarkdown - The accumulated new markdown (not including existing content)
 * @param existingChildCount - Number of original children to preserve (captured before streaming)
 */
export function applyProgressiveAppendMarkdown(
  editor: LexicalEditor,
  newMarkdown: string,
  existingChildCount: number
): void {
  editor.update(
    () => {
      const root = $getRoot()
      const allChildren = root.getChildren()

      /**
       * Slice the first N children — these are the original contract content
       * that existed before AI streaming started. On subsequent progressive
       * updates, the root has: [original N] + [previously streamed M].
       * We only want the original N.
       */
      const existingChildren = allChildren.slice(0, existingChildCount)

      convertAndAppendMarkdown(existingChildren, ensureMarkerSeparation(newMarkdown))
    },
    { discrete: true }
  )
}

// ============================================================================
// LOAD-TIME REPAIR — Safety net for unprocessed markers
// ============================================================================

/**
 * Repairs unprocessed markers in an already-loaded Lexical editor state.
 *
 * This is a SAFETY NET that runs when the contract builder opens. It catches
 * markers that slipped through the real-time or background streaming pipeline:
 *
 * - [CONTRACT_VAR: name="..." defaultValue="..."] → VariableNode pills
 * - [SIGNATURE: signerName="..." ...] → SignatureNode decorators
 * - [INPUT_FIELD: label="..." ...] → InputFieldNode decorators
 * - {{contract.xxx}} text left unconverted → VariableNode pills
 *
 * WHY: The AI sometimes creates contract variables during streaming, and
 * the system tries to parse them in real time. If the final pass fails
 * (race condition, background mode, partial stream), markers are saved
 * as plain text in the Lexical state. This repair pass ensures they're
 * always reconstructed correctly on load.
 *
 * MUST be called inside editor.update().
 *
 * @param existingVariables - Current contract variables for name-based dedup
 * @returns Array of newly discovered ContractVariable objects to add to state
 *
 * SOURCE OF TRUTH KEYWORDS: RepairUnprocessedMarkers, ContractLoadTimeParser
 */
export function repairUnprocessedMarkers(
  existingVariables: ContractVariable[]
): ContractVariable[] {
  const discoveredVars: ContractVariable[] = []
  const root = $getRoot()

  /**
   * Build name → existing variable lookup for dedup.
   * Case-insensitive matching since the AI may capitalize differently.
   */
  const existingByName = new Map<string, ContractVariable>()
  for (const v of existingVariables) {
    existingByName.set(v.name.toLowerCase(), v)
  }

  /** Set of known variable IDs — used to validate {{contract.xxx}} orphans */
  const knownIds = new Set(existingVariables.map((v) => v.id))

  /** Track names processed in this repair pass to avoid self-duplication */
  const processedNames = new Map<string, string>()

  // ================================================================
  // Phase 1: Block-level SIGNATURE and INPUT_FIELD markers
  // ================================================================
  // These markers should be entire paragraphs — if the trimmed text
  // of an ElementNode matches the marker regex, replace the element
  // with the proper DecoratorNode.

  const children = root.getChildren()
  for (const child of children) {
    if (!$isElementNode(child)) continue
    const textContent = child.getTextContent().trim()
    if (!textContent) continue

    /** Check for unprocessed [SIGNATURE: ...] marker */
    const sigMatch = textContent.match(SIGNATURE_MARKER_REGEX)
    if (sigMatch) {
      const attrs = parseMarkerAttributes(sigMatch[1])
      const signatureNode = $createSignatureNode({
        signerName: attrs.signerName || 'Signer',
        signerRole: attrs.signerRole || '',
        required: attrs.required !== 'false',
        showDate: attrs.showDate !== 'false',
      })
      child.replace(signatureNode)
      continue
    }

    /** Check for unprocessed [INPUT_FIELD: ...] marker */
    const inputMatch = textContent.match(INPUT_FIELD_MARKER_REGEX)
    if (inputMatch) {
      const attrs = parseMarkerAttributes(inputMatch[1])
      const fieldType = VALID_FIELD_TYPES.has(attrs.fieldType as InputFieldType)
        ? (attrs.fieldType as InputFieldType)
        : 'text'
      const inputNode = $createInputFieldNode({
        label: attrs.label || 'Field',
        fieldType,
        placeholder: attrs.placeholder || '',
        required: attrs.required !== 'false',
      })
      child.replace(inputNode)
      continue
    }
  }

  // ================================================================
  // Phase 2: Inline markers in TextNodes
  // ================================================================
  // Handles two types:
  // A) [CONTRACT_VAR: name="..." defaultValue="..."] — full markers
  //    that were never extracted by extractContractVars()
  // B) {{contract.xxx}} — patterns that were extracted (step 1 of
  //    pipeline worked) but never converted to VariableNode pills
  //    (step 2 failed)

  /** Collect all TextNodes first — tree structure changes during replacement */
  const textNodes: TextNode[] = []
  function collectTextNodes(node: LexicalNode): void {
    if ($isTextNode(node)) {
      textNodes.push(node)
    } else if ($isElementNode(node)) {
      node.getChildren().forEach(collectTextNodes)
    }
  }
  root.getChildren().forEach(collectTextNodes)

  for (const textNode of textNodes) {
    if (!textNode.isAttached()) continue

    let currentNode: TextNode | null = textNode

    while (currentNode && currentNode.isAttached()) {
      const text = currentNode.getTextContent()

      // -----------------------------------------------------------
      // A) Check for full [CONTRACT_VAR: ...] markers first
      // -----------------------------------------------------------
      CONTRACT_VAR_MARKER_REGEX.lastIndex = 0
      const varMatch = CONTRACT_VAR_MARKER_REGEX.exec(text)

      if (varMatch) {
        const attrs = parseMarkerAttributes(varMatch[1])
        const name = attrs.name || 'Variable'
        const nameLower = name.toLowerCase()
        const value = attrs.defaultValue || ''

        /**
         * Dedup priority (same as extractContractVars):
         * 1. Already processed in this repair pass → reuse ID
         * 2. Existing variable with matching name → reuse its ID
         * 3. Brand new → generate fresh ID and add to discovered
         */
        let id: string

        if (processedNames.has(nameLower)) {
          id = processedNames.get(nameLower)!
        } else if (existingByName.has(nameLower)) {
          id = existingByName.get(nameLower)!.id
          processedNames.set(nameLower, id)
        } else {
          id = nanoid(10)
          discoveredVars.push({ id, name, value })
          processedNames.set(nameLower, id)
          knownIds.add(id)
        }

        const variableKey = `contract.${id}`
        const matchStart = varMatch.index
        const matchLength = varMatch[0].length

        /** Split the TextNode around the marker and replace with VariableNode */
        let targetNode: TextNode = currentNode
        if (matchStart > 0) {
          ;[, targetNode] = currentNode.splitText(matchStart)
        }
        const parts = targetNode.splitText(matchLength)
        parts[0].replace($createVariableNode({ variableKey }))

        /** Continue processing remaining text after the replaced marker */
        currentNode = parts.length > 1 ? parts[1] : null
        continue
      }

      // -----------------------------------------------------------
      // B) Check for orphaned {{contract.xxx}} patterns
      // -----------------------------------------------------------
      CONTRACT_VAR_INLINE_REGEX.lastIndex = 0
      const inlineMatch = CONTRACT_VAR_INLINE_REGEX.exec(text)

      if (inlineMatch) {
        const variableKey = inlineMatch[1]
        const varId = variableKey.replace('contract.', '')

        /**
         * Only convert if we recognize this variable ID — either from
         * the existing variables array or discovered earlier in this pass.
         * Avoids creating pills for random {{contract.garbage}} text.
         */
        if (knownIds.has(varId)) {
          const matchStart = inlineMatch.index
          const matchLength = inlineMatch[0].length

          let targetNode: TextNode = currentNode
          if (matchStart > 0) {
            ;[, targetNode] = currentNode.splitText(matchStart)
          }
          const parts = targetNode.splitText(matchLength)
          parts[0].replace($createVariableNode({ variableKey }))

          currentNode = parts.length > 1 ? parts[1] : null
          continue
        }
      }

      /** No more patterns found in this TextNode — move to next */
      break
    }
  }

  return discoveredVars
}
