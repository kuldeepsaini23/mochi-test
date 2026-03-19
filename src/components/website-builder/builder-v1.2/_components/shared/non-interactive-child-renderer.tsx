/**
 * ============================================================================
 * NON-INTERACTIVE CHILD RENDERER -- Shared canvas-mode child element rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: NonInteractiveChildRenderer, canvas-child-rendering, component-child-canvas
 *
 * Renders component sourceTree children on the canvas using unified elements.
 * Each element is wrapped in ChildPositionWrapper which delegates to the SAME
 * shared utilities (computeElementPositionStyles, computeElementSizeStyles,
 * computeFrameSizing) used by ElementWrapper and preview-mode unified elements.
 * This guarantees component instance children render identically to the master.
 *
 * POSITIONING:
 * computeElementPositionStyles handles position (absolute/relative), left/top
 * (with CSS centering), transform (rotation), zIndex, and margin.
 *
 * SIZING:
 * computeElementSizeStyles handles autoWidth ('100%' vs fixed), autoHeight
 * ('auto' vs fixed), and flex distribution (flex: 1 1 0%) for row parents.
 * For frames, computeFrameSizing adds wrap-mode auto-height and scroll support.
 *
 * Used by:
 * - unified-component-instance.tsx (CanvasChildRenderer for non-component types)
 * - unified-smartcms-list.tsx (canvas preview of component items)
 *
 * IMPORTANT: This renderer does NOT handle the 'component' type -- nested
 * component instances require special interactive handling with scoped IDs.
 * The consumer (CanvasChildRenderer) handles 'component' separately.
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import type {
  CanvasElement,
  TextElement,
  ImageElement,
  VideoElement,
  ButtonElement,
  FrameElement,
  LinkElement,
  FormElement,
  PaymentElement,
  AddToCartButtonElement,
  CheckoutElement,
  CartElement,
  EcommerceCarouselElement,
  FaqElement,
  ListElement,
  StickyNoteElement,
  TimerElement,
  SmartCmsListElement,
  ReceiptElement,
  PencilElement,
  Breakpoint,
} from '../../_lib/types'
import { computeFrameSizing } from '../../_lib/style-utils'
import { useRenderMode } from '../../_lib/render-mode-context'
import { useParentFlexDirection } from '../../_lib/parent-layout-context'
import {
  computeElementPositionStyles,
  computeElementSizeStyles,
  type ElementSizeStyles,
} from '../../_lib/shared-element-styles'
import {
  isPreBuiltNavbar,
  isPreBuiltSidebar,
  isPreBuiltTotalMembers,
} from '../../_lib/prebuilt'
import {
  UnifiedText,
  UnifiedImage,
  UnifiedVideo,
  UnifiedButton,
  UnifiedFrame,
  UnifiedLink,
  UnifiedForm,
  UnifiedPayment,
  UnifiedAddToCart,
  UnifiedCart,
  UnifiedCheckout,
  UnifiedEcommerceCarousel,
  UnifiedFaq,
  UnifiedList,
  UnifiedStickyNote,
  UnifiedTimer,
  UnifiedSmartCmsList,
  UnifiedReceipt,
  UnifiedPencil,
  UnifiedPreBuiltNavbar,
  UnifiedPreBuiltSidebar,
  UnifiedPrebuiltTotalMembers,
} from '../unified-elements'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the NonInteractiveChildRenderer component.
 *
 * SOURCE OF TRUTH: NonInteractiveChildProps, non-interactive-child-props
 *
 * These props provide the element to render plus the context needed for
 * recursive child rendering (childrenMap and allElements from the sourceTree).
 */
export interface NonInteractiveChildProps {
  /** The child element to render */
  element: CanvasElement
  /** Map of parent ID to child IDs for recursive traversal */
  childrenMap: Record<string, string[]>
  /** All elements in the component's sourceTree */
  allElements: CanvasElement[]
}

// ============================================================================
// CHILD POSITION WRAPPER -- Uses shared utilities for full style parity
// ============================================================================

/**
 * Wraps a non-interactive child element with FULL positioning and sizing
 * using the same shared utilities that ElementWrapper (canvas) and unified
 * element wrappers (preview) use. This replaces the old bare-bones
 * NonInteractiveWrapper that only applied { position, width, height }.
 *
 * Delegates to:
 * - computeElementPositionStyles: position, left/top, centering transforms,
 *   rotation, zIndex, and margin (responsive-aware)
 * - Caller-provided sizeStyles: width, height, flex distribution, minWidth/minHeight
 *
 * This ensures component instance children render with identical layout
 * properties to the master component and preview mode.
 */
function ChildPositionWrapper({
  element,
  sizeStyles,
  extraStyles,
  breakpoint,
  children,
}: {
  element: CanvasElement
  sizeStyles: ElementSizeStyles
  /** Additional CSS for element-specific constraints (e.g., FAQ minWidth) */
  extraStyles?: React.CSSProperties
  breakpoint: Breakpoint
  children: React.ReactNode
}) {
  /**
   * Full position computation — handles absolute/relative positioning,
   * left/top with CSS centering, rotation transform, zIndex, and margin.
   * Children inside components are never root (isRoot = false).
   */
  const positionStyles = computeElementPositionStyles(element, false, breakpoint)

  return (
    <div
      style={{
        ...positionStyles,
        width: sizeStyles.width,
        height: sizeStyles.height,
        ...(sizeStyles.minHeight !== undefined ? { minHeight: sizeStyles.minHeight } : {}),
        ...(sizeStyles.flex ? { flex: sizeStyles.flex } : {}),
        ...(sizeStyles.minWidth !== undefined ? { minWidth: sizeStyles.minWidth } : {}),
        ...extraStyles,
        /* Hidden elements shown at reduced opacity on canvas (matches ElementWrapper behavior) */
        opacity: element.visible === false ? 0.5 : undefined,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  )
}

// ============================================================================
// NON-INTERACTIVE CHILD RENDERER -- Delegates to unified elements
// ============================================================================

/**
 * Renders a single child element from a component's sourceTree for canvas display.
 * Each element gets full position + size styling via shared utilities, then
 * delegates visual rendering to the unified element component.
 *
 * Supports ALL element types except 'component' (handled by consumer).
 * For container elements (frame, link, sidebar), children are recursively rendered.
 */
export function NonInteractiveChildRenderer({
  element,
  childrenMap,
  allElements,
}: NonInteractiveChildProps) {
  /**
   * Read breakpoint and parent flex direction from context.
   * parentFlexDirection is crucial for autoWidth flex distribution —
   * row parents use flex: 1 1 0% while column parents use width: 100%.
   */
  const { breakpoint } = useRenderMode()
  const parentFlexDirection = useParentFlexDirection()

  /** Get direct children of this element from the childrenMap */
  const childIds = childrenMap[element.id] || []
  const children = childIds
    .map((id) => allElements.find((el) => el.id === id))
    .filter((el): el is CanvasElement => el !== undefined)

  // ============================================================================
  // TEXT -- autoWidth=true, autoHeight=true by default
  // ============================================================================
  if (element.type === 'text') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: true,
      autoHeightDefault: true,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedText element={element as TextElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // IMAGE -- autoWidth=false, fixed height (objectFit handles aspect ratio)
  // ============================================================================
  if (element.type === 'image') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedImage element={element as ImageElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // VIDEO -- Fixed width, fixed height
  // ============================================================================
  if (element.type === 'video') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedVideo element={element as VideoElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // BUTTON -- autoWidth=false, autoHeight=false by default
  // ============================================================================
  if (element.type === 'button') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedButton element={element as ButtonElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // FRAME / PAGE -- Uses computeFrameSizing for wrap-mode auto-height + scroll
  // ============================================================================
  if (element.type === 'frame' || element.type === 'page') {
    const el = element as FrameElement

    /**
     * computeFrameSizing is the single source of truth for frame dimensions.
     * It handles autoWidth, wrap-mode auto-height, scroll overflow, and
     * flex distribution in row parents — exactly matching how frames are
     * sized in both ElementWrapper (canvas) and UnifiedFrame (preview).
     */
    const frameSizing = computeFrameSizing(el, breakpoint, parentFlexDirection)
    const sizeStyles: ElementSizeStyles = {
      width: frameSizing.width,
      height: frameSizing.height,
      minHeight: undefined,
      flex: frameSizing.flex,
      minWidth: frameSizing.minWidth,
    }

    return (
      <ChildPositionWrapper
        element={element}
        sizeStyles={sizeStyles}
        breakpoint={breakpoint}
        extraStyles={frameSizing.isScrollEnabled ? { overflow: 'hidden' } : undefined}
      >
        <UnifiedFrame element={el}>
          {children.map((child) => (
            <NonInteractiveChildRenderer
              key={child.id}
              element={child}
              childrenMap={childrenMap}
              allElements={allElements}
            />
          ))}
        </UnifiedFrame>
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // LINK -- Container element (frame-like) with recursive child rendering
  // ============================================================================
  if (element.type === 'link') {
    const el = element as LinkElement

    /**
     * Links share frame-like sizing behavior (autoWidth, flexWrap, scroll).
     * Cast to FrameElement for computeFrameSizing — the relevant properties
     * (autoWidth, styles.flexWrap, responsive/scrollEnabled) exist on both types.
     */
    const frameSizing = computeFrameSizing(el as unknown as FrameElement, breakpoint, parentFlexDirection)
    const sizeStyles: ElementSizeStyles = {
      width: frameSizing.width,
      height: frameSizing.height,
      minHeight: undefined,
      flex: frameSizing.flex,
      minWidth: frameSizing.minWidth,
    }

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedLink element={el}>
          {children.map((child) => (
            <NonInteractiveChildRenderer
              key={child.id}
              element={child}
              childrenMap={childrenMap}
              allElements={allElements}
            />
          ))}
        </UnifiedLink>
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // ADD TO CART BUTTON -- autoWidth=false, autoHeight=false
  // ============================================================================
  if (element.type === 'add-to-cart-button') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedAddToCart element={element as AddToCartButtonElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // CHECKOUT -- Fixed width, fixed height
  // ============================================================================
  if (element.type === 'checkout') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedCheckout element={element as CheckoutElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // CART -- autoWidth=true, autoHeight=true
  // ============================================================================
  if (element.type === 'cart') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: true,
      autoHeightDefault: true,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedCart element={element as CartElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // ECOMMERCE CAROUSEL -- Fixed width, fixed height
  // ============================================================================
  if (element.type === 'ecommerce-carousel') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedEcommerceCarousel element={element as EcommerceCarouselElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // FAQ -- autoWidth=true, autoHeight=true, with minWidth constraint
  // ============================================================================
  if (element.type === 'faq') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: true,
      autoHeightDefault: true,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper
        element={element}
        sizeStyles={sizeStyles}
        breakpoint={breakpoint}
        extraStyles={{
          /* FAQ has minWidth constraint and maxWidth when autoWidth */
          minWidth: 280,
          maxWidth: sizeStyles.width === '100%' ? element.width : undefined,
        }}
      >
        <UnifiedFaq element={element as FaqElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // LIST -- autoWidth=true, autoHeight=true, with minWidth constraint
  // ============================================================================
  if (element.type === 'list') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: true,
      autoHeightDefault: true,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedList element={element as ListElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // TIMER -- autoWidth=true, autoHeight=true
  // ============================================================================
  if (element.type === 'timer') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: true,
      autoHeightDefault: true,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedTimer element={element as TimerElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // STICKY NOTE -- autoWidth=false, fixed height
  // ============================================================================
  if (element.type === 'sticky-note') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedStickyNote element={element as StickyNoteElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // FORM -- autoWidth=true, autoHeight=true
  // ============================================================================
  if (element.type === 'form') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: true,
      autoHeightDefault: true,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedForm element={element as FormElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // PAYMENT -- autoWidth=false, autoHeight=true
  // ============================================================================
  if (element.type === 'payment') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: true,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedPayment element={element as PaymentElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // RECEIPT -- autoWidth=false, always auto height
  // ============================================================================
  if (element.type === 'receipt') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: true,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedReceipt element={element as ReceiptElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // PENCIL -- Fixed width/height (SVG stretches via viewBox)
  // ============================================================================
  if (element.type === 'pencil') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedPencil element={element as PencilElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // SMARTCMS LIST -- autoWidth and autoHeight from element settings
  // ============================================================================
  if (element.type === 'smartcms-list') {
    const sizeStyles = computeElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
      parentFlexDirection,
    })

    return (
      <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
        <UnifiedSmartCmsList element={element as SmartCmsListElement} />
      </ChildPositionWrapper>
    )
  }

  // ============================================================================
  // PREBUILT -- Type guards narrow to specific prebuilt element types
  // ============================================================================
  if (element.type === 'prebuilt') {
    /** Navbar: full-width header element */
    if (isPreBuiltNavbar(element)) {
      const sizeStyles = computeElementSizeStyles(element, breakpoint, {
        autoWidthDefault: true,
        autoHeightDefault: false,
        parentFlexDirection,
      })

      return (
        <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
          <UnifiedPreBuiltNavbar element={element} />
        </ChildPositionWrapper>
      )
    }

    /** Sidebar: container element with inset area for children */
    if (isPreBuiltSidebar(element)) {
      const sizeStyles = computeElementSizeStyles(element, breakpoint, {
        autoWidthDefault: true,
        autoHeightDefault: false,
        parentFlexDirection,
      })
      /** Find the inset frame's children to render recursively */
      const insetChildren = (childrenMap[element.insetFrameId] || [])
        .map((id) => allElements.find((el) => el.id === id))
        .filter((el): el is CanvasElement => el !== undefined)

      return (
        <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
          <UnifiedPreBuiltSidebar element={element}>
            {insetChildren.map((child) => (
              <NonInteractiveChildRenderer
                key={child.id}
                element={child}
                childrenMap={childrenMap}
                allElements={allElements}
              />
            ))}
          </UnifiedPreBuiltSidebar>
        </ChildPositionWrapper>
      )
    }

    /** Total Members: social proof element with stacked avatars */
    if (isPreBuiltTotalMembers(element)) {
      const sizeStyles = computeElementSizeStyles(element, breakpoint, {
        autoWidthDefault: true,
        autoHeightDefault: false,
        parentFlexDirection,
      })

      return (
        <ChildPositionWrapper element={element} sizeStyles={sizeStyles} breakpoint={breakpoint}>
          <UnifiedPrebuiltTotalMembers element={element} />
        </ChildPositionWrapper>
      )
    }
  }

  // ============================================================================
  // FALLBACK -- Unknown or unsupported element type (e.g. 'component')
  // ============================================================================
  return null
}
