/**
 * ============================================================================
 * ELEMENT RENDERERS - Barrel Export
 * ============================================================================
 *
 * SOURCE OF TRUTH: Element Renderer Component Exports
 *
 * ALL element-specific renderers have been migrated to the unified architecture
 * in `../../unified-elements/`. Only the PageElementRenderer remains here as
 * it is a special-case preview wrapper (not a full element renderer).
 *
 * MIGRATED TO UNIFIED:
 * - FrameElementRenderer → unified-elements/unified-frame.tsx
 * - TextElementRenderer → unified-elements/unified-text.tsx
 * - ImageElementRenderer → unified-elements/unified-image.tsx
 * - VideoElementRenderer → unified-elements/unified-video.tsx
 * - ButtonElementRenderer → unified-elements/unified-button.tsx
 * - LinkElementRenderer → unified-elements/unified-link.tsx
 * - AddToCartButtonRenderer → unified-elements/unified-add-to-cart.tsx
 * - CartRenderer → unified-elements/unified-cart.tsx
 * - FormElementRenderer → unified-elements/unified-form.tsx
 * - PaymentElementRenderer → unified-elements/unified-payment.tsx
 * - CheckoutRenderer → unified-elements/unified-checkout.tsx
 * - EcommerceCarouselRenderer → unified-elements/unified-ecommerce-carousel.tsx
 *
 * ============================================================================
 */

// Page element renderer — special-case preview wrapper for page content
// (Not a full element; handles page-level styles, overflow, sticky, etc.)
export { PageElementRenderer } from './page-element-renderer'
