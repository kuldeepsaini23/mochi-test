/**
 * ============================================================================
 * ACTION REGISTRY - Modular Group Actions System
 * ============================================================================
 *
 * This file contains the action registry and all built-in action handlers
 * for group operations (delete, copy, cut, paste, duplicate, move, etc.).
 *
 * ============================================================================
 * ARCHITECTURE - HOW TO EXTEND
 * ============================================================================
 *
 * The action system is designed to be MODULAR and EXTENSIBLE:
 *
 * 1. ADDING A NEW ACTION:
 *    a) Add the action type to GroupActionType in types.ts
 *    b) Create a handler function following GroupActionHandler signature
 *    c) Create a definition following GroupActionDefinition interface
 *    d) Register the action using registerAction() or add to BUILTIN_ACTIONS
 *    e) Add keyboard shortcut handling in useGroupActions hook
 *
 * 2. ACTION HANDLER PATTERN:
 *    - Handlers are PURE FUNCTIONS that receive context and return results
 *    - They do NOT directly modify Redux state
 *    - They return a GroupActionResult describing what changes to make
 *    - The useGroupActions hook applies the changes to Redux
 *
 * 3. WHY THIS PATTERN?
 *    - Testable: Handlers can be unit tested without Redux
 *    - Composable: Actions can call other actions
 *    - Reversible: Results can be used to generate undo operations
 *    - Extensible: Third parties can register custom actions
 *
 * ============================================================================
 * BUILT-IN ACTIONS
 * ============================================================================
 *
 * DELETE     - Remove selected elements and their children
 * COPY       - Copy selected elements to clipboard
 * CUT        - Copy to clipboard and delete
 * PASTE      - Paste clipboard at mouse position or center
 * DUPLICATE  - Copy and paste in place (with offset)
 * MOVE       - Move selected elements by delta (future)
 * Z-ORDER    - Change element stacking order (future)
 *
 * ============================================================================
 */

import type {
  GroupActionType,
  GroupActionDefinition,
  GroupActionHandler,
  GroupActionContext,
  GroupActionResult,
  ClipboardElement,
  ClipboardState,
  CanvasElement,
  Bounds,
  Point,
  ComponentInstanceElement,
} from './types'
import { generateElementId } from './canvas-slice'

// ============================================================================
// PROTECTED ELEMENT HELPERS
// ============================================================================

/**
 * Collect all inset frame IDs from prebuilt-sidebar elements.
 * Inset frames are protected — they cannot be deleted, cut, or moved
 * independently because they are structurally bound to their sidebar parent.
 */
function collectInsetFrameIds(elements: Record<string, CanvasElement>): Set<string> {
  const insetIds = new Set<string>()
  for (const el of Object.values(elements)) {
    if (
      el.type === 'prebuilt' &&
      'prebuiltType' in el &&
      (el as { prebuiltType: string }).prebuiltType === 'prebuilt-sidebar' &&
      'insetFrameId' in el
    ) {
      insetIds.add((el as { insetFrameId: string }).insetFrameId)
    }
  }
  return insetIds
}

/**
 * Check if a specific element is a sidebar inset frame.
 */
export function isSidebarInsetFrame(
  elementId: string,
  elements: Record<string, CanvasElement>
): boolean {
  return collectInsetFrameIds(elements).has(elementId)
}

// ============================================================================
// ACTION REGISTRY - Storage for all registered actions
// ============================================================================

/**
 * Registry map storing all registered actions by type.
 * Initialized with built-in actions, can be extended at runtime.
 */
const actionRegistry = new Map<GroupActionType, GroupActionDefinition>()

/**
 * Register a new action in the registry.
 *
 * USAGE (for custom actions):
 * ```ts
 * registerAction({
 *   type: 'my-custom-action',
 *   label: 'My Action',
 *   shortcuts: ['Ctrl+Shift+M'],
 *   description: 'Does something custom',
 *   requiresSelection: true,
 *   handler: myCustomHandler,
 * })
 * ```
 */
export function registerAction(definition: GroupActionDefinition): void {
  actionRegistry.set(definition.type, definition)
}

/**
 * Get an action definition by type.
 * Returns undefined if action is not registered.
 */
export function getAction(type: GroupActionType): GroupActionDefinition | undefined {
  return actionRegistry.get(type)
}

/**
 * Get all registered actions.
 * Useful for building UI menus or help systems.
 */
export function getAllActions(): GroupActionDefinition[] {
  return Array.from(actionRegistry.values())
}

/**
 * Execute an action by type with given context.
 * Returns null if action is not found or requirements not met.
 */
export function executeAction(
  type: GroupActionType,
  context: GroupActionContext
): GroupActionResult | null {
  const definition = actionRegistry.get(type)
  if (!definition) {
    console.warn(`Action "${type}" not found in registry`)
    return null
  }

  // Check requirements
  if (definition.requiresSelection && context.selectedIds.length === 0) {
    return null
  }

  if (definition.requiresClipboard && context.clipboard.items.length === 0) {
    return null
  }

  // Execute handler
  return definition.handler(context)
}

// ============================================================================
// HELPER FUNCTIONS - Shared utilities for action handlers
// ============================================================================

/**
 * Calculate bounding box of multiple elements.
 *
 * Used to determine the "anchor" point for copy/paste operations.
 * Returns the smallest rectangle that contains all elements.
 */
function calculateBounds(elements: CanvasElement[]): Bounds {
  if (elements.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  elements.forEach((el) => {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  })

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Deep clone an element and all its children for clipboard.
 *
 * Creates ClipboardElement with:
 * - Full element data (deep copy)
 * - Recursively cloned children
 * - Relative offset from group origin
 *
 * IMPORTANT: Master component frames (frames with `masterOfComponentId`) are
 * converted to component instances when copied. This prevents copying a master
 * frame from creating another master - instead, it creates a regular instance
 * that references the same component.
 *
 * @param elementId - ID of element to clone
 * @param context - Action context with elements and childrenMap
 * @param groupOrigin - Top-left corner of selection bounds
 */
function cloneElementTree(
  elementId: string,
  context: GroupActionContext,
  groupOrigin: Point
): ClipboardElement | null {
  const element = context.elements[elementId]
  if (!element) return null

  // Deep copy the element (spread doesn't do deep copy, but our elements are flat)
  let elementCopy = { ...element }

  // ============================================================================
  // MASTER COMPONENT CONVERSION - Convert master frames to component instances
  // ============================================================================
  // When copying a master component frame (a frame with `masterOfComponentId`),
  // we convert it to a component instance instead. This ensures:
  // 1. Only ONE master frame exists for each component (the original)
  // 2. Pasting a copied master creates a regular instance, not another master
  // 3. The pasted instance properly references the component definition
  // ============================================================================
  if (element.type === 'frame' && 'masterOfComponentId' in element && element.masterOfComponentId) {
    const componentId = element.masterOfComponentId as string
    const component = context.localComponents[componentId]

    if (component) {
      // Convert to a component instance element
      // Copy all base properties from the original frame element
      const instanceElement: ComponentInstanceElement = {
        id: element.id, // Will get new ID when pasted
        type: 'component',
        name: component.name,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        parentId: element.parentId,
        order: element.order,
        visible: element.visible,
        locked: element.locked,
        // Required BaseElement properties
        container: element.container,
        styles: { ...element.styles },
        // ComponentInstanceElement specific properties
        componentId: componentId,
        propValues: {}, // Empty prop values - instances start with defaults
      }
      elementCopy = instanceElement

      // Master frames have their children in the canvas, but component instances
      // don't - they render children from the component's sourceTree.
      // So we return the instance with NO children (they come from sourceTree).
      const relativeOffset: Point = {
        x: element.x - groupOrigin.x,
        y: element.y - groupOrigin.y,
      }

      return {
        element: elementCopy,
        children: [], // Component instances render children from sourceTree
        relativeOffset,
      }
    }
  }

  // Calculate relative offset from group origin
  const relativeOffset: Point = {
    x: element.x - groupOrigin.x,
    y: element.y - groupOrigin.y,
  }

  // Recursively clone children
  const childIds = context.childrenMap[elementId] || []
  const children: ClipboardElement[] = childIds
    .map((childId) => cloneElementTree(childId, context, groupOrigin))
    .filter((c): c is ClipboardElement => c !== null)

  return {
    element: elementCopy,
    children,
    relativeOffset,
  }
}

/**
 * Recursively collect all descendant IDs of an element.
 * Used for delete operations to ensure children are also deleted.
 */
function collectDescendantIds(
  elementId: string,
  childrenMap: Record<string, string[]>
): string[] {
  const ids: string[] = [elementId]
  const childIds = childrenMap[elementId] || []
  childIds.forEach((childId) => {
    ids.push(...collectDescendantIds(childId, childrenMap))
  })
  return ids
}

/**
 * Recreate elements from clipboard data with new IDs.
 *
 * Creates new elements at specified position, maintaining:
 * - Relative positions between elements
 * - Parent-child relationships (with new IDs)
 * - All other properties
 *
 * @param clipboardItems - Items from clipboard
 * @param pasteOrigin - Where to place the top-left of the group
 * @param parentId - Parent for root-level pasted elements (null = canvas root)
 */
function recreateFromClipboard(
  clipboardItems: ClipboardElement[],
  pasteOrigin: Point,
  parentId: string | null = null
): {
  elements: CanvasElement[]
  newIds: string[]
  idMapping: Record<string, string>
} {
  const elements: CanvasElement[] = []
  const newIds: string[] = []
  const idMapping: Record<string, string> = {}

  // Process each clipboard item
  clipboardItems.forEach((item, index) => {
    // Generate new ID for this element
    const newId = generateElementId()
    idMapping[item.element.id] = newId
    newIds.push(newId)

    // Create new element at paste position
    const newElement: CanvasElement = {
      ...item.element,
      id: newId,
      parentId, // Set to specified parent (null for root)
      x: pasteOrigin.x + item.relativeOffset.x,
      y: pasteOrigin.y + item.relativeOffset.y,
      order: index, // Reset order for pasted elements
    }

    elements.push(newElement)

    // Recursively process children
    if (item.children.length > 0) {
      // Children are positioned relative to their parent, so origin is (0, 0)
      const childResult = recreateFromClipboard(
        item.children,
        { x: 0, y: 0 }, // Children keep their relative positions
        newId // New parent ID
      )
      elements.push(...childResult.elements)
      // Children's new IDs are already in the mapping from recursion
      Object.assign(idMapping, childResult.idMapping)
    }
  })

  return { elements, newIds, idMapping }
}

// ============================================================================
// ACTION HANDLERS - Pure functions that compute state changes
// ============================================================================

/**
 * DELETE ACTION - Remove selected elements and all their descendants.
 *
 * Recursively deletes:
 * - All selected elements (EXCEPT page elements - pages cannot be deleted)
 * - All children of selected elements (to prevent orphans)
 *
 * IMPORTANT: Page elements are protected from deletion. Attempting to delete
 * a page will be silently ignored, and its children will NOT be deleted.
 *
 * Clears selection after delete.
 */
const deleteHandler: GroupActionHandler = (context) => {
  const { selectedIds, childrenMap, elements } = context

  if (selectedIds.length === 0) {
    return {}
  }

  // Collect protected inset frame IDs from sidebar prebuilts
  const insetFrameIds = collectInsetFrameIds(elements)

  // Filter out page elements AND sidebar inset frames — both are protected from deletion
  const deletableIds = selectedIds.filter((id) => {
    const element = elements[id]
    if (!element) return false
    if (element.type === 'page') return false
    if (insetFrameIds.has(id)) return false
    return true
  })

  // If all selected elements were pages, nothing to delete
  if (deletableIds.length === 0) {
    return {}
  }

  // Collect all IDs to delete (including descendants of deletable elements only)
  const allIdsToDelete = new Set<string>()
  deletableIds.forEach((id) => {
    collectDescendantIds(id, childrenMap).forEach((descendantId) => {
      allIdsToDelete.add(descendantId)
    })
  })

  return {
    elementsToDelete: Array.from(allIdsToDelete),
    newSelection: [],
    historyDescription: `Delete ${deletableIds.length} element(s)`,
  }
}

/**
 * COPY ACTION - Copy selected elements to clipboard.
 *
 * Creates deep copies including:
 * - All selected root elements
 * - All children of selected elements
 * - Relative positions for paste operations
 */
const copyHandler: GroupActionHandler = (context) => {
  const { selectedIds, elements } = context

  if (selectedIds.length === 0) {
    return {}
  }

  // Get selected elements (only root-level, not nested)
  const selectedElements = selectedIds
    .map((id) => elements[id])
    .filter((el): el is CanvasElement => el !== undefined)

  // ========================================================================
  // SAFEGUARD: Filter out Page elements from copy operations
  // Pages should never be copied - they are unique per page.
  // We silently exclude them rather than blocking the entire operation
  // so users can still copy frames alongside a page.
  // ========================================================================
  const nonPageElements = selectedElements.filter((el) => el.type !== 'page')
  const nonPageIds = nonPageElements.map((el) => el.id)

  if (nonPageElements.length === 0) {
    // If only page elements were selected, nothing to copy
    console.warn(
      '[ACTION REGISTRY] Copy blocked: Page elements cannot be copied.'
    )
    return {}
  }

  // Calculate group bounds (excluding page)
  const bounds = calculateBounds(nonPageElements)
  const groupOrigin: Point = { x: bounds.x, y: bounds.y }

  // Clone each selected element tree (excluding page)
  const clipboardItems: ClipboardElement[] = nonPageIds
    .map((id) => cloneElementTree(id, context, groupOrigin))
    .filter((item): item is ClipboardElement => item !== null)

  // Create new clipboard state
  const newClipboard: ClipboardState = {
    items: clipboardItems,
    isCut: false,
    originalBounds: bounds,
  }

  return {
    newClipboard,
    // Don't change selection on copy
  }
}

/**
 * CUT ACTION - Copy to clipboard and delete originals.
 *
 * Combines copy and delete operations:
 * 1. Copy selected elements to clipboard (marked as cut)
 * 2. Delete the original elements
 *
 * On first paste, the originals are already deleted.
 * Subsequent pastes create duplicates (cut → paste can be repeated).
 */
const cutHandler: GroupActionHandler = (context) => {
  const { selectedIds, elements, childrenMap } = context

  if (selectedIds.length === 0) {
    return {}
  }

  // Get selected elements
  const selectedElements = selectedIds
    .map((id) => elements[id])
    .filter((el): el is CanvasElement => el !== undefined)

  // ========================================================================
  // CRITICAL SAFEGUARD: NEVER cut Page elements or sidebar inset frames
  // Pages are foundational and inset frames are structurally bound to their sidebar.
  // ========================================================================
  const insetFrameIds = collectInsetFrameIds(elements)
  const cuttableElements = selectedElements.filter(
    (el) => el.type !== 'page' && !insetFrameIds.has(el.id)
  )
  const nonPageIds = cuttableElements.map((el) => el.id)

  if (cuttableElements.length === 0) {
    console.warn(
      '[ACTION REGISTRY] Cut blocked: Only protected elements were selected.'
    )
    return {}
  }

  // Calculate group bounds (excluding protected elements)
  const bounds = calculateBounds(cuttableElements)
  const groupOrigin: Point = { x: bounds.x, y: bounds.y }

  // Clone each cuttable element tree
  const clipboardItems: ClipboardElement[] = nonPageIds
    .map((id) => cloneElementTree(id, context, groupOrigin))
    .filter((item): item is ClipboardElement => item !== null)

  // Collect all IDs to delete (excluding protected elements)
  const allIdsToDelete = new Set<string>()
  nonPageIds.forEach((id) => {
    collectDescendantIds(id, childrenMap).forEach((descendantId) => {
      // Double-check we're not deleting a page or inset frame
      const el = elements[descendantId]
      if (el && el.type !== 'page') {
        allIdsToDelete.add(descendantId)
      }
    })
  })

  // Create clipboard with isCut flag
  const newClipboard: ClipboardState = {
    items: clipboardItems,
    isCut: true,
    originalBounds: bounds,
  }

  return {
    elementsToDelete: Array.from(allIdsToDelete),
    newClipboard,
    newSelection: [],
    historyDescription: `Cut ${selectedIds.length} element(s)`,
  }
}

/**
 * PASTE ACTION - Paste clipboard contents at mouse position or canvas center.
 *
 * Paste behavior:
 * - If mouse position available: paste with group center at mouse
 * - If no mouse position: paste with offset from original position
 *
 * After paste:
 * - New elements are selected
 * - If was cut operation, clear the isCut flag (can paste multiple times now)
 */
const pasteHandler: GroupActionHandler = (context) => {
  const { clipboard, mousePosition } = context

  if (clipboard.items.length === 0) {
    return {}
  }

  // Calculate paste position
  let pasteOrigin: Point

  if (mousePosition) {
    // Paste centered at mouse position
    const originalBounds = clipboard.originalBounds || { x: 0, y: 0, width: 0, height: 0 }
    pasteOrigin = {
      x: mousePosition.x - originalBounds.width / 2,
      y: mousePosition.y - originalBounds.height / 2,
    }
  } else {
    // Paste with offset from original (fallback behavior)
    const PASTE_OFFSET = 20
    pasteOrigin = {
      x: (clipboard.originalBounds?.x ?? 0) + PASTE_OFFSET,
      y: (clipboard.originalBounds?.y ?? 0) + PASTE_OFFSET,
    }
  }

  // Recreate elements from clipboard
  const { elements: newElements, newIds } = recreateFromClipboard(
    clipboard.items,
    pasteOrigin,
    null // Paste at root level
  )

  // Update clipboard (clear isCut flag, update originalBounds for subsequent pastes)
  const updatedClipboard: ClipboardState = {
    ...clipboard,
    isCut: false, // After first paste, it's no longer a "cut"
    originalBounds: calculateBounds(newElements.filter((el) => el.parentId === null)),
  }

  return {
    elementsToAdd: newElements,
    newSelection: newIds.filter((id) => {
      // Only select root-level pasted elements
      const el = newElements.find((e) => e.id === id)
      return el?.parentId === null
    }),
    newClipboard: updatedClipboard,
    historyDescription: `Paste ${clipboard.items.length} element(s)`,
  }
}

/**
 * DUPLICATE ACTION - Duplicate selected elements in place with offset.
 *
 * Essentially copy + paste in one action:
 * 1. Clone selected elements
 * 2. Position slightly offset from originals
 * 3. Select the duplicates
 */
const duplicateHandler: GroupActionHandler = (context) => {
  const { selectedIds, elements, mousePosition } = context

  if (selectedIds.length === 0) {
    return {}
  }

  // Get selected elements
  const selectedElements = selectedIds
    .map((id) => elements[id])
    .filter((el): el is CanvasElement => el !== undefined)

  // ========================================================================
  // CRITICAL SAFEGUARD: NEVER duplicate Page elements
  // Pages are foundational elements - only ONE page element should exist per page.
  // Attempting to duplicate a page would cause critical integrity issues.
  // ========================================================================
  const containsPage = selectedElements.some((el) => el.type === 'page')
  if (containsPage) {
    console.warn(
      '[ACTION REGISTRY] Blocked duplicate of Page element. Pages cannot be duplicated.'
    )
    // Return empty result - no action taken
    return {}
  }

  // Calculate group bounds
  const bounds = calculateBounds(selectedElements)
  const groupOrigin: Point = { x: bounds.x, y: bounds.y }

  // Clone selected elements (excluding any page elements as an extra safeguard)
  const clipboardItems: ClipboardElement[] = selectedIds
    .filter((id) => elements[id]?.type !== 'page') // Extra safety filter
    .map((id) => cloneElementTree(id, context, groupOrigin))
    .filter((item): item is ClipboardElement => item !== null)

  // Calculate paste position (offset from original or at mouse)
  const DUPLICATE_OFFSET = 20
  let pasteOrigin: Point

  if (mousePosition) {
    // Duplicate at mouse position
    pasteOrigin = {
      x: mousePosition.x - bounds.width / 2,
      y: mousePosition.y - bounds.height / 2,
    }
  } else {
    // Duplicate with offset
    pasteOrigin = {
      x: bounds.x + DUPLICATE_OFFSET,
      y: bounds.y + DUPLICATE_OFFSET,
    }
  }

  // Recreate elements
  const { elements: newElements, newIds } = recreateFromClipboard(
    clipboardItems,
    pasteOrigin,
    null
  )

  return {
    elementsToAdd: newElements,
    newSelection: newIds.filter((id) => {
      const el = newElements.find((e) => e.id === id)
      return el?.parentId === null
    }),
    historyDescription: `Duplicate ${selectedIds.length} element(s)`,
  }
}

/**
 * BRING FORWARD ACTION - Increase z-order of selected elements by 1.
 *
 * Moves elements one step higher in the render order.
 * Only affects elements within their parent (siblings).
 */
const bringForwardHandler: GroupActionHandler = (context) => {
  const { selectedIds, elements, childrenMap } = context

  if (selectedIds.length === 0) {
    return {}
  }

  // Group selected elements by parent
  const elementsByParent = new Map<string, string[]>()
  selectedIds.forEach((id) => {
    const element = elements[id]
    if (!element) return
    const parentKey = element.parentId ?? '__root__'
    if (!elementsByParent.has(parentKey)) {
      elementsByParent.set(parentKey, [])
    }
    elementsByParent.get(parentKey)!.push(id)
  })

  const updates: Record<string, Partial<CanvasElement>> = {}

  // Process each parent group
  elementsByParent.forEach((ids, parentKey) => {
    const siblingIds = childrenMap[parentKey] || []
    const siblings = siblingIds
      .map((id) => elements[id])
      .filter((el): el is CanvasElement => el !== undefined)
      .sort((a, b) => a.order - b.order)

    // Find max order in this parent
    const maxOrder = Math.max(...siblings.map((s) => s.order), 0)

    // Move each selected element forward (in reverse order to prevent collisions)
    const selectedInParent = siblings
      .filter((s) => ids.includes(s.id))
      .sort((a, b) => b.order - a.order) // Process from highest order first

    selectedInParent.forEach((el) => {
      if (el.order < maxOrder) {
        // Find the element directly above and swap orders
        const elementAbove = siblings.find((s) => s.order === el.order + 1)
        if (elementAbove && !ids.includes(elementAbove.id)) {
          updates[el.id] = { order: el.order + 1 }
          updates[elementAbove.id] = { order: elementAbove.order - 1 }
        } else if (elementAbove && ids.includes(elementAbove.id)) {
          // Both selected, just increment
          updates[el.id] = { order: el.order + 1 }
        }
      }
    })
  })

  if (Object.keys(updates).length === 0) {
    return {}
  }

  return {
    elementsToUpdate: updates,
    historyDescription: 'Bring forward',
  }
}

/**
 * SEND BACKWARD ACTION - Decrease z-order of selected elements by 1.
 */
const sendBackwardHandler: GroupActionHandler = (context) => {
  const { selectedIds, elements, childrenMap } = context

  if (selectedIds.length === 0) {
    return {}
  }

  // Group selected elements by parent
  const elementsByParent = new Map<string, string[]>()
  selectedIds.forEach((id) => {
    const element = elements[id]
    if (!element) return
    const parentKey = element.parentId ?? '__root__'
    if (!elementsByParent.has(parentKey)) {
      elementsByParent.set(parentKey, [])
    }
    elementsByParent.get(parentKey)!.push(id)
  })

  const updates: Record<string, Partial<CanvasElement>> = {}

  // Process each parent group
  elementsByParent.forEach((ids, parentKey) => {
    const siblingIds = childrenMap[parentKey] || []
    const siblings = siblingIds
      .map((id) => elements[id])
      .filter((el): el is CanvasElement => el !== undefined)
      .sort((a, b) => a.order - b.order)

    // Move each selected element backward (in order to prevent collisions)
    const selectedInParent = siblings
      .filter((s) => ids.includes(s.id))
      .sort((a, b) => a.order - b.order) // Process from lowest order first

    selectedInParent.forEach((el) => {
      if (el.order > 0) {
        // Find the element directly below and swap orders
        const elementBelow = siblings.find((s) => s.order === el.order - 1)
        if (elementBelow && !ids.includes(elementBelow.id)) {
          updates[el.id] = { order: el.order - 1 }
          updates[elementBelow.id] = { order: elementBelow.order + 1 }
        } else if (elementBelow && ids.includes(elementBelow.id)) {
          // Both selected, just decrement
          updates[el.id] = { order: el.order - 1 }
        }
      }
    })
  })

  if (Object.keys(updates).length === 0) {
    return {}
  }

  return {
    elementsToUpdate: updates,
    historyDescription: 'Send backward',
  }
}

/**
 * BRING TO FRONT ACTION - Move selected elements to highest z-order.
 */
const bringToFrontHandler: GroupActionHandler = (context) => {
  const { selectedIds, elements, childrenMap } = context

  if (selectedIds.length === 0) {
    return {}
  }

  // Group by parent
  const elementsByParent = new Map<string, string[]>()
  selectedIds.forEach((id) => {
    const element = elements[id]
    if (!element) return
    const parentKey = element.parentId ?? '__root__'
    if (!elementsByParent.has(parentKey)) {
      elementsByParent.set(parentKey, [])
    }
    elementsByParent.get(parentKey)!.push(id)
  })

  const updates: Record<string, Partial<CanvasElement>> = {}

  elementsByParent.forEach((ids, parentKey) => {
    const siblingIds = childrenMap[parentKey] || []
    const siblings = siblingIds
      .map((id) => elements[id])
      .filter((el): el is CanvasElement => el !== undefined)
      .sort((a, b) => a.order - b.order)

    // Separate selected and unselected
    const selectedSiblings = siblings.filter((s) => ids.includes(s.id))
    const unselectedSiblings = siblings.filter((s) => !ids.includes(s.id))

    // Reassign orders: unselected first, then selected
    let order = 0
    unselectedSiblings.forEach((el) => {
      if (el.order !== order) {
        updates[el.id] = { order }
      }
      order++
    })
    selectedSiblings.forEach((el) => {
      if (el.order !== order) {
        updates[el.id] = { order }
      }
      order++
    })
  })

  if (Object.keys(updates).length === 0) {
    return {}
  }

  return {
    elementsToUpdate: updates,
    historyDescription: 'Bring to front',
  }
}

/**
 * SEND TO BACK ACTION - Move selected elements to lowest z-order.
 */
const sendToBackHandler: GroupActionHandler = (context) => {
  const { selectedIds, elements, childrenMap } = context

  if (selectedIds.length === 0) {
    return {}
  }

  // Group by parent
  const elementsByParent = new Map<string, string[]>()
  selectedIds.forEach((id) => {
    const element = elements[id]
    if (!element) return
    const parentKey = element.parentId ?? '__root__'
    if (!elementsByParent.has(parentKey)) {
      elementsByParent.set(parentKey, [])
    }
    elementsByParent.get(parentKey)!.push(id)
  })

  const updates: Record<string, Partial<CanvasElement>> = {}

  elementsByParent.forEach((ids, parentKey) => {
    const siblingIds = childrenMap[parentKey] || []
    const siblings = siblingIds
      .map((id) => elements[id])
      .filter((el): el is CanvasElement => el !== undefined)
      .sort((a, b) => a.order - b.order)

    // Separate selected and unselected
    const selectedSiblings = siblings.filter((s) => ids.includes(s.id))
    const unselectedSiblings = siblings.filter((s) => !ids.includes(s.id))

    // Reassign orders: selected first, then unselected
    let order = 0
    selectedSiblings.forEach((el) => {
      if (el.order !== order) {
        updates[el.id] = { order }
      }
      order++
    })
    unselectedSiblings.forEach((el) => {
      if (el.order !== order) {
        updates[el.id] = { order }
      }
      order++
    })
  })

  if (Object.keys(updates).length === 0) {
    return {}
  }

  return {
    elementsToUpdate: updates,
    historyDescription: 'Send to back',
  }
}

// ============================================================================
// BUILT-IN ACTION DEFINITIONS
// ============================================================================

/**
 * All built-in actions with their definitions.
 * These are registered automatically when the module loads.
 */
const BUILTIN_ACTIONS: GroupActionDefinition[] = [
  {
    type: 'delete',
    label: 'Delete',
    shortcuts: ['Backspace', 'Delete'],
    description: 'Delete selected elements',
    requiresSelection: true,
    handler: deleteHandler,
  },
  {
    type: 'copy',
    label: 'Copy',
    shortcuts: ['Ctrl+C', 'Cmd+C'],
    description: 'Copy selected elements to clipboard',
    requiresSelection: true,
    handler: copyHandler,
  },
  {
    type: 'cut',
    label: 'Cut',
    shortcuts: ['Ctrl+X', 'Cmd+X'],
    description: 'Cut selected elements to clipboard',
    requiresSelection: true,
    handler: cutHandler,
  },
  {
    type: 'paste',
    label: 'Paste',
    shortcuts: ['Ctrl+V', 'Cmd+V'],
    description: 'Paste clipboard contents',
    requiresSelection: false,
    requiresClipboard: true,
    handler: pasteHandler,
  },
  {
    type: 'duplicate',
    label: 'Duplicate',
    shortcuts: ['Ctrl+D', 'Cmd+D'],
    description: 'Duplicate selected elements',
    requiresSelection: true,
    handler: duplicateHandler,
  },
  {
    type: 'bring-forward',
    label: 'Bring Forward',
    shortcuts: ['Ctrl+]', 'Cmd+]'],
    description: 'Move selected elements forward in z-order',
    requiresSelection: true,
    handler: bringForwardHandler,
  },
  {
    type: 'send-backward',
    label: 'Send Backward',
    shortcuts: ['Ctrl+[', 'Cmd+['],
    description: 'Move selected elements backward in z-order',
    requiresSelection: true,
    handler: sendBackwardHandler,
  },
  {
    type: 'bring-to-front',
    label: 'Bring to Front',
    shortcuts: ['Ctrl+Shift+]', 'Cmd+Shift+]'],
    description: 'Move selected elements to front',
    requiresSelection: true,
    handler: bringToFrontHandler,
  },
  {
    type: 'send-to-back',
    label: 'Send to Back',
    shortcuts: ['Ctrl+Shift+[', 'Cmd+Shift+['],
    description: 'Move selected elements to back',
    requiresSelection: true,
    handler: sendToBackHandler,
  },
]

// ============================================================================
// INITIALIZATION - Register all built-in actions
// ============================================================================

// Register built-in actions when module loads
BUILTIN_ACTIONS.forEach((action) => registerAction(action))

// ============================================================================
// ADDITIONAL EXPORTS - Helper functions for testing and custom actions
// ============================================================================

export {
  calculateBounds,
  cloneElementTree,
  collectDescendantIds,
  recreateFromClipboard,
}
