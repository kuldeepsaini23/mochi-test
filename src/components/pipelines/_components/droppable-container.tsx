'use client'

/**
 * DroppableContainer Component - Sortable Lane/Column Container
 *
 * This component implements a droppable AND sortable container following
 * the official dnd-kit MultipleContainers pattern exactly.
 *
 * Key features:
 * - Uses useSortable for both receiving drops AND being reorderable
 * - Implements animateLayoutChanges for smooth transitions
 * - Clean header with always-visible actions (drag handle, more options)
 * - Always visible: title, ticket count, total value
 * - CSS mask-image fade effect at top/bottom edges (color-independent)
 * - Infinite scroll support for loading more tickets as user scrolls
 *
 * SOURCE OF TRUTH: Official dnd-kit MultipleContainers example, InfiniteScroll
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  useSortable,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { UniqueIdentifier } from '@dnd-kit/core'
import { GripVertical, MoreHorizontal, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCurrencySymbol } from '@/constants/currencies'
import { Button } from '@/components/ui/button'
import { MarqueeFade } from '@/components/global/marquee-fade'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { LoadMoreTrigger } from './load-more-trigger'

/**
 * Custom animate layout changes function
 * Always animates when item was being dragged for smoother transitions
 * SOURCE OF TRUTH: Copied from dnd-kit MultipleContainers example
 */
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true })

/**
 * Formats a dollar amount as compact currency (e.g., 14500 -> "$14.5k").
 * Uses getCurrencySymbol for proper currency-aware symbol display.
 *
 * NOTE: Pipeline ticket values are stored in dollars (Float), NOT cents.
 */
function formatCompactCurrency(valueInDollars: number, currency: string = 'usd'): string {
  const sym = getCurrencySymbol(currency)
  if (valueInDollars >= 1000000) {
    return `${sym}${(valueInDollars / 1000000).toFixed(1)}M`
  }
  if (valueInDollars >= 1000) {
    return `${sym}${(valueInDollars / 1000).toFixed(1)}k`
  }
  return `${sym}${valueInDollars.toFixed(0)}`
}

interface DroppableContainerProps {
  children: React.ReactNode
  id: UniqueIdentifier
  items: UniqueIdentifier[]
  disabled?: boolean
  /**
   * Lane metadata for display
   */
  label: string
  /**
   * Total ticket count (may be more than items.length when paginated)
   * WHY: When using infinite scroll, items only contains loaded tickets
   * but we want to show the total count in the header
   */
  totalTicketCount?: number
  /**
   * Total monetary value of all tickets in this lane (in dollars)
   */
  totalValue?: number
  /**
   * Organization's currency code for proper symbol display (e.g., 'usd', 'eur')
   */
  currency?: string
  /**
   * Callback handlers
   */
  onRename?: (newName: string) => void
  onDelete?: () => void
  onAddTicket?: () => void
  /**
   * Infinite scroll props for tickets within this lane
   * WHY: Enables lazy-loading more tickets as user scrolls down
   */
  hasMoreTickets?: boolean
  onLoadMoreTickets?: () => void
  isLoadingMoreTickets?: boolean
}

/**
 * DroppableContainer - A sortable container that can hold sortable items
 *
 * Design:
 * - Always visible: Lane title, ticket count, total value
 * - Hover only: Drag handle, more options menu
 *
 * This follows the exact pattern from dnd-kit's MultipleContainers example:
 * - Uses useSortable (not useDroppable) so containers themselves can be reordered
 * - Passes data.type = 'container' and data.children for collision detection
 */
export function DroppableContainer({
  children,
  id,
  items,
  disabled,
  label,
  totalTicketCount,
  totalValue = 0,
  currency = 'usd',
  onRename,
  onDelete,
  onAddTicket,
  hasMoreTickets = false,
  onLoadMoreTickets,
  isLoadingMoreTickets = false,
}: DroppableContainerProps) {
  // Use totalTicketCount if provided (for infinite scroll), otherwise use items.length
  const displayTicketCount = totalTicketCount ?? items.length
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /**
   * Inline editing state for lane title
   * WHY: Double-click to rename lane directly without dropdown menu
   */
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(label)

  /**
   * Delete confirmation dialog state
   * WHY: Prevent accidental lane deletion which also deletes all tickets
   */
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  /**
   * Scroll indicator state
   * WHY: Show fade gradients when more content exists above/below viewport
   * HOW: Track scroll position and compare against scrollable area
   */
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  /**
   * Start editing lane title on double-click
   */
  const handleStartEdit = useCallback(() => {
    setEditValue(label)
    setIsEditing(true)
  }, [label])

  /**
   * Save the edited lane title
   */
  const handleSaveEdit = useCallback(() => {
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== label) {
      onRename?.(trimmedValue)
    }
    setIsEditing(false)
  }, [editValue, label, onRename])

  /**
   * Cancel editing and revert to original value
   */
  const handleCancelEdit = useCallback(() => {
    setEditValue(label)
    setIsEditing(false)
  }, [label])

  /**
   * Handle keyboard events during editing
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSaveEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancelEdit()
      }
    },
    [handleSaveEdit, handleCancelEdit]
  )

  /**
   * Focus input when entering edit mode
   */
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  /**
   * Update scroll indicators based on current scroll position
   */
  const updateScrollIndicators = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    setCanScrollUp(scrollTop > 5)
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 5)
  }, [])

  /**
   * Initialize scroll indicators and observe content changes
   */
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const initialCheck = setTimeout(updateScrollIndicators, 50)

    const resizeObserver = new ResizeObserver(() => {
      updateScrollIndicators()
    })
    resizeObserver.observe(container)

    const scrollContent = container.firstElementChild
    if (scrollContent) {
      resizeObserver.observe(scrollContent)
    }

    return () => {
      clearTimeout(initialCheck)
      resizeObserver.disconnect()
    }
  }, [items, updateScrollIndicators])

  /**
   * useSortable hook setup - makes this container both droppable AND sortable
   */
  const {
    active,
    attributes,
    isDragging,
    listeners,
    over,
    setNodeRef,
    transition,
    transform,
  } = useSortable({
    id,
    data: {
      type: 'container',
      children: items,
    },
    animateLayoutChanges,
  })

  /**
   * Determine if items are being dragged over this container
   */
  const isOverContainer = over
    ? (id === over.id && active?.data.current?.type !== 'container') ||
      items.includes(over.id)
    : false

  return (
    <div
      ref={disabled ? undefined : setNodeRef}
      style={{
        transition,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : undefined,
      }}
      className={cn(
        'flex flex-col shrink-0 w-80 h-full max-h-full bg-muted/40 rounded-xl',
        'border border-border/50',
        'transition-all duration-200',
        isOverContainer && ' bg-muted/60'
      )}
    >
      {/* Container Header */}
      <div className="flex items-center gap-2 p-3">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded hover:bg-muted cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Lane Title - Double-click to edit inline */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 text-sm font-medium bg-background border border-input rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <h3
            className="text-sm font-medium flex-1 min-w-0 truncate cursor-text"
            onDoubleClick={handleStartEdit}
            title="Double-click to rename"
          >
            {label}
          </h3>
        )}

        {/* Stats - show total count for infinite scroll, or loaded count */}
        <span className="shrink-0 text-xs text-muted-foreground">{displayTicketCount}</span>
        <span className="shrink-0 text-xs text-muted-foreground">•</span>
        <span className="shrink-0 text-xs font-medium">{formatCompactCurrency(totalValue, currency)}</span>

        {/* More Options - Delete only (rename via double-click on title) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Lane
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{label}&quot; lane?</AlertDialogTitle>
              <AlertDialogDescription>
                {items.length > 0 ? (
                  <>
                    This will permanently delete this lane and{' '}
                    <span className="font-semibold text-destructive">
                      all {items.length} ticket{items.length !== 1 ? 's' : ''}
                    </span>{' '}
                    inside it. This action cannot be undone.
                  </>
                ) : (
                  'This will permanently delete this empty lane. This action cannot be undone.'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  onDelete?.()
                  setShowDeleteDialog(false)
                }}
              >
                Delete Lane
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Items Container with CSS mask fade effect */}
      <MarqueeFade
        showTopFade={canScrollUp}
        showBottomFade={canScrollDown}
        fadeHeight={50}
        className="flex-1 min-h-0"
      >
        {/* Scrollable container */}
        <div
          ref={scrollContainerRef}
          onScroll={updateScrollIndicators}
          className="h-full overflow-y-auto px-2 py-2"
        >
          <div className="space-y-2 min-h-[60px] pb-2">
            {children}

            {/* Load More Trigger - for infinite scroll within lane */}
            {onLoadMoreTickets && (
              <LoadMoreTrigger
                onLoadMore={onLoadMoreTickets}
                hasMore={hasMoreTickets}
                isLoading={isLoadingMoreTickets}
                direction="vertical"
                rootMargin="50px"
              />
            )}

            {/* Empty state */}
            {items.length === 0 && !isLoadingMoreTickets && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm">No tickets</p>
                <p className="text-xs">Drop tickets here or create new ones</p>
              </div>
            )}
          </div>
        </div>
      </MarqueeFade>

      {/* Add Ticket Button */}
      <div className="p-3 pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={onAddTicket}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Ticket
        </Button>
      </div>
    </div>
  )
}
