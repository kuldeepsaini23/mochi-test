'use client'

/**
 * Dashboard Content - Client Component with Active Organization Hook
 *
 * WHY: Displays dashboard charts for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 * - DashboardDateRangeProvider shares date range across all charts
 * - Each chart fetches data independently (non-blocking loads)
 *
 * CHART VISIBILITY:
 * - Chart01: Recurring Revenue (MRR/ARR) - always visible
 * - Chart02: Total Revenue - always visible
 * - Chart03: MRR Growth - HIDDEN by default (customization add-on)
 * - Chart04: Affiliate Referrals - always visible
 * - Chart05: Sales Breakdown - always visible (next to Chart04)
 * - Chart06: Marketplace Revenue - auto-hides when no platform payments exist
 *
 * Search Keywords: SOURCE OF TRUTH, DASHBOARD CONTENT, ACTIVE ORGANIZATION
 */

import { Chart01 } from './chart-01'
import { Chart02 } from './chart-02'
import { Chart03 } from './chart-03'
import { Chart04 } from './chart-04'
import { Chart05 } from './chart-05'
import { Chart06 } from './chart-06'
import { DashboardDatePicker } from './dashboard-date-picker'
import { ContentLayout } from '@/components/global/content-layout'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { DashboardDateRangeProvider } from '@/hooks/use-dashboard-date-range'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'

// ============================================================================
// DASHBOARD LOADING SKELETON
// ============================================================================

/**
 * Loading skeleton that matches the dashboard layout
 * WHY: Provides visual feedback during initial load only
 */
function DashboardSkeleton() {
  return (
    <ContentLayout>
      <div className="overflow-hidden">
        <div className="grid auto-rows-min @2xl:grid-cols-2 sm:gap-4 bg-muted/50 sm:p-4 p-2 gap-2 rounded-xl">
          <Skeleton className="h-[350px] rounded-xl" />
          <Skeleton className="h-[350px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
      </div>
    </ContentLayout>
  )
}

// ============================================================================
// MAIN DASHBOARD CONTENT COMPONENT
// ============================================================================

/**
 * DashboardContent Component
 *
 * Renders the dashboard charts using the active organization context.
 * Uses useActiveOrganization hook for proper multi-tenant support.
 *
 * CHART DATA FLOW:
 * 1. DashboardDateRangeProvider wraps all charts
 * 2. Each chart uses useDashboardDateRange() hook to get current date range
 * 3. Each chart fetches its own data independently (non-blocking)
 * 4. Date changes trigger all charts to refetch via React Query
 */
export function DashboardContent() {
  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading, hasPermission } = useActiveOrganization()

  /**
   * Check analytics permission using hook helper
   * Owners have full access, members need explicit permission
   */
  const hasAnalyticsAccess = hasPermission(permissions.ANALYTICS_READ)

  /**
   * Show skeleton only on initial load
   * WHY: After initial load, cache is populated and isLoading is false
   * This means re-navigation renders instantly without skeleton
   */
  if (isLoading && !activeOrganization) {
    return <DashboardSkeleton />
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
  if (!hasAnalyticsAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view the dashboard
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                analytics:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  /**
   * Render dashboard charts wrapped in date range provider
   *
   * PROVIDER PLACEMENT:
   * - DashboardDateRangeProvider wraps the entire chart grid
   * - DashboardDatePicker in header allows date range selection
   * - All charts consume date range from context
   */
  return (
    <DashboardDateRangeProvider>
      <ContentLayout headerActions={<DashboardDatePicker />}>
        <div className="overflow-hidden">
          <div className="grid auto-rows-min @2xl:grid-cols-2 sm:gap-4 bg-muted/50 sm:p-4 p-2 gap-2 rounded-xl">
            {/* Chart01: Recurring Revenue (MRR/ARR) - always visible */}
            <Chart01 />

            {/* Chart02: Total Revenue - always visible */}
            <Chart02 />

            {/**
             * Chart03: MRR Growth - HIDDEN by default
             * This chart is a customization add-on that users can enable
             * in their dashboard settings. When enabled, it shows MRR growth
             * with churn breakdown.
             *
             * To enable: pass enabled={true}
             * Future: This will be controlled by user preferences
             */}
            <Chart03 enabled={false} />

            {/* Chart04: Affiliate Referrals - always visible */}
            <Chart04 />

            {/* Chart05: Sales Breakdown - always visible */}
            <Chart05 />

            {/**
             * Chart06: Marketplace Revenue - auto-hides when no platform payments exist.
             * Shows platform-currency earnings (template sales, merch, affiliates)
             * separately from connect-account revenue. Spans full width.
             */}
            <Chart06 />
          </div>
        </div>
      </ContentLayout>
    </DashboardDateRangeProvider>
  )
}
