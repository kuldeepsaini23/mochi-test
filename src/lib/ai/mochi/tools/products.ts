/**
 * ============================================================================
 * MOCHI AI TOOLS - PRODUCTS
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for product management.
 *
 * SECURITY: Routes all operations through tRPC caller so that permissions,
 * feature gates, and Stripe connect checks are enforced — never bypassed.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiProductTools, AIProductManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Creates all product-related tools bound to the given organization.
 * Uses the tRPC caller for secure procedure invocation with full middleware.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller that enforces permissions, feature gates, and Stripe connect
 */
export function createProductTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new product.
     * Routes through tRPC `products.create` which enforces:
     * - PRODUCTS_CREATE permission
     * - Stripe connect requirement
     * - products.limit feature gate
     */
    createProduct: tool({
      description: 'Create a new product.',
      inputSchema: z.object({
        name: z.string().describe('Product name'),
        description: z.string().optional().describe('Product description'),
        imageUrl: z.string().optional().describe('Primary product image URL'),
        /** SOURCE OF TRUTH: ProductImages — gallery URLs, max 8 per Stripe limit */
        images: z
          .array(z.string())
          .max(8)
          .optional()
          .describe('Additional product gallery image URLs (max 8). Syncs to Stripe and CMS.'),
      }),
      execute: async (params) => {
        try {
          const product = await caller.products.create({
            organizationId,
            name: params.name,
            description: params.description,
            imageUrl: params.imageUrl,
            images: params.images,
          })
          return {
            success: true,
            productId: product.id,
            name: product.name,
            message: `Created product "${params.name}" (ID: ${product.id})`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createProduct', err)
        }
      },
    }),

    /**
     * List products with optional search and pagination.
     * Routes through tRPC `products.list` which enforces PRODUCTS_READ permission.
     */
    listProducts: tool({
      description: 'List products with optional search filter.',
      inputSchema: z.object({
        search: z.string().optional().describe('Search by name'),
        page: z.number().optional().describe('Page number (defaults to 1)'),
        pageSize: z.number().optional().describe('Items per page (defaults to 10)'),
        activeOnly: z.boolean().optional().describe('Only show active products'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.products.list({
            organizationId,
            search: params.search,
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 10,
            activeOnly: params.activeOnly,
          })
          return {
            success: true,
            products: result.products.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              active: p.active,
            })),
            total: result.total,
            message: `Found ${result.total} products`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listProducts', err)
        }
      },
    }),

    /**
     * Get a product by ID with prices and features.
     * Routes through tRPC `products.getById` which enforces PRODUCTS_READ permission.
     * tRPC throws NOT_FOUND if the product doesn't exist, so we catch that.
     */
    getProduct: tool({
      description: 'Get a product by ID with its prices and features.',
      inputSchema: z.object({
        productId: z.string().describe('The product ID'),
      }),
      execute: async (params) => {
        try {
          const product = await caller.products.getById({
            organizationId,
            productId: params.productId,
          })
          return {
            success: true,
            product: {
              id: product.id,
              name: product.name,
              description: product.description,
              active: product.active,
              prices: product.prices,
            },
            message: `Found product "${product.name}"`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('getProduct', err)
        }
      },
    }),

    /**
     * Update a product. Only provide the fields you want to change.
     * Routes through tRPC `products.update` which enforces PRODUCTS_UPDATE permission.
     */
    updateProduct: tool({
      description: 'Update a product. Only provide the fields you want to change.',
      inputSchema: z.object({
        productId: z.string().describe('The product ID to update'),
        name: z.string().optional().describe('New name'),
        description: z.string().optional().describe('New description'),
        imageUrl: z.string().optional().describe('New primary image URL'),
        /** SOURCE OF TRUTH: ProductImages — gallery URLs, max 8 per Stripe limit */
        images: z
          .array(z.string())
          .max(8)
          .optional()
          .describe('Updated product gallery image URLs (max 8). Syncs to Stripe and CMS.'),
        active: z.boolean().optional().describe('Whether the product is active'),
      }),
      execute: async (params) => {
        try {
          const { productId, ...data } = params
          const product = await caller.products.update({
            organizationId,
            productId,
            ...data,
          })
          return {
            success: true,
            productId: product.id,
            message: 'Updated product',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('updateProduct', err)
        }
      },
    }),

    /**
     * Delete a product — ALWAYS confirm with askUser first.
     * Routes through tRPC `products.delete` which enforces:
     * - PRODUCTS_DELETE permission
     * - products.limit feature gate decrement
     */
    deleteProduct: tool({
      description:
        'Permanently delete a product and its prices. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        productId: z.string().describe('The product ID to delete'),
      }),
      execute: async (params) => {
        try {
          await caller.products.delete({
            organizationId,
            productId: params.productId,
          })
          return {
            success: true,
            productId: params.productId,
            message: 'Deleted product',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deleteProduct', err)
        }
      },
    }),
  }
}
