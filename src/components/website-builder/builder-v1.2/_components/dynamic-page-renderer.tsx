/**
 * ============================================================================
 * DYNAMIC PAGE RENDERER - CMS Row Context Wrapper for Page Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: Dynamic Page Rendering with CMS Row Context
 *
 * Wraps the ResponsivePageRenderer in CmsRowProvider to make CMS row data
 * available to all child elements. This enables Link elements with
 * linkType='dynamic' to resolve their URLs using the current row context.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * Used for dynamic page routes like /domain/template-slug/row-id:
 *
 * ```tsx
 * <DynamicPageRenderer
 *   elements={publishedElements}
 *   cmsRow={fetchedCmsRow}
 *   cmsTableId={page.cmsTableId}
 *   basePath="/webprodigies"
 *   initialBreakpoint={detectedFromUserAgent}
 * />
 * ```
 *
 * ============================================================================
 * CMS ROW CONTEXT
 * ============================================================================
 *
 * The CmsRowProvider wraps all elements and provides:
 * - Current row ID and values
 * - Table ID for context
 * - Base path for URL building
 *
 * Link elements inside the page can access this context to:
 * - Build dynamic URLs: basePath/{targetPageSlug}/{row.id}
 * - Bind text/image values from the row
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import type { CanvasElement, LocalComponent, Breakpoint } from '../_lib/types'
import { CmsRowProvider, type CmsRowData } from '../_lib/cms-row-context'
import { ResponsivePageRenderer } from './responsive-page-renderer'

// ============================================================================
// TYPES
// ============================================================================

export interface DynamicPageRendererProps {
  /** Page elements to render */
  elements: CanvasElement[]

  /** CMS row data for the current dynamic page */
  cmsRow: CmsRowData | null

  /** CMS table ID the row belongs to */
  cmsTableId: string | null

  /** Map of LocalComponents for rendering component instances */
  components?: Record<string, LocalComponent>

  /** Organization ID for CMS data fetching in nested SmartCMS Lists */
  organizationId?: string

  /** Base path for building dynamic URLs (e.g., '/domain-name') */
  basePath?: string

  /** Optional className for the outer wrapper */
  className?: string

  /** Optional inline styles for the outer wrapper */
  style?: React.CSSProperties

  /**
   * Server-detected initial breakpoint for SSR FOUC prevention.
   * Passed through to ResponsivePageRenderer -> useBreakpoint as the
   * initial state so SSR renders the correct layout from the start.
   *
   * Auto-detection via useBreakpoint still runs after hydration to
   * confirm/correct the server's UA-based detection.
   */
  initialBreakpoint?: Breakpoint

  /** Whether e-commerce is enabled — gates navbar cart button */
  enableEcommerce?: boolean

  /**
   * Map of page IDs to their CMS slug column slugs for dynamic URL resolution.
   * SOURCE OF TRUTH: PageSlugColumnsMap, DynamicUrlSlugResolution
   */
  pageSlugColumns?: Record<string, string>
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders a dynamic page with CMS row context.
 *
 * Wraps ResponsivePageRenderer in CmsRowProvider so that all child elements
 * can access the current CMS row data. This is essential for:
 *
 * 1. Link elements with linkType='dynamic' to resolve URLs
 * 2. Text/image bindings that display row values (future)
 * 3. Nested SmartCMS Lists that need parent context (future)
 *
 * @example
 * ```tsx
 * // In the public page for /domain/blog/post-123:
 * <DynamicPageRenderer
 *   elements={page.elements}
 *   cmsRow={{ id: 'post-123', values: { title: 'Hello' }, order: 0 }}
 *   cmsTableId={page.cmsTableId}
 *   basePath="/webprodigies"
 *   initialBreakpoint="mobile"
 * />
 * ```
 */
export function DynamicPageRenderer({
  elements,
  cmsRow,
  cmsTableId,
  components,
  organizationId,
  basePath = '',
  className,
  style,
  initialBreakpoint,
  enableEcommerce,
  pageSlugColumns,
}: DynamicPageRendererProps) {
  /**
   * If we have CMS row data, wrap the page in CmsRowProvider.
   * If no row data (shouldn't happen for dynamic pages), render without context.
   */
  if (cmsRow && cmsTableId) {
    return (
      <CmsRowProvider
        row={cmsRow}
        tableId={cmsTableId}
        basePath={basePath}
      >
        <ResponsivePageRenderer
          elements={elements}
          className={className}
          style={style}
          initialBreakpoint={initialBreakpoint}
          components={components}
          organizationId={organizationId}
          basePath={basePath}
          enableEcommerce={enableEcommerce}
          pageSlugColumns={pageSlugColumns}
        />
      </CmsRowProvider>
    )
  }

  /**
   * Fallback: Render without CMS context.
   * Link elements with linkType='dynamic' will show '#' as their href.
   */
  return (
    <ResponsivePageRenderer
      elements={elements}
      className={className}
      style={style}
      initialBreakpoint={initialBreakpoint}
      components={components}
      organizationId={organizationId}
      basePath={basePath}
      enableEcommerce={enableEcommerce}
      pageSlugColumns={pageSlugColumns}
    />
  )
}
