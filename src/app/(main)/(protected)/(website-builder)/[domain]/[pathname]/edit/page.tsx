/**
 * ============================================================================
 * WEBSITE BUILDER - Edit Mode
 * ============================================================================
 *
 * ROUTE: /[domain]/[pathname]/edit
 *
 * Renders the website builder in edit mode for a specific page.
 * The pathname segment corresponds to the page slug being edited.
 *
 * ============================================================================
 * ARCHITECTURE: Domain → Website (Category) → Pages
 * ============================================================================
 *
 * KEY CONCEPT: A "Website" is NOT a single page - it's a CATEGORY/GROUPING.
 * The pathname refers to a PAGE's slug within the domain's website.
 *
 * DYNAMIC PAGE PREVIEW:
 * For dynamic pages (connected to CMS tables), the first CMS row is
 * automatically fetched for preview. Users can see how the template
 * looks with real data while editing.
 *
 * ============================================================================
 * PERMISSION CHECKS
 * ============================================================================
 *
 * - WEBSITES_READ permission required
 * - Checked using cached organization data (zero DB calls)
 * - All queries scoped to user's organization
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import { BuilderClient } from '@/components/website-builder/builder-v1.2/[id]/builder-client'
import { CanvasLoader } from '@/components/website-builder/builder-v1.2/_components/canvas'

/**
 * Props for the edit page component.
 * pathname is the page slug to edit.
 */
interface EditPageProps {
  params: Promise<{
    domain: string
    pathname: string
  }>
}

/**
 * Server component that prefetches builder data and passes to client.
 */
export default async function WebsiteEditPage({ params }: EditPageProps) {
  const queryClient = getQueryClient()

  // Await the params promise (Next.js 15 async params)
  const { domain, pathname: pageSlug } = await params

  // Validate page slug
  if (!pageSlug) {
    redirect('/sites/websites')
  }

  // Get active organization from cache (prefetched in layout)
  // Uses getActiveOrganization which respects domain-first approach
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  // Handle no organization case
  if (!activeOrg) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-2 p-6">
          <p className="text-sm text-destructive font-medium">
            No organization found
          </p>
          <p className="text-xs text-muted-foreground">
            Please contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  // Check permission using cached data (zero DB calls)
  const hasAccess =
    activeOrg.role === 'owner' ||
    activeOrg.permissions.includes(permissions.WEBSITES_READ)

  if (!hasAccess) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-2 p-6">
          <p className="text-sm text-destructive font-medium">
            You don&apos;t have permission to edit websites
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              websites:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  /**
   * Prefetch builder data using the dedicated builder router.
   * This finds the WEBSITE that contains a page with the matching page slug.
   *
   * THREE-PHASE LOOKUP:
   * 1. previewId match (e.g., "4-R-n5By")
   * 2. customDomain match (e.g., "webprodigies.com")
   * 3. websiteId fallback (e.g., "cmj28gluc00018...")
   *
   * If all phases fail, we redirect back to the websites list.
   */
  console.log('[builder-edit] Looking up page:', {
    organizationId: activeOrg.id,
    domainName: domain,
    pageSlug: pageSlug,
  })

  const builderData = await queryClient
    .fetchQuery(
      trpc.builder.getDataByPageSlug.queryOptions({
        organizationId: activeOrg.id,
        domainName: domain,
        pageSlug: pageSlug,
      })
    )
    .catch((error: unknown) => {
      /* Log the actual error so we can diagnose lookup failures.
         Without this, the redirect silently swallows all errors. */
      console.error('[builder-edit] Failed to load page data:', {
        domainName: domain,
        pageSlug,
        organizationId: activeOrg.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    })

  // Page not found — redirect to websites list with context
  if (!builderData) {
    console.warn('[builder-edit] No builder data found, redirecting to /sites/websites', {
      domainName: domain,
      pageSlug,
    })
    redirect('/sites/websites')
  }

  // ========================================================================
  // CRITICAL: Prefetch builder.getDataById for BuilderClient
  // ========================================================================
  await queryClient.fetchQuery(
    trpc.builder.getDataById.queryOptions({
      organizationId: activeOrg.id,
      pageId: builderData.pageId,
    })
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<CanvasLoader isVisible={true} />}>
        <BuilderClient
          pageId={builderData.pageId}
          organizationId={activeOrg.id}
          initialPathname={pageSlug}
        />
      </Suspense>
    </HydrationBoundary>
  )
}
