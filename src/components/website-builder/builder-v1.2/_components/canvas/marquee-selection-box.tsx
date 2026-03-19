/**
 * ============================================================================
 * MARQUEE SELECTION BOX - Visual Selection Rectangle Component
 * ============================================================================
 *
 * Renders the blue "rubber band" selection rectangle during marquee selection.
 *
 * ============================================================================
 * STYLING
 * ============================================================================
 *
 * The box uses a semi-transparent blue fill with a solid blue border,
 * matching Figma's selection rectangle appearance.
 *
 * Properties:
 * - Fill: rgba(59, 130, 246, 0.1) - Very light blue
 * - Border: 1px solid #3b82f6 - Solid blue (same as selection outline)
 * - Position: Absolute within the canvas transform layer
 *
 * ============================================================================
 * POSITIONING
 * ============================================================================
 *
 * The bounds prop contains coordinates in CANVAS space.
 * The box is rendered inside the zoomed/panned canvas layer,
 * so the coordinates map directly without additional transforms.
 *
 * ============================================================================
 */

'use client'

import React, { memo } from 'react'
import type { Bounds } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface MarqueeSelectionBoxProps {
  /**
   * Bounds of the marquee in canvas coordinates.
   * x, y = top-left corner
   * width, height = dimensions
   */
  bounds: Bounds
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders the marquee selection rectangle.
 *
 * USAGE:
 * ```tsx
 * {isSelecting && marqueeBounds && (
 *   <MarqueeSelectionBox bounds={marqueeBounds} />
 * )}
 * ```
 *
 * This component should be rendered INSIDE the canvas transform layer
 * (the div that has the pan/zoom transform applied), so the bounds
 * map directly to canvas coordinates.
 */
export const MarqueeSelectionBox = memo(function MarqueeSelectionBox({
  bounds,
}: MarqueeSelectionBoxProps) {
  /**
   * Style for the selection rectangle.
   *
   * - Absolute positioning within canvas
   * - Semi-transparent blue fill for visibility
   * - Solid blue border matching selection outline
   * - High z-index to render above all elements
   * - Pointer-events: none so it doesn't interfere with drag
   */
  const style: React.CSSProperties = {
    position: 'absolute',
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid #3b82f6',
    pointerEvents: 'none', // Don't interfere with other interactions
    zIndex: 9999, // Above all elements
  }

  return <div style={style} />
})
