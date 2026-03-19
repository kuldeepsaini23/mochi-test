/**
 * ============================================================================
 * BREAKPOINT MOBILE FRAME - Reference-based responsive preview
 * ============================================================================
 *
 * Renders a mobile viewport preview frame next to a Page element.
 * Shows the same children as the page but at mobile width (375px).
 *
 * ============================================================================
 * KEY PRINCIPLES
 * ============================================================================
 *
 * 1. REFERENCE ONLY: This component READS children from Redux - it does NOT
 *    store them as separate elements. The children are the SAME elements as
 *    the main page, just rendered in a different viewport size.
 *
 * 2. NEVER SAVED: Since this is a dynamic render based on the page's
 *    `breakpoints.mobile` flag, the breakpoint frame never appears in the
 *    elements list. Auto-save only sees the page element with its flag.
 *
 * 3. LIMITED INTERACTION: Only click/select is allowed in breakpoint frames.
 *    No dragging, resizing, or reordering. This prevents confusing UX where
 *    users might try to edit in the preview frame.
 *
 * 4. ZOOM COMPENSATION: Uses the same inverse zoom scaling as the page label
 *    and dimension pill to remain readable at any zoom level.
 *
 * 5. USES PAGE RENDERER: Internally uses the same PageRenderer component
 *    that powers the preview mode, ensuring pixel-perfect consistency.
 *
 * ============================================================================
 */

'use client'

import React, { memo, useCallback } from 'react'
import type { PageElement, CanvasElement, LocalComponent } from '../../_lib/types'
import { useAppDispatch } from '../../_lib/store'
import { setSelection, setEditingBreakpoint } from '../../_lib/canvas-slice'
import { useBuilderContext } from '../../_lib'
import { CartProvider } from '../../_lib/cart-provider'
import { PageRenderer } from '../page-renderer'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Mobile breakpoint viewport width (iPhone 14/15 Pro width) */
const MOBILE_WIDTH = 390

/** Gap between main page and breakpoint frame */
const FRAME_GAP = 40

// ============================================================================
// TYPES
// ============================================================================

interface BreakpointMobileFrameProps {
  /** The parent page element this breakpoint belongs to */
  pageElement: PageElement

  /** All descendant elements of the page (referenced, not duplicated) */
  children: CanvasElement[]

  /** Current zoom level for styling compensation */
  zoom: number

  /** Currently selected element IDs */
  selectedIds: string[]

  /** Currently hovered element ID */
  hoveredElementId: string | null

  /** Handler for hover start */
  onHoverStart: (elementId: string, isModifierHeld: boolean) => void

  /** Handler for hover end */
  onHoverEnd: (elementId: string) => void

  /** Local components map for rendering component instances */
  components?: Record<string, LocalComponent>
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * BreakpointMobileFrame - Renders mobile preview of page content.
 *
 * POSITIONING:
 * - Rendered to the RIGHT of the main page, with a gap
 * - X position = page.x + page.width + FRAME_GAP
 * - Same Y position as the page
 *
 * RENDERING:
 * - Uses PageRenderer internally for pixel-perfect consistency with preview mode
 * - Constrained to 375px width to simulate mobile viewport
 * - Height grows to fit content (fit-content)
 *
 * INTERACTION:
 * - Click to select elements (same as main canvas)
 * - NO dragging, resizing, or reordering
 * - Selection is shared with the main canvas (same Redux state)
 */
export const BreakpointMobileFrame = memo(function BreakpointMobileFrame({
  pageElement,
  children,
  zoom,
  selectedIds,
  hoveredElementId,
  onHoverStart,
  onHoverEnd,
  components,
}: BreakpointMobileFrameProps) {
  const dispatch = useAppDispatch()
  const { domainName } = useBuilderContext()

  /**
   * Handle click on the breakpoint frame content.
   * Captures clicks and maps them to element selection.
   *
   * AUTO-SWITCH TO MOBILE EDITING:
   * When clicking on elements in the mobile frame, we automatically switch
   * the properties panel to mobile editing mode so users can see/edit
   * the mobile-specific styles for that element.
   */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Find the clicked element by traversing up to find data-element-id
      let target = e.target as HTMLElement | null
      while (target && !target.hasAttribute('data-element-id')) {
        target = target.parentElement
      }

      if (target) {
        const elementId = target.getAttribute('data-element-id')
        if (elementId) {
          e.stopPropagation()
          e.preventDefault()

          // Select the element
          dispatch(setSelection(elementId))

          // Auto-switch to mobile editing mode in properties panel
          // This ensures the panel shows mobile styles when selecting from mobile preview
          dispatch(setEditingBreakpoint('mobile'))
        }
      }
    },
    [dispatch]
  )

  /**
   * Handle mouse move to track hover state.
   * Updates hoveredElementId based on the element under cursor.
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      let target = e.target as HTMLElement | null
      while (target && !target.hasAttribute('data-element-id')) {
        target = target.parentElement
      }

      if (target) {
        const elementId = target.getAttribute('data-element-id')
        if (elementId && elementId !== hoveredElementId) {
          onHoverStart(elementId, e.metaKey || e.ctrlKey)
        }
      }
    },
    [hoveredElementId, onHoverStart]
  )

  /**
   * Handle mouse leave to clear hover state.
   */
  const handleMouseLeave = useCallback(() => {
    if (hoveredElementId) {
      onHoverEnd(hoveredElementId)
    }
  }, [hoveredElementId, onHoverEnd])

  /**
   * Build the elements array for PageRenderer.
   * Includes the page element and all its descendants.
   */
  const elementsForRenderer: CanvasElement[] = [pageElement, ...children]

  return (
    <div
      data-breakpoint-frame="mobile"
      style={{
        position: 'absolute',
        // Position to the right of the main page
        left: pageElement.x + pageElement.width + FRAME_GAP,
        top: pageElement.y,
        width: MOBILE_WIDTH,
        // Height is FIT-CONTENT - grows to fit children
        height: 'auto',
        minHeight: 100,
        pointerEvents: 'auto',
      }}
    >
      {/*
        Frame Label - displays "Mobile (375px)" above the frame.
        Same zoom compensation as the main page label.
      */}
      <div
        style={{
          position: 'absolute',
          top: -24,
          left: 0,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          userSelect: 'none',
          zIndex: 10,
          transform: `scale(${Math.max(1 / zoom, 1)})`,
          transformOrigin: 'bottom left',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            /* Theme-aware muted label text */
            color: 'var(--muted-foreground)',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {/* Mobile phone icon */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          Mobile ({MOBILE_WIDTH}px)
        </span>
      </div>

      {/*
        Content area - uses PageRenderer for pixel-perfect rendering.
        The PageRenderer handles all element types correctly with responsive styles.

        SELECTION OVERLAY: We overlay selection/hover highlights on top of the
        PageRenderer output since PageRenderer is non-interactive.

        HEIGHT BEHAVIOR:
        The mobile frame should grow to fit all its children content, matching
        how the main page renders. No maxHeight constraint - content should be
        fully visible. Users can scroll the canvas to see the full mobile preview.
      */}
      <div
        className="@container"
        style={{
          position: 'relative',
          width: MOBILE_WIDTH,
          // No maxHeight - frame grows to fit all children content
          overflowX: 'hidden',
          // Add a subtle border to distinguish from main page
          /* Theme-aware border using CSS variable instead of hardcoded white alpha */
          boxShadow: 'inset 0 0 0 1px var(--border)',
          cursor: 'pointer',
        }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/*
          PageRenderer handles all the complex rendering.
          Pass breakpoint='mobile' so it uses responsive style overrides.
          This ensures elements display with their mobile-specific styles.
        */}
        {/* CartProvider scoped to this website so checkout/cart elements
            render with real cart data instead of empty defaults */}
        <CartProvider websiteIdentifier={domainName || 'builder-mobile'}>
          <PageRenderer
            elements={elementsForRenderer}
            style={{ width: '100%' }}
            breakpoint="mobile"
            components={components}
            isBreakpointFrame
          />
        </CartProvider>

        {/*
          Selection/hover overlay - renders highlight boxes for selected/hovered elements.
          Uses the same styling as the main canvas for consistency.
        */}
        <SelectionOverlay
          elements={children}
          selectedIds={selectedIds}
          hoveredElementId={hoveredElementId}
        />
      </div>

      {/* Dimension pill at bottom center */}
      <div
        style={{
          position: 'absolute',
          bottom: -24,
          left: '50%',
          transform: `translateX(-50%) scale(${Math.max(1 / zoom, 1)})`,
          transformOrigin: 'top center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 18,
          paddingLeft: 6,
          paddingRight: 6,
          borderRadius: 4,
          /* Theme-aware dimension pill background */
          backgroundColor: 'var(--popover)',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            /* Theme-aware muted dimension text */
            color: 'var(--muted-foreground)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {MOBILE_WIDTH}px
        </span>
      </div>
    </div>
  )
})

// ============================================================================
// SELECTION OVERLAY - Shows selection/hover highlights
// ============================================================================

interface SelectionOverlayProps {
  elements: CanvasElement[]
  selectedIds: string[]
  hoveredElementId: string | null
}

/**
 * Renders selection/hover highlight boxes over the PageRenderer output.
 *
 * This is a separate component that observes the DOM and positions
 * highlight boxes over elements that are selected or hovered.
 *
 * NOTE: This is a simplified approach - it uses CSS to highlight elements
 * by adding a global style that targets [data-element-id] attributes.
 */
function SelectionOverlay({ elements: _elements, selectedIds, hoveredElementId }: SelectionOverlayProps) {
  // Build CSS selectors for selected and hovered elements
  const selectedSelectors = selectedIds
    .map((id) => `[data-element-id="${id}"]`)
    .join(', ')

  const hoveredSelector = hoveredElementId
    ? `[data-element-id="${hoveredElementId}"]`
    : null

  return (
    <style>
      {selectedSelectors && `
        [data-breakpoint-frame="mobile"] ${selectedSelectors} {
          outline: 2px solid #3b82f6 !important;
          outline-offset: -2px;
        }
      `}
      {hoveredSelector && !selectedIds.includes(hoveredElementId!) && `
        [data-breakpoint-frame="mobile"] ${hoveredSelector} {
          outline: 1px solid #3b82f6 !important;
          outline-offset: -1px;
        }
      `}
    </style>
  )
}
