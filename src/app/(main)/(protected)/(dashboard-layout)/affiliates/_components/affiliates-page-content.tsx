'use client'

/**
 * Affiliates Page Content - Active Organization Pattern
 *
 * WHY: Displays affiliate program information for the active organization
 * HOW: Uses useActiveOrganization hook for org context
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSIONS:
 * - affiliate:read - Required to view the affiliates page
 *
 * SOURCE OF TRUTH: ActiveOrganization
 */

import { ContentLayout } from '@/components/global/content-layout'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { AffiliateLinkCard } from '@/components/affiliates/affiliate-link-card'
import { ReferralStatsCard } from '@/components/affiliates/referral-stats-card'

// ============================================================================
// AFFILIATES LOADING SKELETON
// ============================================================================

/**
 * Loading skeleton that matches the affiliates page layout
 * WHY: Provides visual feedback during initial load only
 * HOW: Mimics the structure of the actual page with skeleton placeholders
 */
function AffiliatesPageSkeleton() {
  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Header skeleton */}
        <div>
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-72 mt-2" />
        </div>

        {/* Cards grid skeleton */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Affiliate Link Card skeleton */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-10" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>

          {/* Referral Stats Card skeleton */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <Skeleton className="h-6 w-44" />
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-32" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ContentLayout>
  )
}

// ============================================================================
// MAIN AFFILIATES PAGE CONTENT COMPONENT
// ============================================================================

/**
 * AffiliatesPageContent Component
 *
 * Renders the affiliates page using the Active Organization pattern.
 * Uses useActiveOrganization hook for org context and permission checking.
 */
export function AffiliatesPageContent() {
  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.AFFILIATE_READ)

  /**
   * Show skeleton only on initial load
   * WHY: After initial load, cache is populated and isLoadingOrg is false
   * This means re-navigation renders instantly without skeleton
   */
  if (isLoadingOrg && !activeOrganization) {
    return <AffiliatesPageSkeleton />
  }

  /**
   * No organization found - show error state
   */
  if (!activeOrganization) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </ContentLayout>
    )
  }

  /**
   * Permission denied - show access denied message
   */
  if (!hasAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view affiliates
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                affiliate:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  /**
   * Render affiliates page content
   * Uses ContentLayout for consistent dashboard styling
   */
  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-3xl font-bold">Affiliates</h1>
          <p className="text-muted-foreground mt-2">
            Share your affiliate link and track your referrals
          </p>
        </div>

        {/* Affiliate cards grid */}
        <div className="grid gap-6 md:grid-cols-2">
          <AffiliateLinkCard />
          <ReferralStatsCard />
        </div>
      </div>
    </ContentLayout>
  )
}
