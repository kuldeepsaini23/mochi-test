/**
 * ============================================================================
 * FRAME CREATION PREVIEW - Preview Rectangle During Frame Drawing
 * ============================================================================
 *
 * Renders the preview rectangle while user is drawing a new frame.
 *
 * ============================================================================
 * ARCHITECTURE REMINDER
 * ============================================================================
 *
 * This component receives bounds from the useFrameCreation hook:
 * - Bounds are stored in a REF during creation (60fps performance)
 * - A separate useState holds the preview for React rendering
 * - Updates happen via RAF batching for smooth visuals
 *
 * The actual frame is NOT created until user releases the mouse.
 * This is just a visual preview.
 *
 * ============================================================================
 */

'use client'

import { memo } from 'react'
import type { Bounds } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface FrameCreationPreviewProps {
  /** Bounds of the rectangle being drawn */
  bounds: Bounds
  /** Whether to show a fully rounded preview (circle-frame mode) */
  isCircle?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders a preview rectangle during frame creation.
 *
 * USAGE:
 * ```tsx
 * {creationPreview && <FrameCreationPreview bounds={creationPreview} />}
 * ```
 *
 * STYLING:
 * - Dashed border to indicate "not yet created"
 * - Semi-transparent background
 * - Blue color to match selection/creation theme
 */
export const FrameCreationPreview = memo(function FrameCreationPreview({
  bounds,
  isCircle = false,
}: FrameCreationPreviewProps) {
  // Don't render if dimensions are too small
  if (bounds.width < 2 || bounds.height < 2) {
    return null
  }

  return (
    <div
      data-creation-preview
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        border: '2px dashed #3b82f6',
        // Full rounding for circle-frame mode, slight rounding for normal frames
        borderRadius: isCircle ? 9999 : 8,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    />
  )
})
