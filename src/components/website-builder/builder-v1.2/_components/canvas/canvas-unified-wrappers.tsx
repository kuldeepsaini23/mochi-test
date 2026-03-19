/**
 * ============================================================================
 * CANVAS UNIFIED WRAPPERS — Bridge between Unified Elements and ElementWrapper
 * ============================================================================
 *
 * SOURCE OF TRUTH: canvas-unified-wrappers, CanvasTextElement, CanvasImageElement,
 *   CanvasVideoElement, CanvasButtonElement, CanvasFrameElement, CanvasLinkElement,
 *   CanvasAddToCartElement, CanvasCartElement, CanvasFormElement, CanvasPaymentElement,
 *   CanvasComponentInstanceElement, CanvasCheckoutElement, CanvasEcommerceCarouselElement,
 *   CanvasReceiptElement, CanvasListElement, CanvasPreBuiltNavbarElement,
 *   CanvasPreBuiltSidebarElement, CanvasPreBuiltTotalMembersElement
 *
 * These are thin wrapper components that combine:
 * 1. `ElementWrapper` — provides editor chrome (selection, hover, resize, labels, drag)
 * 2. Unified Element — provides content rendering (text, image, video, button)
 * 3. Size computation — each element type computes its own size differently
 *
 * WHY SEPARATE WRAPPERS?
 * ---------------------
 * - ElementWrapper handles ALL shared editor chrome for every element type.
 * - Each unified element renders ONLY its content (no chrome duplication).
 * - These wrappers bridge the two by computing element-specific size styles
 *   and passing them to ElementWrapper as `sizeStyleOverrides`.
 * - For text elements, the `useUnifiedTextMeta` hook manages editing state
 *   that must be shared between ElementWrapper (drag prevention, cursor)
 *   and UnifiedText (contentEditable, formatting shortcuts).
 *
 * USAGE IN canvas.tsx:
 * ```tsx
 * // In renderElement():
 * if (element.type === 'text') {
 *   return <CanvasTextElement key={element.id} element={element} ... />
 * }
 * if (element.type === 'image') {
 *   return <CanvasImageElement key={element.id} element={element} ... />
 * }
 * ```
 *
 * ============================================================================
 */

'use client'

import React, { memo } from 'react'
import type {
  TextElement as TextElementType,
  ImageElement as ImageElementType,
  VideoElement as VideoElementType,
  ButtonElement as ButtonElementType,
  AddToCartButtonElement as AddToCartButtonElementType,
  CartElement as CartElementType,
  FormElement as FormElementType,
  PaymentElement as PaymentElementType,
  FrameElement as FrameElementType,
  PageElement as PageElementType,
  LinkElement as LinkElementType,
  ComponentInstanceElement as ComponentInstanceElementType,
  SmartCmsListElement as SmartCmsListElementType,
  CheckoutElement as CheckoutElementType,
  EcommerceCarouselElement as EcommerceCarouselElementType,
  FaqElement as FaqElementType,
  ListElement as ListElementType,
  StickyNoteElement as StickyNoteElementType,
  TimerElement as TimerElementType,
  ReceiptElement as ReceiptElementType,
  RichTextElement as RichTextElementType,
  PencilElement as PencilElementType,
  ResizeHandle,
} from '../../_lib/types'
import type {
  PreBuiltNavbarElement,
  PreBuiltSidebarElement,
  PreBuiltTotalMembersElement,
  PreBuiltLogoCarouselElement,
} from '../../_lib/prebuilt'
import { getAllowedResizeHandles } from '../../_lib/prebuilt'
/** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
import { useElementSizeStyles } from '../../_lib/shared-element-styles'
import { ElementWrapper } from './element-wrapper'
import {
  UnifiedText,
  useUnifiedTextMeta,
  UnifiedImage,
  UnifiedVideo,
  UnifiedButton,
  UnifiedAddToCart,
  UnifiedCart,
  UnifiedForm,
  UnifiedPayment,
  UnifiedFrame,
  useUnifiedFrameMeta,
  UnifiedLink,
  useUnifiedLinkMeta,
  UnifiedComponentInstance,
  useUnifiedComponentInstanceMeta,
  UnifiedSmartCmsList,
  useUnifiedSmartCmsListMeta,
  UnifiedCheckout,
  UnifiedEcommerceCarousel,
  UnifiedFaq,
  useUnifiedFaqMeta,
  UnifiedList,
  useUnifiedListMeta,
  UnifiedStickyNote,
  useUnifiedStickyNoteMeta,
  UnifiedTimer,
  useUnifiedTimerMeta,
  UnifiedReceipt,
  useUnifiedReceiptMeta,
  UnifiedRichText,
  useUnifiedRichTextMeta,
  UnifiedPencil,
  UnifiedPreBuiltNavbar,
  useUnifiedPreBuiltNavbarMeta,
  UnifiedPreBuiltSidebar,
  useUnifiedPreBuiltSidebarMeta,
  UnifiedPrebuiltTotalMembers,
  UnifiedPrebuiltLogoCarousel,
} from '../unified-elements'
import { BreakpointButton } from '../header'

// ============================================================================
// SHARED CANVAS ELEMENT PROPS — Common props for all canvas wrappers
// ============================================================================

/**
 * Common props that every canvas element wrapper receives from the canvas
 * rendering layer (renderElement function in canvas.tsx).
 *
 * SOURCE OF TRUTH: CanvasElementBaseProps
 *
 * These map 1:1 to the props that ElementWrapper expects for editor chrome.
 */
interface CanvasElementBaseProps {
  /** Whether this element is currently selected */
  isSelected: boolean

  /** Whether this element is currently hovered */
  isHovered: boolean

  /** Whether this element is inside a master component (purple styling) */
  isInsideMaster: boolean

  /** Current viewport zoom level for scaling editor chrome */
  zoom: number

  /** Handler for drag start (from useDrag hook) */
  onDragStart: (e: React.PointerEvent, elementId: string, isModifierHeld?: boolean) => void

  /** Handler for resize start (from useResize hook) */
  onResizeStart: (e: React.PointerEvent, elementId: string, handle: ResizeHandle) => void

  /** Handler for mouse enter hover state */
  onHoverStart: (elementId: string, isModifierHeld: boolean) => void

  /** Handler for mouse leave hover state */
  onHoverEnd: (elementId: string) => void
}

// ============================================================================
// CANVAS TEXT ELEMENT — Uses useUnifiedTextMeta for editing state bridge
// ============================================================================

interface CanvasTextElementProps extends CanvasElementBaseProps {
  /** The text element data from Redux */
  element: TextElementType

  /**
   * Ref containing the ID of an element that should auto-enter edit mode.
   * Set by useTextCreation when the user creates text via the text tool.
   */
  autoEditElementId?: React.RefObject<string | null>
}

/**
 * Canvas wrapper for the unified text element.
 *
 * TEXT IS SPECIAL: It's the only leaf element with inline editing that requires
 * state to be shared between the content component and the editor chrome wrapper.
 * The `useUnifiedTextMeta` hook manages this shared state:
 * - `isEditing` → passed to ElementWrapper (prevents drag, changes cursor)
 * - `isEditing` + `setIsEditing` → passed to UnifiedText (controls contentEditable)
 * - `sizeStyles` → passed to ElementWrapper as sizeStyleOverrides
 *
 * All other elements (image, video, button) don't have this complexity because
 * they don't support inline editing.
 */
export const CanvasTextElement = memo(function CanvasTextElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
  autoEditElementId,
}: CanvasTextElementProps) {
  /**
   * Get shared editing state and computed size styles from the text meta hook.
   * This is the bridge that connects ElementWrapper's isEditing prop
   * with UnifiedText's editing behavior.
   */
  const { sizeStyles, isEditing, setIsEditing } = useUnifiedTextMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      isEditing={isEditing}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedText
        element={element}
        isSelected={isSelected}
        autoEditElementId={autoEditElementId}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS IMAGE ELEMENT — Simple size computation, no editing state
// ============================================================================

interface CanvasImageElementProps extends CanvasElementBaseProps {
  /** The image element data from Redux */
  element: ImageElementType
}

/**
 * Canvas wrapper for the unified image element.
 *
 * Computes image-specific size styles (images default to fixed width/height)
 * and passes them to ElementWrapper. The UnifiedImage component only renders
 * the image content (CSS background-image in canvas mode).
 */
export const CanvasImageElement = memo(function CanvasImageElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasImageElementProps) {
  /**
   * Compute size styles for the image element.
   * Images default to fixed dimensions (autoWidth=false, autoHeight=false).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedImage element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS VIDEO ELEMENT — Simple size computation, no editing state
// ============================================================================

interface CanvasVideoElementProps extends CanvasElementBaseProps {
  /** The video element data from Redux */
  element: VideoElementType
}

/**
 * Canvas wrapper for the unified video element.
 *
 * Computes video-specific size styles (videos default to fixed dimensions)
 * and passes them to ElementWrapper. The UnifiedVideo component renders
 * a static poster/thumbnail with play icon overlay in canvas mode.
 */
export const CanvasVideoElement = memo(function CanvasVideoElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasVideoElementProps) {
  /**
   * Compute size styles for the video element.
   * Videos default to fixed dimensions (autoWidth=false, autoHeight=false).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedVideo element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS BUTTON ELEMENT — Simple size computation, no editing state
// ============================================================================

interface CanvasButtonElementProps extends CanvasElementBaseProps {
  /** The button element data from Redux */
  element: ButtonElementType
}

/**
 * Canvas wrapper for the unified button element.
 *
 * Computes button-specific size styles (buttons default to fixed dimensions)
 * and passes them to ElementWrapper. The UnifiedButton component renders
 * the button content (icon + label with variant styling) in canvas mode.
 */
export const CanvasButtonElement = memo(function CanvasButtonElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasButtonElementProps) {
  /**
   * Compute size styles for the button element.
   * Buttons default to fixed dimensions (autoWidth=false, autoHeight=false).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedButton element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS ADD TO CART ELEMENT — E-commerce add-to-cart button, no editing state
// ============================================================================

interface CanvasAddToCartElementProps extends CanvasElementBaseProps {
  /** The add-to-cart button element data from Redux */
  element: AddToCartButtonElementType
}

/**
 * Canvas wrapper for the unified add-to-cart button element.
 *
 * Computes add-to-cart-specific size styles (defaults to fixed dimensions)
 * and passes them to ElementWrapper. The UnifiedAddToCart component renders
 * the button content (icon + label with variant styling) in canvas mode,
 * plus a CMS context error indicator when applicable.
 */
export const CanvasAddToCartElement = memo(function CanvasAddToCartElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasAddToCartElementProps) {
  /**
   * Compute size styles for the add-to-cart element.
   * Add-to-cart buttons default to fixed dimensions (autoWidth=false, autoHeight=false).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedAddToCart element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS CART ELEMENT — E-commerce cart button, no editing state
// ============================================================================

interface CanvasCartElementProps extends CanvasElementBaseProps {
  /** The cart element data from Redux */
  element: CartElementType
}

/**
 * Canvas wrapper for the unified cart button element.
 *
 * Computes cart-specific size styles (defaults to auto/content-driven sizing)
 * and passes them to ElementWrapper. The UnifiedCart component renders the
 * cart icon button content (shopping bag icon + optional label) in canvas mode.
 */
export const CanvasCartElement = memo(function CanvasCartElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasCartElementProps) {
  /**
   * Compute size styles for the cart element.
   * Cart buttons default to auto-sizing (content-driven: autoWidth=true, autoHeight=true).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedCart element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS FRAME ELEMENT — Container with children, master component, breakpoint
// ============================================================================

interface CanvasFrameElementProps extends CanvasElementBaseProps {
  /** The frame or page element data from Redux */
  element: FrameElementType | PageElementType
  /** Children elements rendered recursively by canvas.tsx renderElement() */
  children?: React.ReactNode
}

/**
 * Canvas wrapper for the unified frame element.
 *
 * FRAMES ARE CONTAINERS: Unlike leaf elements (text, image, video, button),
 * frames render child elements inside them. The children are passed through
 * to UnifiedFrame which handles the flex layout and container wrapper.
 *
 * The `useUnifiedFrameMeta` hook computes frame-specific sizing that accounts
 * for wrap mode (height: 'auto'), scroll mode (overflow: hidden), and
 * autoWidth ('100%' vs fixed). These are passed to ElementWrapper as overrides.
 *
 * Additional frame-specific ElementWrapper props:
 * - `dimensionLabel`: Shows "Fill" for autoWidth, "Auto" for wrap height
 * - `isMasterComponent`: Enables purple styling for master component sources
 * - `allowedHandles`: Pages only allow vertical resize (n/s handles)
 * - `topRightSlot`: BreakpointButton for page elements
 * - `className`: Responsive container query classes
 * - `wrapperStyleOverrides`: Scroll overflow + visibility + responsive overrides
 */
export const CanvasFrameElement = memo(function CanvasFrameElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
  children,
}: CanvasFrameElementProps) {
  /**
   * Get frame-specific sizing, dimension label, and metadata from the hook.
   * This computes everything ElementWrapper needs that's unique to frames.
   */
  const frameMeta = useUnifiedFrameMeta(element)

  /**
   * Allowed resize handles for pages.
   * Pages have no resize handles — their height is auto-driven by content
   * (with minHeight set to the configured page height). Users control page
   * height via the properties panel, not by dragging handles.
   */
  const allowedHandles: ResizeHandle[] | undefined =
    element.type === 'page' ? [] : undefined

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={frameMeta.sizeStyles}
      dimensionLabel={frameMeta.dimensionLabel}
      isMasterComponent={frameMeta.isMasterComponent}
      allowedHandles={allowedHandles}
      className={frameMeta.responsiveClassName || undefined}
      wrapperStyleOverrides={{
        ...frameMeta.responsiveWrapperOverrides,
        ...frameMeta.wrapperOverrides,
      }}
      topRightSlot={
        element.type === 'page' ? (
          <BreakpointButton
            pageElement={element as PageElementType}
            zoom={zoom}
            isSelected={isSelected}
          />
        ) : undefined
      }
    >
      <UnifiedFrame element={element}>{children}</UnifiedFrame>
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS LINK ELEMENT — Navigable container with cyan selection color
// ============================================================================

interface CanvasLinkElementProps extends CanvasElementBaseProps {
  /** The link element data from Redux */
  element: LinkElementType
  /** Children elements rendered recursively by canvas.tsx renderElement() */
  children?: React.ReactNode
}

/**
 * Canvas wrapper for the unified link element.
 *
 * Links are frame-like containers with navigation capability (preview only).
 * On the canvas, they render as styled containers without navigation.
 *
 * KEY VISUAL DISTINCTION: Links use CYAN (#06b6d4) selection color instead
 * of the default blue, making them visually distinct from regular frames.
 * This is achieved via ElementWrapper's `selectionColor` prop.
 *
 * The `useUnifiedLinkMeta` hook computes link sizing (autoWidth, autoHeight,
 * wrap mode) and returns values for the dimensions pill.
 */
export const CanvasLinkElement = memo(function CanvasLinkElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
  children,
}: CanvasLinkElementProps) {
  /**
   * Get link-specific sizing and dimension label from the hook.
   */
  const linkMeta = useUnifiedLinkMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={linkMeta.sizeStyles}
      dimensionLabel={linkMeta.dimensionLabel}
      selectionColor="#06b6d4"
      labelIcon={<span style={{ color: '#06b6d4', marginRight: 4, fontSize: 10 }}>🔗</span>}
      className={linkMeta.responsiveClassName || undefined}
      wrapperStyleOverrides={linkMeta.responsiveWrapperOverrides}
      dataAttributes={{ 'data-link-element': 'true' }}
    >
      <UnifiedLink element={element}>{children}</UnifiedLink>
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS FORM ELEMENT — Embedded form, auto height, no resize handles
// ============================================================================

interface CanvasFormElementProps extends CanvasElementBaseProps {
  /** The form element data from Redux */
  element: FormElementType
}

/**
 * Canvas wrapper for the unified form element.
 *
 * Forms always use autoHeight because form content (field count, validation
 * messages) can change at any time. Fixed height would cause content to be
 * cut off. No resize handles are provided -- forms size themselves.
 *
 * Computes form-specific size styles (autoHeight=true by default) and passes
 * them to ElementWrapper. The UnifiedForm component renders the form content
 * (FormRenderer with disabled inputs, or placeholder states) in canvas mode.
 */
export const CanvasFormElement = memo(function CanvasFormElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasFormElementProps) {
  /**
   * Compute size styles for the form element.
   * Forms default to autoHeight=true (content-driven height) and
   * autoWidth=false (fixed width unless inside a frame).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: true,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      /* Forms always use content-driven height (autoHeight) — vertical resize
         is disabled to prevent users from accidentally switching to fixed height
         which would clip form fields and validation messages */
      allowedHandles={['e', 'w']}
    >
      <UnifiedForm element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS PAYMENT ELEMENT — Embedded payment form, auto height, no resize handles
// ============================================================================

interface CanvasPaymentElementProps extends CanvasElementBaseProps {
  /** The payment element data from Redux */
  element: PaymentElementType
}

/**
 * Canvas wrapper for the unified payment element.
 *
 * Payment forms always use autoHeight because Stripe Elements content changes
 * based on the selected payment method. Fixed height would cause content to be
 * cut off. No resize handles are provided -- payment forms size themselves.
 *
 * Computes payment-specific size styles (autoHeight=true, maxWidth constrained)
 * and passes them to ElementWrapper. The UnifiedPayment component renders a
 * static PaymentFormPreview (mock checkout form) in canvas mode.
 */
export const CanvasPaymentElement = memo(function CanvasPaymentElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasPaymentElementProps) {
  /**
   * Compute size styles for the payment element.
   * Payment forms default to autoHeight=true (content-driven height) and
   * autoWidth=false (fixed width unless inside a frame).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: true,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      /* Payment forms always use content-driven height — vertical resize is
         disabled because Stripe Elements dynamically size based on payment method */
      allowedHandles={['e', 'w']}
    >
      <UnifiedPayment element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS COMPONENT INSTANCE ELEMENT — Composed component with scoped IDs
// ============================================================================

/**
 * Props for the canvas component instance wrapper.
 *
 * SOURCE OF TRUTH: CanvasComponentInstanceElementProps
 *
 * Component instances are SPECIAL compared to other canvas elements:
 * - NO onResizeStart: Instances cannot be resized — size comes from master
 * - NO children: Instances render their own children from the master's sourceTree
 * - Uses purple (#8b5cf6) selection color via selectionColor prop
 * - Size is determined by the master component's root element, not the instance
 *
 * Canvas interaction handlers (onDragStart, onHoverStart, onHoverEnd) are
 * passed through to UnifiedComponentInstance for nested instance interactivity.
 */
interface CanvasComponentInstanceElementProps {
  /** The component instance element data from Redux */
  element: ComponentInstanceElementType

  /** Whether this element is currently selected */
  isSelected: boolean

  /** Whether this element is currently hovered */
  isHovered: boolean

  /** Whether this element is inside a master component (purple styling) */
  isInsideMaster: boolean

  /** Current viewport zoom level for scaling editor chrome */
  zoom: number

  /** Handler for drag start (from useDrag hook) */
  onDragStart: (e: React.PointerEvent, elementId: string, isModifierHeld?: boolean) => void

  /**
   * Handler for resize start — required by ElementWrapper interface but
   * component instances NEVER show resize handles. Size comes from master.
   */
  onResizeStart: (e: React.PointerEvent, elementId: string, handle: ResizeHandle) => void

  /** Handler for mouse enter hover state */
  onHoverStart: (elementId: string, isModifierHeld: boolean) => void

  /** Handler for mouse leave hover state */
  onHoverEnd: (elementId: string) => void
}

/**
 * Canvas wrapper for the unified component instance element.
 *
 * COMPONENT INSTANCES ARE UNIQUE among canvas elements:
 *
 * 1. SIZE FROM MASTER: The instance's rendered size comes from the master
 *    component's sourceTree root element — NOT from the instance's own
 *    width/height. The `useUnifiedComponentInstanceMeta` hook computes
 *    this from the master's sourceTree with propValues applied.
 *
 * 2. NO RESIZE: Instances cannot be resized — they always match the master.
 *    No resize handles are shown (allowedHandles: []).
 *
 * 3. OWN CHILDREN: Unlike frames that receive children from canvas.tsx,
 *    component instances render their own children from the master's
 *    sourceTree. The canvas interaction handlers are passed through so
 *    nested component instances can be selected and dragged.
 *
 * 4. PURPLE STYLING: Uses purple (#8b5cf6) selection/hover color to
 *    visually distinguish component instances from regular frames.
 */
export const CanvasComponentInstanceElement = memo(function CanvasComponentInstanceElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasComponentInstanceElementProps) {
  /**
   * Get instance-specific sizing from the master component's sourceTree.
   * This computes width/height based on the master's root element properties
   * (autoWidth, wrap mode, scroll mode) with propValues applied.
   */
  const instanceMeta = useUnifiedComponentInstanceMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={instanceMeta.sizeStyles}
      dimensionLabel={instanceMeta.dimensionLabel}
      wrapperStyleOverrides={instanceMeta.wrapperOverrides}
      selectionColor="#8b5cf6"
      labelIcon={<span style={{ color: '#8b5cf6', marginRight: 4, fontSize: 10 }}>⬡</span>}
      allowedHandles={[]}
      dataAttributes={{ 'data-component-instance': 'true' }}
    >
      {/**
       * UnifiedComponentInstance renders its own children from the master's
       * sourceTree. Canvas interaction handlers are passed through so nested
       * component instances within composed components can be selected/dragged.
       */}
      <UnifiedComponentInstance
        element={element}
        zoom={zoom}
        onDragStart={onDragStart}
        onHoverStart={onHoverStart}
        onHoverEnd={onHoverEnd}
      />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS SMARTCMS LIST ELEMENT — CMS-driven dynamic list, container with cyan selection
// ============================================================================

interface CanvasSmartCmsListElementProps extends CanvasElementBaseProps {
  /** The SmartCMS list element data from Redux */
  element: SmartCmsListElementType
  /** Children elements rendered recursively by canvas.tsx renderElement() */
  children?: React.ReactNode
}

/**
 * Canvas wrapper for the unified SmartCMS list element.
 *
 * SmartCMS List is a CONTAINER element (like frames):
 * - Accepts children that are passed through to UnifiedSmartCmsList
 * - Uses cyan (#06b6d4) selection color to distinguish from frames (blue)
 *   and components (purple), matching CMS-related element theming
 * - Includes a Database icon label for visual identification
 *
 * The `useUnifiedSmartCmsListMeta` hook computes sizing that accounts
 * for autoWidth ('100%' vs fixed) and autoHeight ('auto' vs fixed).
 * These are passed to ElementWrapper as sizeStyleOverrides.
 */
export const CanvasSmartCmsListElement = memo(function CanvasSmartCmsListElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
  children,
}: CanvasSmartCmsListElementProps) {
  /**
   * Get SmartCMS-list-specific sizing and dimension label from the hook.
   * Computes width/height based on autoWidth and autoHeight settings.
   */
  const listMeta = useUnifiedSmartCmsListMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={listMeta.sizeStyles}
      dimensionLabel={listMeta.dimensionLabel}
      selectionColor="#06b6d4"
      className={listMeta.responsiveClassName || undefined}
      wrapperStyleOverrides={{
        ...listMeta.responsiveWrapperOverrides,
        ...listMeta.wrapperOverrides,
      }}
      dataAttributes={{ 'data-smartcms-list': 'true' }}
    >
      <UnifiedSmartCmsList element={element}>{children}</UnifiedSmartCmsList>
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS CHECKOUT ELEMENT — E-commerce checkout, autoHeight, max-width constraint
// ============================================================================

interface CanvasCheckoutElementProps extends CanvasElementBaseProps {
  /** The checkout element data from Redux */
  element: CheckoutElementType
}

/**
 * Canvas wrapper for the unified checkout element.
 *
 * Checkout elements use autoHeight because checkout content (form fields,
 * cart items, payment element) varies in height. Fixed height would cause
 * content to be cut off. The element width acts as a max-width constraint.
 *
 * Computes checkout-specific size styles (autoHeight=true by default)
 * and passes them to ElementWrapper. The UnifiedCheckout component renders
 * a static mock checkout preview in canvas mode.
 */
export const CanvasCheckoutElement = memo(function CanvasCheckoutElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasCheckoutElementProps) {
  /**
   * Compute size styles for the checkout element.
   * Checkout elements default to autoHeight=true (content-driven height) and
   * autoWidth=false (fixed width unless inside a frame).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: true,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      /* Checkout forms always use content-driven height — vertical resize is
         disabled because checkout content (cart items, payment fields) varies dynamically */
      allowedHandles={['e', 'w']}
    >
      <UnifiedCheckout element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS ECOMMERCE CAROUSEL ELEMENT — Product image carousel, fixed height
// ============================================================================

interface CanvasEcommerceCarouselElementProps extends CanvasElementBaseProps {
  /** The ecommerce carousel element data from Redux */
  element: EcommerceCarouselElementType
}

/**
 * Canvas wrapper for the unified ecommerce carousel element.
 *
 * Ecommerce carousels use fixed height (the user configures the height
 * for the carousel display) and autoWidth when inside frames.
 *
 * Computes carousel-specific size styles (autoWidth when inside a frame,
 * fixed height) and passes them to ElementWrapper. The UnifiedEcommerceCarousel
 * component renders the featured image and thumbnail row in canvas mode.
 *
 * Resize handles are limited to vertical only (n/s) because width is
 * auto (100%) when inside a frame, or a fixed default when on root.
 */
export const CanvasEcommerceCarouselElement = memo(function CanvasEcommerceCarouselElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasEcommerceCarouselElementProps) {
  /**
   * Compute size styles for the ecommerce carousel element.
   * Carousels use autoWidth when inside a frame (fills parent) and
   * fixed height (user-configured carousel height).
   */
  const isRoot = element.parentId === null
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: !isRoot,
    autoHeightDefault: false,
  })

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      allowedHandles={['n', 's']}
    >
      <UnifiedEcommerceCarousel element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// PREBUILT NAVBAR — Canvas wrapper for unified prebuilt navbar element
// ============================================================================

interface CanvasPreBuiltNavbarElementProps extends CanvasElementBaseProps {
  element: PreBuiltNavbarElement
}

/**
 * Canvas wrapper for the unified prebuilt navbar element.
 *
 * Navbar elements don't support resize (no onResizeStart passed).
 * The navbar meta hook provides size style overrides including containerType
 * for @container queries to work on the canvas.
 */
export const CanvasPreBuiltNavbarElement = memo(function CanvasPreBuiltNavbarElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasPreBuiltNavbarElementProps) {
  /** Get size styles and containerType override from the navbar meta hook */
  const navbarMeta = useUnifiedPreBuiltNavbarMeta(element)

  /**
   * Look up allowed resize handles from the registry.
   * Navbar dimensions are content-driven and should not be user-resizable.
   * SOURCE OF TRUTH: PreBuiltResizeControl
   */
  const resizeHandles = getAllowedResizeHandles(element.prebuiltType, element.variant)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={navbarMeta.sizeStyles}
      /** Force high z-index so the navbar renders above sibling frames on canvas.
       *  Normal-flow frames use z-index: auto (no stacking context) so 9999 wins.
       *  SOURCE OF TRUTH: NavbarStickyFix, StackingContextControl */
      wrapperStyleOverrides={{ zIndex: 9999 }}
      dimensionLabel="Navbar"
      allowedHandles={resizeHandles}
    >
      <UnifiedPreBuiltNavbar element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// PREBUILT SIDEBAR — Canvas wrapper for unified prebuilt sidebar element
// ============================================================================

interface CanvasPreBuiltSidebarElementProps extends CanvasElementBaseProps {
  element: PreBuiltSidebarElement
  /** Children to render inside the sidebar inset area */
  children?: React.ReactNode
}

/**
 * Canvas wrapper for the unified prebuilt sidebar element.
 *
 * The sidebar has a two-part layout: sidebar panel (left) + inset frame (right).
 * Children passed here are rendered inside the inset content area.
 * Sidebar elements don't support resize.
 */
export const CanvasPreBuiltSidebarElement = memo(function CanvasPreBuiltSidebarElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
  children,
}: CanvasPreBuiltSidebarElementProps) {
  /** Get size styles from the sidebar meta hook */
  const sidebarMeta = useUnifiedPreBuiltSidebarMeta(element)

  /**
   * Look up allowed resize handles from the registry.
   * Sidebar fills parent/viewport height and should not be user-resizable.
   * SOURCE OF TRUTH: PreBuiltResizeControl
   */
  const resizeHandles = getAllowedResizeHandles(element.prebuiltType, element.variant)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sidebarMeta.sizeStyles}
      dimensionLabel="Sidebar"
      allowedHandles={resizeHandles}
      wrapperStyleOverrides={sidebarMeta.wrapperOverrides}
    >
      <UnifiedPreBuiltSidebar element={element}>
        {children}
      </UnifiedPreBuiltSidebar>
    </ElementWrapper>
  )
})

// ============================================================================
// PREBUILT TOTAL MEMBERS — Canvas wrapper for unified prebuilt total members element
// ============================================================================

interface CanvasPreBuiltTotalMembersElementProps extends CanvasElementBaseProps {
  element: PreBuiltTotalMembersElement
}

/**
 * Canvas wrapper for the unified prebuilt total members element.
 *
 * Simple element: avatar stack + message text. No resize handles needed.
 * Uses useElementSizeStyles for size computation.
 */
export const CanvasPreBuiltTotalMembersElement = memo(function CanvasPreBuiltTotalMembersElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasPreBuiltTotalMembersElementProps) {
  /**
   * Compute size styles for the total members element.
   * Uses autoWidth when the element has it enabled (fit-content behavior).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: element.autoWidth ?? false,
    autoHeightDefault: true,
  })

  /**
   * Look up allowed resize handles from the registry.
   * Total members has fixed content-driven dimensions.
   * SOURCE OF TRUTH: PreBuiltResizeControl
   */
  const resizeHandles = getAllowedResizeHandles(element.prebuiltType, element.variant)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      dimensionLabel="Total Members"
      allowedHandles={resizeHandles}
    >
      <UnifiedPrebuiltTotalMembers element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// PREBUILT LOGO CAROUSEL — Canvas wrapper for unified prebuilt logo carousel
// ============================================================================

interface CanvasPreBuiltLogoCarouselElementProps extends CanvasElementBaseProps {
  element: PreBuiltLogoCarouselElement
}

/**
 * Canvas wrapper for the unified prebuilt logo carousel element.
 *
 * Displays a horizontal strip of logos. Users cannot select or delete
 * individual logos — the element is locked and managed via Settings panel.
 */
export const CanvasPreBuiltLogoCarouselElement = memo(function CanvasPreBuiltLogoCarouselElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasPreBuiltLogoCarouselElementProps) {
  /**
   * Compute size styles for the logo carousel element.
   * autoWidth follows the element's setting (fills parent when true).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: element.autoWidth ?? false,
    autoHeightDefault: false,
  })

  /**
   * Look up allowed resize handles from the registry.
   * Logo carousel has fixed content-driven dimensions.
   * SOURCE OF TRUTH: PreBuiltResizeControl
   */
  const resizeHandles = getAllowedResizeHandles(element.prebuiltType, element.variant)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      dimensionLabel="Logo Carousel"
      allowedHandles={resizeHandles}
    >
      <UnifiedPrebuiltLogoCarousel element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS FAQ ELEMENT — Collapsible Q&A accordion
// ============================================================================

interface CanvasFaqElementProps extends CanvasElementBaseProps {
  /** The FAQ element data from Redux */
  element: FaqElementType
}

/**
 * Canvas wrapper for the unified FAQ element.
 *
 * FAQ elements default to auto-width (fill parent) and auto-height (grow with
 * content). Uses useUnifiedFaqMeta for size computation.
 */
export const CanvasFaqElement = memo(function CanvasFaqElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasFaqElementProps) {
  /**
   * Compute size styles via FAQ meta hook.
   * FAQ defaults to autoWidth=true and autoHeight=true since content
   * length is variable and the element should grow with its items.
   */
  const { sizeStyles } = useUnifiedFaqMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      /* FAQ sizes itself automatically via autoWidth/autoHeight + maxWidth/minWidth
         constraints. Resize handles are disabled — users control width via the
         properties panel dimension input, not by dragging. */
      allowedHandles={[]}
    >
      <UnifiedFaq element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS STICKY NOTE ELEMENT — Editable note with corner curl
// ============================================================================

interface CanvasStickyNoteElementProps extends CanvasElementBaseProps {
  /** The sticky note element data from Redux */
  element: StickyNoteElementType
}

/**
 * Canvas wrapper for the unified sticky note element.
 *
 * STICKY NOTES USE TEXT EDITING: Like CanvasTextElement, this wrapper uses
 * useUnifiedStickyNoteMeta to share isEditing state between ElementWrapper
 * (prevents drag during edit, changes cursor) and UnifiedStickyNote
 * (controls contentEditable, text save on blur).
 */
export const CanvasStickyNoteElement = memo(function CanvasStickyNoteElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasStickyNoteElementProps) {
  /**
   * Get shared editing state and computed size styles from the sticky note meta hook.
   * isEditing bridges ElementWrapper (drag prevention, cursor) with
   * UnifiedStickyNote (contentEditable, blur save).
   */
  const { sizeStyles, isEditing, setIsEditing } =
    useUnifiedStickyNoteMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      isEditing={isEditing}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedStickyNote
        element={element}
        isSelected={isSelected}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS TIMER ELEMENT — Countdown timer with step animation
// ============================================================================

interface CanvasTimerElementProps extends CanvasElementBaseProps {
  /** The timer element data from Redux */
  element: TimerElementType
}

/**
 * Canvas wrapper for the unified timer element.
 *
 * SOURCE OF TRUTH: CanvasTimerElement, timer-canvas-wrapper
 *
 * Timer elements default to auto-width (fill parent) and auto-height (grow
 * with content). No resize handles — timer sizes itself automatically based
 * on digit size, segment count, and padding.
 */
export const CanvasTimerElement = memo(function CanvasTimerElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasTimerElementProps) {
  /**
   * Compute size styles via timer meta hook.
   * Timer defaults to autoWidth=true and autoHeight=true since content
   * size depends on digit font size and segment configuration.
   */
  const { sizeStyles } = useUnifiedTimerMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      /* Timer sizes itself automatically — no drag resize handles needed */
      allowedHandles={[]}
    >
      <UnifiedTimer element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS RECEIPT ELEMENT — Payment receipt display, autoHeight, no vertical resize
// ============================================================================

interface CanvasReceiptElementProps extends CanvasElementBaseProps {
  /** The receipt element data from Redux */
  element: ReceiptElementType
}

/**
 * Canvas wrapper for the unified receipt element.
 *
 * Receipt elements use autoHeight because receipt content (payment amount,
 * line items, dates) varies in height based on transaction data. Fixed height
 * would cause content cutoff. The element width acts as a max-width constraint.
 *
 * Resize handles are limited to horizontal (e/w) since height is content-driven.
 */
export const CanvasReceiptElement = memo(function CanvasReceiptElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasReceiptElementProps) {
  /**
   * Compute size styles for the receipt element.
   * Receipt elements default to autoHeight=true (content-driven height) and
   * autoWidth=false (fixed width unless inside a frame).
   */
  const { sizeStyles } = useUnifiedReceiptMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
      /* Receipt always uses content-driven height — vertical resize is
         disabled because content varies dynamically based on transaction data */
      allowedHandles={['e', 'w']}
    >
      <UnifiedReceipt element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS RICH TEXT ELEMENT — Full Lexical editor in website builder
// ============================================================================

interface CanvasRichTextElementProps extends CanvasElementBaseProps {
  /** The rich text element data from Redux */
  element: RichTextElementType

  /**
   * Ref containing the ID of an element that should auto-enter edit mode.
   * When the ref's current value matches this element's ID, editing starts.
   */
  autoEditElementId?: React.RefObject<string | null>
}

/**
 * Canvas wrapper for the unified rich text element.
 *
 * RICH TEXT USES LEXICAL EDITING: Like CanvasStickyNoteElement, this wrapper
 * uses useUnifiedRichTextMeta to share isEditing state between ElementWrapper
 * (prevents drag during edit, changes cursor) and UnifiedRichText
 * (toggles between ContentPreview and full RichTextEditor).
 */
export const CanvasRichTextElement = memo(function CanvasRichTextElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
  autoEditElementId,
}: CanvasRichTextElementProps) {
  /**
   * Get shared editing state and computed size styles from the rich text meta hook.
   * isEditing bridges ElementWrapper (drag prevention, cursor) with
   * UnifiedRichText (ContentPreview vs RichTextEditor toggle).
   */
  const { sizeStyles, isEditing, setIsEditing } =
    useUnifiedRichTextMeta(element)

  /**
   * Auto-enter editing mode when this element was just dropped from sidebar.
   * Lets user start typing immediately without double-clicking.
   * Reads from the ref's .current value (same pattern as CanvasTextElement).
   */
  React.useEffect(() => {
    if (autoEditElementId?.current === element.id) {
      setIsEditing(true)
    }
  }, [autoEditElementId, element.id, setIsEditing])

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      isEditing={isEditing}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedRichText
        element={element}
        isSelected={isSelected}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS PENCIL ELEMENT — SVG freehand drawing wrapper
// ============================================================================

interface CanvasPencilElementProps extends CanvasElementBaseProps {
  /** The pencil element data from Redux */
  element: PencilElementType
}

/**
 * Canvas wrapper for the unified pencil element.
 *
 * SOURCE OF TRUTH: CanvasPencilElement, pencil-canvas-wrapper
 *
 * Pencil elements are simple SVG drawings — no inline editing state.
 * ElementWrapper provides selection, resize handles, and drag; UnifiedPencil
 * renders the SVG path content. Size styles are computed from the element's
 * explicit width/height (autoWidth and autoHeight are always false for pencil).
 */
export const CanvasPencilElement = memo(function CanvasPencilElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasPencilElementProps) {
  /** Compute responsive size styles for the element wrapper */
  const sizeStyles = useElementSizeStyles(element, 'desktop')

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedPencil element={element} />
    </ElementWrapper>
  )
})

// ============================================================================
// CANVAS LIST ELEMENT — Bulleted list with configurable icon bullets
// ============================================================================

interface CanvasListElementProps extends CanvasElementBaseProps {
  /** The list element data from Redux */
  element: ListElementType
}

/**
 * Canvas wrapper for the unified list element.
 *
 * List elements default to autoWidth=true (fill parent) and autoHeight=true
 * (grow with content). Uses useUnifiedListMeta for size computation.
 */
export const CanvasListElement = memo(function CanvasListElement({
  element,
  isSelected,
  isHovered,
  isInsideMaster,
  zoom,
  onDragStart,
  onResizeStart,
  onHoverStart,
  onHoverEnd,
}: CanvasListElementProps) {
  /**
   * Compute size styles via list meta hook.
   * List defaults to autoWidth=true and autoHeight=true since content
   * length is variable and the element should grow with its items.
   */
  const { sizeStyles } = useUnifiedListMeta(element)

  return (
    <ElementWrapper
      element={element}
      isSelected={isSelected}
      isHovered={isHovered}
      isInsideMaster={isInsideMaster}
      zoom={zoom}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      sizeStyleOverrides={sizeStyles}
    >
      <UnifiedList element={element} />
    </ElementWrapper>
  )
})
