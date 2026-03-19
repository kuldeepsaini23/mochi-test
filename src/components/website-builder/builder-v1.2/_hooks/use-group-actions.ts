/**
 * ============================================================================
 * USE GROUP ACTIONS - Hook for Multi-Element Operations
 * ============================================================================
 *
 * This hook provides the interface for executing group actions (delete, copy,
 * cut, paste, duplicate, etc.) on selected elements.
 *
 * ============================================================================
 * ARCHITECTURE - HOW IT WORKS
 * ============================================================================
 *
 * 1. KEYBOARD LISTENER
 *    - Listens for keyboard shortcuts (Delete, Ctrl+C, etc.)
 *    - Maps shortcuts to action types
 *    - Executes corresponding action handlers
 *
 * 2. ACTION EXECUTION
 *    - Gets current context (selection, elements, clipboard)
 *    - Calls action handler from registry
 *    - Applies result to Redux store
 *
 * 3. MOUSE TRACKING
 *    - Tracks mouse position for paste-at-cursor
 *    - Uses refs for performance (no re-renders)
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * function Canvas() {
 *   const { executeAction } = useGroupActions({ canvasRef })
 *
 *   // Keyboard shortcuts are handled automatically
 *
 *   // Manual action execution (e.g., from context menu)
 *   const handleDelete = () => executeAction('delete')
 * }
 * ```
 *
 * ============================================================================
 * EXTENDING WITH CUSTOM ACTIONS
 * ============================================================================
 *
 * To add custom actions:
 * 1. Register the action using registerAction() from action-registry
 * 2. Add keyboard shortcut mapping in KEYBOARD_SHORTCUTS
 * 3. The action will be automatically available via executeAction()
 *
 * ============================================================================
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  useAppDispatch,
  useAppSelector,
  selectSelectedIds,
  setMultiSelection,
  clearSelection,
} from '../_lib'
import { store } from '../_lib/store'
import {
  executeAction as executeRegisteredAction,
  getAllActions,
} from '../_lib/action-registry'
import type {
  GroupActionType,
  GroupActionContext,
  GroupActionResult,
  ClipboardState,
  Point,
} from '../_lib/types'
import { addElement, deleteElements, updateElement, registerComponentInstance } from '../_lib/canvas-slice'
import type { ComponentInstanceElement } from '../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface UseGroupActionsOptions {
  /** Reference to canvas container for coordinate transforms */
  canvasRef: React.RefObject<HTMLDivElement | null>
}

interface UseGroupActionsReturn {
  /**
   * Execute a group action by type.
   *
   * @param type - The action type to execute
   * @param options - Optional overrides for action context
   */
  executeAction: (
    type: GroupActionType,
    options?: { mousePosition?: Point }
  ) => void

  /**
   * Get all available actions (for building menus).
   */
  getAvailableActions: () => ReturnType<typeof getAllActions>

  /**
   * Current clipboard state (for UI feedback).
   */
  clipboard: ClipboardState

  /**
   * Whether an action can be executed given current state.
   */
  canExecute: (type: GroupActionType) => boolean
}

// ============================================================================
// KEYBOARD SHORTCUT MAPPING
// ============================================================================

/**
 * Maps keyboard events to action types.
 *
 * EXTENDING: Add new shortcuts here when registering custom actions.
 *
 * Note: We normalize Mac (Cmd) and Windows (Ctrl) modifiers.
 * Both Cmd+C and Ctrl+C map to 'copy' action.
 */
interface ShortcutMapping {
  key: string
  ctrl?: boolean // Ctrl (Windows/Linux) or Cmd (Mac)
  shift?: boolean
  alt?: boolean
  action: GroupActionType
}

const KEYBOARD_SHORTCUTS: ShortcutMapping[] = [
  // Delete
  { key: 'Backspace', action: 'delete' },
  { key: 'Delete', action: 'delete' },

  // Clipboard operations
  { key: 'c', ctrl: true, action: 'copy' },
  { key: 'x', ctrl: true, action: 'cut' },
  { key: 'v', ctrl: true, action: 'paste' },
  { key: 'd', ctrl: true, action: 'duplicate' },

  // Z-order
  { key: ']', ctrl: true, action: 'bring-forward' },
  { key: '[', ctrl: true, action: 'send-backward' },
  { key: ']', ctrl: true, shift: true, action: 'bring-to-front' },
  { key: '[', ctrl: true, shift: true, action: 'send-to-back' },
]

/**
 * Check if a keyboard event matches a shortcut mapping.
 */
function matchesShortcut(e: KeyboardEvent, shortcut: ShortcutMapping): boolean {
  // Check key match (case-insensitive for letter keys)
  if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) {
    return false
  }

  // Check modifiers
  // For ctrl, we check either Ctrl or Meta (Cmd on Mac)
  const ctrlOrMeta = e.ctrlKey || e.metaKey
  if (shortcut.ctrl && !ctrlOrMeta) return false
  if (!shortcut.ctrl && ctrlOrMeta) return false

  if (shortcut.shift && !e.shiftKey) return false
  if (!shortcut.shift && e.shiftKey && shortcut.ctrl) return false // Shift matters when ctrl is pressed

  if (shortcut.alt && !e.altKey) return false
  if (!shortcut.alt && e.altKey) return false

  return true
}

// ============================================================================
// CLIPBOARD STATE MANAGEMENT
// ============================================================================

/**
 * Internal clipboard state.
 *
 * We store this in a ref + state combo because:
 * - Ref allows access in event handlers without stale closures
 * - State allows React components to react to clipboard changes
 *
 * Note: This is NOT in Redux because it's session-only ephemeral state.
 * We don't need undo/redo for clipboard, and it doesn't need to persist.
 */
const clipboardRef: { current: ClipboardState } = {
  current: {
    items: [],
    isCut: false,
    originalBounds: null,
  },
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useGroupActions({
  canvasRef,
}: UseGroupActionsOptions): UseGroupActionsReturn {
  const dispatch = useAppDispatch()
  const selectedIds = useAppSelector(selectSelectedIds)

  // ========================================================================
  // REFS - Mouse position tracking for paste-at-cursor
  // ========================================================================

  /**
   * Current mouse position in canvas coordinates.
   * Updated on every mouse move (via ref for performance).
   */
  const mousePositionRef = useRef<Point | null>(null)

  // ========================================================================
  // CONTEXT BUILDER - Creates context for action handlers
  // ========================================================================

  /**
   * Build the action context from current state.
   *
   * Uses direct store access for synchronous, non-stale data.
   * Now page-aware: gets data from the ACTIVE page.
   * Includes localComponents for proper component instance handling.
   */
  const buildContext = useCallback(
    (overrides?: { mousePosition?: Point }): GroupActionContext => {
      const state = store.getState()
      // Get the active page's data
      const activePageId = state.canvas.pages.activePageId
      const activePage = state.canvas.pages.pages[activePageId]
      const { elements, childrenMap } = activePage.canvas

      return {
        selectedIds: activePage.selection.selectedIds,
        elements,
        childrenMap,
        clipboard: clipboardRef.current,
        viewport: activePage.viewport,
        mousePosition: overrides?.mousePosition ?? mousePositionRef.current,
        // Include localComponents for component instance copy/paste handling
        localComponents: state.canvas.localComponents,
      }
    },
    []
  )

  // ========================================================================
  // RESULT APPLIER - Applies action result to Redux store
  // ========================================================================

  /**
   * Apply the result of an action to the Redux store.
   *
   * This is where the pure action handler results get committed to state.
   * Each action result can specify:
   * - Elements to add
   * - Elements to delete
   * - Elements to update
   * - New selection
   * - New clipboard state
   *
   * IMPORTANT: We use deleteElements (batch) instead of deleteElement (single)
   * to ensure all deletions are recorded as a SINGLE history entry. This allows
   * the user to undo "delete 100 elements" with a single Cmd+Z.
   */
  const applyResult = useCallback(
    (result: GroupActionResult) => {
      // Delete elements first (to avoid ID conflicts on add)
      // Use batch delete for single undo operation
      if (result.elementsToDelete && result.elementsToDelete.length > 0) {
        dispatch(deleteElements(result.elementsToDelete))
      }

      // Update existing elements
      if (result.elementsToUpdate) {
        Object.entries(result.elementsToUpdate).forEach(([id, updates]) => {
          dispatch(updateElement({ id, updates }))
        })
      }

      // Add new elements
      if (result.elementsToAdd && result.elementsToAdd.length > 0) {
        result.elementsToAdd.forEach((element) => {
          dispatch(addElement(element))

          // Register component instances with their parent component
          // This ensures the LocalComponent.instanceIds array is updated
          if (element.type === 'component') {
            const componentInstance = element as ComponentInstanceElement
            dispatch(
              registerComponentInstance({
                componentId: componentInstance.componentId,
                instanceId: element.id,
              })
            )
          }
        })
      }

      // Update selection
      if (result.newSelection !== undefined) {
        if (result.newSelection.length === 0) {
          dispatch(clearSelection())
        } else {
          dispatch(setMultiSelection(result.newSelection))
        }
      }

      // Update clipboard state
      if (result.newClipboard) {
        clipboardRef.current = result.newClipboard
      }
    },
    [dispatch]
  )

  // ========================================================================
  // ACTION EXECUTOR - Main function to execute actions
  // ========================================================================

  /**
   * Execute a group action by type.
   *
   * @param type - Action type from GroupActionType
   * @param options - Optional context overrides
   */
  const executeAction = useCallback(
    (type: GroupActionType, options?: { mousePosition?: Point }) => {
      const context = buildContext(options)
      const result = executeRegisteredAction(type, context)

      if (result) {
        applyResult(result)
      }
    },
    [buildContext, applyResult]
  )

  // ========================================================================
  // CAN EXECUTE - Check if action can be executed
  // ========================================================================

  /**
   * Check if an action can be executed given current state.
   * Useful for enabling/disabling menu items.
   */
  const canExecute = useCallback(
    (type: GroupActionType): boolean => {
      const actions = getAllActions()
      const action = actions.find((a) => a.type === type)
      if (!action) return false

      if (action.requiresSelection && selectedIds.length === 0) {
        return false
      }

      if (action.requiresClipboard && clipboardRef.current.items.length === 0) {
        return false
      }

      return true
    },
    [selectedIds]
  )

  // ========================================================================
  // KEYBOARD EVENT HANDLER
  // ========================================================================

  /**
   * Handle keyboard events for shortcuts.
   *
   * Attached to window to capture shortcuts regardless of focus.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      /**
       * Ignore if user has text selected in the browser (e.g., selecting
       * AI response text in the Mochi chat widget). Let Ctrl+C/V pass
       * through to the browser so native copy/paste works on text content.
       */
      const selection = window.getSelection()
      if (selection && selection.toString().length > 0) {
        return
      }

      /**
       * Ignore if the event target is inside the Mochi AI widget.
       * The widget uses a fixed overlay (z-[9999]) and its keyboard
       * events should not be intercepted by the canvas shortcuts.
       */
      if (target.closest('[data-mochi-widget]')) {
        return
      }

      // Find matching shortcut
      for (const shortcut of KEYBOARD_SHORTCUTS) {
        if (matchesShortcut(e, shortcut)) {
          // Prevent default browser behavior (e.g., Ctrl+D bookmark)
          e.preventDefault()
          executeAction(shortcut.action)
          return
        }
      }
    },
    [executeAction]
  )

  // ========================================================================
  // MOUSE POSITION TRACKER
  // ========================================================================

  /**
   * Track mouse position for paste-at-cursor functionality.
   *
   * Converts screen coordinates to canvas coordinates.
   * Now page-aware: uses the active page's viewport.
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const state = store.getState()
      // Get viewport from active page
      const activePageId = state.canvas.pages.activePageId
      const activePage = state.canvas.pages.pages[activePageId]
      const { panX, panY, zoom } = activePage.viewport

      // Convert to canvas coordinates
      mousePositionRef.current = {
        x: (e.clientX - rect.left - panX) / zoom,
        y: (e.clientY - rect.top - panY) / zoom,
      }
    },
    [canvasRef]
  )

  // ========================================================================
  // EVENT LISTENER SETUP
  // ========================================================================

  useEffect(() => {
    // Attach keyboard listener
    window.addEventListener('keydown', handleKeyDown)

    // Attach mouse move listener for paste position
    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [handleKeyDown, handleMouseMove])

  // ========================================================================
  // RETURN
  // ========================================================================

  return {
    executeAction,
    getAvailableActions: getAllActions,
    clipboard: clipboardRef.current,
    canExecute,
  }
}
