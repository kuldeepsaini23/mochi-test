'use client'

/**
 * ============================================================================
 * USE AI CANVAS BRIDGE - Receives AI-Generated Elements (Dual Canvas)
 * ============================================================================
 *
 * React hook that subscribes to the canvasBridge singleton and routes
 * incoming AI-generated CanvasElements to either:
 *
 * A) DIRECT PAGE CANVAS (default) — elements dispatch directly to
 *    insertElement/addElement on the page canvas. When a page exists,
 *    elements append as children. On empty canvas, elements are floating
 *    root-level objects that the user can freely move and resize.
 *
 * B) STAGING PANEL — only when the push options include
 *    `directInsert: false` (explicit staging directive from the user).
 *    Elements go to the staging Redux slice where the user can preview
 *    and drag-drop them onto the page canvas.
 *
 * Also provides page info + selection context to the bridge so the widget
 * knows where to place AI-generated content (insert-before, append, float).
 *
 * FLOW (Direct Path — Default):
 * 1. Builder mounts → hook pushes page info + selection to the bridge
 * 2. AI generates content → MochiWidget pushes elements (directInsert=true)
 * 3. This hook dispatches insertElement/addElement to the page canvas
 * 4. Elements appear directly on the page or as floating root elements
 *
 * FLOW (Staging Path — Explicit Request):
 * 1. User explicitly requests staging
 * 2. MochiWidget detects staging directive → pushes with directInsert=false
 * 3. This hook creates a StagingGroup and dispatches elements to staging slice
 * 4. StagingPanel renders the staged content with drag handles
 * 5. User drags elements from staging onto the page canvas
 *
 * Split into three effects:
 * - Effect 1: Push page info + selection to bridge (frequent)
 * - Effect 2: Subscribe to element delivery (rare re-subscribe)
 * - Effect 3: Subscribe to generation-complete signal (rare re-subscribe)
 *
 * SOURCE OF TRUTH KEYWORDS: useAICanvasBridge, AICanvasBridgeHook,
 * DualCanvasBridge, StagingBridge
 * ============================================================================
 */

import { useEffect, useMemo, useRef } from 'react'
import { useSelector, useStore } from 'react-redux'
import { canvasBridge } from '@/lib/ai/ui-render/canvas-bridge'
import type { CanvasBridgeSelectionInfo, CanvasBridgePageInfo } from '@/lib/ai/ui-render/canvas-bridge'
import {
  addElement,
  insertElement,
  updateElement,
  selectMainPage,
  selectRootElements,
  selectSelectedId,
  selectElementById,
  selectChildren,
  makeSelectChildren,
  generateElementId,
} from '../_lib/canvas-slice'
import {
  createStagingGroup,
  addStagedElement,
  completeStagingGroup,
} from '../_lib/staging-slice'
import { useAppDispatch } from '../_lib/store'
import type { PageElement } from '../_lib/types'

/**
 * Subscribes to the AI canvas bridge and routes received elements
 * to either the staging panel (default) or directly to the page canvas
 * (when user explicitly requests positional placement).
 *
 * Also registers page info + selection context so the widget can
 * detect selection state for context-aware AI generation.
 *
 * Call this once in the builder's root client component (BuilderContent).
 */
export function useAICanvasBridge(): void {
  const dispatch = useAppDispatch()
  const store = useStore()
  const mainPage = useSelector(selectMainPage)
  const rootElements = useSelector(selectRootElements)
  const selectedId = useSelector(selectSelectedId)

  /** The page element ID that AI elements should be parented under */
  const pageElementId = mainPage?.id ?? null

  /**
   * Ref to track the current staging group ID during a generation stream.
   * Reset to null when generation completes or a new direct-insert push arrives.
   * Using a ref (not state) to avoid re-renders and re-subscriptions.
   */
  const currentStagingGroupIdRef = useRef<string | null>(null)

  /**
   * Resolve the selected element data for the bridge.
   * selectElementById takes (state, id) — wrap in inline selector for useSelector.
   */
  const selectedElement = useSelector(
    (state: Parameters<typeof selectElementById>[0]) =>
      selectedId ? selectElementById(state, selectedId) : undefined
  )

  /**
   * Count children of the page element for append-to-page order offset.
   * Use makeSelectChildren factory for a memoized selector per pageElementId.
   */
  const selectPageChildren = useMemo(
    () => makeSelectChildren(pageElementId),
    [pageElementId]
  )
  const pageChildren = useSelector(selectPageChildren)
  const childCount = pageChildren?.length ?? 0

  /**
   * Get the child count of the selected element (only useful for frames).
   * Used by insert-into-frame placement to set the correct order offset.
   */
  const selectedElementChildCount = useSelector(
    (state: Parameters<typeof selectChildren>[0]) =>
      selectedId ? selectChildren(state, selectedId).length : 0
  )

  /**
   * Build selection info from the Redux-selected element.
   * Memoized to avoid creating a new object reference on every render
   * when the selected element hasn't changed.
   */
  const selectionInfo: CanvasBridgeSelectionInfo | null = useMemo(() => {
    if (!selectedElement || !selectedId) return null
    return {
      id: selectedElement.id,
      type: selectedElement.type,
      name: selectedElement.name,
      parentId: selectedElement.parentId,
      order: selectedElement.order,
      childCount: selectedElementChildCount,
    }
  }, [selectedElement, selectedId, selectedElementChildCount])

  /**
   * Effect 1: Push page info + selection + geometry to the bridge.
   * Runs when the page, selection, or child count changes.
   * Does NOT re-subscribe the listener — that's a separate effect.
   *
   * Includes page position and breakpoint state so the widget can
   * calculate smart floating positions for canvas-floating mode.
   */
  useEffect(() => {
    const hasMobileBreakpoint = mainPage
      ? (mainPage as PageElement).breakpoints?.mobile === true
      : false

    /**
     * Collect bounding boxes of all root-level elements (parentId === null)
     * excluding the page element itself. Used by the floating placement
     * algorithm to avoid overlapping existing sections on the empty canvas.
     */
    const rootBounds = rootElements
      .filter((el) => el.type !== 'page')
      .map((el) => ({
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height || 400,
      }))

    const info: CanvasBridgePageInfo = {
      pageElementId,
      existingChildCount: childCount,
      selectedElement: selectionInfo,
      pageX: mainPage?.x ?? 0,
      pageY: mainPage?.y ?? 0,
      pageWidth: mainPage?.width ?? 1440,
      hasMobileBreakpoint,
      rootElementBounds: rootBounds,
    }

    canvasBridge.setPageInfo(info)
  }, [pageElementId, childCount, selectionInfo, mainPage, rootElements])

  /**
   * Effect 2: Subscribe to the bridge for incoming AI elements.
   * Only re-subscribes when dispatch or pageElementId changes (rare).
   *
   * Routes elements based on the directInsert flag:
   * - directInsert=true → dispatch to page canvas (insertElement/addElement)
   * - directInsert=false/undefined → dispatch to staging slice
   */
  useEffect(() => {
    const unsubscribe = canvasBridge.subscribe((elements, options) => {
      const isDirectInsert = options?.directInsert === true

      if (isDirectInsert) {
        /**
         * DIRECT PATH: Insert directly onto the page canvas.
         * This is the original behavior — only triggered when the user
         * explicitly requests positional placement.
         */
        console.log(
          `[AICanvasBridge] Direct insert: ${elements.length} elements` +
          `${options?.shiftSiblings ? ' (shift siblings)' : ''}`
        )
        /** Reset any active staging group — we're in direct mode now */
        currentStagingGroupIdRef.current = null

        for (const element of elements) {
          if (options?.shiftSiblings) {
            dispatch(insertElement({ element, shiftSiblings: true }))
          } else {
            dispatch(addElement(element))
          }
        }
      } else {
        /**
         * STAGING PATH (default): Route elements to the staging slice.
         * Create a new staging group if one doesn't exist yet for this
         * generation stream (first batch of elements).
         */
        let groupId = currentStagingGroupIdRef.current

        if (!groupId) {
          /** First elements of a new generation — create the staging group */
          groupId = generateElementId()
          currentStagingGroupIdRef.current = groupId

          /**
           * Use the first element's name as the group label,
           * falling back to a generic label if not available.
           */
          const firstElement = elements[0]
          const label = firstElement?.name || 'AI Generated Section'

          dispatch(createStagingGroup({ id: groupId, label }))
        }

        console.log(
          `[AICanvasBridge] Staging: ${elements.length} elements → group ${groupId}`
        )

        for (const element of elements) {
          dispatch(addStagedElement({ groupId, element }))
        }
      }
    })

    return () => {
      unsubscribe()
      currentStagingGroupIdRef.current = null
      canvasBridge.setPageInfo({
        pageElementId: null,
        existingChildCount: 0,
        selectedElement: null,
        pageX: 0,
        pageY: 0,
        pageWidth: 1440,
        hasMobileBreakpoint: false,
        rootElementBounds: [],
      })
    }
  }, [dispatch, pageElementId])

  /**
   * Effect 3: Subscribe to generation-complete signals.
   * When the MochiWidget finishes a ui-spec stream, it calls
   * canvasBridge.signalGenerationComplete(). We use this to
   * mark the current staging group as 'ready'.
   */
  useEffect(() => {
    const unsubscribe = canvasBridge.onGenerationComplete(() => {
      const groupId = currentStagingGroupIdRef.current
      if (groupId) {
        console.log(`[AICanvasBridge] Generation complete → staging group ${groupId}`)
        dispatch(completeStagingGroup(groupId))
        /** Reset for the next generation stream */
        currentStagingGroupIdRef.current = null
      }
    })

    return unsubscribe
  }, [dispatch])

  /**
   * Effect 4: Subscribe to element property updates.
   * When the AI connects a form, product, or other resource to an existing
   * element, it pushes updates through the bridge. This effect dispatches
   * updateElement() to the Redux store for each update.
   *
   * Supports `__find_by_type:elementType` as the ID — finds the first
   * element of that type on the active page and updates it.
   */
  useEffect(() => {
    const unsubscribe = canvasBridge.subscribeToUpdates((updates) => {
      for (const update of updates) {
        let targetId = update.id
        const rawUpdates = { ...update.updates }

        /**
         * Type-based lookup: if ID starts with '__find_by_type:', search
         * all elements on the active page for the first match of that type.
         * Supports additional matchers:
         * - __matchText: find element with matching content/label (partial match)
         * - __matchName: find element with matching name (partial match)
         */
        if (targetId.startsWith('__find_by_type:')) {
          const targetType = targetId.replace('__find_by_type:', '')
          const state = store.getState() as {
            canvas: {
              pages: {
                pages: Record<string, { canvas: { elements: Record<string, Record<string, unknown>> } }>
                activePageId: string
              }
            }
          }
          const activePage = state.canvas?.pages?.pages?.[state.canvas?.pages?.activePageId]
          const elements = activePage?.canvas?.elements ?? {}

          /** Extract matchers (not real properties — remove before dispatching) */
          const matchText = typeof rawUpdates.__matchText === 'string' ? rawUpdates.__matchText : null
          const matchName = typeof rawUpdates.__matchName === 'string' ? rawUpdates.__matchName : null
          delete rawUpdates.__matchText
          delete rawUpdates.__matchName

          /**
           * Find the best matching element:
           * 1. If __matchText provided → find by content/label text match
           * 2. If __matchName provided → find by element name match
           * 3. Otherwise → find first element of the target type
           */
          let found: [string, Record<string, unknown>] | undefined

          if (matchText) {
            found = Object.entries(elements).find(([, el]) => {
              if (el.type !== targetType) return false
              const content = (el.content as string) ?? (el.label as string) ?? ''
              return content.toLowerCase().includes(matchText.toLowerCase())
            })
          } else if (matchName) {
            found = Object.entries(elements).find(([, el]) => {
              if (el.type !== targetType) return false
              const name = (el.name as string) ?? ''
              return name.toLowerCase().includes(matchName.toLowerCase())
            })
          } else {
            found = Object.entries(elements).find(([, el]) => el.type === targetType)
          }

          if (found) {
            targetId = found[0]
            console.log(`[AICanvasBridge] Found ${targetType} element: ${targetId}`)
          } else {
            console.warn(`[AICanvasBridge] No ${targetType} element found on page`, { matchText, matchName })
            continue
          }
        }

        /**
         * Handle style updates — merge into existing styles rather than
         * replacing them. The `styles` key in updates is a partial style object
         * that gets spread into the element's existing styles.
         */
        const finalUpdates: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(rawUpdates)) {
          if (key === 'styles' && typeof value === 'object' && value !== null) {
            /** Merge styles with existing — look up current element styles */
            const state = store.getState() as {
              canvas: {
                pages: {
                  pages: Record<string, { canvas: { elements: Record<string, Record<string, unknown>> } }>
                  activePageId: string
                }
              }
            }
            const activePage = state.canvas?.pages?.pages?.[state.canvas?.pages?.activePageId]
            const currentElement = activePage?.canvas?.elements?.[targetId]
            const currentStyles = (currentElement?.styles ?? {}) as Record<string, unknown>
            finalUpdates.styles = { ...currentStyles, ...value as Record<string, unknown> }
          } else {
            finalUpdates[key] = value
          }
        }

        console.log(`[AICanvasBridge] Updating element ${targetId}:`, finalUpdates)
        dispatch(updateElement({ id: targetId, updates: finalUpdates }))
      }
    })

    return unsubscribe
  }, [dispatch, store])

}
