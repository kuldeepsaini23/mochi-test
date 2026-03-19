/**
 * ============================================================================
 * USE AUTO-SAVE HOOK - Active Page Only
 * ============================================================================
 *
 * Automatically saves the ACTIVE page to its corresponding Page in the database.
 *
 * ============================================================================
 * KEY PRINCIPLE: Save ONLY the active page
 * ============================================================================
 *
 * The builder displays ALL pages in a website in Redux.
 * Each page has an ID that matches its Page ID in the database.
 *
 * When saving:
 * 1. We ONLY save the currently ACTIVE page
 * 2. We save its canvas data to the corresponding Page (page ID = page ID)
 * 3. Other pages are NOT touched - they were loaded from DB and stay unchanged
 *
 * WHY only active page:
 * - User is editing one page at a time
 * - Prevents saving pages that don't exist in DB yet
 * - Simpler and more predictable behavior
 *
 * For NEW pages: Use a separate createPage mutation (not auto-save)
 * For DELETED pages: Use a separate deletePage mutation (not auto-save)
 *
 * ============================================================================
 * FILTERED STATE FOR SAVING
 * ============================================================================
 *
 * We FILTER OUT:
 * - `viewport` - Auto-pan centers page on load anyway
 * - `selection` - Selection is ephemeral UI state
 * - `history` - Undo/redo is session-specific
 *
 * We KEEP:
 * - `elements` - The actual page content
 * - `rootIds` - Root element ordering
 * - `childrenMap` - Parent-child relationships
 *
 * ============================================================================
 */

'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { store } from '../_lib/store'
import { selectAllPages } from '../_lib/canvas-slice'
import type { PagesState, PageState } from '../_lib/types'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Save status for UI feedback.
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/**
 * Save error details for the error banner.
 */
export interface SaveError {
  message: string
  timestamp: number
  retryCount: number
}

/**
 * Options for the auto-save hook.
 */
interface UseAutoSaveOptions {
  organizationId: string
  /** Website ID - required for upserting new pages */
  websiteId: string
  /** Domain ID - null when domain is deleted. Pages can still be saved without a domain. */
  domainId: string | null
  debounceMs?: number
  enabled?: boolean
}

/**
 * Return value of the auto-save hook.
 */
interface UseAutoSaveReturn {
  saveStatus: SaveStatus
  saveError: SaveError | null
  saveNow: () => Promise<void>
  clearError: () => void
  lastSavedAt: number | null
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract canvas data from a page in the format expected by the database.
 *
 * WHY: The database expects { elements, rootIds, childrenMap, viewport, selection, history }
 * HOW: We extract these from the page's canvas property and reset ephemeral state.
 */
function extractCanvasDataForSave(page: PageState): Record<string, unknown> {
  return {
    elements: page.canvas.elements,
    rootIds: page.canvas.rootIds,
    childrenMap: page.canvas.childrenMap,
    // Reset ephemeral state - these will be recalculated on load
    viewport: { panX: 0, panY: 0, zoom: 1 },
    selection: { selectedIds: [] },
    history: { past: [], future: [], maxSize: 50 },
  }
}

/**
 * Create a comparison key for a single page's persistent data.
 * Only includes elements, rootIds, and childrenMap (not viewport/selection/history).
 */
function createPageComparisonKey(page: PageState): string {
  return JSON.stringify({
    elements: page.canvas.elements,
    rootIds: page.canvas.rootIds,
    childrenMap: page.canvas.childrenMap,
    // Also include info since name/slug changes should be saved
    info: page.info,
  })
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useAutoSave({
  organizationId,
  websiteId,
  domainId,
  debounceMs = 1500,
  enabled = true,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  // State for UI
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<SaveError | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  // Refs for debouncing and tracking
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)
  const retryCountRef = useRef(0)

  /**
   * Track the last saved state for EACH page.
   * Key = page ID (which equals page ID), Value = comparison key
   */
  const lastSavedPageStatesRef = useRef<Record<string, string>>({})

  /**
   * CRITICAL: Track which page ID needs to be saved.
   *
   * ============================================================================
   * WHY THIS REF EXISTS
   * ============================================================================
   *
   * When auto-save is triggered by a change:
   * 1. User edits Page A → change detected → debounce scheduled
   * 2. User switches to Page B before debounce fires
   * 3. When debounce fires, activePageId is now Page B
   *
   * WITHOUT this ref: We'd save Page B instead of Page A (BUG!)
   * WITH this ref: We save the page that was actually modified
   *
   * This ref captures the page ID at the TIME OF SCHEDULING, not at
   * the time of execution. This ensures the correct page is saved.
   */
  const pendingSavePageIdRef = useRef<string | null>(null)

  /**
   * Track the PENDING comparison key for each page.
   *
   * ============================================================================
   * WHY THIS REF EXISTS (Prevents duplicate "page changed" logs)
   * ============================================================================
   *
   * When a change is detected, we need to prevent the same change from being
   * logged repeatedly during the debounce period (e.g., during viewport pans).
   *
   * - `lastSavedPageStatesRef`: Updated ONLY after successful save
   * - `pendingComparisonKeyRef`: Updated immediately when change is detected
   *
   * The handleChange callback checks BOTH:
   * 1. If currentKey === lastSavedKey → no change since last save, skip
   * 2. If currentKey === pendingKey → same change already scheduled, skip
   *
   * This prevents 700 "page changed" logs while still allowing the save to proceed.
   */
  const pendingComparisonKeyRef = useRef<Record<string, string>>({})

  // Ref to store executeSave for self-reference
  const executeSaveRef = useRef<((pageIdToSave: string, allPages: PagesState) => Promise<void>) | undefined>(undefined)

  // tRPC mutation for saving a single page's canvas data
  const saveMutation = trpc.pages.saveCanvas.useMutation()

  /**
   * Execute the actual save operation using UPSERT.
   *
   * ============================================================================
   * CRITICAL FIX: Page ID is passed explicitly, not read from active page
   * ============================================================================
   *
   * This function now receives the page ID to save as a parameter.
   * This fixes the race condition where:
   * 1. User edits Page A → debounce scheduled
   * 2. User switches to Page B before debounce fires
   * 3. Without fix: Page B would be saved instead of Page A
   * 4. With fix: We save Page A because we captured its ID at schedule time
   *
   * KEY LOGIC: Save the SPECIFIED page to its corresponding Page.
   * Uses UPSERT so new pages are created if they don't exist.
   *
   * Page ID = Page ID for existing pages (set in builder.ts when aggregating).
   * For NEW pages, the ID is client-generated and the page will be created.
   */
  const executeSave = useCallback(
    async (pageIdToSave: string, allPages: PagesState) => {
      // Guard: Don't save if missing required IDs (domainId is optional - may be null if domain was deleted)
      if (!organizationId || !websiteId) {
        return
      }

      // Guard: Don't save if already saving
      if (isSavingRef.current) {
        return
      }

      // Get the SPECIFIED page to save (not necessarily the active one)
      const pageToSave = allPages.pages[pageIdToSave]

      if (!pageIdToSave || !pageToSave) {
        setSaveStatus('idle')
        pendingSavePageIdRef.current = null
        return
      }

      // Check if the page has changed since last save
      const currentKey = createPageComparisonKey(pageToSave)
      const lastKey = lastSavedPageStatesRef.current[pageIdToSave]

      if (currentKey === lastKey) {
        setSaveStatus('idle')
        pendingSavePageIdRef.current = null
        return
      }

      isSavingRef.current = true
      setSaveStatus('saving')

      try {
        const canvasData = extractCanvasDataForSave(pageToSave)

        // Pass page info for upsert (creates page if it doesn't exist)
        await saveMutation.mutateAsync({
          organizationId,
          pageId: pageIdToSave, // Page ID (may be new or existing)
          websiteId, // Required for creating new pages
          domainId, // Required for creating new pages
          name: pageToSave.info.name, // Page name from page info
          slug: pageToSave.info.slug.replace(/^\//, ''), // Remove leading slash
          canvasData,
        })

        // Update the last saved state for this page
        lastSavedPageStatesRef.current[pageIdToSave] = currentKey

        // Clear the pending comparison key since save is complete
        delete pendingComparisonKeyRef.current[pageIdToSave]

        // SUCCESS
        retryCountRef.current = 0
        setSaveError(null)
        setSaveStatus('saved')
        setLastSavedAt(Date.now())
        isSavingRef.current = false
        pendingSavePageIdRef.current = null

        // Reset to idle after 2 seconds
        setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev))
        }, 2000)
      } catch (err) {
        // ERROR
        const error = err as Error
        isSavingRef.current = false

        // Check if validation error (don't retry)
        const trpcError = err as { data?: { code?: string } }
        const isValidationError = trpcError.data?.code === 'BAD_REQUEST'

        if (isValidationError) {
          setSaveStatus('error')
          setSaveError({
            message: error.message,
            timestamp: Date.now(),
            retryCount: 0,
          })
          pendingSavePageIdRef.current = null
          return
        }

        // Transient errors - retry up to 3 times with the SAME page ID
        retryCountRef.current += 1

        if (retryCountRef.current < 3) {
          setSaveStatus('pending')
          debounceRef.current = setTimeout(() => {
            const currentPages = selectAllPages(store.getState())
            // Retry with the SAME page ID, not the current active page
            executeSaveRef.current?.(pageIdToSave, currentPages)
          }, 2000)
        } else {
          setSaveStatus('error')
          setSaveError({
            message: `Failed to save: ${error.message}`,
            timestamp: Date.now(),
            retryCount: retryCountRef.current,
          })
          pendingSavePageIdRef.current = null
        }
      }
    },
    [organizationId, websiteId, domainId, saveMutation]
  )

  // Keep the ref in sync with the latest executeSave
  useEffect(() => {
    executeSaveRef.current = executeSave
  })

  /**
   * Manual save - bypass debounce.
   * Saves the currently active page immediately.
   */
  const saveNow = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    const currentPages = selectAllPages(store.getState())
    // Use the pending page ID if there is one, otherwise use active page
    const pageIdToSave = pendingSavePageIdRef.current || currentPages.activePageId
    if (pageIdToSave) {
      await executeSave(pageIdToSave, currentPages)
    }
  }, [executeSave])

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setSaveError(null)
    retryCountRef.current = 0
    setSaveStatus('idle')
  }, [])

  // ========================================================================
  // STORE SUBSCRIPTION - Detect changes to ACTIVE page only
  // ========================================================================

  useEffect(() => {
    // Skip if not enabled or missing IDs
    if (!enabled || !organizationId) {
      return
    }

    // Initialize with current active page state
    const initState = selectAllPages(store.getState())
    if (initState?.activePageId && initState.pages[initState.activePageId]) {
      const activePage = initState.pages[initState.activePageId]
      lastSavedPageStatesRef.current[initState.activePageId] = createPageComparisonKey(activePage)
    }

    /**
     * Handle store changes.
     * Only triggers save when the ACTIVE page's persistent data changes.
     *
     * ============================================================================
     * CRITICAL FIX: Capture page ID at scheduling time
     * ============================================================================
     *
     * When we detect a change, we capture the active page ID immediately
     * and store it in pendingSavePageIdRef. This ensures that when the
     * debounce timer fires, we save the CORRECT page even if the user
     * has switched to a different page.
     *
     * OLD (BUGGY) BEHAVIOR:
     * 1. User edits Page A → debounce scheduled
     * 2. User switches to Page B
     * 3. Debounce fires → reads activePageId → saves Page B (WRONG!)
     *
     * NEW (FIXED) BEHAVIOR:
     * 1. User edits Page A → debounce scheduled, pendingSavePageId = Page A
     * 2. User switches to Page B
     * 3. Debounce fires → uses pendingSavePageId → saves Page A (CORRECT!)
     */
    const handleChange = () => {
      const storeState = store.getState()
      const currentPages = selectAllPages(storeState)

      // Skip if pages not ready
      if (!currentPages?.pages || !currentPages.activePageId) {
        return
      }

      const activePageId = currentPages.activePageId
      const activePage = currentPages.pages[activePageId]

      if (!activePage) {
        return
      }

      // Check if the ACTIVE page has changed
      const currentKey = createPageComparisonKey(activePage)
      const lastSavedKey = lastSavedPageStatesRef.current[activePageId]
      const pendingKey = pendingComparisonKeyRef.current[activePageId]

      // Skip if no change since last SAVE (nothing to save)
      if (currentKey === lastSavedKey) {
        return
      }

      // Skip if this exact change is already PENDING (prevents duplicate logs during debounce)
      // This handles the case where viewport pans trigger Redux updates but the
      // actual saveable content (elements, rootIds, childrenMap) hasn't changed.
      if (currentKey === pendingKey) {
        return
      }

      // CRITICAL: Capture the page ID NOW, at the time of detecting the change
      // This is the page that needs to be saved, regardless of what's active later
      pendingSavePageIdRef.current = activePageId

      // Update the PENDING comparison key immediately.
      // This prevents duplicate "page changed" logs during the debounce period.
      // NOTE: lastSavedPageStatesRef is only updated AFTER a successful save.
      pendingComparisonKeyRef.current[activePageId] = currentKey

      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      // Show pending status
      setSaveStatus('pending')

      // Schedule debounced save
      // The captured page ID is stored in pendingSavePageIdRef
      debounceRef.current = setTimeout(() => {
        const pagesToSave = selectAllPages(store.getState())
        // Use the CAPTURED page ID, not the current active page
        const pageIdToSave = pendingSavePageIdRef.current
        if (pageIdToSave) {
          executeSaveRef.current?.(pageIdToSave, pagesToSave)
        }
      }, debounceMs)
    }

    // Subscribe to store
    const unsubscribe = store.subscribe(handleChange)

    // Cleanup
    return () => {
      unsubscribe()
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [enabled, organizationId, debounceMs])

  return {
    saveStatus,
    saveError,
    saveNow,
    clearError,
    lastSavedAt,
  }
}
