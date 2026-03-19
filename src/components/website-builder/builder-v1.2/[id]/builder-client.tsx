/**
 * ============================================================================
 * BUILDER CLIENT - Redux Provider & Data Population
 * ============================================================================
 *
 * WHY: Wraps the Canvas in Redux Provider and populates store with server data.
 * HOW: Uses useSuspenseQuery to get prefetched data, loads into Redux via useEffect.
 *
 * ============================================================================
 * DATA FLOW - SINGLE SOURCE OF ENTRY
 * ============================================================================
 *
 * 1. Server prefetches data via builder.getDataByPageSlug (page.tsx)
 * 2. HydrationBoundary transfers cache to client (page.tsx)
 * 3. useSuspenseQuery returns data INSTANTLY (already in cache)
 * 4. useEffect populates Redux when data changes (NOT during render)
 * 5. Active page is set based on URL pathname
 * 6. Canvas renders with fresh data
 *
 * CRITICAL: Redux dispatch happens in useEffect, NOT during render.
 * This prevents the "Cannot update component while rendering" React error.
 * tRPC/React Query handles all caching - we just use the data.
 *
 * ============================================================================
 * URL AS SINGLE SOURCE OF TRUTH FOR ACTIVE PAGE
 * ============================================================================
 *
 * The URL pathname determines which page is active, NOT the saved database state.
 * The saved `activePageId` in the database is IGNORED on load.
 * We always derive the active page from the URL pathname.
 */

'use client'

import { Provider } from 'react-redux'
import { useEffect, useRef, useCallback } from 'react'
import { store, useAppDispatch } from '../_lib/store'
import { loadPages, switchPage } from '../_lib/canvas-slice'
import { BuilderProvider } from '../_lib/builder-context'
import { Canvas } from '../_components'
import { CanvasLoader } from '../_components/canvas'
import { trpc } from '@/trpc/react-provider'
import type { PagesState } from '../_lib/types'
import { useSyncExternalStore } from 'react'
import { useAICanvasBridge } from '../_hooks/use-ai-canvas-bridge'

interface BuilderClientProps {
  /** Page ID - the first-class page entity */
  pageId: string
  /** Organization ID for tRPC queries */
  organizationId: string
  /** Initial pathname from URL - determines which page is active */
  initialPathname: string
}

/**
 * Find the page ID that matches the given URL pathname.
 *
 * WHY: URL is the single source of truth for which page is active.
 * HOW: Searches all pages for a matching slug (with/without leading slash).
 *
 * @param pages - The PagesState from the database
 * @param pathname - The pathname from the URL (e.g., "home", "about-us")
 * @returns The matching page ID, or the first page ID as fallback
 */
function findPageIdByPathname(pages: PagesState, pathname: string): string {
  // Normalize pathname for comparison (handle with/without leading slash)
  const normalizedPathname = pathname.replace(/^\//, '')
  const withSlash = `/${normalizedPathname}`

  // Search all pages for a matching slug
  for (const [pageId, page] of Object.entries(pages.pages)) {
    const pageSlug = page.info.slug
    const normalizedSlug = pageSlug.replace(/^\//, '')

    if (
      normalizedSlug === normalizedPathname ||
      pageSlug === pathname ||
      pageSlug === withSlash
    ) {
      return pageId
    }
  }

  // Fallback: return first page if no match found
  return pages.pageOrder[0] || ''
}

/**
 * Create a unique key for the loaded data.
 * Includes pageId and updatedAt to detect fresh data.
 */
function createDataKey(pageId: string, updatedAt: string | Date | null | undefined): string {
  const timestamp = updatedAt ? new Date(updatedAt).getTime() : 0
  return `${pageId}:${timestamp}`
}

/**
 * Hook to subscribe to Redux store hydration state.
 *
 * Uses useSyncExternalStore to properly subscribe to the Redux store
 * and check if we have an active page loaded (meaning hydration is complete).
 *
 * WHY: We need to know when Redux has been populated with data so we can
 * show a loading state until it's ready. Using useSyncExternalStore is
 * the React 18+ way to subscribe to external stores without causing
 * "Cannot update component while rendering" errors.
 */
function useIsStoreHydrated(): boolean {
  const subscribe = useCallback((callback: () => void) => {
    return store.subscribe(callback)
  }, [])

  const getSnapshot = useCallback(() => {
    const state = store.getState()
    // Store is hydrated when we have an active page ID set
    return Boolean(state.canvas.pages.activePageId)
  }, [])

  // For SSR, always return false (not hydrated yet)
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Internal component that fetches data and renders Canvas.
 *
 * WHY: Needs to be inside Redux Provider to dispatch loadPages.
 * HOW: useSuspenseQuery returns prefetched data, useEffect populates Redux.
 *
 * ============================================================================
 * CRITICAL FIX: Redux dispatch happens in useEffect, NOT during render
 * ============================================================================
 *
 * Previously, this component dispatched Redux actions during render:
 *   if (data.canvasData && loadedDataKey !== currentDataKey) {
 *     store.dispatch(loadPages(pagesData))  // ← BAD: setState during render!
 *   }
 *
 * This caused the React error:
 *   "Cannot update a component (`PreviewOverlay`) while rendering a
 *    different component (`BuilderContent`)"
 *
 * The bug manifested when:
 * 1. User loses window focus
 * 2. tRPC refetches on window focus regain (refetchOnWindowFocus)
 * 3. BuilderContent re-renders with new data
 * 4. During render, it dispatches to Redux
 * 5. PreviewOverlay (subscribed via useAppSelector) tries to update
 * 6. React throws because you can't update during another component's render
 *
 * FIX: Use useEffect for Redux population. This schedules the dispatch
 * AFTER React finishes rendering, following React's rules.
 *
 * LOADING STATE: We use useSyncExternalStore to subscribe to Redux state
 * and determine if hydration is complete. No local useState needed.
 */
function BuilderContent({ pageId, organizationId, initialPathname }: BuilderClientProps) {
  // Get dispatch from Redux (proper React way)
  const dispatch = useAppDispatch()

  /**
   * AI Canvas Bridge — subscribes to receive AI-generated CanvasElements
   * from the Mochi chat widget's spec-to-canvas converter.
   * When the AI streams a ```ui-spec fence, elements are pushed here.
   */
  useAICanvasBridge()

  // Track which data key we've loaded to prevent duplicate dispatches
  const loadedDataKeyRef = useRef<string | null>(null)

  /**
   * Track the previous pageId to detect external navigation events.
   * When Mochi AI (or any external actor) navigates to a different page
   * via router.push(), the pageId prop changes. We need to switch the
   * active page in Redux to match the new URL.
   */
  const prevPageIdRef = useRef<string>(pageId)

  // Subscribe to Redux hydration state (is there an active page?)
  const isStoreHydrated = useIsStoreHydrated()

  /**
   * Fetch builder data using Suspense query.
   * Data is already prefetched on server, so this returns instantly.
   *
   * CRITICAL: All refetching is DISABLED for the builder.
   *
   * WHY: The builder manages its own data lifecycle via Redux + auto-save.
   * If tRPC refetches (e.g., on window focus), `loadPages` overwrites Redux
   * canvas data with stale DB data. During AI generation this is catastrophic:
   * the streamed elements (containers + children) get wiped, the remaining
   * AI stream produces orphaned children, and the user sees nothing on canvas.
   *
   * The data is loaded ONCE on mount. All subsequent changes are:
   * - Applied locally via Redux (user edits, AI patches)
   * - Persisted via auto-save (1500ms debounce)
   * - NEVER refreshed from the server while the builder is open
   */
  const [data] = trpc.builder.getDataById.useSuspenseQuery(
    {
      organizationId,
      pageId,
    },
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchInterval: false,
    }
  )

  // Create a key that includes the data's updatedAt timestamp
  // This ensures we reload when fresh data arrives, not just when pageId changes
  const currentDataKey = createDataKey(pageId, data.updatedAt)

  /**
   * Effect: Populate Redux when fresh data arrives.
   *
   * WHY useEffect: React requires state updates to happen outside the render phase.
   * Dispatching during render causes the "Cannot update component while rendering" error.
   *
   * WHY ref for tracking: Using a ref instead of state avoids extra re-renders.
   * The ref persists across renders without triggering new ones.
   *
   * BEHAVIOR:
   * - On mount: Populates Redux with initial data
   * - On data change: Updates Redux in background (existing UI stays visible)
   * - On refetch: Same as data change - no loading flash
   */
  useEffect(() => {
    // Skip if we've already loaded this exact data (prevents duplicate dispatches)
    if (loadedDataKeyRef.current === currentDataKey) {
      return
    }

    // Skip if no canvas data
    if (!data.canvasData) {
      return
    }

    // Determine if this is the FIRST hydration (initial mount) vs a refetch
    // On first hydration, loadedDataKeyRef.current is still null.
    // On refetch (e.g., tRPC refetchOnWindowFocus), it has a previous value.
    const isFirstHydration = loadedDataKeyRef.current === null

    // Populate Redux with the data from tRPC
    // canvasData is stored as Record<string, unknown> in DB, cast to PagesState via unknown
    const pagesData = data.canvasData as unknown as PagesState

    // Dispatch to Redux (now safe - we're in useEffect, not during render)
    // loadPages merges incoming data with existing state on refetch:
    // - Preserves activePageId (user's current page)
    // - Preserves viewport, selection, and undo/redo history per page
    dispatch(loadPages(pagesData))

    /**
     * Switch to the page matching the URL in two cases:
     *
     * 1. FIRST HYDRATION (initial mount) — standard: use URL to set active page.
     *
     * 2. EXTERNAL NAVIGATION (pageId prop changed) — when Mochi AI or another
     *    external actor calls router.push() to navigate to a different page,
     *    the pageId prop changes but Redux still has the OLD active page.
     *    We detect this via prevPageIdRef and switch to the new page.
     *
     * We do NOT switch on same-page data refetches (case where pageId hasn't
     * changed). That preserves the user's current page on tab-switch refetches.
     */
    const isExternalNavigation = prevPageIdRef.current !== pageId
    if (isFirstHydration || isExternalNavigation) {
      const targetPageId = findPageIdByPathname(pagesData, initialPathname)
      if (targetPageId) {
        dispatch(switchPage(targetPageId))
      }
      prevPageIdRef.current = pageId
    }

    // Mark this data as loaded (prevents duplicate dispatches on re-renders)
    loadedDataKeyRef.current = currentDataKey
  }, [currentDataKey, data.canvasData, initialPathname, pageId, dispatch])

  /**
   * Loading state: Show minimal UI while waiting for first Redux hydration.
   *
   * Uses useSyncExternalStore to subscribe to Redux state directly.
   * No local useState needed - we just check if Redux has an active page.
   *
   * This only shows on initial mount. Subsequent data changes (refetch on
   * window focus, etc.) won't show this loading state - the existing canvas
   * stays visible while Redux updates in the background.
   */
  /**
   * Show CanvasLoader while Redux hydrates with server data.
   * Uses the same loading animation as the route-level loading.tsx
   * for a seamless, consistent loading experience.
   */
  if (!isStoreHydrated) {
    return <CanvasLoader isVisible={true} />
  }

  return (
    <BuilderProvider
      domainName={data.domainName}
      websiteId={data.websiteId}
      domainId={data.domainId}
      organizationId={organizationId}
      enableEcommerce={data.enableEcommerce}
      chatWidgetId={data.chatWidgetId}
    >
      <Canvas
        pageId={pageId}
        organizationId={organizationId}
        pageName={data.pageName}
        websiteName={data.websiteName}
      />
    </BuilderProvider>
  )
}

/**
 * Builder Client - Redux Provider wrapper
 *
 * Provides Redux store context and renders the content component.
 * The content component handles data population from tRPC.
 *
 * IMPORTANT: `initialPathname` determines which page is active on load.
 * This ensures the URL is the single source of truth, not the database.
 */
export function BuilderClient({ pageId, organizationId, initialPathname }: BuilderClientProps) {
  return (
    <Provider store={store}>
      <BuilderContent
        pageId={pageId}
        organizationId={organizationId}
        initialPathname={initialPathname}
      />
    </Provider>
  )
}
