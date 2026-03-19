/**
 * ============================================================================
 * UNIFIED ECOMMERCE CAROUSEL - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedEcommerceCarousel, unified-ecommerce-carousel,
 *   ecommerce-carousel-element-unified
 *
 * This component replaces BOTH:
 *   - elements/ecommerce-carousel-element.tsx (canvas editor)
 *   - renderers/element-renderers/ecommerce-carousel-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders CONTENT ONLY in canvas mode -- the visual carousel
 * with featured image and thumbnails. The parent `ElementWrapper` handles
 * all editor chrome (selection ring, hover ring, resize handles, labels).
 *
 * In preview mode, this component wraps content in a positioned container
 * and adds interactive thumbnail click behavior for switching the featured image.
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * BOTH MODES:
 *   - Featured image display with configurable objectFit
 *   - Thumbnail row with configurable size, gap, and border radius
 *   - ResizeObserver-based "+X more" badge when showMore is enabled
 *   - Wireframe placeholder when no images are added
 *
 * CANVAS MODE (mode='canvas'):
 *   - Thumbnail clicks are suppressed (dragging, not navigation)
 *   - Featured index is read-only from element data (no local state)
 *   - No pointer cursor on thumbnails
 *
 * PREVIEW MODE (mode='preview'):
 *   - Interactive thumbnails: clicking switches the featured image
 *   - Local state for featured index (purely display, no Redux needed)
 *   - Accessible thumbnail buttons with aria labels
 *   - Responsive width/height via getPropertyValue
 *
 * ============================================================================
 * THUMBNAIL OVERFLOW MODES
 * ============================================================================
 *
 * showMore=true:
 *   - Thumbnails in a single row (flexWrap: 'nowrap')
 *   - Overflow hidden, shows "+X more" badge in last slot
 *   - ResizeObserver measures container to calculate visible count
 *
 * showMore=false (default):
 *   - Thumbnails wrap to show all images (flexWrap: 'wrap')
 *   - No "+X more" badge needed
 *
 * ============================================================================
 */

'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import NextImage from 'next/image'
import type {
  EcommerceCarouselElement,
  Breakpoint,
  CarouselNavigationStyle,
} from '../../_lib/types'
import { getPropertyValue } from '../../_lib'
import {
  computeElementPositionStyles,
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedEcommerceCarousel component.
 *
 * SOURCE OF TRUTH: UnifiedEcommerceCarouselProps
 *
 * In canvas mode, this component is rendered INSIDE an ElementWrapper which
 * provides all editor chrome. Only the element data is needed.
 * In preview mode, the component handles its own positioned wrapper.
 */
interface UnifiedEcommerceCarouselProps {
  /** The ecommerce carousel element data -- SOURCE OF TRUTH: EcommerceCarouselElement from types.ts */
  element: EcommerceCarouselElement
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Padding around the carousel content inside the element bounds.
 * Applied on all sides so thumbnails/featured image don't touch the edges.
 * Used only in canvas mode (preview uses the container's own styles).
 */
const CAROUSEL_PADDING = 8

/**
 * Minimum height for the featured image area.
 * Prevents the image from collapsing when the carousel container is small.
 */
const FEATURED_MIN_HEIGHT = 200

/**
 * Number of placeholder thumbnail slots for the wireframe empty state.
 * Capped at 4 for a clean wireframe appearance.
 */
const PLACEHOLDER_THUMB_COUNT = 4

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified ecommerce carousel element that renders in both canvas and preview modes.
 *
 * CANVAS: Renders a static carousel with featured image and thumbnails.
 *   The ElementWrapper handles all editor chrome.
 * PREVIEW: Renders an interactive carousel with clickable thumbnails,
 *   responsive sizing, and proper accessibility.
 */
export function UnifiedEcommerceCarousel({ element }: UnifiedEcommerceCarouselProps) {
  const { mode, breakpoint } = useRenderMode()
  const isPreview = mode === 'preview'

  /**
   * Determine the active breakpoint for responsive style resolution.
   * Canvas mode always uses 'desktop' because the builder handles breakpoint
   * switching at a higher level. Preview mode uses the context breakpoint.
   */
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  // ==========================================================================
  // LOCAL STATE - Featured image index (preview mode only)
  // ==========================================================================

  /**
   * In preview mode, users can click thumbnails to switch the featured image.
   * This is purely local state -- no Redux dispatch needed.
   * In canvas mode, we always use the element's saved featuredIndex.
   */
  const [previewFeaturedIndex, setPreviewFeaturedIndex] = useState(element.featuredIndex ?? 0)

  /** Use local state in preview mode, element data in canvas mode. */
  const activeFeaturedIndex = isPreview ? previewFeaturedIndex : element.featuredIndex

  // ==========================================================================
  // CAROUSEL PROPERTIES
  // ==========================================================================

  const {
    images,
    objectFit: elementObjectFit,
    thumbnailGap,
    thumbnailSize,
    showMore,
    imageBorderRadius,
  } = element

  /**
   * Navigation style determines how users switch between carousel images.
   * Defaults to 'thumbnails' for backward compatibility with existing elements
   * that were created before this property was added.
   *
   * SOURCE OF TRUTH: CarouselNavigationStyle from types.ts
   */
  const navigationStyle: CarouselNavigationStyle = element.navigationStyle ?? 'thumbnails'

  /**
   * Get responsive-aware objectFit for the featured image.
   * Only objectFit is in ResponsiveSettingsOverrides; other carousel
   * properties use the same value across all breakpoints.
   */
  const objectFit = isPreview
    ? getPropertyValue<'cover' | 'contain' | 'fill'>(
        element,
        'objectFit',
        activeBreakpoint,
        elementObjectFit || 'cover'
      ) ?? 'cover'
    : elementObjectFit || 'cover'

  /** The currently featured image (shown large on top), if any */
  const safeIndex = Math.min(Math.max(activeFeaturedIndex, 0), Math.max(images.length - 1, 0))
  const featuredImage = images.length > 0 ? images[safeIndex] ?? images[0] : null

  // ==========================================================================
  // RESIZE OBSERVER - Measure thumbnail container for "+X more" logic
  // ==========================================================================

  /** Ref for the thumbnail container -- used by ResizeObserver to measure width */
  const thumbnailContainerRef = useRef<HTMLDivElement>(null)

  /**
   * Number of thumbnails that can fit in a single row.
   * Calculated by ResizeObserver based on container width, thumbnail size, and gap.
   * Only relevant when showMore=true.
   */
  const [visibleThumbnailCount, setVisibleThumbnailCount] = useState<number>(images.length)

  /**
   * Calculates how many thumbnails fit in the available container width.
   * Each thumbnail takes (thumbnailSize + thumbnailGap) pixels, minus the
   * last gap since there's no gap after the last item.
   */
  const calculateVisibleCount = useCallback(
    (containerWidth: number) => {
      if (thumbnailSize <= 0) return images.length
      const count = Math.floor(
        (containerWidth + thumbnailGap) / (thumbnailSize + thumbnailGap)
      )
      return Math.max(1, count)
    },
    [thumbnailSize, thumbnailGap, images.length]
  )

  useEffect(() => {
    /** Only observe when showMore is enabled -- otherwise thumbnails wrap freely. */
    if (!showMore) {
      setVisibleThumbnailCount(images.length)
      return
    }

    const container = thumbnailContainerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        setVisibleThumbnailCount(calculateVisibleCount(width))
      }
    })

    observer.observe(container)

    /** Initial measurement */
    setVisibleThumbnailCount(calculateVisibleCount(container.clientWidth))

    return () => {
      observer.disconnect()
    }
  }, [showMore, calculateVisibleCount, images.length])

  // ==========================================================================
  // SHOW MORE LOGIC - Determine which thumbnails to display
  // ==========================================================================

  /** Whether there are more thumbnails than can fit in a single row (showMore mode) */
  const hasOverflow = showMore && images.length > visibleThumbnailCount

  /**
   * The thumbnails to display. When showMore is active and there's overflow,
   * we reserve the last visible slot for the "+X more" indicator.
   */
  const displayedThumbnails = showMore && hasOverflow
    ? images.slice(0, visibleThumbnailCount - 1)
    : images

  /** Number of hidden thumbnails shown in the "+X more" badge. */
  const hiddenCount = showMore && hasOverflow
    ? images.length - (visibleThumbnailCount - 1)
    : 0

  // ==========================================================================
  // THUMBNAIL CLICK HANDLER (preview mode only)
  // ==========================================================================

  /**
   * Update the local featured index when a thumbnail is clicked.
   * Only used in preview mode -- canvas thumbnails are not interactive.
   */
  const handleThumbnailClick = useCallback((index: number) => {
    setPreviewFeaturedIndex(index)
  }, [])

  /**
   * Navigate to previous or next image via arrow buttons.
   * Clamps to valid range (no wrapping) -- first image blocks prev,
   * last image blocks next. Only used in preview mode with 'arrows' navigation.
   */
  const handleArrowClick = useCallback((direction: 'prev' | 'next') => {
    setPreviewFeaturedIndex(prev => {
      if (direction === 'prev') return Math.max(0, prev - 1)
      return Math.min(images.length - 1, prev + 1)
    })
  }, [images.length])

  // ==========================================================================
  // SHARED RENDER HELPERS
  // ==========================================================================

  /**
   * Renders the wireframe placeholder when no images have been added.
   * Shows a featured image area on top + a row of thumbnail slots below.
   * Uses mid-gray (#808080) at low alpha -- visible on both light/dark backgrounds.
   */
  const renderPlaceholder = () => (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: thumbnailGap,
      }}
    >
      {/* Featured image placeholder -- large area with dashed border and icon */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: imageBorderRadius,
          border: '1.5px dashed rgba(128, 128, 128, 0.45)',
          backgroundColor: 'rgba(128, 128, 128, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {/* Landscape image icon */}
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(128, 128, 128, 0.5)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span
          style={{
            fontSize: 11,
            color: 'rgba(128, 128, 128, 0.6)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            userSelect: 'none',
          }}
        >
          {isPreview ? 'No images' : 'Add images in settings'}
        </span>
      </div>

      {/* Thumbnail slots placeholder row */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: thumbnailGap,
          flexShrink: 0,
        }}
      >
        {Array.from({ length: PLACEHOLDER_THUMB_COUNT }).map((_, i) => (
          <div
            key={i}
            style={{
              width: thumbnailSize,
              height: thumbnailSize,
              borderRadius: imageBorderRadius,
              border: '1.5px dashed rgba(128, 128, 128, 0.35)',
              backgroundColor: 'rgba(128, 128, 128, 0.06)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Tiny image icon inside each thumbnail slot (canvas only) */}
            {!isPreview && (
              <svg
                width={Math.min(16, thumbnailSize * 0.4)}
                height={Math.min(16, thumbnailSize * 0.4)}
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(128, 128, 128, 0.4)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  /**
   * Renders the featured (large) image at the top of the carousel.
   * Uses Next.js Image with fill mode for optimized loading.
   */
  const renderFeaturedImage = () => {
    if (!featuredImage) return null

    /** Check for a valid image src */
    if (!featuredImage.src) {
      return (
        <div
          style={{
            position: 'relative',
            width: '100%',
            flex: 1,
            minHeight: FEATURED_MIN_HEIGHT,
            borderRadius: imageBorderRadius,
            overflow: 'hidden',
            backgroundColor: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            fontSize: 14,
          }}
        >
          No image
        </div>
      )
    }

    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: FEATURED_MIN_HEIGHT,
          borderRadius: imageBorderRadius,
          overflow: 'hidden',
        }}
      >
        <NextImage
          src={featuredImage.src}
          alt={featuredImage.alt || 'Product image'}
          fill
          priority={isPreview}
          style={{ objectFit }}
          sizes={isPreview
            ? '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
            : '(max-width: 768px) 100vw, 50vw'
          }
          draggable={false}
        />
      </div>
    )
  }

  /**
   * Renders the "+X more" badge that indicates hidden thumbnails.
   * Styled to match the thumbnail size so it occupies the same slot.
   */
  const renderMoreBadge = () => (
    <div
      style={{
        width: thumbnailSize,
        height: thumbnailSize,
        minWidth: thumbnailSize,
        minHeight: thumbnailSize,
        borderRadius: imageBorderRadius,
        /* Canvas mode uses theme-aware muted; preview keeps transparent overlay */
        backgroundColor: isPreview ? 'rgba(0, 0, 0, 0.06)' : 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: isPreview ? 'default' : 'grab',
        userSelect: 'none',
      }}
      aria-label={`${hiddenCount} more images`}
    >
      <span
        style={{
          fontSize: Math.max(10, Math.min(14, thumbnailSize * 0.3)),
          fontWeight: isPreview ? 500 : 600,
          color: isPreview ? '#666' : '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          userSelect: 'none',
        }}
      >
        +{hiddenCount}
      </span>
    </div>
  )

  /**
   * Renders Apple-style dot navigation overlaid at the bottom of the featured image.
   * Active dot is a wider pill shape (24px), inactive dots are small circles (8px).
   * In preview mode, dots are clickable to navigate. In canvas mode, dots are static.
   */
  const renderDotNavigation = () => {
    if (images.length <= 1) return null

    return (
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 20,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 2,
        }}
      >
        {images.map((_, index) => {
          const isActive = index === safeIndex

          return isPreview ? (
            /* PREVIEW: Clickable dot button */
            <button
              key={index}
              type="button"
              onClick={() => handleThumbnailClick(index)}
              aria-label={`Go to image ${index + 1}`}
              aria-pressed={isActive}
              style={{
                border: 'none',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                width: isActive ? 24 : 8,
                height: 8,
                borderRadius: isActive ? 4 : 4,
                backgroundColor: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                transition: 'width 0.3s ease, background-color 0.3s ease',
                flexShrink: 0,
              }}
            />
          ) : (
            /* CANVAS: Static dot (no interaction) */
            <div
              key={index}
              style={{
                width: isActive ? 24 : 8,
                height: 8,
                borderRadius: isActive ? 4 : 4,
                backgroundColor: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                transition: 'width 0.3s ease, background-color 0.3s ease',
                flexShrink: 0,
              }}
            />
          )
        })}
      </div>
    )
  }

  /**
   * Renders left/right chevron arrow buttons overlaid on the featured image.
   * Arrows are vertically centered on the image. Left is hidden on first image,
   * right is hidden on last image (no wrapping). Also renders small position
   * indicator dots below the arrows for image position feedback.
   *
   * In preview mode, arrows are clickable. In canvas mode, arrows are visible but static.
   */
  const renderArrowNavigation = () => {
    if (images.length <= 1) return null

    const isFirstImage = safeIndex === 0
    const isLastImage = safeIndex === images.length - 1

    /** Shared styles for arrow buttons */
    const arrowButtonStyle: React.CSSProperties = {
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      width: 36,
      height: 36,
      borderRadius: '50%',
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(4px)',
      border: 'none',
      padding: 0,
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      cursor: isPreview ? 'pointer' : 'default',
    }

    /** Left chevron SVG icon */
    const leftChevron = (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    )

    /** Right chevron SVG icon */
    const rightChevron = (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 6 15 12 9 18" />
      </svg>
    )

    return (
      <>
        {/* Left arrow -- hidden when on first image */}
        {!isFirstImage && (
          isPreview ? (
            <button
              type="button"
              onClick={() => handleArrowClick('prev')}
              aria-label="Previous image"
              style={{ ...arrowButtonStyle, left: 12 }}
            >
              {leftChevron}
            </button>
          ) : (
            <div style={{ ...arrowButtonStyle, left: 12 }}>
              {leftChevron}
            </div>
          )
        )}

        {/* Right arrow -- hidden when on last image */}
        {!isLastImage && (
          isPreview ? (
            <button
              type="button"
              onClick={() => handleArrowClick('next')}
              aria-label="Next image"
              style={{ ...arrowButtonStyle, right: 12 }}
            >
              {rightChevron}
            </button>
          ) : (
            <div style={{ ...arrowButtonStyle, right: 12 }}>
              {rightChevron}
            </div>
          )
        )}

        {/* Small position indicator dots at the bottom of the image */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            zIndex: 2,
          }}
        >
          {images.map((_, index) => (
            <div
              key={index}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === safeIndex ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
                transition: 'background-color 0.3s ease',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      </>
    )
  }

  /**
   * Wraps the featured image in a relative container with dot or arrow navigation
   * overlaid on top. Used for 'dots' and 'arrows' navigation styles where the
   * navigation controls are positioned absolutely within the featured image area.
   */
  const renderFeaturedImageWithOverlay = () => {
    if (!featuredImage) return null

    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: FEATURED_MIN_HEIGHT,
          overflow: 'hidden',
          borderRadius: imageBorderRadius,
          /**
           * MUST be a flex container so the inner renderFeaturedImage()'s
           * flex: 1 works correctly to fill all available vertical space.
           * Without this, the featured image collapses to its minHeight.
           */
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Featured image fills this container -- renderFeaturedImage provides its own positioning */}
        {renderFeaturedImage()}
        {/* Navigation overlay -- only one style renders at a time */}
        {navigationStyle === 'dots' && renderDotNavigation()}
        {navigationStyle === 'arrows' && renderArrowNavigation()}
      </div>
    )
  }

  /**
   * Renders the thumbnail row. Behavior depends on showMore:
   * - showMore=true: Single row with overflow hidden, shows "+X more" badge
   * - showMore=false: Thumbnails wrap onto multiple lines
   *
   * In preview mode, thumbnails are clickable <button> elements.
   * In canvas mode, thumbnails are static <div> elements.
   */
  const renderThumbnailRow = () => {
    if (images.length === 0) return null

    return (
      <div
        ref={thumbnailContainerRef}
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: thumbnailGap,
          flexWrap: showMore ? 'nowrap' : 'wrap',
          overflow: showMore ? 'hidden' : 'visible',
          alignItems: 'flex-start',
          width: '100%',
          /* In preview mode, add top margin equivalent to canvas padding gap */
          marginTop: isPreview ? thumbnailGap : undefined,
          flexShrink: 0,
        }}
      >
        {displayedThumbnails.map((image, index) =>
          isPreview ? (
            /* PREVIEW: Interactive thumbnail button */
            <button
              key={image.id}
              type="button"
              onClick={() => handleThumbnailClick(index)}
              style={{
                border: 'none',
                padding: 0,
                margin: 0,
                background: 'none',
                cursor: 'pointer',
                width: thumbnailSize,
                height: thumbnailSize,
                minWidth: thumbnailSize,
                minHeight: thumbnailSize,
                position: 'relative',
                borderRadius: imageBorderRadius,
                overflow: 'hidden',
                outline: index === safeIndex
                  ? '2px solid rgba(59, 130, 246, 0.8)'
                  : '2px solid transparent',
                outlineOffset: -2,
                transition: 'outline-color 0.15s ease',
                flexShrink: 0,
              }}
              aria-label={image.alt || `Thumbnail ${index + 1}`}
              aria-pressed={index === safeIndex}
            >
              {image.src ? (
                <NextImage
                  src={image.src}
                  alt={image.alt || `Thumbnail ${index + 1}`}
                  fill
                  sizes={`${thumbnailSize}px`}
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#e5e5e5',
                    borderRadius: imageBorderRadius,
                  }}
                />
              )}
            </button>
          ) : (
            /* CANVAS: Static thumbnail div (no click interaction) */
            <div
              key={image.id}
              style={{
                position: 'relative',
                width: thumbnailSize,
                height: thumbnailSize,
                borderRadius: imageBorderRadius,
                overflow: 'hidden',
                flexShrink: 0,
                boxShadow: index === activeFeaturedIndex ? 'inset 0 0 0 2px #3b82f6' : 'none',
                opacity: index === activeFeaturedIndex ? 1 : 0.7,
                cursor: 'grab',
              }}
            >
              <NextImage
                src={image.src}
                alt={image.alt}
                fill
                style={{ objectFit: 'cover' }}
                sizes={`${thumbnailSize}px`}
                draggable={false}
              />
            </div>
          )
        )}
        {/* Show "+X more" badge when thumbnails overflow in showMore mode */}
        {hasOverflow && hiddenCount > 0 && renderMoreBadge()}
      </div>
    )
  }

  // ==========================================================================
  // CANVAS MODE -- Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  if (!isPreview) {
    /**
     * Extract container styles from the element's styles object.
     * These include backgroundColor, borderRadius, etc. set by the user.
     */
    const containerStyles = element.styles ?? {}

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: thumbnailGap,
          padding: CAROUSEL_PADDING,
          overflow: 'hidden',
          borderRadius: (containerStyles as Record<string, unknown>)?.borderRadius as number | undefined ?? 0,
          backgroundColor: (containerStyles as Record<string, unknown>)?.backgroundColor as string | undefined ?? 'transparent',
        }}
      >
        {images.length === 0 ? (
          renderPlaceholder()
        ) : (
          <>
            {/* Navigation variant rendering:
             * - 'thumbnails': Featured image + thumbnail row below (original layout)
             * - 'dots' / 'arrows': Featured image with overlay navigation (no thumbnail row) */}
            {navigationStyle === 'thumbnails' ? (
              <>
                {renderFeaturedImage()}
                {renderThumbnailRow()}
              </>
            ) : (
              renderFeaturedImageWithOverlay()
            )}
          </>
        )}
      </div>
    )
  }

  // ==========================================================================
  // PREVIEW MODE -- Positioned wrapper with interactive carousel
  // ==========================================================================

  const isRoot = element.parentId === null

  /**
   * Use the shared size utility — this is the SAME function the canvas wrapper uses
   * (via CanvasEcommerceCarouselElement). It handles:
   * - autoWidth: fills parent width with '100%' or flex: '1 1 0%' in row parents
   * - Fixed height from element.height
   * - Responsive breakpoint overrides
   *
   * autoWidthDefault: true when inside a frame (not root), matching canvas behavior.
   * autoHeightDefault: false — carousels always use fixed height.
   *
   * SOURCE OF TRUTH: Same pattern as canvas-unified-wrappers.tsx line 1050
   */
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    autoWidthDefault: !isRoot,
    autoHeightDefault: false,
  })

  /** Extract container styles from the element. */
  const containerStyles = element.styles ?? {}

  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)

  return (
    <div
      data-ecommerce-carousel-renderer
      data-element-id={element.id}
      style={{
        ...positionStyles,
        /* Size from shared utility — handles autoWidth, flex in row parents, responsive overrides */
        width: sizeStyles.width,
        height: sizeStyles.height,
        minHeight: sizeStyles.minHeight,
        flex: sizeStyles.flex,
        minWidth: sizeStyles.minWidth,
        /* Apply user-configured container styles */
        ...containerStyles,
        /* Overflow hidden to clip content within borderRadius */
        overflow: 'hidden',
        /* Rotation transform if set by user */
        transform: element.rotation ? `rotate(${element.rotation}deg)` : positionStyles.transform,
        /* Flex column layout: featured image on top, thumbnails below */
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {images.length === 0 ? (
        renderPlaceholder()
      ) : (
        <>
          {/* Navigation variant rendering:
           * - 'thumbnails': Featured image + thumbnail row below (original layout)
           * - 'dots' / 'arrows': Featured image with overlay navigation (no thumbnail row) */}
          {navigationStyle === 'thumbnails' ? (
            <>
              {renderFeaturedImage()}
              {renderThumbnailRow()}
            </>
          ) : (
            renderFeaturedImageWithOverlay()
          )}
        </>
      )}
    </div>
  )
}
