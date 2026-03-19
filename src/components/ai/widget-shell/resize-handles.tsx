/**
 * ============================================================================
 * AI WIDGET SHELL - RESIZE HANDLES
 * ============================================================================
 *
 * Invisible grip areas at all 8 edges/corners of the expanded widget
 * for drag-to-resize. Extracted from both Mochi and Builder widgets
 * (identical in both).
 *
 * SOURCE OF TRUTH KEYWORDS: ResizeHandles, AIWidgetResizeHandles
 * ============================================================================
 */

import React from 'react'

interface ResizeHandlesProps {
  /** Mouse-down handler — receives the event and the direction string (n, s, e, w, ne, nw, se, sw) */
  onMouseDown: (e: React.MouseEvent, direction: string) => void
}

/**
 * Resize handles for all 8 directions (edges + corners).
 * Renders invisible hit areas along the widget borders that start
 * a drag-to-resize when clicked.
 */
export function ResizeHandles({ onMouseDown }: ResizeHandlesProps) {
  return (
    <>
      {/* Edge handles */}
      <div
        className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize"
        onMouseDown={(e) => onMouseDown(e, 'n')}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize"
        onMouseDown={(e) => onMouseDown(e, 's')}
      />
      <div
        className="absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize"
        onMouseDown={(e) => onMouseDown(e, 'w')}
      />
      <div
        className="absolute top-0 bottom-0 right-0 w-1 cursor-ew-resize"
        onMouseDown={(e) => onMouseDown(e, 'e')}
      />

      {/* Corner handles */}
      <div
        className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize"
        onMouseDown={(e) => onMouseDown(e, 'nw')}
      />
      <div
        className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize"
        onMouseDown={(e) => onMouseDown(e, 'ne')}
      />
      <div
        className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize"
        onMouseDown={(e) => onMouseDown(e, 'sw')}
      />
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
        onMouseDown={(e) => onMouseDown(e, 'se')}
      />
    </>
  )
}
