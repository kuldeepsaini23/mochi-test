/**
 * ============================================================================
 * SNAP SERVICE - High-Performance Snap-to-Grid System
 * ============================================================================
 *
 * Provides edge snapping functionality for drag and resize operations.
 * Optimized for 60fps performance using direct calculations without React re-renders.
 *
 * ============================================================================
 * FEATURES
 * ============================================================================
 *
 * - 9-point edge detection (left, center, right × top, center, bottom)
 * - Dead-zone multiplier for "sticky" snapping behavior
 * - Separate X/Y axis snapping (snap can occur on one axis without the other)
 * - Resize-aware (snaps only the edges being resized)
 * - Alignment guide data generation for visual feedback
 *
 * ============================================================================
 * PERFORMANCE ARCHITECTURE
 * ============================================================================
 *
 * This service is designed to be called during 60fps pointer move events:
 * - Pure functions with no side effects
 * - No React state updates
 * - Simple math operations only
 * - Results used to update refs + DOM directly
 *
 * ============================================================================
 */

import type { CanvasElement } from './types'

// ============================================================================
// TYPES
// ============================================================================

/** Bounds needed for snap calculations */
export interface SnapBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Element bounds with ID for tracking */
export interface SnapTarget extends SnapBounds {
  id: string
  parentId: string | null
}

/** Result of a snap calculation */
export interface SnapResult {
  /** Offset to apply to X position (0 if no snap) */
  snapX: number
  /** Offset to apply to Y position (0 if no snap) */
  snapY: number
  /** X coordinate that was snapped to (for guide rendering) */
  snappedToX: number | null
  /** Y coordinate that was snapped to (for guide rendering) */
  snappedToY: number | null
}

/** Snap state for dead-zone tracking */
export interface SnapState {
  /** Currently snapped X position (null if not snapped) */
  x: number | null
  /** Currently snapped Y position (null if not snapped) */
  y: number | null
}

/** Alignment guide data for rendering */
export interface AlignmentGuide {
  /** Whether this is a vertical (X-axis) or horizontal (Y-axis) guide */
  axis: 'x' | 'y'
  /** Canvas coordinate where the guide should be drawn */
  position: number
  /** Start of the guide line (min Y for vertical, min X for horizontal) */
  start: number
  /** End of the guide line (max Y for vertical, max X for horizontal) */
  end: number
}

/** Result of alignment detection */
export interface AlignmentResult {
  /** Guides to render */
  guides: AlignmentGuide[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default snap threshold in canvas pixels */
export const DEFAULT_SNAP_THRESHOLD = 8

/** Multiplier for dead-zone (how much harder to break free once snapped) */
export const DEAD_ZONE_MULTIPLIER = 2.5

/** Threshold in canvas pixels for alignment guide detection */
export const ALIGNMENT_THRESHOLD = 8

// ============================================================================
// SNAP CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate snap offset for a dragging element.
 *
 * Checks all 9 edge points of the dragging element against all 9 edge points
 * of each target element. Returns the smallest snap offset that's within threshold.
 *
 * @param bounds - Current bounds of the element being dragged
 * @param targets - Array of elements to snap against
 * @param snapState - Current snap state for dead-zone calculation
 * @param threshold - Snap threshold in canvas pixels (default: 8)
 * @returns Snap offsets and snapped coordinates
 */
export function calculateDragSnap(
  bounds: SnapBounds,
  targets: SnapTarget[],
  snapState: SnapState,
  threshold: number = DEFAULT_SNAP_THRESHOLD
): SnapResult {
  let bestSnapX: { offset: number; distance: number; target: number } | null = null
  let bestSnapY: { offset: number; distance: number; target: number } | null = null

  // Current element edges
  const left = bounds.x
  const right = bounds.x + bounds.width
  const centerX = bounds.x + bounds.width / 2
  const top = bounds.y
  const bottom = bounds.y + bounds.height
  const centerY = bounds.y + bounds.height / 2

  // Edge points to check
  const xEdges = [left, centerX, right]
  const yEdges = [top, centerY, bottom]

  for (const target of targets) {
    // Skip nested elements (only snap to root-level elements)
    if (target.parentId !== null) continue

    // Target element edges
    const targetLeft = target.x
    const targetRight = target.x + target.width
    const targetCenterX = target.x + target.width / 2
    const targetTop = target.y
    const targetBottom = target.y + target.height
    const targetCenterY = target.y + target.height / 2

    const targetXEdges = [targetLeft, targetCenterX, targetRight]
    const targetYEdges = [targetTop, targetCenterY, targetBottom]

    // Check X-axis alignments
    for (const edge of xEdges) {
      for (const targetEdge of targetXEdges) {
        const distance = Math.abs(edge - targetEdge)
        // Apply dead-zone multiplier if already snapped on this axis
        const effectiveThreshold =
          snapState.x !== null ? threshold * DEAD_ZONE_MULTIPLIER : threshold

        if (distance <= effectiveThreshold) {
          const offset = targetEdge - edge
          if (!bestSnapX || distance < bestSnapX.distance) {
            bestSnapX = { offset, distance, target: targetEdge }
          }
        }
      }
    }

    // Check Y-axis alignments
    for (const edge of yEdges) {
      for (const targetEdge of targetYEdges) {
        const distance = Math.abs(edge - targetEdge)
        // Apply dead-zone multiplier if already snapped on this axis
        const effectiveThreshold =
          snapState.y !== null ? threshold * DEAD_ZONE_MULTIPLIER : threshold

        if (distance <= effectiveThreshold) {
          const offset = targetEdge - edge
          if (!bestSnapY || distance < bestSnapY.distance) {
            bestSnapY = { offset, distance, target: targetEdge }
          }
        }
      }
    }
  }

  return {
    snapX: bestSnapX?.offset ?? 0,
    snapY: bestSnapY?.offset ?? 0,
    snappedToX: bestSnapX?.target ?? null,
    snappedToY: bestSnapY?.target ?? null,
  }
}

/**
 * Calculate snap offset for resize operations.
 *
 * Only snaps the edges that are being resized (based on handle direction).
 * For example, resizing from the right edge only snaps the right edge.
 *
 * @param bounds - Current bounds of the element being resized
 * @param handle - Which resize handle is being used
 * @param targets - Array of elements to snap against
 * @param snapState - Current snap state for dead-zone calculation
 * @param threshold - Snap threshold in canvas pixels (default: 8)
 * @returns Snap offsets and snapped coordinates
 */
export function calculateResizeSnap(
  bounds: SnapBounds,
  handle: string,
  targets: SnapTarget[],
  snapState: SnapState,
  threshold: number = DEFAULT_SNAP_THRESHOLD
): SnapResult {
  let bestSnapX: { offset: number; distance: number; target: number } | null = null
  let bestSnapY: { offset: number; distance: number; target: number } | null = null

  // Determine which edges are being resized
  // Handle names use compass notation: 'n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'
  // 'w' = west = left edge, 'e' = east = right edge
  // 'n' = north = top edge, 's' = south = bottom edge
  const resizingLeft = handle.includes('w')
  const resizingRight = handle.includes('e')
  const resizingTop = handle.includes('n')
  const resizingBottom = handle.includes('s')

  // Current element edges
  const left = bounds.x
  const right = bounds.x + bounds.width
  const top = bounds.y
  const bottom = bounds.y + bounds.height

  for (const target of targets) {
    // Skip nested elements
    if (target.parentId !== null) continue

    // Target element edges
    const targetLeft = target.x
    const targetRight = target.x + target.width
    const targetCenterX = target.x + target.width / 2
    const targetTop = target.y
    const targetBottom = target.y + target.height
    const targetCenterY = target.y + target.height / 2

    const targetXEdges = [targetLeft, targetCenterX, targetRight]
    const targetYEdges = [targetTop, targetCenterY, targetBottom]

    // Apply dead-zone multiplier if already snapped
    const xThreshold = snapState.x !== null ? threshold * DEAD_ZONE_MULTIPLIER : threshold
    const yThreshold = snapState.y !== null ? threshold * DEAD_ZONE_MULTIPLIER : threshold

    // X-axis snapping (only for edges being resized)
    if (resizingLeft) {
      for (const targetEdge of targetXEdges) {
        const distance = Math.abs(left - targetEdge)
        if (distance <= xThreshold) {
          const offset = targetEdge - left
          if (!bestSnapX || distance < bestSnapX.distance) {
            bestSnapX = { offset, distance, target: targetEdge }
          }
        }
      }
    }

    if (resizingRight) {
      for (const targetEdge of targetXEdges) {
        const distance = Math.abs(right - targetEdge)
        if (distance <= xThreshold) {
          const offset = targetEdge - right
          if (!bestSnapX || distance < bestSnapX.distance) {
            bestSnapX = { offset, distance, target: targetEdge }
          }
        }
      }
    }

    // Y-axis snapping (only for edges being resized)
    if (resizingTop) {
      for (const targetEdge of targetYEdges) {
        const distance = Math.abs(top - targetEdge)
        if (distance <= yThreshold) {
          const offset = targetEdge - top
          if (!bestSnapY || distance < bestSnapY.distance) {
            bestSnapY = { offset, distance, target: targetEdge }
          }
        }
      }
    }

    if (resizingBottom) {
      for (const targetEdge of targetYEdges) {
        const distance = Math.abs(bottom - targetEdge)
        if (distance <= yThreshold) {
          const offset = targetEdge - bottom
          if (!bestSnapY || distance < bestSnapY.distance) {
            bestSnapY = { offset, distance, target: targetEdge }
          }
        }
      }
    }
  }

  return {
    snapX: bestSnapX?.offset ?? 0,
    snapY: bestSnapY?.offset ?? 0,
    snappedToX: bestSnapX?.target ?? null,
    snappedToY: bestSnapY?.target ?? null,
  }
}

// ============================================================================
// ALIGNMENT GUIDE DETECTION
// ============================================================================

/**
 * Detect alignment between an active element and other elements.
 *
 * Returns guide data for rendering cyan alignment lines when edges are close.
 * This is a separate function from snap calculation because:
 * 1. Guides should show even when not actively snapping
 * 2. Guides need full range information (start/end points)
 *
 * @param activeBounds - Bounds of the active element (being dragged/resized/drawn)
 * @param targets - Array of elements to check alignment against
 * @param excludeId - ID of element to exclude (usually the active element itself)
 * @returns Array of alignment guides to render
 */
export function detectAlignments(
  activeBounds: SnapBounds,
  targets: SnapTarget[],
  excludeId?: string
): AlignmentResult {
  const guides: AlignmentGuide[] = []

  // Track unique alignments to avoid duplicates
  const verticalAlignments = new Map<number, { start: number; end: number }>()
  const horizontalAlignments = new Map<number, { start: number; end: number }>()

  // Active element edges
  const activeLeft = activeBounds.x
  const activeRight = activeBounds.x + activeBounds.width
  const activeCenterX = activeBounds.x + activeBounds.width / 2
  const activeTop = activeBounds.y
  const activeBottom = activeBounds.y + activeBounds.height
  const activeCenterY = activeBounds.y + activeBounds.height / 2

  const activeXEdges = [activeLeft, activeCenterX, activeRight]
  const activeYEdges = [activeTop, activeCenterY, activeBottom]

  for (const target of targets) {
    // Skip the active element itself
    if (excludeId && target.id === excludeId) continue
    // Skip nested elements
    if (target.parentId !== null) continue

    // Target element edges
    const targetLeft = target.x
    const targetRight = target.x + target.width
    const targetCenterX = target.x + target.width / 2
    const targetTop = target.y
    const targetBottom = target.y + target.height
    const targetCenterY = target.y + target.height / 2

    const targetXEdges = [targetLeft, targetCenterX, targetRight]
    const targetYEdges = [targetTop, targetCenterY, targetBottom]

    // Check X-axis alignments (vertical guide lines)
    for (const activeEdge of activeXEdges) {
      for (const targetEdge of targetXEdges) {
        if (Math.abs(activeEdge - targetEdge) <= ALIGNMENT_THRESHOLD) {
          const key = Math.round(targetEdge)
          // Calculate vertical extent of the guide
          const minY = Math.min(activeTop, activeBottom, targetTop, targetBottom)
          const maxY = Math.max(activeTop, activeBottom, targetTop, targetBottom)

          const existing = verticalAlignments.get(key)
          if (existing) {
            existing.start = Math.min(existing.start, minY)
            existing.end = Math.max(existing.end, maxY)
          } else {
            verticalAlignments.set(key, { start: minY, end: maxY })
          }
        }
      }
    }

    // Check Y-axis alignments (horizontal guide lines)
    for (const activeEdge of activeYEdges) {
      for (const targetEdge of targetYEdges) {
        if (Math.abs(activeEdge - targetEdge) <= ALIGNMENT_THRESHOLD) {
          const key = Math.round(targetEdge)
          // Calculate horizontal extent of the guide
          const minX = Math.min(activeLeft, activeRight, targetLeft, targetRight)
          const maxX = Math.max(activeLeft, activeRight, targetLeft, targetRight)

          const existing = horizontalAlignments.get(key)
          if (existing) {
            existing.start = Math.min(existing.start, minX)
            existing.end = Math.max(existing.end, maxX)
          } else {
            horizontalAlignments.set(key, { start: minX, end: maxX })
          }
        }
      }
    }
  }

  // Convert to guide array
  verticalAlignments.forEach((range, position) => {
    guides.push({
      axis: 'x',
      position,
      start: range.start,
      end: range.end,
    })
  })

  horizontalAlignments.forEach((range, position) => {
    guides.push({
      axis: 'y',
      position,
      start: range.start,
      end: range.end,
    })
  })

  return { guides }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert canvas elements to snap targets.
 *
 * Filters out the active element and extracts only the needed bounds data.
 *
 * @param elements - Record of all canvas elements
 * @param excludeIds - IDs to exclude (usually the selected elements)
 * @returns Array of snap targets
 */
export function elementsToSnapTargets(
  elements: Record<string, CanvasElement>,
  excludeIds: string[] = []
): SnapTarget[] {
  return Object.values(elements)
    .filter((el) => !excludeIds.includes(el.id))
    .map((el) => ({
      id: el.id,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      parentId: el.parentId,
    }))
}

/**
 * Create a new snap state.
 * Call this at the start of a drag/resize operation.
 */
export function createSnapState(): SnapState {
  return { x: null, y: null }
}

/**
 * Update snap state based on snap result.
 * Call this after each snap calculation to track dead-zone state.
 */
export function updateSnapState(state: SnapState, result: SnapResult): void {
  state.x = result.snappedToX
  state.y = result.snappedToY
}
