/**
 * ============================================================================
 * FORM BUILDER - Main Component
 * ============================================================================
 *
 * The core form builder component that can be used standalone or in a modal.
 * Provides a complete drag-and-drop form building experience.
 *
 * LAYOUT:
 * - Top: Navbar with form name, save/preview buttons
 * - Left: Element sidebar with draggable form elements
 * - Center: Canvas where form is built
 * - Right: Properties sidebar for editing selected element
 *
 * USAGE:
 * - As standalone page: <FormBuilder organizationId="..." formSlug="..." />
 * - As modal: <FormBuilderModal open={...} onOpenChange={...} ... />
 *
 * DND:
 * - Uses @dnd-kit for drag and drop
 * - Elements dragged from sidebar to canvas
 * - Elements can be reordered within canvas
 */

'use client'

import React, { useCallback, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { v4 as uuid } from 'uuid'
import { FormBuilderProvider, useFormBuilder, createFormElement } from './_lib/form-builder-context'
import type { FormSchema, FormBuilderProps, FormElementType, FormElement } from './_lib/types'
import type { CustomFieldDragData } from './_components/custom-fields-section'
import { FormBuilderNavbar } from './_components/navbar'
import { ElementSidebar } from './_components/element-sidebar'
import { PropertiesSidebar } from './_components/properties-sidebar'
import { FormCanvas } from './_components/form-canvas'
import { DragOverlayContent } from './_components/drag-overlay-content'

// ============================================================================
// INNER COMPONENT (Uses context)
// ============================================================================

interface FormBuilderInnerProps {
  organizationId: string
  formSlug?: string
  formStatus?: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED'
  onSave?: (schema: FormSchema) => void | Promise<void>
  onPublish?: (status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED') => void | Promise<void>
  onSlugChange?: (newSlug: string) => void | Promise<void>
  onClose?: () => void
  /** Callback when dirty state changes - used by modal to track unsaved changes */
  onDirtyChange?: (isDirty: boolean) => void
  isModal?: boolean
}

/**
 * Inner form builder component that uses the context.
 * Handles DnD setup and layout structure.
 */
function FormBuilderInner({
  organizationId,
  formSlug,
  formStatus,
  onSave,
  onPublish,
  onSlugChange,
  onClose,
  onDirtyChange,
  isModal = false,
}: FormBuilderInnerProps) {
  const { state, actions, selectedElement } = useFormBuilder()

  // ========================================
  // SYNC DIRTY STATE WITH PARENT
  // ========================================

  /**
   * Notify parent component when dirty state changes.
   * This allows FormBuilderModal to track unsaved changes
   * and show a warning dialog when closing.
   */
  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(state.isDirty)
    }
  }, [state.isDirty, onDirtyChange])

  // ========================================
  // DND SENSORS
  // ========================================

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag before activation
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // ========================================
  // DND HANDLERS (Following dnd-kit's official sortable pattern)
  // ========================================

  /**
   * Handle drag start - track what's being dragged.
   * Supports both standard sidebar elements and custom dataset fields.
   */
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event
      const activeData = active.data.current

      if (activeData?.type === 'sidebar-element') {
        // Dragging NEW standard element from sidebar
        actions.startDrag(activeData.elementType as FormElementType, null)
      } else if (activeData?.type === 'custom-field') {
        // Dragging NEW custom dataset field from sidebar
        // Use the mapped element type for the drag state
        const customData = activeData as CustomFieldDragData
        actions.startDrag(customData.elementType, null)
      } else if (activeData?.type === 'canvas-element') {
        // Dragging EXISTING element for reordering
        actions.startDrag(null, active.id as string)
      }
    },
    [actions]
  )

  /**
   * Handle drag over - minimal tracking.
   * SortableContext handles visual reordering automatically.
   */
  const handleDragOver = useCallback(
    (_event: DragOverEvent) => {
      // No-op: SortableContext handles visual feedback for sorting
      // We don't need to track drop indices anymore since we removed
      // the gap drop zones that were causing the wonky behavior
    },
    []
  )

  /**
   * Handle drag end - the KEY handler.
   *
   * STANDARD DND-KIT SORTABLE PATTERN:
   * 1. Get active (dragged item) and over (target item)
   * 2. Find their indices in the array
   * 3. Use arrayMove to reorder
   *
   * Supports both standard elements and custom dataset fields.
   * Custom fields include datasetFieldRef for automatic submission routing.
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      const activeData = active.data.current

      // End drag state
      actions.endDrag()

      // Nothing to do if dropped outside valid target
      if (!over) return

      // Case 1: Adding NEW element from sidebar (standard or custom field)
      if (state.drag.draggedType) {
        // Check if this is a custom field drop (has datasetFieldRef)
        let newElement: FormElement
        if (activeData?.type === 'custom-field') {
          // Custom dataset field - include datasetFieldRef and field config
          const customData = activeData as CustomFieldDragData

          newElement = createFormElement(customData.elementType, {
            label: customData.fieldConfig.label,
            placeholder: customData.fieldConfig.placeholder,
            helpText: customData.fieldConfig.helpText,
            required: customData.fieldConfig.required,
            options: customData.fieldConfig.options?.map((opt) => ({
              id: uuid(),
              label: opt,
              value: opt.toLowerCase().replace(/\s+/g, '_'),
            })),
            datasetFieldRef: customData.datasetFieldRef,
          })
        } else {
          // Standard sidebar element
          newElement = createFormElement(state.drag.draggedType)
        }

        // Determine insert position
        let insertIndex = state.schema.elements.length // Default: append to end

        const overData = over.data.current
        if (overData?.type === 'canvas-element') {
          // Dropped on an existing element - insert after it
          const targetIndex = state.schema.elements.findIndex((el) => el.id === over.id)
          insertIndex = targetIndex + 1
        }
        // If dropped on canvas-drop-zone, use default (append to end)

        // Add element first, then save history (new model: save AFTER action)
        actions.addElement(newElement, insertIndex)
        actions.saveHistory('Add element')
        return
      }

      // Case 2: REORDERING existing element
      // This is the standard dnd-kit sortable pattern
      if (active.id !== over.id) {
        const oldIndex = state.schema.elements.findIndex((el) => el.id === active.id)
        const newIndex = state.schema.elements.findIndex((el) => el.id === over.id)

        if (oldIndex !== -1 && newIndex !== -1) {
          // Reorder first, then save history (new model: save AFTER action)
          actions.reorderElements(oldIndex, newIndex)
          actions.saveHistory('Reorder elements')
        }
      }
    },
    [actions, state.drag.draggedType, state.schema.elements]
  )

  /**
   * Handle drag cancel - reset drag state.
   */
  const handleDragCancel = useCallback(() => {
    actions.endDrag()
  }, [actions])

  // ========================================
  // SAVE HANDLER
  // ========================================

  const handleSave = useCallback(async () => {
    if (onSave) {
      await onSave(state.schema)
      actions.setDirty(false)
    }
  }, [onSave, state.schema, actions])

  // ========================================
  // KEYBOARD SHORTCUTS
  // ========================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        actions.undo()
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        e.preventDefault()
        actions.redo()
      }

      // Save: Ctrl/Cmd + S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }

      // Delete: Backspace or Delete when element selected
      if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        selectedElement
      ) {
        e.preventDefault()
        // Delete first, then save history (new model: save AFTER action)
        actions.deleteElement(selectedElement.id)
        actions.saveHistory('Delete element')
      }

      // Duplicate: Ctrl/Cmd + D
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedElement) {
        e.preventDefault()
        // Duplicate first, then save history (new model: save AFTER action)
        actions.duplicateElement(selectedElement.id)
        actions.saveHistory('Duplicate element')
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        actions.clearSelection()
      }

      // Toggle preview: Ctrl/Cmd + P
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        actions.togglePreviewMode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actions, handleSave, selectedElement])

  // ========================================
  // RENDER
  // ========================================

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className={cn(
          'flex flex-col bg-background',
          isModal ? 'h-full' : 'h-screen'
        )}
      >
        {/* Navbar */}
        <FormBuilderNavbar
          formSlug={formSlug}
          formStatus={formStatus}
          onSave={handleSave}
          onPublish={onPublish}
          onSlugChange={onSlugChange}
          onClose={onClose}
          isModal={isModal}
        />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar - Elements (includes custom dataset fields) */}
          {!state.isPreviewMode && <ElementSidebar organizationId={organizationId} />}

          {/* Canvas */}
          <div className="flex-1 overflow-hidden">
            <SortableContext
              items={state.schema.elements.map((el) => el.id)}
              strategy={verticalListSortingStrategy}
            >
              <FormCanvas />
            </SortableContext>
          </div>

          {/* Right sidebar - Properties (always visible when not in preview) */}
          {!state.isPreviewMode && <PropertiesSidebar />}
        </div>
      </div>

      {/* Drag overlay - shows dragged element preview */}
      <DragOverlay>
        {state.drag.isDragging && (
          <DragOverlayContent
            elementType={state.drag.draggedType}
            elementId={state.drag.draggedElementId}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Main FormBuilder component.
 * Wraps the inner component with the provider.
 */
export function FormBuilder({
  organizationId,
  formId,
  formSlug,
  initialSchema,
  formStatus,
  onSave,
  onPublish,
  onSlugChange,
  onClose,
  onDirtyChange,
  isModal = false,
  className,
}: FormBuilderProps) {
  return (
    <div className={cn('w-full h-full', className)}>
      <FormBuilderProvider initialSchema={initialSchema}>
        <FormBuilderInner
          organizationId={organizationId}
          formSlug={formSlug}
          formStatus={formStatus}
          onSave={onSave}
          onPublish={onPublish}
          onSlugChange={onSlugChange}
          onClose={onClose}
          onDirtyChange={onDirtyChange}
          isModal={isModal}
        />
      </FormBuilderProvider>
    </div>
  )
}
