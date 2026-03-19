/**
 * Payment Link Service — CRUD Operations Only
 *
 * This file handles payment link CRUD (create, get, deactivate).
 *
 * All other payment logic lives in dedicated service files:
 * - checkout.service.ts — checkout intent creation (all 3 flows)
 * - stripe-resources.service.ts — Stripe customer/product/price helpers
 * - payment-triggers.service.ts — automation trigger firing
 * - payment-completion.service.ts — transaction completion/failure/cancellation
 * - refund.service.ts — refund processing
 * - upsell.service.ts — one-click upsell token generation and processing
 *
 * SOURCE OF TRUTH: PaymentLinkService, PaymentLinkCRUD
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { logActivity } from './activity-log.service'
import { PaymentLinkType } from '@/generated/prisma'

// ============================================================================
// PAYMENT LINK CRUD
// ============================================================================

/**
 * Create a payment link for a product or specific price
 *
 * @param input - Payment link creation data
 * @param userId - Optional user ID for activity logging
 */
export async function createPaymentLink(
  input: {
    organizationId: string
    type: PaymentLinkType
    productId?: string
    priceId?: string
  },
  userId?: string
) {
  if (input.type === 'PRODUCT' && !input.productId) {
    throw new Error('Product ID is required for PRODUCT type links')
  }
  if (input.type === 'PRICE' && !input.priceId) {
    throw new Error('Price ID is required for PRICE type links')
  }

  // Check if link already exists
  const existingLink = await prisma.paymentLink.findFirst({
    where: {
      organizationId: input.organizationId,
      type: input.type,
      ...(input.type === 'PRODUCT'
        ? { productId: input.productId }
        : { priceId: input.priceId }),
      active: true,
    },
  })

  if (existingLink) return existingLink

  const paymentLink = await prisma.paymentLink.create({
    data: {
      organizationId: input.organizationId,
      type: input.type,
      productId: input.type === 'PRODUCT' ? input.productId : null,
      priceId: input.type === 'PRICE' ? input.priceId : null,
    },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'payment_link',
      entityId: paymentLink.id,
    })
  }

  return paymentLink
}

/**
 * Get payment link by code (public)
 */
export async function getPaymentLinkByCode(code: string) {
  const link = await prisma.paymentLink.findUnique({
    where: { code, active: true },
    include: {
      product: {
        include: {
          prices: {
            where: { active: true, deletedAt: null },
            include: { features: { orderBy: { order: 'asc' } } },
            orderBy: { createdAt: 'asc' },
          },
          organization: {
            select: { id: true, name: true, logo: true, stripeConnectedAccountId: true },
          },
        },
      },
      price: {
        include: {
          features: { orderBy: { order: 'asc' } },
          product: {
            include: {
              organization: {
                select: { id: true, name: true, logo: true, stripeConnectedAccountId: true },
              },
            },
          },
        },
      },
    },
  })

  if (!link) return null

  // Validate link is still valid
  if (link.type === 'PRODUCT' && (!link.product || !link.product.active)) return null
  if (link.type === 'PRICE' && (!link.price || !link.price.active)) return null

  return link
}

/**
 * Get payment links for a product
 */
export async function getPaymentLinksForProduct(organizationId: string, productId: string) {
  const prices = await prisma.productPrice.findMany({
    where: { productId, deletedAt: null },
    select: { id: true },
  })

  return await prisma.paymentLink.findMany({
    where: {
      organizationId,
      active: true,
      OR: [
        { type: 'PRODUCT', productId },
        { type: 'PRICE', priceId: { in: prices.map((p) => p.id) } },
      ],
    },
  })
}

/**
 * Deactivate a payment link
 *
 * @param organizationId - Organization ID for ownership verification and activity logging
 * @param linkId - Payment link ID to deactivate
 * @param userId - Optional user ID for activity logging
 */
export async function deactivatePaymentLink(
  organizationId: string,
  linkId: string,
  userId?: string
) {
  const paymentLink = await prisma.paymentLink.update({
    where: { id: linkId, organizationId },
    data: { active: false },
  })

  // Log activity for audit trail (deactivation is an update action)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'payment_link',
      entityId: paymentLink.id,
    })
  }

  return paymentLink
}
