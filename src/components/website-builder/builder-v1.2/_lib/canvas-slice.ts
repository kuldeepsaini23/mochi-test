/**
 * ============================================================================
 * CANVAS SLICE - Redux Toolkit Slice for Multi-Page Canvas State
 * ============================================================================
 *
 * This slice manages the SINGLE SOURCE OF TRUTH for all canvas elements
 * across MULTIPLE PAGES.
 *
 * ============================================================================
 * PAGE ARCHITECTURE
 * ============================================================================
 *
 * PAGES: Each page encapsulates:
 * - Its own canvas (page element + all child elements)
 * - Its own viewport (pan/zoom position)
 * - Its own selection state
 * - Its own undo/redo history (LOCAL to the page)
 *
 * This means:
 * - Undo in Page A doesn't affect Page B
 * - Each page has independent element trees
 * - Users can switch between pages seamlessly
 *
 * ============================================================================
 * O(1) LOOKUPS - Maintained at multiple levels
 * ============================================================================
 *
 * - `pages: Record<string, PageState>` - O(1) page lookup
 * - Each page's `elements: Record<string, CanvasElement>` - O(1) element lookup
 * - Each page's `childrenMap: Record<string, string[]>` - O(1) children lookup
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE REMINDER
 * ============================================================================
 *
 * REDUX IS FOR PERSISTENT DATA ONLY:
 * - Element definitions (position, size, style, parent)
 * - Selection state
 * - Viewport (pan, zoom)
 * - Tool mode
 * - Undo/redo history
 *
 * REFS ARE FOR INTERACTION DATA (see hooks):
 * - Drag position during drag (60fps updates)
 * - Resize dimensions during resize
 * - Sibling transforms during sorting
 *
 * FLOW:
 * 1. User starts dragging → Initialize state in REF
 * 2. User moves mouse → Update REF + DOM directly (60fps)
 * 3. User releases → Dispatch Redux action ONCE with final state
 *
 * DO NOT dispatch actions on every pointer move - it will kill performance!
 * ============================================================================
 */

import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit'
import type {
  Breakpoint,
  CanvasElement,
  CanvasSnapshot,
  CanvasState,
  ElementStyles,
  FrameElement,
  PageElement,
  ToolMode,
  ViewportState,
  PageState,
  PagesState,
  ResponsiveSettingsOverrides,
  // Backwards compatibility alias
  ResponsivePropertyOverrides,
  // Local Components types
  LocalComponent,
  ComponentInstanceElement,
  ExposedProp,
} from './types'
import {
  DEFAULT_PAGE_PROPS,
  DEFAULT_PAGE_STYLES,
  DEFAULT_PAGE_CANVAS_PROPS,
} from './types'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique ID for new elements.
 * Format: el_[timestamp]_[random] for guaranteed uniqueness.
 */
export function generateElementId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Generate unique ID for new pages.
 * Format: page_[timestamp]_[random] for guaranteed uniqueness.
 */
export function generatePageId(): string {
  return `page_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Rebuild childrenMap from elements.
 *
 * Called after mutations that change parent-child relationships.
 * Ensures O(1) children lookup is always accurate.
 *
 * @param elements - Current elements record
 * @returns New childrenMap with sorted children arrays
 */
function rebuildChildrenMap(
  elements: Record<string, CanvasElement>
): Record<string, string[]> {
  const childrenMap: Record<string, string[]> = {}

  // Group elements by parentId
  Object.values(elements).forEach((element) => {
    const parentKey = element.parentId ?? '__root__'
    if (!childrenMap[parentKey]) {
      childrenMap[parentKey] = []
    }
    childrenMap[parentKey].push(element.id)
  })

  // Sort each group by order for consistent render order
  Object.keys(childrenMap).forEach((key) => {
    childrenMap[key].sort((a, b) => {
      const elA = elements[a]
      const elB = elements[b]
      return (elA?.order ?? 0) - (elB?.order ?? 0)
    })
  })

  return childrenMap
}

/**
 * Create a deep copy snapshot of canvas state for history.
 * Used for undo/redo functionality.
 */
function createSnapshot(
  canvas: CanvasState,
  description?: string
): CanvasSnapshot {
  return {
    canvas: {
      elements: { ...canvas.elements },
      rootIds: [...canvas.rootIds],
      childrenMap: Object.fromEntries(
        Object.entries(canvas.childrenMap).map(([k, v]) => [k, [...v]])
      ),
    },
    timestamp: Date.now(),
    description,
  }
}

// ============================================================================
// DEFAULT VIEWPORT - Simple defaults, actual centering done client-side
// ============================================================================

/**
 * Default viewport state used on initial render.
 *
 * ============================================================================
 * CLIENT-SIDE FOCUS STRATEGY
 * ============================================================================
 *
 * We no longer attempt server-side viewport calculations because:
 * - Server doesn't know the user's actual screen dimensions
 * - Any hardcoded values are just guesses that won't fit most screens
 *
 * Instead, we use simple defaults here and the Canvas component will:
 * 1. Render with these defaults
 * 2. Measure the actual viewport dimensions on mount
 * 3. Focus/center the page element to fit the visible area
 *
 * This approach is simpler and always produces correct results.
 */
const DEFAULT_VIEWPORT: ViewportState = {
  panX: 0,
  panY: 0,
  zoom: 1,
}

// ============================================================================
// INITIAL STATE
// ============================================================================

/**
 * Create a new page with its own page element and canvas.
 *
 * @param pageId - Unique ID for the page
 * @param pageName - Human-readable display name for the page (e.g., "Home Page")
 * @param pageSlug - URL path slug for routing (e.g., "/homepage")
 * @returns Complete PageState with page element, viewport, selection, and history
 */
function createNewPage(
  pageId: string,
  pageName: string,
  pageSlug: string
): PageState {
  const pageElementId = `page_${pageId}`
  const elements: Record<string, CanvasElement> = {}
  const now = Date.now()

  /**
   * Page element - the main container for website content.
   *
   * SPECIAL BEHAVIOR:
   * - Cannot be deleted (protected in deleteElement action)
   * - Only resizable from top/bottom edges (width is fixed)
   * - Represents a desktop viewport at 1440px width
   *
   * POSITIONING:
   * - Page is positioned at (0, 0) in canvas coordinates
   * - The viewport (pan/zoom) is calculated to center the page on screen
   * - This simplifies calculations and keeps the page at the canvas origin
   *
   * STYLES:
   * - All visual CSS properties are stored in the `styles` object
   * - This allows dynamic spreading onto React elements
   */
  const page: PageElement = {
    id: pageElementId,
    type: 'page',
    name: pageName,
    x: 0,
    y: 0,
    width: DEFAULT_PAGE_CANVAS_PROPS.pageWidth,
    height: DEFAULT_PAGE_CANVAS_PROPS.pageHeight,
    parentId: null,
    order: 0,
    visible: true,
    locked: false,
    // Pages default to container ON for centered content
    container: DEFAULT_PAGE_PROPS.container,
    // All visual/layout CSS properties in one spreadable object
    styles: {
      ...DEFAULT_PAGE_STYLES,
      backgroundColor: DEFAULT_PAGE_CANVAS_PROPS.pageBackgroundColor,
    },
  }

  // Add page element to elements
  elements[pageElementId] = page

  return {
    info: {
      id: pageId,
      name: pageName, // Human-readable name (e.g., "Home Page")
      slug: pageSlug, // URL path for routing (e.g., "/homepage")
      createdAt: now,
      updatedAt: now,
    },
    canvas: {
      elements,
      rootIds: [pageElementId],
      childrenMap: rebuildChildrenMap(elements),
    },
    viewport: { ...DEFAULT_VIEWPORT },
    selection: { selectedIds: [] },
    history: { past: [], future: [], maxSize: 50 },
  }
}

/**
 * Create empty initial pages state.
 *
 * WHY EMPTY: Real data is loaded from the database via BuilderClient.
 * The BuilderClient component dispatches loadPages() on mount with
 * data from the server. This empty state prevents showing mock/fake
 * data before the real data loads.
 *
 * SELECTORS: All selectors use optional chaining and return safe defaults
 * when no active page exists (empty arrays, null, default viewport, etc.)
 */
function createEmptyPagesState(): PagesState {
  return {
    pages: {},
    pageOrder: [],
    activePageId: '', // Empty string - no page selected until data loads
  }
}

/**
 * Complete initial state for the builder.
 *
 * ============================================================================
 * MULTI-PAGE ARCHITECTURE
 * ============================================================================
 *
 * The state is now organized around pages:
 * - `pages`: Contains all page data (PagesState)
 * - `toolMode`: Global tool mode (shared across pages)
 *
 * Each page contains its own:
 * - canvas (elements, rootIds, childrenMap)
 * - viewport (pan, zoom)
 * - selection (selectedIds)
 * - history (past, future, maxSize)
 *
 * This ensures undo/redo is LOCAL to each page.
 */
/**
 * Canvas error state - set when a critical integrity violation is detected.
 * When set, the UI should display an error banner and potentially block interactions.
 */
interface CanvasError {
  type: 'DUPLICATE_ELEMENT' | 'DUPLICATE_PAGE' | 'INTEGRITY_ERROR'
  message: string
  elementId?: string
  timestamp: number
}

interface BuilderSliceState {
  /** All pages - each with its own canvas, viewport, selection, and history */
  pages: PagesState
  /** Current tool mode (global - shared across all pages) */
  toolMode: ToolMode
  /** Active stroke color for the pen/pencil tool (hex string) */
  penStrokeColor: string
  /** Active brush size for the pen/pencil tool (stroke width in px) */
  penBrushSize: number
  /** Active stroke opacity for the pen/pencil tool (0–1) */
  penStrokeOpacity: number
  /**
   * Critical error state - set when canvas integrity is compromised.
   * When non-null, user should be prompted to refresh.
   */
  canvasError: CanvasError | null
  /**
   * Preview mode toggle (global).
   * When true, displays the active page's content in a non-interactive preview overlay.
   * All editing interactions are disabled while preview mode is active.
   */
  previewMode: boolean
  /**
   * Current breakpoint editing mode (global - UI state only).
   *
   * Determines which breakpoint's styles are shown and edited in the properties panel:
   * - 'desktop': Edit element.styles (base/desktop styles)
   * - 'mobile': Edit element.responsiveStyles.mobile (mobile overrides)
   *
   * This is a UI-only state and is NOT persisted to the database.
   * The canvas always shows desktop styles in the main view, while the
   * breakpoint mobile frame shows merged styles (base + mobile overrides).
   */
  editingBreakpoint: Breakpoint

  // ==========================================================================
  // LOCAL COMPONENTS - User-created reusable components
  // ==========================================================================

  /**
   * Local Components library (scoped to website).
   *
   * O(1) lookup by component ID.
   * Components are saved at the WEBSITE level and can be used on any page.
   */
  localComponents: Record<string, LocalComponent>

  /**
   * Tracks if local components have been loaded from the database.
   * This prevents multiple hook instances from overwriting each other's changes
   * when they each try to load from DB independently.
   *
   * Set to true after the first loadLocalComponents dispatch.
   * Subsequent hook instances should NOT overwrite Redux with stale DB data.
   */
  localComponentsLoaded: boolean

  /**
   * Currently editing component ID.
   *
   * When non-null, the user is in "Edit Component" mode:
   * - They are editing the component definition directly
   * - Changes propagate to ALL instances of this component
   * - The sidebar shows component-specific tools
   * - Exiting edit mode returns to normal canvas editing
   */
  editingComponentId: string | null
}

/**
 * Initial state for the builder - starts EMPTY.
 *
 * Real data is loaded from the database by BuilderClient on mount.
 * This empty state ensures no mock data is displayed before real data loads.
 */
const initialState: BuilderSliceState = {
  pages: createEmptyPagesState(),
  toolMode: 'select',
  penStrokeColor: '#000000',
  penBrushSize: 3,
  penStrokeOpacity: 1,
  canvasError: null,
  previewMode: false,
  editingBreakpoint: 'desktop', // Default to desktop editing mode
  // Local Components - starts empty, loaded from database
  localComponents: {},
  localComponentsLoaded: false, // Set to true after first load from DB
  editingComponentId: null,
}

// ============================================================================
// HELPER - Get active page (for cleaner reducer code)
// ============================================================================

/**
 * Helper to get the active page from state.
 * Throws if active page doesn't exist (should never happen in normal operation).
 */
function getActivePage(state: BuilderSliceState): PageState {
  const page = state.pages.pages[state.pages.activePageId]
  if (!page) {
    throw new Error(`Active page not found: ${state.pages.activePageId}`)
  }
  return page
}

// ============================================================================
// SLICE DEFINITION
// ============================================================================

/**
 * Canvas Builder Slice - Multi-Page Architecture
 *
 * REMEMBER: This Redux state is the SINGLE SOURCE OF TRUTH for element data.
 *
 * ============================================================================
 * KEY CHANGE: All element operations now work on the ACTIVE PAGE
 * ============================================================================
 *
 * - `addElement`, `updateElement`, `deleteElement` → affect active page
 * - `undo`, `redo` → affect active page's history ONLY
 * - Page-specific actions for create/switch/rename/delete pages
 *
 * Actions should ONLY be dispatched when:
 * - Adding/deleting elements
 * - After drag/resize COMPLETES (not during)
 * - Changing selection
 * - Changing tool mode
 * - Pan/zoom changes
 * - Page operations (create, switch, rename, delete)
 *
 * DO NOT dispatch during 60fps interactions - use refs instead!
 */
export const canvasSlice = createSlice({
  name: 'canvas',
  initialState,
  reducers: {
    // ========================================================================
    // PAGE OPERATIONS - Create, switch, rename, delete pages
    // ========================================================================

    /**
     * Create a new page and optionally switch to it.
     *
     * @param action.payload.name - Human-readable display name for the page (e.g., "Home Page")
     * @param action.payload.slug - URL path slug for routing (e.g., "/homepage")
     * @param action.payload.switchTo - If true, switch to the new page (default: true)
     */
    createPage: (
      state,
      action: PayloadAction<{ name: string; slug: string; switchTo?: boolean }>
    ) => {
      const { name, slug, switchTo = true } = action.payload
      const pageId = generatePageId()
      const newPage = createNewPage(pageId, name, slug)

      // Add page to state
      state.pages.pages[pageId] = newPage
      state.pages.pageOrder.push(pageId)

      // Optionally switch to the new page
      if (switchTo) {
        state.pages.activePageId = pageId
      }
    },

    /**
     * Switch to a different page.
     *
     * Preserves all state in the previous page (viewport, selection, history).
     * The new page's viewport/selection/history become active.
     */
    switchPage: (state, action: PayloadAction<string>) => {
      const pageId = action.payload
      if (!state.pages.pages[pageId]) {
        console.warn(`Page not found: ${pageId}`)
        return
      }
      state.pages.activePageId = pageId
    },

    /**
     * Rename a page.
     *
     * Updates both the page info and the page element name.
     */
    renamePage: (
      state,
      action: PayloadAction<{ pageId: string; newName: string }>
    ) => {
      const { pageId, newName } = action.payload
      const page = state.pages.pages[pageId]
      if (!page) {
        console.warn(`Page not found: ${pageId}`)
        return
      }

      // Update page info
      page.info.name = newName
      page.info.updatedAt = Date.now()

      // Also update the page element name to match
      const pageElementId = page.canvas.rootIds.find(
        (id) => page.canvas.elements[id]?.type === 'page'
      )
      if (pageElementId && page.canvas.elements[pageElementId]) {
        page.canvas.elements[pageElementId].name = newName
      }
    },

    /**
     * Update a page's URL slug/path.
     *
     * Updates both the page info slug and the page element slug.
     * The slug is used for URL routing (e.g., "/homepage", "/about-us").
     */
    updatePageSlug: (
      state,
      action: PayloadAction<{ pageId: string; newSlug: string }>
    ) => {
      const { pageId, newSlug } = action.payload
      const page = state.pages.pages[pageId]
      if (!page) {
        console.warn(`Page not found: ${pageId}`)
        return
      }

      // Ensure slug starts with /
      const normalizedSlug = newSlug.startsWith('/') ? newSlug : `/${newSlug}`

      // Update page info
      page.info.slug = normalizedSlug
      page.info.updatedAt = Date.now()

      // Also update the page element slug to match
      const pageElementId = page.canvas.rootIds.find(
        (id) => page.canvas.elements[id]?.type === 'page'
      )
      if (pageElementId && page.canvas.elements[pageElementId]) {
        ;(page.canvas.elements[pageElementId] as { slug?: string }).slug =
          normalizedSlug
      }
    },

    /**
     * Update a page's dynamic settings (CMS table connection and slug column).
     * Called after saving dynamic settings in the builder settings dialog
     * to keep Redux in sync with the database immediately.
     *
     * SOURCE OF TRUTH: PageDynamicSettings, CmsSlugColumnSlug
     */
    updatePageDynamicSettings: (
      state,
      action: PayloadAction<{ pageId: string; cmsTableId: string | null; cmsSlugColumnSlug: string | null }>
    ) => {
      const { pageId, cmsTableId, cmsSlugColumnSlug } = action.payload
      const page = state.pages.pages[pageId]
      if (!page) return

      page.info.cmsTableId = cmsTableId
      page.info.cmsSlugColumnSlug = cmsSlugColumnSlug
      page.info.updatedAt = Date.now()

      /**
       * SYNC targetPageSlugColumn on ALL elements that reference this page.
       * WHY: SmartCMS lists, link elements, and button elements cache the
       * target page's slug column as targetPageSlugColumn. When the user
       * changes the slug column in page settings, the cached value becomes
       * stale. This sync ensures published/live mode uses the correct slug
       * column (published mode has no Redux to live-lookup page infos).
       *
       * SOURCE OF TRUTH: TargetPageSlugColumnSync
       */
      const newSlugCol = cmsSlugColumnSlug ?? undefined
      for (const pg of Object.values(state.pages.pages)) {
        if (!pg?.canvas?.elements) continue
        for (const el of Object.values(pg.canvas.elements)) {
          if (!el) continue
          // SmartCMS list elements, link elements, and button elements all
          // have targetPageId + targetPageSlugColumn for dynamic page linking
          const elem = el as { targetPageId?: string; targetPageSlugColumn?: string }
          if (elem.targetPageId === pageId) {
            elem.targetPageSlugColumn = newSlugCol
          }
        }
      }
    },

    /**
     * Delete a page.
     *
     * Cannot delete the last remaining page.
     * If deleting the active page, switches to another page first.
     */
    deletePage: (state, action: PayloadAction<string>) => {
      const pageId = action.payload

      // Prevent deleting the last page
      if (state.pages.pageOrder.length <= 1) {
        console.warn('Cannot delete the last page')
        return
      }

      // If deleting active page, switch to another first
      if (state.pages.activePageId === pageId) {
        const currentIndex = state.pages.pageOrder.indexOf(pageId)
        const newIndex = currentIndex === 0 ? 1 : currentIndex - 1
        state.pages.activePageId = state.pages.pageOrder[newIndex]
      }

      // Remove from order array and pages record
      state.pages.pageOrder = state.pages.pageOrder.filter(
        (id) => id !== pageId
      )
      delete state.pages.pages[pageId]
    },

    /**
     * Reorder pages in the sidebar.
     */
    reorderPages: (state, action: PayloadAction<string[]>) => {
      state.pages.pageOrder = action.payload
    },

    /**
     * Duplicate a page with all its children (root page element and descendants only).
     *
     * ============================================================================
     * CRITICAL: All element IDs are regenerated to prevent collisions
     * ============================================================================
     *
     * This action:
     * 1. Deep clones the source page's root page element and ALL its descendants
     * 2. Regenerates ALL element IDs (page element + all children)
     * 3. Updates all parentId references to use the new IDs
     * 4. Creates a new page with fresh viewport, selection, and history
     * 5. Does NOT switch to the new page (caller decides when to switch)
     *
     * WHAT GETS DUPLICATED:
     * - The root page element (type: 'page')
     * - All elements that are descendants of the page element
     * - All element properties (styles, responsive styles, settings, etc.)
     *
     * WHAT DOES NOT GET DUPLICATED:
     * - Floating elements on the canvas that aren't children of the page
     * - Viewport state (fresh pan/zoom)
     * - Selection state (empty)
     * - Undo/redo history (fresh)
     *
     * @param sourcePageId - The ID of the page to duplicate
     * @param newName - Display name for the duplicated page
     * @param newSlug - URL slug for the duplicated page (must be unique)
     * @returns The new page ID (accessible via state after dispatch)
     */
    duplicatePage: (
      state,
      action: PayloadAction<{
        sourcePageId: string
        newName: string
        newSlug: string
      }>
    ) => {
      const { sourcePageId, newName, newSlug } = action.payload
      const sourcePage = state.pages.pages[sourcePageId]

      if (!sourcePage) {
        console.warn(`[duplicatePage] Source page not found: ${sourcePageId}`)
        return
      }

      // ========================================================================
      // 1. Find the root page element (type: 'page') in the source
      // ========================================================================
      const sourcePageElementId = sourcePage.canvas.rootIds.find(
        (id) => sourcePage.canvas.elements[id]?.type === 'page'
      )

      if (!sourcePageElementId) {
        console.warn(`[duplicatePage] No page element found in source page`)
        return
      }

      // ========================================================================
      // 2. Collect all descendant element IDs (page element + all children recursively)
      // ========================================================================
      const elementsToDuplicate = new Set<string>()

      /**
       * Recursively collect element and all its descendants.
       */
      function collectDescendants(elementId: string) {
        elementsToDuplicate.add(elementId)
        const children = sourcePage.canvas.childrenMap[elementId] || []
        for (const childId of children) {
          collectDescendants(childId)
        }
      }

      // Start from the page element
      collectDescendants(sourcePageElementId)

      // ========================================================================
      // 3. Create ID mapping (oldId → newId) for all elements
      // ========================================================================
      const idMapping: Record<string, string> = {}

      for (const oldId of elementsToDuplicate) {
        // Generate new unique ID for each element
        idMapping[oldId] = generateElementId()
      }

      // ========================================================================
      // 4. Deep clone elements with new IDs and updated parentId references
      // ========================================================================
      const newElements: Record<string, CanvasElement> = {}

      for (const oldId of elementsToDuplicate) {
        const sourceElement = sourcePage.canvas.elements[oldId]
        if (!sourceElement) continue

        const newId = idMapping[oldId]

        // Deep clone the element
        const clonedElement: CanvasElement = JSON.parse(JSON.stringify(sourceElement))

        // Update the element's own ID
        clonedElement.id = newId

        // Update parentId to point to the new parent's ID
        // Root page element has parentId: null, so no mapping needed for that
        if (clonedElement.parentId && idMapping[clonedElement.parentId]) {
          clonedElement.parentId = idMapping[clonedElement.parentId]
        }

        // If this is the page element, update its name to match the new page name
        if (clonedElement.type === 'page') {
          clonedElement.name = newName
        }

        newElements[newId] = clonedElement
      }

      // ========================================================================
      // 5. Build rootIds and childrenMap for the new page
      // ========================================================================
      const newPageElementId = idMapping[sourcePageElementId]
      const newRootIds = [newPageElementId]

      // Rebuild childrenMap from the cloned elements
      const newChildrenMap = rebuildChildrenMap(newElements)

      // ========================================================================
      // 6. Create the new page with fresh state
      // ========================================================================
      const newPageId = generatePageId()
      const now = Date.now()

      // Ensure slug starts with /
      const normalizedSlug = newSlug.startsWith('/') ? newSlug : `/${newSlug}`

      const newPage: PageState = {
        info: {
          id: newPageId,
          name: newName,
          slug: normalizedSlug,
          createdAt: now,
          updatedAt: now,
        },
        canvas: {
          elements: newElements,
          rootIds: newRootIds,
          childrenMap: newChildrenMap,
        },
        // Fresh viewport - will be centered by the canvas on mount
        viewport: {
          panX: 0,
          panY: 0,
          zoom: 1,
        },
        // Empty selection
        selection: {
          selectedIds: [],
        },
        // Fresh history (no undo/redo for the duplicate)
        history: {
          past: [],
          future: [],
          maxSize: 50,
        },
      }

      // ========================================================================
      // 7. Add the new page to state (but don't switch to it)
      // ========================================================================
      state.pages.pages[newPageId] = newPage
      state.pages.pageOrder.push(newPageId)
    },

    // ========================================================================
    // ELEMENT CRUD OPERATIONS - All operate on ACTIVE PAGE
    // ========================================================================

    /**
     * Add a new element to the ACTIVE PAGE.
     *
     * WHEN TO USE: After frame creation completes (not during drawing).
     *
     * Automatically:
     * - Adds to elements record
     * - Updates rootIds if root element
     * - Rebuilds childrenMap
     * - Saves to page-local history for undo
     *
     * CRITICAL SAFEGUARDS:
     * - REJECTS duplicate IDs (element with same ID already exists)
     * - REJECTS duplicate Page elements (only ONE page element per page allowed)
     * - Sets canvasError state if violation detected
     */
    addElement: (state, action: PayloadAction<CanvasElement>) => {
      const element = action.payload
      const page = getActivePage(state)

      // ======================================================================
      // CRITICAL SAFEGUARD #1: Prevent duplicate IDs
      // If an element with this ID already exists, this is a critical bug!
      // ======================================================================
      if (page.canvas.elements[element.id]) {
        console.error(
          `[CANVAS CRITICAL] Attempted to add duplicate element ID: ${element.id}. ` +
            `This is a bug - duplicate IDs should NEVER exist!`
        )
        // Set error state for UI to display
        state.canvasError = {
          type: 'DUPLICATE_ELEMENT',
          message:
            'A critical error occurred: duplicate element detected. Please refresh the page.',
          elementId: element.id,
          timestamp: Date.now(),
        }
        return // REJECT the operation
      }

      // ======================================================================
      // CRITICAL SAFEGUARD #2: Prevent duplicate Page elements
      // Only ONE page element is allowed per page - page elements are the foundation!
      // ======================================================================
      if (element.type === 'page') {
        const existingPageElement = Object.values(page.canvas.elements).find(
          (el) => el.type === 'page'
        )
        if (existingPageElement) {
          console.error(
            `[CANVAS CRITICAL] Attempted to add second Page element. ` +
              `Page already has page element: ${existingPageElement.id}. New page element ID: ${element.id}. ` +
              `Only ONE page element per page is allowed!`
          )
          state.canvasError = {
            type: 'DUPLICATE_PAGE',
            message:
              'A critical error occurred: duplicate page element detected. Please refresh the page.',
            elementId: element.id,
            timestamp: Date.now(),
          }
          return // REJECT the operation
        }
      }

      // Save current state to page-local history before mutation
      page.history.past.push(createSnapshot(page.canvas, 'Add element'))
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = [] // Clear redo stack on new action

      // Update page timestamp
      page.info.updatedAt = Date.now()

      // Add element to record
      page.canvas.elements[element.id] = element

      // Update rootIds if this is a root element
      if (element.parentId === null) {
        // SAFEGUARD: Ensure we don't add duplicate rootIds
        if (!page.canvas.rootIds.includes(element.id)) {
          page.canvas.rootIds.push(element.id)
        }
      }

      // Rebuild children map for O(1) lookups
      page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)
    },

    /**
     * Insert an element with optional sibling order shifting.
     *
     * Used by the AI canvas bridge when placing content BEFORE a selected
     * element. When shiftSiblings is true, all existing siblings with
     * order >= the new element's order get their order incremented by 1,
     * making room for the new element at the desired position.
     *
     * Has the same safeguards as addElement (no duplicate IDs, no duplicate pages).
     *
     * SOURCE OF TRUTH KEYWORDS: insertElement, AIInsertElement, ShiftSiblingOrder
     */
    insertElement: (
      state,
      action: PayloadAction<{ element: CanvasElement; shiftSiblings?: boolean }>
    ) => {
      const { element, shiftSiblings } = action.payload
      const page = getActivePage(state)

      // ======================================================================
      // CRITICAL SAFEGUARD #1: Prevent duplicate IDs (same as addElement)
      // ======================================================================
      if (page.canvas.elements[element.id]) {
        console.error(
          `[CANVAS CRITICAL] insertElement: duplicate element ID: ${element.id}`
        )
        state.canvasError = {
          type: 'DUPLICATE_ELEMENT',
          message:
            'A critical error occurred: duplicate element detected. Please refresh the page.',
          elementId: element.id,
          timestamp: Date.now(),
        }
        return
      }

      // ======================================================================
      // CRITICAL SAFEGUARD #2: Prevent duplicate Page elements
      // ======================================================================
      if (element.type === 'page') {
        const existingPageElement = Object.values(page.canvas.elements).find(
          (el) => el.type === 'page'
        )
        if (existingPageElement) {
          console.error(
            `[CANVAS CRITICAL] insertElement: duplicate page element. Existing: ${existingPageElement.id}`
          )
          state.canvasError = {
            type: 'DUPLICATE_PAGE',
            message:
              'A critical error occurred: duplicate page element detected. Please refresh the page.',
            elementId: element.id,
            timestamp: Date.now(),
          }
          return
        }
      }

      // Save current state to page-local history before mutation
      page.history.past.push(createSnapshot(page.canvas, 'Insert element'))
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []

      page.info.updatedAt = Date.now()

      /**
       * Shift sibling orders if needed — push existing elements down to
       * make room for the new element at its desired order position.
       */
      if (shiftSiblings && element.parentId !== null) {
        const targetOrder = element.order
        for (const el of Object.values(page.canvas.elements)) {
          if (el.parentId === element.parentId && el.order >= targetOrder) {
            el.order += 1
          }
        }
      }

      // Add element to canvas
      page.canvas.elements[element.id] = element

      // Update rootIds if this is a root element (floating)
      if (element.parentId === null) {
        if (!page.canvas.rootIds.includes(element.id)) {
          page.canvas.rootIds.push(element.id)
        }
      }

      // Rebuild children map for O(1) lookups
      page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)
    },

    /**
     * Update an existing element's properties in the ACTIVE PAGE.
     *
     * WHEN TO USE:
     * - After resize COMPLETES (dispatch final dimensions)
     * - After drag COMPLETES (dispatch final position)
     * - Changing element properties (color, name, etc.)
     *
     * DO NOT use during drag/resize - update refs instead!
     */
    updateElement: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<CanvasElement> }>
    ) => {
      const { id, updates } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (!existing) return

      // Save to page-local history
      page.history.past.push(createSnapshot(page.canvas, 'Update element'))
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Apply updates (type assertion needed for partial updates)
      page.canvas.elements[id] = { ...existing, ...updates } as CanvasElement

      // Rebuild childrenMap if parent or order changed
      if ('parentId' in updates || 'order' in updates) {
        // Update rootIds if parentId changed
        if ('parentId' in updates) {
          if (updates.parentId === null && !page.canvas.rootIds.includes(id)) {
            page.canvas.rootIds.push(id)
          } else if (
            updates.parentId !== null &&
            page.canvas.rootIds.includes(id)
          ) {
            page.canvas.rootIds = page.canvas.rootIds.filter(
              (rid) => rid !== id
            )
          }
        }
        page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)
      }

      // ========================================================================
      // MASTER COMPONENT SYNC - Sync to LocalComponent.sourceTree
      // ========================================================================
      // When a primary instance (master) is edited, replace sourceTree.rootElement
      // with the updated element so new instances use the new styles.
      // ========================================================================
      if (existing.type === 'component') {
        const instance = page.canvas.elements[id]
        const componentId = (existing as any).componentId
        const component = state.localComponents[componentId]

        if (component && component.primaryInstanceId === id) {
          // Replace the rootElement with the updated instance
          state.localComponents[componentId] = {
            ...component,
            sourceTree: {
              ...component.sourceTree,
              rootElement: {
                ...component.sourceTree.rootElement,
                ...instance,
                // Keep the original rootElement's ID and type
                id: component.sourceTree.rootElement.id,
                type: component.sourceTree.rootElement.type,
              } as CanvasElement,
            },
            updatedAt: Date.now(),
          }
        }
      }
    },

    /**
     * Delete an element and all its descendants from the ACTIVE PAGE.
     *
     * Recursively removes all children to prevent orphaned elements.
     *
     * PROTECTED ELEMENTS: Page elements cannot be deleted directly.
     * This prevents accidental removal of the main page container.
     */
    deleteElement: (state, action: PayloadAction<string>) => {
      const id = action.payload
      const page = getActivePage(state)
      const element = page.canvas.elements[id]
      if (!element) return

      // Prevent deletion of page elements - they are protected
      if (element.type === 'page') {
        console.warn('Page elements cannot be deleted')
        return
      }

      // Save to page-local history
      page.history.past.push(createSnapshot(page.canvas, 'Delete element'))
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Recursively collect all descendant IDs
      const idsToDelete: string[] = []
      const collectDescendants = (elementId: string) => {
        idsToDelete.push(elementId)
        const childIds = page.canvas.childrenMap[elementId] || []
        childIds.forEach(collectDescendants)
      }
      collectDescendants(id)

      // Delete all collected elements
      idsToDelete.forEach((deleteId) => {
        delete page.canvas.elements[deleteId]
      })

      // Update rootIds
      page.canvas.rootIds = page.canvas.rootIds.filter(
        (rid) => !idsToDelete.includes(rid)
      )

      // Clear deleted elements from selection
      page.selection.selectedIds = page.selection.selectedIds.filter(
        (selectedId) => !idsToDelete.includes(selectedId)
      )

      // Rebuild childrenMap
      page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)
    },

    /**
     * Delete multiple elements in a SINGLE history entry from the ACTIVE PAGE.
     *
     * WHEN TO USE: When deleting multiple elements via group actions (Delete key, Cut).
     *
     * WHY THIS EXISTS:
     * - Using deleteElement in a loop creates N history entries for N elements
     * - This means undoing a "delete 100 elements" requires 100 undo operations
     * - This action batches all deletions into ONE undo-able operation
     *
     * IMPORTANT:
     * - Page elements are filtered out (cannot be deleted)
     * - Children of deleted elements are also deleted (prevents orphans)
     * - All deletions happen in a single history snapshot
     */
    deleteElements: (state, action: PayloadAction<string[]>) => {
      const idsToDelete = action.payload
      if (idsToDelete.length === 0) return

      const page = getActivePage(state)

      // Filter out page elements and non-existent elements
      const validIds = idsToDelete.filter((id) => {
        const element = page.canvas.elements[id]
        return element && element.type !== 'page'
      })

      if (validIds.length === 0) return

      // Save to page-local history ONCE for the entire batch operation
      page.history.past.push(
        createSnapshot(page.canvas, `Delete ${validIds.length} element(s)`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Collect all IDs to delete (including descendants)
      // Use a Set to avoid duplicates when children are explicitly listed
      const allIdsToDelete = new Set<string>()
      const collectDescendants = (elementId: string) => {
        allIdsToDelete.add(elementId)
        const childIds = page.canvas.childrenMap[elementId] || []
        childIds.forEach(collectDescendants)
      }

      validIds.forEach((id) => {
        collectDescendants(id)
      })

      // Delete all collected elements
      allIdsToDelete.forEach((deleteId) => {
        delete page.canvas.elements[deleteId]
      })

      // Update rootIds
      page.canvas.rootIds = page.canvas.rootIds.filter(
        (rid) => !allIdsToDelete.has(rid)
      )

      // Clear deleted elements from selection
      page.selection.selectedIds = page.selection.selectedIds.filter(
        (selectedId) => !allIdsToDelete.has(selectedId)
      )

      // Rebuild childrenMap
      page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)
    },

    /**
     * Move element to a new parent and/or position in the ACTIVE PAGE.
     *
     * WHEN TO USE: After drag COMPLETES and element is dropped.
     *
     * Handles:
     * - Removing from old parent's children
     * - Adding to new parent's children
     * - Updating sibling orders in both locations
     * - Optionally updating x/y position (for drops onto canvas)
     *
     * IMPORTANT: This action handles both parent change AND position update
     * in a SINGLE history entry. This prevents the bug where undo would
     * only undo the position but leave the element orphaned at (0,0).
     */
    moveElement: (
      state,
      action: PayloadAction<{
        id: string
        newParentId: string | null
        newOrder: number
        /** Optional new X position (for drops onto canvas) */
        newX?: number
        /** Optional new Y position (for drops onto canvas) */
        newY?: number
      }>
    ) => {
      const { id, newParentId, newOrder, newX, newY } = action.payload
      const page = getActivePage(state)
      const element = page.canvas.elements[id]
      if (!element) return

      const oldParentId = element.parentId
      const oldOrder = element.order

      // Check if anything actually changed
      const parentChanged = oldParentId !== newParentId
      const orderChanged = oldOrder !== newOrder
      const positionChanged = newX !== undefined || newY !== undefined

      // Skip if nothing changed
      if (!parentChanged && !orderChanged && !positionChanged) return

      // Save to page-local history (single entry for the entire move operation)
      page.history.past.push(createSnapshot(page.canvas, 'Move element'))
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Update siblings in old parent (shift orders down)
      if (oldParentId !== newParentId) {
        Object.values(page.canvas.elements).forEach((el) => {
          if (el.parentId === oldParentId && el.order > oldOrder) {
            page.canvas.elements[el.id] = { ...el, order: el.order - 1 }
          }
        })
      }

      // Update siblings in new parent (shift orders up)
      Object.values(page.canvas.elements).forEach((el) => {
        if (
          el.parentId === newParentId &&
          el.id !== id &&
          el.order >= newOrder
        ) {
          page.canvas.elements[el.id] = { ...el, order: el.order + 1 }
        }
      })

      // Update the moved element (including position if provided)
      page.canvas.elements[id] = {
        ...element,
        parentId: newParentId,
        order: newOrder,
        // Only update x/y if explicitly provided
        ...(newX !== undefined && { x: newX }),
        ...(newY !== undefined && { y: newY }),
      }

      // Update rootIds
      if (oldParentId === null && newParentId !== null) {
        page.canvas.rootIds = page.canvas.rootIds.filter((rid) => rid !== id)
      } else if (oldParentId !== null && newParentId === null) {
        page.canvas.rootIds.push(id)
      }

      // Rebuild childrenMap
      page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)
    },

    /**
     * Reorder element within its current parent in the ACTIVE PAGE.
     *
     * WHEN TO USE: After drag COMPLETES within same parent.
     */
    reorderElement: (
      state,
      action: PayloadAction<{ id: string; newOrder: number }>
    ) => {
      const { id, newOrder } = action.payload
      const page = getActivePage(state)
      const element = page.canvas.elements[id]
      if (!element) return

      const oldOrder = element.order
      if (oldOrder === newOrder) return

      // Save to page-local history
      page.history.past.push(createSnapshot(page.canvas, 'Reorder element'))
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Update sibling orders
      Object.values(page.canvas.elements).forEach((el) => {
        if (el.parentId !== element.parentId || el.id === id) return

        if (oldOrder < newOrder) {
          // Moving down: shift elements in range down
          if (el.order > oldOrder && el.order <= newOrder) {
            page.canvas.elements[el.id] = { ...el, order: el.order - 1 }
          }
        } else {
          // Moving up: shift elements in range up
          if (el.order >= newOrder && el.order < oldOrder) {
            page.canvas.elements[el.id] = { ...el, order: el.order + 1 }
          }
        }
      })

      // Update the element's order
      page.canvas.elements[id] = { ...element, order: newOrder }

      // Rebuild childrenMap
      page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)
    },

    /**
     * Move multiple elements together (GROUP DRAG) in the ACTIVE PAGE.
     *
     * WHEN TO USE: After group drag COMPLETES.
     *
     * Handles:
     * - Moving multiple elements to a new parent (or canvas root)
     * - Updating positions for each element
     * - Assigning sequential orders in the new parent
     * - Single history entry for the entire operation
     *
     * IMPORTANT: All elements are moved as a GROUP. They maintain
     * their relative positions but get new absolute positions based
     * on where they were dropped.
     */
    moveElements: (
      state,
      action: PayloadAction<{
        /** Array of element updates - each with id, new position, new parent */
        moves: Array<{
          id: string
          newParentId: string | null
          newX: number
          newY: number
        }>
        /** Starting order for the moved elements in their new parent */
        startingOrder: number
      }>
    ) => {
      const { moves, startingOrder } = action.payload
      if (moves.length === 0) return

      const page = getActivePage(state)

      // Save to page-local history (single entry for entire group move)
      page.history.past.push(
        createSnapshot(page.canvas, `Move ${moves.length} element(s)`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Get the new parent ID (all elements go to same parent)
      const newParentId = moves[0].newParentId

      // First, remove all moved elements from their old parents' order sequences
      moves.forEach(({ id }) => {
        const element = page.canvas.elements[id]
        if (!element) return

        const oldParentId = element.parentId
        const oldOrder = element.order

        // Shift down siblings that were after this element
        Object.values(page.canvas.elements).forEach((el) => {
          if (
            el.parentId === oldParentId &&
            el.order > oldOrder &&
            !moves.find((m) => m.id === el.id)
          ) {
            page.canvas.elements[el.id] = { ...el, order: el.order - 1 }
          }
        })
      })

      // Shift up existing children in the new parent to make room
      const existingChildrenInNewParent = Object.values(
        page.canvas.elements
      ).filter(
        (el) =>
          el.parentId === newParentId && !moves.find((m) => m.id === el.id)
      )

      existingChildrenInNewParent.forEach((el) => {
        if (el.order >= startingOrder) {
          page.canvas.elements[el.id] = {
            ...el,
            order: el.order + moves.length,
          }
        }
      })

      // Now update all moved elements
      moves.forEach(
        ({ id, newParentId: targetParentId, newX, newY }, index) => {
          const element = page.canvas.elements[id]
          if (!element) return

          const oldParentId = element.parentId

          // Update rootIds if needed
          if (oldParentId === null && targetParentId !== null) {
            // Moving from root to inside a frame
            page.canvas.rootIds = page.canvas.rootIds.filter(
              (rid) => rid !== id
            )
          } else if (oldParentId !== null && targetParentId === null) {
            // Moving from inside a frame to root
            page.canvas.rootIds.push(id)
          }

          // Update the element
          page.canvas.elements[id] = {
            ...element,
            parentId: targetParentId,
            x: newX,
            y: newY,
            order: startingOrder + index,
          }
        }
      )

      // Rebuild childrenMap
      page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)
    },

    // ========================================================================
    // SELECTION - All operate on ACTIVE PAGE
    // ========================================================================

    /**
     * Set selection to a single element or clear selection in the ACTIVE PAGE.
     * For single-click selection behavior.
     */
    setSelection: (state, action: PayloadAction<string | null>) => {
      const page = getActivePage(state)
      page.selection.selectedIds = action.payload ? [action.payload] : []
    },

    /**
     * Set selection to multiple elements in the ACTIVE PAGE (for marquee selection).
     */
    setMultiSelection: (state, action: PayloadAction<string[]>) => {
      const page = getActivePage(state)
      page.selection.selectedIds = action.payload
    },

    /**
     * Toggle an element in the selection in the ACTIVE PAGE (for Shift+click).
     */
    toggleSelection: (state, action: PayloadAction<string>) => {
      const page = getActivePage(state)
      const id = action.payload
      const index = page.selection.selectedIds.indexOf(id)
      if (index === -1) {
        page.selection.selectedIds.push(id)
      } else {
        page.selection.selectedIds.splice(index, 1)
      }
    },

    /**
     * Add element to current selection in the ACTIVE PAGE (for Shift+click add).
     */
    addToSelection: (state, action: PayloadAction<string>) => {
      const page = getActivePage(state)
      if (!page.selection.selectedIds.includes(action.payload)) {
        page.selection.selectedIds.push(action.payload)
      }
    },

    /**
     * Clear all selection in the ACTIVE PAGE.
     */
    clearSelection: (state) => {
      const page = getActivePage(state)
      page.selection.selectedIds = []
    },

    // ========================================================================
    // BREAKPOINTS - Toggle responsive breakpoint previews for Page elements
    // ========================================================================

    /**
     * Toggle a breakpoint on a Page element in the ACTIVE PAGE.
     *
     * IMPORTANT: This only sets a flag on the Page element. The actual
     * breakpoint preview frame is rendered dynamically in the Canvas
     * component, NOT stored as a separate element. This ensures:
     * - No data duplication (breakpoint frame references same children)
     * - Breakpoint frames are never saved to the database
     * - Undo/redo still works correctly for the breakpoints property
     *
     * @param action.payload.pageId - The ID of the page element
     * @param action.payload.breakpoint - Which breakpoint to toggle ('mobile')
     */
    togglePageBreakpoint: (
      state,
      action: PayloadAction<{ pageId: string; breakpoint: 'mobile' }>
    ) => {
      const { pageId, breakpoint } = action.payload
      const page = getActivePage(state)
      const pageElement = page.canvas.elements[pageId]

      // Validate that this is a page element
      if (!pageElement || pageElement.type !== 'page') {
        console.warn(`[togglePageBreakpoint] Element ${pageId} is not a page`)
        return
      }

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, `Toggle ${breakpoint} breakpoint`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Type assertion to access page-specific properties
      const typedPageElement = pageElement as PageElement

      // Initialize breakpoints object if it doesn't exist
      if (!typedPageElement.breakpoints) {
        typedPageElement.breakpoints = {}
      }

      // Toggle the breakpoint
      typedPageElement.breakpoints[breakpoint] =
        !typedPageElement.breakpoints[breakpoint]
    },

    // ========================================================================
    // TOOL MODE - Global (shared across all pages)
    // ========================================================================

    /**
     * Change the current tool mode (global).
     */
    setToolMode: (state, action: PayloadAction<ToolMode>) => {
      state.toolMode = action.payload
      // Optionally clear selection when changing tools
      if (action.payload === 'frame') {
        const page = getActivePage(state)
        page.selection.selectedIds = []
      }
    },

    /**
     * Set the active stroke color for the pen/pencil tool.
     * Dispatched from toolbar color swatches; read by usePencilCreation hook.
     */
    setPenStrokeColor: (state, action: PayloadAction<string>) => {
      state.penStrokeColor = action.payload
    },

    /**
     * Set the active brush size (stroke width) for the pen/pencil tool.
     * Dispatched from toolbar brush size swatches; read by usePencilCreation hook.
     */
    setPenBrushSize: (state, action: PayloadAction<number>) => {
      state.penBrushSize = action.payload
    },

    /**
     * Set the active stroke opacity for the pen/pencil tool (0–1).
     * Dispatched from toolbar opacity slider; read by usePencilCreation hook.
     */
    setPenStrokeOpacity: (state, action: PayloadAction<number>) => {
      state.penStrokeOpacity = action.payload
    },

    // ========================================================================
    // PREVIEW MODE - Global toggle for non-interactive preview
    // ========================================================================

    /**
     * Toggle preview mode on/off.
     * When enabled, shows the page in a non-interactive overlay.
     */
    togglePreviewMode: (state) => {
      state.previewMode = !state.previewMode
    },

    /**
     * Set preview mode explicitly.
     */
    setPreviewMode: (state, action: PayloadAction<boolean>) => {
      state.previewMode = action.payload
    },

    // ========================================================================
    // RESPONSIVE BREAKPOINT EDITING - Global toggle for style editing mode
    // ========================================================================

    /**
     * Set the current breakpoint editing mode.
     *
     * Controls which breakpoint's styles are shown and edited in the properties panel:
     * - 'desktop': Shows and edits element.styles (base/desktop styles)
     * - 'mobile': Shows and edits element.responsiveStyles.mobile (mobile overrides)
     *
     * This is a UI-only state and does NOT affect how elements are rendered.
     * The canvas always shows desktop styles; the breakpoint mobile frame shows merged mobile styles.
     */
    setEditingBreakpoint: (state, action: PayloadAction<Breakpoint>) => {
      state.editingBreakpoint = action.payload
    },

    /**
     * Update an element's responsive style overrides for a specific breakpoint.
     *
     * Used when editing in mobile mode to set style overrides that only apply
     * at the specified breakpoint. These overrides are merged on top of the
     * base styles when rendering at that breakpoint.
     *
     * @param id - Element ID to update
     * @param breakpoint - Which breakpoint to update ('mobile')
     * @param styleUpdates - Partial style object to merge into existing overrides
     *
     * EXAMPLE:
     * ```ts
     * dispatch(updateElementResponsiveStyle({
     *   id: 'el_123',
     *   breakpoint: 'mobile',
     *   styleUpdates: { padding: '16px', flexDirection: 'column' }
     * }))
     * ```
     *
     * STORAGE:
     * - element.responsiveStyles.mobile = { ...existing, ...styleUpdates }
     */
    updateElementResponsiveStyle: (
      state,
      action: PayloadAction<{
        id: string
        breakpoint: Breakpoint
        styleUpdates: Partial<ElementStyles>
      }>
    ) => {
      const { id, breakpoint, styleUpdates } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (!existing) return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, `Update ${breakpoint} styles`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Initialize responsiveStyles if not present
      if (!existing.responsiveStyles) {
        existing.responsiveStyles = {}
      }

      // Merge style updates into the specified breakpoint
      if (breakpoint === 'mobile') {
        existing.responsiveStyles.mobile = {
          ...existing.responsiveStyles.mobile,
          ...styleUpdates,
        }
      }
      // Future: Add tablet case here
    },

    /**
     * Clear all responsive style overrides for an element at a specific breakpoint.
     *
     * Used for "Reset to desktop" functionality - removes all mobile-specific
     * styles so the element uses only base styles at all breakpoints.
     */
    clearElementResponsiveStyles: (
      state,
      action: PayloadAction<{ id: string; breakpoint: Breakpoint }>
    ) => {
      const { id, breakpoint } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (!existing || !existing.responsiveStyles) return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, `Clear ${breakpoint} styles`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Clear the specified breakpoint's overrides
      if (breakpoint === 'mobile') {
        delete existing.responsiveStyles.mobile
      }

      // Clean up if responsiveStyles is now empty
      if (Object.keys(existing.responsiveStyles).length === 0) {
        delete existing.responsiveStyles
      }
    },

    /**
     * Clear a single responsive style override for an element at a specific breakpoint.
     *
     * Used when clicking the reset button next to an individual property's mobile indicator.
     * Only removes the specified style property's mobile override.
     *
     * @param id - Element ID to update
     * @param breakpoint - Which breakpoint to clear ('mobile')
     * @param styleKey - The CSS property key to clear (e.g., 'padding', 'flexDirection')
     */
    clearSingleResponsiveStyle: (
      state,
      action: PayloadAction<{
        id: string
        breakpoint: Breakpoint
        styleKey: string
      }>
    ) => {
      const { id, breakpoint, styleKey } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (!existing || !existing.responsiveStyles) return

      // Check if the breakpoint has overrides
      const overrides =
        breakpoint === 'mobile' ? existing.responsiveStyles.mobile : undefined
      if (!overrides) return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, `Clear ${breakpoint} ${styleKey}`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Delete the specific style key
      if (breakpoint === 'mobile' && existing.responsiveStyles.mobile) {
        delete (existing.responsiveStyles.mobile as Record<string, unknown>)[
          styleKey
        ]

        // Clean up if mobile overrides is now empty
        if (Object.keys(existing.responsiveStyles.mobile).length === 0) {
          delete existing.responsiveStyles.mobile
        }
      }

      // Clean up if responsiveStyles is now empty
      if (Object.keys(existing.responsiveStyles).length === 0) {
        delete existing.responsiveStyles
      }
    },

    /**
     * ========================================================================
     * UPDATE ELEMENT RESPONSIVE SETTINGS
     * ========================================================================
     *
     * Updates an element's responsive SETTING overrides for a specific breakpoint.
     *
     * ========================================================================
     * SETTINGS vs STYLES
     * ========================================================================
     *
     * SETTINGS: Element-specific behavioral configurations (NOT CSS properties)
     * - autoWidth, autoHeight, responsive, sticky, variant, objectFit, etc.
     * - Use this action for these.
     *
     * STYLES: Visual/CSS properties (use updateElementResponsiveStyle instead)
     * - backgroundColor, fontSize, fontFamily, padding, etc.
     *
     * ========================================================================
     * USAGE
     * ========================================================================
     *
     * @param id - Element ID to update
     * @param breakpoint - Which breakpoint to update ('mobile')
     * @param settingUpdates - Partial settings object to merge into existing overrides
     *
     * EXAMPLE:
     * ```ts
     * dispatch(updateElementResponsiveSetting({
     *   id: 'el_123',
     *   breakpoint: 'mobile',
     *   settingUpdates: { autoWidth: true, variant: 'secondary' }
     * }))
     * ```
     *
     * STORAGE:
     * - element.responsiveSettings.mobile = { ...existing, ...settingUpdates }
     */
    updateElementResponsiveSetting: (
      state,
      action: PayloadAction<{
        id: string
        breakpoint: Breakpoint
        settingUpdates: Partial<ResponsiveSettingsOverrides>
      }>
    ) => {
      const { id, breakpoint, settingUpdates } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (!existing) return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, `Update ${breakpoint} settings`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Initialize responsiveSettings if not present (new structure)
      if (!existing.responsiveSettings) {
        existing.responsiveSettings = {}
      }

      // Merge setting updates into the specified breakpoint
      if (breakpoint === 'mobile') {
        existing.responsiveSettings.mobile = {
          ...existing.responsiveSettings.mobile,
          ...settingUpdates,
        }
      }
      // Future: Add tablet case here
    },

    /**
     * @deprecated Use updateElementResponsiveSetting instead.
     * Kept for backwards compatibility during migration.
     */
    updateElementResponsiveProperty: (
      state,
      action: PayloadAction<{
        id: string
        breakpoint: Breakpoint
        propertyUpdates: Partial<ResponsivePropertyOverrides>
      }>
    ) => {
      const { id, breakpoint, propertyUpdates } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (!existing) return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, `Update ${breakpoint} settings`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Use new responsiveSettings structure
      if (!existing.responsiveSettings) {
        existing.responsiveSettings = {}
      }

      // Merge setting updates into the specified breakpoint
      if (breakpoint === 'mobile') {
        existing.responsiveSettings.mobile = {
          ...existing.responsiveSettings.mobile,
          ...propertyUpdates,
        }
      }
    },

    /**
     * Clear all responsive SETTING overrides for an element at a specific breakpoint.
     *
     * Used for "Reset to desktop" functionality - removes all mobile-specific
     * settings so the element uses only base settings at all breakpoints.
     */
    clearElementResponsiveSettings: (
      state,
      action: PayloadAction<{ id: string; breakpoint: Breakpoint }>
    ) => {
      const { id, breakpoint } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]

      // Check both new (responsiveSettings) and deprecated (responsiveProperties) field
      if (
        !existing ||
        (!existing.responsiveSettings && !existing.responsiveProperties)
      )
        return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, `Clear ${breakpoint} settings`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Clear from new structure
      if (existing.responsiveSettings) {
        if (breakpoint === 'mobile') {
          delete existing.responsiveSettings.mobile
        }
        if (Object.keys(existing.responsiveSettings).length === 0) {
          delete existing.responsiveSettings
        }
      }

      // Also clear deprecated structure if it exists
      if (existing.responsiveProperties) {
        if (breakpoint === 'mobile') {
          delete existing.responsiveProperties.mobile
        }
        if (Object.keys(existing.responsiveProperties).length === 0) {
          delete existing.responsiveProperties
        }
      }
    },

    /**
     * @deprecated Use clearElementResponsiveSettings instead.
     * Kept for backwards compatibility during migration.
     */
    clearElementResponsiveProperties: (
      state,
      action: PayloadAction<{ id: string; breakpoint: Breakpoint }>
    ) => {
      // Just call the new action implementation
      const { id, breakpoint } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (
        !existing ||
        (!existing.responsiveSettings && !existing.responsiveProperties)
      )
        return

      page.history.past.push(
        createSnapshot(page.canvas, `Clear ${breakpoint} settings`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      if (existing.responsiveSettings) {
        if (breakpoint === 'mobile') {
          delete existing.responsiveSettings.mobile
        }
        if (Object.keys(existing.responsiveSettings).length === 0) {
          delete existing.responsiveSettings
        }
      }
      if (existing.responsiveProperties) {
        if (breakpoint === 'mobile') {
          delete existing.responsiveProperties.mobile
        }
        if (Object.keys(existing.responsiveProperties).length === 0) {
          delete existing.responsiveProperties
        }
      }
    },

    /**
     * Clear a single responsive SETTING override for an element at a specific breakpoint.
     *
     * Used when clicking the reset button next to an individual setting's mobile indicator.
     * Only removes the specified setting's mobile override.
     *
     * @param id - Element ID to update
     * @param breakpoint - Which breakpoint to clear ('mobile')
     * @param settingKey - The setting key to clear (e.g., 'autoWidth', 'variant')
     */
    clearSingleResponsiveSetting: (
      state,
      action: PayloadAction<{
        id: string
        breakpoint: Breakpoint
        settingKey: keyof ResponsiveSettingsOverrides
      }>
    ) => {
      const { id, breakpoint, settingKey } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (!existing) return

      // Check both new and deprecated fields
      const newOverrides = existing.responsiveSettings?.mobile
      const oldOverrides = existing.responsiveProperties?.mobile
      if (!newOverrides && !oldOverrides) return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, `Clear ${breakpoint} ${settingKey}`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Delete from new structure
      if (breakpoint === 'mobile' && existing.responsiveSettings?.mobile) {
        delete existing.responsiveSettings.mobile[settingKey]
        if (Object.keys(existing.responsiveSettings.mobile).length === 0) {
          delete existing.responsiveSettings.mobile
        }
        if (Object.keys(existing.responsiveSettings).length === 0) {
          delete existing.responsiveSettings
        }
      }

      // Also delete from deprecated structure if it exists
      if (breakpoint === 'mobile' && existing.responsiveProperties?.mobile) {
        delete existing.responsiveProperties.mobile[settingKey]
        if (Object.keys(existing.responsiveProperties.mobile).length === 0) {
          delete existing.responsiveProperties.mobile
        }
        if (Object.keys(existing.responsiveProperties).length === 0) {
          delete existing.responsiveProperties
        }
      }
    },

    /**
     * @deprecated Use clearSingleResponsiveSetting instead.
     * Kept for backwards compatibility during migration.
     */
    clearSingleResponsiveProperty: (
      state,
      action: PayloadAction<{
        id: string
        breakpoint: Breakpoint
        propertyKey: keyof ResponsivePropertyOverrides
      }>
    ) => {
      const { id, breakpoint, propertyKey } = action.payload
      const page = getActivePage(state)
      const existing = page.canvas.elements[id]
      if (!existing) return

      const newOverrides = existing.responsiveSettings?.mobile
      const oldOverrides = existing.responsiveProperties?.mobile
      if (!newOverrides && !oldOverrides) return

      page.history.past.push(
        createSnapshot(page.canvas, `Clear ${breakpoint} ${propertyKey}`)
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      if (breakpoint === 'mobile' && existing.responsiveSettings?.mobile) {
        delete existing.responsiveSettings.mobile[propertyKey]
        if (Object.keys(existing.responsiveSettings.mobile).length === 0) {
          delete existing.responsiveSettings.mobile
        }
        if (Object.keys(existing.responsiveSettings).length === 0) {
          delete existing.responsiveSettings
        }
      }
      if (breakpoint === 'mobile' && existing.responsiveProperties?.mobile) {
        delete existing.responsiveProperties.mobile[propertyKey]
        if (Object.keys(existing.responsiveProperties.mobile).length === 0) {
          delete existing.responsiveProperties.mobile
        }
        if (Object.keys(existing.responsiveProperties).length === 0) {
          delete existing.responsiveProperties
        }
      }
    },

    // ========================================================================
    // VIEWPORT - Operates on ACTIVE PAGE
    // ========================================================================

    /**
     * Update viewport pan and/or zoom for the ACTIVE PAGE.
     */
    setViewport: (state, action: PayloadAction<Partial<ViewportState>>) => {
      const page = getActivePage(state)
      page.viewport = { ...page.viewport, ...action.payload }
    },

    // ========================================================================
    // UNDO/REDO - LOCAL to ACTIVE PAGE
    // ========================================================================

    /**
     * Undo the last action in the ACTIVE PAGE.
     *
     * IMPORTANT: This only affects the active page's history.
     * Other pages' histories remain unchanged.
     */
    undo: (state) => {
      const page = getActivePage(state)
      if (page.history.past.length === 0) return

      const previous = page.history.past.pop()!
      page.history.future.unshift(createSnapshot(page.canvas))
      page.canvas = previous.canvas
    },

    /**
     * Redo the last undone action in the ACTIVE PAGE.
     *
     * IMPORTANT: This only affects the active page's history.
     * Other pages' histories remain unchanged.
     */
    redo: (state) => {
      const page = getActivePage(state)
      if (page.history.future.length === 0) return

      const next = page.history.future.shift()!
      page.history.past.push(createSnapshot(page.canvas))
      page.canvas = next.canvas
    },

    // ========================================================================
    // SERIALIZATION (for database persistence)
    // ========================================================================

    /**
     * Load complete pages state from serialized data (e.g., from database).
     *
     * CRITICAL: Preserve current viewport on refetch
     * When tRPC refetches data (e.g., on window focus regain), the database
     * returns viewport with default values (panX: 0, panY: 0, zoom: 1).
     * This would reset the user's current view position, which is jarring.
     *
     * FIX: If we already have pages loaded (not first load), preserve the
     * current viewport, selection, and history for each page.
     *
     * IMPORTANT: We must NOT mutate action.payload as it may be frozen by
     * React Query/tRPC in development mode. Instead, we build a new object
     * and only mutate `state`.
     */
    loadPages: (state, action: PayloadAction<PagesState>) => {
      const incomingPages = action.payload
      const existingPages = state.pages.pages

      // Check if we have existing pages (not first load)
      const hasExistingPages = Object.keys(existingPages).length > 0

      if (hasExistingPages) {
        // ======================================================================
        // REFETCH SCENARIO: Merge incoming data but preserve runtime state
        // ======================================================================
        // When TRPC refetches (e.g., on window focus), the server returns data
        // based on the original page that was loaded. But the user may have
        // switched to a different page via shallow navigation (replaceState).
        //
        // We must preserve the CURRENT activePageId from Redux, not the one
        // from the incoming data. Otherwise, the user gets jumped back to
        // whatever page was originally loaded - a very confusing bug.
        //
        // We also preserve viewport, selection, and history per page since
        // those are client-side runtime state not stored in the database.
        // ======================================================================

        // CRITICAL: Capture the current active page BEFORE overwriting
        const currentActivePageId = state.pages.activePageId

        // Build new pages object with preserved runtime state
        // We create a new object to avoid mutating the frozen action.payload
        const mergedPages: Record<string, (typeof incomingPages.pages)[string]> = {}

        for (const [pageId, incomingPage] of Object.entries(incomingPages.pages)) {
          const existingPage = existingPages[pageId]
          if (existingPage) {
            // Preserve runtime state, only update canvas data from database
            mergedPages[pageId] = {
              ...incomingPage,
              viewport: existingPage.viewport,       // Keep current pan/zoom
              selection: existingPage.selection,     // Keep current selection
              history: existingPage.history,         // Keep undo/redo stack
            }
          } else {
            // New page from database - use incoming data as-is
            mergedPages[pageId] = incomingPage
          }
        }

        // Determine which activePageId to use:
        // - If the current active page still exists in merged data, keep it
        // - Otherwise fall back to incoming (the page may have been deleted)
        const preservedActivePageId = mergedPages[currentActivePageId]
          ? currentActivePageId
          : incomingPages.activePageId

        // Assign merged result to state (never mutate action.payload)
        state.pages = {
          ...incomingPages,
          pages: mergedPages,
          activePageId: preservedActivePageId,  // PRESERVE current page, not incoming
        }
      } else {
        // First load - assign directly (no merge needed)
        state.pages = incomingPages
      }
    },

    /**
     * Load canvas state into the ACTIVE PAGE from serialized data.
     *
     * This is for backwards compatibility with single-page data.
     * Resets viewport to defaults - the Canvas component will handle
     * client-side centering once it mounts and knows the actual viewport size.
     */
    loadCanvas: (state, action: PayloadAction<CanvasState>) => {
      const page = getActivePage(state)
      page.canvas = action.payload
      page.selection.selectedIds = []
      page.history = { past: [], future: [], maxSize: 50 }
      page.viewport = DEFAULT_VIEWPORT
    },

    // ========================================================================
    // LOCAL COMPONENTS - User-created reusable components
    // ========================================================================

    /**
     * Load local components from serialized data (e.g., from database).
     *
     * Replaces all local components with the loaded data.
     * Called by BuilderClient on mount alongside loadPages.
     */
    loadLocalComponents: (
      state,
      action: PayloadAction<Record<string, LocalComponent>>
    ) => {
      state.localComponents = action.payload
      // Mark as loaded - subsequent hook instances should NOT overwrite with DB data
      state.localComponentsLoaded = true
    },

    /**
     * Add a new local component to the library.
     *
     * Called after convertFrameToComponent completes.
     * The component is immediately available in the sidebar.
     */
    addLocalComponent: (state, action: PayloadAction<LocalComponent>) => {
      const component = action.payload
      state.localComponents[component.id] = component
    },

    /**
     * Update an existing local component.
     *
     * Used when editing a component in "Edit Component" mode.
     * Updates the component definition which affects all instances.
     */
    updateLocalComponent: (
      state,
      action: PayloadAction<{
        id: string
        updates: Partial<LocalComponent>
      }>
    ) => {
      const { id, updates } = action.payload
      const existing = state.localComponents[id]
      if (!existing) return

      state.localComponents[id] = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      }
    },

    /**
     * Update a component's source tree element.
     *
     * Used when editing elements inside a component in "Edit Component" mode.
     * Changes propagate to all instances (they re-render automatically).
     */
    updateComponentSourceElement: (
      state,
      action: PayloadAction<{
        componentId: string
        elementId: string
        updates: Partial<CanvasElement>
      }>
    ) => {
      const { componentId, elementId, updates } = action.payload
      const component = state.localComponents[componentId]
      if (!component) return

      const { sourceTree } = component

      // Check if updating root element
      if (sourceTree.rootElement.id === elementId) {
        state.localComponents[componentId] = {
          ...component,
          sourceTree: {
            ...sourceTree,
            rootElement: {
              ...sourceTree.rootElement,
              ...updates,
            } as CanvasElement,
          },
          updatedAt: Date.now(),
        }
        return
      }

      // Update child element
      state.localComponents[componentId] = {
        ...component,
        sourceTree: {
          ...sourceTree,
          childElements: sourceTree.childElements.map((el) =>
            el.id === elementId ? ({ ...el, ...updates } as CanvasElement) : el
          ),
        },
        updatedAt: Date.now(),
      }
    },

    /**
     * Delete a local component from the library.
     *
     * WARNING: This does NOT delete component instances from canvases.
     * Instances should be converted back to frames (detached) first,
     * or this action should be prevented if instances exist.
     */
    deleteLocalComponent: (state, action: PayloadAction<string>) => {
      delete state.localComponents[action.payload]
      // If we were editing this component, exit edit mode
      if (state.editingComponentId === action.payload) {
        state.editingComponentId = null
      }
    },

    /**
     * Add an exposed property to a component.
     *
     * Called when user clicks "Expose as Prop" on an element property
     * while editing a component.
     */
    addExposedProp: (
      state,
      action: PayloadAction<{
        componentId: string
        prop: ExposedProp
      }>
    ) => {
      const { componentId, prop } = action.payload
      const component = state.localComponents[componentId]
      if (!component) return

      state.localComponents[componentId] = {
        ...component,
        exposedProps: [...component.exposedProps, prop],
        updatedAt: Date.now(),
      }
    },

    /**
     * Remove an exposed property from a component.
     *
     * Called when user removes a prop from the component settings.
     */
    removeExposedProp: (
      state,
      action: PayloadAction<{
        componentId: string
        propId: string
      }>
    ) => {
      const { componentId, propId } = action.payload
      const component = state.localComponents[componentId]
      if (!component) return

      state.localComponents[componentId] = {
        ...component,
        exposedProps: component.exposedProps.filter((p) => p.id !== propId),
        updatedAt: Date.now(),
      }
    },

    /**
     * Update an exposed property's configuration.
     */
    updateExposedProp: (
      state,
      action: PayloadAction<{
        componentId: string
        propId: string
        updates: Partial<Omit<ExposedProp, 'id'>>
      }>
    ) => {
      const { componentId, propId, updates } = action.payload
      const component = state.localComponents[componentId]
      if (!component) return

      state.localComponents[componentId] = {
        ...component,
        exposedProps: component.exposedProps.map((p) =>
          p.id === propId ? { ...p, ...updates } : p
        ),
        updatedAt: Date.now(),
      }
    },

    /**
     * Register a component instance.
     *
     * Called when a component instance is added to the canvas.
     * Tracks which instances use each component for updates.
     */
    registerComponentInstance: (
      state,
      action: PayloadAction<{
        componentId: string
        instanceId: string
      }>
    ) => {
      const { componentId, instanceId } = action.payload
      const component = state.localComponents[componentId]
      if (!component) return

      if (!component.instanceIds.includes(instanceId)) {
        state.localComponents[componentId] = {
          ...component,
          instanceIds: [...component.instanceIds, instanceId],
        }
      }
    },

    /**
     * Unregister a component instance.
     *
     * Called when a component instance is deleted or detached.
     */
    unregisterComponentInstance: (
      state,
      action: PayloadAction<{
        componentId: string
        instanceId: string
      }>
    ) => {
      const { componentId, instanceId } = action.payload
      const component = state.localComponents[componentId]
      if (!component) return

      state.localComponents[componentId] = {
        ...component,
        instanceIds: component.instanceIds.filter((id) => id !== instanceId),
      }
    },

    /**
     * Update prop values for a component instance.
     *
     * Called when user changes a prop value in the Settings panel.
     * This updates the instance's propValues, not the component definition.
     */
    updateInstancePropValues: (
      state,
      action: PayloadAction<{
        instanceId: string
        propValues: Record<string, unknown>
      }>
    ) => {
      const { instanceId, propValues } = action.payload
      const page = getActivePage(state)
      const instance = page.canvas.elements[instanceId]

      if (!instance || instance.type !== 'component') return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, 'Update component props')
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Update the instance's prop values
      page.canvas.elements[instanceId] = {
        ...instance,
        propValues: {
          ...(instance as ComponentInstanceElement).propValues,
          ...propValues,
        },
      } as ComponentInstanceElement
    },

    /**
     * Update a single prop value for a component instance.
     *
     * Called when user changes an individual prop value in the Custom Fields section.
     * Pass undefined as value to remove the override (reset to default).
     */
    updateComponentInstancePropValue: (
      state,
      action: PayloadAction<{
        instanceId: string
        propId: string
        value: unknown
      }>
    ) => {
      const { instanceId, propId, value } = action.payload
      const page = getActivePage(state)
      const instance = page.canvas.elements[instanceId]

      if (!instance || instance.type !== 'component') return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, 'Update component prop')
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Get current prop values
      const currentPropValues = { ...(instance as ComponentInstanceElement).propValues }

      // Update or remove the prop value
      if (value === undefined) {
        // Remove the override (reset to default)
        delete currentPropValues[propId]
      } else {
        // Set the override value
        currentPropValues[propId] = value
      }

      // Update the instance
      page.canvas.elements[instanceId] = {
        ...instance,
        propValues: currentPropValues,
      } as ComponentInstanceElement
    },

    /**
     * ========================================================================
     * UPDATE NESTED INSTANCE PROP VALUE
     * ========================================================================
     *
     * Updates a prop value for a NESTED component instance within a composed
     * component. The key difference from `updateComponentInstancePropValue`:
     *
     * - Regular props: stored on `instance.propValues`
     * - Nested instance props: stored on `parentInstance.nestedPropValues[nestedId]`
     *
     * This enables INDEPENDENCE for nested instances:
     * - Each parent instance can have different prop values for the same nested instance
     * - Example: Two carousel instances with independently customizable cards
     *
     * ========================================================================
     * SCOPED ID PARSING
     * ========================================================================
     *
     * Nested instances use SCOPED IDs in format: `${parentInstanceId}::${nestedElementId}`
     * This action parses scoped IDs to extract parent and nested element IDs.
     *
     * If instanceId doesn't contain "::", it's treated as a regular instance update.
     *
     * @param instanceId - The scoped ID (`parentId::nestedId`) or regular instance ID
     * @param propId - The exposed prop ID to update
     * @param value - The new value (undefined to reset)
     */
    updateNestedInstancePropValue: (
      state,
      action: PayloadAction<{
        instanceId: string
        propId: string
        value: unknown
      }>
    ) => {
      const { instanceId, propId, value } = action.payload
      const page = getActivePage(state)

      // Check if this is a scoped ID (nested instance)
      const scopeDelimiter = '::'
      if (!instanceId.includes(scopeDelimiter)) {
        // Not a scoped ID - this shouldn't happen, but handle gracefully
        // by delegating to the regular action logic
        const instance = page.canvas.elements[instanceId]
        if (!instance || instance.type !== 'component') return

        page.history.past.push(createSnapshot(page.canvas, 'Update component prop'))
        if (page.history.past.length > page.history.maxSize) page.history.past.shift()
        page.history.future = []
        page.info.updatedAt = Date.now()

        const currentPropValues = { ...(instance as ComponentInstanceElement).propValues }
        if (value === undefined) {
          delete currentPropValues[propId]
        } else {
          currentPropValues[propId] = value
        }
        page.canvas.elements[instanceId] = {
          ...instance,
          propValues: currentPropValues,
        } as ComponentInstanceElement
        return
      }

      // Parse the scoped ID to get parent instance ID and nested element ID
      const [parentInstanceId, nestedElementId] = instanceId.split(scopeDelimiter)

      // Get the parent instance
      const parentInstance = page.canvas.elements[parentInstanceId]
      if (!parentInstance || parentInstance.type !== 'component') {
        console.warn(`[updateNestedInstancePropValue] Parent instance not found: ${parentInstanceId}`)
        return
      }

      // Save to history
      page.history.past.push(createSnapshot(page.canvas, 'Update nested instance prop'))
      if (page.history.past.length > page.history.maxSize) page.history.past.shift()
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Get or initialize the parent's nestedPropValues
      const parentTyped = parentInstance as ComponentInstanceElement
      const currentNestedPropValues = { ...(parentTyped.nestedPropValues || {}) }

      // Get or initialize the prop values for this specific nested element
      const nestedProps = { ...(currentNestedPropValues[nestedElementId] || {}) }

      // Update or remove the prop value
      if (value === undefined) {
        delete nestedProps[propId]
        // If no props left for this nested element, remove its entry
        if (Object.keys(nestedProps).length === 0) {
          delete currentNestedPropValues[nestedElementId]
        } else {
          currentNestedPropValues[nestedElementId] = nestedProps
        }
      } else {
        nestedProps[propId] = value
        currentNestedPropValues[nestedElementId] = nestedProps
      }

      // Update the parent instance with the new nestedPropValues
      page.canvas.elements[parentInstanceId] = {
        ...parentInstance,
        nestedPropValues: currentNestedPropValues,
      } as ComponentInstanceElement
    },

    /**
     * ========================================================================
     * UPDATE COMPONENT INSTANCE CMS COLUMN BINDINGS
     * ========================================================================
     *
     * Updates the cmsColumnBindings on a component instance.
     * Used when a component instance is on a dynamic page and the user wants
     * to bind exposed props to CMS columns from the page's connected CMS table.
     *
     * SOURCE OF TRUTH: CMS Column Bindings for Dynamic Page Data Injection
     *
     * @param instanceId - The component instance ID to update
     * @param bindings - New cmsColumnBindings map (propId -> columnSlug)
     */
    updateComponentInstanceCmsBindings: (
      state,
      action: PayloadAction<{
        instanceId: string
        bindings: Record<string, string>
      }>
    ) => {
      const { instanceId, bindings } = action.payload
      const page = getActivePage(state)
      const instance = page.canvas.elements[instanceId]

      if (!instance || instance.type !== 'component') return

      // Save to page-local history
      page.history.past.push(
        createSnapshot(page.canvas, 'Update CMS column bindings')
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = []
      page.info.updatedAt = Date.now()

      // Update the instance with new cmsColumnBindings
      // Empty object = no bindings, filtered to remove empty values
      const cleanedBindings = Object.fromEntries(
        Object.entries(bindings).filter(([, value]) => value)
      )

      page.canvas.elements[instanceId] = {
        ...instance,
        cmsColumnBindings: Object.keys(cleanedBindings).length > 0
          ? cleanedBindings
          : undefined,
      } as ComponentInstanceElement
    },

    /**
     * Enter "Edit Component" mode.
     *
     * When in this mode:
     * - User is editing the component definition directly
     * - The canvas shows the component's sourceTree
     * - Changes affect ALL instances of this component
     * - Normal canvas editing is suspended
     */
    enterComponentEditMode: (state, action: PayloadAction<string>) => {
      const componentId = action.payload
      if (!state.localComponents[componentId]) {
        console.warn(`Component not found: ${componentId}`)
        return
      }
      state.editingComponentId = componentId
    },

    /**
     * Exit "Edit Component" mode.
     *
     * Returns to normal canvas editing.
     * Any changes made to the component are preserved.
     */
    exitComponentEditMode: (state) => {
      state.editingComponentId = null
    },

    /**
     * ========================================================================
     * DETACH COMPONENT INSTANCE
     * ========================================================================
     *
     * Converts a component instance back to a regular frame with all its children.
     * This is a single action that:
     * 1. Replaces the component instance element with a frame element
     * 2. Adds all child elements (from the component's sourceTree) with new IDs
     * 3. Rebuilds the childrenMap to include the new children
     * 4. Unregisters the instance from the component's instanceIds
     *
     * All changes happen in a SINGLE history entry, so undo restores the
     * component instance with all its original state.
     *
     * WHY: Previously, detaching was incomplete - it only converted the element
     * type but didn't add the children, leaving users with an empty frame.
     *
     * @param instanceId - The ID of the component instance to detach
     * @param frameElement - The frame element to replace the instance (same ID)
     * @param childElements - All child elements with new IDs and updated parentIds
     * @param componentId - The component ID to unregister from
     */
    detachComponentInstance: (
      state,
      action: PayloadAction<{
        instanceId: string
        frameElement: FrameElement
        childElements: CanvasElement[]
        componentId: string
      }>
    ) => {
      const { instanceId, frameElement, childElements, componentId } = action.payload
      const page = getActivePage(state)

      // Validate the instance exists and is a component
      const existingInstance = page.canvas.elements[instanceId]
      if (!existingInstance || existingInstance.type !== 'component') {
        console.warn(`[detachComponentInstance] Element ${instanceId} is not a component instance`)
        return
      }

      // ========================================================================
      // Save to history (SINGLE entry for entire detach operation)
      // ========================================================================
      page.history.past.push(
        createSnapshot(page.canvas, 'Detach component instance')
      )
      if (page.history.past.length > page.history.maxSize) {
        page.history.past.shift()
      }
      page.history.future = [] // Clear redo stack
      page.info.updatedAt = Date.now()

      // ========================================================================
      // 1. Replace the component instance with the frame element
      // ========================================================================
      // The frame element has the same ID as the instance, preserving position in tree
      page.canvas.elements[instanceId] = frameElement

      // ========================================================================
      // 2. Add all child elements to the canvas
      // ========================================================================
      for (const child of childElements) {
        // Safety check: don't overwrite existing elements
        if (page.canvas.elements[child.id]) {
          console.warn(`[detachComponentInstance] Child ID collision: ${child.id}`)
          continue
        }
        page.canvas.elements[child.id] = child
      }

      // ========================================================================
      // 3. Rebuild childrenMap to include the new children
      // ========================================================================
      page.canvas.childrenMap = rebuildChildrenMap(page.canvas.elements)

      // ========================================================================
      // 4. Unregister instance from the component's instanceIds
      // ========================================================================
      const component = state.localComponents[componentId]
      if (component) {
        state.localComponents[componentId] = {
          ...component,
          instanceIds: component.instanceIds.filter((id) => id !== instanceId),
        }
      }
    },

    // ========================================================================
    // AI GENERATION - Track elements being built by AI
    // ========================================================================

  },
})

// ============================================================================
// EXPORTS
// ============================================================================

export const {
  // Page operations
  createPage,
  switchPage,
  renamePage,
  updatePageSlug,
  updatePageDynamicSettings,
  deletePage,
  duplicatePage,
  reorderPages,
  // Element operations
  addElement,
  insertElement,
  updateElement,
  deleteElement,
  deleteElements,
  moveElement,
  moveElements,
  reorderElement,
  // Selection
  setSelection,
  setMultiSelection,
  toggleSelection,
  addToSelection,
  clearSelection,
  // Breakpoints
  togglePageBreakpoint,
  // Tool mode
  setToolMode,
  setPenStrokeColor,
  setPenBrushSize,
  setPenStrokeOpacity,
  // Preview mode
  togglePreviewMode,
  setPreviewMode,
  // Responsive breakpoint editing
  setEditingBreakpoint,
  updateElementResponsiveStyle,
  clearElementResponsiveStyles,
  clearSingleResponsiveStyle,
  // Settings (behavioral configs like autoWidth, sticky, container, etc.)
  updateElementResponsiveSetting,
  clearElementResponsiveSettings,
  clearSingleResponsiveSetting,
  // Deprecated aliases - use the Setting versions above
  updateElementResponsiveProperty,
  clearElementResponsiveProperties,
  clearSingleResponsiveProperty,
  // Viewport
  setViewport,
  // History
  undo,
  redo,
  // Serialization
  loadPages,
  loadCanvas,
  // Local Components
  loadLocalComponents,
  addLocalComponent,
  updateLocalComponent,
  updateComponentSourceElement,
  deleteLocalComponent,
  addExposedProp,
  removeExposedProp,
  updateExposedProp,
  registerComponentInstance,
  unregisterComponentInstance,
  updateInstancePropValues,
  updateComponentInstancePropValue,
  updateNestedInstancePropValue,
  updateComponentInstanceCmsBindings,
  enterComponentEditMode,
  exitComponentEditMode,
  detachComponentInstance,
  // AI Generation
  // Selection freeze
} = canvasSlice.actions

export default canvasSlice.reducer

// ============================================================================
// SELECTORS - For optimized component subscriptions
// ============================================================================

/**
 * SELECTOR USAGE:
 * Use these selectors with useSelector to subscribe to specific state slices.
 * This prevents unnecessary re-renders when unrelated state changes.
 *
 * ============================================================================
 * KEY CHANGE: All selectors now work with the ACTIVE PAGE
 * ============================================================================
 *
 * The underlying state is now organized by pages, but the selectors abstract
 * this away. When you call `selectElements()`, you get the elements from the
 * ACTIVE page - no need to specify which page.
 *
 * MEMOIZATION:
 * Selectors that compute derived data (like arrays from maps) use createSelector
 * to memoize results. This prevents creating new array references on every call.
 */

// ============================================================================
// Base selectors - Get data from ACTIVE PAGE
// ============================================================================

/**
 * Stable empty references for fallback values in base selectors.
 * Without these, `?? {}` / `?? []` creates a new reference on every call,
 * which breaks createSelector memoization and triggers input stability warnings.
 */
const EMPTY_ELEMENTS: Record<string, never> = {}
const EMPTY_ROOT_IDS: string[] = []
const EMPTY_CHILDREN_MAP: Record<string, never> = {}

/** Select the pages state */
const selectPagesState = (state: { canvas: BuilderSliceState }) =>
  state.canvas.pages

/** Select the active page ID */
export const selectActivePageId = (state: { canvas: BuilderSliceState }) =>
  state.canvas.pages.activePageId

/** Select the active page */
export const selectActivePage = (state: { canvas: BuilderSliceState }) =>
  state.canvas.pages.pages[state.canvas.pages.activePageId]

/** Select elements from the ACTIVE PAGE */
const selectElements = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.canvas.elements ?? EMPTY_ELEMENTS
}

/** Select rootIds from the ACTIVE PAGE */
const selectRootIds = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.canvas.rootIds ?? EMPTY_ROOT_IDS
}

/** Select childrenMap from the ACTIVE PAGE */
const selectChildrenMap = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.canvas.childrenMap ?? EMPTY_CHILDREN_MAP
}

// ============================================================================
// Page selectors
// ============================================================================

/** Select all page infos in order (for sidebar display) */
export const selectPageInfos = createSelector(
  [selectPagesState],
  (pagesState) => {
    return pagesState.pageOrder
      .map((id) => pagesState.pages[id]?.info)
      .filter(Boolean)
  }
)

/** Select page order array */
export const selectPageOrder = (state: { canvas: BuilderSliceState }) =>
  state.canvas.pages.pageOrder

/** Select a specific page by ID */
export const selectPageById = (
  state: { canvas: BuilderSliceState },
  pageId: string
) => state.canvas.pages.pages[pageId]

// ============================================================================
// Element selectors - All operate on ACTIVE PAGE
// ============================================================================

/** Select element by ID from ACTIVE PAGE - O(1) lookup */
export const selectElementById = (
  state: { canvas: BuilderSliceState },
  id: string
) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.canvas.elements[id]
}

/**
 * Select all root elements in order from the ACTIVE PAGE.
 *
 * MEMOIZED: Uses createSelector to return the same array reference
 * when elements and rootIds haven't changed.
 */
export const selectRootElements = createSelector(
  [selectElements, selectRootIds],
  (elements, rootIds) => {
    return rootIds.map((id) => elements[id]).filter(Boolean)
  }
)

/**
 * Select canvas data for the LayersPanel from the ACTIVE PAGE.
 *
 * MEMOIZED: Returns the same object reference when elements, childrenMap,
 * and rootIds haven't changed. This prevents LayersPanel from re-rendering
 * when only viewport or selection changes.
 *
 * WHY THIS EXISTS:
 * The LayersPanel was using selectActivePage which returns a new reference
 * on every Redux update (including viewport changes from pan/zoom).
 * This caused hundreds of unnecessary re-renders per second during panning.
 */
export const selectLayersPanelData = createSelector(
  [selectElements, selectChildrenMap, selectRootIds, selectActivePageId],
  (elements, childrenMap, rootIds, activePageId) => ({
    elements,
    childrenMap,
    rootIds,
    pageId: activePageId,
  })
)

/**
 * Factory function to create a memoized selector for children of a specific parent
 * in the ACTIVE PAGE.
 *
 * Usage: const selectMyChildren = makeSelectChildren('parent-id')
 *        const children = useAppSelector(selectMyChildren)
 */
export const makeSelectChildren = (parentId: string | null) =>
  createSelector(
    [selectElements, selectChildrenMap],
    (elements, childrenMap) => {
      const key = parentId ?? '__root__'
      const childIds = childrenMap[key] || []
      return childIds.map((id) => elements[id]).filter(Boolean)
    }
  )

/**
 * Select children of a parent from ACTIVE PAGE - O(1) lookup via childrenMap.
 *
 * NOTE: This selector is NOT memoized because parentId is a parameter.
 * For memoized child selection, use makeSelectChildren() factory.
 * This is kept for backwards compatibility with existing code that
 * uses direct store access (store.getState()).
 */
export const selectChildren = (
  state: { canvas: BuilderSliceState },
  parentId: string | null
) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  if (!activePage) return []
  const { elements, childrenMap } = activePage.canvas
  const key = parentId ?? '__root__'
  const childIds = childrenMap[key] || []
  return childIds.map((id) => elements[id]).filter(Boolean)
}

// ============================================================================
// Selection selectors - From ACTIVE PAGE
// ============================================================================

/** Select all selected IDs from ACTIVE PAGE - returns stable empty array when no page */
export const selectSelectedIds = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.selection.selectedIds ?? EMPTY_ROOT_IDS
}

/** Check if a specific element is selected in ACTIVE PAGE */
export const selectIsSelected = (
  state: { canvas: BuilderSliceState },
  id: string
) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.selection.selectedIds.includes(id) ?? false
}

/** Get first selected ID from ACTIVE PAGE (for backwards compatibility and single-selection cases) */
export const selectSelectedId = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.selection.selectedIds[0] ?? null
}

// ============================================================================
// Tool mode selector - Global (shared across all pages)
// ============================================================================

/** Select current tool mode (global) */
export const selectToolMode = (state: { canvas: BuilderSliceState }) =>
  state.canvas.toolMode

/** Select active pen stroke color (global) */
export const selectPenStrokeColor = (state: { canvas: BuilderSliceState }) =>
  state.canvas.penStrokeColor

/** Select active pen brush size / stroke width (global) */
export const selectPenBrushSize = (state: { canvas: BuilderSliceState }) =>
  state.canvas.penBrushSize

/** Select active pen stroke opacity (global, 0–1) */
export const selectPenStrokeOpacity = (state: { canvas: BuilderSliceState }) =>
  state.canvas.penStrokeOpacity

/** Select canvas error state (global) - null when no error */
export const selectCanvasError = (state: { canvas: BuilderSliceState }) =>
  state.canvas.canvasError

/** Select preview mode state (global) */
export const selectPreviewMode = (state: { canvas: BuilderSliceState }) =>
  state.canvas.previewMode

/**
 * Select current breakpoint editing mode (global).
 *
 * Returns 'desktop' or 'mobile' - controls which breakpoint's styles
 * are shown and edited in the properties panel.
 */
export const selectEditingBreakpoint = (state: { canvas: BuilderSliceState }) =>
  state.canvas.editingBreakpoint

// ============================================================================
// Viewport selectors - From ACTIVE PAGE
// ============================================================================

/** Select viewport state from ACTIVE PAGE - returns existing object reference */
export const selectViewport = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.viewport ?? { panX: 0, panY: 0, zoom: 1 }
}

/** Select zoom level from ACTIVE PAGE */
export const selectZoom = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.viewport.zoom ?? 1
}

/**
 * Select pan values from ACTIVE PAGE.
 *
 * MEMOIZED: Returns same object reference when panX/panY haven't changed.
 */
export const selectPan = createSelector([selectActivePage], (activePage) => ({
  x: activePage?.viewport.panX ?? 0,
  y: activePage?.viewport.panY ?? 0,
}))

// ============================================================================
// History selectors - From ACTIVE PAGE (local to each page)
// ============================================================================

/** Check if undo is available in ACTIVE PAGE */
export const selectCanUndo = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return (activePage?.history.past.length ?? 0) > 0
}

/** Check if redo is available in ACTIVE PAGE */
export const selectCanRedo = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return (activePage?.history.future.length ?? 0) > 0
}

// ============================================================================
// Canvas state selectors - For serialization
// ============================================================================

/** Select the entire canvas state from ACTIVE PAGE (for serialization) - returns existing reference */
export const selectCanvasState = (state: { canvas: BuilderSliceState }) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  return activePage?.canvas
}

/** Select the entire pages state (for full project serialization) */
export const selectAllPages = (state: { canvas: BuilderSliceState }) =>
  state.canvas.pages

/**
 * Select the main page element from the ACTIVE PAGE.
 *
 * MEMOIZED: Returns the first element of type 'page' found in root elements.
 * In a typical canvas builder, there's usually one main page element per page.
 *
 * USAGE: Can be used to get the main page element for various operations
 * like centering, property inspection, etc.
 */
export const selectMainPage = createSelector(
  [selectElements, selectRootIds],
  (elements, rootIds) => {
    // Find the first page element among root elements
    for (const id of rootIds) {
      const element = elements[id]
      if (element && element.type === 'page') {
        return element
      }
    }
    return null
  }
)

// ============================================================================
// Local Components selectors
// ============================================================================

/** Select all local components as a record (for O(1) lookup) */
export const selectLocalComponents = (state: { canvas: BuilderSliceState }) =>
  state.canvas.localComponents

/** Check if local components have been loaded from database */
export const selectLocalComponentsLoaded = (state: { canvas: BuilderSliceState }) =>
  state.canvas.localComponentsLoaded

/** Select a specific local component by ID */
export const selectLocalComponentById = (
  state: { canvas: BuilderSliceState },
  componentId: string
) => state.canvas.localComponents[componentId]

/**
 * Select all local components as an array (for iteration/display).
 *
 * MEMOIZED: Returns the same array reference when localComponents haven't changed.
 */
export const selectLocalComponentsList = createSelector(
  [selectLocalComponents],
  (components) => Object.values(components)
)

/**
 * Select local components sorted by name.
 *
 * MEMOIZED: For sidebar display with alphabetical ordering.
 */
export const selectLocalComponentsSorted = createSelector(
  [selectLocalComponentsList],
  (components) => [...components].sort((a, b) => a.name.localeCompare(b.name))
)

/**
 * Select local components grouped by tags.
 *
 * MEMOIZED: For categorized sidebar display.
 */
export const selectLocalComponentsByTag = createSelector(
  [selectLocalComponentsList],
  (components) => {
    const byTag: Record<string, LocalComponent[]> = {}
    const uncategorized: LocalComponent[] = []

    for (const component of components) {
      if (component.tags.length === 0) {
        uncategorized.push(component)
      } else {
        for (const tag of component.tags) {
          if (!byTag[tag]) {
            byTag[tag] = []
          }
          byTag[tag].push(component)
        }
      }
    }

    return { byTag, uncategorized }
  }
)

/** Select the currently editing component ID (null = not in edit mode) */
export const selectEditingComponentId = (state: {
  canvas: BuilderSliceState
}) => state.canvas.editingComponentId

/** Select the currently editing component (null = not in edit mode) */
export const selectEditingComponent = (state: { canvas: BuilderSliceState }) =>
  state.canvas.editingComponentId
    ? state.canvas.localComponents[state.canvas.editingComponentId]
    : null

/** Check if we're currently in component edit mode */
export const selectIsEditingComponent = (state: {
  canvas: BuilderSliceState
}) => state.canvas.editingComponentId !== null

/**
 * Select the component that a component instance belongs to.
 *
 * Used when rendering component instances to get the source tree.
 */
export const selectComponentForInstance = (
  state: { canvas: BuilderSliceState },
  instanceId: string
) => {
  const activePage = state.canvas.pages.pages[state.canvas.pages.activePageId]
  if (!activePage) return null

  const instance = activePage.canvas.elements[instanceId]
  if (!instance || instance.type !== 'component') return null

  return state.canvas.localComponents[
    (instance as ComponentInstanceElement).componentId
  ]
}
