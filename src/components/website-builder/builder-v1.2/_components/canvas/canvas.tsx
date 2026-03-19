/**
 * ============================================================================
 * CANVAS - Main Canvas Component
 * ============================================================================
 *
 * The primary container that renders all canvas elements and handles
 * interactions via custom hooks.
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE - READ BEFORE MODIFYING
 * ============================================================================
 *
 * This component is the INTEGRATION POINT where:
 *
 * 1. REDUX data is read (elements, selection, viewport, tool mode)
 * 2. HOOKS are initialized (useDrag, useResize, useFrameCreation)
 * 3. COMPONENTS are rendered with data and handlers
 *
 * ============================================================================
 * DATA FLOW
 * ============================================================================
 *
 * Redux Store
 *     ↓
 * Canvas (this file)
 *     ↓ reads elements, selection, viewport
 *     ↓ initializes interaction hooks
 *     ↓ passes handlers to components
 *     ↓
 * FrameElement, ResizeHandles, etc.
 *     ↓ trigger handlers on pointer events
 *     ↓
 * Hooks (useDrag, useResize, useFrameCreation)
 *     ↓ update REFS during 60fps interactions
 *     ↓ dispatch to Redux ONLY on interaction end
 *     ↓
 * Redux Store (cycle completes)
 *
 * ============================================================================
 * IMPORTANT REMINDERS
 * ============================================================================
 *
 * 1. Elements are stored in Redux with O(1) lookups
 * 2. Interaction state (drag position, resize dimensions) is in REFS
 * 3. DOM updates during interactions use RAF, not React state
 * 4. Redux dispatch happens ONLY when interactions END
 *
 * ============================================================================
 */

'use client'

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import {
  useAppDispatch,
  useAppSelector,
  selectRootElements,
  selectSelectedIds,
  selectViewport,
  selectToolMode,
  selectMainPage,
  selectCanvasError,
  selectPageInfos,
  selectLocalComponents,
  clearSelection,
  setViewport,
  elementsToSnapTargets,
  detectAlignments,
  addElement,
  setSelection,
  setToolMode,
  isSidebarInsetFrame,
  undo,
  redo,
} from '../../_lib'
import type {
  CanvasElement,
  ResizeHandle,
  FrameElement as FrameElementType,
  TextElement as TextElementType,
  ImageElement as ImageElementType,
  VideoElement as VideoElementType,
  FormElement as FormElementType,
  PaymentElement as PaymentElementType,
  ButtonElement as ButtonElementType,
  PageElement as PageElementType,
  SmartCmsListElement as SmartCmsListElementType,
  AddToCartButtonElement as AddToCartButtonElementType,
  CheckoutElement as CheckoutElementType,
  CartElement as CartElementType,
  EcommerceCarouselElement as EcommerceCarouselElementType,
  FaqElement as FaqElementType,
  ListElement as ListElementType,
  StickyNoteElement as StickyNoteElementType,
  TimerElement as TimerElementType,
  LinkElement as LinkElementType,
  ComponentInstanceElement as ComponentInstanceType,
  ReceiptElement as ReceiptElementType,
  RichTextElement as RichTextElementType,
  PencilElement as PencilElementType,
  ToolMode,
} from '../../_lib/types'
import {
  DEFAULT_FRAME_PROPS,
  DEFAULT_FRAME_STYLES,
  DEFAULT_TEXT_PROPS,
  DEFAULT_TEXT_STYLES,
  DEFAULT_IMAGE_PROPS,
  DEFAULT_IMAGE_STYLES,
  DEFAULT_VIDEO_PROPS,
  DEFAULT_VIDEO_STYLES,
  DEFAULT_FORM_PROPS,
  DEFAULT_FORM_STYLES,
  DEFAULT_PAYMENT_PROPS,
  DEFAULT_PAYMENT_STYLES,
  DEFAULT_BUTTON_PROPS,
  DEFAULT_BUTTON_STYLES,
  DEFAULT_SMARTCMS_LIST_PROPS,
  DEFAULT_SMARTCMS_LIST_STYLES,
  DEFAULT_ADD_TO_CART_BUTTON_PROPS,
  DEFAULT_ADD_TO_CART_BUTTON_STYLES,
  DEFAULT_CHECKOUT_PROPS,
  DEFAULT_CART_PROPS,
  DEFAULT_CART_STYLES,
  DEFAULT_ECOMMERCE_CAROUSEL_PROPS,
  DEFAULT_ECOMMERCE_CAROUSEL_STYLES,
  DEFAULT_STICKY_NOTE_PROPS,
  DEFAULT_STICKY_NOTE_STYLES,
  DEFAULT_RECEIPT_PROPS,
  DEFAULT_RECEIPT_STYLES,
  DEFAULT_RICH_TEXT_PROPS,
  DEFAULT_RICH_TEXT_STYLES,
} from '../../_lib/types'
import type { PreBuiltNavbarElement, PreBuiltSidebarElement, PreBuiltTotalMembersElement, PreBuiltLogoCarouselElement, PreBuiltElementType as PreBuiltType, NavbarLink, NavbarSettings, SidebarSettings, SidebarLink, TotalMembersSettings, LogoCarouselSettings } from '../../_lib/prebuilt'
import { getPreBuiltDefinition, getPreBuiltVariant, generatePreBuiltId, generateLinkId, generateSidebarLinkId, DEFAULT_SIDEBAR_SETTINGS, DEFAULT_TOTAL_MEMBERS_SETTINGS, DEFAULT_LOGO_CAROUSEL_SETTINGS, isPreBuiltLogoCarousel } from '../../_lib/prebuilt'
import type { SnapBounds } from '../../_lib/snap-service'
import { useDrag, useResize, useFrameCreation, useTextCreation, usePencilCreation, useMarqueeSelection, useGroupActions, useAutoSave, useComponentAutoSave, useMasterComponentSync } from '../../_hooks'
import { useBuilderContext } from '../../_lib/builder-context'
import {
  selectStagingGroupById,
  removeStagingGroup,
} from '../../_lib/staging-slice'
import {
  Toolbar,
  Sidebar,
  PropertiesPanel,
  BuilderHeader,
  PreviewOverlay,
} from '..'
import { StagingCanvas } from './staging-canvas'
import {
  CanvasTextElement,
  CanvasImageElement,
  CanvasVideoElement,
  CanvasButtonElement,
  CanvasFrameElement,
  CanvasLinkElement,
  CanvasFormElement,
  CanvasPaymentElement,
  CanvasAddToCartElement,
  CanvasCartElement,
  CanvasCheckoutElement,
  CanvasEcommerceCarouselElement,
  CanvasFaqElement,
  CanvasListElement,
  CanvasStickyNoteElement,
  CanvasTimerElement,
  CanvasReceiptElement,
  CanvasRichTextElement,
  CanvasComponentInstanceElement,
  CanvasSmartCmsListElement,
  CanvasPencilElement,
  CanvasPreBuiltNavbarElement,
  CanvasPreBuiltSidebarElement,
  CanvasPreBuiltTotalMembersElement,
  CanvasPreBuiltLogoCarouselElement,
} from './canvas-unified-wrappers'
import { FrameCreationPreview } from './frame-creation-preview'
import { PencilCreationPreview } from './pencil-creation-preview'
import { MarqueeSelectionBox } from './marquee-selection-box'
import { CanvasLoader } from './canvas-loader'
import { Rulers } from './rulers'
import { CanvasErrorBanner } from './canvas-error-banner'
import { CmsPreviewProvider } from './cms-preview-provider'
import { ElementOverlayProvider } from '../../_lib/element-overlay-context'
import { BreakpointMobileFrame } from '../header'
import { isPreBuiltNavbar, isPreBuiltSidebar, isPreBuiltTotalMembers } from '../../_lib/prebuilt'
import { useLocalComponents, selectLocalComponentById, RenderModeProvider } from '../../_lib'
import { createComponentInstance } from '../../_lib/component-utils'
import { createUniformBorderConfig } from '../../_lib/border-utils'
import { NavigationGate } from '@/components/global/navigation-gate'
import { store } from '../../_lib/store'
import { CmsModal } from '../cms'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { SpotlightSearch } from '../spotlight/spotlight-search'

// ============================================================================
// HELPER - Get active page data from store
// ============================================================================

/**
 * Helper to get the active page's canvas from the store.
 *
 * WHY THIS EXISTS:
 * - The state structure changed from flat to page-based
 * - All direct store access needs to go through the active page
 * - This provides a consistent way to access page data
 */
function getActivePageCanvas() {
  const state = store.getState()
  const activePageId = state.canvas.pages.activePageId
  const activePage = state.canvas.pages.pages[activePageId]
  return activePage.canvas
}

/**
 * Sort staged elements so parents come before children (BFS from roots).
 * Required when transferring from staging to canvas — addElement needs
 * the parent to exist before its children are added.
 */
function sortStagedElementsByDepth(
  elements: CanvasElement[],
  rootIds: string[]
): CanvasElement[] {
  const elementMap = new Map(elements.map((el) => [el.id, el]))
  const result: CanvasElement[] = []
  const visited = new Set<string>()
  const queue = [...rootIds]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const element = elementMap.get(id)
    if (!element) continue
    result.push(element)
    /** Enqueue children of this element */
    for (const el of elements) {
      if (el.parentId === id && !visited.has(el.id)) {
        queue.push(el.id)
      }
    }
  }
  /** Safety: add any unreachable elements */
  for (const el of elements) {
    if (!visited.has(el.id)) result.push(el)
  }
  return result
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Main canvas component.
 *
 * USAGE:
 * ```tsx
 * // In page.tsx:
 * <Provider store={store}>
 *   <Canvas pageId="..." organizationId="..." />
 * </Provider>
 * ```
 *
 * Handles:
 * - Rendering all elements from Redux
 * - Pan and zoom via mouse/trackpad
 * - Element interactions via hooks
 * - Tool mode switching
 *
 * DATA FLOW:
 * - Canvas data is loaded into Redux by BuilderClient before this component renders
 * - This component reads from Redux, never fetches data itself
 * - pageId/organizationId are passed for save operations
 */
interface CanvasProps {
  /** The page ID (first-class page entity) for loading/saving canvas data */
  pageId?: string
  /** The organization ID for tRPC mutations */
  organizationId?: string
  /** The page display name (shown in header) */
  pageName?: string
  /** The website (category) name (shown in header with globe icon) */
  websiteName?: string
  // Note: domainName is provided via BuilderContext, not props
}

export function Canvas({ pageId, organizationId, pageName, websiteName }: CanvasProps) {
  const dispatch = useAppDispatch()

  // ========================================================================
  // CONTEXT - Get websiteId and domainId for auto-save upsert
  // ========================================================================

  const { websiteId, domainId, enableEcommerce } = useBuilderContext()

  // ========================================================================
  // LOCAL COMPONENTS - Load from database on mount
  // ========================================================================

  /**
   * Initialize the useLocalComponents hook to load components from the
   * database into Redux when the builder first renders.
   *
   * This ensures that:
   * 1. Component instances on the canvas can find their component definitions
   * 2. The LocalComponentsPanel shows the correct components
   * 3. Components persist across page refreshes
   *
   * The hook fetches from database and populates Redux state automatically.
   */
  useLocalComponents()

  // ========================================================================
  // REFS - Canvas container reference
  // ========================================================================

  /**
   * Reference to the canvas container element.
   * Used by hooks for coordinate transformations.
   */
  const canvasRef = useRef<HTMLDivElement>(null!)

  /**
   * Overlay container ref - used for portal-based overlay rendering.
   * This container has the same transform as the canvas content,
   * allowing overlays to be positioned correctly while escaping
   * parent frame overflow:hidden clipping.
   */
  const overlayContainerRef = useRef<HTMLDivElement>(null!)

  // ========================================================================
  // REDUX STATE - Read-only access to store data
  // ========================================================================

  /**
   * Root elements - elements with no parent (directly on canvas).
   * These are rendered first and positioned absolutely.
   */
  const rootElements = useAppSelector(selectRootElements)

  /** Currently selected element IDs (supports multi-selection) */
  const selectedIds = useAppSelector(selectSelectedIds)

  /** Viewport state - pan offset and zoom level */
  const viewport = useAppSelector(selectViewport)

  /**
   * Ref mirror of viewport for use in event handlers that should NOT
   * cause effect re-subscriptions (e.g., middle-click pan).
   * Updated synchronously on every render so handlers always read fresh values.
   */
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  /** Current tool mode */
  const toolMode = useAppSelector(selectToolMode)

  /** Main page element (used for initial centering) */
  const mainPage = useAppSelector(selectMainPage)

  /** Canvas error state - critical errors that require page refresh */
  const canvasError = useAppSelector(selectCanvasError)

  /**
   * Page infos - all pages in the website.
   * Used to auto-populate navbar links when a navbar is dropped.
   */
  const pageInfos = useAppSelector(selectPageInfos)

  /**
   * Local components - map of component definitions for rendering instances.
   * Passed to BreakpointMobileFrame so component instances render correctly.
   */
  const localComponents = useAppSelector(selectLocalComponents)

  // ========================================================================
  // LOADING STATE - Show loader until canvas is ready
  // ========================================================================

  /** Loading state — shows CanvasLoader overlay until canvas data is ready */
  const [isLoading, setIsLoading] = useState(true)

  /**
   * CMS Modal State
   * Controls visibility of the CMS modal for managing content tables.
   */
  const [isCmsModalOpen, setIsCmsModalOpen] = useState(false)

  /**
   * Storage Modal State
   * Controls visibility of the Storage browser modal for quick file access.
   */
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false)

  /**
   * AI Widget State
   * Controls visibility of the AI design assistant widget.
   * Toggled via toolbar button or keyboard shortcut (Cmd/Ctrl + J).
   * The widget is a floating element positioned at bottom-right.
   * Defaults to visible (true) so users see it immediately.
   */
  const [isAIWidgetVisible, setIsAIWidgetVisible] = useState(true)

  /**
   * Spotlight Search State
   * Controls visibility of the command palette overlay (Cmd/Ctrl + F).
   */
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false)

  /**
   * Settings dialog external trigger — when spotlight navigates to settings,
   * this flips to true so BuilderHeader opens the dialog.
   */
  const [settingsOpenExternal, setSettingsOpenExternal] = useState(false)

  /** Ref to the header's publish handler — populated by BuilderHeader via onPublishRef */
  const publishRef = useRef<(() => void) | null>(null)

  /**
   * Track whether we've done the initial focus.
   * We only want to auto-center once when the canvas first loads.
   */
  const hasInitialFocus = useRef(false)

  // ========================================================================
  // PANNING STATE - Track space key and middle-mouse-button pan mode
  // ========================================================================

  /**
   * Whether the space key is currently held down.
   * Used to enable "grab to pan" mode (like Figma/design tools).
   * Stored in a ref because it changes at 60fps during interactions.
   */
  const isSpaceHeldRef = useRef(false)

  /**
   * Whether we are actively dragging to pan the canvas.
   * True when: middle mouse button is held, OR space + left click is held.
   * Stored in a ref for performance — avoids React re-renders during drag.
   */
  const isPanDraggingRef = useRef(false)

  /**
   * Last mouse position during a pan drag operation.
   * Used to calculate the delta (movement) between mouse events.
   */
  const panLastPositionRef = useRef<{ x: number; y: number } | null>(null)

  /**
   * Cursor state for the canvas.
   * 'grab' = space key held (ready to pan), 'grabbing' = actively dragging to pan.
   * null = use the default cursor based on tool mode.
   */
  const [panCursor, setPanCursor] = useState<'grab' | 'grabbing' | null>(null)

  // ========================================================================
  // CLIENT-SIDE PAGE FOCUS - Center page on mount
  // ========================================================================

  /**
   * Focus the page element within the visible viewport on initial load.
   *
   * This runs client-side where we have access to actual screen dimensions.
   * The goal is to:
   * 1. Calculate the visible canvas area (excluding sidebars)
   * 2. Scale the page to fit within that area with some padding
   * 3. Center the page horizontally
   * 4. Position the top of the page ~50px from the top of the canvas
   *
   * Once centering is complete, we hide the loader with a smooth transition.
   */
  useEffect(() => {
    // Only run once on initial load
    if (hasInitialFocus.current) return

    // Use requestAnimationFrame to ensure DOM is painted and has dimensions
    const focusAndReveal = () => {
      // Double RAF to ensure layout is complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Check if we have the required refs and state
          if (!canvasRef.current || !mainPage) {
            // If no mainPage yet, just hide loader anyway after a short delay
            // This prevents infinite loading state
            setTimeout(() => setIsLoading(false), 200)
            return
          }

          // Get the actual visible canvas width
          const canvasRect = canvasRef.current.getBoundingClientRect()
          const canvasWidth = canvasRect.width

          // Only proceed with centering if canvas has valid dimensions
          if (canvasWidth > 0) {
            // Padding values
            const HORIZONTAL_PADDING = 80 // Total padding on left+right
            const TOP_PADDING = 50 // Distance from top to page top

            // Calculate zoom to fit page width within available space
            const availableWidth = canvasWidth - HORIZONTAL_PADDING
            const zoom = Math.min(
              availableWidth / mainPage.width,
              1 // Don't zoom in beyond 100%
            )

            // Clamp zoom to valid range (10% to 300%)
            const clampedZoom = Math.max(0.1, Math.min(3, zoom))

            // Calculate pan to center horizontally and position top with padding
            const scaledPageWidth = mainPage.width * clampedZoom
            const panX = (canvasWidth - scaledPageWidth) / 2 - mainPage.x * clampedZoom
            const panY = TOP_PADDING - mainPage.y * clampedZoom

            // Apply the calculated viewport
            dispatch(setViewport({ panX, panY, zoom: clampedZoom }))
          }

          // Mark as done so we don't re-center on subsequent renders
          hasInitialFocus.current = true

          // Small delay to ensure viewport is applied before showing canvas
          setTimeout(() => setIsLoading(false), 100)
        })
      })
    }

    focusAndReveal()
  }, [dispatch, mainPage])

  // ========================================================================
  // SNAP TARGETS - Computed from root elements for alignment
  // ========================================================================

  /**
   * Compute snap targets excluding currently selected elements.
   *
   * SNAP TARGETS ARE:
   * - Root-level elements only (parentId === null)
   * - Excludes selected elements (can't snap to yourself)
   *
   * IMPORTANT: We get elements directly from store.getState() here because:
   * - Snap targets need the CURRENT element positions
   * - useMemo with rootElements dependency ensures recomputation when elements change
   * - Element positions are in CANVAS coordinates (not affected by pan/zoom)
   *
   * This is passed to useDrag and useResize hooks for snap calculations.
   */
  const snapTargets = useMemo(() => {
    const { elements } = getActivePageCanvas()
    return elementsToSnapTargets(elements, selectedIds)
  }, [rootElements, selectedIds])

  // ========================================================================
  // HOVER STATE - Managed locally (not Redux) for performance
  // ========================================================================

  /**
   * Currently hovered element ID.
   *
   * WHY LOCAL STATE INSTEAD OF REDUX?
   * - Hover changes very frequently (every mouse move over elements)
   * - Redux dispatch for every hover would be excessive
   * - Hover is ephemeral UI state, not persistent data
   * - Local state is sufficient since only Canvas needs to know
   */
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null)

  /**
   * Get the ancestor chain for an element (from root to element).
   * Used to determine which element should show hover based on cycling rules.
   */
  const getAncestorChain = useCallback((elementId: string): string[] => {
    const chain: string[] = []
    let currentId: string | null = elementId

    while (currentId) {
      chain.unshift(currentId) // Add to front (root first)
      const { elements } = getActivePageCanvas()
      const el: CanvasElement | undefined = elements[currentId]
      currentId = el?.parentId ?? null
    }

    return chain
  }, [])

  /**
   * Handle hover start - determines which element should actually be highlighted.
   *
   * ============================================================================
   * HOVER LOGIC - MIRRORS SELECTION CYCLING
   * ============================================================================
   *
   * NORMAL HOVER (no modifier):
   * - Get the ancestor chain of the hovered element
   * - Highlight the ROOT ancestor (topmost parent)
   * - This matches what would be selected on normal click
   *
   * CMD/CTRL + HOVER:
   * - Highlight the directly hovered element
   * - This matches what would be selected on Cmd/Ctrl+click
   *
   * ============================================================================
   */
  const handleHoverStart = useCallback(
    (elementId: string, isModifierHeld: boolean) => {
      if (isModifierHeld) {
        // Direct hover - highlight the exact element being hovered
        setHoveredElementId(elementId)
      } else {
        // Cycling hover - highlight the root ancestor
        const ancestorChain = getAncestorChain(elementId)
        const rootAncestor = ancestorChain[0] // First element is the root
        setHoveredElementId(rootAncestor || elementId)
      }
    },
    [getAncestorChain]
  )

  /**
   * Handle hover end - clear hover state.
   */
  const handleHoverEnd = useCallback((_elementId: string) => {
    setHoveredElementId(null)
  }, [])

  // ========================================================================
  // SELECTOR HELPERS - Direct store access for hooks
  // ========================================================================

  // Scope delimiter for nested instance IDs
  const SCOPE_DELIMITER = '::'

  /**
   * Get element by ID from Redux store.
   * Uses direct store access for stable reference across renders.
   *
   * WHY DIRECT STORE ACCESS?
   * - Hooks need stable function references
   * - useSelector would cause re-renders
   * - store.getState() is synchronous and safe
   *
   * ============================================================================
   * SCOPED ID SUPPORT FOR NESTED COMPONENT INSTANCES
   * ============================================================================
   *
   * Scoped IDs have the format: `${parentInstanceId}::${nestedElementId}`
   * These represent nested component instances within composed components.
   *
   * When a scoped ID is passed:
   * 1. Parse to extract parent instance ID and nested element ID
   * 2. Get the parent component instance from canvas.elements
   * 3. Get the component definition from localComponents
   * 4. Find the nested element in the component's sourceTree
   * 5. Return a virtual element with the scoped ID
   *
   * This enables nested instances to be selected, dragged, and edited.
   */
  const getElementById = useCallback((id: string): CanvasElement | undefined => {
    const state = store.getState()
    const { elements } = getActivePageCanvas()

    // Check if this is a scoped ID (nested instance within composed component)
    if (id.includes(SCOPE_DELIMITER)) {
      // Parse the scoped ID: parentInstanceId::nestedElementId
      const [parentInstanceId, nestedElementId] = id.split(SCOPE_DELIMITER)

      // Get the parent component instance from canvas
      const parentInstance = elements[parentInstanceId]
      if (!parentInstance || parentInstance.type !== 'component') {
        console.warn(`[getElementById] Parent instance not found for scoped ID: ${id}`)
        return undefined
      }

      // Cast to ComponentInstanceElement to access componentId
      const parentTyped = parentInstance as ComponentInstanceType

      // Get the component definition from Redux state
      const componentDef = state.canvas.localComponents[parentTyped.componentId]
      if (!componentDef) {
        console.warn(`[getElementById] Component not found: ${parentTyped.componentId}`)
        return undefined
      }

      // Find the nested element in the component's sourceTree
      let nestedElement: CanvasElement | null = null

      if (componentDef.sourceTree.rootElement.id === nestedElementId) {
        nestedElement = componentDef.sourceTree.rootElement
      } else {
        nestedElement =
          componentDef.sourceTree.childElements.find(
            (el) => el.id === nestedElementId
          ) ?? null
      }

      if (!nestedElement) {
        console.warn(`[getElementById] Nested element not found in sourceTree: ${nestedElementId}`)
        return undefined
      }

      // Verify this is a component instance (only component instances have scoped IDs)
      if (nestedElement.type !== 'component') {
        console.warn(`[getElementById] Nested element is not a component: ${nestedElementId}`)
        return undefined
      }

      // Cast to ComponentInstanceElement
      const nestedInstance = nestedElement as ComponentInstanceType

      // Get prop values from parent's nestedPropValues (for independent customization)
      const nestedPropValues = parentTyped.nestedPropValues?.[nestedElementId] ?? {}

      // Create a virtual element with:
      // - Scoped ID for proper selection/updates
      // - parentId set to the parent instance (for correct ancestor chain)
      // - Merged propValues (sourceTree defaults + parent overrides)
      //
      // CRITICAL: parentId must be the parent instance ID, NOT the sourceTree parentId.
      // This ensures the ancestor chain logic works correctly for selection cycling.
      // The nested instance is conceptually a child of the parent component instance.
      const virtualElement: ComponentInstanceType = {
        ...nestedInstance,
        id: id, // Use scoped ID
        parentId: parentInstanceId, // Parent is the component instance containing this nested element
        propValues: {
          ...(nestedInstance.propValues ?? {}),
          ...nestedPropValues,
        },
        nestedPropValues: undefined, // Nested instances don't have their own nested values
      }

      return virtualElement
    }

    // Regular element - direct lookup
    return elements[id]
  }, [])

  /**
   * Get children of a parent from Redux store.
   * Uses direct store access for stable reference.
   */
  const getChildren = useCallback(
    (parentId: string | null): CanvasElement[] => {
      const { elements, childrenMap, rootIds } = getActivePageCanvas()

      // Get child IDs from the children map
      const childIds = parentId === null ? rootIds : childrenMap[parentId] || []

      // Map IDs to elements and sort by order
      return childIds
        .map((id) => elements[id])
        .filter(Boolean)
        .sort((a, b) => a.order - b.order)
    },
    []
  )

  // ========================================================================
  // INTERACTION HOOKS - Initialize all interaction handlers
  // ========================================================================

  /**
   * Drag hook - handles element dragging, sorting, and reparenting.
   *
   * CRITICAL: Uses REFS for 60fps performance.
   * Redux is updated ONLY when drag ends.
   *
   * activeBounds: Current bounds of dragged element (for alignment guides).
   */
  const { dragUI: _dragUI, activeBounds: dragActiveBounds, handleDragStart } = useDrag({
    canvasRef,
    getElementById,
    getChildren,
    snapTargets,
    snapEnabled: true,
  })

  /**
   * Resize hook - handles element resizing via corner/edge handles.
   *
   * CRITICAL: Uses REFS for 60fps performance.
   * Redux is updated ONLY when resize ends.
   *
   * activeBounds: Current bounds of resizing element (for alignment guides).
   */
  const { isResizing: _isResizing, activeBounds: resizeActiveBounds, handleResizeStart } = useResize({
    canvasRef,
    getElementById,
    snapTargets,
    snapEnabled: true,
  })

  /**
   * Frame creation hook - handles drawing new frames.
   *
   * CRITICAL: Uses REFS for 60fps performance.
   * Element is added to Redux ONLY when creation ends.
   *
   * activeBounds: Current bounds of frame being created (for alignment guides).
   */
  const { creationPreview, isCreating: _isCreating, activeBounds: creationActiveBounds, handleCanvasPointerDown } =
    useFrameCreation({
      canvasRef,
      snapTargets,
      snapEnabled: true,
    })

  /**
   * Text creation hook - handles creating text elements via single click.
   *
   * When in 'text' tool mode (T shortcut):
   * - Click anywhere on canvas background to create a text element
   * - Element is auto-selected and enters edit mode immediately
   * - Tool switches back to 'select' mode after creation
   *
   * autoEditElementId: Ref that signals which element should auto-enter
   * edit mode. TextElement components check this on mount.
   */
  const { handleTextCreationClick, autoEditElementId, justCreatedText } = useTextCreation({
    canvasRef,
  })

  /**
   * Pencil creation hook - handles freehand drawing on the canvas.
   *
   * When in 'pen' tool mode (P shortcut):
   * - Click and drag to draw a smooth SVG path
   * - Path is built from Catmull-Rom spline interpolation
   * - On release: element is created, selected, tool switches to 'select'
   *
   * drawingPreview: Live SVG path data for rendering the preview during draw.
   * handlePencilPointerDown: Pointer handler for pen tool interactions.
   */
  const { drawingPreview, isDrawing: _isPencilDrawing, isMultiStrokeActive: _isMultiStroke, handleCanvasPointerDown: handlePencilPointerDown } =
    usePencilCreation({ canvasRef })

  /**
   * Marquee selection hook - handles rubber band selection.
   *
   * CRITICAL: Uses REFS for 60fps performance.
   * Selection is committed to Redux ONLY when marquee ends.
   *
   * previewSelectedIds: Real-time preview of which elements are under
   * the marquee, used to show selection state during drag.
   *
   * justFinishedSelecting: Flag to prevent click handler from clearing
   * selection immediately after marquee completes.
   */
  const {
    isSelecting,
    justFinishedSelecting,
    marqueeBounds,
    previewSelectedIds,
    handleMarqueeStart,
  } = useMarqueeSelection({
    canvasRef,
    mode: 'intersect', // Select elements that touch the marquee, not just fully contained
  })

  /**
   * Group actions hook - handles multi-element operations.
   *
   * Provides:
   * - Keyboard shortcuts (Delete, Ctrl+C, Ctrl+V, etc.)
   * - Action execution (delete, copy, cut, paste, duplicate)
   * - Clipboard state management
   *
   * Actions are defined in action-registry.ts and can be extended.
   * See useGroupActions and action-registry for adding custom actions.
   */
  const { executeAction, clipboard, canExecute } = useGroupActions({
    canvasRef,
  })

  // ========================================================================
  // AUTO-SAVE HOOK - Persists canvas state to database
  // ========================================================================

  /**
   * Auto-save hook - saves canvas state to database on changes.
   *
   * FEATURES:
   * - Debounced saves (1.5 second after last change)
   * - Automatic retry on failure (up to 3 attempts)
   * - Error banner display (not toast) on persistent failures
   * - Saves everything: elements, viewport (pan/zoom), selection
   *
   * The hook subscribes to Redux store changes and persists
   * the ACTIVE page's canvas data to its corresponding Page in the database.
   *
   * Uses UPSERT: If the page exists, it updates. If not, it creates.
   * This allows creating new pages without a separate mutation.
   *
   * IMPORTANT: organizationId and websiteId must be provided.
   * domainId is optional - may be null when domain is deleted.
   */
  const { saveStatus, saveError, saveNow, clearError } = useAutoSave({
    organizationId: organizationId ?? '',
    websiteId,
    domainId, // Can be null if domain was deleted
    enabled: Boolean(organizationId && websiteId),
    debounceMs: 1500,
  })

  /**
   * ========================================================================
   * COMPONENT AUTO-SAVE - Syncs LocalComponent changes to database
   * ========================================================================
   *
   * When a master component (primary instance) is edited, or when any
   * component's sourceTree is modified via "Edit Component" mode, this
   * hook automatically syncs the changes to the database.
   *
   * KEY BEHAVIOR:
   * - Watches localComponents in Redux for changes
   * - Debounces saves to prevent rapid API calls
   * - Each component has independent debounce timers
   * - Updates sourceTree, exposedProps, and metadata
   */
  useComponentAutoSave({
    organizationId: organizationId ?? '',
    enabled: Boolean(organizationId),
    debounceMs: 1500,
  })

  /**
   * MASTER COMPONENT SYNC - Canvas elements → sourceTree
   *
   * When a master frame (a frame with `masterOfComponentId`) or its children
   * are edited on the canvas, this hook detects the changes and rebuilds
   * the component's sourceTree in Redux.
   *
   * The useComponentAutoSave hook then picks up the Redux change and
   * syncs it to the database.
   *
   * This enables the master component to be edited like a regular frame
   * while keeping all instances in sync.
   */
  useMasterComponentSync({
    enabled: true,
    debounceMs: 500,
  })

  // ========================================================================
  // IMAGE & BUTTON CREATION HANDLERS - Single-click creation
  // ========================================================================

  /**
   * Handle image creation - creates an image element at click position.
   *
   * BEHAVIOR (mirrors frame/text creation):
   * 1. Click anywhere on canvas background to create an image element
   * 2. Element is auto-selected after creation
   * 3. Tool switches back to 'select' mode (one-shot creation)
   *
   * This ensures consistent UX across all element creation tools.
   */
  const handleImageCreation = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()

      // Convert screen coordinates to canvas coordinates
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const canvasX = (screenX - viewport.panX) / viewport.zoom
      const canvasY = (screenY - viewport.panY) / viewport.zoom

      // Create new image element with default size
      const newImageElement: ImageElementType = {
        id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type: 'image',
        name: 'Image',
        x: canvasX,
        y: canvasY,
        width: DEFAULT_IMAGE_PROPS.width,
        height: DEFAULT_IMAGE_PROPS.height,
        parentId: null,
        order: rootElements.length,
        visible: DEFAULT_IMAGE_PROPS.visible,
        locked: DEFAULT_IMAGE_PROPS.locked,
        container: DEFAULT_IMAGE_PROPS.container,
        src: DEFAULT_IMAGE_PROPS.src,
        alt: DEFAULT_IMAGE_PROPS.alt,
        objectFit: DEFAULT_IMAGE_PROPS.objectFit,
        styles: { ...DEFAULT_IMAGE_STYLES },
      }

      // Add element to Redux, select it, and switch back to select mode
      dispatch(addElement(newImageElement))
      dispatch(setSelection(newImageElement.id))
      dispatch(setToolMode('select'))
    },
    [dispatch, viewport, rootElements.length]
  )

  /**
   * Handle button creation - creates a button element at click position.
   *
   * BEHAVIOR (mirrors frame/text creation):
   * 1. Click anywhere on canvas background to create a button element
   * 2. Element is auto-selected after creation
   * 3. Tool switches back to 'select' mode (one-shot creation)
   *
   * This ensures consistent UX across all element creation tools.
   */
  const handleButtonCreation = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()

      // Convert screen coordinates to canvas coordinates
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const canvasX = (screenX - viewport.panX) / viewport.zoom
      const canvasY = (screenY - viewport.panY) / viewport.zoom

      // Create new button element with auto-sizing enabled by default
      const newButtonElement: ButtonElementType = {
        id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type: 'button',
        name: 'Button',
        x: canvasX,
        y: canvasY,
        width: DEFAULT_BUTTON_PROPS.width,
        height: DEFAULT_BUTTON_PROPS.height,
        // Auto-size based on content (padding + text) by default
        autoWidth: DEFAULT_BUTTON_PROPS.autoWidth,
        autoHeight: DEFAULT_BUTTON_PROPS.autoHeight,
        parentId: null,
        order: rootElements.length,
        visible: DEFAULT_BUTTON_PROPS.visible,
        locked: DEFAULT_BUTTON_PROPS.locked,
        container: DEFAULT_BUTTON_PROPS.container,
        label: DEFAULT_BUTTON_PROPS.label,
        variant: DEFAULT_BUTTON_PROPS.variant,
        // Typography is now stored in styles (see DEFAULT_BUTTON_STYLES)
        styles: { ...DEFAULT_BUTTON_STYLES },
      }

      // Add element to Redux, select it, and switch back to select mode
      dispatch(addElement(newButtonElement))
      dispatch(setSelection(newButtonElement.id))
      dispatch(setToolMode('select'))
    },
    [dispatch, viewport, rootElements.length]
  )

  /**
   * Handle sticky note creation via toolbar tool mode.
   * Clicks on canvas → creates a sticky note at that position.
   * Same pattern as button/text creation handlers above.
   */
  const handleStickyNoteCreation = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()

      // Convert screen coordinates to canvas coordinates
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const canvasX = (screenX - viewport.panX) / viewport.zoom
      const canvasY = (screenY - viewport.panY) / viewport.zoom

      // Create new sticky note element with defaults
      const newStickyNoteElement: StickyNoteElementType = {
        id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type: 'sticky-note',
        name: 'Sticky Note',
        x: canvasX,
        y: canvasY,
        width: DEFAULT_STICKY_NOTE_PROPS.width,
        height: DEFAULT_STICKY_NOTE_PROPS.height,
        parentId: null,
        order: rootElements.length,
        visible: DEFAULT_STICKY_NOTE_PROPS.visible,
        locked: DEFAULT_STICKY_NOTE_PROPS.locked,
        container: DEFAULT_STICKY_NOTE_PROPS.container,
        content: DEFAULT_STICKY_NOTE_PROPS.content,
        noteColor: DEFAULT_STICKY_NOTE_PROPS.noteColor,
        textColor: DEFAULT_STICKY_NOTE_PROPS.textColor,
        autoHeight: DEFAULT_STICKY_NOTE_PROPS.autoHeight,
        autoWidth: DEFAULT_STICKY_NOTE_PROPS.autoWidth,
        styles: { ...DEFAULT_STICKY_NOTE_STYLES },
      }

      // Add element to Redux, select it, and switch back to select mode
      dispatch(addElement(newStickyNoteElement))
      dispatch(setSelection(newStickyNoteElement.id))
      dispatch(setToolMode('select'))
    },
    [dispatch, viewport, rootElements.length]
  )

  // ========================================================================
  // ACTIVE BOUNDS & ALIGNMENT GUIDES - For rulers and visual feedback
  // ========================================================================

  /**
   * Combined active bounds from drag, resize, or frame creation operations.
   * Used by Rulers component to render alignment guides.
   *
   * Priority: drag > resize > creation (only one can be active at a time)
   */
  const activeBounds: SnapBounds | null = dragActiveBounds || resizeActiveBounds || creationActiveBounds || null

  /**
   * Compute alignment guides based on active element and snap targets.
   *
   * These are the cyan lines that appear when elements align with each other.
   * Only computed when there's an active element being dragged/resized.
   */
  const alignmentGuides = useMemo(() => {
    if (!activeBounds || snapTargets.length === 0) return []

    const result = detectAlignments(activeBounds, snapTargets)
    return result.guides
  }, [activeBounds, snapTargets])

  // ========================================================================
  // RESIZE HANDLER - Wrapper to match expected signature
  // ========================================================================

  /**
   * Wrapper for resize start that includes element ID.
   */
  const onResizeStart = useCallback(
    (e: React.PointerEvent, elementId: string, handle: ResizeHandle) => {
      handleResizeStart(e, elementId, handle)
    },
    [handleResizeStart]
  )

  // ========================================================================
  // EVENT HANDLERS
  // ========================================================================

  /**
   * Handle canvas background pointer down - route to appropriate handler.
   *
   * This handles:
   * - Frame creation (when in 'frame' tool mode) - click-and-drag to draw
   * - Text creation (when in 'text' tool mode) - single click to create
   * - Image creation (when in 'image' tool mode) - single click to create
   * - Button creation (when in 'button' tool mode) - single click to create
   * - Marquee selection (when in 'select' tool mode) - click-and-drag to select
   */
  const handleCanvasBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to clicks on canvas background, not on elements
      const target = e.target as HTMLElement
      const isCanvasBackground =
        target === e.currentTarget ||
        target.hasAttribute('data-canvas-content')

      if (!isCanvasBackground) return

      // Skip tool actions when space key is held — the user wants to pan, not create.
      // The native pointerdown handler (handlePanPointerDown) handles panning instead.
      if (isSpaceHeldRef.current) return

      if (toolMode === 'frame' || toolMode === 'circle-frame') {
        // Frame/circle-frame creation mode - draw new frame via drag
        handleCanvasPointerDown(e)
      } else if (toolMode === 'text') {
        // Text creation mode - create text element at click position
        handleTextCreationClick(e)
      } else if (toolMode === 'image') {
        // Image creation mode - create image element at click position
        handleImageCreation(e)
      } else if (toolMode === 'button') {
        // Button creation mode - create button element at click position
        handleButtonCreation(e)
      } else if (toolMode === 'sticky-note') {
        // Sticky note creation mode - create sticky note at click position
        handleStickyNoteCreation(e)
      } else if (toolMode === 'pen') {
        // Pen/pencil creation mode - freehand drawing via click-and-drag
        handlePencilPointerDown(e)
      } else if (toolMode === 'select') {
        // Select mode - start marquee selection
        handleMarqueeStart(e)
      }
    },
    [toolMode, handleCanvasPointerDown, handleTextCreationClick, handleImageCreation, handleButtonCreation, handleStickyNoteCreation, handlePencilPointerDown, handleMarqueeStart]
  )

  /**
   * Handle canvas background click - deselect element.
   *
   * IMPORTANT: This handler must check multiple flags to avoid race conditions:
   * - justFinishedSelecting: Prevents clearing after marquee selection
   * - justCreatedText: Prevents clearing after text element creation
   *
   * Both flags follow the same pattern: they're set on pointerdown/pointerup
   * and cleared after a short delay, blocking the click event that follows.
   */
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        // Don't clear selection if we just finished a marquee, created text,
        // or are in space-pan mode (space key held or just released mid-pan)
        if (!isSelecting && !justFinishedSelecting && !justCreatedText && !isSpaceHeldRef.current) {
          dispatch(clearSelection())
        }
      }
    },
    [dispatch, isSelecting, justFinishedSelecting, justCreatedText]
  )

  /**
   * Handle wheel event for pan and zoom.
   *
   * Controls:
   * - Ctrl/Cmd + wheel = zoom (cursor-centered)
   * - Shift + wheel = horizontal pan (for mouse users without trackpad)
   * - Plain wheel = vertical + horizontal pan (trackpad two-finger scroll)
   *
   * Mouse wheels only generate deltaY (no deltaX), so Shift+wheel swaps
   * deltaY into horizontal movement. Trackpads generate both deltaX and
   * deltaY naturally, so they work without Shift.
   */
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        /** Ctrl/Cmd + wheel = zoom toward cursor position */
        const zoomFactor = 1 - e.deltaY * 0.002
        const newZoom = Math.max(0.1, Math.min(3, viewport.zoom * zoomFactor))

        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const cursorX = e.clientX - rect.left
          const cursorY = e.clientY - rect.top

          /** Adjust pan to keep cursor position stable under the pointer */
          const scale = newZoom / viewport.zoom
          const newPanX = cursorX - (cursorX - viewport.panX) * scale
          const newPanY = cursorY - (cursorY - viewport.panY) * scale

          dispatch(
            setViewport({
              panX: newPanX,
              panY: newPanY,
              zoom: newZoom,
            })
          )
        }
      } else if (e.shiftKey) {
        /**
         * Shift + wheel = horizontal pan.
         * Mouse wheels only produce deltaY, so Shift swaps it to horizontal.
         * This is the standard pattern used by Figma, Canva, and other canvas tools.
         */
        dispatch(
          setViewport({
            ...viewport,
            panX: viewport.panX - e.deltaY,
            panY: viewport.panY - e.deltaX,
          })
        )
      } else {
        /**
         * Plain wheel = pan using both axes.
         * Trackpads: deltaX (horizontal) + deltaY (vertical) for two-finger scroll.
         * Mouse: deltaX is 0, so only vertical panning occurs — use Shift for horizontal.
         */
        dispatch(
          setViewport({
            ...viewport,
            panX: viewport.panX - e.deltaX,
            panY: viewport.panY - e.deltaY,
          })
        )
      }
    },
    [dispatch, viewport]
  )

  // ========================================================================
  // PAN DRAG HANDLERS - Middle mouse button + Space+click panning
  // ========================================================================

  /**
   * Start a pan drag operation.
   * Triggered by: middle mouse button down, OR left click while space is held.
   * Records the initial mouse position and sets the dragging flag.
   */
  const handlePanPointerDown = useCallback(
    (e: PointerEvent) => {
      // Middle mouse button (button === 1) always starts panning
      const isMiddleClick = e.button === 1
      // Left click (button === 0) while space is held = Figma-style pan
      const isSpacePan = e.button === 0 && isSpaceHeldRef.current

      if (!isMiddleClick && !isSpacePan) return

      e.preventDefault()
      e.stopPropagation()

      isPanDraggingRef.current = true
      panLastPositionRef.current = { x: e.clientX, y: e.clientY }
      setPanCursor('grabbing')

      // Capture pointer so we get move/up events even outside canvas bounds
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    []
  )

  /**
   * Update pan position during a drag operation.
   * Calculates the delta from the last position and applies it to the viewport.
   * Only fires when isPanDraggingRef is true.
   */
  const handlePanPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isPanDraggingRef.current || !panLastPositionRef.current) return

      // Calculate how far the mouse moved since last event
      const deltaX = e.clientX - panLastPositionRef.current.x
      const deltaY = e.clientY - panLastPositionRef.current.y

      // Update stored position for next frame's delta calculation
      panLastPositionRef.current = { x: e.clientX, y: e.clientY }

      // Apply the delta directly to viewport pan (1:1 screen-pixel movement)
      dispatch(
        setViewport({
          panX: viewport.panX + deltaX,
          panY: viewport.panY + deltaY,
        })
      )
    },
    [dispatch, viewport]
  )

  /**
   * End a pan drag operation.
   * Resets dragging state and restores the cursor.
   */
  const handlePanPointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isPanDraggingRef.current) return

      isPanDraggingRef.current = false
      panLastPositionRef.current = null

      // Release pointer capture
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

      // Restore cursor: 'grab' if space still held, otherwise null (default)
      setPanCursor(isSpaceHeldRef.current ? 'grab' : null)
    },
    []
  )

  // ========================================================================
  // KEYBOARD LISTENERS - Space key for pan mode
  // ========================================================================

  /**
   * Attach keydown/keyup listeners for space bar pan mode.
   *
   * When the user holds the space bar, the cursor changes to 'grab' to indicate
   * that clicking and dragging will pan the canvas (like Figma, Photoshop, etc.).
   *
   * We skip activation when the user is typing in an input/textarea/contenteditable
   * to avoid interfering with text editing.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only activate on space key, and only if not already held (prevents repeat)
      if (e.code !== 'Space' || isSpaceHeldRef.current) return

      // Don't activate pan mode when typing in inputs or text editing areas
      const target = e.target as HTMLElement
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (isEditable) return

      // Prevent space bar from scrolling the page
      e.preventDefault()

      isSpaceHeldRef.current = true
      // Only show grab cursor if we're not already dragging
      if (!isPanDraggingRef.current) {
        setPanCursor('grab')
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return

      isSpaceHeldRef.current = false

      // Only reset cursor if we're not in the middle of a pan drag
      if (!isPanDraggingRef.current) {
        setPanCursor(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // ========================================================================
  // ATTACH PAN POINTER LISTENERS - Must be native for pointer capture
  // ========================================================================

  /**
   * Attach pointer event listeners for middle-mouse and space+click panning.
   *
   * WHY NATIVE LISTENERS (not React events):
   * - We need setPointerCapture/releasePointerCapture for smooth dragging
   *   even when the cursor leaves the canvas boundary.
   * - The pointerdown handler needs to intercept middle-click before other
   *   handlers (like browser auto-scroll) can consume it.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.addEventListener('pointerdown', handlePanPointerDown)
    canvas.addEventListener('pointermove', handlePanPointerMove)
    canvas.addEventListener('pointerup', handlePanPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', handlePanPointerDown)
      canvas.removeEventListener('pointermove', handlePanPointerMove)
      canvas.removeEventListener('pointerup', handlePanPointerUp)
    }
  }, [handlePanPointerDown, handlePanPointerMove, handlePanPointerUp])

  /**
   * Handle drag over canvas - required to enable drop.
   *
   * WHY: By default, elements are not valid drop targets.
   * We must call preventDefault() on dragover to signal that drops are allowed.
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Set drop effect to 'copy' to show the correct cursor
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  /**
   * Handle drop on canvas - create new element from sidebar drag.
   *
   * FLOW:
   * 1. Parse drag data to get element type and variant
   * 2. Calculate drop position in canvas coordinates (account for pan/zoom)
   * 3. Create new frame element with default size (200x150)
   * 4. Apply variant-specific styles (e.g., flexDirection for 'frame-h')
   * 5. Dispatch addElement action to add to Redux store
   *
   * POSITION CALCULATION:
   * - Get drop position in screen coordinates (e.clientX, e.clientY)
   * - Convert to canvas coordinates by reversing the viewport transform:
   *   canvasX = (screenX - panX) / zoom
   *   canvasY = (screenY - panY) / zoom
   */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()

      // Get canvas container bounds for coordinate conversion
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()

      // Convert screen coordinates to canvas coordinates
      // Account for viewport pan and zoom transformation
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const canvasX = (screenX - viewport.panX) / viewport.zoom
      const canvasY = (screenY - viewport.panY) / viewport.zoom

      // ========================================================================
      // DETECT DROP TARGET - Check if dropping onto a frame
      // ========================================================================
      /**
       * Find the frame element under the drop point.
       * This allows dropping elements INTO frames, not just at root level.
       *
       * Uses `elementsFromPoint` to find all elements at the drop location,
       * then looks for the first one with `data-frame-id` attribute.
       *
       * Returns null if not over a frame (drop to root level).
       */
      const findDropTarget = (): string | null => {
        const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY)
        for (const el of elementsAtPoint) {
          // Skip the canvas container itself
          if (el === canvas) continue
          // Find closest frame element
          const frameEl = el.closest('[data-frame-id]') as HTMLElement | null
          if (frameEl) {
            return frameEl.dataset.frameId || null
          }
        }
        return null
      }

      const dropTargetId = findDropTarget()
      const { childrenMap } = getActivePageCanvas()

      /**
       * SMART AUTO-WIDTH: When dropping INTO a frame, enable autoWidth by default.
       * This makes elements responsive to their parent container automatically.
       *
       * When dropping on canvas (root level), keep fixed width to prevent collapse.
       * AutoWidth only applies when element has a parent, so this is safe.
       */
      const shouldAutoWidth = dropTargetId !== null

      /**
       * Get the order for a new child element in the drop target.
       * If dropping into a frame, count existing children. Otherwise use root count.
       */
      const getChildOrder = (): number => {
        if (dropTargetId) {
          const siblingIds = childrenMap[dropTargetId] || []
          return siblingIds.length
        }
        return rootElements.length
      }

      // ========================================================================
      // Handle STAGED AI ELEMENT drops (from AI Staging Panel)
      // ========================================================================
      /**
       * When the user drags a staging group from the AI staging panel,
       * transfer all elements from the staging slice to the page canvas.
       * Root elements get re-parented to the drop target (or page element),
       * while internal child elements keep their hierarchy intact.
       */
      const stagedData = e.dataTransfer.getData('application/x-staged-elements')
      if (stagedData) {
        try {
          const { groupId } = JSON.parse(stagedData) as {
            groupId: string
            elementIds: string[]
          }

          /** Look up the staging group from the Redux store */
          const currentState = store.getState()
          const group = selectStagingGroupById(currentState, groupId)
          if (!group) {
            console.error(`[Canvas] Staging group not found: ${groupId}`)
            return
          }

          /**
           * Transfer elements to the page canvas. Strategy:
           * - Root elements (in group.rootIds) get re-parented to dropTargetId
           *   (or page element if dropped on open canvas) with position at drop point
           * - Child elements keep their parentId (referencing their parent within
           *   the group, which is also being transferred)
           * - Process parents before children to avoid orphan errors
           */
          /**
           * Use the page element from the active page canvas.
           * Read from store directly to avoid stale closure issues.
           */
          const { elements: pageElements } = getActivePageCanvas()
          const pageElementEntry = Object.values(pageElements).find((el) => el.type === 'page')
          const parentTarget = dropTargetId ?? pageElementEntry?.id ?? null
          const elements = Object.values(group.elements)

          /**
           * Sort by hierarchy depth — BFS from roots so parents are added
           * before their children (required for childrenMap rebuild).
           */
          const sortedElements = sortStagedElementsByDepth(elements, group.rootIds)
          let orderOffset = getChildOrder()

          for (const element of sortedElements) {
            const isRoot = group.rootIds.includes(element.id)

            if (isRoot) {
              /**
               * Re-parent root elements to the drop target.
               * Spread preserves the element's discriminated union type
               * because we're only overriding common base properties.
               */
              dispatch(addElement({
                ...element,
                parentId: parentTarget,
                x: parentTarget ? 0 : canvasX,
                y: parentTarget ? 0 : canvasY,
                order: orderOffset++,
              } as CanvasElement))
            } else {
              dispatch(addElement(element))
            }
          }

          /** Select the first root element after transfer */
          if (group.rootIds.length > 0) {
            dispatch(setSelection(group.rootIds[0]))
          }

          /** Clean up the staging group */
          dispatch(removeStagingGroup(groupId))
        } catch (error) {
          console.error('[Canvas] Failed to parse staged element data:', error)
        }
        return
      }

      // ========================================================================
      // Handle LOCAL COMPONENT drops (from Components sidebar panel)
      // ========================================================================
      const componentId = e.dataTransfer.getData('application/x-local-component')
      if (componentId) {
        // Get the component definition from Redux store
        const state = store.getState()
        const component = selectLocalComponentById(state, componentId)

        if (!component) {
          console.error(`[Canvas] Component not found: ${componentId}`)
          return
        }

        // Create a component instance on the canvas
        const instance = createComponentInstance({
          component,
          x: canvasX,
          y: canvasY,
          parentId: dropTargetId, // Drop into frame or root
          order: getChildOrder(),
        })

        // Add the instance to the canvas and select it
        dispatch(addElement(instance))
        dispatch(setSelection(instance.id))
        return
      }

      // ========================================================================
      // Handle regular element drops (from Insert sidebar panel)
      // ========================================================================
      const dragDataString = e.dataTransfer.getData('application/json')
      if (!dragDataString) return

      try {
        const dragData = JSON.parse(dragDataString) as {
          elementType: string
          variant: string
        }

        // Handle TEXT element drops
        if (dragData.elementType === 'text') {
          // Default size for new text elements
          const DEFAULT_TEXT_WIDTH = 200
          const DEFAULT_TEXT_HEIGHT = 40

          // Create new text element
          // autoWidth is set based on drop target - fills parent when inside a frame
          const newTextElement: TextElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'text',
            name: 'Text',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_TEXT_WIDTH,
            height: DEFAULT_TEXT_HEIGHT,
            parentId: dropTargetId, // Drop into frame or root
            order: getChildOrder(),
            visible: DEFAULT_TEXT_PROPS.visible,
            locked: DEFAULT_TEXT_PROPS.locked,
            container: DEFAULT_TEXT_PROPS.container,
            content: DEFAULT_TEXT_PROPS.content,
            autoHeight: DEFAULT_TEXT_PROPS.autoHeight,
            autoWidth: shouldAutoWidth, // Smart: true when inside frame, false on canvas
            // Typography is now stored in styles (see DEFAULT_TEXT_STYLES)
            styles: { ...DEFAULT_TEXT_STYLES },
          }

          dispatch(addElement(newTextElement))
          dispatch(setSelection(newTextElement.id))
          return
        }

        // Handle IMAGE element drops
        if (dragData.elementType === 'image') {
          // Create new image element
          // autoWidth is set based on drop target - fills parent when inside a frame
          const newImageElement: ImageElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'image',
            name: 'Image',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_IMAGE_PROPS.width,
            height: DEFAULT_IMAGE_PROPS.height,
            parentId: dropTargetId, // Drop into frame or root
            order: getChildOrder(),
            visible: DEFAULT_IMAGE_PROPS.visible,
            locked: DEFAULT_IMAGE_PROPS.locked,
            container: DEFAULT_IMAGE_PROPS.container,
            src: DEFAULT_IMAGE_PROPS.src,
            alt: DEFAULT_IMAGE_PROPS.alt,
            objectFit: DEFAULT_IMAGE_PROPS.objectFit,
            autoWidth: shouldAutoWidth, // Smart: true when inside frame, false on canvas
            styles: { ...DEFAULT_IMAGE_STYLES },
          }

          dispatch(addElement(newImageElement))
          dispatch(setSelection(newImageElement.id))
          return
        }

        // Handle VIDEO element drops
        if (dragData.elementType === 'video') {
          // Create new video element with default storage source
          // autoWidth is set based on drop target - fills parent when inside a frame
          const newVideoElement: VideoElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'video',
            name: 'Video',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_VIDEO_PROPS.width,
            height: DEFAULT_VIDEO_PROPS.height,
            parentId: dropTargetId, // Drop into frame or root
            order: getChildOrder(),
            visible: DEFAULT_VIDEO_PROPS.visible,
            locked: DEFAULT_VIDEO_PROPS.locked,
            container: DEFAULT_VIDEO_PROPS.container,
            sourceType: DEFAULT_VIDEO_PROPS.sourceType,
            src: DEFAULT_VIDEO_PROPS.src,
            poster: DEFAULT_VIDEO_PROPS.poster,
            loomUrl: DEFAULT_VIDEO_PROPS.loomUrl,
            alt: DEFAULT_VIDEO_PROPS.alt,
            objectFit: DEFAULT_VIDEO_PROPS.objectFit,
            posterFit: DEFAULT_VIDEO_PROPS.posterFit,
            autoWidth: shouldAutoWidth, // Smart: true when inside frame, false on canvas
            controls: DEFAULT_VIDEO_PROPS.controls,
            autoplay: DEFAULT_VIDEO_PROPS.autoplay,
            loop: DEFAULT_VIDEO_PROPS.loop,
            muted: DEFAULT_VIDEO_PROPS.muted,
            styles: { ...DEFAULT_VIDEO_STYLES },
          }

          dispatch(addElement(newVideoElement))
          dispatch(setSelection(newVideoElement.id))
          return
        }

        // Handle BUTTON element drops
        if (dragData.elementType === 'button') {
          // Create new button element with auto-sizing enabled by default
          const newButtonElement: ButtonElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'button',
            name: 'Button',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_BUTTON_PROPS.width,
            height: DEFAULT_BUTTON_PROPS.height,
            // Auto-size based on content (padding + text) by default
            autoWidth: DEFAULT_BUTTON_PROPS.autoWidth,
            autoHeight: DEFAULT_BUTTON_PROPS.autoHeight,
            parentId: dropTargetId, // Drop into frame or root
            order: getChildOrder(),
            visible: DEFAULT_BUTTON_PROPS.visible,
            locked: DEFAULT_BUTTON_PROPS.locked,
            container: DEFAULT_BUTTON_PROPS.container,
            label: DEFAULT_BUTTON_PROPS.label,
            variant: DEFAULT_BUTTON_PROPS.variant,
            // Typography is now stored in styles (see DEFAULT_BUTTON_STYLES)
            styles: { ...DEFAULT_BUTTON_STYLES },
          }

          dispatch(addElement(newButtonElement))
          dispatch(setSelection(newButtonElement.id))
          return
        }

        // Handle FORM element drops
        if (dragData.elementType === 'form') {
          // Create new form element - user will select a form in Settings tab
          // autoWidth is set based on drop target - fills parent when inside a frame
          // autoHeight is ALWAYS true - forms should never have fixed height
          const newFormElement: FormElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'form',
            name: 'Form',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_FORM_PROPS.width,
            height: DEFAULT_FORM_PROPS.height,
            parentId: dropTargetId, // Drop into frame or root
            order: getChildOrder(),
            visible: DEFAULT_FORM_PROPS.visible,
            locked: DEFAULT_FORM_PROPS.locked,
            container: DEFAULT_FORM_PROPS.container,
            formId: DEFAULT_FORM_PROPS.formId,
            formName: DEFAULT_FORM_PROPS.formName,
            formSlug: DEFAULT_FORM_PROPS.formSlug,
            autoWidth: shouldAutoWidth, // Smart: true when inside frame, false on canvas
            autoHeight: true, // Forms ALWAYS use auto height to fit content
            styles: { ...DEFAULT_FORM_STYLES },
          }

          dispatch(addElement(newFormElement))
          dispatch(setSelection(newFormElement.id))
          return
        }

        // Handle PAYMENT element drops
        if (dragData.elementType === 'payment') {
          // Create new payment element - user will select a product/price in Settings tab
          // autoWidth is set based on drop target - fills parent when inside a frame
          // autoHeight is ALWAYS true - payment forms should never have fixed height
          const newPaymentElement: PaymentElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'payment',
            name: 'Payment',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_PAYMENT_PROPS.width,
            height: DEFAULT_PAYMENT_PROPS.height,
            parentId: dropTargetId, // Drop into frame or root
            order: getChildOrder(),
            visible: DEFAULT_PAYMENT_PROPS.visible,
            locked: DEFAULT_PAYMENT_PROPS.locked,
            container: DEFAULT_PAYMENT_PROPS.container,
            productId: DEFAULT_PAYMENT_PROPS.productId,
            priceId: DEFAULT_PAYMENT_PROPS.priceId,
            productName: DEFAULT_PAYMENT_PROPS.productName,
            priceName: DEFAULT_PAYMENT_PROPS.priceName,
            autoWidth: shouldAutoWidth, // Smart: true when inside frame, false on canvas
            autoHeight: true, // Payment forms ALWAYS use auto height to fit content
            theme: DEFAULT_PAYMENT_PROPS.theme, // Default theme for payment form
            /** Spread default styles + editable border config (private __borderConfig extension) */
            styles: {
              ...DEFAULT_PAYMENT_STYLES,
              __borderConfig: createUniformBorderConfig('solid', 1, '#27272a'),
            } as unknown as PaymentElementType['styles'],
          }

          dispatch(addElement(newPaymentElement))
          dispatch(setSelection(newPaymentElement.id))
          return
        }

        // Handle PREBUILT element drops
        if (dragData.elementType === 'prebuilt') {
          // PreBuilt drag data has prebuiltType and variantId
          const prebuiltData = dragData as unknown as {
            prebuiltType: PreBuiltType
            variantId: string
          }
          const { prebuiltType, variantId } = prebuiltData

          // Get the definition and variant from registry
          const definition = getPreBuiltDefinition(prebuiltType)
          const variant = getPreBuiltVariant(prebuiltType, variantId)

          if (!definition || !variant) {
            console.error('PreBuilt definition or variant not found:', prebuiltType, variantId)
            return
          }

          // Merge default settings from definition with variant-specific overrides
          const mergedSettings = {
            ...definition.defaultSettings,
            ...variant.defaultSettings,
          }

          // Create the PreBuilt element based on type
          if (prebuiltType === 'prebuilt-navbar') {
            // Cast to NavbarSettings for type safety in navbar block
            const navbarSettings = mergedSettings as NavbarSettings

            /**
             * Auto-populate navbar links with existing website pages.
             * This gives users a head start - they can modify/remove links as needed.
             * Each link is connected to an internal page via pageId.
             */
            const autoPopulatedLinks: NavbarLink[] = pageInfos.map((page) => ({
              id: generateLinkId(),
              label: page.name,
              href: page.slug,
              pageId: page.id,
            }))

            /**
             * Merge settings with auto-populated links.
             * The links from the variant settings are replaced with page-based links.
             */
            const settingsWithLinks: NavbarSettings = {
              ...navbarSettings,
              links: autoPopulatedLinks.length > 0
                ? autoPopulatedLinks
                : navbarSettings.links, // Fall back to default links if no pages exist
            }

            /**
             * Use the drop target for parenting — if dropped inside a page/frame
             * the navbar becomes a child and fills the parent width. If dropped
             * on empty canvas, it stays root-level with fixed pixel width.
             */
            const newNavbarElement: PreBuiltNavbarElement = {
              id: generatePreBuiltId(),
              type: 'prebuilt',
              prebuiltType: 'prebuilt-navbar',
              variant: variantId,
              name: variant.label,
              x: shouldAutoWidth ? 0 : canvasX,
              y: shouldAutoWidth ? 0 : canvasY,
              width: variant.defaultWidth,
              height: variant.defaultHeight,
              parentId: dropTargetId,
              order: getChildOrder(),
              visible: true,
              locked: false,
              autoWidth: shouldAutoWidth,
              styles: { ...variant.defaultStyles },
              settings: settingsWithLinks,
            }

            dispatch(addElement(newNavbarElement))
            dispatch(setSelection(newNavbarElement.id))
          }

          // Create sidebar PreBuilt element
          if (prebuiltType === 'prebuilt-sidebar') {
            /**
             * Auto-populate sidebar links with existing website pages.
             * This gives users a head start - they can modify/remove links as needed.
             * Each link is connected to an internal page via pageId.
             */
            const autoPopulatedLinks: SidebarLink[] = pageInfos.slice(0, 5).map((page, index) => {
              // Assign icons based on index for variety
              const icons = ['home', 'folder', 'users', 'bar-chart', 'settings']
              return {
                id: generateSidebarLinkId(),
                label: page.name,
                href: page.slug,
                pageId: page.id,
                icon: icons[index % icons.length],
              }
            })

            /**
             * Merge settings with auto-populated links.
             * The links from the variant settings are replaced with page-based links.
             */
            const settingsWithLinks: SidebarSettings = {
              ...DEFAULT_SIDEBAR_SETTINGS,
              ...mergedSettings,
              links: autoPopulatedLinks.length > 0
                ? autoPopulatedLinks
                : (mergedSettings as SidebarSettings).links || DEFAULT_SIDEBAR_SETTINGS.links,
            }

            // Generate unique IDs for sidebar and its inset frame
            const sidebarId = generatePreBuiltId()
            const insetFrameId = `inset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

            /**
             * Use the drop target for parenting — if dropped inside a page/frame
             * the sidebar becomes a child and fills the parent via flex.
             * If dropped on empty canvas, it stays root-level with fixed pixel size.
             */
            const newSidebarElement: PreBuiltSidebarElement = {
              id: sidebarId,
              type: 'prebuilt',
              prebuiltType: 'prebuilt-sidebar',
              variant: variantId,
              name: variant.label,
              x: shouldAutoWidth ? 0 : canvasX,
              y: shouldAutoWidth ? 0 : canvasY,
              width: variant.defaultWidth,
              height: variant.defaultHeight,
              parentId: dropTargetId,
              order: getChildOrder(),
              visible: true,
              locked: false,
              autoWidth: shouldAutoWidth,
              styles: { ...variant.defaultStyles },
              settings: settingsWithLinks,
              insetFrameId,
            }

            /**
             * Create the inset frame as a child of the sidebar.
             * This frame is a real, selectable FrameElement that users can:
             * - Select and style (background, padding, flex properties, etc.)
             * - Drop other elements into
             * - Apply container mode to
             *
             * The frame uses the insetFrameId and has the sidebar as its parent.
             * It fills the inset area using:
             * - autoWidth: true (100% width)
             * - alignSelf: 'stretch' (fills parent height in flex container)
             * - flex: 1 to fill remaining space in the parent
             *
             * BUG FIX: Previously used height: 9999 which caused issues when
             * flexWrap was enabled. Now uses a reasonable default height with
             * flex: 1 to properly fill the parent container.
             */
            const insetFrame: FrameElementType = {
              id: insetFrameId,
              type: 'frame',
              name: 'Sidebar Content',
              // Position doesn't matter - it's a flex child
              x: 0,
              y: 0,
              // Match parent sidebar dimensions — flex: 1 stretches to fill
              width: 100,
              height: variant.defaultHeight, // Match sidebar height exactly
              // Parent is the sidebar
              parentId: sidebarId,
              order: 0,
              visible: true,
              locked: false,
              // Use autoWidth so it fills the inset area horizontally
              autoWidth: true,
              // Enable container mode by default for nice content centering
              container: false,
              styles: {
                ...DEFAULT_FRAME_STYLES,
                // Use the inset background color from sidebar settings
                backgroundColor: settingsWithLinks.inset?.backgroundColor || '#f5f5f5',
                // Column layout for content
                flexDirection: 'column',
                // Stretch to fill parent height (sidebar inset is a flex container)
                alignSelf: 'stretch',
                // Fill remaining space in parent flex container
                flex: 1,
                // Wrap enables auto-height on the frame wrapper (height: auto)
                // Combined with minHeight, the inset retains sidebar height and grows with content
                flexWrap: 'wrap',
                // Retain sidebar height as minimum — grows with content
                minHeight: variant.defaultHeight,
                // Some default padding
                paddingTop: 16,
                paddingRight: 16,
                paddingBottom: 16,
                paddingLeft: 16,
              },
            }

            // Add both elements - sidebar first, then inset frame
            dispatch(addElement(newSidebarElement))
            dispatch(addElement(insetFrame))
            dispatch(setSelection(newSidebarElement.id))
          }

          // ================================================================
          // Handle TOTAL MEMBERS PreBuilt drops
          // ================================================================
          if (prebuiltType === 'prebuilt-total-members') {
            // Merge default settings with variant-specific settings
            const totalMembersSettings: TotalMembersSettings = {
              ...DEFAULT_TOTAL_MEMBERS_SETTINGS,
              ...mergedSettings,
            }

            const newTotalMembersElement: PreBuiltTotalMembersElement = {
              id: generatePreBuiltId(),
              type: 'prebuilt',
              prebuiltType: 'prebuilt-total-members',
              variant: variantId,
              name: variant.label,
              x: shouldAutoWidth ? 0 : canvasX,
              y: shouldAutoWidth ? 0 : canvasY,
              width: variant.defaultWidth,
              height: variant.defaultHeight,
              parentId: dropTargetId,
              order: getChildOrder(),
              visible: true,
              locked: false,
              autoWidth: shouldAutoWidth,
              styles: { ...variant.defaultStyles },
              settings: totalMembersSettings,
            }

            dispatch(addElement(newTotalMembersElement))
            dispatch(setSelection(newTotalMembersElement.id))
          }

          // ================================================================
          // Handle LOGO CAROUSEL PreBuilt drops
          // ================================================================
          if (prebuiltType === 'prebuilt-logo-carousel') {
            /** Merge default settings with variant-specific overrides */
            const logoCarouselSettings: LogoCarouselSettings = {
              ...DEFAULT_LOGO_CAROUSEL_SETTINGS,
              ...mergedSettings,
            }

            const newLogoCarouselElement: PreBuiltLogoCarouselElement = {
              id: generatePreBuiltId(),
              type: 'prebuilt',
              prebuiltType: 'prebuilt-logo-carousel',
              variant: variantId,
              name: variant.label,
              x: shouldAutoWidth ? 0 : canvasX,
              y: shouldAutoWidth ? 0 : canvasY,
              width: variant.defaultWidth,
              height: variant.defaultHeight,
              parentId: dropTargetId,
              order: getChildOrder(),
              visible: true,
              locked: false,
              autoWidth: shouldAutoWidth,
              styles: { ...variant.defaultStyles },
              settings: logoCarouselSettings,
              /** Mobile: fill screen width automatically */
              responsiveSettings: {
                mobile: {
                  autoWidth: true,
                },
              },
            }

            dispatch(addElement(newLogoCarouselElement))
            dispatch(setSelection(newLogoCarouselElement.id))
          }

          return
        }

        // Handle SMARTCMS LIST element drops
        if (dragData.elementType === 'smartcms-list') {
          // Default size for new SmartCMS List elements
          const DEFAULT_WIDTH = 400
          const DEFAULT_HEIGHT = 300

          // Create new SmartCMS List element
          // autoWidth is set based on drop target - fills parent when inside a frame
          const newSmartCmsListElement: SmartCmsListElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'smartcms-list',
            name: 'CMS List',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            parentId: dropTargetId,
            order: rootElements.length,
            ...DEFAULT_SMARTCMS_LIST_PROPS,
            autoWidth: shouldAutoWidth, // Smart: true when inside frame, false on canvas
            styles: { ...DEFAULT_SMARTCMS_LIST_STYLES },
          }

          dispatch(addElement(newSmartCmsListElement))
          dispatch(setSelection(newSmartCmsListElement.id))
          return
        }

        // Handle ADD TO CART BUTTON element drops
        if (dragData.elementType === 'add-to-cart-button') {
          // Create new Add to Cart button element
          const newAddToCartElement: AddToCartButtonElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'add-to-cart-button',
            name: 'Add to Cart',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_ADD_TO_CART_BUTTON_PROPS.width,
            height: DEFAULT_ADD_TO_CART_BUTTON_PROPS.height,
            parentId: dropTargetId,
            order: rootElements.length,
            visible: true,
            locked: false,
            container: false,
            autoWidth: shouldAutoWidth, // Smart: true when inside frame, false on canvas
            label: DEFAULT_ADD_TO_CART_BUTTON_PROPS.label,
            variant: DEFAULT_ADD_TO_CART_BUTTON_PROPS.variant,
            styles: { ...DEFAULT_ADD_TO_CART_BUTTON_STYLES },
          }

          dispatch(addElement(newAddToCartElement))
          dispatch(setSelection(newAddToCartElement.id))
          return
        }

        // Handle CHECKOUT element drops
        if (dragData.elementType === 'checkout') {
          // Create new Checkout element
          const newCheckoutElement: CheckoutElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'checkout',
            name: 'Checkout',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_CHECKOUT_PROPS.width,
            height: DEFAULT_CHECKOUT_PROPS.height,
            parentId: dropTargetId,
            order: rootElements.length,
            visible: true,
            locked: false,
            container: false,
            autoWidth: DEFAULT_CHECKOUT_PROPS.autoWidth,
            autoHeight: DEFAULT_CHECKOUT_PROPS.autoHeight,
            theme: DEFAULT_CHECKOUT_PROPS.theme,
            showCartSummary: DEFAULT_CHECKOUT_PROPS.showCartSummary,
            allowQuantityChange: DEFAULT_CHECKOUT_PROPS.allowQuantityChange,
            cartHeading: DEFAULT_CHECKOUT_PROPS.cartHeading,
            paymentHeading: DEFAULT_CHECKOUT_PROPS.paymentHeading,
            payButtonText: DEFAULT_CHECKOUT_PROPS.payButtonText,
            emptyCartMessage: DEFAULT_CHECKOUT_PROPS.emptyCartMessage,
            /** Spread default styles + editable border config (private __borderConfig extension) */
            styles: {
              __borderConfig: createUniformBorderConfig('solid', 1, '#27272a'),
            } as unknown as CheckoutElementType['styles'],
          }

          dispatch(addElement(newCheckoutElement))
          dispatch(setSelection(newCheckoutElement.id))
          return
        }

        // Handle RECEIPT element drops
        if (dragData.elementType === 'receipt') {
          /** Create a receipt element with default sizing, autoHeight, and theme */
          const newReceiptElement: ReceiptElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'receipt',
            name: 'Receipt',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_RECEIPT_PROPS.width,
            height: DEFAULT_RECEIPT_PROPS.height,
            parentId: dropTargetId,
            order: rootElements.length,
            visible: DEFAULT_RECEIPT_PROPS.visible,
            locked: DEFAULT_RECEIPT_PROPS.locked,
            container: DEFAULT_RECEIPT_PROPS.container,
            autoWidth: shouldAutoWidth,
            theme: DEFAULT_RECEIPT_PROPS.theme,
            styles: { ...DEFAULT_RECEIPT_STYLES },
          }

          dispatch(addElement(newReceiptElement))
          dispatch(setSelection(newReceiptElement.id))
          return
        }

        // Handle RICH TEXT element drops
        if (dragData.elementType === 'rich-text') {
          /** Create a rich text element with Lexical editor defaults */
          const newRichTextElement: RichTextElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'rich-text',
            name: 'Rich Text',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_RICH_TEXT_PROPS.width,
            height: DEFAULT_RICH_TEXT_PROPS.height,
            parentId: dropTargetId,
            order: rootElements.length,
            visible: DEFAULT_RICH_TEXT_PROPS.visible,
            locked: DEFAULT_RICH_TEXT_PROPS.locked,
            container: DEFAULT_RICH_TEXT_PROPS.container,
            content: DEFAULT_RICH_TEXT_PROPS.content,
            editorVariant: DEFAULT_RICH_TEXT_PROPS.editorVariant,
            autoWidth: shouldAutoWidth,
            autoHeight: DEFAULT_RICH_TEXT_PROPS.autoHeight,
            styles: { ...DEFAULT_RICH_TEXT_STYLES },
          }

          dispatch(addElement(newRichTextElement))
          dispatch(setSelection(newRichTextElement.id))
          return
        }

        // Handle CART element drops
        if (dragData.elementType === 'cart') {
          // Create new Cart button element
          const newCartElement: CartElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'cart',
            name: 'Cart',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_CART_PROPS.width,
            height: DEFAULT_CART_PROPS.height,
            parentId: dropTargetId,
            order: rootElements.length,
            visible: true,
            locked: false,
            container: false,
            label: DEFAULT_CART_PROPS.label,
            variant: DEFAULT_CART_PROPS.variant,
            icon: DEFAULT_CART_PROPS.icon,
            iconPosition: DEFAULT_CART_PROPS.iconPosition,
            iconSize: DEFAULT_CART_PROPS.iconSize,
            autoWidth: DEFAULT_CART_PROPS.autoWidth,
            autoHeight: DEFAULT_CART_PROPS.autoHeight,
            styles: { ...DEFAULT_CART_STYLES },
          }

          dispatch(addElement(newCartElement))
          dispatch(setSelection(newCartElement.id))
          return
        }

        // Handle ECOMMERCE CAROUSEL element drops
        if (dragData.elementType === 'ecommerce-carousel') {
          const newCarouselElement: EcommerceCarouselElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'ecommerce-carousel',
            name: 'Product Gallery',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.width,
            height: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.height,
            parentId: dropTargetId,
            order: rootElements.length,
            visible: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.visible,
            locked: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.locked,
            container: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.container,
            images: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.images,
            featuredIndex: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.featuredIndex,
            objectFit: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.objectFit,
            navigationStyle: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.navigationStyle,
            thumbnailGap: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.thumbnailGap,
            thumbnailSize: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.thumbnailSize,
            showMore: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.showMore,
            imageBorderRadius: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.imageBorderRadius,
            autoWidth: shouldAutoWidth,
            styles: { ...DEFAULT_ECOMMERCE_CAROUSEL_STYLES },
          }

          dispatch(addElement(newCarouselElement))
          dispatch(setSelection(newCarouselElement.id))
          return
        }

        // Handle FAQ element drops
        if (dragData.elementType === 'faq') {
          const newFaqElement: FaqElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'faq',
            name: 'FAQ',
            x: canvasX,
            y: canvasY,
            width: 600,
            height: 400,
            parentId: dropTargetId,
            order: getChildOrder(),
            visible: true,
            locked: false,
            container: false,
            items: [
              { id: 'faq_1', question: 'What is your product?', answer: 'Our product helps you build beautiful websites with ease. No coding required.' },
              { id: 'faq_2', question: 'How does pricing work?', answer: 'We offer flexible plans starting from free. Upgrade anytime as you grow.' },
              { id: 'faq_3', question: 'Can I cancel anytime?', answer: 'Yes, you can cancel your subscription at any time. No questions asked.' },
            ],
            allowMultipleOpen: false,
            autoWidth: shouldAutoWidth,
            autoHeight: true,
            separatorStyle: 'line',
            iconStyle: 'chevron',
            styles: {},
          }

          dispatch(addElement(newFaqElement))
          dispatch(setSelection(newFaqElement.id))
          return
        }

        // Handle LIST element drops — creates a bulleted list with default items
        if (dragData.elementType === 'list') {
          const newListElement: ListElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'list',
            name: 'List',
            x: canvasX,
            y: canvasY,
            width: 400,
            height: 200,
            parentId: dropTargetId,
            order: getChildOrder(),
            visible: true,
            locked: false,
            container: false,
            items: [
              { id: 'li_1', text: 'First item' },
              { id: 'li_2', text: 'Second item' },
              { id: 'li_3', text: 'Third item' },
            ],
            icon: 'Check',
            iconSize: 16,
            autoWidth: shouldAutoWidth,
            autoHeight: true,
            itemGap: 8,
            styles: {},
          }

          dispatch(addElement(newListElement))
          dispatch(setSelection(newListElement.id))
          return
        }

        // Handle STICKY NOTE element drops
        if (dragData.elementType === 'sticky-note') {
          const newStickyNoteElement: StickyNoteElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'sticky-note',
            name: 'Sticky Note',
            x: canvasX,
            y: canvasY,
            width: DEFAULT_STICKY_NOTE_PROPS.width,
            height: DEFAULT_STICKY_NOTE_PROPS.height,
            parentId: dropTargetId,
            order: getChildOrder(),
            visible: DEFAULT_STICKY_NOTE_PROPS.visible,
            locked: DEFAULT_STICKY_NOTE_PROPS.locked,
            container: DEFAULT_STICKY_NOTE_PROPS.container,
            content: DEFAULT_STICKY_NOTE_PROPS.content,
            noteColor: DEFAULT_STICKY_NOTE_PROPS.noteColor,
            textColor: DEFAULT_STICKY_NOTE_PROPS.textColor,
            autoWidth: false,
            autoHeight: false,
            styles: { ...DEFAULT_STICKY_NOTE_STYLES },
          }

          dispatch(addElement(newStickyNoteElement))
          dispatch(setSelection(newStickyNoteElement.id))
          return
        }

        // Handle TIMER element drops
        if (dragData.elementType === 'timer') {
          const newTimerElement: TimerElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'timer',
            name: 'Timer',
            x: canvasX,
            y: canvasY,
            width: 500,
            height: 120,
            parentId: dropTargetId,
            order: getChildOrder(),
            visible: true,
            locked: false,
            autoWidth: shouldAutoWidth,
            autoHeight: true,
            container: false,
            timerMode: 'date',
            targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            segments: { showDays: true, showHours: true, showMinutes: true, showSeconds: true },
            showLabels: true,
            labelStyle: 'full',
            separatorStyle: 'colon',
            expiry: { hideTimerOnExpiry: false, hideElementIds: [], revealElementIds: [] },
            styles: {
              fontFamily: 'Inter',
              fontSize: '48px',
              fontWeight: '700',
              color: '#111111',
              backgroundColor: 'transparent',
              borderRadius: '12px',
              padding: '24px',
              gap: 24,
            },
          }

          dispatch(addElement(newTimerElement))
          dispatch(setSelection(newTimerElement.id))
          return
        }

        // Handle FRAME element drops
        if (dragData.elementType === 'frame') {
          // ================================================================
          // SIMPLE FOOTER (DARK + LIGHT) — Full-width bar with centered copyright
          // Composed from frames + text elements (no prebuilt type needed)
          // Height uses flexWrap: 'wrap' so the footer auto-sizes to content
          // ================================================================
          if (dragData.variant === 'footer-simple-dark' || dragData.variant === 'footer-simple-light') {
            // Determine color scheme based on variant
            const isDark = dragData.variant === 'footer-simple-dark'
            const bgColor = isDark ? '#111111' : '#ffffff'
            const textColor = isDark ? '#999999' : '#333333'

            const footerFrameId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
            const copyrightTextId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_copyright`

            // Parent footer frame — full-width, centered content, height fits content
            const footerFrame: FrameElementType = {
              id: footerFrameId,
              type: 'frame',
              name: 'Footer',
              x: canvasX,
              y: canvasY,
              width: 1200,
              height: 80,
              parentId: dropTargetId,
              order: getChildOrder(),
              visible: true,
              locked: false,
              container: false,
              autoWidth: false,
              styles: {
                ...DEFAULT_FRAME_STYLES,
                backgroundColor: bgColor,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                flexWrap: 'wrap',
                paddingTop: 24,
                paddingBottom: 24,
                paddingLeft: 40,
                paddingRight: 40,
              },
              responsiveSettings: {
                mobile: {
                  autoWidth: true,
                },
              },
            }

            dispatch(addElement(footerFrame))

            // Copyright text — centered in the footer
            const copyrightText: TextElementType = {
              id: copyrightTextId,
              type: 'text',
              name: 'Copyright Text',
              x: 0,
              y: 0,
              width: 400,
              height: 24,
              parentId: footerFrameId,
              order: 0,
              visible: true,
              locked: false,
              container: false,
              content: '© 2026 Company Name. All rights reserved.',
              autoHeight: true,
              autoWidth: false,
              styles: {
                ...DEFAULT_TEXT_STYLES,
                color: textColor,
                fontSize: 14,
                textAlign: 'center',
              },
            }

            dispatch(addElement(copyrightText))
            dispatch(setSelection(footerFrameId))
            return
          }

          // ================================================================
          // MULTI-COLUMN FOOTER (DARK + LIGHT) — 4-column layout with brand,
          // links, and copyright bar. Composed entirely from frames + text.
          // Height uses flexWrap: 'wrap' so the footer auto-sizes to content.
          // ================================================================
          if (dragData.variant === 'footer-columns-dark' || dragData.variant === 'footer-columns-light') {
            // Determine color scheme based on variant
            const isDark = dragData.variant === 'footer-columns-dark'
            const bgColor = isDark ? '#111111' : '#ffffff'
            const headingColor = isDark ? '#ffffff' : '#111111'
            const bodyColor = isDark ? '#999999' : '#555555'
            const mutedColor = isDark ? '#666666' : '#888888'
            const dividerColor = isDark ? '#333333' : '#e5e5e5'

            const footerFrameId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
            const contentRowId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_content`
            const col1Id = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_col1`
            const col2Id = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_col2`
            const col3Id = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_col3`
            const col4Id = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_col4`
            const dividerId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_divider`
            const bottomRowId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_bottom`

            // ---- Root footer container — height fits content via flexWrap ----
            const footerFrame: FrameElementType = {
              id: footerFrameId,
              type: 'frame',
              name: 'Footer',
              x: canvasX,
              y: canvasY,
              width: 1200,
              height: 360,
              parentId: dropTargetId,
              order: getChildOrder(),
              visible: true,
              locked: false,
              container: false,
              autoWidth: false,
              styles: {
                ...DEFAULT_FRAME_STYLES,
                backgroundColor: bgColor,
                flexDirection: 'column',
                flexWrap: 'wrap',
                paddingTop: 48,
                paddingBottom: 32,
                paddingLeft: 60,
                paddingRight: 60,
                gap: 32,
              },
              responsiveSettings: {
                mobile: {
                  autoWidth: true,
                },
              },
            }

            dispatch(addElement(footerFrame))

            // ---- Content row — horizontal layout holding the 4 columns ----
            const contentRow: FrameElementType = {
              id: contentRowId,
              type: 'frame',
              name: 'Footer Content',
              x: 0,
              y: 0,
              width: 1080,
              height: 200,
              parentId: footerFrameId,
              order: 0,
              visible: true,
              locked: false,
              container: false,
              autoWidth: true,
              styles: {
                ...DEFAULT_FRAME_STYLES,
                backgroundColor: 'transparent',
                flexDirection: 'row',
                gap: 40,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
              },
            }

            dispatch(addElement(contentRow))

            // Helper to create a column frame
            const createColumn = (id: string, name: string, order: number): FrameElementType => ({
              id,
              type: 'frame',
              name,
              x: 0,
              y: 0,
              width: 240,
              height: 180,
              parentId: contentRowId,
              order,
              visible: true,
              locked: false,
              container: false,
              autoWidth: false,
              styles: {
                ...DEFAULT_FRAME_STYLES,
                backgroundColor: 'transparent',
                flexDirection: 'column',
                gap: 12,
                flex: 1,
              },
            })

            // Helper to create a heading text element
            const createHeading = (parentId: string, text: string, order: number): TextElementType => ({
              id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_h_${order}`,
              type: 'text',
              name: text,
              x: 0,
              y: 0,
              width: 200,
              height: 24,
              parentId,
              order,
              visible: true,
              locked: false,
              container: false,
              content: text,
              autoHeight: true,
              autoWidth: true,
              styles: {
                ...DEFAULT_TEXT_STYLES,
                color: headingColor,
                fontSize: 16,
                fontWeight: 600,
              },
            })

            // Helper to create a body/link text element
            const createBodyText = (parentId: string, text: string, order: number): TextElementType => ({
              id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_t_${order}`,
              type: 'text',
              name: text,
              x: 0,
              y: 0,
              width: 200,
              height: 20,
              parentId,
              order,
              visible: true,
              locked: false,
              container: false,
              content: text,
              autoHeight: true,
              autoWidth: true,
              styles: {
                ...DEFAULT_TEXT_STYLES,
                color: bodyColor,
                fontSize: 14,
                fontWeight: 400,
              },
            })

            // ---- Column 1: Brand ----
            dispatch(addElement(createColumn(col1Id, 'Brand', 0)))
            dispatch(addElement(createHeading(col1Id, 'Company', 0)))
            dispatch(addElement(createBodyText(col1Id, 'Building great products for a better world.', 1)))

            // ---- Column 2: Quick Links ----
            dispatch(addElement(createColumn(col2Id, 'Quick Links', 1)))
            dispatch(addElement(createHeading(col2Id, 'Quick Links', 0)))
            dispatch(addElement(createBodyText(col2Id, 'Home', 1)))
            dispatch(addElement(createBodyText(col2Id, 'About', 2)))
            dispatch(addElement(createBodyText(col2Id, 'Services', 3)))
            dispatch(addElement(createBodyText(col2Id, 'Contact', 4)))

            // ---- Column 3: Resources ----
            dispatch(addElement(createColumn(col3Id, 'Resources', 2)))
            dispatch(addElement(createHeading(col3Id, 'Resources', 0)))
            dispatch(addElement(createBodyText(col3Id, 'Blog', 1)))
            dispatch(addElement(createBodyText(col3Id, 'Documentation', 2)))
            dispatch(addElement(createBodyText(col3Id, 'Support', 3)))

            // ---- Column 4: Contact ----
            dispatch(addElement(createColumn(col4Id, 'Contact', 3)))
            dispatch(addElement(createHeading(col4Id, 'Contact', 0)))
            dispatch(addElement(createBodyText(col4Id, 'hello@company.com', 1)))
            dispatch(addElement(createBodyText(col4Id, '+1 (555) 000-0000', 2)))

            // ---- Divider — thin horizontal line ----
            const divider: FrameElementType = {
              id: dividerId,
              type: 'frame',
              name: 'Divider',
              x: 0,
              y: 0,
              width: 1080,
              height: 1,
              parentId: footerFrameId,
              order: 1,
              visible: true,
              locked: false,
              container: false,
              autoWidth: true,
              styles: {
                ...DEFAULT_FRAME_STYLES,
                backgroundColor: dividerColor,
              },
            }

            dispatch(addElement(divider))

            // ---- Bottom row — copyright and policy links ----
            const bottomRow: FrameElementType = {
              id: bottomRowId,
              type: 'frame',
              name: 'Footer Bottom',
              x: 0,
              y: 0,
              width: 1080,
              height: 30,
              parentId: footerFrameId,
              order: 2,
              visible: true,
              locked: false,
              container: false,
              autoWidth: true,
              styles: {
                ...DEFAULT_FRAME_STYLES,
                backgroundColor: 'transparent',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              },
            }

            dispatch(addElement(bottomRow))

            // Bottom-left: copyright text
            const bottomCopyright: TextElementType = {
              id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_copy`,
              type: 'text',
              name: 'Copyright',
              x: 0,
              y: 0,
              width: 300,
              height: 20,
              parentId: bottomRowId,
              order: 0,
              visible: true,
              locked: false,
              container: false,
              content: '© 2026 Company Name. All rights reserved.',
              autoHeight: true,
              autoWidth: false,
              styles: {
                ...DEFAULT_TEXT_STYLES,
                color: mutedColor,
                fontSize: 13,
              },
            }

            dispatch(addElement(bottomCopyright))

            // Bottom-right: policy links text
            const bottomPolicies: TextElementType = {
              id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_policy`,
              type: 'text',
              name: 'Policies',
              x: 0,
              y: 0,
              width: 250,
              height: 20,
              parentId: bottomRowId,
              order: 1,
              visible: true,
              locked: false,
              container: false,
              content: 'Privacy Policy · Terms of Service',
              autoHeight: true,
              autoWidth: false,
              styles: {
                ...DEFAULT_TEXT_STYLES,
                color: mutedColor,
                fontSize: 13,
                textAlign: 'right',
              },
            }

            dispatch(addElement(bottomPolicies))
            dispatch(setSelection(footerFrameId))
            return
          }

          // Default size for new frames
          const DEFAULT_WIDTH = 200
          const DEFAULT_HEIGHT = 150

          // Create new frame element
          // autoWidth is set based on drop target - fills parent when inside a frame
          const newElement: FrameElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'frame',
            name: `Frame ${dragData.variant}`,
            x: canvasX,
            y: canvasY,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            parentId: dropTargetId, // Drop into frame or root
            order: getChildOrder(),
            visible: true,
            locked: false,
            container: false,
            autoWidth: shouldAutoWidth, // Smart: true when inside frame, false on canvas
            styles: {
              ...DEFAULT_FRAME_STYLES,
              ...(dragData.variant === 'frame-h' && {
                flexDirection: 'row',
              }),
              ...(dragData.variant === 'frame-v' && {
                flexDirection: 'column',
              }),
              ...(dragData.variant === 'frame-grid' && {
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
              }),
            },
          }

          dispatch(addElement(newElement))
          dispatch(setSelection(newElement.id))
        }

        // Handle CIRCLE FRAME drops — a regular frame with max borderRadius
        if (dragData.elementType === 'circle-frame') {
          const newCircleFrame: FrameElementType = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'frame',
            name: 'Circle Frame',
            x: canvasX,
            y: canvasY,
            width: 200,
            height: 200,
            parentId: dropTargetId,
            order: getChildOrder(),
            ...DEFAULT_FRAME_PROPS,
            styles: {
              ...DEFAULT_FRAME_STYLES,
              borderRadius: 9999,
              overflow: 'hidden',
            },
          }

          dispatch(addElement(newCircleFrame))
          dispatch(setSelection(newCircleFrame.id))
        }
      } catch (error) {
        console.error('Failed to parse drag data:', error)
      }
    },
    [dispatch, viewport, rootElements.length, pageInfos, getActivePageCanvas]
  )

  // Attach wheel listener (needs passive: false for preventDefault)
  // Also suppress browser's default middle-click auto-scroll behavior
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    /**
     * Prevent the browser's default middle-click auto-scroll icon.
     * We handle middle-click as "pan drag" instead.
     */
    const preventMiddleClickAutoScroll = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
      }
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('mousedown', preventMiddleClickAutoScroll)

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('mousedown', preventMiddleClickAutoScroll)
    }
  }, [handleWheel])

  /**
   * Middle-click (scroll wheel click) drag-to-pan.
   * Allows mouse users to freely pan in any direction by holding
   * middle mouse button and dragging. Standard in design tools like Figma.
   *
   * Uses native pointer events for smooth 60fps panning via RAF.
   * Captures pointer so the pan continues even if the cursor leaves the canvas.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let isPanning = false
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e: PointerEvent) => {
      /** Middle mouse button = button 1 */
      if (e.button !== 1) return
      e.preventDefault()
      isPanning = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isPanning) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      /**
       * Read current viewport from ref to avoid stale closures.
       * This is critical — using the closure `viewport` would cause the effect
       * to re-subscribe on every pan frame (viewport changes every frame).
       */
      const vp = viewportRef.current
      dispatch(
        setViewport({
          panX: vp.panX + dx,
          panY: vp.panY + dy,
        })
      )
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!isPanning) return
      isPanning = false
      canvas.releasePointerCapture(e.pointerId)
      canvas.style.cursor = ''
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
    }
    // Only depend on dispatch — viewportRef is read inside handlers to avoid re-subscription
  }, [dispatch])


  // ========================================================================
  // HELPER - Check if element is inside a master component
  // ========================================================================

  /**
   * Check if an element is a descendant of a master component frame.
   * Used to apply purple styling to all children inside a master component.
   */
  function isInsideMasterComponent(elementId: string): boolean {
    const { elements: canvasElements } = getActivePageCanvas()
    let currentId: string | null = elementId

    while (currentId) {
      const el: CanvasElement | undefined = canvasElements[currentId]
      if (!el) return false

      // Check if this element is a master component
      if (el.type === 'frame' && (el as FrameElementType).masterOfComponentId) {
        return true
      }

      // Move up to parent
      currentId = el.parentId
    }

    return false
  }

  // ========================================================================
  // RENDER HELPER - Recursive element renderer
  // ========================================================================

  /**
   * Render a single element with its children recursively.
   *
   * This is a regular function (not useCallback) because:
   * - It needs to call itself recursively
   * - React will optimize re-renders via keys
   * - The function recreates on each render but that's OK for rendering
   *
   * SUPPORTED TYPES:
   * - 'frame': Regular frame elements with all resize handles
   * - 'page': Page elements with vertical-only resize (top/bottom)
   */
  function renderElement(element: CanvasElement): React.ReactNode {
    /**
     * Element is visually selected if:
     * - It's in the committed selection (selectedIds), OR
     * - It's under the current marquee (previewSelectedIds)
     */
    const isElementSelected =
      selectedIds.includes(element.id) ||
      previewSelectedIds.includes(element.id)

    /**
     * Element is hovered if it matches the current hover target.
     * The hover target is determined by handleHoverStart which
     * applies the same cycling logic as selection.
     */
    const isElementHovered = hoveredElementId === element.id

    /**
     * Check if this element is inside a master component.
     * Used to apply purple styling to all children inside a master.
     */
    const elementIsInsideMaster = isInsideMasterComponent(element.id)

    // ================================================================
    // UNIFIED ELEMENTS — Uses ElementWrapper + Unified content pattern
    // These 4 element types have been migrated to the unified renderer
    // architecture where a single component handles both canvas and
    // preview modes. In canvas mode, CanvasXxxElement wraps the unified
    // content inside an ElementWrapper for editor chrome.
    // ================================================================

    // Handle TEXT elements - unified renderer with inline editing support
    if (element.type === 'text') {
      return (
        <CanvasTextElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
          autoEditElementId={autoEditElementId}
        />
      )
    }

    // Handle IMAGE elements - unified renderer with CSS background-image
    if (element.type === 'image') {
      return (
        <CanvasImageElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle VIDEO elements - unified renderer with static poster display
    if (element.type === 'video') {
      return (
        <CanvasVideoElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle BUTTON elements - unified renderer with icon + label
    if (element.type === 'button') {
      return (
        <CanvasButtonElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle ADD TO CART BUTTON elements — unified renderer (canvas mode: button with CMS validation)
    if (element.type === 'add-to-cart-button') {
      return (
        <CanvasAddToCartElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle CHECKOUT elements — unified renderer (canvas mode: mock checkout preview)
    if (element.type === 'checkout') {
      return (
        <CanvasCheckoutElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle CART elements — unified renderer (canvas mode: cart button with icon)
    if (element.type === 'cart') {
      return (
        <CanvasCartElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle ECOMMERCE CAROUSEL elements — unified renderer (canvas mode: image gallery)
    if (element.type === 'ecommerce-carousel') {
      return (
        <CanvasEcommerceCarouselElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle FAQ elements — unified renderer (canvas mode: accordion preview)
    if (element.type === 'faq') {
      return (
        <CanvasFaqElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle LIST elements — unified renderer (canvas mode: editable bullet list)
    if (element.type === 'list') {
      return (
        <CanvasListElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle STICKY NOTE elements — unified renderer (canvas mode: editable note)
    if (element.type === 'sticky-note') {
      return (
        <CanvasStickyNoteElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle TIMER elements — unified renderer (canvas mode: static countdown preview)
    if (element.type === 'timer') {
      return (
        <CanvasTimerElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle FORM elements - unified renderer (canvas mode: disabled form preview)
    // Forms use autoHeight and have no resize handles
    if (element.type === 'form') {
      return (
        <CanvasFormElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle PAYMENT elements - unified renderer (canvas mode: static mock form)
    // Payment forms use autoHeight and have no resize handles
    if (element.type === 'payment') {
      return (
        <CanvasPaymentElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle RECEIPT elements — unified renderer (canvas mode: static mockup card)
    // Receipt elements display payment confirmation data after checkout
    if (element.type === 'receipt') {
      return (
        <CanvasReceiptElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle RICH TEXT elements — Lexical editor in canvas mode
    if (element.type === 'rich-text') {
      return (
        <CanvasRichTextElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
          autoEditElementId={autoEditElementId}
        />
      )
    }

    // Handle PENCIL elements — unified renderer (canvas mode: SVG freehand drawing)
    if (element.type === 'pencil') {
      return (
        <CanvasPencilElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle PREBUILT elements — unified renderer (canvas mode via Canvas wrappers)
    if (element.type === 'prebuilt') {
      // Use type guard to render the appropriate unified prebuilt component
      if (isPreBuiltNavbar(element)) {
        return (
          <CanvasPreBuiltNavbarElement
            key={element.id}
            element={element}
            isSelected={isElementSelected}
            isHovered={isElementHovered}
            isInsideMaster={elementIsInsideMaster}
            zoom={viewport.zoom}
            onDragStart={handleDragStart}
            onResizeStart={onResizeStart}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          />
        )
      }

      // Render sidebar PreBuilt element with inset children
      if (isPreBuiltSidebar(element)) {
        // Get children for the sidebar inset area
        const { elements: canvasElements, childrenMap } = getActivePageCanvas()
        const childIds = childrenMap[element.id] || []
        const sidebarChildren = childIds
          .map((id) => canvasElements[id])
          .filter((el): el is CanvasElement => el !== undefined)
          .sort((a, b) => a.order - b.order)

        return (
          <CanvasPreBuiltSidebarElement
            key={element.id}
            element={element}
            isSelected={isElementSelected}
            isHovered={isElementHovered}
            isInsideMaster={elementIsInsideMaster}
            zoom={viewport.zoom}
            onDragStart={handleDragStart}
            onResizeStart={onResizeStart}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          >
            {/* Render children inside the sidebar inset area */}
            {sidebarChildren.map((child) => renderElement(child))}
          </CanvasPreBuiltSidebarElement>
        )
      }

      // Handle TOTAL MEMBERS PreBuilt
      if (isPreBuiltTotalMembers(element)) {
        return (
          <CanvasPreBuiltTotalMembersElement
            key={element.id}
            element={element}
            isSelected={isElementSelected}
            isHovered={isElementHovered}
            isInsideMaster={elementIsInsideMaster}
            zoom={viewport.zoom}
            onDragStart={handleDragStart}
            onResizeStart={onResizeStart}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          />
        )
      }

      // Handle LOGO CAROUSEL PreBuilt
      if (isPreBuiltLogoCarousel(element)) {
        return (
          <CanvasPreBuiltLogoCarouselElement
            key={element.id}
            element={element}
            isSelected={isElementSelected}
            isHovered={isElementHovered}
            isInsideMaster={elementIsInsideMaster}
            zoom={viewport.zoom}
            onDragStart={handleDragStart}
            onResizeStart={onResizeStart}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          />
        )
      }

      // Future PreBuilt types can be added here
      return null
    }

    // Handle COMPONENT elements — unified renderer (canvas mode: scoped ID rendering)
    // Component instances can be selected/moved but their children cannot be edited
    if (element.type === 'component') {
      return (
        <CanvasComponentInstanceElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle SMARTCMS LIST elements — unified renderer (canvas mode: CMS preview)
    // Container that renders component instances based on CMS data
    if (element.type === 'smartcms-list') {
      return (
        <CanvasSmartCmsListElement
          key={element.id}
          element={element}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      )
    }

    // Handle FRAME and PAGE elements — renders CanvasFrameElement (unified) with children
    if (element.type === 'frame' || element.type === 'page') {
      // Get children for this element using direct store access
      // Page-aware: access active page's canvas data
      const { elements: canvasElements, childrenMap } = getActivePageCanvas()
      const childIds = childrenMap[element.id] || []
      const children = childIds
        .map((id) => canvasElements[id])
        .filter((el): el is CanvasElement => el !== undefined)
        .sort((a, b) => a.order - b.order)

      /**
       * Check if this is a PAGE element with mobile breakpoint enabled.
       * If so, we render BOTH the main page AND the mobile breakpoint frame.
       *
       * IMPORTANT: The breakpoint frame is NOT a stored element — it's a
       * dynamic render that references the same children as the main page.
       * This prevents data duplication and ensures breakpoint frames are
       * never saved to the database.
       */
      const isPageWithMobileBreakpoint =
        element.type === 'page' &&
        (element as PageElementType).breakpoints?.mobile === true

      /**
       * Get ALL descendant elements for the breakpoint frame.
       * This includes nested children of children (recursive).
       *
       * WHY: The BreakpointMobileFrame needs access to all elements
       * so it can render nested structures correctly.
       */
      const getAllDescendants = (parentId: string): CanvasElement[] => {
        const directChildren = childrenMap[parentId] || []
        const result: CanvasElement[] = []
        for (const childId of directChildren) {
          const child = canvasElements[childId]
          if (child) {
            result.push(child)
            result.push(...getAllDescendants(child.id))
          }
        }
        return result
      }

      // For pages with mobile breakpoint, render both the page and breakpoint frame
      if (isPageWithMobileBreakpoint) {
        const allDescendants = getAllDescendants(element.id)

        return (
          <React.Fragment key={element.id}>
            {/* Main page element — uses unified CanvasFrameElement */}
            <CanvasFrameElement
              element={element}
              isSelected={isElementSelected}
              isHovered={isElementHovered}
              isInsideMaster={elementIsInsideMaster}
              zoom={viewport.zoom}
              onDragStart={handleDragStart}
              onResizeStart={onResizeStart}
              onHoverStart={handleHoverStart}
              onHoverEnd={handleHoverEnd}
            >
              {children.map((child) => renderElement(child))}
            </CanvasFrameElement>

            {/* Mobile breakpoint preview frame */}
            <BreakpointMobileFrame
              pageElement={element as PageElementType}
              children={allDescendants}
              zoom={viewport.zoom}
              selectedIds={selectedIds}
              hoveredElementId={hoveredElementId}
              onHoverStart={handleHoverStart}
              onHoverEnd={handleHoverEnd}
              components={localComponents}
            />
          </React.Fragment>
        )
      }

      // Check if this frame is a sidebar inset frame (protected — no drag, no resize)
      const { elements: allElements } = getActivePageCanvas()
      const isInsetFrame = element.type === 'frame' && isSidebarInsetFrame(element.id, allElements)

      /**
       * For sidebar inset frames: redirect selection to the parent sidebar,
       * prevent independent dragging and resizing. The inset is structurally
       * bound to the sidebar — it cannot be moved or removed.
       */
      const insetDragStart = isInsetFrame
        ? (e: React.PointerEvent, _id: string, mod?: boolean) => {
            if (element.parentId) handleDragStart(e, element.parentId, mod)
          }
        : handleDragStart

      const insetResizeStart = isInsetFrame
        ? (() => {}) as typeof onResizeStart
        : onResizeStart

      // Regular frame/page without breakpoint — uses unified CanvasFrameElement
      return (
        <CanvasFrameElement
          key={element.id}
          element={element}
          isSelected={isInsetFrame ? false : isElementSelected}
          isHovered={isInsetFrame ? false : isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={insetDragStart}
          onResizeStart={insetResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        >
          {children.map((child) => renderElement(child))}
        </CanvasFrameElement>
      )
    }

    // Handle LINK elements — navigable frame-like containers (unified)
    if (element.type === 'link') {
      const { elements: canvasElements, childrenMap } = getActivePageCanvas()
      const childIds = childrenMap[element.id] || []
      const children = childIds
        .map((id) => canvasElements[id])
        .filter((el): el is CanvasElement => el !== undefined)
        .sort((a, b) => a.order - b.order)

      return (
        <CanvasLinkElement
          key={element.id}
          element={element as LinkElementType}
          isSelected={isElementSelected}
          isHovered={isElementHovered}
          isInsideMaster={elementIsInsideMaster}
          zoom={viewport.zoom}
          onDragStart={handleDragStart}
          onResizeStart={onResizeStart}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        >
          {children.map((child) => renderElement(child))}
        </CanvasLinkElement>
      )
    }

    // Future element types can be added here
    return null
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <>
      {/* Loading screen - shows until canvas is ready */}
      <CanvasLoader isVisible={isLoading} />

      {/* PREVIEW OVERLAY - Shows when preview mode is active */}
      <PreviewOverlay />

      {/* CRITICAL ERROR BANNER - Shows when canvas integrity is compromised */}
      {canvasError && (
        <CanvasErrorBanner
          type={canvasError.type}
          message={canvasError.message}
          elementId={canvasError.elementId}
        />
      )}

      {/* SAVE ERROR BANNER - Shows when auto-save fails after retries */}
      {saveError && (
        <CanvasErrorBanner
          type="SAVE_ERROR"
          message={saveError.message}
          onDismiss={clearError}
          onRetry={() => void saveNow()}
        />
      )}

      {/*
        NAVIGATION GATE - Prevents accidental navigation while saving

        Shows a confirmation dialog if the user tries to navigate away
        while the canvas is in the middle of saving. This prevents data loss
        from interrupted save operations.

        Active when: saveStatus is 'pending' (debouncing) or 'saving' (in flight)
      */}
      <NavigationGate
        isPending={saveStatus === 'pending' || saveStatus === 'saving'}
        title="Save in progress"
        description="Your changes are still being saved. If you leave now, your latest changes may be lost."
        stayButtonText="Wait for save"
        leaveButtonText="Leave anyway"
      />

      {/* Full-screen container with header at top.
          Uses --banner-top-offset CSS variable (set by website-builder layout)
          to push below any critical banner. Falls back to 0 when no banner. */}
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col bg-background"
        style={{ top: 'var(--banner-top-offset, 0px)' }}
      >
        {/* Header - full width at top, above everything */}
        {pageName && pageId && organizationId && websiteId && (
          <BuilderHeader
            pageName={pageName}
            websiteName={websiteName}
            pageId={pageId}
            websiteId={websiteId}
            domainId={domainId}
            organizationId={organizationId}
            saveStatus={saveStatus}
            onOpenCms={() => setIsCmsModalOpen(true)}
            onOpenStorage={() => setIsStorageModalOpen(true)}
            settingsOpenExternal={settingsOpenExternal}
            onSettingsOpenChange={(open) => {
              if (!open) setSettingsOpenExternal(false)
            }}
            onPublishRef={publishRef}
          />
        )}

        {/* Main content area - sidebars and canvas */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Element picker */}
          <Sidebar />

          {/* Canvas container - fills remaining space.
             bg-muted adapts to the active theme (light: oklch(0.97) / dark: oklch(0.23))
             instead of the old hardcoded bg-neutral-900 which was invisible in light mode. */}
          <div className="flex-1 relative overflow-hidden bg-muted">
            {/* Rulers - shows pixel measurements and alignment guides */}
            <Rulers
              zoom={viewport.zoom}
              panX={viewport.panX}
              panY={viewport.panY}
              activeBounds={activeBounds}
              alignmentGuides={alignmentGuides}
            />

            {/* Canvas viewport */}
            <div
              ref={canvasRef}
              data-canvas
              style={{
                position: 'absolute',
                inset: 0,
                // Cursor priority:
                // 1. Pan cursor (grab/grabbing) takes highest priority when panning
                // 2. Tool-specific cursors: text (I-beam), frame/image/button (crosshair)
                // 3. Default pointer for select mode
                cursor:
                  panCursor
                    ? panCursor
                    : toolMode === 'text'
                      ? 'text'
                      : toolMode === 'frame' || toolMode === 'image' || toolMode === 'button' || toolMode === 'sticky-note' || toolMode === 'circle-frame' || toolMode === 'pen'
                        ? 'crosshair'
                        : 'default',
                overflow: 'hidden',
              }}
              onClick={handleCanvasClick}
              onPointerDown={handleCanvasBackgroundPointerDown}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* ElementOverlayProvider makes the overlay container available to
                   child elements for portal-based overlay rendering. Overlays
                   (labels, handles, badges) render here to escape parent
                   overflow:hidden clipping. */}
              <ElementOverlayProvider overlayContainerRef={overlayContainerRef}>
                {/* Transformed canvas content container */}
                <div
                  data-canvas-content
                  style={{
                    position: 'absolute',
                    transformOrigin: '0 0',
                    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
                  }}
                >
                  {/* RenderModeProvider tells all unified elements they're in canvas mode.
                     Without this, unified elements default to 'preview' mode and render
                     their own position/size styles, CONFLICTING with ElementWrapper's
                     positioning — causing elements to appear at wrong positions ("fly everywhere")
                     especially at non-1x zoom. */}
                  <RenderModeProvider mode="canvas" enableEcommerce={enableEcommerce}>
                    {/* Render root elements with CMS preview context for dynamic pages */}
                    <CmsPreviewProvider>
                      {rootElements.map((element) => renderElement(element))}
                    </CmsPreviewProvider>
                  </RenderModeProvider>

                  {/* AI Staging Groups — floating previews rendered on the canvas.
                      Positioned to the right of the page element in canvas coordinates.
                      Users drag these onto the page canvas to add them. */}
                  <StagingCanvas />

                  {/* Frame / circle-frame creation preview */}
                  {creationPreview && (
                    <FrameCreationPreview bounds={creationPreview} isCircle={toolMode === 'circle-frame'} />
                  )}

                  {/* Pencil drawing preview — live SVG path during freehand drawing */}
                  {drawingPreview && (
                    <PencilCreationPreview preview={drawingPreview} />
                  )}

                  {/* Marquee selection box */}
                  {isSelecting && marqueeBounds && (
                    <MarqueeSelectionBox bounds={marqueeBounds} />
                  )}
                </div>

                {/* Overlay container - sibling to content with same transform.
                    Portal-rendered overlays appear here, escaping parent frame
                    overflow:hidden while maintaining correct world-space positioning. */}
                <div
                  ref={overlayContainerRef}
                  data-canvas-overlays
                  style={{
                    position: 'absolute',
                    transformOrigin: '0 0',
                    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
                    // Overlays shouldn't block interactions with canvas elements
                    pointerEvents: 'none',
                  }}
                />
              </ElementOverlayProvider>
            </div>

            {/* Status bar - shows zoom level and interaction state */}
            <div className="absolute bottom-5 left-5 px-2.5 py-1.5 bg-muted rounded text-[11px] text-muted-foreground font-mono z-[100]">
              {Math.round(viewport.zoom * 100)}%
              {selectedIds.length > 0 && ` • ${selectedIds.length} selected`}
            </div>

            {/* Spotlight Search — command palette overlay above toolbar */}
            <SpotlightSearch
              open={isSpotlightOpen}
              onClose={() => setIsSpotlightOpen(false)}
              components={Object.values(localComponents).map((c) => ({ id: c.id, name: c.name }))}
              onInsertElement={(action) => {
                /**
                 * Insert the element at the center of the visible canvas viewport.
                 * Converts screen-center to canvas coordinates accounting for pan & zoom.
                 * Elements that have a dedicated tool mode (text, frame, circle-frame,
                 * image, button, sticky-note, pencil) use that instead for click-to-place UX.
                 */
                const toolModeMap: Record<string, ToolMode> = {
                  text: 'text', frame: 'frame', image: 'image', button: 'button',
                  'sticky-note': 'sticky-note', pencil: 'pen',
                }
                // Circle frame shares elementType 'frame' but has variant 'circle-frame'
                const mapped: ToolMode | undefined = action.variant === 'circle-frame'
                  ? 'circle-frame'
                  : toolModeMap[action.elementType]
                if (mapped) {
                  dispatch(setToolMode(mapped))
                  return
                }

                // For all other element types, create the element at the viewport center
                const canvasEl = canvasRef.current
                if (!canvasEl) return
                const rect = canvasEl.getBoundingClientRect()
                const centerX = (rect.width / 2 - viewport.panX) / viewport.zoom
                const centerY = (rect.height / 2 - viewport.panY) / viewport.zoom
                const order = rootElements.length
                const genId = () => `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

                let newElement: CanvasElement | null = null

                switch (action.elementType) {
                  case 'video':
                    newElement = {
                      id: genId(), type: 'video', name: 'Video',
                      x: centerX, y: centerY, width: DEFAULT_VIDEO_PROPS.width, height: DEFAULT_VIDEO_PROPS.height,
                      parentId: null, order, visible: true, locked: false,
                      container: DEFAULT_VIDEO_PROPS.container, sourceType: DEFAULT_VIDEO_PROPS.sourceType,
                      src: DEFAULT_VIDEO_PROPS.src, poster: DEFAULT_VIDEO_PROPS.poster,
                      loomUrl: DEFAULT_VIDEO_PROPS.loomUrl, alt: DEFAULT_VIDEO_PROPS.alt,
                      objectFit: DEFAULT_VIDEO_PROPS.objectFit, posterFit: DEFAULT_VIDEO_PROPS.posterFit,
                      autoWidth: false, controls: DEFAULT_VIDEO_PROPS.controls,
                      autoplay: DEFAULT_VIDEO_PROPS.autoplay, loop: DEFAULT_VIDEO_PROPS.loop,
                      muted: DEFAULT_VIDEO_PROPS.muted, styles: { ...DEFAULT_VIDEO_STYLES },
                    } satisfies VideoElementType
                    break
                  case 'rich-text':
                    newElement = {
                      id: genId(), type: 'rich-text', name: 'Rich Text',
                      x: centerX, y: centerY, width: DEFAULT_RICH_TEXT_PROPS.width, height: DEFAULT_RICH_TEXT_PROPS.height,
                      parentId: null, order, visible: true, locked: false,
                      container: DEFAULT_RICH_TEXT_PROPS.container, content: DEFAULT_RICH_TEXT_PROPS.content,
                      editorVariant: DEFAULT_RICH_TEXT_PROPS.editorVariant,
                      autoWidth: false, autoHeight: DEFAULT_RICH_TEXT_PROPS.autoHeight,
                      styles: { ...DEFAULT_RICH_TEXT_STYLES },
                    } satisfies RichTextElementType
                    break
                  case 'form':
                    newElement = {
                      id: genId(), type: 'form', name: 'Form',
                      x: centerX, y: centerY, width: DEFAULT_FORM_PROPS.width, height: DEFAULT_FORM_PROPS.height,
                      parentId: null, order, visible: true, locked: false,
                      container: DEFAULT_FORM_PROPS.container, formId: DEFAULT_FORM_PROPS.formId,
                      formName: DEFAULT_FORM_PROPS.formName, formSlug: DEFAULT_FORM_PROPS.formSlug,
                      autoWidth: false, autoHeight: true, styles: { ...DEFAULT_FORM_STYLES },
                    } satisfies FormElementType
                    break
                  case 'payment':
                    newElement = {
                      id: genId(), type: 'payment', name: 'Payment',
                      x: centerX, y: centerY, width: DEFAULT_PAYMENT_PROPS.width, height: DEFAULT_PAYMENT_PROPS.height,
                      parentId: null, order, visible: true, locked: false,
                      container: DEFAULT_PAYMENT_PROPS.container, productId: DEFAULT_PAYMENT_PROPS.productId,
                      priceId: DEFAULT_PAYMENT_PROPS.priceId, productName: DEFAULT_PAYMENT_PROPS.productName,
                      priceName: DEFAULT_PAYMENT_PROPS.priceName, autoWidth: false, autoHeight: true,
                      theme: DEFAULT_PAYMENT_PROPS.theme, styles: { ...DEFAULT_PAYMENT_STYLES },
                    } satisfies PaymentElementType
                    break
                  case 'smartcms-list':
                    newElement = {
                      id: genId(), type: 'smartcms-list', name: 'CMS List',
                      x: centerX, y: centerY, width: 400, height: 300,
                      parentId: null, order,
                      ...DEFAULT_SMARTCMS_LIST_PROPS, autoWidth: false,
                      styles: { ...DEFAULT_SMARTCMS_LIST_STYLES },
                    } satisfies SmartCmsListElementType
                    break
                  case 'ecommerce-carousel':
                    newElement = {
                      id: genId(), type: 'ecommerce-carousel', name: 'Product Gallery',
                      x: centerX, y: centerY,
                      width: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.width, height: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.height,
                      parentId: null, order, visible: true, locked: false,
                      container: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.container,
                      images: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.images,
                      featuredIndex: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.featuredIndex,
                      objectFit: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.objectFit,
                      navigationStyle: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.navigationStyle,
                      thumbnailGap: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.thumbnailGap,
                      thumbnailSize: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.thumbnailSize,
                      showMore: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.showMore,
                      imageBorderRadius: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.imageBorderRadius,
                      autoWidth: false, styles: { ...DEFAULT_ECOMMERCE_CAROUSEL_STYLES },
                    } satisfies EcommerceCarouselElementType
                    break
                  case 'faq':
                    newElement = {
                      id: genId(), type: 'faq', name: 'FAQ',
                      x: centerX, y: centerY, width: 600, height: 400,
                      parentId: null, order, visible: true, locked: false, container: false,
                      items: [
                        { id: 'faq_1', question: 'What is your product?', answer: 'Our product helps you build beautiful websites with ease. No coding required.' },
                        { id: 'faq_2', question: 'How does pricing work?', answer: 'We offer flexible plans starting from free. Upgrade anytime as you grow.' },
                        { id: 'faq_3', question: 'Can I cancel anytime?', answer: 'Yes, you can cancel your subscription at any time. No questions asked.' },
                      ],
                      allowMultipleOpen: false, autoWidth: false, autoHeight: true,
                      separatorStyle: 'line', iconStyle: 'chevron', styles: {},
                    } satisfies FaqElementType
                    break
                  case 'list':
                    newElement = {
                      id: genId(), type: 'list', name: 'List',
                      x: centerX, y: centerY, width: 400, height: 200,
                      parentId: null, order, visible: true, locked: false, container: false,
                      items: [
                        { id: 'li_1', text: 'First item' },
                        { id: 'li_2', text: 'Second item' },
                        { id: 'li_3', text: 'Third item' },
                      ],
                      icon: 'Check', iconSize: 16, autoWidth: false, autoHeight: true,
                      itemGap: 8, styles: {},
                    } satisfies ListElementType
                    break
                  case 'timer':
                    newElement = {
                      id: genId(), type: 'timer', name: 'Timer',
                      x: centerX, y: centerY, width: 500, height: 120,
                      parentId: null, order, visible: true, locked: false,
                      autoWidth: false, autoHeight: true, container: false,
                      timerMode: 'date',
                      targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                      segments: { showDays: true, showHours: true, showMinutes: true, showSeconds: true },
                      showLabels: true, labelStyle: 'full', separatorStyle: 'colon',
                      expiry: { hideTimerOnExpiry: false, hideElementIds: [], revealElementIds: [] },
                      styles: { fontFamily: 'Inter', fontSize: '48px', fontWeight: '700', color: '#111111' },
                    } satisfies TimerElementType
                    break
                  case 'cart':
                    newElement = {
                      id: genId(), type: 'cart', name: 'Cart',
                      x: centerX, y: centerY, width: DEFAULT_CART_PROPS.width, height: DEFAULT_CART_PROPS.height,
                      parentId: null, order, visible: true, locked: false, container: false,
                      label: DEFAULT_CART_PROPS.label, variant: DEFAULT_CART_PROPS.variant,
                      icon: DEFAULT_CART_PROPS.icon, iconPosition: DEFAULT_CART_PROPS.iconPosition,
                      iconSize: DEFAULT_CART_PROPS.iconSize,
                      autoWidth: DEFAULT_CART_PROPS.autoWidth, autoHeight: DEFAULT_CART_PROPS.autoHeight,
                      styles: { ...DEFAULT_CART_STYLES },
                    } satisfies CartElementType
                    break
                  case 'add-to-cart-button':
                    newElement = {
                      id: genId(), type: 'add-to-cart-button', name: 'Add to Cart',
                      x: centerX, y: centerY,
                      width: DEFAULT_ADD_TO_CART_BUTTON_PROPS.width, height: DEFAULT_ADD_TO_CART_BUTTON_PROPS.height,
                      parentId: null, order, visible: true, locked: false, container: false, autoWidth: false,
                      label: DEFAULT_ADD_TO_CART_BUTTON_PROPS.label,
                      variant: DEFAULT_ADD_TO_CART_BUTTON_PROPS.variant,
                      styles: { ...DEFAULT_ADD_TO_CART_BUTTON_STYLES },
                    } satisfies AddToCartButtonElementType
                    break
                  case 'checkout':
                    newElement = {
                      id: genId(), type: 'checkout', name: 'Checkout',
                      x: centerX, y: centerY, width: DEFAULT_CHECKOUT_PROPS.width, height: DEFAULT_CHECKOUT_PROPS.height,
                      parentId: null, order, visible: true, locked: false, container: false,
                      autoWidth: DEFAULT_CHECKOUT_PROPS.autoWidth, autoHeight: DEFAULT_CHECKOUT_PROPS.autoHeight,
                      theme: DEFAULT_CHECKOUT_PROPS.theme, showCartSummary: DEFAULT_CHECKOUT_PROPS.showCartSummary,
                      allowQuantityChange: DEFAULT_CHECKOUT_PROPS.allowQuantityChange,
                      cartHeading: DEFAULT_CHECKOUT_PROPS.cartHeading,
                      paymentHeading: DEFAULT_CHECKOUT_PROPS.paymentHeading,
                      payButtonText: DEFAULT_CHECKOUT_PROPS.payButtonText,
                      emptyCartMessage: DEFAULT_CHECKOUT_PROPS.emptyCartMessage,
                      styles: {},
                    } satisfies CheckoutElementType
                    break
                  case 'receipt':
                    newElement = {
                      id: genId(), type: 'receipt', name: 'Receipt',
                      x: centerX, y: centerY, width: DEFAULT_RECEIPT_PROPS.width, height: DEFAULT_RECEIPT_PROPS.height,
                      parentId: null, order, visible: true, locked: false,
                      container: DEFAULT_RECEIPT_PROPS.container, autoWidth: false,
                      theme: DEFAULT_RECEIPT_PROPS.theme, styles: { ...DEFAULT_RECEIPT_STYLES },
                    } satisfies ReceiptElementType
                    break
                }

                if (newElement) {
                  dispatch(addElement(newElement))
                  dispatch(setSelection(newElement.id))
                }
              }}
              onInsertComponent={(componentId) => {
                /** Insert a local component instance at the viewport center */
                const state = store.getState()
                const component = selectLocalComponentById(state, componentId)
                if (!component) return
                const canvasEl = canvasRef.current
                if (!canvasEl) return
                const rect = canvasEl.getBoundingClientRect()
                const centerX = (rect.width / 2 - viewport.panX) / viewport.zoom
                const centerY = (rect.height / 2 - viewport.panY) / viewport.zoom
                const instance = createComponentInstance({
                  component, x: centerX, y: centerY,
                  parentId: null, order: rootElements.length,
                })
                dispatch(addElement(instance))
                dispatch(setSelection(instance.id))
              }}
              onExecute={(handler) => {
                switch (handler) {
                  case 'undo':
                    dispatch(undo())
                    break
                  case 'redo':
                    dispatch(redo())
                    break
                  case 'publishPage':
                    publishRef.current?.()
                    break
                }
              }}
              onNavigate={(target) => {
                switch (target) {
                  case 'settings':
                  case 'settings-page':
                    setSettingsOpenExternal(true)
                    break
                  case 'cms':
                    setIsCmsModalOpen(true)
                    break
                  case 'storage':
                    setIsStorageModalOpen(true)
                    break
                }
              }}
            />

            {/* Toolbar - positioned at bottom center */}
            <Toolbar
              onToggleSpotlight={() => setIsSpotlightOpen((prev) => !prev)}
            />
          </div>

          {/* Right Sidebar - Properties panel */}
          <PropertiesPanel />

        </div>
      </div>

      {/* CMS Modal - Content management system */}
      {organizationId && (
        <CmsModal
          isOpen={isCmsModalOpen}
          onClose={() => setIsCmsModalOpen(false)}
          organizationId={organizationId}
        />
      )}

      {/* Storage Browser Modal - Quick access to media files */}
      {organizationId && (
        <StorageBrowserModal
          open={isStorageModalOpen}
          onOpenChange={setIsStorageModalOpen}
          organizationId={organizationId}
          mode="browse"
          title="Media Storage"
          subtitle="Browse and manage your media files"
          showTrash={true}
        />
      )}
    </>
  )
}
