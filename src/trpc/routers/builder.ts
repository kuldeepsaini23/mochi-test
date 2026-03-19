/**
 * ============================================================================
 * BUILDER ROUTER - Website Builder Data Operations
 * ============================================================================
 *
 * Dedicated tRPC router for the website builder.
 * This router handles all data fetching for the builder edit mode.
 *
 * ============================================================================
 * ARCHITECTURE: Organization → Website (Category) → Page[]
 *              Domain is optional (for production URLs)
 * ============================================================================
 *
 * KEY CONCEPT: Each Page is a FIRST-CLASS database entity.
 *
 * HIERARCHY:
 * - Website: A category/grouping with auto-generated previewId (e.g., "a7x9k2m5")
 * - Domain: Optional custom domain for production URLs (e.g., "webprodigies.com")
 * - Page: An actual page with its own canvasData, slug, and publish status
 *
 * URL STRUCTURE:
 * - Preview: /{website.previewId}/{page.slug}/edit (e.g., /a7x9k2m5/home/edit)
 * - Production: {domain.customDomain}/{page.slug}/edit (when domain connected)
 *
 * DATA FLOW:
 * 1. User navigates to: /{previewId}/{pageSlug}/edit
 * 2. We find the Page by previewId and slug
 * 3. We load that Page's canvasData into the builder
 * 4. We also provide a list of ALL pages in the website
 *    for the builder's page list/navigation
 *
 * WHY SEPARATE ROUTER:
 * - Clear separation from Page CRUD operations
 * - Single source of truth for builder data fetching
 * - Proper caching with tRPC
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import * as pageService from '@/services/page.service'
import { getWebsiteEditUrl } from '@/services/website.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for getting builder data by domain and page slug.
 */
export const getBuilderDataByPageSlugSchema = z.object({
  organizationId: z.string(),
  domainName: z.string().min(1, 'Domain name is required'),
  pageSlug: z.string().min(1, 'Page slug is required'),
})

/**
 * Schema for getting builder data by page ID.
 */
export const getBuilderDataByIdSchema = z.object({
  organizationId: z.string(),
  pageId: z.string(),
})

/**
 * Schema for getting builder data by website ID and page slug.
 *
 * WHY: Fallback route for websites without a domain (domain deleted).
 * HOW: Uses website ID instead of domain name to find the page.
 */
export const getBuilderDataByWebsiteIdSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string().min(1, 'Website ID is required'),
  pageSlug: z.string().min(1, 'Page slug is required'),
})

/**
 * Schema for getting all pages in a domain.
 */
export const getPagesInDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for getting the edit URL for a website.
 */
export const getWebsiteEditUrlSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const builderRouter = createTRPCRouter({
  /**
   * Get builder data by domain name and page slug.
   *
   * ============================================================================
   * KEY: This returns ALL pages in the website as a PagesState
   * ============================================================================
   *
   * THIS IS THE PRIMARY ENDPOINT for loading the builder.
   *
   * WHY: The builder shows ALL pages in a website (category), not just one.
   * HOW: We find the page by slug, then fetch ALL pages in its website
   *      and transform them into the PagesState format the builder expects.
   *
   * RETURNS:
   * - pageId: The requested page ID (active page)
   * - pageName: Page name
   * - websiteId: Website (category) ID
   * - websiteName: Website (category) name
   * - domainId: Domain ID
   * - domainName: Domain name
   * - canvasData: PagesState with ALL pages in the website
   */
  getDataByPageSlug: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getBuilderDataByPageSlugSchema)
    .query(async ({ input }) => {
      const { organizationId, domainName, pageSlug } = input

      /**
       * THREE-PHASE LOOKUP: Multiple strategies to find the page.
       *
       * WHY: Different scenarios require different lookup strategies:
       * - previewId for preview URLs (primary)
       * - customDomain for production URLs
       * - websiteId as fallback
       *
       * Phase 1: Try website.previewId lookup (preview URLs)
       * Phase 2: Try domain.customDomain lookup (production URLs)
       * Phase 3: Treat identifier as websiteId (fallback)
       *
       * This allows URLs like:
       * - /a7x9k2m5/home/edit → previewId lookup
       * - webprodigies.com/home/edit → customDomain lookup
       */
      let page = await pageService.getPageByDomainAndSlug(domainName, pageSlug)

      // Fallback 1: Try lookup via website's domain (more reliable after domain assignment)
      if (!page) {
        page = await pageService.getPageByWebsiteDomainAndSlug(organizationId, domainName, pageSlug)
      }

      // Fallback 2: treat domainName as websiteId (for deleted domains)
      if (!page) {
        page = await pageService.getPageByWebsiteAndSlug(organizationId, domainName, pageSlug)
      }

      if (!page) {
        throw createStructuredError('NOT_FOUND', 'Page not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: `No page with slug '${pageSlug}' found in domain '${domainName}'`,
        })
      }

      // Verify the page belongs to the organization
      if (page.organizationId !== organizationId) {
        throw createStructuredError('NOT_FOUND', 'Page not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: `Page not found in this organization`,
        })
      }

      // Fetch ALL pages in this website (category)
      const allPages = await pageService.getPagesByWebsite(organizationId, page.websiteId)

      // Transform pages into PagesState format
      // Each database Page entity becomes a page in the builder state
      const pages: Record<string, {
        info: { id: string; name: string; slug: string; createdAt: number; updatedAt: number; cmsTableId?: string | null; cmsSlugColumnSlug?: string | null; isEcommercePage?: boolean }
        canvas: { elements: Record<string, unknown>; rootIds: string[]; childrenMap: Record<string, string[]> }
        viewport: { panX: number; panY: number; zoom: number }
        selection: { selectedIds: string[] }
        history: { past: unknown[]; future: unknown[]; maxSize: number }
      }> = {}

      const pageOrder: string[] = []

      for (const p of allPages) {
        // Use page ID for consistency with database entity
        const pageId = p.id

        // Extract canvas data from the page
        const canvasData = p.canvasData as {
          elements?: Record<string, unknown>
          rootIds?: string[]
          childrenMap?: Record<string, string[]>
          viewport?: { panX: number; panY: number; zoom: number }
          selection?: { selectedIds: string[] }
          history?: { past: unknown[]; future: unknown[]; maxSize: number }
        } | null

        // Build the page state from database page data
        pages[pageId] = {
          info: {
            id: pageId,
            name: p.name,
            slug: p.slug.startsWith('/') ? p.slug : `/${p.slug}`,
            createdAt: p.createdAt.getTime(),
            updatedAt: p.updatedAt.getTime(),
            cmsTableId: p.cmsTableId,
            cmsSlugColumnSlug: p.cmsSlugColumnSlug,
          },
          canvas: {
            elements: canvasData?.elements || {},
            rootIds: canvasData?.rootIds || [],
            childrenMap: canvasData?.childrenMap || {},
          },
          viewport: canvasData?.viewport || { panX: 0, panY: 0, zoom: 1 },
          selection: canvasData?.selection || { selectedIds: [] },
          history: canvasData?.history || { past: [], future: [], maxSize: 50 },
        }

        pageOrder.push(pageId)
      }

      // Build the complete PagesState
      const pagesState = {
        pages,
        pageOrder,
        activePageId: page.id, // The requested page is the active page
      }

      return {
        pageId: page.id,
        pageName: page.name,
        websiteId: page.websiteId,
        websiteName: page.website?.name || 'Unknown',
        domainId: page.domainId,
        // Use customDomain for display (domain.name was removed)
        domainName: page.domain?.customDomain || domainName,
        canvasData: pagesState as Record<string, unknown>,
      }
    }),

  /**
   * Get builder data by page ID.
   *
   * ============================================================================
   * KEY: This returns ALL pages in the website as a PagesState
   * ============================================================================
   *
   * WHY: The builder shows ALL pages in a website (category), not just one.
   * HOW: We use the pageId to find the website, then fetch ALL pages in that website
   *      and transform them into the PagesState format the builder expects.
   *
   * RETURNS:
   * - pageId: The requested page ID (for reference)
   * - pageName: The requested page's name
   * - websiteId: Website (category) ID
   * - websiteName: Website (category) name
   * - domainId: Domain ID
   * - domainName: Domain name
   * - canvasData: PagesState with ALL pages in the website
   */
  getDataById: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getBuilderDataByIdSchema)
    .query(async ({ input }) => {
      const { organizationId, pageId } = input

      // Get the requested page to find its website
      const page = await pageService.getPageById(organizationId, pageId)

      if (!page) {
        throw createStructuredError('NOT_FOUND', 'Page not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Page not found',
        })
      }

      // Fetch ALL pages in this website (category)
      const allPages = await pageService.getPagesByWebsite(organizationId, page.websiteId)

      // Transform pages into PagesState format
      // Each database Page entity becomes a page in the builder state
      const pages: Record<string, {
        info: { id: string; name: string; slug: string; createdAt: number; updatedAt: number; cmsTableId?: string | null; cmsSlugColumnSlug?: string | null; isEcommercePage?: boolean }
        canvas: { elements: Record<string, unknown>; rootIds: string[]; childrenMap: Record<string, string[]> }
        viewport: { panX: number; panY: number; zoom: number }
        selection: { selectedIds: string[] }
        history: { past: unknown[]; future: unknown[]; maxSize: number }
      }> = {}

      const pageOrder: string[] = []

      for (const p of allPages) {
        // Use page ID for consistency with database entity
        const pageIdInLoop = p.id

        // Extract canvas data from the page
        const canvasData = p.canvasData as {
          elements?: Record<string, unknown>
          rootIds?: string[]
          childrenMap?: Record<string, string[]>
          viewport?: { panX: number; panY: number; zoom: number }
          selection?: { selectedIds: string[] }
          history?: { past: unknown[]; future: unknown[]; maxSize: number }
        } | null

        // Build the page state from database page data
        pages[pageIdInLoop] = {
          info: {
            id: pageIdInLoop,
            name: p.name,
            slug: p.slug.startsWith('/') ? p.slug : `/${p.slug}`,
            createdAt: p.createdAt.getTime(),
            updatedAt: p.updatedAt.getTime(),
            cmsTableId: p.cmsTableId,
            cmsSlugColumnSlug: p.cmsSlugColumnSlug,
            isEcommercePage: p.isEcommercePage,
          },
          canvas: {
            elements: canvasData?.elements || {},
            rootIds: canvasData?.rootIds || [],
            childrenMap: canvasData?.childrenMap || {},
          },
          viewport: canvasData?.viewport || { panX: 0, panY: 0, zoom: 1 },
          selection: canvasData?.selection || { selectedIds: [] },
          history: canvasData?.history || { past: [], future: [], maxSize: 50 },
        }

        pageOrder.push(pageIdInLoop)
      }

      // Build the complete PagesState
      const pagesState = {
        pages,
        pageOrder,
        activePageId: pageId, // The requested page is the active page
      }

      return {
        pageId: page.id,
        pageName: page.name,
        websiteId: page.websiteId,
        websiteName: page.website?.name || 'Unknown',
        domainId: page.domainId,
        // Use customDomain for display (domain.name was removed)
        domainName: page.domain?.customDomain || '',
        canvasData: pagesState as Record<string, unknown>,
        // Include updatedAt to detect when fresh data arrives (for cache busting)
        updatedAt: page.updatedAt,
        // E-commerce flag for showing e-commerce elements in sidebar
        enableEcommerce: page.website?.enableEcommerce ?? false,
        // Chat widget ID for rendering in preview/live view
        // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
        chatWidgetId: (page.website as { chatWidgetId?: string | null } | null)?.chatWidgetId ?? null,
      }
    }),

  /**
   * Get builder data by website ID and page slug.
   *
   * WHY: Fallback route when domain is deleted - websites can still be edited.
   * HOW: Uses website ID directly instead of domain name to find the page.
   *
   * This enables the fallback route: /_/[websiteId]/[pathname]/edit
   */
  getDataByWebsiteIdAndSlug: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getBuilderDataByWebsiteIdSchema)
    .query(async ({ input }) => {
      const { organizationId, websiteId, pageSlug } = input

      // Find the page by website ID and slug
      const page = await pageService.getPageByWebsiteAndSlug(organizationId, websiteId, pageSlug)

      if (!page) {
        throw createStructuredError('NOT_FOUND', 'Page not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: `No page with slug '${pageSlug}' found in this website`,
        })
      }

      // Fetch ALL pages in this website (category)
      const allPages = await pageService.getPagesByWebsite(organizationId, page.websiteId)

      // Transform pages into PagesState format
      const pages: Record<string, {
        info: { id: string; name: string; slug: string; createdAt: number; updatedAt: number; cmsTableId?: string | null; cmsSlugColumnSlug?: string | null; isEcommercePage?: boolean }
        canvas: { elements: Record<string, unknown>; rootIds: string[]; childrenMap: Record<string, string[]> }
        viewport: { panX: number; panY: number; zoom: number }
        selection: { selectedIds: string[] }
        history: { past: unknown[]; future: unknown[]; maxSize: number }
      }> = {}

      const pageOrder: string[] = []

      for (const p of allPages) {
        const pageIdInLoop = p.id

        const canvasData = p.canvasData as {
          elements?: Record<string, unknown>
          rootIds?: string[]
          childrenMap?: Record<string, string[]>
          viewport?: { panX: number; panY: number; zoom: number }
          selection?: { selectedIds: string[] }
          history?: { past: unknown[]; future: unknown[]; maxSize: number }
        } | null

        pages[pageIdInLoop] = {
          info: {
            id: pageIdInLoop,
            name: p.name,
            slug: p.slug.startsWith('/') ? p.slug : `/${p.slug}`,
            createdAt: p.createdAt.getTime(),
            updatedAt: p.updatedAt.getTime(),
            cmsTableId: p.cmsTableId,
            cmsSlugColumnSlug: p.cmsSlugColumnSlug,
          },
          canvas: {
            elements: canvasData?.elements || {},
            rootIds: canvasData?.rootIds || [],
            childrenMap: canvasData?.childrenMap || {},
          },
          viewport: canvasData?.viewport || { panX: 0, panY: 0, zoom: 1 },
          selection: canvasData?.selection || { selectedIds: [] },
          history: canvasData?.history || { past: [], future: [], maxSize: 50 },
        }

        pageOrder.push(pageIdInLoop)
      }

      const pagesState = {
        pages,
        pageOrder,
        activePageId: page.id,
      }

      return {
        pageId: page.id,
        pageName: page.name,
        websiteId: page.websiteId,
        websiteName: page.website?.name || 'Unknown',
        domainId: page.domainId,
        // Use customDomain for display (domain.name was removed)
        domainName: page.domain?.customDomain || '',
        canvasData: pagesState as Record<string, unknown>,
        updatedAt: page.updatedAt,
      }
    }),

  /**
   * Get all pages in a domain, grouped by website.
   *
   * WHY: The builder needs to display a list of all pages in the domain
   *      for navigation and the page list panel.
   *
   * RETURNS: Array of pages with website info for grouping
   */
  getPagesInDomain: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getPagesInDomainSchema)
    .query(async ({ input }) => {
      const { organizationId, domainId } = input

      const pages = await pageService.getPagesByDomain(organizationId, domainId)

      // Group pages by website for the UI
      const pagesByWebsite: Record<string, {
        websiteId: string
        websiteName: string
        pages: typeof pages
      }> = {}

      for (const page of pages) {
        const websiteId = page.websiteId
        if (!pagesByWebsite[websiteId]) {
          pagesByWebsite[websiteId] = {
            websiteId,
            websiteName: page.website?.name || 'Unknown',
            pages: [],
          }
        }
        pagesByWebsite[websiteId].pages.push(page)
      }

      return {
        pages,
        pagesByWebsite: Object.values(pagesByWebsite),
      }
    }),

  /**
   * Get the URL to navigate to for a website.
   *
   * WHY: When clicking a website in the list, we need to navigate to its first page.
   * HOW: Gets the first page in the website and constructs the URL.
   *
   * RETURNS:
   * - url: The full edit URL (/{domain}/{firstPageSlug}/edit)
   * - firstPageSlug: Just the slug of the first page
   * - domainName: The domain name
   */
  getWebsiteEditUrl: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getWebsiteEditUrlSchema)
    .query(async ({ input }) => {
      const { organizationId, websiteId } = input

      // Get the website with its domain, previewId, and first page
      const website = await getWebsiteEditUrl(organizationId, websiteId)

      if (!website) {
        throw createStructuredError('NOT_FOUND', 'Website not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Website not found',
        })
      }

      // Get the first page's slug
      const firstPage = website.pages[0]

      if (!firstPage) {
        throw createStructuredError('NOT_FOUND', 'No pages found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Website has no pages yet. Please add a page first.',
        })
      }

      /**
       * URL IDENTIFIER PRIORITY:
       * 1. customDomain (e.g., "webprodigies.com") - for production URLs
       * 2. previewId (e.g., "a7x9k2m5") - for preview URLs (cleaner than website ID)
       * 3. website.id - last resort fallback
       *
       * This ensures users see clean URLs when domain is connected,
       * and still get working preview URLs otherwise.
       */
      const identifier = website.domain?.customDomain || website.previewId || website.id

      return {
        url: `/${identifier}/${firstPage.slug}/edit`,
        firstPageSlug: firstPage.slug,
        domainName: website.domain?.customDomain || null,
      }
    }),
})
