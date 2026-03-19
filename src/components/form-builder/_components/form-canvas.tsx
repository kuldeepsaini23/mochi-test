/**
 * ============================================================================
 * FORM CANVAS
 * ============================================================================
 *
 * The main canvas area where form elements are dropped and arranged.
 * Supports both editing mode (with selection) and preview mode.
 *
 * SORTING PATTERN (following dnd-kit's official sortable example):
 * - Each element uses useSortable which makes it BOTH draggable AND droppable
 * - NO separate drop zones between elements
 * - SortableContext handles all the sorting logic
 * - Items can be dropped ON other items to reorder
 *
 * EVENT HANDLING:
 * - Canvas click (background) -> clears selection, shows form design
 * - Form container click -> clears selection, shows form design
 * - Element click -> selects element, stops propagation to prevent above
 */

'use client'

import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { useFormBuilder } from '../_lib/form-builder-context'
import { FormRenderer, ElementDisplay } from '../form-renderer'
import { GripVertical } from 'lucide-react'
import type { FormElement } from '../_lib/types'

// ============================================================================
// SORTABLE ELEMENT WRAPPER
// ============================================================================

interface SortableElementProps {
  element: FormElement
  isSelected: boolean
  onClick: () => void
}

/**
 * Wrapper for sortable form elements in the canvas.
 *
 * KEY INSIGHT from dnd-kit docs:
 * useSortable "combines both the useDraggable and useDroppable hooks
 * to connect elements as both draggable sources and drop targets."
 *
 * EVENT HANDLING:
 * - onClick with stopPropagation prevents canvas/form click from firing
 * - This ensures clicking an element selects it without immediately clearing
 */
function SortableElement({ element, isSelected, onClick }: SortableElementProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: element.id,
    data: {
      type: 'canvas-element',
      element,
    },
  })

  const { state } = useFormBuilder()

  // Standard dnd-kit transform style
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Note: Preview mode is handled at FormCanvas level (returns FormRenderer directly)
  // SortableElement is only rendered in edit mode

  /**
   * Handle click on the element.
   * CRITICAL: stopPropagation prevents the canvas onClick from firing,
   * which would clear the selection immediately after we set it.
   */
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()

    // Don't select if clicking the drag handle
    const target = e.target as HTMLElement
    if (target.closest('[data-drag-handle]')) return

    onClick()
  }

  /**
   * Handle pointer down - also stop propagation to be safe.
   * Some events might fire on pointerdown before click.
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only handle left click
    if (e.button !== 0) return

    // Don't interfere with drag handle
    const target = e.target as HTMLElement
    if (target.closest('[data-drag-handle]')) return

    e.stopPropagation()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      className={cn(
        'relative group cursor-pointer',
        // Visual feedback during drag
        isDragging && 'opacity-50 z-50',
        // Highlight when another item is being dragged over this one
        isOver && !isDragging && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      {/* Selection ring - uses blue color for visibility on white form backgrounds */}
      <div
        className={cn(
          'absolute -inset-1 rounded-lg border-2 transition-colors pointer-events-none',
          isSelected
            ? 'border-blue-500 bg-blue-500/5'
            : 'border-transparent group-hover:border-muted-foreground/20'
        )}
      />

      {/* Drag handle - only this triggers drag, not the whole element */}
      <div
        data-drag-handle
        {...attributes}
        {...listeners}
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-1',
          'cursor-grab active:cursor-grabbing',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          isSelected && 'opacity-100'
        )}
      >
        <div className="p-1 rounded bg-muted hover:bg-muted-foreground/20">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Element content - pointer-events-none prevents inputs from capturing clicks */}
      {/* Uses ElementDisplay from FormRenderer for visual consistency (single source of truth) */}
      <div className="pointer-events-none">
        <ElementDisplay element={element} styles={state.schema.styles} />
      </div>
    </div>
  )
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyCanvasState() {
  const { state } = useFormBuilder()
  const isDraggingFromSidebar = state.drag.isDragging && state.drag.draggedType !== null

  const { setNodeRef, isOver } = useDroppable({
    id: 'empty-canvas-drop',
    data: {
      type: 'canvas-drop-zone',
      index: 0,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 flex flex-col items-center justify-center p-8',
        'border-2 border-dashed rounded-xl transition-colors',
        isOver && isDraggingFromSidebar
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/20'
      )}
    >
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium mb-2">Start building your form</h3>
        <p className="text-sm text-muted-foreground">
          Drag elements from the left sidebar and drop them here.
          Click on an element to edit its properties.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Form canvas component.
 * The main area where form elements are arranged.
 *
 * LAYOUT: Centered form container with max-width from styles.
 * EVENTS: Click on background/form clears selection (shows form design).
 */
export function FormCanvas() {
  const { state, actions, selectedElement } = useFormBuilder()
  const { elements } = state.schema

  // Only show drop indicator when dragging a NEW element from sidebar
  const isDraggingFromSidebar = state.drag.isDragging && state.drag.draggedType !== null

  // Drop zone for the canvas (for adding new elements from sidebar)
  const { setNodeRef: setCanvasDropRef, isOver: isCanvasOver } = useDroppable({
    id: 'canvas-drop-zone',
    data: {
      type: 'canvas-drop-zone',
      index: elements.length,
    },
  })

  /**
   * Click on canvas background clears selection.
   * This shows the form-wide design settings.
   */
  const handleCanvasClick = () => {
    actions.clearSelection()
  }

  // Empty state
  if (elements.length === 0) {
    return (
      <div
        className="h-full flex flex-col p-6 overflow-auto"
        style={{
          backgroundColor: state.schema.styles.canvasColor,
        }}
        onClick={handleCanvasClick}
      >
        <EmptyCanvasState />
      </div>
    )
  }

  // Determine the max width based on viewport mode (for edit mode)
  // Mobile mode constrains to 375px (standard iPhone width)
  const viewportMaxWidth = state.viewportMode === 'mobile'
    ? '375px'
    : state.schema.styles.maxWidth

  /**
   * In preview mode, use FormRenderer - the single source of truth.
   * This ensures preview mode looks and behaves exactly like the public form.
   * Uses React Hook Form + Zod for validation with inline error messages.
   *
   * NOTE: No formId is passed, so FormRenderer won't actually submit to the API.
   * This is intentional - preview mode is for testing validation and UI, not real submissions.
   *
   * IMPORTANT: Wrapped in a scroll container so long forms can be scrolled.
   */
  if (state.isPreviewMode) {
    return (
      <div className="h-full overflow-auto">
        <FormRenderer
          schema={state.schema}
          showCanvas={true}
        />
      </div>
    )
  }

  // Edit mode - render sortable elements with drag & drop
  return (
    <div
      ref={setCanvasDropRef}
      className={cn(
        'h-full overflow-auto',
        // Drop feedback when dragging from sidebar
        isDraggingFromSidebar && isCanvasOver && 'ring-2 ring-primary ring-inset'
      )}
      style={{
        // Use canvasColor from form styles for consistent preview
        // This matches exactly how the form will look on the public page
        backgroundColor: state.schema.styles.canvasColor,
      }}
      onClick={handleCanvasClick}
    >
      {/* Centered form container with viewport-responsive width */}
      <div className="min-h-full flex justify-center py-8 px-4">
        {/*
         * Viewport wrapper - adds visual device frame in mobile mode
         * This helps users visualize how their form will look on mobile
         */}
        <div
          className={cn(
            'w-full h-fit transition-all duration-300',
            // Add device frame styling in mobile mode
            state.viewportMode === 'mobile' && 'shadow-2xl'
          )}
          style={{
            maxWidth: viewportMaxWidth,
            backgroundColor: state.schema.styles.backgroundColor,
            padding: state.schema.styles.padding,
            borderRadius: state.schema.styles.borderRadius,
            fontFamily: state.schema.styles.fontFamily,
          }}
          onClick={handleCanvasClick}
        >
          {/* Form elements */}
          {elements.map((element) => (
            <div
              key={element.id}
              style={{
                marginBottom: state.schema.styles.elementSpacing,
              }}
            >
              <SortableElement
                element={element}
                isSelected={selectedElement?.id === element.id}
                onClick={() => actions.selectElement(element.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
