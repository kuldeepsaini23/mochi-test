/**
 * ============================================================================
 * ELEMENT OVERLAY CONTEXT - Portal system for element UI overlays
 * ============================================================================
 *
 * SOURCE OF TRUTH: Canvas overlay portal system for element UI
 *
 * This context provides a portal container for rendering element overlays
 * (labels, dimension pills, resize handles, badges) outside the normal DOM
 * hierarchy. This prevents overlays from being clipped when elements are
 * nested inside frames with overflow:hidden.
 *
 * ============================================================================
 * PROBLEM
 * ============================================================================
 *
 * When an element (e.g., button) is inside a frame:
 * - Frame's content div has overflow: hidden to clip children
 * - Element renders its label at top: -24 (above its bounds)
 * - Element renders its handles at the edges
 * - Element renders badges that extend outside bounds
 *
 * Since the element is INSIDE the frame's content div, its absolutely
 * positioned overlays get clipped by the parent's overflow: hidden.
 *
 * ============================================================================
 * SOLUTION
 * ============================================================================
 *
 * Render overlays to a portal container at the canvas level:
 * - Canvas provides an overlay container via this context
 * - Elements render their overlays through createPortal to this container
 * - Overlays are positioned using world-space coordinates
 * - Overlays have the same transform as the canvas content (zoom/pan)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * 1. Canvas wraps content in ElementOverlayProvider
 * 2. Canvas provides an overlay container ref
 * 3. Elements use useElementOverlayPortal() to get the container
 * 4. Elements use ElementOverlayPortal component to render overlays
 *
 * ============================================================================
 */

'use client'

import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  type RefObject,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// ============================================================================
// TYPES
// ============================================================================

interface ElementOverlayContextValue {
  /**
   * Reference to the overlay container DOM element.
   * Overlays are rendered to this container via createPortal.
   */
  overlayContainerRef: RefObject<HTMLDivElement>

  /**
   * Whether the overlay system is available.
   * False during SSR or if provider is not mounted.
   */
  isAvailable: boolean
}

// ============================================================================
// CONTEXT
// ============================================================================

const ElementOverlayContext = createContext<ElementOverlayContextValue | null>(null)

// ============================================================================
// PROVIDER
// ============================================================================

interface ElementOverlayProviderProps {
  /**
   * Reference to the overlay container.
   * Should be a div at the canvas level that has the same transform as content.
   */
  overlayContainerRef: RefObject<HTMLDivElement>

  children: ReactNode
}

/**
 * Provider component that makes the overlay container available to child elements.
 *
 * USAGE:
 * ```tsx
 * // In canvas.tsx
 * const overlayRef = useRef<HTMLDivElement>(null)
 *
 * return (
 *   <ElementOverlayProvider overlayContainerRef={overlayRef}>
 *     <div data-canvas-content>{elements}</div>
 *     <div ref={overlayRef} data-canvas-overlays />
 *   </ElementOverlayProvider>
 * )
 * ```
 */
export function ElementOverlayProvider({
  overlayContainerRef,
  children,
}: ElementOverlayProviderProps) {
  const value = useMemo<ElementOverlayContextValue>(
    () => ({
      overlayContainerRef,
      isAvailable: true,
    }),
    [overlayContainerRef]
  )

  return (
    <ElementOverlayContext.Provider value={value}>
      {children}
    </ElementOverlayContext.Provider>
  )
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access the overlay portal context.
 *
 * Returns null if not inside an ElementOverlayProvider (e.g., during SSR
 * or in preview/live mode where overlays aren't needed).
 */
export function useElementOverlayContext(): ElementOverlayContextValue | null {
  return useContext(ElementOverlayContext)
}

// ============================================================================
// PORTAL COMPONENT
// ============================================================================

interface ElementOverlayPortalProps {
  children: ReactNode
}

/**
 * Portal component that renders children to the canvas overlay layer.
 *
 * Falls back to inline rendering if the overlay container isn't available.
 * This allows elements to work both in canvas editor (with portal) and
 * in preview/live mode (inline rendering, no clipping issues there).
 *
 * USAGE:
 * ```tsx
 * <ElementOverlayPortal>
 *   <div className="element-label">Button</div>
 * </ElementOverlayPortal>
 * ```
 */
export function ElementOverlayPortal({ children }: ElementOverlayPortalProps) {
  const context = useContext(ElementOverlayContext)

  // If context not available or container not mounted, render inline (fallback)
  if (!context?.isAvailable || !context.overlayContainerRef.current) {
    return <>{children}</>
  }

  // Render to portal
  return createPortal(children, context.overlayContainerRef.current)
}

// ============================================================================
// POSITIONED OVERLAY COMPONENT
// ============================================================================

interface PositionedOverlayProps {
  /**
   * The element's world-space X position (after zoom/pan transform).
   */
  x: number

  /**
   * The element's world-space Y position.
   */
  y: number

  /**
   * The element's width.
   */
  width: number

  /**
   * The element's height.
   */
  height: number

  /**
   * The element ID for data attributes.
   */
  elementId: string

  /**
   * The overlay content to render.
   */
  children: ReactNode
}

/**
 * Wrapper that positions overlay content at the correct world-space coordinates.
 *
 * This is used when rendering overlays via portal - the overlay needs to know
 * where the element is in world-space since it's no longer a DOM descendant.
 *
 * USAGE:
 * ```tsx
 * <ElementOverlayPortal>
 *   <PositionedOverlay x={100} y={200} width={300} height={100} elementId="el1">
 *     <div style={{ position: 'absolute', top: -24 }}>Label</div>
 *   </PositionedOverlay>
 * </ElementOverlayPortal>
 * ```
 */
export function PositionedOverlay({
  x,
  y,
  width,
  height,
  elementId,
  children,
}: PositionedOverlayProps) {
  return (
    <div
      data-overlay-for={elementId}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  )
}
