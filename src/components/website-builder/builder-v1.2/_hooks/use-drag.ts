/**
 * ============================================================================
 * USE DRAG - Element Dragging Hook (Supports Group Drag)
 * ============================================================================
 *
 * Handles all drag-and-drop logic for canvas elements, including GROUP DRAG
 * where multiple selected elements are dragged together.
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE - READ BEFORE MODIFYING
 * ============================================================================
 *
 * This hook uses REFS for 60fps performance, NOT Redux state during drag:
 *
 * 1. onPointerDown → Initialize dragStateRef (REF, not Redux)
 * 2. onPointerMove → Update dragStateRef (REF), update DOM via RAF
 * 3. onPointerUp → Dispatch to Redux ONCE with final position
 *
 * WHY REFS?
 * - Pointer events fire 60+ times per second during drag
 * - Redux dispatch on each move would trigger 60 re-renders/second
 * - Refs update without re-renders, DOM updates via RAF are smooth
 *
 * ============================================================================
 * GROUP DRAG ARCHITECTURE
 * ============================================================================
 *
 * When multiple elements are selected and user drags one:
 * 1. ALL selected elements become part of the drag operation
 * 2. The clicked element is the "primary" - its position tracks the cursor
 * 3. Other elements maintain their RELATIVE positions to the primary
 * 4. On drop, ALL elements are moved to the target (or canvas)
 * 5. Single Redux dispatch (moveElements) for atomic operation + undo
 *
 * ============================================================================
 */

import React, { useCallback, useRef, useEffect, useState } from 'react'
import {
  useAppDispatch,
  useAppSelector,
  store,
  selectViewport,
  selectSelectedIds,
  moveElement,
  moveElements,
  reorderElement,
  updateElement,
  setSelection,
  setEditingBreakpoint,
  addToSelection,
  toggleSelection,
  calculateDragSnap,
  createSnapState,
  updateSnapState,
  isSidebarInsetFrame,
} from '../_lib'
import type { DragState, DraggedElementData, SiblingData, CanvasElement, Point } from '../_lib/types'
import type { SnapTarget, SnapState, SnapBounds } from '../_lib/snap-service'
import { SORT_THRESHOLD, NATURALLY_RESPONSIVE_ELEMENTS } from '../_lib/types'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Minimum distance (in screen pixels) the pointer must move before
 * a drag operation is initiated. This prevents accidental drags during clicks.
 */
const DRAG_THRESHOLD = 4

// ============================================================================
// DOM QUERY HELPER — Excludes Mobile Breakpoint Frame Duplicates
// ============================================================================

/**
 * Find a canvas element by data-element-id, EXCLUDING elements inside the
 * mobile breakpoint frame (`[data-breakpoint-frame]`).
 *
 * WHY: The BreakpointMobileFrame renders the SAME page children with the SAME
 * `data-element-id` attributes using PageRenderer. A plain `querySelector`
 * returns the first DOM match, which may be the mobile copy instead of the
 * main canvas element. This causes wrong sibling positions during drag,
 * transforms applied to the wrong elements, and broken sort calculations.
 */
function findCanvasElement(elementId: string): HTMLElement | null {
  const all = document.querySelectorAll(`[data-element-id="${elementId}"]`)
  for (const el of all) {
    if (!el.closest('[data-breakpoint-frame]')) return el as HTMLElement
  }
  return null
}

// ============================================================================
// TYPES
// ============================================================================

interface UseDragOptions {
  /** Ref to canvas container for coordinate transforms */
  canvasRef: React.RefObject<HTMLDivElement>
  /** Function to get element by ID from Redux */
  getElementById: (id: string) => CanvasElement | undefined
  /** Function to get children of a parent */
  getChildren: (parentId: string | null) => CanvasElement[]
  /** Snap targets for alignment (root-level elements excluding dragged ones) */
  snapTargets: SnapTarget[]
  /** Whether snap-to-grid is enabled (default: true) */
  snapEnabled?: boolean
}

interface UseDragReturn {
  /** Current drag state (for UI rendering - updates trigger re-render) */
  dragUI: {
    isDragging: boolean
    elementId: string | null
    /** All element IDs being dragged (for group drag) */
    draggedIds: string[]
    dropTargetId: string | null
    sortIndex: number
  }
  /**
   * Current bounds of the primary dragged element (for alignment guides).
   * Only valid when isDragging is true. Uses canvas coordinates.
   */
  activeBounds: SnapBounds | null
  /**
   * Handler to start dragging an element.
   * @param e - The pointer event
   * @param elementId - The ID of the element that was clicked
   * @param isDirectSelect - If true (Cmd/Ctrl+click), skip ancestor cycling and select directly
   */
  handleDragStart: (e: React.PointerEvent, elementId: string, isDirectSelect?: boolean) => void
}

// ============================================================================
// TYPES: Pending Drag State
// ============================================================================

/**
 * State captured on pointer down, before we know if it's a click or drag.
 * We wait for the pointer to move past DRAG_THRESHOLD before committing to drag.
 */
interface PendingDragState {
  /** Whether we're waiting to potentially start a drag */
  isPending: boolean
  /** The element ID that was clicked */
  elementId: string | null
  /** Screen coordinates where pointer went down */
  startX: number
  startY: number
  /** Pointer ID for capture */
  pointerId: number
  /** Target element for pointer capture */
  target: HTMLElement | null
  /** Whether Cmd/Ctrl was held during click */
  isModifierHeld: boolean
  /** Elements that will be dragged if threshold is crossed */
  elementsToDrag: string[]
  /** The actual element to drag (after selection cycling) */
  actualElementId: string | null
  /**
   * Selection state BEFORE any cycling was applied.
   * Used to revert selection if user starts dragging (prevents cycle-on-drag bug).
   */
  preCycleSelection: string[]
  /**
   * Whether a cycle occurred during this click.
   * If true and drag starts, we need to revert to preCycleSelection.
   */
  didCycle: boolean
}

function createEmptyPendingState(): PendingDragState {
  return {
    isPending: false,
    elementId: null,
    startX: 0,
    startY: 0,
    pointerId: 0,
    target: null,
    isModifierHeld: false,
    elementsToDrag: [],
    actualElementId: null,
    preCycleSelection: [],
    didCycle: false,
  }
}

// ============================================================================
// HELPER: Create empty drag state
// ============================================================================

function createEmptyDragState(): DragState {
  return {
    isDragging: false,
    elementId: null,
    draggedElements: [],
    grabOffset: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    combinedBounds: { x: 0, y: 0, width: 0, height: 0 },
    combinedBoundsOffset: { x: 0, y: 0 },
    originalParentId: null,
    originalOrder: 0,
    dropTargetId: null,
    sortIndex: 0,
  }
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for handling element drag operations, including GROUP DRAG.
 *
 * GROUP DRAG:
 * - When multiple elements are selected, dragging one drags ALL of them
 * - If clicked element is not selected, it becomes the only selection
 * - Elements maintain relative positions during drag
 * - All elements drop together into the target frame (or canvas)
 *
 * USAGE:
 * ```tsx
 * const { dragUI, handleDragStart } = useDrag({ canvasRef, getElementById, getChildren })
 *
 * // In element component:
 * <div onPointerDown={(e) => handleDragStart(e, element.id)}>
 * ```
 */
export function useDrag({
  canvasRef,
  getElementById,
  getChildren,
  snapTargets,
  snapEnabled = true,
}: UseDragOptions): UseDragReturn {
  const dispatch = useAppDispatch()
  const viewport = useAppSelector(selectViewport)
  const selectedIds = useAppSelector(selectSelectedIds)

  // ========================================================================
  // REFS - Performance-critical state (NO re-renders during drag)
  // ========================================================================

  /**
   * PENDING DRAG STATE: Captures pointer down info before we know if it's a click or drag.
   * Once pointer moves past DRAG_THRESHOLD, we transition to actual dragging.
   * This prevents accidental drags on simple clicks.
   */
  const pendingDragRef = useRef<PendingDragState>(createEmptyPendingState())

  /**
   * CRITICAL: Drag state is stored in a REF, not useState.
   * Updated 60fps during drag - if useState, would cause 60 re-renders/sec.
   */
  const dragStateRef = useRef<DragState>(createEmptyDragState())

  /** RAF handle for cancellation */
  const rafRef = useRef<number | null>(null)

  /** Cloned elements for drag overlay (one per dragged element) */
  const clonedElementsRef = useRef<HTMLElement[]>([])

  /** Cached sibling positions for sort calculation */
  const siblingsRef = useRef<SiblingData[]>([])

  /** Parent frame's flex direction for sorting (row = horizontal, column = vertical) */
  const sortDirectionRef = useRef<'row' | 'column'>('column')

  /**
   * Snap state for dead-zone tracking.
   * When snapped, requires more movement to "break free" (sticky behavior).
   * Reset at drag start, updated during drag move.
   */
  const snapStateRef = useRef<SnapState>(createSnapState())

  // ========================================================================
  // UI STATE - Only for triggering React re-renders when needed
  // ========================================================================

  const [dragUI, setDragUI] = useState<{
    isDragging: boolean
    elementId: string | null
    draggedIds: string[]
    dropTargetId: string | null
    sortIndex: number
  }>({
    isDragging: false,
    elementId: null,
    draggedIds: [],
    dropTargetId: null,
    sortIndex: 0,
  })

  /**
   * Current bounds of the primary dragged element in canvas coordinates.
   * Used by Rulers component to render alignment guides during drag.
   * Updated via RAF for 60fps performance.
   */
  const [activeBounds, setActiveBounds] = useState<SnapBounds | null>(null)

  // ========================================================================
  // COORDINATE HELPERS
  // ========================================================================

  /**
   * Convert screen coordinates to canvas coordinates.
   * Accounts for pan and zoom.
   */
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: clientX, y: clientY }

      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left - viewport.panX) / viewport.zoom,
        y: (clientY - rect.top - viewport.panY) / viewport.zoom,
      }
    },
    [canvasRef, viewport.panX, viewport.panY, viewport.zoom]
  )

  /**
   * Convert canvas coordinates to screen coordinates.
   * Used for positioning the drag overlay.
   */
  const canvasToScreen = useCallback(
    (canvasX: number, canvasY: number): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: canvasX, y: canvasY }

      const rect = canvas.getBoundingClientRect()
      return {
        x: canvasX * viewport.zoom + viewport.panX + rect.left,
        y: canvasY * viewport.zoom + viewport.panY + rect.top,
      }
    },
    [canvasRef, viewport.panX, viewport.panY, viewport.zoom]
  )

  // ========================================================================
  // DRAG START
  // ========================================================================

  // ========================================================================
  // SELECTION CYCLING HELPERS
  // ========================================================================

  /**
   * Get the chain of ancestors from a clicked element up to the root.
   * Returns array ordered from root (first) to the clicked element (last).
   *
   * Example: If structure is RootFrame -> Container -> Card
   * and we click on Card, this returns ['root-frame-id', 'container-id', 'card-id']
   */
  const getAncestorChain = useCallback(
    (elementId: string): string[] => {
      const chain: string[] = []
      let currentId: string | null = elementId

      // Walk up the tree collecting all ancestors
      while (currentId) {
        chain.unshift(currentId) // Add to front (root first)
        const el = getElementById(currentId)
        currentId = el?.parentId ?? null
      }

      return chain
    },
    [getElementById]
  )

  /**
   * Check if a potential drop target is a DESCENDANT of any dragged element.
   *
   * ============================================================================
   * WHY THIS IS CRITICAL
   * ============================================================================
   *
   * When dragging a parent frame, its children move with it visually (as clones).
   * However, the ORIGINAL child elements remain in the DOM at their old positions
   * (just hidden with opacity: 0). The drop target detection uses elementsFromPoint()
   * which can find these hidden children.
   *
   * If we allow a parent to drop INTO its own child, we'd create a circular
   * reference in the tree (parent → child → parent), which is invalid.
   *
   * This function walks UP the tree from the potential drop target to check
   * if any ancestor is one of the elements being dragged.
   *
   * ============================================================================
   *
   * @param potentialTargetId - The ID of the element we're considering as a drop target
   * @param draggedIds - Array of all element IDs currently being dragged
   * @returns true if the target is a descendant of any dragged element (INVALID drop)
   */
  const isDescendantOfDraggedElements = useCallback(
    (potentialTargetId: string, draggedIds: string[]): boolean => {
      let currentId: string | null = potentialTargetId

      // Walk up the tree from the potential target
      while (currentId) {
        // If we find a dragged element as an ancestor, this is an invalid drop
        if (draggedIds.includes(currentId)) {
          return true
        }
        const el = getElementById(currentId)
        currentId = el?.parentId ?? null
      }

      return false
    },
    [getElementById]
  )

  /**
   * Check if the clicked element is a SIBLING of the currently selected element.
   * Siblings share the same parent.
   */
  const isSiblingOfSelection = useCallback(
    (clickedElementId: string): boolean => {
      if (selectedIds.length !== 1) return false

      const currentSelection = selectedIds[0]
      const clickedElement = getElementById(clickedElementId)
      const selectedElement = getElementById(currentSelection)

      if (!clickedElement || !selectedElement) return false

      // They're siblings if they have the same parent
      return clickedElement.parentId === selectedElement.parentId
    },
    [getElementById, selectedIds]
  )

  /**
   * Determine which element to select based on selection cycling rules.
   *
   * ============================================================================
   * SELECTION CYCLING ALGORITHM
   * ============================================================================
   *
   * Given a clicked element and its ancestor chain, determine what to select:
   *
   * 1. If current selection is NOT in the ancestor chain:
   *    → Select the ROOT ancestor (topmost parent)
   *
   * 2. If current selection IS in the ancestor chain:
   *    → Select the NEXT element down in the chain (cycle towards clicked element)
   *    → If already at the clicked element, stay there
   *
   * 3. SIBLING ACCESS (NEW):
   *    → If clicked element is a SIBLING of current selection, select it directly
   *    → No cycling needed - siblings are at the same hierarchy level
   *
   * This creates a "drill-down" effect where users click repeatedly to
   * traverse from parent to child through the nesting hierarchy.
   *
   * ============================================================================
   *
   * @param clickedElementId - The element that was actually clicked
   * @param isDirectSelect - If true, bypass cycling and return clicked element directly
   * @returns The element ID that should be selected
   */
  const getSelectionTarget = useCallback(
    (clickedElementId: string, isDirectSelect: boolean): string => {
      // Direct select (Cmd/Ctrl+click) - bypass cycling entirely
      if (isDirectSelect) {
        return clickedElementId
      }

      // SIBLING ACCESS: If clicked element is a sibling of current selection,
      // select it directly without cycling. This allows quick navigation
      // between elements at the same hierarchy level.
      if (isSiblingOfSelection(clickedElementId)) {
        return clickedElementId
      }

      // Get the full ancestor chain from root to clicked element
      const ancestorChain = getAncestorChain(clickedElementId)

      // Filter out sidebar inset frames from the chain so the click cycle
      // skips them (sidebar → child, never landing on the inset frame).
      // Inset frames are structurally bound to sidebar prebuilts and cannot
      // be selected, moved, or resized independently.
      const state = store.getState()
      const activePageId = state.canvas.pages.activePageId
      const activePage = state.canvas.pages.pages[activePageId]
      const elements = activePage?.canvas?.elements ?? {}
      const filteredChain = ancestorChain.filter(
        (id) => !isSidebarInsetFrame(id, elements)
      )

      // If chain is empty (shouldn't happen) or single element, select it directly
      if (filteredChain.length <= 1) {
        return clickedElementId
      }

      // Check if current selection is in the filtered chain
      // We only care about single selection for cycling
      const currentSelection = selectedIds.length === 1 ? selectedIds[0] : null

      if (!currentSelection || !filteredChain.includes(currentSelection)) {
        // No selection or selection is outside this element's ancestry
        // → Start at the ROOT of the chain (topmost parent)
        return filteredChain[0]
      }

      // Current selection IS in the chain - find it and move to next
      const currentIndex = filteredChain.indexOf(currentSelection)

      // If we're at the clicked element already, stay there
      if (currentIndex === filteredChain.length - 1) {
        return clickedElementId
      }

      // Otherwise, move one level DEEPER in the hierarchy (skipping inset frames)
      return filteredChain[currentIndex + 1]
    },
    [getAncestorChain, selectedIds, isSiblingOfSelection]
  )

  /**
   * Handle pointer down on an element - sets up PENDING drag state.
   *
   * ============================================================================
   * DRAG THRESHOLD SYSTEM
   * ============================================================================
   *
   * To prevent clicks from being treated as drags, we use a two-phase approach:
   *
   * PHASE 1 (This function - handleDragStart):
   * - Captures the pointer down event
   * - Handles selection changes immediately (cycling, multi-select, etc.)
   * - Sets up PENDING drag state with start position
   * - Does NOT create clones or hide elements yet
   *
   * PHASE 2 (initializeDrag - called from handleDragMove):
   * - Only triggered after pointer moves past DRAG_THRESHOLD (4px)
   * - Creates drag overlays (clones)
   * - Hides original elements
   * - Sets up full drag state
   *
   * If pointer releases before threshold is crossed → treated as click (selection only)
   * If pointer moves past threshold → transitions to full drag operation
   *
   * ============================================================================
   * SELECTION BEHAVIOR OVERVIEW
   * ============================================================================
   *
   * 1. NORMAL CLICK (no modifier):
   *    - Uses selection cycling for nested elements
   *    - First click selects root ancestor, subsequent clicks drill down
   *    - REPLACES current selection (single-select mode)
   *
   * 2. CMD/CTRL + CLICK on UNSELECTED element:
   *    - ADDS the clicked element to current selection (multi-select mode)
   *    - Directly selects the clicked element (bypasses cycling)
   *
   * 3. CMD/CTRL + CLICK on ALREADY SELECTED element:
   *    - REMOVES the element from selection (toggle behavior)
   *    - Does NOT start drag (element is being deselected)
   *
   * ============================================================================
   */
  const handleDragStart = useCallback(
    (e: React.PointerEvent, elementId: string, isModifierHeld: boolean = false) => {
      e.preventDefault()
      e.stopPropagation()

      const element = getElementById(elementId)
      if (!element) return

      // ======================================================================
      // CAPTURE PRE-CYCLE SELECTION STATE
      // ======================================================================
      // We store the selection BEFORE any cycling occurs. If the user starts
      // dragging (moves past threshold), we'll revert to this selection and
      // drag the pre-cycle element instead. This prevents the "cycle on drag" bug
      // where clicking to drag accidentally cycles to a deeper element.
      // ======================================================================
      const preCycleSelection = [...selectedIds]

      // Determine which elements to drag and handle selection
      let elementsToDrag: string[]
      let actualElementId: string
      let didCycle = false

      // ======================================================================
      // MULTI-SELECT MODE (Cmd/Ctrl + click)
      // ======================================================================

      if (isModifierHeld) {
        if (selectedIds.includes(elementId)) {
          // Element is already selected - REMOVE it from selection (toggle off)
          // Don't start drag since we're deselecting
          dispatch(toggleSelection(elementId))
          return
        } else {
          // Element is NOT selected - ADD to selection
          dispatch(addToSelection(elementId))
          elementsToDrag = [...selectedIds, elementId]
          actualElementId = elementId
        }
      }
      // ======================================================================
      // NORMAL CLICK MODE (no modifier)
      // ======================================================================
      else if (selectedIds.includes(elementId)) {
        // Clicked element is already selected - will drag ALL selected elements
        elementsToDrag = [...selectedIds]
        actualElementId = elementId
      } else {
        // ====================================================================
        // SELECTION CYCLING - Always apply cycling on click
        // ====================================================================
        // We always apply cycling on pointer down for immediate visual feedback.
        // If the user starts dragging (moves past threshold), we'll revert to
        // the pre-cycle selection. This allows:
        // 1. Fast clicking to cycle through hierarchy (as expected)
        // 2. Click + drag to move the PREVIOUSLY selected element (no cycle)
        // ====================================================================

        const targetElementId = getSelectionTarget(elementId, false)
        const targetElement = getElementById(targetElementId)
        if (!targetElement) return

        if (selectedIds.includes(targetElementId)) {
          // Target is already selected (no change)
          elementsToDrag = [...selectedIds]
        } else {
          // Selection will change (cycling occurred)
          didCycle = true
          dispatch(setSelection(targetElementId))
          elementsToDrag = [targetElementId]
        }

        // Auto-switch to desktop editing mode in properties panel when selecting
        // from the main canvas. This ensures users see desktop styles when clicking
        // on elements in the desktop view.
        dispatch(setEditingBreakpoint('desktop'))

        actualElementId = targetElementId
      }

      // Capture pointer for reliable tracking
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      // ======================================================================
      // SET UP PENDING DRAG STATE
      // ======================================================================
      // We store both the current state AND the pre-cycle state. If the user
      // moves past the drag threshold, we'll check didCycle:
      // - If didCycle is true: Revert to preCycleSelection and drag that
      // - If didCycle is false: Drag the current elementsToDrag as normal
      // This separates "click to cycle" from "click to drag".
      // ======================================================================
      pendingDragRef.current = {
        isPending: true,
        elementId,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        target: e.target as HTMLElement,
        isModifierHeld,
        elementsToDrag,
        actualElementId,
        preCycleSelection,
        didCycle,
      }
    },
    [getElementById, dispatch, selectedIds, getSelectionTarget]
  )

  /**
   * Initialize the actual drag operation after threshold is crossed.
   * Creates clones, hides originals, sets up full drag state.
   *
   * ============================================================================
   * CYCLE REVERSION ON DRAG
   * ============================================================================
   * If a selection cycle occurred during pointer down (user clicked to cycle),
   * but then started dragging (moved past threshold), we REVERT to the pre-cycle
   * selection and drag that instead.
   *
   * This separates "click to cycle" from "click to drag":
   * - Click without movement = cycle completes, selection changes
   * - Click with movement = cycle is undone, drag pre-cycle element
   *
   * This gives users the best of both worlds:
   * - Fast clicking to drill down through hierarchy
   * - Click and drag to move the currently visible/selected element
   * ============================================================================
   *
   * @param e - The pointer event that crossed the threshold
   */
  const initializeDrag = useCallback(
    (_e: PointerEvent) => {
      const pending = pendingDragRef.current
      if (!pending.isPending || !pending.actualElementId) return

      // ======================================================================
      // REVERT CYCLE IF USER STARTED DRAGGING (SAME ELEMENT)
      // ======================================================================
      // If a cycle occurred (didCycle is true), the user saw the new selection
      // but then started dragging. We need to:
      // 1. Revert selection to pre-cycle state
      // 2. Drag the pre-cycle elements instead
      // This prevents accidental cycling when the intent was to drag.
      //
      // IMPORTANT: We only revert if the clicked element is part of the same
      // ancestor chain as the pre-cycle selection. If the user clicks on a
      // COMPLETELY DIFFERENT element (different ID not in pre-cycle selection),
      // we should drag that new element instead of reverting.
      // This fixes the bug where clicking on frame B after frame A would drag A.
      // ======================================================================
      let actualElementId = pending.actualElementId
      let elementsToDrag = pending.elementsToDrag

      if (pending.didCycle && pending.preCycleSelection.length > 0) {
        // Check if the originally clicked element is in the SAME HIERARCHY as the
        // pre-cycle selection. If so, the user was trying to drag the already-selected
        // parent — revert the cycle. Only skip reversion when the click was on a
        // COMPLETELY DIFFERENT element (not an ancestor or descendant of the selection).
        //
        // Uses getAncestorChain to check: if the pre-cycle element appears anywhere
        // in the clicked element's ancestor chain, they share the same hierarchy.
        // Example: parent is selected, user clicks child to drag → child's ancestors
        // include the parent → same hierarchy → revert to parent.
        const preCycleElement = pending.preCycleSelection[0]
        const clickedAncestorChain = getAncestorChain(pending.elementId!)
        const isInSameHierarchy = clickedAncestorChain.includes(preCycleElement)

        if (isInSameHierarchy) {
          // Same hierarchy — revert to pre-cycle selection and drag the parent
          dispatch(setSelection(preCycleElement))
          elementsToDrag = pending.preCycleSelection
          actualElementId = preCycleElement
        }
        // If NOT in the same hierarchy, the user clicked on a completely different
        // element — keep the current actualElementId and elementsToDrag as-is
      }

      const actualElement = getElementById(actualElementId)
      if (!actualElement) return

      // Get primary element's DOM node and rect (excludes mobile breakpoint duplicates)
      const primaryDom = findCanvasElement(actualElementId)
      if (!primaryDom) return

      const primaryRect = primaryDom.getBoundingClientRect()

      // Calculate grab offset using ORIGINAL click position (not current)
      const grabOffset = {
        x: (pending.startX - primaryRect.left) / viewport.zoom,
        y: (pending.startY - primaryRect.top) / viewport.zoom,
      }

      // Get primary element's canvas position
      const primaryCanvasPos = screenToCanvas(primaryRect.left, primaryRect.top)

      // Build dragged elements data
      const draggedElements: DraggedElementData[] = elementsToDrag.map((id) => {
        const el = getElementById(id)!
        const dom = findCanvasElement(id)
        const rect = dom?.getBoundingClientRect()

        const elCanvasPos = rect
          ? screenToCanvas(rect.left, rect.top)
          : { x: el.x, y: el.y }

        return {
          id,
          offsetFromPrimary: {
            x: elCanvasPos.x - primaryCanvasPos.x,
            y: elCanvasPos.y - primaryCanvasPos.y,
          },
          originalParentId: el.parentId,
          originalOrder: el.order,
          originalPosition: { x: el.x, y: el.y },
          size: {
            width: rect ? rect.width / viewport.zoom : el.width,
            height: rect ? rect.height / viewport.zoom : el.height,
          },
        }
      })

      // Cache siblings for sort calculations
      if (elementsToDrag.length === 1 && actualElement.parentId !== null) {
        // Get parent frame's flex direction from styles for sorting strategy
        // MIGRATION NOTE: Uses fallback for backwards compatibility with old data
        const parentFrame = getElementById(actualElement.parentId)
        if (parentFrame && parentFrame.type === 'frame') {
          const parentStyles = parentFrame.styles ?? {}
          sortDirectionRef.current = (parentStyles.flexDirection as 'row' | 'column') || 'column'
        } else {
          sortDirectionRef.current = 'column'
        }

        // ====================================================================
        // FIX: Exclude absolute positioned elements from sibling calculations
        // ====================================================================
        // Absolute positioned elements (isAbsolute: true) don't participate in
        // flex layout - they're positioned independently with x/y coordinates.
        // Including them in sibling transforms causes them to "fly" to wrong
        // positions when sorting other flex children.
        // ====================================================================
        const siblings = getChildren(actualElement.parentId).filter(
          (el) => el.id !== actualElementId && el.isAbsolute !== true
        )
        siblingsRef.current = siblings.map((sib) => {
          const dom = findCanvasElement(sib.id)
          const rect = dom?.getBoundingClientRect()
          return {
            id: sib.id,
            order: sib.order,
            triggerY: rect ? rect.top + rect.height * SORT_THRESHOLD : 0,
            triggerX: rect ? rect.left + rect.width * SORT_THRESHOLD : 0,
            height: rect ? rect.height : 60,
            width: rect ? rect.width : 100,
          }
        })
      } else {
        siblingsRef.current = []
        sortDirectionRef.current = 'column'
      }

      // ======================================================================
      // Calculate combined bounding box of ALL dragged elements
      // This is used for snap calculations and ruler/guideline display
      // ======================================================================
      let minX = primaryCanvasPos.x
      let minY = primaryCanvasPos.y
      let maxX = primaryCanvasPos.x + primaryRect.width / viewport.zoom
      let maxY = primaryCanvasPos.y + primaryRect.height / viewport.zoom

      // Expand bounds to include all dragged elements
      draggedElements.forEach((draggedEl) => {
        const elX = primaryCanvasPos.x + draggedEl.offsetFromPrimary.x
        const elY = primaryCanvasPos.y + draggedEl.offsetFromPrimary.y
        const elRight = elX + draggedEl.size.width
        const elBottom = elY + draggedEl.size.height

        minX = Math.min(minX, elX)
        minY = Math.min(minY, elY)
        maxX = Math.max(maxX, elRight)
        maxY = Math.max(maxY, elBottom)
      })

      // Combined bounds encompasses all selected elements
      const combinedBounds = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      }

      // Offset from primary element position to combined bounds top-left
      // This lets us update combinedBounds.x/y as primary position changes
      const combinedBoundsOffset = {
        x: minX - primaryCanvasPos.x,
        y: minY - primaryCanvasPos.y,
      }

      // Initialize full drag state
      dragStateRef.current = {
        isDragging: true,
        elementId: actualElementId,
        draggedElements,
        grabOffset,
        position: primaryCanvasPos,
        size: {
          width: primaryRect.width / viewport.zoom,
          height: primaryRect.height / viewport.zoom,
        },
        combinedBounds,
        combinedBoundsOffset,
        originalParentId: actualElement.parentId,
        originalOrder: actualElement.order,
        dropTargetId: actualElement.parentId,
        sortIndex: actualElement.order,
      }

      // Reset snap state
      snapStateRef.current = createSnapState()

      // Hide original elements during drag.
      // IMPORTANT: We use visibility:hidden instead of opacity:0 because React's
      // wrapperStyle includes opacity from computeCanvasWrapperOverrides. When React
      // re-renders (triggered by setDragUI state updates), it overrides DOM-set
      // opacity:0 back to opacity:1, making the original element (with its selection
      // ring) flash at the pre-drag position. visibility is NOT in wrapperStyle,
      // so React never touches it.
      elementsToDrag.forEach((id) => {
        const dom = findCanvasElement(id)
        if (dom) dom.style.visibility = 'hidden'
      })

      // Create drag overlays (clones)
      const clones: HTMLElement[] = []
      elementsToDrag.forEach((id) => {
        const dom = findCanvasElement(id)
        if (!dom) return

        const rect = dom.getBoundingClientRect()
        const clone = dom.cloneNode(true) as HTMLElement
        cleanupClone(clone)
        setupCloneStyles(clone, rect, viewport.zoom)
        document.body.appendChild(clone)
        clones.push(clone)
      })
      clonedElementsRef.current = clones

      // Clear pending state - we're now in full drag mode
      pendingDragRef.current = createEmptyPendingState()

      // Update UI state
      setDragUI({
        isDragging: true,
        elementId: actualElementId,
        draggedIds: elementsToDrag,
        dropTargetId: actualElement.parentId,
        sortIndex: actualElement.order,
      })
    },
    [getElementById, getChildren, viewport.zoom, screenToCanvas, dispatch, getAncestorChain]
  )

  // ========================================================================
  // DRAG MOVE - Runs in RAF, updates REF not Redux
  // ========================================================================

  /**
   * Handle pointer move during drag.
   *
   * This function handles TWO scenarios:
   * 1. PENDING DRAG: Check if threshold is crossed, if so initialize full drag
   * 2. ACTIVE DRAG: Update element positions, snap, drop targets, etc.
   */
  const handleDragMove = useCallback(
    (e: PointerEvent) => {
      // ======================================================================
      // PHASE 1: Check if we need to transition from pending to active drag
      // ======================================================================
      const pending = pendingDragRef.current
      if (pending.isPending) {
        // Calculate distance moved from start position
        const dx = e.clientX - pending.startX
        const dy = e.clientY - pending.startY
        const distance = Math.sqrt(dx * dx + dy * dy)

        // If we haven't crossed the threshold, don't start drag yet
        if (distance < DRAG_THRESHOLD) {
          return
        }

        // Threshold crossed - initialize the full drag operation
        initializeDrag(e)
      }

      // ======================================================================
      // PHASE 2: Handle active drag movement
      // ======================================================================
      const drag = dragStateRef.current
      if (!drag.isDragging || !drag.elementId) return

      // Calculate raw position from cursor
      const canvasPos = screenToCanvas(e.clientX, e.clientY)
      let newX = canvasPos.x - drag.grabOffset.x
      let newY = canvasPos.y - drag.grabOffset.y

      // ======================================================================
      // SNAP-TO-GRID: Only applies when dragging to canvas (root level)
      // ======================================================================
      // Snapping is disabled when dropping into a frame because:
      // 1. Frame children use relative positioning (auto-layout)
      // 2. Canvas alignment doesn't make sense for nested elements
      //
      // MULTI-SELECTION: When multiple elements are selected, we snap based on
      // the COMBINED bounding box of all elements, not just the primary element.
      // This makes snapping work intuitively for grouped elements.
      // ======================================================================

      const isDroppedOnCanvas = drag.dropTargetId === null
      const shouldSnap = snapEnabled && isDroppedOnCanvas && snapTargets.length > 0

      if (shouldSnap) {
        // Calculate current combined bounds position based on new primary position
        // combinedBounds.x = primaryPos.x + offset.x
        const currentCombinedX = newX + drag.combinedBoundsOffset.x
        const currentCombinedY = newY + drag.combinedBoundsOffset.y

        // Build bounds for snap calculation using COMBINED bounds (for multi-selection)
        const bounds: SnapBounds = {
          x: currentCombinedX,
          y: currentCombinedY,
          width: drag.combinedBounds.width,
          height: drag.combinedBounds.height,
        }

        // Calculate snap offsets with dead-zone support
        const snapResult = calculateDragSnap(
          bounds,
          snapTargets,
          snapStateRef.current
        )

        // Apply snap offsets to primary position
        // The snap is calculated for combined bounds, so the offset applies to primary too
        newX += snapResult.snapX
        newY += snapResult.snapY

        // Update snap state for dead-zone tracking
        updateSnapState(snapStateRef.current, snapResult)
      }

      // Store final primary position
      drag.position = { x: newX, y: newY }

      // Update combined bounds position (maintains same offset from primary)
      drag.combinedBounds.x = newX + drag.combinedBoundsOffset.x
      drag.combinedBounds.y = newY + drag.combinedBoundsOffset.y

      /**
       * Find valid drop target (frame under cursor).
       *
       * VALIDATION RULES:
       * 1. Skip drag overlay clones (they're visual only)
       * 2. Skip elements that ARE being dragged (can't drop into yourself)
       * 3. Skip elements that are DESCENDANTS of dragged elements (prevents circular refs)
       *
       * The third rule is critical: when dragging a parent frame, its children
       * are still in the DOM (hidden). Without this check, hovering over where
       * a child was would make the parent try to drop INTO its own child.
       */
      const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY)
      let newDropTarget: string | null = null
      const draggedIds = drag.draggedElements.map((el) => el.id)

      for (const el of elementsAtPoint) {
        // Skip drag overlay clones
        if (el.closest('[data-drag-overlay]')) continue

        const frameEl = el.closest('[data-frame-id]') as HTMLElement | null
        if (!frameEl) continue

        const frameId = frameEl.dataset.frameId!

        // Skip if this frame IS one of the dragged elements
        if (draggedIds.includes(frameId)) continue

        // Skip if this frame is a DESCENDANT of any dragged element
        // This prevents parent-into-child drops which would create circular refs
        if (isDescendantOfDraggedElements(frameId, draggedIds)) continue

        // Valid drop target found
        newDropTarget = frameId
        break
      }

      drag.dropTargetId = newDropTarget

      // ======================================================================
      // CALCULATE SORT INDEX FOR DROP POSITION
      // ======================================================================
      // This determines WHERE in the target frame's children the element will be inserted.
      // Works for both:
      // 1. Reordering within SAME parent (uses cached siblings)
      // 2. Dropping into NEW parent (calculates on-the-fly from DOM)
      // ======================================================================

      if (drag.draggedElements.length === 1 && newDropTarget !== null) {
        // Get target frame's flex direction for sorting strategy
        const targetFrame = getElementById(newDropTarget)
        const targetStyles = targetFrame?.styles ?? {}
        const targetFlexDirection = (targetStyles.flexDirection as 'row' | 'column') || 'column'
        const isHorizontal = targetFlexDirection === 'row'
        const cursorPos = isHorizontal ? e.clientX : e.clientY

        if (newDropTarget === drag.originalParentId) {
          // ================================================================
          // REORDERING WITHIN SAME PARENT - Use cached siblings
          // ================================================================
          const frameSiblings = siblingsRef.current

          // Sort siblings by their ORDER (not visual position) for consistent indexing
          const sortedByOrder = [...frameSiblings].sort((a, b) => a.order - b.order)

          // Count how many siblings' trigger points the cursor has passed
          // This gives us the visual insertion position
          let visualInsertIndex = 0
          for (const sib of sortedByOrder) {
            const sibTrigger = isHorizontal ? sib.triggerX : sib.triggerY
            if (cursorPos > sibTrigger) {
              visualInsertIndex++
            }
          }

          // Convert visual insert index to actual order value
          // The dragged element is NOT in sortedByOrder, so we need to account for its position
          let sortIndex: number

          if (visualInsertIndex === 0) {
            // Insert at the very beginning
            sortIndex = 0
          } else {
            // Insert after the Nth sibling (visually)
            // Find which sibling is at visual position (visualInsertIndex - 1)
            const siblingBefore = sortedByOrder[visualInsertIndex - 1]
            if (siblingBefore) {
              sortIndex = siblingBefore.order + 1
            } else {
              // Fallback: insert at the end
              sortIndex = sortedByOrder.length > 0
                ? sortedByOrder[sortedByOrder.length - 1].order + 1
                : 0
            }
          }

          drag.sortIndex = sortIndex

          // Update sibling transforms for visual feedback
          updateSiblingTransforms(
            siblingsRef.current,
            sortIndex,
            drag.originalOrder,
            isHorizontal ? drag.size.width : drag.size.height,
            isHorizontal
          )
        } else {
          // ================================================================
          // DROPPING INTO NEW PARENT - Calculate position from DOM
          // ================================================================
          // When dropping into a different frame, we need to calculate the
          // insertion position based on the new parent's children.
          // We exclude absolute positioned elements since they don't participate
          // in flex layout ordering.
          // ================================================================
          resetSiblingTransforms(siblingsRef.current)

          // Get children of the new drop target (excluding dragged elements and absolute elements)
          const draggedIds = drag.draggedElements.map((el) => el.id)
          const newParentChildren = getChildren(newDropTarget).filter(
            (el) => !draggedIds.includes(el.id) && el.isAbsolute !== true
          )

          // Build sibling data from DOM for the new parent
          const newSiblings: SiblingData[] = newParentChildren.map((child) => {
            const dom = findCanvasElement(child.id)
            const rect = dom?.getBoundingClientRect()
            return {
              id: child.id,
              order: child.order,
              triggerY: rect ? rect.top + rect.height * SORT_THRESHOLD : 0,
              triggerX: rect ? rect.left + rect.width * SORT_THRESHOLD : 0,
              height: rect ? rect.height : 60,
              width: rect ? rect.width : 100,
            }
          })

          // Sort siblings by their ORDER for consistent indexing
          const sortedByOrder = [...newSiblings].sort((a, b) => a.order - b.order)

          // Count how many siblings' trigger points the cursor has passed
          let visualInsertIndex = 0
          for (const sib of sortedByOrder) {
            const sibTrigger = isHorizontal ? sib.triggerX : sib.triggerY
            if (cursorPos > sibTrigger) {
              visualInsertIndex++
            }
          }

          // Convert visual insert index to actual order value for NEW parent
          let sortIndex: number

          if (sortedByOrder.length === 0) {
            // Empty frame - insert at 0
            sortIndex = 0
          } else if (visualInsertIndex === 0) {
            // Insert at the very beginning
            sortIndex = 0
          } else if (visualInsertIndex >= sortedByOrder.length) {
            // Insert at the end (after all existing children)
            sortIndex = sortedByOrder[sortedByOrder.length - 1].order + 1
          } else {
            // Insert after the Nth sibling (visually)
            const siblingBefore = sortedByOrder[visualInsertIndex - 1]
            sortIndex = siblingBefore ? siblingBefore.order + 1 : visualInsertIndex
          }

          drag.sortIndex = sortIndex
        }
      } else if (newDropTarget === null) {
        // Dropping on canvas (root level) - order doesn't matter
        drag.sortIndex = 0
        resetSiblingTransforms(siblingsRef.current)
      } else {
        // Multi-element drag - use 0 for now (could be enhanced later)
        drag.sortIndex = 0
        resetSiblingTransforms(siblingsRef.current)
      }

      // Update DOM via RAF
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        // Position each clone based on primary position + offset
        drag.draggedElements.forEach((draggedEl, index) => {
          const clone = clonedElementsRef.current[index]
          if (!clone) return

          const elCanvasX = drag.position.x + draggedEl.offsetFromPrimary.x
          const elCanvasY = drag.position.y + draggedEl.offsetFromPrimary.y
          const screenPos = canvasToScreen(elCanvasX, elCanvasY)

          clone.style.left = `${screenPos.x}px`
          clone.style.top = `${screenPos.y}px`
        })

        // Update UI state (batched with RAF)
        setDragUI({
          isDragging: true,
          elementId: drag.elementId,
          draggedIds: drag.draggedElements.map((el) => el.id),
          dropTargetId: drag.dropTargetId,
          sortIndex: drag.sortIndex,
        })

        // Update active bounds for alignment guide rendering
        // Only set when on canvas (root level) - nested elements don't need guides
        // MULTI-SELECTION: Use combinedBounds so rulers/guides encompass all elements
        if (drag.dropTargetId === null) {
          setActiveBounds({
            x: drag.combinedBounds.x,
            y: drag.combinedBounds.y,
            width: drag.combinedBounds.width,
            height: drag.combinedBounds.height,
          })
        } else {
          setActiveBounds(null)
        }
      })
    },
    [screenToCanvas, canvasToScreen, isDescendantOfDraggedElements, snapEnabled, snapTargets, initializeDrag]
  )

  // ========================================================================
  // DRAG END - Commits to Redux
  // ========================================================================

  /**
   * Complete drag operation.
   *
   * Handles two scenarios:
   * 1. PENDING DRAG (never crossed threshold): Just clean up - selection was already handled
   * 2. ACTIVE DRAG: Dispatch move actions to Redux and clean up
   */
  const handleDragEnd = useCallback(
    (e: PointerEvent) => {
      // ======================================================================
      // HANDLE PENDING DRAG (click without movement past threshold)
      // ======================================================================
      const pending = pendingDragRef.current
      if (pending.isPending) {
        // Release pointer capture
        if (pending.target) {
          try {
            pending.target.releasePointerCapture(pending.pointerId)
          } catch {
            // Pointer capture may have already been released
          }
        }

        // Clear pending state - selection was already handled in handleDragStart
        pendingDragRef.current = createEmptyPendingState()
        return
      }

      // ======================================================================
      // HANDLE ACTIVE DRAG (completed movement)
      // ======================================================================
      const drag = dragStateRef.current
      if (!drag.isDragging || !drag.elementId) return

      // Release pointer
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

      const draggedIds = drag.draggedElements.map((el) => el.id)

      // Clean up DOM - remove clones
      clonedElementsRef.current.forEach((clone) => clone.remove())
      clonedElementsRef.current = []

      // Restore original elements' visibility
      draggedIds.forEach((id) => {
        const dom = findCanvasElement(id)
        if (dom) dom.style.visibility = ''
      })

      resetSiblingTransforms(siblingsRef.current)

      // ====================================================================
      // DISPATCH TO REDUX - Single atomic operation for all elements
      // ====================================================================

      if (drag.draggedElements.length === 1) {
        // SINGLE ELEMENT DRAG - use original moveElement/reorderElement
        const elementId = drag.elementId
        const element = getElementById(elementId)
        const isAbsoluteElement = element?.isAbsolute === true

        if (drag.dropTargetId === null) {
          // ================================================================
          // DROPPED ON CANVAS (root level)
          // ================================================================
          dispatch(
            moveElement({
              id: elementId,
              newParentId: null,
              newOrder: 0,
              newX: drag.position.x,
              newY: drag.position.y,
            })
          )

          // If element has autoWidth enabled, disable it when dropping on canvas.
          // Root elements can't use 100% width (nothing to fill), so we switch
          // back to the actual rendered pixel width to prevent collapse.
          // This applies to ALL element types (frame, text, image, video, form, etc.)
          // since they all support autoWidth. Uses 'autoWidth' in element check
          // to safely handle the CanvasElement union type (same pattern as computeElementSizeStyles).
          const updates: Record<string, unknown> = {}
          if (element && 'autoWidth' in element && (element as { autoWidth?: boolean }).autoWidth) {
            updates.autoWidth = false
            // Use the actual rendered width captured during drag init so the
            // element maintains its visual size instead of snapping to the small stored default.
            // draggedElements[].size is measured from getBoundingClientRect / zoom in initializeDrag.
            const draggedEl = drag.draggedElements[0]
            if (draggedEl?.size?.width) {
              updates.width = Math.round(draggedEl.size.width)
            }
          }
          if (isAbsoluteElement) {
            updates.isAbsolute = false
            updates.centerHorizontal = false
            updates.centerVertical = false
          }
          if (Object.keys(updates).length > 0) {
            dispatch(updateElement({ id: elementId, updates }))
          }
        } else if (drag.dropTargetId === drag.originalParentId) {
          // ================================================================
          // REORDERED/MOVED WITHIN SAME PARENT
          // ================================================================
          if (isAbsoluteElement) {
            // Absolute element: update x/y position relative to parent
            // Use screen coordinates directly like the properties panel does
            // This avoids complex canvas coordinate transformations that can introduce errors
            const parentDom = findCanvasElement(drag.dropTargetId!)
            if (parentDom) {
              // Get the parent's content div (where children are positioned with position:relative)
              // Excludes label divs (data-frame-label for legacy, data-element-label for unified)
              // and dimensions pill overlay to find the actual content area
              const parentContent = parentDom.querySelector(':scope > div:not([data-frame-label]):not([data-element-label]):not([data-dimensions-pill])') as HTMLElement
              const parentRect = (parentContent || parentDom).getBoundingClientRect()

              // Convert drag.position (canvas coords) back to screen coords
              // to calculate screen-space position of where element will land
              const elementScreenPos = canvasToScreen(drag.position.x, drag.position.y)

              // Calculate relative position: screen coords -> divide by zoom to get unscaled values
              // This matches how the properties panel calculates position when toggling absolute
              const relativeX = (elementScreenPos.x - parentRect.left) / viewport.zoom
              const relativeY = (elementScreenPos.y - parentRect.top) / viewport.zoom

              // When user manually drags, disable CSS centering since they're choosing a specific position
              // The centering flags use CSS left:50%/top:50% which would override our calculated values
              dispatch(
                updateElement({
                  id: elementId,
                  updates: {
                    x: Math.round(relativeX),
                    y: Math.round(relativeY),
                    centerHorizontal: false,
                    centerVertical: false,
                  },
                })
              )
            }
          } else if (drag.sortIndex !== drag.originalOrder) {
            // Normal flex child: reorder within parent
            const newOrder =
              drag.sortIndex > drag.originalOrder
                ? drag.sortIndex - 1
                : drag.sortIndex
            dispatch(reorderElement({ id: elementId, newOrder }))
          }
        } else {
          // ================================================================
          // MOVED TO DIFFERENT PARENT (frame)
          // ================================================================
          // If element was absolute, disable it when moving to new parent
          // Also reset centering flags (user can re-enable if needed)
          const moveUpdates: Record<string, unknown> = {}
          if (isAbsoluteElement) {
            moveUpdates.isAbsolute = false
            moveUpdates.centerHorizontal = false
            moveUpdates.centerVertical = false
          }

          /**
           * Reset position for flex layout — parent frames use flexbox,
           * so children don't need absolute x/y offsets. Without this,
           * elements reparented from root keep their old floating coords
           * (e.g., x:100, y:100) causing misalignment inside the page.
           */
          moveUpdates.x = 0
          moveUpdates.y = 0

          /**
           * Enable autoWidth so the element fills its new parent container.
           * Matches the behavior of handleDrop for new elements where
           * shouldAutoWidth = (dropTargetId !== null). Without this,
           * root elements keep their fixed pixel width (e.g., 1440px)
           * which overflows the page boundaries.
           */
          if (element && 'autoWidth' in element) {
            moveUpdates.autoWidth = true
          }

          // Restore autoHeight for naturally responsive elements
          // (FAQ, payment, checkout, prebuilt) that grow to fit content.
          if (element && NATURALLY_RESPONSIVE_ELEMENTS.has(element.type)) {
            if ('autoHeight' in element) {
              moveUpdates.autoHeight = true
            }
          }

          if (Object.keys(moveUpdates).length > 0) {
            dispatch(
              updateElement({
                id: elementId,
                updates: moveUpdates,
              })
            )
          }
          dispatch(
            moveElement({
              id: elementId,
              newParentId: drag.dropTargetId,
              newOrder: drag.sortIndex,
            })
          )
        }
      } else {
        // GROUP DRAG - use moveElements for atomic operation
        const moves = drag.draggedElements.map((draggedEl) => {
          // Calculate final position based on primary + offset
          const newX = drag.position.x + draggedEl.offsetFromPrimary.x
          const newY = drag.position.y + draggedEl.offsetFromPrimary.y

          return {
            id: draggedEl.id,
            newParentId: drag.dropTargetId,
            newX,
            newY,
          }
        })

        dispatch(
          moveElements({
            moves,
            startingOrder: drag.sortIndex,
          })
        )

        // If dropping on canvas (root level), disable autoWidth and isAbsolute for any elements that had them.
        // Root elements can't use 100% width (autoWidth), and are always absolute by default (isAbsolute).
        // Applies to ALL element types (frame, text, image, video, form, carousel, etc.).
        if (drag.dropTargetId === null) {
          drag.draggedElements.forEach((draggedEl) => {
            const el = getElementById(draggedEl.id)
            const updates: Record<string, unknown> = {}
            if (el && 'autoWidth' in el && (el as { autoWidth?: boolean }).autoWidth) {
              updates.autoWidth = false
              // Use the actual rendered width captured during drag init so the
              // element maintains its visual size instead of collapsing to the small stored default.
              if (draggedEl.size?.width) {
                updates.width = Math.round(draggedEl.size.width)
              }
            }
            if (el?.isAbsolute) {
              updates.isAbsolute = false
            }
            if (Object.keys(updates).length > 0) {
              dispatch(
                updateElement({
                  id: draggedEl.id,
                  updates,
                })
              )
            }
          })
        } else {
          /**
           * Dropping into a frame — reset position and enable autoWidth
           * for all elements, plus autoHeight for naturally responsive ones.
           * Same logic as the single-element reparent path above.
           */
          drag.draggedElements.forEach((draggedEl) => {
            const el = getElementById(draggedEl.id)
            if (!el) return

            const updates: Record<string, unknown> = {
              x: 0,
              y: 0,
            }

            if ('autoWidth' in el) {
              updates.autoWidth = true
            }
            if (el.isAbsolute) {
              updates.isAbsolute = false
            }
            if (NATURALLY_RESPONSIVE_ELEMENTS.has(el.type) && 'autoHeight' in el) {
              updates.autoHeight = true
            }

            dispatch(
              updateElement({
                id: draggedEl.id,
                updates,
              })
            )
          })
        }
      }

      // Reset state
      dragStateRef.current = createEmptyDragState()
      siblingsRef.current = []
      snapStateRef.current = createSnapState()

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      setDragUI({
        isDragging: false,
        elementId: null,
        draggedIds: [],
        dropTargetId: null,
        sortIndex: 0,
      })

      // Clear active bounds - no longer dragging
      setActiveBounds(null)
    },
    [dispatch, getElementById, canvasToScreen, viewport.zoom]
  )

  // ========================================================================
  // GLOBAL EVENT LISTENERS
  // ========================================================================

  useEffect(() => {
    window.addEventListener('pointermove', handleDragMove)
    window.addEventListener('pointerup', handleDragEnd)

    return () => {
      window.removeEventListener('pointermove', handleDragMove)
      window.removeEventListener('pointerup', handleDragEnd)
    }
  }, [handleDragMove, handleDragEnd])

  // ========================================================================
  // CLEANUP ON UNMOUNT - Prevents orphaned drag clones in the DOM
  // ========================================================================

  useEffect(() => {
    return () => {
      // CRITICAL: Clean up any drag clones if component unmounts during drag
      // This prevents orphaned elements in the DOM that could cause visual bugs
      clonedElementsRef.current.forEach((clone) => {
        try {
          clone.remove()
        } catch {
          // Clone may have already been removed
        }
      })
      clonedElementsRef.current = []

      // Also clean up any stale drag overlays that might have been left behind
      // This is a safety net for any edge cases we haven't caught
      const staleOverlays = document.querySelectorAll('[data-drag-overlay]')
      staleOverlays.forEach((overlay) => {
        console.warn('[DRAG CLEANUP] Removing stale drag overlay from DOM')
        overlay.remove()
      })

      // Restore visibility of any elements that might have been hidden
      const drag = dragStateRef.current
      if (drag.isDragging && drag.draggedElements.length > 0) {
        drag.draggedElements.forEach((el) => {
          const dom = findCanvasElement(el.id)
          if (dom) dom.style.visibility = ''
        })
      }

      // Cancel any pending RAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  // ========================================================================
  // PERIODIC CLEANUP - Safety net for stale overlays (runs every 5 seconds)
  // ========================================================================

  useEffect(() => {
    /**
     * Periodically check for and remove stale drag overlays.
     * This is a safety net for rare edge cases where overlays might be orphaned.
     * We only remove overlays if there's no active drag operation.
     */
    const cleanupInterval = setInterval(() => {
      const drag = dragStateRef.current
      const pending = pendingDragRef.current

      // Only clean up if no drag is in progress
      if (!drag.isDragging && !pending.isPending) {
        const staleOverlays = document.querySelectorAll('[data-drag-overlay]')
        if (staleOverlays.length > 0) {
          console.warn(
            `[DRAG CLEANUP] Found ${staleOverlays.length} stale drag overlay(s), removing...`
          )
          staleOverlays.forEach((overlay) => overlay.remove())
        }
      }
    }, 5000) // Check every 5 seconds

    return () => clearInterval(cleanupInterval)
  }, [])

  return { dragUI, activeBounds, handleDragStart }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clean up cloned element - remove data attributes to prevent hit testing issues.
 * Preserves transforms on elements that have zoom compensation (labels and pills).
 */
function cleanupClone(el: HTMLElement) {
  el.removeAttribute('data-element-id')
  el.removeAttribute('data-frame-id')
  // Reset opacity and visibility — clone inherits visibility:hidden from
  // the original element (which is hidden during drag). Clearing these
  // ensures the clone renders visibly.
  el.style.opacity = ''
  el.style.visibility = ''

  // Skip transform reset for elements with zoom compensation:
  // - Labels need inverse zoom to stay readable:
  //   data-frame-label (legacy), data-text-label (legacy), data-element-label (unified)
  // - Dimensions pills (data-dimensions-pill) also need inverse zoom
  const hasZoomCompensation =
    el.hasAttribute('data-frame-label') ||
    el.hasAttribute('data-text-label') ||
    el.hasAttribute('data-element-label') ||
    el.hasAttribute('data-dimensions-pill')

  if (!hasZoomCompensation) {
    el.style.transform = ''
  }

  el.style.transition = ''
  Array.from(el.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      cleanupClone(child)
    }
  })
}

/**
 * Set up styles for the drag overlay clone.
 */
function setupCloneStyles(
  clone: HTMLElement,
  elementRect: DOMRect,
  zoom: number
) {
  clone.setAttribute('data-drag-overlay', 'true')
  clone.style.position = 'fixed'
  clone.style.pointerEvents = 'none'
  // z-index 1 keeps drag overlay below all UI chrome (sidebars, toolbar, panels at z-9999)
  clone.style.zIndex = '1'
  clone.style.opacity = '1'
  clone.style.visibility = 'visible'
  clone.style.margin = '0'
  clone.style.transform = `scale(${zoom})`
  clone.style.transformOrigin = 'top left'
  clone.style.boxShadow =
    '0 20px 40px rgba(0,0,0,0.5), 0 0 0 2px rgba(59, 130, 246, 0.5)'
  clone.style.left = `${elementRect.left}px`
  clone.style.top = `${elementRect.top}px`
  // Lock explicit dimensions so percentage-based widths (autoWidth: 100%)
  // don't re-resolve against document.body when the clone is appended there.
  // Divides by zoom because the clone has transform: scale(zoom) applied.
  clone.style.width = `${elementRect.width / zoom}px`
  clone.style.height = `${elementRect.height / zoom}px`
}

/**
 * Update sibling transforms for sort preview.
 * Uses direct DOM manipulation for 60fps performance.
 *
 * @param siblings - Cached sibling data
 * @param sortIndex - Current sort position
 * @param originalOrder - Original position of dragged element
 * @param draggedElementSize - Width (horizontal) or height (vertical) of dragged element
 * @param isHorizontal - True for row layouts, false for column layouts
 */
function updateSiblingTransforms(
  siblings: SiblingData[],
  sortIndex: number,
  originalOrder: number,
  draggedElementSize: number,
  isHorizontal: boolean = false
) {
  const gap = 10
  const shiftAmount = draggedElementSize + gap

  siblings.forEach((sib) => {
    const sibDom = findCanvasElement(sib.id)
    if (!sibDom) return

    let shift = 0

    if (sortIndex <= originalOrder) {
      if (sib.order >= sortIndex && sib.order < originalOrder) {
        shift = shiftAmount
      }
    } else {
      if (sib.order > originalOrder && sib.order < sortIndex) {
        shift = -shiftAmount
      }
    }

    // Use translateX for horizontal layouts, translateY for vertical
    if (shift !== 0) {
      sibDom.style.transform = isHorizontal
        ? `translateX(${shift}px)`
        : `translateY(${shift}px)`
    } else {
      sibDom.style.transform = ''
    }
    sibDom.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
  })
}

/**
 * Reset all sibling transforms.
 */
function resetSiblingTransforms(siblings: SiblingData[]) {
  siblings.forEach((sib) => {
    const sibDom = findCanvasElement(sib.id)
    if (sibDom) {
      sibDom.style.transform = ''
      sibDom.style.transition = ''
    }
  })
}
