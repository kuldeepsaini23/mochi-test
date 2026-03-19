/**
 * ============================================================================
 * USE LOCAL COMPONENTS HOOK - Database-Backed Component Management
 * ============================================================================
 *
 * This hook provides a bridge between Redux state and the database for
 * LocalComponent operations. It handles:
 *
 * 1. Loading components from database on mount
 * 2. Creating components (Redux + Database)
 * 3. Updating components (Redux + Database)
 * 4. Deleting components (Redux + Database)
 *
 * ============================================================================
 * WHY THIS HOOK EXISTS
 * ============================================================================
 *
 * LocalComponents need to persist at the WEBSITE level, not just in Redux.
 * Without database persistence:
 * - Components would disappear on page refresh
 * - Components wouldn't be available on other pages of the same website
 * - Users would lose all their component work
 *
 * This hook ensures that:
 * - Components are loaded from DB when the builder opens
 * - Every component operation is synced to the database
 * - Redux state is the source of truth for rendering (fast)
 * - Database is the source of truth for persistence (durable)
 *
 * ============================================================================
 * IMPORTANT: BYPASSES UNDO/REDO
 * ============================================================================
 *
 * Component operations are website-level, not canvas-level. They should NOT
 * go through the undo/redo system. This is why we use direct Redux dispatches
 * rather than the history-tracked canvas actions.
 *
 * ============================================================================
 */

'use client'

import { useEffect, useCallback } from 'react'
import { trpc } from '@/trpc/react-provider'
import {
  useAppDispatch,
  useAppSelector,
  selectLocalComponents,
  selectLocalComponentsLoaded,
  loadLocalComponents,
  addLocalComponent,
  updateLocalComponent as updateLocalComponentAction,
  deleteLocalComponent as deleteLocalComponentAction,
} from './index'
import type { LocalComponent, ExposedProp, CanvasElement } from './types'
import { useBuilderContext } from './builder-context'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Source tree structure for a LocalComponent.
 * Contains the complete element hierarchy.
 */
export interface LocalComponentSourceTree {
  rootElement: CanvasElement
  childElements: CanvasElement[]
  childrenMap: Record<string, string[]>
}

/**
 * Input for creating a new LocalComponent.
 * This matches what convertFrameToComponent produces.
 */
export interface CreateComponentInput {
  name: string
  description?: string | null
  sourceTree: LocalComponentSourceTree
  exposedProps?: ExposedProp[]
  tags?: string[]
  /**
   * The ID of the first instance (the "master" instance on canvas).
   * This is set to the original frame's ID during conversion.
   */
  primaryInstanceId?: string
}

/**
 * Input for updating a LocalComponent.
 */
export interface UpdateComponentInput {
  name?: string
  description?: string | null
  sourceTree?: LocalComponentSourceTree
  exposedProps?: ExposedProp[]
  tags?: string[]
  /** ID of another LocalComponent to use as loading skeleton */
  loadingSkeletonComponentId?: string | null
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for managing LocalComponents with database persistence.
 *
 * USAGE:
 * ```tsx
 * const { components, createComponent, updateComponent, deleteComponent, isLoading } = useLocalComponents()
 *
 * // Create a new component
 * await createComponent({
 *   name: 'My Button',
 *   sourceTree: { rootElement, childElements, childrenMap },
 * })
 * ```
 *
 * IMPORTANT: All operations bypass undo/redo. Components are website-level.
 */
export function useLocalComponents() {
  const dispatch = useAppDispatch()
  const { websiteId, organizationId } = useBuilderContext()

  // Get current components from Redux
  const components = useAppSelector(selectLocalComponents)

  // Check if components have already been loaded (global flag in Redux)
  // This prevents multiple hook instances from overwriting each other
  const alreadyLoaded = useAppSelector(selectLocalComponentsLoaded)

  // ============================================================================
  // FETCH COMPONENTS FROM DATABASE
  // ============================================================================

  /**
   * Query to fetch components from database.
   * Only runs when websiteId is available.
   */
  const { data: dbComponents, isLoading, error } = trpc.localComponents.getByWebsite.useQuery(
    {
      organizationId,
      websiteId,
    },
    {
      enabled: !!websiteId && !!organizationId,
      // Stale time of 5 minutes - components don't change often
      staleTime: 5 * 60 * 1000,
    }
  )

  /**
   * Load components into Redux when data is fetched.
   *
   * CRITICAL: Only load ONCE globally (checked via alreadyLoaded from Redux).
   * This prevents multiple hook instances (e.g., sidebar panel mounting on hover)
   * from overwriting Redux state with stale database data.
   *
   * The loadLocalComponents action sets localComponentsLoaded=true in Redux,
   * so subsequent hook mounts will skip this effect entirely.
   */
  useEffect(() => {
    // Skip if already loaded - prevents sidebar hover from overwriting changes
    if (alreadyLoaded) {
      return
    }

    if (dbComponents?.components) {
      // Convert array to Record<id, component> format for Redux
      const componentsMap: Record<string, LocalComponent> = {}

      for (const dbComp of dbComponents.components) {
        // Transform database model to Redux LocalComponent type
        componentsMap[dbComp.id] = {
          id: dbComp.id,
          name: dbComp.name,
          description: dbComp.description ?? undefined,
          websiteId: dbComp.websiteId,
          // sourceTree is stored as JSON, cast to our type
          sourceTree: dbComp.sourceTree as unknown as LocalComponentSourceTree,
          // exposedProps is stored as JSON array
          exposedProps: (dbComp.exposedProps as unknown as ExposedProp[]) ?? [],
          tags: dbComp.tags ?? [],
          // instanceIds are computed from canvas data, not stored in DB
          instanceIds: [],
          // primaryInstanceId is stored in DB - this is the "master" instance
          primaryInstanceId: dbComp.primaryInstanceId ?? '',
          // skeletonStyles for SmartCMS List loading skeleton theme colors
          skeletonStyles: (dbComp.skeletonStyles as unknown as LocalComponent['skeletonStyles']) ?? undefined,
          // loadingSkeletonComponentId - ID of component to use as loading skeleton
          loadingSkeletonComponentId: dbComp.loadingSkeletonComponentId ?? undefined,
          createdAt: new Date(dbComp.createdAt).getTime(),
          updatedAt: new Date(dbComp.updatedAt).getTime(),
        }
      }

      // Load into Redux (also sets localComponentsLoaded = true)
      dispatch(loadLocalComponents(componentsMap))
    }
  }, [dbComponents, alreadyLoaded, dispatch])

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /**
   * tRPC mutation for creating a component.
   */
  const createMutation = trpc.localComponents.create.useMutation()

  /**
   * tRPC mutation for updating a component.
   */
  const updateMutation = trpc.localComponents.update.useMutation()

  /**
   * tRPC mutation for deleting a component.
   */
  const deleteMutation = trpc.localComponents.delete.useMutation()

  // ============================================================================
  // CREATE COMPONENT
  // ============================================================================

  /**
   * Create a new LocalComponent.
   *
   * This function:
   * 1. Generates a temporary ID for immediate Redux update (optimistic)
   * 2. Saves to database
   * 3. Updates Redux with the real database ID
   *
   * BYPASSES UNDO/REDO: Component creation is website-level.
   *
   * @param input - Component data (name, sourceTree, etc.)
   * @returns The created component with database ID
   */
  const createComponent = useCallback(
    async (input: CreateComponentInput): Promise<LocalComponent | null> => {
      try {
        // Create in database first to get the real ID
        const result = await createMutation.mutateAsync({
          organizationId,
          websiteId,
          name: input.name,
          description: input.description,
          sourceTree: input.sourceTree as unknown,
          exposedProps: input.exposedProps as unknown,
          tags: input.tags,
          // Pass the primaryInstanceId (the "master" instance ID)
          primaryInstanceId: input.primaryInstanceId,
        })

        if (!result.success || !result.component) {
          throw new Error('Failed to create component in database')
        }

        // Transform to LocalComponent type
        const component: LocalComponent = {
          id: result.component.id,
          name: result.component.name,
          description: result.component.description ?? undefined,
          websiteId: result.component.websiteId,
          sourceTree: result.component.sourceTree as unknown as LocalComponentSourceTree,
          exposedProps: (result.component.exposedProps as unknown as ExposedProp[]) ?? [],
          tags: result.component.tags ?? [],
          instanceIds: [],
          // primaryInstanceId is the "master" instance that was created during conversion
          primaryInstanceId: result.component.primaryInstanceId ?? '',
          // skeletonStyles will be undefined for newly created components
          skeletonStyles: (result.component.skeletonStyles as unknown as LocalComponent['skeletonStyles']) ?? undefined,
          // loadingSkeletonComponentId - ID of component to use as loading skeleton
          loadingSkeletonComponentId: result.component.loadingSkeletonComponentId ?? undefined,
          createdAt: new Date(result.component.createdAt).getTime(),
          updatedAt: new Date(result.component.updatedAt).getTime(),
        }

        // Add to Redux (bypasses undo/redo)
        dispatch(addLocalComponent(component))

        return component
      } catch (error) {
        return null
      }
    },
    [organizationId, websiteId, createMutation, dispatch]
  )

  // ============================================================================
  // UPDATE COMPONENT
  // ============================================================================

  /**
   * Update an existing LocalComponent.
   *
   * This function:
   * 1. Updates Redux immediately (optimistic)
   * 2. Saves to database in background
   * 3. Reverts Redux on database error
   *
   * BYPASSES UNDO/REDO: Component updates are website-level.
   *
   * @param id - Component ID
   * @param input - Fields to update
   * @returns The updated component
   */
  const updateComponent = useCallback(
    async (id: string, input: UpdateComponentInput): Promise<LocalComponent | null> => {
      try {
        // Update Redux immediately (optimistic)
        dispatch(
          updateLocalComponentAction({
            id,
            updates: input as Partial<LocalComponent>,
          })
        )

        // Save to database
        const result = await updateMutation.mutateAsync({
          organizationId,
          componentId: id,
          name: input.name,
          description: input.description,
          sourceTree: input.sourceTree as unknown,
          exposedProps: input.exposedProps as unknown,
          tags: input.tags,
          loadingSkeletonComponentId: input.loadingSkeletonComponentId,
        })

        if (!result.success || !result.component) {
          throw new Error('Failed to update component in database')
        }

        // Return the updated component from Redux
        return components[id] ?? null
      } catch (error) {
        // TODO: Revert Redux on error
        return null
      }
    },
    [organizationId, updateMutation, dispatch, components]
  )

  // ============================================================================
  // DELETE COMPONENT
  // ============================================================================

  /**
   * Delete a LocalComponent.
   *
   * This function:
   * 1. Deletes from database first
   * 2. Removes from Redux on success
   *
   * BYPASSES UNDO/REDO: Component deletion is website-level.
   *
   * WARNING: This does NOT clean up instances on canvases.
   * Instances referencing the deleted component will show an error state.
   *
   * @param id - Component ID to delete
   * @returns True if deletion was successful
   */
  const deleteComponent = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        // Delete from database first
        const result = await deleteMutation.mutateAsync({
          organizationId,
          componentId: id,
        })

        if (!result.success) {
          throw new Error('Failed to delete component from database')
        }

        // Remove from Redux (bypasses undo/redo)
        dispatch(deleteLocalComponentAction(id))

        return true
      } catch (error) {
        return false
      }
    },
    [organizationId, deleteMutation, dispatch]
  )

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    /** All LocalComponents for this website (from Redux) */
    components,

    /** Whether components are being loaded from database */
    isLoading,

    /** Error from loading components */
    error,

    /** Whether a mutation is in progress */
    isMutating: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,

    /** Create a new component (saves to DB + Redux) */
    createComponent,

    /** Update a component (saves to DB + Redux) */
    updateComponent,

    /** Delete a component (removes from DB + Redux) */
    deleteComponent,
  }
}
