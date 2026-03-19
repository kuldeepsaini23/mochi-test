/**
 * Website Builder - Redux Selectors (REFACTORED)
 *
 * WHY: Memoized selectors for efficient access to builder state
 * HOW: Selector functions that extract specific parts of state
 *
 * ARCHITECTURE (REFACTORED):
 * - All selectors work with single elements Record
 * - New hierarchy selectors for parent/child relationships
 * - Removed canvas array selectors (deprecated)
 *
 * USAGE:
 * const selectedElement = useAppSelector(selectSelectedElement)
 * const children = useAppSelector(state => selectElementChildren(state, parentId))
 */

import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../store'
import type { AnyWebsiteElement, ContainerType } from './types/builder.types'

// ========================================
// ELEMENT SELECTORS
// ========================================

/**
 * Select all elements as a Record (id -> element)
 */
export const selectAllElements = (state: RootState): Record<string, AnyWebsiteElement> => {
  return state.builder.elements
}

/**
 * Select all elements as an array
 */
export const selectElementsArray = (state: RootState): AnyWebsiteElement[] => {
  return Object.values(state.builder.elements)
}

/**
 * Select a specific element by ID
 */
export const selectElementById = (
  state: RootState,
  id: string
): AnyWebsiteElement | undefined => {
  return state.builder.elements[id]
}

/**
 * Select all root element IDs (parentId = null)
 */
export const selectRootElementIds = (state: RootState): string[] => {
  return state.builder.rootElementIds
}

/**
 * Select all root elements sorted by order
 */
export const selectRootElements = createSelector(
  [selectAllElements, selectRootElementIds],
  (elements, rootIds): AnyWebsiteElement[] => {
    return rootIds
      .map((id) => elements[id])
      .filter((el): el is AnyWebsiteElement => el !== undefined)
      .sort((a, b) => a.order - b.order)
  }
)

// ========================================
// HIERARCHY SELECTORS (NEW)
// ========================================

/**
 * Select children of an element sorted by order
 *
 * USAGE: const children = useAppSelector(state => selectElementChildren(state, parentId))
 */
export const selectElementChildren = (
  state: RootState,
  parentId: string
): AnyWebsiteElement[] => {
  return Object.values(state.builder.elements)
    .filter((el) => el.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

/**
 * Memoized selector for element children (use when component re-renders frequently)
 */
export const makeSelectElementChildren = () =>
  createSelector(
    [selectAllElements, (_state: RootState, parentId: string) => parentId],
    (elements, parentId): AnyWebsiteElement[] => {
      return Object.values(elements)
        .filter((el) => el.parentId === parentId)
        .sort((a, b) => a.order - b.order)
    }
  )

/**
 * Select parent of an element
 */
export const selectElementParent = (
  state: RootState,
  childId: string
): AnyWebsiteElement | null => {
  const child = state.builder.elements[childId]
  if (!child || !child.parentId) return null
  return state.builder.elements[child.parentId] || null
}

/**
 * Check if element is a container (can have children)
 */
export const selectIsContainer = (state: RootState, elementId: string): boolean => {
  const element = state.builder.elements[elementId]
  if (!element) return false
  return element.type === 'frame' || element.type === 'page'
}

/**
 * Select all container elements (frames and pages)
 */
export const selectAllContainers = createSelector([selectElementsArray], (elements) => {
  return elements.filter((el) => el.type === 'frame' || el.type === 'page')
})

/**
 * Get the depth of an element in the hierarchy (0 = root)
 */
export const selectElementDepth = (state: RootState, elementId: string): number => {
  let depth = 0
  let current = state.builder.elements[elementId]

  while (current && current.parentId) {
    depth++
    current = state.builder.elements[current.parentId]
    // Prevent infinite loops
    if (depth > 100) break
  }

  return depth
}

// ========================================
// SELECTION SELECTORS
// ========================================

/**
 * Select the currently selected element ID
 */
export const selectSelectedElementId = (state: RootState): string | null => {
  return state.builder.selectedElementId
}

/**
 * Select the currently selected element (full object)
 */
export const selectSelectedElement = (state: RootState): AnyWebsiteElement | null => {
  const selectedId = state.builder.selectedElementId
  if (!selectedId) return null
  return state.builder.elements[selectedId] || null
}

/**
 * Check if any element is selected
 */
export const selectHasSelection = (state: RootState): boolean => {
  return state.builder.selectedElementId !== null
}

/**
 * Check if a specific element is selected
 */
export const selectIsElementSelected = (state: RootState, elementId: string): boolean => {
  return state.builder.selectedElementId === elementId
}

// ========================================
// CANVAS SELECTORS
// ========================================

/**
 * Select canvas state (zoom, pan)
 */
export const selectCanvas = (state: RootState) => {
  return state.builder.canvas
}

/**
 * Select canvas zoom level
 */
export const selectZoom = (state: RootState): number => {
  return state.builder.canvas.zoom
}

/**
 * Select canvas pan position (memoized)
 */
export const selectPan = createSelector(
  [
    (state: RootState) => state.builder.canvas.panX,
    (state: RootState) => state.builder.canvas.panY,
  ],
  (panX, panY) => ({ panX, panY })
)

/**
 * Select canvas panning state
 */
export const selectIsPanning = (state: RootState): boolean => {
  return state.builder.canvas.isPanning
}

/**
 * Select pan start coordinates
 */
export const selectPanStart = (state: RootState): { x: number; y: number } | null => {
  return state.builder.canvas.panStart
}

// ========================================
// UI STATE SELECTORS
// ========================================

/**
 * Select whether page has been centered
 */
export const selectIsPageCentered = (state: RootState): boolean => {
  return state.builder.isPageCentered
}

// ========================================
// TOOL SELECTORS
// ========================================

/**
 * Select the currently active tool
 */
export const selectActiveTool = (state: RootState): 'pointer' | 'frame' | 'text' => {
  return state.builder.activeTool
}

// ========================================
// SPECIAL PURPOSE SELECTORS
// ========================================

/**
 * Select the main page element (first page in root)
 */
export const selectMainPage = createSelector([selectRootElements], (rootElements) => {
  return rootElements.find((el) => el.type === 'page') || null
})

/**
 * Select all frames (not pages) at root level
 */
export const selectRootFrames = createSelector([selectRootElements], (rootElements) => {
  return rootElements.filter((el) => el.type === 'frame')
})

/**
 * Build flat list of all elements with their depth (for layers panel)
 */
export const selectFlatElementList = createSelector([selectAllElements], (elements) => {
  const result: { element: AnyWebsiteElement; depth: number }[] = []

  function traverse(parentId: string | null, depth: number) {
    const children = Object.values(elements)
      .filter((el) => el.parentId === parentId)
      .sort((a, b) => a.order - b.order)

    for (const child of children) {
      result.push({ element: child, depth })
      // Only traverse children of containers
      if (child.type === 'frame' || child.type === 'page') {
        traverse(child.id, depth + 1)
      }
    }
  }

  // Start with root elements
  traverse(null, 0)

  return result
})
