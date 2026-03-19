/**
 * ============================================================================
 * UNIFIED SMARTCMS LIST ELEMENT - Single Component for Canvas + Preview Modes
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedSmartCmsList, unified-smartcms-list-element, cms-list-rendering
 *
 * This component replaces the old split pattern of:
 *   - elements/smartcms-list-element.tsx (canvas-only)
 *   - renderers/page-renderer/smartcms-renderer.tsx (preview-only)
 *
 * It renders SmartCMS List elements in BOTH modes using `useRenderMode()`:
 *
 *   CANVAS MODE:
 *   - Returns ONLY the inner content (empty state, source-set indicator,
 *     or configured preview with live CMS data). ElementWrapper handles all
 *     editor chrome (selection ring, hover ring, resize handles, labels).
 *
 *   PREVIEW MODE:
 *   - Self-contained wrapper with full positioning, CMS data fetching via
 *     useInfiniteQuery, CmsRowProvider wrapping each row, infinite scroll
 *     detection, and SmartCmsListItemRenderer for per-row rendering.
 *
 *   SHARED (both modes):
 *   - Content style computation via computeFrameContentStyles
 *   - Responsive/fade styles via computeResponsiveFrameStyles
 *   - Gradient border support
 *
 * Also exports `useUnifiedSmartCmsListMeta` hook — used by the canvas
 * wrapper (CanvasSmartCmsListElement) to compute sizing, dimension label,
 * and other values passed to ElementWrapper.
 *
 * ============================================================================
 */

'use client'

import React, { memo, useMemo, useContext } from 'react'
import type {
  SmartCmsListElement as SmartCmsListType,
  FrameElement,
  CanvasElement,
  LocalComponent,
  BorderConfig,
} from '../../_lib/types'
import {
  DEFAULT_SMARTCMS_LIST_STYLES,
  DEFAULT_SMARTCMS_LIST_PROPS,
  DEFAULT_FRAME_STYLES,
} from '../../_lib/types'
import {
  useRenderMode,
  computeFrameContentStyles,
  computeResponsiveFrameStyles,
  useAppSelector,
  selectLocalComponents,
  selectPageInfos,
  getPropertyValue,
  getStyleValue,
  useParentFlexDirection,
  ParentFlexDirectionProvider,
  ParentSmartGridProvider,
} from '../../_lib'
import type { RootState } from '../../_lib'
import { useBuilderContextSafe } from '../../_lib/builder-context'
import { applyPropValuesToElements } from '../../_lib/component-utils'
import { hasGradientBorder, getGradientBorderClassName } from '../../_lib/border-utils'
import { GradientBorderOverlay } from '../overlay'
import { CmsRowProvider } from '../../_lib/cms-row-context'
import {
  ComponentChildRenderer,
} from '../renderers/page-renderer/component-instance-renderer'
import { NonInteractiveChildRenderer } from '../shared/non-interactive-child-renderer'
import { ReactReduxContext } from 'react-redux'
import Link from 'next/link'
import { trpc } from '@/trpc/react-provider'
import { Database, Settings, Layers, Loader2 } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedSmartCmsList component.
 *
 * SOURCE OF TRUTH: UnifiedSmartCmsListProps, unified-smartcms-list-props
 *
 * Both canvas and preview modes receive the same props. The component uses
 * useRenderMode() internally to decide which rendering path to take.
 */
export interface UnifiedSmartCmsListProps {
  /** The SmartCMS list element data */
  element: SmartCmsListType
  /**
   * Children elements rendered by the parent (canvas.tsx or page-renderer.tsx).
   * In canvas mode these are the child elements inside the list container.
   * In preview mode, the component handles its own children via CMS data.
   */
  children?: React.ReactNode
}

/**
 * Baked CMS data from publish time — the first page of CMS rows.
 * When present, the list renders instantly without client-side fetch.
 *
 * SOURCE OF TRUTH: BakedCmsData, baked-cms-snapshot
 */
interface BakedCmsData {
  rows: Array<{ id: string; values: Record<string, unknown>; order: number }>
  nextCursor: number | undefined
  hasMore: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified SmartCMS list element that renders in both canvas and preview modes.
 *
 * CANVAS MODE returns only the inner content:
 * - Content div with computeFrameContentStyles + responsive overrides
 * - Three visual states: empty, source-set, configured preview
 * - Live CMS data preview when fully configured
 *
 * PREVIEW MODE renders everything self-contained:
 * - Outer wrapper with full positioning (normal/absolute)
 * - CMS data fetching with infinite scroll pagination
 * - CmsRowProvider wrapping each row for dynamic link resolution
 * - Loading, error, and empty states
 * - Gradient border support
 *
 * The component does NOT accept children in preview mode — it renders its
 * own items by mapping CMS rows to component instances.
 */
export const UnifiedSmartCmsList = memo(function UnifiedSmartCmsList({
  element,
  children,
}: UnifiedSmartCmsListProps) {
  const { mode, breakpoint, organizationId: ctxOrganizationId, basePath, components: ctxComponents, cmsSnapshots } = useRenderMode()
  const isCanvasMode = mode === 'canvas'

  if (isCanvasMode) {
    return <CanvasContent element={element}>{children}</CanvasContent>
  }

  return (
    <PreviewContent
      element={element}
      ctxOrganizationId={ctxOrganizationId}
      basePath={basePath}
      ctxComponents={ctxComponents}
      cmsSnapshots={cmsSnapshots}
    />
  )
})

// ============================================================================
// CANVAS MODE — Content only, ElementWrapper handles chrome
// ============================================================================

/**
 * Canvas-mode content for the SmartCMS list element.
 *
 * Renders three visual states based on configuration progress:
 * 1. EMPTY — no source component selected, prompts user to configure
 * 2. SOURCE SET — component chosen but no CMS table connected
 * 3. CONFIGURED — live CMS data preview with actual component instances
 *
 * Uses the same computeFrameContentStyles as frames for consistent layout
 * behavior (flexbox, background, border, overflow).
 */
function CanvasContent({
  element,
  children: _children,
}: {
  element: SmartCmsListType
  children?: React.ReactNode
}) {
  const localComponents = useAppSelector(selectLocalComponents)
  const builderContext = useBuilderContextSafe()
  const organizationId = builderContext?.organizationId ?? ''

  // ========================================================================
  // ELEMENT PROPERTIES — merge defaults with element values
  // ========================================================================
  const {
    pageSize = DEFAULT_SMARTCMS_LIST_PROPS.pageSize,
    autoHeight = DEFAULT_SMARTCMS_LIST_PROPS.autoHeight,
    responsive = DEFAULT_SMARTCMS_LIST_PROPS.responsive,
    sourceComponentId,
    cmsTableId,
    propBindings = {},
  } = element

  const styles = { ...DEFAULT_SMARTCMS_LIST_STYLES, ...(element.styles ?? {}) }

  // ========================================================================
  // CONFIGURATION STATE — determines which visual state to show
  // ========================================================================
  const hasSource = Boolean(sourceComponentId)
  const hasTable = Boolean(cmsTableId)
  const isConfigured = hasSource && hasTable

  const sourceComponent = sourceComponentId ? localComponents[sourceComponentId] : null
  const sourceComponentName = sourceComponent?.name || 'Unknown Component'

  // ========================================================================
  // CONTENT STYLES — frame-compatible layout computation
  // ========================================================================
  /**
   * Uses computeFrameContentStyles for consistent behavior with frames.
   * allowOverflow: true prevents child overlays from being clipped on canvas.
   */
  const baseContentStyles = computeFrameContentStyles(
    element as unknown as FrameElement,
    false,
    { allowOverflow: true }
  )

  /**
   * Get responsive/fade edges styles from computeResponsiveFrameStyles.
   * SmartCMS list supports fade edges effect just like frames.
   */
  const responsiveStyles = computeResponsiveFrameStyles(element as unknown as FrameElement)
  const fadeEdgesStyles = responsiveStyles.contentStyleOverrides ?? {}

  /** Flex direction determines scroll axis */
  const flexDirection = (styles.flexDirection as 'row' | 'column') || 'column'

  /**
   * Merge base content styles with fade edges and CMS-list-specific overrides.
   * Scroll handling uses the 'responsive' property (same as frames).
   */
  const contentStyles: React.CSSProperties = {
    ...baseContentStyles,
    ...fadeEdgesStyles,
    height: autoHeight ? 'auto' : '100%',
    minHeight: autoHeight ? 100 : undefined,
    /* Diagonal stripe pattern for unconfigured state */
    backgroundImage: !isConfigured
      ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(6, 182, 212, 0.03) 10px, rgba(6, 182, 212, 0.03) 20px)'
      : baseContentStyles.backgroundImage,
    /* Scroll handling when responsive (scroll mode) is enabled */
    ...(responsive && {
      overflowX: flexDirection === 'row' ? 'auto' : 'hidden',
      overflowY: flexDirection === 'column' ? 'auto' : 'hidden',
      scrollBehavior: 'smooth',
      scrollbarWidth: 'none' as const,
      msOverflowStyle: 'none' as React.CSSProperties['msOverflowStyle'],
    }),
    /* Kill transition on canvas — wrapper resizes instantly during drag */
    transition: 'none',
  }

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <div style={contentStyles}>
      {/* ================================================================
          EMPTY STATE — No source component selected yet.
          Prompts user to configure in the Settings panel.
          ================================================================ */}
      {!hasSource && (
        <div
          style={{
            width: '100%',
            minHeight: 150,
            border: '2px dashed rgba(6, 182, 212, 0.4)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            backgroundColor: 'rgba(6, 182, 212, 0.05)',
            color: 'rgba(6, 182, 212, 0.8)',
            padding: 24,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: 'rgba(6, 182, 212, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Settings style={{ width: 24, height: 24 }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              Select a Component
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Open Settings to choose a reusable component as the item template
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          SOURCE SET BUT NO TABLE — Component template is chosen but
          CMS table not yet connected. Shows component name indicator.
          ================================================================ */}
      {hasSource && !hasTable && (
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Component name indicator */}
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(147, 51, 234, 0.1)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'rgba(147, 51, 234, 0.9)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <Layers style={{ width: 14, height: 14 }} />
            Template: {sourceComponentName}
          </div>

          {/* Placeholder items showing template preview */}
          {Array.from({ length: Math.min(3, pageSize) }).map((_, index) => (
            <div
              key={index}
              style={{
                width: '100%',
                height: 60,
                backgroundColor: 'rgba(6, 182, 212, 0.05)',
                border: '1px dashed rgba(6, 182, 212, 0.3)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(6, 182, 212, 0.5)',
                fontSize: 12,
              }}
            >
              <Layers style={{ width: 16, height: 16, marginRight: 8, opacity: 0.5 }} />
              Item {index + 1} (Connect CMS Table)
            </div>
          ))}

          {/* Connect CMS indicator */}
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(6, 182, 212, 0.1)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'rgba(6, 182, 212, 0.8)',
              fontSize: 12,
            }}
          >
            <Database style={{ width: 14, height: 14 }} />
            Select a CMS table in Settings to connect data
          </div>
        </div>
      )}

      {/* ================================================================
          FULLY CONFIGURED — Source and table are set.
          Shows live CMS data preview with actual component instances.
          ================================================================ */}
      {isConfigured && (
        <CanvasConfiguredPreview
          sourceComponent={sourceComponent}
          pageSize={pageSize}
          styles={styles}
          cmsTableId={cmsTableId!}
          propBindings={propBindings}
          organizationId={organizationId}
        />
      )}
    </div>
  )
}

// ============================================================================
// CANVAS CONFIGURED PREVIEW — Renders actual component template with CMS data
// ============================================================================

interface CanvasConfiguredPreviewProps {
  sourceComponent: LocalComponent | null
  pageSize: number
  styles: Record<string, unknown>
  cmsTableId: string
  propBindings: Record<string, string>
  organizationId: string
}

/**
 * Renders a visual preview of the configured SmartCMS List on the canvas.
 *
 * Fetches ACTUAL CMS data and renders component instances with real values
 * so users see an accurate representation of their list items.
 *
 * Shows:
 * 1. Loading skeleton/spinner while CMS data loads
 * 2. Empty state if no rows exist
 * 3. Actual CMS data bound to component instances
 * 4. Item count indicator for pagination info
 */
function CanvasConfiguredPreview({
  sourceComponent,
  pageSize,
  styles,
  cmsTableId,
  propBindings,
  organizationId,
}: CanvasConfiguredPreviewProps) {
  const localComponents = useAppSelector(selectLocalComponents)

  // ========================================================================
  // FETCH ACTUAL CMS DATA — Same data as preview renderer
  // ========================================================================
  /**
   * Fetch CMS data with sortOrder: 'asc' to match preview mode's ordering.
   * listRows defaults to 'desc' while listRowsInfinite defaults to 'asc',
   * so we explicitly set 'asc' here to keep canvas and live view consistent.
   */
  const { data: cmsData, isLoading } = trpc.cms.listRows.useQuery(
    {
      organizationId,
      tableId: cmsTableId,
      page: 1,
      pageSize,
      sortOrder: 'asc',
    },
    {
      enabled: Boolean(organizationId) && Boolean(cmsTableId),
    }
  )

  const rows = cmsData?.rows ?? []

  // Fallback if component data is not available
  if (!sourceComponent?.sourceTree) {
    return (
      <div
        style={{
          width: '100%',
          padding: 24,
          textAlign: 'center',
          color: 'rgba(6, 182, 212, 0.6)',
          fontSize: 12,
        }}
      >
        Loading component...
      </div>
    )
  }

  // ========================================================================
  // LOADING STATE — Show skeleton component or minimal spinner
  // ========================================================================
  if (isLoading) {
    const skeletonComponentId = sourceComponent?.loadingSkeletonComponentId
    const skeletonComponent = skeletonComponentId ? localComponents[skeletonComponentId] : null

    if (skeletonComponent?.sourceTree) {
      const skeletonResult = applyPropValuesToElements(skeletonComponent, {})
      if (skeletonResult?.rootElement) {
        const skeletonRoot = skeletonResult.rootElement as FrameElement
        const skeletonStyles = computeFrameContentStyles(skeletonRoot, false, { allowOverflow: true })
        const skeletonItems = Array.from({ length: pageSize }, (_, index) => index)

        return (
          <div
            style={{
              display: 'flex',
              flexDirection: styles.flexDirection as 'row' | 'column',
              gap: styles.gap as number,
              flexWrap: styles.flexWrap as 'nowrap' | 'wrap',
              justifyContent: styles.justifyContent as string | undefined,
              alignItems: styles.alignItems as string | undefined,
              width: '100%',
            }}
          >
            {skeletonItems.map((index) => (
              <div
                key={`skeleton-${index}`}
                style={{
                  position: 'relative',
                  width: skeletonRoot.width,
                  height: skeletonRoot.height,
                  ...skeletonStyles,
                  opacity: 0.6,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    borderRadius: 'inherit',
                  }}
                >
                  <Loader2
                    style={{ width: 20, height: 20, color: 'rgba(6, 182, 212, 0.8)' }}
                    className="animate-spin"
                  />
                </div>
              </div>
            ))}
          </div>
        )
      }
    }

    /* Fallback: Minimal centered spinner (no layout shift) */
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <Loader2
          style={{ width: 24, height: 24, color: 'rgba(6, 182, 212, 0.6)' }}
          className="animate-spin"
        />
      </div>
    )
  }

  // ========================================================================
  // EMPTY DATA STATE
  // ========================================================================
  if (rows.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          padding: 24,
          textAlign: 'center',
          color: 'rgba(6, 182, 212, 0.6)',
          fontSize: 12,
          border: '1px dashed rgba(6, 182, 212, 0.3)',
          borderRadius: 8,
        }}
      >
        No data in CMS table yet
      </div>
    )
  }

  // ========================================================================
  // CONFIGURED PREVIEW — Render actual CMS rows with component instances
  // ========================================================================
  const { rootElement: baseRootElement } = applyPropValuesToElements(sourceComponent, {}) || { rootElement: null }
  if (!baseRootElement) return null

  const baseRootFrame = baseRootElement as FrameElement
  const baseFrameStyles = { ...DEFAULT_FRAME_STYLES, ...(baseRootFrame.styles ?? {}) }
  const hasAutoWidth = baseRootFrame.autoWidth ?? false
  const flexWrap = baseFrameStyles.flexWrap as 'nowrap' | 'wrap' | undefined
  const isScrollEnabled = baseRootFrame.scrollEnabled ?? baseRootFrame.responsive ?? false
  const shouldAutoHeight = flexWrap === 'wrap' || isScrollEnabled

  /**
   * Render CMS rows exactly like the preview mode does — no extra chrome,
   * no index badges, no item count indicators. This ensures the canvas
   * shows a faithful representation of the live/published view.
   */
  return (
    <>
      {rows.map((row) => {
        /**
         * Build prop values from CMS row data using propBindings mapping.
         * propBindings: { exposedPropId: columnSlug }
         * row.values: { columnSlug: value }
         */
        const propValues: Record<string, unknown> = {}
        Object.entries(propBindings).forEach(([exposedPropId, columnSlug]) => {
          const value = row.values[columnSlug]
          if (value !== undefined) {
            propValues[exposedPropId] = value
          }
        })

        const renderedElements = applyPropValuesToElements(sourceComponent, propValues)
        if (!renderedElements) return null

        const { rootElement: itemRoot, childElements } = renderedElements
        const { childrenMap } = sourceComponent.sourceTree

        const rootChildIds = childrenMap[itemRoot.id] || []
        const rootChildren = rootChildIds
          .map((id) => childElements.find((el) => el.id === id))
          .filter((el): el is CanvasElement => el !== undefined)

        /* Compute styles from itemRoot (with CMS values applied) */
        const itemRootFrame = itemRoot as FrameElement
        const itemContentStyle = computeFrameContentStyles(itemRootFrame, false, { allowOverflow: true })

        /* Gradient border on the CMS-bound root frame */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemBorderConfig = (itemRootFrame.styles as any)?.__borderConfig as BorderConfig | undefined
        const hasItemGradientBorder = itemBorderConfig && hasGradientBorder(itemBorderConfig)
        const itemGradientClassName = hasItemGradientBorder
          ? getGradientBorderClassName(`canvas-preview-${row.id}`)
          : undefined

        return (
          <div
            key={row.id}
            style={{
              position: 'relative',
              width: hasAutoWidth ? '100%' : itemRootFrame.width,
              height: shouldAutoHeight ? 'auto' : itemRootFrame.height,
              overflow: 'visible',
            }}
          >
            <div
              className={itemGradientClassName || undefined}
              style={{
                ...itemContentStyle,
                width: '100%',
                height: shouldAutoHeight ? 'auto' : '100%',
              }}
            >
              {hasItemGradientBorder && (
                <GradientBorderOverlay
                  elementId={`canvas-preview-${row.id}`}
                  borderConfig={itemBorderConfig}
                  borderRadius={itemContentStyle.borderRadius}
                />
              )}
              {rootChildren.map((child) => (
                <NonInteractiveChildRenderer
                  key={child.id}
                  element={child}
                  childrenMap={childrenMap}
                  allElements={childElements}
                />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ============================================================================
// PREVIEW MODE — Self-contained rendering with CMS data fetching
// ============================================================================

interface PreviewContentProps {
  element: SmartCmsListType
  ctxOrganizationId?: string
  basePath?: string
  ctxComponents?: Record<string, LocalComponent>
  cmsSnapshots?: Record<string, unknown>
}

/**
 * Preview-mode rendering for SmartCMS List elements.
 *
 * Handles the complete preview/published rendering pipeline:
 * 1. CMS data fetching with useInfiniteQuery (cursor-based pagination)
 * 2. Direction-aware infinite scroll detection (horizontal/vertical)
 * 3. CmsRowProvider wrapping for dynamic link resolution
 * 4. SmartCmsListItemRenderer for per-row rendering
 * 5. Loading, error, empty, and not-configured states
 * 6. Baked CMS data support from publish-time snapshots
 */
function PreviewContent({
  element,
  ctxOrganizationId,
  basePath,
  ctxComponents,
  cmsSnapshots,
}: PreviewContentProps) {
  const { breakpoint } = useRenderMode()

  /**
   * Get organizationId from either:
   * 1. RenderMode context (for published pages)
   * 2. BuilderContext (for builder preview mode)
   */
  const builderContext = useBuilderContextSafe()
  const organizationId = ctxOrganizationId || builderContext?.organizationId

  /** Ref for the scrollable content container (infinite scroll detection) */
  const contentRef = React.useRef<HTMLDivElement>(null)

  // ========================================================================
  // ELEMENT PROPERTIES — merge defaults with element values
  // ========================================================================
  const {
    pageSize = DEFAULT_SMARTCMS_LIST_PROPS.pageSize,
    infiniteScroll = DEFAULT_SMARTCMS_LIST_PROPS.infiniteScroll,
    rangeStart,
    rangeEnd,
    sourceComponentId,
    cmsTableId,
    propBindings = {},
    emptyStateMessage = DEFAULT_SMARTCMS_LIST_PROPS.emptyStateMessage,
  } = element

  /**
   * Auto-scroll animation properties — infinite marquee-style scrolling.
   * When enabled, CMS items scroll continuously and are visually duplicated
   * for a seamless loop effect. Disables infinite scroll pagination.
   */
  const autoScroll = element.autoScroll ?? false
  const autoScrollSpeed = element.autoScrollSpeed ?? 50
  const autoScrollDirection = element.autoScrollDirection ?? 'left'

  /**
   * Resolve responsive-aware properties using getPropertyValue().
   * On mobile breakpoint, these will pick up mobile overrides from
   * element.responsiveSettings.mobile (e.g., different width/autoWidth).
   * Falls back to the base element value when no override exists.
   */
  const autoWidth = getPropertyValue<boolean>(
    element, 'autoWidth', breakpoint, element.autoWidth
  ) ?? DEFAULT_SMARTCMS_LIST_PROPS.autoWidth
  const autoHeight = getPropertyValue<boolean>(
    element, 'autoHeight', breakpoint, element.autoHeight
  ) ?? DEFAULT_SMARTCMS_LIST_PROPS.autoHeight
  const resolvedWidth = getPropertyValue<number>(
    element, 'width', breakpoint, element.width
  ) ?? element.width
  const resolvedHeight = getPropertyValue<number>(
    element, 'height', breakpoint, element.height
  ) ?? element.height

  const hasSource = Boolean(sourceComponentId)
  const hasTable = Boolean(cmsTableId)
  const isConfigured = hasSource && hasTable

  /** Source component from the components map */
  const sourceComponent = sourceComponentId ? ctxComponents?.[sourceComponentId] : null

  /** Flex direction determines scroll axis for infinite scroll trigger */
  const styles = { ...DEFAULT_SMARTCMS_LIST_PROPS, ...(element.styles ?? {}) }
  const flexDirection = (styles.flexDirection as 'row' | 'column') || 'column'
  const isHorizontal = flexDirection === 'row'

  // ========================================================================
  // AUTO-SCROLL KEYFRAMES — CSS animation for seamless infinite marquee
  // ========================================================================
  /**
   * Generate unique CSS keyframes per element for the auto-scroll animation.
   * Supports 4 directions: left/right (translateX), up/down (translateY).
   * The -50% offset combined with duplicated children creates a seamless loop.
   */
  const autoScrollKeyframes = autoScroll
    ? (() => {
        const animationName = `autoScroll_${element.id.replace(/[^a-zA-Z0-9]/g, '_')}`
        const isVertical = autoScrollDirection === 'up' || autoScrollDirection === 'down'
        const translateFn = isVertical ? 'translateY' : 'translateX'
        const isReverse = autoScrollDirection === 'right' || autoScrollDirection === 'down'
        const keyframes = !isReverse
          ? `@keyframes ${animationName} { 0% { transform: ${translateFn}(0); } 100% { transform: ${translateFn}(-50%); } }`
          : `@keyframes ${animationName} { 0% { transform: ${translateFn}(-50%); } 100% { transform: ${translateFn}(0); } }`
        return { animationName, keyframes }
      })()
    : null

  // ========================================================================
  // ENDPOINT CONTEXT — public page or builder preview
  // ========================================================================
  const isPublicPageContext = !builderContext && Boolean(ctxOrganizationId)

  // ========================================================================
  // INITIAL DATA FROM PUBLISH-TIME SNAPSHOT
  // ========================================================================
  const initialCmsData = cmsSnapshots?.[element.id] as BakedCmsData | undefined
  const hasInitialData = Boolean(initialCmsData && initialCmsData.rows.length > 0)
  const rqInitialData = hasInitialData && initialCmsData
    ? {
        pages: [initialCmsData],
        pageParams: [undefined as number | undefined],
      }
    : undefined

  // ========================================================================
  // INFINITE SCROLL DATA FETCHING
  // ========================================================================
  const authQueryInput = {
    organizationId,
    tableId: cmsTableId ?? '',
    limit: pageSize,
    rangeStart,
    rangeEnd,
    sortOrder: 'asc' as const,
  }

  const publicQueryInput = {
    tableId: cmsTableId ?? '',
    limit: pageSize,
    rangeStart,
    rangeEnd,
    sortOrder: 'asc' as const,
  }

  const shouldFetch = Boolean(cmsTableId) && isConfigured
  const shouldFetchAuth = shouldFetch && Boolean(organizationId) && !isPublicPageContext
  const shouldFetchPublic = shouldFetch && isPublicPageContext

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authQueryResult = (trpc.cms.listRowsInfinite as any).useInfiniteQuery(
    authQueryInput,
    {
      enabled: shouldFetchAuth,
      getNextPageParam: (lastPage: { nextCursor?: number }) => lastPage.nextCursor ?? undefined,
      initialCursor: undefined,
    }
  ) as {
    data?: { pages: Array<{ rows: Array<{ id: string; values: Record<string, unknown>; order: number }>; nextCursor?: number }> }
    fetchNextPage: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isLoading: boolean
    isError: boolean
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publicQueryResult = (trpc.cms.listRowsPublicInfinite as any).useInfiniteQuery(
    publicQueryInput,
    {
      enabled: shouldFetchPublic,
      getNextPageParam: (lastPage: { nextCursor?: number }) => lastPage.nextCursor ?? undefined,
      initialCursor: undefined,
      ...(rqInitialData && {
        initialData: rqInitialData,
        staleTime: Infinity,
      }),
    }
  ) as {
    data?: { pages: Array<{ rows: Array<{ id: string; values: Record<string, unknown>; order: number }>; nextCursor?: number }> }
    fetchNextPage: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isLoading: boolean
    isError: boolean
  }

  const infiniteQueryResult = isPublicPageContext ? publicQueryResult : authQueryResult
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage = false,
    isFetchingNextPage,
    isLoading,
    isError,
  } = infiniteQueryResult

  // ========================================================================
  // FLATTEN PAGINATED DATA
  // ========================================================================
  const pages = infiniteData?.pages
  const allRows = React.useMemo(() => {
    if (!pages) return []
    return pages.flatMap((page) => page.rows)
  }, [pages])

  // ========================================================================
  // INFINITE SCROLL — IntersectionObserver + scroll fallback
  // ========================================================================

  /**
   * Sentinel ref — a tiny div rendered at the end of the list.
   * When it enters the viewport (via IntersectionObserver), we load more.
   *
   * WHY IntersectionObserver instead of scroll events:
   * In vertical auto-height mode, the content div grows to fit all items
   * and never scrolls — the PAGE scrolls instead. A scroll listener on the
   * content div would never fire. IntersectionObserver works regardless of
   * which ancestor is the scroll container.
   */
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const isFetchingRef = React.useRef(false)

  React.useEffect(() => {
    isFetchingRef.current = isFetchingNextPage
  }, [isFetchingNextPage])

  /**
   * IntersectionObserver: fires when the sentinel enters the viewport.
   * Works for both vertical (page scroll) and horizontal (container scroll).
   */
  React.useEffect(() => {
    if (!infiniteScroll || autoScroll) return
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && hasNextPage && !isFetchingRef.current) {
          isFetchingRef.current = true
          fetchNextPage()
        }
      },
      {
        /* Use the content container as root for horizontal scroll,
           null (viewport) for vertical auto-height layouts */
        root: isHorizontal ? contentRef.current : null,
        rootMargin: '200px',
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [infiniteScroll, autoScroll, hasNextPage, fetchNextPage, isHorizontal])

  // ========================================================================
  // WRAPPER + CONTENT STYLES (mirrors unified-frame.tsx preview mode)
  // ========================================================================

  /**
   * Read parent flex direction for autoWidth behavior in row parents.
   * Row parent → flex: 1 1 0%, column parent → width: 100%.
   * Must be called before any conditional returns (React hooks rule).
   */
  const parentFlexDirection = useParentFlexDirection()
  const isParentRow = parentFlexDirection === 'row' || parentFlexDirection === 'row-reverse'

  /**
   * In preview mode, hidden elements are NOT rendered at all.
   * This matches the published site behavior (same as frames).
   */
  const isVisible = getPropertyValue<boolean>(element, 'visible', breakpoint, true)
  if (!isVisible) return null

  const isRoot = element.parentId === null
  const isAbsolutelyPositioned = !isRoot && element.isAbsolute === true

  /** Sticky positioning — only applies in preview/published mode */
  const isSticky = getPropertyValue<boolean>(element, 'sticky', breakpoint, false)
  const stickyPosition = getPropertyValue<'top' | 'bottom' | 'left' | 'right'>(
    element, 'stickyPosition', breakpoint, 'top'
  )

  /**
   * When auto-scroll is active, force fixed height even if autoHeight is on.
   * Auto-scroll needs a constrained container so content can overflow and loop.
   */
  const effectiveAutoHeight = autoScroll ? false : autoHeight

  /**
   * Compute the position styles based on sticky, absolute, or normal positioning.
   * Priority: sticky > absolute > normal (matches frame behavior exactly).
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
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
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
       */
      zIndex: isRoot ? element.order : undefined,
      transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    }
  }

  const responsiveStyles = computeResponsiveFrameStyles(element as unknown as FrameElement)

  const wrapperStyles: React.CSSProperties = {
    ...getPositionStyles(),
    /** Use responsive-resolved width/height so mobile overrides take effect */
    width: autoWidth ? '100%' : resolvedWidth,
    /* When autoWidth + row parent, use flex: 1 1 0% for equal space distribution */
    ...(autoWidth && isParentRow ? { flex: '1 1 0%', minWidth: 0 } : {}),
    height: effectiveAutoHeight ? 'auto' : resolvedHeight,
    overflow: autoScroll ? 'hidden' : undefined,
    ...(effectiveAutoHeight ? {} : responsiveStyles.wrapperStyleOverrides),
    /**
     * Margin on the OUTER wrapper — creates space outside the element.
     * Resolved with responsive awareness so mobile can override desktop margin.
     * Must NOT be on the inner content div (where it would act like padding).
     */
    margin: getStyleValue<string>(element, 'margin', breakpoint) || undefined,
  }

  const baseContentStyles = computeFrameContentStyles(
    element as unknown as FrameElement,
    false,
    { breakpoint }
  )

  /**
   * When auto-scroll is active, the content container becomes a block-level
   * overflow-hidden box. The inner auto-scroll wrapper handles flex layout.
   */
  const contentStyles: React.CSSProperties = autoScroll
    ? {
        ...baseContentStyles,
        ...responsiveStyles.contentStyleOverrides,
        position: 'relative',
        display: 'block',
        overflow: 'hidden',
      }
    : {
        ...baseContentStyles,
        ...responsiveStyles.contentStyleOverrides,
        position: 'relative',
        ...(effectiveAutoHeight && { height: 'auto' }),
      }

  /** Extract computed flex direction to provide to children via context */
  const computedFlexDirection = (baseContentStyles.flexDirection as string) || 'column'

  /** Smart grid state — provided to children so they skip flex sizing */
  const isSmartGrid = getPropertyValue<boolean>(element, 'smartGrid', breakpoint, false) ?? false

  // ========================================================================
  // RENDER — Not configured state
  // ========================================================================
  if (!isConfigured) {
    return (
      <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
        <div
          data-element-content={element.id}
          className={responsiveStyles.contentClassName || undefined}
          style={{
            ...contentStyles,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 100,
            color: 'rgba(6, 182, 212, 0.6)',
            fontSize: 14,
          }}
        >
          {emptyStateMessage}
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER — Loading state with skeleton or spinner
  // ========================================================================
  if (isLoading) {
    const skeletonComponentId = sourceComponent?.loadingSkeletonComponentId
    const skeletonComponent = skeletonComponentId && ctxComponents ? ctxComponents[skeletonComponentId] : null

    if (skeletonComponent?.sourceTree) {
      const skeletonResult = applyPropValuesToElements(skeletonComponent, {})
      if (skeletonResult?.rootElement) {
        const { rootElement: skeletonRoot, childElements: skeletonChildElements } = skeletonResult
        const { childrenMap: skeletonChildrenMap } = skeletonComponent.sourceTree
        const skeletonRootFrame = skeletonRoot as FrameElement

        const skeletonContainerStyles = computeFrameContentStyles(skeletonRootFrame, false, { breakpoint })
        const skeletonRootChildIds = skeletonChildrenMap[skeletonRoot.id] || []
        const skeletonRootChildren = skeletonRootChildIds
          .map((id) => skeletonChildElements.find((el) => el.id === id))
          .filter((el): el is CanvasElement => el !== undefined)

        const skeletonRootStyles = { ...DEFAULT_FRAME_STYLES, ...(skeletonRootFrame.styles ?? {}) }
        const skeletonFlexWrap = skeletonRootStyles.flexWrap as 'nowrap' | 'wrap' | undefined
        const isSkeletonScrollEnabled = skeletonRootFrame.scrollEnabled ?? skeletonRootFrame.responsive ?? false
        const shouldSkeletonAutoHeight = skeletonFlexWrap === 'wrap' || isSkeletonScrollEnabled
        const hasSkeletonAutoWidth = skeletonRootFrame.autoWidth ?? false

        const skeletonItems = Array.from({ length: pageSize }, (_, index) => index)

        return (
          <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
            <div data-element-content={element.id} className={responsiveStyles.contentClassName || undefined} ref={contentRef} style={contentStyles}>
              {skeletonItems.map((index) => (
                <div
                  key={`skeleton-${index}`}
                  style={{
                    position: 'relative',
                    width: hasSkeletonAutoWidth ? '100%' : skeletonRootFrame.width,
                    height: shouldSkeletonAutoHeight ? 'auto' : skeletonRootFrame.height,
                    overflow: 'visible',
                    opacity: 0.7,
                  }}
                >
                  <div
                    style={{
                      ...skeletonContainerStyles,
                      width: '100%',
                      height: shouldSkeletonAutoHeight ? 'auto' : '100%',
                      overflowX: 'visible',
                      overflowY: 'visible',
                    }}
                  >
                    {skeletonRootChildren.map((child) => (
                      <ComponentChildRenderer
                        key={child.id}
                        element={child}
                        childrenMap={skeletonChildrenMap}
                        allElements={skeletonChildElements}
                        breakpoint={breakpoint}
                        components={ctxComponents}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }
    }

    /* Source component available but no skeleton — show centered spinner */
    if (sourceComponent) {
      return (
        <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
          <div
            data-element-content={element.id}
            className={responsiveStyles.contentClassName || undefined}
            ref={contentRef}
            style={{
              ...contentStyles,
              position: 'relative',
              minHeight: 100,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <svg
                style={{ width: 24, height: 24, color: 'rgba(6, 182, 212, 0.6)', animation: 'spin 1s linear infinite' }}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>
        </div>
      )
    }

    /* Fallback loading state */
    return (
      <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
        <div
          data-element-content={element.id}
          className={responsiveStyles.contentClassName || undefined}
          style={{
            ...contentStyles,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 100,
            color: 'rgba(6, 182, 212, 0.6)',
            fontSize: 14,
          }}
        >
          Loading...
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER — Error state
  // ========================================================================
  if (isError) {
    return (
      <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
        <div
          data-element-content={element.id}
          className={responsiveStyles.contentClassName || undefined}
          style={{
            ...contentStyles,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 100,
            color: '#ef4444',
            fontSize: 14,
          }}
        >
          Error loading data
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER — Component not found
  // ========================================================================
  if (!sourceComponent) {
    return (
      <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
        <div
          data-element-content={element.id}
          className={responsiveStyles.contentClassName || undefined}
          style={{
            ...contentStyles,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 100,
            color: '#ef4444',
            fontSize: 14,
          }}
        >
          Component not found
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER — Empty data
  // ========================================================================
  if (allRows.length === 0) {
    return (
      <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
        <div
          data-element-content={element.id}
          className={responsiveStyles.contentClassName || undefined}
          style={{
            ...contentStyles,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 100,
            color: 'rgba(6, 182, 212, 0.6)',
            fontSize: 14,
          }}
        >
          {emptyStateMessage}
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER — Shared row elements (rendered once, reused by both modes)
  // ========================================================================
  /**
   * Render CMS rows into React elements ONCE. For auto-scroll mode,
   * we duplicate the already-rendered nodes (like frames do with {children}{children})
   * instead of calling the render pipeline twice — avoids duplicate keys and
   * duplicate context providers that cause crashes.
   */
  const renderedRows = allRows.map((row) => (
    <CmsRowProvider
      key={row.id}
      row={{ id: row.id, values: row.values as Record<string, unknown>, order: row.order }}
      tableId={cmsTableId!}
      basePath={basePath}
    >
      {element.linkToDynamicPage ? (
        <DynamicPageLink
          targetPageId={element.targetPageId}
          targetPageSlug={element.targetPageSlug}
          targetPageSlugColumn={element.targetPageSlugColumn}
          openInNewTab={element.openInNewTab}
          rowId={row.id}
          rowValues={row.values as Record<string, unknown>}
          basePath={basePath}
        >
          <PreviewItemRenderer
            row={row}
            component={sourceComponent}
            propBindings={propBindings}
            breakpoint={breakpoint}
            components={ctxComponents}
          />
        </DynamicPageLink>
      ) : (
        <PreviewItemRenderer
          row={row}
          component={sourceComponent}
          propBindings={propBindings}
          breakpoint={breakpoint}
          components={ctxComponents}
        />
      )}
    </CmsRowProvider>
  ))

  // ========================================================================
  // RENDER — Auto-scroll mode (infinite marquee animation)
  // ========================================================================
  /**
   * Identical pattern to frame auto-scroll (unified-frame.tsx):
   * - Inline <style> tag with unique keyframes per element
   * - Scrolling wrapper div with flex layout and max-content sizing
   * - Children duplicated visually ({renderedRows}{renderedRows}) for seamless loop
   * - Pause on hover for accessibility
   * - Content container set to block + overflow: hidden
   */
  if (autoScroll && autoScrollKeyframes) {
    const isVertical = autoScrollDirection === 'up' || autoScrollDirection === 'down'
    const estimatedContentSize = isVertical ? resolvedHeight * 2 : resolvedWidth * 2
    const duration = estimatedContentSize / autoScrollSpeed

    return (
      <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
        <style dangerouslySetInnerHTML={{ __html: autoScrollKeyframes.keyframes }} />
        <div data-element-content={element.id} className={responsiveStyles.contentClassName || undefined} ref={contentRef} style={contentStyles}>
          <ParentFlexDirectionProvider value={computedFlexDirection}>
          <ParentSmartGridProvider value={isSmartGrid}>
            <div
              data-auto-scroll-container
              style={{
                display: 'flex',
                flexDirection: isVertical ? ('column' as const) : ('row' as const),
                alignItems: styles.alignItems as string | undefined,
                gap: styles.gap as number | undefined,
                width: isVertical ? '100%' : 'max-content',
                height: isVertical ? 'max-content' : undefined,
                animation: `${autoScrollKeyframes.animationName} ${duration}s linear infinite`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.animationPlayState = 'paused'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.animationPlayState = 'running'
              }}
            >
              {/* Original items */}
              {renderedRows}
              {/* Duplicated items for seamless loop */}
              {renderedRows}
            </div>
          </ParentSmartGridProvider>
          </ParentFlexDirectionProvider>
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER — Normal mode (list items with optional infinite scroll pagination)
  // ========================================================================
  return (
    <div data-element-id={element.id} className={responsiveStyles.wrapperClassName || undefined} style={wrapperStyles}>
      <div data-element-content={element.id} className={responsiveStyles.contentClassName || undefined} ref={contentRef} style={contentStyles}>
        <ParentFlexDirectionProvider value={computedFlexDirection}>
        <ParentSmartGridProvider value={isSmartGrid}>
          {renderedRows}

          {/* Sentinel + loading indicator for infinite scroll.
              IntersectionObserver watches this div — when it enters the
              viewport (or the scroll container for horizontal), fetchNextPage fires. */}
          {infiniteScroll && (
            <div
              ref={sentinelRef}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: isFetchingNextPage ? 16 : 1,
                color: 'rgba(6, 182, 212, 0.6)',
                fontSize: 12,
                /* Minimum size so IntersectionObserver can detect it */
                minWidth: 1,
                minHeight: 1,
              }}
            >
              {isFetchingNextPage && 'Loading more...'}
            </div>
          )}
        </ParentSmartGridProvider>
        </ParentFlexDirectionProvider>
      </div>
    </div>
  )
}

// ============================================================================
// DYNAMIC PAGE LINK — Wraps a CMS list item in a clickable link
// ============================================================================

interface DynamicPageLinkProps {
  /** Target page ID (when set, link is built as /{slug}/{rowSlugOrId}) */
  targetPageId?: string
  /** Target page slug or custom URL */
  targetPageSlug?: string
  /**
   * CMS column slug for SEO-friendly URLs. When set, uses the column value
   * from the CMS row instead of the row ID in the URL.
   * SOURCE OF TRUTH: TargetPageSlugColumn, CmsListDynamicSlug
   */
  targetPageSlugColumn?: string
  /** Whether to open in a new browser tab */
  openInNewTab?: boolean
  /** The CMS row ID — fallback when no slug column is configured */
  rowId: string
  /** The CMS row values — used to read the slug column value */
  rowValues: Record<string, unknown>
  /** Base path for URL construction (e.g., '/webprodigies') */
  basePath?: string
  children: React.ReactNode
}

/** Stable empty array for useSyncExternalStore fallback (no Redux Provider) */
const EMPTY_PAGE_INFOS: ReturnType<typeof selectPageInfos> = []
/** No-op unsubscribe for published mode (no Redux store to subscribe to) */
const NOOP_SUBSCRIBE = () => () => {}

/**
 * Wraps a CMS list item in a navigable link (Next.js Link for internal pages,
 * <a> for custom URLs). Uses `display: contents` so it has zero layout impact.
 *
 * URL construction:
 * - Page link mode (with slug column): {basePath}/{targetPageSlug}/{row.values[slugColumn]}
 * - Page link mode (without slug column): {basePath}/{targetPageSlug}/{rowId}
 * - Custom URL mode: targetPageSlug used as-is (raw href)
 *
 * SLUG COLUMN RESOLUTION ORDER:
 * 1. Live lookup from Redux page infos (always up-to-date in builder)
 * 2. Cached targetPageSlugColumn on the element (works in published mode)
 * 3. Falls back to rowId when no slug column is configured
 */
function DynamicPageLink({
  targetPageId,
  targetPageSlug,
  targetPageSlugColumn,
  openInNewTab,
  rowId,
  rowValues,
  basePath,
  children,
}: DynamicPageLinkProps) {
  /**
   * SLUG COLUMN RESOLUTION — 3-tier lookup for correct dynamic page URLs.
   *
   * 1. REDUX (builder mode): Live lookup from Redux page infos — always current.
   * 2. CONTEXT (published mode): pageSlugColumns map from RenderModeContext —
   *    queried fresh from DB when page is served.
   * 3. CACHED (fallback): targetPageSlugColumn baked into the element —
   *    may be stale if slug column was changed after linking.
   *
   * WHY: The user may configure the slug column on the page AFTER the CMS list
   * was already linked — the cached targetPageSlugColumn would be stale.
   *
   * IMPORTANT: Published websites have NO Redux Provider — useAppSelector crashes.
   * ReactReduxContext safely returns null when no Provider exists.
   *
   * SOURCE OF TRUTH: DynamicPageSlugResolution, CmsListSlugColumn
   */
  const { pageSlugColumns } = useRenderMode()
  const reduxCtx = useContext(ReactReduxContext)
  const store = reduxCtx?.store
  /**
   * Reactive subscription to the Redux store's page infos.
   * useSyncExternalStore subscribes to store changes and re-renders when
   * selectPageInfos returns a new value. When no store exists (published mode),
   * getServerSnapshot returns an empty array and subscribe is a no-op.
   */
  const pageInfos = React.useSyncExternalStore(
    store ? store.subscribe : NOOP_SUBSCRIBE,
    store ? () => selectPageInfos(store.getState() as RootState) : () => EMPTY_PAGE_INFOS,
    () => EMPTY_PAGE_INFOS
  )
  const targetPageInfo = targetPageId
    ? pageInfos.find((p) => p.id === targetPageId)
    : undefined
  /**
   * Resolution order: Redux page info → context pageSlugColumns → cached element value.
   * This ensures published mode gets fresh slug column data from the DB query,
   * even if the cached element value is stale.
   */
  const contextSlugColumn = targetPageId ? pageSlugColumns?.[targetPageId] : undefined
  const resolvedSlugColumn = targetPageInfo?.cmsSlugColumnSlug || contextSlugColumn || targetPageSlugColumn

  /**
   * Build the full href. When a slug column is configured, use the column
   * value from the CMS row for SEO-friendly URLs (e.g. /products/sage-green-crewneck).
   * Falls back to row ID if the column value is empty or missing.
   */
  const cleanSlug = targetPageSlug?.startsWith('/') ? targetPageSlug.slice(1) : targetPageSlug
  const rowSlugValue = resolvedSlugColumn
    ? String(rowValues?.[resolvedSlugColumn] || '')
    : ''
  const rowIdentifier = rowSlugValue || rowId
  const href = targetPageId
    ? `${basePath || ''}/${cleanSlug}/${encodeURIComponent(rowIdentifier)}`
    : targetPageSlug || '#'

  const target = openInNewTab ? '_blank' : undefined
  const rel = openInNewTab ? 'noopener noreferrer' : undefined

  /**
   * Embed the full CMS row data as a JSON attribute on the <a> so the
   * preview overlay can read it SYNCHRONOUSLY when intercepting clicks.
   * This avoids a flash caused by an async fetch — the row data is
   * available instantly when switching to the dynamic page template.
   *
   * SOURCE OF TRUTH: PreviewDynamicRowNavigation
   */
  const rowDataAttr = JSON.stringify({ id: rowId, values: rowValues, order: 0 })

  if (targetPageId) {
    return (
      <Link href={href} target={target} rel={rel} data-cms-row={rowDataAttr} style={{ display: 'contents' }}>
        {children}
      </Link>
    )
  }

  return (
    <a href={href} target={target} rel={rel} style={{ display: 'contents' }}>
      {children}
    </a>
  )
}

// ============================================================================
// PREVIEW ITEM RENDERER — Renders a single CMS row as a component instance
// ============================================================================

interface PreviewItemRendererProps {
  row: { id: string; values: Record<string, unknown> }
  component: LocalComponent
  propBindings: Record<string, string>
  breakpoint: import('../../_lib/types').Breakpoint
  components?: Record<string, LocalComponent>
}

/**
 * Renders a single item in the SmartCMS List for preview/published mode.
 *
 * Maps CMS row data to component prop values using propBindings,
 * then applies those values to the source component and renders
 * the resulting element tree using ComponentChildRenderer.
 *
 * Includes gradient border support on the component's root frame.
 */
function PreviewItemRenderer({
  row,
  component,
  propBindings,
  breakpoint,
  components,
}: PreviewItemRendererProps) {
  /**
   * Build prop values by mapping CMS column values to exposed props.
   * propBindings: { exposedPropId: columnSlug }
   * row.values: { columnSlug: value }
   */
  const propValues: Record<string, unknown> = {}
  Object.entries(propBindings).forEach(([exposedPropId, columnSlug]) => {
    const value = row.values[columnSlug]
    if (value !== undefined) {
      propValues[exposedPropId] = value
    }
  })

  const renderedElements = applyPropValuesToElements(component, propValues)
  if (!renderedElements) return null

  const { rootElement, childElements } = renderedElements
  const { childrenMap } = component.sourceTree

  const rootChildIds = childrenMap[rootElement.id] || []
  const rootChildren = rootChildIds
    .map((id) => childElements.find((el) => el.id === id))
    .filter((el): el is CanvasElement => el !== undefined)

  const rootFrame = rootElement as FrameElement
  const containerStyles = computeFrameContentStyles(rootFrame, false, { breakpoint })

  /** Root frame properties for proper layout */
  const rootStyles = { ...DEFAULT_FRAME_STYLES, ...(rootFrame.styles ?? {}) }
  const rootFlexWrap = rootStyles.flexWrap as 'nowrap' | 'wrap' | undefined
  const isRootScrollEnabled = rootFrame.scrollEnabled ?? rootFrame.responsive ?? false
  const shouldRootAutoHeight = rootFlexWrap === 'wrap' || isRootScrollEnabled
  const hasRootAutoWidth = rootFrame.autoWidth ?? false

  const wrapperStyles: React.CSSProperties = {
    position: 'relative',
    width: hasRootAutoWidth ? '100%' : rootFrame.width,
    height: shouldRootAutoHeight ? 'auto' : rootFrame.height,
    /**
     * No minHeight for auto-height — wrap/fit-content must allow the wrapper
     * to shrink-wrap its content without a pixel-height floor.
     */
    overflow: 'visible',
  }

  const contentItemStyles: React.CSSProperties = {
    ...containerStyles,
    width: '100%',
    height: shouldRootAutoHeight ? 'auto' : '100%',
    overflowX: 'visible',
    overflowY: 'visible',
  }

  /** Gradient border support on the component's root element */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const borderConfig = (rootFrame.styles as any)?.__borderConfig as BorderConfig | undefined
  const hasGradient = borderConfig && hasGradientBorder(borderConfig)
  const gradientClassName = hasGradient ? getGradientBorderClassName(row.id) : undefined

  return (
    <div data-cms-row-id={row.id} data-component-id={component.id} style={wrapperStyles}>
      <div className={gradientClassName || undefined} style={contentItemStyles}>
        {hasGradient && (
          <GradientBorderOverlay
            elementId={row.id}
            borderConfig={borderConfig}
            borderRadius={containerStyles.borderRadius}
          />
        )}
        {rootChildren.map((child) => (
          <ComponentChildRenderer
            key={child.id}
            element={child}
            childrenMap={childrenMap}
            allElements={childElements}
            breakpoint={breakpoint}
            components={components}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// CANVAS HELPER HOOK — Provides sizing metadata for ElementWrapper
// ============================================================================

/**
 * Hook to compute canvas-specific values that get passed to ElementWrapper.
 *
 * SOURCE OF TRUTH: UnifiedSmartCmsListMeta, smartcms-list-canvas-meta
 *
 * Used by CanvasSmartCmsListElement (in canvas-unified-wrappers.tsx) to compute:
 * - sizeStyles: { width, height } for the wrapper element
 * - dimensionLabel: "Fill x Auto", "400 x 300", etc. for the dimensions pill
 * - wrapperOverrides: display none for invisible elements, overflow for scroll
 * - responsiveClassName: container query className from computeResponsiveFrameStyles
 * - responsiveWrapperOverrides: wrapper style overrides (only when NOT auto-height)
 *
 * Mirrors useUnifiedFrameMeta to ensure CMS list canvas behavior matches frames.
 *
 * USAGE:
 * ```tsx
 * const meta = useUnifiedSmartCmsListMeta(element)
 * <ElementWrapper
 *   element={element}
 *   sizeStyleOverrides={meta.sizeStyles}
 *   dimensionLabel={meta.dimensionLabel}
 *   className={meta.responsiveClassName || undefined}
 *   wrapperStyleOverrides={{ ...meta.responsiveWrapperOverrides, ...meta.wrapperOverrides }}
 *   ...
 * >
 *   <UnifiedSmartCmsList element={element} />
 * </ElementWrapper>
 * ```
 */
export function useUnifiedSmartCmsListMeta(element: SmartCmsListType) {
  /** Read the parent frame's flex direction for autoWidth sizing in row layouts */
  const parentFlexDirection = useParentFlexDirection()

  return useMemo(() => {
    const {
      autoWidth = DEFAULT_SMARTCMS_LIST_PROPS.autoWidth,
      autoHeight = DEFAULT_SMARTCMS_LIST_PROPS.autoHeight,
    } = element

    const isParentRow = parentFlexDirection === 'row' || parentFlexDirection === 'row-reverse'

    /** Scroll enabled via 'responsive' property (same prop name frames use) */
    const isScrollEnabled = element.responsive ?? false

    // ======================================================================
    // SIZE STYLES
    // ======================================================================

    /**
     * Width: autoWidth in a row parent → flex: 1 1 0% for equal distribution,
     * autoWidth in column parent → '100%', otherwise fixed pixel value.
     */
    const width: number | string = autoWidth
      ? (isParentRow ? '100%' : '100%')
      : element.width

    const sizeStyles: React.CSSProperties = {
      width,
      /**
       * Height: auto when autoHeight (fit-content), otherwise fixed pixel value.
       * When autoHeight is true, we do NOT set minHeight to element.height
       * because that would prevent the list from shrinking below its original
       * height — defeating the purpose of fit-content mode.
       */
      height: autoHeight ? 'auto' : element.height,
      /* Include flex distribution props when autoWidth in a row parent */
      ...(autoWidth && isParentRow ? { flex: '1 1 0%' } : {}),
      ...(autoWidth && isParentRow ? { minWidth: 0 } : {}),
    }

    // ======================================================================
    // DIMENSION LABEL
    // ======================================================================
    const widthLabel = autoWidth ? 'Fill' : String(Math.round(element.width))
    const heightLabel = autoHeight ? 'Auto' : String(Math.round(element.height))
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
     * Cast to FrameElement since computeResponsiveFrameStyles reads
     * the same responsive properties that CMS lists inherit from BaseElement.
     */
    const responsive = computeResponsiveFrameStyles(element as unknown as FrameElement)

    const responsiveClassName = responsive.wrapperClassName

    /**
     * Responsive wrapper overrides are only applied when NOT in auto-height mode.
     * In auto-height mode, applying minHeight from responsive overrides would
     * prevent the wrapper from shrinking with content.
     */
    const responsiveWrapperOverrides: React.CSSProperties = autoHeight
      ? {}
      : responsive.wrapperStyleOverrides

    return {
      sizeStyles,
      dimensionLabel,
      wrapperOverrides,
      responsiveClassName,
      responsiveWrapperOverrides,
      isScrollEnabled,
    }
  }, [element, parentFlexDirection])
}
