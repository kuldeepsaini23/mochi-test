/**
 * ============================================================================
 * CANVAS BUILDER - Hook Exports
 * ============================================================================
 *
 * Central export file for all custom hooks.
 *
 * ============================================================================
 * ARCHITECTURE REMINDER (repeated for visibility)
 * ============================================================================
 *
 * ALL hooks in this folder follow the HYBRID STATE pattern:
 *
 * 1. REFS for 60fps interaction state
 *    - Updated on every pointer move
 *    - NO React re-renders during interactions
 *
 * 2. REDUX for persistent data
 *    - Dispatched ONLY when interaction ENDS
 *    - Causes single re-render to sync UI
 *
 * 3. DIRECT DOM for visual feedback
 *    - Transforms, opacity during drag
 *    - Preview rectangles, overlays
 *
 * ============================================================================
 * HOOK OVERVIEW
 * ============================================================================
 *
 * useDrag: Element dragging with sorting and reparenting
 *          → Ref: drag position, drop target, sort index
 *          → Redux: moveElement, reorderElement on drop
 *
 * useResize: Element resizing via corner/edge handles
 *            → Ref: resize dimensions
 *            → Redux: updateElement on release
 *
 * useFrameCreation: Drawing new frames via click-and-drag
 *                   → Ref: creation bounds
 *                   → Redux: addElement on release
 *
 * useMarqueeSelection: Rubber band selection for multiple elements
 *                      → Ref: marquee bounds during drag
 *                      → Redux: setMultiSelection on release
 *
 * useGroupActions: Group operations (delete, copy, paste, etc.)
 *                  → Keyboard shortcuts and action execution
 *                  → Redux: batch element operations
 *
 * useAutoSave: Background persistence to database
 *              → Debounced saves on Redux state changes
 *              → Error handling with banner display
 *              → Retry logic for transient failures
 *
 * useComponentAutoSave: LocalComponent persistence to database
 *                       → Watches localComponents in Redux
 *                       → Syncs sourceTree changes when master component edited
 *                       → Independent debouncing per component
 *
 * useMasterComponentSync: Master frame → sourceTree sync
 *                         → Watches canvas elements for master frame changes
 *                         → Rebuilds sourceTree when master or descendants change
 *                         → Triggers useComponentAutoSave to persist to database
 *
 * ============================================================================
 */

export { useDrag } from './use-drag'
export { useResize } from './use-resize'
export { useFrameCreation } from './use-frame-creation'
export { useTextCreation } from './use-text-creation'
export { useMarqueeSelection } from './use-marquee-selection'
export { useGroupActions } from './use-group-actions'
export { useAutoSave } from './use-auto-save'
export type { SaveStatus, SaveError } from './use-auto-save'
export { useComponentAutoSave } from './use-component-auto-save'
export { useMasterComponentSync } from './use-master-component-sync'
export { useBreakpoint } from './use-breakpoint'

export { usePencilCreation } from './use-pencil-creation'
export type { PencilDrawingPreview } from './use-pencil-creation'
