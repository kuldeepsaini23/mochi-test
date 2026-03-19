/**
 * Website Builder Redux Slice (REFACTORED - Single Source of Truth)
 *
 * WHY: Manages website builder state with simplified architecture
 * HOW: Redux Toolkit slice with ONLY normalized elements Record
 *
 * ARCHITECTURE (REFACTORED):
 * - Single source of truth: elements Record
 * - No more canvasFrames/canvasElements arrays
 * - Hierarchy via parentId field
 * - Order via order field (for sorting within parent)
 *
 * KEY CHANGES FROM OLD ARCHITECTURE:
 * - Removed: canvasFrames, canvasElements, frameTree, TreeItem
 * - Added: moveElement action for hierarchy changes
 * - Simplified: All element operations work directly on elements Record
 */

import { createSlice, PayloadAction, nanoid } from '@reduxjs/toolkit'
import type {
  BuilderState,
  AnyWebsiteElement,
  PageElement,
  FrameElement,
} from './types/builder.types'
import type { CSSProperties } from 'react'

// ========================================
// INITIAL STATE
// ========================================

/**
 * Default canvas size (10000x10000 infinite canvas)
 */
const CANVAS_SIZE = 10000

/**
 * Initial page dimensions
 */
const DEFAULT_PAGE_WIDTH = 1200
const DEFAULT_PAGE_HEIGHT = 1080

/**
 * Calculate centered position for Page element on canvas
 */
const PAGE_CENTER_X = CANVAS_SIZE / 2 - DEFAULT_PAGE_WIDTH / 2
const PAGE_CENTER_Y = CANVAS_SIZE / 2 - DEFAULT_PAGE_HEIGHT / 2

/**
 * Initial page element - the starting point for the builder
 *
 * NOTE: Pages are special frames with auto-layout properties
 */
const initialPage: PageElement = {
  id: 'page-1',
  type: 'page',
  x: PAGE_CENTER_X,
  y: PAGE_CENTER_Y,
  width: DEFAULT_PAGE_WIDTH,
  height: DEFAULT_PAGE_HEIGHT,
  parentId: null,
  order: 0,
  visible: true,
  locked: false,
  styles: {
    backgroundColor: '#ffffff',
    borderRadius: '0px',
  },
  properties: {
    name: 'Page 1',
    slug: '/',
    flexDirection: 'column',
    gap: 16,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    padding: 24,
  },
}

/**
 * Initial zoom and pan values
 */
const INITIAL_ZOOM = 0.55
const INITIAL_PAN_X = 0
const INITIAL_PAN_Y = 0

/**
 * Initial builder state
 *
 * SIMPLIFIED: Only elements Record, no more canvas arrays
 */
const initialState: BuilderState = {
  // Single source of truth
  elements: {
    'page-1': initialPage,
  },
  rootElementIds: ['page-1'],

  // Selection
  selectedElementId: null,

  // Canvas state
  canvas: {
    zoom: INITIAL_ZOOM,
    panX: INITIAL_PAN_X,
    panY: INITIAL_PAN_Y,
    isPanning: false,
    panStart: null,
  },

  // UI state
  isPageCentered: false,

  // Tool state
  activeTool: 'pointer',
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get children of an element sorted by order
 */
function getChildren(
  elements: Record<string, AnyWebsiteElement>,
  parentId: string
): AnyWebsiteElement[] {
  return Object.values(elements)
    .filter((el) => el.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

/**
 * Get the next order value for a new child
 */
function getNextOrder(
  elements: Record<string, AnyWebsiteElement>,
  parentId: string | null
): number {
  const siblings = Object.values(elements).filter((el) => el.parentId === parentId)
  if (siblings.length === 0) return 0
  return Math.max(...siblings.map((el) => el.order)) + 1
}

/**
 * Reorder siblings after removing or moving an element
 */
function reorderSiblings(
  elements: Record<string, AnyWebsiteElement>,
  parentId: string | null
): void {
  const siblings = Object.values(elements)
    .filter((el) => el.parentId === parentId)
    .sort((a, b) => a.order - b.order)

  siblings.forEach((sibling, index) => {
    elements[sibling.id].order = index
  })
}

// ========================================
// BUILDER SLICE
// ========================================

const builderSlice = createSlice({
  name: 'builder',
  initialState,
  reducers: {
    // ========================================
    // ELEMENT CRUD OPERATIONS
    // ========================================

    /**
     * Add a new element
     *
     * - Automatically assigns order based on siblings
     * - Updates rootElementIds if element is root-level
     */
    addElement: (state, action: PayloadAction<{ element: AnyWebsiteElement }>) => {
      const { element } = action.payload

      // Assign order if not provided
      if (element.order === undefined || element.order === -1) {
        element.order = getNextOrder(state.elements, element.parentId)
      }

      // Add to elements Record
      state.elements[element.id] = element

      // Update rootElementIds if root element
      if (!element.parentId && !state.rootElementIds.includes(element.id)) {
        state.rootElementIds.push(element.id)
      }
    },

    /**
     * Remove an element and handle its children
     *
     * - Removes element from elements Record
     * - Orphans children (moves them to root)
     * - Updates rootElementIds
     * - Clears selection if removed element was selected
     */
    removeElement: (state, action: PayloadAction<{ id: string }>) => {
      const { id } = action.payload
      const element = state.elements[id]
      if (!element) return

      const oldParentId = element.parentId

      // Orphan children (move to root)
      Object.values(state.elements).forEach((child) => {
        if (child.parentId === id) {
          child.parentId = null
          child.order = getNextOrder(state.elements, null)
          if (!state.rootElementIds.includes(child.id)) {
            state.rootElementIds.push(child.id)
          }
        }
      })

      // Remove from elements
      delete state.elements[id]

      // Remove from rootElementIds
      state.rootElementIds = state.rootElementIds.filter((rootId) => rootId !== id)

      // Reorder siblings
      reorderSiblings(state.elements, oldParentId)

      // Clear selection if removed
      if (state.selectedElementId === id) {
        state.selectedElementId = null
      }
    },

    /**
     * Duplicate an element (without children for simplicity)
     */
    duplicateElement: (state, action: PayloadAction<{ id: string }>) => {
      const { id } = action.payload
      const element = state.elements[id]
      if (!element) return

      const newId = nanoid()
      const newElement = {
        ...element,
        id: newId,
        x: element.x + 20,
        y: element.y + 20,
        order: getNextOrder(state.elements, element.parentId),
      }

      state.elements[newId] = newElement

      if (!element.parentId) {
        state.rootElementIds.push(newId)
      }
    },

    // ========================================
    // ELEMENT UPDATES
    // ========================================

    /**
     * Update element styles (CSS properties)
     */
    updateElementStyles: (
      state,
      action: PayloadAction<{ id: string; styles: Partial<CSSProperties> }>
    ) => {
      const { id, styles } = action.payload
      const element = state.elements[id]
      if (!element) return

      element.styles = { ...element.styles, ...styles }
    },

    /**
     * Update element properties (type-specific props)
     */
    updateElementProperties: (
      state,
      action: PayloadAction<{
        id: string
        properties: Partial<AnyWebsiteElement['properties']>
      }>
    ) => {
      const { id, properties } = action.payload
      const element = state.elements[id]
      if (!element) return

      element.properties = {
        ...element.properties,
        ...properties,
      } as typeof element.properties
    },

    /**
     * Update element position and/or size
     *
     * NOTE: Position (x, y) only matters for root elements
     * Nested elements are positioned by parent's flex layout
     */
    updateElementPosition: (
      state,
      action: PayloadAction<{
        id: string
        x?: number
        y?: number
        width?: number
        height?: number
      }>
    ) => {
      const { id, x, y, width, height } = action.payload
      const element = state.elements[id]
      if (!element) return

      if (x !== undefined) element.x = x
      if (y !== undefined) element.y = y
      if (width !== undefined) element.width = width
      if (height !== undefined) element.height = height
    },

    // ========================================
    // HIERARCHY & SORTING (NEW - Simplified)
    // ========================================

    /**
     * Move element to new parent and/or position
     *
     * This is the MAIN action for drag-drop operations:
     * - Moving element between frames
     * - Reordering within same frame
     * - Moving to/from canvas root
     *
     * ARCHITECTURE:
     * - Updates parentId
     * - Updates order within new parent
     * - Handles rootElementIds updates
     * - Reorders siblings in old/new parents
     */
    moveElement: (
      state,
      action: PayloadAction<{
        elementId: string
        newParentId: string | null
        newOrder: number
        // Only used when moving to canvas (root level)
        newX?: number
        newY?: number
      }>
    ) => {
      const { elementId, newParentId, newOrder, newX, newY } = action.payload
      const element = state.elements[elementId]
      if (!element) return

      const oldParentId = element.parentId
      const sameParent = oldParentId === newParentId

      // If moving within same parent, just update order
      if (sameParent) {
        // Get siblings and reorder
        const siblings = Object.values(state.elements)
          .filter((el) => el.parentId === newParentId && el.id !== elementId)
          .sort((a, b) => a.order - b.order)

        // Insert at new position
        siblings.splice(newOrder, 0, element)

        // Update all orders
        siblings.forEach((sibling, index) => {
          state.elements[sibling.id].order = index
        })
      } else {
        // Moving to different parent

        // Update rootElementIds
        if (oldParentId === null) {
          // Was root, no longer root
          state.rootElementIds = state.rootElementIds.filter((id) => id !== elementId)
        }
        if (newParentId === null) {
          // Becoming root
          if (!state.rootElementIds.includes(elementId)) {
            state.rootElementIds.push(elementId)
          }
          // Update canvas position when moving to root
          if (newX !== undefined) element.x = newX
          if (newY !== undefined) element.y = newY
        }

        // Update element's parent
        element.parentId = newParentId

        // Get new siblings and insert at position
        const newSiblings = Object.values(state.elements)
          .filter((el) => el.parentId === newParentId && el.id !== elementId)
          .sort((a, b) => a.order - b.order)

        newSiblings.splice(newOrder, 0, element)

        // Update all orders in new parent
        newSiblings.forEach((sibling, index) => {
          state.elements[sibling.id].order = index
        })

        // Reorder old parent's children
        reorderSiblings(state.elements, oldParentId)
      }
    },

    /**
     * Reorder element within its current parent
     *
     * Simpler version of moveElement for same-parent reordering
     */
    reorderElement: (
      state,
      action: PayloadAction<{
        elementId: string
        newOrder: number
      }>
    ) => {
      const { elementId, newOrder } = action.payload
      const element = state.elements[elementId]
      if (!element) return

      // Get siblings
      const siblings = Object.values(state.elements)
        .filter((el) => el.parentId === element.parentId)
        .sort((a, b) => a.order - b.order)

      // Remove element from current position
      const currentIndex = siblings.findIndex((s) => s.id === elementId)
      if (currentIndex === -1) return
      siblings.splice(currentIndex, 1)

      // Insert at new position
      const insertIndex = Math.min(newOrder, siblings.length)
      siblings.splice(insertIndex, 0, element)

      // Update all orders
      siblings.forEach((sibling, index) => {
        state.elements[sibling.id].order = index
      })
    },

    // ========================================
    // SELECTION
    // ========================================

    /**
     * Select an element
     */
    selectElement: (state, action: PayloadAction<{ id: string | null }>) => {
      state.selectedElementId = action.payload.id
    },

    /**
     * Clear selection
     */
    clearSelection: (state) => {
      state.selectedElementId = null
    },

    // ========================================
    // CANVAS OPERATIONS
    // ========================================

    /**
     * Set canvas zoom level (clamped between 0.1 and 2.0)
     */
    setZoom: (state, action: PayloadAction<{ zoom: number }>) => {
      state.canvas.zoom = Math.max(0.1, Math.min(2.0, action.payload.zoom))
    },

    /**
     * Set canvas pan position
     */
    setPan: (state, action: PayloadAction<{ panX: number; panY: number }>) => {
      state.canvas.panX = action.payload.panX
      state.canvas.panY = action.payload.panY
    },

    /**
     * Reset canvas to default zoom and pan
     */
    resetCanvas: (state) => {
      state.canvas.zoom = 0.55
      state.canvas.panX = 0
      state.canvas.panY = 0
    },

    /**
     * Set panning state
     */
    setPanning: (state, action: PayloadAction<{ isPanning: boolean }>) => {
      state.canvas.isPanning = action.payload.isPanning
    },

    /**
     * Set pan start coordinates
     */
    setPanStart: (state, action: PayloadAction<{ x: number; y: number } | null>) => {
      state.canvas.panStart = action.payload
    },

    // ========================================
    // UI STATE
    // ========================================

    /**
     * Set page centered flag (for initial viewport centering)
     */
    setPageCentered: (state, action: PayloadAction<{ centered: boolean }>) => {
      state.isPageCentered = action.payload.centered
    },

    // ========================================
    // TOOL STATE
    // ========================================

    /**
     * Set active tool (pointer, frame, or text)
     */
    setActiveTool: (
      state,
      action: PayloadAction<{ tool: 'pointer' | 'frame' | 'text' }>
    ) => {
      state.activeTool = action.payload.tool
    },

    // ========================================
    // BULK OPERATIONS
    // ========================================

    /**
     * Load entire builder state (for loading saved projects)
     */
    loadBuilderState: (_state, action: PayloadAction<BuilderState>) => {
      return action.payload
    },

    /**
     * Reset builder to initial state
     */
    resetBuilder: () => {
      return initialState
    },
  },
})

// Export actions
export const {
  // Element operations
  addElement,
  removeElement,
  duplicateElement,
  updateElementStyles,
  updateElementProperties,
  updateElementPosition,
  // Hierarchy (NEW)
  moveElement,
  reorderElement,
  // Selection
  selectElement,
  clearSelection,
  // Canvas operations
  setZoom,
  setPan,
  resetCanvas,
  setPanning,
  setPanStart,
  // UI state
  setPageCentered,
  // Tool state
  setActiveTool,
  // Bulk operations
  loadBuilderState,
  resetBuilder,
} = builderSlice.actions

// Export reducer
export default builderSlice.reducer
