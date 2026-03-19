/**
 * Products Router
 *
 * tRPC router for product and pricing management.
 * Products are created in the organization's Stripe Connect account.
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  baseProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { BillingType, BillingInterval, PaymentLinkType, InventoryChangeReason } from '@/generated/prisma'
import * as productService from '@/services/product.service'
import {
  createPaymentLink,
  getPaymentLinkByCode,
  getPaymentLinksForProduct,
  deactivatePaymentLink,
} from '@/services/payment-link.service'
import {
  createCheckoutIntent,
  createEmbeddedCheckoutIntent,
} from '@/services/payment/checkout.service'
import * as upsellService from '@/services/payment/upsell.service'
import * as inventoryService from '@/services/inventory.service'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import { getOrganizationCurrency } from '@/services/currency.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

// Product Schemas
export const createProductSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  /**
   * SOURCE OF TRUTH: ProductImages
   * Additional product images for gallery display (max 8 per Stripe limit).
   */
  images: z.array(z.string().url()).max(8).optional().default([]),
})

export const updateProductSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  /**
   * SOURCE OF TRUTH: ProductImages
   * Additional product images for gallery display (max 8 per Stripe limit).
   */
  images: z.array(z.string().url()).max(8).optional(),
  active: z.boolean().optional(),
  /**
   * SOURCE OF TRUTH: ProductTestMode
   * When true, all payment links for this product use test Stripe API keys.
   * Allows testing payment flows without real money.
   */
  testMode: z.boolean().optional(),
})

export const deleteProductSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
})

export const bulkDeleteProductsSchema = z.object({
  organizationId: z.string(),
  productIds: z.array(z.string()).min(1),
})

export const getProductSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
})

export const listProductsSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  activeOnly: z.boolean().optional(),
})

// Price Schemas
export const createPriceSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  name: z.string().min(1, 'Price name is required'),
  amount: z.number().int().positive('Amount must be a positive integer (in cents)'),
  /**
   * Currency code — optional. When omitted, the product service resolves
   * the org's Stripe account currency automatically (SOURCE OF TRUTH).
   * WHY no default: Hardcoding 'usd' caused currency mismatch errors for
   * non-USD orgs when the AI or other callers didn't explicitly pass currency.
   */
  currency: z.string().optional(),
  billingType: z.nativeEnum(BillingType),
  // For RECURRING billing
  interval: z.nativeEnum(BillingInterval).optional(),
  intervalCount: z.number().int().positive().optional(),
  // For SPLIT_PAYMENT billing
  installments: z.number().int().min(2).optional(),
  installmentInterval: z.nativeEnum(BillingInterval).optional(),
  installmentIntervalCount: z.number().int().positive().optional(),
  // Free trial duration in days (for RECURRING and ONE_TIME, not SPLIT_PAYMENT)
  trialDays: z.number().int().min(1).max(365).optional(),
})

export const updatePriceSchema = z.object({
  organizationId: z.string(),
  priceId: z.string(),
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  // Free trial duration in days — set to null to remove trial
  trialDays: z.number().int().min(1).max(365).optional().nullable(),
})

export const deletePriceSchema = z.object({
  organizationId: z.string(),
  priceId: z.string(),
})

// Feature Schemas
export const createFeatureSchema = z.object({
  organizationId: z.string(),
  priceId: z.string(),
  name: z.string().min(1, 'Feature name is required'),
  description: z.string().optional().nullable(),
  order: z.number().int().optional(),
})

export const updateFeatureSchema = z.object({
  organizationId: z.string(),
  featureId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  order: z.number().int().optional(),
})

export const deleteFeatureSchema = z.object({
  organizationId: z.string(),
  featureId: z.string(),
})

export const setFeaturesSchema = z.object({
  organizationId: z.string(),
  priceId: z.string(),
  features: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().optional().nullable(),
    })
  ),
})

export const reorderFeaturesSchema = z.object({
  organizationId: z.string(),
  priceId: z.string(),
  featureOrders: z.array(
    z.object({
      featureId: z.string(),
      order: z.number().int(),
    })
  ),
})

// Checkout Schema
export const createCheckoutIntentSchema = z.object({
  paymentLinkId: z.string(),
  priceId: z.string(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
})

/**
 * SOURCE OF TRUTH: EmbeddedCheckoutIntentSchema
 *
 * Schema for creating a checkout intent directly from product/price IDs
 * without requiring a payment link. Used by the website builder's
 * embedded payment element.
 */
export const createEmbeddedCheckoutIntentSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  priceId: z.string(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  /**
   * SOURCE OF TRUTH: PaymentTestMode
   * When true, uses Stripe TEST API keys for payment processing.
   * Allows testing with test credit cards (4242 4242 4242 4242).
   */
  testMode: z.boolean().optional().default(false),
  /**
   * SOURCE OF TRUTH: OrderBumpCheckoutInput
   * Optional order bump — a one-time add-on product included in the same payment.
   * The bump product/price is validated server-side to ensure it belongs to the
   * same organization and has ONE_TIME billing.
   */
  orderBump: z
    .object({
      productId: z.string(),
      priceId: z.string(),
    })
    .optional(),
})

// ============================================================================
// INVENTORY SCHEMAS
// ============================================================================

/**
 * SOURCE OF TRUTH: InventoryAdjustSchema
 * Schema for adjusting inventory by a delta amount
 */
export const adjustInventorySchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  change: z.number().int(), // Positive to add, negative to subtract
  reason: z.nativeEnum(InventoryChangeReason),
  note: z.string().optional(),
})

/**
 * SOURCE OF TRUTH: InventorySetSchema
 * Schema for setting absolute inventory quantity
 */
export const setInventorySchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  quantity: z.number().int().min(0, 'Quantity cannot be negative'),
  note: z.string().optional(),
})

/**
 * SOURCE OF TRUTH: InventorySettingsSchema
 * Schema for updating inventory tracking settings
 */
export const updateInventorySettingsSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  trackInventory: z.boolean().optional(),
  allowBackorder: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
})

/**
 * SOURCE OF TRUTH: InventoryHistorySchema
 * Schema for getting inventory history
 */
export const getInventoryHistorySchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
})

// ============================================================================
// ROUTER
// ============================================================================

export const productsRouter = createTRPCRouter({
  // ==========================================================================
  // PRODUCTS
  // ==========================================================================

  /**
   * List all products for organization with pagination
   */
  list: organizationProcedure({ requirePermission: permissions.PRODUCTS_READ })
    .input(listProductsSchema)
    .query(async ({ input }) => {
      return await productService.listProducts({
        organizationId: input.organizationId,
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
        activeOnly: input.activeOnly,
      })
    }),

  /**
   * Get a single product by ID
   */
  getById: organizationProcedure({ requirePermission: permissions.PRODUCTS_READ })
    .input(getProductSchema)
    .query(async ({ input }) => {
      const product = await productService.getProductById(
        input.organizationId,
        input.productId
      )

      if (!product) {
        throw createStructuredError('NOT_FOUND', 'Product not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Product not found',
        })
      }

      return product
    }),

  /**
   * Create a new product
   *
   * FEATURE GATE: products.limit
   * Checks organization's product limit before creating.
   * Note: Currently unlimited for all plans, but wired up for future-proofing.
   */
  /** Feature-gated: products.limit checked at procedure level before handler runs */
  create: organizationProcedure({
    requirePermission: permissions.PRODUCTS_CREATE,
    requireStripeConnect: true,
    requireFeature: 'products.limit',
  })
    .input(createProductSchema)
    .mutation(async ({ ctx, input }) => {
      const product = await productService.createProduct({
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        images: input.images,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'products.limit')

      return product
    }),

  /**
   * Update a product
   */
  update: organizationProcedure({ requirePermission: permissions.PRODUCTS_UPDATE })
    .input(updateProductSchema)
    .mutation(async ({ input }) => {
      const { organizationId, productId, ...data } = input
      return await productService.updateProduct(organizationId, productId, data)
    }),

  /**
   * Delete a product (soft delete)
   *
   * FEATURE GATE: products.limit
   * Decrements usage after successful deletion.
   */
  delete: organizationProcedure({ requirePermission: permissions.PRODUCTS_DELETE })
    .input(deleteProductSchema)
    .mutation(async ({ ctx, input }) => {
      await productService.deleteProduct(input.organizationId, input.productId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, input.organizationId, 'products.limit')

      return { success: true, message: 'Product deleted' }
    }),

  /**
   * Bulk delete products (soft delete)
   *
   * FEATURE GATE: products.limit
   * Decrements usage by the number of deleted products.
   */
  bulkDelete: organizationProcedure({ requirePermission: permissions.PRODUCTS_DELETE })
    .input(bulkDeleteProductsSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await productService.bulkDeleteProducts(
        input.organizationId,
        input.productIds
      )

      // Decrement usage by number of deleted products
      await decrementUsageAndInvalidate(
        ctx,
        input.organizationId,
        'products.limit',
        result.count
      )

      return { success: true, count: result.count }
    }),

  // ==========================================================================
  // PRICES
  // ==========================================================================

  /**
   * Create a new price for a product
   */
  createPrice: organizationProcedure({
    requirePermission: permissions.PRODUCTS_CREATE,
    requireStripeConnect: true,
  })
    .input(createPriceSchema)
    .mutation(async ({ input }) => {
      // Validate billing type specific fields
      if (input.billingType === 'RECURRING' && !input.interval) {
        throw createStructuredError('BAD_REQUEST', 'Interval is required for recurring prices', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Interval is required for recurring prices',
        })
      }

      if (input.billingType === 'SPLIT_PAYMENT' && (!input.installments || !input.installmentInterval)) {
        throw createStructuredError(
          'BAD_REQUEST',
          'Installments and installment interval are required for split payment prices',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Installments and installment interval are required for split payment prices',
          }
        )
      }

      /** Free trials are only supported for RECURRING and ONE_TIME prices */
      if (input.billingType === 'SPLIT_PAYMENT' && input.trialDays) {
        throw createStructuredError('BAD_REQUEST', 'Free trials are not supported for split payment prices', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Free trials are not supported for split payment prices',
        })
      }

      /**
       * CURRENCY ENFORCEMENT: Always use the org's Stripe account currency.
       * Client-provided currency is IGNORED — prevents AI hallucination and
       * ensures all prices match the org's Stripe payout currency.
       * SOURCE OF TRUTH: Organization.stripeAccountCurrency via currency.service
       */
      const { currency: orgCurrency } = await getOrganizationCurrency(input.organizationId)

      return await productService.createPrice({
        productId: input.productId,
        name: input.name,
        amount: input.amount,
        currency: orgCurrency,
        billingType: input.billingType,
        interval: input.interval,
        intervalCount: input.intervalCount,
        installments: input.installments,
        installmentInterval: input.installmentInterval,
        installmentIntervalCount: input.installmentIntervalCount,
        trialDays: input.trialDays,
      })
    }),

  /**
   * Update a price
   */
  updatePrice: organizationProcedure({ requirePermission: permissions.PRODUCTS_UPDATE })
    .input(updatePriceSchema)
    .mutation(async ({ input }) => {
      const { organizationId, priceId, ...data } = input
      return await productService.updatePrice(organizationId, priceId, data)
    }),

  /**
   * Delete a price (soft delete)
   */
  deletePrice: organizationProcedure({ requirePermission: permissions.PRODUCTS_DELETE })
    .input(deletePriceSchema)
    .mutation(async ({ input }) => {
      await productService.deletePrice(input.organizationId, input.priceId)
      return { success: true, message: 'Price deleted' }
    }),

  // ==========================================================================
  // FEATURES
  // ==========================================================================

  /**
   * Add a feature to a price
   *
   * SECURITY: organizationId is passed to service to validate price ownership.
   */
  createFeature: organizationProcedure({ requirePermission: permissions.PRODUCTS_CREATE })
    .input(createFeatureSchema)
    .mutation(async ({ input }) => {
      return await productService.createFeature({
        organizationId: input.organizationId,
        priceId: input.priceId,
        name: input.name,
        description: input.description,
        order: input.order,
      })
    }),

  /**
   * Update a feature
   */
  updateFeature: organizationProcedure({ requirePermission: permissions.PRODUCTS_UPDATE })
    .input(updateFeatureSchema)
    .mutation(async ({ input }) => {
      const { organizationId, featureId, ...data } = input
      return await productService.updateFeature(organizationId, featureId, data)
    }),

  /**
   * Delete a feature
   */
  deleteFeature: organizationProcedure({ requirePermission: permissions.PRODUCTS_DELETE })
    .input(deleteFeatureSchema)
    .mutation(async ({ input }) => {
      await productService.deleteFeature(input.organizationId, input.featureId)
      return { success: true, message: 'Feature deleted' }
    }),

  /**
   * Set all features for a price (replace existing)
   */
  setFeatures: organizationProcedure({ requirePermission: permissions.PRODUCTS_UPDATE })
    .input(setFeaturesSchema)
    .mutation(async ({ input }) => {
      return await productService.setFeatures(
        input.organizationId,
        input.priceId,
        input.features
      )
    }),

  /**
   * Reorder features within a price
   */
  reorderFeatures: organizationProcedure({ requirePermission: permissions.PRODUCTS_UPDATE })
    .input(reorderFeaturesSchema)
    .mutation(async ({ input }) => {
      await productService.reorderFeatures(
        input.organizationId,
        input.priceId,
        input.featureOrders
      )
      return { success: true, message: 'Features reordered' }
    }),

  // ==========================================================================
  // PAYMENT LINKS
  // ==========================================================================

  /**
   * Create a payment link for a product or specific price
   */
  createPaymentLink: organizationProcedure({
    requirePermission: permissions.PRODUCTS_CREATE,
    requireStripeConnect: true,
  })
    .input(
      z.object({
        organizationId: z.string(),
        type: z.nativeEnum(PaymentLinkType),
        productId: z.string().optional(),
        priceId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await createPaymentLink({
        organizationId: input.organizationId,
        type: input.type,
        productId: input.productId,
        priceId: input.priceId,
      })
    }),

  /**
   * Get payment links for a product
   */
  getPaymentLinks: organizationProcedure({ requirePermission: permissions.PRODUCTS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        productId: z.string(),
      })
    )
    .query(async ({ input }) => {
      return await getPaymentLinksForProduct(
        input.organizationId,
        input.productId
      )
    }),

  /**
   * Get payment link by code (PUBLIC - no auth required)
   */
  getPaymentLinkByCode: baseProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const link = await getPaymentLinkByCode(input.code)
      if (!link) {
        throw createStructuredError('NOT_FOUND', 'Payment link not found or inactive', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Payment link not found or inactive',
        })
      }
      return link
    }),

  /**
   * Create checkout intent (PUBLIC - no auth required)
   *
   * Creates payment intent or subscription based on billing type.
   * Uses Stripe Payment Element for 100+ payment methods.
   */
  createCheckoutIntent: baseProcedure
    .input(createCheckoutIntentSchema)
    .mutation(async ({ input }) => {
      return await createCheckoutIntent({
        paymentLinkId: input.paymentLinkId,
        priceId: input.priceId,
        customer: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
        },
      })
    }),

  /**
   * Create embedded checkout intent (PUBLIC - no auth required)
   *
   * SOURCE OF TRUTH: EmbeddedPaymentCheckout
   *
   * Creates payment intent or subscription directly from product/price IDs
   * without requiring a payment link. Used by the website builder's
   * embedded payment element.
   *
   * SECURITY:
   * - Validates that the price belongs to the product
   * - Validates that the product belongs to the organization
   * - Validates that both product and price are active
   */
  createEmbeddedCheckoutIntent: baseProcedure
    .input(createEmbeddedCheckoutIntentSchema)
    .mutation(async ({ input }) => {
      return await createEmbeddedCheckoutIntent({
        organizationId: input.organizationId,
        productId: input.productId,
        priceId: input.priceId,
        customer: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
        },
        testMode: input.testMode,
        orderBump: input.orderBump,
      })
    }),

  /**
   * Generate an encrypted upsell token after a successful payment.
   * Called by the client immediately after payment confirmation,
   * before redirecting to the upsell page.
   *
   * SOURCE OF TRUTH: GenerateUpsellTokenEndpoint
   *
   * SECURITY:
   * - Public endpoint (no auth required) — but requires valid transactionId
   * - Token is AES-256-GCM encrypted with server-side secret
   * - Token expires in 15 minutes
   * - Payment method ID is never exposed to the client
   */
  generateUpsellToken: baseProcedure
    .input(
      z.object({
        transactionId: z.string().min(1, 'Transaction ID is required'),
        organizationId: z.string().min(1, 'Organization ID is required'),
      })
    )
    .mutation(async ({ input }) => {
      const token = await upsellService.generateUpsellToken(
        input.transactionId,
        input.organizationId
      )
      return { token }
    }),

  /**
   * Process a one-click upsell payment using a previously generated token.
   * Called when the customer clicks the upsell button on the upsell page.
   *
   * SOURCE OF TRUTH: ProcessUpsellPaymentEndpoint
   *
   * SECURITY:
   * - Public endpoint — but requires valid encrypted token
   * - Token verification handles authentication (contains customer + payment method)
   * - Product ownership is validated server-side
   * - Payment method comes from encrypted token, never from client input
   */
  processUpsellPayment: baseProcedure
    .input(
      z.object({
        /** The encrypted upsell token from the URL parameter */
        token: z.string().min(1, 'Upsell token is required'),
        /** The upsell product to purchase */
        productId: z.string().min(1, 'Product ID is required'),
        /** The price tier of the upsell product */
        priceId: z.string().min(1, 'Price ID is required'),
      })
    )
    .mutation(async ({ input }) => {
      return await upsellService.processUpsellPayment(
        input.token,
        input.productId,
        input.priceId
      )
    }),

  /**
   * Deactivate a payment link
   */
  deactivatePaymentLink: organizationProcedure({ requirePermission: permissions.PRODUCTS_DELETE })
    .input(
      z.object({
        organizationId: z.string(),
        linkId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await deactivatePaymentLink(input.organizationId, input.linkId)
      return { success: true }
    }),

  // ==========================================================================
  // INVENTORY MANAGEMENT
  // ==========================================================================

  /**
   * Adjust inventory by a delta amount
   * Use this for manual adjustments (restock, correction, etc.)
   */
  adjustInventory: organizationProcedure({ requirePermission: permissions.PRODUCTS_UPDATE })
    .input(adjustInventorySchema)
    .mutation(async ({ ctx, input }) => {
      return await inventoryService.adjustInventory({
        organizationId: input.organizationId,
        productId: input.productId,
        change: input.change,
        reason: input.reason,
        note: input.note,
        createdBy: ctx.user!.id,
      })
    }),

  /**
   * Set inventory to an absolute quantity
   * Use this to set the current stock level directly
   */
  setInventory: organizationProcedure({ requirePermission: permissions.PRODUCTS_UPDATE })
    .input(setInventorySchema)
    .mutation(async ({ ctx, input }) => {
      return await inventoryService.setInventory({
        organizationId: input.organizationId,
        productId: input.productId,
        quantity: input.quantity,
        note: input.note,
        createdBy: ctx.user!.id,
      })
    }),

  /**
   * Update inventory tracking settings
   * Toggle tracking, backorder allowance, and low stock threshold
   */
  updateInventorySettings: organizationProcedure({ requirePermission: permissions.PRODUCTS_UPDATE })
    .input(updateInventorySettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return await inventoryService.updateInventorySettings(
        input.organizationId,
        input.productId,
        {
          trackInventory: input.trackInventory,
          allowBackorder: input.allowBackorder,
          lowStockThreshold: input.lowStockThreshold,
        },
        ctx.user!.id
      )
    }),

  /**
   * Get inventory history for a product
   * Returns paginated audit trail of inventory changes
   */
  getInventoryHistory: organizationProcedure({ requirePermission: permissions.PRODUCTS_READ })
    .input(getInventoryHistorySchema)
    .query(async ({ input }) => {
      return await inventoryService.getInventoryHistory(
        input.organizationId,
        input.productId,
        input.page,
        input.pageSize
      )
    }),

  /**
   * Get products with low stock
   * Returns products at or below their low stock threshold
   */
  getLowStockProducts: organizationProcedure({ requirePermission: permissions.PRODUCTS_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return await inventoryService.getLowStockProducts(input.organizationId)
    }),
})
