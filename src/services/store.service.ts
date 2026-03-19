/**
 * Store Service (DAL)
 *
 * Data Access Layer for ecommerce store operations.
 * This is the ONLY place that should interact with Prisma for stores.
 *
 * Stores are used to organize products into catalogs.
 * Products can be added to multiple stores with different prices.
 *
 * TWO-WAY CMS SYNC:
 * - When a store is created, a CMS table is auto-created
 * - When products are added/removed, CMS rows are synced
 * - CMS tables for stores are read-only in the CMS UI
 *
 * tRPC routers call these functions after security checks.
 *
 * SOURCE OF TRUTH: Store, StoreProduct, Ecommerce, ProductCatalog, CMS Sync
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { Prisma } from '@/generated/prisma'
import * as cmsService from './cms.service'
import { logActivity, logActivities } from './activity-log.service'

// ============================================================================
// TYPES - SOURCE OF TRUTH
// ============================================================================

export type StoreCreateInput = {
  organizationId: string
  name: string
  description?: string | null
  imageUrl?: string | null
  /** Optional userId for activity logging */
  userId?: string
}

export type StoreUpdateInput = {
  name?: string
  description?: string | null
  imageUrl?: string | null
}

export type StoreProductAddInput = {
  storeId: string
  productId: string
  priceId: string
}

// ============================================================================
// STORE CRUD OPERATIONS
// ============================================================================

/**
 * List stores with pagination and search
 * WHY: Main query for store list page
 */
export async function listStores({
  organizationId,
  search,
  page = 1,
  pageSize = 10,
}: {
  organizationId: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const skip = (page - 1) * pageSize

  const where: Prisma.StoreWhereInput = {
    organizationId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [stores, total] = await Promise.all([
    prisma.store.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    }),
    prisma.store.count({ where }),
  ])

  return {
    stores,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get a store by ID with products
 * WHY: For store detail page showing all products
 */
export async function getStoreById(organizationId: string, storeId: string) {
  return prisma.store.findFirst({
    where: {
      id: storeId,
      organizationId,
    },
    include: {
      products: {
        orderBy: { order: 'asc' },
        include: {
          product: {
            include: {
              prices: {
                where: { deletedAt: null, active: true },
              },
            },
          },
          price: true,
        },
      },
    },
  })
}

/**
 * Create a new store
 * WHY: Users create stores to organize products
 * SYNC: Also creates a CMS table for two-way sync
 */
export async function createStore(input: StoreCreateInput) {
  const store = await prisma.store.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
    },
  })

  // Create synced CMS table for this store
  // NOTE: Not catching errors - CMS sync should work or we need to know why
  await cmsService.createStoreTable({
    organizationId: input.organizationId,
    storeId: store.id,
    storeName: input.name,
    storeDescription: input.description,
  })

  // Log the activity if userId is provided
  if (input.userId) {
    logActivity({
      userId: input.userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'store',
      entityId: store.id,
    })
  }

  return store
}

/**
 * Update a store
 * WHY: Edit store name, description, or image
 * SYNC: Also updates the linked CMS table
 *
 * @param storeId - Store ID to update
 * @param data - Update data
 * @param organizationId - Organization ID (required for activity logging)
 * @param userId - Optional userId for activity logging
 */
export async function updateStore(
  storeId: string,
  data: StoreUpdateInput,
  organizationId?: string,
  userId?: string
) {
  const store = await prisma.store.update({
    where: { id: storeId },
    data,
  })

  // Update synced CMS table if name or description changed
  if (data.name !== undefined || data.description !== undefined) {
    try {
      await cmsService.updateStoreTable(storeId, {
        name: data.name,
        description: data.description,
      })
    } catch (error) {
      console.error('Failed to update CMS table for store:', error)
    }
  }

  // Log the activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'store',
      entityId: store.id,
    })
  }

  return store
}

/**
 * Delete a store (hard delete)
 * WHY: Remove store and all product associations
 * NOTE: Products themselves are NOT deleted, only the associations
 * SYNC: CMS table is deleted via cascade (sourceStoreId FK)
 *
 * @param storeId - Store ID to delete
 * @param organizationId - Organization ID (required for activity logging)
 * @param userId - Optional userId for activity logging
 */
export async function deleteStore(
  storeId: string,
  organizationId?: string,
  userId?: string
) {
  // CMS table will be deleted automatically via onDelete: Cascade
  const store = await prisma.store.delete({
    where: { id: storeId },
  })

  // Log the activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'store',
      entityId: store.id,
    })
  }

  return store
}

/**
 * Bulk delete stores (hard delete)
 * WHY: Delete multiple stores at once from list view
 *
 * @param storeIds - Array of store IDs to delete
 * @param organizationId - Organization ID (required for activity logging)
 * @param userId - Optional userId for activity logging
 */
export async function bulkDeleteStores(
  storeIds: string[],
  organizationId?: string,
  userId?: string
) {
  const result = await prisma.store.deleteMany({
    where: { id: { in: storeIds } },
  })

  // Log activities for all deleted stores if userId and organizationId are provided
  if (userId && organizationId && storeIds.length > 0) {
    logActivities(
      storeIds.map((storeId) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'store',
        entityId: storeId,
      }))
    )
  }

  return result
}

// ============================================================================
// STORE PRODUCT OPERATIONS
// ============================================================================

/**
 * Allowed billing types for store products.
 * SOURCE OF TRUTH: StoreSupportedBillingTypes
 *
 * Only ONE_TIME and RECURRING prices can be added to stores.
 * SPLIT_PAYMENT is NOT supported because:
 * - Cart checkout only supports ONE_TIME and RECURRING
 * - Stripe Checkout doesn't handle split payments
 */
const STORE_SUPPORTED_BILLING_TYPES = ['ONE_TIME', 'RECURRING'] as const

/**
 * Add a product to a store with a specific price
 * WHY: Associates a product with a store using one of its prices
 * SYNC: Also adds a row to the store's CMS table
 *
 * VALIDATION: Only ONE_TIME and RECURRING prices are allowed.
 * SPLIT_PAYMENT prices are blocked at this level.
 */
export async function addProductToStore(input: StoreProductAddInput) {
  /**
   * Validate the price billing type before adding.
   * Only ONE_TIME and RECURRING are supported for store checkout.
   */
  const price = await prisma.productPrice.findUnique({
    where: { id: input.priceId },
    select: { billingType: true },
  })

  if (!price) {
    throw new Error('Price not found')
  }

  if (!STORE_SUPPORTED_BILLING_TYPES.includes(price.billingType as typeof STORE_SUPPORTED_BILLING_TYPES[number])) {
    throw new Error(
      `Only ONE_TIME and RECURRING prices can be added to stores. ` +
      `${price.billingType} prices are not supported for e-commerce checkout.`
    )
  }

  // Get the max order for this store
  const maxOrder = await prisma.storeProduct.aggregate({
    where: { storeId: input.storeId },
    _max: { order: true },
  })

  const storeProduct = await prisma.storeProduct.create({
    data: {
      storeId: input.storeId,
      productId: input.productId,
      priceId: input.priceId,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: {
      product: {
        include: {
          // Include prices so UI can show "Change Price" option
          prices: {
            where: { deletedAt: null, active: true },
          },
        },
      },
      price: {
        include: {
          features: {
            orderBy: { order: 'asc' as const },
          },
        },
      },
    },
  })

  // Add row to synced CMS table
  // Includes stripe_price_id for Add to Cart button functionality
  // Includes inventory data for conditional display in website builder
  try {
    // Cast to access images field which may be on the model
    const productWithImages = storeProduct.product as typeof storeProduct.product & { images?: string[] }

    /** Build comma-separated feature names for CMS display */
    const featuresStr = storeProduct.price.features
      .map((f) => f.name)
      .join(', ')

    await cmsService.addStoreProductRow({
      storeId: input.storeId,
      productId: input.productId,
      productName: storeProduct.product.name,
      productDescription: storeProduct.product.description,
      productImage: storeProduct.product.imageUrl,
      productImages: productWithImages.images ?? [],
      priceName: storeProduct.price.name,
      priceAmount: storeProduct.price.amount,
      currency: storeProduct.price.currency,
      billingType: storeProduct.price.billingType,
      billingInterval: storeProduct.price.interval, // For subscriptions (DAY, WEEK, MONTH, YEAR)
      intervalCount: storeProduct.price.intervalCount, // For subscriptions (e.g., 2 for "every 2 months")
      stripePriceId: storeProduct.price.stripePriceId,
      // Inventory fields for conditional display
      trackInventory: storeProduct.product.trackInventory,
      inventoryQuantity: storeProduct.product.inventoryQuantity,
      allowBackorder: storeProduct.product.allowBackorder,
      // Trial and features for website builder display
      trialDays: storeProduct.price.trialDays,
      features: featuresStr,
    })
  } catch (error) {
    console.error('Failed to add CMS row for store product:', error)
  }

  return storeProduct
}

/**
 * Remove a product from a store
 * WHY: User wants to remove a product from the store catalog
 * SYNC: Also removes the row from the store's CMS table
 */
export async function removeProductFromStore(storeId: string, productId: string) {
  const result = await prisma.storeProduct.delete({
    where: {
      storeId_productId: {
        storeId,
        productId,
      },
    },
  })

  // Remove row from synced CMS table
  try {
    await cmsService.removeStoreProductRow(storeId, productId)
  } catch (error) {
    console.error('Failed to remove CMS row for store product:', error)
  }

  return result
}

/**
 * Update the price for a product in a store
 * WHY: User wants to change which price is used for this product in this store
 * SYNC: Also updates the row in the store's CMS table
 *
 * VALIDATION: Only ONE_TIME and RECURRING prices are allowed.
 * SPLIT_PAYMENT prices are blocked at this level.
 */
export async function updateProductPrice(
  storeId: string,
  productId: string,
  priceId: string
) {
  /**
   * Validate the new price billing type before updating.
   * Only ONE_TIME and RECURRING are supported for store checkout.
   */
  const price = await prisma.productPrice.findUnique({
    where: { id: priceId },
    select: { billingType: true },
  })

  if (!price) {
    throw new Error('Price not found')
  }

  if (!STORE_SUPPORTED_BILLING_TYPES.includes(price.billingType as typeof STORE_SUPPORTED_BILLING_TYPES[number])) {
    throw new Error(
      `Only ONE_TIME and RECURRING prices can be added to stores. ` +
      `${price.billingType} prices are not supported for e-commerce checkout.`
    )
  }

  const storeProduct = await prisma.storeProduct.update({
    where: {
      storeId_productId: {
        storeId,
        productId,
      },
    },
    data: { priceId },
    include: {
      product: true,
      price: {
        include: {
          features: {
            orderBy: { order: 'asc' as const },
          },
        },
      },
    },
  })

  // Update row in synced CMS table with price info including stripePriceId for checkout
  try {
    /** Build comma-separated feature names for CMS display */
    const featuresStr = storeProduct.price.features
      .map((f) => f.name)
      .join(', ')

    await cmsService.updateStoreProductRow({
      storeId,
      productId,
      priceName: storeProduct.price.name,
      priceAmount: storeProduct.price.amount,
      currency: storeProduct.price.currency,
      billingType: storeProduct.price.billingType,
      billingInterval: storeProduct.price.interval, // For subscriptions
      intervalCount: storeProduct.price.intervalCount, // For subscriptions
      stripePriceId: storeProduct.price.stripePriceId,
      // Trial and features for website builder display
      trialDays: storeProduct.price.trialDays,
      features: featuresStr,
    })
  } catch (error) {
    console.error('Failed to update CMS row for store product:', error)
  }

  return storeProduct
}

/**
 * Reorder products within a store
 * WHY: Drag-and-drop reordering in the store detail view
 */
export async function reorderProducts(storeId: string, productIds: string[]) {
  // Update each product's order based on its position in the array
  const updates = productIds.map((productId, index) =>
    prisma.storeProduct.update({
      where: {
        storeId_productId: {
          storeId,
          productId,
        },
      },
      data: { order: index },
    })
  )

  return prisma.$transaction(updates)
}

/**
 * Get all stores that contain a specific product
 * WHY: Show which stores a product is already in (from product detail page)
 */
export async function getStoresForProduct(organizationId: string, productId: string) {
  const storeProducts = await prisma.storeProduct.findMany({
    where: { productId },
    include: {
      store: {
        select: {
          id: true,
          organizationId: true,
          name: true,
        },
      },
      price: true,
    },
  })

  // Filter to only include stores from this organization
  return storeProducts.filter(
    (sp) => sp.store.organizationId === organizationId
  )
}

/**
 * Get available products to add to a store
 * WHY: When adding a product to a store, show only products not already in the store
 */
export async function getAvailableProducts(
  organizationId: string,
  storeId: string,
  search?: string
) {
  // Get products already in this store
  const existingProductIds = await prisma.storeProduct.findMany({
    where: { storeId },
    select: { productId: true },
  })

  const excludeIds = existingProductIds.map((p) => p.productId)

  // Get active products not in the store
  return prisma.product.findMany({
    where: {
      organizationId,
      active: true,
      deletedAt: null,
      id: { notIn: excludeIds },
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    include: {
      prices: {
        where: { deletedAt: null, active: true },
      },
    },
    orderBy: { name: 'asc' },
    take: 50, // Limit for performance
  })
}

/**
 * Get available stores to add a product to
 * WHY: When adding product to store from product detail, show stores not containing this product
 */
export async function getAvailableStores(
  organizationId: string,
  productId: string
) {
  // Get stores that already have this product
  const existingStoreIds = await prisma.storeProduct.findMany({
    where: { productId },
    select: { storeId: true },
  })

  const excludeIds = existingStoreIds.map((s) => s.storeId)

  // Get stores not containing this product
  return prisma.store.findMany({
    where: {
      organizationId,
      id: { notIn: excludeIds },
    },
    orderBy: { name: 'asc' },
  })
}
