/**
 * ============================================================================
 * PAGE ELEMENT RENDERER
 * ============================================================================
 *
 * SOURCE OF TRUTH: Page Element Rendering
 *
 * Renders a page element as a simple div with its children.
 * No resize handles, no selection state, just visual display.
 *
 * ============================================================================
 * PREVIEW MODE - FULL WIDTH RESPONSIVE LAYOUT
 * ============================================================================
 *
 * In preview/published mode, pages are FULL WIDTH (100%), not fixed width.
 * The fixed width (e.g., 1440px) is only for the canvas editor view.
 *
 * HEIGHT: Uses minHeight from element.height so content can grow beyond it.
 *
 * ============================================================================
 * CONTAINER MODE
 * ============================================================================
 *
 * When `element.container` is TRUE:
 * - Children are wrapped in a centered max-width container (1280px)
 * - Content doesn't stretch edge-to-edge on wide screens
 *
 * When `element.container` is FALSE:
 * - Children stretch to full width
 * - Content goes edge-to-edge
 *
 * ============================================================================
 * DYNAMIC STYLES - Single Source of Truth
 * ============================================================================
 *
 * Uses computeFrameContentStyles from style-utils.ts for consistency
 * with the canvas editor rendering. This ensures preview matches editor.
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import type { Breakpoint, PageElement } from '../../../_lib/types'
import { DEFAULT_PAGE_STYLES } from '../../../_lib/types'
import { computeFrameContentStyles, getPropertyValue } from '../../../_lib'

interface PageElementRendererProps {
  element: PageElement
  children?: React.ReactNode
  /** Breakpoint for responsive style computation */
  breakpoint: Breakpoint
}

/**
 * Renders a page element in preview/published mode.
 * Full width layout with optional container constraint for children.
 */
export function PageElementRenderer({ element, children, breakpoint }: PageElementRendererProps) {
  // Compute content styles via shared utility (single source of truth)
  // Pass breakpoint for responsive style merging
  const contentStyle = computeFrameContentStyles(element, true, { breakpoint })

  // Get merged styles for container flex properties
  const styles = { ...DEFAULT_PAGE_STYLES, ...(element.styles ?? {}) }

  /**
   * Use responsive-aware getter for container property.
   * Default is true for pages for backwards compatibility.
   */
  const hasContainer = getPropertyValue<boolean>(element, 'container', breakpoint, true)

  /**
   * CRITICAL: Override overflow for sticky positioning support.
   *
   * The contentStyle from computeFrameContentStyles sets overflow: hidden by default,
   * but this BREAKS position: sticky on any descendant elements. Sticky elements
   * cannot work when ANY ancestor has overflow: hidden/scroll/auto.
   *
   * Solution: Use overflow: visible on page content to allow sticky to work.
   * Pages should never clip their content anyway - they should grow to fit.
   */
  const pageContentStyle: React.CSSProperties = {
    ...contentStyle,
    // Override overflow to allow sticky positioning to work
    overflowX: 'visible',
    overflowY: 'visible',
  }

  /**
   * BACKGROUND FIX FOR PREVIEW/MOBILE RENDERERS:
   *
   * Background styles (color AND image) must be applied to the OUTER wrapper div,
   * not just the inner content div. This ensures the background fills the entire
   * viewport/container height even when the page content is smaller.
   *
   * Previously, background styles were only on the inner content div which would
   * only extend to the height of its children, leaving the rest of the
   * preview/mobile renderer with no background.
   *
   * We extract and apply:
   * - backgroundColor: Solid color fills the entire viewport
   * - backgroundImage: Image covers the entire viewport
   * - backgroundSize: How the image scales (cover/contain)
   * - backgroundPosition: Where the image is positioned (center)
   * - backgroundRepeat: Whether the image tiles
   */
  const outerBackgroundStyles: React.CSSProperties = {
    backgroundColor: contentStyle.backgroundColor,
    backgroundImage: contentStyle.backgroundImage,
    backgroundSize: contentStyle.backgroundSize,
    backgroundPosition: contentStyle.backgroundPosition,
    backgroundRepeat: contentStyle.backgroundRepeat,
  }

  /**
   * Determine if we're in the mobile breakpoint frame.
   * When breakpoint='mobile', we're rendering inside the BreakpointMobileFrame
   * and should NOT apply minHeight - let sidebar fill naturally.
   */
  const isInMobileBreakpointFrame = breakpoint === 'mobile'

  return (
    <div
      data-page-renderer
      data-element-id={element.id}
      style={{
        position: 'relative',
        // Full width in preview mode - NOT the fixed canvas width
        width: '100%',
        /**
         * HEIGHT HANDLING FOR PREVIEW/PUBLISHED MODE:
         *
         * Use height: 100% to fill the parent container, with a minHeight
         * of 100vh to ensure the page always covers the full viewport.
         * Content that exceeds the viewport naturally pushes the page taller.
         *
         * In mobile breakpoint frame, height is 'auto' so it fits content.
         * minHeight still applies so the mobile preview isn't awkwardly short.
         */
        height: isInMobileBreakpointFrame ? 'auto' : '100%',
        minHeight: '100vh',
        // Apply background styles to outer wrapper so they fill the full container
        // This fixes the bug where background only showed for inner content height
        ...outerBackgroundStyles,
      }}
    >
      {/* Inner content area - uses shared style computation with overflow fix */}
      <div data-element-content={element.id} style={pageContentStyle}>
        {/*
          Container wrapper - constrains children to max-width when enabled.
          When container is ON: Children are centered in a 1280px max-width box.
          When container is OFF: Children stretch full width.
        */}
        {hasContainer ? (
          <div
            style={{
              width: '100%',
              maxWidth: 1280,
              marginLeft: 'auto',
              marginRight: 'auto',
              display: 'flex',
              flexDirection: styles.flexDirection as 'row' | 'column' | undefined,
              justifyContent: styles.justifyContent as string | undefined,
              alignItems: styles.alignItems as string | undefined,
              gap: styles.gap as number | undefined,
              flex: 1,
              // CRITICAL: Position relative is required so that any free-positioned
              // (isAbsolute) children position correctly relative to the container,
              // not the outer page wrapper. Without this, absolute elements would
              // position relative to the page (100% width) instead of the container
              // (1280px centered), causing elements to appear offset to the left.
              position: 'relative',
            }}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
