/**
 * ============================================================================
 * DRAG OVERLAY CONTENT
 * ============================================================================
 *
 * Visual representation of the element being dragged.
 * Shows during drag operations from sidebar or reordering.
 */

'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { getElementEntry } from '../_lib/element-registry'
import { useFormBuilder } from '../_lib/form-builder-context'
import type { FormElementType } from '../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface DragOverlayContentProps {
  elementType: FormElementType | null
  elementId: string | null
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Content shown in the drag overlay during drag operations.
 */
export function DragOverlayContent({
  elementType,
  elementId,
}: DragOverlayContentProps) {
  const { state } = useFormBuilder()

  // Dragging new element from sidebar
  if (elementType) {
    const entry = getElementEntry(elementType)

    if (!entry) return null

    return (
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3',
          'bg-background border border-border rounded-lg shadow-lg',
          'opacity-90'
        )}
      >
        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
          <entry.icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{entry.label}</p>
          <p className="text-xs text-muted-foreground">{entry.description}</p>
        </div>
      </div>
    )
  }

  // Dragging existing element (reordering)
  if (elementId) {
    const element = state.schema.elements.find((el) => el.id === elementId)

    if (!element) return null

    const entry = getElementEntry(element.type)

    return (
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3',
          'bg-background border border-primary/50 rounded-lg shadow-lg',
          'opacity-90'
        )}
      >
        {entry && (
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <entry.icon className="h-4 w-4 text-primary" />
          </div>
        )}
        <div>
          <p className="text-sm font-medium">{element.label}</p>
          <p className="text-xs text-muted-foreground">
            {entry?.label || element.type}
          </p>
        </div>
      </div>
    )
  }

  return null
}
