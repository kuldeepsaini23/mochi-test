/**
 * ============================================================================
 * REDUX STORE CONFIGURATION
 * ============================================================================
 *
 * This file configures the Redux store for the canvas builder.
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE REMINDER
 * ============================================================================
 *
 * This Redux store is the SINGLE SOURCE OF TRUTH for:
 * - Element data (position, size, style, hierarchy)
 * - Selection state
 * - Viewport (pan, zoom)
 * - Tool mode
 * - Undo/redo history
 *
 * HOWEVER, during 60fps interactions (drag, resize), use REFS instead:
 * - Drag position → useRef (see useDrag hook)
 * - Resize dimensions → useRef (see useResize hook)
 * - DOM transforms → Direct DOM manipulation
 *
 * Only dispatch to Redux when interaction COMPLETES!
 *
 * ============================================================================
 * STORE STRUCTURE
 * ============================================================================
 *
 * {
 *   canvas: {
 *     canvas: {
 *       elements: Record<string, CanvasElement>,  // O(1) lookup
 *       rootIds: string[],                         // Root element IDs
 *       childrenMap: Record<string, string[]>,     // O(1) children lookup
 *     },
 *     viewport: { panX, panY, zoom },
 *     selection: { selectedId },
 *     toolMode: 'select' | 'frame',
 *     history: { past, future, maxSize },
 *   }
 * }
 * ============================================================================
 */

import { configureStore } from '@reduxjs/toolkit'
import canvasReducer from './canvas-slice'
import stagingReducer from './staging-slice'

/**
 * Configure the Redux store.
 *
 * Using Redux Toolkit's configureStore which:
 * - Automatically sets up Redux DevTools
 * - Includes redux-thunk middleware
 * - Enables development checks for common mistakes
 */
export const store = configureStore({
  reducer: {
    /**
     * Canvas slice - contains ALL builder state.
     *
     * This is the SINGLE SOURCE OF TRUTH.
     * Access via selectors in canvas-slice.ts
     */
    canvas: canvasReducer,
    /**
     * Staging slice - holds AI-generated elements before they are
     * transferred to the page canvas via drag-and-drop.
     *
     * Elements land here by default; only bypass to canvas when the
     * user explicitly requests direct placement (above/below selection).
     */
    staging: stagingReducer,
  },
  /**
   * Middleware configuration.
   *
   * Disabling serializable check for development speed.
   * In production, you may want to enable this.
   */
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * RootState type - inferred from store.
 * Use this when typing useSelector hooks.
 *
 * Example:
 * const zoom = useSelector((state: RootState) => state.canvas.viewport.zoom)
 */
export type RootState = ReturnType<typeof store.getState>

/**
 * AppDispatch type - for typing useDispatch.
 *
 * Example:
 * const dispatch = useDispatch<AppDispatch>()
 * dispatch(addElement(newElement))
 */
export type AppDispatch = typeof store.dispatch

// ============================================================================
// TYPED HOOKS (optional but recommended)
// ============================================================================
// These would typically go in a separate hooks file, but included here
// for completeness. They provide type-safe access to the store.
// ============================================================================

import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux'

/**
 * Typed version of useDispatch.
 *
 * Use this instead of plain useDispatch for type safety.
 *
 * Example:
 * const dispatch = useAppDispatch()
 * dispatch(setSelection('element-1'))
 */
export const useAppDispatch = () => useDispatch<AppDispatch>()

/**
 * Typed version of useSelector.
 *
 * Use this instead of plain useSelector for type safety.
 *
 * Example:
 * const selectedId = useAppSelector(selectSelectedId)
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
