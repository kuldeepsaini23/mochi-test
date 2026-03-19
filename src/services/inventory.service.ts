/**
 * Inventory Service (DAL)
 *
 * Data Access Layer for inventory management operations.
 * Handles stock tracking, adjustments, and audit history.
 *
 * SOURCE OF TRUTH: InventoryHistory
 * All inventory changes are logged to InventoryHistory for full audit trail.
 *
 * tRPC routers call these functions after security checks.
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { InventoryChangeReason, Prisma } from '@/generated/prisma'
import { logActivity } from './activity-log.service'
import * as cmsService from './cms.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * SOURCE OF TRUTH: InventoryAdjustInput
 * Input type for adjusting inventory by a delta (positive or negative)
 */
export type InventoryAdjustInput = {
  organizationId: string
  productId: string
  change: number // Positive to add, negative to subtract
  reason: InventoryChangeReason
  referenceId?: string // e.g., transactionId for SALE/REFUND
  note?: string
  createdBy?: string // userId making the change
}

/**
 * SOURCE OF TRUTH: InventorySetInput
 * Input type for setting absolute inventory quantity
 */
export type InventorySetInput = {
  organizationId: string
  productId: string
  quantity: number // Absolute quantity to set
  note?: string
  createdBy?: string // userId making the change
}

/**
 * SOURCE OF TRUTH: InventorySettingsInput
 * Input type for updating inventory tracking settings
 */
export type InventorySettingsInput = {
  trackInventory?: boolean
  allowBackorder?: boolean
  lowStockThreshold?: number | null
}

/**
 * SOURCE OF TRUTH: InventoryHistoryEntry
 * Transformed inventory history entry for API responses
 */
export type InventoryHistoryEntry = {
  id: string
  productId: string
  previousQuantity: number
  newQuantity: number
  change: number
  reason: InventoryChangeReason
  referenceId: string | null
  note: string | null
  createdBy: string | null
  createdAt: string
}

/**
 * SOURCE OF TRUTH: InventoryAvailability
 * Result of checking if a product is available for purchase
 */
export type InventoryAvailability = {
  available: boolean
  reason?: 'in_stock' | 'backorder_allowed' | 'not_tracking' | 'out_of_stock'
  currentQuantity: number
  requestedQuantity: number
  trackInventory: boolean
  allowBackorder: boolean
}

// ============================================================================
// INVENTORY ADJUSTMENTS
// ============================================================================

/**
 * Adjust inventory by a delta amount (positive or negative)
 *
 * This is the main function for changing inventory. All inventory changes
 * should go through this function to ensure proper audit trail.
 *
 * @param input - Adjustment parameters including change amount and reason
 * @returns The updated product with new inventory quantity
 *
 * @example
 * // Decrease by 2 for a sale
 * await adjustInventory({
 *   organizationId: 'org_123',
 *   productId: 'prod_456',
 *   change: -2,
 *   reason: 'SALE',
 *   referenceId: 'txn_789'
 * })
 */
export async function adjustInventory(input: InventoryAdjustInput) {
  const { organizationId, productId, change, reason, referenceId, note, createdBy } = input

  // Get current product with inventory info
  // SECURITY: Include organizationId in WHERE to prevent cross-tenant access
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      inventoryQuantity: true,
      trackInventory: true,
    },
  })

  if (!product) {
    throw new Error('Product not found')
  }

  const previousQuantity = product.inventoryQuantity
  const newQuantity = previousQuantity + change

  // Validate new quantity won't be negative (unless allowing backorder)
  if (newQuantity < 0) {
    throw new Error(`Insufficient inventory. Current: ${previousQuantity}, Requested change: ${change}`)
  }

  // Update inventory and create history record atomically
  const [updatedProduct] = await prisma.$transaction([
    // Update product inventory
    prisma.product.update({
      where: {
        id: productId,
        organizationId, // Defense-in-depth: prevents cross-tenant modification
      },
      data: {
        inventoryQuantity: newQuantity,
      },
    }),
    // Create history record
    prisma.inventoryHistory.create({
      data: {
        productId,
        organizationId,
        previousQuantity,
        newQuantity,
        change,
        reason,
        referenceId,
        note,
        createdBy,
      },
    }),
  ])

  // Log activity if user made the change
  if (createdBy) {
    logActivity({
      userId: createdBy,
      organizationId,
      action: 'update',
      entity: 'product',
      entityId: productId,
    })
  }

  // Sync inventory to CMS tables (for e-commerce store display)
  // Get product settings for sync
  const productForSync = await prisma.product.findFirst({
    where: { id: productId },
    select: { trackInventory: true, allowBackorder: true },
  })
  if (productForSync) {
    try {
      await cmsService.syncProductInventoryToCms({
        productId,
        trackInventory: productForSync.trackInventory,
        inventoryQuantity: newQuantity,
        allowBackorder: productForSync.allowBackorder,
      })
    } catch (error) {
      console.error('Failed to sync inventory to CMS:', error)
    }
  }

  return {
    productId: updatedProduct.id,
    previousQuantity,
    newQuantity,
    change,
  }
}

/**
 * Set inventory to an absolute quantity
 *
 * Use this for manual inventory corrections or initial stock setup.
 * Creates a MANUAL_ADJUSTMENT or CORRECTION history entry.
 *
 * @param input - Set parameters including target quantity
 * @returns The updated product with new inventory quantity
 */
export async function setInventory(input: InventorySetInput) {
  const { organizationId, productId, quantity, note, createdBy } = input

  // Get current product
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
    select: {
      inventoryQuantity: true,
    },
  })

  if (!product) {
    throw new Error('Product not found')
  }

  const previousQuantity = product.inventoryQuantity
  const change = quantity - previousQuantity

  // If no change, return early
  if (change === 0) {
    return {
      productId,
      previousQuantity,
      newQuantity: quantity,
      change: 0,
    }
  }

  // Determine reason based on change direction
  const reason: InventoryChangeReason = change > 0 ? 'RESTOCK' : 'CORRECTION'

  return adjustInventory({
    organizationId,
    productId,
    change,
    reason,
    note: note || `Set inventory to ${quantity}`,
    createdBy,
  })
}

/**
 * Update inventory tracking settings for a product
 *
 * @param organizationId - Organization that owns the product
 * @param productId - Product to update
 * @param settings - Settings to update
 * @param userId - Optional user ID for activity logging
 */
export async function updateInventorySettings(
  organizationId: string,
  productId: string,
  settings: InventorySettingsInput,
  userId?: string
) {
  // Verify product exists and belongs to organization
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!product) {
    throw new Error('Product not found')
  }

  // Build update data
  const updateData: Prisma.ProductUpdateInput = {}
  if (settings.trackInventory !== undefined) updateData.trackInventory = settings.trackInventory
  if (settings.allowBackorder !== undefined) updateData.allowBackorder = settings.allowBackorder
  if (settings.lowStockThreshold !== undefined) updateData.lowStockThreshold = settings.lowStockThreshold

  // Update product
  const updatedProduct = await prisma.product.update({
    where: {
      id: productId,
      organizationId,
    },
    data: updateData,
  })

  // Log activity
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'product',
      entityId: productId,
    })
  }

  // Sync inventory settings to CMS tables (for e-commerce store display)
  try {
    await cmsService.syncProductInventoryToCms({
      productId,
      trackInventory: updatedProduct.trackInventory,
      inventoryQuantity: updatedProduct.inventoryQuantity,
      allowBackorder: updatedProduct.allowBackorder,
    })
  } catch (error) {
    console.error('Failed to sync inventory settings to CMS:', error)
  }

  return {
    trackInventory: updatedProduct.trackInventory,
    inventoryQuantity: updatedProduct.inventoryQuantity,
    allowBackorder: updatedProduct.allowBackorder,
    lowStockThreshold: updatedProduct.lowStockThreshold,
  }
}

// ============================================================================
// INVENTORY QUERIES
// ============================================================================

/**
 * Check if a product has sufficient inventory for purchase
 *
 * Returns availability status and reason. Use this before processing checkouts
 * to validate stock levels.
 *
 * @param organizationId - Organization that owns the product
 * @param productId - Product to check
 * @param quantity - Quantity requested for purchase
 * @returns Availability status with reason
 */
export async function checkAvailability(
  organizationId: string,
  productId: string,
  quantity: number
): Promise<InventoryAvailability> {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
    select: {
      trackInventory: true,
      inventoryQuantity: true,
      allowBackorder: true,
    },
  })

  if (!product) {
    throw new Error('Product not found')
  }

  const { trackInventory, inventoryQuantity, allowBackorder } = product

  // If not tracking inventory, always available
  if (!trackInventory) {
    return {
      available: true,
      reason: 'not_tracking',
      currentQuantity: inventoryQuantity,
      requestedQuantity: quantity,
      trackInventory,
      allowBackorder,
    }
  }

  // Check if sufficient stock
  if (inventoryQuantity >= quantity) {
    return {
      available: true,
      reason: 'in_stock',
      currentQuantity: inventoryQuantity,
      requestedQuantity: quantity,
      trackInventory,
      allowBackorder,
    }
  }

  // If backorder allowed, still available
  if (allowBackorder) {
    return {
      available: true,
      reason: 'backorder_allowed',
      currentQuantity: inventoryQuantity,
      requestedQuantity: quantity,
      trackInventory,
      allowBackorder,
    }
  }

  // Out of stock and no backorder
  return {
    available: false,
    reason: 'out_of_stock',
    currentQuantity: inventoryQuantity,
    requestedQuantity: quantity,
    trackInventory,
    allowBackorder,
  }
}

/**
 * Get inventory history for a product
 *
 * Returns paginated list of inventory changes with audit details.
 *
 * @param organizationId - Organization that owns the product
 * @param productId - Product to get history for
 * @param page - Page number (1-indexed)
 * @param pageSize - Number of records per page
 */
export async function getInventoryHistory(
  organizationId: string,
  productId: string,
  page = 1,
  pageSize = 20
) {
  // Verify product belongs to organization
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
    select: { id: true },
  })

  if (!product) {
    throw new Error('Product not found')
  }

  // Get total count
  const total = await prisma.inventoryHistory.count({
    where: { productId },
  })

  // Get paginated history
  const history = await prisma.inventoryHistory.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  return {
    history: history.map(transformHistoryEntry),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get products with low stock
 *
 * Returns products where inventory is at or below the low stock threshold.
 *
 * @param organizationId - Organization to check
 */
export async function getLowStockProducts(organizationId: string) {
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      deletedAt: null,
      trackInventory: true,
      // Find products where quantity is at or below threshold
      OR: [
        {
          AND: [
            { lowStockThreshold: { not: null } },
            // Compare inventoryQuantity <= lowStockThreshold using raw query
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      inventoryQuantity: true,
      lowStockThreshold: true,
    },
    orderBy: { inventoryQuantity: 'asc' },
  })

  // Filter in memory since Prisma doesn't support comparing two columns directly
  return products.filter(
    (p) => p.lowStockThreshold !== null && p.inventoryQuantity <= p.lowStockThreshold
  )
}

// ============================================================================
// BULK OPERATIONS (for webhooks)
// ============================================================================

/**
 * Decrement inventory for multiple items in an order
 *
 * Used by Stripe webhook when payment succeeds.
 * Creates SALE history entries for each product.
 *
 * @param items - Array of product IDs and quantities to decrement
 * @param transactionId - Transaction ID for reference
 * @param organizationId - Organization making the sale
 */
export async function decrementInventoryForOrder(
  items: Array<{ productId: string; quantity: number }>,
  transactionId: string,
  organizationId: string
) {
  const results = []

  for (const item of items) {
    try {
      // Check if product tracks inventory
      const product = await prisma.product.findFirst({
        where: {
          id: item.productId,
          organizationId,
          deletedAt: null,
        },
        select: {
          trackInventory: true,
          inventoryQuantity: true,
        },
      })

      // Only decrement if tracking inventory
      if (product?.trackInventory) {
        const result = await adjustInventory({
          organizationId,
          productId: item.productId,
          change: -item.quantity,
          reason: 'SALE',
          referenceId: transactionId,
        })
        results.push(result)
      }
    } catch (error) {
      // Log but don't fail the entire operation
      console.error(`Failed to decrement inventory for product ${item.productId}:`, error)
    }
  }

  return results
}

/**
 * Increment inventory for refunded items
 *
 * Used by Stripe webhook when refund is processed.
 * Creates REFUND history entries for each product.
 *
 * @param items - Array of product IDs and quantities to increment
 * @param transactionId - Transaction ID for reference
 * @param organizationId - Organization processing the refund
 */
export async function incrementInventoryForRefund(
  items: Array<{ productId: string; quantity: number }>,
  transactionId: string,
  organizationId: string
) {
  const results = []

  for (const item of items) {
    try {
      // Check if product tracks inventory
      const product = await prisma.product.findFirst({
        where: {
          id: item.productId,
          organizationId,
          deletedAt: null,
        },
        select: {
          trackInventory: true,
        },
      })

      // Only increment if tracking inventory
      if (product?.trackInventory) {
        const result = await adjustInventory({
          organizationId,
          productId: item.productId,
          change: item.quantity,
          reason: 'REFUND',
          referenceId: transactionId,
        })
        results.push(result)
      }
    } catch (error) {
      // Log but don't fail the entire operation
      console.error(`Failed to increment inventory for product ${item.productId}:`, error)
    }
  }

  return results
}

// ============================================================================
// TRANSFORM HELPERS
// ============================================================================

type InventoryHistoryRecord = Prisma.InventoryHistoryGetPayload<object>

/**
 * Transform inventory history record to API-safe format
 */
function transformHistoryEntry(entry: InventoryHistoryRecord): InventoryHistoryEntry {
  return {
    id: entry.id,
    productId: entry.productId,
    previousQuantity: entry.previousQuantity,
    newQuantity: entry.newQuantity,
    change: entry.change,
    reason: entry.reason,
    referenceId: entry.referenceId,
    note: entry.note,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt.toISOString(),
  }
}
