/**
 * Dashboard Analytics Router
 *
 * WHY: Provides real-time analytics data for dashboard charts
 * HOW: Each endpoint fetches data independently for non-blocking chart loading
 *
 * ARCHITECTURE:
 * - Uses organizationProcedure for proper auth/access control
 * - Each chart has its own endpoint for independent data fetching
 * - Supports date range filtering via input parameters
 * - Data is cached with stale-while-revalidate pattern
 *
 * CACHE INVALIDATION:
 * - Dashboard data should be invalidated when transactions are created/updated
 * - Use query keys: ['dashboard', 'recurringRevenue'], ['dashboard', 'totalRevenue'], etc.
 *
 * SOURCE OF TRUTH KEYWORDS: DashboardRouter, AnalyticsEndpoints, ChartDataAPI
 */

import { z } from 'zod'
import { createTRPCRouter, organizationProcedure } from '../init'
import { permissions } from '@/lib/better-auth/permissions'
import * as dashboardService from '@/services/dashboard-analytics.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Date range input schema for all dashboard endpoints
 * SOURCE OF TRUTH: DashboardDateRangeInput
 *
 * NOTE: Uses z.coerce.date() to handle both Date objects and ISO string inputs
 * This is required because tRPC without superjson serializes dates as strings
 */
const dateRangeSchema = z.object({
  organizationId: z.string(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

/**
 * Sales breakdown input with mode option
 * SOURCE OF TRUTH: SalesBreakdownInput
 */
const salesBreakdownSchema = dateRangeSchema.extend({
  mode: z.enum(['count', 'amount']).optional().default('count'),
})

// ============================================================================
// ROUTER
// ============================================================================

export const dashboardRouter = createTRPCRouter({
  /**
   * Get Recurring Revenue (MRR/ARR) data for Chart01
   *
   * WHY: Shows monthly recurring revenue trends
   * HOW: Aggregates RECURRING billing type transactions
   *
   * CACHING: staleTime 5 minutes, invalidate on transaction changes
   */
  getRecurringRevenue: organizationProcedure({ requirePermission: permissions.ANALYTICS_READ })
    .input(dateRangeSchema)
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return await dashboardService.getRecurringRevenueData(
        input.organizationId,
        dateRange
      )
    }),

  /**
   * Get Total Revenue data for Chart02
   *
   * WHY: Shows total revenue trends (all payment types)
   * HOW: Aggregates paidAmount - refundedAmount from all transactions
   *
   * CACHING: staleTime 5 minutes, invalidate on transaction changes
   */
  getTotalRevenue: organizationProcedure({ requirePermission: permissions.ANALYTICS_READ })
    .input(dateRangeSchema)
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return await dashboardService.getTotalRevenueData(input.organizationId, dateRange)
    }),

  /**
   * Get Affiliate Referrals data for Chart04
   *
   * WHY: Shows referral leads and conversions (replaced Refunds chart)
   * HOW: Counts leads with source containing "Referral"
   *
   * CACHING: staleTime 5 minutes, invalidate on lead changes
   */
  getAffiliateReferrals: organizationProcedure({ requirePermission: permissions.ANALYTICS_READ })
    .input(dateRangeSchema)
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return await dashboardService.getAffiliateReferralsData(
        input.organizationId,
        dateRange
      )
    }),

  /**
   * Get Sales Breakdown data for Chart05
   *
   * WHY: Shows sales distribution by billing type
   * HOW: Groups transactions by ONE_TIME, RECURRING, SPLIT_PAYMENT
   *
   * CACHING: staleTime 5 minutes, invalidate on transaction changes
   */
  getSalesBreakdown: organizationProcedure({ requirePermission: permissions.ANALYTICS_READ })
    .input(salesBreakdownSchema)
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return await dashboardService.getSalesBreakdownData(
        input.organizationId,
        dateRange,
        input.mode
      )
    }),

  /**
   * Get Platform / Marketplace Revenue data for Chart06
   *
   * WHY: Shows platform-currency earnings (templates, future merch, affiliates)
   * separately from connect-account revenue
   * HOW: Queries only transactions with metadata.platformPayment === true
   *
   * CACHING: staleTime 5 minutes, invalidate on transaction changes
   */
  getPlatformRevenue: organizationProcedure({ requirePermission: permissions.ANALYTICS_READ })
    .input(dateRangeSchema)
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return await dashboardService.getPlatformRevenueData(input.organizationId, dateRange)
    }),

  /**
   * Get Dashboard Summary (all key metrics)
   *
   * WHY: Quick overview for dashboard header/cards
   * HOW: Parallel fetches all metrics in single request
   *
   * CACHING: staleTime 5 minutes, invalidate on any data changes
   */
  getSummary: organizationProcedure({ requirePermission: permissions.ANALYTICS_READ })
    .input(dateRangeSchema)
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return await dashboardService.getDashboardSummary(input.organizationId, dateRange)
    }),
})
