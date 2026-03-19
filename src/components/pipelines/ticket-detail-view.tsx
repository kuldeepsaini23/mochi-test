'use client'

/**
 * TicketDetailPanel Component - Premium Ticket Detail View
 *
 * A clean, modern panel that overlays the pipeline board.
 * Inspired by Linear/Notion - minimal, no clutter, beautiful typography.
 *
 * Layout: 2-column (Main Content | Properties Sidebar)
 * - Main content: Title, description
 * - Sidebar: Timestamps (small at top), Assignee, Lead, Deadline, Value
 *
 * SOURCE OF TRUTH: Uses PipelineTicket type from @/types/pipeline
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { X, User, Flag, Target, DollarSign, Loader2, Check, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  TeamSearchCommand,
  type TeamMemberOption,
} from '@/components/team/team-search-command'
import {
  LeadSearchCommand,
  type LeadOption,
} from '@/components/leads/lead-search-command'
import type { PipelineTicket, PipelineTeamMember } from '@/types/pipeline'
import { getLeadAvatarColor } from '@/lib/utils/lead-helpers'
import { getTextColorForBackground } from '@/constants/colors'
import { PriceInput } from '@/components/global/price-input'
import { RichTextEditor } from '@/components/editor'
import { trpc } from '@/trpc/react-provider'
import { LeadSheet } from '@/app/(main)/(protected)/(dashboard-layout)/leads/_components/lead-sheet'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for edit mode - viewing/editing an existing ticket
 * WHY: onUpdate is optional to support read-only view mode for users without update permission
 */
interface EditModeProps {
  mode: 'edit'
  ticket: PipelineTicket
  /**
   * Handler to update ticket fields
   * Optional - if undefined, ticket is displayed in read-only mode (no editing allowed)
   * WHY: Users without pipelines:update permission can view but not edit
   */
  onUpdate?: (data: {
    id: string
    title?: string
    description?: string | null
    assignedToId?: string | null
    leadId?: string | null
    lead?: { id: string; firstName: string | null; lastName: string | null; email: string; phone: string | null; avatarUrl: string | null } | null
    deadline?: Date | null
    value?: number | null
  }) => Promise<void>
}

/**
 * Props for create mode - creating a new ticket
 */
interface CreateModeProps {
  mode: 'create'
  laneId: string
  onCreate: (data: {
    laneId: string
    title: string
    description?: string | null
    assignedToId?: string | null
    deadline?: Date | null
    value?: number | null
  }) => Promise<void>
}

/**
 * Common props for both modes
 */
interface CommonProps {
  organizationId: string
  members: PipelineTeamMember[]
  onClose: () => void
  /**
   * Fast description-only update handler (edit mode only)
   * WHY: Optimized for auto-save during typing - uses faster endpoint
   */
  onUpdateDescription?: (ticketId: string, description: string | null) => Promise<void>
}

type TicketDetailPanelProps = CommonProps & (EditModeProps | CreateModeProps)

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return format(date, 'MMM d, yyyy')
}

/**
 * Format relative time
 */
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
  return formatDate(date)
}

/**
 * Get initials from name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TicketDetailPanel(props: TicketDetailPanelProps) {
  const { organizationId, members, onClose, onUpdateDescription } = props

  const isCreateMode = props.mode === 'create'
  const ticket = isCreateMode ? null : props.ticket

  /**
   * Read-only mode flag - true when user cannot edit
   * WHY: Users without pipelines:update permission can view but not edit
   * In edit mode, readOnly is true if onUpdate is not provided
   * In create mode, readOnly is always false (user has create permission)
   */
  const readOnly = !isCreateMode && !props.onUpdate

  // ============================================================================
  // STATE
  // ============================================================================

  const [title, setTitle] = useState(ticket?.title ?? '')
  const [description, setDescription] = useState(ticket?.description ?? '')
  const [assignedToId, setAssignedToId] = useState<string | null>(
    ticket?.assignedTo?.id ?? null
  )
  const [isEditingTitle, setIsEditingTitle] = useState(isCreateMode)
  const [isCreating, setIsCreating] = useState(false)

  /**
   * Saving state for showing save indicator in header
   * isSaving: true while an update is in progress (shows spinner)
   * showSaved: true briefly after save completes (shows checkmark)
   * isEditorPending: true while editor is debouncing (user is typing)
   */
  const [isSaving, setIsSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [isEditorPending, setIsEditorPending] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Track last saved description content
   * WHY: More reliable than comparing against ticket.description which may have stale closure
   */
  const lastSavedDescriptionRef = useRef<string | null>(ticket?.description ?? null)

  // Search dialogs state
  const [showTeamSearch, setShowTeamSearch] = useState(false)
  const [showLeadSearch, setShowLeadSearch] = useState(false)

  /**
   * Lead sheet dialog state
   * WHY: Opens the lead sheet with communications tab when user clicks chat bubble
   */
  const [showLeadSheet, setShowLeadSheet] = useState(false)

  // Deadline state - initialized from ticket if in edit mode
  const [deadline, setDeadline] = useState<Date | undefined>(
    ticket?.deadline ?? undefined
  )

  // Value state - stored in dollars, initialized from ticket if in edit mode
  const [value, setValue] = useState<number | null>(ticket?.value ?? null)

  // Lead state - initialized from ticket if in edit mode
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(
    ticket?.lead
      ? {
          id: ticket.lead.id,
          firstName: ticket.lead.firstName,
          lastName: ticket.lead.lastName,
          email: ticket.lead.email,
          phone: ticket.lead.phone,
          avatarUrl: ticket.lead.avatarUrl,
        }
      : null
  )

  const titleInputRef = useRef<HTMLInputElement>(null)

  /**
   * Get selected team member from members list
   */
  const selectedMember = assignedToId
    ? members.find((m) => m.id === assignedToId)
    : null

  /**
   * Sync state when ticket changes (edit mode)
   * WHY: Keeps local state in sync with ticket data from server
   */
  useEffect(() => {
    if (ticket) {
      setTitle(ticket.title)
      setDescription(ticket.description ?? '')
      setAssignedToId(ticket.assignedTo?.id ?? null)
      setDeadline(ticket.deadline ?? undefined)
      setValue(ticket.value ?? null)
      setSelectedLead(
        ticket.lead
          ? {
              id: ticket.lead.id,
              firstName: ticket.lead.firstName,
              lastName: ticket.lead.lastName,
              email: ticket.lead.email,
              phone: ticket.lead.phone,
              avatarUrl: ticket.lead.avatarUrl,
            }
          : null
      )
      // Sync the last saved description ref when ticket changes
      // WHY: Ensures comparison works correctly when switching between tickets
      lastSavedDescriptionRef.current = ticket.description ?? null
    }
  }, [ticket])

  /**
   * Focus title input when editing
   */
  useEffect(() => {
    if ((isEditingTitle || isCreateMode) && titleInputRef.current) {
      titleInputRef.current.focus()
      if (!isCreateMode) {
        titleInputRef.current.select()
      }
    }
  }, [isEditingTitle, isCreateMode])

  /**
   * Escape key closes panel
   * WHY: Provides quick way to close the panel without mouse
   * Note: The editor handles its own escape key for menus/dialogs
   * Note: Don't close if lead sheet is open (let lead sheet handle its own escape)
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditingTitle && !showTeamSearch && !showLeadSearch && !showLeadSheet) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, isEditingTitle, showTeamSearch, showLeadSearch, showLeadSheet])

  /**
   * Cleanup save timeout on unmount
   * WHY: Prevents memory leaks from dangling timeouts
   */
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Wraps update calls to manage saving state indicator
   * Shows spinner during save, checkmark briefly after completion
   * @param updateFn - The async update function to execute
   */
  const withSavingState = useCallback(async <T,>(updateFn: () => Promise<T>): Promise<T> => {
    // Clear any existing saved checkmark timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }

    setIsSaving(true)
    setShowSaved(false)

    try {
      const result = await updateFn()
      setIsSaving(false)
      setShowSaved(true)

      // Hide the checkmark after 2 seconds
      saveTimeoutRef.current = setTimeout(() => {
        setShowSaved(false)
        saveTimeoutRef.current = null
      }, 2000)

      return result
    } catch (error) {
      setIsSaving(false)
      throw error
    }
  }, [])

  const handleTitleClick = useCallback(() => {
    // Don't allow editing in read-only mode
    if (!isCreateMode && !readOnly) {
      setIsEditingTitle(true)
    }
  }, [isCreateMode, readOnly])

  const handleTitleBlur = useCallback(async () => {
    if (isCreateMode) return
    setIsEditingTitle(false)
    // Only save if user has update permission (not read-only)
    if (ticket && title.trim() !== ticket.title && props.mode === 'edit' && props.onUpdate) {
      await withSavingState(() =>
        props.onUpdate!({
          id: ticket.id,
          title: title.trim() || 'Untitled',
        })
      )
    }
  }, [isCreateMode, title, ticket, props, withSavingState])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        titleInputRef.current?.blur()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (!isCreateMode && ticket) {
          setTitle(ticket.title)
        }
        setIsEditingTitle(false)
      }
    },
    [isCreateMode, ticket]
  )

  /**
   * Handle editor saving state changes (debounce pending/complete)
   * WHY: Shows spinner in header while user is typing in editor
   */
  const handleEditorSavingStateChange = useCallback((isPending: boolean) => {
    setIsEditorPending(isPending)
    // Clear the "saved" checkmark when user starts typing again
    if (isPending) {
      setShowSaved(false)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    }
  }, [])

  /**
   * Handle debounced description change - actually saves to DB
   * WHY: Auto-saves while user is typing (after debounce delay)
   * Uses fast endpoint (onUpdateDescription) when available for better performance
   */
  const handleDescriptionChange = useCallback(
    async (content: string) => {
      // Update local state for the editor
      setDescription(content)

      // Skip actual save in create mode or read-only mode
      if (isCreateMode || readOnly) return

      // Skip if no ticket or not in edit mode
      if (!ticket || props.mode !== 'edit') return

      // Compare against last saved content
      const lastSaved = lastSavedDescriptionRef.current ?? ''
      if (content === lastSaved) return

      try {
        // Use fast endpoint if available, otherwise fall back to generic update
        if (onUpdateDescription) {
          await withSavingState(() =>
            onUpdateDescription(ticket.id, content || null)
          )
        } else if (props.onUpdate) {
          await withSavingState(() =>
            props.onUpdate!({
              id: ticket.id,
              description: content || null,
            })
          )
        }

        // Only update ref AFTER save succeeds
        lastSavedDescriptionRef.current = content
      } catch (error) {
        console.error('Failed to save description:', error)
      }
    },
    [isCreateMode, readOnly, ticket, props, withSavingState, onUpdateDescription]
  )

  /**
   * Handle description blur from editor
   * WHY: Auto-saves the description when user clicks away from the editor
   * Uses fast endpoint (onUpdateDescription) when available for better performance
   *
   * IMPORTANT: The ref is only updated AFTER save succeeds to prevent data loss
   * if the save fails. This ensures we'll retry on the next blur.
   */
  const handleDescriptionBlur = useCallback(
    async (content: string) => {
      // Skip in create mode or read-only mode - saves happen on form submit
      if (isCreateMode || readOnly) return

      // Skip if no ticket or not in edit mode
      if (!ticket || props.mode !== 'edit') return

      // Compare against last saved content (ref), not ticket.description (may be stale)
      const lastSaved = lastSavedDescriptionRef.current ?? ''
      if (content === lastSaved) return

      try {
        // Use fast endpoint if available, otherwise fall back to generic update
        if (onUpdateDescription) {
          await withSavingState(() =>
            onUpdateDescription(ticket.id, content || null)
          )
        } else if (props.onUpdate) {
          await withSavingState(() =>
            props.onUpdate!({
              id: ticket.id,
              description: content || null,
            })
          )
        }

        // Only update ref AFTER save succeeds
        // WHY: If save fails, we want to retry on next blur
        lastSavedDescriptionRef.current = content
      } catch (error) {
        // Log error but don't update ref - next blur will retry
        console.error('Failed to save description:', error)
      }
    },
    [isCreateMode, readOnly, ticket, props, withSavingState, onUpdateDescription]
  )

  /**
   * Handle team member selection from search dialog
   * WHY: Updates assignee and persists to database (unless read-only)
   */
  const handleTeamMemberSelect = useCallback(
    async (member: TeamMemberOption | null) => {
      // Skip in read-only mode
      if (readOnly) return

      const newAssignedToId = member?.id ?? null
      setAssignedToId(newAssignedToId)

      if (!isCreateMode && ticket && props.mode === 'edit' && props.onUpdate) {
        await withSavingState(() =>
          props.onUpdate!({
            id: ticket.id,
            assignedToId: newAssignedToId,
          })
        )
      }
    },
    [isCreateMode, readOnly, ticket, props, withSavingState]
  )

  /**
   * Handle lead selection from search dialog
   * Updates local state and persists to database (unless read-only)
   */
  const handleLeadSelect = useCallback(
    async (lead: LeadOption) => {
      // Skip in read-only mode
      if (readOnly) return

      setSelectedLead(lead)

      if (!isCreateMode && ticket && props.mode === 'edit' && props.onUpdate) {
        await withSavingState(() =>
          props.onUpdate!({
            id: ticket.id,
            leadId: lead.id,
            lead: {
              id: lead.id,
              firstName: lead.firstName,
              lastName: lead.lastName,
              email: lead.email,
              phone: lead.phone,
              avatarUrl: lead.avatarUrl,
            },
          })
        )
      }
    },
    [isCreateMode, readOnly, ticket, props, withSavingState]
  )

  /**
   * Handle deadline selection from calendar
   * Updates local state and persists to database (unless read-only)
   */
  const handleDeadlineSelect = useCallback(
    async (date: Date | undefined) => {
      // Skip in read-only mode
      if (readOnly) return

      setDeadline(date)

      if (!isCreateMode && ticket && props.mode === 'edit' && props.onUpdate) {
        await withSavingState(() =>
          props.onUpdate!({
            id: ticket.id,
            deadline: date ?? null,
          })
        )
      }
    },
    [isCreateMode, readOnly, ticket, props, withSavingState]
  )

  /**
   * Handle value change from price input
   * WHY: PriceInput returns cents, we store in dollars
   * Updates local state and persists to database (unless read-only)
   */
  const handleValueChange = useCallback(
    async (valueInCents: number) => {
      // Skip in read-only mode
      if (readOnly) return

      // Convert cents to dollars for storage
      const valueInDollars = valueInCents > 0 ? valueInCents / 100 : null
      setValue(valueInDollars)

      if (!isCreateMode && ticket && props.mode === 'edit' && props.onUpdate) {
        await withSavingState(() =>
          props.onUpdate!({
            id: ticket.id,
            value: valueInDollars,
          })
        )
      }
    },
    [isCreateMode, readOnly, ticket, props, withSavingState]
  )

  /**
   * Handle creating a new ticket with all collected data
   */
  const handleCreate = useCallback(async () => {
    if (props.mode !== 'create') return
    if (!title.trim()) return

    setIsCreating(true)
    try {
      await props.onCreate({
        laneId: props.laneId,
        title: title.trim(),
        description: description.trim() || null,
        assignedToId,
        deadline: deadline ?? null,
        value,
      })
    } finally {
      setIsCreating(false)
    }
  }, [props, title, description, assignedToId, deadline, value])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="absolute inset-0 z-40 flex bg-background animate-in fade-in duration-150">
      {/* ================================================================
          MAIN PANEL - Inset from edges for premium feel
          ================================================================ */}
      <div className="flex flex-1 m-3 rounded-xl overflow-hidden border border-border/50 shadow-2xl shadow-black/10">

        {/* ================================================================
            MAIN CONTENT AREA
            ================================================================ */}
        <div className="flex-1 bg-muted/30 flex flex-col min-w-0">

          {/* Header - full width background, constrained content */}
          <header className="h-14 border-b border-border/50 shrink-0">
            <div className="h-full max-w-2xl px-6 flex items-center gap-4 mx-auto">
              {/* Title */}
              <div className="flex-1 min-w-0">
                {isEditingTitle || isCreateMode ? (
                  <input
                    ref={titleInputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                    className="w-full text-lg font-semibold bg-transparent outline-none placeholder:text-muted-foreground/50"
                    placeholder="What needs to be done?"
                  />
                ) : (
                  <h1
                    onClick={handleTitleClick}
                    className="text-lg font-semibold truncate cursor-text hover:text-foreground/80 transition-colors"
                  >
                    {title || 'Untitled'}
                  </h1>
                )}
              </div>

              {/* Saving State Indicator - shows spinner when saving/typing, checkmark when saved */}
              {!isCreateMode && (isSaving || isEditorPending || showSaved) && (
                <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                  {isSaving || isEditorPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span className="text-xs">
                    {isSaving || isEditorPending ? 'Saving...' : 'Saved'}
                  </span>
                </div>
              )}

              {/* Create Button - only in create mode */}
              {isCreateMode && (
                <Button
                  onClick={handleCreate}
                  disabled={!title.trim() || isCreating}
                  size="sm"
                  className="shrink-0"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </Button>
              )}

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Separator - constrained width */}
          <div className="max-w-2xl px-6 mx-auto">
            <Separator className="bg-border/30" />
          </div>

          {/* Content - Rich Text Editor (No label, minimal design) */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl px-6 py-4 mx-auto">
              <RichTextEditor
                initialContent={description}
                onChange={handleDescriptionChange}
                onBlur={handleDescriptionBlur}
                onSavingStateChange={handleEditorSavingStateChange}
                placeholder="Type '/' for commands, or start writing..."
                variant="standard"
                readOnly={false}
                className="min-h-[250px]"
                contentClassName="min-h-[230px]"
                organizationId={organizationId}
              />
            </div>
          </div>
        </div>

        {/* ================================================================
            PROPERTIES SIDEBAR
            ================================================================ */}
        <aside className="w-72 shrink-0 bg-sidebar border-l border-border/50 flex flex-col">

          {/* Timestamps header - aligned with main header height */}
          {!isCreateMode && ticket && (
            <>
              <div className="h-14 px-5 flex items-center">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                  <span>Created {formatDate(ticket.createdAt)}</span>
                  <span>·</span>
                  <span>Updated {formatRelativeTime(ticket.updatedAt)}</span>
                </div>
              </div>
              <Separator className="bg-border/50" />
            </>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Assigned To */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>Assigned To</span>
              </div>
              <button
                onClick={() => setShowTeamSearch(true)}
                className={cn(
                  'w-full h-9 px-3 flex items-center gap-2 rounded-lg text-sm',
                  'bg-muted/30 hover:bg-muted/50 transition-colors',
                  'text-left'
                )}
              >
                {selectedMember ? (
                  <>
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={selectedMember.image ?? undefined} alt={selectedMember.name} />
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {getInitials(selectedMember.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{selectedMember.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground/60">Click to assign...</span>
                )}
              </button>
            </div>

            {/* Lead */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                <span>Lead</span>
              </div>
              {/* Lead selection button with chat bubble for conversations */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowLeadSearch(true)}
                  className={cn(
                    'flex-1 h-9 px-3 flex items-center gap-2 rounded-lg text-sm',
                    'bg-muted/30 hover:bg-muted/50 transition-colors',
                    'text-left'
                  )}
                >
                  {selectedLead ? (
                    <>
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={selectedLead.avatarUrl ?? undefined} />
                        <AvatarFallback
                          className="text-[10px] font-medium"
                          style={{
                            backgroundColor: getLeadAvatarColor(selectedLead.id, selectedLead.firstName),
                            color: getTextColorForBackground(getLeadAvatarColor(selectedLead.id, selectedLead.firstName)),
                          }}
                        >
                          {selectedLead.firstName?.[0] ?? selectedLead.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">
                        {selectedLead.firstName || selectedLead.lastName
                          ? `${selectedLead.firstName ?? ''} ${selectedLead.lastName ?? ''}`.trim()
                          : selectedLead.email}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/60">Link a lead...</span>
                  )}
                </button>

                {/**
                 * Chat Bubble Button - Opens Lead Sheet with Communications Tab
                 * WHY: Provides quick access to lead conversation without leaving the ticket
                 * Only visible when a lead is selected (same pattern as ticket preview card)
                 */}
                {selectedLead && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setShowLeadSheet(true)}
                    title="Open conversation with lead"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Flag className="h-3.5 w-3.5" />
                <span>Deadline</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      'w-full h-9 px-3 flex items-center gap-2 rounded-lg text-sm',
                      'bg-muted/30 hover:bg-muted/50 transition-colors',
                      'text-left'
                    )}
                  >
                    {deadline ? (
                      <span>{format(deadline, 'MMM d, yyyy')}</span>
                    ) : (
                      <span className="text-muted-foreground/60">Set deadline...</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={deadline}
                    onSelect={handleDeadlineSelect}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Value - editable price input for deal value */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" />
                <span>Value</span>
              </div>
              <PriceInput
                value={value ? Math.round(value * 100) : 0}
                onChange={handleValueChange}
                placeholder="0.00"
                className="[&>input]:h-9 [&>input]:bg-muted/30 [&>input]:border-0 [&>input]:focus-visible:ring-1"
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Team Search Dialog */}
      <TeamSearchCommand
        organizationId={organizationId}
        open={showTeamSearch}
        onOpenChange={setShowTeamSearch}
        onSelect={handleTeamMemberSelect}
        selectedMemberId={assignedToId}
      />

      {/* Lead Search Dialog */}
      <LeadSearchCommand
        organizationId={organizationId}
        open={showLeadSearch}
        onOpenChange={setShowLeadSearch}
        onSelect={handleLeadSelect}
        selectedLeadId={selectedLead?.id}
        showCreateOption={false}
      />

      {/**
       * Lead Sheet - Opens when user clicks chat bubble next to lead
       * WHY: Provides full lead details and communications in a side panel
       * Uses the communications tab by default for quick access to conversations
       * NOTE: LeadViewer is self-contained, handles all mutations internally
       */}
      {selectedLead && (
        <LeadSheet
          leadId={selectedLead.id}
          organizationId={organizationId}
          open={showLeadSheet}
          onOpenChange={setShowLeadSheet}
          defaultTab="communications"
        />
      )}
    </div>
  )
}
