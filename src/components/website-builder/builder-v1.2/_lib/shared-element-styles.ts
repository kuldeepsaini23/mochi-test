/**
 * ============================================================================
 * SHARED ELEMENT STYLES - Single Source of Truth for Element Positioning
 * ============================================================================
 *
 * SOURCE OF TRUTH: shared-element-styles, element-position, element-size,
 * canvas-wrapper-overrides, positioning-utility, wrapper-styles
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Previously, element positioning and sizing logic was DUPLICATED across:
 *
 * CANVAS ELEMENTS (editor mode):
 *   - frame-element.tsx
 *   - text-element.tsx
 *   - image-element.tsx
 *   - button-element.tsx
 *   - ... every other canvas element
 *
 * RENDERERS (preview/published mode):
 *   - frame-element-renderer.tsx
 *   - text-element-renderer.tsx
 *   - image-element-renderer.tsx
 *   - ... every other renderer
 *
 * Each file independently computed:
 *   1. position: absolute vs relative (based on isRoot and isAbsolute)
 *   2. left/top positioning with CSS centering support (50% + translateX(-50%))
 *   3. Transform computation (centering + rotation combined)
 *   4. Width computation (autoWidth -> '100%' vs fixed pixel)
 *   5. Height computation (autoHeight -> 'auto' with minHeight vs fixed)
 *   6. zIndex from element.order (layer ordering)
 *
 * This caused bugs where fixes in one element type or one mode (canvas vs
 * renderer) weren't propagated to others.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * // In any canvas element (e.g., text-element.tsx):
 * import { computeElementPositionStyles, computeElementSizeStyles, computeCanvasWrapperOverrides } from '../_lib/shared-element-styles'
 *
 * const positionStyles = computeElementPositionStyles(element, isRoot, 'desktop')
 * const sizeStyles = computeElementSizeStyles(element, 'desktop')
 * const canvasOverrides = computeCanvasWrapperOverrides(element, isSelected, isHovered, isEditing)
 *
 * const wrapperStyle: React.CSSProperties = {
 *   ...positionStyles,
 *   ...sizeStyles,
 *   ...canvasOverrides,
 * }
 * ```
 *
 * ```tsx
 * // In any renderer (e.g., text-element-renderer.tsx):
 * import { computeElementPositionStyles, computeElementSizeStyles } from '../_lib/shared-element-styles'
 *
 * const positionStyles = computeElementPositionStyles(element, isRoot, breakpoint)
 * const sizeStyles = computeElementSizeStyles(element, breakpoint)
 *
 * // Renderers do NOT use computeCanvasWrapperOverrides — those are canvas-only
 * const wrapperStyle: React.CSSProperties = {
 *   ...positionStyles,
 *   ...sizeStyles,
 * }
 * ```
 *
 * ============================================================================
 * ARCHITECTURE NOTES
 * ============================================================================
 *
 * - All responsive property resolution goes through getPropertyValue / getSettingValue
 *   from ./style-utils, which handles the desktop-base + mobile-override pattern.
 * - Canvas elements add interaction overrides (selection, hover, lock, etc.)
 *   via computeCanvasWrapperOverrides — renderers never need these.
 * - The functions work with the base CanvasElement type; element-specific logic
 *   (like frame wrap mode, sticky positioning) remains in the respective components.
 *
 * ============================================================================
 */

import type { CanvasElement, Breakpoint } from './types'
import { getPropertyValue, getStyleValue } from './style-utils'
import { useParentFlexDirection, useParentSmartGrid } from './parent-layout-context'

// ============================================================================
// POSITION STYLES - Absolute/relative positioning, centering, rotation, z-index
// ============================================================================

/**
 * Computes the CSS positioning styles for any canvas element's outer wrapper.
 *
 * This is the SINGLE SOURCE OF TRUTH for how elements are positioned on the
 * canvas and in the published renderer. It handles three positioning modes:
 *
 * 1. ROOT ELEMENTS (parentId === null):
 *    - position: absolute at (x, y) on the canvas
 *    - Always uses pixel values for left/top
 *
 * 2. ABSOLUTE CHILDREN (isAbsolute === true, inside a parent frame):
 *    - position: absolute within parent frame
 *    - Supports CSS centering via centerHorizontal/centerVertical flags
 *    - When centered: left/top = '50%' with translateX/Y(-50%) transform
 *    - When not centered: uses pixel x/y relative to parent
 *
 * 3. NORMAL CHILDREN (default):
 *    - position: relative, flows via parent's flexbox layout
 *    - No left/top positioning (layout engine handles placement)
 *
 * TRANSFORM: Combines centering transforms and rotation into a single string.
 * Order matters: centering first (translateX/Y), then rotation (rotate).
 *
 * Z-INDEX: Uses element.order as the base layer ordering value. This ensures
 * "bring to front" / "send to back" works correctly. Canvas-specific elevation
 * (for selection/hover) is handled separately by computeCanvasWrapperOverrides.
 *
 * @param element - The canvas element to compute position styles for
 * @param isRoot - Whether this element is a root element (parentId === null)
 * @param breakpoint - Current responsive breakpoint for responsive-aware values
 * @returns React.CSSProperties with position, left, top, transform, and zIndex
 */
export function computeElementPositionStyles(
  element: CanvasElement,
  isRoot: boolean,
  breakpoint: Breakpoint
): React.CSSProperties {
  /**
   * Determine if this element uses absolute positioning within its parent.
   * Root elements are always absolute on the canvas, but we track that
   * separately via the isRoot param. This flag is for child elements
   * that have been explicitly set to absolute positioning.
   */
  const isAbsoluteChild = !isRoot && element.isAbsolute === true

  /**
   * Safely access centering flags from the element.
   *
   * centerHorizontal and centerVertical exist on BaseElement (regular elements)
   * but NOT on BasePreBuiltElement (prebuilt components like navbar).
   * We use 'in' checks to safely access these properties across the union type.
   */
  const hasCenterHorizontal = 'centerHorizontal' in element && element.centerHorizontal === true
  const hasCenterVertical = 'centerVertical' in element && element.centerVertical === true

  /**
   * Safely access rotation from the element.
   *
   * rotation exists on BaseElement but NOT on BasePreBuiltElement.
   * We resolve it through getPropertyValue for responsive awareness, with
   * a safe fallback extraction from the element via 'in' check.
   */
  const baseRotation = 'rotation' in element ? (element.rotation as number | undefined) ?? 0 : 0
  const rotation = getPropertyValue<number>(element, 'rotation', breakpoint, baseRotation) ?? 0

  /**
   * Build the CSS transform string by combining centering and rotation.
   *
   * Centering transforms (translateX/Y -50%) are ONLY applied to absolute
   * children that have centerHorizontal/centerVertical enabled. This creates
   * true CSS centering: left: 50% + translateX(-50%) = perfectly centered.
   *
   * Rotation is applied to any element that has a non-zero rotation value,
   * regardless of positioning mode.
   */
  const buildTransform = (): string | undefined => {
    const transforms: string[] = []

    // Centering transforms — only for absolutely positioned children
    if (isAbsoluteChild) {
      if (hasCenterHorizontal) transforms.push('translateX(-50%)')
      if (hasCenterVertical) transforms.push('translateY(-50%)')
    }

    // Rotation transform — applies to any element with rotation set
    if (rotation) {
      transforms.push(`rotate(${rotation}deg)`)
    }

    return transforms.length > 0 ? transforms.join(' ') : undefined
  }

  /**
   * Compute left position based on positioning mode:
   * - Root: always pixel x value (absolute on canvas)
   * - Absolute child + centered: '50%' for CSS centering
   * - Absolute child + not centered: pixel x value relative to parent
   * - Normal child: undefined (flexbox handles it)
   */
  const computeLeft = (): number | string | undefined => {
    if (isRoot) return element.x
    if (isAbsoluteChild) {
      return hasCenterHorizontal ? '50%' : element.x
    }
    return undefined
  }

  /**
   * Compute top position — same logic as left but for the Y axis.
   * - Root: pixel y value
   * - Absolute child + centered: '50%'
   * - Absolute child + not centered: pixel y value
   * - Normal child: undefined
   */
  const computeTop = (): number | string | undefined => {
    if (isRoot) return element.y
    if (isAbsoluteChild) {
      return hasCenterVertical ? '50%' : element.y
    }
    return undefined
  }

  /**
   * Resolve margin from element.styles for OUTER wrapper spacing.
   *
   * Margin MUST live on the outer wrapper (this return value), NOT on the inner
   * content div. When margin is on the inner div it visually behaves like padding
   * (pushes content inward). On the outer wrapper it correctly creates space
   * between this element and its siblings — standard CSS box-model behavior.
   *
   * Uses getStyleValue for responsive awareness (desktop base + mobile override).
   */
  const margin = getStyleValue<string>(element, 'margin', breakpoint)

  return {
    // Position mode: absolute for root or absolute children, relative for flex children
    position: isRoot || isAbsoluteChild ? 'absolute' : 'relative',
    // X/Y positioning with centering support
    left: computeLeft(),
    top: computeTop(),
    // Combined centering + rotation transform
    transform: buildTransform(),
    /**
     * Z-INDEX STACKING CONTEXT CONTROL:
     *
     * Only set z-index on root/absolute elements. Normal-flow children
     * (position: relative) use z-index: auto (undefined) so they do NOT
     * create CSS stacking contexts.
     *
     * WHY: When a frame has z-index set, it creates a stacking context.
     * Any child with z-index: 9999 (like a sticky navbar) is trapped
     * inside that stacking context and can never render above sibling
     * frames with higher z-index. By using z-index: auto, normal-flow
     * frames don't create stacking contexts, and the navbar's z-index
     * competes at the page level.
     *
     * Canvas mode is unaffected — computeCanvasWrapperOverrides always
     * overrides z-index with its own elevated value for selection/hover.
     *
     * SOURCE OF TRUTH: StackingContextControl, NavbarStickyFix
     */
    zIndex: (isRoot || isAbsoluteChild) ? element.order : undefined,
    // Outer-wrapper margin — creates space OUTSIDE the element, not inside
    margin: margin || undefined,
  }
}

// ============================================================================
// SIZE STYLES - Width, height, and minHeight computation
// ============================================================================

/**
 * Result type for computeElementSizeStyles.
 *
 * SOURCE OF TRUTH: ElementSizeStyles
 *
 * Contains the computed CSS properties for element dimensions.
 * Separating this from position styles allows element-specific overrides
 * (e.g., frame wrap mode, page fixed width) without duplicating position logic.
 */
export interface ElementSizeStyles {
  /** Width: '100%' when autoWidth is enabled, fixed pixel value otherwise */
  width: number | string
  /** Height: 'auto' when autoHeight is enabled, fixed pixel value otherwise */
  height: number | string
  /** MinHeight: always undefined — auto-height elements shrink-wrap content with no floor */
  minHeight: number | undefined
  /** When set, applies flex shorthand for equal space distribution in row parents */
  flex?: string
  /** When set, allows flex items to shrink below content width */
  minWidth?: number
}

/**
 * Computes the CSS dimension styles for any canvas element's outer wrapper.
 *
 * This is the SINGLE SOURCE OF TRUTH for how element dimensions are resolved,
 * handling the autoWidth and autoHeight patterns consistently across all elements.
 *
 * WIDTH BEHAVIOR:
 * - autoWidth=true: Uses '100%' to fill the parent container (responsive)
 * - autoWidth=false: Uses fixed pixel width from element.width
 * - Responsive: If mobile breakpoint has a different width override, it's used
 *
 * HEIGHT BEHAVIOR:
 * - autoHeight=true: Uses 'auto' so the element grows with its content,
 *   plus minHeight set to the defined height as a minimum floor
 * - autoHeight=false: Uses fixed pixel height from element.height
 * - Responsive: If mobile breakpoint has a different height override, it's used
 *
 * NOTE: Some element types have different autoWidth/autoHeight defaults:
 * - Text: autoWidth=true, autoHeight=true by default
 * - Image: autoWidth=false, autoHeight not applicable (fixed aspect ratio)
 * - Frame: autoWidth=false, autoHeight depends on wrap mode
 * Callers should pass the appropriate defaults for their element type.
 *
 * @param element - The canvas element to compute size styles for
 * @param breakpoint - Current responsive breakpoint for responsive-aware values
 * @param options - Optional overrides for autoWidth/autoHeight defaults
 * @returns ElementSizeStyles with width, height, and minHeight
 */
export function computeElementSizeStyles(
  element: CanvasElement,
  breakpoint: Breakpoint,
  options?: {
    /** Default autoWidth value if not set on element (varies by element type) */
    autoWidthDefault?: boolean
    /** Default autoHeight value if not set on element (varies by element type) */
    autoHeightDefault?: boolean
    /** Parent frame's flex-direction — when 'row'/'row-reverse' and autoWidth, uses flex: 1 instead of width: 100% */
    parentFlexDirection?: string
    /** Whether parent uses responsive smart grid — when true, children skip flex sizing and use width: 100% */
    parentSmartGrid?: boolean
  }
): ElementSizeStyles {
  const autoWidthDefault = options?.autoWidthDefault ?? false
  const autoHeightDefault = options?.autoHeightDefault ?? false

  /**
   * Resolve responsive-aware width value.
   * Uses getPropertyValue to check for mobile breakpoint overrides first,
   * then falls back to the base element.width.
   */
  const resolvedWidth = getPropertyValue<number>(
    element,
    'width',
    breakpoint,
    element.width
  ) ?? element.width

  /**
   * Resolve responsive-aware height value.
   * Same pattern as width — mobile override -> base value.
   */
  const resolvedHeight = getPropertyValue<number>(
    element,
    'height',
    breakpoint,
    element.height
  ) ?? element.height

  /**
   * Resolve autoWidth setting with responsive awareness.
   * The element may have autoWidth defined directly or as a responsive override.
   * We use the element-type-specific default passed in options.
   */
  const elementAutoWidth = 'autoWidth' in element ? (element as { autoWidth?: boolean }).autoWidth : undefined
  const hasAutoWidth = getPropertyValue<boolean>(
    element,
    'autoWidth',
    breakpoint,
    elementAutoWidth ?? autoWidthDefault
  ) ?? autoWidthDefault

  /**
   * Resolve autoHeight setting with responsive awareness.
   * Same pattern as autoWidth — check responsive overrides, then base value.
   */
  const elementAutoHeight = 'autoHeight' in element ? (element as { autoHeight?: boolean }).autoHeight : undefined
  const hasAutoHeight = getPropertyValue<boolean>(
    element,
    'autoHeight',
    breakpoint,
    elementAutoHeight ?? autoHeightDefault
  ) ?? autoHeightDefault

  // Check if parent is a row layout (horizontal main axis)
  const isParentRow = options?.parentFlexDirection === 'row' || options?.parentFlexDirection === 'row-reverse'

  /**
   * When parent uses smart grid, children should NOT use flex sizing.
   * CSS Grid handles column sizing via minmax() — children just fill
   * their grid cell with width: 100%. Flex: 1 1 0% would conflict.
   */
  const isParentSmartGrid = options?.parentSmartGrid ?? false

  return {
    // autoWidth: always use '100%' so inner content can resolve percentage widths.
    // In row parents (non-grid), flex: 1 1 0% (below) overrides width for flex sizing,
    // but width: 100% keeps children's percentage calculations working.
    width: hasAutoWidth ? '100%' : resolvedWidth,
    // autoHeight: grow with content; otherwise fixed pixel height
    height: hasAutoHeight ? 'auto' : resolvedHeight,
    /**
     * No minHeight for auto-height elements — when the user enables "Fit Content"
     * or auto-height, the element should shrink-wrap its children. Setting
     * minHeight to the stored pixel height creates a floor that prevents the
     * element from being shorter than its original height, leaving visible
     * extra space at the bottom when content is smaller.
     *
     * Content-driven elements (form, payment, checkout) always generate enough
     * content to maintain a reasonable height. Empty containers are still
     * visible via their selection ring on the canvas.
     */
    minHeight: undefined,
    // In row parents (non-grid), autoWidth children share space equally via flex: 1 1 0%
    // Smart grid children skip this — CSS Grid handles sizing via grid-template-columns
    flex: hasAutoWidth && isParentRow && !isParentSmartGrid ? '1 1 0%' : undefined,
    // Allow flex items to shrink below content width in row parents (non-grid)
    minWidth: hasAutoWidth && isParentRow && !isParentSmartGrid ? 0 : undefined,
  }
}

// ============================================================================
// CANVAS WRAPPER OVERRIDES - Editor-only interaction styles
// ============================================================================

/**
 * Computes canvas-editor-only style overrides for element wrappers.
 *
 * These styles are ONLY applied in the canvas editor — never in the published
 * renderer. They handle visual feedback for element state (selected, hovered,
 * hidden, locked) and interaction cursors.
 *
 * OPACITY:
 * - Hidden elements (visible=false) are shown at 50% opacity in the editor
 *   so designers can see their layout even when toggled off. In the published
 *   renderer, hidden elements are completely removed from the DOM.
 *
 * POINTER EVENTS:
 * - Locked elements cannot be clicked/dragged in the editor.
 *   'none' prevents all mouse interaction.
 *
 * CURSOR:
 * - Default is 'grab' for draggable elements.
 * - Text elements in editing mode use 'text' cursor for text selection.
 *
 * Z-INDEX ELEVATION:
 * - Selected elements: elevated to 1000 + element.order
 *   This ensures resize handles and selection UI render above all other elements.
 * - Hovered elements: elevated to 500 + element.order
 *   Middle ground — above normal elements but below selected ones.
 * - Normal: uses base element.order (set by computeElementPositionStyles).
 *
 * ISOLATION:
 * - Creates a new stacking context for selected/hovered elements.
 *   Prevents z-index conflicts with deeply nested elements.
 *
 * TRANSITION:
 * - Disabled ('none') in the editor to prevent animation during drag/resize.
 *   Smooth transitions would cause visual lag during 60fps interactions.
 *
 * @param element - The canvas element to compute overrides for
 * @param isSelected - Whether the element is currently selected
 * @param isHovered - Whether the element is currently hovered
 * @param isEditing - Whether the element is in inline editing mode (text elements)
 * @returns React.CSSProperties with canvas-only visual overrides
 */
export function computeCanvasWrapperOverrides(
  element: CanvasElement,
  isSelected: boolean,
  isHovered: boolean,
  isEditing?: boolean
): React.CSSProperties {
  /**
   * Compute the elevated z-index for selection/hover states.
   * This replaces the base element.order set by computeElementPositionStyles
   * when the element is selected or hovered, ensuring interactive elements
   * render above static ones.
   */
  /**
   * Z-INDEX STACKING CONTEXT CONTROL:
   * Only elevate z-index when the element is selected, hovered, or is a
   * root/absolute element. Normal-flow children use undefined (auto) so
   * they do NOT create CSS stacking contexts that would trap the z-index
   * of sticky/fixed descendants (like navbars with z-index: 9999).
   *
   * Selected/hovered elements DO need elevated z-index so they render
   * above siblings during editing interactions.
   *
   * SOURCE OF TRUTH: StackingContextControl, NavbarStickyFix
   */
  const getElevatedZIndex = (): number | undefined => {
    if (isSelected) return 1000 + element.order
    if (isHovered) return 500 + element.order
    // Normal-flow children: no z-index to avoid creating stacking contexts
    const isRoot = element.parentId === null
    const isAbsolute = element.isAbsolute === true
    if (!isRoot && !isAbsolute) return undefined
    return element.order
  }

  return {
    // Faded opacity for hidden elements — editor shows them, renderer hides them
    opacity: element.visible ? 1 : 0.5,
    // Lock prevents all pointer interaction in the editor
    pointerEvents: element.locked ? 'none' : 'auto',
    // Text cursor for editing mode, grab cursor for drag mode
    cursor: isEditing ? 'text' : 'grab',
    // Elevated z-index for selected/hovered elements (undefined for normal-flow)
    zIndex: getElevatedZIndex(),
    // New stacking context for interactive elements to avoid z-index bleed
    isolation: isSelected || isHovered ? 'isolate' : 'auto',
    // No transitions during editor interactions — prevents lag during drag/resize
    transition: 'none',
  }
}

// ============================================================================
// HOOK: useElementSizeStyles - Context-aware size computation
// ============================================================================

/**
 * Hook wrapper around computeElementSizeStyles that automatically reads
 * the parent's flex direction from ParentFlexDirectionContext.
 *
 * USE THIS instead of calling computeElementSizeStyles directly in components.
 * This ensures autoWidth elements get correct CSS based on parent layout:
 * - Row parent: flex: 1 1 0% (share horizontal space)
 * - Column parent: width: 100% (fill full width)
 *
 * @param element - The canvas element to compute size styles for
 * @param breakpoint - Current responsive breakpoint
 * @param options - Optional overrides for autoWidth/autoHeight defaults
 * @returns ElementSizeStyles with width, height, minHeight, and optional flex/minWidth
 */
export function useElementSizeStyles(
  element: CanvasElement,
  breakpoint: Breakpoint,
  options?: {
    autoWidthDefault?: boolean
    autoHeightDefault?: boolean
  }
): ElementSizeStyles {
  const parentFlexDirection = useParentFlexDirection()
  const parentSmartGrid = useParentSmartGrid()
  return computeElementSizeStyles(element, breakpoint, {
    ...options,
    parentFlexDirection,
    parentSmartGrid,
  })
}
