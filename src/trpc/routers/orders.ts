/**
 * Orders Router
 *
 * tRPC router for e-commerce order management.
 * IMPORTANT: Not all transactions are orders! Orders are specifically
 * for e-commerce products that require fulfillment.
 *
 * SOURCE OF TRUTH: Orders Router for order management endpoints
 *
 * Uses organizationProcedure for authorization.
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { OrderStatus, FulfillmentStatus } from '@/generated/prisma'
import * as orderService from '@/services/order.service'
import * as orderNoteService from '@/services/order-note.service'
import { permissions } from '@/lib/better-auth/permissions'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * SOURCE OF TRUTH: ListOrdersSchema
 * Schema for listing orders with pagination and filters
 */
export const listOrdersSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  status: z.array(z.nativeEnum(OrderStatus)).optional(),
  fulfillmentStatus: z.array(z.nativeEnum(FulfillmentStatus)).optional(),
  fromDate: z.date().optional(),
  toDate: z.date().optional(),
})

/**
 * SOURCE OF TRUTH: GetOrderSchema
 * Schema for getting a single order by ID
 */
export const getOrderSchema = z.object({
  organizationId: z.string(),
  orderId: z.string(),
})

/**
 * SOURCE OF TRUTH: CreateOrderSchema
 * Schema for creating a new order (used by AI agents and automation)
 */
export const createOrderSchema = z.object({
  organizationId: z.string(),
  transactionId: z.string().optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  fulfillmentStatus: z.nativeEnum(FulfillmentStatus).optional(),
  // Shipping address
  shippingName: z.string().optional(),
  shippingLine1: z.string().optional(),
  shippingLine2: z.string().optional(),
  shippingCity: z.string().optional(),
  shippingState: z.string().optional(),
  shippingZip: z.string().optional(),
  shippingCountry: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * SOURCE OF TRUTH: UpdateOrderSchema
 * Schema for updating an existing order
 */
export const updateOrderSchema = z.object({
  organizationId: z.string(),
  orderId: z.string(),
  status: z.nativeEnum(OrderStatus).optional(),
  fulfillmentStatus: z.nativeEnum(FulfillmentStatus).optional(),
  shippingCarrier: z.string().nullable().optional(),
  trackingNumber: z.string().nullable().optional(),
  trackingUrl: z.string().url().nullable().optional(),
  // Shipping address
  shippingName: z.string().nullable().optional(),
  shippingLine1: z.string().nullable().optional(),
  shippingLine2: z.string().nullable().optional(),
  shippingCity: z.string().nullable().optional(),
  shippingState: z.string().nullable().optional(),
  shippingZip: z.string().nullable().optional(),
  shippingCountry: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * SOURCE OF TRUTH: UpdateFulfillmentSchema
 * Schema for updating order fulfillment status
 */
export const updateFulfillmentSchema = z.object({
  organizationId: z.string(),
  orderId: z.string(),
  fulfillmentStatus: z.nativeEnum(FulfillmentStatus),
  shippingCarrier: z.string().nullable().optional(),
  trackingNumber: z.string().nullable().optional(),
  trackingUrl: z.string().url().nullable().optional(),
})

/**
 * SOURCE OF TRUTH: AddTrackingSchema
 * Schema for adding tracking information to an order
 */
export const addTrackingSchema = z.object({
  organizationId: z.string(),
  orderId: z.string(),
  shippingCarrier: z.string().min(1, 'Shipping carrier is required'),
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  trackingUrl: z.string().url().optional(),
})

/**
 * SOURCE OF TRUTH: AttachTransactionSchema
 * Schema for attaching a transaction to an order
 */
export const attachTransactionSchema = z.object({
  organizationId: z.string(),
  orderId: z.string(),
  transactionId: z.string(),
})

/**
 * SOURCE OF TRUTH: DeleteOrderSchema
 * Schema for deleting an order
 */
export const deleteOrderSchema = z.object({
  organizationId: z.string(),
  orderId: z.string(),
})

// ============================================================================
// ORDER NOTE SCHEMAS
// ============================================================================

/**
 * SOURCE OF TRUTH: AddOrderNoteSchema
 * Schema for adding a note to an order
 */
export const addOrderNoteSchema = z.object({
  organizationId: z.string(),
  orderId: z.string(),
  content: z.string().min(1, 'Note content is required'),
  isInternal: z.boolean().default(true),
})

/**
 * SOURCE OF TRUTH: ListOrderNotesSchema
 * Schema for listing order notes
 */
export const listOrderNotesSchema = z.object({
  organizationId: z.string(),
  orderId: z.string(),
  includeInternal: z.boolean().default(true),
})

/**
 * SOURCE OF TRUTH: DeleteOrderNoteSchema
 * Schema for deleting an order note
 */
export const deleteOrderNoteSchema = z.object({
  organizationId: z.string(),
  noteId: z.string(),
})

/**
 * SOURCE OF TRUTH: UpdateOrderNoteSchema
 * Schema for updating an order note
 */
export const updateOrderNoteSchema = z.object({
  organizationId: z.string(),
  noteId: z.string(),
  content: z.string().min(1, 'Note content is required'),
})

// ============================================================================
// ROUTER
// ============================================================================

export const ordersRouter = createTRPCRouter({
  // ==========================================================================
  // ORDER CRUD
  // ==========================================================================

  /**
   * List all orders with pagination and filters
   * Returns orders for e-commerce products only (not all transactions)
   */
  list: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(listOrdersSchema)
    .query(async ({ input }) => {
      const result = await orderService.listOrders({
        organizationId: input.organizationId,
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
        status: input.status,
        fulfillmentStatus: input.fulfillmentStatus,
        fromDate: input.fromDate,
        toDate: input.toDate,
      })

      return {
        orders: result.orders.map((order) => orderService.transformOrder(order)),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        statusCounts: result.statusCounts,
        fulfillmentCounts: result.fulfillmentCounts,
      }
    }),

  /**
   * Get a single order by ID.
   *
   * WHY we fetch siblings here: A mixed cart checkout creates multiple Transactions
   * linked by checkoutSessionId. The Order points to ONE transaction but the detail
   * page needs to show ALL items from the checkout. We fetch sibling transactions
   * and pass them to transformOrder so it can build the allItems list.
   */
  getById: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(getOrderSchema)
    .query(async ({ input }) => {
      const order = await orderService.getOrderById(
        input.organizationId,
        input.orderId
      )

      if (!order) {
        throw createStructuredError('NOT_FOUND', 'Order not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Order not found',
        })
      }

      /**
       * Fetch sibling transactions when this order has a linked transaction.
       * getSiblingTransactions reads the checkoutSessionId from the primary
       * transaction and finds all other transactions from the same checkout.
       */
      const siblings = order.transactionId
        ? await orderService.getSiblingTransactions(order.transactionId)
        : []

      return orderService.transformOrder(order, siblings)
    }),

  /**
   * Get all orders for a specific lead
   * Joins through Transaction → Lead relation
   */
  getForLead: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(z.object({ organizationId: z.string(), leadId: z.string() }))
    .query(async ({ input }) => {
      const orders = await orderService.getOrdersForLead(
        input.organizationId,
        input.leadId
      )
      return orders.map((order) => orderService.transformOrder(order))
    }),

  /**
   * Get orders for a lead with cursor-based infinite scroll.
   * Returns a page of orders + nextCursor for the next page.
   * Used by the lead sheet Orders tab for infinite scroll pagination.
   */
  getForLeadInfinite: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(z.object({
      organizationId: z.string(),
      leadId: z.string(),
      limit: z.number().min(1).max(50).default(20),
      cursor: z.string().nullish(),
    }))
    .query(async ({ input }) => {
      const result = await orderService.getOrdersForLeadPaginated(
        input.organizationId,
        input.leadId,
        input.limit,
        input.cursor
      )
      return {
        items: result.items.map((order) => orderService.transformOrder(order)),
        nextCursor: result.nextCursor,
      }
    }),

  /**
   * Create a new order
   * Used by AI agents and automation to create orders for e-commerce products
   */
  create: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(createOrderSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await orderService.createOrder(input, ctx.user!.id)
      return orderService.transformOrder(order)
    }),

  /**
   * Update an existing order
   */
  update: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(updateOrderSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, orderId, ...data } = input
      const order = await orderService.updateOrder(
        organizationId,
        orderId,
        data,
        ctx.user!.id
      )
      return orderService.transformOrder(order)
    }),

  /**
   * Delete an order
   */
  delete: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(deleteOrderSchema)
    .mutation(async ({ ctx, input }) => {
      await orderService.deleteOrder(
        input.organizationId,
        input.orderId,
        ctx.user!.id
      )
      return { success: true }
    }),

  // ==========================================================================
  // ORDER FULFILLMENT
  // ==========================================================================

  /**
   * Update order fulfillment status
   * Marks an order as fulfilled, partially fulfilled, or unfulfilled
   */
  updateFulfillment: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(updateFulfillmentSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await orderService.updateFulfillmentStatus(
        input.organizationId,
        input.orderId,
        {
          fulfillmentStatus: input.fulfillmentStatus,
          shippingCarrier: input.shippingCarrier,
          trackingNumber: input.trackingNumber,
          trackingUrl: input.trackingUrl,
        },
        ctx.user!.id
      )
      return orderService.transformOrder(order)
    }),

  /**
   * Add tracking information to an order
   * Adds shipping carrier and tracking number
   */
  addTracking: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(addTrackingSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await orderService.addTrackingInfo(
        input.organizationId,
        input.orderId,
        {
          shippingCarrier: input.shippingCarrier,
          trackingNumber: input.trackingNumber,
          trackingUrl: input.trackingUrl,
        },
        ctx.user!.id
      )
      return orderService.transformOrder(order)
    }),

  /**
   * Attach a transaction to an order
   * Links a payment transaction to an e-commerce order
   */
  attachTransaction: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(attachTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await orderService.attachTransaction(
        input.organizationId,
        input.orderId,
        input.transactionId,
        ctx.user!.id
      )
      return orderService.transformOrder(order)
    }),

  // ==========================================================================
  // ORDER NOTES
  // ==========================================================================

  /**
   * Add a note to an order
   * Notes can be internal (staff only) or visible to customers
   */
  addNote: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(addOrderNoteSchema)
    .mutation(async ({ ctx, input }) => {
      return await orderNoteService.addNote({
        organizationId: input.organizationId,
        orderId: input.orderId,
        content: input.content,
        isInternal: input.isInternal,
        createdBy: ctx.user!.id,
      })
    }),

  /**
   * List all notes for an order
   * Can filter to only show customer-visible notes
   */
  listNotes: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(listOrderNotesSchema)
    .query(async ({ input }) => {
      return await orderNoteService.listNotes(
        input.organizationId,
        input.orderId,
        input.includeInternal
      )
    }),

  /**
   * Update an order note
   */
  updateNote: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(updateOrderNoteSchema)
    .mutation(async ({ ctx, input }) => {
      return await orderNoteService.updateNote(
        input.organizationId,
        input.noteId,
        input.content,
        ctx.user!.id
      )
    }),

  /**
   * Delete an order note
   */
  deleteNote: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(deleteOrderNoteSchema)
    .mutation(async ({ ctx, input }) => {
      await orderNoteService.deleteNote(
        input.organizationId,
        input.noteId,
        ctx.user!.id
      )
      return { success: true }
    }),
})
