'use client'

/**
 * Contract Builder Navbar — Minimal Floating Toolbar
 *
 * Matches the automation builder navbar pattern: compact floating toolbar
 * with ghost icon buttons, tooltips, undo/redo, auto-save toggle, and
 * save button with state indicators (red dot / spinner / checkmark).
 *
 * Adapts UI based on whether the user is editing a TEMPLATE or CONTRACT:
 * - TEMPLATE: Shows "Template" badge, "Use Template" button
 * - CONTRACT: Status dropdown (DRAFT, SENT, COMPLETED, ARCHIVED)
 *
 * SOURCE OF TRUTH: ContractStatus from Prisma, useAutoSave from hooks
 * Keywords: CONTRACT_BUILDER_NAVBAR, CONTRACT_NAV, CONTRACT_TOOLBAR
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  SaveIcon,
  Loader2Icon,
  CheckIcon,
  Undo2,
  Redo2,
  Copy,
  Braces,
  Send,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAutoSave } from '@/hooks/use-auto-save'
import { VariablePicker } from '@/components/global/variable-picker'
import {
  SHARED_CATEGORIES,
  type VariableCategory,
} from '@/lib/variables/variable-categories'
import type { ContractStatus } from '@/generated/prisma'
import type { LeadOption } from '@/components/leads/lead-search-command'
import type { ContractVariable } from '../_lib/types'

// ============================================================================
// STATUS CONFIG
// ============================================================================

/**
 * Maps each ContractStatus to its label and badge color classes.
 * Compact pills — no hover needed since the dropdown trigger handles that.
 */
const STATUS_CONFIG: Record<
  ContractStatus,
  { label: string; bgClass: string; colorClass: string }
> = {
  DRAFT: {
    label: 'Draft',
    bgClass: 'bg-muted',
    colorClass: 'text-muted-foreground',
  },
  ACTIVE: {
    label: 'Active',
    bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
  },
  SENT: {
    label: 'Sent',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    colorClass: 'text-blue-700 dark:text-blue-400',
  },
  COMPLETED: {
    label: 'Completed',
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
    colorClass: 'text-violet-700 dark:text-violet-400',
  },
  ARCHIVED: {
    label: 'Archived',
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    colorClass: 'text-amber-700 dark:text-amber-400',
  },
}

// ============================================================================
// TYPES
// ============================================================================

interface ContractBuilderNavbarProps {
  /** Current contract name */
  contractName: string
  /** Current contract status */
  contractStatus: ContractStatus
  /** Whether this is a template (true) or a contract instance (false) */
  isTemplate: boolean
  /** Whether the contract has unsaved changes */
  isDirty: boolean
  /** Whether a manual save is in progress */
  isSaving: boolean
  /** Whether "Use Template" creation is in progress */
  isCreatingFromTemplate: boolean
  /** Reactive data version — increments on each content change for auto-save tracking */
  contentVersion: number
  /** Whether auto-save is enabled */
  autoSaveEnabled: boolean
  /** Whether undo is available (from Lexical history) */
  canUndo: boolean
  /** Whether redo is available (from Lexical history) */
  canRedo: boolean
  /** Callback when auto-save toggle changes */
  onAutoSaveChange: (enabled: boolean) => void
  /** Callback when name changes */
  onNameChange: (name: string) => void
  /** Callback when status changes */
  onStatusChange: (status: ContractStatus) => void
  /** Callback to trigger save — must be async for useAutoSave */
  onSave: () => Promise<void>
  /** Callback to close the builder */
  onClose: () => void
  /** Callback to create a contract from this template (only when isTemplate=true) */
  onUseTemplate: () => void
  /** Callback to trigger undo via Lexical */
  onUndo: () => void
  /** Callback to trigger redo via Lexical */
  onRedo: () => void
  /** Callback when a variable is selected from the VariablePicker */
  onInsertVariable: (variableKey: string) => void
  /** User-defined contract variables — displayed as a dynamic category in the VariablePicker */
  contractVariables: ContractVariable[]
  /** Currently selected recipient lead — controls Send button visibility */
  recipientLead: LeadOption | null
  /** Callback to send the contract — parent handles save + tRPC call */
  onSend: () => Promise<void>
  /** Whether the send mutation is in progress */
  isSending: boolean
  /**
   * Whether the builder is in read-only mode (SENT status).
   * WHY: SENT contracts must not be edited — the only way to edit
   * is to revert back to DRAFT first.
   */
  isReadOnly: boolean
  /** Callback to revert the contract from SENT back to DRAFT */
  onRevertToDraft: () => void
  /** Whether the revert mutation is in progress */
  isReverting: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ContractBuilderNavbar({
  contractName,
  contractStatus,
  isTemplate,
  isDirty,
  isSaving,
  isCreatingFromTemplate,
  contentVersion,
  autoSaveEnabled,
  canUndo,
  canRedo,
  onAutoSaveChange,
  onNameChange,
  onStatusChange,
  onSave,
  onClose,
  onUseTemplate,
  onUndo,
  onRedo,
  onInsertVariable,
  contractVariables,
  recipientLead,
  onSend,
  isSending,
  isReadOnly,
  onRevertToDraft,
  isReverting,
}: ContractBuilderNavbarProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [localName, setLocalName] = useState(contractName)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [manualJustSaved, setManualJustSaved] = useState(false)

  /**
   * Auto-save hook — watches contentVersion for changes.
   * contentVersion is a counter that increments on each editor change,
   * so the hook resets its debounce timer appropriately.
   */
  const { isAutoSaving, justSaved } = useAutoSave({
    data: contentVersion,
    isDirty,
    autoSaveEnabled,
    onSave,
    debounceMs: 2000,
  })

  /** Sync local name state when prop changes from external save */
  useEffect(() => {
    if (!isEditingName) {
      setLocalName(contractName)
    }
  }, [contractName, isEditingName])

  /** Commit the name change and exit edit mode */
  const commitName = useCallback(() => {
    const trimmed = localName.trim()
    if (trimmed && trimmed !== contractName) {
      onNameChange(trimmed)
    } else if (!trimmed) {
      setLocalName(contractName)
    }
    setIsEditingName(false)
  }, [localName, contractName, onNameChange])

  /** Handle keyboard events — Enter commits, Escape cancels */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitName()
      } else if (e.key === 'Escape') {
        setLocalName(contractName)
        setIsEditingName(false)
      }
    },
    [commitName, contractName]
  )

  /**
   * Handle manual save button click.
   * Only works when auto-save is disabled.
   * Shows "Saved" feedback briefly after successful save.
   */
  const handleSave = useCallback(async () => {
    if (autoSaveEnabled) return

    try {
      const MIN_SPINNER_MS = 800
      await Promise.all([
        onSave(),
        new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS)),
      ])
      setManualJustSaved(true)
      setTimeout(() => setManualJustSaved(false), 2000)
    } catch {
      /* Error handled by mutation's onError */
    }
  }, [onSave, autoSaveEnabled])

  /** Handle close with unsaved changes confirmation */
  const handleClose = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      )
      if (!confirmed) return
    }
    onClose()
  }, [isDirty, onClose])

  const statusConfig = STATUS_CONFIG[contractStatus]

  /**
   * Build VariablePicker categories with a dynamic "Contract Variables" category.
   * WHY: Users should be able to browse and insert their custom contract variables
   * from the same picker that shows system variables (Lead, Organization, etc.).
   * Only shown if at least one named contract variable exists.
   */
  const pickerCategories = useMemo((): VariableCategory[] => {
    const namedVars = contractVariables.filter((v) => v.name.trim())
    if (namedVars.length === 0) return SHARED_CATEGORIES

    const contractCategory: VariableCategory = {
      id: 'contract-variables',
      label: 'Contract Variables',
      icon: Braces,
      variables: namedVars.map((v) => ({
        key: `contract.${v.id}`,
        label: v.name,
      })),
    }
    return [...SHARED_CATEGORIES, contractCategory]
  }, [contractVariables])

  return (
    <TooltipProvider delayDuration={300}>
      {/* Floating toolbar — overlays the editor with no background separation */}
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 h-12">
        {/* Left — Back button, name, and status/template badge */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-7 w-7 shrink-0"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to Contracts</TooltipContent>
          </Tooltip>

          {/* Contract name — editable in DRAFT, read-only in SENT */}
          <div className="flex items-center gap-2 min-w-0">
            {isReadOnly ? (
              /** Read-only name — no click-to-edit when contract is SENT */
              <span className="text-sm font-medium text-left truncate max-w-44">
                {contractName || 'Untitled Contract'}
              </span>
            ) : isEditingName ? (
              <Input
                ref={nameInputRef}
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={commitName}
                onKeyDown={handleNameKeyDown}
                autoFocus
                className="h-6 w-40 text-sm font-medium px-1.5"
                maxLength={200}
              />
            ) : (
              <button
                onClick={() => {
                  setLocalName(contractName)
                  setIsEditingName(true)
                }}
                className="text-sm font-medium text-left truncate max-w-44 hover:text-primary transition-colors cursor-text focus:outline-none"
                title="Click to edit name"
              >
                {contractName || (isTemplate ? 'Untitled Template' : 'Untitled Contract')}
              </button>
            )}

            {/* Status badge — read-only pill (status changes via actions only) */}
            {!isTemplate ? (
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                  statusConfig.bgClass,
                  statusConfig.colorClass
                )}
              >
                {statusConfig.label}
              </span>
            ) : (
              /* Template badge — static, no dropdown */
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                Template
              </span>
            )}

            {/**
             * Warning note — only shown for SENT status (not COMPLETED).
             * WHY: SENT contracts can be reverted to DRAFT for editing.
             * COMPLETED (signed) contracts are permanently locked.
             */}
            {contractStatus === 'SENT' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground/70 bg-muted/50">
                    <AlertTriangle className="h-3 w-3" />
                    Edit in Draft
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-52 text-xs">
                  In order to edit this contract, you need to move it to draft
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Right side controls — hidden when read-only, except Revert + Theme */}
        <div className="flex items-center gap-1">
          {isReadOnly ? (
            /**
             * Read-only mode (SENT or COMPLETED) — limited controls.
             * SENT: Show "Revert to Draft" button so user can unlock editing.
             * COMPLETED: No revert — a signed contract must not be reverted.
             * Both: Theme toggle always visible.
             */
            <>
              {/* Revert to Draft — only for SENT contracts, never for COMPLETED */}
              {contractStatus === 'SENT' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onRevertToDraft}
                      disabled={isReverting}
                      className="h-7 text-xs gap-1.5 mr-1"
                    >
                      {isReverting ? (
                        <Loader2Icon className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Revert to Draft
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-52 text-xs">
                    Move back to DRAFT. This will invalidate the sent link.
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Theme toggle */}
              <div className="[&_button]:h-7 [&_button]:w-7 [&_button]:border-0 [&_button]:bg-transparent">
                <ThemeToggle />
              </div>
            </>
          ) : (
            /**
             * Normal editing mode (DRAFT / template) — full toolbar with
             * Send, Variables, Use Template, Undo/Redo, Auto-save, Save, Theme.
             */
            <>
              {/* Send button — only shown for DRAFT contracts with a recipient selected */}
              {!isTemplate && contractStatus === 'DRAFT' && recipientLead && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onSend}
                      disabled={isSending || isSaving}
                      className="h-7 text-xs gap-1.5 mr-1 text-primary hover:text-primary"
                    >
                      {isSending ? (
                        <Loader2Icon className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      Send
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Send contract to {recipientLead.email}</TooltipContent>
                </Tooltip>
              )}

              {/* Variable Picker — shows system + contract variables in the popover */}
              <VariablePicker
                onInsert={(variable) => {
                  /** VariablePicker returns {{key}} — strip braces and pass the raw key */
                  const key = variable.slice(2, -2)
                  onInsertVariable(key)
                }}
                categories={pickerCategories}
                className="h-7 text-xs border-0 bg-transparent hover:bg-accent"
              />

              {/* "Use Template" button — only shown when editing a template */}
              {isTemplate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onUseTemplate}
                      disabled={isCreatingFromTemplate}
                      className="h-7 text-xs gap-1 mr-1"
                    >
                      {isCreatingFromTemplate ? (
                        <Loader2Icon className="h-3 w-3 animate-spin" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      Use Template
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Create a contract from this template</TooltipContent>
                </Tooltip>
              )}

              {/* Undo */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="h-7 w-7"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>

              {/* Redo */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="h-7 w-7"
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
              </Tooltip>

              {/* Auto-save toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 ml-1">
                    <Switch
                      id="contract-auto-save"
                      checked={autoSaveEnabled}
                      onCheckedChange={onAutoSaveChange}
                      className="data-[state=checked]:bg-primary scale-75"
                    />
                    <Label
                      htmlFor="contract-auto-save"
                      className="text-[11px] text-muted-foreground cursor-pointer whitespace-nowrap"
                    >
                      Auto
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>{autoSaveEnabled ? 'Auto-save is on' : 'Auto-save is off'}</TooltipContent>
              </Tooltip>

              {/* Save button — compact icon with state indicators */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSave}
                    disabled={isSaving || isAutoSaving || !isDirty || autoSaveEnabled}
                    className="h-7 w-7 relative"
                  >
                    {/* Red dot for unsaved changes */}
                    {isDirty && !isSaving && !isAutoSaving && !justSaved && !manualJustSaved && (
                      <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 bg-destructive rounded-full" />
                    )}
                    {isSaving || isAutoSaving ? (
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    ) : justSaved || manualJustSaved ? (
                      <CheckIcon className="h-3.5 w-3.5" />
                    ) : (
                      <SaveIcon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isSaving || isAutoSaving
                    ? 'Saving...'
                    : justSaved || manualJustSaved
                      ? 'Saved'
                      : autoSaveEnabled
                        ? 'Auto-save is enabled'
                        : isDirty
                          ? 'Save changes (Ctrl+S)'
                          : 'No unsaved changes'}
                </TooltipContent>
              </Tooltip>

              {/* Theme toggle — scaled to match toolbar button sizing */}
              <div className="[&_button]:h-7 [&_button]:w-7 [&_button]:border-0 [&_button]:bg-transparent">
                <ThemeToggle />
              </div>
            </>
          )}
        </div>
      </header>
    </TooltipProvider>
  )
}
