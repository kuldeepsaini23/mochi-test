/**
 * ============================================================================
 * CANVAS BUILDER - TYPE DEFINITIONS
 * ============================================================================
 *
 * This file contains ALL type definitions for the Figma-clone canvas builder.
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE - READ THIS BEFORE MAKING ANY CHANGES
 * ============================================================================
 *
 * This builder uses a HYBRID STATE ARCHITECTURE for optimal performance:
 *
 * 1. REDUX TOOLKIT (Single Source of Truth)
 *    - Stores all PERSISTENT data (elements, selection, tool mode, viewport)
 *    - Provides O(1) element lookups via normalized Map structure
 *    - Handles undo/redo via state snapshots
 *    - Data is SERIALIZABLE for database storage
 *    - Changes cause React re-renders (use sparingly during interactions)
 *
 * 2. REACT REFS (Performance-Critical Interaction State)
 *    - Stores EPHEMERAL state during drag/resize/creation operations
 *    - NO React re-renders during 60fps interactions
 *    - Updated via requestAnimationFrame for smooth animations
 *    - Includes: drag position, resize dimensions, sibling transforms
 *
 * 3. DIRECT DOM MANIPULATION (Visual Feedback)
 *    - Used for real-time visual updates during interactions
 *    - Transform, opacity, and style changes during drag
 *    - Bypasses React for 60fps performance
 *
 * ============================================================================
 * WHY THIS ARCHITECTURE?
 * ============================================================================
 *
 * - Redux state changes trigger re-renders → BAD for 60fps drag operations
 * - Refs don't trigger re-renders → GOOD for 60fps drag operations
 * - We commit ref state to Redux ONLY when interaction ENDS
 *
 * FLOW EXAMPLE (Dragging an element):
 * 1. onPointerDown → Initialize drag state in REF (not Redux)
 * 2. onPointerMove → Update position in REF, update DOM directly via RAF
 * 3. onPointerUp → Commit final position to REDUX (single re-render)
 *
 * ============================================================================
 * DO NOT:
 * - Put drag/resize position in Redux state
 * - Dispatch Redux actions on every pointer move
 * - Use useState for anything that updates at 60fps
 *
 * DO:
 * - Use refs for all interaction state
 * - Use RAF for DOM updates during interactions
 * - Commit to Redux only when interaction completes
 * ============================================================================
 */

// ============================================================================
// PREBUILT ELEMENT TYPES - Import from prebuilt module
// ============================================================================

// Re-export PreBuilt types for convenience
export type {
  PreBuiltElementType,
  PreBuiltElement,
  PreBuiltNavbarElement,
  NavbarSettings,
  NavbarLink,
} from './prebuilt'

// ============================================================================
// ELEMENT TYPES - Extensible via discriminated union
// ============================================================================

/**
 * All supported element types in the canvas.
 *
 * EXTENDING: To add new element types (text, button, component, etc.):
 * 1. Add the type string here
 * 2. Create a new interface extending BaseElement
 * 3. Add to CanvasElement union type
 * 4. Add rendering logic in ElementRenderer component
 *
 * NOTE: 'prebuilt' is a special type that wraps complex pre-designed components.
 * PreBuilt elements have their own type system in ./prebuilt/types.ts
 *
 * NOTE: 'component' is for user-created Local Components.
 * Component instances reference a LocalComponent definition and display read-only children.
 */
export type ElementType =
  | 'frame'
  | 'page'
  | 'text'
  | 'image'
  | 'video'
  | 'button'
  | 'form'
  | 'payment'
  | 'prebuilt'
  | 'component'
  | 'smartcms-list'
  | 'link'
  | 'add-to-cart-button'
  | 'checkout'
  | 'cart'
  | 'ecommerce-carousel'
  | 'faq'
  | 'sticky-note'
  | 'timer'
  | 'receipt'
  | 'rich-text'
  | 'pencil'
  | 'list'

// ============================================================================
// NATURALLY RESPONSIVE ELEMENTS - SOURCE OF TRUTH
// ============================================================================
//
// Element types that are designed to be responsive by nature. These elements
// (FAQ, payment, checkout, prebuilt components, etc.) should fill their parent
// container width when placed inside a frame, rather than keeping a fixed pixel width.
//
// WHY THIS MATTERS:
// When elements are dragged to the canvas root, use-drag.ts disables autoWidth
// and sets a fixed pixel width so they don't collapse (root has no parent to fill).
// But when these elements are then moved INTO a frame, they should restore their
// responsive behavior (autoWidth: true) so they properly fill the frame.
//
// SOURCE OF TRUTH KEYWORDS: NaturallyResponsiveElements, responsive-element-types
// ============================================================================

/**
 * Set of element types that should automatically restore autoWidth/autoHeight
 * when dropped inside a frame. These are self-contained sections that are
 * designed to fill their parent container rather than use a fixed pixel width.
 *
 * - 'faq': FAQ accordion — fills container width, grows to fit content
 * - 'payment': Payment form — responsive form that adapts to container
 * - 'checkout': Checkout section — full checkout experience, fills container
 * - 'prebuilt': PreBuilt components (navbar, sidebar, etc.) — responsive by default
 */
export const NATURALLY_RESPONSIVE_ELEMENTS: ReadonlySet<ElementType | 'prebuilt'> = new Set([
  'faq',
  'timer',
  'payment',
  'checkout',
  'receipt',
  'pencil',
  'list',
  'prebuilt',
])

// ============================================================================
// ELEMENT STYLES - Dynamic CSS-like properties object
// ============================================================================

/**
 * ElementStyles - A flexible key-value object for all visual/layout CSS properties.
 *
 * ============================================================================
 * WHY THIS ARCHITECTURE?
 * ============================================================================
 *
 * Instead of hardcoding each CSS property as a separate interface field:
 *   ❌ backgroundColor: string
 *   ❌ borderRadius: number
 *   ❌ flexDirection: string
 *   ... (100+ properties)
 *
 * We use a single `styles` object that can hold ANY CSS property:
 *   ✅ styles: { backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row' }
 *
 * BENEFITS:
 * 1. SCALABLE: Add any CSS property without changing types
 * 2. DYNAMIC: Spread directly onto React elements: style={{...element.styles}}
 * 3. CONSISTENT: Same pattern for all element types
 * 4. FUTURE-PROOF: Supports custom properties, CSS variables, etc.
 *
 * ============================================================================
 * USAGE IN COMPONENTS
 * ============================================================================
 *
 * ```tsx
 * // In frame-element.tsx or page-renderer.tsx:
 * const contentStyle: React.CSSProperties = {
 *   position: 'absolute',
 *   inset: 0,
 *   ...element.styles,  // Spread ALL user-defined styles dynamically
 * }
 * ```
 *
 * ============================================================================
 * PROPERTY NAMING
 * ============================================================================
 *
 * Use camelCase React-style property names (not CSS kebab-case):
 * - backgroundColor (not background-color)
 * - borderRadius (not border-radius)
 * - flexDirection (not flex-direction)
 *
 * This allows direct spreading onto React style objects.
 */
export type ElementStyles = React.CSSProperties

// ============================================================================
// GRADIENT TYPES - Figma-style gradient system
// ============================================================================

/**
 * A single color stop in a gradient.
 *
 * POSITION: 0-100 representing percentage along the gradient axis.
 * - For linear gradients: 0 = start of line, 100 = end of line
 * - For radial gradients: 0 = center, 100 = outer edge
 *
 * COLOR: Any valid CSS color value (hex, rgba, hsla, named colors).
 * The control UI normalizes to hex for display but preserves original format.
 */
export interface GradientStop {
  /** Unique ID for this stop - used for React keys and drag identification */
  id: string
  /** Color value - hex (#ffffff), rgba, hsla, or CSS color name */
  color: string
  /** Position along gradient axis (0-100 percentage) */
  position: number
}

/**
 * Complete gradient configuration.
 *
 * Supports both linear and radial gradients with full customization.
 * Can be converted to CSS gradient string via gradientConfigToCSS utility.
 *
 * LINEAR GRADIENTS:
 * - Use `angle` to control direction (0 = to top, 90 = to right, 180 = to bottom)
 * - Stops are positioned along the gradient line
 *
 * RADIAL GRADIENTS:
 * - Use `radialShape` to choose circle or ellipse
 * - Use `radialPosition` to set center point (default: center)
 * - Stops radiate outward from center
 */
export interface GradientConfig {
  /** Type of gradient - linear follows a line, radial radiates from center */
  type: 'linear' | 'radial'

  /**
   * Array of color stops (minimum 2 required).
   * Should be sorted by position for consistent rendering.
   */
  stops: GradientStop[]

  /**
   * Linear gradient angle in degrees.
   * - 0 = gradient goes from bottom to top (to top)
   * - 90 = gradient goes from left to right (to right)
   * - 180 = gradient goes from top to bottom (to bottom)
   * - 270 = gradient goes from right to left (to left)
   * Only used when type === 'linear'
   */
  angle?: number

  /**
   * Radial gradient shape.
   * - 'circle': Perfect circle regardless of element aspect ratio
   * - 'ellipse': Follows element aspect ratio (default CSS behavior)
   * Only used when type === 'radial'
   */
  radialShape?: 'circle' | 'ellipse'

  /**
   * Radial gradient center position as percentages.
   * - x: 0 = left edge, 50 = center, 100 = right edge
   * - y: 0 = top edge, 50 = center, 100 = bottom edge
   * Default: { x: 50, y: 50 } (center)
   * Only used when type === 'radial'
   */
  radialPosition?: { x: number; y: number }
}

/**
 * Background video configuration for frame elements.
 *
 * SOURCE OF TRUTH: BackgroundVideoConfig, background-video, frame-background-video
 *
 * STORAGE: element.styles.__backgroundVideo (same __ extension pattern as
 * __backgroundGradient, __effects, __borderConfig)
 *
 * Since CSS has no `background-video` property, this config drives an actual
 * <video> HTML element absolutely positioned behind the frame's content.
 *
 * BEHAVIOR:
 * - Canvas mode: Shows poster as a static background image (no playback)
 * - Preview mode: Renders an auto-playing, looping, muted <video> element
 * - The video layer sits BEHIND all frame content but IN FRONT of background color
 * - Gradient overlays are rendered ON TOP of the video for tinted effects
 */
export interface BackgroundVideoConfig {
  /** HLS video source URL (master.m3u8 path from storage) */
  src: string

  /**
   * Poster/thumbnail URL for static preview.
   * Auto-derived from HLS src by replacing /master.m3u8 with /poster.jpg.
   */
  poster?: string

  /**
   * How the video fills the frame container.
   * - 'cover': Fill container, may crop edges (most common for backgrounds)
   * - 'contain': Fit inside container, may show gaps
   * @default 'cover'
   */
  objectFit?: 'cover' | 'contain'
}

/**
 * Background media mode — tracks which background media type is active.
 *
 * SOURCE OF TRUTH: BackgroundMediaMode, frame-background-mode
 *
 * STORAGE: element.styles.__backgroundMode
 *
 * Used by the properties panel toggle and rendering layer to decide which
 * background media to show. Both image and video data can coexist in styles
 * locally (so toggling doesn't lose data), but only the active mode renders.
 * On save/persist to DB, inactive media data is stripped.
 */
export type BackgroundMediaMode = 'image' | 'video'

/**
 * Background fill configuration - solid color OR gradient.
 *
 * REPLACE MODE: User chooses either solid or gradient, not both.
 * When gradient is active, the solid color serves as a fallback for
 * browsers that don't support gradients (though this is rare now).
 *
 * STORAGE: Stored in element.styles.__backgroundFill
 * The style-utils functions convert this to appropriate CSS.
 */
export interface BackgroundFill {
  /** Type of fill - solid uses color, gradient uses gradient config */
  type: 'solid' | 'gradient'

  /** Solid color value (used when type === 'solid') */
  color?: string

  /** Gradient configuration (used when type === 'gradient') */
  gradient?: GradientConfig
}

/**
 * Text fill configuration - solid color OR gradient.
 *
 * TEXT GRADIENTS require special CSS:
 * - background: linear-gradient(...)
 * - -webkit-background-clip: text
 * - background-clip: text
 * - -webkit-text-fill-color: transparent
 *
 * STORAGE: Stored in element.styles.__textFill
 * The computeTextContentStyles function handles the CSS generation.
 */
export interface TextFill {
  /** Type of fill - solid uses color, gradient uses gradient config */
  type: 'solid' | 'gradient'

  /** Solid color value (used when type === 'solid') */
  color?: string

  /** Gradient configuration (used when type === 'gradient') */
  gradient?: GradientConfig
}

// ============================================================================
// EFFECTS TYPES - Shadows, Blurs, and Visual Effects
// ============================================================================

/**
 * Shadow effect configuration (for Drop Shadow / Box Shadow).
 *
 * CSS MAPPING:
 * - Outer shadow: box-shadow: {x}px {y}px {blur}px {spread}px {color}
 * - Inner shadow: box-shadow: inset {x}px {y}px {blur}px {spread}px {color}
 *
 * USER-FRIENDLY NAMES:
 * - "Drop Shadow" = outer shadow (default)
 * - "Inner Shadow" = inset shadow
 */
export interface ShadowEffect {
  /** Unique ID for React keys and list management */
  id: string

  /** Whether this shadow effect is enabled */
  enabled: boolean

  /** Shadow type - outer (drop shadow) or inner (inset) */
  type: 'outer' | 'inner'

  /** Horizontal offset in pixels (positive = right, negative = left) */
  x: number

  /** Vertical offset in pixels (positive = down, negative = up) */
  y: number

  /** Blur radius - how soft/diffuse the shadow is (0 = sharp) */
  blur: number

  /** Spread radius - expands or contracts the shadow (0 = normal size) */
  spread: number

  /** Shadow color (hex, rgba, etc.) */
  color: string
}

/**
 * Blur effect configuration.
 *
 * CSS MAPPING:
 * - Layer Blur: filter: blur({amount}px)
 * - Background Blur: backdrop-filter: blur({amount}px)
 *
 * USER-FRIENDLY NAMES:
 * - "Layer Blur" = blurs the element itself (filter: blur)
 * - "Background Blur" = blurs content behind the element (backdrop-filter: blur)
 *   Also known as "frosted glass" effect
 */
export interface BlurEffect {
  /** Unique ID for React keys */
  id: string

  /** Whether this blur effect is enabled */
  enabled: boolean

  /** Blur type - layer blurs element, background blurs what's behind */
  type: 'layer' | 'background'

  /** Blur amount in pixels (higher = more blurry) */
  amount: number
}

/**
 * Complete effects configuration for an element.
 *
 * STORAGE: element.styles.__effects
 *
 * Multiple effects can be stacked (e.g., drop shadow + background blur).
 * Effects are applied in order: shadows first, then blurs.
 */
export interface EffectsConfig {
  /** Array of shadow effects (can have multiple shadows) */
  shadows: ShadowEffect[]

  /** Array of blur effects (typically 0-2: layer and/or background) */
  blurs: BlurEffect[]
}

// ============================================================================
// BORDER TYPES - Per-side borders with gradient support
// ============================================================================

/**
 * Border style options matching CSS border-style property.
 */
export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted'

/**
 * Border side identifiers for per-side configuration.
 */
export type BorderSide = 'top' | 'right' | 'bottom' | 'left'

/**
 * Border editing mode - controls which sides are edited together.
 *
 * - 'all': Edit all 4 sides at once (uniform border)
 * - 'individual': Edit each side independently
 * - 'horizontal': Edit left and right together
 * - 'vertical': Edit top and bottom together
 */
export type BorderEditMode = 'all' | 'individual' | 'horizontal' | 'vertical'

/**
 * Configuration for a single border side.
 *
 * Each side can have its own style, width, and color.
 * When gradient is enabled, the color is ignored in favor of the gradient.
 */
export interface BorderSideConfig {
  /** Border style for this side */
  style: BorderStyle

  /** Border width in pixels (0 = no border) */
  width: number

  /** Border color (hex, rgba, etc.) - used when gradient is not set */
  color: string
}

/**
 * Complete border configuration for an element.
 *
 * STORAGE: element.styles.__borderConfig
 *
 * ARCHITECTURE:
 * - Supports uniform borders (all sides same) or per-side configuration
 * - Gradient borders use CSS pseudo-element technique
 * - When gradient is set, it applies to all sides uniformly
 *
 * CSS GENERATION:
 * - Solid colors: Uses standard border-* CSS properties
 * - Gradients: Uses ::before pseudo-element with mask technique
 *
 * GRADIENT BORDERS TECHNIQUE:
 * Since CSS doesn't support gradient borders natively, we use:
 * 1. A ::before pseudo-element with the gradient as background
 * 2. The element's border-radius is applied to maintain curved corners
 * 3. A mask creates the "border" effect by showing only the edge
 *
 * Example generated CSS for gradient border:
 * ```css
 * position: relative;
 * &::before {
 *   content: '';
 *   position: absolute;
 *   inset: 0;
 *   padding: 2px; // border width
 *   background: linear-gradient(...);
 *   -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
 *   -webkit-mask-composite: xor;
 *   mask-composite: exclude;
 *   pointer-events: none;
 *   border-radius: inherit;
 * }
 * ```
 */
export interface BorderConfig {
  /** Editing mode - determines which sides are linked for editing */
  editMode: BorderEditMode

  /** Top border configuration */
  top: BorderSideConfig

  /** Right border configuration */
  right: BorderSideConfig

  /** Bottom border configuration */
  bottom: BorderSideConfig

  /** Left border configuration */
  left: BorderSideConfig

  /**
   * Optional gradient for border color (applies to all sides).
   * When set, overrides individual side colors.
   * Uses the same GradientConfig as background/text gradients.
   */
  gradient?: GradientConfig
}

/**
 * Border fill configuration - solid color OR gradient.
 *
 * Similar to BackgroundFill and TextFill, this controls whether
 * the border uses a solid color or a gradient.
 *
 * STORAGE: Used within BorderConfig
 */
export interface BorderFill {
  /** Type of fill - solid uses color, gradient uses gradient config */
  type: 'solid' | 'gradient'

  /** Solid color value (used when type === 'solid') */
  color?: string

  /** Gradient configuration (used when type === 'gradient') */
  gradient?: GradientConfig
}

// ============================================================================
// RESPONSIVE BREAKPOINT TYPES
// ============================================================================

/**
 * Breakpoint identifiers for responsive styling.
 *
 * STORED IN: Redux (editingBreakpoint - UI state only)
 *
 * - 'desktop': Default styles (stored in element.styles)
 * - 'mobile': Mobile-specific overrides (stored in element.responsiveStyles.mobile)
 *
 * Future: Add 'tablet' when needed
 */
export type Breakpoint = 'desktop' | 'mobile'

/**
 * Responsive styles structure - stores breakpoint-specific style overrides.
 *
 * ARCHITECTURE:
 * - Desktop styles remain in element.styles (backwards compatible)
 * - Mobile-specific overrides stored in element.responsiveStyles.mobile
 * - Final mobile styles = { ...element.styles, ...element.responsiveStyles?.mobile }
 *
 * WHY THIS APPROACH:
 * 1. Backwards compatible - existing elements without responsiveStyles work unchanged
 * 2. Minimal storage - only store overrides, not full style copies
 * 3. Clear hierarchy - base styles + breakpoint overrides
 *
 * USAGE IN PAGE RENDERER:
 * Container queries (@container max-width: 767px) apply mobile overrides
 * on published sites for true container-based responsive behavior.
 */
export interface ResponsiveStyles {
  /** Mobile breakpoint style overrides (container width < 768px) */
  mobile?: Partial<ElementStyles>
  // Future: tablet?: Partial<ElementStyles>
}

/**
 * ============================================================================
 * RESPONSIVE SETTINGS OVERRIDES
 * ============================================================================
 *
 * All possible element-specific SETTINGS that can have responsive overrides.
 *
 * SETTINGS vs STYLES:
 * - SETTINGS: Element-specific behavioral configurations (NOT CSS properties)
 *   Examples: autoWidth, responsive, sticky, variant, objectFit
 *   These require custom logic per element type to apply.
 *
 * - STYLES: Visual/CSS properties (stored in element.styles)
 *   Examples: backgroundColor, fontSize, fontFamily, padding, gap
 *   These can be spread directly onto React style objects.
 *
 * IMPORTANT: Typography properties (fontSize, fontFamily, fontWeight, lineHeight,
 * letterSpacing, textAlign) are CSS properties and belong in STYLES, not here.
 * They were moved to ElementStyles to keep the architecture clean.
 *
 * ============================================================================
 * USAGE BY ELEMENT TYPE
 * ============================================================================
 *
 * - Frame: autoWidth, responsive, sticky, stickyPosition, container
 * - Page: container
 * - Image: objectFit
 * - Button: variant, label, icon, iconPosition, iconSize
 * - Text: autoHeight, autoWidth
 * - All: visible, locked, width, height
 */
export interface ResponsiveSettingsOverrides {
  /** Frame: Whether to use 100% width */
  autoWidth?: boolean

  /**
   * Frame: Whether scroll mode is enabled (overflow: auto).
   * When TRUE, the frame becomes scrollable to contain overflowing content.
   * Replaces the confusingly-named `responsive` property.
   */
  scrollEnabled?: boolean

  /**
   * @deprecated Use `scrollEnabled` instead. This property actually controls
   * scroll mode (overflow: auto), not responsive design.
   * Kept for backwards compatibility - the system checks scrollEnabled first,
   * then falls back to responsive if scrollEnabled is undefined.
   */
  responsive?: boolean
  /** Frame: Whether sticky positioning is enabled */
  sticky?: boolean
  /** Frame: Which edge to stick to */
  stickyPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** Frame/Page: Whether to constrain children in centered container */
  container?: boolean
  /** All: Element visibility */
  visible?: boolean
  /** All: Element locked state */
  locked?: boolean
  /** All: Element width in pixels */
  width?: number
  /** All: Element height in pixels */
  height?: number
  /** Image/Video: How image/video fills container */
  objectFit?: 'cover' | 'contain' | 'fill'
  /** Video: How poster/thumbnail fills container (separate from video objectFit) */
  posterFit?: 'cover' | 'contain' | 'fill'
  /** Button: Visual variant */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  /** Button: Label text */
  label?: string
  /** Button: Icon name from icon picker */
  icon?: string
  /** Button: Icon position relative to label */
  iconPosition?: 'before' | 'after'
  /** Button: Icon size in pixels */
  iconSize?: number
  /** Text: Whether height auto-adapts to content (text wraps and grows) */
  autoHeight?: boolean
  /** Frame: Fade edges effect - soft gradient fading at container edges */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'
  /** Frame: Fade edges height/intensity as percentage of container (1-50, default 10) */
  fadeEdgesHeight?: number
  /** All: Whether element uses absolute positioning within its parent frame */
  isAbsolute?: boolean
  /** Video: Whether to show video controls */
  controls?: boolean
  /** Video: Whether video should autoplay */
  autoplay?: boolean
  /** Video: Whether video should loop */
  loop?: boolean
  /** Video: Whether video should be muted */
  muted?: boolean
  /** All: Rotation angle in degrees (-180 to 180) */
  rotation?: number
  /** Image: Color mask filter applied to image */
  colorMask?: 'regular' | 'grayscale'
  /** Frame: Enable auto-scroll animation */
  autoScroll?: boolean
  /** Frame: Auto-scroll speed in pixels per second */
  autoScrollSpeed?: number
  /** Frame/SmartCMS List: Auto-scroll direction */
  autoScrollDirection?: 'left' | 'right' | 'up' | 'down'
  /** Frame/SmartCMS List: Enable responsive smart grid layout */
  smartGrid?: boolean
  /** Frame/SmartCMS List: Minimum column width for smart grid (px) */
  smartGridMinWidth?: number
  /** Payment: Theme mode for payment form (light or dark) */
  theme?: 'light' | 'dark'
}

/**
 * @deprecated Use ResponsiveSettingsOverrides instead.
 * Kept for backwards compatibility during migration.
 */
export type ResponsivePropertyOverrides = ResponsiveSettingsOverrides

/**
 * ============================================================================
 * RESPONSIVE SETTINGS - Breakpoint-specific setting overrides
 * ============================================================================
 *
 * Same pattern as ResponsiveStyles but for element-specific SETTINGS (not CSS).
 * - Desktop values remain on the element directly (e.g., element.autoWidth)
 * - Mobile-specific overrides stored in element.responsiveSettings.mobile
 * - Final mobile value = element.responsiveSettings?.mobile?.setting ?? element.setting
 *
 * BACKWARDS COMPATIBLE:
 * Elements without this field use the same setting values on all breakpoints.
 */
export interface ResponsiveSettings {
  /** Mobile breakpoint setting overrides (container width < 768px) */
  mobile?: ResponsiveSettingsOverrides
  // Future: tablet?: ResponsiveSettingsOverrides
}

/**
 * @deprecated Use ResponsiveSettings instead.
 * Kept for backwards compatibility during migration.
 */
export type ResponsiveProperties = ResponsiveSettings

/**
 * Tool modes available in the builder.
 *
 * STORED IN: Redux (changes infrequently, OK to re-render)
 *
 * 'select' - Default mode for selecting/moving elements
 * 'grid' - Grid/layout tool for creating structured layouts
 * 'text' - Text element creation tool
 * 'frame' - Drawing new frames on canvas
 * 'image' - Image element creation tool
 * 'button' - Button element creation tool
 * 'pen' - Pen/draw tool for freeform drawing
 */
export type ToolMode =
  | 'select'
  | 'grid'
  | 'text'
  | 'frame'
  | 'image'
  | 'button'
  | 'pen'
  | 'sticky-note'
  | 'circle-frame'

/**
 * Resize handle positions - 8 handles around element boundary.
 *
 * USED IN: Refs during resize operations (NOT Redux)
 *
 * Corners: nw, ne, se, sw (diagonal resize)
 * Edges: n, e, s, w (single-axis resize)
 */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

// ============================================================================
// ELEMENT DATA STRUCTURES
// ============================================================================

/**
 * Base properties shared by ALL element types.
 *
 * STORED IN: Redux (single source of truth)
 * SERIALIZABLE: Yes - can be saved to database as JSON
 *
 * Every element in the canvas MUST have these properties.
 */
export interface BaseElement {
  /**
   * Unique identifier - used for O(1) lookups in Redux store.
   * Format: 'el_[timestamp]_[random]' (e.g., 'el_1699123456789_abc123def')
   */
  id: string

  /**
   * Element type - determines rendering and behavior.
   * Used for discriminated union type narrowing.
   */
  type: ElementType

  /**
   * Display name shown in layers panel.
   * User-editable, defaults to 'Frame', 'Text', etc.
   */
  name: string

  /**
   * X position in CANVAS coordinates.
   * - For root elements: absolute position on canvas
   * - For children: relative to parent (currently 0, uses flex layout)
   */
  x: number

  /** Y position in CANVAS coordinates */
  y: number

  /** Width in canvas units (pixels at 100% zoom) */
  width: number

  /** Height in canvas units */
  height: number

  /**
   * Parent element ID - null means root level (directly on canvas).
   * Used to build the element tree structure.
   */
  parentId: string | null

  /**
   * Order among siblings - determines z-index and render order.
   * 0 = first/bottom, higher = later/top
   */
  order: number

  /** Whether element is visible (can be toggled in layers panel) */
  visible: boolean

  /** Whether element is locked (cannot be selected/modified) */
  locked: boolean

  /**
   * Whether element uses absolute positioning within its parent frame.
   *
   * When TRUE:
   * - Element uses position: absolute within its immediate parent frame
   * - Parent frame automatically gets position: relative
   * - Element's x/y are relative to the parent frame (not the canvas)
   * - Element can be freely dragged within its parent bounds
   * - Element is taken out of the normal flex/grid flow
   *
   * When FALSE (default):
   * - Element follows normal flex/grid layout within parent
   * - Element's x/y are typically 0 (position determined by flex order)
   *
   * IMPORTANT: When an absolute element is dropped at root level (canvas),
   * isAbsolute is automatically set to false since root elements use
   * absolute positioning by default on the canvas.
   */
  isAbsolute?: boolean

  /**
   * Whether element is centered horizontally within its parent (free position only).
   *
   * When TRUE:
   * - Uses CSS `left: 50%` + `transform: translateX(-50%)` for true centering
   * - Stays centered even if element or parent is resized
   * - Overrides the `x` value for positioning
   *
   * When FALSE (default):
   * - Uses `x` value for left positioning (pixel-based)
   */
  centerHorizontal?: boolean

  /**
   * Whether element is centered vertically within its parent (free position only).
   *
   * When TRUE:
   * - Uses CSS `top: 50%` + `transform: translateY(-50%)` for true centering
   * - Stays centered even if element or parent is resized
   * - Overrides the `y` value for positioning
   *
   * When FALSE (default):
   * - Uses `y` value for top positioning (pixel-based)
   */
  centerVertical?: boolean

  /**
   * Rotation angle in degrees (-180 to 180).
   *
   * Applied via CSS `transform: rotate()`.
   * - Positive values rotate clockwise
   * - Negative values rotate counter-clockwise
   * - Default: 0 (no rotation)
   *
   * Does not affect layout flow - rotated elements maintain their
   * original bounding box for positioning purposes.
   */
  rotation?: number

  /**
   * Whether to constrain children within a centered container.
   *
   * When TRUE:
   * - Children are wrapped in a max-width container (e.g., 1280px)
   * - Container is centered horizontally with auto margins
   * - Prevents content from stretching edge-to-edge on wide screens
   *
   * When FALSE (default):
   * - Children stretch to full width of the element
   * - Content goes edge-to-edge
   *
   * Useful for pages and full-width sections that need centered content.
   */
  container: boolean

  /**
   * DYNAMIC STYLES - All CSS-like visual/layout properties.
   *
   * This object can contain ANY React.CSSProperties and is spread
   * directly onto the element's content div for rendering.
   *
   * Common properties stored here:
   * - backgroundColor, backgroundImage
   * - borderRadius, border, borderColor
   * - flexDirection, justifyContent, alignItems, gap
   * - padding, margin
   * - opacity, boxShadow
   * - ...any CSS property
   *
   * USAGE: style={{...baseStyles, ...element.styles}}
   */
  styles: ElementStyles

  /**
   * RESPONSIVE STYLE OVERRIDES - Breakpoint-specific style modifications.
   *
   * Optional object containing style overrides for specific breakpoints.
   * When a breakpoint is active (e.g., mobile container width), these
   * styles are merged on top of the base `styles` object.
   *
   * STORAGE PATTERN:
   * - Desktop/base styles → element.styles
   * - Mobile overrides → element.responsiveStyles.mobile
   *
   * RENDERING:
   * - Canvas editor: Main page shows desktop, breakpoint frame shows merged mobile
   * - Published site: Container queries apply mobile overrides at <768px container width
   *
   * BACKWARDS COMPATIBLE:
   * Elements without this field render the same on all breakpoints.
   */
  responsiveStyles?: ResponsiveStyles

  /**
   * ============================================================================
   * RESPONSIVE SETTINGS - Breakpoint-specific non-CSS setting modifications
   * ============================================================================
   *
   * Optional object containing setting overrides for specific breakpoints.
   * These are for NON-CSS settings like autoWidth, responsive, sticky, visible,
   * locked, objectFit, variant, etc.
   *
   * IMPORTANT: Typography properties (fontSize, fontFamily, etc.) are NOW
   * stored in element.styles and element.responsiveStyles, NOT here.
   *
   * STORAGE PATTERN:
   * - Desktop/base settings → stored directly on element (e.g., element.autoWidth)
   * - Mobile overrides → element.responsiveSettings.mobile
   *
   * RENDERING:
   * - Canvas editor: Main page shows desktop, breakpoint frame shows mobile values
   * - Published site: JavaScript/CSS logic applies mobile overrides at <768px
   *
   * BACKWARDS COMPATIBLE:
   * Elements without this field use the same setting values on all breakpoints.
   */
  responsiveSettings?: ResponsiveSettings

  /**
   * @deprecated Use responsiveSettings instead.
   * Kept for backwards compatibility during migration.
   */
  responsiveProperties?: ResponsiveProperties
}

/**
 * Frame element - container that can hold other elements.
 *
 * STORED IN: Redux (single source of truth)
 *
 * Frames are the primary building block, similar to Figma frames.
 * They can contain other frames or future element types.
 *
 * ============================================================================
 * STYLES ARE IN BaseElement.styles
 * ============================================================================
 *
 * All visual properties (backgroundColor, borderRadius, flexDirection, etc.)
 * are stored in the `styles` object inherited from BaseElement.
 *
 * Example styles for a frame:
 * ```ts
 * styles: {
 *   backgroundColor: '#1a1a1a',
 *   borderRadius: 12,
 *   flexDirection: 'column',
 *   justifyContent: 'flex-start',
 *   alignItems: 'stretch',
 *   gap: 10,
 *   padding: 10,
 * }
 * ```
 */
export interface FrameElement extends BaseElement {
  type: 'frame'

  /**
   * When TRUE, the frame uses width: 100% instead of a fixed pixel width.
   * Useful for creating responsive sections that fill their parent container.
   *
   * - FALSE (default): Uses fixed `element.width` value in pixels
   * - TRUE: Uses width: 100% to fill available space
   *
   * Note: The `width` property is still stored for when autoWidth is toggled off.
   */
  autoWidth?: boolean

  /**
   * When TRUE, enables sticky positioning for this frame.
   * The frame will stick to the specified edge when scrolling.
   *
   * NOTE: Sticky only applies in PREVIEW/PUBLISHED mode, NOT in the canvas editor.
   * This prevents sticky behavior from interfering with editing interactions.
   */
  sticky?: boolean

  /**
   * Which edge the frame sticks to when scrolling.
   * Only applies when `sticky` is TRUE.
   *
   * - 'top': Sticks to top of viewport (most common for headers/navbars)
   * - 'bottom': Sticks to bottom of viewport (footers, CTAs)
   * - 'left': Sticks to left edge (sidebars)
   * - 'right': Sticks to right edge (sidebars, floating actions)
   *
   * Default: 'top'
   */
  stickyPosition?: 'top' | 'bottom' | 'left' | 'right'

  /**
   * ============================================================================
   * SCROLL MODE - Enable scrollable content area
   * ============================================================================
   *
   * When TRUE, the frame becomes scrollable to contain overflowing content.
   * This is useful for:
   * - Horizontal product carousels
   * - Scrollable lists
   * - Any content that shouldn't overflow outside the frame bounds
   *
   * BEHAVIOR:
   * - Adds overflow: auto to the content div
   * - Horizontal scroll for row layouts
   * - Vertical scroll for column layouts
   * - Hidden scrollbar for cleaner look (users can still scroll)
   *
   * Default: false (content can overflow visually)
   */
  scrollEnabled?: boolean

  /**
   * @deprecated Use `scrollEnabled` instead. This property was confusingly named
   * "responsive" but actually controls scroll mode (overflow: auto), not
   * responsive design. Kept for backwards compatibility.
   *
   * The system checks scrollEnabled first, then falls back to responsive if
   * scrollEnabled is undefined.
   *
   * Default: false
   */
  responsive?: boolean

  /**
   * ============================================================================
   * FADE EDGES - Marquee-style fade effect for any frame
   * ============================================================================
   *
   * When set, applies a CSS mask gradient to fade content at the specified edges.
   * This creates a smooth "fade to nothing" effect - commonly used for carousels,
   * marquees, or any container where you want soft edges.
   *
   * NOTE: This effect works independently of scroll mode. Users can apply fade
   * edges to any frame regardless of whether scrolling is enabled.
   *
   * OPTIONS:
   * - 'none': No fade effect (default)
   * - 'top': Fade at top edge only
   * - 'bottom': Fade at bottom edge only
   * - 'left': Fade at left edge only
   * - 'right': Fade at right edge only
   * - 'top-bottom': Fade at both top and bottom edges
   * - 'left-right': Fade at both left and right edges
   * - 'all': Fade at all four edges
   *
   * IMPLEMENTATION:
   * Uses CSS mask-image with linear gradients. The mask fades from transparent
   * at the edge to opaque (black) toward the center. This works with ANY
   * background color since masks affect opacity, not color blending.
   *
   * IMPORTANT: The mask layer does NOT block pointer events - users can still
   * click/interact with content in the faded areas.
   */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /**
   * Fade edges height/intensity as percentage of container size (1-50).
   * Defaults to 10% if not specified. Higher values create a larger fade area.
   */
  fadeEdgesHeight?: number

  /**
   * ============================================================================
   * AUTO-SCROLL ANIMATION - Infinite scrolling marquee effect
   * ============================================================================
   *
   * When enabled, the frame's children automatically scroll horizontally
   * in an infinite loop. The animation is seamless - when content reaches
   * the end, it loops back without any visible jump.
   *
   * REQUIREMENTS FOR SMOOTH ANIMATION:
   * 1. Frame must have `responsive: true` (scroll mode enabled)
   * 2. Total children width should be >= container width for seamless loop
   * 3. Children should not have autoWidth enabled
   *
   * IMPLEMENTATION:
   * - Uses CSS animation with translateX
   * - Children are visually duplicated in the RENDER (not in data) for seamless loop
   * - Animation duration is calculated based on content width and speed setting
   *
   * Also available on SmartCMS List elements for CMS data marquee scrolling.
   */
  autoScroll?: boolean

  /**
   * Auto-scroll animation speed in pixels per second.
   * Higher values = faster scrolling. Default: 50
   *
   * Common values:
   * - 25: Slow, relaxed scrolling
   * - 50: Medium speed (default)
   * - 100: Fast scrolling
   */
  autoScrollSpeed?: number

  /**
   * Direction of auto-scroll animation.
   * - 'left': Content scrolls from right to left (default, reading direction)
   * - 'right': Content scrolls from left to right (reverse)
   * - 'up': Content scrolls from bottom to top (SmartCMS List only)
   * - 'down': Content scrolls from top to bottom (SmartCMS List only)
   */
  autoScrollDirection?: 'left' | 'right' | 'up' | 'down'

  /**
   * ============================================================================
   * RESPONSIVE SMART GRID — Auto-layout children into a CSS Grid
   * ============================================================================
   *
   * When TRUE, the frame switches from flexbox to CSS Grid using:
   *   grid-template-columns: repeat(auto-fill, minmax(min(100%, Xpx), 1fr))
   *
   * This makes children automatically arrange into the optimal number of
   * columns based on the container width and the children's natural width.
   * As the page shrinks, columns reduce and items wrap. As it grows, more
   * columns appear. Each item always stretches to fill its grid cell.
   *
   * The user only toggles this on — no column/row configuration needed.
   * The system auto-detects the minimum column width from the first child's
   * stored pixel width at toggle time.
   *
   * SOURCE OF TRUTH: SmartGrid, ResponsiveSmartGrid, smart-grid-layout
   */
  smartGrid?: boolean

  /**
   * The minimum width (in pixels) for each grid column.
   * Auto-set from the first child's width when smartGrid is toggled on.
   * Used in: grid-template-columns: repeat(auto-fill, minmax(min(100%, Xpx), 1fr))
   *
   * Can be manually adjusted by the user if needed, but defaults are
   * designed to "just work" without any configuration.
   *
   * Default: 200 (fallback when no children exist at toggle time)
   */
  smartGridMinWidth?: number

  /**
   * ============================================================================
   * MASTER COMPONENT TRACKING
   * ============================================================================
   *
   * When set, this frame is the "master" source for a LocalComponent.
   * The frame remains fully editable like any other frame, but changes to it
   * (and its descendants) are synced to the component's sourceTree in the database.
   *
   * This enables the master component to be edited like a regular frame while
   * keeping all instances in sync.
   *
   * VALUE: The ID of the LocalComponent this frame is the master for.
   *
   * BEHAVIOR:
   * - Frame is fully editable (select, drag, resize, style changes)
   * - Children are fully editable (can add, remove, modify children)
   * - All changes sync to LocalComponent.sourceTree in database
   * - All instances of this component auto-update from sourceTree
   */
  masterOfComponentId?: string

  /**
   * ============================================================================
   * PROTECTED INSET FLAG - For Sidebar Inset Frames
   * ============================================================================
   *
   * When TRUE, this frame is a protected inset belonging to a PreBuilt sidebar.
   * Protected insets:
   * - CANNOT be deleted (delete action skips them)
   * - CANNOT be moved outside their parent sidebar
   * - CAN be selected and styled (background, padding, flex properties, etc.)
   * - CAN receive dropped elements as children
   *
   * This flag ensures the sidebar always has its inset content area intact
   * while still allowing users to customize the inset's appearance.
   */
  isProtectedInset?: boolean
}

/**
 * Page element - represents a website page that can contain other elements.
 *
 * STORED IN: Redux (single source of truth)
 *
 * ============================================================================
 * SPECIAL BEHAVIOR - Pages are different from Frames:
 * ============================================================================
 *
 * 1. CANNOT BE DELETED: Pages are protected from deletion. The deleteElement
 *    action in canvas-slice.ts will skip elements of type 'page'.
 *
 * 2. VERTICAL RESIZE ONLY: Pages can only be resized from top and bottom edges.
 *    The PageResizeHandles component only renders 'n' and 's' handles.
 *    Width is fixed to simulate a desktop viewport.
 *
 * 3. FIXED WIDTH: Default width is 1440px (standard desktop viewport).
 *    Users can only change height to extend the page content area.
 *
 * 4. CENTERED ON CANVAS: Pages are typically centered on the canvas and serve
 *    as the main content area for website building.
 *
 * ============================================================================
 * STYLES ARE IN BaseElement.styles
 * ============================================================================
 *
 * All visual properties (backgroundColor, etc.) are stored in the `styles`
 * object inherited from BaseElement.
 *
 * Example styles for a page:
 * ```ts
 * styles: {
 *   backgroundColor: '#ffffff',
 *   flexDirection: 'column',
 *   gap: 10,
 *   padding: 10,
 * }
 * ```
 */
export interface PageElement extends BaseElement {
  type: 'page'

  /**
   * ============================================================================
   * BREAKPOINTS - Responsive preview frames
   * ============================================================================
   *
   * Stores which breakpoint previews are enabled for this page.
   * When a breakpoint is enabled, a reference frame is rendered on the canvas
   * showing how the page content appears at that viewport size.
   *
   * IMPORTANT: The breakpoint frames are NOT stored as separate elements!
   * They are rendered dynamically based on this property, referencing the
   * same child elements as the main page. This prevents data duplication
   * and ensures the breakpoint frames are never accidentally saved to the DB.
   *
   * INTERACTION: Breakpoint frames only allow clicking/selecting elements.
   * No dragging, resizing, or reordering is allowed within breakpoint frames.
   */
  breakpoints?: {
    /**
     * Mobile breakpoint (375px viewport width).
     * When true, renders a mobile preview frame next to the page.
     */
    mobile?: boolean
  }
}

/**
 * Text element - editable text content on the canvas.
 *
 * STORED IN: Redux (single source of truth)
 *
 * Text elements are used for headings, paragraphs, labels, and any
 * other text content on the website.
 *
 * ============================================================================
 * TEXT ARCHITECTURE - SETTINGS vs STYLES
 * ============================================================================
 *
 * SETTINGS (stored directly on element):
 * - `content`: The actual text content (editable inline or via panel)
 * - `autoHeight`: Whether height adapts to content
 * - `autoWidth`: Whether width fills container
 *
 * STYLES (stored in element.styles - CSS properties):
 * - fontFamily: Google Font family name (e.g., "Inter", "Roboto")
 * - fontSize: Font size in pixels
 * - fontWeight: Font weight (100-900)
 * - lineHeight: Line height multiplier
 * - letterSpacing: Letter spacing in pixels
 * - textAlign: Text alignment
 * - color: Text color
 * - backgroundColor: Background behind text
 * - padding: Space inside the text box
 *
 * WHY TYPOGRAPHY IN STYLES?
 * Typography properties ARE CSS properties. Putting them in styles:
 * 1. Allows direct spreading onto React style objects
 * 2. Enables responsive overrides via responsiveStyles.mobile
 * 3. Keeps architecture consistent (all CSS = styles)
 *
 * ============================================================================
 * GOOGLE FONTS INTEGRATION
 * ============================================================================
 *
 * The `fontFamily` style accepts any Google Font family name.
 * The builder dynamically loads the font via Google Fonts API when:
 * 1. A text element is selected and font is changed
 * 2. The page is rendered in preview mode
 * 3. The published website is viewed
 *
 * Font loading is handled by the GoogleFontsService which:
 * - Fetches the full font list from Google Fonts API
 * - Caches font data for performance
 * - Injects font CSS into the document head
 */
export interface TextElement extends BaseElement {
  type: 'text'

  /**
   * The actual text content.
   * Can be edited inline on canvas or via properties panel.
   * This is a SETTING, not a style - it's the data the element displays.
   */
  content: string

  /**
   * When TRUE, text wraps and height adapts automatically to fit content.
   * This makes the text element responsive - as width shrinks, text wraps
   * and height grows to accommodate the wrapped lines.
   *
   * When FALSE, text is constrained to the fixed height, and overflow is hidden.
   *
   * Default: true (responsive text is the default behavior)
   */
  autoHeight?: boolean

  /**
   * When TRUE, the text element uses width: 100% instead of a fixed pixel width.
   * Combined with autoHeight, this makes the text fully responsive to its container.
   *
   * When FALSE (default for backwards compatibility), uses fixed `element.width` value.
   *
   * Default: true (responsive text should fill container width by default)
   */
  autoWidth?: boolean

  // ========================================================================
  // SEO — Semantic HTML Tag
  // ========================================================================

  /**
   * The HTML tag to use when rendering this text element in preview/published mode.
   * Enables proper semantic HTML for SEO — search engines weight h1/h2/p differently.
   *
   * SOURCE OF TRUTH: TextHtmlTag, SemanticTextTag
   *
   * @default 'p' — paragraph tag for general text content
   */
  htmlTag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div'

  // ========================================================================
  // DEPRECATED: Typography properties moved to element.styles
  // ========================================================================
  // These are kept for backwards compatibility during migration.
  // New code should read typography from element.styles instead.
  // ========================================================================

  /**
   * @deprecated Use element.styles.fontFamily instead.
   * Google Font family name (e.g., "Inter", "Roboto", "Open Sans").
   */
  fontFamily?: string

  /**
   * @deprecated Use element.styles.fontSize instead.
   * Font size in pixels.
   */
  fontSize?: number

  /**
   * @deprecated Use element.styles.fontWeight instead.
   * Font weight - numeric (100-900) or keyword ("normal", "bold").
   */
  fontWeight?: number | string

  /**
   * @deprecated Use element.styles.lineHeight instead.
   * Line height as a multiplier (e.g., 1.5 = 150% of font size).
   */
  lineHeight?: number

  /**
   * @deprecated Use element.styles.letterSpacing instead.
   * Letter spacing in pixels.
   */
  letterSpacing?: number

  /**
   * @deprecated Use element.styles.textAlign instead.
   * Text alignment within the element bounds.
   */
  textAlign?: 'left' | 'center' | 'right' | 'justify'

  // ========================================================================
  // EFFECTS
  // ========================================================================

  /**
   * Fade edges effect - creates soft gradient fading at element edges.
   * Uses CSS mask-image to fade content toward the specified edges.
   */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /**
   * Fade edges height/intensity as percentage of element size (1-50).
   * Defaults to 10% if not specified.
   */
  fadeEdgesHeight?: number
}

/**
 * Image element - displays an image on the canvas.
 *
 * STORED IN: Redux (single source of truth)
 *
 * Image elements are essentially frames with a background image set.
 * They support all frame properties plus image-specific settings.
 *
 * ============================================================================
 * IMAGE SOURCE
 * ============================================================================
 *
 * The `src` property holds the image URL. This can be:
 * - An uploaded image URL (from your file storage)
 * - An external URL (like Unsplash)
 * - A data URL for inline images
 *
 * The image is rendered as a background-image with cover sizing.
 */
export interface ImageElement extends BaseElement {
  type: 'image'

  /**
   * Image source URL.
   * Rendered as background-image on the element.
   */
  src: string

  /**
   * Alt text for accessibility.
   * Used when the image is rendered in an <img> tag for published sites.
   */
  alt: string

  /**
   * Object fit mode - how the image fills the container.
   * 'cover' - Fill container, may crop
   * 'contain' - Fit inside, may have gaps
   * 'fill' - Stretch to fill exactly
   */
  objectFit: 'cover' | 'contain' | 'fill'

  /**
   * When TRUE, the image uses width: 100% instead of a fixed pixel width.
   * This makes the image responsive - it will fill the width of its container.
   *
   * When FALSE (default), uses fixed `element.width` value in pixels.
   *
   * Note: The `width` property is still stored for when autoWidth is toggled off.
   */
  autoWidth?: boolean

  // ========================================================================
  // EFFECTS
  // ========================================================================

  /**
   * Fade edges effect - creates soft gradient fading at element edges.
   * Uses CSS mask-image to fade content toward the specified edges.
   */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /**
   * Fade edges height/intensity as percentage of element size (1-50).
   * Defaults to 10% if not specified.
   */
  fadeEdgesHeight?: number

  /**
   * Color mask filter applied to the image.
   * 'regular' - No filter, shows original colors (default)
   * 'grayscale' - Converts image to black and white
   */
  colorMask?: 'regular' | 'grayscale'
}

/**
 * Video element - displays a video on the canvas.
 *
 * STORED IN: Redux (single source of truth)
 *
 * Video elements support two source types:
 * 1. Storage - HLS video from the organization's media storage
 * 2. Loom - Embedded Loom video via iframe
 *
 * ============================================================================
 * VIDEO SOURCE TYPES
 * ============================================================================
 *
 * STORAGE MODE:
 * - Uses the VideoPlayer component for HLS adaptive streaming
 * - `src` contains the HLS manifest URL (master.m3u8)
 * - `poster` contains the thumbnail/poster image URL
 * - Supports custom thumbnail selection from storage
 *
 * LOOM MODE:
 * - Renders a Loom embed iframe
 * - `loomUrl` contains the full Loom share link
 * - Extracted Loom video ID is used for the embed URL
 */
export interface VideoElement extends BaseElement {
  type: 'video'

  /**
   * Source type determines how the video is loaded.
   * - 'storage': HLS video from organization storage (uses VideoPlayer)
   * - 'loom': Embedded Loom video (uses iframe)
   */
  sourceType: 'storage' | 'loom'

  /**
   * Video source URL (for storage mode).
   * This is the HLS manifest URL (e.g., .../master.m3u8)
   */
  src: string

  /**
   * Poster/thumbnail URL for the video.
   * Shown before video plays and can be customized from storage.
   */
  poster: string

  /**
   * Loom URL for embedded Loom videos.
   * Full share link like: https://www.loom.com/share/abc123
   */
  loomUrl: string

  /**
   * Alt text for accessibility.
   * Used for screen readers and when video fails to load.
   */
  alt: string

  /**
   * Object fit mode - how the VIDEO fills the container.
   * 'cover' - Fill container, may crop
   * 'contain' - Fit inside, may have gaps (DEFAULT for video)
   * 'fill' - Stretch to fill exactly
   */
  objectFit: 'cover' | 'contain' | 'fill'

  /**
   * Object fit mode - how the POSTER/THUMBNAIL fills the container.
   * 'cover' - Fill container, may crop (DEFAULT for thumbnail)
   * 'contain' - Fit inside, may have gaps
   * 'fill' - Stretch to fill exactly
   *
   * This is separate from objectFit so users can have different
   * settings for the thumbnail preview vs the actual video playback.
   */
  posterFit?: 'cover' | 'contain' | 'fill'

  /**
   * When TRUE, the video uses width: 100% instead of a fixed pixel width.
   * This makes the video responsive - it will fill the width of its container.
   */
  autoWidth?: boolean

  /**
   * Whether to show video controls (play/pause, volume, etc.)
   * @default true
   */
  controls?: boolean

  /**
   * Whether to autoplay the video (usually requires muted to work)
   * @default false
   */
  autoplay?: boolean

  /**
   * Whether to loop the video playback
   * @default false
   */
  loop?: boolean

  /**
   * Whether to start muted (required for autoplay in most browsers)
   * @default false
   */
  muted?: boolean

  // ========================================================================
  // EFFECTS
  // ========================================================================

  /**
   * Fade edges effect - creates soft gradient fading at element edges.
   * Uses CSS mask-image to fade content toward the specified edges.
   */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /**
   * Fade edges height/intensity as percentage of element size (1-50).
   * Defaults to 10% if not specified.
   */
  fadeEdgesHeight?: number
}

// ============================================================================
// FORM ELEMENT - Embedded Form from Form Builder
// ============================================================================

/**
 * Form element - Embeds a form from the Form Builder into the website.
 *
 * BEHAVIOR:
 * - Renders the selected form using the existing FormRenderer component
 * - Only PUBLISHED forms can be selected (forms that are ready to be displayed)
 * - Can be clicked and dragged like Video elements (not blocked on select)
 * - Settings tab allows selecting which form to display
 *
 * USAGE:
 * 1. Drag form element from sidebar to canvas
 * 2. Click on element and go to Settings tab
 * 3. Select a published form from the dropdown
 * 4. Form renders directly in the element
 */
export interface FormElement extends BaseElement {
  type: 'form'

  /**
   * The ID of the form to render.
   * References a Form entity from the Form Builder.
   * When empty, shows a placeholder prompting form selection.
   */
  formId: string

  /**
   * The form slug for URL routing (cached for display purposes).
   * Updated when form is selected.
   */
  formSlug?: string

  /**
   * The form name (cached for display purposes).
   * Shows in the element label and placeholder.
   */
  formName?: string

  /**
   * When TRUE, the form uses width: 100% instead of a fixed pixel width.
   * This makes the form responsive - it will fill the width of its container.
   */
  autoWidth?: boolean

  /**
   * When TRUE, the form height adjusts automatically to fit its content.
   * Forms should ALWAYS use autoHeight to prevent content from being cut off.
   * This is set to true by default and forms are NOT resizable.
   */
  autoHeight?: boolean

  // ========================================================================
  // POST-SUBMISSION REDIRECT
  // SOURCE OF TRUTH: PostSubmissionRedirect for FormElement
  // ========================================================================

  /**
   * When TRUE, redirects the user after a successful form submission
   * instead of showing the inline success message.
   * Overrides the form schema's own redirectUrl setting.
   * @default false
   */
  successRedirectEnabled?: boolean

  /**
   * The type of redirect destination.
   * - 'page': A page within this website (uses slug from selectPageInfos)
   * - 'url': A custom external URL
   * @default 'page'
   */
  successRedirectType?: 'page' | 'url'

  /**
   * The slug of the target page within this website.
   * Used when successRedirectType is 'page'.
   * Same pattern as ButtonAction.targetPageSlug.
   */
  successRedirectPageSlug?: string

  /**
   * A custom external URL to redirect to after form submission.
   * Used when successRedirectType is 'url'.
   */
  successRedirectUrl?: string

  /**
   * Whether to open the custom URL in a new tab.
   * Only applies when successRedirectType is 'url'.
   * Page redirects always stay in the same tab.
   * @default false
   */
  successRedirectNewTab?: boolean
}

/**
 * ============================================================================
 * PAYMENT ELEMENT - Embedded Payment Form for Website Builder
 * ============================================================================
 *
 * SOURCE OF TRUTH: Payment Element Types
 *
 * Renders a payment form within the website canvas that allows users to
 * pay for a selected product/price. Uses the same styling as the pay page.
 *
 * BEHAVIOR:
 * - Settings tab allows selecting a product and price
 * - When no product/price selected, shows a placeholder
 * - Payment forms are NOT resizable - they always use autoHeight
 * - autoWidth is automatically set when dropped inside a frame
 *
 * ARCHITECTURE:
 * - Canvas: Shows a preview of the payment form (non-functional)
 * - Published: Renders a fully functional Stripe payment form
 *
 * ============================================================================
 */
export interface PaymentElement extends BaseElement {
  type: 'payment'

  /**
   * The ID of the product to display pricing for.
   * References a Product entity from the Products system.
   * When empty, shows a placeholder prompting product selection.
   */
  productId: string

  /**
   * The ID of the price tier to charge.
   * Each product can have multiple prices (one-time, subscription, etc.)
   * If empty but productId is set, the first price will be used.
   */
  priceId: string

  /**
   * The product name (cached for display purposes).
   * Shows in the element label and placeholder.
   */
  productName?: string

  /**
   * The price name (cached for display purposes).
   * Shows the selected price tier in the settings panel.
   */
  priceName?: string

  /**
   * The price amount in cents (cached for display purposes).
   * Used to show the amount in the builder preview.
   */
  priceAmount?: number

  /**
   * The currency code (cached for display purposes).
   * Default is 'usd'.
   */
  priceCurrency?: string

  /**
   * When TRUE, the payment form uses width: 100% instead of a fixed pixel width.
   * This makes the form responsive - it will fill the width of its container.
   */
  autoWidth?: boolean

  /**
   * When TRUE, the payment form height adjusts automatically to fit its content.
   * Payment forms should ALWAYS use autoHeight to prevent content from being cut off.
   * This is set to true by default and payment forms are NOT resizable.
   */
  autoHeight?: boolean

  /**
   * SOURCE OF TRUTH: PaymentFormTheme
   *
   * The visual theme of the payment form.
   * - 'dark': Dark background with light text (default)
   * - 'light': Light background with dark text
   *
   * This affects the form background, text colors, input styling,
   * and Stripe Elements appearance.
   */
  theme?: 'light' | 'dark'

  /**
   * SOURCE OF TRUTH: PaymentTestMode
   *
   * When TRUE, the payment element uses Stripe TEST API keys.
   * This allows users to test payments with test credit cards
   * (e.g., 4242 4242 4242 4242) without processing real charges.
   *
   * When FALSE (default), uses LIVE/production Stripe keys
   * and processes real payments.
   *
   * IMPORTANT: Test mode should be disabled before publishing
   * production websites to avoid failed real transactions.
   */
  testMode?: boolean

  // ========================================================================
  // POST-PAYMENT REDIRECT
  // SOURCE OF TRUTH: PostPaymentRedirect for PaymentElement
  // ========================================================================

  /**
   * When TRUE, redirects the user after a successful payment
   * instead of showing the inline success message.
   * @default false
   */
  successRedirectEnabled?: boolean

  /**
   * The type of redirect destination.
   * - 'page': A page within this website (uses slug from selectPageInfos)
   * - 'url': A custom external URL
   * @default 'page'
   */
  successRedirectType?: 'page' | 'url'

  /**
   * The slug of the target page within this website.
   * Used when successRedirectType is 'page'.
   * Same pattern as ButtonAction.targetPageSlug.
   */
  successRedirectPageSlug?: string

  /**
   * A custom external URL to redirect to after payment.
   * Used when successRedirectType is 'url'.
   */
  successRedirectUrl?: string

  /**
   * Whether to open the custom URL in a new tab.
   * Only applies when successRedirectType is 'url'.
   * Page redirects always stay in the same tab.
   * @default false
   */
  successRedirectNewTab?: boolean

  // ========================================================================
  // ORDER BUMP CONFIGURATION
  // SOURCE OF TRUTH: PaymentOrderBump, OrderBumpConfig, OrderBumpBillingType
  // ========================================================================
  //
  // Order bumps let users add an extra product to their payment before
  // checkout via a checkbox (e.g., "Add warranty for $9.99").
  // Supports ONE_TIME and RECURRING billing types.
  // SPLIT_PAYMENT is deliberately excluded from order bumps.
  //
  // When the bump's billing type differs from the main product's type,
  // the backend uses mixed-billing checkout (Stripe subscription mode
  // with add_invoice_items for one-time items) — same architecture as
  // the ecommerce cart checkout element.
  // ========================================================================

  /**
   * When TRUE, shows an order bump checkbox on the payment form.
   * The checkbox lets the customer add an additional product before paying.
   * @default false
   */
  orderBumpEnabled?: boolean

  /**
   * Product ID for the order bump offer.
   * References a Product entity from the Products system.
   */
  orderBumpProductId?: string

  /**
   * Price ID for the order bump product.
   * Determines the exact price/billing tier to add.
   * Supports ONE_TIME or RECURRING billing (SPLIT_PAYMENT excluded).
   */
  orderBumpPriceId?: string

  /**
   * Custom label text for the order bump checkbox.
   * Shown next to the checkbox in the payment form.
   * e.g., "Add extended warranty for $9.99"
   * @default "Add {productName} for {price}"
   */
  orderBumpLabel?: string

  /**
   * Custom badge text shown above the order bump card.
   * SOURCE OF TRUTH: OrderBumpBadgeText
   * @default "Recommended"
   */
  orderBumpBadgeText?: string

  /**
   * Cached product name for display in builder and as default label.
   */
  orderBumpProductName?: string

  /**
   * Cached price amount in cents for display in builder and form.
   */
  orderBumpPriceAmount?: number

  /**
   * Cached currency for price formatting.
   */
  orderBumpPriceCurrency?: string

  /**
   * SOURCE OF TRUTH: OrderBumpBillingType
   * The billing type of the selected bump price.
   * Cached so the frontend knows how to display and route the bump.
   * - 'ONE_TIME': Added to PaymentIntent or as add_invoice_item on subscription
   * - 'RECURRING': Creates/augments a Stripe subscription
   */
  orderBumpBillingType?: 'ONE_TIME' | 'RECURRING'

  /**
   * Billing interval for RECURRING bump prices (e.g., MONTH, YEAR).
   * Only relevant when orderBumpBillingType is 'RECURRING'.
   */
  orderBumpBillingInterval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

  /**
   * Interval count for RECURRING bump prices (e.g., 2 for "every 2 months").
   * Only relevant when orderBumpBillingType is 'RECURRING'.
   * @default 1
   */
  orderBumpIntervalCount?: number

  /**
   * Cached Stripe price ID for the bump product.
   * Needed by the backend to create subscription items for RECURRING bumps.
   */
  orderBumpStripePriceId?: string

  // ========================================================================
  // FREE TRIAL CONFIGURATION
  // SOURCE OF TRUTH: PaymentTrialDays, PaymentOrderBumpTrialDays
  // ========================================================================

  /**
   * Free trial duration in days for the main price.
   * Cached from the selected price's trialDays field.
   * When > 0, the payment form shows trial info and uses confirmSetup()
   * instead of confirmPayment() (Stripe SetupIntent flow).
   * @default 0
   */
  trialDays?: number

  /**
   * Free trial duration in days for the order bump price.
   * Cached from the bump price's trialDays field.
   * Displayed as a trial badge on the bump checkbox in the payment form.
   * @default 0
   */
  orderBumpTrialDays?: number
}

/**
 * Button element - interactive button with text label.
 *
 * STORED IN: Redux (single source of truth)
 *
 * Buttons are styled interactive elements that combine a frame and text.
 * They have built-in hover states and can trigger actions on click.
 *
 * ============================================================================
 * BUTTON ARCHITECTURE - SETTINGS vs STYLES
 * ============================================================================
 *
 * SETTINGS (stored directly on element):
 * - `label`: The button text content
 * - `variant`: Visual variant that determines preset styling
 *
 * STYLES (stored in element.styles - CSS properties):
 * - fontFamily: Button text font
 * - fontSize: Button text size
 * - fontWeight: Button text weight
 * - backgroundColor, color, borderRadius, padding, etc.
 *
 * ============================================================================
 * BUTTON VARIANTS
 * ============================================================================
 *
 * Buttons support different visual variants:
 * - 'primary' - Main call-to-action, prominent styling
 * - 'secondary' - Secondary action, less prominent
 * - 'outline' - Bordered, transparent background
 * - 'ghost' - Minimal styling, background on hover only
 *
 * Each variant has predefined styles that can be overridden via element.styles.
 */

// ============================================================================
// BUTTON ACTION - SOURCE OF TRUTH
// ============================================================================
//
// Defines what happens when a button is clicked.
// Supports static links, dynamic CMS-driven links, popups, and scroll-to.
//
// ============================================================================

/**
 * Button action configuration.
 *
 * Determines the behavior when the button is clicked:
 * - 'none': No action (default)
 * - 'link': Navigate to a static URL
 * - 'dynamic-link': Navigate to a dynamic page using CMS row context
 * - 'popup': Show a popup/modal (future)
 * - 'scroll': Scroll to an element (future)
 */
export interface ButtonAction {
  /**
   * Type of action to perform on click.
   * SOURCE OF TRUTH: ButtonActionType, ButtonClickAction
   *
   * - 'none': No action (default)
   * - 'link': Navigate to a manually-entered URL
   * - 'page-link': Navigate to an internal website page (selected from pages list)
   * - 'dynamic-link': Navigate to a dynamic CMS page with row context
   * - 'one-click-upsell': Process a one-click upsell payment using a secure server-side token
   * - 'popup': Show a popup (future)
   * - 'scroll': Scroll to a section (future)
   */
  type: 'none' | 'link' | 'page-link' | 'dynamic-link' | 'one-click-upsell' | 'popup' | 'scroll'

  /** Static URL to navigate to (when type='link') */
  href?: string

  /**
   * Internal page ID for page linking (when type='page-link').
   * Stored so we can track the association even if the page slug changes.
   * SOURCE OF TRUTH: ButtonPageLink, InternalPageNavigation
   */
  pageId?: string

  /**
   * Page slug used for navigation (when type='page-link').
   * Auto-populated from the selected page's slug.
   */
  pageSlug?: string

  /**
   * Target page ID for dynamic links (when type='dynamic-link').
   * Stored so we can look up the fresh slug column from pageSlugColumns context.
   * SOURCE OF TRUTH: ButtonTargetPageId, DynamicButtonSlug
   */
  targetPageId?: string

  /**
   * Target page slug for dynamic links (when type='dynamic-link').
   * Combined with row identifier to build: basePath/{targetPageSlug}/{rowSlugOrId}
   */
  targetPageSlug?: string

  /**
   * CMS column slug for SEO-friendly dynamic button URLs.
   * When set, uses row.values[targetPageSlugColumn] instead of row.id.
   * Cached from the target page's cmsSlugColumnSlug when selected.
   *
   * SOURCE OF TRUTH: ButtonTargetPageSlugColumn, DynamicButtonSlug
   */
  targetPageSlugColumn?: string

  /** Whether to open link in new tab (when type='link', 'page-link', or 'dynamic-link') */
  openInNewTab?: boolean

  /** Element ID to scroll to (when type='scroll') - future */
  scrollTarget?: string

  // ========================================================================
  // ONE-CLICK UPSELL FIELDS (when type='one-click-upsell')
  // SOURCE OF TRUTH: ButtonUpsellAction, OneClickUpsell
  // ========================================================================

  /**
   * Product ID to charge as the upsell offer.
   * References a Product entity from the Products system.
   * The user selects this in the button settings panel.
   */
  upsellProductId?: string

  /**
   * Price ID for the upsell product.
   * Determines the exact price/billing tier to charge.
   */
  upsellPriceId?: string

  /**
   * Cached product name for display in the builder settings panel.
   * Avoids extra API calls when showing the selected product.
   */
  upsellProductName?: string

  /**
   * Cached price amount in cents for display in the builder.
   */
  upsellPriceAmount?: number

  /**
   * Cached currency for display in the builder.
   */
  upsellPriceCurrency?: string
}

export interface ButtonElement extends BaseElement {
  type: 'button'

  /**
   * Whether the button width should be based on content (padding + text).
   * When TRUE, the button ignores the fixed `width` and sizes itself.
   * When FALSE (default for backwards compat), uses the fixed `width`.
   */
  autoWidth?: boolean

  /**
   * Whether the button height should be based on content (padding + text).
   * When TRUE, the button ignores the fixed `height` and sizes itself.
   * When FALSE (default for backwards compat), uses the fixed `height`.
   */
  autoHeight?: boolean

  /**
   * Button label text.
   * Displayed centered within the button.
   * This is a SETTING, not a style - it's the data the element displays.
   */
  label: string

  /**
   * Visual variant - determines default styling.
   * This is a SETTING that affects how styles are computed.
   */
  variant: 'primary' | 'secondary' | 'outline' | 'ghost'

  // ========================================================================
  // ICON SETTINGS
  // ========================================================================

  /**
   * Icon name/identifier from the icon picker.
   * When set, renders an icon alongside the button label.
   */
  icon?: string

  /**
   * Position of the icon relative to the label.
   * 'before' = icon appears left of the label
   * 'after' = icon appears right of the label
   * @default 'before'
   */
  iconPosition?: 'before' | 'after'

  /**
   * Size of the icon in pixels.
   * @default 16
   */
  iconSize?: number

  // ========================================================================
  // ACTION CONFIGURATION
  // ========================================================================

  /**
   * Action to perform when the button is clicked.
   * Supports static links, dynamic CMS-driven links, popups, and scroll-to.
   * When action.type is 'link' or 'dynamic-link', button renders wrapped in a link.
   */
  action?: ButtonAction

  // ========================================================================
  // SEO / ACCESSIBILITY
  // ========================================================================

  /**
   * Accessible label for screen readers and SEO.
   * Applied as aria-label on the rendered button/link element.
   * When not set, the button's visible `label` text is used by assistive tech.
   *
   * SOURCE OF TRUTH: ButtonAriaLabel, AccessibleButtonLabel
   */
  ariaLabel?: string

  // ========================================================================
  // DEPRECATED: Typography properties moved to element.styles
  // ========================================================================
  // These are kept for backwards compatibility during migration.
  // New code should read typography from element.styles instead.
  // ========================================================================

  /**
   * @deprecated Use element.styles.fontFamily instead.
   * Font family for the button text.
   */
  fontFamily?: string

  /**
   * @deprecated Use element.styles.fontSize instead.
   * Font size for the button text.
   */
  fontSize?: number

  /**
   * @deprecated Use element.styles.fontWeight instead.
   * Font weight for the button text.
   */
  fontWeight?: number | string

  // ========================================================================
  // EFFECTS
  // ========================================================================

  /**
   * Fade edges effect - creates soft gradient fading at element edges.
   * Uses CSS mask-image to fade content toward the specified edges.
   */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /**
   * Fade edges height/intensity as percentage of element size (1-50).
   * Defaults to 10% if not specified.
   */
  fadeEdgesHeight?: number
}

// ============================================================================
// ADD TO CART BUTTON ELEMENT - E-commerce Cart Button
// ============================================================================
//
// SOURCE OF TRUTH: Add to Cart Button Element Type Definition
//
// An e-commerce button that adds the current CMS row's product to the cart.
// Uses the same styling system as regular buttons but has implicit functionality
// (no action configuration needed - it always adds to cart).
//
// REQUIREMENTS:
// - Must be inside a CMS context (SmartCMS List or Dynamic Page)
// - CMS table must be a store table (has stripe_price_id column)
// - Uses useCmsRowContext() to get current product data
//
// VISUAL BEHAVIOR:
// - Looks identical to a regular Button element
// - Can use all the same styling options (variant, fill, typography, etc.)
// - Shows error indicator when not in valid CMS context
//
// ============================================================================

/**
 * Add to Cart button element - adds current CMS row product to shopping cart.
 *
 * WHY SEPARATE FROM BUTTON?
 * - Button has action configuration (link, popup, scroll)
 * - Add to Cart has implicit action (always adds to cart)
 * - Different settings panel (no action config needed)
 * - Needs special error state when not in CMS context
 */
export interface AddToCartButtonElement extends BaseElement {
  type: 'add-to-cart-button'

  /**
   * Whether the button width should be based on content (padding + text).
   * When TRUE, the button ignores the fixed `width` and sizes itself.
   */
  autoWidth?: boolean

  /**
   * Whether the button height should be based on content (padding + text).
   * When TRUE, the button ignores the fixed `height` and sizes itself.
   */
  autoHeight?: boolean

  /**
   * Button label text.
   * Displayed centered within the button.
   * @default "Add to Cart"
   */
  label: string

  /**
   * Visual variant - determines default styling.
   * Same options as regular Button element.
   */
  variant: 'primary' | 'secondary' | 'outline' | 'ghost'

  // ========================================================================
  // ICON SETTINGS
  // ========================================================================

  /**
   * Icon name/identifier from the icon picker.
   * When set, renders an icon alongside the button label.
   */
  icon?: string

  /**
   * Position of the icon relative to the label.
   * 'before' = icon appears left of the label
   * 'after' = icon appears right of the label
   * @default 'before'
   */
  iconPosition?: 'before' | 'after'

  /**
   * Size of the icon in pixels.
   * @default 16
   */
  iconSize?: number

  // ========================================================================
  // EFFECTS
  // ========================================================================

  /**
   * Fade edges effect - creates soft gradient fading at element edges.
   * Uses CSS mask-image to fade content toward the specified edges.
   */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /**
   * Fade edges height/intensity as percentage of element size (1-50).
   * Defaults to 10% if not specified.
   */
  fadeEdgesHeight?: number

  // NO ACTION PROPERTY - functionality is implicit (always adds to cart)

  // ========================================================================
  // STANDALONE PRODUCT CONFIG (no CMS context required)
  // ========================================================================
  //
  // SOURCE OF TRUTH: Standalone Add-to-Cart Configuration Fields
  //
  // These fields enable the add-to-cart button to work WITHOUT a CMS context.
  // Users can pick a product + price from the settings panel, and these fields
  // store all the data needed to add the item to the cart on click.
  //
  // 3-TIER RESOLUTION:
  //   1. CMS context (SmartCMS list or dynamic page) — highest priority
  //   2. Standalone config (these fields) — used when no CMS context
  //   3. Disabled — neither CMS nor standalone configured
  // ========================================================================

  /** Stripe price ID for standalone mode — set via product picker in settings */
  standaloneStripePriceId?: string

  /** Product name for standalone mode — auto-populated when price is selected */
  standaloneProductName?: string

  /** Product image URL for standalone mode */
  standaloneProductImage?: string

  /** Price in cents for standalone mode */
  standalonePriceInCents?: number

  /** Currency code for standalone mode (e.g. 'usd') */
  standaloneCurrency?: string

  /** Billing type for standalone mode */
  standaloneBillingType?: 'ONE_TIME' | 'RECURRING'

  /** Billing interval for standalone recurring products */
  standaloneBillingInterval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

  /** Interval count for standalone recurring products */
  standaloneIntervalCount?: number

  /**
   * Free trial days for standalone mode.
   * SOURCE OF TRUTH: AddToCartStandaloneTrialDays
   * Cached from the selected price's trialDays so the cart knows about the trial.
   */
  standaloneTrialDays?: number

  /** Stored product ID — used to refetch product data in settings panel */
  standaloneProductId?: string

  // ========================================================================
  // STANDALONE INVENTORY CONFIG
  // ========================================================================
  //
  // SOURCE OF TRUTH: Standalone Add-to-Cart Inventory Fields
  //
  // Cached from the product when selected in settings panel.
  // Allows stock checking without CMS context.
  // ========================================================================

  /** Whether inventory tracking is enabled for this standalone product */
  standaloneTrackInventory?: boolean

  /** Current stock quantity for standalone product */
  standaloneInventoryQuantity?: number

  /** Whether backorders are allowed for standalone product */
  standaloneAllowBackorder?: boolean
}

// ============================================================================
// CHECKOUT ELEMENT - E-commerce Checkout Component
// ============================================================================
//
// SOURCE OF TRUTH: Checkout Element Type Definition, E-commerce Checkout, Cart Display
//
// A self-contained checkout element that displays cart contents and handles payment.
// This element reads from the Zustand cart store and integrates with Stripe for payments.
//
// KEY FEATURES:
// - Displays cart items from cart-store
// - Shows quantity controls (+/-)
// - Calculates and displays totals
// - Integrates Stripe payment form
// - Handles the complete checkout flow
//
// USAGE:
// - Place on a page designated as /checkout
// - Works automatically with Add to Cart buttons
// - No configuration required for basic functionality

/**
 * ============================================================================
 * CHECKOUT ELEMENT - Complete Checkout Experience
 * ============================================================================
 *
 * SOURCE OF TRUTH: Checkout Element in Website Builder
 *
 * This element provides a complete checkout experience including:
 * - Cart item display with images, names, prices
 * - Quantity adjustment controls
 * - Remove item functionality
 * - Subtotal and total calculations
 * - Stripe payment form integration
 * - Order confirmation
 *
 * The element is self-contained and handles all checkout logic automatically.
 */
export interface CheckoutElement extends BaseElement {
  type: 'checkout'

  /**
   * Whether to show the cart summary section.
   * @default true
   */
  showCartSummary?: boolean

  /**
   * Whether to allow quantity adjustments in the checkout.
   * @default true
   */
  allowQuantityChange?: boolean

  /**
   * Heading text for the cart section.
   * @default "Your Cart"
   */
  cartHeading?: string

  /**
   * Heading text for the payment section.
   * @default "Payment"
   */
  paymentHeading?: string

  /**
   * Text for the pay button.
   * @default "Complete Purchase"
   */
  payButtonText?: string

  /**
   * Message shown when cart is empty.
   * @default "Your cart is empty"
   */
  emptyCartMessage?: string

  // ========================================================================
  // THEME
  // SOURCE OF TRUTH: CheckoutElementTheme
  // ========================================================================

  /**
   * Theme for the checkout form appearance.
   * - 'dark': Dark background with light text (default)
   * - 'light': Light background with dark text
   * Matches PaymentElement theme for visual consistency.
   * @default 'dark'
   */
  theme?: 'light' | 'dark'

  // ========================================================================
  // AUTO SIZING
  // SOURCE OF TRUTH: CheckoutElementAutoSizing
  // ========================================================================

  /**
   * When TRUE, the checkout uses width: 100% instead of a fixed pixel width.
   * This makes the checkout responsive - it will fill the width of its container.
   * The width property acts as a max-width constraint.
   * @default false
   */
  autoWidth?: boolean

  /**
   * When TRUE, the checkout height adjusts automatically to fit its content.
   * Checkout elements should ALWAYS use autoHeight to prevent content from being cut off.
   * This is set to true by default and checkout elements are NOT height-resizable.
   * @default true
   */
  autoHeight?: boolean

  // ========================================================================
  // STRIPE MODE
  // SOURCE OF TRUTH: CheckoutElementTestMode
  // ========================================================================

  /**
   * When TRUE, uses Stripe TEST API keys for sandbox testing.
   * Accepts test cards like 4242 4242 4242 4242.
   *
   * When FALSE or undefined, uses LIVE Stripe keys via the connected account
   * and processes real payments.
   *
   * IMPORTANT: Test mode should be disabled before publishing
   * production websites to avoid failed real transactions.
   *
   * @default false (live mode)
   */
  testMode?: boolean

  // ========================================================================
  // EFFECTS
  // ========================================================================

  /**
   * Fade edges effect - creates soft gradient fading at element edges.
   */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /**
   * Fade edges height/intensity as percentage of element size (1-50).
   */
  fadeEdgesHeight?: number

  // ========================================================================
  // POST-PAYMENT REDIRECT
  // SOURCE OF TRUTH: PostPaymentRedirect for CheckoutElement
  // ========================================================================

  /**
   * When TRUE, redirects the user after a successful payment
   * instead of showing the inline success message.
   * @default false
   */
  successRedirectEnabled?: boolean

  /**
   * The type of redirect destination.
   * - 'page': A page within this website (uses slug from selectPageInfos)
   * - 'url': A custom external URL
   * @default 'page'
   */
  successRedirectType?: 'page' | 'url'

  /**
   * The slug of the target page within this website.
   * Used when successRedirectType is 'page'.
   * Same pattern as ButtonAction.targetPageSlug.
   */
  successRedirectPageSlug?: string

  /**
   * A custom external URL to redirect to after payment.
   * Used when successRedirectType is 'url'.
   */
  successRedirectUrl?: string

  /**
   * Whether to open the custom URL in a new tab.
   * Only applies when successRedirectType is 'url'.
   * Page redirects always stay in the same tab.
   * @default false
   */
  successRedirectNewTab?: boolean

  // ========================================================================
  // ORDER BUMP CONFIGURATION
  // SOURCE OF TRUTH: CheckoutOrderBumpProps
  // ========================================================================

  /** Whether order bump is enabled for this checkout element */
  orderBumpEnabled?: boolean

  /** The product ID for the bump offer */
  orderBumpProductId?: string

  /** The price ID for the bump offer */
  orderBumpPriceId?: string

  /** Custom label text for the order bump toggle */
  orderBumpLabel?: string

  /** Custom badge text above the order bump card */
  orderBumpBadgeText?: string

  /** Cached product name for display */
  orderBumpProductName?: string

  /** Cached price amount in cents for display */
  orderBumpPriceAmount?: number

  /** Cached currency code */
  orderBumpPriceCurrency?: string

  /** Billing type of the bump price (ONE_TIME or RECURRING) */
  orderBumpBillingType?: 'ONE_TIME' | 'RECURRING'

  /** Billing interval for RECURRING bumps */
  orderBumpBillingInterval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

  /** Interval count for RECURRING bumps */
  orderBumpIntervalCount?: number

  /** Stripe price ID for the bump */
  orderBumpStripePriceId?: string

  /** Trial days for the bump price */
  orderBumpTrialDays?: number
}

// ============================================================================
// CART ELEMENT - Shopping Cart Button (Opens Cart Sheet)
// ============================================================================
//
// SOURCE OF TRUTH: Cart Element Type Definition, E-commerce Cart Button
//
// A button element that opens the shopping cart sheet when clicked.
// Uses the same styling system as regular buttons but with automatic functionality.
//
// KEY FEATURES:
// - Icon-only by default (ShoppingCart icon)
// - User can optionally add label text
// - Clicking opens the cart sheet (no link/action configuration)
// - Same styling options as regular buttons (variant, colors, etc.)
//
// NO ACTION PROPERTY - functionality is automatic (always opens cart sheet)

/**
 * Cart element - a button that opens the shopping cart sheet when clicked.
 *
 * This is similar to ButtonElement but:
 * - Has no action/link configuration (always opens cart)
 * - Default to icon-only with ShoppingCart icon
 * - User can add label text if desired
 */
export interface CartElement extends BaseElement {
  type: 'cart'

  /**
   * Whether the button width should be based on content (padding + text/icon).
   * When TRUE, the button ignores the fixed `width` and sizes itself.
   */
  autoWidth?: boolean

  /**
   * Whether the button height should be based on content (padding + text/icon).
   * When TRUE, the button ignores the fixed `height` and sizes itself.
   */
  autoHeight?: boolean

  /**
   * Button label text (optional).
   * When empty, shows only the icon.
   * @default "" (icon-only)
   */
  label?: string

  /**
   * Visual variant - determines default styling.
   * Same options as regular Button element.
   */
  variant: 'primary' | 'secondary' | 'outline' | 'ghost'

  // ========================================================================
  // ICON SETTINGS
  // ========================================================================

  /**
   * Icon name/identifier from the icon picker.
   * @default "shopping-bag"
   */
  icon?: string

  /**
   * Position of the icon relative to the label.
   * 'before' = icon appears left of the label
   * 'after' = icon appears right of the label
   * @default 'before'
   */
  iconPosition?: 'before' | 'after'

  /**
   * Size of the icon in pixels.
   * @default 18
   */
  iconSize?: number

  // ========================================================================
  // EFFECTS
  // ========================================================================

  /**
   * Fade edges effect - creates soft gradient fading at element edges.
   */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /**
   * Fade edges height/intensity as percentage of element size (1-50).
   */
  fadeEdgesHeight?: number

  // NO ACTION PROPERTY - functionality is automatic (always opens cart sheet)
}

// ============================================================================
// ECOMMERCE CAROUSEL ELEMENT
// ============================================================================

/**
 * SOURCE OF TRUTH: CarouselNavigationStyle — Controls how users navigate between carousel images.
 *
 * - 'thumbnails': Default — thumbnail row below the featured image (original behavior)
 * - 'dots': Apple-style dot indicators overlaid at the bottom of the featured image
 *           (active dot is wider/pill-shaped, inactive dots are small circles)
 * - 'arrows': Left/right chevron arrow buttons overlaid on the featured image
 */
export type CarouselNavigationStyle = 'thumbnails' | 'dots' | 'arrows'

/**
 * SOURCE OF TRUTH: EcommerceCarouselElement — Product image gallery with featured image and navigation.
 *
 * Displays a large featured image with configurable navigation below/overlaid.
 * Users can add unlimited images and choose between thumbnail, dot, or arrow navigation.
 *
 * KEY FEATURES:
 * - Featured (hero) image on top
 * - 3 navigation variants: thumbnails (row below), dots (Apple-style overlay), arrows (chevron overlay)
 * - "Show More" toggle (thumbnails only): truncates with "+X more" based on available space
 * - Available space detection via ResizeObserver (not hardcoded)
 */
export interface EcommerceCarouselElement extends BaseElement {
  type: 'ecommerce-carousel'

  /** Array of images in the carousel — users can add unlimited images */
  images: Array<{ id: string; src: string; alt: string }>

  /** Index of the currently featured/selected image (shown large on top) */
  featuredIndex: number

  /** Object fit mode for the featured image */
  objectFit: 'cover' | 'contain' | 'fill'

  /** Navigation style variant — controls how users switch between images.
   *  Default: 'thumbnails' (backward compatible with existing elements). */
  navigationStyle: CarouselNavigationStyle

  /** Gap between thumbnail images in pixels (only applies to 'thumbnails' navigation) */
  thumbnailGap: number

  /** Size of each thumbnail (width and height) in pixels (only applies to 'thumbnails' navigation) */
  thumbnailSize: number

  /** Whether to truncate thumbnails and show "+X more" when they overflow.
   *  Default: false — shows all thumbnails with responsive wrapping.
   *  Only applies to 'thumbnails' navigation. */
  showMore: boolean

  /** Border radius applied to all images (featured + thumbnails) in pixels */
  imageBorderRadius: number

  /** Whether width auto-fills the parent container (100%) */
  autoWidth?: boolean
}

// ============================================================================
// LINK ELEMENT - Navigable Container Element
// ============================================================================
//
// SOURCE OF TRUTH: Link Element Type Definition
//
// A link element is like a frame that wraps its children in a navigable anchor.
// It behaves visually like a frame but provides navigation capability.
//
// USE CASES:
// - Clickable cards that link to another page
// - CMS list items that link to dynamic pages
// - Image galleries with linked thumbnails
//
// LINK TYPES:
// - 'static': Regular href URL (internal or external)
// - 'dynamic': Links to a dynamic page using CMS row context
//
// When 'dynamic' is selected and the Link is inside a SmartCMS List,
// it uses the current CMS row ID to build the dynamic URL:
// /domain/{targetPage.slug}/{currentRow.id}

/**
 * Link element - a frame-like container that acts as a navigation link.
 *
 * WHY NOT JUST USE BUTTON?
 * - Buttons are styled as... buttons (with backgrounds, padding, etc.)
 * - Links can wrap complex content like cards, images, or entire sections
 * - Links behave like frames in the editor (can contain children)
 *
 * SEMANTIC HTML:
 * - Renders as <a> or Next.js <Link> for proper accessibility
 * - Better SEO than onClick handlers
 */
export interface LinkElement extends BaseElement {
  type: 'link'

  // ========================================================================
  // LINK CONFIGURATION
  // ========================================================================

  /**
   * Link type - determines how the URL is resolved.
   * 'static': Uses href directly - for regular links
   * 'dynamic': Uses targetPageId + current CMS row context - for CMS-driven pages
   */
  linkType: 'static' | 'dynamic'

  /**
   * For static links: The URL to navigate to.
   * Can be internal (/about) or external (https://...)
   */
  href?: string

  /**
   * For dynamic links: The page ID of the dynamic template page.
   * When clicked, navigates to: /domain/{targetPage.slug}/{currentRow.id}
   * The currentRow comes from CmsRowContext (set by SmartCMS List).
   */
  targetPageId?: string

  /**
   * For dynamic links: The slug of the target page.
   * This is cached from the selected page for efficient URL building.
   * Updated when targetPageId changes in the properties panel.
   */
  targetPageSlug?: string

  /**
   * CMS column slug for SEO-friendly dynamic URLs.
   * When set, uses row.values[targetPageSlugColumn] instead of row.id in the URL.
   * Cached from the target page's cmsSlugColumnSlug when selected.
   *
   * SOURCE OF TRUTH: LinkTargetPageSlugColumn, DynamicLinkSlug
   */
  targetPageSlugColumn?: string

  /**
   * Whether to open the link in a new tab.
   * Applies to both static and dynamic links.
   */
  openInNewTab?: boolean

  // ========================================================================
  // SEO / ACCESSIBILITY
  // ========================================================================

  /**
   * Accessible label for screen readers and SEO.
   * Applied as aria-label on the rendered anchor/link element.
   * Helps search engines understand link purpose when children are non-text (images, icons).
   *
   * SOURCE OF TRUTH: LinkAriaLabel, AccessibleLinkLabel
   */
  ariaLabel?: string

  // ========================================================================
  // FRAME-LIKE PROPERTIES - Link behaves like a container
  // ========================================================================

  /**
   * Whether width should fill the parent container.
   * When TRUE, the link ignores fixed width and fills available space.
   */
  autoWidth?: boolean

  /**
   * Whether height should adjust based on content.
   * When TRUE, the link grows/shrinks to fit its children.
   */
  autoHeight?: boolean

  /**
   * Responsive mode - switches flex direction on smaller viewports.
   * Same behavior as frame's responsive property.
   */
  responsive?: boolean
}

/**
 * Default page properties for newly created pages.
 */
export const DEFAULT_PAGE_PROPS = {
  /** Standard desktop width */
  width: 1440,
  /** Starting height - can be extended by user */
  height: 900,
  visible: true,
  locked: false,
  /** Pages default to container ON for centered content */
  container: true,
} as const

/**
 * Default styles for newly created pages.
 * These go into the `styles` object.
 */
export const DEFAULT_PAGE_STYLES: ElementStyles = {
  backgroundColor: '#ffffff',
  flexDirection: 'column',
  gap: 0,
  padding: 0,
  margin: 0,
  borderRadius: 0,
}

/**
 * Default text element SETTINGS for newly created text elements.
 * These are element-specific configurations (not CSS).
 */
export const DEFAULT_TEXT_PROPS = {
  visible: true,
  locked: false,
  /** Text elements don't use container mode */
  container: false,
  /** Default text content for new elements */
  content: 'Text',
  /** Semantic HTML tag for SEO — controls how search engines interpret this text */
  htmlTag: 'p' as const,
  /** Height auto-adapts to content - text wraps and element grows */
  autoHeight: true,
  /** Width fills container - makes text responsive by default */
  autoWidth: false,
} as const

/**
 * Default STYLES for newly created text elements.
 * These go into the `styles` object and are CSS properties.
 *
 * INCLUDES TYPOGRAPHY: fontFamily, fontSize, fontWeight, lineHeight,
 * letterSpacing, textAlign are now here (not in props) since they're CSS.
 */
export const DEFAULT_TEXT_STYLES: ElementStyles = {
  // Typography (moved from props - these are CSS properties)
  /** Default to Inter - a popular, readable sans-serif font */
  fontFamily: 'Inter',
  /** Default font size - comfortable reading size */
  fontSize: 16,
  /** Normal weight */
  fontWeight: 400,
  /** Comfortable line height for readability */
  lineHeight: 1.5,
  /** No letter spacing by default */
  letterSpacing: 0,
  /** Left-aligned by default */
  textAlign: 'left',
  // Visual styles
  /** Default text color - dark gray for readability */
  color: 'white',
  /** Transparent background by default */
  backgroundColor: 'transparent',
  /** No padding by default */
  padding: 0,
  /** No border radius */
  borderRadius: 0,
}

/**
 * Default image element properties for newly created image elements.
 */
export const DEFAULT_IMAGE_PROPS = {
  /** Default width for new images */
  width: 300,
  /** Default height for new images */
  height: 200,
  visible: true,
  locked: false,
  /** Images don't use container mode */
  container: false,
  /** Default placeholder image from Unsplash */
  src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop',
  /** Default alt text */
  alt: 'Image',
  /** Default fit mode - cover fills the container */
  objectFit: 'cover' as const,
  /** Images use fixed width by default (not responsive) */
  autoWidth: false,
  /** Default color mask - regular shows original colors */
  colorMask: 'regular' as const,
} as const

/**
 * Default styles for newly created image elements.
 * These go into the `styles` object.
 */
export const DEFAULT_IMAGE_STYLES: ElementStyles = {
  /** No background color - image is the background */
  backgroundColor: 'transparent',
  /** Slight border radius for modern look */
  borderRadius: 8,
  /** No padding */
  padding: 0,
}

/**
 * Default video element properties for newly created video elements.
 */
export const DEFAULT_VIDEO_PROPS = {
  /** Default width for new videos */
  width: 480,
  /** Default height for new videos (16:9 aspect ratio) */
  height: 270,
  visible: true,
  locked: false,
  /** Videos don't use container mode */
  container: false,
  /** Default source type - storage for uploaded videos */
  sourceType: 'storage' as const,
  /** Empty src - user selects from storage */
  src: '',
  /** Empty poster - user can set custom thumbnail */
  poster: '',
  /** Empty loom URL */
  loomUrl: '',
  /** Default alt text */
  alt: 'Video',
  /** Default fit mode for VIDEO - contain fits inside (may have gaps) */
  objectFit: 'contain' as const,
  /** Default fit mode for THUMBNAIL/POSTER - cover fills container (may crop) */
  posterFit: 'cover' as const,
  /** Videos use fixed width by default (not responsive) */
  autoWidth: false,
  /** Show video controls by default */
  controls: true,
  /** Don't autoplay by default */
  autoplay: false,
  /** Don't loop by default */
  loop: false,
  /** Don't start muted by default */
  muted: false,
} as const

/**
 * Default styles for newly created video elements.
 * These go into the `styles` object.
 */
export const DEFAULT_VIDEO_STYLES: ElementStyles = {
  /** Dark background for video placeholder */
  backgroundColor: '#0a0a0a',
  /** Slight border radius for modern look */
  borderRadius: 8,
  /** No padding */
  padding: 0,
}

// ============================================================================
// FORM ELEMENT DEFAULTS
// ============================================================================

/**
 * Default form element SETTINGS for newly created form elements.
 * These are element-specific configurations (not CSS).
 */
export const DEFAULT_FORM_PROPS = {
  /** Default width for new form elements (used when on canvas root) */
  width: 480,
  /** Default height - ignored when autoHeight is true */
  height: 400,
  visible: true,
  locked: false,
  /** Forms don't use container mode */
  container: false,
  /** Empty formId - user selects from published forms */
  formId: '',
  /** Empty form name */
  formName: '',
  /** Empty form slug */
  formSlug: '',
  /** Forms use fixed width by default on canvas, auto width when inside frame */
  autoWidth: false,
  /** Forms ALWAYS use auto height to fit content - prevents content cutoff */
  autoHeight: true,
} as const

/**
 * Default styles for newly created form elements.
 * These go into the `styles` object.
 */
export const DEFAULT_FORM_STYLES: ElementStyles = {
  /** Transparent background - form has its own background */
  backgroundColor: 'transparent',
  /** Slight border radius for modern look */
  borderRadius: 8,
  /** No padding - form handles its own padding */
  padding: 0,
  /** Hidden overflow for clean edges */
  overflow: 'hidden',
}

/**
 * Default payment element SETTINGS for newly created payment elements.
 * These are element-specific configurations (not CSS).
 */
export const DEFAULT_PAYMENT_PROPS = {
  /** Default width for new payment elements (used when on canvas root) */
  width: 480,
  /** Default height - ignored when autoHeight is true */
  height: 500,
  visible: true,
  locked: false,
  /** Payment forms don't use container mode */
  container: false,
  /** Empty productId - user selects a product in Settings tab */
  productId: '',
  /** Empty priceId - user selects a price in Settings tab */
  priceId: '',
  /** Empty product name */
  productName: '',
  /** Empty price name */
  priceName: '',
  /** Payment forms use fixed width by default on canvas, auto width when inside frame */
  autoWidth: false,
  /** Payment forms ALWAYS use auto height to fit content - prevents content cutoff */
  autoHeight: true,
  /** Default theme - dark mode for consistent Stripe Elements styling */
  theme: 'dark' as const,
  /** Default trial days — 0 means no trial */
  trialDays: 0,
  /** Default order bump trial days — 0 means no trial */
  orderBumpTrialDays: 0,
} as const

/**
 * Default styles for newly created payment elements.
 * These go into the `styles` object.
 */
export const DEFAULT_PAYMENT_STYLES: ElementStyles = {
  /** Transparent background - payment form has its own background */
  backgroundColor: 'transparent',
  /** Slight border radius for modern look */
  borderRadius: 8,
  /** No padding - payment form handles its own padding */
  padding: 0,
  /** Hidden overflow for clean edges */
  overflow: 'hidden',
}

/**
 * Default button element SETTINGS for newly created button elements.
 * These are element-specific configurations (not CSS).
 */
export const DEFAULT_BUTTON_PROPS = {
  /**
   * Default width for new buttons - used as fallback when autoWidth is false.
   * The button will use this fixed width unless autoWidth is enabled.
   */
  width: 120,
  /**
   * Default height for new buttons - used as fallback when autoHeight is false.
   * The button will use this fixed height unless autoHeight is enabled.
   */
  height: 44,
  /**
   * Auto-size width based on content (padding + text).
   * When true, ignores the fixed width and sizes naturally.
   * Default to TRUE for new buttons so they fit their content.
   */
  autoWidth: true,
  /**
   * Auto-size height based on content (padding + text).
   * When true, ignores the fixed height and sizes naturally.
   * Default to TRUE for new buttons so they fit their content.
   */
  autoHeight: true,
  visible: true,
  locked: false,
  /** Buttons don't use container mode */
  container: false,
  /** Default button label - this is a SETTING (the data to display) */
  label: 'Button',
  /** Default to primary variant - this is a SETTING (affects styling logic) */
  variant: 'primary' as const,
} as const

/**
 * Default STYLES for newly created button elements.
 * These go into the `styles` object and are CSS properties.
 *
 * INCLUDES TYPOGRAPHY: fontFamily, fontSize, fontWeight are now here
 * (not in props) since they're CSS properties.
 *
 * NOTE: Button variants can override these styles.
 */
export const DEFAULT_BUTTON_STYLES: ElementStyles = {
  // Typography (moved from props - these are CSS properties)
  /** Default to Inter font */
  fontFamily: 'Inter',
  /** Default font size for buttons */
  fontSize: 14,
  /** Medium weight for readability */
  fontWeight: 500,
  // Visual styles
  /** Primary blue background */
  backgroundColor: '#3b82f6',
  /** White text for contrast */
  color: '#ffffff',
  /** Rounded corners for button feel */
  borderRadius: 8,
  /** Comfortable padding */
  padding: '12px 24px',
  /** Center text */
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
}

/**
 * Default properties for Add to Cart button element creation.
 *
 * SOURCE OF TRUTH: Add to Cart Button Default Props
 *
 * Used when creating a new Add to Cart button from the sidebar.
 * Reuses the same styles as regular buttons.
 */
export const DEFAULT_ADD_TO_CART_BUTTON_PROPS = {
  type: 'add-to-cart-button' as const,
  width: 140,
  height: 44,
  visible: true,
  locked: false,
  container: false,
  label: 'Add to Cart',
  variant: 'primary' as const,
  autoWidth: true,
  autoHeight: true,
} as const

/**
 * Default STYLES for Add to Cart button elements.
 * Reuses the same styles as regular buttons since they share the same appearance.
 *
 * SOURCE OF TRUTH: Add to Cart Button Styles
 */
export const DEFAULT_ADD_TO_CART_BUTTON_STYLES: ElementStyles = {
  // Typography
  fontFamily: 'Inter',
  fontSize: 14,
  fontWeight: 500,
  // Visual styles
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  borderRadius: 8,
  padding: '12px 24px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
}

/**
 * Default properties for Checkout elements.
 *
 * SOURCE OF TRUTH: Checkout Element Default Values
 *
 * The checkout element is a larger container that holds:
 * - Cart items display (right side)
 * - Payment form (left side)
 *
 * Uses a FIXED two-column layout that auto-wraps on mobile.
 * Like payment forms, checkout elements use auto height to fit content.
 * Width acts as max-width - element shrinks on smaller screens.
 */
export const DEFAULT_CHECKOUT_PROPS = {
  type: 'checkout' as const,
  /** Default width acts as max-width - element shrinks on smaller screens */
  width: 800,
  /** Default height - ignored when autoHeight is true */
  height: 600,
  visible: true,
  locked: false,
  container: false,
  /** Checkout forms use fixed width by default on canvas, auto width when inside frame */
  autoWidth: false,
  /** Checkout forms ALWAYS use auto height to fit content - prevents content cutoff */
  autoHeight: true,
  showCartSummary: true,
  allowQuantityChange: true,
  cartHeading: 'Your Cart',
  paymentHeading: 'Payment',
  payButtonText: 'Complete Purchase',
  emptyCartMessage: 'Your cart is empty',
  /** Default theme - dark mode for consistent styling with payment elements */
  theme: 'dark' as const,
} as const

/**
 * Default properties for Cart button elements.
 *
 * SOURCE OF TRUTH: Cart Element Default Values
 *
 * The cart element is a button that opens the cart sheet.
 * Default to icon-only with ShoppingCart icon, ghost variant for minimal styling.
 */
export const DEFAULT_CART_PROPS = {
  type: 'cart' as const,
  width: 44,
  height: 44,
  visible: true,
  locked: false,
  container: false,
  label: '', // Icon-only by default
  variant: 'ghost' as const,
  icon: 'shopping-bag',
  iconPosition: 'before' as const,
  iconSize: 20,
  autoWidth: true,
  autoHeight: true,
} as const

/**
 * Default STYLES for Cart button elements.
 * Uses ghost/minimal styling by default since it's typically placed in headers.
 *
 * SOURCE OF TRUTH: Cart Button Styles
 */
export const DEFAULT_CART_STYLES: ElementStyles = {
  // Typography (for when label is added)
  fontFamily: 'Inter',
  fontSize: 14,
  fontWeight: 500,
  // Visual styles - ghost variant defaults
  backgroundColor: 'transparent',
  color: '#374151',
  borderRadius: 8,
  padding: '10px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
}

// ============================================================================
// ECOMMERCE CAROUSEL ELEMENT DEFAULTS
// ============================================================================

/**
 * Default settings for newly created ecommerce carousel elements.
 * SOURCE OF TRUTH: EcommerceCarousel Default Properties
 */
export const DEFAULT_ECOMMERCE_CAROUSEL_PROPS = {
  /** Default width — wide enough to showcase product images */
  width: 480,
  /** Default height — tall enough for featured image + thumbnail row */
  height: 520,
  visible: true,
  locked: false,
  /** Not a container — self-contained element */
  container: false,
  /** Start with no images — user adds from settings */
  images: [] as Array<{ id: string; src: string; alt: string }>,
  /** First image is featured by default */
  featuredIndex: 0,
  /** Cover fills the featured image area nicely */
  objectFit: 'cover' as const,
  /** Default navigation style — classic thumbnail row below featured image */
  navigationStyle: 'thumbnails' as const,
  /** 8px gap between thumbnails */
  thumbnailGap: 8,
  /** 64px square thumbnails */
  thumbnailSize: 64,
  /** Show More OFF by default — all thumbnails visible with wrapping */
  showMore: false,
  /** Slight border radius for modern look */
  imageBorderRadius: 8,
  /** Auto width when inside a frame */
  autoWidth: false,
}

/**
 * Default CSS styles for ecommerce carousel elements.
 * SOURCE OF TRUTH: EcommerceCarousel Default Styles
 */
export const DEFAULT_ECOMMERCE_CAROUSEL_STYLES: ElementStyles = {
  /** Light background for the carousel container */
  backgroundColor: 'transparent',
  /** Slight border radius on the outer container */
  borderRadius: 8,
  /** No padding by default */
  padding: 0,
}

// ============================================================================
// RECEIPT ELEMENT DEFAULTS
// ============================================================================

/**
 * Default settings for newly created receipt elements.
 *
 * SOURCE OF TRUTH: Receipt Element Default Properties
 *
 * Receipt elements display payment receipt data at runtime based on URL params
 * (transactionId). They have no configurable settings — all data comes from
 * the transaction service.
 */
export const DEFAULT_RECEIPT_PROPS = {
  type: 'receipt' as const,
  /** Default width — wide enough for a professional receipt layout */
  width: 560,
  /** Default height — ignored when autoHeight is true */
  height: 400,
  visible: true,
  locked: false,
  /** Receipt is not a container — it renders its own content */
  container: false,
  /** Receipt uses fixed width by default on canvas, auto width when inside frame */
  autoWidth: false,
  /** Receipt ALWAYS uses auto height to fit content — prevents content cutoff */
  autoHeight: true,
  /** Default to dark theme — matches the PaymentReceipt design */
  theme: 'dark' as const,
} as const

/**
 * Default STYLES for newly created receipt elements.
 * These go into the `styles` object and are CSS properties.
 *
 * SOURCE OF TRUTH: Receipt Element Default Styles
 */
export const DEFAULT_RECEIPT_STYLES: ElementStyles = {
  /** Transparent background — the receipt component handles its own background */
  backgroundColor: 'transparent',
  /** Slight border radius for modern look */
  borderRadius: 8,
  /** No padding — receipt component handles its own internal spacing */
  padding: 0,
  /** Hidden overflow for clean edges */
  overflow: 'hidden',
}

// ============================================================================
// LOCAL COMPONENTS - User-created reusable components
// ============================================================================

/**
 * ============================================================================
 * COMPONENT INSTANCE ELEMENT - An instance of a Local Component on the canvas
 * ============================================================================
 *
 * Component instances are read-only references to a LocalComponent definition.
 * The internal structure (children) comes from the component definition and
 * CANNOT be edited directly. Users can only:
 *
 * 1. MOVE the component instance on the canvas
 * 2. RESIZE the component instance (if allowed)
 * 3. SET PROP VALUES through the Settings panel
 * 4. CONNECT CMS FIELDS to exposed props (future)
 *
 * ============================================================================
 * WHY NON-EDITABLE CHILDREN?
 * ============================================================================
 *
 * If users could edit children of component instances:
 * - Each instance would diverge from the source component
 * - Updating the component definition wouldn't propagate to instances
 * - The whole purpose of reusable components would be defeated
 *
 * Instead, we enforce that:
 * - The component definition (LocalComponent) is the source of truth
 * - Instances only store PROP VALUES (overrides for exposed properties)
 * - All instances render the same structure with different prop values
 * - Updating the component definition updates ALL instances
 *
 * ============================================================================
 * EDITING WORKFLOW
 * ============================================================================
 *
 * To edit a component's structure:
 * 1. Double-click the instance to enter "Edit Component" mode
 * 2. This opens the component definition for editing
 * 3. Changes are reflected in ALL instances across the website
 * 4. Exit edit mode to return to normal canvas editing
 *
 * ============================================================================
 */
export interface ComponentInstanceElement extends BaseElement {
  type: 'component'

  /**
   * Reference to the LocalComponent definition.
   * This ID links to the component in the website's component library.
   */
  componentId: string

  /**
   * Values for exposed properties (component props).
   *
   * Key: ExposedProp.id
   * Value: The value to use for this prop
   *
   * When rendering, the component looks up each exposed prop and
   * applies this value to the target element's property.
   *
   * Example:
   * {
   *   "card-title": "My Product",      // Text content
   *   "card-image": "https://...",     // Image source
   *   "card-price": "$99.99",          // Price text
   *   "button-link": "/buy-now"        // Button action
   * }
   */
  propValues: Record<string, unknown>

  /**
   * Prop values for NESTED component instances within this instance.
   *
   * When this instance contains nested component instances (composed components),
   * each nested instance can have its own prop values that are INDEPENDENT
   * from other instances of the same composed component.
   *
   * Key: Nested instance's sourceTree element ID (e.g., "card_123")
   * Value: PropValues for that specific nested instance
   *
   * Example: A carousel instance containing 3 card instances
   * {
   *   "card_123": { "title": "Product A", "price": "$99" },
   *   "card_456": { "title": "Product B", "price": "$149" },
   *   "card_789": { "title": "Product C", "price": "$199" }
   * }
   *
   * This allows:
   * - Carousel instance 1 to have different card content than carousel instance 2
   * - Each nested card to be customized independently per parent instance
   * - Composed components to be truly reusable with different nested content
   */
  nestedPropValues?: Record<string, Record<string, unknown>>

  /**
   * CMS bindings for dynamic data (future feature).
   *
   * Maps prop IDs to CMS table fields.
   * When rendering with CMS data, the CMS value replaces propValues.
   *
   * Example:
   * {
   *   "card-title": { tableId: "products", fieldId: "name" },
   *   "card-price": { tableId: "products", fieldId: "price" }
   * }
   */
  cmsBindings?: Record<string, CmsBinding>

  /**
   * CMS column bindings for dynamic page data injection.
   *
   * SOURCE OF TRUTH: CMS Column Bindings for Component Instances on Dynamic Pages
   *
   * When a component instance is placed on a dynamic page (page with cmsTableId),
   * exposed props can be bound to CMS columns. At render time, the CMS row
   * values are injected into the component based on these bindings.
   *
   * KEY: Exposed prop ID (from LocalComponent.exposedProps)
   * VALUE: CMS column slug (from the page's connected CMS table)
   *
   * Example:
   * {
   *   "card-title": "name",       // ExposedProp 'card-title' → CMS column 'name'
   *   "card-image": "image_url",  // ExposedProp 'card-image' → CMS column 'image_url'
   *   "card-price": "price"       // ExposedProp 'card-price' → CMS column 'price'
   * }
   *
   * RENDER FLOW:
   * 1. Dynamic page provides CMS row via CmsRowProvider
   * 2. ComponentInstanceRenderer reads row from useCmsRowContext()
   * 3. For each binding, resolve: propValues[propId] = row.values[columnSlug]
   * 4. These values override/merge with static propValues
   * 5. applyPropValuesToElements() receives the merged propValues
   *
   * DIFFERENCE FROM propBindings ON SMARTCMS LIST:
   * - SmartCMS List: iterates over MULTIPLE rows, binds for list rendering
   * - cmsColumnBindings: single row from dynamic page context
   */
  cmsColumnBindings?: Record<string, string>
}

/**
 * CMS field binding for dynamic data injection (future feature).
 *
 * When a component instance is rendered with CMS data:
 * 1. Look up the CMS binding for each prop
 * 2. Fetch the value from the specified table and field
 * 3. Apply it to the target element's property
 */
export interface CmsBinding {
  /** The CMS table ID to fetch data from */
  tableId: string

  /** The field ID within the table */
  fieldId: string
}

/**
 * ============================================================================
 * SMARTCMS LIST ELEMENT - Dynamic list rendering from CMS data
 * ============================================================================
 *
 * The SmartCMS List is a powerful element that connects to a CMS table and
 * renders a list of items dynamically. Each item is rendered using a
 * component instance as a template (the "source").
 *
 * ============================================================================
 * CORE CONCEPT: SLOT-BASED TEMPLATING
 * ============================================================================
 *
 * The SmartCMS List works like a slot-based system:
 *
 * 1. USER DROPS A COMPONENT INSTANCE INTO THE "SLOT"
 *    - Only component instances are allowed (not frames or master components)
 *    - This instance becomes the "source" or template
 *    - The component's exposed properties become available for CMS binding
 *
 * 2. USER CONNECTS A CMS TABLE
 *    - Select which CMS table to pull data from
 *    - Map exposed properties to CMS column slugs
 *
 * 3. RENDERING - For each row in the CMS table:
 *    - Clone the source component instance
 *    - Inject CMS values into the exposed properties
 *    - Render the cloned instance
 *
 * ============================================================================
 * WHY ONLY COMPONENT INSTANCES?
 * ============================================================================
 *
 * Component instances have EXPOSED PROPERTIES:
 * - User-defined customizable fields (title, image, price, link, etc.)
 * - These map directly to CMS columns
 * - Provides a clean interface between CMS data and rendered content
 *
 * Regular frames don't have exposed properties, so there's no way to
 * inject CMS data into their children without complex element traversal.
 *
 * ============================================================================
 * PAGINATION (FUTURE)
 * ============================================================================
 *
 * Built with pagination in mind:
 * - pageSize: Number of items per page
 * - pageIndex: Current page (0-indexed) - stored at runtime, not serialized
 * - totalItems: Derived from CMS row count
 *
 * This prevents rendering 1000+ items for large CMS tables.
 *
 * ============================================================================
 * FRAME-LIKE BEHAVIOR
 * ============================================================================
 *
 * SmartCMS List inherits frame behavior for layout:
 * - autoWidth: Fill container width
 * - flexDirection: row or column for item layout
 * - gap: Space between items
 * - flexWrap: Wrap items to next line
 *
 * Users have full control over the list's appearance.
 */
export interface SmartCmsListElement extends BaseElement {
  type: 'smartcms-list'

  // ========================================================================
  // SLOT CONFIGURATION - The source component to repeat
  // ========================================================================

  /**
   * The ID of the component instance used as the template.
   * This component's exposed properties will be populated with CMS data.
   *
   * CONSTRAINTS:
   * - Must be a component instance (type: 'component')
   * - Cannot be a master component (frame with masterOfComponentId)
   * - Cannot be a regular frame or other element type
   *
   * When null/undefined, the slot is empty and shows a placeholder UI
   * prompting the user to drop a component instance.
   */
  sourceInstanceId?: string

  /**
   * Reference to the LocalComponent definition used by the source instance.
   * Cached here for quick access to exposed properties during rendering.
   * This is derived from the source instance's componentId.
   */
  sourceComponentId?: string

  // ========================================================================
  // CMS CONNECTION - Which table and how to map data
  // ========================================================================

  /**
   * The CMS table ID to fetch data from.
   * When set, the list renders items from this table's rows.
   */
  cmsTableId?: string

  /**
   * Maps component exposed property IDs to CMS column slugs.
   *
   * Key: ExposedProp.id from the source component
   * Value: CMS column slug from the connected table
   *
   * Example: A product card component with exposed props:
   * {
   *   "card-title": "name",      // ExposedProp 'card-title' → CMS column 'name'
   *   "card-image": "image_url", // ExposedProp 'card-image' → CMS column 'image_url'
   *   "card-price": "price",     // ExposedProp 'card-price' → CMS column 'price'
   *   "card-link": "slug"        // ExposedProp 'card-link' → CMS column 'slug'
   * }
   *
   * During rendering, each CMS row's values are injected into the
   * component instance's propValues using this mapping.
   */
  propBindings?: Record<string, string>

  // ========================================================================
  // PAGINATION CONFIG - For handling large datasets with infinite scroll
  // ========================================================================

  /**
   * Number of items to load per "page" (batch) when scrolling.
   * Default: 10
   *
   * This controls how many items are fetched each time the user
   * scrolls to the edge of the list (infinite scroll trigger).
   *
   * Example: pageSize=10 means load 10 items initially,
   * then 10 more when user scrolls to edge, etc.
   */
  pageSize: number

  /**
   * Whether to show pagination controls when items exceed pageSize.
   * Default: true
   *
   * When false, only the first pageSize items are shown with no
   * way for users to navigate to more items.
   */
  showPagination: boolean

  // ========================================================================
  // RANGE CONFIG - Limit which rows can be fetched
  // ========================================================================

  /**
   * Enable infinite scroll pagination.
   * Default: true
   *
   * When true: As user scrolls to edge, more items are loaded automatically.
   * When false: Only the first pageSize items are shown (no scroll-to-load).
   *
   * IMPORTANT: Infinite scroll triggers based on flex direction:
   * - flexDirection: 'row' → triggers on horizontal scroll (left/right edge)
   * - flexDirection: 'column' → triggers on vertical scroll (top/bottom edge)
   */
  infiniteScroll?: boolean

  /**
   * Start of the range - only fetch rows with order >= rangeStart.
   * Default: undefined (no lower limit)
   *
   * Example: rangeStart=5 means skip rows 1-4, start from row 5.
   * Useful for "show items 5-20 only" scenarios.
   */
  rangeStart?: number

  /**
   * End of the range - only fetch rows with order <= rangeEnd.
   * Default: undefined (no upper limit)
   *
   * Example: rangeEnd=50 means never fetch beyond row 50,
   * even if table has 1000 rows. Pagination stops at row 50.
   *
   * PAGINATION + RANGE INTERACTION:
   * - pageSize=10, rangeStart=1, rangeEnd=20
   * - First load: rows 1-10
   * - Scroll triggers: rows 11-20
   * - No more loads after 20 (range limit reached)
   */
  rangeEnd?: number

  // ========================================================================
  // LAYOUT SETTINGS - Frame-like behavior for list appearance
  // ========================================================================

  /**
   * Whether the list fills its container width.
   * When true: width: 100%
   * When false: uses fixed width value
   */
  autoWidth?: boolean

  /**
   * Whether height adapts to content.
   * When true: height grows with number of items
   * When false: fixed height with overflow scroll
   */
  autoHeight?: boolean

  /**
   * Whether scrolling is enabled when content overflows.
   * When true: overflow is set to 'auto' allowing scroll
   * When false: overflow is 'hidden' (content clipped)
   *
   * NOTE: This uses the same property name as frames ('responsive') for
   * consistency with the properties panel UI which shows a "Scroll" toggle
   * that maps to the 'responsive' property.
   *
   * This works in conjunction with autoHeight:
   * - autoHeight: true + responsive: true = container grows, rarely scrolls
   * - autoHeight: false + responsive: true = fixed height, scrolls when content exceeds
   */
  responsive?: boolean

  // ========================================================================
  // AUTO-SCROLL ANIMATION — Infinite marquee-style scrolling
  // ========================================================================

  /**
   * Enable auto-scroll animation (infinite marquee loop).
   * When enabled, CMS list items scroll continuously in the chosen direction.
   * Items are visually duplicated (not in data) for seamless looping.
   *
   * REQUIREMENTS:
   * - autoHeight must be false (fixed height so content can overflow)
   * - Works best with flexDirection: 'row' for horizontal scrolling
   *
   * NOTE: Auto-scroll disables infinite scroll pagination — they conflict.
   */
  autoScroll?: boolean

  /** Auto-scroll speed in pixels per second. Default: 50 */
  autoScrollSpeed?: number

  /**
   * Direction of auto-scroll animation.
   * - 'left': Content scrolls from right to left (default)
   * - 'right': Content scrolls from left to right
   * - 'up': Content scrolls from bottom to top
   * - 'down': Content scrolls from top to bottom
   */
  autoScrollDirection?: 'left' | 'right' | 'up' | 'down'

  // ========================================================================
  // RESPONSIVE SMART GRID — Same behavior as FrameElement.smartGrid
  // ========================================================================

  /**
   * When TRUE, switches from flexbox to CSS Grid with auto-fill columns.
   * Children auto-arrange into optimal columns based on container width.
   * See FrameElement.smartGrid for full documentation.
   *
   * SOURCE OF TRUTH: SmartGrid, ResponsiveSmartGrid, smart-grid-layout
   */
  smartGrid?: boolean

  /**
   * Minimum width per grid column (pixels). Auto-set from first child's width.
   * See FrameElement.smartGridMinWidth for full documentation.
   * Default: 200
   */
  smartGridMinWidth?: number

  // ========================================================================
  // EMPTY STATE - What to show when no CMS data
  // ========================================================================

  /**
   * Message shown when CMS table is empty or not connected.
   * Helps users understand the list needs configuration.
   */
  emptyStateMessage?: string

  // ========================================================================
  // CLICK ACTION — Navigate to dynamic page or custom URL on item click
  // ========================================================================

  /**
   * Whether clicking a list item navigates to a page or URL.
   * When true, each rendered item becomes a clickable link in preview/published mode.
   * Canvas mode is unaffected (items remain selectable/draggable).
   */
  linkToDynamicPage?: boolean

  /**
   * The page ID of the target dynamic page.
   * When set, links are constructed as: /{targetPageSlug}/{rowSlugOrId}
   * When absent (custom URL mode), targetPageSlug is used as a raw href.
   *
   * SOURCE OF TRUTH: PageInfo.id from selectPageInfos — must reference
   * a page with cmsTableId set (dynamic page).
   */
  targetPageId?: string

  /**
   * The slug of the target dynamic page (cached for URL construction).
   * In page link mode: auto-set from the selected page's slug.
   * In custom URL mode: user-entered URL (e.g., "/products" or "https://...").
   */
  targetPageSlug?: string

  /**
   * The CMS column slug used for SEO-friendly URLs on the target dynamic page.
   * Cached from the target page's cmsSlugColumnSlug when a page is selected.
   * When set, URLs use row.values[targetPageSlugColumn] instead of row.id.
   * e.g., /blog/my-post-title instead of /blog/clx123abc
   *
   * SOURCE OF TRUTH: TargetPageSlugColumn, CmsListDynamicSlug
   */
  targetPageSlugColumn?: string

  /** Whether to open the link in a new browser tab */
  openInNewTab?: boolean
}

/**
 * Default properties for newly created SmartCMS List elements.
 */
export const DEFAULT_SMARTCMS_LIST_PROPS = {
  visible: true,
  locked: false,
  container: false,
  /** Default page size for pagination (items per batch) */
  pageSize: 10,
  /** Show pagination by default */
  showPagination: true,
  /** Enable infinite scroll by default */
  infiniteScroll: true,
  /** No range start limit by default (fetch from beginning) */
  rangeStart: undefined as number | undefined,
  /** No range end limit by default (fetch all available) */
  rangeEnd: undefined as number | undefined,
  /** Lists fill container width by default */
  autoWidth: true,
  /** Lists grow with content by default */
  autoHeight: true,
  /** Scroll disabled by default - content clipped */
  responsive: false,
  /** Auto-scroll animation disabled by default */
  autoScroll: false,
  /** Default auto-scroll speed (pixels per second) */
  autoScrollSpeed: 50,
  /** Default auto-scroll direction */
  autoScrollDirection: 'left' as const,
  /** Default empty state message */
  emptyStateMessage: 'No items to display. Connect a CMS table to get started.',
} as const

/**
 * Default styles for newly created SmartCMS List elements.
 * These frame-like styles control the list's appearance.
 */
export const DEFAULT_SMARTCMS_LIST_STYLES: ElementStyles = {
  /** Transparent background - inherits from parent */
  backgroundColor: 'transparent',
  /** Vertical list by default */
  flexDirection: 'column',
  /** Items aligned to start */
  alignItems: 'stretch',
  /** Space between items */
  gap: 16,
  /** Allow wrapping for grid-like layouts */
  flexWrap: 'wrap',
  /** No padding by default */
  padding: 0,
  /** Minimum height for empty state visibility */
  minHeight: 100,
}

/**
 * ============================================================================
 * EXPOSED PROP - A component property exposed for customization
 * ============================================================================
 *
 * When users create a component, they can "expose" properties of child
 * elements as component props. This allows each instance to have different
 * values for those properties.
 *
 * Example: A "Product Card" component might expose:
 * - The image element's `src` property as "Product Image"
 * - The title text element's `content` property as "Product Name"
 * - The price text element's `content` property as "Product Price"
 * - The button element's `action.href` property as "Buy Link"
 *
 * ============================================================================
 * PROPERTY REGISTRY INTEGRATION
 * ============================================================================
 *
 * Each exposed prop references a property from the PROPERTY_REGISTRY.
 * This ensures:
 * - Type safety: The value type matches the property type
 * - Validation: Values can be validated against property constraints
 * - UI: The correct input control is rendered in the Settings panel
 * - CMS: Only compatible CMS fields can be connected
 */
export interface ExposedProp {
  /**
   * Unique identifier for this exposed prop.
   * Used as the key in ComponentInstanceElement.propValues.
   */
  id: string

  /**
   * Human-readable name for this prop.
   * Shown in the Settings panel when editing an instance.
   *
   * Example: "Product Image", "Card Title", "Buy Button Link"
   */
  name: string

  /**
   * Optional description/help text for this prop.
   */
  description?: string

  /**
   * The element ID within the component that this prop affects.
   * References an element in LocalComponent.sourceTree.
   */
  elementId: string

  /**
   * The property ID from PROPERTY_REGISTRY.
   * Example: 'src', 'content', 'styles.backgroundColor', 'action.href'
   */
  propertyId: string

  /**
   * Dot-notation path to the value on the element.
   * Copied from PropertySchema for convenience.
   */
  propertyPath: string

  /**
   * Default value when propValues doesn't have a value.
   * Usually inherited from the source element's current value.
   */
  defaultValue: unknown
}

/**
 * ============================================================================
 * LOCAL COMPONENT - A user-created reusable component definition
 * ============================================================================
 *
 * Local Components are saved at the WEBSITE level (not page, not domain).
 * They can be used on any page within the same website.
 *
 * ============================================================================
 * LIFECYCLE
 * ============================================================================
 *
 * 1. CREATION:
 *    - User selects a frame element on the canvas
 *    - Clicks "Convert to Component" in Settings panel
 *    - Frame + all children become a LocalComponent
 *    - The frame is replaced with a ComponentInstanceElement
 *
 * 2. EDITING:
 *    - User double-clicks a component instance
 *    - Enters "Edit Component" mode
 *    - Edits the component definition directly
 *    - Changes propagate to ALL instances
 *
 * 3. USAGE:
 *    - User drags component from sidebar onto canvas
 *    - Creates a new ComponentInstanceElement
 *    - User sets prop values in Settings panel
 *
 * 4. CMS INTEGRATION (future):
 *    - User connects a CMS table to the component
 *    - Maps CMS fields to exposed props
 *    - Component renders with dynamic CMS data
 *
 * ============================================================================
 * SOURCE TREE vs INSTANCES
 * ============================================================================
 *
 * - sourceTree: The canonical component structure (elements + relationships)
 * - instances: Array of ComponentInstanceElement IDs using this component
 *
 * When sourceTree changes, we DON'T update instance elements directly.
 * Instead, instances re-render by fetching the latest sourceTree and
 * applying their propValues to get the final rendered elements.
 */
export interface LocalComponent {
  /**
   * Unique identifier for this component.
   * Format: 'comp_[timestamp]_[random]'
   */
  id: string

  /**
   * Human-readable component name.
   * Shown in the sidebar component list.
   */
  name: string

  /**
   * Optional description explaining the component's purpose.
   */
  description?: string

  /**
   * Tags for categorization and search.
   * Example: ['card', 'product', 'e-commerce']
   */
  tags: string[]

  /**
   * The website this component belongs to.
   * Components are scoped to a single website.
   */
  websiteId: string

  /**
   * Timestamp when component was created.
   */
  createdAt: number

  /**
   * Timestamp when component was last modified.
   */
  updatedAt: number

  /**
   * ============================================================================
   * SOURCE TREE - The component's element structure
   * ============================================================================
   *
   * Contains the canonical definition of the component:
   * - rootElement: The top-level frame (the component itself)
   * - childElements: All descendant elements
   * - childrenMap: Parent-child relationships (O(1) lookup)
   *
   * This structure is used to render component instances.
   * When rendering an instance, we:
   * 1. Clone the sourceTree elements
   * 2. Apply propValues to override exposed properties
   * 3. Render the modified elements
   */
  sourceTree: {
    /** The root frame element that was converted to a component */
    rootElement: CanvasElement

    /** All descendant elements (children, grandchildren, etc.) */
    childElements: CanvasElement[]

    /** Parent ID -> Child IDs mapping for O(1) children lookup */
    childrenMap: Record<string, string[]>
  }

  /**
   * Properties exposed for customization.
   * Users can set values for these props on each instance.
   */
  exposedProps: ExposedProp[]

  /**
   * Array of ComponentInstanceElement IDs using this component.
   * Used to find all instances when the component is updated.
   */
  instanceIds: string[]

  /**
   * ============================================================================
   * PRIMARY INSTANCE ID - The "Master" Instance
   * ============================================================================
   *
   * The ID of the first instance created when the component was created.
   * This is the instance that replaced the original frame during conversion.
   *
   * MASTER vs INSTANCE:
   * - Primary instance (primaryInstanceId): The "master" - created during conversion
   * - Other instances: Dragged from sidebar, reference the master
   *
   * WHY THIS MATTERS:
   * 1. In the future, editing the primary instance could enter "Edit Component Mode"
   * 2. Detaching the primary instance requires special handling
   * 3. UI shows different controls for primary vs regular instances
   *
   * NOTE: The actual component definition (sourceTree) lives in LocalComponent.
   * The primary instance is just the first canvas element that references it.
   */
  primaryInstanceId: string

  /**
   * Base64-encoded thumbnail for sidebar preview.
   * Generated from a screenshot of the component.
   */
  thumbnailDataUrl?: string

  /**
   * ============================================================================
   * SKELETON LOADING STYLES - Theme-aware loading placeholders
   * ============================================================================
   *
   * When this component is used in a SmartCMS List, skeleton loading placeholders
   * are shown while data is being fetched. These styles allow the skeleton to
   * match the component's visual theme perfectly.
   *
   * TWO-TONE SYSTEM:
   * - primaryColor: The main skeleton background (e.g., card background shade)
   * - accentColor: Lighter shade for content placeholders (e.g., text/image areas)
   *
   * EXAMPLE:
   * For a dark card with light text:
   * - primaryColor: '#2a2a2a' (dark background for the card skeleton)
   * - accentColor: '#3a3a3a' (slightly lighter for text line placeholders)
   *
   * For a light card with dark text:
   * - primaryColor: '#f0f0f0' (light background for the card skeleton)
   * - accentColor: '#e0e0e0' (slightly darker for text line placeholders)
   */
  skeletonStyles?: {
    /**
     * Primary skeleton color - used for container/card backgrounds.
     * This should match or complement the component's main background color.
     * Default: 'rgba(6, 182, 212, 0.08)' (subtle cyan tint)
     */
    primaryColor?: string

    /**
     * Accent skeleton color - used for content placeholders (text lines, images).
     * Should be a contrasting shade that's visible against the primary color.
     * Default: 'rgba(6, 182, 212, 0.15)' (slightly brighter cyan tint)
     */
    accentColor?: string
  }

  /**
   * ============================================================================
   * LOADING SKELETON COMPONENT - Custom loading placeholder
   * ============================================================================
   *
   * Optional ID of another LocalComponent to render as a loading skeleton.
   * When this component is used in a SmartCMS List and data is loading,
   * the skeleton component will be displayed instead of a generic spinner.
   *
   * BENEFITS:
   * - Create beautiful, branded loading states
   * - Match loading appearance to actual component layout
   * - No layout shift - skeleton has same dimensions as real component
   *
   * FALLBACK:
   * If not set, a minimal centered spinner is shown during loading.
   */
  loadingSkeletonComponentId?: string
}

/**
 * Default skeleton styles for components without custom configuration.
 * Uses a subtle cyan tint that works on most backgrounds.
 */
export const DEFAULT_SKELETON_STYLES = {
  primaryColor: 'rgba(6, 182, 212, 0.08)',
  accentColor: 'rgba(6, 182, 212, 0.15)',
} as const

/**
 * Default properties for newly created component instances.
 */
export const DEFAULT_COMPONENT_INSTANCE_PROPS = {
  visible: true,
  locked: false,
  container: false,
} as const

// ============================================================================
// FAQ ELEMENT - SOURCE OF TRUTH
// ============================================================================
//
// Expandable question-and-answer accordion element.
// Renders a list of FAQ items with smooth open/close animations.
// Supports single-open or multi-open behavior.
//
// SOURCE OF TRUTH: FaqItem, FaqElement, faq-element, faq-accordion
// ============================================================================

/**
 * A single FAQ question-answer pair.
 *
 * SOURCE OF TRUTH: FaqItem, faq-item-data
 */
export interface FaqItem {
  /** Unique identifier for this FAQ item */
  id: string

  /** The question text displayed in the header */
  question: string

  /** The answer text displayed when expanded */
  answer: string
}

/**
 * FAQ accordion element — expandable Q&A sections.
 *
 * SOURCE OF TRUTH: FaqElement, faq-element-interface
 *
 * Renders a vertical list of collapsible question/answer pairs.
 * Designed with a minimal, Apple-like aesthetic: clean typography,
 * subtle dividers, and smooth height animations.
 *
 * CMS CONNECTIVITY:
 * - `items` can be exposed as a component prop for CMS injection
 * - Individual item questions/answers are exposable for dynamic content
 *
 * BEHAVIOR:
 * - `allowMultipleOpen`: Controls whether multiple items can be open
 * - Items track their own expanded state via the component (not stored on element)
 */
export interface FaqElement extends BaseElement {
  type: 'faq'

  /** The list of question/answer pairs */
  items: FaqItem[]

  /**
   * Whether multiple FAQ items can be open simultaneously.
   * When false (default), opening one item closes others — classic accordion.
   */
  allowMultipleOpen?: boolean

  /** Whether the element width fits its parent container */
  autoWidth?: boolean

  /** Whether the element height adjusts to content */
  autoHeight?: boolean

  /**
   * Visual separator style between FAQ items.
   * - 'line': Thin divider line between items (default)
   * - 'none': No visual separator
   * - 'card': Each item rendered as a separate card
   */
  separatorStyle?: 'line' | 'none' | 'card'

  /**
   * Icon style for the expand/collapse indicator.
   * - 'chevron': Down/up chevron arrow (default)
   * - 'plus': Plus/minus toggle
   * - 'none': No icon
   */
  iconStyle?: 'chevron' | 'plus' | 'none'
}

// ============================================================================
// STICKY NOTE ELEMENT - SOURCE OF TRUTH
// ============================================================================
//
// A decorative sticky note element with realistic paper appearance, corner curl,
// and gradient shadow. Contains editable text (double-click to edit on canvas,
// same pattern as TextElement).
//
// SOURCE OF TRUTH: StickyNoteElement, sticky-note-element, sticky-note-type
// ============================================================================

/**
 * Sticky note element — realistic post-it note with editable text.
 *
 * SOURCE OF TRUTH: StickyNoteElement, sticky-note-element-interface
 *
 * VISUAL DESIGN (CSS-only):
 * - Solid color body with subtle gradient for paper feel
 * - Bottom-right corner curl via CSS border-triangle trick
 * - Multi-layer box-shadow for realistic lighting/depth
 *
 * TEXT EDITING:
 * - Double-click to enter inline edit mode (same pattern as TextElement)
 * - Shares isEditing/setIsEditing via useUnifiedStickyNoteMeta hook
 * - contentEditable when editing, static display otherwise
 */
export interface StickyNoteElement extends BaseElement {
  type: 'sticky-note'

  /** The text content displayed on the sticky note */
  content: string

  /** Background color of the sticky note (default: '#fef08a' warm yellow) */
  noteColor?: string

  /** Text color on the sticky note (default: '#1a1a1a' near-black) */
  textColor?: string

  /** Whether the element height adjusts to content */
  autoHeight?: boolean

  /** Whether the element width fills its parent container */
  autoWidth?: boolean
}

/**
 * Default properties for newly created sticky note elements.
 * SOURCE OF TRUTH: StickyNote Default Properties
 */
export const DEFAULT_STICKY_NOTE_PROPS = {
  width: 240,
  height: 240,
  visible: true,
  locked: false,
  container: false,
  content: 'Click to edit...',
  noteColor: '#fef08a',
  textColor: '#1a1a1a',
  autoHeight: false,
  autoWidth: false,
} as const

/**
 * Default CSS styles for sticky note elements.
 * SOURCE OF TRUTH: StickyNote Default Styles
 */
export const DEFAULT_STICKY_NOTE_STYLES: ElementStyles = {
  fontFamily: 'Inter',
  fontSize: 22,
  fontWeight: 500,
  lineHeight: 1.4,
  padding: '28px',
}

// ============================================================================
// RICH TEXT ELEMENT
// ============================================================================

/**
 * Rich text element powered by the Lexical editor.
 * Provides full rich text editing (headings, lists, links, code blocks, images)
 * in a transparent, content-focused element.
 *
 * SOURCE OF TRUTH: RichTextElement Type Definition
 *
 * ARCHITECTURE:
 * - `content` stores serialized Lexical JSON (same format as RichTextEditor)
 * - `editorVariant` controls which Lexical features are available
 * - Canvas: double-click to enter editing mode (same pattern as sticky-note)
 * - Preview: renders read-only with full formatting fidelity
 * - CMS binding: `content` is exposable for SmartCMS RICH_TEXT columns
 */
export interface RichTextElement extends BaseElement {
  type: 'rich-text'

  /**
   * Serialized Lexical JSON string containing the rich text content.
   * Empty string = no content (shows placeholder).
   * This is a SETTING (exposable for CMS binding), not a style.
   */
  content: string

  /**
   * Controls which Lexical editor features are available.
   * - 'minimal': Basic formatting only (bold, italic, underline)
   * - 'standard': Full formatting, lists, headings, links, code blocks
   * - 'full': Everything including image upload, slash commands
   * Default: 'standard'
   */
  editorVariant?: 'minimal' | 'standard' | 'full'

  /**
   * When TRUE, width fills parent container (100%).
   * When FALSE, uses fixed pixel width from `element.width`.
   */
  autoWidth?: boolean

  /**
   * When TRUE, height adjusts automatically to fit content.
   * When FALSE, uses fixed pixel height from `element.height`.
   * Default: true (rich text should grow with content)
   */
  autoHeight?: boolean
}

/**
 * Default properties for newly created rich text elements.
 * SOURCE OF TRUTH: RichText Default Properties
 */
export const DEFAULT_RICH_TEXT_PROPS = {
  width: 400,
  height: 200,
  visible: true,
  locked: false,
  container: false,
  content: '',
  editorVariant: 'standard' as const,
  autoWidth: false,
  autoHeight: true,
} as const

/**
 * Default CSS styles for rich text elements.
 * Transparent background, inherits color from parent context.
 * SOURCE OF TRUTH: RichText Default Styles
 */
export const DEFAULT_RICH_TEXT_STYLES: ElementStyles = {
  backgroundColor: 'transparent',
  color: 'inherit',
  padding: '8px',
}

// ============================================================================
// PENCIL ELEMENT - SOURCE OF TRUTH
// ============================================================================
//
// Freehand drawing element that stores an SVG path from pointer input.
// Uses Catmull-Rom spline interpolation for smooth curves.
// The SVG viewBox scales proportionally when the element is resized.
//
// SOURCE OF TRUTH: PencilElement, pencil-freehand-drawing, pencil-element-type
// ============================================================================

/**
 * A single stroke within a multi-stroke pencil element.
 * Each stroke carries its own path data, color, and width so
 * multi-stroke drawings can combine different brush settings.
 *
 * SOURCE OF TRUTH: PencilStroke, pencil-stroke-type, multi-stroke-drawing
 */
export interface PencilStroke {
  /** SVG path `d` attribute — cubic bezier curves from Catmull-Rom interpolation */
  pathData: string
  /** Stroke color (hex string, e.g. '#ef4444') */
  strokeColor: string
  /** Stroke width in pixels at the original viewBox scale */
  strokeWidth: number
  /** Stroke opacity (0–1, defaults to 1 if omitted for backwards compat) */
  strokeOpacity?: number
}

/**
 * Pencil element for freehand drawing on the canvas.
 * Supports multi-stroke drawings where each stroke can have independent
 * color and brush size, combined into a single element via Shift+draw.
 *
 * SOURCE OF TRUTH: PencilElement Type Definition, pencil-freehand-drawing
 *
 * ARCHITECTURE:
 * - `strokes[]` stores an array of SVG path strings with per-stroke color/width
 * - Coordinates in each pathData are NORMALIZED to 0,0 origin (relative to element position)
 * - `viewBoxWidth`/`viewBoxHeight` are the global bounding box encompassing ALL strokes
 * - SVG viewBox uses "0 0 viewBoxWidth viewBoxHeight" so all paths scale on resize
 * - `preserveAspectRatio="none"` allows free-stretch resizing
 */
export interface PencilElement extends BaseElement {
  type: 'pencil'

  /** Array of strokes — each with its own pathData, color, and width.
   *  Coordinates in each pathData are NORMALIZED to 0,0 origin
   *  (relative to the element's global bounding box). */
  strokes: PencilStroke[]

  /** Original width of the global bounding box at creation (SVG viewBox width) */
  viewBoxWidth: number

  /** Original height of the global bounding box at creation (SVG viewBox height) */
  viewBoxHeight: number

  /** Fill color for enclosed areas (default 'none' for strokes only) */
  fillColor: string

  /** SVG stroke-linecap for line end style */
  lineCap: 'round' | 'butt' | 'square'

  /** SVG stroke-linejoin for corner style */
  lineJoin: 'round' | 'bevel' | 'miter'

  /** Whether height auto-adjusts to content */
  autoHeight?: boolean

  /** Whether width fills parent container (w-fill) */
  autoWidth?: boolean
}

// ============================================================================
// LIST ELEMENT - SOURCE OF TRUTH
// ============================================================================
//
// A bulleted list element with configurable icons from the shared icon library
// (same as buttons). Each list item has an icon bullet and text content.
// Users can add items by pressing Enter in the last item.
//
// SOURCE OF TRUTH: ListElement, list-element, list-element-type
// ============================================================================

/**
 * Single item in a list element.
 *
 * SOURCE OF TRUTH: ListItem, list-item-type
 */
export interface ListItem {
  /** Unique identifier for the list item */
  id: string
  /** Text content of the list item */
  text: string
}

/**
 * List element — a bulleted list with configurable icon bullets.
 *
 * SOURCE OF TRUTH: ListElement, list-element-interface
 *
 * Uses the SAME icon library as buttons (IconRenderer from @/lib/icons).
 * The icon set in settings applies to ALL list item bullets uniformly.
 * Users press Enter on the last item to create a new list item.
 */
export interface ListElement extends BaseElement {
  type: 'list'

  /** The list items to render */
  items: ListItem[]

  /**
   * Icon name from the shared icon library (same as button icons).
   * Applied as the bullet for every list item.
   * @default 'Check'
   */
  icon: string

  /**
   * Size of the bullet icon in pixels.
   * @default 16
   */
  iconSize?: number

  /**
   * Color of the bullet icon.
   * @default 'currentColor' (inherits text color)
   */
  iconColor?: string

  /** Whether the element width fills its parent container */
  autoWidth?: boolean

  /** Whether the element height adjusts to content */
  autoHeight?: boolean

  /**
   * Gap between list items in pixels.
   * @default 8
   */
  itemGap?: number
}

/**
 * Default properties for newly created pencil elements.
 * SOURCE OF TRUTH: Pencil Default Properties
 */
export const DEFAULT_PENCIL_PROPS = {
  visible: true,
  locked: false,
  container: false,
  fillColor: 'none',
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
  autoHeight: false,
  autoWidth: false,
} as const

/**
 * Default CSS styles for pencil elements.
 * Pencil elements are pure SVG rendering, minimal CSS needed.
 * SOURCE OF TRUTH: Pencil Default Styles
 */
export const DEFAULT_PENCIL_STYLES: ElementStyles = {}

/**
 * Minimum bounding box size for a pencil drawing to be committed.
 * Prevents accidental tiny dots from becoming elements.
 */
export const MIN_PENCIL_CREATION_SIZE = 5

/**
 * Union of all element types.
 *
 * STORED IN: Redux store elements Map
 *
 * Add new element interfaces here as they're created.
 *
 * NOTE: PreBuiltElement is imported from ./prebuilt and includes all
 * PreBuilt element types (navbar, hero, footer, etc.)
 *
 * NOTE: ComponentInstanceElement is for user-created Local Components.
 * These reference a LocalComponent definition and have non-editable children.
 */
export type CanvasElement =
  | FrameElement
  | PageElement
  | TextElement
  | ImageElement
  | VideoElement
  | FormElement
  | PaymentElement
  | ButtonElement
  | AddToCartButtonElement
  | CheckoutElement
  | CartElement
  | EcommerceCarouselElement
  | FaqElement
  | StickyNoteElement
  | ComponentInstanceElement
  | SmartCmsListElement
  | TimerElement
  | LinkElement
  | ReceiptElement
  | RichTextElement
  | PencilElement
  | ListElement
  | import('./prebuilt').PreBuiltElement

// ============================================================================
// REDUX STATE STRUCTURES
// ============================================================================

/**
 * Main canvas state - SINGLE SOURCE OF TRUTH for all element data.
 *
 * STORED IN: Redux store
 * SERIALIZABLE: Yes - can be converted to JSON for database storage
 *
 * Design choices for O(1) performance:
 * - `elements`: Record (object) for O(1) lookup by ID
 * - `rootIds`: Array of top-level element IDs in render order
 * - `childrenMap`: Parent ID -> Child IDs for O(1) children lookup
 *
 * WHY Record instead of Map?
 * - Redux requires serializable state
 * - Maps are not JSON serializable
 * - Records (plain objects) work with Redux DevTools
 */
export interface CanvasState {
  /**
   * All elements indexed by ID - O(1) lookup.
   * This is the SINGLE SOURCE OF TRUTH for element data.
   */
  elements: Record<string, CanvasElement>

  /**
   * IDs of root-level elements (parentId === null) in render order.
   * Maintained separately for fast iteration of top-level elements.
   */
  rootIds: string[]

  /**
   * Parent ID -> Child IDs mapping for O(1) children lookup.
   * Key '__root__' contains IDs of root-level elements.
   * Updated automatically when elements are added/moved/deleted.
   */
  childrenMap: Record<string, string[]>
}

/**
 * Viewport state - pan and zoom.
 *
 * STORED IN: Redux (changes on user input, OK to re-render)
 *
 * ============================================================================
 * CLIENT-SIDE CENTERING - USES ACTUAL VIEWPORT DIMENSIONS
 * ============================================================================
 *
 * Initial viewport values are defaults (panX: 0, panY: 0, zoom: 1).
 * The Canvas component handles centering on mount by:
 * 1. Measuring the actual visible canvas area
 * 2. Finding the page element
 * 3. Calculating pan/zoom to fit the page with padding
 *
 * This approach ensures the page is properly centered regardless of
 * the user's screen size, which cannot be known server-side.
 *
 * Note: During smooth pan/zoom animations, consider using refs
 * and committing to Redux when animation completes.
 */
export interface ViewportState {
  /** Horizontal pan offset in screen pixels */
  panX: number

  /** Vertical pan offset in screen pixels */
  panY: number

  /**
   * Zoom level multiplier.
   * 1 = 100%, 0.5 = 50%, 2 = 200%
   * Range: 0.25 to 3 (25% to 300%)
   */
  zoom: number
}

/**
 * Selection state - currently selected element(s).
 *
 * STORED IN: Redux (changes on click, OK to re-render)
 *
 * Supports both single and multi-selection:
 * - Single click: selects one element
 * - Shift+click: adds/removes from selection
 * - Marquee drag: selects all elements in rectangle
 */
export interface SelectionState {
  /** Array of selected element IDs (empty = nothing selected) */
  selectedIds: string[]
}

/**
 * Complete Redux store state shape.
 *
 * This is what gets persisted to database and restored on load.
 */
export interface BuilderState {
  canvas: CanvasState
  viewport: ViewportState
  selection: SelectionState
  toolMode: ToolMode
}

// ============================================================================
// REF-BASED INTERACTION STATES
// ============================================================================
// These types are for data stored in REFS, NOT Redux.
// They update at 60fps during interactions and should NEVER be in Redux.
// ============================================================================

/**
 * Individual element data during a group drag operation.
 * Each element in a group drag maintains its own position offset.
 */
export interface DraggedElementData {
  /** Element ID */
  id: string

  /**
   * Offset from the PRIMARY element's position.
   * Used to maintain relative positions during group drag.
   */
  offsetFromPrimary: Point

  /** Original parent ID before drag started */
  originalParentId: string | null

  /** Original order within parent */
  originalOrder: number

  /** Original position before drag started */
  originalPosition: Point

  /** Element dimensions */
  size: { width: number; height: number }
}

/**
 * Drag state - stored in useRef, NOT Redux.
 *
 * ============================================================================
 * CRITICAL: This is stored in a REF, not Redux state!
 * ============================================================================
 *
 * WHY REF?
 * - Updated on every pointer move (60fps)
 * - Redux dispatch on every move would kill performance
 * - We only commit to Redux when drag ENDS
 *
 * LIFECYCLE:
 * 1. onPointerDown: Initialize this state in ref
 * 2. onPointerMove: Update position in ref, update DOM via RAF
 * 3. onPointerUp: Read final state from ref, dispatch to Redux
 *
 * SUPPORTS GROUP DRAG:
 * - primaryElementId: The element user clicked on (controls position)
 * - draggedElements: All elements being dragged (includes primary)
 * - Relative positions maintained via offsetFromPrimary
 */
export interface DragState {
  /** Whether a drag operation is currently in progress */
  isDragging: boolean

  /**
   * ID of the PRIMARY element being dragged.
   * This is the element the user actually clicked on.
   * Its position controls the position calculation.
   */
  elementId: string | null

  /**
   * All elements being dragged (for group drag).
   * Includes the primary element.
   * Each element maintains its offset from the primary element.
   */
  draggedElements: DraggedElementData[]

  /**
   * Offset from element's top-left corner to the grab point.
   * In CANVAS coordinates (zoom-independent).
   * Used to maintain grab position relative to cursor.
   */
  grabOffset: { x: number; y: number }

  /**
   * Current PRIMARY element position during drag.
   * In CANVAS coordinates.
   * Updated on every pointer move via RAF.
   * Other elements' positions are calculated from this + their offsets.
   */
  position: { x: number; y: number }

  /** Primary element dimensions (for hit testing) */
  size: { width: number; height: number }

  /**
   * Combined bounding box of ALL dragged elements (for multi-selection).
   * Used for snap calculations and ruler/guideline display.
   * When single element: same as { position.x, position.y, size.width, size.height }
   * When multi-selection: encompasses all selected elements as one virtual box
   */
  combinedBounds: { x: number; y: number; width: number; height: number }

  /**
   * Offset from primary element position to combined bounds top-left.
   * Used to maintain proper combined bounds position during drag.
   * combinedBounds.x = position.x + combinedBoundsOffset.x
   * combinedBounds.y = position.y + combinedBoundsOffset.y
   */
  combinedBoundsOffset: { x: number; y: number }

  /** Parent ID when drag started (for reverting or detecting parent change) */
  originalParentId: string | null

  /** Order when drag started (for reorder calculations) */
  originalOrder: number

  /** Current potential drop target frame ID (null = canvas root) */
  dropTargetId: string | null

  /** Current sort index within drop target */
  sortIndex: number
}

/**
 * Resize state - stored in useRef, NOT Redux.
 *
 * ============================================================================
 * CRITICAL: This is stored in a REF, not Redux state!
 * ============================================================================
 *
 * Same pattern as DragState - refs for 60fps, commit to Redux on end.
 */
export interface ResizeState {
  /** Whether a resize operation is in progress */
  isResizing: boolean

  /** ID of element being resized */
  elementId: string | null

  /** Which handle is being dragged */
  handle: ResizeHandle | null

  /** Pointer position when resize started (canvas coords) */
  startX: number
  startY: number

  /** Original element bounds when resize started */
  originalX: number
  originalY: number
  originalWidth: number
  originalHeight: number

  /** Whether the element had wrap mode (flexWrap: 'wrap') when resize started — used to switch to fixed height on resize end */
  hadWrapMode: boolean
}

/**
 * Frame creation state - stored in useRef or useState.
 *
 * This one is OK in useState because it only updates during
 * the drawing action, and we need the preview to render.
 *
 * However, for consistency, we keep it in a ref and use
 * a separate useState just for the preview rectangle.
 */
export interface FrameCreationState {
  /** Whether user is currently drawing a frame */
  isCreating: boolean

  /** Start point of the sketch rectangle (canvas coords) */
  startX: number
  startY: number

  /** Current point - follows cursor (canvas coords) */
  currentX: number
  currentY: number
}

/**
 * Pencil creation state — stored in useRef for 60fps performance.
 * Tracks raw pointer input during freehand drawing.
 *
 * SOURCE OF TRUTH: PencilCreationState, pencil-drawing-ref-state
 */
export interface PencilCreationState {
  /** Whether user is currently drawing */
  isDrawing: boolean

  /** Raw collected points in canvas coordinates */
  points: Array<{ x: number; y: number }>

  /** Current SVG path data string (updated per RAF) */
  currentPathData: string

  /** Running bounding box for normalization on completion */
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * A finalized stroke stored in the accumulator during multi-stroke drawing.
 * Contains RAW canvas-space points (not normalized) so the global bounding box
 * can be recomputed across all accumulated strokes when finalizing.
 *
 * SOURCE OF TRUTH: PencilAccumulatedStroke, multi-stroke-accumulator
 */
export interface PencilAccumulatedStroke {
  /** Raw collected points in canvas coordinates */
  points: Array<{ x: number; y: number }>
  /** Stroke color at time of drawing */
  strokeColor: string
  /** Brush width at time of drawing */
  strokeWidth: number
  /** Stroke opacity at time of drawing (0–1) */
  strokeOpacity: number
  /** Per-stroke bounding box (canvas coordinates) */
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// ============================================================================
// HISTORY STATE - For undo/redo
// ============================================================================

/**
 * Snapshot of canvas state for history.
 *
 * STORED IN: Redux (as part of history slice)
 *
 * Contains a complete copy of CanvasState at a point in time.
 * Used for undo/redo functionality.
 */
export interface CanvasSnapshot {
  /** Complete canvas state at this point */
  canvas: CanvasState

  /** Timestamp when snapshot was created */
  timestamp: number

  /** Optional description of what changed */
  description?: string
}

/**
 * History state for undo/redo.
 *
 * STORED IN: Redux
 *
 * Implements a stack-based history with configurable max size.
 * Past states are for undo, future states are for redo.
 */
export interface HistoryState {
  /** Past states for undo - most recent at end */
  past: CanvasSnapshot[]

  /** Future states for redo - most recent at start */
  future: CanvasSnapshot[]

  /** Maximum history size before oldest entries are dropped */
  maxSize: number
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Point in 2D space.
 * Used throughout for positions and offsets.
 */
export interface Point {
  x: number
  y: number
}

/**
 * Rectangle bounds.
 * Used for element dimensions and hit testing.
 */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Marquee selection state - stored in useRef, NOT Redux.
 *
 * ============================================================================
 * CRITICAL: This is stored in a REF, not Redux state!
 * ============================================================================
 *
 * WHY REF?
 * - Updated on every pointer move during selection drag (60fps)
 * - We only commit final selection to Redux when drag ends
 *
 * LIFECYCLE:
 * 1. onPointerDown on canvas background: Initialize marquee
 * 2. onPointerMove: Update end position, update DOM preview
 * 3. onPointerUp: Calculate intersecting elements, dispatch to Redux
 */
export interface MarqueeState {
  /** Whether marquee selection is currently active */
  isSelecting: boolean

  /** Starting point of marquee in canvas coordinates */
  startPoint: Point

  /** Current end point of marquee in canvas coordinates */
  endPoint: Point
}

/**
 * Sibling data cached during drag for sort calculations.
 *
 * STORED IN: useRef (cached at drag start, used during drag)
 *
 * triggerY is 50% from top for consistent sorting feel.
 */
export interface SiblingData {
  /** Sibling element ID */
  id: string

  /** Sibling's order value */
  order: number

  /**
   * Y position where sort triggers (35% from element top).
   * In SCREEN coordinates (includes zoom).
   * Used for VERTICAL (column) layouts.
   */
  triggerY: number

  /**
   * X position where sort triggers (35% from element left).
   * In SCREEN coordinates (includes zoom).
   * Used for HORIZONTAL (row) layouts.
   */
  triggerX: number

  /** Element height in screen pixels */
  height: number

  /** Element width in screen pixels */
  width: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Sort threshold - determines where the trigger point is within each element.
 * 0.5 = center of element (recommended for consistent feel in both directions)
 *
 * Using center (0.5) means:
 * - Dragging DOWN: swap triggers when cursor passes center of element below
 * - Dragging UP: swap triggers when cursor passes center of element above
 * Both directions feel equally responsive.
 */
export const SORT_THRESHOLD = 0.5

/**
 * Minimum element size during resize.
 * Prevents elements from becoming too small to interact with.
 * Reduced from 50 to 10 for more granular control over element sizing.
 */
export const MIN_ELEMENT_SIZE = 10

/**
 * Minimum size for newly created frames.
 * Prevents accidental tiny frames from clicks.
 * Reduced from 20 to 10 for more granular control.
 */
export const MIN_FRAME_CREATION_SIZE = 10

/**
 * Zoom limits.
 */
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 3

/**
 * Default frame properties for newly created frames.
 */
export const DEFAULT_FRAME_PROPS = {
  visible: true,
  locked: false,
  /** Frames default to container OFF (full-width content) */
  container: false,
  /** Frames default to fixed width (not auto) */
  autoWidth: false,
  /** Frames default to non-sticky (normal flow positioning) */
  sticky: false,
  /** Default sticky position is top (most common use case: headers) */
  stickyPosition: 'top' as const,
  /**
   * Responsive mode uses container queries to adapt flex direction.
   * When true AND flexDirection is 'row':
   * - < 768px container: stacks vertically (column)
   * - ≥ 768px container: displays horizontally (row)
   */
  responsive: false,
} as const

/**
 * Default styles for newly created frames.
 * These go into the `styles` object.
 */
export const DEFAULT_FRAME_STYLES: ElementStyles = {
  backgroundColor: 'white',
  borderRadius: 0,
  flexDirection: 'column',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  /**
   * Flex wrap - controls whether items wrap to next line when they don't fit.
   * 'nowrap' (default): Items squeeze to fit on one line
   * 'wrap': Items wrap to next line when they overflow
   *
   * Combined with responsive mode, this creates truly fluid layouts:
   * - Items naturally wrap based on container width
   * - No need to switch between row/column - items just flow
   */
  flexWrap: 'nowrap',
  gap: 0,
  padding: 0,
  margin: 0,
}

/**
 * Default link element SETTINGS for newly created link elements.
 *
 * Link elements behave like frames (containers) with navigation capability.
 * They can wrap any content and make it clickable.
 */
export const DEFAULT_LINK_PROPS = {
  visible: true,
  locked: false,
  /** Links default to container OFF (content determines size) */
  container: false,
  /** Links default to auto width (fill parent) */
  autoWidth: false,
  /** Links default to auto height (fit content) */
  autoHeight: true,
  /** Default to static link type */
  linkType: 'static' as const,
  /** Empty href - user will set it */
  href: '',
  /** Don't open in new tab by default */
  openInNewTab: false,
  /** Responsive mode off by default */
  responsive: false,
} as const

/**
 * Default styles for newly created link elements.
 * Same as frame styles since links are frame-like containers.
 */
export const DEFAULT_LINK_STYLES: ElementStyles = {
  /** Transparent background - links wrap content without visual styling */
  backgroundColor: 'transparent',
  borderRadius: 0,
  flexDirection: 'column',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  flexWrap: 'nowrap',
  gap: 0,
  padding: 0,
  margin: 0,
}

// ============================================================================
// GROUP ACTIONS - Types for multi-element operations
// ============================================================================

/**
 * Serialized element data for clipboard operations.
 *
 * Contains all data needed to recreate an element, including:
 * - Full element properties
 * - Relative position info (for pasting at mouse position)
 * - Children elements (for hierarchical copy)
 */
export interface ClipboardElement {
  /** The serialized element data */
  element: CanvasElement

  /**
   * Children elements (for frames with nested content).
   * Stored recursively to preserve hierarchy.
   */
  children: ClipboardElement[]

  /**
   * Original position offset from the group's top-left corner.
   * Used to maintain relative positions when pasting multiple elements.
   */
  relativeOffset: Point
}

/**
 * Clipboard state for copy/cut/paste operations.
 *
 * STORED IN: Redux (separate slice from canvas)
 *
 * Note: This is in Redux so it persists across component remounts,
 * but it's NOT persisted to database (it's session-only data).
 */
export interface ClipboardState {
  /** Elements currently in clipboard (deep copies) */
  items: ClipboardElement[]

  /**
   * Whether the clipboard contents came from a cut operation.
   * If true, the original elements were deleted and should NOT
   * be re-copied if pasted multiple times.
   */
  isCut: boolean

  /**
   * Bounding box of the original selection.
   * Used to calculate paste position relative to mouse.
   */
  originalBounds: Bounds | null
}

/**
 * Available group action types.
 *
 * EXTENSIBLE: Add new action types here as needed.
 * Each action type must have a corresponding handler in the action registry.
 */
export type GroupActionType =
  | 'delete' // Delete selected elements
  | 'copy' // Copy selected elements to clipboard
  | 'cut' // Cut selected elements (copy + delete)
  | 'paste' // Paste clipboard contents
  | 'duplicate' // Duplicate selected elements in place
  | 'move' // Move selected elements by offset
  | 'bring-forward' // Increase z-order by 1
  | 'send-backward' // Decrease z-order by 1
  | 'bring-to-front' // Move to highest z-order
  | 'send-to-back' // Move to lowest z-order
  | 'group' // Group selected elements into a frame (future)
  | 'ungroup' // Ungroup a frame into individual elements (future)

/**
 * Context provided to group action handlers.
 *
 * Contains all the data and utilities needed to execute actions.
 * Passed to every action handler for consistency.
 */
export interface GroupActionContext {
  /** Currently selected element IDs */
  selectedIds: string[]

  /** All elements in canvas (for lookups) */
  elements: Record<string, CanvasElement>

  /** Children map for hierarchy traversal */
  childrenMap: Record<string, string[]>

  /** Current clipboard state */
  clipboard: ClipboardState

  /** Current viewport state (for calculating paste position) */
  viewport: ViewportState

  /**
   * Mouse position in canvas coordinates.
   * Used for paste-at-cursor and duplicate operations.
   * Null if mouse position is not available.
   */
  mousePosition: Point | null

  /**
   * Local components library for component instance handling.
   * Used to check if a component instance is a primary (master) instance
   * and to properly handle copying of component instances.
   */
  localComponents: Record<string, LocalComponent>
}

/**
 * Result returned by group action handlers.
 *
 * Contains the changes to be applied to the Redux store.
 * This pattern allows actions to be pure functions that
 * calculate changes without directly mutating state.
 */
export interface GroupActionResult {
  /** Elements to add (new IDs will be generated) */
  elementsToAdd?: CanvasElement[]

  /** Element IDs to delete */
  elementsToDelete?: string[]

  /** Elements to update (partial updates by ID) */
  elementsToUpdate?: Record<string, Partial<CanvasElement>>

  /** New selection after action completes */
  newSelection?: string[]

  /** New clipboard state (for copy/cut) */
  newClipboard?: ClipboardState

  /** Description for history entry */
  historyDescription?: string
}

/**
 * Group action handler function signature.
 *
 * IMPLEMENTING NEW ACTIONS:
 * 1. Add action type to GroupActionType
 * 2. Create handler function matching this signature
 * 3. Register handler in action-registry.ts
 * 4. Add keyboard shortcut in useGroupActions hook
 *
 * @param context - All data needed to execute the action
 * @returns Result containing state changes to apply
 */
export type GroupActionHandler = (
  context: GroupActionContext
) => GroupActionResult

/**
 * Registry entry for a group action.
 *
 * Contains metadata about the action for UI and help system.
 */
export interface GroupActionDefinition {
  /** Action type identifier */
  type: GroupActionType

  /** Human-readable label for UI (e.g., "Delete") */
  label: string

  /** Keyboard shortcut(s) for this action */
  shortcuts: string[]

  /** Description for help text */
  description: string

  /**
   * Whether this action requires a selection.
   * If true, action is disabled when nothing is selected.
   */
  requiresSelection: boolean

  /**
   * Whether this action requires clipboard contents.
   * If true, action is disabled when clipboard is empty.
   */
  requiresClipboard?: boolean

  /** The handler function */
  handler: GroupActionHandler
}

// ============================================================================
// PAGES - Multi-page architecture for Figma-like page management
// ============================================================================

/**
 * Page metadata for UI display.
 *
 * Contains the minimal info needed to show a page in the sidebar list.
 * The full page data (elements, history) is stored separately.
 *
 * ============================================================================
 * PAGE IDENTIFIERS
 * ============================================================================
 *
 * Each page has two identifiers:
 *
 * - **name**: Human-readable display name (e.g., "Home Page", "About Us")
 *   Shown in the sidebar page list and builder header.
 *   User can edit this freely without breaking routing.
 *
 * - **slug**: URL path for routing (e.g., "/homepage", "/about-us")
 *   Used for URL generation and route matching.
 *   Must be URL-safe (lowercase, hyphens, no spaces).
 *   Validated when edited to ensure URL compatibility.
 *
 * This separation allows users to have friendly display names while
 * maintaining valid URL paths for routing.
 */
export interface PageInfo {
  /** Unique page identifier */
  id: string

  /** Human-readable page name shown in sidebar (e.g., "Home Page", "About Us") */
  name: string

  /**
   * URL path for this page (e.g., "/homepage", "/about-us").
   * Used for routing - must be URL-safe.
   * Should start with "/" for consistency.
   */
  slug: string

  /** Timestamp when page was created */
  createdAt: number

  /** Timestamp when page was last modified */
  updatedAt: number

  /**
   * Whether this page has been published.
   * When true, the page's data is included in publishedCanvasData.
   */
  isPublished?: boolean

  /**
   * Timestamp when the page was last published.
   * Used to track when the live version was updated.
   */
  publishedAt?: number

  /**
   * ID of the CMS table this page is connected to for dynamic rendering.
   * When set, this page becomes a dynamic template that renders
   * CMS row data at URLs like /domain/page-slug/[rowId]
   */
  cmsTableId?: string | null

  /**
   * CMS column slug used for SEO-friendly dynamic page URLs.
   * When set, dynamic URLs use the column value instead of the row ID:
   * e.g., /blog/my-post-title instead of /blog/clx123abc
   *
   * SOURCE OF TRUTH: CmsSlugColumnSlug, DynamicPageSlugField
   */
  cmsSlugColumnSlug?: string | null

  /**
   * Whether this is an auto-generated e-commerce page (cart, checkout, etc.).
   * E-commerce pages are displayed in a separate section in the sidebar.
   * SOURCE OF TRUTH: isEcommercePage, EcommercePageFlag
   */
  isEcommercePage?: boolean
}

/**
 * Complete state for a single page.
 *
 * Each page encapsulates:
 * - Its own canvas (page element + all child elements)
 * - Its own viewport (pan/zoom position)
 * - Its own selection state
 * - Its own undo/redo history
 *
 * ============================================================================
 * WHY PAGE-LOCAL UNDO/REDO?
 * ============================================================================
 *
 * When a user works on Page A, then switches to Page B, then back to A:
 * - They expect Ctrl+Z to undo their LAST action on Page A
 * - Not undo something from Page B
 *
 * This mirrors Figma's behavior where each page has independent history.
 *
 * ============================================================================
 * O(1) LOOKUPS - Maintained within each page
 * ============================================================================
 *
 * Each page's canvas maintains:
 * - `elements: Record<string, CanvasElement>` for O(1) element lookup
 * - `childrenMap: Record<string, string[]>` for O(1) children lookup
 * - `rootIds: string[]` for ordered root elements
 *
 * Page lookup itself is also O(1) via `pages: Record<string, PageState>`.
 */
export interface PageState {
  /** Page metadata (id, name, timestamps) */
  info: PageInfo

  /** Canvas elements - all elements including the page */
  canvas: CanvasState

  /** Viewport pan and zoom for this page */
  viewport: ViewportState

  /** Selection state for this page */
  selection: SelectionState

  /** Undo/redo history LOCAL to this page only */
  history: HistoryState
}

/**
 * Complete pages state - manages all pages in the project.
 *
 * STORED IN: Redux (single source of truth for all page data)
 *
 * ============================================================================
 * DATA STRUCTURE - O(1) page access
 * ============================================================================
 *
 * - `pages: Record<string, PageState>` - O(1) lookup by page ID
 * - `pageOrder: string[]` - Ordered list of page IDs for UI display
 * - `activePageId: string` - Currently active page
 *
 * ============================================================================
 * SERIALIZATION
 * ============================================================================
 *
 * The entire PagesState can be serialized to JSON for database storage.
 * When loading a project, all pages are restored with their individual
 * canvases, viewports, and history states.
 */
export interface PagesState {
  /**
   * All pages indexed by ID - O(1) lookup.
   * This is the SINGLE SOURCE OF TRUTH for page data.
   */
  pages: Record<string, PageState>

  /**
   * Ordered array of page IDs for UI display.
   * Users can reorder pages in the sidebar.
   */
  pageOrder: string[]

  /**
   * ID of the currently active page.
   * Determines which page is rendered in the canvas.
   */
  activePageId: string
}

/**
 * Default page properties for newly created pages.
 */
export const DEFAULT_PAGE_CANVAS_PROPS = {
  /** Default page width for new pages */
  pageWidth: 1440,
  /** Default page height for new pages */
  pageHeight: 900,
  /** Default page background color */
  pageBackgroundColor: '#ffffff',
} as const


// ============================================================================
// PUBLISHED DATA TYPES - Minimal data for live website rendering
// ============================================================================

/**
 * Minimal page info needed for published pages.
 *
 * WHY MINIMAL?
 * The full PageInfo includes timestamps and other metadata that aren't
 * needed for rendering the live website. We only need:
 * - slug: For URL routing (matching the pathname)
 * - name: For SEO (page title, meta tags)
 */
export interface PublishedPageInfo {
  /** URL path for this page (e.g., "/homepage", "/about-us") */
  slug: string

  /** Human-readable page name (used for SEO, page title) */
  name: string
}

/**
 * Published data for a single page.
 *
 * ============================================================================
 * ULTRA-MINIMAL DATA STRUCTURE
 * ============================================================================
 *
 * This contains ONLY what's needed to render the live page:
 *
 * 1. `info` - Page info for routing and SEO
 *    - slug: URL path matching
 *    - name: Page title for SEO
 *
 * 2. `elements` - Just the elements themselves (page + all descendants)
 *    - Array of CanvasElement (page element + all its children)
 *    - The PageRenderer derives rootIds and childrenMap from parentId
 *
 * ============================================================================
 * WHY NOT STORE rootIds AND childrenMap?
 * ============================================================================
 *
 * These can be DERIVED from the elements' `parentId` field:
 * - rootIds: Elements where parentId === null (should be just the page)
 * - childrenMap: Group elements by their parentId
 *
 * Storing derived data is redundant and wastes database space.
 *
 * ============================================================================
 * WHAT'S EXCLUDED (saves DB space, improves security)
 * ============================================================================
 *
 * - viewport: Pan/zoom is editor-only state
 * - selection: Editor-only state
 * - history: Editor-only undo/redo stack
 * - rootIds: Derived from elements (parentId === null)
 * - childrenMap: Derived from elements (group by parentId)
 * - createdAt/updatedAt: Not needed for rendering
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * // In the published website page:
 * const publishedPage = website.publishedCanvasData.pages["/about"]
 * <PageRenderer elements={publishedPage.elements} />
 * ```
 */
export interface PublishedPageData {
  /** Minimal page info (slug for routing, name for SEO) */
  info: PublishedPageInfo

  /**
   * Just the elements - page element and all its descendants.
   * The PageRenderer derives rootIds and childrenMap from parentId.
   */
  elements: CanvasElement[]
}

/**
 * Complete published data for a website.
 *
 * ============================================================================
 * STRUCTURE
 * ============================================================================
 *
 * Indexed by SLUG (not page ID) for efficient routing:
 *
 * ```json
 * {
 *   "pages": {
 *     "/home": { info: { slug, name }, elements: [...] },
 *     "/about": { info: { slug, name }, elements: [...] }
 *   },
 *   "publishedAt": 1699999999999
 * }
 * ```
 *
 * ============================================================================
 * WHY INDEX BY SLUG?
 * ============================================================================
 *
 * When a user visits /domain/about:
 * 1. Extract the pathname "/about"
 * 2. Look up publishedCanvasData.pages["/about"]
 * 3. Pass elements to PageRenderer
 *
 * Indexing by slug makes this O(1) lookup.
 */
export interface PublishedCanvasData {
  /**
   * Published pages indexed by SLUG for O(1) routing lookup.
   *
   * Key: The page's slug (e.g., "/home", "/about-us")
   * Value: The minimal published data (info + elements array)
   */
  pages: Record<string, PublishedPageData>

  /**
   * Timestamp when the website was last published.
   * Can be used to show "Last published: 2 hours ago" in the UI.
   */
  publishedAt: number
}

// ============================================================================
// TIMER ELEMENT - SOURCE OF TRUTH
// ============================================================================
//
// Countdown timer element that counts down to a target date or for a fixed
// duration. Supports segment visibility (days/hours/minutes/seconds), label
// styles, separator styles, and expiry actions (hide/reveal other elements).
//
// SOURCE OF TRUTH: TimerSegments, TimerExpiryConfig, TimerElement,
// timer-element, countdown-timer
// ============================================================================

/**
 * Controls which time segments are visible in the timer display.
 *
 * SOURCE OF TRUTH: TimerSegments, timer-segments-visibility
 *
 * Each boolean controls whether that segment appears in the countdown.
 * Disabled segments are excluded from the layout entirely.
 */
export interface TimerSegments {
  /** Whether to display the days segment */
  showDays: boolean
  /** Whether to display the hours segment */
  showHours: boolean
  /** Whether to display the minutes segment */
  showMinutes: boolean
  /** Whether to display the seconds segment */
  showSeconds: boolean
}

/**
 * Configuration for what happens when the timer reaches zero.
 *
 * SOURCE OF TRUTH: TimerExpiryConfig, timer-expiry-actions
 *
 * Enables powerful page interactions:
 * - Hide the timer itself when it expires
 * - Hide other elements (e.g., a "sale ending" banner)
 * - Reveal other elements (e.g., an "expired" message)
 */
export interface TimerExpiryConfig {
  /** Whether the timer element itself is hidden when the countdown ends */
  hideTimerOnExpiry: boolean
  /** IDs of other elements to hide (display: none) when timer expires */
  hideElementIds: string[]
  /** IDs of other elements to reveal (remove display: none) when timer expires */
  revealElementIds: string[]
}

/**
 * Countdown timer element — date-targeted or duration-based countdown.
 *
 * SOURCE OF TRUTH: TimerElement, timer-element-interface
 *
 * Two modes:
 * - 'date': Counts down to a specific future date/time
 * - 'duration': Counts down from a fixed number of seconds (per-session)
 *
 * DISPLAY:
 * - Each visible segment shows a 2-digit animated counter with optional label
 * - Segments separated by configurable separators (colon or none)
 * - Step animation on digit changes in preview mode
 *
 * EXPIRY:
 * - On reaching zero, can hide/reveal other page elements by their IDs
 * - Timer itself can be hidden on expiry
 *
 * STYLING via element.styles:
 * - fontFamily, fontSize, fontWeight, color → digit display
 * - backgroundColor, borderRadius, padding, gap → container
 * - __labelColor, __labelFontSize → label text
 * - __separatorColor → colon separator color
 */
export interface TimerElement extends BaseElement {
  type: 'timer'

  /**
   * Countdown mode:
   * - 'date': counts down to targetDate
   * - 'duration': counts down durationSeconds from first visit (per session)
   */
  timerMode: 'date' | 'duration'

  /** ISO date string for 'date' mode — the target end date/time */
  targetDate?: string

  /** Total seconds for 'duration' mode — how long the countdown runs */
  durationSeconds?: number

  /** Which time segments (days, hours, minutes, seconds) are visible */
  segments: TimerSegments

  /** Whether to display text labels below each segment */
  showLabels: boolean

  /** Label format: 'short' = "d", "h", "m", "s" / 'full' = "Days", "Hours", etc. */
  labelStyle: 'short' | 'full'

  /** Separator between segments: 'colon' = ":" divider / 'none' = no separator */
  separatorStyle: 'colon' | 'none'

  /** Configuration for hide/reveal actions when the timer expires */
  expiry: TimerExpiryConfig

  /** Whether the element width fits its parent container */
  autoWidth?: boolean

  /** Whether the element height adjusts to content */
  autoHeight?: boolean
}

// ============================================================================
// RECEIPT ELEMENT
// ============================================================================

/**
 * Receipt Element — Displays a payment receipt on the published page.
 *
 * WHY: Allows website builders to place a receipt component on a "thank you"
 * or confirmation page. After a customer completes payment, they are redirected
 * to a page containing this element. The receipt data is fetched at runtime
 * using the transactionId from URL search params (?transactionId=xxx).
 *
 * ARCHITECTURE: This element has NO configurable settings in the builder.
 * All receipt data (items, amounts, dates) comes from the transaction service.
 * The element is purely a display container — it renders the PaymentReceipt
 * component with data from the API.
 *
 * SOURCE OF TRUTH KEYWORDS: ReceiptElement, ReceiptCanvasElement
 */
export interface ReceiptElement extends BaseElement {
  type: 'receipt'

  /**
   * When TRUE, the receipt uses width: 100% instead of a fixed pixel width.
   * This makes the receipt responsive — it will fill the width of its container.
   */
  autoWidth?: boolean

  /**
   * Visual theme for the receipt card.
   * Controls background, text, and border colors for both canvas and preview.
   * - 'dark': Dark background with light text (default)
   * - 'light': Light background with dark text
   *
   * SOURCE OF TRUTH: ReceiptElementTheme
   */
  theme?: 'light' | 'dark'
}
