/**
 * Page View Service (DAL)
 *
 * SOURCE OF TRUTH KEYWORDS: PageView, WebsiteAnalytics, PageTracking, VisitorTracking
 *
 * WHY: Centralized service for tracking page views on live published websites
 * and querying website metrics. This is the ONLY place that should interact
 * with Prisma for PageView records.
 *
 * FEATURES:
 * - trackPageView: Records a visit with 1-hour server-side debounce per visitor+page
 * - UTM source attribution: Updates lead.source when utm_source is present
 * - getWebsiteMetrics: Aggregates total visits, unique visitors, per-page stats
 *
 * DEBOUNCE LOGIC:
 * Same visitorId + pageId within 1 hour = skip (prevents refresh spam).
 * This is enforced server-side for security — client-side debounce alone is bypassable.
 */

import 'server-only'

import { prisma } from '@/lib/config'
import { validateSession } from '@/services/lead-session.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for tracking a page view.
 * Sent by the PageViewTracker client component on published pages.
 *
 * SOURCE OF TRUTH: TrackPageViewInput, PageViewTrack
 */
export interface TrackPageViewInput {
  /** Organization that owns this website */
  organizationId: string
  /** The page being visited */
  pageId: string
  /** Anonymous visitor identifier from localStorage */
  visitorId: string
  /** URL pathname (e.g., "/home", "/about") */
  pathname: string
  /**
   * Raw lead session token from the visitor's cookie/localStorage.
   * The server resolves this to a leadId using the same validateSession() function
   * that powers form auto-population (useLeadSession hook).
   * This avoids race conditions — the client sends the raw token synchronously,
   * and the server does the async validation.
   */
  sessionToken?: string | null
  /** UTM parameters from URL */
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  /** document.referrer value */
  referrer?: string | null
}

/**
 * Result of tracking a page view.
 * Lightweight response to avoid blocking the client.
 */
export interface TrackPageViewResult {
  /** Whether the view was recorded (false = debounced/skipped) */
  recorded: boolean
}

/**
 * Input for querying website metrics.
 *
 * SOURCE OF TRUTH: WebsiteMetricsInput, MetricsQuery
 */
export interface GetWebsiteMetricsInput {
  organizationId: string
  websiteId: string
  /** Start of date range (inclusive) */
  from: Date
  /** End of date range (inclusive) */
  to: Date
}

/**
 * Per-page breakdown in the metrics response.
 */
export interface PageMetric {
  pageId: string
  pageName: string
  pageSlug: string
  totalViews: number
  uniqueVisitors: number
}

/**
 * Response shape for website metrics.
 *
 * SOURCE OF TRUTH: WebsiteMetricsResponse, WebsiteAnalyticsData
 */
export interface WebsiteMetricsResponse {
  /** Total page views across all pages in the date range */
  totalViews: number
  /** Count of distinct visitorIds in the date range */
  uniqueVisitors: number
  /** Breakdown by page */
  pages: PageMetric[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Debounce window in milliseconds: 1 hour */
const DEBOUNCE_WINDOW_MS = 60 * 60 * 1000

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Track a page view with server-side debounce.
 *
 * Flow:
 * 1. If sessionToken provided, resolve leadId via validateSession() (same as form auto-population)
 * 2. Look up the page to get websiteId (server derives it, not the client)
 * 3. Check if same visitorId + pageId exists within the last hour
 * 4. If debounced but leadId is now known, backfill the existing record
 * 5. If new, create PageView record and backfill older anonymous views from same visitor
 * 6. If leadId + utmSource, update lead.source for attribution
 *
 * WHY server-side lead resolution: The client sends the raw session token
 * (synchronous read from cookie/localStorage), and the server validates it
 * using the same validateSession() that powers form auto-population.
 * This avoids the race condition of trying to resolve leadId client-side.
 */
export async function trackPageView(
  input: TrackPageViewInput
): Promise<TrackPageViewResult> {
  try {
    // Resolve leadId from session token server-side.
    // Uses the SAME validateSession() function that powers form auto-population
    // in the useLeadSession hook. No duplicate architecture — one source of truth.
    let leadId: string | null = null

    if (input.sessionToken) {
      const session = await validateSession({
        organizationId: input.organizationId,
        token: input.sessionToken,
      })
      if (session.valid && session.leadId) {
        leadId = session.leadId
      }
    }

    console.log('[PageView Service] trackPageView called:', {
      organizationId: input.organizationId,
      pageId: input.pageId,
      sessionToken: input.sessionToken ? 'PRESENT' : 'NONE',
      resolvedLeadId: leadId ?? 'NULL',
      visitorId: input.visitorId,
      pathname: input.pathname,
    })

    // Look up the page to derive websiteId (never trust client for this)
    const page = await prisma.page.findFirst({
      where: {
        id: input.pageId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        websiteId: true,
      },
    })

    if (!page) {
      // Page doesn't exist or doesn't belong to this org — skip silently
      return { recorded: false }
    }

    // Check debounce: was there a view from this visitor on this page recently?
    const debounceThreshold = new Date(Date.now() - DEBOUNCE_WINDOW_MS)

    const recentView = await prisma.pageView.findFirst({
      where: {
        visitorId: input.visitorId,
        pageId: input.pageId,
        visitedAt: { gte: debounceThreshold },
      },
      select: { id: true, leadId: true },
    })

    if (recentView) {
      console.log('[PageView Service] DEBOUNCED — recent view found:', {
        recentViewId: recentView.id,
        recentViewLeadId: recentView.leadId ?? 'NULL',
        resolvedLeadId: leadId ?? 'NULL',
      })
      // Already tracked within debounce window.
      // BUT if the existing record has no leadId and we now have one,
      // backfill the lead association so it appears in the activity tab.
      if (leadId && !recentView.leadId) {
        console.log('[PageView Service] BACKFILLING leadId on debounced record:', recentView.id)
        await prisma.pageView.update({
          where: { id: recentView.id },
          data: { leadId },
        })
      }
      return { recorded: false }
    }

    console.log('[PageView Service] CREATING new page view with leadId:', leadId ?? 'NULL')

    // Record the page view
    await prisma.pageView.create({
      data: {
        organizationId: input.organizationId,
        websiteId: page.websiteId,
        pageId: input.pageId,
        leadId,
        visitorId: input.visitorId,
        pathname: input.pathname,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        referrer: input.referrer ?? null,
      },
    })

    // If we have a leadId, also backfill any older anonymous page views
    // from this same visitor that were recorded before the lead was identified.
    // This ensures ALL past page visits show in the lead activity timeline,
    // not just visits after the lead was first identified.
    if (leadId) {
      const backfillResult = await prisma.pageView.updateMany({
        where: {
          visitorId: input.visitorId,
          organizationId: input.organizationId,
          leadId: null,
        },
        data: { leadId },
      }).catch(() => {
        // Non-critical — backfill is best-effort
        console.warn('[PageView] Failed to backfill visitor page views:', input.visitorId)
        return { count: 0 }
      })
      console.log('[PageView Service] Backfilled anonymous views:', backfillResult.count)
    }

    // If we have a leadId and utmSource, update lead.source for attribution
    if (leadId && input.utmSource) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { source: input.utmSource },
      }).catch(() => {
        // Non-critical — don't fail the page view tracking if lead update fails
        console.warn('[PageView] Failed to update lead source:', leadId)
      })
    }

    return { recorded: true }
  } catch (error) {
    // Page view tracking should NEVER block or crash the page load
    console.error('[PageView] Error tracking page view:', error)
    return { recorded: false }
  }
}

/**
 * Get website metrics for a date range.
 *
 * Aggregates:
 * - Total page views (count of PageView records)
 * - Unique visitors (count of distinct visitorIds)
 * - Per-page breakdown with views and unique visitors
 *
 * WHY: Powers the website metrics tab in builder settings.
 * HOW: Uses Prisma groupBy for per-page stats, raw count for totals.
 */
export async function getWebsiteMetrics(
  input: GetWebsiteMetricsInput
): Promise<WebsiteMetricsResponse> {
  const { organizationId, websiteId, from, to } = input

  // Run total counts and per-page breakdown in parallel
  const [totalViews, uniqueVisitorsResult, perPageStats, pageDetails] = await Promise.all([
    // Total page views in date range
    prisma.pageView.count({
      where: {
        organizationId,
        websiteId,
        visitedAt: { gte: from, lte: to },
      },
    }),

    // Unique visitors (distinct visitorId count)
    prisma.pageView.findMany({
      where: {
        organizationId,
        websiteId,
        visitedAt: { gte: from, lte: to },
      },
      distinct: ['visitorId'],
      select: { visitorId: true },
    }),

    // Per-page stats: group by pageId, count views
    prisma.pageView.groupBy({
      by: ['pageId'],
      where: {
        organizationId,
        websiteId,
        visitedAt: { gte: from, lte: to },
      },
      _count: { id: true },
    }),

    // Fetch page names/slugs for display
    prisma.page.findMany({
      where: {
        websiteId,
        organizationId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
  ])

  const uniqueVisitors = uniqueVisitorsResult.length

  // Build a map of pageId -> page details for joining
  const pageMap = new Map(pageDetails.map((p) => [p.id, p]))

  // For each page with views, also count unique visitors per page
  const pageMetrics: PageMetric[] = []

  for (const stat of perPageStats) {
    const pageInfo = pageMap.get(stat.pageId)
    if (!pageInfo) continue

    // Count unique visitors for this specific page
    const pageUniqueResult = await prisma.pageView.findMany({
      where: {
        pageId: stat.pageId,
        organizationId,
        websiteId,
        visitedAt: { gte: from, lte: to },
      },
      distinct: ['visitorId'],
      select: { visitorId: true },
    })

    pageMetrics.push({
      pageId: stat.pageId,
      pageName: pageInfo.name,
      pageSlug: pageInfo.slug,
      totalViews: stat._count.id,
      uniqueVisitors: pageUniqueResult.length,
    })
  }

  // Sort pages by total views descending
  pageMetrics.sort((a, b) => b.totalViews - a.totalViews)

  return {
    totalViews,
    uniqueVisitors,
    pages: pageMetrics,
  }
}
