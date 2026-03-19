'use client'

/**
 * SortableItem Component - Sortable Ticket Card
 *
 * This component wraps ticket cards to make them sortable within lanes
 * following the official dnd-kit MultipleContainers pattern exactly.
 *
 * Key features:
 * - Uses useSortable hook for drag-and-drop
 * - Passes transform and transition styles to the item
 * - Supports disabled state when containers are being sorted
 * - Implements useMountStatus for fade-in animation
 *
 * SOURCE OF TRUTH: Official dnd-kit MultipleContainers example
 */

import React, { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { UniqueIdentifier } from '@dnd-kit/core'
import { MoreHorizontal, Pencil, Trash2, Flag, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import { cn, formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import type { PipelineTicket } from '@/types/pipeline'
import { ContentPreview } from '@/components/editor'

interface SortableItemProps {
  id: UniqueIdentifier
  ticket: PipelineTicket
  disabled?: boolean
  /**
   * When true, renders as a pure visual component for DragOverlay
   * - No drag hooks attached
   * - No action buttons shown
   * - Slightly different styling (shadow, cursor)
   */
  isOverlay?: boolean
  /** Delete ticket mutation - TRPC mutations return success response */
  onDelete?: (ticketId: string) => Promise<unknown>
  /** Open edit dialog for this ticket */
  onEdit?: () => void
  /**
   * Open lead sheet with communications tab for this ticket's lead
   * WHY: Allows quick access to conversation with the lead without leaving pipeline
   */
  onOpenChat?: (leadId: string) => void
}

/**
 * Hook to track mount status for fade-in animation
 * Returns true after component has been mounted for 500ms
 */
function useMountStatus() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setIsMounted(true), 500)
    return () => clearTimeout(timeout)
  }, [])

  return isMounted
}

/**
 * Get initials from a name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Format pipeline ticket value (stored in dollars) using global currency formatter.
 * Converts dollars → cents for the global formatCurrency which expects smallest unit.
 */
function formatTicketValue(valueInDollars: number): string {
  return formatCurrency(Math.round(valueInDollars * 100))
}

/**
 * Format deadline date for display
 */
function formatDeadline(date: Date | string | null): string | null {
  if (!date) return null
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (isNaN(dateObj.getTime())) return null
  return format(dateObj, 'MMM d')
}

/**
 * SortableItem - A draggable ticket card
 *
 * This follows the exact pattern from dnd-kit's MultipleContainers example.
 * The useSortable hook provides:
 * - setNodeRef: For the DOM reference
 * - listeners: For drag activation
 * - transform/transition: For smooth animations
 * - isDragging: To show visual feedback
 */
export function SortableItem({
  id,
  ticket,
  disabled,
  isOverlay = false,
  onDelete,
  onEdit,
  onOpenChat,
}: SortableItemProps) {
  /**
   * Delete confirmation dialog state
   * WHY: Prevent accidental ticket deletion
   */
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  /**
   * useSortable hook - makes this item draggable and sortable
   * When disabled, the item cannot be dragged (used when container is being sorted)
   * When isOverlay, we still call the hook but don't use its values
   */
  const {
    setNodeRef,
    listeners,
    isDragging,
    transform,
    transition,
  } = useSortable({
    id,
    data: {
      type: 'item',
      ticket,
    },
    disabled: isOverlay, // Disable sortable when used as overlay
  })

  /**
   * Track mount status for fade-in effect
   * Items that mount while another is being dragged will fade in
   */
  const mounted = useMountStatus()
  const mountedWhileDragging = isDragging && !mounted

  /**
   * Handle ticket deletion after confirmation
   */
  const handleConfirmDelete = async () => {
    if (!onDelete) return
    await onDelete(ticket.id)
    setShowDeleteDialog(false)
  }

  /**
   * Style object for drag transform
   * Uses CSS.Transform.toString for proper CSS transform string
   * When overlay, no transform needed (DragOverlay handles positioning)
   */
  const style: React.CSSProperties = isOverlay
    ? { cursor: 'grabbing' }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }

  return (
    <div
      ref={isOverlay || disabled ? undefined : setNodeRef}
      style={style}
      className={cn(
        'group dark:bg-muted/40 backdrop-blur-lg bg-card rounded-xl dark:border-t dark:ring-background p-3 dark:ring-1 dark:shadow-sm ring-1 ring-border',
        'transition-shadow duration-200',
        // Overlay gets enhanced shadow, regular items get pointer cursor for click
        isOverlay
          ? 'shadow-lg cursor-grabbing'
          : 'cursor-pointer hover:ring-primary/50',
        // Fade in effect when mounted while dragging
        !isOverlay && mountedWhileDragging && 'animate-in fade-in duration-500'
      )}
      /**
       * Click handler - opens ticket detail panel
       * WHY: MouseSensor has distance constraint (5px), so clicks won't trigger drag
       * Only attach to non-overlay items
       */
      onClick={isOverlay ? undefined : onEdit}
      {...(isOverlay ? {} : listeners)}
    >
      {/* Card Header - Title and Actions */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium line-clamp-2 flex-1">
          {ticket.title}
        </h4>

        {/* Actions Menu - only show when not overlay */}
        {!isOverlay && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-6 w-6 shrink-0',
                    'opacity-0 group-hover:opacity-100 transition-opacity'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit?.()
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    /**
                     * Stop propagation to prevent card's onClick from firing
                     * WHY: Without this, clicking delete would also open ticket details
                     */
                    e.stopPropagation()
                    setShowDeleteDialog(true)
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this ticket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You are about to delete{' '}
                    <span className="font-semibold">&quot;{ticket.title}&quot;</span>.
                    This action cannot be undone and the ticket will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleConfirmDelete()
                    }}
                  >
                    Delete Ticket
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>

      {/* Description Preview - Rich content with formatting preserved */}
      {ticket.description && (
        <div className="mt-2">
          <ContentPreview
            content={ticket.description}
            maxHeight={100}
            className="text-xs"
          />
        </div>
      )}

      {/* Card Footer - Minimal metadata row */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
        {/* Left side - Metadata pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Ticket Value */}
          {ticket.value != null && ticket.value > 0 && (
            <span className="text-[10px] text-muted-foreground font-medium px-1.5 py-0.5 rounded bg-muted/50">
              {formatTicketValue(ticket.value)}
            </span>
          )}

          {/* Deadline */}
          {ticket.deadline && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50">
              <Flag className="h-2.5 w-2.5" />
              {formatDeadline(ticket.deadline)}
            </span>
          )}

          {/* Lead - name tag */}
          {ticket.lead && (ticket.lead.firstName || ticket.lead.lastName) && (
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 truncate max-w-[80px]">
              {`${ticket.lead.firstName ?? ''} ${ticket.lead.lastName ?? ''}`.trim()}
            </span>
          )}

          {/* Lead - email tag */}
          {ticket.lead && (
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 truncate max-w-[220px]">
              {ticket.lead.email}
            </span>
          )}
        </div>

        {/* Right side - Chat button + Assignee avatar */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Chat Button - Opens lead sheet with communications tab */}
          {!isOverlay && ticket.lead && onOpenChat && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                onOpenChat(ticket.lead!.id)
              }}
              title="Open conversation"
            >
              <MessageSquare className="h-3 w-3" />
            </Button>
          )}

          {/* Assignee avatar with HoverCard */}
          {ticket.assignedTo ? (
          <HoverCard>
            <HoverCardTrigger asChild>
              <button
                className="focus:outline-none shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage
                    src={ticket.assignedTo.image || undefined}
                    alt={ticket.assignedTo.name}
                  />
                  <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                    {getInitials(ticket.assignedTo.name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-56 p-3" side="top" align="end">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={ticket.assignedTo.image || undefined}
                    alt={ticket.assignedTo.name}
                  />
                  <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                    {getInitials(ticket.assignedTo.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {ticket.assignedTo.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ticket.assignedTo.email}
                  </p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : null}
        </div>
      </div>
    </div>
  )
}
