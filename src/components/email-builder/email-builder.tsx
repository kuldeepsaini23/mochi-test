'use client'

/**
 * ============================================================================
 * EMAIL BUILDER - Main Component
 * ============================================================================
 *
 * A premium, production-grade email template builder.
 * Uses @dnd-kit for drag-and-drop, similar to the form builder.
 *
 * LAYOUT:
 * - Top: Navbar with template name, subject, save/preview buttons
 * - Left: Element sidebar with draggable email blocks
 * - Center: Canvas where email is built
 * - Right: Properties sidebar for editing selected block
 *
 * SOURCE OF TRUTH KEYWORDS: EmailBuilder, EmailTemplateBuilder
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
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
import {
  EmailBuilderProvider,
  useEmailBuilder,
  createEmailBlock,
  createPrebuiltBlocks,
} from './_lib/email-builder-context'
import { createTemplateBlocks } from './_lib/block-templates'
import { EmailBuilderNavbar } from './_components/navbar'
import { ElementSidebar } from './_components/element-sidebar'
import { EmailCanvas } from './_components/email-canvas'
import { PropertiesSidebar } from './_components/properties-sidebar'
import { DragOverlayContent } from './_components/drag-overlay'
import type { EmailBlock, EmailBlockType, ColumnsBlock, EmailSettings } from '@/types/email-templates'

// ============================================================================
// INNER COMPONENT
// ============================================================================

interface EmailBuilderInnerProps {
  /** Organization ID for Test button lead selection */
  organizationId?: string
  onSave?: (data: { name: string; subject: string; blocks: EmailBlock[]; emailSettings: EmailSettings }) => void | Promise<void>
  onClose?: () => void
  onDirtyChange?: (isDirty: boolean) => void
  isSaving?: boolean
}

function EmailBuilderInner({
  organizationId,
  onSave,
  onClose,
  onDirtyChange,
  isSaving,
}: EmailBuilderInnerProps) {
  const { state, actions } = useEmailBuilder()

  // State for unsaved changes confirmation dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  // Sync dirty state with parent
  useEffect(() => {
    onDirtyChange?.(state.isDirty)
  }, [state.isDirty, onDirtyChange])

  /**
   * Prevent browser back/forward navigation via keyboard shortcuts.
   * Cmd+Left Arrow (Mac) and Alt+Left Arrow (Windows) trigger browser back.
   * This prevents accidental navigation while editing the email template.
   */
  useEffect(() => {
    const handleNavigationKeys = (e: KeyboardEvent) => {
      // Prevent Cmd+Left/Right Arrow (Mac browser back/forward)
      if (e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Prevent Alt+Left/Right Arrow (Windows browser back/forward)
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    // Use capture phase to intercept before browser handles it
    window.addEventListener('keydown', handleNavigationKeys, { capture: true })
    return () => window.removeEventListener('keydown', handleNavigationKeys, { capture: true })
  }, [])

  /**
   * Warn user before leaving the page with unsaved changes.
   * Uses the beforeunload event for browser close/refresh protection.
   */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.isDirty) {
        e.preventDefault()
        // Modern browsers ignore custom messages but still show a warning
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state.isDirty])

  /**
   * Prevent browser back button navigation when there are unsaved changes.
   * Pushes a history state and intercepts popstate to show confirmation.
   */
  useEffect(() => {
    // Only add protection when dirty
    if (!state.isDirty) return

    // Push a state to intercept back navigation
    window.history.pushState({ emailBuilderProtection: true }, '')

    const handlePopState = (e: PopStateEvent) => {
      if (state.isDirty) {
        // Re-push state to prevent navigation
        window.history.pushState({ emailBuilderProtection: true }, '')
        // Show our custom dialog
        setShowUnsavedDialog(true)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [state.isDirty])

  /**
   * Handle close button click.
   * Shows confirmation dialog if there are unsaved changes.
   */
  const handleCloseClick = useCallback(() => {
    if (state.isDirty) {
      setShowUnsavedDialog(true)
    } else {
      onClose?.()
    }
  }, [state.isDirty, onClose])

  /**
   * Confirm closing without saving.
   */
  const handleConfirmClose = useCallback(() => {
    setShowUnsavedDialog(false)
    onClose?.()
  }, [onClose])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Track prebuilt block being dragged
  const [draggedPrebuiltId, setDraggedPrebuiltId] = React.useState<string | null>(null)
  // Track column block being dragged (for overlay)
  const [draggedColumnBlock, setDraggedColumnBlock] = React.useState<EmailBlock | null>(null)

  // Handle drag start
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event
      const activeData = active.data.current

      if (activeData?.type === 'sidebar-block') {
        actions.startDrag(activeData.blockType as EmailBlockType, null)
        setDraggedPrebuiltId(null)
        setDraggedColumnBlock(null)
      } else if (activeData?.type === 'sidebar-prebuilt') {
        // Handle legacy prebuilt blocks
        setDraggedPrebuiltId(activeData.prebuiltId as string)
        setDraggedColumnBlock(null)
        actions.startDrag(null, null)
      } else if (activeData?.type === 'sidebar-template') {
        // Handle new stunning template blocks from block-templates.ts
        setDraggedPrebuiltId(activeData.templateId as string)
        setDraggedColumnBlock(null)
        actions.startDrag(null, null)
      } else if (activeData?.type === 'canvas-block') {
        actions.startDrag(null, active.id as string)
        setDraggedPrebuiltId(null)
        setDraggedColumnBlock(null)
      } else if (activeData?.type === 'column-block') {
        // Track column block for overlay
        setDraggedColumnBlock(activeData.block as EmailBlock)
        setDraggedPrebuiltId(null)
        actions.startDrag(null, null)
      }
    },
    [actions]
  )

  /**
   * Recursively find a columns block by ID anywhere in the block tree.
   * Supports any level of nesting (columns inside columns inside columns, etc.)
   *
   * Returns { columnsBlock, updateNestedBlock } where updateNestedBlock
   * is a function to update the columns block props using the recursive
   * UPDATE_BLOCK action.
   */
  const findColumnsBlock = useCallback(
    (
      columnsBlockId: string
    ): {
      columnsBlock: ColumnsBlock | null
      updateNestedBlock: ((updater: (block: ColumnsBlock) => ColumnsBlock) => void) | null
    } => {
      /**
       * Recursive search through blocks and nested columns
       */
      const searchRecursively = (blocks: EmailBlock[]): ColumnsBlock | null => {
        for (const block of blocks) {
          // Direct match
          if (block.id === columnsBlockId && block.type === 'columns') {
            return block
          }

          // Search inside columns
          if (block.type === 'columns') {
            const inLeft = searchRecursively(block.props.leftColumn.blocks)
            if (inLeft) return inLeft

            const inRight = searchRecursively(block.props.rightColumn.blocks)
            if (inRight) return inRight
          }
        }
        return null
      }

      const columnsBlock = searchRecursively(state.blocks)

      if (!columnsBlock) {
        return { columnsBlock: null, updateNestedBlock: null }
      }

      // Use the recursive UPDATE_BLOCK action to update the columns block
      // This works for any nesting depth
      const updateNestedBlock = (updater: (block: ColumnsBlock) => ColumnsBlock) => {
        const updated = updater(columnsBlock)
        actions.updateBlock(columnsBlockId, { props: updated.props })
      }

      return { columnsBlock, updateNestedBlock }
    },
    [state.blocks, actions]
  )

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      const activeData = active.data.current
      const overData = over?.data.current

      // IMPORTANT: Capture drag state BEFORE calling endDrag()
      // because endDrag() resets state.drag.draggedType to null
      const draggedType = state.drag.draggedType
      const currentPrebuiltId = draggedPrebuiltId

      // Reset drag state
      actions.endDrag()
      setDraggedPrebuiltId(null)
      setDraggedColumnBlock(null)

      if (!over) {
        return
      }

      // ============================================
      // CASE 1: Reordering blocks WITHIN a column
      // ============================================
      if (activeData?.type === 'column-block' && overData?.type === 'column-block') {
        const sourceColumnsId = activeData.columnsBlockId as string
        const sourceColumnSide = activeData.columnSide as 'left' | 'right'
        const targetColumnsId = overData.columnsBlockId as string
        const targetColumnSide = overData.columnSide as 'left' | 'right'

        // Find the columns block (supports nested columns)
        const { columnsBlock, updateNestedBlock } = findColumnsBlock(sourceColumnsId)
        if (!columnsBlock || columnsBlock.type !== 'columns' || !updateNestedBlock) return

        const sourceColumnKey = sourceColumnSide === 'left' ? 'leftColumn' : 'rightColumn'
        const targetColumnKey = targetColumnSide === 'left' ? 'leftColumn' : 'rightColumn'
        const sourceColumn = columnsBlock.props[sourceColumnKey]
        const targetColumn = columnsBlock.props[targetColumnKey]

        const draggedBlock = activeData.block as EmailBlock
        const overBlock = overData.block as EmailBlock

        // Same column reorder
        if (sourceColumnsId === targetColumnsId && sourceColumnSide === targetColumnSide) {
          const oldIndex = sourceColumn.blocks.findIndex((b) => b.id === draggedBlock.id)
          const newIndex = sourceColumn.blocks.findIndex((b) => b.id === overBlock.id)

          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newBlocks = [...sourceColumn.blocks]
            const [removed] = newBlocks.splice(oldIndex, 1)
            newBlocks.splice(newIndex, 0, removed)

            actions.saveHistory('Reorder blocks in column')
            updateNestedBlock((block) => ({
              ...block,
              props: {
                ...block.props,
                [sourceColumnKey]: {
                  ...sourceColumn,
                  blocks: newBlocks,
                },
              },
            }))
          }
        }
        // Moving between columns (same columns block)
        else if (sourceColumnsId === targetColumnsId && sourceColumnSide !== targetColumnSide) {
          const newSourceBlocks = sourceColumn.blocks.filter((b) => b.id !== draggedBlock.id)
          const targetIndex = targetColumn.blocks.findIndex((b) => b.id === overBlock.id)
          const newTargetBlocks = [...targetColumn.blocks]
          newTargetBlocks.splice(targetIndex + 1, 0, draggedBlock)

          actions.saveHistory('Move block between columns')
          updateNestedBlock((block) => ({
            ...block,
            props: {
              ...block.props,
              [sourceColumnKey]: { ...sourceColumn, blocks: newSourceBlocks },
              [targetColumnKey]: { ...targetColumn, blocks: newTargetBlocks },
            },
          }))
        }
        return
      }

      // ============================================
      // CASE 2: Dropping sidebar block into a column
      // ============================================
      if (overData?.type === 'column-drop-zone') {
        const { columnsBlockId, columnSide } = overData as {
          columnsBlockId: string
          columnSide: 'left' | 'right'
        }

        // Find the columns block (supports nested columns)
        const { columnsBlock, updateNestedBlock } = findColumnsBlock(columnsBlockId)
        if (!columnsBlock || columnsBlock.type !== 'columns' || !updateNestedBlock) {
          return
        }

        // Get the column to add to
        const columnKey = columnSide === 'left' ? 'leftColumn' : 'rightColumn'
        const targetColumn = columnsBlock.props[columnKey]

        // Create the new block to add
        let newBlock: EmailBlock | null = null

        if (draggedType) {
          // Adding new block from sidebar (use captured draggedType)
          newBlock = createEmailBlock(draggedType)
        } else if (activeData?.type === 'sidebar-block') {
          // Alternative check for sidebar block
          newBlock = createEmailBlock(activeData.blockType as EmailBlockType)
        }

        if (newBlock) {
          actions.saveHistory('Add block to column')
          updateNestedBlock((block) => ({
            ...block,
            props: {
              ...block.props,
              [columnKey]: {
                ...targetColumn,
                blocks: [...targetColumn.blocks, newBlock!],
              },
            },
          }))
        }
        return
      }

      // ============================================
      // CASE 3: Dropping on main canvas
      // ============================================

      // Calculate insert index for main canvas
      let insertIndex = state.blocks.length
      if (overData?.type === 'canvas-block') {
        const targetIndex = state.blocks.findIndex((b) => b.id === over.id)
        insertIndex = targetIndex + 1
      }

      // Adding pre-built blocks from sidebar (supports both legacy and new templates)
      if (currentPrebuiltId) {
        actions.saveHistory('Add template block')

        // Try new stunning templates first, then fall back to legacy prebuilt blocks
        let newBlocks = createTemplateBlocks(currentPrebuiltId)
        if (newBlocks.length === 0) {
          newBlocks = createPrebuiltBlocks(currentPrebuiltId)
        }

        // Add all blocks in the template
        newBlocks.forEach((block, i) => {
          actions.addBlock(block, insertIndex + i)
        })
        return
      }

      // Adding new single block from sidebar
      if (draggedType) {
        actions.saveHistory('Add block')
        const newBlock = createEmailBlock(draggedType)
        actions.addBlock(newBlock, insertIndex)
        return
      }

      // ============================================
      // CASE 4: Reordering existing blocks on main canvas
      // ============================================
      if (active.id !== over.id && activeData?.type === 'canvas-block') {
        const oldIndex = state.blocks.findIndex((b) => b.id === active.id)
        const newIndex = state.blocks.findIndex((b) => b.id === over.id)

        if (oldIndex !== -1 && newIndex !== -1) {
          actions.saveHistory('Reorder blocks')
          actions.reorderBlocks(oldIndex, newIndex)
        }
      }
    },
    [actions, state.drag.draggedType, state.blocks, draggedPrebuiltId, findColumnsBlock]
  )

  // Handle drag cancel
  const handleDragCancel = useCallback(() => {
    actions.endDrag()
    setDraggedPrebuiltId(null)
    setDraggedColumnBlock(null)
  }, [actions])

  /**
   * Custom collision detection that handles different drag scenarios:
   * - Sidebar blocks: Prioritize column drop zones for easy dropping
   * - Column blocks: Prioritize other column blocks for reordering, then drop zones
   * - Canvas blocks: Use standard rect intersection
   *
   * For nested columns, we pick the SMALLEST (innermost) drop zone to allow
   * dropping into deeply nested column structures.
   */
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const activeData = args.active.data.current
    const activeType = activeData?.type

    // Get all collisions using both methods
    const pointerCollisions = pointerWithin(args)
    const rectCollisions = rectIntersection(args)

    /**
     * Helper to find the deepest/innermost column drop zone.
     * For nested columns, multiple drop zones may contain the pointer.
     * We pick the smallest one (by area) which is the most deeply nested.
     */
    const findDeepestColumnDropZone = () => {
      const columnDropZones = pointerCollisions.filter(
        (collision) => collision.data?.droppableContainer?.data?.current?.type === 'column-drop-zone'
      )

      if (columnDropZones.length === 0) return null
      if (columnDropZones.length === 1) return columnDropZones[0]

      // Find the smallest drop zone (most deeply nested)
      let smallest = columnDropZones[0]
      let smallestArea = Infinity

      for (const zone of columnDropZones) {
        const rect = zone.data?.droppableContainer?.rect?.current
        if (rect) {
          const area = rect.width * rect.height
          if (area < smallestArea) {
            smallestArea = area
            smallest = zone
          }
        }
      }

      return smallest
    }

    // For column-block drags (reordering within columns):
    // Prioritize other column-blocks first for reordering, then fall back to drop zones
    if (activeType === 'column-block') {
      // First, look for column-block collisions (for reordering)
      const columnBlockCollision = rectCollisions.find(
        (collision) => collision.data?.droppableContainer?.data?.current?.type === 'column-block'
      )
      if (columnBlockCollision) {
        return [columnBlockCollision]
      }

      // If no column block found, check for column drop zone (for moving to empty areas)
      const columnDropZone = findDeepestColumnDropZone()
      if (columnDropZone) {
        return [columnDropZone]
      }

      return rectCollisions
    }

    // For sidebar drags: Prioritize the deepest column drop zone for nested columns
    if (activeType === 'sidebar-block' || activeType === 'sidebar-prebuilt' || activeType === 'sidebar-template') {
      const columnDropZone = findDeepestColumnDropZone()
      if (columnDropZone) {
        return [columnDropZone]
      }
    }

    // Default: Use rectIntersection for canvas blocks and other cases
    return rectCollisions
  }, [])

  /**
   * Save handler - includes blocks AND emailSettings for full persistence.
   * EmailSettings includes canvas background colors, padding, etc.
   */
  const handleSave = useCallback(async () => {
    if (onSave) {
      await onSave({
        name: state.name,
        subject: state.subject,
        blocks: state.blocks,
        emailSettings: state.emailSettings,
      })
      actions.setDirty(false)
    }
  }, [onSave, state.name, state.subject, state.blocks, state.emailSettings, actions])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      // Undo: Cmd/Ctrl + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        actions.undo()
      }

      // Redo: Cmd/Ctrl + Shift + Z
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        actions.redo()
      }

      // Save: Cmd/Ctrl + S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }

      // Delete: Backspace/Delete when block selected
      if ((e.key === 'Backspace' || e.key === 'Delete') && state.selectedBlockId) {
        e.preventDefault()
        actions.saveHistory('Delete block')
        actions.deleteBlock(state.selectedBlockId)
      }

      // Duplicate: Cmd/Ctrl + D
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && state.selectedBlockId) {
        e.preventDefault()
        actions.saveHistory('Duplicate block')
        actions.duplicateBlock(state.selectedBlockId)
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        actions.selectBlock(null)
      }

      // Preview toggle: Cmd/Ctrl + P
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        actions.togglePreview()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actions, handleSave, state.selectedBlockId])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col h-full bg-background">
        {/* Navbar - uses handleCloseClick for unsaved changes protection */}
        <EmailBuilderNavbar
          organizationId={organizationId}
          onSave={handleSave}
          onClose={handleCloseClick}
          isSaving={isSaving}
        />

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar - Elements */}
          {!state.isPreviewMode && <ElementSidebar />}

          {/* Canvas */}
          <div className="flex-1 overflow-hidden">
            <SortableContext
              items={state.blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <EmailCanvas />
            </SortableContext>
          </div>

          {/* Right sidebar - Properties */}
          {!state.isPreviewMode && <PropertiesSidebar />}
        </div>
      </div>

      {/* Drag overlay - shows for regular blocks, prebuilt blocks, and column blocks */}
      <DragOverlay>
        {(state.drag.isDragging || draggedPrebuiltId || draggedColumnBlock) && (
          <DragOverlayContent
            blockType={state.drag.draggedType}
            blockId={state.drag.draggedBlockId}
            prebuiltId={draggedPrebuiltId}
            columnBlock={draggedColumnBlock}
          />
        )}
      </DragOverlay>

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? All changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  )
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export interface EmailBuilderProps {
  /** Organization ID for the current context */
  organizationId?: string
  /** Initial template name */
  initialName?: string
  /** Initial subject line */
  initialSubject?: string
  /** Initial blocks */
  initialBlocks?: EmailBlock[]
  /** Initial email settings (background colors, padding, etc.) */
  initialEmailSettings?: Partial<EmailSettings>
  /** Called when saving - includes blocks AND emailSettings */
  onSave?: (data: { name: string; subject: string; blocks: EmailBlock[]; emailSettings: EmailSettings }) => void | Promise<void>
  /** Called when closing */
  onClose?: () => void
  /** Called when dirty state changes */
  onDirtyChange?: (isDirty: boolean) => void
  /** Whether save is in progress */
  isSaving?: boolean
  /** Additional className */
  className?: string
}

export function EmailBuilder({
  organizationId,
  initialName = '',
  initialSubject = '',
  initialBlocks = [],
  initialEmailSettings,
  onSave,
  onClose,
  onDirtyChange,
  isSaving,
  className,
}: EmailBuilderProps) {
  return (
    <div className={cn('w-full h-full', className)}>
      <EmailBuilderProvider
        initialName={initialName}
        initialSubject={initialSubject}
        initialBlocks={initialBlocks}
        initialEmailSettings={initialEmailSettings}
      >
        <EmailBuilderInner
          organizationId={organizationId}
          onSave={onSave}
          onClose={onClose}
          onDirtyChange={onDirtyChange}
          isSaving={isSaving}
        />
      </EmailBuilderProvider>
    </div>
  )
}
