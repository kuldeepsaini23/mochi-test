/**
 * ============================================================================
 * USE TEXT CREATION - Click-to-Create Text Elements Hook
 * ============================================================================
 *
 * Handles creating new text elements on canvas via single click when in
 * 'text' tool mode (T shortcut).
 *
 * ============================================================================
 * BEHAVIOR
 * ============================================================================
 *
 * When text tool is active:
 * 1. Cursor changes to 'text' (I-beam)
 * 2. Click anywhere on canvas background
 * 3. Text element is created at click position
 * 4. Element is auto-selected
 * 5. Element immediately enters edit mode (contentEditable active)
 * 6. Tool switches back to 'select' mode
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * Unlike useFrameCreation (click-and-drag), this is a simple click handler:
 * - No refs needed for 60fps tracking (single click, not continuous)
 * - Dispatches to Redux immediately on click
 * - Returns a flag to signal the TextElement should auto-enter edit mode
 *
 * The auto-edit signaling works via a ref that stores the ID of the newly
 * created element. The TextElement component checks this ref on mount and
 * auto-enters edit mode if its ID matches.
 *
 * ============================================================================
 */

import React, { useCallback, useRef, useState, useEffect } from 'react'
import {
  useAppDispatch,
  useAppSelector,
  selectViewport,
  selectToolMode,
  addElement,
  setSelection,
  setToolMode,
  generateElementId,
} from '../_lib'
import type { TextElement } from '../_lib/types'
import { DEFAULT_TEXT_PROPS, DEFAULT_TEXT_STYLES } from '../_lib/types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default width for newly created text elements */
const DEFAULT_TEXT_WIDTH = 200

/** Default height for newly created text elements */
const DEFAULT_TEXT_HEIGHT = 40

// ============================================================================
// TYPES
// ============================================================================

interface UseTextCreationOptions {
  /** Ref to canvas container for coordinate transforms */
  canvasRef: React.RefObject<HTMLDivElement>
}

interface UseTextCreationReturn {
  /**
   * Handler for canvas pointer down (creates text on click).
   * Should be called from the canvas background pointer down handler
   * when toolMode is 'text'.
   */
  handleTextCreationClick: (e: React.PointerEvent) => void

  /**
   * ID of element that should auto-enter edit mode.
   * TextElement components check this on mount to auto-focus.
   * Reset to null after the element has been rendered.
   */
  autoEditElementId: React.MutableRefObject<string | null>

  /**
   * Flag that's true briefly after text creation completes.
   * Used to prevent the canvas click handler from clearing selection
   * immediately after creating a text element.
   *
   * WHY THIS IS NEEDED:
   * - Text creation happens on pointerdown
   * - The click event fires AFTER pointerdown
   * - Without this flag, click would clear selection and trigger blur
   * - Blur would exit edit mode immediately after entering it
   *
   * This follows the same pattern as justFinishedSelecting in useMarqueeSelection.
   */
  justCreatedText: boolean
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for handling text element creation via single click.
 *
 * USAGE:
 * ```tsx
 * const { handleTextCreationClick, autoEditElementId } = useTextCreation({
 *   canvasRef
 * })
 *
 * // In canvas pointerdown handler:
 * if (toolMode === 'text') {
 *   handleTextCreationClick(e)
 * }
 *
 * // Pass autoEditElementId to TextElement:
 * <TextElement autoEditElementId={autoEditElementId} ... />
 * ```
 */
export function useTextCreation({
  canvasRef,
}: UseTextCreationOptions): UseTextCreationReturn {
  const dispatch = useAppDispatch()
  const viewport = useAppSelector(selectViewport)
  const toolMode = useAppSelector(selectToolMode)

  // ========================================================================
  // REFS
  // ========================================================================

  /**
   * ID of the element that should auto-enter edit mode on mount.
   *
   * WHY A REF?
   * - The TextElement needs to know it should auto-edit on mount
   * - This happens across component boundaries (Canvas -> TextElement)
   * - A ref persists the value without causing re-renders
   * - The TextElement clears this ref after entering edit mode
   */
  const autoEditElementId = useRef<string | null>(null)

  // ========================================================================
  // STATE - For preventing click handler race condition
  // ========================================================================

  /**
   * Flag that's true briefly after text creation.
   * Prevents the canvas click handler from clearing selection.
   *
   * RACE CONDITION EXPLANATION:
   * 1. pointerdown fires → we create the text element and select it
   * 2. click fires (after pointerdown) → would normally clear selection
   * 3. Selection cleared → useEffect in TextElement sees isSelected=false
   * 4. That useEffect calls handleBlur() → exits edit mode immediately
   *
   * This flag blocks step 2 from clearing selection.
   */
  const [justCreatedText, setJustCreatedText] = useState(false)

  /**
   * Reset the justCreatedText flag after a short delay.
   * The delay must be long enough for the click event to fire and be blocked.
   */
  useEffect(() => {
    if (justCreatedText) {
      const timer = setTimeout(() => {
        setJustCreatedText(false)
      }, 100) // 100ms is enough for click to fire after pointerdown
      return () => clearTimeout(timer)
    }
  }, [justCreatedText])

  // ========================================================================
  // COORDINATE HELPERS
  // ========================================================================

  /**
   * Convert screen coordinates to canvas coordinates.
   * Accounts for viewport pan and zoom.
   */
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
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

  // ========================================================================
  // CLICK HANDLER
  // ========================================================================

  /**
   * Create a text element at the clicked position.
   *
   * FLOW:
   * 1. Convert click position to canvas coordinates
   * 2. Create new text element with default size and content
   * 3. Dispatch addElement to Redux
   * 4. Set the new element as selected
   * 5. Store the ID for auto-edit signaling
   * 6. Switch back to select tool
   */
  const handleTextCreationClick = useCallback(
    (e: React.PointerEvent) => {
      // Safety check - only works in text mode
      if (toolMode !== 'text') return

      // Only handle direct canvas clicks, not element clicks
      const target = e.target as HTMLElement
      if (target.closest('[data-element-id]')) return

      e.preventDefault()
      e.stopPropagation()

      // Get click position in canvas coordinates
      const clickPos = screenToCanvas(e.clientX, e.clientY)

      // Generate unique ID for the new element
      const newId = generateElementId()

      // Create the new text element
      const newElement: TextElement = {
        id: newId,
        type: 'text',
        name: 'Text',
        x: clickPos.x,
        y: clickPos.y,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT,
        parentId: null, // Created at root level
        order: 0, // Will be set correctly by reducer
        visible: DEFAULT_TEXT_PROPS.visible,
        locked: DEFAULT_TEXT_PROPS.locked,
        container: DEFAULT_TEXT_PROPS.container,
        content: DEFAULT_TEXT_PROPS.content,
        autoHeight: DEFAULT_TEXT_PROPS.autoHeight,
        autoWidth: DEFAULT_TEXT_PROPS.autoWidth,
        // Typography is now stored in styles (see DEFAULT_TEXT_STYLES)
        styles: { ...DEFAULT_TEXT_STYLES },
      }

      // Dispatch to Redux - add element and select it
      dispatch(addElement(newElement))
      dispatch(setSelection(newId))

      // Signal that this element should auto-enter edit mode
      // The TextElement component will check this ref on mount
      autoEditElementId.current = newId

      // Set flag to prevent click handler from clearing selection
      // This blocks the race condition where click fires after pointerdown
      setJustCreatedText(true)

      // Switch back to select tool (standard behavior after element creation)
      dispatch(setToolMode('select'))
    },
    [dispatch, screenToCanvas, toolMode]
  )

  return {
    handleTextCreationClick,
    autoEditElementId,
    justCreatedText,
  }
}
