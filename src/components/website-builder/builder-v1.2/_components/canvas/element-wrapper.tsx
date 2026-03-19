/**
 * ============================================================================
 * ELEMENT WRAPPER - Universal Canvas Editor Chrome
 * ============================================================================
 *
 * Wraps ANY unified element component with canvas-only editor chrome:
 * - Selection ring (blue or purple box-shadow inset)
 * - Hover ring (lighter box-shadow inset)
 * - Resize handles (8 handles around selected elements)
 * - Element name label above root elements
 * - Dimensions pill (width x height) below selected elements
 * - Pointer event handlers (drag, hover enter/leave)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * This component is PURELY VISUAL CHROME. It does NOT compute element-specific
 * content styles (text typography, frame flexbox, image sizing, etc.). Instead,
 * it receives children from the unified element component and wraps them with
 * the editor interaction layer.
 *
 * POSITION vs SIZE separation:
 * - Position styles (absolute/relative, left/top, transform, zIndex) are
 *   computed here via shared utilities.
 * - Size styles come from the PARENT via sizeStyleOverrides because each
 *   element type computes dimensions differently (frame wrap mode, text
 *   autoWidth, image aspect ratio, etc.).
 * - Canvas interaction overrides (opacity, cursor, zIndex elevation) are
 *   computed here via shared utilities.
 *
 * ============================================================================
 * SOURCE OF TRUTH: ElementWrapper, canvas-chrome, element-wrapper
 * ============================================================================
 */

'use client'

import React, { memo, useMemo } from 'react'
import type { CanvasElement, ResizeHandle } from '../../_lib/types'
import { computeElementPositionStyles, computeCanvasWrapperOverrides } from '../../_lib/shared-element-styles'
import { ResizeHandles } from './resize-handles'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the ElementWrapper component.
 *
 * SOURCE OF TRUTH: ElementWrapperProps
 *
 * This is the contract between the canvas rendering layer and the editor chrome.
 * Every unified element passes these props to get consistent selection, hover,
 * resize, drag, and AI generation visuals.
 */
interface ElementWrapperProps {
  /** The canvas element data from Redux (any element type in the CanvasElement union) */
  element: CanvasElement

  /** Whether this element is currently selected in the canvas */
  isSelected: boolean

  /** Whether this element is currently hovered (respects modifier key logic) */
  isHovered: boolean

  /**
   * Whether this element is inside a master component.
   * When true, uses purple styling instead of blue for selection/hover rings.
   */
  isInsideMaster?: boolean

  /**
   * Current viewport zoom level (0.1 to 3).
   * Used to scale UI chrome (labels, dimensions pill) inversely so they
   * remain readable at any zoom level.
   */
  zoom?: number

  /**
   * Handler for drag start (passed from useDrag hook).
   * The third parameter indicates whether Cmd/Ctrl was held (for multi-select).
   */
  onDragStart: (e: React.PointerEvent, elementId: string, isModifierHeld?: boolean) => void

  /** Handler for resize start (passed from useResize hook) */
  onResizeStart: (e: React.PointerEvent, elementId: string, handle: ResizeHandle) => void

  /**
   * Handler for mouse enter - reports hover with modifier key state.
   * Used to implement smart hover that respects selection cycling rules.
   */
  onHoverStart: (elementId: string, isModifierHeld: boolean) => void

  /** Handler for mouse leave - clears hover state */
  onHoverEnd: (elementId: string) => void

  /** Whether the element is currently in inline editing mode (e.g., text editing) */
  isEditing?: boolean

  /**
   * Optional subset of resize handles to show. If not provided, all 8 handles render.
   * Used by Page elements which only allow top/bottom (vertical) resizing.
   */
  allowedHandles?: ResizeHandle[]

  /**
   * Whether this element IS a master component (frame with masterOfComponentId).
   * Controls purple styling for the element itself (not just children inside a master).
   */
  isMasterComponent?: boolean

  /**
   * Additional data-* attributes to spread onto the wrapper div.
   * Used for element-specific data attributes like data-frame-id, data-text-id, etc.
   */
  dataAttributes?: Record<string, string>

  /** Additional CSS className for the wrapper (e.g., responsive container query classes) */
  className?: string

  /**
   * Additional style overrides merged last into the wrapper style.
   * Used for responsive wrapperStyleOverrides and other parent-controlled styles.
   */
  wrapperStyleOverrides?: React.CSSProperties

  /**
   * Override size styles if the parent computes them differently.
   * This is intentionally separated because frame elements compute size differently
   * (wrap mode, scroll mode) than text elements (autoWidth/autoHeight).
   * The wrapper only handles POSITION + CANVAS INTERACTION OVERRIDES.
   */
  sizeStyleOverrides?: React.CSSProperties

  /** Optional double-click handler (text elements use this for inline edit) */
  onDoubleClick?: (e: React.MouseEvent) => void

  /**
   * Override the default selection/hover ring color.
   * Default: blue (#3b82f6) for regular elements, purple (#8b5cf6) for master components.
   * Link elements use cyan (#06b6d4) to distinguish them visually.
   */
  selectionColor?: string

  /**
   * Custom text for the dimensions pill.
   * When provided, replaces the default "width × height" text.
   * Frame elements use this to show "Fill" for autoWidth and "Auto" for autoHeight.
   */
  dimensionLabel?: string

  /**
   * Custom icon rendered before the element name in the label.
   * Link elements use this for the 🔗 icon.
   * Master component hexagon icon is still shown via isMasterComponent prop.
   */
  labelIcon?: React.ReactNode

  /**
   * Extra slot rendered at the top-right of the wrapper.
   * Used by page elements for the BreakpointButton dropdown.
   * Positioned absolutely, uses inverse zoom scaling for readability.
   */
  topRightSlot?: React.ReactNode

  /** The unified element content to render inside the chrome */
  children: React.ReactNode
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Wraps any unified element component with canvas-only editor chrome.
 *
 * RENDER STRUCTURE:
 * ```
 * <div wrapper>
 *   {label}              -- Element name above root elements
 *   {children}           -- The unified element content
 *   {shimmer overlay}    -- AI generation animation
 *   {highlight overlay}  -- Selection/hover ring
 *   {dimensions pill}    -- Width x height display
 *   {resize handles}     -- 8 draggable resize handles
 * </div>
 * ```
 *
 * USAGE:
 * ```tsx
 * <ElementWrapper
 *   element={element}
 *   isSelected={isSelected}
 *   isHovered={isHovered}
 *   onDragStart={handleDragStart}
 *   onResizeStart={handleResizeStart}
 *   onHoverStart={handleHoverStart}
 *   onHoverEnd={handleHoverEnd}
 *   sizeStyleOverrides={{ width: 300, height: 'auto', minHeight: 200 }}
 * >
 *   <div style={contentStyle}>{content}</div>
 * </ElementWrapper>
 * ```
 */
export const ElementWrapper = memo(function ElementWrapper({
  element,
  isSelected,
  isHovered,
  isInsideMaster = false,
  zoom = 1,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
  isEditing = false,
  allowedHandles,
  isMasterComponent = false,
  dataAttributes,
  className,
  wrapperStyleOverrides,
  sizeStyleOverrides,
  onDoubleClick,
  selectionColor,
  dimensionLabel,
  labelIcon,
  topRightSlot,
  children,
}: ElementWrapperProps) {
  // ========================================================================
  // COMPUTED VALUES
  // ========================================================================

  /** Whether this element is a root element (directly on the canvas, no parent) */
  const isRoot = element.parentId === null

  // ========================================================================
  // SELECTION / HOVER RING STYLES
  // ========================================================================

  /**
   * Get the selection ring color based on component context.
   * Priority: selectionColor override > master purple > default blue.
   * - selectionColor prop: used by link elements (#06b6d4 cyan)
   * - Master components and elements inside masters use PURPLE (#8b5cf6)
   * - Regular elements use BLUE (#3b82f6)
   */
  const getSelectionColor = (): string => {
    if (selectionColor && !isMasterComponent && !isInsideMaster) return selectionColor
    return (isMasterComponent || isInsideMaster) ? '#8b5cf6' : '#3b82f6'
  }

  /**
   * Compute box-shadow for the selection/hover overlay.
   * Uses inset box-shadow so the ring renders INSIDE the element bounds
   * without affecting layout or being covered by child elements.
   *
   * ZOOM COMPENSATION:
   * The shadow width is scaled inversely with zoom so the ring appears
   * the same visual thickness at any zoom level. At zoom < 1, the canvas
   * transform shrinks everything — we counteract by increasing the shadow
   * spread. At zoom >= 1, the width stays at the base value (no shrinking).
   * This matches the label and dimensions pill zoom compensation pattern.
   *
   * Priority: Selected (2px base) > Hovered (1px base) > None
   */
  const getSelectionShadow = (): string => {
    const color = getSelectionColor()
    const zoomCompensation = Math.max(1 / zoom, 1)
    if (isSelected) return `inset 0 0 0 ${2 * zoomCompensation}px ${color}`
    if (isHovered) return `inset 0 0 0 ${1 * zoomCompensation}px ${color}`
    return 'none'
  }

  // ========================================================================
  // WRAPPER STYLE COMPUTATION
  // ========================================================================

  /**
   * Build the wrapper style by composing shared utilities:
   * 1. Position styles (absolute/relative, left/top, transform, base zIndex)
   * 2. Canvas overrides (opacity, cursor, zIndex elevation, isolation, transition)
   * 3. Size overrides from parent (width, height, minHeight)
   * 4. Additional overrides from parent (responsive classes, etc.)
   */
  const wrapperStyle = useMemo((): React.CSSProperties => {
    // Position styles from shared utility (absolute/relative, left/top, transform, zIndex)
    const positionStyles = computeElementPositionStyles(element, isRoot, 'desktop')

    // Canvas interaction overrides (opacity, cursor, zIndex elevation, isolation)
    const canvasOverrides = computeCanvasWrapperOverrides(element, isSelected, isHovered, isEditing)

    return {
      ...positionStyles,
      ...canvasOverrides,
      // Size styles come from the parent — each element type computes them differently
      ...sizeStyleOverrides,
      // Additional overrides (responsive wrapperStyleOverrides, etc.)
      ...wrapperStyleOverrides,
    }
  }, [element, isRoot, isSelected, isHovered, isEditing, sizeStyleOverrides, wrapperStyleOverrides])

  // ========================================================================
  // DATA ATTRIBUTES
  // ========================================================================

  /**
   * Build the spread-able data attributes object.
   * Always includes data-element-id for hit testing and DOM queries.
   * Conditionally includes data-frame-id and data-text-id for type-specific lookups.
   * Custom dataAttributes from the parent are spread on top.
   */
  const spreadAttributes = useMemo((): Record<string, string | undefined> => {
    const attrs: Record<string, string | undefined> = {}

    // data-frame-id for frames, pages, and links (used for drop target identification)
    if (element.type === 'frame' || element.type === 'page' || element.type === 'link') {
      attrs['data-frame-id'] = element.id
    }

    // data-text-id for text elements (used for text-specific interactions)
    if (element.type === 'text') {
      attrs['data-text-id'] = element.id
    }

    // Spread custom data attributes from the parent
    if (dataAttributes) {
      for (const [key, value] of Object.entries(dataAttributes)) {
        attrs[key] = value
      }
    }

    return attrs
  }, [element.type, element.id, dataAttributes])

  // ========================================================================
  // EVENT HANDLERS
  // ========================================================================

  /**
   * Handle pointer down for drag initiation with selection cycling.
   *
   * CLICK DETECTION:
   * We need to detect clicks on THIS element's content (including labels,
   * gradient overlays, decorative elements) but NOT on nested canvas elements
   * which have their own data-element-id and handle their own clicks.
   *
   * Strategy: Use closest('[data-element-id]') to find the nearest canvas
   * element ancestor. If it's THIS wrapper, the click belongs to us.
   * We also check for label clicks and direct child clicks explicitly.
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    // Don't initiate drag when in inline editing mode (e.g., text editing)
    if (isEditing) return

    const target = e.target as HTMLElement
    const wrapper = e.currentTarget as HTMLElement

    // Find the nearest parent with data-element-id — determines which canvas element owns the click
    const nearestCanvasElement = target.closest('[data-element-id]')
    const isOwnElement = nearestCanvasElement === wrapper

    // Check if click is on any label variant (frame-label, text-label, etc.)
    const isOnLabel = target.closest('[data-frame-label]') !== null
      || target.closest('[data-text-label]') !== null
      || target.closest('[data-element-label]') !== null

    // Check if click is on a direct child of the wrapper that isn't a nested canvas element
    const isOwnContent = target.parentElement === wrapper && !target.hasAttribute('data-element-id')

    if (isOwnElement || isOnLabel || isOwnContent) {
      // Stop propagation so parent frames don't also start dragging
      e.stopPropagation()

      // Detect Cmd (Mac) / Ctrl (Windows/Linux) for multi-select mode
      const isModifierHeld = e.metaKey || e.ctrlKey
      onDragStart(e, element.id, isModifierHeld)
    }
  }

  /**
   * Handle double-click — delegates to the parent's onDoubleClick handler.
   * Text elements use this for entering inline edit mode.
   */
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (onDoubleClick) {
      onDoubleClick(e)
    }
  }

  /**
   * Handle mouse enter for hover state.
   * Reports the modifier key state so the hover system can apply
   * selection cycling rules (normal hover = topmost parent, Cmd hover = direct element).
   */
  const handleMouseEnter = (e: React.MouseEvent) => {
    e.stopPropagation()
    const isModifierHeld = e.metaKey || e.ctrlKey
    onHoverStart(element.id, isModifierHeld)
  }

  /**
   * Handle mouse leave — clears hover state for this element.
   */
  const handleMouseLeave = (e: React.MouseEvent) => {
    e.stopPropagation()
    onHoverEnd(element.id)
  }

  // ========================================================================
  // LABEL COLOR
  // ========================================================================

  /**
   * Compute label text color:
   * - Master components always use purple
   * - Selected elements use the selection color (blue or purple)
   * - Default: uses the shadcn muted-foreground CSS variable so it
   *   adapts to both light and dark themes (replaces hardcoded #6b7280)
   */
  const labelColor = isMasterComponent
    ? '#8b5cf6'
    : isSelected
      ? getSelectionColor()
      : 'var(--muted-foreground)'

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div
      data-element-id={element.id}
      {...spreadAttributes}
      className={className || undefined}
      style={wrapperStyle}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/*
        Element Label — displays the element name above root-level elements.
        Only shown for root elements (parentId === null).
        Positioned absolutely 24px above the element, left-aligned.

        ZOOM COMPENSATION:
        - Uses inverse zoom scaling so the label remains readable at any zoom level.
        - transformOrigin: 'bottom left' anchors the label to the frame's top-left corner.
        - At zoom > 1 the scale is capped at 1 (no shrinking below normal size).
      */}
      {isRoot && element.name && (
        <div
          data-element-label="true"
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
            cursor: 'grab',
          }}
        >
          {/* Master component icon — purple hexagon before the name */}
          {isMasterComponent && (
            <span style={{ color: '#8b5cf6', marginRight: 4, fontSize: 10 }}>
              &#x2B21;
            </span>
          )}
          {/* Custom label icon (e.g., link icon for link elements) */}
          {!isMasterComponent && labelIcon}
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: labelColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 200,
            }}
          >
            {element.name}
          </span>
        </div>
      )}

      {/*
        Top-right slot — renders extra chrome at the top-right of the wrapper.
        Used by page elements for the BreakpointButton dropdown.
        The parent is responsible for positioning and zoom scaling.
      */}
      {isRoot && topRightSlot}

      {/* The unified element content — rendered by the parent component */}
      {children}

      {/*
        Highlight overlay — renders the selection/hover ring on top of all content.
        Uses inset box-shadow so it doesn't affect layout or get clipped by children.
        Pointer events disabled so clicks pass through to the element content.
      */}
      {(isSelected || isHovered) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: getSelectionShadow(),
            pointerEvents: 'none',
            /* Must be above all child content inside frames */
            zIndex: 9990,
          }}
        />
      )}

      {/*
        Dimensions pill — shows "width x height" at bottom center of selected elements.
        Uses the selection color for the background (blue or purple).
        Zoom-compensated so it remains readable at any zoom level.
        Hidden during inline editing to avoid cluttering the editing UX.
      */}
      {isSelected && !isEditing && (
        <div
          data-dimensions-pill="true"
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
            backgroundColor: getSelectionColor(),
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
              color: '#ffffff',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {dimensionLabel ?? `${Math.round(element.width)} × ${Math.round(element.height)}`}
          </span>
        </div>
      )}

      {/*
        Resize handles — 8 draggable handles around the element edges and corners.
        Only shown when selected and not in inline editing mode.
        Optionally filtered to a subset of handles (e.g., pages only allow n/s).
      */}
      {isSelected && !isEditing && (
        <ResizeHandles
          onResizeStart={(e, handle) => onResizeStart(e, element.id, handle)}
          allowedHandles={allowedHandles}
          zoom={zoom}
        />
      )}
    </div>
  )
})
