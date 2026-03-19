/**
 * ============================================================================
 * USE MASTER COMPONENT SYNC HOOK
 * ============================================================================
 *
 * Syncs changes from the master frame (and its descendants) to the component's
 * sourceTree in Redux. This ensures that when you edit a master component on
 * the canvas, those changes are reflected in the component definition.
 *
 * ============================================================================
 * HOW MASTER COMPONENTS WORK
 * ============================================================================
 *
 * When a frame is converted to a component:
 * 1. The frame stays as type: 'frame' with `masterOfComponentId` set
 * 2. All children stay on the canvas as real, editable elements
 * 3. A LocalComponent is created with a snapshot of the frame as sourceTree
 *
 * When you edit the master frame or any of its children:
 * 1. Regular `updateElement` actions update the canvas elements
 * 2. This hook detects those changes
 * 3. It rebuilds the sourceTree from the current canvas state
 * 4. It updates the LocalComponent in Redux
 * 5. The useComponentAutoSave hook then syncs to the database
 *
 * ============================================================================
 * WHY THIS IS SEPARATE FROM useComponentAutoSave
 * ============================================================================
 *
 * - useComponentAutoSave: Watches LocalComponent changes in Redux → syncs to DB
 * - useMasterComponentSync: Watches canvas element changes → updates LocalComponent
 *
 * This separation keeps each hook focused on one responsibility.
 *
 * ============================================================================
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'
import { store } from '../_lib/store'
import {
  selectLocalComponents,
  selectActivePage,
  updateLocalComponent,
} from '../_lib/canvas-slice'
import { collectDescendantIds } from '../_lib/component-utils'
import type { CanvasElement, LocalComponent, FrameElement } from '../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface UseMasterComponentSyncOptions {
  /** Debounce delay in milliseconds */
  debounceMs?: number
  /** Whether sync is enabled */
  enabled?: boolean
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Deep clone an element to ensure all nested objects are copied.
 * Used when building the sourceTree snapshot.
 */
function deepCloneElement<T extends CanvasElement>(element: T): T {
  return JSON.parse(JSON.stringify(element)) as T
}

/**
 * Build a sourceTree from a master frame and its descendants.
 * This creates a complete snapshot that instances will render from.
 */
function buildSourceTree(
  masterFrame: FrameElement,
  elements: Record<string, CanvasElement>,
  childrenMap: Record<string, string[]>
): LocalComponent['sourceTree'] {
  // Collect all descendant element IDs
  const descendantIds = collectDescendantIds(masterFrame.id, childrenMap)
  const childElements = descendantIds
    .map((id) => elements[id])
    .filter((el): el is CanvasElement => el !== undefined)

  // Build the children map for the sourceTree
  const sourceChildrenMap: Record<string, string[]> = {}
  for (const element of [masterFrame, ...childElements]) {
    const children = childrenMap[element.id] || []
    if (children.length > 0) {
      sourceChildrenMap[element.id] = [...children]
    }
  }

  return {
    rootElement: deepCloneElement(masterFrame),
    childElements: childElements.map((el) => deepCloneElement(el)),
    childrenMap: sourceChildrenMap,
  }
}

/**
 * Create a comparison key for a set of elements.
 * Used to detect changes to master component elements.
 */
function createElementsComparisonKey(
  masterFrame: FrameElement,
  elements: Record<string, CanvasElement>,
  childrenMap: Record<string, string[]>
): string {
  const descendantIds = collectDescendantIds(masterFrame.id, childrenMap)
  const relevantElements: Record<string, CanvasElement> = {
    [masterFrame.id]: masterFrame,
  }
  for (const id of descendantIds) {
    if (elements[id]) {
      relevantElements[id] = elements[id]
    }
  }
  return JSON.stringify({
    elements: relevantElements,
    childrenMap: Object.fromEntries(
      Object.entries(childrenMap).filter(
        ([id]) => id === masterFrame.id || descendantIds.includes(id)
      )
    ),
  })
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook that syncs master component changes to the LocalComponent sourceTree.
 *
 * USAGE:
 * ```tsx
 * useMasterComponentSync({
 *   enabled: true,
 * })
 * ```
 *
 * Call this hook once in the builder component alongside useComponentAutoSave.
 */
export function useMasterComponentSync({
  debounceMs = 500,
  enabled = true,
}: UseMasterComponentSyncOptions = {}): void {
  // Track the last synced state for each master component
  // Key = component ID, Value = comparison key of its elements
  const lastSyncedStatesRef = useRef<Record<string, string>>({})

  // Track pending debounce timers for each component
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  /**
   * Sync a master component's elements to its sourceTree.
   */
  const syncMasterComponent = useCallback((componentId: string) => {
    const state = store.getState()
    const activePage = selectActivePage(state)
    const localComponents = selectLocalComponents(state)

    if (!activePage) return

    const elements = activePage.canvas.elements
    const childrenMap = activePage.canvas.childrenMap
    const component = localComponents[componentId]

    if (!component) {
      return
    }

    // Find the master frame
    const masterFrameId = component.primaryInstanceId
    const masterFrame = elements[masterFrameId] as FrameElement | undefined

    if (!masterFrame || masterFrame.type !== 'frame') {
      return
    }

    // Build the new sourceTree
    const newSourceTree = buildSourceTree(masterFrame, elements, childrenMap)

    // Update the component in Redux

    store.dispatch(
      updateLocalComponent({
        id: componentId,
        updates: {
          sourceTree: newSourceTree,
        },
      })
    )

    // Update the last synced state
    const currentKey = createElementsComparisonKey(masterFrame, elements, childrenMap)
    lastSyncedStatesRef.current[componentId] = currentKey
  }, [])

  // Store syncMasterComponent in ref to use inside handleChange without causing re-renders
  const syncMasterComponentRef = useRef(syncMasterComponent)
  syncMasterComponentRef.current = syncMasterComponent

  useEffect(() => {
    if (!enabled) return

    // Track the previous references to avoid unnecessary work
    // During pan/zoom, these references stay the same - only viewport changes
    let prevElements: Record<string, CanvasElement> | null = null
    let prevChildrenMap: Record<string, string[]> | null = null
    let prevLocalComponents: Record<string, LocalComponent> | null = null

    /**
     * Handle store changes.
     * Detects changes to master component elements and schedules syncs.
     *
     * PERFORMANCE OPTIMIZATION:
     * We first check if the elements, childrenMap, or localComponents references changed.
     * During pan/zoom, only viewport changes - elements stay the same reference.
     * This skips all the expensive comparison work during 60fps pan/zoom.
     *
     * CRITICAL: We also check localComponents because:
     * - On initial load, canvas loads BEFORE LocalComponents (async tRPC query)
     * - The first handleChange runs with empty localComponents → sync is skipped
     * - When LocalComponents finally load, we MUST re-run to sync master frames
     */
    const handleChange = () => {
      const state = store.getState()
      const activePage = selectActivePage(state)
      const localComponents = selectLocalComponents(state)

      if (!activePage) return

      const elements = activePage.canvas.elements
      const childrenMap = activePage.canvas.childrenMap

      // FAST PATH: Skip if nothing relevant changed
      // This avoids expensive filtering and JSON.stringify during pan/zoom
      // NOTE: We also check localComponents because they load AFTER canvas data
      if (
        elements === prevElements &&
        childrenMap === prevChildrenMap &&
        localComponents === prevLocalComponents
      ) {
        return
      }

      prevElements = elements
      prevChildrenMap = childrenMap
      prevLocalComponents = localComponents

      // Find all master frames on the current page
      // A master frame has `masterOfComponentId` set
      const masterFrames = Object.values(elements).filter(
        (el): el is FrameElement =>
          el.type === 'frame' && !!(el as FrameElement).masterOfComponentId
      )

      for (const masterFrame of masterFrames) {
        const componentId = masterFrame.masterOfComponentId!
        const component = localComponents[componentId]

        if (!component) {
          // Component may have been deleted - or not yet loaded
          delete lastSyncedStatesRef.current[componentId]
          continue
        }

        // Create a comparison key for the current state
        const currentKey = createElementsComparisonKey(masterFrame, elements, childrenMap)
        const lastSyncedKey = lastSyncedStatesRef.current[componentId]

        // Skip if unchanged
        if (currentKey === lastSyncedKey) {
          continue
        }

        // Initialize if this is the first time seeing this component
        // We sync immediately on first sight to ensure DB matches canvas state.
        // This fixes the bug where edits on first load don't save until another change.
        if (!lastSyncedKey) {
          // Store the key so we don't re-sync unnecessarily
          lastSyncedStatesRef.current[componentId] = currentKey
          // Sync immediately to ensure DB is up-to-date with canvas
          syncMasterComponentRef.current(componentId)
          continue
        }

        // Elements have changed - schedule debounced sync

        // Clear existing timer
        if (debounceTimersRef.current[componentId]) {
          clearTimeout(debounceTimersRef.current[componentId])
        }

        // Schedule new sync
        debounceTimersRef.current[componentId] = setTimeout(() => {
          syncMasterComponentRef.current(componentId)
          delete debounceTimersRef.current[componentId]
        }, debounceMs)
      }
    }

    // Subscribe to store
    const unsubscribe = store.subscribe(handleChange)

    // Initial check
    handleChange()

    // Cleanup
    return () => {
      unsubscribe()
      for (const timer of Object.values(debounceTimersRef.current)) {
        clearTimeout(timer)
      }
      debounceTimersRef.current = {}
    }
  }, [enabled, debounceMs]) // syncMasterComponent accessed via ref
}
