/**
 * PAGE CACHE — Redis-Based Caching for Published Websites
 *
 * WHY: Published website pages trigger 3-4+ DB queries per visitor request with
 * zero caching. Page data only changes when someone publishes, edits components,
 * or modifies CMS rows — yet we re-query Postgres on every hit.
 *
 * HOW: Upstash Redis caches three layers of data:
 * 1. Page shell (canvas + components + metadata) — keyed by domain + slug
 * 2. CMS list data (public infinite scroll rows) — keyed by table + pagination params
 * 3. Custom branding boolean — keyed by organization ID
 *
 * GRACEFUL DEGRADATION: All Redis operations are wrapped in try/catch.
 * If Redis is unavailable, every function falls back silently — visitors
 * still get pages from Postgres, just slower.
 *
 * INVALIDATION: Cache is proactively cleared when data changes (publish, CMS edit, etc.)
 * TTL acts as a safety net in case an invalidation is missed.
 *
 * SOURCE OF TRUTH: PageCache, PublishedPageRedisCache, CmsPublicRowsCache
 */

import { redis } from '@/lib/redis'
import { prisma } from '@/lib/config/prisma'
import { checkBooleanFeature } from '@/services/feature-gate.service'

// ============================================================================
// TYPES — SOURCE OF TRUTH: CmsSnapshot, CachedPublishedPageData
// ============================================================================

/**
 * SOURCE OF TRUTH: CmsSnapshot — Baked first page of CMS data for one SmartCMS List element.
 *
 * Created at publish time by scanning elements for `smartcms-list` type and fetching
 * the first page of CMS rows. Stored in publishedCanvasData.cmsSnapshots keyed by element ID.
 *
 * Shape is compatible with useInfiniteQuery's page format — the SmartCmsListRenderer
 * uses it directly as initialData to render the list instantly without client-side fetch.
 */
export interface CmsSnapshot {
  rows: Array<{ id: string; values: Record<string, unknown>; order: number }>
  nextCursor: number | undefined
  hasMore: boolean
}

/**
 * Shape of the published page data stored in Redis.
 * Must match the return type of the `getPublishedPage` tRPC query.
 */
export interface CachedPublishedPageData {
  pageId: string
  pageName: string
  slug: string
  websiteName: string | undefined
  domainName: string | null | undefined
  organizationId: string | undefined
  elements: unknown[]
  publishedAt: Date | null
  components: Record<string, unknown>
  chatWidgetId: string | null
  /**
   * Whether e-commerce is enabled for this website.
   * Gates navbar cart button visibility on published pages.
   * Optional for backward compatibility with cached pages before this field existed.
   */
  enableEcommerce?: boolean
  /**
   * Baked CMS data for SmartCMS List elements, keyed by element ID.
   * Populated at publish time — contains the first page of CMS rows.
   * Optional for backward compatibility with pages published before this feature.
   */
  cmsSnapshots?: Record<string, CmsSnapshot>
  /**
   * SEO metadata for generating proper <head> tags on published pages.
   * Optional for backward compatibility with cached pages before SEO was added.
   * SOURCE OF TRUTH: PageSeo, PageMetadata, SeoFields
   */
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: string | null
  noIndex?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Cache key prefix for published page shells */
const PAGE_PREFIX = 'pp'

/** Cache key prefix for CMS public row query results */
const CMS_PREFIX = 'cms'

/** Cache key prefix for custom branding boolean */
const BRANDING_PREFIX = 'cb'

/** Cache key prefix for CMS table → website ID reverse mapping (Redis SET) */
const CMS_WEB_PREFIX = 'cmsw'

/** 24 hours in seconds — safety net TTL for page shells */
const PAGE_TTL_SECONDS = 60 * 60 * 24

/** 1 hour in seconds — TTL for CMS data and branding checks */
const SHORT_TTL_SECONDS = 60 * 60

// ============================================================================
// PAGE SHELL CACHE
// ============================================================================

/**
 * Build the Redis key for a cached published page.
 *
 * WHY: The visitor's URL determines the key — domain can be a custom domain,
 * a previewId, or even a websiteId (fallback). Slug is the page path.
 */
function buildPageKey(domain: string, slug: string): string {
  return `${PAGE_PREFIX}:${domain}:${slug}`
}

/**
 * Get a cached published page from Redis.
 *
 * RETURNS: The cached page data (strongly typed), or null on miss / Redis failure.
 */
export async function getCachedPublishedPage(
  domain: string,
  slug: string
): Promise<CachedPublishedPageData | null> {
  try {
    const data = await redis.get<CachedPublishedPageData>(buildPageKey(domain, slug))
    return data ?? null
  } catch {
    /* Redis down — fall through to DB */
    return null
  }
}

/**
 * Write a published page response into Redis cache.
 *
 * WHY: After the DB query resolves, we store the result so the next visitor
 * gets it from Redis in ~5ms instead of multiple DB round-trips.
 *
 * Fire-and-forget — caller does NOT await this.
 */
export async function cachePublishedPage(
  domain: string,
  slug: string,
  data: CachedPublishedPageData
): Promise<void> {
  try {
    await redis.set(buildPageKey(domain, slug), data, { ex: PAGE_TTL_SECONDS })
  } catch {
    /* Redis down — silently skip caching */
  }
}

/**
 * Invalidate the cache for a specific page (by domain + slug).
 *
 * WHY: Called after publish/unpublish when we know the exact page.
 */
export async function invalidatePageCache(
  domain: string,
  slug: string
): Promise<void> {
  try {
    await redis.del(buildPageKey(domain, slug))
  } catch {
    /* Redis down — cache will expire via TTL */
  }
}

/**
 * Invalidate ALL cached pages belonging to a website.
 *
 * WHY: When a local component changes, website settings change, or ecommerce
 * is toggled — ALL pages for that website may be affected.
 *
 * HOW:
 * 1. Query DB for the website's domain identifiers (customDomain, previewId)
 * 2. Query DB for all published page slugs in this website
 * 3. Pipeline-delete every possible cache key combination
 *
 * The DB queries are cheap (only runs on admin actions, never on visitor traffic).
 */
export async function invalidateWebsitePageCache(websiteId: string): Promise<void> {
  try {
    /* Fetch all domain identifiers this website is accessible through */
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      select: {
        previewId: true,
        domain: {
          select: { customDomain: true },
        },
      },
    })

    if (!website) return

    /* Collect every possible "domain name" a visitor might use in the URL */
    const domainIdentifiers: string[] = []
    if (website.domain?.customDomain) domainIdentifiers.push(website.domain.customDomain)
    if (website.previewId) domainIdentifiers.push(website.previewId)
    /* Fallback: websiteId can also be used as domain name */
    domainIdentifiers.push(websiteId)

    if (domainIdentifiers.length === 0) return

    /* Fetch all published page slugs for this website */
    const pages = await prisma.page.findMany({
      where: {
        websiteId,
        status: 'PUBLISHED',
        deletedAt: null,
      },
      select: { slug: true },
    })

    if (pages.length === 0) return

    /* Build and delete all cache keys in a pipeline */
    const keysToDelete: string[] = []
    for (const identifier of domainIdentifiers) {
      for (const page of pages) {
        keysToDelete.push(buildPageKey(identifier, page.slug))
      }
    }

    /* Upstash redis.del() accepts multiple keys */
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete)
    }
  } catch {
    /* Redis down — cache will expire via TTL */
  }
}

// ============================================================================
// CMS PUBLIC ROWS CACHE
// ============================================================================

/**
 * Build the Redis key for a cached CMS public row query.
 *
 * WHY: Each unique combination of pagination params produces different results.
 * Cursor-based pagination means each "page" of infinite scroll gets its own key.
 */
function buildCmsKey(
  tableId: string,
  cursor: number | undefined,
  limit: number,
  sortOrder: string,
  rangeStart?: number,
  rangeEnd?: number
): string {
  /* Use 'x' for undefined values to keep the key short but unique */
  const c = cursor ?? 'x'
  const rs = rangeStart ?? 'x'
  const re = rangeEnd ?? 'x'
  return `${CMS_PREFIX}:${tableId}:pub:${c}:${limit}:${sortOrder}:${rs}:${re}`
}

/**
 * Get cached CMS public rows from Redis.
 *
 * RETURNS: The cached query result, or null on miss / Redis failure.
 */
export async function getCachedCmsPublicRows(
  tableId: string,
  cursor: number | undefined,
  limit: number,
  sortOrder: string,
  rangeStart?: number,
  rangeEnd?: number
): Promise<Record<string, unknown> | null> {
  try {
    const data = await redis.get<Record<string, unknown>>(
      buildCmsKey(tableId, cursor, limit, sortOrder, rangeStart, rangeEnd)
    )
    return data ?? null
  } catch {
    return null
  }
}

/**
 * Write CMS public row query results into Redis cache.
 *
 * Fire-and-forget — caller does NOT await this.
 */
export async function cacheCmsPublicRows(
  tableId: string,
  cursor: number | undefined,
  limit: number,
  sortOrder: string,
  rangeStart: number | undefined,
  rangeEnd: number | undefined,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await redis.set(
      buildCmsKey(tableId, cursor, limit, sortOrder, rangeStart, rangeEnd),
      data,
      { ex: SHORT_TTL_SECONDS }
    )
  } catch {
    /* Redis down — silently skip caching */
  }
}

/**
 * Invalidate ALL cached query results for a CMS table.
 *
 * WHY: When rows/columns change, any cached pagination page could be stale.
 * We use SCAN to find and delete all keys matching the table's prefix.
 *
 * HOW: Upstash SCAN iterates through keys matching a pattern. We batch-delete
 * all matching keys. This is safe because:
 * - SCAN is non-blocking (unlike KEYS)
 * - Only runs on admin CMS edits, never on visitor traffic
 */
export async function invalidateCmsTableCache(tableId: string): Promise<void> {
  try {
    const pattern = `${CMS_PREFIX}:${tableId}:pub:*`
    const keysToDelete: string[] = []

    /* Scan all matching keys — Upstash SCAN returns [cursor, keys] */
    let scanCursor: number = 0
    do {
      const result = await redis.scan(scanCursor, {
        match: pattern,
        count: 100,
      })
      scanCursor = Number(result[0])
      keysToDelete.push(...result[1])
    } while (scanCursor !== 0)

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete)
    }
  } catch {
    /* Redis down — cache will expire via TTL */
  }
}

// ============================================================================
// CMS TABLE → WEBSITE REVERSE MAPPING
// ============================================================================
//
// WHY: When CMS data changes, we need to know which websites are affected so
// we can invalidate their page caches (which contain baked CMS snapshots).
//
// HOW: At publish time, for each SmartCMS List element, we register the mapping
// tableId → websiteId in a Redis SET. When CMS rows/columns change, we look up
// the mapping and invalidate all affected website page caches.
//
// LIFECYCLE: The mapping TTL matches the page cache TTL (24h). Each publish
// refreshes the TTL. Stale mappings (unpublished pages) expire on their own —
// invalidating a non-existent cache key is a harmless no-op.

/**
 * Register that a CMS table is used by a website's published pages.
 *
 * WHY: Called at publish time so we know which websites to invalidate
 * when CMS data changes.
 *
 * HOW: Adds websiteId to a Redis SET keyed by tableId. If the table is
 * used by multiple websites, the SET accumulates all of them.
 */
export async function registerCmsTableMapping(
  tableId: string,
  websiteId: string
): Promise<void> {
  try {
    const key = `${CMS_WEB_PREFIX}:${tableId}`
    await redis.sadd(key, websiteId)
    /* Refresh TTL on each publish — keeps active mappings alive */
    await redis.expire(key, PAGE_TTL_SECONDS)
  } catch {
    /* Redis down — mapping won't be registered but pages still work */
  }
}

/**
 * Check if a CMS table is displayed on any published website.
 *
 * WHY: Used by the CMS UI to show a warning banner when editing data
 * that is live on a published website.
 *
 * RETURNS: true if at least one website uses this table, false otherwise.
 */
export async function isCmsTableLive(tableId: string): Promise<boolean> {
  try {
    const count = await redis.scard(`${CMS_WEB_PREFIX}:${tableId}`)
    return (count ?? 0) > 0
  } catch {
    /* Redis down — assume not live (safer than blocking edits) */
    return false
  }
}

/**
 * Invalidate ALL caches related to a CMS table change:
 * 1. CMS public row query cache (pagination pages for infinite scroll)
 * 2. Published page caches for every website that displays this table
 *
 * WHY: When CMS rows/columns change, both the dynamic infinite scroll data
 * AND the baked CMS snapshots in page caches are stale. This function is the
 * single call that handles both — replaces standalone `invalidateCmsTableCache`.
 *
 * FIRE-AND-FORGET: Callers do not await this. Cache misses fall back to DB.
 */
export async function invalidateCmsRelatedCaches(tableId: string): Promise<void> {
  /* Step 1: Invalidate CMS row query cache (same as before) */
  await invalidateCmsTableCache(tableId)

  /* Step 2: Look up which websites use this table and invalidate their page caches */
  try {
    const websiteIds = await redis.smembers(`${CMS_WEB_PREFIX}:${tableId}`)
    if (!websiteIds || websiteIds.length === 0) return

    /* Invalidate page caches for each affected website */
    const invalidations = websiteIds.map((wsId) => invalidateWebsitePageCache(wsId))
    await Promise.all(invalidations)
  } catch {
    /* Redis down — page caches will expire via TTL */
  }
}

// ============================================================================
// CUSTOM BRANDING CACHE
// ============================================================================

/**
 * Get the cached custom_branding boolean for an organization, or fetch + cache it.
 *
 * WHY: `checkBooleanFeature()` hits the DB every request to look up the org's tier.
 * The result only changes when the org's subscription changes — rare event.
 *
 * HOW: Check Redis first. On miss, call the original DB function, cache the result,
 * and return it. This is a "read-through" cache pattern.
 */
export async function getCustomBrandingCached(
  organizationId: string
): Promise<boolean> {
  try {
    const cached = await redis.get<boolean>(`${BRANDING_PREFIX}:${organizationId}`)
    if (cached !== null && cached !== undefined) return cached
  } catch {
    /* Redis down — fall through to DB */
  }

  /* Cache miss or Redis failure — query the DB */
  const result = await checkBooleanFeature(organizationId, 'custom_branding')

  /* Fire-and-forget cache write */
  try {
    await redis.set(`${BRANDING_PREFIX}:${organizationId}`, result, {
      ex: SHORT_TTL_SECONDS,
    })
  } catch {
    /* Redis down — skip caching */
  }

  return result
}

/**
 * Invalidate the cached custom_branding boolean for an organization.
 *
 * WHY: Called when subscription/tier changes so the next visitor gets fresh data.
 */
export async function invalidateCustomBranding(
  organizationId: string
): Promise<void> {
  try {
    await redis.del(`${BRANDING_PREFIX}:${organizationId}`)
  } catch {
    /* Redis down — 1h TTL will handle it */
  }
}
