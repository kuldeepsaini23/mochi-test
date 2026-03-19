/**
 * ============================================================================
 * STAGING SLICE - AI-Generated Content Staging Area
 * ============================================================================
 *
 * Redux slice that manages AI-generated elements in a staging buffer.
 * Instead of AI content landing directly on the page canvas, it first
 * goes to this staging store. Users can then preview the content and
 * drag-and-drop it onto the page canvas when ready.
 *
 * Kept deliberately separate from canvas-slice.ts (~3200 lines) to
 * isolate concerns. The staging area is ephemeral — elements exist
 * here only until the user transfers or discards them.
 *
 * ARCHITECTURE:
 * - Each AI generation creates a StagingGroup (one per ```ui-spec stream)
 * - Groups contain a flat element map + rootIds + childrenMap (same pattern as canvas)
 * - Elements are transferred to the page canvas via the canvas handleDrop or
 *   the "Add All to Page" action
 * - Once transferred, the group is removed from staging
 *
 * SOURCE OF TRUTH KEYWORDS: StagingSlice, AIStagingStore, StagingGroup,
 * AIContentStaging, StagingReducer
 * ============================================================================
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { CanvasElement } from './types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Status of a staging group's generation stream.
 * - `streaming`: AI is still generating content (more elements may arrive)
 * - `ready`: Generation complete, all elements are available for transfer
 *
 * SOURCE OF TRUTH KEYWORDS: StagingGroupStatus
 */
export type StagingGroupStatus = 'streaming' | 'ready'

/**
 * A batch of AI-generated elements from a single ui-spec generation.
 * Each group acts like a mini-canvas with its own element hierarchy.
 *
 * SOURCE OF TRUTH KEYWORDS: StagingGroup, AIStagingGroup, AIGenerationBatch
 */
export interface StagingGroup {
  /** Unique ID for this generation batch (one per ```ui-spec stream) */
  id: string
  /** Timestamp when the generation started */
  createdAt: number
  /** Human-readable label for the generated content (e.g., "Hero Section") */
  label: string
  /** Current generation status — streaming or ready for transfer */
  status: StagingGroupStatus
  /** All elements in this generation, keyed by element ID */
  elements: Record<string, CanvasElement>
  /** Root element IDs within this group (the AI container + top-level items) */
  rootIds: string[]
  /** Parent→children map for hierarchy within this group */
  childrenMap: Record<string, string[]>
}

/**
 * State shape for the staging slice.
 *
 * SOURCE OF TRUTH KEYWORDS: StagingSliceState
 */
export interface StagingSliceState {
  /** Staged generation groups, ordered newest first */
  groups: StagingGroup[]
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Rebuild the childrenMap from a flat elements record.
 * Same algorithm as canvas-slice's rebuildChildrenMap — groups elements
 * by parentId and sorts each group by order.
 */
function rebuildStagingChildrenMap(
  elements: Record<string, CanvasElement>
): Record<string, string[]> {
  const childrenMap: Record<string, string[]> = {}

  for (const element of Object.values(elements)) {
    /** Use '__root__' sentinel for root-level elements (parentId === null) */
    const parentKey = element.parentId ?? '__root__'
    if (!childrenMap[parentKey]) {
      childrenMap[parentKey] = []
    }
    childrenMap[parentKey].push(element.id)
  }

  /** Sort each group by order for consistent rendering */
  for (const key of Object.keys(childrenMap)) {
    childrenMap[key].sort((a, b) => {
      const orderA = elements[a]?.order ?? 0
      const orderB = elements[b]?.order ?? 0
      return orderA - orderB
    })
  }

  return childrenMap
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: StagingSliceState = {
  groups: [],
}

// ============================================================================
// SLICE
// ============================================================================

const stagingSlice = createSlice({
  name: 'staging',
  initialState,
  reducers: {
    /**
     * Create a new staging group for an incoming AI generation.
     * Called when the first element of a new ui-spec stream arrives
     * (and directInsert is false).
     */
    createStagingGroup: (
      state,
      action: PayloadAction<{ id: string; label: string }>
    ) => {
      const { id, label } = action.payload
      /** Prevent duplicate groups with the same ID */
      if (state.groups.some((g) => g.id === id)) return

      state.groups.unshift({
        id,
        createdAt: Date.now(),
        label,
        status: 'streaming',
        elements: {},
        rootIds: [],
        childrenMap: {},
      })
    },

    /**
     * Add a single element to an existing staging group (incremental).
     * Called for each element as it streams in from the AI.
     * Updates the group's element map, rootIds, and childrenMap.
     */
    addStagedElement: (
      state,
      action: PayloadAction<{ groupId: string; element: CanvasElement }>
    ) => {
      const { groupId, element } = action.payload
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return

      /** Skip duplicate element IDs within the group */
      if (group.elements[element.id]) return

      group.elements[element.id] = element

      /** Track root-level elements (parentId is null or not in group's elements) */
      if (element.parentId === null || !group.elements[element.parentId]) {
        if (!group.rootIds.includes(element.id)) {
          group.rootIds.push(element.id)
        }
      }

      /** Rebuild childrenMap to maintain accurate hierarchy */
      group.childrenMap = rebuildStagingChildrenMap(group.elements)
    },

    /**
     * Mark a staging group as complete — all elements have arrived.
     * Called when canvasBridge.signalGenerationComplete() fires.
     */
    completeStagingGroup: (state, action: PayloadAction<string>) => {
      const group = state.groups.find((g) => g.id === action.payload)
      if (group) {
        group.status = 'ready'
      }
    },

    /**
     * Remove a staging group entirely.
     * Called after all elements are transferred to the page canvas,
     * or when the user discards the group.
     */
    removeStagingGroup: (state, action: PayloadAction<string>) => {
      state.groups = state.groups.filter((g) => g.id !== action.payload)
    },

    /**
     * Remove a single element from a staging group.
     * Used when individual elements are dragged to the canvas
     * (as opposed to transferring the whole group at once).
     */
    removeStagedElement: (
      state,
      action: PayloadAction<{ groupId: string; elementId: string }>
    ) => {
      const { groupId, elementId } = action.payload
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return

      delete group.elements[elementId]
      group.rootIds = group.rootIds.filter((id) => id !== elementId)
      group.childrenMap = rebuildStagingChildrenMap(group.elements)

      /** Auto-clean empty groups */
      if (Object.keys(group.elements).length === 0) {
        state.groups = state.groups.filter((g) => g.id !== groupId)
      }
    },

    /**
     * Clear all staged groups. Nuclear option for cleanup.
     */
    clearAllStaged: (state) => {
      state.groups = []
    },
  },
})

// ============================================================================
// EXPORTS - Actions
// ============================================================================

export const {
  createStagingGroup,
  addStagedElement,
  completeStagingGroup,
  removeStagingGroup,
  removeStagedElement,
  clearAllStaged,
} = stagingSlice.actions

// ============================================================================
// SELECTORS
// ============================================================================

/** Select all staging groups */
export const selectStagingGroups = (state: { staging: StagingSliceState }) =>
  state.staging.groups

/** Select a specific staging group by ID */
export const selectStagingGroupById = (
  state: { staging: StagingSliceState },
  groupId: string
) => state.staging.groups.find((g) => g.id === groupId)

/** Select total count of staged groups (for badge display) */
export const selectStagingGroupCount = (state: { staging: StagingSliceState }) =>
  state.staging.groups.length

/** Check if there are any staged groups */
export const selectHasStagedContent = (state: { staging: StagingSliceState }) =>
  state.staging.groups.length > 0

// ============================================================================
// REDUCER EXPORT
// ============================================================================

export default stagingSlice.reducer
