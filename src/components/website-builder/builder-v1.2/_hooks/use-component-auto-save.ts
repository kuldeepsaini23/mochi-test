/**
 * ============================================================================
 * USE COMPONENT AUTO-SAVE HOOK - LocalComponent Sync to Database
 * ============================================================================
 *
 * Automatically syncs LocalComponent changes from Redux to the database.
 *
 * ============================================================================
 * WHY THIS HOOK EXISTS
 * ============================================================================
 *
 * LocalComponents are stored in two places:
 * 1. Redux (for fast UI updates and rendering)
 * 2. Database (for persistence across sessions)
 *
 * When a user edits a component (in "Edit Component" mode or via the properties
 * panel), the changes are immediately applied to Redux. This hook watches for
 * those Redux changes and syncs them to the database.
 *
 * ============================================================================
 * WHAT THIS HOOK SYNCS
 * ============================================================================
 *
 * - sourceTree changes (when elements inside a component are edited)
 * - exposedProps changes (when props are added/removed/updated)
 * - name/description/tags changes (metadata updates)
 *
 * ============================================================================
 * HOW IT WORKS
 * ============================================================================
 *
 * 1. Subscribes to Redux store changes
 * 2. Compares current localComponents state with last synced state
 * 3. For each changed component, schedules a debounced save
 * 4. Calls the tRPC update mutation to sync to database
 *
 * ============================================================================
 * MASTER COMPONENT EDITING
 * ============================================================================
 *
 * When a master component (primary instance) is edited on the canvas:
 * 1. The `updateComponentSourceElement` action updates Redux
 * 2. This hook detects the change
 * 3. The updated sourceTree is synced to the database
 * 4. All instances re-render with the new definition automatically
 *
 * ============================================================================
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'
import { store } from '../_lib/store'
import { selectLocalComponents } from '../_lib/canvas-slice'
import type { LocalComponent } from '../_lib/types'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for the component auto-save hook.
 */
interface UseComponentAutoSaveOptions {
  /** Organization ID for tRPC mutations */
  organizationId: string
  /** Debounce delay in milliseconds */
  debounceMs?: number
  /** Whether auto-save is enabled */
  enabled?: boolean
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a comparison key for a LocalComponent.
 * Used to detect changes that need to be synced.
 *
 * Includes all fields that should trigger a database sync when changed:
 * - sourceTree (the component's element hierarchy)
 * - exposedProps (customizable properties)
 * - name, description, tags (metadata)
 * - skeletonStyles (loading skeleton theme colors)
 */
function createComponentComparisonKey(component: LocalComponent): string {
  return JSON.stringify({
    sourceTree: component.sourceTree,
    exposedProps: component.exposedProps,
    name: component.name,
    description: component.description,
    tags: component.tags,
    skeletonStyles: component.skeletonStyles,
  })
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook that auto-saves LocalComponent changes to the database.
 *
 * USAGE:
 * ```tsx
 * useComponentAutoSave({
 *   organizationId: 'org_123',
 *   enabled: true,
 * })
 * ```
 *
 * Call this hook once in the builder component. It will automatically
 * sync any LocalComponent changes to the database.
 */
export function useComponentAutoSave({
  organizationId,
  debounceMs = 1500,
  enabled = true,
}: UseComponentAutoSaveOptions): void {
  // ============================================================================
  // REFS FOR TRACKING STATE
  // ============================================================================

  /**
   * Track the last synced state for each component.
   * Key = component ID, Value = comparison key
   */
  const lastSyncedStatesRef = useRef<Record<string, string>>({})

  /**
   * Track pending debounce timers for each component.
   * Allows independent debouncing per component.
   */
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  /**
   * Track which components are currently being saved.
   * Prevents duplicate saves for the same component.
   */
  const savingComponentsRef = useRef<Set<string>>(new Set())

  // ============================================================================
  // TRPC MUTATION
  // ============================================================================

  const updateMutation = trpc.localComponents.update.useMutation()

  // Store mutation in ref to avoid dependency issues in useEffect
  const updateMutationRef = useRef(updateMutation)
  updateMutationRef.current = updateMutation

  // Store organizationId in ref to avoid dependency issues
  const organizationIdRef = useRef(organizationId)
  organizationIdRef.current = organizationId

  // ============================================================================
  // SAVE FUNCTION
  // ============================================================================

  /**
   * Save a single component to the database.
   *
   * This function:
   * 1. Checks if the component is already being saved
   * 2. Gets the current component state from Redux
   * 3. Calls the tRPC mutation to update the database
   * 4. Updates the last synced state on success
   *
   * NOTE: Uses refs for mutation and organizationId to avoid re-creating
   * this callback on every render, which would cause the useEffect to re-run.
   */
  const saveComponent = useCallback(
    async (componentId: string) => {
      // Guard: Don't save if already saving this component
      if (savingComponentsRef.current.has(componentId)) {
        return
      }

      // Get current component from Redux
      const currentComponents = selectLocalComponents(store.getState())
      const component = currentComponents[componentId]

      // Guard: Component may have been deleted
      if (!component) {
        // Clean up tracking state
        delete lastSyncedStatesRef.current[componentId]
        return
      }

      // Check if component has actually changed since last sync
      const currentKey = createComponentComparisonKey(component)
      const lastSyncedKey = lastSyncedStatesRef.current[componentId]

      if (currentKey === lastSyncedKey) {
        return
      }

      savingComponentsRef.current.add(componentId)

      try {
        await updateMutationRef.current.mutateAsync({
          organizationId: organizationIdRef.current,
          componentId,
          name: component.name,
          description: component.description,
          sourceTree: component.sourceTree as unknown,
          exposedProps: component.exposedProps as unknown,
          tags: component.tags,
          skeletonStyles: component.skeletonStyles as unknown,
        })

        // Update last synced state on success
        lastSyncedStatesRef.current[componentId] = currentKey
      } catch (error) {
        // Don't update lastSyncedStatesRef on error - will retry on next change
      } finally {
        savingComponentsRef.current.delete(componentId)
      }
    },
    [] // No dependencies - uses refs for mutable values
  )

  // Store saveComponent in ref to use inside handleChange without causing re-renders
  const saveComponentRef = useRef(saveComponent)
  saveComponentRef.current = saveComponent

  // ============================================================================
  // STORE SUBSCRIPTION
  // ============================================================================

  useEffect(() => {
    // Skip if not enabled or missing required IDs
    if (!enabled || !organizationIdRef.current) {
      return
    }

    // Initialize with current component states
    const initComponents = selectLocalComponents(store.getState())
    for (const [id, component] of Object.entries(initComponents)) {
      lastSyncedStatesRef.current[id] = createComponentComparisonKey(component)
    }

    /**
     * Handle store changes.
     * Detects changes to localComponents and schedules saves.
     *
     * CRITICAL: Only save components that have ACTUALLY been edited by the user.
     * Do NOT save components that were just loaded from the database.
     *
     * WHY: When useLocalComponents loads components from DB, they have "old" sourceTree.
     * If we save immediately, we'd overwrite the correct canvas state with stale DB data.
     * Instead, we only save AFTER useMasterComponentSync has had a chance to sync
     * the canvas state to the sourceTree.
     */
    const handleChange = () => {
      const currentComponents = selectLocalComponents(store.getState())

      // Check each component for changes
      for (const [id, component] of Object.entries(currentComponents)) {
        const currentKey = createComponentComparisonKey(component)
        const lastSyncedKey = lastSyncedStatesRef.current[id]

        // Skip if unchanged
        if (currentKey === lastSyncedKey) {
          continue
        }

        // ========================================================================
        // CRITICAL FIX: Don't save newly loaded components
        // ========================================================================
        // If lastSyncedKey is undefined, this component was just loaded from DB.
        // We should NOT save it - instead, we store its current key as the baseline.
        // The useMasterComponentSync hook will update the sourceTree from the canvas,
        // which will trigger ANOTHER change that we WILL save.
        // ========================================================================
        if (lastSyncedKey === undefined) {
          lastSyncedStatesRef.current[id] = currentKey
          continue
        }

        // Component has ACTUALLY changed (user edit) - schedule debounced save

        // Clear existing timer for this component
        if (debounceTimersRef.current[id]) {
          clearTimeout(debounceTimersRef.current[id])
        }

        // Schedule new save
        debounceTimersRef.current[id] = setTimeout(() => {
          saveComponentRef.current(id)
          delete debounceTimersRef.current[id]
        }, debounceMs)
      }

      // Handle deleted components - clean up tracking state
      for (const id of Object.keys(lastSyncedStatesRef.current)) {
        if (!currentComponents[id]) {
          delete lastSyncedStatesRef.current[id]
          // Clear any pending timer
          if (debounceTimersRef.current[id]) {
            clearTimeout(debounceTimersRef.current[id])
            delete debounceTimersRef.current[id]
          }
        }
      }
    }

    // Subscribe to store
    const unsubscribe = store.subscribe(handleChange)

    // Cleanup
    return () => {
      unsubscribe()
      // Clear all pending timers
      for (const timer of Object.values(debounceTimersRef.current)) {
        clearTimeout(timer)
      }
      debounceTimersRef.current = {}
    }
  }, [enabled, debounceMs]) // organizationId and saveComponent accessed via refs
}
