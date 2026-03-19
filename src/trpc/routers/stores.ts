/**
 * Stores Router
 *
 * tRPC router for ecommerce store management.
 * Stores organize products into catalogs with specific pricing.
 *
 * SOURCE OF TRUTH: Store, StoreProduct, Ecommerce, ProductCatalog
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import * as storeService from '@/services/store.service'

// ============================================================================
// INPUT SCHEMAS - Exported for type safety
// ============================================================================

export const createStoreSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Store name is required'),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
})

export const updateStoreSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
})

export const deleteStoreSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
})

export const bulkDeleteStoresSchema = z.object({
  organizationId: z.string(),
  storeIds: z.array(z.string()).min(1),
})

export const getStoreSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
})

export const listStoresSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
})

export const addProductToStoreSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  productId: z.string(),
  priceId: z.string(),
})

export const removeProductFromStoreSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  productId: z.string(),
})

export const updateProductPriceSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  productId: z.string(),
  priceId: z.string(),
})

export const reorderProductsSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  productIds: z.array(z.string()),
})

export const getAvailableProductsSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  search: z.string().optional(),
})

export const getAvailableStoresSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
})

export const getStoresForProductSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const storesRouter = createTRPCRouter({
  // ==========================================================================
  // STORE CRUD
  // ==========================================================================

  /**
   * List stores with pagination and search
   */
  list: organizationProcedure({ requirePermission: permissions.STORES_READ })
    .input(listStoresSchema)
    .query(async ({ input }) => {
      return storeService.listStores(input)
    }),

  /**
   * Get a single store with products
   */
  getById: organizationProcedure({ requirePermission: permissions.STORES_READ })
    .input(getStoreSchema)
    .query(async ({ input }) => {
      const store = await storeService.getStoreById(
        input.organizationId,
        input.storeId
      )

      if (!store) {
        throw createStructuredError('NOT_FOUND', 'Store not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Store not found',
        })
      }

      return store
    }),

  /**
   * Create a new store.
   * Feature-gated: stores.limit checked at procedure level before handler runs.
   */
  create: organizationProcedure({
    requirePermission: permissions.STORES_CREATE,
    requireFeature: 'stores.limit',
  })
    .input(createStoreSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await storeService.createStore(input)

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'stores.limit')

      return result
    }),

  /**
   * Update a store
   */
  update: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(updateStoreSchema)
    .mutation(async ({ input }) => {
      const { storeId, organizationId, ...data } = input

      // Verify store exists and belongs to organization
      const existing = await storeService.getStoreById(organizationId, storeId)
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Store not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Store not found',
        })
      }

      return storeService.updateStore(storeId, data)
    }),

  /**
   * Delete a store
   */
  delete: organizationProcedure({ requirePermission: permissions.STORES_DELETE })
    .input(deleteStoreSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify store exists and belongs to organization
      const existing = await storeService.getStoreById(
        input.organizationId,
        input.storeId
      )
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Store not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Store not found',
        })
      }

      await storeService.deleteStore(input.storeId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, input.organizationId, 'stores.limit')

      return { success: true }
    }),

  /**
   * Bulk delete stores
   */
  bulkDelete: organizationProcedure({ requirePermission: permissions.STORES_DELETE })
    .input(bulkDeleteStoresSchema)
    .mutation(async ({ input }) => {
      const result = await storeService.bulkDeleteStores(input.storeIds)
      return { count: result.count }
    }),

  // ==========================================================================
  // STORE PRODUCT OPERATIONS
  // ==========================================================================

  /**
   * Add a product to a store
   */
  addProduct: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(addProductToStoreSchema)
    .mutation(async ({ input }) => {
      return storeService.addProductToStore({
        storeId: input.storeId,
        productId: input.productId,
        priceId: input.priceId,
      })
    }),

  /**
   * Remove a product from a store
   */
  removeProduct: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(removeProductFromStoreSchema)
    .mutation(async ({ input }) => {
      await storeService.removeProductFromStore(input.storeId, input.productId)
      return { success: true }
    }),

  /**
   * Update the price for a product in a store
   */
  updateProductPrice: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(updateProductPriceSchema)
    .mutation(async ({ input }) => {
      return storeService.updateProductPrice(
        input.storeId,
        input.productId,
        input.priceId
      )
    }),

  /**
   * Reorder products within a store
   */
  reorderProducts: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(reorderProductsSchema)
    .mutation(async ({ input }) => {
      await storeService.reorderProducts(input.storeId, input.productIds)
      return { success: true }
    }),

  /**
   * Get stores that contain a specific product
   */
  getStoresForProduct: organizationProcedure({ requirePermission: permissions.STORES_READ })
    .input(getStoresForProductSchema)
    .query(async ({ input }) => {
      return storeService.getStoresForProduct(
        input.organizationId,
        input.productId
      )
    }),

  /**
   * Get products available to add to a store
   */
  getAvailableProducts: organizationProcedure({ requirePermission: permissions.STORES_READ })
    .input(getAvailableProductsSchema)
    .query(async ({ input }) => {
      return storeService.getAvailableProducts(
        input.organizationId,
        input.storeId,
        input.search
      )
    }),

  /**
   * Get stores available to add a product to
   */
  getAvailableStores: organizationProcedure({ requirePermission: permissions.STORES_READ })
    .input(getAvailableStoresSchema)
    .query(async ({ input }) => {
      return storeService.getAvailableStores(
        input.organizationId,
        input.productId
      )
    }),
})
