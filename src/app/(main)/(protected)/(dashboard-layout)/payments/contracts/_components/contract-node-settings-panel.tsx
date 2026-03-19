'use client'

/**
 * Contract Node Settings Panel
 *
 * Animated right sidebar panel for editing contract node properties
 * (SignatureNode and InputFieldNode). Opens when a contract node is
 * selected in the Lexical editor.
 *
 * Pattern: PropertiesDrawer from automation builder
 * - AnimatePresence + motion.div for smooth slide-in/out
 * - Spring animation with blur effect
 * - Type-specific form fields for signature vs input field nodes
 *
 * SOURCE OF TRUTH: SelectedContractNode from contract-node-selection-plugin
 * Keywords: CONTRACT_SETTINGS_PANEL, NODE_SETTINGS, CONTRACT_DRAWER
 */

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PenTool, FormInput, X } from 'lucide-react'
import { $getNodeByKey, type LexicalEditor } from 'lexical'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { $isSignatureNode } from '@/components/editor/nodes/signature-node'
import { $isInputFieldNode } from '@/components/editor/nodes/input-field-node'
import type { InputFieldType } from '@/components/editor/nodes/input-field-node'
import type { SelectedContractNode } from '../_lib/contract-node-selection-plugin'

// ============================================================================
// TYPES
// ============================================================================

interface ContractNodeSettingsPanelProps {
  /** Currently selected contract node (null when nothing selected) */
  selectedNode: SelectedContractNode
  /** Lexical editor instance for updating node properties */
  editor: LexicalEditor
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ContractNodeSettingsPanel({
  selectedNode,
  editor,
}: ContractNodeSettingsPanelProps) {
  const isOpen = selectedNode !== null

  return (
    <AnimatePresence>
      {isOpen && selectedNode && (
        <motion.div
          initial={{ width: 0, marginLeft: 0, opacity: 0, filter: 'blur(8px)' }}
          animate={{ width: 360, marginLeft: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ width: 0, marginLeft: 0, opacity: 0, filter: 'blur(8px)' }}
          transition={{ type: 'spring', stiffness: 200, damping: 24, mass: 0.8 }}
          className="h-full shrink-0 overflow-hidden"
        >
          <div className="h-full w-[360px] flex flex-col dark:bg-muted bg-background  overflow-hidden">
            {/* Render type-specific settings form */}
            {selectedNode.type === 'signature' ? (
              <SignatureSettings
                nodeKey={selectedNode.nodeKey}
                signerName={selectedNode.signerName}
                signerRole={selectedNode.signerRole}
                required={selectedNode.required}
                showDate={selectedNode.showDate}
                editor={editor}
              />
            ) : (
              <InputFieldSettings
                nodeKey={selectedNode.nodeKey}
                label={selectedNode.label}
                fieldType={selectedNode.fieldType}
                placeholder={selectedNode.placeholder}
                required={selectedNode.required}
                editor={editor}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ============================================================================
// SIGNATURE SETTINGS FORM
// ============================================================================

interface SignatureSettingsProps {
  nodeKey: string
  signerName: string
  signerRole: string
  required: boolean
  showDate: boolean
  editor: LexicalEditor
}

/**
 * Settings form for SignatureNode properties
 * Updates the node in the editor on every field change
 */
function SignatureSettings({
  nodeKey,
  signerName,
  signerRole,
  required,
  showDate,
  editor,
}: SignatureSettingsProps) {
  const [localName, setLocalName] = useState(signerName)
  const [localRole, setLocalRole] = useState(signerRole)
  /**
   * Local state for toggle switches — synced from props via useEffect.
   * WHY: Props only update on SELECTION_CHANGE_COMMAND (when user clicks a
   * different node). Toggling required/showDate updates the Lexical node but
   * the selection doesn't change, so props stay stale. Local state ensures
   * the Switch visually reflects the current value immediately.
   */
  const [localRequired, setLocalRequired] = useState(required)
  const [localShowDate, setLocalShowDate] = useState(showDate)

  /**
   * Reset local state when a different node is selected
   */
  useEffect(() => {
    setLocalName(signerName)
    setLocalRole(signerRole)
    setLocalRequired(required)
    setLocalShowDate(showDate)
  }, [nodeKey, signerName, signerRole, required, showDate])

  /**
   * Update the SignatureNode's signerName via editor.update()
   */
  const updateSignerName = useCallback(
    (name: string) => {
      setLocalName(name)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isSignatureNode(node)) {
          node.setSignerName(name)
        }
      })
    },
    [editor, nodeKey]
  )

  /**
   * Update the SignatureNode's signerRole via editor.update()
   */
  const updateSignerRole = useCallback(
    (role: string) => {
      setLocalRole(role)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isSignatureNode(node)) {
          node.setSignerRole(role)
        }
      })
    },
    [editor, nodeKey]
  )

  /**
   * Toggle the required field on the SignatureNode.
   * Updates local state immediately so the Switch responds visually,
   * then persists the change to the Lexical node.
   */
  const toggleRequired = useCallback(
    (checked: boolean) => {
      setLocalRequired(checked)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isSignatureNode(node)) {
          node.setRequired(checked)
        }
      })
    },
    [editor, nodeKey]
  )

  /**
   * Toggle the showDate field on the SignatureNode.
   * Updates local state immediately so the Switch responds visually.
   */
  const toggleShowDate = useCallback(
    (checked: boolean) => {
      setLocalShowDate(checked)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isSignatureNode(node)) {
          node.setShowDate(checked)
        }
      })
    },
    [editor, nodeKey]
  )

  return (
    <>
      {/* Header */}
      <div className="px-7 pt-7 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <PenTool className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold tracking-tight">Signature</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure the signature field properties
        </p>
      </div>

      {/* Form fields */}
      <div className="flex-1 overflow-y-auto px-7 pb-7 pt-4">
        <div className="space-y-5">
          {/* Signer Name */}
          <div className="space-y-2">
            <Label htmlFor="signer-name" className="text-sm font-medium">
              Signer Name
            </Label>
            <Input
              id="signer-name"
              value={localName}
              onChange={(e) => updateSignerName(e.target.value)}
              placeholder="e.g., John Doe"
              className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
            />
          </div>

          {/* Signer Role */}
          <div className="space-y-2">
            <Label htmlFor="signer-role" className="text-sm font-medium">
              Signer Role
            </Label>
            <Input
              id="signer-role"
              value={localRole}
              onChange={(e) => updateSignerRole(e.target.value)}
              placeholder="e.g., CEO, Client"
              className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
            />
          </div>

          {/* Required toggle — uses localRequired for instant visual feedback */}
          <div className="flex items-center justify-between">
            <Label htmlFor="sig-required" className="text-sm font-medium">
              Required
            </Label>
            <Switch
              id="sig-required"
              checked={localRequired}
              onCheckedChange={toggleRequired}
            />
          </div>

          {/* Show Date toggle — uses localShowDate for instant visual feedback */}
          <div className="flex items-center justify-between">
            <Label htmlFor="sig-date" className="text-sm font-medium">
              Show Date Line
            </Label>
            <Switch
              id="sig-date"
              checked={localShowDate}
              onCheckedChange={toggleShowDate}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// INPUT FIELD SETTINGS FORM
// ============================================================================

interface InputFieldSettingsProps {
  nodeKey: string
  label: string
  fieldType: InputFieldType
  placeholder: string
  required: boolean
  editor: LexicalEditor
}

/**
 * Settings form for InputFieldNode properties
 * Updates the node in the editor on every field change
 */
function InputFieldSettings({
  nodeKey,
  label,
  fieldType,
  placeholder,
  required,
  editor,
}: InputFieldSettingsProps) {
  const [localLabel, setLocalLabel] = useState(label)
  const [localPlaceholder, setLocalPlaceholder] = useState(placeholder)
  /**
   * Local state for required toggle — same pattern as SignatureSettings.
   * WHY: Props only update on SELECTION_CHANGE_COMMAND, so toggling required
   * without local state makes the Switch appear unresponsive.
   */
  const [localRequired, setLocalRequired] = useState(required)

  /**
   * Reset local state when a different node is selected
   */
  useEffect(() => {
    setLocalLabel(label)
    setLocalPlaceholder(placeholder)
    setLocalRequired(required)
  }, [nodeKey, label, placeholder, required])

  /**
   * Update the InputFieldNode's label via editor.update()
   */
  const updateLabel = useCallback(
    (newLabel: string) => {
      setLocalLabel(newLabel)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isInputFieldNode(node)) {
          node.setLabel(newLabel)
        }
      })
    },
    [editor, nodeKey]
  )

  /**
   * Update the InputFieldNode's fieldType via editor.update()
   */
  const updateFieldType = useCallback(
    (type: InputFieldType) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isInputFieldNode(node)) {
          node.setFieldType(type)
        }
      })
    },
    [editor, nodeKey]
  )

  /**
   * Update the InputFieldNode's placeholder via editor.update()
   */
  const updatePlaceholder = useCallback(
    (newPlaceholder: string) => {
      setLocalPlaceholder(newPlaceholder)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isInputFieldNode(node)) {
          node.setPlaceholder(newPlaceholder)
        }
      })
    },
    [editor, nodeKey]
  )

  /**
   * Toggle the required field on the InputFieldNode.
   * Updates local state immediately so the Switch responds visually,
   * then persists the change to the Lexical node.
   */
  const toggleRequired = useCallback(
    (checked: boolean) => {
      setLocalRequired(checked)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isInputFieldNode(node)) {
          node.setRequired(checked)
        }
      })
    },
    [editor, nodeKey]
  )

  return (
    <>
      {/* Header */}
      <div className="px-7 pt-7 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <FormInput className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold tracking-tight">Input Field</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure the input field properties
        </p>
      </div>

      {/* Form fields */}
      <div className="flex-1 overflow-y-auto px-7 pb-7 pt-4">
        <div className="space-y-5">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="field-label" className="text-sm font-medium">
              Label
            </Label>
            <Input
              id="field-label"
              value={localLabel}
              onChange={(e) => updateLabel(e.target.value)}
              placeholder="e.g., Full Name"
              className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
            />
          </div>

          {/* Field Type */}
          <div className="space-y-2">
            <Label htmlFor="field-type" className="text-sm font-medium">
              Field Type
            </Label>
            <Select value={fieldType} onValueChange={(v) => updateFieldType(v as InputFieldType)}>
              <SelectTrigger className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Placeholder */}
          <div className="space-y-2">
            <Label htmlFor="field-placeholder" className="text-sm font-medium">
              Placeholder
            </Label>
            <Input
              id="field-placeholder"
              value={localPlaceholder}
              onChange={(e) => updatePlaceholder(e.target.value)}
              placeholder="e.g., Enter value..."
              className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
            />
          </div>

          {/* Required toggle — uses localRequired for instant visual feedback */}
          <div className="flex items-center justify-between">
            <Label htmlFor="field-required" className="text-sm font-medium">
              Required
            </Label>
            <Switch
              id="field-required"
              checked={localRequired}
              onCheckedChange={toggleRequired}
            />
          </div>
        </div>
      </div>
    </>
  )
}
