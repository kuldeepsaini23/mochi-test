/**
 * ========================================
 * GRADIENT STOP BAR - Visual Stop Editor
 * ========================================
 *
 * Figma-style gradient stop bar component that displays:
 * - A gradient preview bar showing the current gradient colors
 * - Draggable color stop handles positioned along the bar
 * - Click on bar to add new stops
 * - Drag stops to reposition them
 * - Drag stop off bar vertically to delete (if > 2 stops)
 *
 * The bar represents positions 0-100% along the gradient axis.
 * Handles are positioned absolutely based on their stop.position value.
 *
 * ========================================
 * INTERACTION PATTERNS
 * ========================================
 *
 * - Click stop: Select it for color/position editing
 * - Drag stop horizontally: Change position
 * - Drag stop off bar (vertically): Delete if > 2 stops remain
 * - Click empty area: Add new stop at that position
 *
 */

'use client'

import { useRef, useCallback, useState } from 'react'
import type { GradientStop, GradientConfig } from '../../../_lib/types'
import { gradientConfigToCSS } from '../../../_lib/gradient-utils'

interface GradientStopBarProps {
  /** Current gradient configuration */
  gradient: GradientConfig
  /** Currently selected stop ID (if any) */
  selectedStopId: string | null
  /** Called when a stop is selected */
  onSelectStop: (stopId: string) => void
  /** Called when a stop position changes */
  onStopPositionChange: (stopId: string, position: number) => void
  /** Called when a stop should be deleted */
  onDeleteStop: (stopId: string) => void
  /** Called when clicking empty space to add a new stop */
  onAddStop: (position: number) => void
}

/**
 * Calculate position percentage from mouse X relative to bar
 */
function getPositionFromMouseX(
  mouseX: number,
  barRect: DOMRect
): number {
  const relativeX = mouseX - barRect.left
  const position = (relativeX / barRect.width) * 100
  // Clamp to 0-100
  return Math.max(0, Math.min(100, position))
}

/**
 * Check if mouse is too far from bar (for delete detection)
 * Returns true if mouse is more than 30px above or below bar
 */
function isMouseOffBar(
  mouseY: number,
  barRect: DOMRect
): boolean {
  const threshold = 30
  return mouseY < barRect.top - threshold || mouseY > barRect.bottom + threshold
}

export function GradientStopBar({
  gradient,
  selectedStopId,
  onSelectStop,
  onStopPositionChange,
  onDeleteStop,
  onAddStop,
}: GradientStopBarProps) {
  const barRef = useRef<HTMLDivElement>(null)

  // Track dragging state
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null)
  const [showDeleteHint, setShowDeleteHint] = useState(false)

  /**
   * Handle mouse down on a stop handle - start dragging
   */
  const handleStopMouseDown = useCallback(
    (e: React.MouseEvent, stop: GradientStop) => {
      e.preventDefault()
      e.stopPropagation()

      // Select this stop
      onSelectStop(stop.id)
      setDraggingStopId(stop.id)

      const barRect = barRef.current?.getBoundingClientRect()
      if (!barRect) return

      /**
       * Handle mouse move while dragging
       */
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!barRect) return

        // Calculate new position from mouse X
        const newPosition = getPositionFromMouseX(moveEvent.clientX, barRect)

        // Check if mouse is off bar for delete hint
        const isOff = isMouseOffBar(moveEvent.clientY, barRect)
        setShowDeleteHint(isOff && gradient.stops.length > 2)

        // Update position (even while off bar, so user can drag back)
        onStopPositionChange(stop.id, Math.round(newPosition))
      }

      /**
       * Handle mouse up - end dragging
       */
      const handleMouseUp = (upEvent: MouseEvent) => {
        const isOff = isMouseOffBar(upEvent.clientY, barRect)

        // If mouse is off bar and we have more than 2 stops, delete
        if (isOff && gradient.stops.length > 2) {
          onDeleteStop(stop.id)
        }

        setDraggingStopId(null)
        setShowDeleteHint(false)

        // Clean up listeners
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      // Add global listeners for drag
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [gradient.stops.length, onSelectStop, onStopPositionChange, onDeleteStop]
  )

  /**
   * Handle click on the bar (not on a stop) - add new stop
   */
  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle clicks directly on the bar, not on stop handles
      if (e.target !== barRef.current) return

      const barRect = barRef.current?.getBoundingClientRect()
      if (!barRect) return

      const position = getPositionFromMouseX(e.clientX, barRect)
      onAddStop(Math.round(position))
    },
    [onAddStop]
  )

  // Sort stops by position for consistent rendering
  const sortedStops = [...gradient.stops].sort((a, b) => a.position - b.position)

  // Generate CSS gradient for the preview bar background
  const gradientCSS = gradientConfigToCSS({
    ...gradient,
    // For the bar preview, always use horizontal linear gradient (90deg)
    type: 'linear',
    angle: 90,
  })

  return (
    <div className="relative">
      {/* Delete hint message - shows when dragging stop off bar */}
      {showDeleteHint && (
        <div className="absolute -top-6 left-0 right-0 text-center">
          <span className="text-xs text-destructive animate-pulse">
            Release to delete
          </span>
        </div>
      )}

      {/* Gradient preview bar */}
      <div
        ref={barRef}
        className="relative h-6 rounded-md border border-border cursor-crosshair"
        style={{ background: gradientCSS }}
        onClick={handleBarClick}
      >
        {/* Stop handles */}
        {sortedStops.map((stop) => {
          const isSelected = stop.id === selectedStopId
          const isDragging = stop.id === draggingStopId

          return (
            <div
              key={stop.id}
              className={`
                absolute top-1/2 -translate-y-1/2 -translate-x-1/2
                w-4 h-4 rounded-full border-2 cursor-grab
                transition-transform duration-75
                ${isSelected
                  ? 'border-white ring-2 ring-primary ring-offset-1 ring-offset-background scale-110'
                  : 'border-white/80 hover:scale-110'
                }
                ${isDragging ? 'cursor-grabbing scale-125' : ''}
              `}
              style={{
                left: `${stop.position}%`,
                backgroundColor: stop.color,
                // Add shadow for visibility against gradient
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}
              onMouseDown={(e) => handleStopMouseDown(e, stop)}
              title={`Position: ${stop.position}%`}
            />
          )
        })}
      </div>

      {/* Helper text */}
      <p className="text-[10px] text-muted-foreground mt-1">
        Click bar to add stops • Drag off to delete
      </p>
    </div>
  )
}
