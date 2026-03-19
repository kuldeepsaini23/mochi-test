/**
 * ============================================================================
 * UNIFIED PREBUILT LOGO CAROUSEL - Single Component for Canvas + Preview
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedPrebuiltLogoCarousel, unified-prebuilt-logo-carousel,
 * logo-carousel-unified, prebuilt-logo-carousel-unified
 *
 * This component replaces BOTH:
 *   - prebuilt-elements/prebuilt-logo-carousel.tsx (canvas editor)
 *   - renderers/page-renderer/prebuilt-logo-carousel-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * Renders a horizontal strip of logo images with optional infinite CSS marquee
 * animation. Logos are managed entirely through the Settings panel — users
 * cannot select, drag, or delete individual logos on the canvas.
 *
 * CANVAS MODE (mode='canvas'):
 *   - Returns CONTENT ONLY (horizontal row of logo images)
 *   - The parent ElementWrapper handles all editor chrome:
 *     selection ring, hover ring, resize handles, labels, drag handlers
 *   - No auto-scroll animation (static display for editing clarity)
 *
 * PREVIEW MODE (mode='preview'):
 *   - Returns a SELF-CONTAINED wrapper with position/size styles
 *   - Uses computeElementPositionStyles() and useElementSizeStyles()
 *   - When autoScroll is enabled, children are duplicated for seamless
 *     CSS translateX loop animation that pauses on hover
 *   - Logos with href are wrapped in <a> tags for navigation
 *
 * ============================================================================
 * AUTO-SCROLL MARQUEE
 * ============================================================================
 *
 * The infinite scrolling effect uses the same pattern as unified-frame.tsx:
 *
 * 1. A CSS @keyframes animation translates a flex container by -50% (left)
 *    or from -50% to 0 (right)
 * 2. Children are duplicated (rendered twice) so the second copy seamlessly
 *    fills in as the first scrolls out of view
 * 3. The animation pauses on hover for accessibility
 * 4. Speed is configurable: duration = (totalContentWidth) / speed
 *
 * The keyframe name is scoped to the element ID to avoid conflicts when
 * multiple logo carousels exist on the same page.
 *
 * ============================================================================
 * CUSTOMIZABLE SETTINGS
 * ============================================================================
 *
 * - logos: Array of LogoCarouselLogo entries (id, src, alt, href, openInNewTab)
 * - logoSize: Width & height of each logo in pixels (default: 100)
 * - gap: Spacing between logos in pixels (default: 20)
 * - grayscale: Apply CSS grayscale filter for a professional look (default: true)
 * - objectFit: How logo images fit their container — contain or cover (default: 'contain')
 * - autoScroll: Enable infinite marquee animation (default: false)
 * - autoScrollSpeed: Animation speed in pixels per second (default: 50)
 * - autoScrollDirection: Scroll direction — left or right (default: 'left')
 * - padding: Inner padding of the carousel container in pixels (default: 20)
 *
 * ============================================================================
 */

'use client'

import React, { memo, useMemo } from 'react'
import type { PreBuiltLogoCarouselElement, LogoCarouselLogo } from '../../_lib/prebuilt'
import { useRenderMode } from '../../_lib/render-mode-context'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { applyFadeEdgesStyles } from '../../_lib/style-utils'
import { effectsConfigToCSS } from '../../_lib/effect-utils'
import type { EffectsConfig } from '../../_lib/types'

// ============================================================================
// DEFAULTS — Fallback values matching LogoCarouselSettings defaults
// ============================================================================

/** Default logo size in pixels (width & height) */
const DEFAULT_LOGO_SIZE = 100

/** Default gap between logos in pixels */
const DEFAULT_GAP = 20

/** Default grayscale filter — true for professional muted look */
const DEFAULT_GRAYSCALE = true

/** Default object-fit mode for logo images */
const DEFAULT_OBJECT_FIT: 'contain' | 'cover' = 'contain'

/** Default auto-scroll state — disabled until user opts in */
const DEFAULT_AUTO_SCROLL = false

/** Default auto-scroll speed in pixels per second */
const DEFAULT_AUTO_SCROLL_SPEED = 50

/** Default auto-scroll direction */
const DEFAULT_AUTO_SCROLL_DIRECTION: 'left' | 'right' = 'left'

/** Default padding around the carousel container */
const DEFAULT_PADDING = 20

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedPrebuiltLogoCarousel component.
 *
 * SOURCE OF TRUTH: UnifiedPrebuiltLogoCarouselProps
 *
 * Only requires the element data. Mode detection is handled internally
 * via useRenderMode() — never passed as a prop.
 */
export interface UnifiedPrebuiltLogoCarouselProps {
  /** The logo carousel prebuilt element data.
   * SOURCE OF TRUTH: PreBuiltLogoCarouselElement from _lib/prebuilt/types.ts */
  element: PreBuiltLogoCarouselElement
}

// ============================================================================
// LOGO ITEM — Renders a single logo image with optional link wrapper
// ============================================================================

/**
 * Props for the LogoItem sub-component.
 *
 * SOURCE OF TRUTH: LogoItemProps, logo-item-sub-component
 */
interface LogoItemProps {
  /** The logo data (src, alt, href, openInNewTab) */
  logo: LogoCarouselLogo

  /** Size in pixels for both width and height */
  size: number

  /** How the image fits its container */
  objectFit: 'contain' | 'cover'

  /** Whether to apply CSS grayscale filter */
  grayscale: boolean

  /** Whether we're in preview mode — only preview mode renders links */
  isPreview: boolean
}

/**
 * Renders a single logo image with consistent sizing and optional link wrapping.
 *
 * In preview mode, if the logo has an href, the image is wrapped in an <a> tag
 * for navigation. In canvas mode, links are never rendered to avoid accidental
 * navigation while editing.
 *
 * The grayscale filter is applied via CSS filter property and transitions to
 * full color on hover for a polished interaction effect.
 */
function LogoItem({ logo, size, objectFit, grayscale, isPreview }: LogoItemProps) {
  /**
   * The core image element — shared between linked and non-linked variants.
   * Uses explicit width/height with object-fit for consistent sizing regardless
   * of the source image dimensions.
   */
  const imageElement = (
    <img
      src={logo.src}
      alt={logo.alt || 'Logo'}
      draggable={false}
      style={{
        width: size,
        height: size,
        objectFit,
        /* Grayscale filter with hover transition — muted by default, full color on hover */
        filter: grayscale ? 'grayscale(100%)' : 'none',
        transition: 'filter 0.3s ease',
        /* Prevent image from being selected or dragged in canvas mode */
        userSelect: 'none',
        pointerEvents: 'none',
        flexShrink: 0,
      }}
    />
  )

  /**
   * In preview mode, wrap the image in a link if href is provided.
   * In canvas mode, never render links to prevent accidental navigation.
   */
  if (isPreview && logo.href) {
    return (
      <a
        href={logo.href}
        target={logo.openInNewTab ? '_blank' : undefined}
        rel={logo.openInNewTab ? 'noopener noreferrer' : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {imageElement}
      </a>
    )
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {imageElement}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Unified PreBuilt Logo Carousel component.
 *
 * Renders a horizontal strip of logo images in both canvas and preview modes.
 * The visual output is nearly identical in both modes, with two key differences:
 *
 * 1. Preview mode can enable auto-scroll marquee animation (canvas shows static)
 * 2. Preview mode wraps logos with href in clickable <a> tags
 *
 * Canvas mode: Returns content directly (ElementWrapper handles chrome)
 * Preview mode: Wraps content in a positioned div for page layout
 */
export const UnifiedPrebuiltLogoCarousel = memo(function UnifiedPrebuiltLogoCarousel({
  element,
}: UnifiedPrebuiltLogoCarouselProps) {
  /**
   * Get the current rendering mode from context.
   * Canvas mode = inside the builder editor (ElementWrapper provides chrome).
   * Preview mode = published site or preview panel (self-contained positioning).
   */
  const { mode, breakpoint } = useRenderMode()
  const isPreview = mode === 'preview'

  const { settings, styles } = element

  // ==========================================================================
  // EXTRACT SETTINGS WITH DEFAULTS
  // ==========================================================================

  /**
   * Extract all carousel settings with sensible defaults.
   * SOURCE OF TRUTH: LogoCarouselSettings from _lib/prebuilt/types.ts
   */
  const logos = settings.logos || []
  const logoSize = settings.logoSize ?? DEFAULT_LOGO_SIZE
  const gap = settings.gap ?? DEFAULT_GAP
  const grayscale = settings.grayscale ?? DEFAULT_GRAYSCALE
  const objectFit = settings.objectFit ?? DEFAULT_OBJECT_FIT
  const autoScroll = settings.autoScroll ?? DEFAULT_AUTO_SCROLL
  const autoScrollSpeed = settings.autoScrollSpeed ?? DEFAULT_AUTO_SCROLL_SPEED
  const autoScrollDirection = settings.autoScrollDirection ?? DEFAULT_AUTO_SCROLL_DIRECTION
  const padding = settings.padding ?? DEFAULT_PADDING

  // ==========================================================================
  // EFFECTS (box-shadow, filters, etc.) — Read from styles.__effects
  // ==========================================================================

  /**
   * Extract effects config from element styles and convert to CSS properties.
   * This handles box-shadow, backdrop-filter, and other effect properties
   * that are stored in the special __effects key on the styles object.
   */
  const effectsConfig = (styles as Record<string, unknown>)?.__effects as EffectsConfig | undefined
  const effectsStyles = effectsConfigToCSS(effectsConfig)

  // ==========================================================================
  // FADE EDGES — CSS mask-image gradient at container edges
  // ==========================================================================

  /**
   * Read fade edges settings from the element. These are set by the design
   * panel's effects control and stored as top-level element properties.
   * applyFadeEdgesStyles() will add maskImage/WebkitMaskImage to the
   * content container styles when a fade direction is active.
   */
  const fadeEdges = element.fadeEdges
  const fadeEdgesHeight = element.fadeEdgesHeight ?? 10

  // ==========================================================================
  // AUTO-SCROLL KEYFRAMES — CSS animation for infinite marquee effect
  // ==========================================================================

  /**
   * Generate CSS keyframes for the auto-scroll marquee animation.
   * Only computed when autoScroll is enabled in preview mode.
   *
   * The animation name is scoped to the element ID to avoid conflicts
   * when multiple logo carousels exist on the same page.
   *
   * Left direction: translateX(0) -> translateX(-50%)
   *   The content slides left, and the duplicated children fill in seamlessly.
   *
   * Right direction: translateX(-50%) -> translateX(0)
   *   Starts offset and slides right back to origin, then loops.
   */
  const autoScrollKeyframes = useMemo(() => {
    if (!autoScroll || !isPreview) return null

    const animationName = `logoCarousel_${element.id.replace(/[^a-zA-Z0-9]/g, '_')}`
    const keyframes =
      autoScrollDirection === 'left'
        ? `@keyframes ${animationName} { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`
        : `@keyframes ${animationName} { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }`

    return { animationName, keyframes }
  }, [autoScroll, isPreview, element.id, autoScrollDirection])

  // ==========================================================================
  // LOGO ITEMS — Rendered list of LogoItem sub-components
  // ==========================================================================

  /**
   * Render the array of logo items. Each logo is rendered as a LogoItem
   * with consistent sizing, object-fit, and optional grayscale filter.
   */
  const logoItems = logos.map((logo) => (
    <LogoItem
      key={logo.id}
      logo={logo}
      size={logoSize}
      objectFit={objectFit}
      grayscale={grayscale}
      isPreview={isPreview}
    />
  ))

  // ==========================================================================
  // SHARED CONTENT — Logo row with gap and optional auto-scroll
  // ==========================================================================

  /**
   * Build the inner content for the carousel.
   *
   * When auto-scroll is enabled (preview mode only):
   *   - Children are duplicated for seamless infinite loop
   *   - A CSS translateX animation handles the scrolling
   *   - Animation pauses on hover for accessibility
   *   - The outer container hides overflow to clip the scrolling track
   *
   * When auto-scroll is disabled (or in canvas mode):
   *   - Simple horizontal flex row with gap between logos
   */
  const renderContent = () => {
    if (isPreview && autoScroll && autoScrollKeyframes) {
      /**
       * Calculate animation duration based on total content width and speed.
       * totalContentWidth estimates the width of all logos + gaps, doubled for
       * the duplicate set. Duration = width / speed gives consistent perceived speed.
       */
      const totalContentWidth = logos.length * (logoSize + gap) * 2
      const duration = totalContentWidth / autoScrollSpeed

      return (
        <>
          {/* Inject scoped keyframes for this specific carousel instance */}
          <style>{autoScrollKeyframes.keyframes}</style>

          {/* Scrolling track — flex row that translates via CSS animation */}
          <div
            data-auto-scroll-container
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap,
              width: 'max-content',
              animation: `${autoScrollKeyframes.animationName} ${duration}s linear infinite`,
            }}
            /* Pause animation on hover for accessibility */
            onMouseEnter={(e) => {
              e.currentTarget.style.animationPlayState = 'paused'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.animationPlayState = 'running'
            }}
          >
            {/* Original logos */}
            {logoItems}
            {/* Duplicated logos for seamless loop — visually fills the gap
                as the first set scrolls out of view */}
            {logoItems}
          </div>
        </>
      )
    }

    /* Static layout — simple horizontal flex row without animation */
    return logoItems
  }

  // ==========================================================================
  // CONTENT CONTAINER STYLES — Applied to the inner content wrapper
  // ==========================================================================

  /**
   * Content container styles differ based on whether auto-scroll is active.
   *
   * With auto-scroll: display=block + overflow=hidden so the scrolling track
   * (a flex child wider than the container) is clipped at the edges.
   *
   * Without auto-scroll: display=flex for standard horizontal logo layout.
   *
   * In both cases, user-configured styles (background, border, borderRadius, etc.)
   * and effects styles (box-shadow, etc.) are spread on the container.
   * margin is stripped — it belongs on the outer positional wrapper, not the content.
   */
  const baseContainerStyles: React.CSSProperties =
    isPreview && autoScroll
      ? {
          /**
           * Visual styles (background, border, borderRadius, etc.) spread FIRST
           * so our layout-critical properties below always take precedence.
           * Without this order, design-panel styles can override display/width/height
           * and break the auto-scroll layout.
           */
          ...styles,
          ...effectsStyles,
          /* Layout-critical — these MUST NOT be overridden by user styles */
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          padding,
          margin: undefined,
        }
      : {
          /**
           * Visual styles spread FIRST so layout properties below always win.
           */
          ...styles,
          ...effectsStyles,
          /* Layout-critical — these MUST NOT be overridden by user styles */
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap,
          padding,
          overflow: 'hidden',
          margin: undefined,
        }

  /**
   * Apply fade edges mask-image gradient if the user has enabled it.
   * applyFadeEdgesStyles() adds maskImage/WebkitMaskImage CSS properties
   * that create a smooth transparent-to-visible gradient at the specified edges.
   */
  const contentContainerStyles = applyFadeEdgesStyles(
    baseContainerStyles,
    fadeEdges,
    fadeEdgesHeight
  )

  // ==========================================================================
  // CANVAS MODE — Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  /**
   * In canvas mode, we return ONLY the visual content.
   * The parent ElementWrapper component handles:
   *   - Selection ring and hover ring
   *   - Resize handles
   *   - Element name labels
   *   - Drag and hover pointer events
   *   - Position and size styling
   *
   * Auto-scroll is always disabled in canvas mode for editing clarity.
   */
  if (!isPreview) {
    return (
      <div
        data-element-content={element.id}
        data-prebuilt-type="prebuilt-logo-carousel"
        style={contentContainerStyles}
      >
        {renderContent()}
      </div>
    )
  }

  // ==========================================================================
  // PREVIEW MODE — Self-contained wrapper with position/size styles
  // ==========================================================================

  /**
   * In preview mode, each element is responsible for its own positioning
   * within the page layout. We compute position and size styles using the
   * shared utilities that are the SINGLE SOURCE OF TRUTH for element layout.
   */
  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, breakpoint)
  const sizeStyles = useElementSizeStyles(element, breakpoint, {
    /* Logo carousel typically stretches full width of its parent container.
     * autoWidthDefault=false means we use the element's explicit width setting. */
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <div
      data-element-id={element.id}
      data-prebuilt-type="prebuilt-logo-carousel"
      style={{
        ...positionStyles,
        ...sizeStyles,
        /* Visibility — hidden elements are removed from published view */
        visibility: element.visible ? undefined : 'hidden',
      }}
    >
      {/* Inner content container with flex layout, effects, and user styles */}
      <div style={contentContainerStyles}>
        {renderContent()}
      </div>
    </div>
  )
})

// End of component — props interface is already exported at declaration site
