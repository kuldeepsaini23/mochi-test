/**
 * ============================================================================
 * USE RESIZE - Element Resizing Hook
 * ============================================================================
 *
 * Handles all resize logic for canvas elements via corner/edge handles.
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE - READ BEFORE MODIFYING
 * ============================================================================
 *
 * This hook uses REFS for 60fps performance, NOT Redux state during resize:
 *
 * 1. onPointerDown on handle → Initialize resizeStateRef (REF, not Redux)
 * 2. onPointerMove → Update resizeStateRef (REF), update DOM via RAF
 * 3. onPointerUp → Dispatch to Redux ONCE with final dimensions
 *
 * WHY REFS?
 * - Pointer events fire 60+ times per second during resize
 * - Redux dispatch on each move would trigger 60 re-renders/second
 * - Refs update without re-renders, DOM updates via RAF are smooth
 *
 * WHAT'S IN THE REF (resizeStateRef):
 * - isResizing: boolean
 * - elementId: string
 * - handle: which handle is being dragged
 * - start position and original bounds
 *
 * WHAT'S IN REDUX:
 * - Element's final position and size (committed on release)
 *
 * ============================================================================
 * DO NOT:
 * - Dispatch Redux actions in onPointerMove
 * - Use useState for resize dimensions
 * - Update React state during resize
 *
 * DO:
 * - Update refs in onPointerMove
 * - Use RAF for DOM updates
 * - Dispatch to Redux only in onPointerUp
 * ============================================================================
 */

import React, { useCallback, useRef, useEffect, useState } from 'react'
import {
  useAppDispatch,
  useAppSelector,
  selectViewport,
  updateElement,
  calculateResizeSnap,
  createSnapState,
  updateSnapState,
} from '../_lib'
import type { ResizeState, ResizeHandle, CanvasElement } from '../_lib/types'
import type { SnapTarget, SnapState, SnapBounds } from '../_lib/snap-service'
import { MIN_ELEMENT_SIZE } from '../_lib/types'

// ============================================================================
// DOM QUERY HELPER — Excludes Mobile Breakpoint Frame Duplicates
// ============================================================================

/**
 * Find a canvas element by data-element-id, EXCLUDING elements inside the
 * mobile breakpoint frame (`[data-breakpoint-frame]`).
 *
 * The BreakpointMobileFrame renders the same elements with the same
 * data-element-id attributes. A plain querySelector would match the
 * mobile copy instead of the main canvas element.
 */
function findCanvasElement(elementId: string): HTMLElement | null {
  const all = document.querySelectorAll(`[data-element-id="${elementId}"]`)
  for (const el of all) {
    if (!el.closest('[data-breakpoint-frame]')) return el as HTMLElement
  }
  return null
}

// ============================================================================
// TYPES
// ============================================================================

interface UseResizeOptions {
  /** Ref to canvas container for coordinate transforms */
  canvasRef: React.RefObject<HTMLDivElement>
  /** Function to get element by ID from Redux */
  getElementById: (id: string) => CanvasElement | undefined
  /** Snap targets for alignment (root-level elements excluding resized one) */
  snapTargets: SnapTarget[]
  /** Whether snap-to-grid is enabled (default: true) */
  snapEnabled?: boolean
}

interface UseResizeReturn {
  /** Whether resize is currently in progress */
  isResizing: boolean
  /**
   * Current bounds of the element being resized (for alignment guides).
   * Only valid when isResizing is true. Uses canvas coordinates.
   */
  activeBounds: SnapBounds | null
  /** Handler to start resizing from a handle */
  handleResizeStart: (
    e: React.PointerEvent,
    elementId: string,
    handle: ResizeHandle
  ) => void
}

// ============================================================================
// HELPER: Create empty resize state
// ============================================================================

function createEmptyResizeState(): ResizeState {
  return {
    isResizing: false,
    elementId: null,
    handle: null,
    startX: 0,
    startY: 0,
    originalX: 0,
    originalY: 0,
    originalWidth: 0,
    originalHeight: 0,
    hadWrapMode: false,
  }
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for handling element resize operations.
 *
 * ARCHITECTURE:
 * - Uses refs for resize state (60fps performance)
 * - Uses RAF for DOM updates
 * - Dispatches to Redux only on resize end
 *
 * USAGE:
 * ```tsx
 * const { isResizing, handleResizeStart } = useResize({ canvasRef, getElementById })
 *
 * // In resize handle component:
 * <div onPointerDown={(e) => handleResizeStart(e, element.id, 'se')}>
 * ```
 */
export function useResize({
  canvasRef,
  getElementById,
  snapTargets,
  snapEnabled = true,
}: UseResizeOptions): UseResizeReturn {
  const dispatch = useAppDispatch()
  const viewport = useAppSelector(selectViewport)

  // ========================================================================
  // REFS - Performance-critical state (NO re-renders during resize)
  // ========================================================================

  /**
   * CRITICAL: Resize state is stored in a REF, not useState.
   *
   * This ref is updated 60 times per second during resize.
   * If this were useState, we'd have 60 re-renders per second.
   * With a ref, we have ZERO re-renders during resize.
   */
  const resizeStateRef = useRef<ResizeState>(createEmptyResizeState())

  /**
   * Stores the current calculated dimensions during resize.
   * Used to commit final values to Redux without reading from DOM.
   * This avoids the glitch where elements jump to (0,0) when styles are cleared.
   */
  const currentDimensionsRef = useRef({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })

  /** RAF handle for cancellation */
  const rafRef = useRef<number | null>(null)

  /**
   * Snap state for dead-zone tracking.
   * When snapped, requires more movement to "break free" (sticky behavior).
   * Reset at resize start, updated during resize move.
   */
  const snapStateRef = useRef<SnapState>(createSnapState())

  // ========================================================================
  // UI STATE - Only for external components to know if resize is happening
  // ========================================================================

  /**
   * Simple boolean state for external components.
   * Updates only on start/end, not during resize.
   */
  const [isResizing, setIsResizing] = useState(false)

  /**
   * Current bounds of the resizing element in canvas coordinates.
   * Used by Rulers component to render alignment guides during resize.
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
  // RESIZE START
  // ========================================================================

  /**
   * Initialize resize operation.
   *
   * IMPORTANT: This initializes the REF, not Redux state.
   * Redux is only updated when resize ENDS.
   */
  const handleResizeStart = useCallback(
    (e: React.PointerEvent, elementId: string, handle: ResizeHandle) => {
      e.preventDefault()
      e.stopPropagation()

      const element = getElementById(elementId)
      if (!element) return

      // Capture pointer for reliable tracking
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      // Get start position in canvas coords
      const startPos = screenToCanvas(e.clientX, e.clientY)

      // ======================================================================
      // FIX: Read ACTUAL rendered dimensions when autoWidth/autoHeight enabled
      // ======================================================================
      // When autoWidth or autoHeight is enabled, the element uses CSS-based sizing
      // (width: 100% or height: auto) instead of the stored pixel value.
      // The stored element.width/height may be stale from before auto-sizing was enabled.
      // Reading from DOM ensures we start with the ACTUAL visible dimensions.
      // ======================================================================
      let actualWidth = element.width
      let actualHeight = element.height

      // Check if element has autoWidth enabled (frames, images, text can have this)
      const hasAutoWidth = 'autoWidth' in element && (element as any).autoWidth === true
      // Check if element has autoHeight enabled (text, buttons can have this)
      const hasAutoHeight = 'autoHeight' in element && (element as any).autoHeight === true
      // Check if element has wrap enabled (frames with wrap have auto-height behavior)
      const hasWrap = element.type === 'frame' && element.styles?.flexWrap === 'wrap'

      /**
       * Pages use height: auto with minHeight, so DOM height may exceed
       * element.height when content is taller. We need to read the actual
       * rendered height to start resizing from the correct visual position.
       */
      const isPage = element.type === 'page'

      if (hasAutoWidth || hasAutoHeight || hasWrap || isPage) {
        const dom = findCanvasElement(elementId)
        if (dom) {
          const rect = dom.getBoundingClientRect()
          // Convert screen pixels to canvas coordinates by dividing by zoom
          if (hasAutoWidth) {
            actualWidth = rect.width / viewport.zoom
          }
          if (hasAutoHeight || hasWrap || isPage) {
            actualHeight = rect.height / viewport.zoom
          }
        }
      }

      // Initialize resize state IN REF (not Redux!)
      resizeStateRef.current = {
        isResizing: true,
        elementId,
        handle,
        startX: startPos.x,
        startY: startPos.y,
        originalX: element.x,
        originalY: element.y,
        originalWidth: actualWidth,
        originalHeight: actualHeight,
        hadWrapMode: hasWrap,
      }

      // Initialize current dimensions with original values
      // This ensures we have valid values even if user releases immediately
      currentDimensionsRef.current = {
        x: element.x,
        y: element.y,
        width: actualWidth,
        height: actualHeight,
      }

      // Reset snap state for new resize operation
      // This ensures dead-zone tracking starts fresh
      snapStateRef.current = createSnapState()

      setIsResizing(true)
    },
    [getElementById, screenToCanvas]
  )

  // ========================================================================
  // RESIZE MOVE - Runs in RAF, updates REF not Redux
  // ========================================================================

  /**
   * Handle pointer move during resize.
   *
   * CRITICAL: This updates the REF and DOM directly, not Redux.
   * We dispatch to Redux only when resize ENDS.
   */
  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      const resize = resizeStateRef.current
      if (!resize.isResizing || !resize.elementId || !resize.handle) return

      // Calculate delta in canvas coords
      const currentPos = screenToCanvas(e.clientX, e.clientY)
      const deltaX = currentPos.x - resize.startX
      const deltaY = currentPos.y - resize.startY

      // Calculate new bounds based on which handle is being dragged
      let newX = resize.originalX
      let newY = resize.originalY
      let newWidth = resize.originalWidth
      let newHeight = resize.originalHeight

      const handle = resize.handle

      // Handle horizontal resizing
      if (handle.includes('w')) {
        // West handles move x and shrink width
        newX = resize.originalX + deltaX
        newWidth = resize.originalWidth - deltaX
      } else if (handle.includes('e')) {
        // East handles only grow width
        newWidth = resize.originalWidth + deltaX
      }

      // Handle vertical resizing
      if (handle.includes('n')) {
        // North handles move y and shrink height
        newY = resize.originalY + deltaY
        newHeight = resize.originalHeight - deltaY
      } else if (handle.includes('s')) {
        // South handles only grow height
        newHeight = resize.originalHeight + deltaY
      }

      // Enforce minimum size
      if (newWidth < MIN_ELEMENT_SIZE) {
        if (handle.includes('w')) {
          newX = resize.originalX + resize.originalWidth - MIN_ELEMENT_SIZE
        }
        newWidth = MIN_ELEMENT_SIZE
      }
      if (newHeight < MIN_ELEMENT_SIZE) {
        if (handle.includes('n')) {
          newY = resize.originalY + resize.originalHeight - MIN_ELEMENT_SIZE
        }
        newHeight = MIN_ELEMENT_SIZE
      }

      // ======================================================================
      // SNAP-TO-GRID: Only applies for root-level elements
      // ======================================================================
      // Snapping is applied to the edges being resized, allowing the element
      // to snap to other elements' edges, centers, and boundaries.
      // ======================================================================

      const element = getElementById(resize.elementId!)
      const isRootElement = element?.parentId === null
      const shouldSnap = snapEnabled && isRootElement && snapTargets.length > 0

      if (shouldSnap) {
        // Build bounds for snap calculation
        const bounds: SnapBounds = {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        }

        // Calculate snap offsets based on which handle is being resized
        const snapResult = calculateResizeSnap(
          bounds,
          handle,
          snapTargets,
          snapStateRef.current
        )

        // Apply snap offsets - this adjusts both position and size
        // For west handles: adjust X and width
        // For east handles: adjust width only
        // For north handles: adjust Y and height
        // For south handles: adjust height only
        if (handle.includes('w') && snapResult.snapX !== 0) {
          newX += snapResult.snapX
          newWidth -= snapResult.snapX
        } else if (handle.includes('e') && snapResult.snapX !== 0) {
          newWidth += snapResult.snapX
        }

        if ((handle === 'n' || handle.includes('n')) && snapResult.snapY !== 0) {
          newY += snapResult.snapY
          newHeight -= snapResult.snapY
        } else if ((handle === 's' || handle.includes('s')) && snapResult.snapY !== 0) {
          newHeight += snapResult.snapY
        }

        // Update snap state for dead-zone tracking
        updateSnapState(snapStateRef.current, snapResult)
      }

      // Store current dimensions in ref for use in handleResizeEnd
      // This avoids reading from DOM which can be unreliable
      currentDimensionsRef.current = {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      }

      // Update DOM via RAF (not React state!)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const elementDom = document.querySelector(
          `[data-element-id="${resize.elementId}"]`
        ) as HTMLElement
        if (!elementDom) return

        // Apply size directly to DOM
        elementDom.style.width = `${newWidth}px`

        /**
         * Wrap-mode frames use height: auto so the wrapper grows with
         * reflowed content. Setting an explicit pixel height here would
         * override that and lock the wrapper (and its selection ring /
         * resize handles) at a stale value while the content reflows to
         * a different height. So we skip setting height for wrap mode
         * and let the browser compute it from content.
         */
        if (!resize.hadWrapMode) {
          elementDom.style.height = `${newHeight}px`
        }

        /**
         * AUTO-HEIGHT FIX: Also update the content div's minHeight during drag.
         * When the element is a page, the content div has height: auto and
         * doesn't fill the wrapper. Setting minHeight on the content div forces
         * it to match the wrapper height, preventing the visual disconnect
         * where handles move but the styled area stays small.
         * The data-element-content attribute is set by UnifiedFrame in canvas mode.
         */
        const elementForContentFix = getElementById(resize.elementId!)
        const needsContentMinHeight = elementForContentFix?.type === 'page'
        if (needsContentMinHeight) {
          const contentDiv = elementDom.querySelector('[data-element-content]') as HTMLElement
          if (contentDiv) {
            contentDiv.style.minHeight = `${newHeight}px`
          }
        }

        // Update dimensions pill text in real-time
        const dimensionsPill = elementDom.querySelector('[data-dimensions-pill="true"] span') as HTMLElement
        if (dimensionsPill) {
          // Check if element has autoWidth enabled (shows "Fill" instead of width)
          const elementCheck = getElementById(resize.elementId!)
          const hasAutoWidth = elementCheck?.type === 'frame' && (elementCheck as any).autoWidth === true
          dimensionsPill.textContent = `${hasAutoWidth ? 'Fill' : Math.round(newWidth)} × ${Math.round(newHeight)}`
        }

        // For position changes (when resizing from nw, n, w, sw handles),
        // use transform to avoid conflicts with React's left/top
        const elementCheck = getElementById(resize.elementId!)
        if (elementCheck && elementCheck.parentId === null) {
          // Calculate offset from original position
          const offsetX = newX - resize.originalX
          const offsetY = newY - resize.originalY

          // Use transform for the offset - this doesn't conflict with left/top
          if (offsetX !== 0 || offsetY !== 0) {
            elementDom.style.transform = `translate(${offsetX}px, ${offsetY}px)`
          } else {
            elementDom.style.transform = ''
          }

          // Update active bounds for alignment guide rendering
          setActiveBounds({
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight,
          })
        } else {
          // Not a root element - no alignment guides needed
          setActiveBounds(null)
        }
      })
    },
    [screenToCanvas, getElementById, snapEnabled, snapTargets]
  )

  // ========================================================================
  // RESIZE END - Commits to Redux
  // ========================================================================

  /**
   * Complete resize operation.
   *
   * THIS is where we dispatch to Redux - once, with the final dimensions.
   *
   * IMPORTANT: We read final dimensions from currentDimensionsRef, NOT from DOM.
   * Reading from DOM was causing glitches because:
   * 1. DOM reads can fail or return unexpected values
   * 2. Clearing styles before React re-renders causes a flash
   */
  const handleResizeEnd = useCallback(
    (e: PointerEvent) => {
      const resize = resizeStateRef.current
      if (!resize.isResizing || !resize.elementId || !resize.handle) return

      // Release pointer
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

      // Cancel any pending RAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      const elementId = resize.elementId

      // Get element to check if it's a root element
      const element = getElementById(elementId)
      const isRootElement = element?.parentId === null

      // Get final dimensions from our ref (NOT from DOM!)
      const { x: finalX, y: finalY, width: finalWidth, height: finalHeight } =
        currentDimensionsRef.current

      // Check if dimensions actually changed
      // For child elements, only check size (they don't use x/y positioning)
      const sizeChanged =
        finalWidth !== resize.originalWidth ||
        finalHeight !== resize.originalHeight
      const positionChanged =
        isRootElement &&
        (finalX !== resize.originalX || finalY !== resize.originalY)

      if (sizeChanged || positionChanged) {
        // ====================================================================
        // DISPATCH TO REDUX - Only happens here, once per resize operation
        // ====================================================================
        // For root elements: update x, y, width, height
        // For child elements: only update width, height (they use flexbox positioning)
        const updates: Partial<CanvasElement> = {
          width: finalWidth,
          height: finalHeight,
        }

        // Only include position for root elements
        if (isRootElement) {
          updates.x = finalX
          updates.y = finalY
        }

        // ====================================================================
        // FIX: Disable autoWidth/autoHeight when user manually resizes
        // ====================================================================
        // Manual resize implies the user wants specific pixel dimensions,
        // so we disable auto-sizing modes that would override the new values.
        // This prevents the confusing behavior where:
        // 1. User has autoWidth enabled (element uses width: 100%)
        // 2. User resizes to a specific width
        // 3. autoWidth still enabled -> element ignores the new width
        // ====================================================================

        // Check if element currently has auto-sizing enabled
        const hasAutoWidth = 'autoWidth' in element! && (element as any).autoWidth === true
        const hasAutoHeight = 'autoHeight' in element! && (element as any).autoHeight === true

        // Determine which handles affect width vs height
        const handle = resize.handle
        const resizedWidth = handle?.includes('w') || handle?.includes('e')
        const resizedHeight = handle?.includes('n') || handle?.includes('s')

        // Disable autoWidth if user resized horizontally
        if (hasAutoWidth && resizedWidth) {
          (updates as any).autoWidth = false
        }

        // Disable autoHeight if user resized vertically (and element has autoHeight)
        // Note: wrap-enabled frames use height:auto via CSS, but we can still set the height
        if (hasAutoHeight && resizedHeight) {
          (updates as any).autoHeight = false
        }

        /**
         * WRAP MODE → FIXED HEIGHT: When user manually resizes a wrap-mode
         * frame's height, switch from "fit content" to "fixed height" mode.
         * This is the correct behavior — manual resize implies the user wants
         * specific dimensions, not content-driven sizing.
         * We merge the existing styles and only override flexWrap to preserve
         * all other style properties (gap, padding, background, etc.).
         */
        const hadWrap = resize.hadWrapMode
        if (hadWrap && resizedHeight && element) {
          (updates as any).styles = {
            ...(element.styles ?? {}),
            flexWrap: 'nowrap',
          }
        }

        dispatch(
          updateElement({
            id: elementId,
            updates,
          })
        )
      }

      // Clear transform immediately - it was only used for visual offset during resize
      // and must be removed before React re-renders with new left/top values
      const elementDom = document.querySelector(
        `[data-element-id="${elementId}"]`
      ) as HTMLElement

      if (elementDom) {
        // Clear transform immediately to avoid double-offset
        elementDom.style.transform = ''

        /**
         * Clean up inline minHeight on content div that was set during drag.
         * Only pages set minHeight on the content div during resize —
         * wrap-mode frames skip it because they use height: auto and let
         * the browser compute height from reflowed content.
         */
        const elementForCleanup = getElementById(elementId)
        if (elementForCleanup?.type === 'page') {
          const contentDiv = elementDom.querySelector('[data-element-content]') as HTMLElement
          if (contentDiv) {
            contentDiv.style.minHeight = ''
          }
        }

        // Keep width/height inline styles - they match what we just dispatched
        // to Redux, so there's no visual flash. React will overwrite them
        // on next render with the same values.
      }

      // Reset state
      resizeStateRef.current = createEmptyResizeState()
      snapStateRef.current = createSnapState()
      setIsResizing(false)

      // Clear active bounds - no longer resizing
      setActiveBounds(null)
    },
    [dispatch, getElementById]
  )

  // ========================================================================
  // GLOBAL EVENT LISTENERS
  // ========================================================================

  useEffect(() => {
    window.addEventListener('pointermove', handleResizeMove)
    window.addEventListener('pointerup', handleResizeEnd)

    return () => {
      window.removeEventListener('pointermove', handleResizeMove)
      window.removeEventListener('pointerup', handleResizeEnd)
    }
  }, [handleResizeMove, handleResizeEnd])

  return { isResizing, activeBounds, handleResizeStart }
}
