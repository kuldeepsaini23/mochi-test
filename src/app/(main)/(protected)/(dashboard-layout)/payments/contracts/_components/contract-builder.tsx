'use client'

/**
 * Contract Builder - Full-Screen Overlay Editor
 *
 * The main contract builder component that provides a full-screen editing
 * experience for both contracts AND templates. Detects isTemplate from
 * the fetched data and adapts the UI accordingly:
 *
 * - TEMPLATE: Shows "Template" badge, "Use Template" button in navbar.
 *   "Use Template" creates a contract draft via createFromTemplate and
 *   switches the builder to editing the new contract instance.
 * - CONTRACT: Normal editing with full status dropdown and save.
 *
 * Features:
 * - LexicalComposer with contractNodes and CONTRACT_SLASH_COMMANDS
 * - ContractNodeSelectionPlugin for detecting node selection
 * - ContractNodeSettingsPanel for editing node properties
 * - Auto-save via useAutoSave hook (navbar-coordinated, 2s debounce)
 * - Undo/Redo via Lexical CAN_UNDO_COMMAND / CAN_REDO_COMMAND
 * - Name/status editing in the navbar
 *
 * SOURCE OF TRUTH: Contract model from Prisma, contractNodes from nodes.ts
 * Keywords: CONTRACT_BUILDER, CONTRACT_EDITOR, CONTRACT_OVERLAY
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { TRANSFORMERS } from '@lexical/markdown'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  type LexicalNode,
} from 'lexical'
import type { EditorState, LexicalEditor } from 'lexical'

import { cn } from '@/lib/utils'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { contractNodes } from '@/components/editor/nodes'
import { editorTheme } from '@/components/editor/theme'
import {
  FloatingLinkEditorPlugin,
  SlashCommandPlugin,
  AutoLinkPlugin,
  Placeholder,
  FloatingToolbarPlugin,
  ImagePlugin,
} from '@/components/editor/plugins'
import type { SavedColor } from '@/components/editor/plugins/floating-toolbar-plugin'
import { trpc } from '@/trpc/react-provider'
import { useMochiEvents, consumeFeatureBuffer } from '@/lib/ai/mochi/events'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import { toast } from 'sonner'
import type { ContractStatus } from '@/generated/prisma'

import { nanoid } from 'nanoid'
import {
  $createVariableNode,
  $isVariableNode,
  ContractVariableLabelProvider,
  ContractVariableValueProvider,
} from '@/components/editor/nodes/variable-node'
import {
  CONTRACT_SLASH_COMMANDS,
  buildContractVariableCommands,
} from '../_lib/contract-slash-commands'
import {
  VariableAutoReplacePlugin,
  ContractVariableKeysProvider,
} from '../_lib/variable-auto-replace-plugin'
import {
  ContractNodeSelectionPlugin,
  type SelectedContractNode,
} from '../_lib/contract-node-selection-plugin'
import type { ContractVariable } from '../_lib/types'
import { useLeadSearch, type LeadOption } from '@/components/leads/lead-search-command'
import { SigningProvider, remapSigneeDataKeys } from '@/app/(main)/(public)/contract/view/[accessToken]/_lib/signing-context'
import { ContractBuilderNavbar } from './contract-builder-navbar'
import { ContractNodeSettingsPanel } from './contract-node-settings-panel'
import { ContractVariablesSidebar } from './contract-variables-sidebar'
import { NavigationGate } from '@/components/global/navigation-gate'
import { useContractAI } from '../_hooks/use-contract-ai'
import { ContractLoadParserPlugin } from '../_lib/contract-load-parser-plugin'

// ============================================================================
// TYPES
// ============================================================================

interface ContractBuilderProps {
  /** Contract or template ID to edit */
  contractId: string
  /** Organization ID for API calls and storage */
  organizationId: string
  /** Callback to close the builder overlay */
  onClose: () => void
  /**
   * Callback when "Use Template" creates a new contract instance.
   * Parent should update the URL to point to the new contract ID.
   */
  onSwitchToContract?: (newContractId: string) => void
}

// ============================================================================
// INNER EDITOR COMPONENT
// ============================================================================

/**
 * Inner component that has access to the Lexical editor context.
 * Separated from the main component because useLexicalComposerContext()
 * must be called inside a LexicalComposer provider.
 *
 * Handles:
 * - Undo/redo tracking via CAN_UNDO_COMMAND / CAN_REDO_COMMAND
 * - Editor change serialization for save
 * - Node selection for settings panel
 * - Floating toolbar and saved colors
 */
function ContractEditorInner({
  organizationId,
  contractName,
  contractStatus,
  isTemplate,
  isDirty,
  isSaving,
  isCreatingFromTemplate,
  contentVersion,
  autoSaveEnabled,
  contractVariables,
  onContentChange,
  onNameChange,
  onStatusChange,
  onAutoSaveChange,
  onSave,
  onClose,
  onUseTemplate,
  onAddVariable,
  onUpdateVariable,
  onRemoveVariable,
  onBatchAddVariables,
  recipientLead,
  fullLeadData,
  orgData,
  onSelectRecipient,
  onRemoveRecipient,
  onSend,
  isSending,
  isReadOnly,
  onRevertToDraft,
  isReverting,
  contractId,
  onAIGenerationDone,
}: {
  organizationId: string
  contractName: string
  contractStatus: ContractStatus
  isTemplate: boolean
  isDirty: boolean
  isSaving: boolean
  isCreatingFromTemplate: boolean
  contentVersion: number
  autoSaveEnabled: boolean
  contractVariables: ContractVariable[]
  onContentChange: (content: string) => void
  onNameChange: (name: string) => void
  onStatusChange: (status: ContractStatus) => void
  onAutoSaveChange: (enabled: boolean) => void
  onSave: () => Promise<void>
  onClose: () => void
  onUseTemplate: () => void
  onAddVariable: () => void
  onUpdateVariable: (id: string, updates: Partial<Pick<ContractVariable, 'name' | 'value'>>) => void
  onRemoveVariable: (id: string) => void
  /** Batch-add multiple variables at once (from AI generation) */
  onBatchAddVariables: (variables: ContractVariable[]) => void
  /** Currently selected recipient lead for variable preview */
  recipientLead: LeadOption | null
  /** Full lead data with all fields (address, city, status, etc.) for variable resolution */
  fullLeadData: Record<string, unknown> | null | undefined
  /** Organization data for org variable resolution (name, logo, customDomain) */
  orgData: { id: string; name: string; logo: string | null; customDomain: string | null } | null | undefined
  /** Open the lead search dialog */
  onSelectRecipient: () => void
  /** Remove the selected recipient */
  onRemoveRecipient: () => void
  /** Send the contract to the recipient */
  onSend: () => Promise<void>
  /** Whether the send mutation is in progress */
  isSending: boolean
  /**
   * Whether the builder is in read-only mode (SENT status).
   * WHY: SENT contracts must not be edited — sidebar, settings panel,
   * and editing controls are all hidden.
   */
  isReadOnly: boolean
  /** Callback to revert contract from SENT back to DRAFT */
  onRevertToDraft: () => void
  /** Whether the revert mutation is in progress */
  isReverting: boolean
  /** Contract ID — needed for the AI generation API */
  contractId: string
  /**
   * Signal that AI generation is done — outer component triggers a deferred save.
   * WHY: Saving immediately from the inner component would capture stale state
   * (variables haven't flushed yet). The outer component waits for React to flush
   * all state updates before persisting.
   */
  onAIGenerationDone: () => void
}) {
  const [editor] = useLexicalComposerContext()

  /**
   * Toggle editor editability based on read-only mode.
   * WHY: SENT contracts must not be editable — the user must revert
   * to DRAFT first. This disables all typing, formatting, and node manipulation.
   */
  useEffect(() => {
    editor.setEditable(!isReadOnly)
  }, [editor, isReadOnly])

  // ============================================================================
  // AI CONTRACT WRITER — event-driven, receives from Mochi chat stream
  // ============================================================================

  /**
   * Stable callbacks for useContractAI.
   * onComplete triggers an immediate save to persist AI-generated content.
   */
  /**
   * AI generation complete — signals the outer component to save.
   *
   * WHY NOT save here directly: receiveComplete() calls onVariablesCreated()
   * which updates contractVariables. But React hasn't flushed that update yet.
   * If we call onSave() now, performSave() captures STALE contractVariables
   * (pre-update closure), persists null variables, then cache invalidation
   * refetches from DB → overwrites the correct local state with stale data.
   *
   * Instead, we signal the outer component via onAIGenerationDone(). The outer
   * component uses a deferred save mechanism (useEffect) that waits for React
   * to flush ALL state updates before saving. Single save, correct data.
   */
  const handleAIComplete = useCallback(() => {
    toast.success('Contract content generated')
    onAIGenerationDone()
  }, [onAIGenerationDone])

  const handleAIError = useCallback((error: string) => {
    toast.error(`AI generation failed: ${error}`)
  }, [])

  const contractAI = useContractAI({
    editor,
    organizationId,
    contractId,
    contractVariables,
    onComplete: handleAIComplete,
    onError: handleAIError,
    onVariablesCreated: onBatchAddVariables,
  })

  /** Whether AI is actively working (for gradient text indicator + NavigationGate) */
  const isAIGenerating =
    contractAI.state.status === 'streaming' ||
    contractAI.state.status === 'processing'

  /**
   * Subscribe to contract content events from the Mochi chat stream.
   *
   * FLOW: The model outputs markdown in ```contract:{mode} code fences →
   * pipeContractContent() transform separates them into data-contract events →
   * use-mochi-ai.ts emits to the Mochi event bus → we receive here.
   *
   * Three event types:
   * - contract_content with data.type='start' — fence opened, begin receiving
   * - contract_content with data.type='delta' — streaming markdown chunk
   * - contract_content_complete — fence closed, do final processing
   */
  /**
   * Process a contract content event — shared by both the live listener
   * and the buffered event replay. Extracted to avoid duplicating logic.
   */
  const handleContractContentEvent = useCallback((event: { action: string; data?: Record<string, string> }) => {
    if (event.action === 'contract_content' && event.data?.type === 'start') {
      const mode = (event.data.mode as 'generate' | 'update' | 'append') || 'generate'
      contractAI.startReceiving(mode)
    }

    if (event.action === 'contract_content' && event.data?.type === 'delta' && event.data?.delta) {
      contractAI.receiveChunk(event.data.delta)
    }

    if (event.action === 'contract_content_complete') {
      contractAI.receiveComplete()
    }
  }, [contractAI])

  /**
   * Subscribe to contract content events from the Mochi chat stream.
   *
   * FLOW: The model outputs markdown in ```contract:{mode} code fences →
   * pipeContractContent() transform separates them into data-contract events →
   * use-mochi-ai.ts emits to the Mochi event bus → we receive here.
   */
  useMochiEvents('contract', (event) => {
    handleContractContentEvent(event)
  })

  /**
   * Replay buffered contract events on mount — BATCHED.
   *
   * WHY: When the model creates a contract and navigates to the builder,
   * content fence events may start streaming BEFORE this component mounts.
   * The event emitter buffers these events. On mount, we consume the buffer
   * and replay them so no content is lost.
   *
   * IMPORTANT: We do NOT replay events one-by-one (the old approach). That
   * caused "Maximum update depth exceeded" because each `receiveChunk` call
   * triggers a React state update + progressive editor update. With hundreds
   * of buffered delta events, that's hundreds of cascading state updates.
   *
   * Instead, we batch: accumulate all deltas into one string, call
   * `startReceiving` once, `receiveChunk` once (single state update),
   * and `receiveComplete` once. Same result, ~3 state updates total.
   */
  useEffect(() => {
    const buffered = consumeFeatureBuffer('contract')
    if (buffered.length === 0) {
      console.log('[ContractBuilder] No buffered contract events to replay')
      return
    }

    console.log(
      `[ContractBuilder] Replaying ${buffered.length} buffered contract events`
    )

    /** Pre-process: extract mode from start event, concatenate all deltas */
    let mode: 'generate' | 'update' | 'append' = 'generate'
    let fullMarkdown = ''
    let hasComplete = false

    for (const event of buffered) {
      if (event.action === 'contract_content' && event.data?.type === 'start') {
        mode = (event.data.mode as 'generate' | 'update' | 'append') || 'generate'
      } else if (event.action === 'contract_content' && event.data?.type === 'delta' && event.data?.delta) {
        fullMarkdown += event.data.delta
      } else if (event.action === 'contract_content_complete') {
        hasComplete = true
      }
    }

    /**
     * Apply as a single batch: 1 start + 1 chunk + 1 complete = ~3 state updates.
     *
     * CRITICAL: Deferred to the next tick via setTimeout(0) because Lexical's
     * editor.update() calls flushSync(), which crashes if invoked inside React's
     * commit phase (useEffect). Deferring moves the Lexical update outside the
     * lifecycle boundary, avoiding "flushSync inside lifecycle method" + the
     * cascading "Maximum update depth exceeded" error that crashes the component
     * and loses the buffer on re-mount.
     */
    if (fullMarkdown) {
      console.log(
        `[ContractBuilder] Buffer replay: mode=${mode}, chars=${fullMarkdown.length}, complete=${hasComplete}`
      )
      setTimeout(() => {
        contractAI.startReceiving(mode)
        contractAI.receiveChunk(fullMarkdown)
        if (hasComplete) {
          contractAI.receiveComplete()
        }
      }, 0)
    } else {
      console.warn('[ContractBuilder] Buffer had events but no delta content — content fence may not have been generated')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [selectedNode, setSelectedNode] = useState<SelectedContractNode>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [floatingAnchorElement, setFloatingAnchorElement] = useState<HTMLDivElement | null>(null)

  /** Track scroll position for MarqueeFade top/bottom fade effects */
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  // ============================================================================
  // CONTRACT VARIABLES — Dynamic slash commands, label map, and valid keys
  // ============================================================================

  /**
   * Merge static CONTRACT_SLASH_COMMANDS with dynamic contract variable commands.
   * Reactive: adding/removing a variable instantly updates the `/` menu.
   */
  const allSlashCommands = useMemo(
    () => [...CONTRACT_SLASH_COMMANDS, ...buildContractVariableCommands(contractVariables)],
    [contractVariables]
  )

  /**
   * Map from `contract.{id}` → variable name for VariableNode label resolution.
   * Passed to ContractVariableLabelProvider so pills show the user-defined name.
   */
  const contractLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    contractVariables.forEach((v) => {
      if (v.name) map.set(`contract.${v.id}`, v.name)
    })
    return map
  }, [contractVariables])

  /**
   * Map from variable key → display value for VariableNode value display.
   * WHY: Contract variable pills show the interpolated VALUE (e.g., "John Doe")
   * instead of the name, so users see what will actually render in the contract.
   *
   * Merges ALL data sources:
   * 1. Contract variables (user-defined key→value)
   * 2. Lead data (all LEAD_CATEGORY fields from fullLeadData)
   * 3. Organization data (name, logo, customDomain)
   * 4. Date/time variables (now.date, now.year, etc.)
   */
  const contractValueMap = useMemo(() => {
    const map = new Map<string, string>()

    /** 1. Contract variables */
    contractVariables.forEach((v) => {
      if (v.value) map.set(`contract.${v.id}`, v.value)
    })

    /** 2. Lead data — merge ALL fields from fullLeadData when available */
    const lead = fullLeadData as Record<string, unknown> | undefined
    if (lead) {
      const leadFieldMap: Record<string, string | null | undefined> = {
        'lead.firstName': lead.firstName as string | null,
        'lead.lastName': lead.lastName as string | null,
        'lead.fullName': lead.fullName as string | null,
        'lead.email': lead.email as string | null,
        'lead.phone': lead.phone as string | null,
        'lead.address': lead.address as string | null,
        'lead.city': lead.city as string | null,
        'lead.state': lead.state as string | null,
        'lead.zipCode': lead.zipCode as string | null,
        'lead.country': lead.country as string | null,
        'lead.status': lead.status as string | null,
        'lead.source': lead.source as string | null,
        'lead.cltvFormatted': lead.cltv != null ? `$${Number(lead.cltv).toFixed(2)}` : null,
      }
      Object.entries(leadFieldMap).forEach(([key, value]) => {
        if (value) map.set(key, value)
      })
    } else if (recipientLead) {
      /** Fallback to basic LeadOption fields while fullLeadData loads */
      const basicMap: Record<string, string | null> = {
        'lead.firstName': recipientLead.firstName,
        'lead.lastName': recipientLead.lastName,
        'lead.fullName': [recipientLead.firstName, recipientLead.lastName].filter(Boolean).join(' ') || null,
        'lead.email': recipientLead.email,
        'lead.phone': recipientLead.phone,
      }
      Object.entries(basicMap).forEach(([key, value]) => {
        if (value) map.set(key, value)
      })
    }

    /** 3. Organization data */
    if (orgData) {
      if (orgData.name) map.set('organization.name', orgData.name)
      if (orgData.logo) map.set('organization.logo', orgData.logo)
      if (orgData.customDomain) map.set('organization.customDomain', orgData.customDomain)
    }

    /** 4. Date/time variables — live preview in the builder */
    const now = new Date()
    map.set('now.date', now.toLocaleDateString())
    map.set('now.year', String(now.getFullYear()))
    map.set('now.month', now.toLocaleDateString(undefined, { month: 'long' }))
    map.set('now.day', String(now.getDate()))
    map.set('now.datetime', now.toLocaleString())

    return map
  }, [contractVariables, recipientLead, fullLeadData, orgData])

  /**
   * Set of valid contract variable keys for the auto-replace plugin.
   * When a user types `{{contract.abc123}}`, this set tells the plugin
   * that `contract.abc123` is a valid key to convert into a VariableNode.
   */
  const contractVariableKeys = useMemo(
    () => new Set(contractVariables.map((v) => `contract.${v.id}`)),
    [contractVariables]
  )

  // ============================================================================
  // UNDO / REDO — Lexical history command tracking
  // ============================================================================

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  /**
   * Register CAN_UNDO_COMMAND and CAN_REDO_COMMAND listeners.
   * These fire whenever the undo/redo stack changes, giving us
   * reactive state to enable/disable the toolbar buttons.
   */
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload)
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload)
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      )
    )
  }, [editor])

  /** Dispatch undo command to the Lexical editor */
  const handleUndo = useCallback(() => {
    editor.dispatchCommand(UNDO_COMMAND, undefined)
  }, [editor])

  /** Dispatch redo command to the Lexical editor */
  const handleRedo = useCallback(() => {
    editor.dispatchCommand(REDO_COMMAND, undefined)
  }, [editor])

  /**
   * Insert a VariableNode at the current selection.
   * WHY: Called from the navbar's VariablePicker when the user picks a variable.
   * The node renders as an inline pill within the text.
   */
  const handleInsertVariable = useCallback(
    (variableKey: string) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const variableNode = $createVariableNode({ variableKey })
          selection.insertNodes([variableNode])
        }
      })
    },
    [editor]
  )

  /**
   * Remove a contract variable AND clean up all its pills from the editor.
   * WHY: When a variable is deleted from the sidebar, any VariableNode pills
   * referencing that variable should be removed from the document rather than
   * showing a fallback ID string.
   */
  const handleRemoveVariableWithCleanup = useCallback(
    (id: string) => {
      /** Remove the variable from state via the parent callback */
      onRemoveVariable(id)

      /** Remove all VariableNode pills with the matching key from the editor */
      const targetKey = `contract.${id}`
      editor.update(() => {
        const root = $getRoot()
        /** Recursively traverse the node tree and remove matching VariableNodes */
        const removeMatching = (node: LexicalNode) => {
          if ($isVariableNode(node) && node.getVariableKey() === targetKey) {
            node.remove()
            return
          }
          if ($isElementNode(node)) {
            /** Iterate backwards to avoid index shifting when nodes are removed */
            const children = node.getChildren()
            for (let i = children.length - 1; i >= 0; i--) {
              removeMatching(children[i])
            }
          }
        }
        removeMatching(root)
      })
    },
    [editor, onRemoveVariable]
  )

  // ============================================================================
  // SAVED COLORS — persisted in localStorage per organization
  // ============================================================================

  const savedColorsKey = `contract-saved-colors-${organizationId}`

  const [savedColors, setSavedColors] = useState<SavedColor[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(savedColorsKey)
      return stored ? (JSON.parse(stored) as SavedColor[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(savedColorsKey, JSON.stringify(savedColors))
    } catch {
      /* localStorage full or unavailable — silently ignore */
    }
  }, [savedColors, savedColorsKey])

  const handleSaveColor = useCallback((color: SavedColor) => {
    setSavedColors((prev) => {
      if (prev.some((c) => c.value === color.value)) return prev
      return [...prev, color]
    })
  }, [])

  const handleRemoveColor = useCallback((value: string) => {
    setSavedColors((prev) => prev.filter((c) => c.value !== value))
  }, [])

  /**
   * Set up the floating anchor element for floating toolbars
   * and attach scroll listener for MarqueeFade
   */
  useEffect(() => {
    const el = editorContainerRef.current
    if (!el) return

    setFloatingAnchorElement(el)

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      setShowTopFade(scrollTop > 10)
      setShowBottomFade(scrollTop + clientHeight < scrollHeight - 10)
    }

    handleScroll()
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  /** Handle editor state changes — serialize and pass to parent */
  const handleChange = useCallback(
    (editorState: EditorState) => {
      const json = editorState.toJSON()
      const content = JSON.stringify(json)
      onContentChange(content)
    },
    [onContentChange]
  )

  const handleNodeSelect = useCallback((node: SelectedContractNode) => {
    setSelectedNode(node)
  }, [])

  const validateUrl = useCallback((url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }, [])

  return (
    <ContractVariableLabelProvider labels={contractLabelMap}>
      <ContractVariableValueProvider values={contractValueMap}>
        <ContractVariableKeysProvider keys={contractVariableKeys}>
          {/**
           * Exit protection — blocks page refresh, browser back, and link clicks
           * while AI is actively streaming content into the editor. The browser's
           * native "Leave site?" dialog fires for refresh/close. NavigationGate
           * shows a custom AlertDialog for internal link navigation.
           */}
          <NavigationGate
            isPending={isAIGenerating}
            title="AI is generating your contract"
            description="Content is still being generated. If you leave now, the generation will be interrupted and your content may be incomplete."
            stayButtonText="Keep generating"
            leaveButtonText="Leave anyway"
          />
          <div className={cn(
            'flex h-full overflow-hidden transition-colors duration-300',
            selectedNode ? 'dark:bg-sidebar bg-background' : 'bg-muted'
          )}>
            {/* Main editor area — rounded on right side so the muted bg peeks through the corners */}
            <div className="relative flex-1 min-w-0 rounded-tr-3xl rounded-br-3xl overflow-hidden dark:bg-sidebar bg-muted">
              {/* Floating navbar — minimal toolbar matching automation builder */}
              <ContractBuilderNavbar
                contractName={contractName}
                contractStatus={contractStatus}
                isTemplate={isTemplate}
                isDirty={isDirty}
                isSaving={isSaving}
                isCreatingFromTemplate={isCreatingFromTemplate}
                contentVersion={contentVersion}
                autoSaveEnabled={autoSaveEnabled}
                canUndo={canUndo}
                canRedo={canRedo}
                contractVariables={contractVariables}
                recipientLead={recipientLead}
                onSend={onSend}
                isSending={isSending}
                isReadOnly={isReadOnly}
                onRevertToDraft={onRevertToDraft}
                isReverting={isReverting}
                onAutoSaveChange={onAutoSaveChange}
                onNameChange={onNameChange}
                onStatusChange={onStatusChange}
                onSave={onSave}
                onClose={onClose}
                onUseTemplate={onUseTemplate}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onInsertVariable={handleInsertVariable}
              />

              {/* Contract settings sidebar — hidden in read-only mode (SENT) */}
              {!isReadOnly && (
                <ContractVariablesSidebar
                  variables={contractVariables}
                  onAddVariable={onAddVariable}
                  onUpdateVariable={onUpdateVariable}
                  onRemoveVariable={onRemoveVariable}
                  onInsertVariable={handleInsertVariable}
                  recipientLead={recipientLead}
                  onSelectRecipient={onSelectRecipient}
                  onRemoveRecipient={onRemoveRecipient}
                />
              )}

            {/* Editor content area */}
            <MarqueeFade
              showTopFade={showTopFade}
              showBottomFade={showBottomFade}
              fadeHeight={100}
              className="h-full"
            >
              <div
                ref={editorContainerRef}
                className="h-full overflow-y-auto pt-16 px-4 sm:px-8 md:px-16 lg:px-24 pb-16"
              >
                {/**
                 * AI streaming indicator — shimmer-style rainbow text shown
                 * when AI is actively generating content in real-time.
                 * Uses a wide rainbow gradient with a bright "shimmer band" that
                 * sweeps across the text. Thin font (font-light) for elegance.
                 */}
                {isAIGenerating && (
                  <div className="max-w-3xl mx-auto mb-4">
                    <p
                      className="text-sm font-light tracking-wide animate-gradient-text"
                      style={{
                        backgroundImage:
                          'linear-gradient(90deg, #8b5cf6, #c084fc, #ec4899, #f472b6, #c084fc, #8b5cf6)',
                        backgroundSize: '300% auto',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      AI is generating your contract...
                    </p>
                  </div>
                )}
                <div className="max-w-3xl mx-auto">
                  <div className="relative">
                    <RichTextPlugin
                      contentEditable={
                        <ContentEditable
                          className={cn(
                            'min-h-[calc(100vh-200px)] outline-none',
                            'text-foreground text-base leading-relaxed'
                          )}
                          aria-placeholder="Type '/' for commands..."
                          placeholder={<Placeholder text="Type '/' for commands..." />}
                        />
                      }
                      ErrorBoundary={LexicalErrorBoundary}
                    />
                  </div>
                </div>
              </div>
            </MarqueeFade>

            {/* Lexical plugins */}
            <HistoryPlugin />
            <ListPlugin />
            <CheckListPlugin />
            <LinkPlugin validateUrl={validateUrl} />
            <HorizontalRulePlugin />
            <TabIndentationPlugin />
            <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
            <AutoLinkPlugin />

            {floatingAnchorElement && (
              <FloatingLinkEditorPlugin anchorElement={floatingAnchorElement} />
            )}
            {/* Editing-only plugins — hidden in read-only mode */}
            {!isReadOnly && (
              <>
                <SlashCommandPlugin
                  organizationId={organizationId}
                  extraCommands={allSlashCommands}
                />
                <FloatingToolbarPlugin
                  savedColors={savedColors}
                  onSaveColor={handleSaveColor}
                  onRemoveColor={handleRemoveColor}
                />
              </>
            )}
            <ImagePlugin organizationId={organizationId} />

            {/* Contract-specific plugins */}
            {/**
             * Load-time parser — runs once on mount to repair unprocessed markers.
             * Catches [CONTRACT_VAR:...], [SIGNATURE:...], [INPUT_FIELD:...] text
             * that slipped through the streaming pipeline (race condition, background
             * mode, partial stream). Runs BEFORE VariableAutoReplacePlugin so that
             * any {{lead.*}} patterns in repaired content get auto-replaced too.
             */}
            <ContractLoadParserPlugin
              contractVariables={contractVariables}
              onVariablesDiscovered={onBatchAddVariables}
            />
            <VariableAutoReplacePlugin />
            <ContractNodeSelectionPlugin onNodeSelect={handleNodeSelect} />
            <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
          </div>

          {/* Animated settings panel — hidden in read-only mode (SENT) */}
          {!isReadOnly && (
            <ContractNodeSettingsPanel
              selectedNode={selectedNode}
              editor={editor}
            />
          )}

          </div>
        </ContractVariableKeysProvider>
      </ContractVariableValueProvider>
    </ContractVariableLabelProvider>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ContractBuilder({
  contractId,
  organizationId,
  onClose,
  onSwitchToContract,
}: ContractBuilderProps) {
  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const { data: contract, isLoading } = trpc.contracts.getById.useQuery(
    { organizationId, id: contractId },
    { staleTime: 30000 }
  )

  const updateMutation = trpc.contracts.update.useMutation({
    onError: (error) => {
      toast.error(error.message || 'Failed to save contract')
    },
  })

  /**
   * "Use Template" mutation — creates a contract instance from the current template.
   * On success, switches the builder to editing the new contract.
   */
  const createFromTemplateMutation = trpc.contracts.createFromTemplate.useMutation({
    onSuccess: (data) => {
      toast.success('Contract created from template')
      utils.contracts.list.invalidate()
      if (onSwitchToContract) {
        onSwitchToContract(data.id)
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create contract from template')
    },
  })

  /**
   * Revert to Draft mutation — moves contract back to DRAFT status
   * and invalidates the access token (sent links stop working).
   */
  const revertToDraftMutation = trpc.contracts.revertToDraft.useMutation({
    onSuccess: () => {
      setContractStatus('DRAFT')
      toast.success('Contract reverted to Draft — sent link has been invalidated')
      utils.contracts.list.invalidate()
      utils.contracts.getById.invalidate({ organizationId, id: contractId })
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to revert contract')
    },
  })

  /** Send contract mutation — sends email to recipient and changes status to SENT */
  const sendMutation = trpc.contracts.send.useMutation({
    onSuccess: (data) => {
      trackEvent(CLARITY_EVENTS.CONTRACT_SENT)
      setContractStatus('SENT')
      utils.contracts.list.invalidate()
      utils.contracts.getById.invalidate({ organizationId, id: contractId })

      /**
       * Show appropriate toast based on email delivery result.
       * Contract status is SENT regardless, but warn if the email didn't go through.
       */
      if (data.emailFailed) {
        toast.warning('Contract marked as sent, but the email failed to deliver', {
          description: data.emailError,
        })
      } else {
        toast.success('Contract sent successfully')
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send contract')
    },
  })

  const utils = trpc.useUtils()

  /**
   * Subscribe to Mochi AI contract events for real-time data refresh.
   * WHY: When Mochi AI updates contract metadata (name, recipient, status),
   * we invalidate the tRPC cache → React Query refetches → the existing
   * useEffect syncs new data into local state → UI updates naturally.
   * Content streaming events (contract_content, contract_content_complete)
   * are handled by ContractEditorInner separately.
   */
  useMochiEvents('contract', (event) => {
    if (event.entityId !== contractId) return
    /** Skip content streaming events — handled by the inner editor component */
    if (event.action === 'contract_content' || event.action === 'contract_content_complete') return
    utils.contracts.getById.invalidate({ organizationId, id: contractId })
  })

  // ============================================================================
  // LOCAL STATE
  // ============================================================================

  const [contractName, setContractName] = useState('')
  const [contractStatus, setContractStatus] = useState<ContractStatus>('DRAFT')
  const [contractDescription, setContractDescription] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)

  /** Contract variables — user-defined name/value pairs */
  const [contractVariables, setContractVariables] = useState<ContractVariable[]>([])

  /** Selected recipient lead — maps lead data to dynamic variables for instant preview */
  const [recipientLead, setRecipientLead] = useState<LeadOption | null>(null)

  /**
   * Fetch full lead data for the selected recipient — includes address,
   * city, state, zipCode, country, status, source, cltv for variable resolution.
   * WHY: LeadOption from lead-search-command only has basic fields (name, email, phone).
   * The variable system needs ALL lead fields (address, city, status, etc.).
   * Only fires when a recipient is selected (enabled: !!recipientLead).
   */
  const { data: fullLeadData } = trpc.leads.getById.useQuery(
    { organizationId, leadId: recipientLead?.id ?? '' },
    { enabled: !!recipientLead?.id, staleTime: 30000 }
  )

  /**
   * Fetch org data for organization variable resolution (name, logo, customDomain).
   * Fires once for the session and is cached aggressively.
   */
  const { data: orgData } = trpc.organizationSettings.getOrganizationSettings.useQuery(
    { organizationId },
    { staleTime: 60000 }
  )

  /** Lead search dialog hook — opens the reusable LeadSearchCommand dialog */
  const { openSearch: openRecipientSearch, LeadSearchDialog: RecipientSearchDialog } = useLeadSearch({
    organizationId,
    onSelect: (lead) => {
      setRecipientLead(lead)
      setIsDirty(true)
      setContentVersion((v) => v + 1)
    },
    selectedLeadId: recipientLead?.id,
    title: 'Select Recipient',
    placeholder: 'Search for a recipient...',
  })

  /** Remove the selected recipient and clear lead variable context */
  const handleRemoveRecipient = useCallback(() => {
    setRecipientLead(null)
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  /**
   * Content version counter — increments on each editor change.
   * WHY: The useAutoSave hook in the navbar watches this value to reset
   * its debounce timer. Using a counter instead of the full content string
   * avoids re-rendering the navbar with large serialized JSON on every keystroke.
   */
  const [contentVersion, setContentVersion] = useState(0)

  /** Latest content for saves — ref to avoid re-renders on each keystroke */
  const latestContentRef = useRef<string | null>(null)

  /** Whether this contract is a template */
  const isTemplate = contract?.isTemplate ?? false

  /**
   * Read-only mode — SENT and COMPLETED contracts cannot be edited.
   * WHY: Once sent, the contract content should be locked to preserve
   * the exact version the recipient received. COMPLETED means the recipient
   * has signed — editing a signed contract would invalidate the agreement.
   * Edit requires reverting to DRAFT first.
   */
  const isReadOnly = !isTemplate && (contractStatus === 'SENT' || contractStatus === 'COMPLETED')

  /** Sync local state when contract data loads */
  /**
   * Sync local state from server data.
   *
   * CRITICAL: Uses functional state updates with equality checks to prevent
   * unnecessary re-renders. Without these guards, every refetch creates new
   * array/object references that cascade through performSave → deferred save
   * effect → auto-save, causing "Maximum update depth exceeded" infinite loops.
   *
   * The pattern: `setPrev(prev => newVal !== prev ? newVal : prev)` ensures
   * React bails out of re-rendering when the value hasn't actually changed.
   */
  useEffect(() => {
    if (!contract) return

    setContractName((prev) => (contract.name !== prev ? contract.name : prev))
    setContractStatus((prev) => (contract.status !== prev ? contract.status : prev))
    setContractDescription((prev) => (contract.description !== prev ? contract.description : prev))

    /**
     * Cast needed: `variables` is a new Json? field added to the Contract model.
     * Until the developer runs the Prisma migration, the generated type won't include it.
     * At runtime, the value will be an array of ContractVariable or null/undefined.
     */
    const serverVars =
      ((contract as unknown as Record<string, unknown>).variables as ContractVariable[] | null) ?? []
    setContractVariables((prev) => {
      /** Deep-compare to avoid new array reference when data is unchanged */
      if (JSON.stringify(prev) === JSON.stringify(serverVars)) return prev
      console.log(`[ContractBuilder] Sync effect: overwriting ${prev.length} local vars with ${serverVars.length} server vars`)
      return serverVars
    })

    /**
     * Load recipient lead data if recipientId exists on the contract.
     * Cast needed: recipientId/recipient are new fields not yet in Prisma types.
     * The tRPC getById endpoint includes the recipient relation with lead fields.
     */
    const contractRecord = contract as unknown as Record<string, unknown>
    const recipientData = contractRecord.recipient as {
      id: string
      firstName: string | null
      lastName: string | null
      email: string
      phone: string | null
      avatarUrl: string | null
    } | null | undefined
    if (recipientData) {
      setRecipientLead((prev) => {
        /** Skip update if the same lead is already selected */
        if (prev?.id === recipientData.id) return prev
        return {
          id: recipientData.id,
          firstName: recipientData.firstName,
          lastName: recipientData.lastName,
          email: recipientData.email,
          phone: recipientData.phone,
          avatarUrl: recipientData.avatarUrl,
        }
      })
    }
  }, [contract])

  // ============================================================================
  // SAVE LOGIC
  // ============================================================================

  /**
   * Core save function — sends current state to the server.
   * Called by both auto-save (via useAutoSave in navbar) and manual save.
   */
  const performSave = useCallback(async () => {
    const content = latestContentRef.current
    console.log(`[ContractBuilder] performSave — variables: ${contractVariables.length}, hasContent: ${!!content}`)

    await updateMutation.mutateAsync({
      organizationId,
      id: contractId,
      name: contractName,
      description: contractDescription,
      status: contractStatus,
      content: content ? JSON.parse(content) : undefined,
      variables: contractVariables.length > 0 ? contractVariables : null,
      recipientId: recipientLead?.id ?? null,
    })

    setIsDirty(false)
    await Promise.all([
      utils.contracts.list.invalidate(),
      utils.contracts.getById.invalidate({ organizationId, id: contractId }),
    ])
  }, [contractId, organizationId, contractName, contractDescription, contractStatus, contractVariables, recipientLead, updateMutation, utils])

  /**
   * Send the contract — saves first to persist latest content,
   * then calls the send mutation which generates an accessToken,
   * sends an email to the recipient, and sets status to SENT.
   */
  const handleSend = useCallback(async () => {
    if (sendMutation.isPending || !recipientLead) return
    await performSave()
    await sendMutation.mutateAsync({ organizationId, id: contractId, recipientId: recipientLead.id })
  }, [sendMutation, recipientLead, performSave, organizationId, contractId])

  /**
   * Revert to Draft handler — moves the contract back to DRAFT
   * and invalidates the sent link so it can no longer be accessed.
   */
  const handleRevertToDraft = useCallback(() => {
    if (revertToDraftMutation.isPending) return
    revertToDraftMutation.mutate({ organizationId, id: contractId })
  }, [revertToDraftMutation, organizationId, contractId])

  /**
   * Handle editor content changes — stores content and bumps version.
   * WHY: We store the serialized content in a ref (no re-render) and
   * increment contentVersion (triggers auto-save debounce via navbar).
   */
  const handleContentChange = useCallback(
    (content: string) => {
      latestContentRef.current = content
      setIsDirty(true)
      setContentVersion((v) => v + 1)
    },
    []
  )

  const handleNameChange = useCallback((name: string) => {
    setContractName(name)
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  const handleStatusChange = useCallback((status: ContractStatus) => {
    setContractStatus(status)
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  /* NOTE: description input removed from sidebar but state kept for save */

  // ============================================================================
  // CONTRACT VARIABLE CRUD
  // ============================================================================

  /** Add a new empty contract variable with a stable nanoid */
  const handleAddVariable = useCallback(() => {
    const newVar: ContractVariable = { id: nanoid(10), name: '', value: '' }
    setContractVariables((prev) => [...prev, newVar])
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  /** Update a contract variable's name or value */
  const handleUpdateVariable = useCallback(
    (id: string, updates: Partial<Pick<ContractVariable, 'name' | 'value'>>) => {
      setContractVariables((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...updates } : v))
      )
      setIsDirty(true)
      setContentVersion((v) => v + 1)
    },
    []
  )

  /** Remove a contract variable by id */
  const handleRemoveVariable = useCallback((id: string) => {
    setContractVariables((prev) => prev.filter((v) => v.id !== id))
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  /**
   * Deferred save pending flag — set by AI generation completion or batch variable add.
   *
   * WHY: When AI finishes, receiveComplete() calls onVariablesCreated() → handleBatchAddVariables()
   * which updates contractVariables. Then handleAIComplete() fires. If we called performSave()
   * immediately, the closure would capture STALE contractVariables (React hasn't flushed yet).
   *
   * Instead, both handleBatchAddVariables and handleAIGenerationDone set this flag.
   * A useEffect watches it and calls performSave() AFTER React has flushed ALL state
   * updates — ensuring correct contractVariables, content, and recipient are persisted.
   */
  const [aiSavePending, setAISavePending] = useState(false)

  /**
   * Batch-add multiple contract variables at once.
   * WHY: When AI generates [CONTRACT_VAR: ...] markers, the post-processor
   * extracts them and creates ContractVariable objects. This callback
   * merges them all into state in a single update. The deferred save
   * (aiSavePending) ensures variables persist after React flushes state.
   */
  const handleBatchAddVariables = useCallback((newVars: ContractVariable[]) => {
    console.log(`[ContractBuilder] handleBatchAddVariables — adding ${newVars.length} vars:`, newVars.map(v => v.name))
    setContractVariables((prev) => [...prev, ...newVars])
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  /**
   * Signal from the inner component that AI generation is done.
   * Sets the deferred save flag — the effect below picks it up after React flushes.
   */
  const handleAIGenerationDone = useCallback(() => {
    console.log('[ContractBuilder] handleAIGenerationDone — setting aiSavePending=true')
    setAISavePending(true)
  }, [])

  /**
   * Stable ref for performSave — avoids the deferred save effect re-firing
   * whenever performSave's closure changes (e.g., when contractVariables
   * update causes a new function reference).
   *
   * WHY: performSave depends on many state values (contractName, contractVariables,
   * recipientLead, etc.). Each state change creates a new performSave reference.
   * If the deferred save effect depended directly on performSave, it would re-run
   * on every state change — even when aiSavePending is false — contributing to
   * cascading re-renders that cause "Maximum update depth exceeded".
   *
   * With a ref, the effect only fires when aiSavePending changes to true.
   */
  const performSaveRef = useRef(performSave)
  performSaveRef.current = performSave

  /**
   * Re-entrance guard — prevents cascading save loops.
   *
   * WHY: Without this, the cycle save → invalidate → refetch → sync effect
   * → state update → new render → could potentially re-trigger the save
   * if aiSavePending gets set again during the save process. This ref
   * ensures only one deferred save runs at a time.
   */
  const aiSaveInProgressRef = useRef(false)

  /**
   * Deferred save — fires AFTER React has flushed all state updates from AI generation.
   *
   * WHY: AI generation triggers multiple state updates in quick succession:
   * 1. Editor content (via OnChangePlugin → latestContentRef)
   * 2. Contract variables (via onVariablesCreated → handleBatchAddVariables)
   * 3. AI save pending flag (via handleAIGenerationDone)
   *
   * React batches these updates and re-renders once. This effect fires in the
   * NEXT render cycle, when performSaveRef.current reads the LATEST closure
   * with correct state. Single save, correct data, no race condition.
   */
  useEffect(() => {
    if (!aiSavePending || aiSaveInProgressRef.current) return
    console.log(`[ContractBuilder] Deferred save firing — contractVariables: ${contractVariables.length}`)
    setAISavePending(false)
    aiSaveInProgressRef.current = true
    performSaveRef.current()
      .then(() => console.log('[ContractBuilder] Deferred save completed successfully'))
      .catch((err) => console.error('[ContractBuilder] Deferred save FAILED:', err))
      .finally(() => { aiSaveInProgressRef.current = false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSavePending])

  /**
   * "Use Template" handler — creates a new contract instance from this template.
   */
  const handleUseTemplate = useCallback(() => {
    if (createFromTemplateMutation.isPending) return

    createFromTemplateMutation.mutate({
      organizationId,
      templateId: contractId,
    })
  }, [organizationId, contractId, createFromTemplateMutation])

  // ============================================================================
  // COMPLETED CONTRACT — signee data for signing context wrapping
  // ============================================================================

  /**
   * Raw signee data extracted from the contract record.
   * WHY: Extracted outside useMemo to avoid TS2589 "excessively deep" error
   * from putting the full `contract` tRPC type in useMemo dependencies.
   */
  const rawSigneeData = contract
    ? ((contract as unknown as Record<string, unknown>).signeeData as Record<string, unknown> | null | undefined)
    : null

  /** Raw contract content — extracted via cast to avoid TS2589 from the full contract type */
  const rawContractContent = contract
    ? (contract as unknown as Record<string, unknown>).content
    : null

  /**
   * Extract signee data from the contract record for COMPLETED contracts.
   * WHY: When viewing a completed contract in the builder, the editor wraps in
   * SigningProvider so nodes render the submitted field values and signed signatures
   * instead of builder placeholders. Uses baked data frozen at signing time.
   *
   * Runs remapSigneeDataKeys() to handle backwards compatibility: old signeeData
   * stored values keyed by ephemeral Lexical node keys. The remapper converts
   * those to stable label-based keys by walking the contract content tree.
   */
  const completedSigneeData = useMemo(() => {
    if (contractStatus !== 'COMPLETED' || !rawSigneeData) return null
    const raw = {
      fieldValues: (rawSigneeData.fieldValues as Record<string, string>) ?? {},
      signatureStates: (rawSigneeData.signatureStates as Record<string, boolean>) ?? {},
    }
    /** Remap old numeric keys → label-based keys using contract content */
    return remapSigneeDataKeys(raw, rawContractContent)
  }, [rawSigneeData, contractStatus, rawContractContent])

  /**
   * Resolve the signer's display name for COMPLETED contracts.
   * WHY: SignatureNode needs the real recipient's name (not "Example Name").
   * First tries bakedVariableValues (frozen at signing time), then falls back
   * to current lead data from the recipient relation.
   */
  const completedSignerName = useMemo(() => {
    if (contractStatus !== 'COMPLETED') return ''
    /** Try baked values first — frozen at signing time, most accurate */
    const baked = rawSigneeData?.bakedVariableValues as Record<string, string> | undefined
    if (baked?.['lead.fullName']) return baked['lead.fullName']
    const bakedParts = [baked?.['lead.firstName'], baked?.['lead.lastName']].filter(Boolean) as string[]
    if (bakedParts.length > 0) return bakedParts.join(' ')
    /** Fallback to current recipient lead data */
    if (recipientLead) {
      return [recipientLead.firstName, recipientLead.lastName].filter(Boolean).join(' ') || ''
    }
    return ''
  }, [rawSigneeData, contractStatus, recipientLead])

  // ============================================================================
  // EDITOR CONFIG
  // ============================================================================

  const initialConfig = useMemo(
    () => ({
      namespace: 'ContractBuilder',
      theme: editorTheme,
      nodes: contractNodes,
      editable: true,
      onError: (error: Error) => {
        console.error('Contract editor error:', error)
      },
      editorState: rawContractContent
        ? (editor: LexicalEditor) => {
            try {
              const contentStr =
                typeof rawContractContent === 'string'
                  ? rawContractContent
                  : JSON.stringify(rawContractContent)
              const state = editor.parseEditorState(contentStr)
              editor.setEditorState(state)
            } catch {
              console.warn('Failed to parse contract content, starting empty')
            }
          }
        : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contract?.id]
  )

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (isLoading || !contract) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading contract...</p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  /**
   * The editor content — LexicalComposer + ContractEditorInner.
   * For COMPLETED contracts, this is wrapped in SigningProvider so nodes
   * render the submitted field values and signed signatures.
   */
  const editorContent = (
    <LexicalComposer key={contract.id} initialConfig={initialConfig}>
      <ContractEditorInner
        organizationId={organizationId}
        contractName={contractName}
        contractStatus={contractStatus}
        isTemplate={isTemplate}
        isDirty={isDirty}
        isSaving={updateMutation.isPending}
        isCreatingFromTemplate={createFromTemplateMutation.isPending}
        contentVersion={contentVersion}
        autoSaveEnabled={autoSaveEnabled}
        contractVariables={contractVariables}
        onContentChange={handleContentChange}
        onNameChange={handleNameChange}
        onStatusChange={handleStatusChange}
        onAutoSaveChange={setAutoSaveEnabled}
        onSave={performSave}
        onClose={onClose}
        onUseTemplate={handleUseTemplate}
        onAddVariable={handleAddVariable}
        onUpdateVariable={handleUpdateVariable}
        onRemoveVariable={handleRemoveVariable}
        onBatchAddVariables={handleBatchAddVariables}
        recipientLead={recipientLead}
        fullLeadData={fullLeadData}
        orgData={orgData}
        onSelectRecipient={openRecipientSearch}
        onRemoveRecipient={handleRemoveRecipient}
        onSend={handleSend}
        isSending={sendMutation.isPending}
        isReadOnly={isReadOnly}
        onRevertToDraft={handleRevertToDraft}
        isReverting={revertToDraftMutation.isPending}
        contractId={contractId}
        onAIGenerationDone={handleAIGenerationDone}
      />
    </LexicalComposer>
  )

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/**
       * COMPLETED contracts: Wrap in SigningProvider so decorator nodes
       * (InputFieldNode, SignatureNode) render submitted data instead of
       * builder placeholders. isCompleted=true locks all fields to read-only.
       */}
      {contractStatus === 'COMPLETED' ? (
        <SigningProvider
          isCompleted
          signerDisplayName={completedSignerName}
          initialSigneeData={completedSigneeData}
        >
          {editorContent}
        </SigningProvider>
      ) : (
        editorContent
      )}
      {/* Lead search dialog — rendered outside LexicalComposer to avoid z-index issues */}
      <RecipientSearchDialog />
    </div>
  )
}
