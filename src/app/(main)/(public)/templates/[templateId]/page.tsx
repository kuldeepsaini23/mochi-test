/**
 * ============================================================================
 * PUBLIC TEMPLATE DETAIL PAGE
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateDetailPublicPage, TemplateDetailRoute
 *
 * WHY: Public-facing template detail page. Fetches the full template detail
 * server-side via tRPC caller, then passes it to the TemplateDetailView
 * client component for interactive rendering (install button, owner controls).
 *
 * HOW: Server component that:
 * 1. Extracts templateId from route params
 * 2. Fetches template via public tRPC getLibraryDetail procedure
 * 3. Optionally resolves auth session to determine isAuthenticated + orgId
 * 4. Passes everything to TemplateDetailView for client-side rendering
 *
 * The detail view handles its own install dialog and owner controls.
 * If the template is not found, we call notFound() to show the 404 page.
 */

import { notFound } from 'next/navigation'
import { headers } from 'next/headers'

import { createCaller } from '@/trpc/server'
import { auth } from '@/lib/better-auth/auth'
import { TemplateDetailView } from '@/components/templates/template-detail-view'

interface Props {
  params: Promise<{ templateId: string }>
}

export default async function TemplateDetailPage({ params }: Props) {
  const { templateId } = await params

  try {
    const caller = await createCaller()
    const template = await caller.templates.getLibraryDetail({ templateId })

    if (!template) {
      notFound()
    }

    /**
     * Resolve authentication state for the install button and owner controls.
     * If the user is logged in, we pass their active org's ID so the detail
     * view can check install status and show owner-only actions.
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
      <div className="mx-auto max-w-7xl px-6 py-16">
        <TemplateDetailView
          template={template}
          /* Price will be on TemplateDetail once backend adds it to TemplateListItem */
          price={(template as { price?: number | null }).price}
          isAuthenticated={isAuthenticated}
          organizationId={organizationId}
          backHref="/templates"
        />
      </div>
    )
  } catch {
    notFound()
  }
}
