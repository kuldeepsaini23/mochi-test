/**
 * ============================================================================
 * STYLE UTILS - Single Source of Truth for Element Style Computation
 * ============================================================================
 *
 * This module provides utility functions for computing CSS styles from
 * element data. It serves as the SINGLE SOURCE OF TRUTH for style rendering
 * across both the canvas editor and the preview/published renderer.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Previously, style computation was duplicated in:
 * - frame-element.tsx (canvas editor)
 * - page-renderer.tsx (preview/published)
 *
 * This caused bugs where fixes in one place weren't applied to the other.
 * Now both components use these shared utilities.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * import { computeFrameContentStyles, computeTextContentStyles } from '../_lib/style-utils'
 *
 * // In frame-element.tsx or page-renderer.tsx:
 * const contentStyle = computeFrameContentStyles(element, isPage)
 * ```
 *
 * ============================================================================
 */

import type {
  Breakpoint,
  CanvasElement,
  FrameElement,
  PageElement,
  TextElement,
  ImageElement,
  VideoElement,
  ButtonElement,
  AddToCartButtonElement,
  CartElement,
  ElementStyles,
  ResponsiveSettingsOverrides,
  // Backwards compatibility alias
  ResponsivePropertyOverrides,
  GradientConfig,
  EffectsConfig,
  BorderConfig,
} from './types'
import { DEFAULT_FRAME_STYLES, DEFAULT_PAGE_STYLES, DEFAULT_TEXT_STYLES, DEFAULT_IMAGE_STYLES, DEFAULT_BUTTON_STYLES } from './types'
import { gradientConfigToCSS } from './gradient-utils'
import { effectsConfigToCSS } from './effect-utils'
import { borderConfigToInlineStyles, hasGradientBorder } from './border-utils'

/**
 * Options for compute style functions.
 * Allows specifying the breakpoint for responsive style merging.
 */
export interface ComputeStyleOptions {
  /**
   * The breakpoint to compute styles for.
   * - 'desktop': Uses base styles only (element.styles)
   * - 'mobile': Merges responsiveStyles.mobile on top of base styles
   * @default 'desktop'
   */
  breakpoint?: Breakpoint

  /**
   * Whether to allow overflow (visible) instead of clipping (hidden).
   * When true, content can visually overflow the frame bounds.
   *
   * This is useful in the canvas editor where we want element overlays
   * (labels, dimension pills, resize handles) to be visible even when
   * nested inside parent frames.
   *
   * @default false (clips content by default)
   */
  allowOverflow?: boolean
}

/**
 * Computes the content div styles for a frame or page element.
 *
 * HANDLES:
 * - Merging default styles with element styles
 * - Merging responsive styles when breakpoint is specified
 * - Converting backgroundImage URL to CSS url() format
 * - Setting backgroundSize and backgroundPosition for images
 * - Forcing borderRadius to 0 for pages
 *
 * @param element - The frame or page element
 * @param isPage - Whether this is a page element (forces borderRadius: 0)
 * @param options - Optional settings including breakpoint for responsive styles
 * @returns React.CSSProperties for the content div
 */
export function computeFrameContentStyles(
  element: FrameElement | PageElement,
  isPage: boolean = false,
  options: ComputeStyleOptions = {}
): React.CSSProperties {
  const { breakpoint = 'desktop', allowOverflow = false } = options

  // Merge default styles with element styles (and responsive overrides if mobile)
  const defaultStyles = isPage ? DEFAULT_PAGE_STYLES : DEFAULT_FRAME_STYLES

  // Use mergeResponsiveStyles to handle breakpoint-specific style merging
  const styles = breakpoint === 'mobile'
    ? mergeResponsiveStyles(element, breakpoint, defaultStyles)
    : { ...defaultStyles, ...(element.styles ?? {}) } as ElementStyles

  // ============================================================================
  // BACKGROUND MODE SUPPORT (image vs video)
  // ============================================================================
  // Check if the frame is in video background mode. When video mode is active,
  // the CSS backgroundImage is skipped entirely — the video is rendered as an
  // HTML <video> element by unified-frame.tsx, and gradients become a separate
  // overlay div ON TOP of the video (not CSS on this content div).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bgMode = (styles as any).__backgroundMode as string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bgVideoSrc = (styles as any).__backgroundVideo?.src as string | undefined
  const isVideoMode = bgMode === 'video' && !!bgVideoSrc

  // ============================================================================
  // BACKGROUND GRADIENT SUPPORT
  // ============================================================================
  // Check for gradient configuration in styles.__backgroundGradient
  // Gradients take priority over background images when present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradientConfig = (styles as any).__backgroundGradient as GradientConfig | undefined

  // Build backgroundImage CSS value:
  // 1. Video mode active → skip entirely (video + gradient handled as DOM elements)
  // 2. If gradient is configured, convert to CSS gradient string
  // 3. Otherwise, if image URL is present, wrap in url()
  // 4. Otherwise, undefined (no background image)
  let backgroundImageStyle: string | undefined
  if (isVideoMode) {
    // Video mode: don't set CSS backgroundImage — unified-frame.tsx renders
    // the video as an HTML element and the gradient as a separate overlay div
    backgroundImageStyle = undefined
  } else if (gradientConfig) {
    backgroundImageStyle = gradientConfigToCSS(gradientConfig)
  } else if (styles.backgroundImage) {
    backgroundImageStyle = `url(${styles.backgroundImage})`
  }

  // ============================================================================
  // EFFECTS SUPPORT (shadows, blurs)
  // ============================================================================
  // Check for effects configuration in styles.__effects
  // Effects include drop shadows, inner shadows, layer blur, and background blur
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effectsConfig = (styles as any).__effects as EffectsConfig | undefined
  const effectsStyles = effectsConfigToCSS(effectsConfig)

  // ============================================================================
  // BORDER SUPPORT (per-side borders with gradient option)
  // ============================================================================
  // Check for border configuration in styles.__borderConfig
  // Borders can be uniform or per-side, with solid color or gradient fills
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const borderConfig = (styles as any).__borderConfig as BorderConfig | undefined
  const borderStyles = borderConfig ? borderConfigToInlineStyles(borderConfig) : {}
  // If gradient border is enabled, we need to use position: relative for pseudo-element
  const hasGradientBorderActive = borderConfig && hasGradientBorder(borderConfig)

  /**
   * Check if wrap is enabled - this changes how we size the content div.
   * When wrap is enabled, children can flow to multiple lines, so the
   * content div needs to grow with its content (not be fixed to parent size).
   */
  const hasWrap = styles.flexWrap === 'wrap'

  // ============================================================================
  // RESPONSIVE SMART GRID — CSS Grid with auto-fill columns
  // ============================================================================
  /**
   * When smartGrid is enabled, the frame uses CSS Grid instead of flexbox.
   * grid-template-columns: repeat(auto-fill, minmax(min(100%, Xpx), 1fr))
   * makes children auto-arrange into the optimal number of columns.
   *
   * Resolve with responsive awareness so mobile breakpoint can override.
   * SOURCE OF TRUTH: SmartGrid, ResponsiveSmartGrid, smart-grid-layout
   */
  const isSmartGrid = breakpoint === 'mobile'
    ? (getPropertyValue<boolean>(element, 'smartGrid', breakpoint, false) ?? false)
    : ((element as FrameElement).smartGrid ?? false)
  const smartGridMinWidth = breakpoint === 'mobile'
    ? (getPropertyValue<number>(element, 'smartGridMinWidth', breakpoint, 200) ?? 200)
    : ((element as FrameElement).smartGridMinWidth ?? 200)

  return {
    /**
     * Simple layout approach:
     * - Default: Fill the parent (width/height 100%)
     * - With wrap: Height auto so it grows with wrapped children
     *
     * We avoid absolute positioning because it prevents the content
     * from growing when children wrap to multiple lines.
     */
    width: '100%',
    /**
     * Height sizing:
     * - Wrap mode: 'auto' so wrapped children expand the content area
     * - Default: '100%' fills the fixed-height parent wrapper
     * - Smart grid: 'auto' so grid rows expand naturally
     * NOTE: Page override is applied at the END of this object (after ...styles)
     * to guarantee it's never overridden by user/default styles.
     */
    height: (hasWrap || isSmartGrid) ? 'auto' : '100%',
    /**
     * Display mode:
     * - Smart grid: CSS Grid with auto-fill columns for responsive layout
     * - Default: Flexbox for standard frame layout
     */
    display: isSmartGrid ? 'grid' : 'flex',
    /**
     * SMART GRID COLUMN TEMPLATE:
     * repeat(auto-fill, minmax(min(100%, Xpx), 1fr))
     *   - auto-fill: cram as many columns as container allows
     *   - min(100%, Xpx): safety valve — on tiny screens falls to 1 column
     *   - 1fr: each column grows equally to fill remaining space
     * Children automatically wrap when there isn't room for another column.
     */
    ...(isSmartGrid ? {
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${smartGridMinWidth}px), 1fr))`,
    } : {}),
    zIndex: 0,

    // Smooth transitions for property changes
    transition: 'all 150ms ease-out',

    // Spread ALL user-defined styles (includes flexWrap, flexDirection, gap, etc.)
    ...styles,

    // Strip margin from the inner content div — margin is applied on the OUTER
    // wrapper by computeElementPositionStyles. When margin leaks into the content
    // div it visually behaves like padding (pushes content inward instead of
    // creating space outside the element).
    margin: undefined,

    // OVERFLOW BEHAVIOR:
    // Default to 'visible' to match standard web behavior where containers don't clip children.
    // This allows badges, tooltips, and other overlays positioned outside element bounds to be visible.
    //
    // When allowOverflow is true (canvas editor mode): ALWAYS use visible so overlays are visible
    // When allowOverflow is false (preview/published mode):
    //   - Use 'visible' by default (matches standard web behavior)
    //   - Respect user-specified overflow if explicitly set in styles
    //
    // NOTE: Scroll mode clipping is handled on the WRAPPER element (frame-element.tsx line ~331),
    // not on this content div.
    overflowX: allowOverflow
      ? 'visible'
      : ((styles as React.CSSProperties).overflowX ?? (styles as React.CSSProperties).overflow ?? 'visible') as React.CSSProperties['overflowX'],
    overflowY: allowOverflow
      ? 'visible'
      : ((styles as React.CSSProperties).overflowY ?? (styles as React.CSSProperties).overflow ?? 'visible') as React.CSSProperties['overflowY'],

    // Override backgroundImage with properly formatted CSS value
    // This could be a gradient CSS string, a url() for images, or undefined (video mode)
    backgroundImage: backgroundImageStyle,
    // Only apply backgroundSize/Position for images (not gradients, not video mode).
    // Reads __backgroundFit from styles (set via property registry), defaults to 'cover'.
    // 'fill' maps to '100% 100%' to stretch image to exact frame dimensions.
    backgroundSize: styles.backgroundImage && !gradientConfig && !isVideoMode
      ? (() => {
          const fit = (styles as Record<string, unknown>).__backgroundFit as string | undefined
          if (fit === 'fill') return '100% 100%'
          if (fit === 'contain') return 'cover' // Contain removed from UI — fallback to cover
          return fit || 'cover'
        })()
      : undefined,
    backgroundPosition: styles.backgroundImage && !gradientConfig && !isVideoMode ? 'center' : undefined,
    /* Prevent background images from tiling — frames should never repeat their background */
    backgroundRepeat: styles.backgroundImage && !gradientConfig && !isVideoMode ? 'no-repeat' : undefined,

    // Force borderRadius to 0 for pages
    borderRadius: isPage ? 0 : (styles.borderRadius ?? 0),

    // Apply effects (shadows, blurs)
    // These override any existing boxShadow, filter, or backdropFilter from base styles
    ...effectsStyles,

    // Apply border styles (per-side borders)
    // For solid borders: applies border-top, border-right, etc.
    // For gradient borders: sets position: relative (pseudo-element handled separately)
    ...borderStyles,
    ...(hasGradientBorderActive ? { position: 'relative' as const } : {}),

    /**
     * PAGE AUTO-HEIGHT OVERRIDE — MUST come LAST.
     * Pages use height: auto so the content div grows with children.
     * minHeight: inherit picks up the wrapper's minHeight (element.height),
     * ensuring the content area is never shorter than the configured page height.
     * Placed after ALL style spreads to guarantee nothing can override it.
     */
    ...(isPage ? { height: 'auto' as const, minHeight: 'inherit' } : {}),

    /**
     * WRAP-MODE FRAME AUTO-HEIGHT — no minHeight on content div.
     * When "Fit Content" (wrap) is enabled, the frame should shrink to exactly
     * its children's size. Inheriting minHeight from the wrapper would prevent
     * this and create visible extra space at the bottom (especially noticeable
     * with images inside frames). The content div uses height: auto and grows
     * naturally with its children — no minimum floor needed.
     */
  }
}

/**
 * Options for computing text content styles.
 * Extends base options with text-specific settings.
 */
export interface ComputeTextStyleOptions extends ComputeStyleOptions {
  /**
   * Override for autoHeight property.
   * When true, text wraps and height adapts to content.
   * When false, text is constrained to fixed height with hidden overflow.
   * If not provided, uses the element's autoHeight property.
   */
  autoHeight?: boolean

  /**
   * Override for autoWidth property.
   * When true, text uses 100% width of its container.
   * When false, uses fixed pixel width.
   * If not provided, uses the element's autoWidth property.
   */
  autoWidth?: boolean
}

/**
 * Computes the content div styles for a text element.
 *
 * HANDLES:
 * - Merging default styles with element styles
 * - Merging responsive styles when breakpoint is specified
 * - Applying typography from element.styles (CSS properties)
 * - Text rendering optimizations
 * - Auto height mode (text wraps and height adapts)
 *
 * ============================================================================
 * TYPOGRAPHY NOW IN STYLES
 * ============================================================================
 *
 * Typography properties (fontFamily, fontSize, fontWeight, lineHeight,
 * letterSpacing, textAlign) are now stored in element.styles, NOT as
 * direct element properties. This keeps all CSS in one place.
 *
 * BACKWARDS COMPATIBILITY:
 * For existing elements that still have typography on the element itself,
 * we check element.fontFamily first, then fall back to styles.fontFamily.
 * This ensures smooth migration without breaking existing data.
 *
 * ============================================================================
 * AUTO HEIGHT MODE
 * ============================================================================
 *
 * When autoHeight is TRUE (default):
 * - Uses relative positioning (not absolute)
 * - Width is 100% of parent container
 * - Height is auto - grows with content
 * - Text wraps at container boundaries
 * - Visible overflow allowed
 *
 * When autoHeight is FALSE:
 * - Uses absolute positioning with inset: 0
 * - Fixed to parent dimensions
 * - Hidden overflow
 *
 * @param element - The text element
 * @param isEditing - Whether the text is currently being edited (affects cursor)
 * @param options - Optional settings including breakpoint and autoHeight override
 * @returns React.CSSProperties for the content div
 */
export function computeTextContentStyles(
  element: TextElement,
  isEditing: boolean = false,
  options: ComputeTextStyleOptions = {}
): React.CSSProperties {
  const { breakpoint = 'desktop' } = options

  // Merge default styles with element styles (and responsive overrides if mobile)
  // DEFAULT_TEXT_STYLES now includes typography defaults
  const mergedStyles = breakpoint === 'mobile'
    ? mergeResponsiveStyles(element, breakpoint, DEFAULT_TEXT_STYLES)
    : { ...DEFAULT_TEXT_STYLES, ...(element.styles ?? {}) }

  /**
   * ========================================================================
   * TYPOGRAPHY FROM STYLES (with backwards compatibility)
   * ========================================================================
   *
   * Typography is now in element.styles. However, for backwards compatibility
   * with existing elements that have typography on the element directly,
   * we check element.fontFamily etc. first, then fall back to styles.
   *
   * This ensures existing saved websites continue to work during migration.
   */
  const fontFamily = element.fontFamily ?? mergedStyles.fontFamily ?? 'Inter'
  const fontSize = element.fontSize ?? mergedStyles.fontSize ?? 16
  const fontWeight = element.fontWeight ?? mergedStyles.fontWeight ?? 400
  const lineHeight = element.lineHeight ?? mergedStyles.lineHeight ?? 1.5
  const letterSpacing = element.letterSpacing ?? mergedStyles.letterSpacing ?? 0
  const textAlign = element.textAlign ?? mergedStyles.textAlign ?? 'left'
  // Additional typography styles (set via CMD+I, CMD+U shortcuts and text transform dropdown)
  const fontStyle = mergedStyles.fontStyle ?? 'normal'
  const textDecoration = mergedStyles.textDecoration ?? 'none'
  const textTransform = mergedStyles.textTransform ?? 'none'

  /**
   * Get autoHeight SETTING - determines if text wraps with adaptive height.
   * Uses option override if provided, otherwise falls back to element setting.
   * Default is true (responsive text is the default behavior).
   *
   * NOTE: autoHeight is a SETTING (not CSS), so we use getSettingValue.
   */
  const autoHeight = options.autoHeight !== undefined
    ? options.autoHeight
    : getSettingValue<boolean>(element, 'autoHeight', breakpoint, element.autoHeight ?? true) ?? true

  // ============================================================================
  // TEXT GRADIENT SUPPORT
  // ============================================================================
  // Check for text gradient configuration in styles.__textGradient
  // Text gradients require special CSS: background-clip: text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textGradient = (mergedStyles as any).__textGradient as GradientConfig | undefined

  // Build text color styles - either solid color or gradient
  // IMPORTANT: We must use backgroundImage (not background shorthand) to avoid React
  // warning about mixing shorthand and non-shorthand properties (backgroundClip)
  const textColorStyles: React.CSSProperties = textGradient
    ? {
        // Gradient text requires these special CSS properties
        // Use backgroundImage instead of background to avoid conflict with backgroundClip
        backgroundImage: gradientConfigToCSS(textGradient),
        // Explicitly set other background properties to prevent inheritance issues
        backgroundColor: 'transparent',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100%',
        // Clip the background to the text only
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        // Set color to transparent as fallback
        color: 'transparent',
      }
    : {
        // Solid color - just use the color property
        color: mergedStyles.color,
      }

  // ============================================================================
  // EFFECTS SUPPORT (shadows, blurs)
  // ============================================================================
  // Check for effects configuration in styles.__effects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effectsConfig = (mergedStyles as any).__effects as EffectsConfig | undefined
  const effectsStyles = effectsConfigToCSS(effectsConfig)

  // ============================================================================
  // BORDER SUPPORT (per-side borders with gradient option)
  // ============================================================================
  // Check for border configuration in styles.__borderConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textBorderConfig = (mergedStyles as any).__borderConfig as BorderConfig | undefined
  const textBorderStyles = textBorderConfig ? borderConfigToInlineStyles(textBorderConfig) : {}
  const hasTextGradientBorder = textBorderConfig && hasGradientBorder(textBorderConfig)

  // ============================================================================
  // FADE EDGES EFFECT
  // ============================================================================
  // Get fade edges settings from element (responsive-aware)
  const fadeEdges = getSettingValue<TextElement['fadeEdges']>(
    element,
    'fadeEdges',
    breakpoint,
    element.fadeEdges
  )
  const fadeEdgesHeight = getSettingValue<number>(
    element,
    'fadeEdgesHeight',
    breakpoint,
    element.fadeEdgesHeight
  ) ?? 10

  /**
   * Base typography and visual styles (same for both modes).
   * Typography is now read from mergedStyles (which includes defaults + overrides).
   */
  const baseStyles: React.CSSProperties = {
    // Smooth transitions for all property changes from the properties panel
    transition: 'all 150ms ease-out',

    // Visual styles from merged styles
    backgroundColor: mergedStyles.backgroundColor,
    padding: mergedStyles.padding,
    borderRadius: mergedStyles.borderRadius ?? 0,

    // Typography - now from styles (with backwards compat fallback)
    fontFamily: typeof fontFamily === 'string' ? `"${fontFamily}", sans-serif` : fontFamily,
    fontSize: fontSize,
    fontWeight: fontWeight,
    fontStyle: fontStyle as React.CSSProperties['fontStyle'],
    textDecoration: textDecoration as React.CSSProperties['textDecoration'],
    lineHeight: lineHeight,
    letterSpacing: letterSpacing,
    textAlign: textAlign as React.CSSProperties['textAlign'],
    textTransform: textTransform as React.CSSProperties['textTransform'],

    // Text color - either solid or gradient (handled above)
    ...textColorStyles,

    // Text rendering optimizations
    wordWrap: 'break-word',
    whiteSpace: 'pre-wrap',

    // Editing state
    outline: 'none',
    cursor: isEditing ? 'text' : 'inherit',

    // Apply effects (shadows, blurs)
    ...effectsStyles,

    // Apply border styles (per-side borders)
    ...textBorderStyles,
    ...(hasTextGradientBorder ? { position: 'relative' as const } : {}),
  }

  /**
   * AUTO HEIGHT MODE (default):
   * Text wraps and height adapts to content.
   *
   * KEY: Do NOT use minHeight: '100%' here because percentage-based min-height
   * doesn't work when the parent has height: auto. Instead, let the content
   * flow naturally and the parent wrapper will grow to fit.
   */
  if (autoHeight) {
    return applyFadeEdgesStyles(
      {
        ...baseStyles,
        // Relative positioning - content flows naturally
        position: 'relative',
        width: '100%',
        // No height constraints - let content determine height naturally
        // The parent wrapper will grow to accommodate the content
        // Allow overflow to be visible while editing
        overflowX: 'visible',
        overflowY: 'visible',
        zIndex: 0,
      },
      fadeEdges,
      fadeEdgesHeight
    )
  }

  /**
   * FIXED HEIGHT MODE:
   * Text is constrained to the element's fixed dimensions.
   * Uses absolute positioning to fill parent.
   */
  return applyFadeEdgesStyles(
    {
      ...baseStyles,
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      // Hidden overflow for fixed height mode
      overflowX: 'hidden',
      overflowY: 'hidden',
      zIndex: 0,
    },
    fadeEdges,
    fadeEdgesHeight
  )
}

/**
 * Computes the content div styles for an image element.
 *
 * HANDLES:
 * - Merging default styles with element styles
 * - Merging responsive styles when breakpoint is specified
 * - Converting src URL to CSS backgroundImage url() format
 * - Applying objectFit as backgroundSize
 * - Setting backgroundPosition for centering
 *
 * @param element - The image element
 * @param options - Optional settings including breakpoint for responsive styles
 * @returns React.CSSProperties for the content div
 */
export function computeImageContentStyles(
  element: ImageElement,
  options: ComputeStyleOptions = {}
): React.CSSProperties {
  const { breakpoint = 'desktop' } = options

  // Merge default styles with element styles (and responsive overrides if mobile)
  const visualStyles = breakpoint === 'mobile'
    ? mergeResponsiveStyles(element, breakpoint, DEFAULT_IMAGE_STYLES)
    : { ...DEFAULT_IMAGE_STYLES, ...(element.styles ?? {}) }

  /**
   * Use responsive-aware getter for objectFit.
   * When breakpoint='mobile', checks responsiveProperties.mobile first.
   */
  const objectFit = getPropertyValue<'cover' | 'contain' | 'fill'>(
    element,
    'objectFit',
    breakpoint,
    element.objectFit || 'cover'
  )

  // ============================================================================
  // EFFECTS SUPPORT (shadows, blurs)
  // ============================================================================
  // Check for effects configuration in styles.__effects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effectsConfig = (visualStyles as any).__effects as EffectsConfig | undefined
  const effectsStyles = effectsConfigToCSS(effectsConfig)

  // ============================================================================
  // BORDER SUPPORT (per-side borders with gradient option)
  // ============================================================================
  // Check for border configuration in styles.__borderConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageBorderConfig = (visualStyles as any).__borderConfig as BorderConfig | undefined
  const imageBorderStyles = imageBorderConfig ? borderConfigToInlineStyles(imageBorderConfig) : {}
  const hasImageGradientBorder = imageBorderConfig && hasGradientBorder(imageBorderConfig)

  // ============================================================================
  // FADE EDGES EFFECT
  // ============================================================================
  // Get fade edges settings from element (responsive-aware)
  const fadeEdges = getSettingValue<ImageElement['fadeEdges']>(
    element,
    'fadeEdges',
    breakpoint,
    element.fadeEdges
  )
  const fadeEdgesHeight = getSettingValue<number>(
    element,
    'fadeEdgesHeight',
    breakpoint,
    element.fadeEdgesHeight
  ) ?? 10

  // ============================================================================
  // COLOR MASK FILTER
  // ============================================================================
  // Get colorMask setting from element (responsive-aware)
  // 'regular' = no filter, 'grayscale' = grayscale(100%)
  const colorMask = getPropertyValue<'regular' | 'grayscale'>(
    element,
    'colorMask',
    breakpoint,
    element.colorMask || 'regular'
  )
  const filterValue = colorMask === 'grayscale' ? 'grayscale(100%)' : undefined

  return applyFadeEdgesStyles(
    {
      position: hasImageGradientBorder ? 'relative' : 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      // Use non-shorthand overflow properties consistently to avoid React warnings
      overflowX: 'hidden',
      overflowY: 'hidden',
      zIndex: 0,

      // Smooth transitions for all property changes from the properties panel
      transition: 'all 150ms ease-out',

      // Visual styles from element.styles
      backgroundColor: visualStyles.backgroundColor,
      borderRadius: visualStyles.borderRadius ?? 0,

      // Image as background - src is rendered as background-image
      backgroundImage: element.src ? `url(${element.src})` : undefined,
      // objectFit maps to backgroundSize: cover, contain, or 100% 100% for fill
      backgroundSize: objectFit === 'fill' ? '100% 100%' : objectFit,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',

      // Apply effects (shadows, blurs)
      ...effectsStyles,

      // Apply border styles (per-side borders)
      ...imageBorderStyles,

      // Apply color mask filter (grayscale)
      filter: filterValue,
    },
    fadeEdges,
    fadeEdgesHeight
  )
}

/**
 * Default styles for video elements.
 * These are applied as base styles before user customizations.
 */
const DEFAULT_VIDEO_STYLES: React.CSSProperties = {
  backgroundColor: '#0a0a0a',
  borderRadius: 8,
  padding: 0,
}

/**
 * Computes the content div styles for a video element.
 *
 * HANDLES:
 * - Merging default styles with element styles
 * - Merging responsive styles when breakpoint is specified
 * - Applying effects (shadows, blurs)
 * - Applying border styles (per-side borders with gradient support)
 * - Applying fade edges effect
 *
 * @param element - The video element
 * @param options - Optional settings including breakpoint for responsive styles
 * @returns React.CSSProperties for the content div
 */
export function computeVideoContentStyles(
  element: VideoElement,
  options: ComputeStyleOptions = {}
): React.CSSProperties {
  const { breakpoint = 'desktop' } = options

  // Merge default styles with element styles (and responsive overrides if mobile)
  const visualStyles = breakpoint === 'mobile'
    ? mergeResponsiveStyles(element, breakpoint, DEFAULT_VIDEO_STYLES)
    : { ...DEFAULT_VIDEO_STYLES, ...(element.styles ?? {}) }

  // ============================================================================
  // EFFECTS SUPPORT (shadows, blurs)
  // ============================================================================
  // Check for effects configuration in styles.__effects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effectsConfig = (visualStyles as any).__effects as EffectsConfig | undefined
  const effectsStyles = effectsConfigToCSS(effectsConfig)

  // ============================================================================
  // BORDER SUPPORT (per-side borders with gradient option)
  // ============================================================================
  // Check for border configuration in styles.__borderConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoBorderConfig = (visualStyles as any).__borderConfig as BorderConfig | undefined
  const videoBorderStyles = videoBorderConfig ? borderConfigToInlineStyles(videoBorderConfig) : {}
  const hasVideoGradientBorder = videoBorderConfig && hasGradientBorder(videoBorderConfig)

  // ============================================================================
  // FADE EDGES EFFECT
  // ============================================================================
  // Get fade edges settings from element (responsive-aware)
  const fadeEdges = getSettingValue<VideoElement['fadeEdges']>(
    element,
    'fadeEdges',
    breakpoint,
    element.fadeEdges
  )
  const fadeEdgesHeight = getSettingValue<number>(
    element,
    'fadeEdgesHeight',
    breakpoint,
    element.fadeEdgesHeight
  ) ?? 10

  return applyFadeEdgesStyles(
    {
      position: hasVideoGradientBorder ? 'relative' : 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      // Use non-shorthand overflow properties consistently to avoid React warnings
      overflowX: 'hidden',
      overflowY: 'hidden',
      zIndex: 0,

      // Smooth transitions for all property changes from the properties panel
      transition: 'all 150ms ease-out',

      // Visual styles from element.styles
      backgroundColor: visualStyles.backgroundColor,
      borderRadius: visualStyles.borderRadius ?? 0,

      // Apply effects (shadows, blurs)
      ...effectsStyles,

      // Apply border styles (per-side borders)
      ...videoBorderStyles,
    },
    fadeEdges,
    fadeEdgesHeight
  )
}

/**
 * Variant-specific style presets for buttons.
 * These override default styles based on the button's variant property.
 */
const BUTTON_VARIANT_STYLES: Record<ButtonElement['variant'], React.CSSProperties> = {
  primary: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
  },
  secondary: {
    backgroundColor: '#374151',
    color: '#ffffff',
    border: 'none',
  },
  outline: {
    backgroundColor: 'transparent',
    color: '#3b82f6',
    border: '2px solid #3b82f6',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#374151',
    border: 'none',
  },
}

/**
 * Computes the content div styles for a button element.
 *
 * HANDLES:
 * - Merging default styles with element styles
 * - Merging responsive styles when breakpoint is specified
 * - Applying variant-specific overrides (primary, secondary, outline, ghost)
 * - Applying typography from element.styles (CSS properties)
 * - Centering button label via flexbox
 *
 * ============================================================================
 * TYPOGRAPHY NOW IN STYLES
 * ============================================================================
 *
 * Typography properties (fontFamily, fontSize, fontWeight) are now stored
 * in element.styles, NOT as direct element properties. DEFAULT_BUTTON_STYLES
 * includes typography defaults.
 *
 * BACKWARDS COMPATIBILITY:
 * For existing elements that still have typography on the element itself,
 * we check element.fontFamily first, then fall back to styles.fontFamily.
 *
 * ============================================================================
 * STYLE PRIORITY ORDER (lowest to highest):
 * ============================================================================
 *
 * 1. DEFAULT_BUTTON_STYLES (base defaults including typography)
 * 2. BUTTON_VARIANT_STYLES (variant-specific overrides)
 * 3. element.styles (user customizations)
 * 4. element.responsiveStyles.mobile (mobile overrides, when breakpoint is 'mobile')
 *
 * @param element - The button element
 * @param options - Optional settings including breakpoint for responsive styles
 * @returns React.CSSProperties for the content div
 */
export function computeButtonContentStyles(
  element: ButtonElement,
  options: ComputeStyleOptions = {}
): React.CSSProperties {
  const { breakpoint = 'desktop' } = options

  /**
   * Check if button is auto-sizing (content-based dimensions).
   * Uses autoWidth/autoHeight properties (default to false for backwards compat).
   * When enabled, we use relative positioning so the content defines size.
   */
  const isAutoWidth = element.autoWidth ?? false
  const isAutoHeight = element.autoHeight ?? false
  const isAutoSizing = isAutoWidth || isAutoHeight

  /**
   * Use responsive-aware getter for variant SETTING.
   * When breakpoint='mobile', checks responsiveSettings.mobile first.
   * Default to element.variant or 'primary' if undefined.
   */
  const variant = getSettingValue<'primary' | 'secondary' | 'outline' | 'ghost'>(
    element,
    'variant',
    breakpoint,
    element.variant
  ) ?? 'primary'

  // Get variant styles (defaults to primary if variant is invalid)
  const variantStyles = BUTTON_VARIANT_STYLES[variant] ?? BUTTON_VARIANT_STYLES.primary

  // Build the base styles (defaults + variant + custom)
  // DEFAULT_BUTTON_STYLES now includes typography defaults
  const baseStyles = {
    ...DEFAULT_BUTTON_STYLES,
    ...variantStyles,
    ...(element.styles ?? {}),
  }

  // For mobile breakpoint, merge responsive overrides on top
  const mergedStyles = breakpoint === 'mobile' && element.responsiveStyles?.mobile
    ? { ...baseStyles, ...element.responsiveStyles.mobile }
    : baseStyles

  /**
   * ========================================================================
   * TYPOGRAPHY FROM STYLES (with backwards compatibility)
   * ========================================================================
   *
   * Typography is now in element.styles. However, for backwards compatibility
   * with existing elements that have typography on the element directly,
   * we check element.fontFamily etc. first, then fall back to styles.
   */
  const fontFamily = element.fontFamily ?? mergedStyles.fontFamily ?? 'Inter'
  const fontSize = element.fontSize ?? mergedStyles.fontSize ?? 14
  const fontWeight = element.fontWeight ?? mergedStyles.fontWeight ?? 500

  // ============================================================================
  // BACKGROUND GRADIENT SUPPORT FOR BUTTONS
  // ============================================================================
  // Check for gradient configuration in styles.__backgroundGradient
  // Gradients take priority and will be applied via backgroundImage property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradientConfig = (mergedStyles as any).__backgroundGradient as GradientConfig | undefined

  // Build background styles - either solid color or gradient
  const backgroundStyles: React.CSSProperties = gradientConfig
    ? {
        // Gradient backgrounds use backgroundImage instead of backgroundColor
        backgroundImage: gradientConfigToCSS(gradientConfig),
        backgroundColor: 'transparent',
      }
    : {
        // Solid color - just use backgroundColor from variant/user styles
        backgroundColor: mergedStyles.backgroundColor,
      }

  // ============================================================================
  // EFFECTS SUPPORT FOR BUTTONS (shadows, blurs)
  // ============================================================================
  // Check for effects configuration in styles.__effects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effectsConfig = (mergedStyles as any).__effects as EffectsConfig | undefined
  const effectsStyles = effectsConfigToCSS(effectsConfig)

  // ============================================================================
  // BORDER SUPPORT FOR BUTTONS (per-side borders with gradient option)
  // ============================================================================
  // Check for border configuration in styles.__borderConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buttonBorderConfig = (mergedStyles as any).__borderConfig as BorderConfig | undefined
  const buttonBorderStyles = buttonBorderConfig ? borderConfigToInlineStyles(buttonBorderConfig) : {}
  const hasButtonGradientBorder = buttonBorderConfig && hasGradientBorder(buttonBorderConfig)

  // ============================================================================
  // FADE EDGES EFFECT
  // ============================================================================
  // Get fade edges settings from element (responsive-aware)
  const fadeEdges = getSettingValue<ButtonElement['fadeEdges']>(
    element,
    'fadeEdges',
    breakpoint,
    element.fadeEdges
  )
  const fadeEdgesHeight = getSettingValue<number>(
    element,
    'fadeEdgesHeight',
    breakpoint,
    element.fadeEdgesHeight
  ) ?? 10

  /**
   * When auto-sizing, use relative positioning so content defines size.
   * When fixed dimensions, use absolute with inset to fill the wrapper.
   */
  const positionStyles: React.CSSProperties = isAutoSizing
    ? {
        // Relative positioning - content defines size
        position: 'relative',
        width: isAutoWidth ? 'auto' : '100%',
        height: isAutoHeight ? 'auto' : '100%',
      }
    : {
        // Absolute positioning - fills the wrapper
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      }

  return applyFadeEdgesStyles(
    {
      ...positionStyles,
      // Overflow visible to allow badges and tooltips positioned outside button bounds.
      // Buttons typically don't need overflow:hidden since content is controlled.
      overflowX: 'visible',
      overflowY: 'visible',
      zIndex: 0,

      // Smooth transitions for all property changes from the properties panel
      transition: 'all 150ms ease-out',

      // Layout for centering label
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',

      // Visual styles (merged: defaults + variant + custom)
      // Background is either solid color or gradient (handled by backgroundStyles)
      ...backgroundStyles,
      color: mergedStyles.color,
      borderRadius: mergedStyles.borderRadius ?? 8,
      border: mergedStyles.border,
      padding: mergedStyles.padding,
      // NOTE: margin intentionally excluded — it's applied on the OUTER wrapper
      // by computeElementPositionStyles, not on the inner content div.

      // Typography - from styles with backwards compat fallback
      fontFamily: typeof fontFamily === 'string' ? `"${fontFamily}", sans-serif` : fontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,

      // Text rendering
      whiteSpace: 'nowrap',
      userSelect: 'none',

      // Apply effects (shadows, blurs)
      ...effectsStyles,

      // Apply border styles (per-side borders)
      // Note: This overrides the variant border if user has custom border config
      ...buttonBorderStyles,
      ...(hasButtonGradientBorder ? { position: 'relative' as const } : {}),
    },
    fadeEdges,
    fadeEdgesHeight
  )
}

/**
 * Computes final CSS styles for an Add to Cart button element.
 *
 * SOURCE OF TRUTH: Add to Cart Button Style Computation
 *
 * Add to Cart buttons use the exact same styling system as regular buttons.
 * This wrapper function converts the AddToCartButtonElement to a button-compatible
 * format and reuses computeButtonContentStyles for consistent styling.
 *
 * WHY A WRAPPER?
 * - Avoids duplicating complex style logic
 * - Ensures Add to Cart buttons look identical to regular buttons
 * - Single source of truth for button styling
 */
export function computeAddToCartButtonContentStyles(
  element: AddToCartButtonElement,
  options: ComputeStyleOptions = {}
): React.CSSProperties {
  // Convert AddToCartButtonElement to ButtonElement-compatible format
  // The only difference is the type - all other properties are identical
  const buttonLike: ButtonElement = {
    ...element,
    type: 'button',
    action: undefined, // Add to Cart has no action config
  }

  // Reuse the button style computation
  return computeButtonContentStyles(buttonLike, options)
}

/**
 * Computes content styles for a CartElement.
 *
 * SOURCE OF TRUTH: Cart Button Style Computation
 *
 * Converts the CartElement to ButtonElement-compatible format and reuses
 * computeButtonContentStyles for consistent styling.
 *
 * WHY A WRAPPER?
 * - Avoids duplicating complex style logic
 * - Ensures Cart buttons look identical to regular buttons
 * - Single source of truth for button styling
 */
export function computeCartContentStyles(
  element: CartElement,
  options: ComputeStyleOptions = {}
): React.CSSProperties {
  // Convert CartElement to ButtonElement-compatible format
  // Cart elements have similar properties but different defaults
  const buttonLike: ButtonElement = {
    ...element,
    type: 'button',
    label: element.label ?? '', // Default to empty string for icon-only
    action: undefined, // Cart has no action config - opens cart sheet automatically
  }

  // Reuse the button style computation
  return computeButtonContentStyles(buttonLike, options)
}

/**
 * Gets the merged styles for an element with defaults applied.
 * Useful when you need access to the raw style values (not CSS properties).
 *
 * @param element - Any canvas element with a styles property
 * @param defaults - The default styles to merge with
 * @returns Merged styles object
 */
export function getMergedStyles<T extends Record<string, unknown>>(
  elementStyles: ElementStyles | undefined,
  defaults: T
): T & ElementStyles {
  return { ...defaults, ...(elementStyles ?? {}) } as T & ElementStyles
}

// ============================================================================
// RESPONSIVE MODE UTILITIES
// ============================================================================

/**
 * Default fade edge size - how much of the edge fades (in percentage).
 * Can be overridden via fadeEdgesHeight property.
 */
const DEFAULT_FADE_EDGE_SIZE = 10 // 10% of the container size

/**
 * Builds CSS mask-image gradient(s) for the fade edges effect.
 *
 * Creates linear gradients that fade from transparent at the edge to black
 * (fully visible) toward the center. Multiple gradients are combined for
 * edges that require fading on multiple sides.
 *
 * @param fadeEdges - Which edges to fade ('top', 'bottom', 'left', 'right', 'top-bottom', 'left-right', 'all')
 * @param height - Fade height as percentage of container (1-50), defaults to 10
 * @returns CSS mask-image value string with comma-separated gradients, or null if none
 */
function buildFadeEdgeMaskGradients(
  fadeEdges: 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all',
  height: number = DEFAULT_FADE_EDGE_SIZE
): string | null {
  const gradients: string[] = []

  // Clamp height to valid range (1-50%)
  const fadeSize = Math.max(1, Math.min(50, height))

  // The mask gradient goes from transparent (fade) to black (visible)
  // We use a smooth multi-stop gradient for a nicer fade effect
  const fadeGradient = (direction: string) =>
    `linear-gradient(${direction}, transparent 0%, rgba(0,0,0,0.4) ${fadeSize * 0.3}%, rgba(0,0,0,0.7) ${fadeSize * 0.6}%, black ${fadeSize}%, black ${100 - fadeSize}%, rgba(0,0,0,0.7) ${100 - fadeSize * 0.6}%, rgba(0,0,0,0.4) ${100 - fadeSize * 0.3}%, transparent 100%)`

  // Single-edge gradients (fade only at one edge, rest is fully visible)
  const singleEdgeGradient = (direction: string, position: 'start' | 'end') => {
    if (position === 'start') {
      // Fade at start (top or left), rest is visible
      return `linear-gradient(${direction}, transparent 0%, rgba(0,0,0,0.4) ${fadeSize * 0.3}%, rgba(0,0,0,0.7) ${fadeSize * 0.6}%, black ${fadeSize}%)`
    } else {
      // Fade at end (bottom or right), rest is visible
      return `linear-gradient(${direction}, black ${100 - fadeSize}%, rgba(0,0,0,0.7) ${100 - fadeSize * 0.6}%, rgba(0,0,0,0.4) ${100 - fadeSize * 0.3}%, transparent 100%)`
    }
  }

  switch (fadeEdges) {
    case 'top':
      gradients.push(singleEdgeGradient('to bottom', 'start'))
      break
    case 'bottom':
      gradients.push(singleEdgeGradient('to bottom', 'end'))
      break
    case 'left':
      gradients.push(singleEdgeGradient('to right', 'start'))
      break
    case 'right':
      gradients.push(singleEdgeGradient('to right', 'end'))
      break
    case 'top-bottom':
      // Fade at both top and bottom (vertical)
      gradients.push(fadeGradient('to bottom'))
      break
    case 'left-right':
      // Fade at both left and right (horizontal)
      gradients.push(fadeGradient('to right'))
      break
    case 'all':
      // Fade at all four edges - combine horizontal and vertical gradients
      gradients.push(fadeGradient('to bottom'))
      gradients.push(fadeGradient('to right'))
      break
    default:
      return null
  }

  return gradients.length > 0 ? gradients.join(', ') : null
}

/**
 * Applies fade edges effect to any element's style object.
 *
 * This is a generic helper that can be used by ANY element type (frame, image, text, button)
 * to add the fade edges mask effect. The effect is applied via CSS mask-image.
 *
 * @param styles - The existing React.CSSProperties to merge with
 * @param fadeEdges - Which edges to fade ('none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all')
 * @param fadeEdgesHeight - Fade height as percentage (1-50), defaults to 10
 * @returns Updated styles object with mask-image applied (or original if no fade)
 */
export function applyFadeEdgesStyles(
  styles: React.CSSProperties,
  fadeEdges: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all' | undefined,
  fadeEdgesHeight: number = DEFAULT_FADE_EDGE_SIZE
): React.CSSProperties {
  if (!fadeEdges || fadeEdges === 'none') {
    return styles
  }

  const maskGradients = buildFadeEdgeMaskGradients(fadeEdges, fadeEdgesHeight)
  if (!maskGradients) {
    return styles
  }

  return {
    ...styles,
    maskImage: maskGradients,
    WebkitMaskImage: maskGradients,
  }
}

/**
 * Result of computing responsive classes and styles for a frame.
 * Separates Tailwind classes from inline style overrides.
 */
export interface ResponsiveFrameStyles {
  /** Tailwind classes for the wrapper div (positioning/sizing) */
  wrapperClassName: string
  /** Tailwind classes for the content div (flex layout) */
  contentClassName: string
  /** Inline style overrides for the wrapper (e.g., maxWidth) */
  wrapperStyleOverrides: React.CSSProperties
  /** Inline style overrides for the content (removes flexDirection if handled by Tailwind) */
  contentStyleOverrides: React.CSSProperties
}

/**
 * Computes Tailwind CSS classes and style overrides for responsive frame behavior.
 *
 * ============================================================================
 * SCROLL MODE
 * ============================================================================
 *
 * When the "scroll" property (stored as `responsive`) is enabled:
 * - Frame becomes scrollable (overflow: auto)
 * - Prevents content from overflowing outside the frame/page
 * - Works for both horizontal (row) and vertical (column) layouts
 * - Horizontal scrollbar hidden for cleaner look, but scroll still works
 *
 * Use cases:
 * - Horizontal product carousels
 * - Image galleries
 * - Scrollable lists
 * - Any content that shouldn't overflow
 *
 * ============================================================================
 * WRAP MODE
 * ============================================================================
 *
 * When flexWrap is 'wrap':
 * - Elements wrap to next line when they don't fit
 * - Frame height becomes auto (grows to fit wrapped rows)
 * - No scrolling (content wraps instead)
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * const responsive = computeResponsiveFrameStyles(element)
 *
 * <div
 *   className={responsive.wrapperClassName}
 *   style={{ ...baseWrapperStyle, ...responsive.wrapperStyleOverrides }}
 * >
 *   <div
 *     className={responsive.contentClassName}
 *     style={{ ...baseContentStyle, ...responsive.contentStyleOverrides }}
 *   >
 *     {children}
 *   </div>
 * </div>
 * ```
 *
 * @param element - The frame element with scroll/wrap settings
 * @returns Object containing Tailwind classes and style overrides
 */
export function computeResponsiveFrameStyles(element: FrameElement): ResponsiveFrameStyles {
  const classes: ResponsiveFrameStyles = {
    wrapperClassName: '',
    contentClassName: '',
    wrapperStyleOverrides: {},
    contentStyleOverrides: {},
  }

  // Get styles for checking flexDirection and flexWrap
  const styles = { ...DEFAULT_FRAME_STYLES, ...(element.styles ?? {}) }
  const flexDirection = styles.flexDirection as string || 'column'
  const flexWrap = styles.flexWrap as string || 'nowrap'

  const hasWrap = flexWrap === 'wrap'
  // Check scrollEnabled (new) with fallback to responsive (deprecated) for backwards compat
  // Scroll mode is disabled when wrap is enabled (wrap takes priority)
  const isScrollEnabled = (element.scrollEnabled ?? element.responsive) && !hasWrap

  // ========================================================================
  // DETERMINE IF HEIGHT SHOULD BE AUTO
  // ========================================================================
  // Height should adapt (minHeight + height: auto) when content can grow:
  // 1. flexWrap is 'wrap' (content wraps to new rows)
  //
  // Note: We removed scroll from auto-height because scroll mode should
  // keep fixed dimensions and add scrollbars instead.
  const shouldAutoHeight = hasWrap

  // ========================================================================
  // AUTO HEIGHT (for wrap mode)
  // ========================================================================
  // When wrap mode is active, the frame uses height: auto (handled by the
  // unified frame component). No wrapperStyleOverrides needed here — the
  // frame meta hook sets height: 'auto' directly and intentionally skips
  // minHeight to allow the frame to shrink-wrap its content.
  // (Previously this set minHeight: element.height which prevented fit-content
  // from actually shrinking below the stored height.)

  // ========================================================================
  // SCROLL MODE - Makes frame scrollable
  // ========================================================================
  // When scroll is enabled (responsive property):
  // - Add overflow: auto to enable scrolling in BOTH directions
  // - Hide scrollbars for cleaner look while keeping scroll functionality
  // - Works for both row and column layouts
  //
  // This prevents content from overflowing outside the frame/page bounds.
  if (isScrollEnabled) {
    classes.contentStyleOverrides = {
      ...classes.contentStyleOverrides,
      // Enable scrolling - auto shows scrollbar only when needed
      overflowX: flexDirection === 'row' ? 'auto' : 'hidden',
      overflowY: flexDirection === 'column' ? 'auto' : 'hidden',
      // Smooth scrolling for better UX
      scrollBehavior: 'smooth',
      // Hide scrollbar for cleaner look - users can still scroll with touch/trackpad
      scrollbarWidth: 'none', // Firefox
      msOverflowStyle: 'none', // IE/Edge
    } as React.CSSProperties

    // Add Tailwind class for hiding webkit scrollbar
    classes.contentClassName = 'scrollbar-hide'
  }

  // ========================================================================
  // FADE EDGES - Marquee-style fade effect for any frame
  // ========================================================================
  // Applies a CSS mask gradient to fade content at the specified edges.
  // This creates a smooth "fade to nothing" effect - commonly used for
  // carousels, marquees, or any container where you want soft edges.
  //
  // NOTE: This effect works independently of scroll mode. Users can apply
  // fade edges to any frame regardless of whether scrolling is enabled.
  //
  // Uses mask-image which affects opacity (not color blending), so it works
  // with ANY background color. The mask does NOT block pointer events.
  //
  // Mask gradients use black for visible and transparent for faded areas.
  const fadeEdges = element.fadeEdges
  const fadeEdgesHeight = element.fadeEdgesHeight ?? DEFAULT_FADE_EDGE_SIZE
  if (fadeEdges && fadeEdges !== 'none') {
    const maskGradients = buildFadeEdgeMaskGradients(fadeEdges, fadeEdgesHeight)
    if (maskGradients) {
      classes.contentStyleOverrides = {
        ...classes.contentStyleOverrides,
        maskImage: maskGradients,
        WebkitMaskImage: maskGradients,
        // Ensure mask compositing works correctly for multiple gradients
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      } as React.CSSProperties
    }
  }

  return classes
}

// ============================================================================
// BREAKPOINT-AWARE STYLE UTILITIES
// ============================================================================
// These utilities handle style merging for the responsive styling system.
// They allow elements to have different styles for desktop vs mobile views.
// ============================================================================

/**
 * Merges base styles with breakpoint-specific overrides.
 *
 * STYLE PRIORITY (lowest to highest):
 * 1. Default styles (from DEFAULT_*_STYLES)
 * 2. Base styles (element.styles) - "desktop" styles
 * 3. Breakpoint overrides (element.responsiveStyles[breakpoint]) - only if breakpoint !== 'desktop'
 *
 * @param element - Any canvas element with styles and optional responsiveStyles
 * @param breakpoint - The breakpoint to compute styles for ('desktop' | 'mobile')
 * @param defaults - Optional default styles to merge as base
 * @returns Merged styles for the given breakpoint
 *
 * @example
 * // Get mobile styles for a frame element
 * const mobileStyles = mergeResponsiveStyles(element, 'mobile', DEFAULT_FRAME_STYLES)
 *
 * // Desktop styles - just returns base styles (no overrides)
 * const desktopStyles = mergeResponsiveStyles(element, 'desktop', DEFAULT_FRAME_STYLES)
 */
export function mergeResponsiveStyles(
  element: CanvasElement,
  breakpoint: Breakpoint,
  defaults: Partial<ElementStyles> = {}
): ElementStyles {
  // Start with defaults and merge base styles
  const baseStyles = { ...defaults, ...(element.styles ?? {}) }

  // If desktop breakpoint, just return base styles (no overrides needed)
  if (breakpoint === 'desktop') {
    return baseStyles as ElementStyles
  }

  // For mobile breakpoint, merge in the responsive overrides
  const responsiveOverrides = element.responsiveStyles?.[breakpoint] ?? {}

  return { ...baseStyles, ...responsiveOverrides } as ElementStyles
}

/**
 * Gets a specific style property value for a given breakpoint.
 *
 * Useful in the properties panel to display the correct value based on
 * which breakpoint is currently being edited.
 *
 * LOOKUP ORDER for mobile:
 * 1. Check responsiveStyles.mobile[property]
 * 2. Fall back to styles[property]
 * 3. Fall back to defaultValue
 *
 * LOOKUP ORDER for desktop:
 * 1. Check styles[property]
 * 2. Fall back to defaultValue
 *
 * @param element - Any canvas element with styles and optional responsiveStyles
 * @param property - The style property to get (e.g., 'padding', 'flexDirection')
 * @param breakpoint - The breakpoint to get the value for ('desktop' | 'mobile')
 * @param defaultValue - Optional default value if property is not set
 * @returns The style value for the given breakpoint, or undefined
 *
 * @example
 * // Get padding for the current editing breakpoint
 * const padding = getStyleValue(element, 'padding', editingBreakpoint, '0px')
 *
 * // Check if mobile has a different flex direction
 * const mobileDirection = getStyleValue(element, 'flexDirection', 'mobile')
 */
export function getStyleValue<T = unknown>(
  element: CanvasElement,
  property: keyof ElementStyles,
  breakpoint: Breakpoint,
  defaultValue?: T
): T | undefined {
  // For mobile, check responsive overrides first
  if (breakpoint === 'mobile') {
    const mobileValue = element.responsiveStyles?.mobile?.[property]
    if (mobileValue !== undefined) {
      return mobileValue as T
    }
  }

  // Fall back to base styles
  const baseValue = element.styles?.[property]
  if (baseValue !== undefined) {
    return baseValue as T
  }

  // Return default if provided
  return defaultValue
}

/**
 * Checks if an element has any responsive style overrides.
 *
 * Used in the UI to show indicators (like a mobile icon badge in the layers
 * panel) when an element has mobile-specific styles defined.
 *
 * @param element - Any canvas element to check
 * @returns true if the element has at least one mobile style override
 *
 * @example
 * // In layers panel, show mobile icon if element has overrides
 * {hasResponsiveOverrides(element) && <SmartphoneIcon className="w-3 h-3" />}
 */
export function hasResponsiveOverrides(element: CanvasElement): boolean {
  const mobileStyles = element.responsiveStyles?.mobile
  // Return true if mobile styles exist and have at least one property
  return mobileStyles !== undefined && Object.keys(mobileStyles).length > 0
}

/**
 * Checks if a specific CSS style property has a mobile override.
 *
 * Used in the properties panel to show indicators (like a dot) next to
 * properties that have different values on mobile.
 *
 * @param element - Any canvas element to check
 * @param property - The style property to check
 * @returns true if the property has a mobile-specific override
 *
 * @example
 * // Show indicator dot if padding has a mobile override
 * {hasPropertyOverride(element, 'padding') && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
 */
export function hasPropertyOverride(
  element: CanvasElement,
  property: keyof ElementStyles
): boolean {
  return element.responsiveStyles?.mobile?.[property] !== undefined
}

// ============================================================================
// BREAKPOINT-AWARE SETTING UTILITIES
// ============================================================================
// These utilities handle NON-CSS SETTING overrides for the responsive system.
// Settings like autoWidth, responsive, variant, objectFit, etc. are stored
// directly on elements, not in the styles object.
//
// IMPORTANT: Typography (fontSize, fontFamily, etc.) is NOW in STYLES,
// not settings. Use getStyleValue for typography values.
// ============================================================================

/**
 * Gets a specific element SETTING value for a given breakpoint.
 *
 * ============================================================================
 * SETTINGS vs STYLES
 * ============================================================================
 *
 * SETTINGS: Element-specific behavioral configurations (NOT CSS properties)
 * - autoWidth, autoHeight, responsive, sticky, variant, objectFit, etc.
 * - Stored directly on elements: element.autoWidth
 * - Mobile overrides in: element.responsiveSettings.mobile
 *
 * STYLES: Visual/CSS properties (stored in element.styles)
 * - backgroundColor, fontSize, fontFamily, padding, etc.
 * - Use getStyleValue() for these instead.
 *
 * ============================================================================
 * LOOKUP ORDER
 * ============================================================================
 *
 * For mobile breakpoint:
 * 1. Check responsiveSettings.mobile[setting]
 * 2. Fall back to element[setting]
 * 3. Fall back to defaultValue
 *
 * For desktop breakpoint:
 * 1. Check element[setting]
 * 2. Fall back to defaultValue
 *
 * @param element - Any canvas element to get setting from
 * @param setting - The setting name to get
 * @param breakpoint - The breakpoint to get the value for ('desktop' | 'mobile')
 * @param defaultValue - Optional default value if setting is not set
 * @returns The setting value for the given breakpoint, or defaultValue
 *
 * @example
 * // Get autoWidth setting for the current editing breakpoint
 * const autoWidth = getSettingValue(element, 'autoWidth', editingBreakpoint, false)
 *
 * // Check if variant is different on mobile
 * const mobileVariant = getSettingValue(buttonElement, 'variant', 'mobile', 'primary')
 */
export function getSettingValue<T = unknown>(
  element: CanvasElement,
  setting: keyof ResponsiveSettingsOverrides,
  breakpoint: Breakpoint,
  defaultValue?: T
): T | undefined {
  // For mobile, check responsive setting overrides first
  // Check both new (responsiveSettings) and deprecated (responsiveProperties) field
  if (breakpoint === 'mobile') {
    const mobileValue = element.responsiveSettings?.mobile?.[setting]
      ?? element.responsiveProperties?.mobile?.[setting]
    if (mobileValue !== undefined) {
      return mobileValue as T
    }
  }

  // Fall back to base element setting
  // We need to access the setting dynamically, type-safely
  // Cast through unknown first to avoid TypeScript strict mode error
  const baseValue = (element as unknown as Record<string, unknown>)[setting]
  if (baseValue !== undefined) {
    return baseValue as T
  }

  // Return default if provided
  return defaultValue
}

/**
 * @deprecated Use getSettingValue instead.
 * Kept for backwards compatibility during migration.
 */
export function getPropertyValue<T = unknown>(
  element: CanvasElement,
  property: keyof ResponsivePropertyOverrides,
  breakpoint: Breakpoint,
  defaultValue?: T
): T | undefined {
  return getSettingValue<T>(element, property, breakpoint, defaultValue)
}

/**
 * Checks if an element has any responsive SETTING overrides.
 *
 * Similar to hasResponsiveOverrides but for NON-CSS settings.
 * Used in the UI to show indicators when an element has mobile-specific
 * setting values defined (like different autoWidth or variant on mobile).
 *
 * @param element - Any canvas element to check
 * @returns true if the element has at least one mobile setting override
 *
 * @example
 * // In layers panel, show indicator if element has setting overrides
 * {hasResponsiveSettingOverrides(element) && <SettingsIcon className="w-3 h-3" />}
 */
export function hasResponsiveSettingOverrides(element: CanvasElement): boolean {
  // Check both new (responsiveSettings) and deprecated (responsiveProperties) field
  const mobileSettings = element.responsiveSettings?.mobile ?? element.responsiveProperties?.mobile
  // Return true if mobile settings exist and have at least one setting
  return mobileSettings !== undefined && Object.keys(mobileSettings).length > 0
}

/**
 * @deprecated Use hasResponsiveSettingOverrides instead.
 * Kept for backwards compatibility during migration.
 */
export function hasResponsivePropertyOverrides(element: CanvasElement): boolean {
  return hasResponsiveSettingOverrides(element)
}

/**
 * Checks if a specific element SETTING has a mobile override.
 *
 * Similar to hasPropertyOverride but for NON-CSS settings.
 * Used in the properties panel to show indicators (like a dot) next to
 * settings that have different values on mobile.
 *
 * @param element - Any canvas element to check
 * @param setting - The setting name to check
 * @returns true if the setting has a mobile-specific override
 *
 * @example
 * // Show indicator dot if autoWidth has a mobile override
 * {hasSettingOverride(element, 'autoWidth') && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
 */
export function hasSettingOverride(
  element: CanvasElement,
  setting: keyof ResponsiveSettingsOverrides
): boolean {
  // Check both new (responsiveSettings) and deprecated (responsiveProperties) field
  return element.responsiveSettings?.mobile?.[setting] !== undefined
    || element.responsiveProperties?.mobile?.[setting] !== undefined
}

/**
 * @deprecated Use hasSettingOverride instead.
 * Kept for backwards compatibility during migration.
 */
export function hasBasePropertyOverride(
  element: CanvasElement,
  property: keyof ResponsivePropertyOverrides
): boolean {
  return hasSettingOverride(element, property)
}

/**
 * Checks if an element has ANY responsive overrides (styles OR settings).
 *
 * Combined check that returns true if the element has either:
 * - Mobile style overrides (responsiveStyles.mobile)
 * - Mobile setting overrides (responsiveSettings.mobile)
 *
 * Used in the layers panel to show a single indicator for any responsive changes.
 *
 * @param element - Any canvas element to check
 * @returns true if the element has any mobile overrides
 *
 * @example
 * // In layers panel, show mobile icon if element has any overrides
 * {hasAnyResponsiveOverrides(element) && <SmartphoneIcon className="w-3 h-3" />}
 */
export function hasAnyResponsiveOverrides(element: CanvasElement): boolean {
  return hasResponsiveOverrides(element) || hasResponsiveSettingOverrides(element)
}

// ============================================================================
// VISIBILITY STATE UTILITIES
// ============================================================================

/**
 * Visibility state for an element across breakpoints.
 *
 * Used to determine which visibility icons to show in the layers panel:
 * - Mobile icon: Element is visible ONLY on mobile (hidden on desktop)
 * - Desktop icon: Element is visible ONLY on desktop (hidden on mobile)
 * - No icon: Element is visible on both, or hidden on both (eye toggle off)
 */
export interface VisibilityState {
  /** Whether element is visible on desktop (base visibility) */
  desktopVisible: boolean

  /** Whether element is visible on mobile (respects responsive overrides) */
  mobileVisible: boolean

  /**
   * Whether element is visible on at least one breakpoint.
   * Used to determine if the element should be shown on the canvas at all.
   * If false, element is completely hidden (visibility off on both breakpoints).
   */
  isVisibleOnAny: boolean

  /**
   * Whether element is visible ONLY on mobile (hidden on desktop).
   * Used to show mobile-only icon in layers panel.
   */
  mobileOnly: boolean

  /**
   * Whether element is visible ONLY on desktop (hidden on mobile).
   * Used to show desktop-only icon in layers panel.
   */
  desktopOnly: boolean
}

/**
 * Gets the visibility state for an element across all breakpoints.
 *
 * ============================================================================
 * VISIBILITY LOGIC
 * ============================================================================
 *
 * Desktop visibility: element.visible (base setting)
 * Mobile visibility:  element.responsiveSettings?.mobile?.visible ?? element.visible
 *
 * If no mobile override exists, mobile inherits the desktop visibility.
 * If a mobile override exists (even if true), it takes precedence.
 *
 * ============================================================================
 * USE CASES
 * ============================================================================
 *
 * 1. Show on both: desktopVisible=true, no mobile override
 *    → isVisibleOnAny=true, mobileOnly=false, desktopOnly=false
 *
 * 2. Hide on both: desktopVisible=false, no mobile override
 *    → isVisibleOnAny=false, mobileOnly=false, desktopOnly=false
 *
 * 3. Desktop only: desktopVisible=true, mobileVisible=false
 *    → isVisibleOnAny=true, mobileOnly=false, desktopOnly=true
 *
 * 4. Mobile only: desktopVisible=false, mobileVisible=true
 *    → isVisibleOnAny=true, mobileOnly=true, desktopOnly=false
 *
 * @param element - Any canvas element
 * @returns VisibilityState object with all visibility flags
 */
export function getVisibilityState(element: CanvasElement): VisibilityState {
  // Desktop visibility is the base `visible` setting
  const desktopVisible = element.visible

  // Mobile visibility: check for responsive override, fallback to desktop
  // Check both new (responsiveSettings) and deprecated (responsiveProperties) field
  const mobileOverride = element.responsiveSettings?.mobile?.visible
    ?? element.responsiveProperties?.mobile?.visible

  // If mobile override is explicitly set (true or false), use it
  // Otherwise, inherit from desktop visibility
  const mobileVisible = mobileOverride !== undefined ? mobileOverride : desktopVisible

  return {
    desktopVisible,
    mobileVisible,
    isVisibleOnAny: desktopVisible || mobileVisible,
    mobileOnly: !desktopVisible && mobileVisible,
    desktopOnly: desktopVisible && !mobileVisible,
  }
}

// ============================================================================
// UNIFIED FRAME SIZING SYSTEM
// ============================================================================
// These utilities provide a SINGLE SOURCE OF TRUTH for computing frame sizing
// across both the canvas editor and the preview/published renderer.
//
// The goal is to eliminate scattered sizing logic and ensure consistent behavior.
// ============================================================================

/**
 * SOURCE OF TRUTH: Frame Sizing Computation Result
 *
 * Contains all computed sizing values for a frame element.
 * Used by both canvas (frame-element.tsx) and renderer (frame-element-renderer.tsx).
 */
export interface FrameSizingResult {
  /**
   * Computed width value - either a pixel number or '100%' for auto-width.
   */
  width: number | string

  /**
   * Computed height value - either a pixel number or 'auto' for wrap mode.
   */
  height: number | string

  /**
   * Whether the frame should use minHeight instead of fixed height.
   * True when wrap mode is enabled (flexWrap: 'wrap').
   */
  useMinHeight: boolean

  /**
   * Whether width uses 100% (fill container) mode.
   */
  hasAutoWidth: boolean

  /**
   * Whether wrap mode is enabled (flexWrap: 'wrap').
   * When true, children wrap to next line and frame height is auto.
   */
  hasWrap: boolean

  /**
   * Whether responsive smart grid mode is enabled.
   * When true, the frame uses CSS Grid with auto-fill columns.
   */
  isSmartGrid: boolean

  /**
   * Whether scroll mode is enabled.
   * When true, the frame becomes scrollable for overflowing content.
   */
  isScrollEnabled: boolean

  /**
   * Overflow style for the WRAPPER element.
   * - 'hidden': When scroll mode is enabled (wrapper clips, content scrolls)
   * - 'visible': When scroll mode is disabled (content can overflow)
   */
  wrapperOverflow: 'visible' | 'hidden'

  /**
   * Overflow styles for the CONTENT element (separate x and y).
   * - 'auto': Enables scrolling in that direction (only when scroll enabled)
   * - 'hidden': Clips content in that direction
   * - 'visible': Content can overflow (default)
   */
  contentOverflow: {
    x: 'visible' | 'auto' | 'hidden'
    y: 'visible' | 'auto' | 'hidden'
  }

  /** When set, applies flex shorthand for equal space distribution in row parents */
  flex?: string
  /** When set, allows flex items to shrink below content width */
  minWidth?: number
}

/**
 * Gets whether scroll mode is enabled, with backwards compatibility.
 *
 * SOURCE OF TRUTH: Scroll Mode Detection
 *
 * Checks `scrollEnabled` first (new property), then falls back to `responsive`
 * (deprecated property) for backwards compatibility with existing saved pages.
 *
 * USAGE:
 * ```ts
 * const isScrollEnabled = getScrollEnabled(element, breakpoint)
 * ```
 *
 * @param element - The frame element to check
 * @param breakpoint - The current breakpoint ('desktop' | 'mobile')
 * @returns true if scroll mode is enabled, false otherwise
 */
export function getScrollEnabled(element: FrameElement, breakpoint: Breakpoint): boolean {
  // Check scrollEnabled first (new property)
  const scrollEnabledValue = getSettingValue<boolean>(
    element,
    'scrollEnabled',
    breakpoint,
    undefined
  )

  // If scrollEnabled is explicitly set, use it
  if (scrollEnabledValue !== undefined) {
    return scrollEnabledValue
  }

  // Fall back to responsive (deprecated property) for backwards compatibility
  const responsiveValue = getSettingValue<boolean>(
    element,
    'responsive',
    breakpoint,
    false
  )

  return responsiveValue ?? false
}

/**
 * Computes all sizing values for a frame element.
 *
 * SOURCE OF TRUTH: Frame Sizing Computation
 *
 * This function consolidates all sizing logic that was previously scattered
 * across frame-element.tsx and frame-element-renderer.tsx. Both components
 * should use this function to ensure consistent behavior.
 *
 * SIZING MODES:
 * 1. Width: Fixed (pixels) vs Fill (100%)
 * 2. Height: Fixed (pixels) vs Fit Content (auto when wrap enabled)
 * 3. Overflow: Visible vs Scroll (when scroll mode enabled)
 *
 * INTERACTION:
 * - Wrap mode → height: auto (frame grows with wrapped content)
 * - Scroll mode → overflow: auto (content scrolls within fixed bounds)
 * - Scroll mode and wrap are mutually exclusive for height behavior
 *
 * USAGE:
 * ```ts
 * const sizing = computeFrameSizing(element, breakpoint)
 *
 * // Use in wrapper div:
 * style={{
 *   width: sizing.width,
 *   height: sizing.height,
 *   overflow: sizing.wrapperOverflow,
 * }}
 *
 * // Use in content div:
 * style={{
 *   overflowX: sizing.contentOverflow.x,
 *   overflowY: sizing.contentOverflow.y,
 * }}
 * ```
 *
 * @param element - The frame element to compute sizing for
 * @param breakpoint - The current breakpoint ('desktop' | 'mobile')
 * @param parentFlexDirection - Optional parent frame's flex-direction for autoWidth behavior
 * @returns FrameSizingResult with all computed sizing values
 */
export function computeFrameSizing(
  element: FrameElement,
  breakpoint: Breakpoint,
  parentFlexDirection?: string
): FrameSizingResult {
  // Get responsive-aware property values
  const frameWidth = getSettingValue<number>(element, 'width', breakpoint, element.width) ?? element.width
  const frameHeight = getSettingValue<number>(element, 'height', breakpoint, element.height) ?? element.height

  // Check if autoWidth is enabled (fills parent container with 100%)
  const hasAutoWidth = getSettingValue<boolean>(element, 'autoWidth', breakpoint, false) ?? false

  // Get styles for checking flexWrap
  const styles = { ...DEFAULT_FRAME_STYLES, ...(element.styles ?? {}) }
  const flexDirection = (styles.flexDirection as string) || 'column'

  // Check if wrap mode is enabled (children wrap to multiple rows)
  // Note: We read this from styles, not settings, because flexWrap is a CSS property
  const hasWrap = styles.flexWrap === 'wrap'

  // Check if smart grid mode is enabled — auto-height like wrap mode
  const isSmartGrid = getSettingValue<boolean>(element, 'smartGrid', breakpoint, false) ?? false

  // Check if scroll mode is enabled (with backwards compat for 'responsive')
  // IMPORTANT: When wrap or smart grid is enabled, scroll doesn't make sense
  const isScrollEnabled = getScrollEnabled(element, breakpoint) && !hasWrap && !isSmartGrid

  // Check if parent is a row layout (horizontal main axis)
  const isParentRow = parentFlexDirection === 'row' || parentFlexDirection === 'row-reverse'

  // Determine width value
  // autoWidth: always '100%' so inner content resolves percentage widths correctly.
  // In row parents, flex: 1 1 0% overrides width for flex layout (flex-basis takes priority).
  const width: number | string = hasAutoWidth ? '100%' : frameWidth

  // Flex properties for row parents with autoWidth
  const flex: string | undefined = hasAutoWidth && isParentRow ? '1 1 0%' : undefined
  const minWidth: number | undefined = hasAutoWidth && isParentRow ? 0 : undefined

  // Determine height value
  // - Wrap mode or smart grid: height is auto (frame grows with content)
  // - Normal mode: fixed pixel height
  const height: number | string = (hasWrap || isSmartGrid) ? 'auto' : frameHeight

  // Wrap-mode frames do NOT use minHeight — the frame should shrink to exactly
  // its children's size when "Fit Content" is enabled. A minHeight floor creates
  // visible extra space at the bottom, especially with images inside frames.
  const useMinHeight = false

  // Determine wrapper overflow
  // - Scroll mode: wrapper must be hidden to allow content div to scroll
  // - Normal mode: visible (content can overflow if needed)
  const wrapperOverflow: 'visible' | 'hidden' = isScrollEnabled ? 'hidden' : 'visible'

  // Determine content overflow (separate x and y)
  // - Scroll mode: auto in the scroll direction, hidden in the other
  // - Normal mode: visible (default web behavior)
  const contentOverflow: { x: 'visible' | 'auto' | 'hidden'; y: 'visible' | 'auto' | 'hidden' } =
    isScrollEnabled
      ? {
          x: flexDirection === 'row' ? 'auto' : 'hidden',
          y: flexDirection === 'column' ? 'auto' : 'hidden',
        }
      : {
          x: 'visible',
          y: 'visible',
        }

  return {
    width,
    height,
    useMinHeight,
    hasAutoWidth,
    hasWrap,
    isSmartGrid,
    isScrollEnabled,
    wrapperOverflow,
    contentOverflow,
    flex,
    minWidth,
  }
}
