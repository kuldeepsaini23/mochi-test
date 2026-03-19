/**
 * ============================================================================
 * UNIFIED PENCIL ELEMENT - Single Component for Canvas + Preview Modes
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedPencil, unified-pencil-element, pencil-rendering,
 *                  multi-stroke-rendering
 *
 * Renders SVG paths from freehand drawing in both canvas and preview modes.
 * Supports multi-stroke elements — each stroke has its own pathData, color,
 * and width. The SVG viewBox encompasses all strokes and scales naturally
 * when the element is resized.
 *
 * ============================================================================
 * HOW IT WORKS
 * ============================================================================
 *
 * 1. Reads the current rendering mode via `useRenderMode()`:
 *    - 'canvas':  Returns SVG content only. Editor chrome (selection, hover,
 *                 resize) is handled by the parent ElementWrapper.
 *    - 'preview': Renders a self-positioned wrapper div with the SVG inside,
 *                 using computeElementPositionStyles and useElementSizeStyles.
 *
 * 2. SVG viewBox is set to "0 0 {viewBoxWidth} {viewBoxHeight}" (global
 *    bounding box at creation). preserveAspectRatio="none" allows free-stretch
 *    resizing — the drawing stretches in any direction independently.
 *
 * 3. Each stroke in `element.strokes` is rendered as its own <path> with
 *    individual strokeColor and strokeWidth. Shared properties (fillColor,
 *    lineCap, lineJoin) come from the element level.
 *
 * ============================================================================
 */

'use client'

import React, { memo } from 'react'
import type { PencilElement } from '../../_lib/types'
import {
  computeElementPositionStyles,
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedPencilProps {
  /** The pencil element data — SOURCE OF TRUTH from types.ts PencilElement */
  element: PencilElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified pencil element renderer (multi-stroke).
 * Canvas mode: content-only SVG (ElementWrapper adds chrome).
 * Preview mode: self-positioned div with SVG inside.
 * Each stroke renders as its own <path> with independent color/width.
 */
export const UnifiedPencil = memo(function UnifiedPencil({
  element,
}: UnifiedPencilProps) {
  const { mode, breakpoint } = useRenderMode()
  const isCanvas = mode === 'canvas'
  const effectiveBreakpoint = isCanvas ? 'desktop' : breakpoint

  /**
   * IMPORTANT: All hooks must be called BEFORE any conditional returns
   * (Rules of Hooks). Position and size styles are computed unconditionally
   * but only used in preview mode.
   */
  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, effectiveBreakpoint)
  const sizeStyles = useElementSizeStyles(element, effectiveBreakpoint)

  /* SVG content — shared between canvas and preview modes.
     Each stroke is its own <path> with individual color and width.
     fillColor, lineCap, lineJoin are element-level (shared across all strokes). */
  const svgContent = (
    <svg
      viewBox={`0 0 ${element.viewBoxWidth} ${element.viewBoxHeight}`}
      preserveAspectRatio="none"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        overflow: 'visible',
      }}
    >
      {element.strokes.map((stroke, index) => (
        <path
          key={index}
          d={stroke.pathData}
          fill={element.fillColor}
          stroke={stroke.strokeColor}
          strokeWidth={stroke.strokeWidth}
          strokeLinecap={element.lineCap}
          strokeLinejoin={element.lineJoin}
          opacity={stroke.strokeOpacity ?? 1}
        />
      ))}
    </svg>
  )

  /* CANVAS MODE: Return content only — ElementWrapper handles positioning */
  if (isCanvas) {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        {svgContent}
      </div>
    )
  }

  /* PREVIEW MODE: Self-positioned wrapper with full styling */
  return (
    <div
      data-element-id={element.id}
      style={{
        ...positionStyles,
        ...sizeStyles,
      }}
    >
      {svgContent}
    </div>
  )
})
