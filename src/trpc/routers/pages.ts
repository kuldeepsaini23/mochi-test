/**
 * ============================================================================
 * PAGES ROUTER - First-Class Page Entity Operations
 * ============================================================================
 *
 * tRPC router for Page management operations.
 *
 * ============================================================================
 * ARCHITECTURE: Organization → Domain → Website (Category) → Page[]
 * ============================================================================
 *
 * KEY CONCEPT: Each Page is a FIRST-CLASS database entity with:
 * - Its own URL slug (unique within the domain)
 * - Its own canvas data (the page's elements)
 * - Its own publish status (independent of other pages)
 * - Proper soft delete with deletedAt
 *
 * This is the primary router for:
 * - Creating, reading, updating, deleting pages
 * - Saving canvas data (auto-save from builder)
 * - Publishing/unpublishing individual pages
 *
 * PERMISSIONS:
 * - WEBSITES_READ: List and view pages
 * - WEBSITES_CREATE: Create new pages
 * - WEBSITES_UPDATE: Edit page content and canvas
 * - WEBSITES_DELETE: Delete pages
 * - WEBSITES_PUBLISH: Publish/unpublish pages
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import * as pageService from '@/services/page.service'
import { invalidateWebsitePageCache } from '@/lib/page-cache'
import { permissions } from '@/lib/better-auth/permissions'
import { sanitizeSlugSegment } from '@/components/website-builder/builder-v1.2/_lib/slug-utils'
import { getOrganizationTier } from '@/services/feature-gate.service'
import { withBooleanFeature } from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for listing pages by domain
 */
export const listPagesByDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for listing pages by website (category)
 */
export const listPagesByWebsiteSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
})

/**
 * Schema for getting a single page
 */
export const getPageSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
})

/**
 * Schema for getting a page by domain and slug (for builder routing)
 */
export const getPageBySlugSchema = z.object({
  organizationId: z.string(),
  domainName: z.string(),
  slug: z.string(),
})

/**
 * Schema for creating a new page
 */
export const createPageSchema = z.object({
  organizationId: z.string(),
  /** Domain ID — nullable because pages can exist without a domain (matches service layer) */
  domainId: z.string().nullable(),
  websiteId: z.string(),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Slug must be lowercase, start/end with letter or number, and can contain hyphens'
    ),
  name: z.string().min(1).max(100),
})

/**
 * Schema for updating a page
 */
export const updatePageSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Slug must be lowercase, start/end with letter or number, and can contain hyphens'
    )
    .optional(),
})

/**
 * Schema for updating page SEO metadata.
 * SOURCE OF TRUTH: PageSeo, UpdatePageSeo, SeoFields
 */
export const updatePageSeoSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
  metaTitle: z.string().max(200).nullable().optional(),
  metaDescription: z.string().max(500).nullable().optional(),
  ogImage: z.string().url().nullable().optional(),
  noIndex: z.boolean().optional(),
  /** CMS column slug for dynamic page meta title */
  seoTitleColumn: z.string().nullable().optional(),
  /** CMS column slug for dynamic page meta description */
  seoDescriptionColumn: z.string().nullable().optional(),
  /** CMS column slug for dynamic page OG image */
  seoImageColumn: z.string().nullable().optional(),
})

/**
 * Schema for saving page canvas data (auto-save from builder).
 *
 * Uses UPSERT: Updates existing page or creates new one if it doesn't exist.
 * This allows the builder to create new pages without a separate mutation.
 */
export const saveCanvasDataSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
  /** Website ID - required for creating new pages */
  websiteId: z.string(),
  /** Domain ID - null when domain is hard-deleted. Pages can still be saved without a domain. */
  domainId: z.string().nullable(),
  /** Page name - required for creating new pages */
  name: z.string().min(1).max(100),
  /** Page slug - required for creating new pages (no leading slash) */
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Slug must be lowercase, start/end with letter or number, and can contain hyphens'
    ),
  canvasData: z.record(z.string(), z.unknown()),
})

/**
 * Schema for deleting a page
 */
export const deletePageSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
})

/**
 * Schema for bulk deleting pages
 */
export const bulkDeletePagesSchema = z.object({
  organizationId: z.string(),
  pageIds: z.array(z.string()).min(1),
})

/**
 * Schema for publishing/unpublishing a page
 */
export const publishPageSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
})

/**
 * Schema for duplicating a page
 */
export const duplicatePageSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
  newName: z.string().min(1).max(100),
  newSlug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Slug must be lowercase, start/end with letter or number, and can contain hyphens'
    ),
  targetWebsiteId: z.string().optional(),
})

/**
 * Schema for reordering pages within a website
 */
export const reorderPagesSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
  pageOrder: z.array(z.string()).min(1),
})

/**
 * Schema for moving a page to a different website
 */
export const movePageSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
  targetWebsiteId: z.string(),
})

// ============================================================================
// FEATURE GATE HELPER - Per-Website Page Limit
// ============================================================================

/**
 * Check if a website has reached its page limit based on the organization's tier.
 *
 * SOURCE OF TRUTH: PerWebsitePageLimit, checkPagesPerWebsiteLimit
 *
 * WHY: pages_per_website.limit is a per-website limit, not per-organization.
 * Instead of tracking usage in UsageMetrics, we count pages directly from the
 * database for accuracy. This ensures the count is always accurate even if
 * pages are created/deleted through other means.
 *
 * HOW:
 * 1. Get the organization's tier to find the pages_per_website.limit value
 * 2. Count existing pages for the specific website
 * 3. Throw FORBIDDEN error if adding more pages would exceed the limit
 *
 * @param organizationId - The organization ID
 * @param websiteId - The website to check the limit for
 * @param incrementBy - How many pages are being added (default: 1)
 * @throws TRPCError if limit would be exceeded
 */
async function checkPagesPerWebsiteLimit(
  organizationId: string,
  websiteId: string,
  incrementBy: number = 1
): Promise<void> {
  // Get organization tier to determine page limit
  const tier = await getOrganizationTier(organizationId)
  const limit = tier.features['pages_per_website.limit'] as number

  // If limit is -1 (UNLIMITED), no check needed
  if (limit === -1) {
    return
  }

  // Count existing pages for this website (excluding soft-deleted pages)
  const currentPageCount = await pageService.getPageCountForWebsite(organizationId, websiteId)

  // Check if adding pages would exceed the limit
  if (currentPageCount + incrementBy > limit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `You have reached the maximum number of pages (${limit}) for this website. Current: ${currentPageCount}/${limit}. Upgrade your plan to add more pages.`,
      cause: {
        type: 'FEATURE_LIMIT_EXCEEDED',
        featureKey: 'pages_per_website.limit',
        currentUsage: currentPageCount,
        limit,
        currentTier: tier.tier,
        organizationId,
        websiteId,
        message: `Page limit reached for website. Current: ${currentPageCount}/${limit}`,
      },
    })
  }
}

// ============================================================================
// ROUTER
// ============================================================================

export const pagesRouter = createTRPCRouter({
  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * List all pages for a domain, grouped by website
   *
   * WHY: The builder needs to display ALL pages in a domain, categorized by website.
   * HOW: Fetches all pages under the domain, includes website info for grouping.
   */
  listByDomain: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(listPagesByDomainSchema)
    .query(async ({ input }) => {
      return await pageService.getPagesByDomain(
        input.organizationId,
        input.domainId
      )
    }),

  /**
   * List all pages for a specific website (category)
   */
  listByWebsite: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(listPagesByWebsiteSchema)
    .query(async ({ input }) => {
      return await pageService.getPagesByWebsite(
        input.organizationId,
        input.websiteId
      )
    }),

  /**
   * Get a single page by ID
   */
  getById: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getPageSchema)
    .query(async ({ input }) => {
      const page = await pageService.getPageById(
        input.organizationId,
        input.pageId
      )

      if (!page) {
        throw createStructuredError('NOT_FOUND', 'Page not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Page not found',
        })
      }

      return page
    }),

  /**
   * Get a page by domain name and slug (for builder routing)
   *
   * WHY: Builder needs to load a specific page when navigating to /{domain}/{slug}/edit
   * HOW: Looks up page by domain name and slug, returns full page data with canvasData
   *
   * SECURITY: After global lookup by domain name, we MUST verify the page belongs
   * to the user's organization to prevent IDOR attacks. This is defense-in-depth
   * since the domain could potentially match pages from other organizations.
   */
  getBySlug: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getPageBySlugSchema)
    .query(async ({ input }) => {
      const { organizationId, domainName, slug } = input

      const page = await pageService.getPageByDomainAndSlug(domainName, slug)

      if (!page) {
        throw createStructuredError('NOT_FOUND', 'Page not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Page not found',
        })
      }

      // SECURITY: Verify page belongs to the user's organization (IDOR prevention)
      // This check is CRITICAL - without it, users could access any org's pages
      // by guessing domain names. The domain lookup is global, but access must
      // be scoped to the authenticated user's organization.
      if (page.organizationId !== organizationId) {
        throw createStructuredError('NOT_FOUND', 'Page not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Page not found',
        })
      }

      return page
    }),

  // ==========================================================================
  // CREATE OPERATIONS
  // ==========================================================================

  /**
   * Create a new page
   *
   * FEATURE GATE: pages_per_website.limit
   * Checks the page count for the specific website before creating.
   * This is a per-website limit, so we count pages directly instead of
   * using the organization-level UsageMetrics.
   */
  create: organizationProcedure({
    requirePermission: permissions.WEBSITES_CREATE,
  })
    .input(createPageSchema)
    .mutation(async ({ input }) => {
      // Check feature gate - per-website page limit
      await checkPagesPerWebsiteLimit(input.organizationId, input.websiteId)

      // Sanitize the slug server-side
      const sanitizedSlug = sanitizeSlugSegment(input.slug)

      return await pageService.createPage({
        organizationId: input.organizationId,
        domainId: input.domainId,
        websiteId: input.websiteId,
        slug: sanitizedSlug,
        name: input.name,
      })
    }),

  /**
   * Duplicate a page
   *
   * FEATURE GATE: pages_per_website.limit
   * Checks the page count for the target website before duplicating.
   * If targetWebsiteId is provided, checks that website; otherwise checks
   * the source page's website.
   */
  duplicate: organizationProcedure({
    requirePermission: permissions.WEBSITES_CREATE,
  })
    .input(duplicatePageSchema)
    .mutation(async ({ input }) => {
      // Get the source page to determine target website if not specified
      const sourcePage = await pageService.getPageById(
        input.organizationId,
        input.pageId
      )

      if (!sourcePage) {
        throw createStructuredError('NOT_FOUND', 'Source page not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Source page not found',
        })
      }

      // Determine target website - use specified or default to source page's website
      const targetWebsiteId = input.targetWebsiteId || sourcePage.websiteId

      // Check feature gate - per-website page limit on target website
      await checkPagesPerWebsiteLimit(input.organizationId, targetWebsiteId)

      const sanitizedSlug = sanitizeSlugSegment(input.newSlug)

      return await pageService.duplicatePage(
        input.organizationId,
        input.pageId,
        input.newName,
        sanitizedSlug,
        input.targetWebsiteId
      )
    }),

  // ==========================================================================
  // UPDATE OPERATIONS
  // ==========================================================================

  /**
   * Update page metadata (name, slug)
   */
  update: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
  
    //WARNING: Use fake data for demo only
    .input(updatePageSchema)
    .mutation(async ({ input }) => {
      const { organizationId, pageId, slug, ...data } = input

      // Sanitize slug if provided
      const updateData = {
        ...data,
        ...(slug && { slug: sanitizeSlugSegment(slug) }),
      }

      return await pageService.updatePage(organizationId, pageId, updateData)
    }),

  /**
   * Update page SEO metadata (title, description, OG image, etc.)
   * SOURCE OF TRUTH: PageSeo, UpdatePageSeo, SeoFields
   */
  updateSeo: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(updatePageSeoSchema)
    .mutation(async ({ input }) => {
      const { organizationId, pageId, ...data } = input
      return await pageService.updatePageSeo(organizationId, pageId, data)
    }),

  /**
   * Save page canvas data (auto-save from builder) using UPSERT.
   *
   * WHY: Persist builder changes as the user edits.
   * HOW: Uses upsert - updates if page exists, creates if it doesn't.
   *
   * IMPORTANT: This is the primary endpoint for saving builder changes.
   * Supports both existing pages and newly created pages in the builder.
   */
  saveCanvas: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(saveCanvasDataSchema)
    .mutation(async ({ input }) => {
      return await pageService.upsertPageCanvasData({
        organizationId: input.organizationId,
        pageId: input.pageId,
        websiteId: input.websiteId,
        domainId: input.domainId,
        name: input.name,
        slug: sanitizeSlugSegment(input.slug),
        canvasData: input.canvasData,
      })
    }),

  /**
   * Reorder pages within a website
   */
  reorder: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(reorderPagesSchema)
    .mutation(async ({ input }) => {
      return await pageService.reorderPages(
        input.organizationId,
        input.websiteId,
        input.pageOrder
      )
    }),

  /**
   * Move a page to a different website (category)
   */
  move: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(movePageSchema)
    .mutation(async ({ input }) => {
      return await pageService.movePage(
        input.organizationId,
        input.pageId,
        input.targetWebsiteId
      )
    }),

  // ==========================================================================
  // PUBLISH OPERATIONS
  // ==========================================================================

  /**
   * Publish a page
   *
   * WHY: Make a page visible to public visitors.
   * HOW: Copies canvasData to publishedCanvasData and sets status to PUBLISHED.
   */
  publish: organizationProcedure({
    requirePermission: permissions.WEBSITES_PUBLISH,
  })
    .input(publishPageSchema)
    .mutation(async ({ input }) => {
      const result = await pageService.publishPage(input.organizationId, input.pageId)

      /* Invalidate cached page shell — new published content replaces the old cache */
      invalidateWebsitePageCache(result.websiteId)

      return result
    }),

  /**
   * Unpublish a page (set to draft)
   *
   * WHY: Remove page from public access without deleting.
   * HOW: Changes status back to DRAFT.
   */
  unpublish: organizationProcedure({
    requirePermission: permissions.WEBSITES_PUBLISH,
  })
    .input(publishPageSchema)
    .mutation(async ({ input }) => {
      const result = await pageService.unpublishPage(input.organizationId, input.pageId)

      /* Invalidate cached page — page is no longer public */
      invalidateWebsitePageCache(result.websiteId)

      return result
    }),

  /**
   * Archive a page
   *
   * WHY: Hide page from public without deleting, preserving builder state.
   * HOW: Changes status to ARCHIVED.
   */
  archive: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(publishPageSchema)
    .mutation(async ({ input }) => {
      return await pageService.archivePage(input.organizationId, input.pageId)
    }),

  // ==========================================================================
  // DELETE OPERATIONS
  // ==========================================================================

  /**
   * Delete a page (soft delete)
   *
   * WHY: Preserves page data for potential recovery.
   * HOW: Sets deletedAt timestamp instead of removing record.
   *
   * IMPORTANT: Soft delete ensures deleted pages return 404 to visitors.
   */
  delete: organizationProcedure({
    requirePermission: permissions.WEBSITES_DELETE,
  })
    .input(deletePageSchema)
    .mutation(async ({ input }) => {
      await pageService.deletePage(input.organizationId, input.pageId)
      return { success: true, message: 'Page deleted' }
    }),

  /**
   * Bulk delete pages (soft delete)
   */
  bulkDelete: organizationProcedure({
    requirePermission: permissions.WEBSITES_DELETE,
  })
    .input(bulkDeletePagesSchema)
    .mutation(async ({ input }) => {
      const result = await pageService.bulkDeletePages(
        input.organizationId,
        input.pageIds
      )
      return { success: true, count: result.count }
    }),

  // ============================================================================
  // DYNAMIC PAGE OPERATIONS
  // ============================================================================
  //
  // SOURCE OF TRUTH: Dynamic Page tRPC Procedures
  //
  // These procedures manage dynamic page settings - connecting pages to CMS
  // tables for dynamic content rendering at /domain/{slug}/{rowId} URLs.
  //
  // ============================================================================

  /**
   * Update page dynamic settings (CMS table connection).
   *
   * Sets or clears the CMS table that this page uses for dynamic content.
   * When cmsTableId is set, the page becomes a "dynamic template" that
   * renders at URLs like /domain/{page-slug}/{row-id}.
   */
  updateDynamicSettings: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(
      z.object({
        organizationId: z.string(),
        pageId: z.string(),
        cmsTableId: z.string().nullable(),
        cmsSlugColumnSlug: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      /* Feature gate checked at handler level: conditional boolean check.
       * Only checked when cmsTableId is non-null (enabling dynamic pages).
       * Clearing the table (null) is always allowed — don't block users from disabling.
       * Procedure-level requireFeature would always run the check, even for clearing. */
      if (input.cmsTableId !== null) {
        await withBooleanFeature(ctx, input.organizationId, 'dynamic_pages')
      }

      return await pageService.updatePageDynamicSettings(
        input.organizationId,
        input.pageId,
        {
          cmsTableId: input.cmsTableId,
          cmsSlugColumnSlug: input.cmsSlugColumnSlug,
        }
      )
    }),

  /**
   * Get first CMS row for dynamic page preview.
   *
   * When editing a dynamic page template, this fetches the first row
   * from the connected CMS table to use as preview data.
   *
   * SECURITY: organizationId is passed to service to validate table ownership.
   */
  getPreviewRow: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(
      z.object({
        organizationId: z.string(),
        tableId: z.string(),
      })
    )
    .query(async ({ input }) => {
      // SECURITY: Pass organizationId to validate table belongs to org
      const row = await pageService.getFirstCmsRow(
        input.organizationId,
        input.tableId
      )
      if (!row) return null
      return {
        id: row.id,
        values: row.values as Record<string, unknown>,
        order: row.order,
      }
    }),

  /**
   * Get specific CMS row by ID for preview.
   *
   * Used when editing a dynamic page with a specific row URL:
   * /domain/template-slug/row-id/edit
   *
   * SECURITY: organizationId is passed to service to validate table ownership.
   */
  getCmsRowById: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(
      z.object({
        organizationId: z.string(),
        tableId: z.string(),
        rowId: z.string(),
      })
    )
    .query(async ({ input }) => {
      // SECURITY: Pass organizationId to validate table belongs to org
      const row = await pageService.getCmsRowById(
        input.organizationId,
        input.tableId,
        input.rowId
      )
      if (!row) return null
      return {
        id: row.id,
        values: row.values as Record<string, unknown>,
        order: row.order,
      }
    }),
})
