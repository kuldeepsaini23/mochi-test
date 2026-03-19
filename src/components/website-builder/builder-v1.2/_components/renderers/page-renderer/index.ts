/**
 * ============================================================================
 * PAGE RENDERER - Barrel Export
 * ============================================================================
 *
 * SOURCE OF TRUTH: Page Renderer Types and Utilities
 *
 * Exports types and utility functions for the page renderer component.
 *
 * ARCHITECTURE:
 * - ComponentChildRenderer is a thin dispatcher that delegates ALL rendering
 *   to unified elements. Used by unified-component-instance and unified-smartcms-list
 *   for rendering children within component sourceTrees (preview mode).
 *
 * MIGRATED TO UNIFIED (old files deleted):
 * - PreBuiltNavbarRenderer → unified-elements/unified-prebuilt-navbar.tsx
 * - PreBuiltSidebarRenderer → unified-elements/unified-prebuilt-sidebar.tsx
 * - PreBuiltTotalMembersRenderer → unified-elements/unified-prebuilt-total-members.tsx
 * - ComponentInstanceRenderer → unified-elements/unified-component-instance.tsx
 * - SmartCmsListRenderer → unified-elements/unified-smartcms-list.tsx
 *
 * ============================================================================
 */

// Types
export type { PageRendererProps, ElementRendererProps, LookupStructures } from './types'

// Utilities
export { resolveNavigationHref, buildLookupStructures } from './utils'

// Component Child Renderer (thin dispatcher used by unified-component-instance and unified-smartcms-list)
export type { ComponentChildRendererProps } from './component-instance-renderer'
export { ComponentChildRenderer } from './component-instance-renderer'
