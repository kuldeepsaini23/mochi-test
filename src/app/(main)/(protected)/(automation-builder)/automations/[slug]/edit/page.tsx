/**
 * ============================================================================
 * AUTOMATION BUILDER PAGE
 * ============================================================================
 *
 * Server component page for the automation builder.
 * Loads automation data by slug and renders the AutomationBuilder component.
 *
 * ROUTE: /automations/[slug]/edit
 *
 * ARCHITECTURE:
 * - Server component handles organization context
 * - Passes data to client AutomationBuilderWrapper component
 * - AutomationBuilderWrapper handles state and mutations
 *
 * SOURCE OF TRUTH: Automation, AutomationBuilderTypes
 */

import { getQueryClient, trpc } from '@/trpc/server'
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { handleAuthError } from '@/lib/errors'
import { AutomationBuilderWrapper } from './_components/automation-builder-wrapper'

// ============================================================================
// TYPES
// ============================================================================

interface AutomationBuilderPageProps {
  params: Promise<{
    slug: string
  }>
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function AutomationBuilderPage({ params }: AutomationBuilderPageProps) {
  const { slug } = await params
  const queryClient = getQueryClient()

  /**
   * Get active organization from cached data.
   * Uses getActiveOrganization which respects domain-first approach.
   */
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  if (!activeOrg) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AutomationBuilderWrapper
        organizationId={activeOrg.id}
        slug={slug}
      />
    </HydrationBoundary>
  )
}
