 /**
 * ============================================================================
 * PAGE RENDERER - Lightweight, Reusable Page Display Component
 * ============================================================================
 *
 * Renders a page element with all its children in a non-interactive,
 * display-only mode. Designed to be reusable across different contexts:
 *
 * USE CASES:
 * - Preview mode overlay in the builder
 * - Published website rendering
 * - Thumbnail generation
 * - Export/print views
 *
 * KEY FEATURES:
 * - Zero interactions (no drag, resize, select, delete)
 * - Lightweight DOM structure (no selection handles, no resize handles)
 * - Recursive element rendering
 * - Respects element visibility and z-order
 *
 * ============================================================================
 * MINIMAL DATA INPUT
 * ============================================================================
 *
 * Accepts JUST an array of elements. Derives everything else internally:
 * - rootIds: Found from elements where parentId === null
 * - childrenMap: Built by grouping elements by parentId
 *
 * This allows the published data to be ultra-minimal (just elements array).
 * Does NOT connect to Redux directly (makes it reusable).
 *
 * ============================================================================
 * RESPONSIVE STYLES - Two Modes of Operation
 * ============================================================================
 *
 * 1. MOBILE BREAKPOINT PREVIEW (breakpoint='mobile'):
 *    - Styles are computed via JavaScript using getPropertyValue & mergeResponsiveStyles
 *    - Element renderers directly apply mobile styles from responsiveProperties/responsiveStyles
 *    - No CSS generation needed - instant style application
 *
 * 2. PUBLISHED/PREVIEW MODE (breakpoint='desktop', the default):
 *    - Generates @container CSS queries for mobile-specific styles
 *    - CSS is injected as a <style> block
 *    - Container wrapper has containerType: 'inline-size' to enable queries
 *    - When container width < 768px, mobile styles automatically apply
 *
 * IMPORTANT: The containerType: 'inline-size' on the wrapper is REQUIRED for
 * @container CSS queries to work. Without it, the browser ignores the rules.
 */

'use client'

import React, { useEffect, useMemo } from 'react'
import type {
  CanvasElement,
  PageElement,
  TextElement,
  ButtonElement,
  LinkElement as LinkElementType,
} from '../_lib/types'
import { isPreBuiltNavbar, isPreBuiltSidebar, isPreBuiltTotalMembers, isPreBuiltLogoCarousel } from '../_lib/prebuilt'
import { GoogleFontsService } from '../_lib/google-fonts-service'
import { generatePageResponsiveCSS, getPropertyValue, RenderModeProvider } from '../_lib'

// Import types and utils from extracted modules
import type { PageRendererProps, ElementRendererProps } from './renderers/page-renderer'
import {
  buildLookupStructures,
} from './renderers/page-renderer'

// Import PageElementRenderer (special case: preview-only page wrapper, not a full unified element)
import {
  PageElementRenderer,
} from './renderers/element-renderers'

// Import unified elements — ALL element types now use the unified renderer architecture
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
  UnifiedComponentInstance,
  UnifiedSmartCmsList,
  UnifiedReceipt,
  UnifiedRichText,
  UnifiedPencil,
  UnifiedPreBuiltNavbar,
  UnifiedPreBuiltSidebar,
  UnifiedPrebuiltTotalMembers,
  UnifiedPrebuiltLogoCarousel,
} from './unified-elements'

// Re-export types for consumers
export type { PageRendererProps } from './renderers/page-renderer'

// ============================================================================
// ELEMENT RENDERER - Recursive element display
// ============================================================================

/**
 * Renders a single element and its children recursively.
 * Purely visual - no interaction handlers.
 *
 * ROOT VS CHILD ELEMENTS:
 * - Root elements (parentId === null): position absolute at (x, y)
 * - Child elements: position relative, flow via flexbox in parent
 *
 * RESPONSIVE STYLES:
 * - Passes breakpoint to all child renderers and style compute functions
 * - When breakpoint='mobile', elements use their responsive style overrides
 *
 * RESPONSIVE VISIBILITY:
 * - Uses getPropertyValue to check visibility based on current breakpoint
 * - When breakpoint='mobile', checks responsiveProperties.mobile.visible first
 * - Elements hidden on mobile won't render in the mobile breakpoint frame
 */
function ElementRenderer({ element, elementsMap, childrenMap, breakpoint, components, organizationId, basePath, cmsSnapshots, enableEcommerce }: ElementRendererProps) {
  /**
   * Check visibility based on the current breakpoint.
   * Uses getPropertyValue to respect mobile visibility overrides.
   *
   * When breakpoint='desktop': Uses element.visible
   * When breakpoint='mobile': Uses responsiveProperties.mobile.visible if set,
   *                           otherwise falls back to element.visible
   *
   * Use nullish coalescing to ensure we always have a boolean fallback.
   */
  const isVisible = getPropertyValue<boolean>(element, 'visible', breakpoint, element.visible) ?? element.visible

  // Skip hidden elements (respects breakpoint-specific visibility)
  if (!isVisible) return null

  // Determine if this is a root element (directly on canvas/page)
  const isRoot = element.parentId === null

  /**
   * Get children IDs and filter based on breakpoint visibility.
   * Each child's visibility is checked using getPropertyValue so that
   * mobile-hidden children don't appear in the mobile breakpoint frame.
   */
  const childIds = childrenMap[element.id] || []
  const children = childIds
    .map((id) => elementsMap[id])
    .filter((el): el is CanvasElement => {
      if (el === undefined) return false
      // Check visibility using responsive-aware getter
      // Use nullish coalescing to ensure we always have a boolean
      const childVisible = getPropertyValue<boolean>(el, 'visible', breakpoint, el.visible) ?? el.visible
      return childVisible
    })
    .sort((a, b) => a.order - b.order)

  // Render based on element type
  if (element.type === 'page') {
    return (
      <PageElementRenderer element={element} breakpoint={breakpoint}>
        {children.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            elementsMap={elementsMap}
            childrenMap={childrenMap}
            breakpoint={breakpoint}
            organizationId={organizationId}
            components={components}
            basePath={basePath}
            cmsSnapshots={cmsSnapshots}
            enableEcommerce={enableEcommerce}
          />
        ))}
      </PageElementRenderer>
    )
  }

  // Handle FRAME elements — unified renderer (preview mode: full positioning + styling)
  if (element.type === 'frame') {
    return (
      <UnifiedFrame key={element.id} element={element}>
        {children.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            elementsMap={elementsMap}
            childrenMap={childrenMap}
            breakpoint={breakpoint}
            organizationId={organizationId}
            components={components}
            basePath={basePath}
            cmsSnapshots={cmsSnapshots}
            enableEcommerce={enableEcommerce}
          />
        ))}
      </UnifiedFrame>
    )
  }

  // ================================================================
  // UNIFIED ELEMENTS — Single component for both canvas & preview
  // These 4 element types use the unified renderer architecture.
  // The RenderModeProvider wrapping the tree provides mode='preview'
  // so each component internally knows to render preview content.
  // ================================================================

  // Handle TEXT elements — unified renderer (preview mode: read-only display)
  if (element.type === 'text') {
    return <UnifiedText key={element.id} element={element} />
  }

  // Handle IMAGE elements — unified renderer (preview mode: Next.js Image)
  if (element.type === 'image') {
    return <UnifiedImage key={element.id} element={element} />
  }

  // Handle VIDEO elements — unified renderer (preview mode: full video player)
  if (element.type === 'video') {
    return <UnifiedVideo key={element.id} element={element} />
  }

  // Handle BUTTON elements — unified renderer (preview mode: link wrapping)
  if (element.type === 'button') {
    return <UnifiedButton key={element.id} element={element} />
  }

  // Handle ADD TO CART BUTTON elements — unified renderer (preview mode: cart action)
  if (element.type === 'add-to-cart-button') {
    return <UnifiedAddToCart key={element.id} element={element} />
  }

  // Handle CHECKOUT elements — unified renderer (preview mode: Stripe checkout)
  if (element.type === 'checkout') {
    return <UnifiedCheckout key={element.id} element={element} />
  }

  // Handle CART elements — unified renderer (preview mode: cart sheet toggle)
  if (element.type === 'cart') {
    return <UnifiedCart key={element.id} element={element} />
  }

  // Handle ECOMMERCE CAROUSEL elements — unified renderer (preview mode: interactive gallery)
  if (element.type === 'ecommerce-carousel') {
    return <UnifiedEcommerceCarousel key={element.id} element={element} />
  }

  // Handle FAQ elements — unified renderer (preview mode: interactive accordion)
  if (element.type === 'faq') {
    return <UnifiedFaq key={element.id} element={element} />
  }

  // Handle LIST elements — unified renderer (preview mode: static bullet list)
  if (element.type === 'list') {
    return <UnifiedList key={element.id} element={element} />
  }

  // Handle STICKY NOTE elements — unified renderer (preview mode: static note)
  if (element.type === 'sticky-note') {
    return <UnifiedStickyNote key={element.id} element={element} />
  }

  // Handle TIMER elements — unified renderer (preview mode: live countdown)
  if (element.type === 'timer') {
    return <UnifiedTimer key={element.id} element={element} />
  }

  // Handle PAYMENT elements — unified renderer (preview mode: Stripe payment form)
  if (element.type === 'payment') {
    return <UnifiedPayment key={element.id} element={element} />
  }

  // Handle RECEIPT elements — unified renderer (preview mode: real receipt from transaction)
  if (element.type === 'receipt') {
    return <UnifiedReceipt key={element.id} element={element} />
  }

  // Handle RICH TEXT elements — unified renderer (preview mode: read-only Lexical content)
  if (element.type === 'rich-text') {
    return <UnifiedRichText key={element.id} element={element} />
  }

  // Handle PENCIL elements — unified renderer (preview mode: SVG freehand drawing)
  if (element.type === 'pencil') {
    return <UnifiedPencil key={element.id} element={element} />
  }

  // Handle FORM elements — unified renderer (preview mode: interactive form)
  if (element.type === 'form') {
    return <UnifiedForm key={element.id} element={element} />
  }

  // Handle PREBUILT elements — unified renderer (preview mode: interactive navigation, mobile menu, etc.)
  if (element.type === 'prebuilt') {
    if (isPreBuiltNavbar(element)) {
      return <UnifiedPreBuiltNavbar key={element.id} element={element} />
    }
    if (isPreBuiltSidebar(element)) {
      return (
        <UnifiedPreBuiltSidebar key={element.id} element={element}>
          {children.map((child) => (
            <ElementRenderer
              key={child.id}
              element={child}
              elementsMap={elementsMap}
              childrenMap={childrenMap}
              breakpoint={breakpoint}
              organizationId={organizationId}
              components={components}
              basePath={basePath}
              cmsSnapshots={cmsSnapshots}
              enableEcommerce={enableEcommerce}
            />
          ))}
        </UnifiedPreBuiltSidebar>
      )
    }
    if (isPreBuiltTotalMembers(element)) {
      return <UnifiedPrebuiltTotalMembers key={element.id} element={element} />
    }
    if (isPreBuiltLogoCarousel(element)) {
      return <UnifiedPrebuiltLogoCarousel key={element.id} element={element} />
    }
    // Future PreBuilt types can be added here
    return null
  }

  // Handle COMPONENT INSTANCE elements — unified renderer (preview mode: scoped rendering)
  if (element.type === 'component') {
    return <UnifiedComponentInstance key={element.id} element={element} />
  }

  // Handle LINK elements — unified renderer (preview mode: navigable container)
  if (element.type === 'link') {
    return (
      <UnifiedLink key={element.id} element={element as LinkElementType}>
        {children.map((child) => (
          <ElementRenderer
            key={child.id}
            element={child}
            elementsMap={elementsMap}
            childrenMap={childrenMap}
            breakpoint={breakpoint}
            organizationId={organizationId}
            components={components}
            basePath={basePath}
            cmsSnapshots={cmsSnapshots}
            enableEcommerce={enableEcommerce}
          />
        ))}
      </UnifiedLink>
    )
  }

  // Handle SMARTCMS LIST elements — unified renderer (preview mode: CMS data fetching + rendering)
  if (element.type === 'smartcms-list') {
    return <UnifiedSmartCmsList key={element.id} element={element} />
  }

  // Future element types can be added here
  return null
}

// ============================================================================
// PAGE RENDERER - Main export
// ============================================================================

/**
 * Renders a page from an array of elements in a non-interactive, display-only mode.
 *
 * ============================================================================
 * MINIMAL INPUT - MAXIMUM SIMPLICITY
 * ============================================================================
 *
 * Only requires an array of elements. Derives everything else internally:
 * - elementsMap: Built from the array for O(1) lookup
 * - rootIds: Found from elements where parentId === null
 * - childrenMap: Built by grouping elements by parentId
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * // From published website data (ultra-minimal storage)
 * const page = website.publishedCanvasData.pages["/about"]
 * <PageRenderer elements={page.elements} />
 *
 * // From Redux state (for preview mode)
 * const canvas = useAppSelector(selectCanvasState)
 * <PageRenderer elements={Object.values(canvas.elements)} />
 * ```
 *
 * ============================================================================
 * FONT LOADING
 * ============================================================================
 *
 * On mount, this component preloads all Google Fonts used by text/button
 * elements to ensure fonts are available when the page renders.
 */
export function PageRenderer({ elements, className, style, breakpoint = 'desktop', components, organizationId, basePath, cmsSnapshots, enableEcommerce, isBreakpointFrame, pageSlugColumns }: PageRendererProps) {
  /**
   * Build lookup structures from the flat elements array.
   * Memoized to avoid rebuilding on every render.
   */
  const { elementsMap, rootIds, childrenMap } = useMemo(
    () => buildLookupStructures(elements),
    [elements]
  )

  /**
   * Generate responsive CSS for container queries.
   *
   * This creates @container CSS rules for elements with mobile style overrides.
   * Only generated when breakpoint is 'desktop' (for published sites) since
   * mobile preview already uses direct style merging via the breakpoint prop.
   *
   * The CSS is injected as a <style> tag so that when the page is viewed
   * at mobile widths, the container queries kick in and apply mobile styles.
   */
  const responsiveCSS = useMemo(() => {
    // Only generate CSS for desktop breakpoint (published sites)
    // Mobile preview uses direct style computation, not CSS rules
    if (breakpoint !== 'desktop') return ''
    return generatePageResponsiveCSS(elements)
  }, [elements, breakpoint])

  /**
   * Preload all fonts used by text and button elements on mount.
   * This collects all unique font families and loads them via GoogleFontsService.
   *
   * MIGRATION NOTE: Typography has moved from element properties to styles.
   * We check both locations for backwards compatibility:
   * - New location: element.styles.fontFamily
   * - Legacy location: element.fontFamily (deprecated)
   */
  useEffect(() => {
    // Collect all unique font families from text and button elements
    const fontFamilies = new Set<string>()

    elements.forEach((element) => {
      // Text elements have fontFamily
      if (element.type === 'text') {
        const textElement = element as TextElement
        // Check styles first (new location), then legacy property (backwards compatibility)
        const fontFamily = textElement.styles?.fontFamily ?? textElement.fontFamily
        if (fontFamily) {
          fontFamilies.add(fontFamily as string)
        }
      }
      // Button elements also have fontFamily
      if (element.type === 'button') {
        const buttonElement = element as ButtonElement
        // Check styles first (new location), then legacy property (backwards compatibility)
        const fontFamily = buttonElement.styles?.fontFamily ?? buttonElement.fontFamily
        if (fontFamily) {
          fontFamilies.add(fontFamily as string)
        }
      }
    })

    // Load all fonts
    if (fontFamilies.size > 0) {
      GoogleFontsService.loadFonts(Array.from(fontFamilies))
    }
  }, [elements])

  // Find the page element (should be in rootIds and have type 'page')
  const pageElement = rootIds
    .map((id) => elementsMap[id])
    .find((el): el is PageElement => el?.type === 'page')

  // No page found - nothing to render
  if (!pageElement) {
    return null
  }

  /**
   * Merge the passed-in styles with the required container-type.
   *
   * CONTAINER TYPE IS REQUIRED FOR RESPONSIVE CSS:
   * The @container CSS queries generated by generatePageResponsiveCSS need
   * a container ancestor with container-type set. Without this, the browser
   * doesn't know what "container" to measure for the query thresholds.
   *
   * We use 'inline-size' which creates a container based on width only,
   * allowing height to grow naturally with content.
   */
  const containerStyle: React.CSSProperties = {
    ...style,
    // Required for @container CSS queries to work
    containerType: 'inline-size' as React.CSSProperties['containerType'],
  }

  return (
    <RenderModeProvider
      mode="preview"
      breakpoint={breakpoint}
      organizationId={organizationId}
      basePath={basePath}
      components={components}
      enableEcommerce={enableEcommerce}
      cmsSnapshots={cmsSnapshots}
      isBreakpointFrame={isBreakpointFrame}
      pageSlugColumns={pageSlugColumns}
    >
      <div className={className} style={containerStyle}>
        {/*
          Inject responsive CSS for container queries.
          This enables mobile styles to work on published sites when
          the container width falls below the mobile breakpoint (767px).

          NOTE: These queries ONLY work because the parent div has
          containerType: 'inline-size' set. Without that, @container
          rules would be ignored by the browser.
        */}
        {responsiveCSS && (
          <style dangerouslySetInnerHTML={{ __html: responsiveCSS }} />
        )}

        <ElementRenderer
          element={pageElement}
          elementsMap={elementsMap}
          childrenMap={childrenMap}
          breakpoint={breakpoint}
          components={components}
          organizationId={organizationId}
          basePath={basePath}
          cmsSnapshots={cmsSnapshots}
          enableEcommerce={enableEcommerce}
        />
      </div>
    </RenderModeProvider>
  )
}
