/**
 * ============================================================================
 * WEBSITES ROUTER - Website Category Operations
 * ============================================================================
 *
 * tRPC router for website (category/grouping) management operations.
 *
 * ============================================================================
 * ARCHITECTURE: Organization → Domain → Website (Category) → Page[]
 * ============================================================================
 *
 * KEY CONCEPT: A "Website" is NOT a single page - it's a CATEGORY/GROUPING.
 *
 * HIERARCHY:
 * - Domain: A namespace (e.g., "webprodigies") that can host multiple websites
 * - Website: A category that contains multiple Pages (first-class entities)
 * - Page: An actual page with its own URL slug, canvasData, and publish status
 *
 * The Website model itself does NOT have canvas data or publish status.
 * Each Page has its own canvas data and individual publish status.
 * See pages router for Page operations.
 *
 * PERMISSIONS:
 * - WEBSITES_READ: List and view website categories
 * - WEBSITES_CREATE: Create new website categories
 * - WEBSITES_UPDATE: Edit website category details
 * - WEBSITES_DELETE: Delete website categories
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  baseProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { prisma } from '@/lib/config/prisma'
import * as websiteService from '@/services/website.service'
import * as pageService from '@/services/page.service'
import * as localComponentService from '@/services/local-component.service'
import { formatStoreRowValues, listRowsPublicInfinite } from '@/services/cms.service'
import {
  getCachedPublishedPage,
  cachePublishedPage,
  invalidateWebsitePageCache,
  type CmsSnapshot,
} from '@/lib/page-cache'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for listing website categories with pagination and search
 */
export const listWebsitesSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  domainId: z.string().optional(),
})

/**
 * Schema for getting a single website category
 */
export const getWebsiteSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
})

/**
 * Schema for creating a new website category
 *
 * Optional initial page fields allow creating the first page with the website.
 * If provided, a Page will be created immediately under this website.
 *
 * DOMAIN IS NOW OPTIONAL:
 * Websites can be created without a domain for preview-only access.
 * Each website gets an auto-generated previewId (e.g., "a7x9k2m5") for preview URLs.
 * Domains can be connected later for production URLs.
 *
 * URL PATTERNS:
 * - Preview: /{previewId}/{slug} (always works, even without domain)
 * - Production: {customDomain}/{slug} (only when domain is connected)
 */
export const createWebsiteSchema = z.object({
  organizationId: z.string(),
  // Domain is OPTIONAL - websites can be created without a domain
  // and the domain can be connected later for production URLs
  domainId: z.string().optional(),
  name: z.string().min(1, 'Website name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  /** Optional: slug for the first page (e.g., "home") */
  initialPageSlug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Slug must be lowercase, start/end with letter or number'
    )
    .optional(),
  /** Optional: name for the first page (e.g., "Home") */
  initialPageName: z.string().min(1).max(100).optional(),
})

/**
 * Schema for updating a website category
 *
 * SOURCE OF TRUTH: WebsiteUpdateSchema, ChatWidgetIntegration
 */
export const updateWebsiteSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  /** Domain ID to assign this website to */
  domainId: z.string().optional(),
  /** Chat Widget ID to display on this website (null to remove) */
  chatWidgetId: z.string().nullable().optional(),
})

/**
 * Schema for deleting a website category
 */
export const deleteWebsiteSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
  /** Whether to also delete all pages within this website */
  deletePages: z.boolean().optional().default(false),
})

/**
 * Schema for bulk deleting website categories
 */
export const bulkDeleteWebsitesSchema = z.object({
  organizationId: z.string(),
  websiteIds: z.array(z.string()).min(1),
})

/**
 * Schema for duplicating a website category
 */
export const duplicateWebsiteSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
  newName: z.string().min(1).max(100),
  targetDomainId: z.string().optional(),
})

/**
 * Schema for listing website categories by domain
 */
export const listByDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for fetching a published page (PUBLIC - no auth required)
 *
 * PATHNAME: Allows empty string for root path (homepage).
 * Empty pathname "" will be treated as "home" in the service layer.
 */
export const getPublishedPageSchema = z.object({
  domainName: z.string().min(1),
  pathname: z.string(), // Allow empty string for root/homepage
})

// ============================================================================
// ROUTER
// ============================================================================

export const websitesRouter = createTRPCRouter({
  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * List all website categories for organization with pagination
   */
  list: organizationProcedure({ requirePermission: permissions.WEBSITES_READ })
    .input(listWebsitesSchema)
    .query(async ({ input }) => {
      return await websiteService.listWebsites({
        organizationId: input.organizationId,
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
        domainId: input.domainId,
      })
    }),

  /**
   * Get a single website category by ID (includes its pages)
   */
  getById: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getWebsiteSchema)
    .query(async ({ input }) => {
      const website = await websiteService.getWebsiteById(
        input.organizationId,
        input.websiteId
      )

      if (!website) {
        throw createStructuredError('NOT_FOUND', 'Website not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Website not found',
        })
      }

      return website
    }),

  /**
   * List all website categories for a specific domain
   */
  listByDomain: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(listByDomainSchema)
    .query(async ({ input }) => {
      return await websiteService.listWebsitesByDomain(
        input.organizationId,
        input.domainId
      )
    }),

  // ==========================================================================
  // CREATE OPERATIONS
  // ==========================================================================

  /**
   * Create a new website category
   *
   * FEATURE GATE: websites.limit
   * Checks organization's website limit before creating
   *
   * If initialPageSlug and initialPageName are provided, also creates
   * the first page under this website. This provides backwards-compatible
   * behavior for the website creation dialog.
   */
  /** Feature-gated: websites.limit checked at procedure level before handler runs */
  create: organizationProcedure({
    requirePermission: permissions.WEBSITES_CREATE,
    requireFeature: 'websites.limit',
  })
    .input(createWebsiteSchema)
    .mutation(async ({ ctx, input }) => {
      // Create the website category
      const website = await websiteService.createWebsite({
        organizationId: input.organizationId,
        domainId: input.domainId,
        name: input.name,
        description: input.description,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'websites.limit')

      /**
       * INITIAL PAGE CREATION - No Feature Gate
       *
       * WHY: The initial page is part of website creation and should ALWAYS be allowed.
       * A website without pages is useless, so the first page is inherent to website creation.
       *
       * The `pages_per_website.limit` feature gate is meant to limit ADDITIONAL pages
       * created after the website exists, not the initial page during creation.
       *
       * Example: Free tier has `pages_per_website.limit: 1`
       * - This means each website can have 1 page (the initial page)
       * - Attempting to add a second page would be blocked by the feature gate
       * - But the first page during creation is always allowed
       *
       * IMPORTANT: The feature gate check happens in the pages router for subsequent
       * page creation via `checkPagesPerWebsiteLimit()` which counts pages directly
       * from the database per-website, NOT from UsageMetrics table.
       *
       * NOTE: We don't increment UsageMetrics here because:
       * 1. Page limits are checked per-website via database count (not UsageMetrics)
       * 2. Pages router doesn't use UsageMetrics for page operations
       * 3. Keeping it would make UsageMetrics inaccurate
       */
      if (input.initialPageSlug && input.initialPageName) {
        await pageService.createPage({
          organizationId: input.organizationId,
          domainId: input.domainId,
          websiteId: website.id,
          slug: input.initialPageSlug,
          name: input.initialPageName,
        })
      }

      return website
    }),

  /**
   * Duplicate a website category with all its pages
   *
   * FEATURE GATE: websites.limit
   * Duplicating creates a new website, so we need to check the limit
   */
  /** Feature-gated: websites.limit checked at procedure level before handler runs */
  duplicate: organizationProcedure({
    requirePermission: permissions.WEBSITES_CREATE,
    requireFeature: 'websites.limit',
  })
    .input(duplicateWebsiteSchema)
    .mutation(async ({ ctx, input }) => {
      const website = await websiteService.duplicateWebsite(
        input.organizationId,
        input.websiteId,
        input.newName,
        input.targetDomainId
      )

      // Increment usage after successful duplication
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'websites.limit')

      return website
    }),

  // ==========================================================================
  // UPDATE OPERATIONS
  // ==========================================================================

  /**
   * Update website category metadata (name, description)
   */
  update: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(updateWebsiteSchema)
    .mutation(async ({ input }) => {
      const { organizationId, websiteId, ...data } = input
      const result = await websiteService.updateWebsite(organizationId, websiteId, data)

      /* Invalidate cached pages — chatWidgetId or domainId may have changed */
      invalidateWebsitePageCache(websiteId)

      return result
    }),

  // ==========================================================================
  // DELETE OPERATIONS
  // ==========================================================================

  /**
   * Delete a website category (soft delete)
   *
   * FEATURE GATE: websites.limit
   * Decrements usage after successful deletion to free up quota
   */
  delete: organizationProcedure({
    requirePermission: permissions.WEBSITES_DELETE,
  })
    .input(deleteWebsiteSchema)
    .mutation(async ({ ctx, input }) => {
      /* Invalidate BEFORE delete — we need the website record to still exist to
         look up its pages and domain identifiers for cache key resolution */
      await invalidateWebsitePageCache(input.websiteId)

      if (input.deletePages) {
        await websiteService.deleteWebsiteWithPages(
          input.organizationId,
          input.websiteId
        )
      } else {
        await websiteService.deleteWebsite(input.organizationId, input.websiteId)
      }

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, input.organizationId, 'websites.limit')

      return { success: true, message: 'Website deleted' }
    }),

  /**
   * Bulk delete website categories (soft delete)
   *
   * FEATURE GATE: websites.limit
   * Decrements usage by count of deleted websites
   */
  bulkDelete: organizationProcedure({
    requirePermission: permissions.WEBSITES_DELETE,
  })
    .input(bulkDeleteWebsitesSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await websiteService.bulkDeleteWebsites(
        input.organizationId,
        input.websiteIds
      )

      // Decrement usage by count of deleted websites
      if (result.count > 0) {
        await decrementUsageAndInvalidate(
          ctx,
          input.organizationId,
          'websites.limit',
          result.count
        )
      }

      return { success: true, count: result.count }
    }),

  // ==========================================================================
  // E-COMMERCE OPERATIONS
  // ==========================================================================
  // SOURCE OF TRUTH: Website E-commerce Toggle, EnableEcommerce, Ecommerce Pages
  //
  // These endpoints manage E-commerce functionality for websites.
  // When enabled, default E-commerce pages are created.
  // When disabled, all E-commerce pages are HARD DELETED.
  // ==========================================================================

  /**
   * Get E-commerce status for a website.
   *
   * WHY: Check if E-commerce is enabled and get page count for UI display.
   * HOW: Returns the enableEcommerce flag and count of E-commerce pages.
   */
  getEcommerceStatus: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getWebsiteSchema)
    .query(async ({ input }) => {
      const status = await websiteService.getEcommerceStatus(
        input.organizationId,
        input.websiteId
      )

      if (!status) {
        throw createStructuredError('NOT_FOUND', 'Website not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Website not found',
        })
      }

      return status
    }),

  /**
   * Get all E-commerce pages for a website.
   *
   * WHY: Display E-commerce pages separately in the builder sidebar.
   * HOW: Returns all pages where isEcommercePage=true for the given website.
   */
  getEcommercePages: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getWebsiteSchema)
    .query(async ({ input }) => {
      return await websiteService.getEcommercePages(
        input.organizationId,
        input.websiteId
      )
    }),

  /**
   * Enable E-commerce for a website.
   *
   * WHY: Activates E-commerce functionality and creates default store pages.
   * HOW: Updates the enableEcommerce flag and creates predefined E-commerce pages.
   *
   * CREATES THE FOLLOWING PAGES:
   * - /shop - Product listing page
   * - /cart - Shopping cart page
   * - /checkout - Checkout flow page
   * - /order-confirmation - Order success page
   */
  enableEcommerce: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(getWebsiteSchema)
    .mutation(async ({ input }) => {
      const result = await websiteService.enableEcommerce(
        input.organizationId,
        input.websiteId
      )

      /* Invalidate — ecommerce pages are now part of this website */
      invalidateWebsitePageCache(input.websiteId)

      return result
    }),

  /**
   * Disable E-commerce for a website.
   *
   * WHY: Deactivates E-commerce functionality and cleans up all related data.
   * HOW: HARD DELETES all E-commerce pages and their local components.
   *
   * IMPORTANT: This is a destructive operation!
   * - All E-commerce pages (isEcommercePage=true) are permanently deleted
   * - All published data for these pages is permanently deleted
   * - This CANNOT be undone!
   */
  disableEcommerce: organizationProcedure({
    requirePermission: permissions.WEBSITES_DELETE,
  })
    .input(getWebsiteSchema)
    .mutation(async ({ input }) => {
      const result = await websiteService.disableEcommerce(
        input.organizationId,
        input.websiteId
      )

      /* Invalidate — ecommerce pages have been removed */
      invalidateWebsitePageCache(input.websiteId)

      return result
    }),

  // ==========================================================================
  // PUBLIC OPERATIONS (No auth required)
  // ==========================================================================

  /**
   * Get published page data (PUBLIC - no auth required)
   *
   * WHY: Live website visitors need to fetch published page content.
   * HOW: Direct query to Page model by domain name and slug.
   *
   * This is the key fix for the deleted page issue:
   * - Queries Page model directly (not JSON inside Website)
   * - Checks Page.deletedAt to ensure deleted pages return null
   * - Checks Page.status = 'PUBLISHED' to ensure only published pages are shown
   *
   * RETURNS:
   * - Page data with elements array for PageRenderer
   * - null if page not found, deleted, or not published
   */
  getPublishedPage: baseProcedure
    .input(getPublishedPageSchema)
    .query(async ({ input }) => {
      const { domainName } = input
      let pathname = input.pathname

      /**
       * DEFAULT PAGE LOOKUP: When pathname is empty, look up the domain's default page.
       *
       * WHY: Users configure a default page in domain settings to handle root visits.
       * HOW: If pathname is empty, find the domain and use its defaultPageId to get the page slug.
       */
      if (!pathname) {
        // Resolve the default page slug for this domain
        const defaultSlug = await pageService.resolveDefaultPageSlug(domainName)

        if (defaultSlug) {
          pathname = defaultSlug
        } else {
          // No default page configured or not found - return null (will show 404)
          return null
        }
      }

      /**
       * REDIS CACHE CHECK: Try to serve from cache before any DB queries.
       *
       * WHY: On cache hit we skip ALL DB queries (page, components, domain joins).
       * The cache is populated after the first DB fetch and invalidated on mutations.
       */
      const cached = await getCachedPublishedPage(domainName, pathname)
      if (cached) return cached

      /**
       * TWO-PHASE LOOKUP: Domain name first, then website ID fallback.
       *
       * WHY: When a domain is deleted, published pages remain viewable via website ID.
       * HOW: The URL param can be either a domain name OR a website ID.
       *
       * Phase 1: Try domain name lookup (normal case)
       * Phase 2: If fails, treat domainName as websiteId (fallback for deleted domains)
       *
       * This allows URLs like:
       * - /webprodigies/home → domain name lookup
       * - /webprodigies/ → uses default page from domain settings
       * - /cmj28gluc00018o5bqeka2vi1/home → website ID fallback
       */
      let page = await pageService.getPublishedPage(domainName, pathname)

      // Fallback: treat domainName as websiteId if domain lookup failed
      if (!page) {
        page = await pageService.getPublishedPageByWebsiteId(domainName, pathname)
      }

      if (!page) {
        return null
      }

      // Extract elements from publishedCanvasData
      const publishedData = page.publishedCanvasData as {
        elements?: unknown[]
        publishedAt?: number
        /** Baked CMS snapshots from publish time — keyed by SmartCMS List element ID */
        cmsSnapshots?: Record<string, CmsSnapshot>
      } | null

      if (!publishedData?.elements) {
        return null
      }

      // Fetch local components for this website to render component instances
      // This is needed because component instances reference LocalComponent definitions
      const components = await localComponentService.getLocalComponentsByWebsite({
        websiteId: page.websiteId,
      })

      // Convert components array to Record<id, component> format for PageRenderer
      const componentsMap: Record<string, unknown> = {}
      for (const comp of components) {
        componentsMap[comp.id] = {
          id: comp.id,
          name: comp.name,
          description: comp.description ?? undefined,
          websiteId: comp.websiteId,
          sourceTree: comp.sourceTree,
          exposedProps: comp.exposedProps ?? [],
          tags: comp.tags ?? [],
          instanceIds: [],
          primaryInstanceId: comp.primaryInstanceId ?? '',
          // Include skeletonStyles for SmartCMS List loading skeleton theme colors
          skeletonStyles: comp.skeletonStyles ?? undefined,
          // Include loadingSkeletonComponentId for custom loading skeleton components
          loadingSkeletonComponentId: comp.loadingSkeletonComponentId ?? undefined,
          createdAt: new Date(comp.createdAt).getTime(),
          updatedAt: new Date(comp.updatedAt).getTime(),
        }
      }

      // ================================================================
      // RE-BAKE FRESH CMS SNAPSHOTS (Redis cache layer ONLY)
      // ================================================================
      // WHY: The DB's publishedCanvasData.cmsSnapshots are frozen at publish
      // time. If CMS data changed since then (product rename, row edit, etc.),
      // the baked snapshots are stale. We re-fetch fresh CMS data here so the
      // Redis cache stores up-to-date values.
      //
      // SAFETY: This does NOT modify the database or re-publish the page.
      // The published page design/elements/structure stay exactly as they were.
      // Only the CMS row *values* within cmsSnapshots get refreshed in the
      // response that goes into Redis. Zero writes to publishedCanvasData.
      let freshCmsSnapshots: Record<string, CmsSnapshot> | undefined =
        publishedData.cmsSnapshots

      // Scan the published elements for SmartCMS List elements
      const cmsListEls = publishedData.elements.filter((el) => {
        const e = el as { type?: string; cmsTableId?: string }
        return e.type === 'smartcms-list' && e.cmsTableId
      }) as Array<{ id: string; cmsTableId: string; pageSize?: number; rangeStart?: number; rangeEnd?: number }>

      if (cmsListEls.length > 0) {
        freshCmsSnapshots = {}
        const fetches = cmsListEls.map(async (el) => {
          try {
            const result = await listRowsPublicInfinite({
              tableId: el.cmsTableId,
              limit: el.pageSize ?? 10,
              cursor: undefined,
              sortOrder: 'asc',
              rangeStart: el.rangeStart,
              rangeEnd: el.rangeEnd,
            })
            if (result.authorized && result.rows) {
              freshCmsSnapshots![el.id] = {
                rows: result.rows.map((r) => ({
                  id: r.id,
                  values: r.values as Record<string, unknown>,
                  order: r.order,
                })),
                nextCursor: result.nextCursor,
                hasMore: result.hasMore ?? false,
              }
            }
          } catch {
            // If fresh fetch fails, fall back to the DB baked snapshot for this element
            if (publishedData.cmsSnapshots?.[el.id]) {
              freshCmsSnapshots![el.id] = publishedData.cmsSnapshots[el.id]
            }
          }
        })
        await Promise.all(fetches)
      }

      /**
       * Look up the checkout page slug for this website's e-commerce pages.
       * Only queries when e-commerce is enabled to avoid unnecessary DB hits.
       * The slug may differ from the default 'checkout' if a collision occurred.
       *
       * SOURCE OF TRUTH: CheckoutPageSlug, CartCheckoutNavigation
       */
      const checkoutSlug = page.website?.enableEcommerce
        ? await websiteService.getCheckoutPageSlug(page.websiteId)
        : null

      /**
       * Fetch slug column configuration for all dynamic pages in this website.
       * SmartCMS List, Link, and Button elements use this to build SEO-friendly
       * URLs (e.g., /blog/my-post instead of /blog/clx123) in published mode
       * where Redux page infos are unavailable.
       *
       * SOURCE OF TRUTH: PageSlugColumnsMap, DynamicUrlSlugResolution
       */
      const dynamicPages = await prisma.page.findMany({
        where: {
          websiteId: page.websiteId,
          cmsTableId: { not: null },
          cmsSlugColumnSlug: { not: null },
        },
        select: { id: true, cmsSlugColumnSlug: true },
      })
      const pageSlugColumns: Record<string, string> = {}
      for (const dp of dynamicPages) {
        if (dp.cmsSlugColumnSlug) {
          pageSlugColumns[dp.id] = dp.cmsSlugColumnSlug
        }
      }

      const response = {
        pageId: page.id,
        pageName: page.name,
        slug: page.slug,
        websiteName: page.website?.name,
        // Use customDomain for display (domain.name was removed)
        domainName: page.domain?.customDomain,
        // Include organizationId for CMS data fetching in SmartCMS List elements
        // Use page.organizationId as fallback when domain is deleted
        organizationId: page.domain?.organizationId || (page as { organizationId?: string }).organizationId,
        elements: publishedData.elements,
        publishedAt: page.publishedAt,
        components: componentsMap,
        // Chat widget ID for rendering the chatbot on published pages
        // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
        chatWidgetId: page.website?.chatWidgetId ?? null,
        // E-commerce flag — gates navbar cart button visibility on published pages
        enableEcommerce: page.website?.enableEcommerce ?? false,
        // Fresh CMS data — re-fetched from CMS tables on cache miss.
        // Falls back to DB baked snapshots if re-fetch fails.
        cmsSnapshots: freshCmsSnapshots,
        // Checkout page slug for CartSheet navigation.
        // May differ from default 'checkout' if slug collision occurred during creation.
        // SOURCE OF TRUTH: CheckoutPageSlug, CartCheckoutNavigation
        checkoutSlug,
        // Map of pageId → cmsSlugColumnSlug for all dynamic pages in this website.
        // Enables SmartCMS List elements to resolve SEO-friendly URLs in published mode.
        // SOURCE OF TRUTH: PageSlugColumnsMap, DynamicUrlSlugResolution
        pageSlugColumns,
        // SOURCE OF TRUTH: PageSeo, PageMetadata, SeoFields
        // SEO metadata for generating proper <head> tags on published pages
        metaTitle: page.metaTitle ?? null,
        metaDescription: page.metaDescription ?? null,
        ogImage: page.ogImage ?? null,
        noIndex: page.noIndex ?? false,
      }

      /* Fire-and-forget: populate Redis cache for next visitor */
      cachePublishedPage(domainName, pathname, response)

      return response
    }),

  // ============================================================================
  // DYNAMIC PAGE DATA - PUBLIC
  // ============================================================================
  //
  // SOURCE OF TRUTH: getDynamicPageData tRPC Procedure
  //
  // Fetches a dynamic page template with a specific CMS row for rendering.
  // Used for URLs like /domain/template-slug/row-id
  //
  // ============================================================================

  /**
   * Get dynamic page data with CMS row for public rendering.
   *
   * PUBLIC: No authentication required (visitors view dynamic pages).
   *
   * URL PATTERN: /domain/{templateSlug}/{rowIdOrSlug}
   *
   * FLOW:
   * 1. Look up page by domain + template slug
   * 2. Verify it's a dynamic template (has cmsTableId)
   * 3. Look up CMS row by ID or slug column value
   * 4. Return page elements + row data for rendering
   *
   * RETURNS:
   * - Page elements, CMS row, components map, organizationId
   * - null if page not found, not dynamic, not published, or row not found
   */
  getDynamicPageData: baseProcedure
    .input(
      z.object({
        domainName: z.string().min(1),
        templateSlug: z.string().min(1),
        rowIdOrSlug: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const { domainName, templateSlug, rowIdOrSlug } = input

      // Fetch dynamic page data (page template + CMS row)
      const dynamicData = await pageService.getPublishedDynamicPage(
        domainName,
        templateSlug,
        rowIdOrSlug
      )

      if (!dynamicData) {
        return null
      }

      const { page, row } = dynamicData

      // Extract elements from publishedCanvasData
      const publishedData = page.publishedCanvasData as {
        elements?: unknown[]
      } | null

      if (!publishedData?.elements) {
        return null
      }

      // Fetch local components for this website
      const components = await localComponentService.getLocalComponentsByWebsite({
        websiteId: page.websiteId,
      })

      // Convert to map format
      const componentsMap: Record<string, unknown> = {}
      for (const comp of components) {
        componentsMap[comp.id] = {
          id: comp.id,
          name: comp.name,
          description: comp.description ?? undefined,
          websiteId: comp.websiteId,
          sourceTree: comp.sourceTree,
          exposedProps: comp.exposedProps ?? [],
          tags: comp.tags ?? [],
          instanceIds: [],
          primaryInstanceId: comp.primaryInstanceId ?? '',
          skeletonStyles: comp.skeletonStyles ?? undefined,
          loadingSkeletonComponentId: comp.loadingSkeletonComponentId ?? undefined,
          createdAt: new Date(comp.createdAt).getTime(),
          updatedAt: new Date(comp.updatedAt).getTime(),
        }
      }

      /**
       * Format store table row values — ensures price_amount has currency symbol.
       * Check if the CMS table is a store table (has sourceStoreId) to determine
       * if price formatting is needed.
       */
      let formattedRow = row
      if (page.cmsTableId) {
        const isStoreTable = await pageService.isCmsTableStore(page.cmsTableId)
        formattedRow = {
          ...row,
          values: formatStoreRowValues(row.values, isStoreTable),
        }
      }

      /**
       * Look up the checkout page slug for cart navigation on dynamic pages.
       * SOURCE OF TRUTH: CheckoutPageSlug, CartCheckoutNavigation
       */
      const checkoutSlug = page.website?.enableEcommerce
        ? await websiteService.getCheckoutPageSlug(page.websiteId)
        : null

      /**
       * Fetch slug column configuration for all dynamic pages in this website.
       * Same as getPublishedPage — enables SEO-friendly URLs on dynamic pages too.
       * SOURCE OF TRUTH: PageSlugColumnsMap, DynamicUrlSlugResolution
       */
      const dynamicPages = await prisma.page.findMany({
        where: {
          websiteId: page.websiteId,
          cmsTableId: { not: null },
          cmsSlugColumnSlug: { not: null },
        },
        select: { id: true, cmsSlugColumnSlug: true },
      })
      const pageSlugColumns: Record<string, string> = {}
      for (const dp of dynamicPages) {
        if (dp.cmsSlugColumnSlug) {
          pageSlugColumns[dp.id] = dp.cmsSlugColumnSlug
        }
      }

      return {
        pageId: page.id,
        pageName: page.name,
        templateSlug: page.slug,
        websiteName: page.website?.name,
        // Use customDomain for display (domain.name was removed)
        domainName: page.domain?.customDomain,
        organizationId: page.domain?.organizationId || page.organizationId,
        elements: publishedData.elements,
        cmsRow: formattedRow,
        cmsTableId: page.cmsTableId,
        components: componentsMap,
        // Chat widget ID for rendering the chatbot on dynamic pages
        // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
        chatWidgetId: page.website?.chatWidgetId ?? null,
        // E-commerce flag — gates navbar cart button visibility on dynamic pages
        enableEcommerce: page.website?.enableEcommerce ?? false,
        // Checkout page slug for CartSheet navigation on dynamic pages
        // SOURCE OF TRUTH: CheckoutPageSlug, CartCheckoutNavigation
        checkoutSlug,
        // Map of pageId → cmsSlugColumnSlug for dynamic URL resolution
        // SOURCE OF TRUTH: PageSlugColumnsMap, DynamicUrlSlugResolution
        pageSlugColumns,
        // SOURCE OF TRUTH: DynamicPageSeo, CmsSeoMapping, SeoFields
        // SEO metadata — for dynamic pages, these are the template defaults.
        // The CMS column mappings override these with per-row data in generateMetadata.
        metaTitle: page.metaTitle ?? null,
        metaDescription: page.metaDescription ?? null,
        ogImage: page.ogImage ?? null,
        noIndex: page.noIndex ?? false,
        seoTitleColumn: page.seoTitleColumn ?? null,
        seoDescriptionColumn: page.seoDescriptionColumn ?? null,
        seoImageColumn: page.seoImageColumn ?? null,
      }
    }),
})
