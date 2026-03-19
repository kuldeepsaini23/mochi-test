/**
 * ============================================================================
 * RESIZE HANDLES - Figma-Style Element Resize Controls
 * ============================================================================
 *
 * Renders resize handles around a selected element, matching Figma's design:
 * - 4 CORNER HANDLES: Small squares for diagonal/free resize
 * - 4 EDGE HANDLES: Thin bars along edges for single-axis stretching
 *
 * ============================================================================
 * ARCHITECTURE REMINDER
 * ============================================================================
 *
 * These handles ONLY trigger the resize operation.
 * The actual resize logic is in useResize hook:
 * - Pointer state stored in REFS (60fps performance)
 * - DOM updated via RAF during resize
 * - Redux dispatched ONLY when resize ENDS
 *
 * ============================================================================
 * FIGMA-STYLE DESIGN
 * ============================================================================
 *
 * Corner handles: 8x8 white squares with blue border
 * Edge handles: Thin transparent hit areas with visible blue bar on hover
 *
 * Layout:
 *   [nw]----[n]----[ne]
 *    |              |
 *   [w]            [e]
 *    |              |
 *   [sw]----[s]----[se]
 *
 * ============================================================================
 */

'use client'

import React, { memo, useState } from 'react'
import type { ResizeHandle } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface ResizeHandlesProps {
  /** Handler called when resize starts from a handle */
  onResizeStart: (e: React.PointerEvent, handle: ResizeHandle) => void

  /**
   * Optional array of allowed handles. If provided, only these handles render.
   * Used by Page elements which only allow top/bottom (vertical) resizing.
   * If not provided, all 8 handles are shown (default behavior for frames).
   */
  allowedHandles?: ResizeHandle[]

  /**
   * Current viewport zoom level (0.1 to 3).
   * Handles are scaled inversely so they remain the same visual size at any
   * zoom level — matching the label and dimensions pill zoom compensation.
   */
  zoom?: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Size of corner handle squares */
const CORNER_SIZE = 8

/** Thickness of edge handle hit area (invisible) */
const EDGE_HIT_AREA = 10

/** Thickness of visible edge handle bar */
const EDGE_VISIBLE_THICKNESS = 2

/** How far edge handles are inset from corners */
const EDGE_INSET = 12

/**
 * Corner handle configurations.
 * Positioned at the 4 corners for diagonal resize.
 */
const CORNER_HANDLES: {
  handle: ResizeHandle
  position: React.CSSProperties
  cursor: string
}[] = [
  {
    handle: 'nw',
    position: { top: -CORNER_SIZE / 2, left: -CORNER_SIZE / 2 },
    cursor: 'nwse-resize',
  },
  {
    handle: 'ne',
    position: { top: -CORNER_SIZE / 2, right: -CORNER_SIZE / 2 },
    cursor: 'nesw-resize',
  },
  {
    handle: 'se',
    position: { bottom: -CORNER_SIZE / 2, right: -CORNER_SIZE / 2 },
    cursor: 'nwse-resize',
  },
  {
    handle: 'sw',
    position: { bottom: -CORNER_SIZE / 2, left: -CORNER_SIZE / 2 },
    cursor: 'nesw-resize',
  },
]

/**
 * Edge handle configurations.
 * Thin bars along each edge for single-axis stretching.
 */
const EDGE_HANDLES: {
  handle: ResizeHandle
  cursor: string
  isHorizontal: boolean
}[] = [
  { handle: 'n', cursor: 'ns-resize', isHorizontal: true },
  { handle: 'e', cursor: 'ew-resize', isHorizontal: false },
  { handle: 's', cursor: 'ns-resize', isHorizontal: true },
  { handle: 'w', cursor: 'ew-resize', isHorizontal: false },
]

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders Figma-style resize handles around an element.
 *
 * USAGE:
 * ```tsx
 * {isSelected && (
 *   <ResizeHandles
 *     onResizeStart={(e, handle) => handleResizeStart(e, element.id, handle)}
 *   />
 * )}
 * ```
 *
 * HANDLE TYPES:
 * - Corners: Small white squares for free resize
 * - Edges: Thin bars that appear on hover for stretching
 */
export const ResizeHandles = memo(function ResizeHandles({
  onResizeStart,
  allowedHandles,
  zoom = 1,
}: ResizeHandlesProps) {
  // Track which edge is being hovered for visual feedback
  const [hoveredEdge, setHoveredEdge] = useState<ResizeHandle | null>(null)

  /**
   * Inverse zoom factor for handle scaling.
   * At zoom < 1 (zoomed out), handles grow to remain visually consistent.
   * At zoom >= 1, handles stay at their base size (no shrinking).
   * Same pattern used by labels and dimensions pill in ElementWrapper.
   */
  const zoomCompensation = Math.max(1 / zoom, 1)

  /**
   * Filter corner handles based on allowedHandles prop.
   * If allowedHandles is undefined, show all corners.
   */
  const filteredCornerHandles = allowedHandles
    ? CORNER_HANDLES.filter(({ handle }) => allowedHandles.includes(handle))
    : CORNER_HANDLES

  /**
   * Filter edge handles based on allowedHandles prop.
   * If allowedHandles is undefined, show all edges.
   */
  const filteredEdgeHandles = allowedHandles
    ? EDGE_HANDLES.filter(({ handle }) => allowedHandles.includes(handle))
    : EDGE_HANDLES

  return (
    <>
      {/* ================================================================
          CORNER HANDLES
          Small squares at each corner for diagonal resize
          (filtered by allowedHandles if provided)
          ================================================================ */}
      {filteredCornerHandles.map(({ handle, position, cursor }) => (
        <div
          key={handle}
          data-resize-handle={handle}
          style={{
            position: 'absolute',
            ...position,
            width: CORNER_SIZE,
            height: CORNER_SIZE,
            backgroundColor: 'white',
            border: '1px solid #3b82f6',
            borderRadius: '50%',
            /* Subtle shadow ensures white handles are visible on light page backgrounds */
            boxShadow: '0 0 0 1px var(--border)',
            cursor,
            /* Must be above all child content inside frames */
            zIndex: 9999,
            pointerEvents: 'auto',
            /*
             * ZOOM COMPENSATION: Scale handles inversely so they stay the
             * same visual size when the canvas is zoomed out. The handle is
             * centered on the corner point (-CORNER_SIZE/2 offset), so
             * scaling from center keeps it anchored correctly.
             */
            transform: `scale(${zoomCompensation})`,
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
            onResizeStart(e, handle)
          }}
        />
      ))}

      {/* ================================================================
          EDGE HANDLES
          Thin bars along each edge for single-axis stretching
          (filtered by allowedHandles if provided)
          ================================================================ */}
      {filteredEdgeHandles.map(({ handle, cursor, isHorizontal }) => {
        /**
         * Calculate edge handle position and size.
         * - Horizontal edges (n, s): span width minus corner insets
         * - Vertical edges (e, w): span height minus corner insets
         */
        const edgeStyle: React.CSSProperties = isHorizontal
          ? {
              // Top or bottom edge - horizontal bar
              left: EDGE_INSET,
              right: EDGE_INSET,
              height: EDGE_HIT_AREA,
              ...(handle === 'n'
                ? { top: -EDGE_HIT_AREA / 2 }
                : { bottom: -EDGE_HIT_AREA / 2 }),
            }
          : {
              // Left or right edge - vertical bar
              top: EDGE_INSET,
              bottom: EDGE_INSET,
              width: EDGE_HIT_AREA,
              ...(handle === 'w'
                ? { left: -EDGE_HIT_AREA / 2 }
                : { right: -EDGE_HIT_AREA / 2 }),
            }

        /**
         * Inner visible bar - shows blue line on hover.
         * Centered within the hit area.
         */
        const innerBarStyle: React.CSSProperties = isHorizontal
          ? {
              position: 'absolute',
              left: 0,
              right: 0,
              top: '50%',
              height: EDGE_VISIBLE_THICKNESS,
              transform: 'translateY(-50%)',
              backgroundColor: hoveredEdge === handle ? '#3b82f6' : 'transparent',
              borderRadius: 1,
              transition: 'background-color 0.1s',
            }
          : {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '50%',
              width: EDGE_VISIBLE_THICKNESS,
              transform: 'translateX(-50%)',
              backgroundColor: hoveredEdge === handle ? '#3b82f6' : 'transparent',
              borderRadius: 1,
              transition: 'background-color 0.1s',
            }

        return (
          <div
            key={handle}
            data-resize-handle={handle}
            style={{
              position: 'absolute',
              ...edgeStyle,
              cursor,
              /* Must be above all child content inside frames */
              zIndex: 9998,
              pointerEvents: 'auto',
            }}
            onPointerEnter={() => setHoveredEdge(handle)}
            onPointerLeave={() => setHoveredEdge(null)}
            onPointerDown={(e) => {
              e.stopPropagation()
              onResizeStart(e, handle)
            }}
          >
            {/* Visible bar - appears on hover */}
            <div style={innerBarStyle} />
          </div>
        )
      })}
    </>
  )
})
