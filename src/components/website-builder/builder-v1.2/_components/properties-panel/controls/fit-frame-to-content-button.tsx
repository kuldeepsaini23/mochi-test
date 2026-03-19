/**
 * ============================================================================
 * FIT FRAME TO CONTENT BUTTON - Properties Panel
 * ============================================================================
 *
 * A helper button that snaps a frame element's dimensions to perfectly
 * fit its children. Calculates the required size based on children's
 * dimensions and the frame's flex layout settings.
 *
 * HOW IT WORKS:
 * 1. Gets all children of the frame from Redux state
 * 2. Calculates the bounding box needed based on flex layout:
 *    - Column layout: height = sum of children heights + gaps
 *    - Row layout: width = sum of children widths + gaps
 * 3. Adds padding from frame styles (handles both number and string values)
 * 4. Updates the frame's width/height to match
 *
 * This is useful when users have a frame with children and want to
 * quickly resize it to fit the actual content without manual calculation.
 */

'use client'

import { useCallback } from 'react'
import { Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FrameElement } from '../../../_lib/types'
import { DEFAULT_FRAME_STYLES } from '../../../_lib/types'
import {
  useAppSelector,
  selectActivePage,
} from '../../../_lib'

interface FitFrameToContentButtonProps {
  /** The frame element to fit */
  element: FrameElement
  /** Callback to update the element's dimensions */
  onFit: (width: number, height: number) => void
}

/**
 * Parses a CSS spacing value (padding/gap) into a number.
 *
 * Handles multiple formats:
 * - Number: 20 → 20
 * - String with px: '20px' → 20
 * - Plain string number: '20' → 20
 * - CSS shorthand (1-4 values): '10 20 30 40' → { top, right, bottom, left }
 * - Invalid values: returns 0
 */
function parseSpacingValue(value: unknown): { top: number; right: number; bottom: number; left: number } {
  if (typeof value === 'number') {
    return { top: value, right: value, bottom: value, left: value }
  }

  if (typeof value === 'string') {
    // Split by spaces and parse each part (strip 'px' suffix if present)
    const parts = value.trim().split(/\s+/).map(p => parseFloat(p.replace('px', '')))
    const valid = parts.filter(n => !isNaN(n))

    if (valid.length === 0) return { top: 0, right: 0, bottom: 0, left: 0 }
    if (valid.length === 1) return { top: valid[0], right: valid[0], bottom: valid[0], left: valid[0] }
    if (valid.length === 2) return { top: valid[0], right: valid[1], bottom: valid[0], left: valid[1] }
    if (valid.length === 3) return { top: valid[0], right: valid[1], bottom: valid[2], left: valid[1] }
    return { top: valid[0], right: valid[1], bottom: valid[2], left: valid[3] }
  }

  return { top: 0, right: 0, bottom: 0, left: 0 }
}

/**
 * Parses a CSS gap value into a number.
 * Handles both number and string formats (e.g., 10, '10', '10px').
 */
function parseGapValue(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace('px', ''))
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Button that calculates and applies the optimal size for a frame element
 * based on its children's content.
 */
export function FitFrameToContentButton({ element, onFit }: FitFrameToContentButtonProps) {
  // Get the active page to access children elements
  const activePage = useAppSelector(selectActivePage)

  /**
   * Calculate the required dimensions based on children and flex layout.
   *
   * APPROACH:
   * - Get all direct children of this frame
   * - Based on flexDirection:
   *   - Column: height = sum of heights + gaps, width = max width
   *   - Row: width = sum of widths + gaps, height = max height
   * - Add padding from frame styles (properly parsed from CSS shorthand)
   */
  const handleFitToContent = useCallback(() => {
    if (!activePage) return

    // Get children IDs from childrenMap
    const childrenIds = activePage.canvas.childrenMap[element.id] || []

    // If no children, set to minimum size
    if (childrenIds.length === 0) {
      onFit(100, 100)
      return
    }

    // Get children elements
    const children = childrenIds
      .map((id) => activePage.canvas.elements[id])
      .filter((el) => el && el.visible)

    if (children.length === 0) {
      onFit(100, 100)
      return
    }

    // Get frame's flex layout settings
    const styles = { ...DEFAULT_FRAME_STYLES, ...(element.styles ?? {}) }
    const flexDirection = (styles.flexDirection as string) || 'column'
    const gap = parseGapValue(styles.gap)
    const padding = parseSpacingValue(styles.padding)

    // Calculate dimensions based on flex direction
    let contentWidth = 0
    let contentHeight = 0

    if (flexDirection === 'column') {
      // Column layout: stack vertically
      // Width = max child width
      // Height = sum of child heights + gaps between
      contentWidth = Math.max(...children.map((c) => c.width))
      contentHeight = children.reduce((sum, c) => sum + c.height, 0)
      contentHeight += gap * (children.length - 1) // Add gaps between children
    } else {
      // Row layout: stack horizontally
      // Width = sum of child widths + gaps between
      // Height = max child height
      contentWidth = children.reduce((sum, c) => sum + c.width, 0)
      contentWidth += gap * (children.length - 1) // Add gaps between children
      contentHeight = Math.max(...children.map((c) => c.height))
    }

    // Add padding (top + bottom for height, left + right for width)
    const newWidth = Math.ceil(contentWidth + padding.left + padding.right)
    const newHeight = Math.ceil(contentHeight + padding.top + padding.bottom)

    // Apply new dimensions (minimum 50px for usability)
    onFit(Math.max(newWidth, 50), Math.max(newHeight, 50))
  }, [element, activePage, onFit])

  return (
    <div className="flex items-center gap-2">
      <p className="text-sm text-muted-foreground w-10 shrink-0">Fit</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleFitToContent}
        className="flex-1 h-7 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground justify-start gap-2 px-2"
        title="Fit frame size to children content"
      >
        <Minimize2 className="h-3.5 w-3.5" />
        <span className="text-xs">Fit to Content</span>
      </Button>
    </div>
  )
}
