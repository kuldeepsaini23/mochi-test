'use client'

/**
 * VariableNode - Lexical Inline DecoratorNode for template variables
 *
 * Renders a `{{variable.key}}` pattern as a styled inline pill within the
 * editor. Variables are rendered with a human-readable label (e.g., "First Name")
 * instead of the raw key (e.g., "lead.firstName").
 *
 * When exported to DOM/HTML, the node outputs `{{variable.key}}` text so
 * the server-side interpolation engine can process it.
 *
 * Insertion points:
 * - Slash command: `/variable` or `/first name`, etc.
 * - Header button: Reuses the VariablePicker from the email builder
 *
 * SOURCE OF TRUTH: SHARED_CATEGORIES from @/lib/variables/variable-categories.ts
 * Keywords: VARIABLE_NODE, TEMPLATE_VARIABLE, LEXICAL_VARIABLE, CONTRACT_VARIABLE
 */

import type { JSX } from 'react'
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'
import { SHARED_CATEGORIES } from '@/lib/variables/variable-categories'

// ============================================================================
// VARIABLE LABEL LOOKUP
// ============================================================================

/**
 * Map from variable key to human-readable label.
 * Built once from SHARED_CATEGORIES at module load.
 * WHY: Avoids scanning the categories array on every render.
 */
const VARIABLE_LABEL_MAP = new Map<string, string>()
SHARED_CATEGORIES.forEach((category) => {
  category.variables.forEach((variable) => {
    VARIABLE_LABEL_MAP.set(variable.key, variable.label)
  })
})

/**
 * Look up the human-readable label for a variable key.
 * Falls back to the last segment of the key (e.g., "firstName" from "lead.firstName").
 */
export function getVariableLabel(key: string): string {
  return VARIABLE_LABEL_MAP.get(key) || key.split('.').pop() || key
}

// ============================================================================
// CONTRACT VARIABLE LABEL CONTEXT
// ============================================================================

/**
 * Context for dynamic variable label resolution.
 * WHY: Contract variables are user-defined at runtime, so their labels
 * can't be in the static VARIABLE_LABEL_MAP. This context provides
 * an additional Map<string, string> (variableKey → label) that
 * VariableComponent checks FIRST before falling back to the static map.
 *
 * In the contract builder, the provider is populated with
 * `contract.{id}` → variable name mappings.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractVariableLabelContext, ContractVariableLabelProvider
 */
const ContractVariableLabelContext = createContext<Map<string, string>>(new Map())

/**
 * Provider for dynamic variable labels (name display).
 * Wrap any editor that uses contract variables with this provider.
 */
export function ContractVariableLabelProvider({
  labels,
  children,
}: {
  labels: Map<string, string>
  children: React.ReactNode
}) {
  return (
    <ContractVariableLabelContext.Provider value={labels}>
      {children}
    </ContractVariableLabelContext.Provider>
  )
}

/**
 * Context for contract variable VALUE display.
 * WHY: Contract variable pills show the interpolated VALUE (e.g., "John Doe")
 * instead of the variable name, so users see what will actually render.
 * Falls back to the name if value is empty.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractVariableValueContext, ContractVariableValueProvider
 */
const ContractVariableValueContext = createContext<Map<string, string>>(new Map())

/**
 * Provider for contract variable values.
 * Wrap any editor that uses contract variables with this provider.
 */
export function ContractVariableValueProvider({
  values,
  children,
}: {
  values: Map<string, string>
  children: React.ReactNode
}) {
  return (
    <ContractVariableValueContext.Provider value={values}>
      {children}
    </ContractVariableValueContext.Provider>
  )
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Serialized format for VariableNode.
 * Only stores the variable key — the label is looked up at render time.
 */
export type SerializedVariableNode = Spread<
  { variableKey: string },
  SerializedLexicalNode
>

// ============================================================================
// VARIABLE NODE CLASS
// ============================================================================

/**
 * VariableNode — Inline decorator node for template variables.
 * WHY: DecoratorNode with isInline=true renders a React component (pill)
 *      inline within text, like a mention or hashtag.
 */
export class VariableNode extends DecoratorNode<JSX.Element> {
  __variableKey: string

  static getType(): string {
    return 'variable'
  }

  static clone(node: VariableNode): VariableNode {
    return new VariableNode(node.__variableKey, node.__key)
  }

  constructor(variableKey: string, key?: NodeKey) {
    super(key)
    this.__variableKey = variableKey
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  static importJSON(serializedNode: SerializedVariableNode): VariableNode {
    return $createVariableNode({ variableKey: serializedNode.variableKey })
  }

  exportJSON(): SerializedVariableNode {
    return {
      type: 'variable',
      version: 1,
      variableKey: this.__variableKey,
    }
  }

  /**
   * Export to DOM as {{variable.key}} text.
   * WHY: When the contract content is converted to HTML for rendering/sending,
   * variables become text patterns that the interpolation engine can process.
   */
  exportDOM(): DOMExportOutput {
    const span = document.createElement('span')
    span.textContent = `{{${this.__variableKey}}}`
    return { element: span }
  }

  // ============================================================================
  // DOM HANDLING
  // ============================================================================

  createDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'editor-variable'
    return span
  }

  updateDOM(): false {
    return false
  }

  /**
   * Mark as inline so the node sits within text content (not as a block).
   * WHY: Variables appear within paragraphs alongside regular text.
   */
  isInline(): boolean {
    return true
  }

  // ============================================================================
  // GETTERS / SETTERS
  // ============================================================================

  getVariableKey(): string {
    return this.getLatest().__variableKey
  }

  setVariableKey(variableKey: string): void {
    const writable = this.getWritable()
    writable.__variableKey = variableKey
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  decorate(): JSX.Element {
    return (
      <VariableComponent
        nodeKey={this.__key}
        variableKey={this.__variableKey}
      />
    )
  }
}

// ============================================================================
// VARIABLE COMPONENT — Inline styled pill
// ============================================================================

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface VariableComponentProps {
  nodeKey: NodeKey
  variableKey: string
}

/**
 * VariableComponent — Renders a variable as a compact inline pill.
 *
 * Shows the human-readable label (e.g., "First Name") with a subtle
 * primary-colored background. Supports click-to-select and keyboard deletion.
 */
function VariableComponent({ nodeKey, variableKey }: VariableComponentProps) {
  const [editor] = useLexicalComposerContext()
  const spanRef = useRef<HTMLSpanElement>(null)
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)

  /** Check contract-specific labels/values for dynamic resolution */
  const contractLabels = useContext(ContractVariableLabelContext)
  const contractValues = useContext(ContractVariableValueContext)

  /**
   * Resolve display text for the variable pill.
   * Priority: resolved VALUE → label → fallback from key.
   * WHY: ALL variables (contract, lead, org, datetime) should show their
   * resolved value when available (e.g., "John Doe" not "First Name").
   * Falls back to label/key only if no value is present.
   */
  const isContractVariable = variableKey.startsWith('contract.')
  const displayText =
    contractValues.get(variableKey)
    || contractLabels.get(variableKey)
    || getVariableLabel(variableKey)

  // ============================================================================
  // KEYBOARD DELETION
  // ============================================================================

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        const node = $getNodeByKey(nodeKey)
        if ($isVariableNode(node)) {
          node.remove()
        }
      }
      return false
    },
    [isSelected, nodeKey]
  )

  // ============================================================================
  // CLICK SELECTION
  // ============================================================================

  const onClick = useCallback(
    (event: MouseEvent) => {
      if (
        spanRef.current &&
        (event.target === spanRef.current ||
          spanRef.current.contains(event.target as Node))
      ) {
        if (event.shiftKey) {
          setSelected(!isSelected)
        } else {
          clearSelection()
          setSelected(true)
        }
        return true
      }
      return false
    },
    [isSelected, setSelected, clearSelection]
  )

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW)
    )
  }, [editor, onClick, onDelete])

  // ============================================================================
  // RENDER — Compact inline pill
  // ============================================================================

  return (
    <span
      ref={spanRef}
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded',
        'text-sm font-medium cursor-default select-none',
        isContractVariable
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
          : 'bg-primary/10 text-primary',
        isSelected && 'ring-2 ring-primary ring-offset-1'
      )}
      title={`{{${variableKey}}}`}
    >
      {displayText}
    </span>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Type guard for VariableNode */
export function $isVariableNode(
  node: LexicalNode | null | undefined
): node is VariableNode {
  return node instanceof VariableNode
}

/** Create a new VariableNode with the given variable key */
export function $createVariableNode({
  variableKey,
  key,
}: {
  variableKey: string
  key?: NodeKey
}): VariableNode {
  return $applyNodeReplacement(new VariableNode(variableKey, key))
}
