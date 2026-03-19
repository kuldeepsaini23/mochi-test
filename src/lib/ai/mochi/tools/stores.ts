/**
 * ============================================================================
 * MOCHI AI TOOLS - STORES
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for ecommerce store management.
 *
 * IMPORTANT: All operations route through the tRPC caller — specifically
 * caller.stores.* — so that the full middleware chain is enforced:
 * permissions (STORES_CREATE/READ/UPDATE/DELETE), feature gates (stores.limit),
 * and org scoping. This means CMS tables and rows are auto-created/synced
 * exactly like the UI does it — because it's the same code path.
 *
 * CMS AUTO-SYNC: When a store is created, a system CMS table with 13 columns
 * is auto-created. When products are added/removed/updated, the corresponding
 * CMS rows are synced automatically. This happens inside the store service
 * called by the tRPC router — the AI tools don't need to handle it.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiStoreTools, AIStoreManagement, EcommerceAI
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Creates all store-related tools bound to the given organization.
 * Routes through tRPC caller for permissions, feature gates, and CMS auto-sync.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller for secure procedure invocation with full middleware
 */
export function createStoreTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new ecommerce store.
     * This also auto-creates a synced CMS table with product columns.
     * Routes through caller.stores.create which enforces:
     * - STORES_CREATE permission
     * - stores.limit feature gate
     */
    createStore: tool({
      description:
        'Create a new ecommerce store. This automatically creates a synced CMS table ' +
        'for the store. Products can be added after creation with addProductToStore.',
      inputSchema: z.object({
        name: z.string().describe('Store name'),
        description: z.string().optional().describe('Store description'),
        imageUrl: z.string().optional().describe('Store image URL'),
      }),
      execute: async (params) => {
        try {
          const store = await caller.stores.create({
            organizationId,
            name: params.name,
            description: params.description,
            imageUrl: params.imageUrl,
          })
          return {
            success: true as const,
            storeId: store.id,
            name: store.name,
            message: `Created store "${store.name}" (ID: ${store.id}). A synced CMS table was auto-created for this store.`,
          }
        } catch (err) {
          return handleToolError('createStore', err)
        }
      },
    }),

    /**
     * List stores with optional search and pagination.
     * Routes through caller.stores.list which enforces STORES_READ.
     */
    listStores: tool({
      description: 'List ecommerce stores with optional search filter.',
      inputSchema: z.object({
        search: z.string().optional().describe('Search stores by name'),
        page: z.number().optional().describe('Page number (defaults to 1)'),
        pageSize: z.number().optional().describe('Items per page (defaults to 10)'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.stores.list({
            organizationId,
            search: params.search,
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 10,
          })
          return {
            success: true as const,
            stores: result.stores.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              imageUrl: s.imageUrl,
              productCount: s._count.products,
            })),
            total: result.total,
            message: `Found ${result.total} store(s)`,
          }
        } catch (err) {
          return handleToolError('listStores', err)
        }
      },
    }),

    /**
     * Get a single store with its products and pricing details.
     * Routes through caller.stores.getById which enforces STORES_READ.
     */
    getStore: tool({
      description: 'Get a store by ID with its products and pricing details.',
      inputSchema: z.object({
        storeId: z.string().describe('The store ID'),
      }),
      execute: async (params) => {
        try {
          const store = await caller.stores.getById({
            organizationId,
            storeId: params.storeId,
          })
          return {
            success: true as const,
            store: {
              id: store.id,
              name: store.name,
              description: store.description,
              imageUrl: store.imageUrl,
              products: store.products.map((sp) => ({
                productId: sp.productId,
                productName: sp.product.name,
                priceId: sp.priceId,
                priceName: sp.price.name,
                amount: sp.price.amount,
                currency: sp.price.currency,
                billingType: sp.price.billingType,
                order: sp.order,
              })),
            },
            message: `Store "${store.name}" has ${store.products.length} product(s)`,
          }
        } catch (err) {
          return handleToolError('getStore', err)
        }
      },
    }),

    /**
     * Update a store's name, description, or image.
     * Also syncs the CMS table name/description automatically.
     * Routes through caller.stores.update which enforces STORES_UPDATE.
     */
    updateStore: tool({
      description: 'Update a store. Only provide the fields you want to change.',
      inputSchema: z.object({
        storeId: z.string().describe('The store ID to update'),
        name: z.string().optional().describe('New store name'),
        description: z.string().optional().describe('New description'),
        imageUrl: z.string().optional().describe('New image URL'),
      }),
      execute: async (params) => {
        try {
          const { storeId, ...data } = params
          const store = await caller.stores.update({
            organizationId,
            storeId,
            ...data,
          })
          return {
            success: true as const,
            storeId: store.id,
            message: `Updated store "${store.name}"`,
          }
        } catch (err) {
          return handleToolError('updateStore', err)
        }
      },
    }),

    /**
     * Delete a store — ALWAYS confirm with askUser first.
     * This also deletes the synced CMS table and all its rows (cascade).
     * Routes through caller.stores.delete which enforces STORES_DELETE
     * and decrements the stores.limit usage counter.
     */
    deleteStore: tool({
      description:
        'Permanently delete a store, its product associations, and its synced CMS table. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        storeId: z.string().describe('The store ID to delete'),
      }),
      execute: async (params) => {
        try {
          await caller.stores.delete({
            organizationId,
            storeId: params.storeId,
          })
          return {
            success: true as const,
            storeId: params.storeId,
            message: 'Deleted store and its synced CMS table',
          }
        } catch (err) {
          return handleToolError('deleteStore', err)
        }
      },
    }),

    /**
     * Add a product to a store with a specific price.
     * This auto-creates a CMS row in the store's synced table with all
     * product data (name, image, price, billing, inventory, etc).
     * Only ONE_TIME and RECURRING billing types are allowed — SPLIT_PAYMENT is blocked.
     * Routes through caller.stores.addProduct which enforces STORES_UPDATE.
     */
    addProductToStore: tool({
      description:
        'Add a product to a store with a specific price. This automatically creates a ' +
        'row in the store\'s synced CMS table. You need the productId and priceId — ' +
        'use listProducts and getProduct to find them first. Only ONE_TIME and RECURRING ' +
        'prices are allowed (no split payments).',
      inputSchema: z.object({
        storeId: z.string().describe('The store ID'),
        productId: z.string().describe('The product ID to add'),
        priceId: z.string().describe('The price ID to use for this product in the store'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.stores.addProduct({
            organizationId,
            storeId: params.storeId,
            productId: params.productId,
            priceId: params.priceId,
          })
          return {
            success: true as const,
            storeId: params.storeId,
            productId: params.productId,
            message: `Added product to store. CMS row auto-created with product data.`,
            order: result.order,
          }
        } catch (err) {
          return handleToolError('addProductToStore', err)
        }
      },
    }),

    /**
     * Remove a product from a store.
     * This also deletes the corresponding CMS row from the synced table.
     * Routes through caller.stores.removeProduct which enforces STORES_UPDATE.
     */
    removeProductFromStore: tool({
      description:
        'Remove a product from a store. This also removes the product\'s row ' +
        'from the store\'s synced CMS table. Use askUser to confirm first.',
      inputSchema: z.object({
        storeId: z.string().describe('The store ID'),
        productId: z.string().describe('The product ID to remove'),
      }),
      execute: async (params) => {
        try {
          await caller.stores.removeProduct({
            organizationId,
            storeId: params.storeId,
            productId: params.productId,
          })
          return {
            success: true as const,
            message: 'Removed product from store and deleted its CMS row',
          }
        } catch (err) {
          return handleToolError('removeProductFromStore', err)
        }
      },
    }),

    /**
     * Change which price a product uses in a store.
     * This also updates the CMS row with the new price data.
     * Routes through caller.stores.updateProductPrice which enforces STORES_UPDATE.
     */
    updateStoreProductPrice: tool({
      description:
        'Change the price used for a product in a store. This also updates the ' +
        'CMS row with the new price info. Only ONE_TIME and RECURRING prices allowed.',
      inputSchema: z.object({
        storeId: z.string().describe('The store ID'),
        productId: z.string().describe('The product ID'),
        priceId: z.string().describe('The new price ID to use'),
      }),
      execute: async (params) => {
        try {
          await caller.stores.updateProductPrice({
            organizationId,
            storeId: params.storeId,
            productId: params.productId,
            priceId: params.priceId,
          })
          return {
            success: true as const,
            message: 'Updated product price in store and synced CMS row',
          }
        } catch (err) {
          return handleToolError('updateStoreProductPrice', err)
        }
      },
    }),

    /**
     * List products available to add to a store (not already in it).
     * Useful for the AI to find products before calling addProductToStore.
     * Routes through caller.stores.getAvailableProducts which enforces STORES_READ.
     */
    getAvailableProductsForStore: tool({
      description:
        'List products that can be added to a store (products not already in it). ' +
        'Use this to find product and price IDs before calling addProductToStore.',
      inputSchema: z.object({
        storeId: z.string().describe('The store ID'),
        search: z.string().optional().describe('Search products by name'),
      }),
      execute: async (params) => {
        try {
          const products = await caller.stores.getAvailableProducts({
            organizationId,
            storeId: params.storeId,
            search: params.search,
          })
          return {
            success: true as const,
            products: products.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              imageUrl: p.imageUrl,
              prices: p.prices.map((pr) => ({
                id: pr.id,
                name: pr.name,
                amount: pr.amount,
                currency: pr.currency,
                billingType: pr.billingType,
                interval: pr.interval,
              })),
            })),
            count: products.length,
            message: `Found ${products.length} available product(s)`,
          }
        } catch (err) {
          return handleToolError('getAvailableProductsForStore', err)
        }
      },
    }),

    /**
     * Reorder products within a store.
     * Pass the product IDs in the desired order.
     * Routes through caller.stores.reorderProducts which enforces STORES_UPDATE.
     */
    reorderStoreProducts: tool({
      description: 'Reorder products within a store. Pass product IDs in the desired order.',
      inputSchema: z.object({
        storeId: z.string().describe('The store ID'),
        productIds: z.array(z.string()).describe('Product IDs in the desired display order'),
      }),
      execute: async (params) => {
        try {
          await caller.stores.reorderProducts({
            organizationId,
            storeId: params.storeId,
            productIds: params.productIds,
          })
          return {
            success: true as const,
            message: `Reordered ${params.productIds.length} products in store`,
          }
        } catch (err) {
          return handleToolError('reorderStoreProducts', err)
        }
      },
    }),
  }
}
