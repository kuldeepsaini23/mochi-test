/**
 * Contract-specific slash commands for the contract builder editor
 *
 * Adds contract-specific nodes and template variables to the slash menu.
 * Three groups:
 * 1. Signature / Input Field — contract structure nodes
 * 2. Variables — generated from SHARED_CATEGORIES, insertable as inline pills
 *
 * Typing `/var` shows all variable commands. Typing `/first` shows "First Name".
 * Each variable command inserts a VariableNode (rendered as a styled pill).
 *
 * SOURCE OF TRUTH: SlashCommand from slash-command-plugin, SHARED_CATEGORIES
 * Keywords: CONTRACT_SLASH_COMMANDS, CONTRACT_EDITOR_COMMANDS, VARIABLE_SLASH_COMMANDS
 */

import { $insertNodes } from 'lexical'
import { PenTool, FormInput, Braces } from 'lucide-react'

import type { SlashCommand } from '@/components/editor/plugins/slash-command-plugin'
import type { ContractVariable } from './types'
import { $createSignatureNode } from '@/components/editor/nodes/signature-node'
import { $createInputFieldNode } from '@/components/editor/nodes/input-field-node'
import { $createVariableNode } from '@/components/editor/nodes/variable-node'
import { SHARED_CATEGORIES } from '@/lib/variables/variable-categories'

// ============================================================================
// CONTRACT STRUCTURE COMMANDS
// ============================================================================

/**
 * Slash commands for contract-specific structure nodes.
 * WHY: Signature and input field are only relevant in contract context.
 */
const CONTRACT_STRUCTURE_COMMANDS: SlashCommand[] = [
  {
    id: 'signature',
    title: 'Signature',
    description: 'Add a signature block',
    icon: PenTool,
    keywords: ['signature', 'sign', 'pen'],
    onSelect: (editor) => {
      editor.update(() => {
        $insertNodes([
          $createSignatureNode({
            signerName: '',
            signerRole: '',
            required: true,
            showDate: true,
          }),
        ])
      })
    },
  },
  {
    id: 'input-field',
    title: 'Input Field',
    description: 'Add a form input field',
    icon: FormInput,
    keywords: ['input', 'field', 'form', 'text'],
    onSelect: (editor) => {
      editor.update(() => {
        $insertNodes([
          $createInputFieldNode({
            label: 'Field Label',
            fieldType: 'text',
            placeholder: 'Enter value...',
            required: true,
          }),
        ])
      })
    },
  },
]

// ============================================================================
// VARIABLE COMMANDS — Generated from SHARED_CATEGORIES
// ============================================================================

/**
 * Generate slash commands for every variable in SHARED_CATEGORIES.
 * Each variable becomes a separate command with its category icon.
 *
 * WHY: Users can type `/var` to see all variables, or `/email` to find
 * the email variable specifically. Uses the existing slash command filter.
 */
const VARIABLE_COMMANDS: SlashCommand[] = SHARED_CATEGORIES.flatMap(
  (category) =>
    category.variables.map((variable): SlashCommand => {
      /** Split label into lowercase words for keyword matching */
      const labelWords = variable.label.toLowerCase().split(/\s+/)
      /** Split key segments for keyword matching (e.g., "lead", "firstName") */
      const keySegments = variable.key.split('.')

      return {
        id: `variable-${variable.key}`,
        title: variable.label,
        description: `Insert {{${variable.key}}} variable`,
        icon: Braces,
        keywords: [
          'variable',
          'var',
          '{{',
          ...labelWords,
          ...keySegments,
        ],
        onSelect: (editor) => {
          editor.update(() => {
            $insertNodes([
              $createVariableNode({ variableKey: variable.key }),
            ])
          })
        },
      }
    })
)

// ============================================================================
// CONTRACT VARIABLE COMMANDS — Generated dynamically from user variables
// ============================================================================

/**
 * Build slash commands from user-defined contract variables.
 * Each variable becomes a command that inserts a VariableNode
 * with key `contract.{id}`.
 *
 * WHY: Users create custom variables (e.g., "Client Name") that should
 * be accessible via the `/` slash command menu alongside system variables.
 *
 * SOURCE OF TRUTH: ContractVariable from ./types
 */
export function buildContractVariableCommands(variables: ContractVariable[]): SlashCommand[] {
  return variables
    .filter((v) => v.name.trim())
    .map((variable): SlashCommand => ({
      id: `contract-var-${variable.id}`,
      title: variable.name,
      description: `Insert contract variable "${variable.name}"`,
      icon: Braces,
      keywords: [
        'variable',
        'var',
        'contract',
        ...variable.name.toLowerCase().split(/\s+/),
      ],
      onSelect: (editor) => {
        editor.update(() => {
          $insertNodes([$createVariableNode({ variableKey: `contract.${variable.id}` })])
        })
      },
    }))
}

// ============================================================================
// COMBINED CONTRACT SLASH COMMANDS
// ============================================================================

/**
 * All contract-specific slash commands: structure nodes + variables.
 * Structure commands appear first, then all variable commands.
 */
export const CONTRACT_SLASH_COMMANDS: SlashCommand[] = [
  ...CONTRACT_STRUCTURE_COMMANDS,
  ...VARIABLE_COMMANDS,
]
