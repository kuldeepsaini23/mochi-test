/**
 * ============================================================================
 * PAGE SERVICE (DAL) - First-Class Page Entity Operations
 * ============================================================================
 *
 * Data Access Layer for Page operations.
 * This is the ONLY place that should interact with Prisma for pages.
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
 * The Website model is now just a CATEGORY/GROUPING for pages.
 * Pages are what get published, edited, and routed to - not websites.
 *
 * URL STRUCTURE:
 * - Preview: /{website.previewId}/{page.slug}
 * - Edit: /{website.previewId}/{page.slug}/edit
 * - Production: {domain.customDomain}/{page.slug}
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { PageStatus, Prisma } from '@/generated/prisma'
import type { CanvasElement, SmartCmsListElement } from '@/components/website-builder/builder-v1.2/_lib/types'
import { listRowsPublicInfinite } from './cms.service'
import { registerCmsTableMapping, type CmsSnapshot } from '@/lib/page-cache'
import { capturePageScreenshot } from '@/lib/trigger/pages/screenshot-capture'
import { logActivity, logActivities } from './activity-log.service'

// ============================================================================
// DEFAULT CANVAS DATA - For creating new pages
// ============================================================================

/**
 * Default page dimensions for new pages.
 */
const DEFAULT_PAGE_WIDTH = 1440
const DEFAULT_PAGE_HEIGHT = 900
const DEFAULT_PAGE_BG_COLOR = '#ffffff'

/**
 * Creates default canvas data for a new page.
 *
 * WHY: Every new page needs initial canvas state with a page element.
 * HOW: Creates the minimal structure the builder expects.
 *
 * @param pageName - Human-readable page name (e.g., "Home", "About Us")
 * @param slug - URL slug for the page (e.g., "home", "about")
 */
function createDefaultCanvasData(
  pageName: string,
  slug: string
): Record<string, unknown> {
  const pageId = `page_${Date.now()}`
  const routeSlug = slug.startsWith('/') ? slug : `/${slug}`

  // Page element - the main container for website content
  const pageElement = {
    id: pageId,
    type: 'page',
    name: pageName,
    slug: routeSlug,
    x: 0,
    y: 0,
    width: DEFAULT_PAGE_WIDTH,
    height: DEFAULT_PAGE_HEIGHT,
    parentId: null,
    order: 0,
    visible: true,
    locked: false,
    backgroundColor: DEFAULT_PAGE_BG_COLOR,
  }

  return {
    elements: { [pageId]: pageElement },
    rootIds: [pageId],
    childrenMap: { [pageId]: [] },
    viewport: { panX: 0, panY: 0, zoom: 1 },
    selection: { selectedIds: [] },
    history: { past: [], future: [], maxSize: 50 },
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type PageCreateInput = {
  organizationId: string
  // Domain is OPTIONAL - websites can have pages without a domain
  // When creating via preview ID flow, there may be no domain yet
  domainId?: string | null
  websiteId: string
  slug: string
  name: string
  userId?: string // For activity logging
}

export type PageUpdateInput = {
  name?: string
  slug?: string
  status?: PageStatus
  order?: number
}

export type ListPagesInput = {
  organizationId: string
  domainId?: string
  websiteId?: string
  status?: PageStatus
  includeDeleted?: boolean
}

// ============================================================================
// PAGE CRUD OPERATIONS
// ============================================================================

/**
 * Get all pages for a domain, grouped by website.
 *
 * WHY: The builder needs to display ALL pages in a domain, categorized by website.
 * HOW: Fetches all pages under the domain, includes website info for grouping.
 *
 * SECURITY: Also excludes pages from soft-deleted websites.
 */
export async function getPagesByDomain(
  organizationId: string,
  domainId: string
) {
  return await prisma.page.findMany({
    where: {
      organizationId,
      domainId,
      deletedAt: null,
      // Exclude pages from soft-deleted websites
      website: {
        deletedAt: null,
      },
    },
    orderBy: [
      { websiteId: 'asc' },
      { order: 'asc' },
    ],
    include: {
      website: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })
}

/**
 * Get all pages for a specific website (category).
 *
 * SECURITY: Also checks that the website itself is not soft-deleted.
 */
export async function getPagesByWebsite(
  organizationId: string,
  websiteId: string
) {
  return await prisma.page.findMany({
    where: {
      organizationId,
      websiteId,
      deletedAt: null,
      // Verify website is not soft-deleted
      website: {
        deletedAt: null,
      },
    },
    orderBy: { order: 'asc' },
  })
}

/**
 * Get a single page by ID.
 *
 * SECURITY: Checks deletedAt on page AND website to ensure:
 * - Deleted pages return null
 * - Pages in deleted websites return null
 *
 * NOTE: Domain is optional - websites remain editable even without a domain.
 * When a domain is hard-deleted, the website's domainId becomes null.
 */
export async function getPageById(
  organizationId: string,
  pageId: string
) {
  return await prisma.page.findFirst({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
      // Check website is not deleted (security: soft-deleted websites should not be accessible)
      website: {
        deletedAt: null,
      },
    },
    include: {
      website: {
        select: {
          id: true,
          name: true,
          enableEcommerce: true,
          // Include chat widget ID for preview/live rendering
          // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
          chatWidgetId: true,
        },
      },
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
    },
  })
}

/**
 * Get a page by domain and slug (for public routing).
 *
 * WHY: Public visitors access pages via /{domain}/{slug}
 * HOW: Direct database lookup using unique constraint (domainId, slug)
 *
 * IMPORTANT: Checks deletedAt on page AND website to ensure:
 * - Deleted pages return 404
 * - Pages in deleted websites return 404 (security fix)
 *
 * NOTE: Domain uses hard delete, so if domain is deleted, the page's
 * domain relation will be null and this query will return null.
 */
export async function getPageByDomainAndSlug(
  identifier: string,
  slug: string
) {
  // Normalize slug (remove leading slash if present)
  const normalizedSlug = slug.startsWith('/') ? slug.slice(1) : slug

  // ============================================================================
  // ROUTING LOGIC: Determine if this is a production URL or preview URL
  // ============================================================================
  // - Contains dot (e.g., "webprodigies.com") → Production URL → lookup by customDomain
  // - No dot (e.g., "a7x9k2m5") → Preview URL → lookup by website.previewId
  //
  // SOURCE OF TRUTH: PreviewUrlRouting, ProductionUrlRouting, EditModeRouting
  // ============================================================================
  const isProductionUrl = identifier.includes('.')

  if (isProductionUrl) {
    // ========================================================================
    // PRODUCTION URL: Custom domain access (e.g., "webprodigies.com/home/edit")
    // ========================================================================
    const domain = await prisma.domain.findFirst({
      where: {
        OR: [
          { customDomain: identifier },
          { customDomain: `https://${identifier}` },
          { customDomain: `http://${identifier}` },
        ],
      },
      select: { id: true },
    })

    if (!domain) {
      return null
    }

    // Strategy 1: Look for page where page.domainId matches directly
    let page = await prisma.page.findFirst({
      where: {
        slug: normalizedSlug,
        deletedAt: null,
        domainId: domain.id,
        website: {
          deletedAt: null,
        },
      },
      include: {
        domain: {
          select: {
            id: true,
            customDomain: true,
          },
        },
        website: {
          select: {
            id: true,
            name: true,
            previewId: true,
          },
        },
      },
    })

    // Strategy 2: Fallback - look for page via website.domainId
    if (!page) {
      page = await prisma.page.findFirst({
        where: {
          slug: normalizedSlug,
          deletedAt: null,
          website: {
            deletedAt: null,
            domainId: domain.id,
          },
        },
        include: {
          domain: {
            select: {
              id: true,
              customDomain: true,
            },
          },
          website: {
            select: {
              id: true,
              name: true,
              previewId: true,
            },
          },
        },
      })
    }

    return page
  } else {
    // ========================================================================
    // PREVIEW URL: Preview ID access (e.g., "a7x9k2m5/home/edit")
    // ========================================================================
    // Search by website.previewId field
    //
    // SOURCE OF TRUTH: PreviewIdLookup, WebsitePreviewId, EditModePreview
    const page = await prisma.page.findFirst({
      where: {
        slug: normalizedSlug,
        deletedAt: null,
        website: {
          previewId: identifier,
          deletedAt: null,
        },
      },
      include: {
        domain: {
          select: {
            id: true,
            customDomain: true,
          },
        },
        website: {
          select: {
            id: true,
            name: true,
            previewId: true,
          },
        },
      },
    })

    return page
  }
}

/**
 * Get a page by website ID and slug.
 *
 * WHY: Fallback route when domain is deleted - websites can still be edited.
 * HOW: Uses website ID directly, does NOT require domain to exist/be active.
 *
 * SECURITY:
 * - Verifies organization ownership
 * - Checks page is not deleted
 * - Checks website is not deleted
 * - Does NOT check domain status (allows orphaned websites to be edited)
 */
export async function getPageByWebsiteAndSlug(
  organizationId: string,
  websiteId: string,
  slug: string
) {
  // Normalize slug (remove leading slash if present)
  const normalizedSlug = slug.startsWith('/') ? slug.slice(1) : slug

  return await prisma.page.findFirst({
    where: {
      organizationId,
      websiteId,
      slug: normalizedSlug,
      deletedAt: null,
      // Check website is not deleted
      website: {
        deletedAt: null,
      },
      // Domain is optional - websites remain editable without a domain
    },
    include: {
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
      website: {
        select: {
          id: true,
          name: true,
          previewId: true,
        },
      },
    },
  })
}

/**
 * Get a page by looking up the website via domain, then finding the page by slug.
 *
 * WHY: Alternative lookup when page.domainId might not be set correctly but
 *      website.domainId is correct. This happens when domain was just assigned
 *      to a website.
 *
 * HOW: First finds website(s) under the domain, then finds the page in those websites.
 *
 * SECURITY:
 * - Verifies organization ownership
 * - Checks page is not deleted
 * - Checks website is not deleted
 */
export async function getPageByWebsiteDomainAndSlug(
  organizationId: string,
  customDomain: string,
  slug: string
) {
  // Normalize slug (remove leading slash if present)
  const normalizedSlug = slug.startsWith('/') ? slug.slice(1) : slug

  // Find the domain by customDomain (may be stored as full URL or just hostname)
  const domain = await prisma.domain.findFirst({
    where: {
      OR: [
        { customDomain: customDomain },
        { customDomain: `https://${customDomain}` },
        { customDomain: `http://${customDomain}` },
      ],
    },
    select: { id: true },
  })

  // If no domain found, return null
  if (!domain) {
    return null
  }

  // Find page where the WEBSITE has the domain (not relying on page.domainId)
  return await prisma.page.findFirst({
    where: {
      organizationId,
      slug: normalizedSlug,
      deletedAt: null,
      // Find via website's domain relation (more reliable after domain assignment)
      website: {
        deletedAt: null,
        domainId: domain.id,
      },
    },
    include: {
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
      website: {
        select: {
          id: true,
          name: true,
          previewId: true,
        },
      },
    },
  })
}

/**
 * Get a PUBLISHED page by domain and slug (for public website viewing).
 *
 * WHY: Only PUBLISHED pages should be visible to visitors.
 * HOW: Adds status filter to ensure only published pages are returned.
 *
 * SECURITY: Checks deletedAt on page AND website to ensure:
 * - Deleted pages return null (404)
 * - Pages in deleted websites return null (users cannot access pages from soft-deleted websites)
 *
 * DOMAIN LOOKUP STRATEGY (STRICT - no fuzzy matching):
 * 1. If domainName looks like a real domain (contains dot), search by customDomain
 * 2. Otherwise, search by name (the globally unique domain identifier)
 * This prevents confusing behavior where "webprodigies-com" could match "webprodigies.com"
 *
 * NOTE: Domains use hard delete - if domain is deleted,
 * the page's domain relation will be null and this query will return null.
 * Use getPublishedPageByWebsiteId for fallback when domain is missing.
 *
 * RETURNS: Page with publishedCanvasData if published, null otherwise.
 */
export async function getPublishedPage(
  identifier: string,
  slug: string
) {
  const normalizedSlug = slug.startsWith('/') ? slug.slice(1) : slug

  // ============================================================================
  // ROUTING LOGIC: Determine if this is a production URL or preview URL
  // ============================================================================
  // - Contains dot (e.g., "webprodigies.com") → Production URL → lookup by customDomain
  // - No dot (e.g., "a7x9k2m5") → Preview URL → lookup by website.previewId
  //
  // SOURCE OF TRUTH: PreviewUrlRouting, ProductionUrlRouting, UrlIdentifierResolution
  // ============================================================================
  const isProductionUrl = identifier.includes('.')

  if (isProductionUrl) {
    // ========================================================================
    // PRODUCTION URL: Custom domain access (e.g., "webprodigies.com/home")
    // ========================================================================
    // Search by domain.customDomain field - check various URL formats
    const domain = await prisma.domain.findFirst({
      where: {
        OR: [
          { customDomain: identifier },
          { customDomain: `https://${identifier}` },
          { customDomain: `http://${identifier}` },
        ],
      },
      select: { id: true, customDomain: true },
    })

    if (!domain) {
      return null
    }

    // Strategy 1: Look for page where page.domainId matches directly
    let page = await prisma.page.findFirst({
      where: {
        slug: normalizedSlug,
        status: 'PUBLISHED',
        deletedAt: null,
        domainId: domain.id,
        website: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        publishedCanvasData: true,
        publishedAt: true,
        websiteId: true,
        organizationId: true,
        // SOURCE OF TRUTH: PageSeo, PageMetadata, SeoFields
        metaTitle: true,
        metaDescription: true,
        ogImage: true,
        noIndex: true,
        // SOURCE OF TRUTH: DynamicPageSeo, CmsSeoMapping
        seoTitleColumn: true,
        seoDescriptionColumn: true,
        seoImageColumn: true,
        website: {
          select: {
            name: true,
            previewId: true,
            // Include chat widget ID so published pages can render the chatbot
            // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
            chatWidgetId: true,
            // Include ecommerce flag so navbar cart button is conditionally rendered
            enableEcommerce: true,
          },
        },
        domain: {
          select: {
            customDomain: true,
            organizationId: true,
          },
        },
      },
    })

    // Strategy 2: Fallback - look for page via website.domainId
    if (!page) {
      page = await prisma.page.findFirst({
        where: {
          slug: normalizedSlug,
          status: 'PUBLISHED',
          deletedAt: null,
          website: {
            deletedAt: null,
            domainId: domain.id,
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          publishedCanvasData: true,
          publishedAt: true,
          websiteId: true,
          organizationId: true,
          // SOURCE OF TRUTH: PageSeo, PageMetadata, SeoFields
          metaTitle: true,
          metaDescription: true,
          ogImage: true,
          noIndex: true,
          // SOURCE OF TRUTH: DynamicPageSeo, CmsSeoMapping
          seoTitleColumn: true,
          seoDescriptionColumn: true,
          seoImageColumn: true,
          website: {
            select: {
              name: true,
              previewId: true,
              // Include chat widget ID so published pages can render the chatbot
              // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
              chatWidgetId: true,
              // Include ecommerce flag so navbar cart button is conditionally rendered
              enableEcommerce: true,
            },
          },
          domain: {
            select: {
              customDomain: true,
              organizationId: true,
            },
          },
        },
      })
    }

    return page
  } else {
    // ========================================================================
    // PREVIEW URL: Preview ID access (e.g., "a7x9k2m5/home")
    // ========================================================================
    // Search by website.previewId field - the new simplified approach
    // This replaces the old confusing domain.name lookup
    //
    // SOURCE OF TRUTH: PreviewIdLookup, WebsitePreviewId
    const page = await prisma.page.findFirst({
      where: {
        slug: normalizedSlug,
        status: 'PUBLISHED',
        deletedAt: null,
        website: {
          previewId: identifier,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        publishedCanvasData: true,
        publishedAt: true,
        websiteId: true,
        organizationId: true,
        // SOURCE OF TRUTH: PageSeo, PageMetadata, SeoFields
        metaTitle: true,
        metaDescription: true,
        ogImage: true,
        noIndex: true,
        // SOURCE OF TRUTH: DynamicPageSeo, CmsSeoMapping
        seoTitleColumn: true,
        seoDescriptionColumn: true,
        seoImageColumn: true,
        website: {
          select: {
            name: true,
            previewId: true,
            // Include chat widget ID so published pages can render the chatbot
            // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
            chatWidgetId: true,
            // Include ecommerce flag so navbar cart button is conditionally rendered
            enableEcommerce: true,
          },
        },
        domain: {
          select: {
            customDomain: true,
            organizationId: true,
          },
        },
      },
    })

    return page
  }
}

/**
 * Get a published page by website ID and slug (fallback when domain is missing).
 *
 * WHY: Allow viewing published pages even when domain is hard-deleted or never assigned.
 * HOW: Uses website ID instead of domain name to find the page.
 *
 * This enables the fallback route: /[websiteId]/[pathname]
 * when the website has no domain assigned.
 */
export async function getPublishedPageByWebsiteId(
  websiteId: string,
  slug: string
) {
  const normalizedSlug = slug.startsWith('/') ? slug.slice(1) : slug

  return await prisma.page.findFirst({
    where: {
      slug: normalizedSlug,
      websiteId,
      status: 'PUBLISHED',
      deletedAt: null,
      // Check website is not deleted (security: soft-deleted websites should not be accessible)
      website: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      publishedCanvasData: true,
      publishedAt: true,
      websiteId: true,
      organizationId: true, // Include for CMS data fetching
      // SOURCE OF TRUTH: PageSeo, PageMetadata, SeoFields
      metaTitle: true,
      metaDescription: true,
      ogImage: true,
      noIndex: true,
      // SOURCE OF TRUTH: DynamicPageSeo, CmsSeoMapping
      seoTitleColumn: true,
      seoDescriptionColumn: true,
      seoImageColumn: true,
      website: {
        select: {
          name: true,
          previewId: true,
          // Include chat widget ID so published pages can render the chatbot
          // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
          chatWidgetId: true,
          // Include ecommerce flag so navbar cart button is conditionally rendered
          enableEcommerce: true,
        },
      },
      domain: {
        select: {
          customDomain: true,
          organizationId: true,
        },
      },
    },
  })
}

/**
 * Create a new page.
 *
 * WHY: Add a new page to a website category.
 * HOW: Creates page with default canvas data containing a page element.
 *
 * VALIDATION:
 * - If domain exists: slug must be unique within the domain
 * - If no domain: slug must be unique within the website
 *
 * DOMAIN IS OPTIONAL:
 * Pages can be created without a domain (preview-only websites).
 * The website's previewId is used for preview URLs: /{previewId}/{slug}
 */
export async function createPage(input: PageCreateInput) {
  const { organizationId, domainId, websiteId, slug, name, userId } = input

  // Normalize slug
  const normalizedSlug = slug.startsWith('/') ? slug.slice(1) : slug

  // Check for existing page with same slug
  // If domain exists: check uniqueness within domain
  // If no domain: check uniqueness within website
  const existingPage = await prisma.page.findFirst({
    where: domainId
      ? {
          domainId,
          slug: normalizedSlug,
          deletedAt: null,
        }
      : {
          websiteId,
          slug: normalizedSlug,
          deletedAt: null,
        },
  })

  if (existingPage) {
    throw new Error(`A page with slug "/${normalizedSlug}" already exists`)
  }

  // Get the highest order number for pages in this website
  const lastPage = await prisma.page.findFirst({
    where: { websiteId, deletedAt: null },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  const newOrder = (lastPage?.order ?? -1) + 1

  // Create default canvas data
  const canvasData = createDefaultCanvasData(name, normalizedSlug)

  const page = await prisma.page.create({
    data: {
      organizationId,
      domainId,
      websiteId,
      slug: normalizedSlug,
      name,
      canvasData: canvasData as Prisma.InputJsonValue,
      status: 'DRAFT',
      order: newOrder,
    },
    include: {
      website: {
        select: {
          id: true,
          name: true,
        },
      },
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
    },
  })

  // Log activity: page created
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'page',
      entityId: page.id,
    })
  }

  return page
}

/**
 * Update a page.
 */
export async function updatePage(
  organizationId: string,
  pageId: string,
  data: PageUpdateInput,
  userId?: string
) {
  // If slug is being updated, check for conflicts
  if (data.slug) {
    const page = await prisma.page.findFirst({
      where: { id: pageId, organizationId, deletedAt: null },
      select: { domainId: true },
    })

    if (!page) {
      throw new Error('Page not found')
    }

    const normalizedSlug = data.slug.startsWith('/') ? data.slug.slice(1) : data.slug

    const existingPage = await prisma.page.findFirst({
      where: {
        domainId: page.domainId,
        slug: normalizedSlug,
        deletedAt: null,
        id: { not: pageId },
      },
    })

    if (existingPage) {
      throw new Error(`A page with slug "/${normalizedSlug}" already exists in this domain`)
    }

    data.slug = normalizedSlug
  }

  const result = await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    data,
    include: {
      website: {
        select: {
          id: true,
          name: true,
        },
      },
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
    },
  })

  // Log activity: page updated
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'page',
      entityId: pageId,
    })
  }

  return result
}

/**
 * Save canvas data for a page.
 *
 * WHY: Auto-save functionality for the builder.
 * HOW: Updates only the canvasData field.
 *
 * @deprecated Use upsertPageCanvasData instead for new code.
 */
export async function savePageCanvasData(
  organizationId: string,
  pageId: string,
  canvasData: Record<string, unknown>
) {
  return await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    data: {
      canvasData: canvasData as Prisma.InputJsonValue,
    },
  })
}

/**
 * Upsert canvas data for a page.
 *
 * WHY: Auto-save functionality for the builder that supports NEW pages.
 * HOW: Uses Prisma upsert - updates if page exists, creates if it doesn't.
 *
 * This is critical for the builder because:
 * 1. Existing pages (loaded from DB) have page ID = page ID
 * 2. NEW pages created in the builder have client-generated IDs
 * 3. When saving a new page, we need to CREATE the page, not update
 *
 * The upsert pattern handles both cases seamlessly.
 */
export async function upsertPageCanvasData(params: {
  organizationId: string
  pageId: string
  websiteId: string
  /** Domain ID - null when domain is deleted. Pages can still be saved without a domain. */
  domainId: string | null
  name: string
  slug: string
  canvasData: Record<string, unknown>
}) {
  const { organizationId, pageId, websiteId, domainId, name, slug, canvasData } = params

  /**
   * SLUG VALIDATION
   * SOURCE OF TRUTH: UpsertPageSlugValidation, DomainSlugConflict
   *
   * Validates slug uniqueness across ALL pages in the same domain.
   * This prevents conflicting routes across different websites
   * that share the same domain.
   *
   * For UPDATE: Use the page's existing domainId
   * For CREATE: Use the passed domainId
   */
  const normalizedSlug = slug.startsWith('/') ? slug.slice(1) : slug

  // Check if page already exists to determine domainId for validation
  const existingPage = await prisma.page.findUnique({
    where: { id: pageId },
    select: { domainId: true, slug: true },
  })

  // Determine which domainId to use for validation
  const effectiveDomainId = existingPage ? existingPage.domainId : domainId

  // Only validate slug if domain is assigned AND slug is changing
  const slugIsChanging = !existingPage || existingPage.slug !== normalizedSlug

  if (effectiveDomainId && slugIsChanging) {
    const conflictingPage = await prisma.page.findFirst({
      where: {
        domainId: effectiveDomainId,
        slug: normalizedSlug,
        deletedAt: null,
        id: { not: pageId }, // Exclude current page
      },
      select: { id: true, websiteId: true },
    })

    if (conflictingPage) {
      throw new Error(
        `A page with slug "/${normalizedSlug}" already exists in this domain. ` +
        `Please use a different slug.`
      )
    }
  }

  // Get the current max order for the website (for new pages)
  const maxOrderResult = await prisma.page.aggregate({
    where: {
      websiteId,
      deletedAt: null,
    },
    _max: {
      order: true,
    },
  })
  const nextOrder = (maxOrderResult._max.order ?? -1) + 1

  return await prisma.page.upsert({
    where: {
      id: pageId,
    },
    // UPDATE: Page exists - just update canvasData and name/slug
    update: {
      canvasData: canvasData as Prisma.InputJsonValue,
      name,
      slug: normalizedSlug,
    },
    // CREATE: Page doesn't exist - create new page with all fields
    create: {
      id: pageId,
      organizationId,
      websiteId,
      domainId,
      name,
      slug: normalizedSlug,
      order: nextOrder,
      canvasData: canvasData as Prisma.InputJsonValue,
      status: 'DRAFT',
    },
  })
}

/**
 * Publish a page.
 *
 * WHY: Make a page visible to public visitors.
 * HOW: Copies canvasData to publishedCanvasData and sets status to PUBLISHED.
 *
 * ============================================================================
 * PUBLISHED DATA EXTRACTION
 * ============================================================================
 *
 * The canvasData contains FULL editor state (history, viewport, selection, etc.)
 * but the published page only needs:
 * - elements: Array of the page element and all its descendants
 * - publishedAt: Timestamp
 *
 * The PageRenderer component derives rootIds and childrenMap from the elements
 * at render time, so we don't store those redundant lookup structures.
 */
export async function publishPage(organizationId: string, pageId: string) {
  const page = await prisma.page.findFirst({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    select: {
      canvasData: true,
      slug: true,
      websiteId: true,
      domain: {
        select: {
          customDomain: true,
        },
      },
    },
  })

  if (!page) {
    throw new Error('Page not found')
  }

  if (!page.canvasData) {
    throw new Error('Page has no canvas data to publish')
  }

  // Extract elements from canvasData
  const canvasData = page.canvasData as {
    elements?: Record<string, CanvasElement>
  }

  // Convert elements record to array for PageRenderer
  const elements = canvasData.elements
    ? Object.values(canvasData.elements)
    : []

  // ====================================================================
  // BAKE CMS DATA — Snapshot first page of CMS rows for SmartCMS Lists
  // ====================================================================
  // WHY: SmartCMS List elements on published pages fetch data client-side,
  // causing a loading animation. By baking the first page of CMS rows into
  // publishedCanvasData at publish time, the renderer gets initialData and
  // displays items instantly — zero loading flash for visitors.
  //
  // HOW: Scan all elements for 'smartcms-list' type with a connected CMS table.
  // For each, fetch the first page of public rows using the element's pageSize
  // and range config. Store the results in a cmsSnapshots map keyed by element ID.
  //
  // GRACEFUL: If any snapshot fetch fails, the page still publishes successfully.
  // The SmartCMS List on the published page falls back to client-side fetching.
  const cmsSnapshots: Record<string, CmsSnapshot> = {}

  const cmsListElements = elements.filter(
    (el): el is SmartCmsListElement =>
      el.type === 'smartcms-list' && Boolean((el as SmartCmsListElement).cmsTableId)
  )

  if (cmsListElements.length > 0) {
    const snapshotPromises = cmsListElements.map(async (el) => {
      try {
        const result = await listRowsPublicInfinite({
          tableId: el.cmsTableId!,
          limit: el.pageSize ?? 10,
          cursor: undefined,
          sortOrder: 'asc',
          rangeStart: el.rangeStart,
          rangeEnd: el.rangeEnd,
        })

        /* Only store snapshot if the table is public and returned data */
        if (result.authorized && result.rows) {
          cmsSnapshots[el.id] = {
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
        /* CMS snapshot failure is non-critical — page still publishes.
           The SmartCMS List will fall back to client-side fetching. */
      }
    })

    await Promise.all(snapshotPromises)
  }

  // ====================================================================
  // REGISTER CMS TABLE → WEBSITE MAPPING (for auto-invalidation)
  // ====================================================================
  // WHY: When CMS data changes later, we need to know which website page
  // caches to invalidate. This reverse mapping (tableId → websiteId) in
  // Redis enables that lookup without scanning JSON in Postgres.
  // Fire-and-forget — registration failure doesn't block publishing.
  if (cmsListElements.length > 0) {
    const uniqueTableIds = [...new Set(cmsListElements.map((el) => el.cmsTableId!))]
    for (const tid of uniqueTableIds) {
      registerCmsTableMapping(tid, page.websiteId)
    }
  }

  // Create published data — includes baked CMS snapshots when available
  const publishedData = {
    elements,
    publishedAt: Date.now(),
    ...(Object.keys(cmsSnapshots).length > 0 && { cmsSnapshots }),
  }

  // Update page to published status
  const updatedPage = await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    data: {
      publishedCanvasData: publishedData as unknown as Prisma.InputJsonValue,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })

  // ========================================================================
  // TRIGGER SCREENSHOT CAPTURE (Background Task)
  // ========================================================================
  // Capture a screenshot of the live public page for website list preview.
  // This runs asynchronously so it doesn't block the publish response.
  // If it fails, the UI will show a fallback placeholder instead.
  try {
    // Construct the public URL for this page
    // Priority: custom domain > preview URL
    // Note: We need to fetch website.previewId for preview URL generation
    const website = await prisma.website.findUnique({
      where: { id: page.websiteId },
      select: { previewId: true },
    })

    if (website?.previewId) {
      /**
       * Build the public URL for screenshot capture.
       * Must use correct protocol + port for local dev (.test / localhost).
       * Production uses https with no port; local dev uses http with :3000.
       */
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochidev.net'
      const isDevelopment = rootDomain.includes('localhost') || rootDomain.includes('.test')
      const protocol = isDevelopment ? 'http' : 'https'
      const port = isDevelopment ? ':3000' : ''

      const publicUrl = page.domain?.customDomain
        ? `${protocol}://${page.domain.customDomain}${port}/${page.slug}`
        : `${protocol}://${rootDomain}${port}/${website.previewId}/${page.slug}`

      // Trigger screenshot capture task (fire and forget)
      await capturePageScreenshot.trigger({
        pageId,
        organizationId,
        publicUrl,
      })
    }
  } catch {
    // Screenshot capture failure is not critical - page is still published
    // The UI will use a fallback placeholder if no preview image exists
  }

  return updatedPage
}

/**
 * Unpublish a page (set to draft).
 */
export async function unpublishPage(organizationId: string, pageId: string) {
  return await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    data: {
      status: 'DRAFT',
    },
  })
}

/**
 * Archive a page.
 */
export async function archivePage(organizationId: string, pageId: string) {
  return await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    data: {
      status: 'ARCHIVED',
    },
  })
}

/**
 * Delete a page (soft delete).
 *
 * WHY: Soft delete allows recovery and ensures deleted pages return 404.
 * HOW: Sets deletedAt timestamp, page becomes invisible to queries.
 *
 * SECURITY: E-commerce pages CANNOT be deleted via this method.
 * They can only be deleted by disabling E-commerce in website settings,
 * which uses the disableEcommerce() function in website.service.ts.
 */
export async function deletePage(
  organizationId: string,
  pageId: string,
  userId?: string
) {
  // Check if page is an E-commerce page - these cannot be deleted directly
  const page = await prisma.page.findFirst({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    select: {
      isEcommercePage: true,
    },
  })

  if (!page) {
    throw new Error('Page not found')
  }

  // Prevent deletion of E-commerce pages
  if (page.isEcommercePage) {
    throw new Error('E-commerce pages cannot be deleted directly. Disable E-commerce in website settings to remove these pages.')
  }

  const result = await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  })

  // Log activity: page deleted
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'page',
      entityId: pageId,
    })
  }

  return result
}

/**
 * Bulk delete pages (soft delete).
 *
 * SECURITY: E-commerce pages CANNOT be deleted via this method.
 * They can only be deleted by disabling E-commerce in website settings.
 */
export async function bulkDeletePages(
  organizationId: string,
  pageIds: string[],
  userId?: string
) {
  // Check if any of the pages are E-commerce pages
  const ecommercePages = await prisma.page.findMany({
    where: {
      id: { in: pageIds },
      organizationId,
      isEcommercePage: true,
      deletedAt: null,
    },
    select: { id: true, name: true },
  })

  if (ecommercePages.length > 0) {
    const pageNames = ecommercePages.map((p) => p.name).join(', ')
    throw new Error(`Cannot delete E-commerce pages (${pageNames}). Disable E-commerce in website settings to remove these pages.`)
  }

  const result = await prisma.page.updateMany({
    where: {
      id: { in: pageIds },
      organizationId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  })

  // Log activity: bulk delete pages
  if (userId && pageIds.length > 0) {
    logActivities(
      pageIds.map((id) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'page' as const,
        entityId: id,
      }))
    )
  }

  return result
}

/**
 * Duplicate a page.
 *
 * Creates a copy of the page within the same or different website.
 */
export async function duplicatePage(
  organizationId: string,
  pageId: string,
  newName: string,
  newSlug: string,
  targetWebsiteId?: string,
  userId?: string
) {
  const original = await getPageById(organizationId, pageId)
  if (!original) {
    throw new Error('Page not found')
  }

  const websiteId = targetWebsiteId || original.websiteId
  const normalizedSlug = newSlug.startsWith('/') ? newSlug.slice(1) : newSlug

  // Check for slug conflict
  const existingPage = await prisma.page.findFirst({
    where: {
      domainId: original.domainId,
      slug: normalizedSlug,
      deletedAt: null,
    },
  })

  if (existingPage) {
    throw new Error(`A page with slug "/${normalizedSlug}" already exists in this domain`)
  }

  // Get the highest order number
  const lastPage = await prisma.page.findFirst({
    where: { websiteId, deletedAt: null },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  const newOrder = (lastPage?.order ?? -1) + 1

  const duplicatedPage = await prisma.page.create({
    data: {
      organizationId,
      domainId: original.domainId,
      websiteId,
      slug: normalizedSlug,
      name: newName,
      canvasData: original.canvasData ?? undefined,
      status: 'DRAFT',
      order: newOrder,
    },
    include: {
      website: {
        select: {
          id: true,
          name: true,
        },
      },
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
    },
  })

  // Propagate origin marker if the source page belongs to a template-installed website.
  // Note: Pages use the WEBSITE feature type since they're part of the website snapshot.
  // We check at the page level for granular lineage tracking.
  const { propagateOriginMarker } = await import('@/lib/templates/origin-hash')
  await propagateOriginMarker(pageId, duplicatedPage.id, 'WEBSITE', organizationId)

  // Log activity: page duplicated (counts as create)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'page',
      entityId: duplicatedPage.id,
    })
  }

  return duplicatedPage
}

/**
 * Reorder pages within a website.
 */
export async function reorderPages(
  organizationId: string,
  websiteId: string,
  pageOrder: string[] // Array of page IDs in new order
) {
  // Update each page's order
  const updates = pageOrder.map((pageId, index) =>
    prisma.page.update({
      where: {
        id: pageId,
        organizationId,
        websiteId,
        deletedAt: null,
      },
      data: {
        order: index,
      },
    })
  )

  return await prisma.$transaction(updates)
}

/**
 * Move a page to a different website (category).
 */
export async function movePage(
  organizationId: string,
  pageId: string,
  targetWebsiteId: string
) {
  // Verify the target website exists and is in the same domain
  const page = await prisma.page.findFirst({
    where: { id: pageId, organizationId, deletedAt: null },
    select: { domainId: true },
  })

  if (!page) {
    throw new Error('Page not found')
  }

  const targetWebsite = await prisma.website.findFirst({
    where: {
      id: targetWebsiteId,
      domainId: page.domainId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!targetWebsite) {
    throw new Error('Target website not found or not in the same domain')
  }

  // Get the highest order number in target website
  const lastPage = await prisma.page.findFirst({
    where: { websiteId: targetWebsiteId, deletedAt: null },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  const newOrder = (lastPage?.order ?? -1) + 1

  return await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    data: {
      websiteId: targetWebsiteId,
      order: newOrder,
    },
  })
}

// ============================================================================
// DYNAMIC PAGE OPERATIONS
// ============================================================================
//
// SOURCE OF TRUTH: Dynamic Page Service Methods
//
// These methods support the Dynamic Pages feature where a page can be linked
// to a CMS table and render at URLs like /domain/{page-slug}/{row-id}.
//
// ============================================================================

/**
 * Check if a page is a dynamic page template (has CMS table connection).
 *
 * A page becomes a "dynamic template" when it has a cmsTableId set.
 * This enables it to render at /domain/{slug}/{rowId} URLs.
 */
export async function isDynamicPage(pageId: string): Promise<boolean> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { cmsTableId: true },
  })
  return !!page?.cmsTableId
}

/**
 * Get a dynamic page template by domain and slug.
 *
 * Returns the page with its CMS table relation if it's a dynamic template.
 * Returns null if the page doesn't exist or isn't a dynamic template.
 *
 * ROUTING LOGIC:
 * - Contains dot (e.g., "webprodigies.com") → Production URL → lookup by customDomain
 * - No dot (e.g., "a7x9k2m5") → Preview URL → lookup by website.previewId
 *
 * SOURCE OF TRUTH: DynamicPageRouting, PreviewUrlRouting, ProductionUrlRouting
 */
export async function getDynamicPageTemplate(
  identifier: string,
  templateSlug: string
) {
  // Normalize slug - handle both with and without leading slash
  const slugWithoutLeadingSlash = templateSlug.replace(/^\//, '')
  const slugWithLeadingSlash = `/${slugWithoutLeadingSlash}`

  // Determine if this is a production URL or preview URL
  const isProductionUrl = identifier.includes('.')

  if (isProductionUrl) {
    // ========================================================================
    // PRODUCTION URL: Custom domain access (e.g., "webprodigies.com/blog/post")
    // ========================================================================
    const domain = await prisma.domain.findFirst({
      where: {
        OR: [
          { customDomain: identifier },
          { customDomain: `https://${identifier}` },
          { customDomain: `http://${identifier}` },
        ],
      },
      select: { id: true },
    })

    if (!domain) {
      return null
    }

    // Strategy 1: Look for page where page.domainId matches directly
    let page = await prisma.page.findFirst({
      where: {
        OR: [{ slug: slugWithoutLeadingSlash }, { slug: slugWithLeadingSlash }],
        deletedAt: null,
        cmsTableId: { not: null },
        domainId: domain.id,
        website: {
          deletedAt: null,
        },
      },
      include: {
        cmsTable: {
          select: {
            id: true,
            slug: true,
            columns: {
              where: { deletedAt: null },
              select: { slug: true, name: true, columnType: true },
            },
          },
        },
        domain: {
          select: { customDomain: true, organizationId: true },
        },
        website: {
          select: { id: true, name: true, previewId: true, chatWidgetId: true, enableEcommerce: true },
        },
      },
    })

    // Strategy 2: Fallback - look for page via website.domainId
    if (!page) {
      page = await prisma.page.findFirst({
        where: {
          OR: [{ slug: slugWithoutLeadingSlash }, { slug: slugWithLeadingSlash }],
          deletedAt: null,
          cmsTableId: { not: null },
          website: {
            deletedAt: null,
            domainId: domain.id,
          },
        },
        include: {
          cmsTable: {
            select: {
              id: true,
              slug: true,
              columns: {
                where: { deletedAt: null },
                select: { slug: true, name: true, columnType: true },
              },
            },
          },
          domain: {
            select: { customDomain: true, organizationId: true },
          },
          website: {
            select: { id: true, name: true, previewId: true, chatWidgetId: true, enableEcommerce: true },
          },
        },
      })
    }

    return page
  } else {
    // ========================================================================
    // PREVIEW URL: Preview ID access (e.g., "a7x9k2m5/blog/post")
    // ========================================================================

    /**
     * Shared include clause for the dynamic page template query.
     * Reused across both previewId lookup and websiteId fallback.
     *
     * SOURCE OF TRUTH: DynamicPageTemplateInclude
     */
    const dynamicPageInclude = {
      cmsTable: {
        select: {
          id: true,
          slug: true,
          columns: {
            where: { deletedAt: null },
            select: { slug: true, name: true, columnType: true },
          },
        },
      },
      domain: {
        select: { customDomain: true, organizationId: true },
      },
      website: {
        select: { id: true, name: true, previewId: true, chatWidgetId: true, enableEcommerce: true },
      },
    } as const

    /**
     * Phase 1: Look up by website.previewId (standard preview URL).
     * Preview URLs use a short random string (e.g., "AdmUYJSl") as identifier.
     */
    let page = await prisma.page.findFirst({
      where: {
        OR: [{ slug: slugWithoutLeadingSlash }, { slug: slugWithLeadingSlash }],
        deletedAt: null,
        cmsTableId: { not: null },
        website: {
          previewId: identifier,
          deletedAt: null,
        },
      },
      include: dynamicPageInclude,
    })

    /**
     * Phase 2: Fallback — treat identifier as websiteId directly.
     * This mirrors getPublishedPage's fallback to getPublishedPageByWebsiteId.
     * Handles the case where the URL uses websiteId (cuid) instead of previewId.
     *
     * SOURCE OF TRUTH: DynamicPageWebsiteIdFallback
     */
    if (!page) {
      page = await prisma.page.findFirst({
        where: {
          OR: [{ slug: slugWithoutLeadingSlash }, { slug: slugWithLeadingSlash }],
          deletedAt: null,
          cmsTableId: { not: null },
          websiteId: identifier,
          website: {
            deletedAt: null,
          },
        },
        include: dynamicPageInclude,
      })
    }

    return page
  }
}

/**
 * Get published dynamic page data with CMS row.
 *
 * This is the main method for rendering dynamic pages to visitors.
 * Returns the page template + the specific CMS row data.
 *
 * HOW ROW LOOKUP WORKS:
 * 1. First tries to find row by ID (cuid)
 * 2. If not found and page has cmsSlugColumnSlug set, tries to find by column value
 *    This enables SEO-friendly URLs like /blog/my-post-title instead of /blog/clx123abc
 */
export async function getPublishedDynamicPage(
  domainName: string,
  templateSlug: string,
  rowIdOrSlug: string
) {
  // First, get the page template
  const template = await getDynamicPageTemplate(domainName, templateSlug)
  if (!template || !template.cmsTableId) {
    return null
  }

  // Check if page is published
  if (template.status !== 'PUBLISHED' || !template.publishedCanvasData) {
    return null
  }

  // Get the CMS row - try by ID first
  let row = await prisma.cmsRow.findFirst({
    where: {
      tableId: template.cmsTableId,
      id: rowIdOrSlug,
      deletedAt: null,
    },
    select: {
      id: true,
      values: true,
      order: true,
    },
  })

  // If not found by ID and slug column is configured, try by slug column value
  if (!row && template.cmsSlugColumnSlug) {
    row = await prisma.cmsRow.findFirst({
      where: {
        tableId: template.cmsTableId,
        deletedAt: null,
        values: {
          path: [template.cmsSlugColumnSlug],
          equals: rowIdOrSlug,
        },
      },
      select: {
        id: true,
        values: true,
        order: true,
      },
    })
  }

  // Row not found - return null (will result in 404)
  if (!row) {
    return null
  }

  return {
    page: template,
    row: {
      id: row.id,
      values: row.values as Record<string, unknown>,
      order: row.order,
    },
  }
}

/**
 * Get the first CMS row for preview in the builder.
 *
 * When editing a dynamic page template, we auto-select the first row
 * from the connected CMS table to show as preview data.
 *
 * SECURITY: Validates tableId belongs to the organization to prevent
 * cross-organization data leakage (IDOR vulnerability fix).
 */
export async function getFirstCmsRow(organizationId: string, tableId: string) {
  return await prisma.cmsRow.findFirst({
    where: {
      tableId,
      deletedAt: null,
      // SECURITY: Validate table belongs to the requesting organization
      table: {
        organizationId,
        deletedAt: null,
      },
    },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      values: true,
      order: true,
    },
  })
}

/**
 * Get a specific CMS row by ID for preview.
 *
 * Used when editing a dynamic page with a specific row URL:
 * /domain/template-slug/row-id/edit
 *
 * SECURITY: Validates tableId belongs to the organization to prevent
 * cross-organization data leakage (IDOR vulnerability fix).
 */
export async function getCmsRowById(
  organizationId: string,
  tableId: string,
  rowId: string
) {
  return await prisma.cmsRow.findFirst({
    where: {
      tableId,
      id: rowId,
      deletedAt: null,
      // SECURITY: Validate table belongs to the requesting organization
      table: {
        organizationId,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      values: true,
      order: true,
    },
  })
}

/**
 * Update page dynamic settings (CMS table connection).
 *
 * Sets or clears the CMS table that this page uses for dynamic content.
 * Also optionally sets the slug column for SEO-friendly URLs.
 */
export async function updatePageDynamicSettings(
  organizationId: string,
  pageId: string,
  settings: {
    cmsTableId: string | null
    cmsSlugColumnSlug?: string | null
  }
) {
  return await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
      deletedAt: null,
    },
    data: {
      cmsTableId: settings.cmsTableId,
      cmsSlugColumnSlug: settings.cmsSlugColumnSlug ?? null,
    },
  })
}

/**
 * Get all dynamic pages that use a specific CMS table.
 *
 * Useful for:
 * - Showing which pages are affected when a table is modified
 * - Generating sitemap entries for dynamic pages
 */
export async function getDynamicPagesForTable(
  organizationId: string,
  tableId: string
) {
  return await prisma.page.findMany({
    where: {
      organizationId,
      cmsTableId: tableId,
      deletedAt: null,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      domain: {
        select: { customDomain: true },
      },
    },
  })
}

/**
 * Find a page by ID that belongs to a specific organization (via website relation).
 * WHY: Builder AI router needs to verify page exists and belongs to the org before generation.
 * Returns page name and parent website info.
 *
 * SOURCE OF TRUTH: Page model in Prisma schema, PageOrganizationVerification, BuilderAIPageLookup
 */
export async function getPageForOrganization(
  pageId: string,
  organizationId: string
) {
  return await prisma.page.findFirst({
    where: {
      id: pageId,
      website: {
        organizationId,
      },
    },
    select: {
      id: true,
      name: true,
      website: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })
}

/**
 * Count pages for a website (excluding soft-deleted).
 *
 * WHY: Feature gate needs to check per-website page limits.
 * HOW: Counts non-deleted pages for the specific website.
 *
 * SOURCE OF TRUTH: PageCountForWebsite, PerWebsitePageLimit
 */
export async function getPageCountForWebsite(
  organizationId: string,
  websiteId: string
) {
  return await prisma.page.count({
    where: {
      websiteId,
      organizationId,
      deletedAt: null,
    },
  })
}

/**
 * Resolve default page slug for a domain.
 *
 * WHY: When visiting a domain root (empty pathname), we need the default page.
 * HOW: Looks up the domain's defaultPageId and returns that page's slug.
 *
 * SOURCE OF TRUTH: DomainDefaultPageResolve
 *
 * @returns The slug of the default page, or null if not configured/found
 */
export async function resolveDefaultPageSlug(domainName: string) {
  const domain = await prisma.domain.findFirst({
    where: { customDomain: domainName },
    select: { defaultPageId: true },
  })

  if (!domain?.defaultPageId) return null

  const defaultPage = await prisma.page.findUnique({
    where: { id: domain.defaultPageId },
    select: { slug: true },
  })

  return defaultPage?.slug ?? null
}

/**
 * Check if a CMS table is a store table.
 *
 * WHY: Store tables need special price formatting for display.
 * HOW: Checks if the table has a sourceStoreId set.
 *
 * SOURCE OF TRUTH: CmsTableStoreCheck
 */
export async function isCmsTableStore(tableId: string) {
  const cmsTable = await prisma.cmsTable.findUnique({
    where: { id: tableId },
    select: { sourceStoreId: true },
  })
  return Boolean(cmsTable?.sourceStoreId)
}

/**
 * Update SEO metadata for a page.
 *
 * SOURCE OF TRUTH: PageSeo, UpdatePageSeo, SeoFields
 *
 * Updates the page's SEO fields — these control how the page appears in search
 * engine results and social media sharing previews. Also handles dynamic page
 * CMS column mappings for SEO field population.
 */
export async function updatePageSeo(
  organizationId: string,
  pageId: string,
  data: {
    metaTitle?: string | null
    metaDescription?: string | null
    ogImage?: string | null
    noIndex?: boolean
    seoTitleColumn?: string | null
    seoDescriptionColumn?: string | null
    seoImageColumn?: string | null
  }
) {
  return await prisma.page.update({
    where: {
      id: pageId,
      organizationId,
    },
    data,
    select: {
      id: true,
      metaTitle: true,
      metaDescription: true,
      ogImage: true,
      noIndex: true,
      seoTitleColumn: true,
      seoDescriptionColumn: true,
      seoImageColumn: true,
    },
  })
}
