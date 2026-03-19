/**
 * ============================================================================
 * UNIFIED COMPONENT INSTANCE ELEMENT - Single Component for Canvas + Preview
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedComponentInstance, unified-component-instance,
 *   component-instance-unified, scoped-id-system
 *
 * This component replaces BOTH:
 *   - elements/component-instance-element.tsx (canvas editor)
 *   - renderers/page-renderer/component-instance-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * CANVAS MODE (mode='canvas'):
 *   Returns ONLY content (the component's rendered sourceTree). The parent
 *   ElementWrapper handles all editor chrome (selection ring, hover ring,
 *   resize handles, labels, dimensions pill).
 *
 *   KEY CANVAS FEATURES:
 *   - Scoped ID system for nested component instances
 *   - ChildRenderer with type-specific rendering (non-interactive for regular
 *     elements, interactive for nested component instances)
 *   - CMS preview data from CmsRowContext for dynamic page preview
 *   - Gradient border support on root frame
 *
 * PREVIEW MODE (mode='preview'):
 *   Self-contained rendering with positioned wrapper. Resolves the component
 *   from the RenderModeContext components map. Uses ComponentChildRenderer
 *   from the page-renderer module for child rendering with responsive awareness.
 *
 *   KEY PREVIEW FEATURES:
 *   - CMS column bindings for dynamic data injection
 *   - Responsive-aware property resolution via getPropertyValue
 *   - Gradient border support on root frame
 *   - Visible overflow for sticky descendant support
 *
 * BOTH MODES:
 *   - Looks up LocalComponent definition from store (canvas) or context (preview)
 *   - Applies propValues via applyPropValuesToElements
 *   - Merges CMS column bindings with static propValues
 *   - Renders component root frame with content styles
 *   - Recursively renders children from sourceTree
 *
 * ============================================================================
 * SCOPED ID SYSTEM (canvas only)
 * ============================================================================
 *
 * Nested component instances within composed components need unique IDs to
 * avoid selection conflicts between parent instances:
 *
 *   Scoped ID format: `${parentInstanceId}::${nestedElementId}`
 *
 *   Example: Parent "inst_A_1" contains nested "card_123"
 *   Scoped ID becomes: "inst_A_1::card_123"
 *
 * This ensures each instance of a composed component has unique nested IDs
 * for independent selection and prop customization.
 *
 * ============================================================================
 */

'use client'

import React, { memo, useMemo } from 'react'
import type {
  ComponentInstanceElement as ComponentInstanceType,
  CanvasElement,
  FrameElement,
  BorderConfig,
  LocalComponent,
  Breakpoint,
} from '../../_lib/types'
import { DEFAULT_FRAME_STYLES } from '../../_lib/types'
import {
  useAppSelector,
  selectLocalComponentById,
  selectSelectedIds,
  computeFrameContentStyles,
  getPropertyValue,
  getStyleValue,
} from '../../_lib'
import {
  computeElementPositionStyles,
} from '../../_lib/shared-element-styles'
import { applyPropValuesToElements } from '../../_lib/component-utils'
import { useRenderMode } from '../../_lib/render-mode-context'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'
import { useCmsRowContext } from '../../_lib/cms-row-context'
import { hasGradientBorder, getGradientBorderClassName } from '../../_lib/border-utils'
import { ParentFlexDirectionProvider, useParentFlexDirection } from '../../_lib/parent-layout-context'
import { ComponentChildRenderer } from '../renderers/page-renderer/component-instance-renderer'
import { NonInteractiveChildRenderer } from '../shared/non-interactive-child-renderer'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedComponentInstance component.
 *
 * SOURCE OF TRUTH: UnifiedComponentInstanceProps
 *
 * In canvas mode, this component is rendered INSIDE an ElementWrapper which
 * provides all editor chrome. In preview mode, it handles its own wrapper.
 *
 * CANVAS-ONLY PROPS:
 * - selectedIds, hoveredElementId: For nested instance selection state
 * - onDragStart, onHoverStart, onHoverEnd: For nested instance interaction
 *
 * These are optional because preview mode does not need them.
 */
export interface UnifiedComponentInstanceProps {
  /** The component instance element data */
  element: ComponentInstanceType

  /**
   * Children elements rendered by the parent (canvas.tsx renderElement())
   * NOTE: ComponentInstance does NOT use externally-passed children.
   * It renders children from its own sourceTree. This prop exists for
   * API consistency with other container elements (frame, link).
   */
  children?: React.ReactNode

  // ========================================================================
  // CANVAS-ONLY PROPS — needed for nested instance interactivity
  // ========================================================================

  /**
   * Set of currently selected element IDs. Used for nested instance selection.
   * In canvas mode, top-level instances get this from Redux.
   * Nested instances need it passed down from their parent.
   */
  selectedIds?: Set<string>

  /** Currently hovered element ID for nested instance hover state */
  hoveredElementId?: string | null

  /** Current viewport zoom level — passed to nested instances */
  zoom?: number

  /** Handler for drag start — nested instances can be repositioned */
  onDragStart?: (e: React.PointerEvent, elementId: string, isModifierHeld?: boolean) => void

  /** Handler for hover start — nested instances can be hovered */
  onHoverStart?: (elementId: string, isModifierHeld: boolean) => void

  /** Handler for hover end — nested instances can be unhovered */
  onHoverEnd?: (elementId: string) => void
}

// ============================================================================
// CANVAS CHILD RENDERER — Renders sourceTree children on the canvas
// ============================================================================
// Regular elements (frame, text, image, button) are NON-INTERACTIVE.
// Nested component instances ARE INTERACTIVE — they can be selected and moved.

/**
 * Props for the canvas-mode ChildRenderer.
 *
 * SOURCE OF TRUTH: CanvasChildRendererProps, component-instance-child-renderer
 */
interface CanvasChildRendererProps {
  /** The child element to render */
  element: CanvasElement
  /** Map of parent ID to child IDs for recursive traversal */
  childrenMap: Record<string, string[]>
  /** All elements in the component's sourceTree */
  allElements: CanvasElement[]
  /** Current viewport zoom level -- passed to nested instances */
  zoom: number
  /** Set of currently selected element IDs -- for nested instance selection */
  selectedIds: Set<string>
  /** Currently hovered element ID -- for nested instance hover state */
  hoveredId: string | null
  /** Handler for drag start -- nested instances can be repositioned */
  onDragStart: (e: React.PointerEvent, elementId: string, isModifierHeld?: boolean) => void
  /** Handler for hover start -- nested instances can be hovered */
  onHoverStart: (elementId: string, isModifierHeld: boolean) => void
  /** Handler for hover end -- nested instances can be unhovered */
  onHoverEnd: (elementId: string) => void
  /**
   * Parent instance ID for creating scoped IDs.
   *
   * When rendering nested instances within a composed component instance,
   * we need unique IDs to avoid selection conflicts. The scoped ID format is:
   * `${parentInstanceId}::${nestedElementId}`
   */
  parentInstanceId: string
  /**
   * Prop values for nested instances, stored on the PARENT instance.
   *
   * Key: Nested instance's sourceTree element ID
   * Value: PropValues for that nested instance
   *
   * This allows each parent instance to have INDEPENDENT prop values
   * for its nested component instances.
   */
  parentNestedPropValues?: Record<string, Record<string, unknown>>
}

/**
 * Canvas-mode child renderer for component instance sourceTree elements.
 *
 * ============================================================================
 * INTERACTION RULES
 * ============================================================================
 *
 * - Regular elements (text, image, frame, button, etc.): NON-INTERACTIVE
 *   Users cannot select or edit these -- they're part of the component definition.
 *   Delegated to the shared NonInteractiveChildRenderer.
 *
 * - Nested component instances (type='component'): INTERACTIVE
 *   These are rendered as full UnifiedComponentInstance with selection/hover.
 *   This allows composed components to have selectable nested instances.
 *   Handled directly here because they need scoped IDs and parent-stored propValues.
 *
 * ============================================================================
 */
function CanvasChildRenderer({
  element,
  childrenMap,
  allElements,
  zoom,
  selectedIds,
  hoveredId,
  onDragStart,
  onHoverStart,
  onHoverEnd,
  parentInstanceId,
  parentNestedPropValues,
}: CanvasChildRendererProps) {
  // ============================================================================
  // NESTED COMPONENT INSTANCE -- INTERACTIVE with scoped IDs
  // ============================================================================
  // Nested component instances within a composed component ARE interactive.
  //
  // TWO KEY MECHANISMS FOR INDEPENDENCE:
  //
  // 1. SCOPED IDs: `${parentInstanceId}::${nestedId}`
  //    - Prevents selection conflicts between instances
  //    - Each parent instance has unique nested IDs
  //
  // 2. PARENT-STORED propValues: `parentNestedPropValues[nestedId]`
  //    - Prop values are stored on the PARENT instance, not in sourceTree
  //    - Each parent instance can have different nested prop values
  if (element.type === 'component') {
    const componentInstance = element as ComponentInstanceType

    /** Create a SCOPED ID for this nested instance */
    const scopedId = `${parentInstanceId}::${componentInstance.id}`

    /**
     * Get prop values for this nested instance from the PARENT's nestedPropValues.
     * Fall back to the sourceTree's propValues if parent hasn't customized yet.
     */
    const nestedPropValues = parentNestedPropValues?.[componentInstance.id] ?? componentInstance.propValues

    /** Create a virtual element with scoped ID and parent-stored propValues */
    const scopedElement: ComponentInstanceType = {
      ...componentInstance,
      id: scopedId,
      propValues: nestedPropValues,
    }

    /**
     * Render as a full interactive UnifiedComponentInstance.
     * The scoped ID ensures selection works independently per parent.
     * The propValues come from parent's nestedPropValues for independence.
     */
    return (
      <UnifiedComponentInstance
        element={scopedElement}
        zoom={zoom}
        onDragStart={onDragStart}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
        selectedIds={selectedIds}
        hoveredElementId={hoveredId}
      />
    )
  }

  // ============================================================================
  // ALL OTHER TYPES -- Delegate to shared NonInteractiveChildRenderer
  // ============================================================================
  // All non-component element types (text, image, video, button, frame, link,
  // form, payment, add-to-cart, cart, checkout, ecommerce-carousel, smartcms-list,
  // prebuilt) are rendered as non-interactive children via the shared renderer.
  // This uses unified elements with proper sizing and pointerEvents: none.
  return (
    <NonInteractiveChildRenderer
      element={element}
      childrenMap={childrenMap}
      allElements={allElements}
    />
  )
}

// ============================================================================
// SHARED RENDER DATA HOOK — Used by both canvas and preview inner components
// ============================================================================

/**
 * Computes the shared render data for a component instance after the component
 * definition has been resolved. Canvas resolves from Redux, preview resolves
 * from RenderModeContext — this hook handles everything AFTER that resolution.
 *
 * Returns null when the component definition is missing or invalid.
 * All hooks are called before any early return (React rules of hooks).
 */
function useComponentInstanceRenderData(
  component: LocalComponent | null | undefined,
  element: ComponentInstanceType,
  breakpoint: Breakpoint,
  isPreview: boolean,
) {
  /** CMS row context for dynamic page preview (both canvas and preview modes) */
  const { row: cmsRow } = useCmsRowContext()

  /**
   * Merge static propValues with CMS column bindings.
   * CMS bindings take precedence over static values.
   */
  const mergedPropValues = useMemo(() => {
    const values: Record<string, unknown> = { ...element.propValues }
    if (cmsRow && element.cmsColumnBindings) {
      Object.entries(element.cmsColumnBindings).forEach(([exposedPropId, columnSlug]) => {
        const cmsValue = cmsRow.values[columnSlug]
        if (cmsValue !== undefined) {
          values[exposedPropId] = cmsValue
        }
      })
    }
    return values
  }, [element.propValues, element.cmsColumnBindings, cmsRow])

  /**
   * Apply prop values (including CMS bindings) to get the rendered elements.
   * Transforms the component's sourceTree by injecting propValues into targets.
   */
  const renderedElements = useMemo(() => {
    if (!component) return null
    return applyPropValuesToElements(component, mergedPropValues)
  }, [component, mergedPropValues])

  /* All hooks called above — safe to do conditional return now */
  if (!component || !renderedElements) return null

  const { rootElement, childElements } = renderedElements
  const rootFrame = rootElement as FrameElement
  const rootStyles = { ...DEFAULT_FRAME_STYLES, ...(rootFrame.styles ?? {}) }
  const rootFlexWrap = rootStyles.flexWrap as 'nowrap' | 'wrap' | undefined
  const isRootScrollEnabled = rootFrame.scrollEnabled ?? rootFrame.responsive ?? false
  const shouldRootAutoHeight = rootFlexWrap === 'wrap' || isRootScrollEnabled
  /**
   * Resolve autoWidth with responsive breakpoint awareness.
   * Uses getPropertyValue so mobile overrides (responsiveProperties.mobile.autoWidth)
   * are picked up when the builder is in mobile breakpoint or published on mobile.
   */
  const hasRootAutoWidth = getPropertyValue<boolean>(
    rootFrame, 'autoWidth', breakpoint, rootFrame.autoWidth ?? false
  ) ?? false
  const rootBorderConfig = (rootFrame.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const childrenMap = component.sourceTree.childrenMap
  const rootChildIds = childrenMap[rootElement.id] || []
  const rootChildren = rootChildIds
    .map((id) => childElements.find((el) => el.id === id))
    .filter((el): el is CanvasElement => el !== undefined)

  /**
   * Resolve responsive-aware root frame dimensions.
   * getPropertyValue checks for mobile breakpoint overrides first, then falls
   * back to the base rootFrame values. This ensures the component instance
   * wrapper has correct dimensions in both desktop and mobile breakpoints.
   * SOURCE OF TRUTH: ComponentInstanceResponsiveSize
   */
  const resolvedRootWidth = getPropertyValue<number>(
    rootFrame, 'width', breakpoint, rootFrame.width
  ) ?? rootFrame.width
  const resolvedRootHeight = getPropertyValue<number>(
    rootFrame, 'height', breakpoint, rootFrame.height
  ) ?? rootFrame.height

  /**
   * Compute content styles for the component's root frame.
   * BOTH modes use identical parameters to ensure visual consistency:
   * - allowOverflow: false — respect user-specified overflow, default to 'visible'
   *   (editor chrome overlays live on the parent ElementWrapper, not this content div)
   * - breakpoint: actual breakpoint — so mobile responsive styles are applied in
   *   canvas mode too, not just in preview
   */
  const containerStyles = computeFrameContentStyles(rootFrame, false, {
    allowOverflow: false,
    breakpoint,
  })

  return {
    rootFrame,
    rootBorderConfig,
    rootStyles,
    shouldRootAutoHeight,
    hasRootAutoWidth,
    resolvedRootWidth,
    resolvedRootHeight,
    childrenMap,
    childElements,
    rootChildren,
    containerStyles,
  }
}

// ============================================================================
// COMPONENT — UnifiedComponentInstance (Thin Branching Wrapper)
// ============================================================================

/**
 * Unified component instance element that renders in both canvas and preview modes.
 *
 * ARCHITECTURE FIX: This outer component checks the render mode and delegates
 * to either CanvasComponentInstanceCore (which uses Redux hooks) or
 * PreviewComponentInstanceCore (which does NOT use Redux hooks).
 *
 * This split is required because preview/published pages do NOT have a Redux
 * Provider — calling useSelector/useAppSelector without a Provider crashes with:
 * "could not find react-redux context value; please ensure the component is
 * wrapped in a <Provider>"
 *
 * By splitting into separate React components, each set of hooks is only called
 * when the corresponding Provider is available. This satisfies React's rules of
 * hooks (hooks are called unconditionally within each inner component) while
 * avoiding the missing Provider crash.
 */
export const UnifiedComponentInstance = memo(function UnifiedComponentInstance(
  props: UnifiedComponentInstanceProps
) {
  const { mode } = useRenderMode()

  /* Canvas mode: Redux store is available — use the Redux-aware inner component */
  if (mode === 'canvas') {
    return <CanvasComponentInstanceCore {...props} />
  }

  /* Preview mode: no Redux store — use the context-only inner component */
  return <PreviewComponentInstanceCore {...props} />
})

// ============================================================================
// CANVAS INNER COMPONENT — Uses Redux hooks (requires Redux Provider)
// ============================================================================

/**
 * Canvas-mode rendering path for component instances.
 * Uses useAppSelector to look up the component definition and selection state
 * from the Redux store. Only mounted when mode='canvas' (Redux Provider present).
 */
function CanvasComponentInstanceCore({
  element,
  selectedIds: propSelectedIds,
  hoveredElementId: propHoveredElementId,
  zoom = 1,
  onDragStart,
  onHoverStart,
  onHoverEnd,
}: UnifiedComponentInstanceProps) {
  const { breakpoint } = useRenderMode()

  /* Redux selectors — safe here because canvas always has the Redux Provider */
  const canvasComponent = useAppSelector((state) =>
    selectLocalComponentById(state, element.componentId)
  )
  const reduxSelectedIds = useAppSelector(selectSelectedIds)

  /* Shared render data computation (CMS merge, prop application, root frame) */
  const renderData = useComponentInstanceRenderData(
    canvasComponent, element, breakpoint, false
  )

  /**
   * Create a Set of selected IDs — use props if provided (for nested recursion),
   * otherwise use Redux state (for top-level instances from canvas).
   */
  const selectedIdsSet = useMemo(() => {
    if (propSelectedIds) return propSelectedIds
    return new Set(reduxSelectedIds)
  }, [propSelectedIds, reduxSelectedIds])

  const hoveredId = propHoveredElementId ?? null

  /* Error state: component definition not found */
  if (!renderData) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#1a1a1a',
          border: '2px dashed #ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ef4444',
          fontSize: 12,
        }}
      >
        Component not found
      </div>
    )
  }

  return (
    <CanvasComponentContent
      element={element}
      rootFrame={renderData.rootFrame}
      rootBorderConfig={renderData.rootBorderConfig}
      containerStyles={renderData.containerStyles}
      rootStyles={renderData.rootStyles}
      shouldRootAutoHeight={renderData.shouldRootAutoHeight}
      childrenMap={renderData.childrenMap}
      childElements={renderData.childElements}
      rootChildren={renderData.rootChildren}
      zoom={zoom}
      selectedIdsSet={selectedIdsSet}
      hoveredId={hoveredId}
      onDragStart={onDragStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    />
  )
}

// ============================================================================
// PREVIEW INNER COMPONENT — No Redux hooks (no Redux Provider needed)
// ============================================================================

/**
 * Preview-mode rendering path for component instances.
 * Looks up the component definition from RenderModeContext (not Redux).
 * Only mounted when mode='preview' — safe to use without a Redux Provider.
 */
function PreviewComponentInstanceCore({
  element,
}: UnifiedComponentInstanceProps) {
  const { breakpoint, components: contextComponents } = useRenderMode()

  /**
   * Read parent flex direction BEFORE any conditional returns (React hooks rule).
   * Used for autoWidth flex distribution — row parent uses flex: 1 1 0%,
   * column parent uses width: 100%. This ensures component instances share
   * space equally when placed in a horizontal flex layout.
   */
  const parentFlexDirection = useParentFlexDirection()
  const isParentRow = parentFlexDirection === 'row' || parentFlexDirection === 'row-reverse'

  /* Look up component from the context-provided components map (no Redux) */
  const component = contextComponents?.[element.componentId] ?? null

  /* Shared render data computation (CMS merge, prop application, root frame) */
  const renderData = useComponentInstanceRenderData(
    component, element, breakpoint, true
  )

  /* Error state: component definition not found */
  if (!renderData) {
    const isRoot = element.parentId === null
    return (
      <div
        data-element-id={element.id}
        data-component-id={element.componentId}
        style={{
          position: isRoot ? 'absolute' : 'relative',
          left: isRoot ? element.x : undefined,
          top: isRoot ? element.y : undefined,
          width: element.width,
          height: element.height,
          backgroundColor: '#1a1a1a',
          border: '2px dashed #ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ef4444',
          fontSize: 12,
        }}
      >
        Component not found
      </div>
    )
  }

  const {
    rootBorderConfig, shouldRootAutoHeight, hasRootAutoWidth,
    resolvedRootWidth, resolvedRootHeight,
    childrenMap, childElements, rootChildren, containerStyles,
  } = renderData

  const isRoot = element.parentId === null

  /**
   * Position styles — uses computeElementPositionStyles for full parity with
   * other element types. This gives us: position, left/top (with centering
   * and isAbsolute support), transform (rotation + centering), zIndex, and
   * margin — all resolved with responsive breakpoint awareness so mobile
   * overrides take effect in preview/published mode.
   */
  const positionStyles = computeElementPositionStyles(element, isRoot, breakpoint)

  /**
   * Wrapper styles — merge position with size from master's rootElement.
   * Size comes from the component's source tree root frame, resolved through
   * getPropertyValue for responsive breakpoint awareness.
   *
   * When autoWidth + row parent, use flex: 1 1 0% for equal space distribution
   * instead of width: 100% which would make the instance take full row width.
   */
  const wrapperStyles: React.CSSProperties = {
    ...positionStyles,
    width: hasRootAutoWidth ? '100%' : resolvedRootWidth,
    height: shouldRootAutoHeight ? 'auto' : resolvedRootHeight,
    /* Flex distribution for autoWidth instances inside row flex parents */
    ...(hasRootAutoWidth && isParentRow ? { flex: '1 1 0%', minWidth: 0 } : {}),
    overflow: 'visible',
    visibility: element.visible === false ? 'hidden' : undefined,
  }

  /**
   * Content styles — the actual component appearance.
   * Override overflow to allow sticky positioning in descendants.
   */
  const contentStyles: React.CSSProperties = {
    ...containerStyles,
    width: '100%',
    height: shouldRootAutoHeight ? 'auto' : '100%',
    overflowX: 'visible',
    overflowY: 'visible',
  }

  /** Gradient border support for preview mode */
  const hasGradient = rootBorderConfig && hasGradientBorder(rootBorderConfig)
  const gradientClassName = hasGradient ? getGradientBorderClassName(element.id) : undefined

  return (
    <div
      data-element-id={element.id}
      data-component-id={element.componentId}
      style={wrapperStyles}
    >
      <div className={gradientClassName || undefined} style={contentStyles}>
        {/* Gradient border overlay — injects CSS for ::before pseudo-element */}
        {hasGradient && (
          <GradientBorderOverlay
            elementId={element.id}
            borderConfig={rootBorderConfig}
            borderRadius={containerStyles.borderRadius}
          />
        )}
        {/**
         * Provide the root frame's flex direction to children via context.
         * Children use this to determine autoWidth behavior:
         * - Row parent → flex: 1 1 0% (share horizontal space)
         * - Column parent → width: 100% (fill full width)
         */}
        <ParentFlexDirectionProvider value={(containerStyles.flexDirection as string) || 'column'}>
          {rootChildren.map((child) => (
            <ComponentChildRenderer
              key={child.id}
              element={child}
              childrenMap={childrenMap}
              allElements={childElements}
              breakpoint={breakpoint}
              components={contextComponents}
            />
          ))}
        </ParentFlexDirectionProvider>
      </div>
    </div>
  )
}

// ============================================================================
// CANVAS CONTENT COMPONENT — Extracted to use gradient border hook
// ============================================================================

/**
 * Props for the canvas content sub-component.
 * Extracted because useGradientBorder is a hook that needs to be called
 * at the component level, not conditionally inside UnifiedComponentInstance.
 */
interface CanvasComponentContentProps {
  element: ComponentInstanceType
  rootFrame: FrameElement
  rootBorderConfig: BorderConfig | undefined
  containerStyles: React.CSSProperties
  rootStyles: Record<string, unknown>
  shouldRootAutoHeight: boolean
  childrenMap: Record<string, string[]>
  childElements: CanvasElement[]
  rootChildren: CanvasElement[]
  zoom: number
  selectedIdsSet: Set<string>
  hoveredId: string | null
  onDragStart?: (e: React.PointerEvent, elementId: string, isModifierHeld?: boolean) => void
  onHoverStart?: (elementId: string, isModifierHeld: boolean) => void
  onHoverEnd?: (elementId: string) => void
}

/**
 * Renders the canvas-mode content for a component instance.
 *
 * This is the CONTENT ONLY — no selection rings, no labels, no resize handles.
 * The parent ElementWrapper (via CanvasComponentInstanceElement) handles all chrome.
 *
 * Separated into its own component so the useGradientBorder hook can be called
 * unconditionally (React hook rules).
 */
function CanvasComponentContent({
  element,
  rootFrame,
  rootBorderConfig,
  containerStyles,
  rootStyles,
  shouldRootAutoHeight,
  childrenMap,
  childElements,
  rootChildren,
  zoom,
  selectedIdsSet,
  hoveredId,
  onDragStart,
  onHoverStart,
  onHoverEnd,
}: CanvasComponentContentProps) {
  /** Gradient border hook for the root frame */
  const rootGradientBorder = useGradientBorder(element.id, rootBorderConfig)

  /**
   * No-op handlers for nested instances when parent handlers are not provided.
   * This should not happen in practice, but provides type-safe defaults.
   */
  const safeDragStart = onDragStart ?? (() => { /* no-op */ })
  const safeHoverStart = onHoverStart ?? (() => { /* no-op */ })
  const safeHoverEnd = onHoverEnd ?? (() => { /* no-op */ })

  /**
   * Content styles — when wrap/scroll is enabled, height is auto.
   * Overflow is always visible to match preview behavior and allow
   * sticky positioning, overflow content, and standard web layout.
   * containerStyles already computes the correct overflow from
   * computeFrameContentStyles — no need to override it here.
   */
  const contentStyles: React.CSSProperties = {
    ...containerStyles,
    width: '100%',
    height: shouldRootAutoHeight ? 'auto' : '100%',
    overflowX: 'visible',
    overflowY: 'visible',
    /* Kill transition in canvas to prevent content lagging during drag/resize */
    transition: 'none',
  }

  return (
    <div
      className={rootGradientBorder.className || undefined}
      style={contentStyles}
    >
      {/* Inject gradient border CSS if active */}
      {rootGradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={rootBorderConfig}
          borderRadius={containerStyles.borderRadius}
        />
      )}
      {/**
       * Provide the root frame's flex direction to children via context.
       * Children use this to determine autoWidth behavior:
       * - Row parent → flex: 1 1 0% (share horizontal space)
       * - Column parent → width: 100% (fill full width)
       */}
      <ParentFlexDirectionProvider value={(containerStyles.flexDirection as string) || 'column'}>
        {rootChildren.map((child) => (
          <CanvasChildRenderer
            key={child.id}
            element={child}
            childrenMap={childrenMap}
            allElements={childElements}
            zoom={zoom}
            selectedIds={selectedIdsSet}
            hoveredId={hoveredId}
            onDragStart={safeDragStart}
            onHoverStart={safeHoverStart}
            onHoverEnd={safeHoverEnd}
            parentInstanceId={element.id}
            parentNestedPropValues={element.nestedPropValues}
          />
        ))}
      </ParentFlexDirectionProvider>
    </div>
  )
}

// ============================================================================
// CANVAS HELPER HOOK — Provides sizing metadata for ElementWrapper
// ============================================================================

/**
 * Hook to compute canvas-specific values that get passed to ElementWrapper.
 *
 * SOURCE OF TRUTH: UnifiedComponentInstanceMeta, component-instance-canvas-meta
 *
 * Used by CanvasComponentInstanceElement (in canvas-unified-wrappers.tsx) to
 * compute:
 * - sizeStyles: { width, height } for the wrapper element (from master's sourceTree)
 * - dimensionLabel: "Fill x Auto", "300 x 200", etc. for the dimensions pill
 * - wrapperOverrides: visibility overrides
 *
 * The component instance's SIZE always comes from the master component's
 * sourceTree root element — instances cannot be resized independently.
 */
export function useUnifiedComponentInstanceMeta(
  element: ComponentInstanceType
) {
  /**
   * Read the current breakpoint so root frame dimensions resolve responsively.
   * Without this, the canvas wrapper would always show desktop dimensions
   * even when the builder is in mobile breakpoint mode.
   */
  const { breakpoint } = useRenderMode()

  /**
   * Read parent flex direction for autoWidth flex distribution.
   * When autoWidth + row parent, the instance uses flex: 1 1 0% to share
   * horizontal space equally instead of width: 100% which would force
   * the instance to take the full row width.
   */
  const parentFlexDirection = useParentFlexDirection()

  /**
   * Get the component definition from Redux to access the sourceTree.
   * We need the master's root element to determine the instance's size.
   */
  const component = useAppSelector((state) =>
    selectLocalComponentById(state, element.componentId)
  )

  return useMemo(() => {
    const isParentRow = parentFlexDirection === 'row' || parentFlexDirection === 'row-reverse'

    /**
     * If component not found, use element's own dimensions as fallback.
     * This should not happen in normal operation.
     */
    if (!component?.sourceTree) {
      return {
        sizeStyles: {
          width: element.width,
          height: element.height,
        } as React.CSSProperties,
        dimensionLabel: `${Math.round(element.width)} \u00D7 ${Math.round(element.height)}`,
        wrapperOverrides: {} as React.CSSProperties,
      }
    }

    /**
     * Apply propValues to get the rendered root element with all overrides.
     * We need this because CMS bindings may change the root element's properties.
     */
    const renderedElements = applyPropValuesToElements(component, element.propValues ?? {})
    if (!renderedElements) {
      return {
        sizeStyles: {
          width: element.width,
          height: element.height,
        } as React.CSSProperties,
        dimensionLabel: `${Math.round(element.width)} \u00D7 ${Math.round(element.height)}`,
        wrapperOverrides: {} as React.CSSProperties,
      }
    }

    const rootFrame = renderedElements.rootElement as FrameElement
    const rootStyles = { ...DEFAULT_FRAME_STYLES, ...(rootFrame.styles ?? {}) }
    const rootFlexWrap = rootStyles.flexWrap as 'nowrap' | 'wrap' | undefined
    const isRootScrollEnabled = rootFrame.scrollEnabled ?? rootFrame.responsive ?? false
    const shouldRootAutoHeight = rootFlexWrap === 'wrap' || isRootScrollEnabled
    /**
     * Resolve autoWidth with responsive breakpoint awareness.
     * Uses getPropertyValue so mobile overrides (responsiveProperties.mobile.autoWidth)
     * take effect when the builder is in mobile breakpoint mode.
     *
     * Only apply autoWidth when the instance is inside a container (has a parent).
     * Root-level instances have position: absolute with no sized parent, so
     * width: 100% would collapse. Fall through to the fixed pixel width instead.
     */
    const hasRootAutoWidth = (getPropertyValue<boolean>(
      rootFrame, 'autoWidth', breakpoint, rootFrame.autoWidth ?? false
    ) ?? false) && element.parentId !== null

    /**
     * Resolve responsive-aware root frame dimensions.
     * getPropertyValue checks mobile breakpoint overrides before falling back
     * to base values. This ensures the canvas wrapper matches the responsive
     * size the preview/published renderer would compute.
     * SOURCE OF TRUTH: ComponentInstanceResponsiveSize
     */
    const resolvedWidth = getPropertyValue<number>(
      rootFrame, 'width', breakpoint, rootFrame.width
    ) ?? rootFrame.width
    const resolvedHeight = getPropertyValue<number>(
      rootFrame, 'height', breakpoint, rootFrame.height
    ) ?? rootFrame.height

    /** Width from master's sourceTree — autoWidth uses 100% when inside a container */
    const width: number | string = hasRootAutoWidth ? '100%' : resolvedWidth
    /** Height from master's sourceTree — wrap mode uses auto */
    const height: number | string = shouldRootAutoHeight ? 'auto' : resolvedHeight

    const sizeStyles: React.CSSProperties = {
      width,
      height,
      /**
       * Flex distribution for autoWidth instances inside row flex parents.
       * flex: 1 1 0% shares horizontal space equally; minWidth: 0 allows
       * shrinking below content width. Without this, width: 100% would make
       * each instance try to fill the entire row instead of sharing space.
       */
      ...(hasRootAutoWidth && isParentRow ? { flex: '1 1 0%', minWidth: 0 } : {}),
    }

    /** Dimension label for the dimensions pill */
    const widthLabel = hasRootAutoWidth ? 'Fill' : String(Math.round(resolvedWidth))
    const heightLabel = shouldRootAutoHeight ? 'Auto' : String(Math.round(resolvedHeight))
    const dimensionLabel = `${widthLabel} \u00D7 ${heightLabel}`

    /**
     * Wrapper overrides — visibility and margin.
     * Margin must be on the OUTER wrapper (not inner content) so it creates
     * space between elements, not internal padding. Uses getStyleValue for
     * responsive awareness (mobile breakpoint picks up mobile margin override).
     */
    const resolvedMargin = getStyleValue<string>(element, 'margin', breakpoint)
    const wrapperOverrides: React.CSSProperties = {
      ...(element.visible === false ? { display: 'none' as const } : {}),
      ...(resolvedMargin ? { margin: resolvedMargin } : {}),
    }

    return {
      sizeStyles,
      dimensionLabel,
      wrapperOverrides,
    }
  }, [element, component, breakpoint, parentFlexDirection])
}
