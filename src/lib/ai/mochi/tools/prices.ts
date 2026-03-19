/**
 * ============================================================================
 * MOCHI AI TOOLS - PRICES & FEATURES
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for price and feature management.
 * Prices belong to products and define billing options.
 *
 * SECURITY: Routes all operations through tRPC caller so that permissions,
 * feature gates, and Stripe connect checks are enforced — never bypassed.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiPriceTools, AIPriceManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Creates all price and feature tools bound to the given organization.
 * Uses the tRPC caller for secure procedure invocation with full middleware.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller that enforces permissions, feature gates, and Stripe connect
 */
export function createPriceTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new price for a product.
     * Routes through tRPC `products.createPrice` which enforces:
     * - PRODUCTS_CREATE permission
     * - Stripe connect requirement
     *
     * NOTE: The AI receives amounts in dollars but tRPC expects cents.
     * We convert dollars to cents here before passing to the caller.
     */
    createPrice: tool({
      description: 'Create a new price for a product. Amount is in DOLLARS (e.g., 29 for $29, 9.99 for $9.99). For monthly subscriptions use billingType=RECURRING and interval=MONTH. IMPORTANT: You MUST use a real productId from a previous createProduct result or from listProducts — NEVER guess or fabricate an ID.',
      inputSchema: z.object({
        productId: z.string().describe('The product ID to add the price to. MUST be a real ID from createProduct or listProducts — never guess.'),
        name: z.string().describe('Price name (e.g., "Monthly", "Annual")'),
        amount: z.number().describe('Price in dollars (e.g., 29 for $29, 9.99 for $9.99)'),
        billingType: z
          .enum(['ONE_TIME', 'RECURRING', 'SPLIT_PAYMENT'])
          .describe('ONE_TIME for single purchase, RECURRING for subscriptions, SPLIT_PAYMENT for installments'),
        interval: z
          .enum(['DAY', 'WEEK', 'MONTH', 'YEAR'])
          .optional()
          .describe('Billing interval for RECURRING prices (e.g., MONTH for monthly)'),
        installments: z
          .number()
          .int()
          .min(2)
          .optional()
          .describe('Number of installments (for SPLIT_PAYMENT only)'),
        installmentInterval: z
          .enum(['DAY', 'WEEK', 'MONTH', 'YEAR'])
          .optional()
          .describe('Installment interval (for SPLIT_PAYMENT only)'),
        trialDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe('Free trial duration in days (1-365). Only for ONE_TIME or RECURRING, NOT SPLIT_PAYMENT. Customer is not charged until trial ends.'),
      }),
      execute: async (params) => {
        try {
          /**
           * Convert dollar amount to cents and ensure positive.
           * AI models sometimes pass negative values, so we take the absolute value.
           * intervalCount defaults to 1 (every interval) since that's the common case.
           * tRPC createPrice schema expects amount in cents (positive integer).
           */
          const amountInCents = Math.round(Math.abs(params.amount) * 100)

          /**
           * NOTE: Currency is NOT passed — the router forces the org's Stripe currency.
           * AI has 0% control over currency to prevent hallucinated currency codes.
           */
          const price = await caller.products.createPrice({
            organizationId,
            productId: params.productId,
            name: params.name,
            amount: amountInCents,
            billingType: params.billingType,
            interval: params.interval,
            intervalCount: params.interval ? 1 : undefined,
            installments: params.installments,
            installmentInterval: params.installmentInterval,
            installmentIntervalCount: params.installmentInterval ? 1 : undefined,
            trialDays: params.trialDays,
          })

          /** Build human-readable confirmation message with trial info when applicable. */
          const trialInfo = params.trialDays ? ` with ${params.trialDays}-day free trial` : ''
          return {
            success: true,
            priceId: price.id,
            message: `Created price "${params.name}" for ${Math.abs(params.amount)} per ${params.interval?.toLowerCase() || 'one-time'}${trialInfo} (ID: ${price.id})`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createPrice', err)
        }
      },
    }),

    /**
     * Update a price name or active status.
     * Routes through tRPC `products.updatePrice` which enforces PRODUCTS_UPDATE permission.
     */
    updatePrice: tool({
      description: 'Update a price name or active status.',
      inputSchema: z.object({
        priceId: z.string().describe('The price ID to update'),
        name: z.string().optional().describe('New name'),
        active: z.boolean().optional().describe('Whether the price is active'),
      }),
      execute: async (params) => {
        try {
          const { priceId, ...data } = params
          const price = await caller.products.updatePrice({
            organizationId,
            priceId,
            ...data,
          })
          return {
            success: true,
            priceId: price.id,
            message: 'Updated price',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('updatePrice', err)
        }
      },
    }),

    /**
     * Delete a price — ALWAYS confirm with askUser first.
     * Routes through tRPC `products.deletePrice` which enforces PRODUCTS_DELETE permission.
     */
    deletePrice: tool({
      description:
        'Permanently delete a price from a product. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        priceId: z.string().describe('The price ID to delete'),
      }),
      execute: async (params) => {
        try {
          await caller.products.deletePrice({
            organizationId,
            priceId: params.priceId,
          })
          return {
            success: true,
            priceId: params.priceId,
            message: 'Deleted price',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deletePrice', err)
        }
      },
    }),

    /**
     * Set features for a price tier. Replaces any existing features.
     * Routes through tRPC `products.setFeatures` which enforces PRODUCTS_UPDATE permission.
     * Uses simple string format to avoid nested object issues with AI tool calling.
     */
    setFeatures: tool({
      description:
        'Set all features for a price tier. Replaces any existing features. ' +
        'Each feature is a simple string like "Unlimited users" or "Priority support". ' +
        'Example: ["Unlimited users", "Priority support", "API access", "Custom branding"]. ' +
        'IMPORTANT: priceId MUST be a real ID from createPrice or getProduct — never guess.',
      inputSchema: z.object({
        priceId: z.string().describe('The price ID (from createPrice or getProduct result — never guess)'),
        features: z
          .array(z.string())
          .describe(
            'Array of feature names as simple strings. ' +
            'Example: ["Unlimited users", "Priority support", "API access"]'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * Convert flat string array to the format tRPC setFeatures expects.
           * Each string becomes a feature object with name and no description.
           */
          const featureObjects = params.features.map((name) => ({
            name: name.trim(),
          }))

          const features = await caller.products.setFeatures({
            organizationId,
            priceId: params.priceId,
            features: featureObjects,
          })
          return {
            success: true,
            featuresSet: params.features.length,
            features,
            message: `Set ${params.features.length} features for price`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('setFeatures', err)
        }
      },
    }),
  }
}
