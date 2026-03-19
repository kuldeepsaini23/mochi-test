/**
 * ============================================================================
 * MOCHI AI TOOLS - PAYMENT LINKS
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for payment link management.
 * Payment links generate shareable checkout URLs for products/prices.
 *
 * SECURITY: Routes all operations through tRPC caller so that permissions,
 * feature gates, and Stripe connect checks are enforced — never bypassed.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiPaymentLinkTools, AIPaymentLinkManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Creates all payment link tools bound to the given organization.
 * Uses the tRPC caller for secure procedure invocation with full middleware.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller that enforces permissions, feature gates, and Stripe connect
 */
export function createPaymentLinkTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a payment link (checkout URL) for a product or specific price.
     * Routes through tRPC `products.createPaymentLink` which enforces:
     * - PRODUCTS_CREATE permission
     * - Stripe connect requirement (requireStripeConnect: true)
     */
    createPaymentLink: tool({
      description:
        'Create a payment link (shareable checkout URL) for a product or specific price. ' +
        'Use type "PRODUCT" to link to a product, or "PRICE" to link to a specific price. ' +
        'Use the product/price ID from previous tool results.',
      inputSchema: z.object({
        type: z.enum(['PRODUCT', 'PRICE']).describe('Link type: "PRODUCT" for a product, "PRICE" for a specific price'),
        productId: z.string().optional().describe('Product ID (required when type is "PRODUCT")'),
        priceId: z.string().optional().describe('Price ID (required when type is "PRICE")'),
      }),
      execute: async (params) => {
        try {
          const link = await caller.products.createPaymentLink({
            organizationId,
            type: params.type,
            productId: params.productId,
            priceId: params.priceId,
          })
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          return {
            success: true,
            linkId: link.id,
            code: link.code,
            checkoutUrl: `${baseUrl}/pay/${link.code}`,
            message: `Created payment link: ${baseUrl}/pay/${link.code}`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createPaymentLink', err)
        }
      },
    }),

    /**
     * Get all payment links for a product.
     * Routes through tRPC `products.getPaymentLinks` which enforces PRODUCTS_READ permission.
     */
    getPaymentLinks: tool({
      description: 'Get all payment links for a product. Use the product ID from a previous tool result.',
      inputSchema: z.object({
        productId: z.string().describe('The product ID to get payment links for'),
      }),
      execute: async (params) => {
        try {
          const links = await caller.products.getPaymentLinks({
            organizationId,
            productId: params.productId,
          })
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          return {
            success: true,
            links: links.map((l) => ({
              id: l.id,
              checkoutUrl: `${baseUrl}/pay/${l.code}`,
              active: l.active,
              type: l.type,
            })),
            message: `Found ${links.length} payment links`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('getPaymentLinks', err)
        }
      },
    }),

    /**
     * Deactivate a payment link — ALWAYS confirm with askUser first.
     * Routes through tRPC `products.deactivatePaymentLink` which enforces PRODUCTS_DELETE permission.
     */
    deactivatePaymentLink: tool({
      description:
        'Deactivate a payment link so it can no longer be used for checkout. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        linkId: z.string().describe('The payment link ID to deactivate'),
      }),
      execute: async (params) => {
        try {
          await caller.products.deactivatePaymentLink({
            organizationId,
            linkId: params.linkId,
          })
          return {
            success: true,
            linkId: params.linkId,
            message: 'Deactivated payment link',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deactivatePaymentLink', err)
        }
      },
    }),
  }
}
