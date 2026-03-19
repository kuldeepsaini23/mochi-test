'use client'

/**
 * ============================================================================
 * EMAIL BUILDER - Gradient Stop Bar
 * ============================================================================
 *
 * Visual gradient preview with draggable color stops.
 * Figma-style interaction for managing gradient stops.
 *
 * Features:
 * - Visual gradient preview
 * - Draggable stop handles
 * - Click to add new stops
 * - Drag off to delete stops
 *
 * SOURCE OF TRUTH KEYWORDS: EmailGradientStopBar, EmailGradientPreview
 *
 * ============================================================================
 */

import { useState, useRef, useCallback } from 'react'
import type { EmailGradientConfig } from '@/types/email-templates'
import { gradientToCSS } from '../_lib/gradient-utils'

interface GradientStopBarProps {
  /** Current gradient configuration */
  gradient: EmailGradientConfig
  /** ID of currently selected stop */
  selectedStopId: string | null
  /** Called when a stop is selected */
  onSelectStop: (id: string) => void
  /** Called when a stop's position changes */
  onStopPositionChange: (id: string, position: number) => void
  /** Called when a stop should be deleted */
  onDeleteStop: (id: string) => void
  /** Called when a new stop should be added at position */
  onAddStop: (position: number) => void
}

/**
 * GradientStopBar Component
 *
 * Renders a visual gradient preview with interactive stop handles.
 * Handles drag-to-reposition and drag-off-to-delete interactions.
 */
export function GradientStopBar({
  gradient,
  selectedStopId,
  onSelectStop,
  onStopPositionChange,
  onDeleteStop,
  onAddStop,
}: GradientStopBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [isDragOffBar, setIsDragOffBar] = useState(false)

  /**
   * Calculate position percentage from mouse event
   */
  const getPositionFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent): number => {
      if (!barRef.current) return 0
      const rect = barRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const position = Math.max(0, Math.min(100, (x / rect.width) * 100))
      return Math.round(position)
    },
    []
  )

  /**
   * Check if mouse is off the bar vertically (for delete hint)
   */
  const checkIfOffBar = useCallback(
    (e: MouseEvent): boolean => {
      if (!barRef.current) return false
      const rect = barRef.current.getBoundingClientRect()
      const threshold = 30 // pixels away from bar to trigger delete
      return e.clientY < rect.top - threshold || e.clientY > rect.bottom + threshold
    },
    []
  )

  /**
   * Handle mouse down on stop
   */
  const handleStopMouseDown = useCallback(
    (e: React.MouseEvent, stopId: string) => {
      e.stopPropagation()
      e.preventDefault()
      setDraggingId(stopId)
      onSelectStop(stopId)

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newPosition = getPositionFromEvent(moveEvent)
        onStopPositionChange(stopId, newPosition)
        setIsDragOffBar(checkIfOffBar(moveEvent))
      }

      const handleMouseUp = (upEvent: MouseEvent) => {
        // Check if should delete (dragged off bar and more than 2 stops)
        if (checkIfOffBar(upEvent) && gradient.stops.length > 2) {
          onDeleteStop(stopId)
        }
        setDraggingId(null)
        setIsDragOffBar(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [gradient.stops.length, getPositionFromEvent, checkIfOffBar, onSelectStop, onStopPositionChange, onDeleteStop]
  )

  /**
   * Handle click on bar to add new stop
   */
  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't add if clicking on a stop
      if ((e.target as HTMLElement).closest('[data-stop]')) return

      const position = getPositionFromEvent(e)
      onAddStop(position)
    },
    [getPositionFromEvent, onAddStop]
  )

  // Generate CSS gradient for preview (always horizontal for display)
  const previewGradient = gradientToCSS({
    ...gradient,
    type: 'linear',
    angle: 90, // Always show horizontal in preview
  })

  return (
    <div className="space-y-1">
      {/* Gradient bar with stops */}
      <div
        ref={barRef}
        className="relative h-6 rounded cursor-pointer"
        style={{ background: previewGradient }}
        onClick={handleBarClick}
      >
        {/* Stop handles */}
        {gradient.stops.map((stop) => {
          const isSelected = stop.id === selectedStopId
          const isDragging = stop.id === draggingId

          return (
            <div
              key={stop.id}
              data-stop
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing transition-transform ${
                isDragging && isDragOffBar ? 'scale-75 opacity-50' : ''
              }`}
              style={{ left: `${stop.position}%` }}
              onMouseDown={(e) => handleStopMouseDown(e, stop.id)}
            >
              {/* Stop handle */}
              <div
                className={`w-4 h-4 rounded-full border-2 shadow-md ${
                  isSelected
                    ? 'border-violet-500 ring-2 ring-violet-500/30 scale-110'
                    : 'border-white hover:scale-110'
                } transition-all`}
                style={{ backgroundColor: stop.color }}
              />
            </div>
          )
        })}
      </div>

      {/* Helper text */}
      <p className="text-[10px] text-muted-foreground/60 text-center">
        {isDragOffBar && draggingId
          ? 'Release to delete'
          : 'Click bar to add stops • Drag off to delete'}
      </p>
    </div>
  )
}
