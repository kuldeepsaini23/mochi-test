/**
 * ============================================================================
 * WEBSITE SERVICE (DAL) - Website Category Operations
 * ============================================================================
 *
 * Data Access Layer for Website (category) operations.
 * This is the ONLY place that should interact with Prisma for websites.
 *
 * ============================================================================
 * ARCHITECTURE: Organization → Domain → Website (Category) → Page[]
 * ============================================================================
 *
 * KEY CONCEPT: A Website is a CATEGORY/GROUPING that contains multiple Pages.
 * Think of it as a "project" or "folder" that groups related pages together.
 *
 * Example:
 *   Domain: "webprodigies"
 *     └─ Website: "Marketing Site" (category)
 *         └─ Page: /home
 *         └─ Page: /about
 *         └─ Page: /contact
 *     └─ Website: "Landing Pages" (category)
 *         └─ Page: /black-friday
 *         └─ Page: /cyber-monday
 *
 * The Website itself does NOT have canvas data or publish status.
 * Each Page has its own canvas data and individual publish status.
 * See page.service.ts for Page operations.
 */

import 'server-only'
import { prisma, stripe } from '@/lib/config'
import { nanoid } from 'nanoid'
import { logActivity, logActivities } from './activity-log.service'
import { installInternalTemplate, getInternalTemplate } from '@/lib/templates/internal'
import { createStore, addProductToStore } from './store.service'

/**
 * R2 public CDN URL for constructing preview image URLs.
 * Used as fallback if publicUrl wasn't set during screenshot capture.
 */
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

// ============================================================================
// TYPES
// ============================================================================

export type WebsiteCreateInput = {
  organizationId: string
  domainId?: string | null // Optional - websites can be created without a domain (connect later)
  name: string
  description?: string | null
  userId?: string // For activity logging - who performed this action
}

export type WebsiteUpdateInput = {
  name?: string
  description?: string | null
  /** Domain ID to assign this website to (set null/undefined to keep current) */
  domainId?: string
  /** Chat Widget ID to display on this website (null to remove, undefined to keep current) */
  chatWidgetId?: string | null
}

export type ListWebsitesInput = {
  organizationId: string
  search?: string
  page?: number
  pageSize?: number
  domainId?: string
}

// ============================================================================
// WEBSITE CRUD - Category/Grouping Operations
// ============================================================================

/**
 * List all websites (categories) for organization with pagination.
 *
 * WHY: Provides paginated access to website categories.
 * HOW: Uses Prisma's pagination with search across name and description.
 */
export async function listWebsites(input: ListWebsitesInput) {
  const {
    organizationId,
    search,
    page = 1,
    pageSize = 10,
    domainId,
  } = input

  // Build where clause with soft delete filter
  const where = {
    organizationId,
    deletedAt: null,
    ...(domainId && { domainId }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  // Get total count for pagination
  const total = await prisma.website.count({ where })

  // Get paginated websites with domain info, page count, first page slug, and preview image
  // The first page slug is used for instant navigation (no extra query needed)
  // The preview image is used for the website list view card grid
  const websites = await prisma.website.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
      // Get pages ordered by: regular pages first, then e-commerce pages
      // This ensures we pick the first regular page for preview, but fall back to
      // e-commerce pages if the website only has those
      // SOURCE OF TRUTH KEYWORDS: WebsiteListPreview, FirstPagePreview
      pages: {
        where: { deletedAt: null },
        orderBy: [
          { isEcommercePage: 'asc' }, // false (regular) comes before true (ecommerce)
          { order: 'asc' },
        ],
        take: 1,
        select: {
          slug: true,
          name: true,
          status: true,
          isEcommercePage: true,
          // Fetch preview image for website card grid display
          // Include storageKey as fallback for constructing URL if publicUrl is null
          // SOURCE OF TRUTH KEYWORDS: PagePreviewImage, WebsiteCardPreview
          previewImage: {
            select: {
              id: true,
              publicUrl: true,
              storageKey: true,
              updatedAt: true,
            },
          },
        },
      },
      _count: {
        select: {
          pages: {
            where: { deletedAt: null },
          },
        },
      },
    },
  })

  // Post-process websites to construct preview image URLs from storageKey if needed
  // This handles the case where Trigger.dev didn't have R2_PUBLIC_URL set
  const processedWebsites = websites.map((website) => ({
    ...website,
    pages: website.pages.map((page) => ({
      ...page,
      previewImage: page.previewImage
        ? (() => {
            // Resolve the base URL (publicUrl or construct from storageKey)
            const baseUrl =
              page.previewImage.publicUrl ||
              (R2_PUBLIC_URL && page.previewImage.storageKey
                ? `${R2_PUBLIC_URL}/${page.previewImage.storageKey}`
                : null)

            // Append cache-busting param so the browser fetches the new image
            // after re-publishing (same URL, different file content on R2)
            const cacheBustedUrl = baseUrl && page.previewImage.updatedAt
              ? `${baseUrl}?v=${new Date(page.previewImage.updatedAt).getTime()}`
              : baseUrl

            return {
              ...page.previewImage,
              publicUrl: cacheBustedUrl,
            }
          })()
        : null,
    })),
  }))

  return {
    websites: processedWebsites,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * List all websites (categories) for a specific domain.
 */
export async function listWebsitesByDomain(
  organizationId: string,
  domainId: string
) {
  return await prisma.website.findMany({
    where: {
      organizationId,
      domainId,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
      _count: {
        select: {
          pages: {
            where: { deletedAt: null },
          },
        },
      },
    },
  })
}

/**
 * Get a single website (category) by ID.
 *
 * Includes domain and chatWidget info for builder settings.
 */
export async function getWebsiteById(
  organizationId: string,
  websiteId: string
) {
  return await prisma.website.findFirst({
    where: {
      id: websiteId,
      organizationId,
      deletedAt: null,
    },
    include: {
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
      // Include chat widget for builder settings display
      // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
      chatWidget: {
        select: {
          id: true,
          name: true,
        },
      },
      pages: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          order: true,
        },
      },
    },
  })
}

/**
 * Get a website by its previewId (for preview URL routing).
 *
 * WHY: Preview URLs use previewId for development/preview access
 * HOW: Direct lookup by the unique previewId field
 *
 * URL PATTERN: {org}.mochi.test/{previewId}/{page.slug}
 *
 * SOURCE OF TRUTH: PreviewIdLookup, WebsiteByPreviewId, PreviewUrlRouting
 *
 * @param previewId - The auto-generated preview identifier (e.g., "a7x9k2m5")
 * @returns Website with domain, chatWidget, and pages, or null if not found
 */
export async function getWebsiteByPreviewId(previewId: string) {
  return await prisma.website.findFirst({
    where: {
      previewId,
      deletedAt: null,
    },
    include: {
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
      // Include chat widget for rendering in preview/live view
      // SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
      chatWidget: {
        select: {
          id: true,
          name: true,
          config: true, // Include config for rendering the widget
        },
      },
      pages: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          order: true,
        },
      },
    },
  })
}

/**
 * Create a new website (category).
 *
 * WHY: Initialize a new website category, optionally within a domain.
 * HOW: Creates the category with auto-generated previewId - pages are created separately via page.service.ts.
 *
 * PREVIEW ID:
 * - Auto-generated 8-character nanoid (e.g., "a7x9k2m5")
 * - Used for preview URLs: /{previewId}/{page.slug}
 * - Clearly temporary/development, distinguishes from production customDomain URLs
 *
 * SOURCE OF TRUTH: WebsitePreviewId, CreateWebsite, PreviewUrl
 *
 * NOTE: Domain is now optional. Websites can be created first, then a domain connected later.
 */
export async function createWebsite(input: WebsiteCreateInput) {
  const { organizationId, domainId, name, description, userId } = input

  // Generate a short, URL-friendly preview ID using nanoid
  // 8 characters provides ~2.8 trillion unique combinations
  // Example: "a7x9k2m5", "b2n4p8q1"
  const previewId = nanoid(8)

  // If domainId is provided, verify it exists and belongs to organization
  // (no deletedAt check - domains use hard delete)
  if (domainId) {
    const domain = await prisma.domain.findFirst({
      where: {
        id: domainId,
        organizationId,
      },
    })

    if (!domain) {
      throw new Error('Domain not found or does not belong to this organization')
    }
  }

  const website = await prisma.website.create({
    data: {
      organizationId,
      domainId: domainId || null,
      name,
      description,
      previewId,
    },
    include: {
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
    },
  })

  // Log activity: website created
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'website',
      entityId: website.id,
    })
  }

  return website
}

/**
 * Update a website (category).
 *
 * IMPORTANT: When domainId is updated, all pages under this website
 * will also have their domainId updated to match. This ensures the
 * builder and public routes work correctly with the new domain.
 */
export async function updateWebsite(
  organizationId: string,
  websiteId: string,
  data: WebsiteUpdateInput,
  userId?: string
) {
  const website = await getWebsiteById(organizationId, websiteId)
  if (!website) {
    throw new Error('Website not found')
  }

  // Check if domainId is being changed
  const isDomainChanging = data.domainId !== undefined && data.domainId !== website.domainId

  let updatedWebsite

  // Use a transaction if domain is changing (need to update pages too)
  if (isDomainChanging) {
    const [result] = await prisma.$transaction([
      // Update the website
      prisma.website.update({
        where: {
          id: websiteId,
          organizationId,
          deletedAt: null,
        },
        data,
        include: {
          domain: {
            select: {
              id: true,
              customDomain: true,
            },
          },
        },
      }),
      // Update all pages under this website to use the new domain
      prisma.page.updateMany({
        where: {
          websiteId,
          organizationId,
          deletedAt: null,
        },
        data: {
          domainId: data.domainId ?? null,
        },
      }),
    ])

    updatedWebsite = result
  } else {
    // No domain change - just update the website
    updatedWebsite = await prisma.website.update({
      where: {
        id: websiteId,
        organizationId,
        deletedAt: null,
      },
      data,
      include: {
        domain: {
          select: {
            id: true,
            customDomain: true,
          },
        },
      },
    })
  }

  // Log activity: website updated
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'website',
      entityId: websiteId,
    })
  }

  return updatedWebsite
}

/**
 * Delete a website (soft delete).
 *
 * NOTE: This only deletes the category. Pages within the website
 * will become orphaned. Consider deleting pages first or moving them.
 */
export async function deleteWebsite(
  organizationId: string,
  websiteId: string,
  userId?: string
) {
  const result = await prisma.website.update({
    where: {
      id: websiteId,
      organizationId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  })

  // Log activity: website deleted
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'website',
      entityId: websiteId,
    })
  }

  return result
}

/**
 * Delete a website and all its pages (soft delete).
 *
 * WHY: Cascade delete when removing a website category.
 * HOW: Uses a transaction to soft delete both website and its pages.
 */
export async function deleteWebsiteWithPages(
  organizationId: string,
  websiteId: string,
  userId?: string
) {
  // Get page IDs before deletion for logging
  const pages = userId
    ? await prisma.page.findMany({
        where: { websiteId, organizationId, deletedAt: null },
        select: { id: true },
      })
    : []

  const result = await prisma.$transaction([
    // Soft delete all pages in the website
    prisma.page.updateMany({
      where: {
        websiteId,
        organizationId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    }),
    // Soft delete the website
    prisma.website.update({
      where: {
        id: websiteId,
        organizationId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    }),
  ])

  // Log activity: website and pages deleted
  if (userId) {
    const activities = [
      // Log website deletion
      {
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'website' as const,
        entityId: websiteId,
      },
      // Log each page deletion
      ...pages.map((page) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'page' as const,
        entityId: page.id,
      })),
    ]
    logActivities(activities)
  }

  return result
}

/**
 * Bulk delete websites (soft delete).
 */
export async function bulkDeleteWebsites(
  organizationId: string,
  websiteIds: string[],
  userId?: string
) {
  const result = await prisma.website.updateMany({
    where: {
      id: { in: websiteIds },
      organizationId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  })

  // Log activity: bulk delete websites
  if (userId && websiteIds.length > 0) {
    logActivities(
      websiteIds.map((id) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'website' as const,
        entityId: id,
      }))
    )
  }

  return result
}

/**
 * Duplicate a website (category) with all its pages.
 *
 * Creates a copy of the website category and all pages within it.
 */
export async function duplicateWebsite(
  organizationId: string,
  websiteId: string,
  newName: string,
  targetDomainId?: string,
  userId?: string
) {
  // Get original website with pages
  const original = await prisma.website.findFirst({
    where: {
      id: websiteId,
      organizationId,
      deletedAt: null,
    },
    include: {
      pages: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!original) {
    throw new Error('Website not found')
  }

  // Determine target domain (default to same domain)
  const domainId = targetDomainId || original.domainId

  // Verify target domain exists and belongs to organization (no deletedAt - domains use hard delete)
  if (domainId) {
    const targetDomain = await prisma.domain.findFirst({
      where: {
        id: domainId,
        organizationId,
      },
    })

    if (!targetDomain) {
      throw new Error('Target domain not found or does not belong to this organization')
    }
  }

  // Create duplicate website with new previewId
  const newWebsite = await prisma.website.create({
    data: {
      organizationId,
      domainId,
      name: newName,
      description: original.description,
      previewId: nanoid(8), // Generate new preview ID for the duplicate
    },
  })

  // Duplicate all pages with new slugs to avoid conflicts
  if (original.pages.length > 0) {
    const timestamp = Date.now()

    for (const page of original.pages) {
      // Generate a unique slug for the duplicate
      const newSlug = `${page.slug}-copy-${timestamp}`

      await prisma.page.create({
        data: {
          organizationId,
          domainId,
          websiteId: newWebsite.id,
          slug: newSlug,
          name: `${page.name} (Copy)`,
          canvasData: page.canvasData ?? undefined,
          status: 'DRAFT',
          order: page.order,
        },
      })
    }
  }

  // Return the new website with pages
  const duplicatedWebsite = await prisma.website.findFirst({
    where: { id: newWebsite.id },
    include: {
      domain: {
        select: {
          id: true,
          customDomain: true,
        },
      },
      pages: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          order: true,
        },
      },
    },
  })

  // Propagate origin marker if the source website was installed from a template.
  // This ensures duplicated template-installed websites retain their lineage.
  const { propagateOriginMarker } = await import('@/lib/templates/origin-hash')
  await propagateOriginMarker(websiteId, newWebsite.id, 'WEBSITE', organizationId)

  // Log activity: website duplicated (counts as create for the new website and pages)
  if (userId && duplicatedWebsite) {
    const activities = [
      {
        userId,
        organizationId,
        action: 'create' as const,
        entity: 'website' as const,
        entityId: newWebsite.id,
      },
      ...duplicatedWebsite.pages.map((page) => ({
        userId,
        organizationId,
        action: 'create' as const,
        entity: 'page' as const,
        entityId: page.id,
      })),
    ]
    logActivities(activities)
  }

  return duplicatedWebsite
}

// ============================================================================
// E-COMMERCE OPERATIONS
// ============================================================================
// SOURCE OF TRUTH: Website E-commerce Toggle, EnableEcommerce, Ecommerce Pages
//
// These methods handle enabling/disabling E-commerce for a website.
// When enabled, default E-commerce pages are created.
// When disabled, all E-commerce pages and their related local components are HARD DELETED.
// ============================================================================

/**
 * Enable E-commerce for a website.
 *
 * WHY: Activates E-commerce functionality and installs the e-commerce starter
 * template (checkout page, order confirmation page, sample products, etc.)
 * into the existing website.
 *
 * HOW: Uses the internal template system to install a pre-built e-commerce
 * starter template. The orchestrator handles page creation with slug collision
 * avoidance, local component creation, saved color upserts, and the
 * enableEcommerce flag — all in a single install pass.
 *
 * NOTE: The old approach (DEFAULT_ECOMMERCE_PAGES + createDefaultEcommerceCanvasData)
 * has been replaced by the internal template system which provides richer,
 * fully-designed starter pages instead of empty shells.
 */
export async function enableEcommerce(
  organizationId: string,
  websiteId: string
) {
  /** Validate the website exists and belongs to this org */
  const website = await prisma.website.findFirst({
    where: {
      id: websiteId,
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      domainId: true,
      enableEcommerce: true,
    },
  })

  if (!website) {
    throw new Error('Website not found')
  }

  /** Already enabled — no action needed */
  if (website.enableEcommerce) {
    return { success: true, message: 'E-commerce is already enabled' }
  }

  /**
   * Look up the e-commerce starter internal template.
   * This template contains pre-designed checkout, order confirmation pages,
   * and optionally sample products/CMS schemas.
   */
  const template = getInternalTemplate('ecommerce-starter')
  if (!template) {
    throw new Error('Internal e-commerce template not found')
  }

  /**
   * Install the template into the existing website.
   * The orchestrator handles everything: enabling the flag, creating pages
   * with slug collision avoidance, creating local components, upserting
   * saved colors, and remapping cross-feature ID references.
   */
  const result = await installInternalTemplate(template, {
    organizationId,
    targetWebsiteId: websiteId,
    targetDomainId: website.domainId,
  })

  if (!result.success) {
    throw new Error(
      `Failed to install e-commerce template: ${result.failedCount} item(s) failed`
    )
  }

  /**
   * Step 2: Create the store + CMS table and link installed products.
   * WHY: The template installs product records but doesn't link them to a store.
   * The store creation auto-creates the synced CMS table, and addProductToStore
   * syncs each product as a CMS row — making the storefront SmartCMS list work.
   *
   * The CMS table ID from createStore gets added to the remapTable so the
   * Product Details page's cmsTableId reference (CMS_TABLE_SOURCE_ID) is updated
   * to point to the newly created CMS table.
   */
  const installedProducts = result.items.filter(
    (item) => item.featureType === 'PRODUCT' && item.success
  )

  if (installedProducts.length > 0) {
    /** Create the store — this also creates the synced CMS table */
    const store = await createStore({
      organizationId,
      name: 'E-Commerce Store',
      description: 'Auto-created store for e-commerce starter template',
    })

    /**
     * Map the source CMS table ID to the new store's CMS table ID.
     * This fixes the Product Details page's cmsTableId reference.
     */
    const cmsTable = await prisma.cmsTable.findFirst({
      where: { sourceStoreId: store.id },
      select: { id: true },
    })

    if (cmsTable) {
      /** Update the Product Details page's cmsTableId to the new CMS table */
      const CMS_TABLE_SOURCE_ID = 'cmmo6za0b00548obep205xvlu'
      const remappedCmsTableId = result.idMapping[CMS_TABLE_SOURCE_ID]

      /**
       * Find pages that were installed with the old CMS table source ID
       * and update them to point to the actual new CMS table.
       */
      const pagesWithCms = await prisma.page.findMany({
        where: {
          websiteId,
          cmsTableId: remappedCmsTableId || CMS_TABLE_SOURCE_ID,
        },
        select: { id: true },
      })

      for (const page of pagesWithCms) {
        await prisma.page.update({
          where: { id: page.id },
          data: { cmsTableId: cmsTable.id },
        })
      }

      /**
       * Also remap the CMS table ID in all page canvas data.
       * SmartCMS list elements reference the CMS table by ID in their
       * cmsTableId property — these need to point to the new table.
       */
      const { remapIds } = await import('@/lib/templates/id-remapper')
      const cmsRemapTable: Record<string, string> = {}

      /** Map the source CMS table ID to the new CMS table */
      cmsRemapTable[CMS_TABLE_SOURCE_ID] = cmsTable.id
      if (remappedCmsTableId && remappedCmsTableId !== cmsTable.id) {
        cmsRemapTable[remappedCmsTableId] = cmsTable.id
      }

      const allPages = await prisma.page.findMany({
        where: { websiteId },
        select: { id: true, canvasData: true },
      })

      for (const page of allPages) {
        if (page.canvasData) {
          const remapped = remapIds(page.canvasData, cmsRemapTable)
          await prisma.page.update({
            where: { id: page.id },
            data: { canvasData: remapped },
          })
        }
      }
    }

    /**
     * Step 3: Sync installed products to Stripe.
     * WHY: installProduct() creates DB records WITHOUT Stripe resources.
     * The add-to-cart buttons need stripe_price_id in CMS rows to function.
     * Without Stripe sync, CMS rows get stripe_price_id=null → buttons disabled.
     *
     * For each product: create Stripe product → create Stripe price → update DB.
     * This must happen BEFORE addProductToStore so CMS rows get valid stripe_price_id.
     */
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { stripeConnectedAccountId: true },
    })
    const stripeAccountId = org?.stripeConnectedAccountId

    if (stripeAccountId) {
      for (const item of installedProducts) {
        try {
          /** Fetch the product with its prices for Stripe sync */
          const product = await prisma.product.findUnique({
            where: { id: item.newId },
            select: {
              id: true,
              name: true,
              description: true,
              imageUrl: true,
              images: true,
              stripeProductId: true,
              prices: {
                where: { active: true, deletedAt: null },
                select: {
                  id: true,
                  name: true,
                  amount: true,
                  currency: true,
                  billingType: true,
                  interval: true,
                  intervalCount: true,
                  stripePriceId: true,
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          })

          if (!product || product.stripeProductId) continue

          /**
           * Build Stripe images: primary + gallery, max 8 per Stripe limit.
           */
          const productImages = (product.images as string[] | null) ?? []
          const stripeImages = [product.imageUrl, ...productImages]
            .filter((url): url is string => typeof url === 'string' && url.length > 0)
            .slice(0, 8)

          /** Create the Stripe product on the connected account */
          const stripeProduct = await stripe.products.create(
            {
              name: product.name,
              description: product.description || undefined,
              images: stripeImages.length > 0 ? stripeImages : undefined,
            },
            { stripeAccount: stripeAccountId }
          )

          /** Update DB product with Stripe ID */
          await prisma.product.update({
            where: { id: product.id },
            data: { stripeProductId: stripeProduct.id },
          })

          /** Create Stripe prices for each DB price that doesn't have one */
          for (const price of product.prices) {
            if (price.stripePriceId) continue

            const stripePriceParams: Record<string, unknown> = {
              product: stripeProduct.id,
              currency: price.currency,
              nickname: price.name,
            }

            if (price.billingType === 'ONE_TIME') {
              stripePriceParams.unit_amount = price.amount
            } else if (price.billingType === 'RECURRING') {
              stripePriceParams.unit_amount = price.amount
              const intervalMap: Record<string, string> = {
                DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year',
              }
              stripePriceParams.recurring = {
                interval: intervalMap[price.interval || 'MONTH'] || 'month',
                interval_count: price.intervalCount || 1,
              }
            }

            const stripePrice = await stripe.prices.create(
              stripePriceParams as unknown as Parameters<typeof stripe.prices.create>[0],
              { stripeAccount: stripeAccountId }
            )

            /** Update DB price with Stripe price ID */
            await prisma.productPrice.update({
              where: { id: price.id },
              data: { stripePriceId: stripePrice.id },
            })
          }
        } catch (error) {
          /** Non-fatal — products can be synced to Stripe later manually */
          console.error(
            `[enableEcommerce] Failed to sync product "${item.featureName}" to Stripe:`,
            error
          )
        }
      }
    }

    /**
     * Step 4: Add each installed product to the store.
     * addProductToStore handles: StoreProduct creation + CMS row sync.
     * Now that Stripe resources exist, CMS rows will have valid stripe_price_id.
     */
    for (const item of installedProducts) {
      try {
        const firstPrice = await prisma.productPrice.findFirst({
          where: { productId: item.newId, active: true },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })

        if (firstPrice) {
          await addProductToStore({
            storeId: store.id,
            productId: item.newId,
            priceId: firstPrice.id,
          })
        }
      } catch (error) {
        /** Non-fatal — product exists but wasn't linked to store */
        console.error(
          `[enableEcommerce] Failed to add product "${item.featureName}" to store:`,
          error
        )
      }
    }
  }

  return { success: true, message: 'E-commerce enabled with starter template' }
}

/**
 * Disable E-commerce for a website.
 *
 * WHY: Deactivates E-commerce functionality and cleans up all related data.
 * HOW: HARD DELETES all E-commerce pages and their local components, then updates the flag.
 *
 * IMPORTANT: This is a destructive operation!
 * - All E-commerce pages (isEcommercePage=true) are permanently deleted
 * - All local components created within E-commerce pages are permanently deleted
 * - All published data for these pages is permanently deleted
 * - This CANNOT be undone!
 */
export async function disableEcommerce(
  organizationId: string,
  websiteId: string
) {
  // Get the website to verify it exists and E-commerce is enabled
  const website = await prisma.website.findFirst({
    where: {
      id: websiteId,
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      enableEcommerce: true,
    },
  })

  if (!website) {
    throw new Error('Website not found')
  }

  // Already disabled - no action needed
  if (!website.enableEcommerce) {
    return { success: true, message: 'E-commerce is already disabled' }
  }

  // Get all E-commerce page IDs for this website (for counting)
  const ecommercePages = await prisma.page.findMany({
    where: {
      websiteId,
      organizationId,
      isEcommercePage: true,
    },
    select: { id: true },
  })

  const ecommercePageIds = ecommercePages.map((p) => p.id)

  // Use transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    // HARD DELETE all E-commerce pages
    // This permanently removes all pages marked as isEcommercePage=true
    await tx.page.deleteMany({
      where: {
        websiteId,
        organizationId,
        isEcommercePage: true,
      },
    })

    // Update the website to disable E-commerce
    await tx.website.update({
      where: { id: websiteId },
      data: { enableEcommerce: false },
    })
  })

  return {
    success: true,
    message: `E-commerce disabled and ${ecommercePageIds.length} pages permanently deleted`,
    deletedPageCount: ecommercePageIds.length,
  }
}

/**
 * Get E-commerce status for a website.
 *
 * WHY: Allow the UI to check if E-commerce is enabled and get page count.
 * HOW: Returns the enableEcommerce flag and count of E-commerce pages.
 */
export async function getEcommerceStatus(
  organizationId: string,
  websiteId: string
) {
  const website = await prisma.website.findFirst({
    where: {
      id: websiteId,
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      enableEcommerce: true,
      _count: {
        select: {
          pages: {
            where: {
              isEcommercePage: true,
              deletedAt: null,
            },
          },
        },
      },
    },
  })

  if (!website) {
    return null
  }

  return {
    enabled: website.enableEcommerce,
    ecommercePageCount: website._count.pages,
  }
}

/**
 * Get all E-commerce pages for a website.
 *
 * WHY: Display E-commerce pages separately in the builder sidebar.
 * HOW: Returns all pages where isEcommercePage=true for the given website.
 */
export async function getEcommercePages(
  organizationId: string,
  websiteId: string
) {
  return await prisma.page.findMany({
    where: {
      websiteId,
      organizationId,
      isEcommercePage: true,
      deletedAt: null,
    },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      order: true,
    },
  })
}

/**
 * Get the checkout page slug for a website's e-commerce pages.
 *
 * WHY: The CartSheet needs to navigate to the website's actual checkout page,
 *      which may have a modified slug (e.g., 'checkout-1234567890' if there was
 *      a collision during creation).
 * HOW: Finds the first e-commerce page whose slug starts with 'checkout'.
 *
 * SOURCE OF TRUTH: CheckoutPageSlug, EcommerceCheckoutPage, CartCheckoutNavigation
 */
export async function getCheckoutPageSlug(
  websiteId: string
): Promise<string | null> {
  const checkoutPage = await prisma.page.findFirst({
    where: {
      websiteId,
      isEcommercePage: true,
      slug: { startsWith: 'checkout' },
      deletedAt: null,
    },
    select: { slug: true },
  })

  return checkoutPage?.slug ?? null
}

/**
 * Get website with first page for edit URL construction.
 *
 * WHY: When clicking a website in the list, we need to navigate to its first page.
 * HOW: Fetches website with previewId, domain, and first page slug.
 *
 * SOURCE OF TRUTH: WebsiteEditUrl, WebsiteFirstPage
 */
export async function getWebsiteEditUrl(
  organizationId: string,
  websiteId: string
) {
  return await prisma.website.findFirst({
    where: {
      id: websiteId,
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      previewId: true,
      domain: {
        select: {
          customDomain: true,
        },
      },
      pages: {
        // Get the first page, prioritizing regular pages over e-commerce pages
        where: { deletedAt: null },
        orderBy: [
          { isEcommercePage: 'asc' }, // false (regular) comes before true (ecommerce)
          { order: 'asc' },
        ],
        take: 1,
        select: {
          slug: true,
        },
      },
    },
  })
}
