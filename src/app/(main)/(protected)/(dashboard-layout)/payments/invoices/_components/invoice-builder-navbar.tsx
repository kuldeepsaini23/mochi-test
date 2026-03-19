'use client'

/**
 * Invoice Builder Navbar — Minimal Floating Toolbar
 *
 * Matches the contract builder navbar pattern: compact floating toolbar
 * with ghost icon buttons, tooltips, auto-save toggle, and save button
 * with state indicators (red dot / spinner / checkmark).
 *
 * Simpler than contract navbar — no undo/redo, no variable picker (that's in notes),
 * no template support. Adds: Copy Link, Mark Paid.
 *
 * SOURCE OF TRUTH: InvoiceStatus from Prisma, useAutoSave from hooks
 * Keywords: INVOICE_BUILDER_NAVBAR, INVOICE_NAV, INVOICE_TOOLBAR
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  SaveIcon,
  Loader2Icon,
  CheckIcon,
  Send,
  Copy,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAutoSave } from '@/hooks/use-auto-save'
import { INVOICE_STATUS_CONFIG } from './utils'
import type { InvoiceStatus } from './builder-types'
import type { LeadOption } from '@/components/leads/lead-search-command'

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceBuilderNavbarProps {
  /** Current invoice name */
  invoiceName: string
  /** Current invoice status */
  invoiceStatus: InvoiceStatus
  /** Whether the invoice has unsaved changes */
  isDirty: boolean
  /** Whether a manual save is in progress */
  isSaving: boolean
  /** Reactive data version — increments on each change for auto-save tracking */
  contentVersion: number
  /** Whether auto-save is enabled */
  autoSaveEnabled: boolean
  /** Callback when auto-save toggle changes */
  onAutoSaveChange: (enabled: boolean) => void
  /** Callback when name changes */
  onNameChange: (name: string) => void
  /** Callback to trigger save — must be async for useAutoSave */
  onSave: () => Promise<void>
  /** Callback to close the builder */
  onClose: () => void
  /** Currently selected recipient lead */
  recipientLead: LeadOption | null
  /** Callback to send the invoice with email (DRAFT → SENT + email notification) */
  onSend: () => Promise<void>
  /** Callback to mark the invoice as sent without emailing (DRAFT → SENT only) */
  onMarkAsSent: () => Promise<void>
  /** Whether the send mutation is in progress */
  isSending: boolean
  /** Public access token — present after invoice is sent */
  accessToken: string | null
  /** Callback to manually mark invoice as paid */
  onMarkPaid: () => void
  /** Whether the mark paid mutation is in progress */
  isMarkingPaid: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoiceBuilderNavbar({
  invoiceName,
  invoiceStatus,
  isDirty,
  isSaving,
  contentVersion,
  autoSaveEnabled,
  onAutoSaveChange,
  onNameChange,
  onSave,
  onClose,
  recipientLead,
  onSend,
  onMarkAsSent,
  isSending,
  accessToken,
  onMarkPaid,
  isMarkingPaid,
}: InvoiceBuilderNavbarProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [localName, setLocalName] = useState(invoiceName)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [manualJustSaved, setManualJustSaved] = useState(false)

  /**
   * Auto-save hook — watches contentVersion for changes.
   * contentVersion increments on each builder change (items, notes, lead, etc.)
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
      setLocalName(invoiceName)
    }
  }, [invoiceName, isEditingName])

  /** Commit the name change and exit edit mode */
  const commitName = useCallback(() => {
    const trimmed = localName.trim()
    if (trimmed && trimmed !== invoiceName) {
      onNameChange(trimmed)
    } else if (!trimmed) {
      setLocalName(invoiceName)
    }
    setIsEditingName(false)
  }, [localName, invoiceName, onNameChange])

  /** Handle keyboard events — Enter commits, Escape cancels */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitName()
      } else if (e.key === 'Escape') {
        setLocalName(invoiceName)
        setIsEditingName(false)
      }
    },
    [commitName, invoiceName]
  )

  /**
   * Handle manual save button click.
   * Only works when auto-save is disabled.
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

  /**
   * Copy the public invoice link to clipboard.
   * Uses navigator.clipboard with textarea fallback for non-secure contexts (HTTP).
   */
  const handleCopyLink = useCallback(async () => {
    if (!accessToken) return
    const url = `${window.location.origin}/invoice/${accessToken}`
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = url
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      toast.success('Invoice link copied to clipboard')
    } catch {
      toast.error('Failed to copy link')
    }
  }, [accessToken])

  const statusConfig = INVOICE_STATUS_CONFIG[invoiceStatus]

  /** Whether the invoice can be edited (only DRAFT and SENT are editable) */
  const isEditable = invoiceStatus === 'DRAFT' || invoiceStatus === 'SENT'

  return (
    <TooltipProvider delayDuration={300}>
      {/* Floating toolbar — overlays the muted bg content area, z-30 to sit above the sidebar (z-20) */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-12">
        {/* Left — Back button, name, and status badge */}
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
            <TooltipContent>Back to Invoices</TooltipContent>
          </Tooltip>

          {/* Invoice name — editable when in editable status */}
          <div className="flex items-center gap-2 min-w-0">
            {!isEditable ? (
              <span className="text-sm font-medium text-left truncate max-w-44">
                {invoiceName || 'Untitled Invoice'}
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
                  setLocalName(invoiceName)
                  setIsEditingName(true)
                }}
                className="text-sm font-medium text-left truncate max-w-44 hover:text-primary transition-colors cursor-text focus:outline-none"
                title="Click to edit name"
              >
                {invoiceName || 'Untitled Invoice'}
              </button>
            )}

            {/* Status badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium',
                statusConfig.bgClass,
                statusConfig.colorClass
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dotClass)} />
              {statusConfig.label}
            </span>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1">
          {/* Send dropdown — DRAFT invoices with a lead get two options:
              1. "Mark as Sent" — transitions status without emailing
              2. "Send to {email}" — transitions status AND sends email notification */}
          {invoiceStatus === 'DRAFT' && recipientLead && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSending || isSaving}
                  className="h-7 text-xs gap-1 mr-1 text-primary hover:text-primary"
                >
                  {isSending ? (
                    <Loader2Icon className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Send
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onMarkAsSent} disabled={isSending}>
                  Mark as Sent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSend} disabled={isSending}>
                  Send to {recipientLead.email}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mark Paid button — only SENT or OVERDUE invoices */}
          {(invoiceStatus === 'SENT' || invoiceStatus === 'OVERDUE') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkPaid}
                  disabled={isMarkingPaid}
                  className="h-7 text-xs gap-1.5 mr-1"
                >
                  {isMarkingPaid ? (
                    <Loader2Icon className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Mark Paid
                </Button>
              </TooltipTrigger>
              <TooltipContent>Manually mark this invoice as paid</TooltipContent>
            </Tooltip>
          )}

          {/* Copy Link button — available when accessToken exists */}
          {accessToken && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyLink}
                    className="h-7 w-7"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy invoice link</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(`/invoice/${accessToken}`, '_blank')}
                    className="h-7 w-7"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open public invoice</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Auto-save toggle — only shown when invoice is editable */}
          {isEditable && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 ml-1">
                    <Switch
                      id="invoice-auto-save"
                      checked={autoSaveEnabled}
                      onCheckedChange={onAutoSaveChange}
                      className="data-[state=checked]:bg-primary scale-75"
                    />
                    <Label
                      htmlFor="invoice-auto-save"
                      className="text-[11px] text-muted-foreground cursor-pointer whitespace-nowrap"
                    >
                      Auto
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {autoSaveEnabled ? 'Auto-save is on' : 'Auto-save is off'}
                </TooltipContent>
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
            </>
          )}

          {/* Theme toggle */}
          <div className="[&_button]:h-7 [&_button]:w-7 [&_button]:border-0 [&_button]:bg-transparent">
            <ThemeToggle />
          </div>
        </div>
      </header>
    </TooltipProvider>
  )
}
