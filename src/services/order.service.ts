/**
 * Order Service (DAL)
 *
 * Data Access Layer for e-commerce order operations.
 * IMPORTANT: Not all transactions are orders!
 * Orders are specifically for e-commerce products that require fulfillment.
 *
 * SOURCE OF TRUTH: Order, OrderStatus, FulfillmentStatus
 *
 * tRPC routers call these functions after security checks.
 */

import 'server-only'
import { prisma } from '@/lib/config'
import type { OrderStatus, FulfillmentStatus, Prisma } from '@/generated/prisma'
import { logActivity } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * SOURCE OF TRUTH: OrderCreateInput
 * Input for creating a new order
 */
export type OrderCreateInput = {
  organizationId: string
  transactionId?: string
  status?: OrderStatus
  fulfillmentStatus?: FulfillmentStatus
  // Shipping address
  shippingName?: string
  shippingLine1?: string
  shippingLine2?: string
  shippingCity?: string
  shippingState?: string
  shippingZip?: string
  shippingCountry?: string
  metadata?: Record<string, unknown>
}

/**
 * SOURCE OF TRUTH: OrderUpdateInput
 * Input for updating an existing order
 */
export type OrderUpdateInput = {
  status?: OrderStatus
  fulfillmentStatus?: FulfillmentStatus
  fulfilledAt?: Date | null
  shippingCarrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  // Shipping address
  shippingName?: string | null
  shippingLine1?: string | null
  shippingLine2?: string | null
  shippingCity?: string | null
  shippingState?: string | null
  shippingZip?: string | null
  shippingCountry?: string | null
  metadata?: Record<string, unknown>
}

/**
 * SOURCE OF TRUTH: OrderListInput
 * Input for listing orders with pagination and filters
 */
export type OrderListInput = {
  organizationId: string
  search?: string
  page?: number
  pageSize?: number
  status?: OrderStatus[]
  fulfillmentStatus?: FulfillmentStatus[]
  fromDate?: Date
  toDate?: Date
}

// Include relations for order queries
const orderInclude = {
  transaction: {
    include: {
      lead: true,
      items: true,
    },
  },
  notes: {
    orderBy: { createdAt: 'desc' as const },
    take: 5,
  },
} satisfies Prisma.OrderInclude

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>

// ============================================================================
// ORDER CRUD OPERATIONS
// ============================================================================

/**
 * Create a new order
 *
 * @param input - Order creation data
 * @param userId - Optional user ID for activity logging
 * @returns The created order
 */
export async function createOrder(
  input: OrderCreateInput,
  userId?: string
): Promise<OrderWithRelations> {
  const order = await prisma.order.create({
    data: {
      organizationId: input.organizationId,
      transactionId: input.transactionId,
      status: input.status ?? 'PENDING',
      fulfillmentStatus: input.fulfillmentStatus ?? 'UNFULFILLED',
      shippingName: input.shippingName,
      shippingLine1: input.shippingLine1,
      shippingLine2: input.shippingLine2,
      shippingCity: input.shippingCity,
      shippingState: input.shippingState,
      shippingZip: input.shippingZip,
      shippingCountry: input.shippingCountry,
      metadata: input.metadata as Prisma.InputJsonValue,
    },
    include: orderInclude,
  })

  // Log activity
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'order',
      entityId: order.id,
    })
  }

  return order
}

/**
 * Get order by ID
 *
 * @param organizationId - Organization that owns the order
 * @param orderId - Order ID
 * @returns Order with relations or null
 */
export async function getOrderById(
  organizationId: string,
  orderId: string
): Promise<OrderWithRelations | null> {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      organizationId,
    },
    include: orderInclude,
  })
}

/**
 * Get order by transaction ID
 *
 * @param organizationId - Organization that owns the order
 * @param transactionId - Transaction ID
 * @returns Order with relations or null
 */
export async function getOrderByTransactionId(
  organizationId: string,
  transactionId: string
): Promise<OrderWithRelations | null> {
  return prisma.order.findFirst({
    where: {
      transactionId,
      organizationId,
    },
    include: orderInclude,
  })
}

/**
 * Get all orders for a specific lead
 * Joins through the Transaction relation since orders don't have a direct leadId
 *
 * @param organizationId - Organization that owns the orders
 * @param leadId - Lead ID to find orders for
 * @returns Array of orders with relations
 */
export async function getOrdersForLead(
  organizationId: string,
  leadId: string
) {
  return await prisma.order.findMany({
    where: {
      organizationId,
      transaction: {
        leadId,
      },
    },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get orders for a lead with cursor-based pagination.
 * Returns items + nextCursor for infinite scroll.
 * Uses the take+1 pattern: fetch one extra row to determine if more pages exist.
 *
 * SOURCE OF TRUTH: OrderLeadPaginated, InfiniteOrders
 *
 * @param organizationId - Organization that owns the orders
 * @param leadId - Lead ID to find orders for
 * @param limit - Number of orders per page
 * @param cursor - Optional order ID to start after (for subsequent pages)
 * @returns Paginated result with items array and optional nextCursor
 */
export async function getOrdersForLeadPaginated(
  organizationId: string,
  leadId: string,
  limit: number,
  cursor?: string | null
) {
  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      transaction: {
        leadId,
      },
    },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Fetch one extra to determine hasMore
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = orders.length > limit
  const items = hasMore ? orders.slice(0, limit) : orders
  const nextCursor = hasMore ? items[items.length - 1].id : undefined

  return { items, nextCursor }
}

/**
 * List orders with pagination and filters
 *
 * @param input - List parameters
 * @returns Paginated list of orders
 */
export async function listOrders(input: OrderListInput): Promise<{
  orders: OrderWithRelations[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  statusCounts: Record<string, number>
  fulfillmentCounts: Record<string, number>
}> {
  const {
    organizationId,
    search,
    page = 1,
    pageSize = 10,
    status,
    fulfillmentStatus,
    fromDate,
    toDate,
  } = input

  // Build where clause
  const where: Prisma.OrderWhereInput = {
    organizationId,
    ...(status && status.length > 0 && { status: { in: status } }),
    ...(fulfillmentStatus &&
      fulfillmentStatus.length > 0 && { fulfillmentStatus: { in: fulfillmentStatus } }),
    ...(fromDate && { createdAt: { gte: fromDate } }),
    ...(toDate && { createdAt: { lte: toDate } }),
    ...(search && {
      OR: [
        { id: { contains: search, mode: 'insensitive' as const } },
        { trackingNumber: { contains: search, mode: 'insensitive' as const } },
        { transaction: { lead: { email: { contains: search, mode: 'insensitive' as const } } } },
        { transaction: { lead: { firstName: { contains: search, mode: 'insensitive' as const } } } },
        { transaction: { lead: { lastName: { contains: search, mode: 'insensitive' as const } } } },
      ],
    }),
  }

  // Get total count and orders
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  // Get status counts for filters
  const [statusCounts, fulfillmentCounts] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ['fulfillmentStatus'],
      where: { organizationId },
      _count: true,
    }),
  ])

  return {
    orders,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    fulfillmentCounts: Object.fromEntries(fulfillmentCounts.map((s) => [s.fulfillmentStatus, s._count])),
  }
}

/**
 * Update an order
 *
 * @param organizationId - Organization that owns the order
 * @param orderId - Order ID
 * @param input - Update data
 * @param userId - Optional user ID for activity logging
 * @returns Updated order
 */
export async function updateOrder(
  organizationId: string,
  orderId: string,
  input: OrderUpdateInput,
  userId?: string
): Promise<OrderWithRelations> {
  // Verify order belongs to organization
  const existing = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
  })

  if (!existing) {
    throw new Error('Order not found')
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: input.status,
      fulfillmentStatus: input.fulfillmentStatus,
      fulfilledAt: input.fulfilledAt,
      shippingCarrier: input.shippingCarrier,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
      shippingName: input.shippingName,
      shippingLine1: input.shippingLine1,
      shippingLine2: input.shippingLine2,
      shippingCity: input.shippingCity,
      shippingState: input.shippingState,
      shippingZip: input.shippingZip,
      shippingCountry: input.shippingCountry,
      ...(input.metadata && { metadata: input.metadata as Prisma.InputJsonValue }),
    },
    include: orderInclude,
  })

  // Log activity
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'order',
      entityId: orderId,
    })
  }

  return order
}

/**
 * Update order fulfillment status
 *
 * @param organizationId - Organization that owns the order
 * @param orderId - Order ID
 * @param fulfillmentData - Fulfillment update data
 * @param userId - User ID for activity logging
 * @returns Updated order
 */
export async function updateFulfillmentStatus(
  organizationId: string,
  orderId: string,
  fulfillmentData: {
    fulfillmentStatus: FulfillmentStatus
    shippingCarrier?: string | null
    trackingNumber?: string | null
    trackingUrl?: string | null
  },
  userId: string
): Promise<OrderWithRelations> {
  // Set fulfilledAt when marking as fulfilled
  const fulfilledAt =
    fulfillmentData.fulfillmentStatus === 'FULFILLED' ? new Date() : undefined

  // Also update order status based on fulfillment
  let status: OrderStatus | undefined
  if (fulfillmentData.fulfillmentStatus === 'FULFILLED') {
    status = 'DELIVERED'
  } else if (fulfillmentData.fulfillmentStatus === 'CANCELED') {
    status = 'CANCELED'
  }

  return updateOrder(
    organizationId,
    orderId,
    {
      fulfillmentStatus: fulfillmentData.fulfillmentStatus,
      fulfilledAt,
      shippingCarrier: fulfillmentData.shippingCarrier,
      trackingNumber: fulfillmentData.trackingNumber,
      trackingUrl: fulfillmentData.trackingUrl,
      ...(status && { status }),
    },
    userId
  )
}

/**
 * Add tracking information to an order
 *
 * @param organizationId - Organization that owns the order
 * @param orderId - Order ID
 * @param trackingData - Tracking information
 * @param userId - User ID for activity logging
 * @returns Updated order
 */
export async function addTrackingInfo(
  organizationId: string,
  orderId: string,
  trackingData: {
    shippingCarrier: string
    trackingNumber: string
    trackingUrl?: string
  },
  userId: string
): Promise<OrderWithRelations> {
  return updateOrder(
    organizationId,
    orderId,
    {
      shippingCarrier: trackingData.shippingCarrier,
      trackingNumber: trackingData.trackingNumber,
      trackingUrl: trackingData.trackingUrl,
      fulfillmentStatus: 'PARTIALLY_FULFILLED', // Auto-update when tracking added
      status: 'SHIPPED',
    },
    userId
  )
}

/**
 * Attach a transaction to an order
 *
 * @param organizationId - Organization that owns the order
 * @param orderId - Order ID
 * @param transactionId - Transaction ID to attach
 * @param userId - Optional user ID for activity logging
 * @returns Updated order
 */
export async function attachTransaction(
  organizationId: string,
  orderId: string,
  transactionId: string,
  userId?: string
): Promise<OrderWithRelations> {
  // Verify order and transaction belong to organization
  const [order, transaction] = await Promise.all([
    prisma.order.findFirst({ where: { id: orderId, organizationId } }),
    prisma.transaction.findFirst({
      where: { id: transactionId },
      include: { paymentLink: true },
    }),
  ])

  if (!order) {
    throw new Error('Order not found')
  }

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  // Update order with transaction
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      transactionId,
      status: 'CONFIRMED', // Update status when payment attached
    },
    include: orderInclude,
  })

  // Log activity
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'order',
      entityId: orderId,
    })
  }

  return updated
}

/**
 * Delete an order
 *
 * @param organizationId - Organization that owns the order
 * @param orderId - Order ID
 * @param userId - User ID for activity logging
 */
export async function deleteOrder(
  organizationId: string,
  orderId: string,
  userId: string
): Promise<void> {
  // Verify order belongs to organization
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  await prisma.order.delete({
    where: { id: orderId },
  })

  // Log activity
  logActivity({
    userId,
    organizationId,
    action: 'delete',
    entity: 'order',
    entityId: orderId,
  })
}

// ============================================================================
// TRANSFORM HELPERS
// ============================================================================

/**
 * Transform a single transaction object to the API response shape.
 * Reused by transformOrder for both primary and sibling transactions.
 *
 * SOURCE OF TRUTH: TransactionTrialFields, OrderLineItemPricing, OrderFinancialSummary
 */
function transformTransactionForOrder(txn: OrderWithRelations['transaction']) {
  if (!txn) return null
  return {
    id: txn.id,
    totalAmount: txn.originalAmount,
    paidAmount: txn.paidAmount,
    currency: txn.currency,
    paymentStatus: txn.paymentStatus,
    billingType: txn.billingType,
    trialDays: txn.trialDays,
    trialEndsAt: txn.trialEndsAt?.toISOString() ?? null,
    stripeSubscriptionId: txn.stripeSubscriptionId,
    metadata: txn.metadata as Record<string, unknown> | null,
    lead: txn.lead
      ? {
          id: txn.lead.id,
          email: txn.lead.email,
          firstName: txn.lead.firstName,
          lastName: txn.lead.lastName,
          phone: txn.lead.phone,
          avatarUrl: txn.lead.avatarUrl,
        }
      : null,
    /**
     * Line items with billing context fields (priceId, billingType, interval, intervalCount).
     * These fields are needed for:
     * - Trial detection: matching item's priceId against trial info
     * - Yearly pricing: showing monthly equivalent for yearly plans
     * - Interval labels: displaying /mo, /yr, /wk suffixes
     * SOURCE OF TRUTH: OrderLineItemPricing
     */
    items: txn.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      priceId: item.priceId,
      productName: item.productName,
      productImage: item.productImage,
      priceName: item.priceName,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      totalAmount: item.totalAmount,
      billingType: item.billingType,
      interval: item.interval,
      intervalCount: item.intervalCount,
    })),
  }
}

/**
 * Get sibling transactions for an order via checkoutSessionId.
 *
 * WHY: In the new transaction architecture, a mixed cart creates MULTIPLE
 * Transaction records linked by checkoutSessionId. The Order points to the
 * "primary" transaction. This helper fetches all other transactions from
 * the same checkout so the UI can display complete checkout info.
 *
 * SOURCE OF TRUTH: CheckoutSessionGrouping, OrderSiblingTransactions
 *
 * @param primaryTransactionId - The primary transaction attached to the order
 * @returns Array of sibling transactions (excluding the primary), or empty if none
 */
async function getSiblingTransactions(primaryTransactionId: string) {
  /** Read checkoutSessionId from the primary transaction */
  // checkoutSessionId: pending prisma generate
  const primary = await prisma.transaction.findUnique({
    where: { id: primaryTransactionId },
    select: { checkoutSessionId: true },
  })

  const checkoutSessionId = primary?.checkoutSessionId
  if (!checkoutSessionId) return []

  /** Find all sibling transactions excluding the primary */
  const siblings = await prisma.transaction.findMany({
    // checkoutSessionId: pending prisma generate
    where: {
      checkoutSessionId,
      id: { not: primaryTransactionId },
    },
    include: {
      lead: true,
      items: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return siblings
}

/**
 * SOURCE OF TRUTH: OrderAllItem
 *
 * A unified line item that includes billing context from its parent transaction.
 * Used to display ALL items from a checkout session in one flat list, with badges
 * indicating billing type (One-time, Subscription, Trial).
 *
 * WHY: A mixed cart checkout creates multiple Transactions linked by checkoutSessionId.
 * The Order only points to ONE transaction, so allItems merges items from the primary
 * transaction AND all sibling transactions to show the complete checkout.
 */
export type OrderAllItem = {
  /** TransactionItem ID */
  id: string
  productId: string
  priceId: string
  productName: string
  productImage: string | null
  priceName: string
  quantity: number
  unitAmount: number
  totalAmount: number
  /** Billing type from the item snapshot: ONE_TIME, RECURRING, or SPLIT_PAYMENT */
  billingType: string
  /** Billing interval: MONTH, YEAR, WEEK, DAY — null for one-time */
  interval: string | null
  /** Interval count — null for one-time */
  intervalCount: number | null
  /** Currency from the parent transaction */
  currency: string
  /** Transaction ID this item belongs to */
  transactionId: string
  /** Whether this item's parent transaction is currently in a trial period */
  isOnTrial: boolean
  /** Number of trial days (from the parent transaction), null if not a trial */
  trialDays: number | null
  /** Payment status of the parent transaction (e.g., TRIALING, PAID, ACTIVE) */
  paymentStatus: string
}

/**
 * Build a flat list of OrderAllItem from a transformed transaction.
 * Extracts billing context from the transaction and attaches it to each line item.
 */
function buildAllItemsFromTransaction(
  txn: NonNullable<ReturnType<typeof transformTransactionForOrder>>
): OrderAllItem[] {
  /** Determine if this transaction is currently in a trial period */
  const isOnTrial =
    txn.trialDays != null &&
    txn.trialDays > 0 &&
    txn.paymentStatus === 'TRIALING'

  return txn.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    priceId: item.priceId,
    productName: item.productName,
    productImage: item.productImage,
    priceName: item.priceName,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    totalAmount: item.totalAmount,
    billingType: item.billingType,
    interval: item.interval,
    intervalCount: item.intervalCount,
    currency: txn.currency,
    transactionId: txn.id,
    isOnTrial,
    trialDays: txn.trialDays,
    paymentStatus: txn.paymentStatus,
  }))
}

/**
 * Transform order to API response format.
 *
 * NEW ARCHITECTURE: Includes siblingTransactions field that contains
 * any additional transactions from the same checkout session (e.g.,
 * trial-split subscriptions or mixed billing groups).
 *
 * Also computes an `allItems` field — a flat list of ALL items from the entire
 * checkout session (primary + siblings), each annotated with billing context
 * so the UI can display badges like "Trial", "Subscription", "One-time".
 */
export function transformOrder(
  order: OrderWithRelations,
  siblingTransactions?: Awaited<ReturnType<typeof getSiblingTransactions>>
) {
  const primaryTxn = transformTransactionForOrder(order.transaction)
  const transformedSiblings = (siblingTransactions ?? []).map((txn) =>
    transformTransactionForOrder(txn as unknown as OrderWithRelations['transaction'])
  )

  /**
   * All items from this checkout session — includes trial and subscription items
   * from sibling transactions. Each item carries billing context (isOnTrial,
   * billingType, trialDays) so the UI can render appropriate badges.
   *
   * SOURCE OF TRUTH: OrderAllItem, CheckoutSessionGrouping
   */
  const allItems: OrderAllItem[] = []

  /* Add items from the primary transaction */
  if (primaryTxn) {
    allItems.push(...buildAllItemsFromTransaction(primaryTxn))
  }

  /* Add items from sibling transactions */
  for (const siblingTxn of transformedSiblings) {
    if (siblingTxn) {
      allItems.push(...buildAllItemsFromTransaction(siblingTxn))
    }
  }

  return {
    id: order.id,
    organizationId: order.organizationId,
    transactionId: order.transactionId,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
    shippingCarrier: order.shippingCarrier,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    // Shipping address
    shippingName: order.shippingName,
    shippingLine1: order.shippingLine1,
    shippingLine2: order.shippingLine2,
    shippingCity: order.shippingCity,
    shippingState: order.shippingState,
    shippingZip: order.shippingZip,
    shippingCountry: order.shippingCountry,
    // Primary transaction data (if attached)
    transaction: primaryTxn,
    /**
     * Sibling transactions from the same checkout session.
     * Present when a mixed cart created multiple Transactions linked by checkoutSessionId.
     * The UI uses this to show all billing groups from a single checkout.
     *
     * SOURCE OF TRUTH: CheckoutSessionGrouping, OrderSiblingTransactions
     */
    siblingTransactions: transformedSiblings,
    /**
     * All items from the entire checkout session — primary + sibling transactions.
     * Each item includes billing context (isOnTrial, billingType, trialDays, paymentStatus)
     * for the UI to render badges and pricing appropriately.
     *
     * SOURCE OF TRUTH: OrderAllItem
     */
    allItems,
    // Recent notes
    notes: order.notes.map((note) => ({
      id: note.id,
      content: note.content,
      isInternal: note.isInternal,
      createdBy: note.createdBy,
      createdAt: note.createdAt.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

// Re-export for use by tRPC routers that need sibling transactions
export { getSiblingTransactions }
