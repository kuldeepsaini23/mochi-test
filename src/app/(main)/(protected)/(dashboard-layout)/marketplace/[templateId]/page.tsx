/**
 * ============================================================================
 * MARKETPLACE TEMPLATE DETAIL PAGE — Dashboard Route
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: MarketplaceTemplateDetail, DashboardTemplateDetail
 *
 * WHY: Authenticated template detail page at /marketplace/[templateId].
 * Follows the same pattern as the public route (/templates/[templateId])
 * but with backHref="/marketplace" so the "Back to templates" link navigates
 * to the dashboard browse page instead of the public browse page.
 *
 * HOW: Server component that:
 * 1. Extracts templateId from the route params
 * 2. Fetches full template detail via tRPC server caller (getLibraryDetail)
 * 3. Resolves authentication state for install button and owner controls
 * 4. Passes everything to TemplateDetailView with backHref="/marketplace"
 *
 * The detail view handles its own install dialog and owner controls.
 * If the template is not found, we call notFound() to show the 404 page.
 */

import { notFound } from 'next/navigation'
import { headers } from 'next/headers'

import { createCaller } from '@/trpc/server'
import { auth } from '@/lib/better-auth/auth'
import { TemplateDetailView } from '@/components/templates/template-detail-view'

// ============================================================================
// ROUTE PARAMS — Next.js App Router async params pattern
// ============================================================================

interface Props {
  params: Promise<{ templateId: string }>
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function MarketplaceTemplateDetailPage({ params }: Props) {
  const { templateId } = await params

  try {
    /** Fetch the full template detail via the tRPC server caller */
    const caller = await createCaller()
    const template = await caller.templates.getLibraryDetail({ templateId })

    if (!template) {
      notFound()
    }

    /**
     * Resolve authentication state for the install button and owner controls.
     * Since this is a dashboard (protected) route, the user should always be
     * authenticated — but we handle the edge case gracefully.
     */
    let isAuthenticated = false
    let organizationId: string | undefined

    try {
      const requestHeaders = await headers()
      const session = await auth.api.getSession({ headers: requestHeaders })

      if (session?.session) {
        isAuthenticated = true
        organizationId = session.session.activeOrganizationId ?? undefined
      }
    } catch {
      /** Session resolution failed — treat as unauthenticated */
    }

    return (
      <div className="mx-auto max-w-4xl">
        <TemplateDetailView
          template={template}
          /* Price will be on TemplateDetail once backend adds it to TemplateListItem */
          price={(template as { price?: number | null }).price}
          isAuthenticated={isAuthenticated}
          organizationId={organizationId}
          backHref="/marketplace"
        />
      </div>
    )
  } catch {
    notFound()
  }
}
