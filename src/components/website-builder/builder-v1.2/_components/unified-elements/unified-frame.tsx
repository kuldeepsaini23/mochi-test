/**
 * ============================================================================
 * UNIFIED FRAME ELEMENT - Single Component for Canvas + Preview Modes
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedFrame, unified-frame-element, frame-rendering
 *
 * This component replaces the old split pattern of:
 *   - elements/frame-element.tsx (canvas-only)
 *   - renderers/element-renderers/frame-element-renderer.tsx (preview-only)
 *
 * It renders frame/page elements in BOTH modes using `useRenderMode()`:
 *
 *   CANVAS MODE:
 *   - Returns ONLY the inner content div (flex layout, gradient borders,
 *     container wrapper, children). ElementWrapper handles all editor chrome
 *     (selection ring, hover ring, resize handles, labels, dimensions pill).
 *
 *   PREVIEW MODE:
 *   - Self-contained wrapper with full positioning (normal/sticky/absolute),
 *     responsive className, auto-scroll marquee, gradient borders, and container.
 *
 *   SHARED (both modes):
 *   - Content style computation via computeFrameContentStyles (single source of truth)
 *   - Gradient border support via useGradientBorder hook
 *   - Container wrapper (max-width 1280px centered)
 *   - Responsive frame styles via computeResponsiveFrameStyles
 *
 * Also exports `useUnifiedFrameMeta` hook — used by the canvas wrapper
 * (CanvasFrameElement) to compute sizing, dimension label, and other
 * values that get passed to ElementWrapper.
 *
 * ============================================================================
 */

'use client'

import React, { memo, useMemo } from 'react'
import type {
  FrameElement as FrameElementType,
  PageElement as PageElementType,
  BorderConfig,
  BackgroundVideoConfig,
  BackgroundMediaMode,
  GradientConfig,
} from '../../_lib/types'
import { DEFAULT_FRAME_STYLES } from '../../_lib/types'
import {
  computeFrameContentStyles,
  computeResponsiveFrameStyles,
  computeFrameSizing,
  getPropertyValue,
  getStyleValue,
  gradientConfigToCSS,
  useRenderMode,
  ParentFlexDirectionProvider,
  ParentSmartGridProvider,
  useParentFlexDirection,
} from '../../_lib'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedFrame component.
 *
 * SOURCE OF TRUTH: UnifiedFrameProps, unified-frame-props
 *
 * Both canvas and preview modes receive the same props. The component uses
 * useRenderMode() internally to decide which rendering path to take.
 */
export interface UnifiedFrameProps {
  /** The frame or page element data */
  element: FrameElementType | PageElementType
  /** Children elements rendered by the parent (canvas.tsx or page-renderer.tsx) */
  children?: React.ReactNode
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified frame element that renders in both canvas and preview modes.
 *
 * CANVAS MODE returns only the inner content:
 * - Content div with computeFrameContentStyles + responsive overrides
 * - Gradient border overlay if active
 * - Container wrapper (max-width 1280px) if hasContainer
 * - Children rendered inside container or directly
 * - position: relative on content div for absolutely positioned children
 *
 * PREVIEW MODE renders everything self-contained:
 * - Outer wrapper with full positioning (normal/sticky/absolute)
 * - Width, height, overflow, responsive className, wrapper style overrides
 * - Auto-scroll keyframe injection and marquee wrapper
 * - Content div, gradient border, container wrapper, children
 * - Visibility: hidden elements return null
 */
export const UnifiedFrame = memo(function UnifiedFrame({
  element,
  children,
}: UnifiedFrameProps) {
  const { mode, breakpoint } = useRenderMode()
  const isCanvasMode = mode === 'canvas'
  const isPage = element.type === 'page'

  // ========================================================================
  // SIZING COMPUTATION (shared between both modes)
  // ========================================================================

  /**
   * Compute unified sizing for frames via computeFrameSizing.
   * Pages have simpler sizing — fixed width, no autoWidth, no scroll.
   */
  const sizing = element.type === 'frame'
    ? computeFrameSizing(element as FrameElementType, breakpoint)
    : null

  const hasAutoWidth = sizing?.hasAutoWidth ?? false
  const hasWrap = sizing?.hasWrap ?? false
  const isScrollEnabled = sizing?.isScrollEnabled ?? false
  /** Smart grid uses auto-height like wrap mode — grid rows expand naturally */
  const shouldAutoHeight = hasWrap || (sizing?.isSmartGrid ?? false)

  // ========================================================================
  // CONTAINER MODE (both modes)
  // ========================================================================

  /**
   * Check if container mode is enabled.
   * Pages default to true (content centered), frames default to false (full width).
   * In preview mode, use getPropertyValue for responsive-aware check.
   */
  const hasContainer = isCanvasMode
    ? (isPage
        ? (element as PageElementType).container !== false
        : (element as FrameElementType).container === true)
    : (isPage
        ? getPropertyValue<boolean>(element, 'container', breakpoint, true) !== false
        : getPropertyValue<boolean>(element, 'container', breakpoint, false) === true)

  // ========================================================================
  // RESPONSIVE STYLES (both modes)
  // ========================================================================

  /**
   * Compute responsive Tailwind classes and style overrides for frames.
   * Pages skip responsive (always root container) so we return empty values.
   */
  const responsive = element.type === 'frame'
    ? computeResponsiveFrameStyles(element as FrameElementType)
    : { wrapperClassName: '', contentClassName: '', wrapperStyleOverrides: {}, contentStyleOverrides: {} }

  // ========================================================================
  // CONTENT STYLES (both modes — single source of truth)
  // ========================================================================

  /**
   * Compute content styles via shared utility function.
   * Canvas mode: allowOverflow=true prevents clipping of child overlays.
   * Preview mode: allowOverflow=false uses standard web overflow behavior.
   */
  const contentStyle = computeFrameContentStyles(element, isPage, {
    allowOverflow: isCanvasMode,
    breakpoint,
  })

  // ========================================================================
  // BACKGROUND VIDEO SUPPORT (both modes)
  // ========================================================================

  /**
   * Extract background video config and mode from styles.
   * When video mode is active, an HTML <video> (preview) or poster <div> (canvas)
   * is layered behind frame content. CSS backgroundImage is skipped by
   * computeFrameContentStyles when __backgroundMode === 'video'.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bgVideoConfig = (element.styles as any)?.__backgroundVideo as BackgroundVideoConfig | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bgMode = (element.styles as any)?.__backgroundMode as BackgroundMediaMode | undefined
  /** True when video mode is active AND a video source exists */
  const isVideoMode = bgMode === 'video' && !!bgVideoConfig?.src

  /**
   * When video mode is active, gradients are rendered as a separate overlay div
   * ON TOP of the video (not as CSS backgroundImage). Extract gradient config
   * for this purpose.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gradientConfig = (element.styles as any)?.__backgroundGradient as GradientConfig | undefined
  const gradientOverlayCSS = isVideoMode && gradientConfig
    ? gradientConfigToCSS(gradientConfig)
    : undefined

  // ========================================================================
  // GRADIENT BORDER SUPPORT (both modes)
  // ========================================================================

  /**
   * Extract border config from styles for gradient border rendering.
   * The eslint disable is required because __borderConfig is stored as a
   * private extension property on the styles object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const borderConfig = (element.styles as any)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ========================================================================
  // MERGED CONTENT STYLES (both modes)
  // ========================================================================

  /**
   * Merge base content styles with responsive overrides.
   * Always set position: relative so absolutely positioned children
   * can position correctly relative to this frame's content area.
   *
   * For canvas mode, responsive overrides adjust flex direction etc.
   * For preview mode, also handle scroll overflow behavior.
   */
  const mergedContentStyle: React.CSSProperties = isCanvasMode
    ? {
        ...contentStyle,
        ...responsive.contentStyleOverrides,
        position: 'relative',
        /* Kill transition in canvas — wrapper resizes/moves instantly (transition: none)
           but content inherits transition: 'all 150ms ease-out' from computeFrameContentStyles,
           causing content to lag behind handles/selection ring during drag and resize. */
        transition: 'none',
      }
    : {
        ...contentStyle,
        ...responsive.contentStyleOverrides,
        // When scroll is NOT enabled, force visible overflow for sticky support
        ...(isScrollEnabled ? {} : { overflowX: 'visible' as const, overflowY: 'visible' as const }),
        position: 'relative',
      }

  // ========================================================================
  // PARENT FLEX DIRECTION — provided to children via context
  // ========================================================================

  /**
   * Extract the computed flex direction to provide to children via context.
   * Children use this to determine if autoWidth should use flex: 1 (row parent)
   * or width: 100% (column parent).
   */
  const computedFlexDirection = (contentStyle.flexDirection as string) || 'column'

  /**
   * Smart grid state — provided to children via ParentSmartGridProvider.
   * When true, children skip flex: 1 1 0% and use width: 100% to fill grid cells.
   * Resolved with responsive awareness so mobile can override.
   */
  const isSmartGrid = isCanvasMode
    ? ((element as FrameElementType).smartGrid ?? false)
    : (getPropertyValue<boolean>(element, 'smartGrid', breakpoint, false) ?? false)

  // ========================================================================
  // CONTAINER WRAPPER (shared between both modes)
  // ========================================================================

  /**
   * Renders children inside an optional container wrapper.
   * When hasContainer is true, wraps children in a centered 1280px max-width div
   * that inherits the parent's flex layout properties.
   */
  const renderContainerContent = (renderedChildren: React.ReactNode) => {
    if (hasContainer) {
      return (
        <div
          style={{
            width: '100%',
            maxWidth: 1280,
            marginLeft: 'auto',
            marginRight: 'auto',
            display: 'flex',
            flexDirection: contentStyle.flexDirection as 'row' | 'column' | undefined,
            justifyContent: contentStyle.justifyContent as string | undefined,
            alignItems: contentStyle.alignItems as string | undefined,
            gap: contentStyle.gap as number | undefined,
            flexWrap: contentStyle.flexWrap as React.CSSProperties['flexWrap'],
            /**
             * Pages grow with content (auto height, inherit minHeight from outer wrapper).
             * Wrap-mode frames also grow with content (auto height) but do NOT inherit
             * minHeight — they should shrink to exactly fit their children.
             * Fixed-height frames use flex: 1 to fill the parent wrapper.
             */
            flex: (isPage || shouldAutoHeight) ? undefined : 1,
            height: (isPage || shouldAutoHeight) ? 'auto' : undefined,
            minHeight: isPage ? 'inherit' : undefined,
            position: 'relative',
          }}
        >
          {renderedChildren}
        </div>
      )
    }
    return renderedChildren
  }

  // ========================================================================
  // CANVAS MODE: Return content only — ElementWrapper handles chrome
  // ========================================================================

  if (isCanvasMode) {
    return (
      <div
        /**
         * data-element-content: Marks this div as the actual content container
         * for the frame element on the canvas. This attribute is used by the
         * resize system to distinguish the content area from the outer wrapper
         * (ElementWrapper), enabling accurate height measurement and resize
         * handle positioning based on the content's rendered dimensions.
         */
        data-element-content={element.id}
        className={[responsive.contentClassName, gradientBorder.className].filter(Boolean).join(' ') || undefined}
        style={mergedContentStyle}
      >
        {/* ================================================================
            BACKGROUND VIDEO POSTER LAYER (canvas: static image only)
            Shows the video poster/thumbnail as a static background.
            No actual video playback in the canvas editor for performance.
            ================================================================ */}
        {isVideoMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              pointerEvents: 'none',
              borderRadius: contentStyle.borderRadius,
              overflow: 'hidden',
              backgroundImage: bgVideoConfig?.poster ? `url(${bgVideoConfig.poster})` : undefined,
              /* Read video fit from styles.__backgroundVideoFit (property registry),
                 falling back to BackgroundVideoConfig.objectFit, then 'cover' */
              backgroundSize: (element.styles as Record<string, unknown>)?.__backgroundVideoFit as string
                || bgVideoConfig?.objectFit || 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              /** Subtle placeholder when no poster is available */
              backgroundColor: bgVideoConfig?.poster ? undefined : 'rgba(0,0,0,0.05)',
            }}
          />
        )}

        {/* ================================================================
            GRADIENT OVERLAY (when video mode + gradient both active)
            Renders the gradient as a DOM overlay ON TOP of the video layer.
            This enables tinted overlay effects (e.g., dark gradient for
            text legibility over video backgrounds).
            ================================================================ */}
        {gradientOverlayCSS && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              pointerEvents: 'none',
              borderRadius: contentStyle.borderRadius,
              backgroundImage: gradientOverlayCSS,
            }}
          />
        )}

        {/* Gradient border overlay — injects CSS for ::before pseudo-element */}
        {gradientBorder.isActive && (
          <GradientBorderOverlay
            elementId={element.id}
            borderConfig={borderConfig}
            borderRadius={contentStyle.borderRadius}
          />
        )}

        {/* Provide this frame's flex direction + smart grid state to children.
            When video mode is active, children are elevated above the video/gradient
            layers via a z-index wrapper that inherits the parent's flex layout. */}
        <ParentFlexDirectionProvider value={computedFlexDirection}>
        <ParentSmartGridProvider value={isSmartGrid}>
          {isVideoMode ? (
            <div
              style={{
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                flexDirection: contentStyle.flexDirection as React.CSSProperties['flexDirection'],
                alignItems: contentStyle.alignItems as string,
                justifyContent: contentStyle.justifyContent as string,
                gap: contentStyle.gap as number | undefined,
                flexWrap: contentStyle.flexWrap as React.CSSProperties['flexWrap'],
                width: '100%',
                flex: 1,
              }}
            >
              {renderContainerContent(children)}
            </div>
          ) : (
            renderContainerContent(children)
          )}
        </ParentSmartGridProvider>
        </ParentFlexDirectionProvider>
      </div>
    )
  }

  // ========================================================================
  // PREVIEW MODE: Self-contained rendering with positioning
  // ========================================================================

  /**
   * Read parent flex direction BEFORE any conditional returns (React hooks rule).
   * Used for autoWidth behavior — row parent uses flex: 1, column uses width: 100%.
   */
  const parentFlexDirection = useParentFlexDirection()
  const isParentRow = parentFlexDirection === 'row' || parentFlexDirection === 'row-reverse'

  /**
   * In preview mode, hidden elements are NOT rendered at all.
   * This matches the published site behavior.
   */
  const isVisible = getPropertyValue<boolean>(element, 'visible', breakpoint, true)
  if (!isVisible) return null

  /**
   * Preview-specific properties resolved with responsive awareness.
   * These are only needed in preview mode (sticky, auto-scroll, etc.)
   */
  const isRoot = element.parentId === null
  const isAbsolutelyPositioned = !isRoot && element.isAbsolute === true

  /** Sticky positioning — only applies in preview/published mode */
  const isSticky = getPropertyValue<boolean>(element, 'sticky', breakpoint, false)
  const stickyPosition = getPropertyValue<'top' | 'bottom' | 'left' | 'right'>(
    element, 'stickyPosition', breakpoint, 'top'
  )

  /** Auto-scroll marquee settings */
  const autoScroll = getPropertyValue<boolean>(element, 'autoScroll', breakpoint, false)
  const autoScrollSpeed = getPropertyValue<number>(element, 'autoScrollSpeed', breakpoint, 50)
  const autoScrollDirection = getPropertyValue<'left' | 'right' | 'up' | 'down'>(
    element, 'autoScrollDirection', breakpoint, 'left'
  )

  /**
   * Responsive-aware width and height values for position calculations.
   * Sizing already computes these, but we need raw values for position styles.
   */
  const frameWidth = getPropertyValue<number>(element, 'width', breakpoint, element.width) ?? element.width
  const frameHeight = getPropertyValue<number>(element, 'height', breakpoint, element.height) ?? element.height
  const rotation = element.rotation

  // Get merged styles for container flex properties
  const styles = { ...DEFAULT_FRAME_STYLES, ...(element.styles ?? {}) }

  /**
   * Compute the position styles based on sticky, absolute, or normal positioning.
   * Priority: sticky > absolute > normal
   */
  const getPositionStyles = (): React.CSSProperties => {
    if (isSticky) {
      return {
        position: 'sticky',
        top: stickyPosition === 'top' ? 0 : undefined,
        bottom: stickyPosition === 'bottom' ? 0 : undefined,
        left: stickyPosition === 'left' ? 0 : undefined,
        right: stickyPosition === 'right' ? 0 : undefined,
        zIndex: 100 + element.order,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }
    }

    if (isAbsolutelyPositioned) {
      const transforms: string[] = []
      if (element.centerHorizontal) transforms.push('translateX(-50%)')
      if (element.centerVertical) transforms.push('translateY(-50%)')
      if (element.rotation) transforms.push(`rotate(${element.rotation}deg)`)

      return {
        position: 'absolute',
        left: element.centerHorizontal ? '50%' : element.x,
        top: element.centerVertical ? '50%' : element.y,
        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
        zIndex: element.order,
      }
    }

    return {
      position: isRoot ? 'absolute' : 'relative',
      left: isRoot ? element.x : undefined,
      top: isRoot ? element.y : undefined,
      /**
       * Z-INDEX STACKING CONTEXT CONTROL:
       * Only set z-index on root elements. Normal-flow children use undefined
       * (auto) so they do NOT create CSS stacking contexts that would trap
       * the z-index of fixed/sticky descendants (like navbars).
       * SOURCE OF TRUTH: StackingContextControl, NavbarStickyFix
       */
      zIndex: isRoot ? element.order : undefined,
      transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    }
  }

  /**
   * Compute width — autoWidth always uses '100%' so inner content resolves
   * percentage widths. In row parents, flex: 1 1 0% overrides for flex sizing.
   */
  const widthValue: number | string = hasAutoWidth ? '100%' : frameWidth

  /**
   * Generate unique auto-scroll keyframe animation for seamless marquee loop.
   * Uses inline <style> tag to avoid global CSS conflicts between elements.
   */
  const autoScrollKeyframes = autoScroll
    ? (() => {
        const animationName = `autoScroll_${element.id.replace(/[^a-zA-Z0-9]/g, '_')}`
        /** Vertical directions use translateY, horizontal use translateX */
        const isVertical = autoScrollDirection === 'up' || autoScrollDirection === 'down'
        const translateFn = isVertical ? 'translateY' : 'translateX'
        /** 'right' and 'down' scroll in reverse (content appears to move in that direction) */
        const isReverse = autoScrollDirection === 'right' || autoScrollDirection === 'down'
        const keyframes = !isReverse
          ? `@keyframes ${animationName} { 0% { transform: ${translateFn}(0); } 100% { transform: ${translateFn}(-50%); } }`
          : `@keyframes ${animationName} { 0% { transform: ${translateFn}(-50%); } 100% { transform: ${translateFn}(0); } }`
        return { animationName, keyframes, isVertical }
      })()
    : null

  /**
   * Render children with optional auto-scroll wrapper.
   * When auto-scroll is enabled, children are duplicated visually (not in data)
   * for seamless infinite scrolling. Animation pauses on hover for accessibility.
   */
  const renderPreviewChildren = () => {
    if (autoScroll && autoScrollKeyframes) {
      /** Use height for vertical scrolling, width for horizontal */
      const estimatedContentSize = autoScrollKeyframes.isVertical
        ? frameHeight * 2
        : frameWidth * 2
      const speed = autoScrollSpeed ?? 50
      const duration = estimatedContentSize / speed

      return (
        <div
          data-auto-scroll-container
          style={{
            display: 'flex',
            flexDirection: autoScrollKeyframes.isVertical ? 'column' : 'row',
            alignItems: styles.alignItems as string | undefined,
            gap: styles.gap as number | undefined,
            /* Vertical: full width, grow in height. Horizontal: grow in width. */
            width: autoScrollKeyframes.isVertical ? '100%' : 'max-content',
            height: autoScrollKeyframes.isVertical ? 'max-content' : undefined,
            animation: `${autoScrollKeyframes.animationName} ${duration}s linear infinite`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.animationPlayState = 'paused'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.animationPlayState = 'running'
          }}
        >
          {/* Original children */}
          {children}
          {/* Duplicated children for seamless loop */}
          {children}
        </div>
      )
    }

    return children
  }

  /**
   * Merge content style with auto-scroll override.
   * When auto-scroll is active, switch to block display with hidden overflow
   * so the scroll container handles the flex layout instead.
   */
  const previewContentStyle: React.CSSProperties = autoScroll
    ? { ...mergedContentStyle, display: 'block', overflow: 'hidden' }
    : mergedContentStyle

  return (
    <div
      data-frame-renderer
      data-element-id={element.id}
      data-sticky={isSticky ? 'true' : undefined}
      data-scroll={isScrollEnabled ? 'true' : undefined}
      data-auto-scroll={autoScroll ? 'true' : undefined}
      className={responsive.wrapperClassName || undefined}
      style={{
        ...getPositionStyles(),
        width: widthValue,
        /* When autoWidth + row parent, use flex: 1 1 0% for equal space distribution */
        ...(hasAutoWidth && isParentRow ? { flex: '1 1 0%', minWidth: 0 } : {}),
        /**
         * Height sizing:
         * - Pages use auto height with minHeight so they grow with content but
         *   never shrink below the configured page height.
         * - Wrap-mode frames ("Fit Content") use auto height WITHOUT minHeight,
         *   so the frame shrinks to exactly its children's size. A minHeight floor
         *   would prevent this and leave extra space at the bottom.
         * - All other frames use their fixed pixel height.
         */
        height: (isPage || shouldAutoHeight) ? 'auto' : frameHeight,
        ...(isPage ? { minHeight: frameHeight } : {}),
        overflow: (isScrollEnabled || autoScroll) ? 'hidden' : undefined,
        ...(shouldAutoHeight ? {} : responsive.wrapperStyleOverrides),
        /**
         * Margin on the OUTER wrapper — creates space outside the element.
         * Resolved with responsive awareness so mobile can override desktop margin.
         * Must NOT be on the inner content div (where it would act like padding).
         */
        margin: getStyleValue<string>(element, 'margin', breakpoint) || undefined,
      }}
    >
      {/* Inject keyframes for auto-scroll animation */}
      {autoScroll && autoScrollKeyframes && (
        <style dangerouslySetInnerHTML={{ __html: autoScrollKeyframes.keyframes }} />
      )}

      {/* Inner content area with flex layout */}
      <div
        data-element-content={element.id}
        className={[responsive.contentClassName, gradientBorder.className].filter(Boolean).join(' ') || undefined}
        style={previewContentStyle}
      >
        {/* ================================================================
            BACKGROUND VIDEO LAYER (preview: actual video playback)
            Auto-playing, looping, muted video positioned behind all content.
            pointer-events: none makes it non-interactive — users interact
            with the frame's children, not the background video.
            ================================================================ */}
        {isVideoMode && (
          <video
            src={bgVideoConfig?.src}
            poster={bgVideoConfig?.poster}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              /* Read video fit from styles.__backgroundVideoFit (property registry),
                 falling back to BackgroundVideoConfig.objectFit, then 'cover' */
              objectFit: ((element.styles as Record<string, unknown>)?.__backgroundVideoFit as string
                || bgVideoConfig?.objectFit || 'cover') as React.CSSProperties['objectFit'],
              zIndex: 0,
              pointerEvents: 'none',
              borderRadius: contentStyle.borderRadius,
            }}
          />
        )}

        {/* ================================================================
            GRADIENT OVERLAY (when video mode + gradient both active)
            Renders the gradient as a DOM overlay ON TOP of the video.
            Common for tinted overlays that improve text legibility.
            ================================================================ */}
        {gradientOverlayCSS && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              pointerEvents: 'none',
              borderRadius: contentStyle.borderRadius,
              backgroundImage: gradientOverlayCSS,
            }}
          />
        )}

        {/* Gradient border overlay — injects CSS for ::before pseudo-element */}
        {gradientBorder.isActive && (
          <GradientBorderOverlay
            elementId={element.id}
            borderConfig={borderConfig}
            borderRadius={contentStyle.borderRadius}
          />
        )}

        {/* Provide this frame's flex direction + smart grid state to children.
            When video mode is active, children are elevated above the video/gradient
            layers via a z-index wrapper that inherits the parent's flex layout. */}
        <ParentFlexDirectionProvider value={computedFlexDirection}>
        <ParentSmartGridProvider value={isSmartGrid}>
          {isVideoMode ? (
            <div
              style={{
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                flexDirection: previewContentStyle.flexDirection as React.CSSProperties['flexDirection'],
                alignItems: previewContentStyle.alignItems as string,
                justifyContent: previewContentStyle.justifyContent as string,
                gap: previewContentStyle.gap as number | undefined,
                flexWrap: previewContentStyle.flexWrap as React.CSSProperties['flexWrap'],
                width: '100%',
                flex: 1,
              }}
            >
              {renderContainerContent(renderPreviewChildren())}
            </div>
          ) : (
            renderContainerContent(renderPreviewChildren())
          )}
        </ParentSmartGridProvider>
        </ParentFlexDirectionProvider>
      </div>
    </div>
  )
})

// ============================================================================
// CANVAS HELPER HOOK — Provides sizing metadata for ElementWrapper
// ============================================================================

/**
 * Hook to compute canvas-specific values that get passed to ElementWrapper.
 *
 * SOURCE OF TRUTH: UnifiedFrameMeta, frame-canvas-meta
 *
 * Used by CanvasFrameElement (in canvas-unified-wrappers.tsx) to compute:
 * - sizeStyles: { width, height } for the wrapper element
 * - dimensionLabel: "Fill x Auto", "1440 x 600", etc. for the dimensions pill
 * - wrapperOverrides: overflow hidden for scroll mode, display none for invisible
 * - responsiveClassName: container query className from computeResponsiveFrameStyles
 * - responsiveWrapperOverrides: wrapper style overrides (only when NOT auto-height)
 * - isMasterComponent: whether this frame is a master component source
 *
 * USAGE:
 * ```tsx
 * const frameMeta = useUnifiedFrameMeta(element)
 *
 * <ElementWrapper
 *   element={element}
 *   sizeStyleOverrides={frameMeta.sizeStyles}
 *   dimensionLabel={frameMeta.dimensionLabel}
 *   ...
 * >
 *   <UnifiedFrame element={element}>{children}</UnifiedFrame>
 * </ElementWrapper>
 * ```
 */
export function useUnifiedFrameMeta(element: FrameElementType | PageElementType) {
  /** Read the parent frame's flex direction for autoWidth sizing in row layouts */
  const parentFlexDirection = useParentFlexDirection()

  return useMemo(() => {
    const isPage = element.type === 'page'

    // ======================================================================
    // FRAME SIZING
    // ======================================================================

    /**
     * For frames, use computeFrameSizing (single source of truth).
     * Passes parentFlexDirection so autoWidth in row parents uses flex: 1
     * instead of width: 100%.
     * For pages, compute manually — fixed width, no autoWidth, no scroll.
     */
    const sizing = element.type === 'frame'
      ? computeFrameSizing(element as FrameElementType, 'desktop', parentFlexDirection)
      : null

    const hasAutoWidth = sizing?.hasAutoWidth ?? false
    const hasWrap = sizing?.hasWrap ?? false
    const isSmartGridMeta = sizing?.isSmartGrid ?? false
    const isScrollEnabled = sizing?.isScrollEnabled ?? false
    /** Smart grid uses auto-height like wrap mode — grid rows expand naturally */
    const shouldAutoHeight = hasWrap || isSmartGridMeta

    /** Width: autoWidth -> '100%', otherwise fixed pixel value */
    const width: number | string = sizing
      ? sizing.width
      : element.width

    /**
     * Height: wrap mode -> 'auto', otherwise fixed pixel value.
     * Pages use 'auto' so they grow with inner content, with minHeight
     * set to element.height ensuring they never shrink below the user's
     * configured page height.
     */
    const height: number | string = sizing
      ? sizing.height
      : 'auto'

    const sizeStyles: React.CSSProperties = {
      width,
      height,
      /**
       * Pages keep minHeight so they never shrink below the configured page height.
       *
       * Wrap-mode frames do NOT get minHeight — when the user selects "Fit Content",
       * they expect the frame to shrink to exactly its children's size. A minHeight
       * floor prevents this and creates visible extra space at the bottom, especially
       * when the frame's stored height is larger than its content (e.g., an image
       * shorter than the original frame height).
       */
      ...(isPage ? { minHeight: element.height } : {}),
      /* Include flex distribution props when autoWidth in a row parent */
      ...(sizing?.flex ? { flex: sizing.flex } : {}),
      ...(sizing?.minWidth !== undefined ? { minWidth: sizing.minWidth } : {}),
    }

    // ======================================================================
    // DIMENSION LABEL (for the dimensions pill on canvas)
    // ======================================================================

    /**
     * Build the dimension label string shown in the blue pill below selected elements.
     * Format: "{width} x {height}" with "Fill" and "Auto" substitutions.
     */
    const widthLabel = hasAutoWidth ? 'Fill' : String(Math.round(element.width))
    const heightLabel = shouldAutoHeight ? 'Auto' : String(Math.round(element.height))
    const dimensionLabel = `${widthLabel} \u00D7 ${heightLabel}`

    // ======================================================================
    // WRAPPER OVERRIDES (overflow, visibility)
    // ======================================================================

    /**
     * Compute wrapper style overrides for the canvas ElementWrapper.
     * - Scroll mode: overflow hidden so content scrolls inside fixed bounds
     * - Invisible elements: display none to match preview behavior
     */
    const wrapperOverrides: React.CSSProperties = {
      ...(isScrollEnabled ? { overflow: 'hidden' as const } : {}),
      ...(element.visible === false ? { display: 'none' as const } : {}),
    }

    // ======================================================================
    // RESPONSIVE STYLES
    // ======================================================================

    /**
     * Compute responsive container query classes and style overrides.
     * Pages skip responsive (always root), frames get container query support.
     */
    const responsive = element.type === 'frame'
      ? computeResponsiveFrameStyles(element as FrameElementType)
      : { wrapperClassName: '', contentClassName: '', wrapperStyleOverrides: {}, contentStyleOverrides: {} }

    const responsiveClassName = responsive.wrapperClassName

    /**
     * Responsive wrapper overrides are only applied when NOT in auto-height mode.
     * In auto-height mode (wrap enabled), applying minHeight from responsive
     * overrides would prevent the wrapper from shrinking with content.
     */
    const responsiveWrapperOverrides: React.CSSProperties = shouldAutoHeight
      ? {}
      : responsive.wrapperStyleOverrides

    // ======================================================================
    // MASTER COMPONENT FLAG
    // ======================================================================

    /**
     * A frame with masterOfComponentId is the master source for a LocalComponent.
     * This flag controls purple styling in ElementWrapper.
     */
    const isMasterComponent = element.type === 'frame'
      && Boolean((element as FrameElementType).masterOfComponentId)

    // ======================================================================
    // CONTAINER FLAG
    // ======================================================================

    /**
     * Container mode — used by canvas wrapper if needed.
     * Pages default to true, frames default to false.
     */
    const hasContainer = isPage
      ? (element as PageElementType).container !== false
      : (element as FrameElementType).container === true

    return {
      sizeStyles,
      dimensionLabel,
      hasContainer,
      isScrollEnabled,
      wrapperOverrides,
      responsiveClassName,
      responsiveWrapperOverrides,
      isMasterComponent,
    }
  }, [element, parentFlexDirection])
}
