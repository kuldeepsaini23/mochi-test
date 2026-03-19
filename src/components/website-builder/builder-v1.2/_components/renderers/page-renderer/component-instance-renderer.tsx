/**
 * ============================================================================
 * COMPONENT INSTANCE RENDERER - Thin Dispatcher for Unified Elements
 * ============================================================================
 *
 * SOURCE OF TRUTH: Component Child Rendering Dispatcher
 *
 * This module contains:
 * - ComponentChildRenderer: Recursively renders children within components
 *   by delegating ALL rendering to unified element components.
 *
 * ARCHITECTURE:
 * ComponentChildRenderer is a thin dispatcher — it inspects the element type
 * and delegates to the corresponding unified element. All styling, responsive
 * behavior, gradient borders, and interaction logic live inside each unified
 * element. This eliminates ~1000 lines of duplicated rendering code that
 * previously mirrored the standalone element renderers.
 *
 * CONSUMERS:
 * - unified-component-instance.tsx (preview mode child rendering)
 * - unified-smartcms-list.tsx (preview mode CMS list item rendering)
 *
 * ============================================================================
 */

'use client'

import React from 'react'

/* SOURCE OF TRUTH: Element type interfaces from _lib/types.ts */
import type {
  Breakpoint,
  CanvasElement,
  FrameElement,
  TextElement,
  ImageElement,
  ButtonElement,
  VideoElement,
  LinkElement,
  AddToCartButtonElement,
  CheckoutElement,
  CartElement,
  EcommerceCarouselElement,
  FormElement,
  PaymentElement,
  SmartCmsListElement,
  FaqElement,
  ListElement,
  StickyNoteElement,
  TimerElement,
  ReceiptElement,
  PencilElement,
  ComponentInstanceElement as ComponentInstanceType,
  LocalComponent,
} from '../../../_lib/types'

/* Prebuilt type guards for discriminating prebuilt sub-types */
import {
  isPreBuiltNavbar,
  isPreBuiltSidebar,
  isPreBuiltTotalMembers,
} from '../../../_lib/prebuilt'

/* Unified elements — each handles BOTH canvas and preview rendering modes */
import {
  UnifiedText,
  UnifiedImage,
  UnifiedVideo,
  UnifiedButton,
  UnifiedFrame,
  UnifiedLink,
  UnifiedAddToCart,
  UnifiedCart,
  UnifiedCheckout,
  UnifiedEcommerceCarousel,
  UnifiedForm,
  UnifiedPayment,
  UnifiedComponentInstance,
  UnifiedSmartCmsList,
  UnifiedReceipt,
  UnifiedPencil,
  UnifiedFaq,
  UnifiedList,
  UnifiedStickyNote,
  UnifiedTimer,
  UnifiedPreBuiltNavbar,
  UnifiedPreBuiltSidebar,
  UnifiedPrebuiltTotalMembers,
} from '../../unified-elements'

// ============================================================================
// COMPONENT CHILD RENDERER PROPS
// ============================================================================

export interface ComponentChildRendererProps {
  element: CanvasElement
  childrenMap: Record<string, string[]>
  allElements: CanvasElement[]
  breakpoint: Breakpoint
  /** Local components map for rendering nested component instances */
  components?: Record<string, LocalComponent>
}

/**
 * Renders a single child element from a component's sourceTree by delegating
 * to the appropriate unified element component.
 *
 * This is a thin dispatcher — it determines the element type and hands off
 * ALL rendering responsibility to the unified element. The unified elements
 * handle styling, responsive behavior, gradient borders, and interaction
 * logic internally via RenderModeContext.
 *
 * For container elements (frame, page, link, prebuilt sidebar), children are
 * resolved here and passed as React children so nested recursion continues.
 */
export function ComponentChildRenderer({
  element,
  childrenMap,
  allElements,
  breakpoint,
  components,
}: ComponentChildRendererProps) {
  /* Resolve direct children for container element types */
  const childIds = childrenMap[element.id] || []
  const children = childIds
    .map((id) => allElements.find((el) => el.id === id))
    .filter((el): el is CanvasElement => el !== undefined)

  /* TEXT — unified renderer handles all styling, gradient borders, responsive */
  if (element.type === 'text') {
    return <UnifiedText element={element as TextElement} />
  }

  /* IMAGE — unified renderer handles Next.js Image, objectFit, fade edges */
  if (element.type === 'image') {
    return <UnifiedImage element={element as ImageElement} />
  }

  /* VIDEO — unified renderer handles poster, custom controls */
  if (element.type === 'video') {
    return <UnifiedVideo element={element as VideoElement} />
  }

  /* BUTTON — unified renderer handles link wrapping, CMS dynamic links, icons */
  if (element.type === 'button') {
    return <UnifiedButton element={element as ButtonElement} />
  }

  /* FRAME / PAGE — container element, recursively render children */
  if (element.type === 'frame' || element.type === 'page') {
    return (
      <UnifiedFrame element={element as FrameElement}>
        {children.map((child) => (
          <ComponentChildRenderer
            key={child.id}
            element={child}
            childrenMap={childrenMap}
            allElements={allElements}
            breakpoint={breakpoint}
            components={components}
          />
        ))}
      </UnifiedFrame>
    )
  }

  /* LINK — container element, recursively render children */
  if (element.type === 'link') {
    return (
      <UnifiedLink element={element as LinkElement}>
        {children.map((child) => (
          <ComponentChildRenderer
            key={child.id}
            element={child}
            childrenMap={childrenMap}
            allElements={allElements}
            breakpoint={breakpoint}
            components={components}
          />
        ))}
      </UnifiedLink>
    )
  }

  /* COMPONENT — nested component instance, delegates to unified component */
  if (element.type === 'component') {
    return <UnifiedComponentInstance element={element as ComponentInstanceType} />
  }

  /* ADD TO CART BUTTON — e-commerce add-to-cart with CMS context */
  if (element.type === 'add-to-cart-button') {
    return <UnifiedAddToCart element={element as AddToCartButtonElement} />
  }

  /* CHECKOUT — e-commerce checkout display with cart state */
  if (element.type === 'checkout') {
    return <UnifiedCheckout element={element as CheckoutElement} />
  }

  /* CART — e-commerce cart button with item count badge */
  if (element.type === 'cart') {
    return <UnifiedCart element={element as CartElement} />
  }

  /* ECOMMERCE CAROUSEL — product image gallery */
  if (element.type === 'ecommerce-carousel') {
    return <UnifiedEcommerceCarousel element={element as EcommerceCarouselElement} />
  }

  /* FORM — embedded form element */
  if (element.type === 'form') {
    return <UnifiedForm element={element as FormElement} />
  }

  /* PAYMENT — embedded payment element */
  if (element.type === 'payment') {
    return <UnifiedPayment element={element as PaymentElement} />
  }

  /* RECEIPT — payment confirmation receipt element */
  if (element.type === 'receipt') {
    return <UnifiedReceipt element={element as ReceiptElement} />
  }

  /* PENCIL — SVG freehand drawing element */
  if (element.type === 'pencil') {
    return <UnifiedPencil element={element as PencilElement} />
  }

  /* SMARTCMS LIST — dynamic CMS list */
  if (element.type === 'smartcms-list') {
    return <UnifiedSmartCmsList element={element as SmartCmsListElement} />
  }

  /* FAQ — interactive accordion element */
  if (element.type === 'faq') {
    return <UnifiedFaq element={element as FaqElement} />
  }

  /* LIST — bulleted list with icon bullets */
  if (element.type === 'list') {
    return <UnifiedList element={element as ListElement} />
  }

  /* STICKY NOTE — decorative note element */
  if (element.type === 'sticky-note') {
    return <UnifiedStickyNote element={element as StickyNoteElement} />
  }

  /* TIMER — countdown timer element */
  if (element.type === 'timer') {
    return <UnifiedTimer element={element as TimerElement} />
  }

  /* PREBUILT — use type guards to determine which prebuilt sub-type to render */
  if (element.type === 'prebuilt') {
    if (isPreBuiltNavbar(element)) {
      return <UnifiedPreBuiltNavbar element={element} />
    }
    if (isPreBuiltSidebar(element)) {
      return (
        <UnifiedPreBuiltSidebar element={element}>
          {children.map((child) => (
            <ComponentChildRenderer
              key={child.id}
              element={child}
              childrenMap={childrenMap}
              allElements={allElements}
              breakpoint={breakpoint}
              components={components}
            />
          ))}
        </UnifiedPreBuiltSidebar>
      )
    }
    if (isPreBuiltTotalMembers(element)) {
      return <UnifiedPrebuiltTotalMembers element={element} />
    }
    return null
  }

  /* Unknown element type — return null to avoid rendering errors */
  return null
}
