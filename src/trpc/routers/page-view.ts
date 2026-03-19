/**
 * ============================================================================
 * PAGE VIEW ROUTER - Website Analytics & Page Visit Tracking
 * ============================================================================
 *
 * tRPC router for page view tracking and website metrics.
 *
 * PUBLIC ENDPOINTS (no auth required):
 * - track: Record a page view from a published website visitor
 *
 * PROTECTED ENDPOINTS (admin only):
 * - getMetrics: Get aggregated website metrics for a date range
 *
 * SOURCE OF TRUTH KEYWORDS: PageView, WebsiteAnalytics, PageTracking, VisitorTracking
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  baseProcedure,
  organizationProcedure,
} from '../init'
import { permissions } from '@/lib/better-auth/permissions'
import * as pageViewService from '@/services/page-view.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for tracking a page view.
 *
 * Sent by the PageViewTracker client component on published pages.
 * visitorId is a browser-generated UUID from localStorage.
 */
const trackPageViewSchema = z.object({
  /** Organization that owns this website */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The page being visited */
  pageId: z.string().min(1, 'Page ID is required'),
  /** Anonymous visitor identifier from localStorage */
  visitorId: z.string().min(1, 'Visitor ID is required'),
  /** URL pathname (e.g., "/home", "/about") */
  pathname: z.string(),
  /**
   * Raw lead session token from cookie/localStorage.
   * The SERVER resolves this to a leadId — we never trust the client to send a leadId directly.
   * Uses the same session token architecture as form auto-population (useLeadSession).
   */
  sessionToken: z.string().nullable().optional(),
  /** UTM parameters from URL */
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  /** document.referrer value */
  referrer: z.string().nullable().optional(),
})

/**
 * Schema for querying website metrics.
 */
const getWebsiteMetricsSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  websiteId: z.string().min(1, 'Website ID is required'),
  /** ISO date strings for the date range */
  from: z.string().min(1, 'Start date is required'),
  to: z.string().min(1, 'End date is required'),
})

// ============================================================================
// ROUTER
// ============================================================================

export const pageViewRouter = createTRPCRouter({
  // ==========================================================================
  // PUBLIC ENDPOINTS (No authentication required)
  // ==========================================================================

  /**
   * Track a page view on a published website.
   *
   * PUBLIC - No auth required. Called from the PageViewTracker component
   * rendered on live published pages.
   *
   * Server-side debounce: Same visitorId + pageId within 1 hour = skip.
   * This prevents refresh spam while keeping the endpoint lightweight.
   *
   * @example
   * ```ts
   * await trpc.pageView.track.mutate({
   *   organizationId: 'org_xxx',
   *   pageId: 'page_xxx',
   *   visitorId: 'uuid-from-localstorage',
   *   pathname: '/home',
   *   utmSource: 'google',
   * })
   * ```
   */
  track: baseProcedure
    .input(trackPageViewSchema)
    .mutation(async ({ input }) => {
      return await pageViewService.trackPageView({
        organizationId: input.organizationId,
        pageId: input.pageId,
        visitorId: input.visitorId,
        pathname: input.pathname,
        sessionToken: input.sessionToken,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        referrer: input.referrer,
      })
    }),

  // ==========================================================================
  // PROTECTED ENDPOINTS (Admin only)
  // ==========================================================================

  /**
   * Get aggregated website metrics for a date range.
   *
   * PROTECTED - Requires websites:read permission.
   *
   * Returns total views, unique visitors, and per-page breakdown
   * for the specified website and date range.
   *
   * @example
   * ```ts
   * const metrics = await trpc.pageView.getMetrics.query({
   *   organizationId: 'org_xxx',
   *   websiteId: 'web_xxx',
   *   from: '2025-01-01T00:00:00.000Z',
   *   to: '2025-12-31T23:59:59.999Z',
   * })
   * ```
   */
  getMetrics: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getWebsiteMetricsSchema)
    .query(async ({ input }) => {
      return await pageViewService.getWebsiteMetrics({
        organizationId: input.organizationId,
        websiteId: input.websiteId,
        from: new Date(input.from),
        to: new Date(input.to),
      })
    }),
})
