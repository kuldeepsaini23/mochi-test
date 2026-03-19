/**
 * ============================================================================
 * CANVAS BRIDGE - Mochi Widget → Website Builder Element Delivery
 * ============================================================================
 *
 * Lightweight pub-sub bridge for delivering AI-generated CanvasElements
 * from the Mochi chat widget to the website builder's Redux store.
 *
 * Also carries page context (pageElementId + existingChildCount + selection)
 * from the builder to the widget so specToCanvas can parent elements correctly
 * inside the page or insert before the selected element.
 *
 * WHY NOT use the Mochi event bus?
 * The Mochi event bus uses `data: Record<string, string>` which cannot
 * carry complex objects like CanvasElement arrays. This bridge uses
 * typed callbacks for type-safe element delivery.
 *
 * FLOW:
 * 1. Builder mounts → calls setPageInfo(pageElementId, childCount, selection)
 * 2. MochiWidget receives completed spec → reads getPageInfo()
 * 3. MochiWidget calls resolvePlacement(pageInfo) → PlacementIntent
 * 4. MochiWidget calls createAIContainer(placement) → parented/floating container
 * 5. MochiWidget calls pushElements(elements, { shiftSiblings }) to deliver
 * 6. Builder receives elements via subscribe callback → dispatches to Redux
 *
 * SOURCE OF TRUTH KEYWORDS: CanvasBridge, CanvasElementBridge,
 * AIToBuilderBridge, MochiCanvasBridge
 * ============================================================================
 */

import type { CanvasElement, FrameElement } from '@/components/website-builder/builder-v1.2/_lib/types'
import {
  DEFAULT_FRAME_PROPS,
  DEFAULT_FRAME_STYLES,
} from '@/components/website-builder/builder-v1.2/_lib/types'
import { generateElementId } from '@/components/website-builder/builder-v1.2/_lib/canvas-slice'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options passed alongside pushed elements to control how the builder
 * dispatches them (e.g., whether to shift sibling orders for insert-before).
 *
 * SOURCE OF TRUTH KEYWORDS: PushElementsOptions, CanvasBridgePushOptions
 */
export interface PushElementsOptions {
  /** When true, the builder should shift existing siblings with order >= the new element's order */
  shiftSiblings?: boolean
  /**
   * When true, bypass the staging panel and insert directly onto the page canvas.
   * Only set when the user explicitly requests positional placement
   * (e.g., "add above my selection", "insert below the hero").
   * Default (false/undefined) routes elements to the staging panel.
   */
  directInsert?: boolean
}

/**
 * Callback signature for receiving AI-generated canvas elements.
 * Called with the full array of elements in insertion order (parent before children).
 * Optional options control how the builder should handle the elements.
 */
type CanvasElementsListener = (elements: CanvasElement[], options?: PushElementsOptions) => void

/**
 * A property update for an existing canvas element.
 * Used by the AI to connect forms, products, etc. to existing placeholders.
 *
 * SOURCE OF TRUTH KEYWORDS: ElementPropertyUpdate, AIElementUpdate
 */
export interface ElementPropertyUpdate {
  /** Canvas element ID to update */
  id: string
  /** Partial properties to merge into the element */
  updates: Record<string, unknown>
}

/**
 * Callback for receiving element property updates.
 * The builder dispatches updateElement() Redux action for each update.
 */
type ElementUpdateListener = (updates: ElementPropertyUpdate[]) => void

/**
 * Selection context from the builder — pushed alongside page info
 * so the AI knows which element the user has selected on the canvas.
 *
 * SOURCE OF TRUTH KEYWORDS: CanvasBridgeSelectionInfo, AISelectionContext
 */
export interface CanvasBridgeSelectionInfo {
  /** ID of the selected element */
  id: string
  /** Element type (e.g., 'frame', 'text', 'page') */
  type: string
  /** Display name of the element */
  name: string
  /** Parent ID of the selected element (null if root) */
  parentId: string | null
  /** Order of the selected element within its parent */
  order: number
  /**
   * Number of children inside this element. Only meaningful for
   * container types (frame, page). Used by insert-into-frame to
   * set the correct order for appended children.
   */
  childCount: number
}

/**
 * Resolved placement intent for the AI container — determines WHERE
 * on the canvas the new AI-generated content should appear.
 *
 * SOURCE OF TRUTH KEYWORDS: PlacementIntent, AIPlacementMode
 */
export type PlacementIntent =
  | { mode: 'insert-into-frame'; frameId: string; order: number }
  | { mode: 'insert-before'; parentId: string; insertOrder: number }
  | { mode: 'append-to-page'; pageElementId: string; order: number }
  | { mode: 'floating' }

/**
 * Page context info from the builder for element parenting and positioning.
 *
 * Includes page geometry (x, y, width) and breakpoint state so the widget
 * can calculate smart floating positions for canvas-floating placement mode.
 *
 * SOURCE OF TRUTH KEYWORDS: CanvasBridgePageInfo, CanvasBridgePageGeometry
 */
/**
 * Bounding box of a root-level element on the canvas.
 * Used by the floating placement algorithm to avoid overlapping
 * existing sections/components when placing AI-generated content.
 *
 * SOURCE OF TRUTH KEYWORDS: RootElementBounds, FloatingElementBounds
 */
export interface RootElementBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasBridgePageInfo {
  /** Page element ID to parent root elements under (null = floating) */
  pageElementId: string | null
  /** Number of existing children on the page (for order offset) */
  existingChildCount: number
  /** Currently selected element on the canvas (null = nothing selected) */
  selectedElement: CanvasBridgeSelectionInfo | null
  /** Page x position in canvas coordinates (for floating position calculation) */
  pageX: number
  /** Page y position in canvas coordinates (for floating position calculation) */
  pageY: number
  /** Page width in canvas coordinates (for floating position calculation) */
  pageWidth: number
  /** Whether the mobile breakpoint frame is active (shifts floating position right) */
  hasMobileBreakpoint: boolean
  /**
   * Bounding boxes of all root-level elements (parentId === null) on the canvas.
   * Used by the floating placement algorithm to find a clear spot for new
   * AI-generated content without overlapping existing elements.
   */
  rootElementBounds: RootElementBounds[]
}

// ============================================================================
// PLACEMENT RESOLUTION
// ============================================================================

/**
 * Pure function that resolves where to place the AI container based on
 * the current page info and selection state.
 *
 * Rules (priority order):
 * 1. Selected FRAME → insert-into-frame (content becomes a child of the frame)
 * 2. Selected non-frame, non-page element → insert-before (sibling placement)
 * 3. Page selected / nothing selected but page exists → append-to-page
 * 4. No page at all → floating (detached root element)
 *
 * SOURCE OF TRUTH KEYWORDS: resolvePlacement, AIPlacementResolver
 */
export function resolvePlacement(pageInfo: CanvasBridgePageInfo): PlacementIntent {
  const { pageElementId, existingChildCount, selectedElement } = pageInfo

  if (selectedElement && selectedElement.type !== 'page') {
    /**
     * FRAME SELECTED → insert content INSIDE the frame as a child.
     * The AI container becomes a direct child of the selected frame,
     * appended after any existing children.
     */
    if (selectedElement.type === 'frame') {
      return {
        mode: 'insert-into-frame',
        frameId: selectedElement.id,
        order: selectedElement.childCount,
      }
    }

    /**
     * NON-FRAME ELEMENT SELECTED → insert before it as a sibling.
     * Content goes into the same parent, at the same order position
     * (the selected element and everything after it shifts down).
     */
    if (selectedElement.parentId) {
      return {
        mode: 'insert-before',
        parentId: selectedElement.parentId,
        insertOrder: selectedElement.order,
      }
    }
  }

  /** Page exists — append to end (AI creates its own container frame on the page) */
  if (pageElementId) {
    return {
      mode: 'append-to-page',
      pageElementId,
      order: existingChildCount,
    }
  }

  /** No page at all — create as a floating root element on the canvas */
  return { mode: 'floating' }
}

// ============================================================================
// AI CONTAINER FACTORY
// ============================================================================

/**
 * Creates an AI-generated wrapper frame that acts as the parent for all
 * elements from a single ui-spec generation.
 *
 * WHY: Instead of dumping AI-generated elements directly into the main page
 * element, each generation gets its own container. This is safer because:
 * - AI content is isolated — easy to select, move, or delete as a group
 * - Doesn't interfere with existing page structure
 * - If generation fails, you delete one container instead of hunting children
 * - Each generation is clearly labeled in the element tree
 *
 * Placement-aware: Uses the resolved PlacementIntent to set parentId,
 * order, width, and positioning correctly for each mode.
 *
 * SOURCE OF TRUTH KEYWORDS: AIContainerFrame, AIGenerationWrapper
 */
export function createAIContainer(placement: PlacementIntent): FrameElement {
  /** Base container props shared across all placement modes */
  const base = {
    id: generateElementId(),
    type: 'frame' as const,
    name: '',
    height: 0,
    ...DEFAULT_FRAME_PROPS,
    styles: {
      ...DEFAULT_FRAME_STYLES,
      flexDirection: 'column' as const,
      /** Gap between child sections inside this container */
      gap: 24,
      alignItems: 'center' as const,
      /**
       * CRITICAL: flexWrap must be 'wrap' for auto-height to work.
       * Builder's computeFrameSizing() returns height: auto ONLY when
       * flexWrap === 'wrap'. Without it, this frame collapses to 0px.
       */
      flexWrap: 'wrap' as const,
      backgroundColor: 'transparent',
      padding: 0,
    },
  }

  switch (placement.mode) {
    case 'insert-into-frame':
      /** Insert as child of the selected frame — fills the frame width */
      return {
        ...base,
        x: 0,
        y: 0,
        width: 0,
        parentId: placement.frameId,
        order: placement.order,
        autoWidth: true,
      }

    case 'insert-before':
      /** Insert as sibling before selected element — same parent, same order (selected shifts down) */
      return {
        ...base,
        x: 0,
        y: 0,
        width: 0,
        parentId: placement.parentId,
        order: placement.insertOrder,
        autoWidth: true,
      }

    case 'append-to-page':
      /** Append to end of page children (existing behavior) */
      return {
        ...base,
        x: 0,
        y: 0,
        width: 0,
        parentId: placement.pageElementId,
        order: placement.order,
        autoWidth: true,
      }

    case 'floating':
      /** Detached root element — user must drag into page manually */
      return {
        ...base,
        x: 100,
        y: 100,
        width: 1440,
        parentId: null,
        order: 0,
        autoWidth: false,
      }
  }
}

// ============================================================================
// BRIDGE IMPLEMENTATION
// ============================================================================

/**
 * Callback signature for the "generation complete" signal.
 * Fired when a ui-spec stream finishes, so the staging panel
 * can transition a group from 'streaming' → 'ready'.
 */
type GenerationCompleteListener = () => void

/**
 * Callback for page info changes — fired whenever the builder pushes
 * updated page info (selection, child count, geometry) to the bridge.
 * Used by the MochiWidget to reactively display the current selection.
 */
type PageInfoChangeListener = (info: CanvasBridgePageInfo) => void

/**
 * Callback signature for the "builder ready" signal.
 * Fired when the website builder mounts and subscribes to the bridge,
 * so the MochiWidget can replay any buffered ui-render events that
 * arrived before the builder was available.
 */
type BuilderReadyListener = () => void

/**
 * Canvas Bridge — singleton pub-sub for delivering CanvasElements
 * from the Mochi widget to the website builder.
 *
 * Also carries page context so the widget can create properly
 * parented elements inside the page.
 *
 * CROSS-PAGE SAFETY: Uses a stream session system to prevent elements
 * from being delivered to the wrong page. When a generation stream starts,
 * the widget calls startStreamSession(pageElementId) to lock the stream to
 * a specific page. If the user navigates to a different page mid-stream,
 * pushElements() drops the elements instead of delivering them to the
 * wrong builder instance. This prevents the "same component on multiple
 * pages" bug caused by the singleton listener being overwritten on nav.
 */
class CanvasBridge {
  /** Active listener — only one builder can subscribe at a time */
  private listener: CanvasElementsListener | null = null

  /** Active listener for generation-complete signals */
  private completeListener: GenerationCompleteListener | null = null

  /** Active listener for builder-ready signals (buffer replay trigger) */
  private builderReadyListener: BuilderReadyListener | null = null

  /** Active listener for page info changes (selection updates for widget UI) */
  private pageInfoChangeListener: PageInfoChangeListener | null = null

  /**
   * Buffered elements — holds elements pushed before the builder subscribes.
   *
   * WHY: When navigating from dashboard → builder (e.g., AI creates a page
   * and immediately starts streaming ui-spec), elements arrive before the
   * builder component mounts and subscribes. Without buffering, those
   * elements are silently dropped. This array captures them so they can
   * be flushed to the builder as soon as it subscribes.
   */
  private pendingElements: CanvasElement[] = []

  /** Buffered push options — stored alongside pending elements for flush */
  private pendingOptions: PushElementsOptions | null = null

  /**
   * Active stream session — locks element delivery to a specific page.
   *
   * WHY: The singleton bridge has one listener slot. When the user navigates
   * from Page A to Page B mid-stream, Page B's builder overwrites the listener.
   * Without session scoping, remaining elements from the Page A stream would
   * be delivered to Page B's listener — placing content on the wrong page.
   *
   * The session captures the pageElementId at stream start. On each pushElements()
   * call, if the current pageInfo.pageElementId no longer matches the session's
   * target, the elements are dropped (logged as a cross-page guard).
   *
   * SOURCE OF TRUTH KEYWORDS: StreamSession, CrossPageGuard, PageScopedStream
   */
  private activeStreamSession: {
    /** The page element ID this stream targets */
    targetPageElementId: string | null
  } | null = null

  /** Page context from the active builder */
  private pageInfo: CanvasBridgePageInfo = {
    pageElementId: null,
    existingChildCount: 0,
    selectedElement: null,
    pageX: 0,
    pageY: 0,
    pageWidth: 1440,
    hasMobileBreakpoint: false,
    rootElementBounds: [],
  }

  /**
   * Subscribe to receive AI-generated canvas elements.
   * Called by the website builder component on mount.
   *
   * On subscription, any buffered elements (pushed before the builder
   * mounted) are immediately flushed to the new callback.
   *
   * @param callback - Function to call with the generated elements and optional push options
   * @returns Cleanup function to unsubscribe
   */
  subscribe(callback: CanvasElementsListener): () => void {
    this.listener = callback

    /** Flush any elements that arrived before the builder subscribed */
    if (this.pendingElements.length > 0) {
      callback(this.pendingElements, this.pendingOptions ?? undefined)
      this.pendingElements = []
      this.pendingOptions = null
    }

    /**
     * Signal that the builder is ready for events.
     * The MochiWidget listens for this to replay any buffered ui-render
     * events that arrived while the builder was navigating/mounting.
     * Fired AFTER flush so the page info is already set by the builder hook.
     */
    if (this.builderReadyListener) {
      this.builderReadyListener()
    }

    return () => {
      if (this.listener === callback) {
        this.listener = null
      }
    }
  }

  /**
   * Set page context info from the builder.
   * Called by useAICanvasBridge when the builder mounts or page/selection changes.
   *
   * @param info - Full page info including geometry and breakpoint state
   */
  setPageInfo(info: CanvasBridgePageInfo): void {
    this.pageInfo = { ...info }
    /** Notify the widget about selection/page changes for reactive UI */
    if (this.pageInfoChangeListener) {
      this.pageInfoChangeListener(this.pageInfo)
    }
  }

  /**
   * Get the current page context info.
   * Called by MochiWidget before calling specToCanvas.
   */
  getPageInfo(): CanvasBridgePageInfo {
    return { ...this.pageInfo }
  }

  /**
   * Start a stream session scoped to the current page.
   * Called by MochiWidget when a ui-spec stream begins (on 'start' event).
   * Captures the current pageElementId so pushElements() can verify that
   * elements are still being delivered to the correct page.
   *
   * @param targetPageElementId - The page element ID this stream targets
   */
  startStreamSession(targetPageElementId: string | null): void {
    this.activeStreamSession = { targetPageElementId }
    console.log(
      `[CanvasBridge] Stream session started — target page: ${targetPageElementId ?? '(floating)'}`
    )
  }

  /**
   * End the current stream session.
   * Called by MochiWidget when a ui-spec stream completes or is aborted.
   * Clears the session so the next stream can start fresh.
   */
  endStreamSession(): void {
    this.activeStreamSession = null
  }

  /**
   * Push AI-generated elements to the builder.
   * Called by the MochiWidget after spec-to-canvas conversion.
   *
   * CROSS-PAGE GUARD: If a stream session is active, verifies that the
   * current builder's pageElementId still matches the session's target.
   * If the user navigated to a different page mid-stream, elements are
   * dropped instead of being delivered to the wrong page. This prevents
   * the bug where AI-generated sections appear on multiple pages.
   *
   * If no builder is currently subscribed, elements are buffered in
   * pendingElements and will be flushed when the builder subscribes.
   * This handles the dashboard → builder navigation race condition.
   *
   * @param elements - CanvasElements in insertion order
   * @param options - Optional push options (e.g., shiftSiblings for insert-before)
   */
  pushElements(elements: CanvasElement[], options?: PushElementsOptions): void {
    if (elements.length === 0) return

    /**
     * CROSS-PAGE GUARD: Drop elements if the builder switched to a different
     * page since this stream session started. This is the core fix for the
     * "same component on multiple pages" bug.
     *
     * Skip the guard when:
     * - No session is active (non-streaming pushes like buffer replay)
     * - Session target is null (floating elements, not page-scoped)
     * - No builder is subscribed yet (elements go to buffer, will be
     *   validated again on flush via the builder-ready replay path)
     */
    if (
      this.activeStreamSession &&
      this.activeStreamSession.targetPageElementId !== null &&
      this.listener &&
      this.pageInfo.pageElementId !== null &&
      this.pageInfo.pageElementId !== this.activeStreamSession.targetPageElementId
    ) {
      console.warn(
        `[CanvasBridge] Cross-page guard: dropping ${elements.length} element(s). ` +
        `Stream target: ${this.activeStreamSession.targetPageElementId}, ` +
        `current page: ${this.pageInfo.pageElementId}`
      )
      return
    }

    if (this.listener) {
      this.listener(elements, options)
    } else {
      /** Buffer elements for delivery when the builder subscribes */
      this.pendingElements.push(...elements)
      /** Preserve options for the first push (container with shiftSiblings) */
      if (options && !this.pendingOptions) {
        this.pendingOptions = options
      }
    }
  }

  /**
   * Subscribe to generation-complete signals.
   * Called by useAICanvasBridge to know when a staging group is finished.
   *
   * @param callback - Called when a ui-spec stream finishes
   * @returns Cleanup function to unsubscribe
   */
  onGenerationComplete(callback: GenerationCompleteListener): () => void {
    this.completeListener = callback
    return () => {
      if (this.completeListener === callback) {
        this.completeListener = null
      }
    }
  }

  /**
   * Signal that the current AI generation stream has completed.
   * Called by MochiWidget in the onComplete callback of the spec converter.
   * The builder hook uses this to transition the staging group to 'ready'.
   */
  signalGenerationComplete(): void {
    if (this.completeListener) {
      this.completeListener()
    }
  }

  /**
   * Subscribe to builder-ready signals.
   * Called by MochiWidget to know when the builder mounts so it can
   * replay any buffered ui-render events through the jsonRenderAI pipeline.
   *
   * @param callback - Called when a builder subscribes to the bridge
   * @returns Cleanup function to unsubscribe
   */
  onBuilderReady(callback: BuilderReadyListener): () => void {
    this.builderReadyListener = callback
    return () => {
      if (this.builderReadyListener === callback) {
        this.builderReadyListener = null
      }
    }
  }

  /**
   * Subscribe to page info changes (selection, geometry, child count).
   * Called by MochiWidget to reactively display the current selection
   * indicator in the chat UI.
   *
   * @param callback - Called whenever setPageInfo() updates the bridge
   * @returns Cleanup function to unsubscribe
   */
  onPageInfoChange(callback: PageInfoChangeListener): () => void {
    this.pageInfoChangeListener = callback
    return () => {
      if (this.pageInfoChangeListener === callback) {
        this.pageInfoChangeListener = null
      }
    }
  }

  // ========================================================================
  // ELEMENT PROPERTY UPDATES — Connect forms, products, etc. to existing elements
  // ========================================================================

  /** Listener for element property updates */
  private updateListener: ElementUpdateListener | null = null

  /**
   * Subscribe to element property updates.
   * Called by the builder hook to receive updates for existing elements.
   */
  subscribeToUpdates(callback: ElementUpdateListener): () => void {
    this.updateListener = callback
    return () => {
      if (this.updateListener === callback) {
        this.updateListener = null
      }
    }
  }

  /**
   * Push property updates for existing elements on the canvas.
   * Used by the AI to connect forms, products, etc. to placeholder elements.
   *
   * @param updates - Array of element ID + partial property updates
   */
  pushElementUpdates(updates: ElementPropertyUpdate[]): void {
    if (updates.length === 0) return
    if (this.updateListener) {
      this.updateListener(updates)
    } else {
      console.warn('[CanvasBridge] No update listener — builder may not be mounted')
    }
  }

  /**
   * Find elements of a specific type on the current page.
   * Used by the AI to locate existing Form/Payment/etc. elements
   * before pushing property updates.
   *
   * @param elementType - The element type to search for (e.g., 'form', 'payment')
   * @returns Array of matching element IDs and names from the page info
   */
  findElementsByType(elementType: string): Array<{ id: string; name: string }> {
    /** This requires the builder to provide element info — delegate to the subscriber */
    if (this.elementFinderCallback) {
      return this.elementFinderCallback(elementType)
    }
    return []
  }

  /** Callback for finding elements by type — set by builder hook */
  private elementFinderCallback: ((type: string) => Array<{ id: string; name: string }>) | null = null

  /**
   * Register a callback for finding elements by type on the canvas.
   * Called by the builder hook on mount.
   */
  registerElementFinder(callback: (type: string) => Array<{ id: string; name: string }>): () => void {
    this.elementFinderCallback = callback
    return () => {
      if (this.elementFinderCallback === callback) {
        this.elementFinderCallback = null
      }
    }
  }

  /** Whether a builder is currently subscribed and ready to receive */
  get isBuilderActive(): boolean {
    return this.listener !== null
  }
}

/** Singleton instance — shared between widget and builder */
export const canvasBridge = new CanvasBridge()
