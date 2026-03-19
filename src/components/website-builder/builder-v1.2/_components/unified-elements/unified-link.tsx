/**
 * ============================================================================
 * UNIFIED LINK ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedLink, unified-link, link-element-unified
 *
 * Replaces elements/link-element.tsx + renderers/link-element-renderer.tsx
 *
 * Links are frame-like containers that navigate to URLs when clicked.
 * Two link types: 'static' (fixed URL) and 'dynamic' (CMS row page URL).
 *
 * CANVAS MODE: Returns content-only div. ElementWrapper handles chrome.
 *   Cyan (#06b6d4) selection color via ElementWrapper's selectionColor prop.
 *
 * PREVIEW MODE: Self-contained navigable container with full positioning.
 *   External/hash -> <a>, internal -> Next.js <Link>, dynamic -> CMS row URL.
 *   Hidden elements return null.
 *
 * vs Frame: Links add navigation, use cyan color, no sticky/scroll support.
 * ============================================================================
 */

'use client'

import React, { memo } from 'react'
import Link from 'next/link'
import type {
  LinkElement as LinkElementType,
  FrameElement as FrameElementType,
  Breakpoint,
  BorderConfig,
} from '../../_lib/types'
import {
  computeFrameContentStyles,
  computeResponsiveFrameStyles,
  getPropertyValue,
  getStyleValue,
  useRenderMode,
  ParentFlexDirectionProvider,
  useParentFlexDirection,
} from '../../_lib'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'
import { useCmsRowContext } from '../../_lib/cms-row-context'
import { resolveNavigationHref } from '../renderers/page-renderer/utils'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedLink component.
 *
 * SOURCE OF TRUTH: UnifiedLinkProps
 *
 * In canvas mode, ElementWrapper handles all editor chrome. This component
 * only renders the visual content (flex layout, gradient borders, container).
 * In preview mode, the component handles its own positioned wrapper + navigation.
 */
export interface UnifiedLinkProps {
  /** The link element data -- SOURCE OF TRUTH: LinkElement from types.ts */
  element: LinkElementType
  /** Children elements rendered by the parent (recursive element tree) */
  children?: React.ReactNode
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Unified link element that renders in both canvas and preview modes.
 *
 * CANVAS: Returns content-only div. ElementWrapper handles chrome.
 * PREVIEW: Returns self-contained navigable container with positioning.
 *
 * Uses computeFrameContentStyles (cast from LinkElement to FrameElement)
 * as the single source of truth for all visual styles -- flexbox layout,
 * background, borders, padding, effects, etc.
 */
export const UnifiedLink = memo(function UnifiedLink({
  element,
  children,
}: UnifiedLinkProps) {
  // Read the rendering context -- mode, breakpoint, basePath, pageSlugColumns
  const { mode, breakpoint: activeBreakpoint, basePath, pageSlugColumns } = useRenderMode()
  const isCanvasMode = mode === 'canvas'
  const isPreviewMode = mode === 'preview'

  // CMS row context for dynamic link resolution -- always called (hooks can't be conditional)
  const cmsContext = useCmsRowContext()

  // ==========================================================================
  // GRADIENT BORDER SUPPORT
  // ==========================================================================

  /**
   * Extract border configuration for gradient border rendering.
   * __borderConfig is a private property on element.styles that holds per-side
   * border widths and gradient configuration for CSS ::before pseudo-element.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const borderConfig = (element.styles as any)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ==========================================================================
  // CONTENT STYLE COMPUTATION
  // ==========================================================================

  /**
   * Compute visual styles via the shared utility (single source of truth).
   * We cast LinkElement to FrameElement because they share the same style
   * structure -- both use ElementStyles for flexbox, background, padding, etc.
   *
   * Canvas mode: allowOverflow=true so child overlays are not clipped.
   * Preview mode: allowOverflow=false, uses breakpoint for responsive styles.
   */
  const contentStyle = computeFrameContentStyles(
    element as unknown as FrameElementType,
    false,
    { allowOverflow: isCanvasMode, breakpoint: activeBreakpoint }
  )

  /**
   * Compute responsive frame styles (wrapper className, content overrides).
   * Handles scroll mode, wrap mode height adaption, and fade edges.
   */
  const responsive = computeResponsiveFrameStyles(
    element as unknown as FrameElementType
  )

  // ==========================================================================
  // SIZING PROPERTIES
  // ==========================================================================

  /**
   * Resolve autoWidth, autoHeight, container, and dimensions.
   * Canvas uses desktop breakpoint (element base values).
   * Preview uses the active breakpoint for responsive overrides.
   */
  const hasAutoWidth = isCanvasMode
    ? element.autoWidth === true
    : getPropertyValue<boolean>(element, 'autoWidth', activeBreakpoint, false) ?? false

  const hasAutoHeight = isCanvasMode
    ? element.autoHeight === true
    : getPropertyValue<boolean>(element, 'autoHeight', activeBreakpoint, true) ?? true

  const hasContainer = isCanvasMode
    ? element.container === true
    : getPropertyValue<boolean>(element, 'container', activeBreakpoint, false) ?? false

  /** Wrap mode causes height to auto-adapt regardless of autoHeight setting */
  const hasWrap = element.styles?.flexWrap === 'wrap'
  const shouldAutoHeight = hasWrap || hasAutoHeight

  // ==========================================================================
  // MERGED CONTENT STYLE
  // ==========================================================================

  /**
   * Merge base content styles with responsive overrides and link-specific
   * properties. textDecoration/color prevent link styling from leaking
   * into child text elements.
   */
  const mergedContentStyle: React.CSSProperties = {
    ...contentStyle,
    ...responsive.contentStyleOverrides,
    // Keep visible overflow for child support (no scroll mode on links)
    overflowX: 'visible',
    overflowY: 'visible',
    position: 'relative',
    textDecoration: 'none',
    color: 'inherit',
    ...(isPreviewMode ? { cursor: 'pointer' } : {}),
    /* Kill transition in canvas — prevents content lagging behind
       handles/selection ring during drag and resize at any zoom level. */
    ...(isCanvasMode ? { transition: 'none' } : {}),
  }

  // ==========================================================================
  // PARENT FLEX DIRECTION — provided to children via context
  // ==========================================================================

  /**
   * Extract the computed flex direction to provide to children via context.
   * Children use this to determine if autoWidth should use flex: 1 (row parent)
   * or width: 100% (column parent).
   */
  const computedFlexDirection = (contentStyle.flexDirection as string) || 'column'

  // ==========================================================================
  // SHARED CONTENT RENDERER
  // ==========================================================================

  /**
   * Renders the inner content area shared between canvas and preview modes.
   * Includes gradient border overlay and optional container wrapper (max-width 1280px).
   */
  const renderContent = () => (
    <div
      data-element-content={element.id}
      className={
        [responsive.contentClassName, gradientBorder.className]
          .filter(Boolean)
          .join(' ') || undefined
      }
      style={mergedContentStyle}
    >
      {/* Gradient border overlay -- injects CSS for ::before pseudo-element */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={contentStyle.borderRadius}
        />
      )}

      {/* Provide this link's flex direction to children for autoWidth sizing */}
      <ParentFlexDirectionProvider value={computedFlexDirection}>
        {/* Container wrapper centers content at max-width 1280px */}
        {hasContainer ? (
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
              flex: shouldAutoHeight ? undefined : 1,
              height: shouldAutoHeight ? 'auto' : undefined,
              position: 'relative',
            }}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </ParentFlexDirectionProvider>
    </div>
  )

  // ==========================================================================
  // CANVAS MODE -- Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  if (isCanvasMode) {
    return renderContent()
  }

  // ==========================================================================
  // PREVIEW MODE -- Self-contained navigable container
  // ==========================================================================

  /**
   * Read parent flex direction BEFORE any conditional returns (React hooks rule).
   * Used for autoWidth behavior — row parent uses flex: 1, column uses width: 100%.
   */
  const parentFlexDirection = useParentFlexDirection()
  const isParentRow = parentFlexDirection === 'row' || parentFlexDirection === 'row-reverse'

  /** Hidden elements are not rendered in preview/published mode.
   *  Uses getPropertyValue for responsive-aware visibility check. */
  const isVisible = getPropertyValue<boolean>(element, 'visible', activeBreakpoint, true)
  if (!isVisible) return null

  /**
   * Responsive-aware width and height for preview positioning.
   * These use getPropertyValue to resolve mobile breakpoint overrides.
   */
  const frameWidth = getPropertyValue<number>(element, 'width', activeBreakpoint, element.width) ?? element.width
  const frameHeight = getPropertyValue<number>(element, 'height', activeBreakpoint, element.height) ?? element.height

  /**
   * Resolve the navigation URL based on link type.
   * STATIC: resolveNavigationHref handles basePath-aware routing.
   * DYNAMIC: basePath/{targetPageSlug}/{rowId} from CMS row context.
   */
  const resolveHref = (): string => {
    const linkType = element.linkType ?? 'static'

    if (linkType === 'static') {
      return resolveNavigationHref(element.href, basePath)
    }

    // Dynamic link -- needs CMS row context for row data
    if (!cmsContext?.row) return '#'
    const targetPageSlug = element.targetPageSlug
    if (!targetPageSlug) return '#'
    // Strip leading slash from slug — PageInfo slugs are stored as "/blog" but
    // we already prepend "/" in the template literal, avoiding double slashes
    const cleanSlug = targetPageSlug.startsWith('/') ? targetPageSlug.slice(1) : targetPageSlug
    /**
     * Use slug column value for SEO-friendly URLs when configured.
     * 3-tier resolution: context pageSlugColumns (fresh DB) → cached element value → row ID.
     * SOURCE OF TRUTH: LinkTargetPageSlugColumn, DynamicLinkSlug, PageSlugColumnsMap
     */
    const contextSlugCol = element.targetPageId ? pageSlugColumns?.[element.targetPageId] : undefined
    const resolvedSlugCol = contextSlugCol || element.targetPageSlugColumn
    const rowIdentifier = resolvedSlugCol
      ? (String(cmsContext.row.values?.[resolvedSlugCol] || '') || cmsContext.row.id)
      : cmsContext.row.id
    return `${basePath ?? ''}/${cleanSlug}/${encodeURIComponent(rowIdentifier)}`
  }

  const href = resolveHref()
  const openInNewTab = element.openInNewTab ?? false
  const isExternalLink = href.startsWith('http://') || href.startsWith('https://')

  const isRoot = element.parentId === null
  const isAbsolutelyPositioned = !isRoot && element.isAbsolute === true

  /**
   * Compute CSS positioning for the wrapper element.
   * Root elements are absolute on the page. Absolute children use CSS centering.
   * Normal children flow via parent flexbox (position: relative).
   */
  const getPositionStyles = (): React.CSSProperties => {
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
       * Only set z-index on root or absolute elements. Normal-flow children
       * use undefined (auto) so they don't create stacking contexts that
       * would trap absolute siblings behind them.
       * SOURCE OF TRUTH: StackingContextControl
       */
      zIndex: (isRoot || isAbsolutelyPositioned) ? element.order : undefined,
      transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    }
  }

  /**
   * Width: autoWidth always uses '100%' so inner content resolves percentage widths.
   * In row parents, flex: 1 1 0% overrides for flex sizing (flex-basis takes priority).
   */
  const getWidthStyle = (): number | string => {
    if (hasAutoWidth) return '100%'
    return frameWidth
  }

  /**
   * Wrapper style combines positioning + dimensions for the outer link tag.
   * display: 'block' overrides the default inline behavior of <a> and <Link>.
   * When autoWidth + row parent, flex: 1 1 0% distributes space equally.
   */
  const wrapperStyle: React.CSSProperties = {
    ...getPositionStyles(),
    width: getWidthStyle(),
    /* When autoWidth + row parent, use flex: 1 1 0% for equal space distribution */
    ...(hasAutoWidth && isParentRow ? { flex: '1 1 0%', minWidth: 0 } : {}),
    height: shouldAutoHeight ? 'auto' : frameHeight,
    display: 'block',
    /** Margin on OUTER wrapper — creates space outside the element, not inside */
    margin: getStyleValue<string>(element, 'margin', activeBreakpoint) || undefined,
  }

  /** External or hash links as <a>, internal links as Next.js <Link> */
  if (isExternalLink || href === '#') {
    return (
      <a
        data-link-renderer
        data-element-id={element.id}
        href={href}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noopener noreferrer' : undefined}
        aria-label={element.ariaLabel || undefined}
        className={responsive.wrapperClassName || undefined}
        style={wrapperStyle}
      >
        {renderContent()}
      </a>
    )
  }

  return (
    <Link
      data-link-renderer
      data-element-id={element.id}
      href={href}
      target={openInNewTab ? '_blank' : undefined}
      aria-label={element.ariaLabel || undefined}
      className={responsive.wrapperClassName || undefined}
      style={wrapperStyle}
    >
      {renderContent()}
    </Link>
  )
})

/**
 * Hook for CanvasLinkElement wrapper -- computes canvas-specific metadata
 * (sizing, dimension label, responsive classes) for the ElementWrapper.
 *
 * SOURCE OF TRUTH: useUnifiedLinkMeta, link-canvas-meta
 */
export function useUnifiedLinkMeta(element: LinkElementType) {
  /** Read the parent frame's flex direction for autoWidth sizing in row layouts */
  const parentFlexDirection = useParentFlexDirection()
  const isParentRow = parentFlexDirection === 'row' || parentFlexDirection === 'row-reverse'

  // --- Size computation (desktop breakpoint for canvas) ---
  const hasAutoWidth = element.autoWidth === true
  const hasAutoHeight = element.autoHeight === true
  const hasWrap = element.styles?.flexWrap === 'wrap'
  const shouldAutoHeight = hasWrap || hasAutoHeight

  /**
   * Width: autoWidth always '100%' so inner content resolves percentage widths.
   * flex: 1 1 0% (applied below when isParentRow) overrides for flex layout.
   */
  const width = hasAutoWidth ? '100%' : element.width
  const height = shouldAutoHeight ? 'auto' : element.height

  const sizeStyles: React.CSSProperties = {
    width,
    height,
    /* Include flex distribution props when autoWidth in a row parent */
    ...(hasAutoWidth && isParentRow ? { flex: '1 1 0%', minWidth: 0 } : {}),
  }

  // --- Dimension label for the dimensions pill (e.g., "Fill x Auto") ---
  const widthLabel = hasAutoWidth ? 'Fill' : String(Math.round(element.width))
  const heightLabel = shouldAutoHeight ? 'Auto' : String(Math.round(element.height))
  const dimensionLabel = `${widthLabel} \u00D7 ${heightLabel}`

  // --- Responsive class and wrapper overrides ---
  const responsive = computeResponsiveFrameStyles(
    element as unknown as FrameElementType
  )
  const responsiveClassName = responsive.wrapperClassName
  const responsiveWrapperOverrides = shouldAutoHeight
    ? ({} as React.CSSProperties)
    : responsive.wrapperStyleOverrides

  return {
    sizeStyles,
    dimensionLabel,
    responsiveClassName,
    responsiveWrapperOverrides,
  }
}
