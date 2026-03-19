/**
 * ============================================================================
 * USE FRAME CREATION - New Frame Drawing Hook
 * ============================================================================
 *
 * Handles drawing new frames on the canvas via click-and-drag.
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE - READ BEFORE MODIFYING
 * ============================================================================
 *
 * This hook follows the same REF pattern as useDrag and useResize:
 *
 * 1. onPointerDown on canvas → Initialize creationStateRef (REF)
 * 2. onPointerMove → Update creationStateRef (REF), update DOM preview
 * 3. onPointerUp → Dispatch addElement to Redux ONCE with final dimensions
 *
 * WHY REFS?
 * - Pointer events fire 60+ times per second during drawing
 * - Redux dispatch on each move would trigger 60 re-renders/second
 * - Refs update without re-renders, DOM preview is smooth
 *
 * WHAT'S IN THE REF (creationStateRef):
 * - isCreating: boolean
 * - startX, startY: where drawing started
 * - currentX, currentY: where cursor is now
 *
 * WHAT'S IN REDUX:
 * - New element (created and dispatched once on completion)
 *
 * ============================================================================
 * PREVIEW RENDERING
 * ============================================================================
 *
 * The preview rectangle is rendered via a separate state (creationPreview)
 * that's updated in RAF. This is acceptable because:
 * - Frame creation is less frequent than drag operations
 * - Preview is a simple rectangle, cheap to render
 * - We still batch updates via RAF for smoothness
 *
 * ============================================================================
 * DO NOT:
 * - Dispatch addElement on every pointer move
 * - Create the element before the user releases the mouse
 *
 * DO:
 * - Update refs in onPointerMove
 * - Use RAF for preview updates
 * - Dispatch addElement only in onPointerUp
 * ============================================================================
 */

import React, { useCallback, useRef, useEffect, useState } from 'react'
import {
  useAppDispatch,
  useAppSelector,
  selectViewport,
  selectToolMode,
  addElement,
  setSelection,
  setToolMode,
  generateElementId,
  calculateResizeSnap,
  createSnapState,
  updateSnapState,
} from '../_lib'
import type { FrameCreationState, Bounds, FrameElement } from '../_lib/types'
import type { SnapTarget, SnapState, SnapBounds } from '../_lib/snap-service'
import {
  MIN_FRAME_CREATION_SIZE,
  DEFAULT_FRAME_PROPS,
  DEFAULT_FRAME_STYLES,
} from '../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface UseFrameCreationOptions {
  /** Ref to canvas container for coordinate transforms */
  canvasRef: React.RefObject<HTMLDivElement>
  /** Snap targets for alignment (all root-level elements) */
  snapTargets: SnapTarget[]
  /** Whether snap-to-grid is enabled (default: true) */
  snapEnabled?: boolean
}

interface UseFrameCreationReturn {
  /** Preview rectangle bounds (for rendering preview overlay) */
  creationPreview: Bounds | null
  /** Whether frame creation is currently in progress */
  isCreating: boolean
  /**
   * Current bounds of the frame being created (for alignment guides).
   * Only valid when isCreating is true. Uses canvas coordinates.
   */
  activeBounds: SnapBounds | null
  /** Handler for canvas pointer down (start drawing) */
  handleCanvasPointerDown: (e: React.PointerEvent) => void
}

// ============================================================================
// HELPER: Create empty creation state
// ============================================================================

function createEmptyCreationState(): FrameCreationState {
  return {
    isCreating: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  }
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for handling new frame creation via click-and-drag.
 *
 * ARCHITECTURE:
 * - Uses refs for creation state (60fps performance)
 * - Uses RAF for preview updates
 * - Dispatches addElement to Redux only on creation complete
 *
 * USAGE:
 * ```tsx
 * const { creationPreview, isCreating, handleCanvasPointerDown } = useFrameCreation({
 *   canvasRef
 * })
 *
 * // In canvas component:
 * <div onPointerDown={handleCanvasPointerDown}>
 *   {creationPreview && <FramePreview bounds={creationPreview} />}
 * </div>
 * ```
 */
export function useFrameCreation({
  canvasRef,
  snapTargets,
  snapEnabled = true,
}: UseFrameCreationOptions): UseFrameCreationReturn {
  const dispatch = useAppDispatch()
  const viewport = useAppSelector(selectViewport)
  const toolMode = useAppSelector(selectToolMode)

  // ========================================================================
  // REFS - Performance-critical state (NO re-renders during drawing)
  // ========================================================================

  /**
   * CRITICAL: Creation state is stored in a REF, not useState.
   *
   * This ref is updated 60 times per second during drawing.
   * If this were useState, we'd have 60 re-renders per second.
   * With a ref, we have minimal re-renders during drawing.
   */
  const creationStateRef = useRef<FrameCreationState>(createEmptyCreationState())

  /** RAF handle for cancellation */
  const rafRef = useRef<number | null>(null)

  /**
   * Snap state for dead-zone tracking.
   * When snapped, requires more movement to "break free" (sticky behavior).
   * Reset at creation start, updated during creation move.
   */
  const snapStateRef = useRef<SnapState>(createSnapState())

  // ========================================================================
  // UI STATE - For rendering preview rectangle
  // ========================================================================

  /**
   * Preview bounds for the rectangle being drawn.
   * This IS useState because we need React to render the preview.
   * Updated via RAF batching for smooth 60fps preview.
   */
  const [creationPreview, setCreationPreview] = useState<Bounds | null>(null)

  /** Simple boolean for external components */
  const [isCreating, setIsCreating] = useState(false)

  /**
   * Current bounds of the frame being created in canvas coordinates.
   * Used by Rulers component to render alignment guides during creation.
   * Updated via RAF for 60fps performance.
   */
  const [activeBounds, setActiveBounds] = useState<SnapBounds | null>(null)

  // ========================================================================
  // COORDINATE HELPERS
  // ========================================================================

  /**
   * Convert screen coordinates to canvas coordinates.
   * Accounts for pan and zoom.
   */
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
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
  // CREATION START
  // ========================================================================

  /**
   * Start drawing a new frame.
   *
   * IMPORTANT: Only works when in 'frame' tool mode.
   * This initializes the REF, not Redux state.
   */
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle frame creation in 'frame' or 'circle-frame' mode
      if (toolMode !== 'frame' && toolMode !== 'circle-frame') return

      // Only handle direct canvas clicks (not element clicks)
      const target = e.target as HTMLElement
      if (target.closest('[data-element-id]')) return

      e.preventDefault()

      // Capture pointer for reliable tracking
      target.setPointerCapture(e.pointerId)

      // Get start position in canvas coords
      const startPos = screenToCanvas(e.clientX, e.clientY)

      // Initialize creation state IN REF (not Redux!)
      creationStateRef.current = {
        isCreating: true,
        startX: startPos.x,
        startY: startPos.y,
        currentX: startPos.x,
        currentY: startPos.y,
      }

      // Reset snap state for new creation operation
      snapStateRef.current = createSnapState()

      setIsCreating(true)
      setCreationPreview({
        x: startPos.x,
        y: startPos.y,
        width: 0,
        height: 0,
      })
    },
    [toolMode, screenToCanvas]
  )

  // ========================================================================
  // CREATION MOVE - Updates preview rectangle
  // ========================================================================

  /**
   * Handle pointer move during frame creation.
   *
   * CRITICAL: Updates the REF and preview state via RAF.
   * We dispatch to Redux only when creation ENDS.
   */
  const handleCreationMove = useCallback(
    (e: PointerEvent) => {
      const creation = creationStateRef.current
      if (!creation.isCreating) return

      // Update current position in REF
      const currentPos = screenToCanvas(e.clientX, e.clientY)
      creation.currentX = currentPos.x
      creation.currentY = currentPos.y

      // Calculate bounds (handle negative width/height from dragging up/left)
      let bounds = calculateBounds(
        creation.startX,
        creation.startY,
        creation.currentX,
        creation.currentY
      )

      // ======================================================================
      // SHIFT CONSTRAINT: Force 1:1 aspect ratio (perfect square)
      // ======================================================================
      // When shift is held, constrain width and height to whichever is larger.
      // This keeps the frame square — useful for circle frames (perfect circle)
      // and regular frames that need equal proportions.
      // ======================================================================
      if (e.shiftKey) {
        const maxSide = Math.max(bounds.width, bounds.height)
        // Adjust position so the constraint grows from the correct corner
        if (creation.currentX < creation.startX) {
          bounds = { ...bounds, x: creation.startX - maxSide, width: maxSide, height: maxSide }
        } else if (creation.currentY < creation.startY) {
          bounds = { ...bounds, y: creation.startY - maxSide, width: maxSide, height: maxSide }
        } else {
          bounds = { ...bounds, width: maxSide, height: maxSide }
        }
      }

      // ======================================================================
      // SNAP-TO-GRID: Apply snap to the edges being drawn
      // ======================================================================
      // Frame creation snaps similarly to resize - the edges being drawn
      // can snap to other elements' edges. We use 'se' (southeast) handle
      // logic since the user is always drawing from a start point outward.
      // ======================================================================

      const shouldSnap = snapEnabled && snapTargets.length > 0

      if (shouldSnap && bounds.width > 0 && bounds.height > 0) {
        // Determine which handle direction based on drag direction
        // If current is right/below start: 'se' (drawing down-right)
        // If current is left of start: include 'w'
        // If current is above start: include 'n'
        let handle = ''
        handle += currentPos.y < creation.startY ? 'n' : 's'
        handle += currentPos.x < creation.startX ? 'w' : 'e'

        const snapResult = calculateResizeSnap(
          bounds,
          handle,
          snapTargets,
          snapStateRef.current
        )

        // Apply snap offsets based on which edges are being drawn
        if (handle.includes('w') && snapResult.snapX !== 0) {
          bounds = {
            ...bounds,
            x: bounds.x + snapResult.snapX,
            width: bounds.width - snapResult.snapX,
          }
        } else if (handle.includes('e') && snapResult.snapX !== 0) {
          bounds = {
            ...bounds,
            width: bounds.width + snapResult.snapX,
          }
        }

        if (handle.includes('n') && snapResult.snapY !== 0) {
          bounds = {
            ...bounds,
            y: bounds.y + snapResult.snapY,
            height: bounds.height - snapResult.snapY,
          }
        } else if (handle.includes('s') && snapResult.snapY !== 0) {
          bounds = {
            ...bounds,
            height: bounds.height + snapResult.snapY,
          }
        }

        // Update snap state for dead-zone tracking
        updateSnapState(snapStateRef.current, snapResult)
      }

      // Update preview via RAF
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setCreationPreview(bounds)

        // Update active bounds for alignment guide rendering
        if (bounds.width > 0 && bounds.height > 0) {
          setActiveBounds({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          })
        }
      })
    },
    [screenToCanvas, snapEnabled, snapTargets]
  )

  // ========================================================================
  // CREATION END - Creates element in Redux
  // ========================================================================

  /**
   * Complete frame creation.
   *
   * THIS is where we dispatch to Redux - once, with the new element.
   * Uses the snapped preview bounds (from creationPreview state) rather than
   * recalculating, so the final element matches the visual preview exactly.
   */
  const handleCreationEnd = useCallback(
    (e: PointerEvent) => {
      const creation = creationStateRef.current
      if (!creation.isCreating) return

      // Release pointer
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

      // Use the snapped preview bounds if available, otherwise calculate fresh
      // The preview already has snap applied, so using it ensures the final
      // element position matches what the user saw during creation
      const bounds = creationPreview ?? calculateBounds(
        creation.startX,
        creation.startY,
        creation.currentX,
        creation.currentY
      )

      // Only create if frame meets minimum size
      if (
        bounds.width >= MIN_FRAME_CREATION_SIZE &&
        bounds.height >= MIN_FRAME_CREATION_SIZE
      ) {
        // ====================================================================
        // DISPATCH TO REDUX - Only happens here, once per frame creation
        // ====================================================================
        // Circle frame mode applies max borderRadius via styles
        const isCircle = toolMode === 'circle-frame'

        const newElement: FrameElement = {
          id: generateElementId(),
          type: 'frame',
          name: isCircle ? 'Circle Frame' : 'Frame',
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          parentId: null, // Created at root level
          order: 0, // Will be set correctly by reducer
          ...DEFAULT_FRAME_PROPS,
          // All visual/layout CSS properties in one spreadable object
          styles: {
            ...DEFAULT_FRAME_STYLES,
            ...(isCircle && { borderRadius: 9999, overflow: 'hidden' }),
          },
        }

        dispatch(addElement(newElement))
        dispatch(setSelection(newElement.id))
      }

      // Switch back to select mode after creating
      dispatch(setToolMode('select'))

      // Reset state
      creationStateRef.current = createEmptyCreationState()
      snapStateRef.current = createSnapState()

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      setIsCreating(false)
      setCreationPreview(null)
      setActiveBounds(null)
    },
    [dispatch, creationPreview, toolMode]
  )

  // ========================================================================
  // GLOBAL EVENT LISTENERS
  // ========================================================================

  useEffect(() => {
    window.addEventListener('pointermove', handleCreationMove)
    window.addEventListener('pointerup', handleCreationEnd)

    return () => {
      window.removeEventListener('pointermove', handleCreationMove)
      window.removeEventListener('pointerup', handleCreationEnd)
    }
  }, [handleCreationMove, handleCreationEnd])

  return { creationPreview, isCreating, activeBounds, handleCanvasPointerDown }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate bounds from two points, handling negative dimensions.
 *
 * When user drags up or left from start point, width/height would be negative.
 * This function normalizes to always return positive dimensions with
 * correctly adjusted x/y.
 */
function calculateBounds(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Bounds {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }
}
