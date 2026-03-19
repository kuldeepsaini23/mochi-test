'use client'

/**
 * ContractNodeSelectionPlugin - Detects selection of contract-specific nodes
 *
 * Listens for SELECTION_CHANGE_COMMAND in the Lexical editor and checks whether
 * a SignatureNode or InputFieldNode is currently selected. When one is detected,
 * it calls onNodeSelect with the node's typed data so the settings panel can
 * display the appropriate editing form.
 *
 * SOURCE OF TRUTH: SignatureNode, InputFieldNode (DecoratorNode types)
 * Keywords: CONTRACT_NODE_SELECTION, NODE_SELECTION_PLUGIN, CONTRACT_SETTINGS
 */

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isNodeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'

import {
  $isSignatureNode,
  SignatureNode,
} from '@/components/editor/nodes/signature-node'
import {
  $isInputFieldNode,
  InputFieldNode,
} from '@/components/editor/nodes/input-field-node'
import type { InputFieldType } from '@/components/editor/nodes/input-field-node'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Discriminated union representing a selected contract node's data
 * WHY: The settings panel needs to know which node type is selected to render
 *      the correct form (signature fields vs input field properties).
 *      Using a discriminated union with `type` ensures type-safe handling.
 *
 * SOURCE OF TRUTH: SelectedContractNode type
 * Keywords: SELECTED_CONTRACT_NODE, CONTRACT_SELECTION_TYPE
 */
export type SelectedContractNode =
  | {
      type: 'signature'
      nodeKey: string
      signerName: string
      signerRole: string
      required: boolean
      showDate: boolean
    }
  | {
      type: 'input-field'
      nodeKey: string
      label: string
      fieldType: InputFieldType
      placeholder: string
      required: boolean
    }
  | null

// ============================================================================
// PLUGIN
// ============================================================================

interface ContractNodeSelectionPluginProps {
  /** Called whenever the selected contract node changes (or becomes null) */
  onNodeSelect: (node: SelectedContractNode) => void
}

/**
 * ContractNodeSelectionPlugin - Lexical plugin for detecting contract node selection
 * WHY: Bridges the editor's selection state with the contract builder's settings panel.
 *      Renders nothing — purely a side-effect plugin.
 */
export function ContractNodeSelectionPlugin({
  onNodeSelect,
}: ContractNodeSelectionPluginProps) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    /**
     * Check the current selection for contract-specific nodes
     * WHY: Called on every selection change to keep the settings panel in sync
     */
    const checkSelection = () => {
      const selection = $getSelection()

      // Contract nodes are DecoratorNodes, which use NodeSelection (not RangeSelection)
      if (!$isNodeSelection(selection)) {
        onNodeSelect(null)
        return
      }

      const nodes = selection.getNodes()

      // Look for the first contract node in the selection
      for (const node of nodes) {
        if ($isSignatureNode(node)) {
          onNodeSelect({
            type: 'signature',
            nodeKey: node.getKey(),
            signerName: node.getSignerName(),
            signerRole: node.getSignerRole(),
            required: node.getRequired(),
            showDate: node.getShowDate(),
          })
          return
        }

        if ($isInputFieldNode(node)) {
          onNodeSelect({
            type: 'input-field',
            nodeKey: node.getKey(),
            label: node.getLabel(),
            fieldType: node.getFieldType(),
            placeholder: node.getPlaceholder(),
            required: node.getRequired(),
          })
          return
        }
      }

      // No contract node found in selection
      onNodeSelect(null)
    }

    // Listen for selection changes and check for contract nodes
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        checkSelection()
        return false // Don't consume the event — other plugins may need it
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, onNodeSelect])

  // This plugin only registers side effects — no UI to render
  return null
}
