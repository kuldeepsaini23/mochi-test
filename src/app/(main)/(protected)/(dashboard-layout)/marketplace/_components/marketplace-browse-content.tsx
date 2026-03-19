/**
 * ============================================================================
 * MARKETPLACE BROWSE CONTENT — Client Wrapper for Browse View
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: MarketplaceBrowseContent, BrowseContentWrapper
 *
 * WHY: Client component that resolves the active organization before rendering
 * the TemplateBrowseView. The browse view needs basePath="/marketplace" so that
 * template card links point to /marketplace/[templateId] (dashboard route)
 * instead of /templates/[templateId] (public route).
 *
 * HOW: Uses useActiveOrganization hook to get the org. Shows a loading spinner
 * while the org data resolves, then renders the self-contained browse view.
 */

'use client'

import { Loader2 } from 'lucide-react'

import { useActiveOrganization } from '@/hooks/use-active-organization'
import { TemplateBrowseView } from '@/components/templates/template-browse-view'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Wrapper that handles org loading state before rendering the browse view.
 * Passes basePath="/marketplace" so template cards link to the dashboard
 * detail route rather than the public /templates route.
 */
export function MarketplaceBrowseContent() {
  const { activeOrganization, isLoading } = useActiveOrganization()

  /** Show centered spinner while the organization is loading */
  if (isLoading || !activeOrganization) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <TemplateBrowseView
      basePath="/marketplace"
      isAuthenticated
      organizationId={activeOrganization.id}
    />
  )
}
