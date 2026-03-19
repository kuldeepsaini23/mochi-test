/**
 * ============================================================================
 * PENCIL CREATION PREVIEW - Live SVG Path(s) During Freehand Drawing
 * ============================================================================
 *
 * Renders live SVG preview while the user is drawing with the pencil tool.
 * Supports multi-stroke mode — shows all accumulated strokes plus the
 * current in-progress stroke, each with its own color and width.
 *
 * ARCHITECTURE:
 * - Receives current preview data from usePencilCreation hook
 * - Full-canvas SVG overlay (path coordinates are already in canvas space)
 * - pointerEvents: none so drawing interaction is not interrupted
 * - Each stroke rendered as its own <path> with individual color/width
 *
 * SOURCE OF TRUTH: PencilCreationPreview, pencil-drawing-preview, multi-stroke-preview
 * ============================================================================
 */

'use client'

import { memo } from 'react'
import type { PencilDrawingPreview } from '../../_hooks/use-pencil-creation'

interface PencilCreationPreviewProps {
  /** Current drawing preview data from usePencilCreation hook */
  preview: PencilDrawingPreview
}

/**
 * SVG overlay that renders pencil path(s) being drawn in real-time.
 * Covers the entire canvas coordinate space — path coordinates from the hook
 * are already in canvas space so they align naturally with the canvas transform.
 * Each stroke gets its own <path> element with independent color and width.
 */
export const PencilCreationPreview = memo(function PencilCreationPreview({
  preview,
}: PencilCreationPreviewProps) {
  return (
    <svg
      data-pencil-preview
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        /* Use a fixed 1x1 size — the path coordinates are already in canvas space
           and overflow:visible ensures they render outside the SVG viewport.
           We cannot use width/height: 100% because the parent (data-canvas-content)
           has no explicit dimensions — it's just an absolutely-positioned transform
           container, so percentage sizing resolves to 0. */
        width: 1,
        height: 1,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {preview.strokes.map((stroke, index) => (
        <path
          key={index}
          d={stroke.pathData}
          fill="none"
          stroke={stroke.strokeColor}
          strokeWidth={stroke.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={stroke.strokeOpacity * 0.8}
        />
      ))}
    </svg>
  )
})
