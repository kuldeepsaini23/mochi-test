/**
 * ============================================================================
 * AI WIDGET SHELL - RESIZE HOOK
 * ============================================================================
 *
 * Hook for managing drag-to-resize in all 8 directions (edges + corners).
 * Extracted from both the Mochi and Builder widgets (identical in both).
 * Clamps dimensions within the provided min/max bounds.
 *
 * SOURCE OF TRUTH KEYWORDS: useResize, AIWidgetResize, getCursor
 * ============================================================================
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { WidgetDimensions } from './types'

/**
 * Returns the CSS cursor for a given resize direction string.
 * Handles all 8 directions: n, s, e, w, ne, nw, se, sw.
 */
export function getCursor(direction: string): string {
  const cursors: Record<string, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
    sw: 'nesw-resize',
  }
  return cursors[direction] || 'default'
}

/**
 * Hook for managing resize functionality.
 * Handles mouse drag events in all 8 directions (n, s, e, w, ne, nw, se, sw)
 * and clamps dimensions within min/max bounds.
 *
 * @param initialDimensions - Starting width/height
 * @param minDimensions - Minimum allowed width/height
 * @param maxDimensions - Maximum allowed width/height
 * @returns { dimensions, handleMouseDown } — current size + drag start handler
 */
export function useResize(
  initialDimensions: WidgetDimensions,
  minDimensions: WidgetDimensions,
  maxDimensions: WidgetDimensions
) {
  const [dimensions, setDimensions] = useState(initialDimensions)
  const isResizing = useRef(false)
  const resizeDirection = useRef<string | null>(null)
  const startPos = useRef({ x: 0, y: 0 })
  const startDims = useRef({ ...initialDimensions })

  /** Begin a resize drag from a specific direction */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, direction: string) => {
      e.preventDefault()
      e.stopPropagation()
      isResizing.current = true
      resizeDirection.current = direction
      startPos.current = { x: e.clientX, y: e.clientY }
      startDims.current = { ...dimensions }

      document.body.style.cursor = getCursor(direction)
      document.body.style.userSelect = 'none'
    },
    [dimensions]
  )

  /** Global mouse listeners for tracking drag movement and release */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !resizeDirection.current) return

      const deltaX = e.clientX - startPos.current.x
      const deltaY = e.clientY - startPos.current.y
      const dir = resizeDirection.current

      let newWidth = startDims.current.width
      let newHeight = startDims.current.height

      // Handle horizontal resize
      if (dir.includes('e')) {
        newWidth = startDims.current.width + deltaX
      } else if (dir.includes('w')) {
        newWidth = startDims.current.width - deltaX
      }

      // Handle vertical resize
      if (dir.includes('s')) {
        newHeight = startDims.current.height + deltaY
      } else if (dir.includes('n')) {
        newHeight = startDims.current.height - deltaY
      }

      // Clamp dimensions within bounds
      newWidth = Math.max(minDimensions.width, Math.min(maxDimensions.width, newWidth))
      newHeight = Math.max(minDimensions.height, Math.min(maxDimensions.height, newHeight))

      setDimensions({ width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      isResizing.current = false
      resizeDirection.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [minDimensions, maxDimensions])

  return { dimensions, handleMouseDown }
}
