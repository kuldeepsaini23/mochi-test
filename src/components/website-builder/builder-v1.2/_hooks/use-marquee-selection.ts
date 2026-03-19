/**
 * ============================================================================
 * USE MARQUEE SELECTION - Rubber Band Selection Hook
 * ============================================================================
 *
 * Enables selecting multiple elements by dragging a selection rectangle
 * across the canvas. Also known as "rubber band" or "lasso" selection.
 *
 * ============================================================================
 * ARCHITECTURE REMINDER - READ BEFORE MODIFYING
 * ============================================================================
 *
 * This hook follows the HYBRID STATE pattern for 60fps performance:
 *
 * 1. REFS for interaction state (updated 60fps, no re-renders)
 *    - marqueeStateRef: tracks start/end points during drag
 *    - rafRef: requestAnimationFrame handle for DOM updates
 *
 * 2. REDUX for persistent state (dispatched once on release)
 *    - setMultiSelection: commits selected element IDs
 *
 * 3. DIRECT DOM MANIPULATION for visual feedback
 *    - Selection rectangle rendered via inline styles
 *    - Updated every frame via RAF
 *
 * ============================================================================
 * LIFECYCLE
 * ============================================================================
 *
 * 1. onPointerDown on canvas background → Initialize marqueeStateRef
 * 2. onPointerMove → Update end point in ref, update DOM via RAF
 * 3. onPointerUp → Calculate intersecting elements, dispatch to Redux
 *
 * ============================================================================
 * INTERSECTION CALCULATION
 * ============================================================================
 *
 * Two modes supported:
 * - CONTAIN: Element must be fully inside marquee (default)
 * - INTERSECT: Element only needs to touch marquee
 *
 * We use axis-aligned bounding box (AABB) intersection testing
 * for O(n) performance where n = number of root elements.
 *
 * NOTE: Currently only selects ROOT elements. Nested element selection
 * would require recursive bounds calculation which adds complexity.
 *
 * ============================================================================
 */

import React, { useCallback, useRef, useState, useEffect } from 'react'
import {
  useAppDispatch,
  useAppSelector,
  setMultiSelection,
  selectViewport,
} from '../_lib'
import { store } from '../_lib/store'
import type { Bounds, MarqueeState, Point, CanvasElement } from '../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface UseMarqueeSelectionOptions {
  /** Ref to the canvas container for coordinate transforms */
  canvasRef: React.RefObject<HTMLDivElement | null>

  /**
   * Selection mode:
   * - 'contain': Element must be fully inside marquee (default)
   * - 'intersect': Element only needs to touch marquee
   */
  mode?: 'contain' | 'intersect'
}

interface UseMarqueeSelectionReturn {
  /** Whether marquee selection is currently active */
  isSelecting: boolean

  /**
   * Whether a marquee selection just completed.
   * Used to prevent the click handler from clearing selection immediately.
   * Resets to false after a short delay.
   */
  justFinishedSelecting: boolean

  /**
   * Current marquee bounds in canvas coordinates.
   * Returns null when not selecting.
   * Used by MarqueeSelectionBox component for rendering.
   */
  marqueeBounds: Bounds | null

  /**
   * IDs of elements currently under the marquee (live preview).
   * Updates in real-time as the user drags the marquee.
   * Use this for visual feedback during selection.
   */
  previewSelectedIds: string[]

  /** Handler to start marquee selection (call on canvas background click) */
  handleMarqueeStart: (e: React.PointerEvent) => void
}

// ============================================================================
// HELPER: Create empty marquee state
// ============================================================================

function createEmptyMarqueeState(): MarqueeState {
  return {
    isSelecting: false,
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 0, y: 0 },
  }
}

// ============================================================================
// HELPER: Convert two points to normalized bounds
// ============================================================================

/**
 * Convert start/end points to a normalized bounds object.
 * Handles cases where user drags in any direction (right-to-left, bottom-to-top).
 */
function pointsToBounds(start: Point, end: Point): Bounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

// ============================================================================
// HELPER: Check if element intersects/is contained by marquee
// ============================================================================

/**
 * Check if element bounds intersect with marquee bounds.
 *
 * @param element - Element to test
 * @param marquee - Marquee bounds
 * @param mode - 'contain' requires full containment, 'intersect' allows partial overlap
 */
function boundsIntersect(
  element: Bounds,
  marquee: Bounds,
  mode: 'contain' | 'intersect'
): boolean {
  if (mode === 'contain') {
    // Element must be FULLY inside marquee
    return (
      element.x >= marquee.x &&
      element.y >= marquee.y &&
      element.x + element.width <= marquee.x + marquee.width &&
      element.y + element.height <= marquee.y + marquee.height
    )
  }

  // INTERSECT mode: AABB intersection test
  // Two rectangles intersect if they overlap on BOTH axes
  return (
    element.x < marquee.x + marquee.width &&
    element.x + element.width > marquee.x &&
    element.y < marquee.y + marquee.height &&
    element.y + element.height > marquee.y
  )
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for marquee (rubber band) selection.
 *
 * USAGE:
 * ```tsx
 * const { isSelecting, marqueeBounds, handleMarqueeStart } = useMarqueeSelection({
 *   canvasRef,
 *   mode: 'intersect'
 * })
 *
 * // On canvas background pointer down:
 * <div onPointerDown={(e) => {
 *   if (e.target === e.currentTarget) {
 *     handleMarqueeStart(e)
 *   }
 * }}>
 *
 * // Render selection box:
 * {isSelecting && marqueeBounds && (
 *   <MarqueeSelectionBox bounds={marqueeBounds} />
 * )}
 * ```
 */
export function useMarqueeSelection({
  canvasRef,
  mode = 'intersect',
}: UseMarqueeSelectionOptions): UseMarqueeSelectionReturn {
  const dispatch = useAppDispatch()
  const viewport = useAppSelector(selectViewport)

  /**
   * Get root elements directly from store.
   *
   * WHY STORE ACCESS INSTEAD OF SELECTOR?
   * - handleMarqueeEnd is in a useCallback
   * - If we used useAppSelector, the callback would capture a stale reference
   * - Direct store access always gets the current state
   *
   * Now page-aware: gets elements from the ACTIVE page.
   */
  const getRootElements = useCallback((): CanvasElement[] => {
    const state = store.getState()
    // Get the active page's canvas
    const activePageId = state.canvas.pages.activePageId
    const activePage = state.canvas.pages.pages[activePageId]
    const { elements, rootIds } = activePage.canvas
    return rootIds.map((id: string) => elements[id]).filter(Boolean)
  }, [])

  // ========================================================================
  // REFS - Performance-critical state (NO re-renders during marquee)
  // ========================================================================

  /**
   * CRITICAL: Marquee state is stored in a REF, not useState.
   *
   * This ref is updated 60 times per second during selection drag.
   * If this were useState, we'd have 60 re-renders per second.
   * With a ref, we have ZERO re-renders during selection.
   */
  const marqueeStateRef = useRef<MarqueeState>(createEmptyMarqueeState())

  /** RAF handle for cancellation */
  const rafRef = useRef<number | null>(null)

  // ========================================================================
  // UI STATE - For external components and rendering
  // ========================================================================

  /**
   * Boolean state for components to know if selection is active.
   * Updates only on start/end, not during drag.
   */
  const [isSelecting, setIsSelecting] = useState(false)

  /**
   * Marquee bounds for rendering the selection rectangle.
   * Updated via RAF during selection for smooth visual feedback.
   */
  const [marqueeBounds, setMarqueeBounds] = useState<Bounds | null>(null)

  /**
   * Preview of selected element IDs during marquee drag.
   * Updates in real-time so elements can show selection state
   * before the user releases the mouse.
   */
  const [previewSelectedIds, setPreviewSelectedIds] = useState<string[]>([])

  /**
   * Flag to indicate we just finished a marquee selection.
   * This prevents the click handler from immediately clearing the selection.
   * The click event fires AFTER pointerup, so without this flag the selection
   * would be cleared right after being set.
   */
  const [justFinishedSelecting, setJustFinishedSelecting] = useState(false)

  // ========================================================================
  // COORDINATE HELPERS
  // ========================================================================

  /**
   * Convert screen coordinates to canvas coordinates.
   * Accounts for pan and zoom.
   */
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: clientX, y: clientY }

      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left - viewport.panX) / viewport.zoom,
        y: (clientY - rect.top - viewport.panY) / viewport.zoom,
      }
    },
    [canvasRef, viewport.panX, viewport.panY, viewport.zoom]
  )

  // ========================================================================
  // MARQUEE START
  // ========================================================================

  /**
   * Initialize marquee selection.
   *
   * Called when user clicks on the canvas background (not on an element).
   * Sets up pointer capture for reliable tracking across the entire window.
   */
  const handleMarqueeStart = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to primary button (left click)
      if (e.button !== 0) return

      e.preventDefault()

      // Capture pointer for reliable tracking even outside canvas bounds
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      // Get start position in canvas coords
      const startPos = screenToCanvas(e.clientX, e.clientY)

      // Initialize marquee state IN REF (not Redux!)
      marqueeStateRef.current = {
        isSelecting: true,
        startPoint: startPos,
        endPoint: startPos, // Same as start initially
      }

      // Update UI state to show selection is active
      setIsSelecting(true)
      setMarqueeBounds({ x: startPos.x, y: startPos.y, width: 0, height: 0 })
    },
    [screenToCanvas]
  )

  // ========================================================================
  // MARQUEE MOVE - Runs in RAF, updates REF not Redux
  // ========================================================================

  /**
   * Handle pointer move during marquee selection.
   *
   * Updates both the visual marquee box AND the preview selection state
   * so elements can show their selected state in real-time.
   */
  const handleMarqueeMove = useCallback(
    (e: PointerEvent) => {
      const marquee = marqueeStateRef.current
      if (!marquee.isSelecting) return

      // Get current position in canvas coords
      const currentPos = screenToCanvas(e.clientX, e.clientY)

      // Update ref with new end point
      marqueeStateRef.current.endPoint = currentPos

      // Update visual bounds via RAF for smooth rendering
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const bounds = pointsToBounds(
          marqueeStateRef.current.startPoint,
          marqueeStateRef.current.endPoint
        )
        setMarqueeBounds(bounds)

        // Calculate preview selection in real-time
        // Only check if marquee is large enough to matter
        if (bounds.width > 5 && bounds.height > 5) {
          const currentRootElements = getRootElements()
          const previewIds: string[] = []

          currentRootElements.forEach((element: CanvasElement) => {
            const elementBounds: Bounds = {
              x: element.x,
              y: element.y,
              width: element.width,
              height: element.height,
            }

            if (boundsIntersect(elementBounds, bounds, mode)) {
              previewIds.push(element.id)
            }
          })

          setPreviewSelectedIds(previewIds)
        }
      })
    },
    [screenToCanvas, getRootElements, mode]
  )

  // ========================================================================
  // MARQUEE END - Commits to Redux
  // ========================================================================

  /**
   * Complete marquee selection.
   *
   * THIS is where we dispatch to Redux - once, with the selected element IDs.
   *
   * CALCULATION:
   * 1. Get final marquee bounds from ref
   * 2. Test each root element against bounds
   * 3. Collect IDs of intersecting elements
   * 4. Dispatch setMultiSelection with collected IDs
   */
  const handleMarqueeEnd = useCallback(
    (e: PointerEvent) => {
      const marquee = marqueeStateRef.current
      if (!marquee.isSelecting) return

      // Release pointer
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

      // Cancel any pending RAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      // Calculate final marquee bounds
      const finalBounds = pointsToBounds(marquee.startPoint, marquee.endPoint)

      // Only process selection if marquee has meaningful size
      // (prevents accidental selection on click without drag)
      const MIN_MARQUEE_SIZE = 5

      if (
        finalBounds.width > MIN_MARQUEE_SIZE &&
        finalBounds.height > MIN_MARQUEE_SIZE
      ) {
        // Get current root elements from store (not stale closure)
        const currentRootElements = getRootElements()

        // Find all elements that intersect with the marquee
        const selectedIds: string[] = []

        currentRootElements.forEach((element: CanvasElement) => {
          const elementBounds: Bounds = {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
          }

          if (boundsIntersect(elementBounds, finalBounds, mode)) {
            selectedIds.push(element.id)
          }
        })

        // ====================================================================
        // DISPATCH TO REDUX - Only happens here, once per marquee operation
        // ====================================================================
        dispatch(setMultiSelection(selectedIds))

        // Set flag to prevent click handler from clearing selection
        // The click event fires AFTER pointerup, so we need this flag
        setJustFinishedSelecting(true)
        // Reset the flag after a short delay (after click event has fired)
        setTimeout(() => setJustFinishedSelecting(false), 100)
      } else {
        // Marquee was too small - treat as a click to deselect
        dispatch(setMultiSelection([]))
      }

      // Reset state
      marqueeStateRef.current = createEmptyMarqueeState()
      setIsSelecting(false)
      setMarqueeBounds(null)
      setPreviewSelectedIds([])
    },
    [dispatch, getRootElements, mode]
  )

  // ========================================================================
  // GLOBAL EVENT LISTENERS
  // ========================================================================

  /**
   * Attach global event listeners for pointer move and up.
   *
   * Using global listeners ensures we capture events even when
   * the pointer moves outside the canvas bounds during selection.
   */
  // Note: We're using a different pattern here - listeners are added/removed
  // on start/end to avoid always-active global listeners

  // Actually, for consistency with other hooks, let's use always-active listeners
  // that check the ref state before acting
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => handleMarqueeMove(e)
    const handlePointerUp = (e: PointerEvent) => handleMarqueeEnd(e)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)

      // Clean up any pending RAF on unmount
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [handleMarqueeMove, handleMarqueeEnd])

  return {
    isSelecting,
    justFinishedSelecting,
    marqueeBounds,
    previewSelectedIds,
    handleMarqueeStart,
  }
}
