/**
 * ============================================================================
 * CMS PREVIEW PROVIDER - Provides sample CMS row data in the builder
 * ============================================================================
 *
 * SOURCE OF TRUTH: CMS Preview Data for Builder Canvas
 *
 * When editing a dynamic page (page with cmsTableId), this component fetches
 * the first row from the connected CMS table and provides it via CmsRowProvider.
 * This allows component instances with CMS bindings to display real preview data.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * This provider wraps the canvas content and:
 *
 * 1. Reads the active page's cmsTableId from Redux
 * 2. Fetches the first CMS row via tRPC (getPreviewRow)
 * 3. Wraps children in CmsRowProvider with the fetched row
 * 4. Falls back to rendering children directly if no cmsTableId
 *
 * ============================================================================
 * DATA FLOW
 * ============================================================================
 *
 * Canvas.tsx
 *   └── CmsPreviewProvider (this component)
 *         ├── Reads: selectActivePage → page.info.cmsTableId
 *         ├── Fetches: trpc.pages.getPreviewRow → first CMS row
 *         └── Provides: CmsRowProvider → row context for children
 *               └── ComponentInstanceElement
 *                     └── ComponentInstanceRenderer
 *                           └── useCmsRowContext() → gets preview row
 *                           └── Resolves cmsColumnBindings → shows preview values
 *
 * ============================================================================
 * FALLBACK BEHAVIOR
 * ============================================================================
 *
 * - No cmsTableId: Renders children without CMS context
 * - Loading state: Renders children without CMS context (loading is fast)
 * - No rows in table: Renders children without CMS context
 * - Error fetching: Renders children without CMS context
 *
 * This ensures the builder never blocks on CMS data.
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { useAppSelector, selectActivePage, useBuilderContext } from '../../_lib'
import { CmsRowProvider } from '../../_lib/cms-row-context'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES
// ============================================================================

interface CmsPreviewProviderProps {
  /**
   * Child elements to render within the CMS context.
   * These children can use useCmsRowContext() to access preview data.
   */
  children: React.ReactNode
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Provider that fetches and provides CMS preview data to the builder canvas.
 *
 * WHY: Allows users to see real CMS data in their component instances while
 * editing, making it easier to design dynamic pages.
 *
 * USAGE:
 * ```tsx
 * <CmsPreviewProvider>
 *   {rootElements.map((element) => renderElement(element))}
 * </CmsPreviewProvider>
 * ```
 */
export function CmsPreviewProvider({ children }: CmsPreviewProviderProps) {
  const { organizationId, domainName } = useBuilderContext()

  // Get the active page to check if it's a dynamic page (has cmsTableId)
  const activePage = useAppSelector(selectActivePage)
  const cmsTableId = activePage?.info?.cmsTableId

  // Fetch the first row from the CMS table for preview
  // Only fetches when we have a valid cmsTableId
  const { data: previewRow } = trpc.pages.getPreviewRow.useQuery(
    {
      organizationId,
      tableId: cmsTableId ?? '',
    },
    {
      // Only fetch when we have organization and table ID
      enabled: !!organizationId && Boolean(cmsTableId),
      // Keep previous data while refetching to prevent flickering
      placeholderData: (prev) => prev,
      // Don't refetch on window focus (data doesn't change often)
      refetchOnWindowFocus: false,
      // Cache for 5 minutes
      staleTime: 5 * 60 * 1000,
    }
  )

  // ============================================================================
  // RENDER
  // ============================================================================

  // If no cmsTableId (not a dynamic page), render children directly
  if (!cmsTableId) {
    return <>{children}</>
  }

  // If we have a cmsTableId but no preview row yet, still render children
  // (the fetch is fast, and this prevents layout shifts)
  if (!previewRow) {
    return <>{children}</>
  }

  // Wrap children in CmsRowProvider with the preview row data
  // This enables component instances to access row.values via useCmsRowContext()
  return (
    <CmsRowProvider
      row={previewRow}
      tableId={cmsTableId}
      basePath={`/${domainName}`}
    >
      {children}
    </CmsRowProvider>
  )
}
