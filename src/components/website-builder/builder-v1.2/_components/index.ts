/**
 * ============================================================================
 * CANVAS BUILDER - Component Exports
 * ============================================================================
 *
 * Central export file for all UI components in the website builder.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The builder uses a UNIFIED RENDERER pattern where each element type has
 * ONE component that handles both canvas (editor) and preview (published) modes.
 *
 * Unified elements live in `./unified-elements/` and use `useRenderMode()` to
 * detect which mode they're in. Canvas wrappers in `./canvas/canvas-unified-wrappers.tsx`
 * bridge unified elements with `ElementWrapper` for editor chrome.
 *
 * ALL element types (including prebuilts) have been fully migrated to unified.
 *
 * ============================================================================
 */

// Canvas Components
export { Canvas, CanvasLoader, ResizeHandles } from './canvas'

// All element types have been migrated to unified-elements/
// Canvas wrappers are in canvas/canvas-unified-wrappers.tsx
// Preview rendering uses unified elements directly via page-renderer.tsx

// Header Components
export { BuilderHeader, BreakpointButton, BreakpointMobileFrame } from './header'

// UI Components
export { Toolbar } from './toolbar'
export { Sidebar } from './sidebar'
export { PropertiesPanel } from './properties-panel'

// Overlay Components
export { PreviewOverlay, GradientBorderOverlay, useGradientBorder } from './overlay'

// Page Renderers
export { PageRenderer, type PageRendererProps } from './page-renderer'
export { ResponsivePageRenderer, type ResponsivePageRendererProps } from './responsive-page-renderer'

// All prebuilt elements migrated to unified-elements/
// Canvas wrappers: CanvasPreBuiltNavbarElement, CanvasPreBuiltSidebarElement, CanvasPreBuiltTotalMembersElement
// Preview rendering uses UnifiedPreBuiltNavbar, UnifiedPreBuiltSidebar, UnifiedPrebuiltTotalMembers

