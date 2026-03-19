/**
 * ============================================================================
 * UNIFIED ELEMENTS - Barrel Export
 * ============================================================================
 *
 * SOURCE OF TRUTH: Unified Element Component Exports
 *
 * Unified elements are components that work in BOTH the canvas editor and
 * the preview/published rendering modes. This eliminates the old pattern of
 * maintaining separate "elements" (editor) and "renderers" (preview) for each
 * element type — a single component handles both contexts.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * Each unified element receives its rendering mode via `RenderModeContext`:
 *
 *   - "canvas"  -> Interactive editor mode with selection, drag, resize, etc.
 *   - "preview" -> Read-only mode used for live preview and published sites.
 *
 * The component internally branches on the mode to include or exclude editor
 * interactivity (e.g., click handlers, selection outlines, resize handles).
 * Shared logic like style computation, content rendering, and responsive
 * behavior lives once in the unified component — no duplication.
 *
 * ============================================================================
 * MIGRATION STATUS
 * ============================================================================
 *
 * Elements will be exported here as they are migrated from the split
 * elements/renderers pattern into the unified architecture. Each migration
 * replaces an element + renderer pair with a single unified component.
 *
 * ============================================================================
 */

// --- Unified element exports ---
export { UnifiedText, useUnifiedTextMeta } from './unified-text'
export type { UnifiedTextProps } from './unified-text'
export { UnifiedFrame, useUnifiedFrameMeta } from './unified-frame'
export type { UnifiedFrameProps } from './unified-frame'
export { UnifiedImage } from './unified-image'
export { UnifiedButton } from './unified-button'
export { UnifiedVideo } from './unified-video'
export { UnifiedLink, useUnifiedLinkMeta } from './unified-link'
export type { UnifiedLinkProps } from './unified-link'
export { UnifiedAddToCart } from './unified-add-to-cart'
export { UnifiedCart } from './unified-cart'
export { UnifiedForm } from './unified-form'
export { UnifiedPayment } from './unified-payment'
export {
  UnifiedComponentInstance,
  useUnifiedComponentInstanceMeta,
} from './unified-component-instance'
export type { UnifiedComponentInstanceProps } from './unified-component-instance'
export {
  UnifiedSmartCmsList,
  useUnifiedSmartCmsListMeta,
} from './unified-smartcms-list'
export type { UnifiedSmartCmsListProps } from './unified-smartcms-list'
export { UnifiedCheckout } from './unified-checkout'
export { UnifiedEcommerceCarousel } from './unified-ecommerce-carousel'
export { UnifiedFaq, useUnifiedFaqMeta } from './unified-faq'
export type { UnifiedFaqProps } from './unified-faq'
export { UnifiedStickyNote, useUnifiedStickyNoteMeta } from './unified-sticky-note'
export type { UnifiedStickyNoteProps } from './unified-sticky-note'
export { UnifiedTimer, useUnifiedTimerMeta } from './unified-timer'
export type { UnifiedTimerProps } from './unified-timer'
export { UnifiedReceipt, useUnifiedReceiptMeta } from './unified-receipt'
export { UnifiedRichText, useUnifiedRichTextMeta } from './unified-rich-text'
export type { UnifiedRichTextProps } from './unified-rich-text'
export { UnifiedPencil } from './unified-pencil'
export type { UnifiedPencilProps } from './unified-pencil'
export { UnifiedList, useUnifiedListMeta } from './unified-list'
export type { UnifiedListProps } from './unified-list'

// --- Unified prebuilt element exports ---
export {
  UnifiedPreBuiltNavbar,
  useUnifiedPreBuiltNavbarMeta,
} from './unified-prebuilt-navbar'
export type { UnifiedPreBuiltNavbarProps } from './unified-prebuilt-navbar'
export {
  UnifiedPreBuiltSidebar,
  useUnifiedPreBuiltSidebarMeta,
} from './unified-prebuilt-sidebar'
export type { UnifiedPreBuiltSidebarProps } from './unified-prebuilt-sidebar'
export { UnifiedPrebuiltTotalMembers } from './unified-prebuilt-total-members'
export type { UnifiedPrebuiltTotalMembersProps } from './unified-prebuilt-total-members'
export { UnifiedPrebuiltLogoCarousel } from './unified-prebuilt-logo-carousel'
export type { UnifiedPrebuiltLogoCarouselProps } from './unified-prebuilt-logo-carousel'
