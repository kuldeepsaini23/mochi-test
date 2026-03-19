/**
 * ============================================================================
 * LOCAL COMPONENTS PANEL - Display and manage website-scoped components
 * ============================================================================
 *
 * This panel shows all LocalComponents that belong to the current website.
 * Users can:
 * 1. View a list of their created components
 * 2. Drag components onto the canvas to create instances
 * 3. Delete components (if no instances exist)
 * 4. See how many instances of each component exist
 *
 * ============================================================================
 * COMPONENT INSTANCES
 * ============================================================================
 *
 * When a component is dragged to the canvas, a new ComponentInstanceElement
 * is created. The instance:
 * - References the LocalComponent by componentId
 * - Has its own position (x, y) and order
 * - Stores propValues for any exposed props
 * - Renders children from the component's sourceTree (NON-EDITABLE)
 *
 * ============================================================================
 */

'use client'

import React, { useCallback } from 'react'
import { Component, Trash2, GripVertical, FolderOpen } from 'lucide-react'
import { ElementSection } from './element-section'
import {
  useAppSelector,
  selectLocalComponentsSorted,
  useLocalComponents,
} from '../../_lib'
import type { LocalComponent } from '../../_lib/types'

// ============================================================================
// COMPONENT ITEM - Individual component in the list
// ============================================================================

interface ComponentItemProps {
  component: LocalComponent
  onDelete: (componentId: string) => void
  onDragStart: (component: LocalComponent, event: React.DragEvent) => void
}

/**
 * A single component item in the local components list.
 * Shows the component name, instance count, and provides drag-to-add functionality.
 */
function ComponentItem({ component, onDelete, onDragStart }: ComponentItemProps) {
  const instanceCount = component.instanceIds.length
  const canDelete = instanceCount === 0

  /**
   * Handle the drag start event.
   * Sets up drag data for creating an instance when dropped on canvas.
   */
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Set the component ID as drag data for the canvas to read
      e.dataTransfer.setData('application/x-local-component', component.id)
      e.dataTransfer.effectAllowed = 'copy'
      onDragStart(component, e)
    },
    [component, onDragStart]
  )

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors"
    >
      {/* Drag Handle */}
      <div className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Component Icon */}
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Component className="w-4 h-4 text-primary" />
      </div>

      {/* Component Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{component.name}</p>
        <p className="text-xs text-muted-foreground">
          {instanceCount} instance{instanceCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Delete Button - Only show if no instances */}
      {canDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(component.id)
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
          title="Delete component"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ============================================================================
// EMPTY STATE - No components yet
// ============================================================================

function EmptyState() {
  return (
    <div className="px-3 py-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
        <Component className="w-6 h-6 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium text-foreground/80 mb-1">
        No Components Yet
      </p>
      <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
        Select a frame on the canvas and use the Settings panel to convert it to a component.
      </p>
    </div>
  )
}

// ============================================================================
// MAIN PANEL COMPONENT
// ============================================================================

export function LocalComponentsPanel() {
  /**
   * Use the useLocalComponents hook to:
   * 1. Load components from database into Redux on mount
   * 2. Provide delete functionality that syncs with database
   *
   * This hook is the bridge between Redux state and the database.
   * It fetches components when the builder loads and keeps them in sync.
   */
  const {
    components: _dbComponents,
    isLoading,
    deleteComponent: deleteComponentFromDb,
  } = useLocalComponents()

  // Get sorted list of local components from Redux (populated by the hook above)
  const components = useAppSelector(selectLocalComponentsSorted)

  /**
   * Handle deleting a component.
   * Only allowed if the component has no instances.
   *
   * Uses the deleteComponentFromDb function from useLocalComponents hook
   * which handles both database deletion and Redux state update.
   */
  const handleDelete = useCallback(
    async (componentId: string) => {
      const component = components.find((c) => c.id === componentId)
      if (!component) return

      // Double-check no instances exist
      if (component.instanceIds.length > 0) {
        console.warn('Cannot delete component with existing instances')
        return
      }

      // Delete from database and Redux via the hook
      await deleteComponentFromDb(componentId)
    },
    [components, deleteComponentFromDb]
  )

  /**
   * Handle starting a drag operation.
   * This is used to set up any visual feedback during dragging.
   */
  const handleDragStart = useCallback(
    (_component: LocalComponent, _event: React.DragEvent) => {
      // Could add visual feedback here (e.g., ghost image)
      // For now, the default drag image is used
    },
    []
  )

  return (
    <div className="px-3 py-3">
      {/* Local Components Section */}
      <ElementSection
        title="Local Components"
        icon={<FolderOpen className="h-4 w-4" />}
        defaultOpen={true}
      >
        {/* Loading State */}
        {isLoading ? (
          <div className="px-3 py-8 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">Loading components...</p>
          </div>
        ) : components.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-1">
            {components.map((component) => (
              <ComponentItem
                key={component.id}
                component={component}
                onDelete={handleDelete}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        )}
      </ElementSection>

      {/* Future: Could add sections for shared components, component categories, etc. */}
    </div>
  )
}
