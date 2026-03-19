/**
 * ============================================================================
 * CANVAS - Barrel Export
 * ============================================================================
 *
 * SOURCE OF TRUTH: Canvas Component Exports
 *
 * PUBLIC EXPORTS (used by components outside this folder):
 * - Canvas, CanvasLoader — main canvas + loading state
 * - ResizeHandles — used by non-unified element components (e.g., checkout, cart)
 *
 * INTERNAL ONLY (used within this folder — not re-exported to _components/):
 * - ElementWrapper, CanvasXxxElement wrappers, Rulers, MarqueeSelectionBox,
 *   FrameCreationPreview, CanvasErrorBanner — all consumed by canvas.tsx directly
 *
 * ============================================================================
 */

// Main Canvas Component
export { Canvas } from './canvas'

// Loading State
export { CanvasLoader } from './canvas-loader'

// Resize Controls — used by non-unified canvas elements (checkout, cart, etc.)
export { ResizeHandles } from './resize-handles'
