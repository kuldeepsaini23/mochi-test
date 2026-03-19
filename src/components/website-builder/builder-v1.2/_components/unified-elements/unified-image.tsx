/**
 * ============================================================================
 * UNIFIED IMAGE ELEMENT — Single Component for Canvas & Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedImage, unified-image-element, image-renderer
 *
 * This component replaces BOTH the old canvas `ImageElement` (elements/image-element.tsx)
 * and the old preview `ImageElementRenderer` (renderers/element-renderers/image-element-renderer.tsx)
 * with a single component that handles both rendering modes.
 *
 * ============================================================================
 * HOW IT WORKS
 * ============================================================================
 *
 * 1. Reads the current rendering mode via `useRenderMode()`:
 *    - 'canvas':  Renders image as a CSS background-image (prevents browser drag-to-desktop).
 *                 Editor chrome (selection, hover, resize) is handled by the parent
 *                 `ElementWrapper` component — this component renders CONTENT ONLY.
 *    - 'preview': Renders image using Next.js `<Image>` for CDN caching, automatic
 *                 WebP/AVIF, and lazy loading. Falls back to `<img>` for external URLs
 *                 that might not be in the Next.js image optimization pipeline.
 *
 * 2. Shared logic that runs in BOTH modes:
 *    - `computeImageContentStyles()` for visual styles (border-radius, background, effects)
 *    - `useElementSizeStyles()` for responsive width/height
 *    - `computeElementPositionStyles()` for absolute/relative positioning
 *    - Gradient border overlay support via `useGradientBorder()`
 *    - Opacity and border-radius from element styles
 *
 * 3. Mode-specific differences:
 *    - Canvas: CSS background-image, placeholder for empty images
 *    - Preview: Next.js Image with fill mode, proper alt text for SEO
 *
 * ============================================================================
 * ARCHITECTURE NOTES
 * ============================================================================
 *
 * - In canvas mode, the parent `ElementWrapper` handles ALL editor chrome
 *   (selection ring, hover ring, resize handles, label, dimensions pill).
 * - The wrapper also handles pointer events for drag and hover.
 * - This component just returns the inner content div + gradient border.
 *
 * ============================================================================
 */

'use client'

import React, { memo } from 'react'
import NextImage from 'next/image'
import type { ImageElement, BorderConfig, Breakpoint } from '../../_lib/types'
import {
  computeImageContentStyles,
  getPropertyValue,
} from '../../_lib'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedImage component.
 *
 * SOURCE OF TRUTH: UnifiedImageProps
 *
 * The image element data is always required. All other props are optional
 * because they are only needed in canvas mode (provided by ElementWrapper).
 */
interface UnifiedImageProps {
  /** The image element data — SOURCE OF TRUTH from types.ts ImageElement */
  element: ImageElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified image element that renders in both canvas and preview modes.
 *
 * CANVAS MODE:
 * - Uses CSS background-image to prevent the browser's native image
 *   drag-to-desktop behavior, which would interfere with canvas dragging.
 * - Shows a subtle placeholder when no image source is set.
 * - Returns only the content div — no editor chrome (that's ElementWrapper's job).
 *
 * PREVIEW MODE:
 * - Uses Next.js `<Image>` with fill mode for optimized delivery (CDN caching,
 *   WebP/AVIF conversion, responsive sizing).
 * - Wraps the image in a positioned container with proper responsive dimensions.
 * - Includes alt text for SEO and accessibility.
 */
export const UnifiedImage = memo(function UnifiedImage({
  element,
}: UnifiedImageProps) {
  const { mode, breakpoint } = useRenderMode()
  const isCanvas = mode === 'canvas'

  // Use desktop breakpoint in canvas mode since responsive preview is handled
  // by the breakpoint frame, not the main canvas
  const effectiveBreakpoint: Breakpoint = isCanvas ? 'desktop' : breakpoint

  // ========================================================================
  // GRADIENT BORDER SUPPORT
  // ========================================================================

  /**
   * Extract border config from the element's styles for gradient border rendering.
   * __borderConfig is a custom property stored alongside CSS styles.
   */
  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as
    | BorderConfig
    | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ========================================================================
  // CONTENT STYLES — Single Source of Truth via computeImageContentStyles
  // ========================================================================

  /**
   * Compute the inner content styles (background-image, border-radius,
   * backgroundColor, effects, fade edges, color mask filter).
   * This is the SINGLE SOURCE OF TRUTH for image visual styles.
   */
  const contentStyle = computeImageContentStyles(element, {
    breakpoint: effectiveBreakpoint,
  })

  // ========================================================================
  // CANVAS MODE — Background-image approach
  // ========================================================================

  if (isCanvas) {
    return (
      <div className={gradientBorder.className || undefined} style={{
        ...contentStyle,
        /* Kill transition in canvas — prevents content lagging behind
           handles/selection ring during drag and resize at any zoom level. */
        transition: 'none',
      }}>
        {/* Inject gradient border CSS via pseudo-element if a gradient border is active */}
        {gradientBorder.isActive && (
          <GradientBorderOverlay
            elementId={element.id}
            borderConfig={borderConfig}
            borderRadius={contentStyle.borderRadius}
          />
        )}
      </div>
    )
  }

  // ========================================================================
  // PREVIEW MODE — Next.js Image for optimized delivery
  // ========================================================================

  /**
   * Determine if this is a root element (positioned absolutely on the canvas).
   * Root elements are identified by having no parent.
   */
  const isRoot = element.parentId === null

  /**
   * Get responsive-aware property values for preview mode.
   * When breakpoint is 'mobile', these check responsiveProperties/responsiveSettings
   * for mobile overrides before falling back to the base element property.
   */
  const width = getPropertyValue<number>(element, 'width', effectiveBreakpoint, element.width)
  const height = getPropertyValue<number>(element, 'height', effectiveBreakpoint, element.height)
  const objectFit = getPropertyValue<'cover' | 'contain' | 'fill'>(
    element,
    'objectFit',
    effectiveBreakpoint,
    element.objectFit || 'cover'
  )

  /**
   * Resolve autoWidth — when true, the image fills its parent container width.
   * Only child elements (inside frames) can use autoWidth since root elements
   * have no parent container to fill.
   */
  const autoWidth =
    !isRoot &&
    (getPropertyValue<boolean>(
      element,
      'autoWidth',
      effectiveBreakpoint,
      element.autoWidth ?? false
    ) ??
      false)

  /**
   * Compute position and size styles from shared utilities.
   * These ensure consistent positioning across all unified elements.
   */
  const positionStyles = computeElementPositionStyles(element, isRoot, effectiveBreakpoint)
  const sizeStyles = useElementSizeStyles(element, effectiveBreakpoint, {
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <div
      data-image-renderer
      data-element-id={element.id}
      className={gradientBorder.className || undefined}
      style={{
        // Position and size from shared utilities
        ...positionStyles,
        /**
         * Override width with autoWidth-aware value.
         * sizeStyles.width handles autoWidth via useElementSizeStyles, but
         * we also apply the responsive-aware fixed width for consistency with
         * the original renderer.
         */
        width: autoWidth ? '100%' : width,
        height: height,
        // Visual styles from contentStyle (borderRadius, backgroundColor)
        borderRadius: contentStyle.borderRadius,
        backgroundColor: contentStyle.backgroundColor,
        // Clip the image to the container's border-radius
        overflow: 'hidden',
        /**
         * Z-INDEX STACKING CONTEXT CONTROL:
         * Use positionStyles.zIndex which correctly returns undefined for
         * normal-flow children (preventing stacking context creation that
         * would trap absolute siblings behind this element).
         * SOURCE OF TRUTH: StackingContextControl
         */
        zIndex: positionStyles.zIndex,
        // Apply rotation transform if set on the element
        transform: element.rotation ? `rotate(${element.rotation}deg)` : positionStyles.transform,
        // Fade edges effect — CSS mask-image from computeImageContentStyles
        maskImage: contentStyle.maskImage,
        WebkitMaskImage: contentStyle.WebkitMaskImage,
      }}
    >
      {/* Gradient border overlay — injects CSS for ::before pseudo-element */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={contentStyle.borderRadius}
        />
      )}

      {/*
        Next.js Image with fill mode for optimized delivery.
        - fill: Image fills the parent container (parent has position: relative from positionStyles)
        - priority: Load immediately to avoid flash (important for above-the-fold content)
        - sizes: Hint for the browser to select the right responsive image size
        - objectFit: Controls how the image fills its container (cover, contain, fill)
        - filter: Applies color mask (e.g., grayscale) from contentStyle
      */}
      {element.src && (
        <NextImage
          src={element.src}
          alt={element.alt || 'Image'}
          fill
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          style={{
            objectFit: objectFit,
            filter: contentStyle.filter,
          }}
        />
      )}
    </div>
  )
})
