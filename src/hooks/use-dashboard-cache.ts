/**
 * Dashboard Cache Invalidation Hook
 *
 * WHY: Provides utilities to invalidate dashboard chart cache after mutations
 * HOW: Uses tRPC utils to invalidate specific dashboard queries
 *
 * USAGE:
 * Call `invalidateDashboard()` after any mutation that affects dashboard data:
 * - Transaction updates, cancellations, refunds
 * - Lead conversions (affects affiliate referrals)
 * - Any data changes that should reflect in charts
 *
 * CACHE STRATEGY:
 * - Dashboard queries use staleTime: 5 minutes
 * - Invalidation marks queries as stale, triggering refetch on next access
 * - Does NOT block the UI - refetch happens in background
 *
 * SOURCE OF TRUTH KEYWORDS: DashboardCache, CacheInvalidation, ChartRefresh
 */

import { trpc } from '@/trpc/react-provider'

/**
 * useDashboardCache Hook
 *
 * WHY: Provides functions to invalidate dashboard cache
 * HOW: Uses tRPC utils to mark dashboard queries as stale
 *
 * @example
 * ```tsx
 * function RefundButton() {
 *   const { invalidateDashboard } = useDashboardCache()
 *   const refundMutation = trpc.transactions.refundTransaction.useMutation({
 *     onSuccess: () => {
 *       invalidateDashboard()
 *     }
 *   })
 * }
 * ```
 */
export function useDashboardCache() {
  const utils = trpc.useUtils()

  /**
   * Invalidate all dashboard queries
   *
   * WHY: Call this after any mutation that affects dashboard data
   * HOW: Marks all dashboard queries as stale
   *
   * EFFECT: Next time charts are viewed, they will refetch fresh data
   */
  const invalidateDashboard = () => {
    // Invalidate all dashboard queries in parallel
    void utils.dashboard.getRecurringRevenue.invalidate()
    void utils.dashboard.getTotalRevenue.invalidate()
    void utils.dashboard.getAffiliateReferrals.invalidate()
    void utils.dashboard.getSalesBreakdown.invalidate()
    void utils.dashboard.getSummary.invalidate()
  }

  /**
   * Invalidate only revenue-related queries
   *
   * WHY: Use when mutation only affects revenue (transactions, refunds)
   * HOW: Invalidates recurring revenue, total revenue, sales breakdown
   */
  const invalidateRevenueCharts = () => {
    void utils.dashboard.getRecurringRevenue.invalidate()
    void utils.dashboard.getTotalRevenue.invalidate()
    void utils.dashboard.getSalesBreakdown.invalidate()
    void utils.dashboard.getSummary.invalidate()
  }

  /**
   * Invalidate only referrals-related queries
   *
   * WHY: Use when mutation only affects leads/referrals
   * HOW: Invalidates affiliate referrals chart
   */
  const invalidateReferralsChart = () => {
    void utils.dashboard.getAffiliateReferrals.invalidate()
    void utils.dashboard.getSummary.invalidate()
  }

  /**
   * Refetch all dashboard queries immediately
   *
   * WHY: Force immediate data refresh (blocks UI until complete)
   * HOW: Calls refetch on all dashboard queries
   *
   * NOTE: Use sparingly - prefer invalidate for better UX
   */
  const refetchDashboard = async () => {
    await Promise.all([
      utils.dashboard.getRecurringRevenue.refetch(),
      utils.dashboard.getTotalRevenue.refetch(),
      utils.dashboard.getAffiliateReferrals.refetch(),
      utils.dashboard.getSalesBreakdown.refetch(),
      utils.dashboard.getSummary.refetch(),
    ])
  }

  return {
    /**
     * Invalidate all dashboard queries
     * Non-blocking - refetch happens on next access
     */
    invalidateDashboard,

    /**
     * Invalidate revenue-related charts only
     * Use after: transaction updates, refunds, cancellations
     */
    invalidateRevenueCharts,

    /**
     * Invalidate referrals chart only
     * Use after: lead status changes, referral source updates
     */
    invalidateReferralsChart,

    /**
     * Force immediate refetch of all dashboard data
     * Blocking - waits for all queries to complete
     */
    refetchDashboard,
  }
}

/**
 * Dashboard Query Keys
 *
 * WHY: Export query key helpers for advanced cache manipulation
 * HOW: Use with queryClient.invalidateQueries() directly
 *
 * NOTE: Prefer useDashboardCache hook for most use cases
 */
export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  recurringRevenue: ['dashboard', 'getRecurringRevenue'] as const,
  totalRevenue: ['dashboard', 'getTotalRevenue'] as const,
  affiliateReferrals: ['dashboard', 'getAffiliateReferrals'] as const,
  salesBreakdown: ['dashboard', 'getSalesBreakdown'] as const,
  summary: ['dashboard', 'getSummary'] as const,
}
