/**
 * Product Service (DAL)
 *
 * Data Access Layer for product and pricing operations.
 * This is the ONLY place that should interact with Prisma for products.
 *
 * Products are created in the organization's Stripe Connect account.
 * tRPC routers call these functions after security checks.
 */

import 'server-only'
import { prisma, stripe } from '@/lib/config'
import { BillingType, BillingInterval, Prisma } from '@/generated/prisma'
import type Stripe from 'stripe'
import { getOrganizationCurrency, validateOrganizationCurrency } from '@/services/currency.service'
import { logActivity, logActivities } from './activity-log.service'
import * as cmsService from './cms.service'

// ============================================================================
// TYPES
// ============================================================================

export type ProductCreateInput = {
  organizationId: string
  name: string
  description?: string | null
  imageUrl?: string | null
  /**
   * SOURCE OF TRUTH: ProductImages
   * Additional product images for gallery display (max 8 per Stripe limit).
   */
  images?: string[]
}

export type ProductUpdateInput = {
  name?: string
  description?: string | null
  imageUrl?: string | null
  /**
   * SOURCE OF TRUTH: ProductImages
   * Additional product images for gallery display (max 8 per Stripe limit).
   */
  images?: string[]
  active?: boolean
  /**
   * SOURCE OF TRUTH: ProductTestMode
   * When true, all payment links for this product use test Stripe API keys.
   */
  testMode?: boolean
  /**
   * SOURCE OF TRUTH: ProductInventory
   * Inventory management settings
   */
  trackInventory?: boolean
  inventoryQuantity?: number
  allowBackorder?: boolean
  lowStockThreshold?: number | null
}

export type PriceCreateInput = {
  productId: string
  name: string
  amount: number // In cents
  currency?: string
  billingType: BillingType
  // For RECURRING billing
  interval?: BillingInterval
  intervalCount?: number
  // For SPLIT_PAYMENT billing
  installments?: number
  installmentInterval?: BillingInterval
  installmentIntervalCount?: number
  // Free trial duration in days (for RECURRING and ONE_TIME, not SPLIT_PAYMENT)
  trialDays?: number
}

export type PriceUpdateInput = {
  name?: string
  active?: boolean
  // Free trial duration — set to null to remove trial
  trialDays?: number | null
}

export type FeatureCreateInput = {
  organizationId: string
  priceId: string
  name: string
  description?: string | null
  order?: number
}

export type FeatureUpdateInput = {
  name?: string
  description?: string | null
  order?: number
}

// ============================================================================
// STRIPE HELPERS
// ============================================================================

/**
 * Get organization's Stripe Connect account ID
 */
async function getStripeAccountId(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })
  return org?.stripeConnectedAccountId || null
}

/**
 * Map BillingInterval to Stripe interval
 */
function toStripeInterval(interval: BillingInterval): Stripe.PriceCreateParams.Recurring.Interval {
  switch (interval) {
    case 'DAY':
      return 'day'
    case 'WEEK':
      return 'week'
    case 'MONTH':
      return 'month'
    case 'YEAR':
      return 'year'
    default:
      return 'month'
  }
}

// ============================================================================
// PRODUCT CRUD
// ============================================================================

export type ListProductsInput = {
  organizationId: string
  search?: string
  page?: number
  pageSize?: number
  activeOnly?: boolean
}

/**
 * List all products for organization with pagination
 */
export async function listProducts(input: ListProductsInput) {
  const { organizationId, search, page = 1, pageSize = 10, activeOnly } = input

  // Build where clause
  const where = {
    organizationId,
    deletedAt: null,
    ...(activeOnly !== undefined && { active: activeOnly }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  // Get total count for pagination
  const total = await prisma.product.count({ where })

  // Get paginated products
  const products = await prisma.product.findMany({
    where,
    include: {
      prices: {
        where: {
          deletedAt: null,
        },
        include: {
          features: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  return {
    products: products.map(transformProduct),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get product by ID
 */
export async function getProductById(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
    include: {
      prices: {
        where: {
          deletedAt: null,
        },
        include: {
          features: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  return product ? transformProduct(product) : null
}

/**
 * Create a new product
 * Creates both locally and in Stripe Connect account
 *
 * @param input - Product data to create
 * @param userId - Optional user ID to log the activity
 */
export async function createProduct(input: ProductCreateInput, userId?: string) {
  const stripeAccountId = await getStripeAccountId(input.organizationId)

  let stripeProductId: string | undefined

  /**
   * Build Stripe images array: primary imageUrl first, then additional images.
   * Stripe accepts up to 8 images per product.
   */
  const stripeImages = [input.imageUrl, ...(input.images ?? [])].filter(
    (url): url is string => typeof url === 'string' && url.length > 0
  ).slice(0, 8)

  // Create product in Stripe Connect account if connected
  if (stripeAccountId) {
    const stripeProduct = await stripe.products.create(
      {
        name: input.name,
        description: input.description || undefined,
        images: stripeImages.length > 0 ? stripeImages : undefined,
      },
      {
        stripeAccount: stripeAccountId,
      }
    )
    stripeProductId = stripeProduct.id
  }

  /**
   * Create product in database.
   * `images` is a Json field storing gallery URLs as a string[] array.
   */
  const product = await prisma.product.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      images: input.images ?? [],
      stripeProductId,
    },
    include: {
      prices: {
        where: { deletedAt: null },
        include: {
          features: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'product',
      entityId: product.id,
    })
  }

  return transformProduct(product)
}

/**
 * Update a product
 *
 * @param organizationId - Organization that owns the product
 * @param productId - Product ID to update
 * @param data - Product data to update
 * @param userId - Optional user ID to log the activity
 */
export async function updateProduct(
  organizationId: string,
  productId: string,
  data: ProductUpdateInput,
  userId?: string
) {
  // Get existing product
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!existing) {
    throw new Error('Product not found')
  }

  // Update in Stripe if connected
  if (existing.stripeProductId) {
    const stripeAccountId = await getStripeAccountId(organizationId)
    if (stripeAccountId) {
      /**
       * Build Stripe images: combine primary imageUrl + additional images.
       * Only re-sync images to Stripe when either imageUrl or images changed.
       * Stripe accepts up to 8 images per product.
       */
      const stripeUpdateParams: Record<string, unknown> = {
        name: data.name || existing.name,
        description: data.description ?? existing.description ?? undefined,
        active: data.active ?? existing.active,
      }

      // Cast existing to access images field (may be on model but not in Prisma type)
      const existingWithImages = existing as typeof existing & { images?: string[] }

      if (data.imageUrl !== undefined || data.images !== undefined) {
        const resolvedImageUrl = data.imageUrl !== undefined ? data.imageUrl : existing.imageUrl
        const resolvedImages = data.images !== undefined ? data.images : (existingWithImages.images ?? [])
        const stripeImages = [resolvedImageUrl, ...resolvedImages].filter(
          (url): url is string => typeof url === 'string' && url.length > 0
        ).slice(0, 8)
        stripeUpdateParams.images = stripeImages
      }

      await stripe.products.update(
        existing.stripeProductId,
        stripeUpdateParams as Stripe.ProductUpdateParams,
        {
          stripeAccount: stripeAccountId,
        }
      )
    }
  }

  // Update in database
  const updateData: Prisma.ProductUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl
  if (data.images !== undefined) (updateData as Record<string, unknown>).images = data.images
  if (data.active !== undefined) updateData.active = data.active
  if (data.testMode !== undefined) updateData.testMode = data.testMode
  // Inventory fields
  if (data.trackInventory !== undefined) updateData.trackInventory = data.trackInventory
  if (data.inventoryQuantity !== undefined) updateData.inventoryQuantity = data.inventoryQuantity
  if (data.allowBackorder !== undefined) updateData.allowBackorder = data.allowBackorder
  if (data.lowStockThreshold !== undefined) updateData.lowStockThreshold = data.lowStockThreshold

  // SECURITY: Include organizationId in WHERE clause to prevent TOCTOU attacks.
  // This ensures atomic validation - the update only succeeds if the product
  // still belongs to this organization at the moment of update.
  const product = await prisma.product.update({
    where: {
      id: productId,
      organizationId, // Defense-in-depth: prevents cross-tenant modification
    },
    data: updateData,
    include: {
      prices: {
        where: { deletedAt: null },
        include: {
          features: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'product',
      entityId: product.id,
    })
  }

  // === CMS TWO-WAY SYNC ===
  // Sync product details to CMS tables for e-commerce store display
  // This ensures the website builder always has current product data
  try {
    // Sync name, description, image, and gallery changes to all CMS rows referencing this product
    if (data.name !== undefined || data.description !== undefined || data.imageUrl !== undefined || data.images !== undefined) {
      await cmsService.syncProductDetailsToCms({
        productId,
        productName: data.name,
        productDescription: data.description,
        productImage: data.imageUrl,
        productImages: data.images,
      })
    }

    // Sync inventory settings to CMS rows for conditional display
    // This allows website builder to show/hide products based on stock status
    if (
      data.trackInventory !== undefined ||
      data.inventoryQuantity !== undefined ||
      data.allowBackorder !== undefined
    ) {
      await cmsService.syncProductInventoryToCms({
        productId,
        trackInventory: product.trackInventory,
        inventoryQuantity: product.inventoryQuantity,
        allowBackorder: product.allowBackorder,
      })
    }
  } catch (error) {
    // Log but don't fail - CMS sync is best-effort to not block product updates
    console.error('Failed to sync product to CMS:', error)
  }

  return transformProduct(product)
}

/**
 * Hard delete a product, its prices, and their features.
 * Archives in Stripe first (deactivate), then cascade-deletes locally.
 *
 * @param organizationId - Organization that owns the product
 * @param productId - Product ID to delete
 * @param userId - Optional user ID to log the activity
 */
export async function deleteProduct(organizationId: string, productId: string, userId?: string) {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
    include: { prices: true },
  })

  if (!existing) {
    throw new Error('Product not found')
  }

  // Archive in Stripe (deactivate — Stripe doesn't allow true deletion)
  const stripeAccountId = await getStripeAccountId(organizationId)
  if (stripeAccountId) {
    // Deactivate all Stripe prices first
    await Promise.all(
      existing.prices
        .filter((p) => p.stripePriceId)
        .map((p) =>
          stripe.prices.update(
            p.stripePriceId!,
            { active: false },
            { stripeAccount: stripeAccountId }
          )
        )
    )

    // Then archive the Stripe product
    if (existing.stripeProductId) {
      await stripe.products.update(
        existing.stripeProductId,
        { active: false },
        { stripeAccount: stripeAccountId }
      )
    }
  }

  // Hard delete with cascade: features → prices → product
  await prisma.$transaction(async (tx) => {
    await tx.priceFeature.deleteMany({
      where: { price: { productId } },
    })
    await tx.productPrice.deleteMany({
      where: { productId },
    })
    await tx.product.delete({
      where: { id: productId },
    })
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'product',
      entityId: productId,
    })
  }

  return existing
}

/**
 * Bulk hard delete products with cascade (features → prices → products).
 * Archives in Stripe first, then cascade-deletes locally.
 *
 * @param organizationId - Organization that owns the products
 * @param productIds - Array of product IDs to delete
 * @param userId - Optional user ID to log the activities
 */
export async function bulkDeleteProducts(organizationId: string, productIds: string[], userId?: string) {
  const existing = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      organizationId,
      deletedAt: null,
    },
    include: { prices: true },
  })

  const stripeAccountId = await getStripeAccountId(organizationId)

  // Archive in Stripe if connected (deactivate prices + products)
  if (stripeAccountId) {
    const allPrices = existing.flatMap((p) => p.prices)
    await Promise.all(
      allPrices
        .filter((p) => p.stripePriceId)
        .map((p) =>
          stripe.prices.update(
            p.stripePriceId!,
            { active: false },
            { stripeAccount: stripeAccountId }
          )
        )
    )
    await Promise.all(
      existing
        .filter((p) => p.stripeProductId)
        .map((p) =>
          stripe.products.update(
            p.stripeProductId!,
            { active: false },
            { stripeAccount: stripeAccountId }
          )
        )
    )
  }

  // Hard delete with cascade: features → prices → products
  await prisma.$transaction(async (tx) => {
    await tx.priceFeature.deleteMany({
      where: { price: { productId: { in: productIds } } },
    })
    await tx.productPrice.deleteMany({
      where: { productId: { in: productIds } },
    })
    await tx.product.deleteMany({
      where: { id: { in: productIds }, organizationId },
    })
  })

  // Log activities for all deleted products if userId is provided
  if (userId && existing.length > 0) {
    logActivities(
      existing.map((product) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'product',
        entityId: product.id,
      }))
    )
  }

  return { count: existing.length }
}

// ============================================================================
// PRICE CRUD
// ============================================================================

/**
 * Create a new price for a product
 *
 * Currency is enforced from the organization's connected Stripe account.
 * This ensures all prices use a single consistent currency per organization.
 */
export async function createPrice(input: PriceCreateInput) {
  // Get product with organization info
  const product = await prisma.product.findFirst({
    where: {
      id: input.productId,
      deletedAt: null,
    },
    include: {
      organization: true,
    },
  })

  if (!product) {
    throw new Error('Product not found')
  }

  /** Free trials are not supported for split payment prices */
  if (input.billingType === 'SPLIT_PAYMENT' && input.trialDays && input.trialDays > 0) {
    throw new Error('Free trials are not supported for split payment prices')
  }

  // Get the organization's currency (SOURCE OF TRUTH from Stripe account)
  // This ensures all prices use the connected Stripe account's default currency
  const { currency: orgCurrency } = await getOrganizationCurrency(product.organizationId)

  // If caller provided a currency, validate it matches org currency
  // This prevents accidental currency mismatches
  if (input.currency) {
    await validateOrganizationCurrency(product.organizationId, input.currency)
  }

  // Use organization's Stripe currency for all prices
  const priceCurrency = orgCurrency

  const stripeAccountId = product.organization.stripeConnectedAccountId
  let stripePriceId: string | undefined

  // Create price in Stripe Connect account if connected and product has Stripe ID
  if (stripeAccountId && product.stripeProductId) {
    const stripePriceParams: Stripe.PriceCreateParams = {
      product: product.stripeProductId,
      currency: priceCurrency, // Use organization's Stripe currency
      nickname: input.name,
    }

    if (input.billingType === 'ONE_TIME') {
      stripePriceParams.unit_amount = input.amount
    } else if (input.billingType === 'RECURRING') {
      stripePriceParams.unit_amount = input.amount
      stripePriceParams.recurring = {
        interval: toStripeInterval(input.interval || 'MONTH'),
        interval_count: input.intervalCount || 1,
      }
    } else if (input.billingType === 'SPLIT_PAYMENT') {
      // For split payments, we create a subscription with a fixed number of payments
      // Calculate per-installment amount
      const installmentAmount = Math.ceil(input.amount / (input.installments || 1))
      stripePriceParams.unit_amount = installmentAmount
      stripePriceParams.recurring = {
        interval: toStripeInterval(input.installmentInterval || 'MONTH'),
        interval_count: input.installmentIntervalCount || 1,
      }
      // Store metadata about total and installments
      stripePriceParams.metadata = {
        billing_type: 'split_payment',
        total_amount: input.amount.toString(),
        installments: (input.installments || 1).toString(),
      }
    }

    const stripePrice = await stripe.prices.create(stripePriceParams, {
      stripeAccount: stripeAccountId,
    })
    stripePriceId = stripePrice.id
  }

  // Create price in database using organization's currency
  const price = await prisma.productPrice.create({
    data: {
      productId: input.productId,
      name: input.name,
      amount: input.amount,
      currency: priceCurrency, // Use organization's Stripe currency
      billingType: input.billingType,
      interval: input.interval,
      intervalCount: input.intervalCount,
      installments: input.installments,
      installmentInterval: input.installmentInterval,
      installmentIntervalCount: input.installmentIntervalCount,
      /** Free trial days — only for RECURRING and ONE_TIME (validated above) */
      trialDays: input.trialDays,
      stripePriceId,
    },
    include: {
      features: {
        orderBy: { order: 'asc' },
      },
    },
  })

  return transformPrice(price)
}

/**
 * Update a price
 * Note: Stripe prices are immutable, so we only update local metadata
 */
export async function updatePrice(
  organizationId: string,
  priceId: string,
  data: PriceUpdateInput
) {
  // Verify price belongs to organization's product
  const existing = await prisma.productPrice.findFirst({
    where: {
      id: priceId,
      deletedAt: null,
      product: {
        organizationId,
        deletedAt: null,
      },
    },
    include: {
      product: true,
    },
  })

  if (!existing) {
    throw new Error('Price not found')
  }

  // Update active status in Stripe if changing
  if (data.active !== undefined && existing.stripePriceId) {
    const stripeAccountId = await getStripeAccountId(organizationId)
    if (stripeAccountId) {
      await stripe.prices.update(
        existing.stripePriceId,
        { active: data.active },
        { stripeAccount: stripeAccountId }
      )
    }
  }

  // Update in database
  const updateData: Prisma.ProductPriceUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.active !== undefined) updateData.active = data.active
  /** Allow setting/removing trial days — null removes, number sets */
  if (data.trialDays !== undefined) updateData.trialDays = data.trialDays

  const price = await prisma.productPrice.update({
    where: { id: priceId },
    data: updateData,
    include: {
      features: {
        orderBy: { order: 'asc' },
      },
    },
  })

  /**
   * CMS TWO-WAY SYNC — sync pricing changes to store CMS tables.
   * This ensures trial days and price name changes propagate to the website builder.
   */
  try {
    const featuresStr = price.features.map((f) => f.name).join(', ')
    await cmsService.syncProductPricingToCms({
      productId: price.productId,
      priceName: price.name,
      trialDays: price.trialDays,
      features: featuresStr,
    })
  } catch (error) {
    console.error('Failed to sync price to CMS:', error)
  }

  return transformPrice(price)
}

/**
 * Hard delete a price and its features.
 * Deactivates in Stripe first, then cascade-deletes locally.
 */
export async function deletePrice(organizationId: string, priceId: string) {
  const existing = await prisma.productPrice.findFirst({
    where: {
      id: priceId,
      deletedAt: null,
      product: {
        organizationId,
        deletedAt: null,
      },
    },
  })

  if (!existing) {
    throw new Error('Price not found')
  }

  // Deactivate in Stripe if connected
  if (existing.stripePriceId) {
    const stripeAccountId = await getStripeAccountId(organizationId)
    if (stripeAccountId) {
      await stripe.prices.update(
        existing.stripePriceId,
        { active: false },
        { stripeAccount: stripeAccountId }
      )
    }
  }

  // Hard delete with cascade: features → price
  await prisma.$transaction(async (tx) => {
    await tx.priceFeature.deleteMany({
      where: { priceId },
    })
    await tx.productPrice.delete({
      where: { id: priceId },
    })
  })

  return existing
}

// ============================================================================
// FEATURE CRUD
// ============================================================================

/**
 * Add a feature to a price
 *
 * SECURITY: Validates priceId belongs to the organization to prevent
 * cross-organization feature creation (IDOR vulnerability fix).
 */
export async function createFeature(input: FeatureCreateInput) {
  // SECURITY: Verify price belongs to organization's product
  const price = await prisma.productPrice.findFirst({
    where: {
      id: input.priceId,
      product: {
        organizationId: input.organizationId,
        deletedAt: null,
      },
    },
  })

  if (!price) {
    throw new Error('Price not found')
  }

  // Get max order for this price
  const maxOrder = await prisma.priceFeature.aggregate({
    where: { priceId: input.priceId },
    _max: { order: true },
  })

  const feature = await prisma.priceFeature.create({
    data: {
      priceId: input.priceId,
      name: input.name,
      description: input.description,
      order: input.order ?? (maxOrder._max.order || 0) + 1,
    },
  })

  /** CMS sync — update features list in store CMS tables */
  try {
    const priceWithFeatures = await prisma.productPrice.findUnique({
      where: { id: input.priceId },
      include: {
        features: { orderBy: { order: 'asc' } },
      },
    })
    if (priceWithFeatures) {
      await cmsService.syncProductPricingToCms({
        productId: priceWithFeatures.productId,
        features: priceWithFeatures.features.map((f) => f.name).join(', '),
      })
    }
  } catch (error) {
    console.error('Failed to sync features to CMS:', error)
  }

  return transformFeature(feature)
}

/**
 * Update a feature
 */
export async function updateFeature(
  organizationId: string,
  featureId: string,
  data: FeatureUpdateInput
) {
  // Verify feature belongs to organization's product
  const existing = await prisma.priceFeature.findFirst({
    where: {
      id: featureId,
      price: {
        product: {
          organizationId,
          deletedAt: null,
        },
      },
    },
  })

  if (!existing) {
    throw new Error('Feature not found')
  }

  const updateData: Prisma.PriceFeatureUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.order !== undefined) updateData.order = data.order

  const feature = await prisma.priceFeature.update({
    where: { id: featureId },
    data: updateData,
  })

  /** CMS sync — update features list in store CMS tables */
  try {
    /** Re-fetch the price with all its features to build the updated features string */
    const priceWithFeatures = await prisma.productPrice.findUnique({
      where: { id: existing.priceId },
      include: {
        features: { orderBy: { order: 'asc' } },
      },
    })
    if (priceWithFeatures) {
      await cmsService.syncProductPricingToCms({
        productId: priceWithFeatures.productId,
        features: priceWithFeatures.features.map((f) => f.name).join(', '),
      })
    }
  } catch (error) {
    console.error('Failed to sync features to CMS:', error)
  }

  return transformFeature(feature)
}

/**
 * Delete a feature
 */
export async function deleteFeature(organizationId: string, featureId: string) {
  // Verify feature belongs to organization's product
  const existing = await prisma.priceFeature.findFirst({
    where: {
      id: featureId,
      price: {
        product: {
          organizationId,
          deletedAt: null,
        },
      },
    },
  })

  if (!existing) {
    throw new Error('Feature not found')
  }

  /** Capture priceId before deletion so we can sync the updated features list */
  const priceId = existing.priceId

  const deleted = await prisma.priceFeature.delete({
    where: { id: featureId },
  })

  /** CMS sync — update features list in store CMS tables after deletion */
  try {
    const priceWithFeatures = await prisma.productPrice.findUnique({
      where: { id: priceId },
      include: {
        features: { orderBy: { order: 'asc' } },
      },
    })
    if (priceWithFeatures) {
      await cmsService.syncProductPricingToCms({
        productId: priceWithFeatures.productId,
        features: priceWithFeatures.features.map((f) => f.name).join(', '),
      })
    }
  } catch (error) {
    console.error('Failed to sync features to CMS:', error)
  }

  return deleted
}

/**
 * Reorder features within a price
 */
export async function reorderFeatures(
  organizationId: string,
  priceId: string,
  featureOrders: Array<{ featureId: string; order: number }>
) {
  // Verify price belongs to organization
  const price = await prisma.productPrice.findFirst({
    where: {
      id: priceId,
      deletedAt: null,
      product: {
        organizationId,
        deletedAt: null,
      },
    },
  })

  if (!price) {
    throw new Error('Price not found')
  }

  await Promise.all(
    featureOrders.map((fo) =>
      prisma.priceFeature.update({
        where: { id: fo.featureId },
        data: { order: fo.order },
      })
    )
  )
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Set features for a price (replace all)
 */
export async function setFeatures(
  organizationId: string,
  priceId: string,
  features: Array<{ name: string; description?: string | null }>
) {
  // Verify price belongs to organization
  const price = await prisma.productPrice.findFirst({
    where: {
      id: priceId,
      deletedAt: null,
      product: {
        organizationId,
        deletedAt: null,
      },
    },
  })

  if (!price) {
    throw new Error('Price not found')
  }

  // Delete existing features
  await prisma.priceFeature.deleteMany({
    where: { priceId },
  })

  // Create new features
  const createdFeatures = await prisma.priceFeature.createMany({
    data: features.map((f, index) => ({
      priceId,
      name: f.name,
      description: f.description,
      order: index,
    })),
  })

  // Return the created features
  const allFeatures = await prisma.priceFeature.findMany({
    where: { priceId },
    orderBy: { order: 'asc' },
  })

  /** CMS sync — update features list in store CMS tables after bulk replace */
  try {
    await cmsService.syncProductPricingToCms({
      productId: price.productId,
      features: allFeatures.map((f) => f.name).join(', '),
    })
  } catch (error) {
    console.error('Failed to sync features to CMS:', error)
  }

  return allFeatures.map(transformFeature)
}

// ============================================================================
// TRANSFORM HELPERS
// ============================================================================

type ProductWithPrices = Prisma.ProductGetPayload<{
  include: {
    prices: {
      include: {
        features: true
      }
    }
  }
}>

type PriceWithFeatures = Prisma.ProductPriceGetPayload<{
  include: {
    features: true
  }
}>

type PriceFeaturePayload = Prisma.PriceFeatureGetPayload<object>

export function transformProduct(product: ProductWithPrices) {
  // Cast to include fields that may be present on the model but not in Prisma base type
  const productWithInventory = product as ProductWithPrices & {
    testMode?: boolean
    /** SOURCE OF TRUTH: ProductImages — additional product gallery images */
    images?: string[]
    trackInventory?: boolean
    inventoryQuantity?: number
    allowBackorder?: boolean
    lowStockThreshold?: number | null
  }

  return {
    id: product.id,
    organizationId: product.organizationId,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    /**
     * SOURCE OF TRUTH: ProductImages
     * Additional product images for gallery display.
     */
    images: productWithInventory.images ?? [],
    stripeProductId: product.stripeProductId,
    active: product.active,
    /**
     * SOURCE OF TRUTH: ProductTestMode
     * When true, all payment links for this product use test Stripe API keys.
     */
    testMode: productWithInventory.testMode ?? false,
    /**
     * SOURCE OF TRUTH: ProductInventory
     * Inventory tracking fields for e-commerce stock management
     */
    trackInventory: productWithInventory.trackInventory ?? false,
    inventoryQuantity: productWithInventory.inventoryQuantity ?? 0,
    allowBackorder: productWithInventory.allowBackorder ?? false,
    lowStockThreshold: productWithInventory.lowStockThreshold ?? null,
    prices: product.prices.map(transformPrice),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
}

export function transformPrice(price: PriceWithFeatures) {
  return {
    id: price.id,
    productId: price.productId,
    name: price.name,
    amount: price.amount,
    currency: price.currency,
    billingType: price.billingType,
    interval: price.interval,
    intervalCount: price.intervalCount,
    installments: price.installments,
    installmentInterval: price.installmentInterval,
    installmentIntervalCount: price.installmentIntervalCount,
    /** Free trial duration in days — null means no trial */
    trialDays: price.trialDays,
    stripePriceId: price.stripePriceId,
    active: price.active,
    features: price.features.map(transformFeature),
    createdAt: price.createdAt.toISOString(),
    updatedAt: price.updatedAt.toISOString(),
  }
}

export function transformFeature(feature: PriceFeaturePayload) {
  return {
    id: feature.id,
    priceId: feature.priceId,
    name: feature.name,
    description: feature.description,
    order: feature.order,
    createdAt: feature.createdAt.toISOString(),
    updatedAt: feature.updatedAt.toISOString(),
  }
}
