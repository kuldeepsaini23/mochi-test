/**
 * Notification Service (DAL)
 *
 * SOURCE OF TRUTH KEYWORDS: Notification, NotificationService, NotificationCreate,
 *   NotificationRead, NotificationBulk, UnreadCount, NotificationPagination
 *
 * WHY: Centralized service for creating, querying, and managing in-app notifications.
 * This is the ONLY place that should interact with Prisma for Notification records.
 *
 * FEATURES:
 * - createNotification: Creates a single notification and emits a realtime event
 * - createBulkNotifications: Sends to multiple users efficiently via createMany
 * - getNotifications: Paginated notification list with optional unread filter
 * - markAsRead / markAllAsRead: Mark notifications as read with realtime sync
 * - deleteNotification: Hard deletes a notification (ownership verified)
 * - getUnreadCount: Quick unread badge count for a user in an org
 *
 * REALTIME:
 * - `notifications.created` emitted on create so the bell icon updates instantly
 * - `notifications.read` emitted on read so open tabs stay in sync
 *
 * ORG SCOPING:
 * Every function is scoped to organizationId + userId to prevent cross-org data leaks.
 */

import 'server-only'

import { prisma } from '@/lib/config'
import { realtime } from '@/lib/realtime'
import { sendPushToUser, sendPushToUsers } from '@/lib/push/push.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents a single notification record.
 * Mirrors the Prisma Notification model that the developer will add.
 *
 * SOURCE OF TRUTH: NotificationRecord, NotificationShape
 */
export interface NotificationRecord {
  id: string
  organizationId: string
  userId: string
  title: string
  body: string
  /** Category for grouping/filtering (e.g., "payment", "lead", "system") */
  category: string
  /** Optional deep-link URL the notification navigates to when clicked */
  actionUrl: string | null
  /** Whether the user has read this notification */
  isRead: boolean
  /** Timestamp when the notification was marked as read (null if unread) */
  readAt: Date | null
  createdAt: Date
}

/**
 * Input for creating a single notification.
 *
 * SOURCE OF TRUTH: CreateNotificationInput, NotificationCreate
 */
export interface CreateNotificationInput {
  organizationId: string
  /** The target user who will receive this notification */
  userId: string
  title: string
  body: string
  /** Category for grouping (e.g., "payment", "lead", "appointment", "system") */
  category: string
  /** Optional deep-link URL for click-through navigation */
  actionUrl?: string | null
}

/**
 * Input for creating notifications for multiple users at once.
 * Useful for org-wide announcements or multi-member notifications.
 *
 * SOURCE OF TRUTH: CreateBulkNotificationsInput, BulkNotificationCreate
 */
export interface CreateBulkNotificationsInput {
  organizationId: string
  /** Array of user IDs that should receive the notification */
  userIds: string[]
  title: string
  body: string
  category: string
  actionUrl?: string | null
}

/**
 * Input for querying a user's notifications with cursor pagination.
 *
 * SOURCE OF TRUTH: GetNotificationsInput, NotificationQuery
 */
export interface GetNotificationsInput {
  organizationId: string
  userId: string
  /** Cursor for pagination (the id of the last notification from previous page) */
  cursor?: string | null
  /** Number of notifications to return per page (default: 20) */
  limit?: number
  /** When true, only return unread notifications */
  unreadOnly?: boolean
}

/**
 * Paginated response for getNotifications.
 * Includes the notification list, pagination cursor, and the total unread count.
 *
 * SOURCE OF TRUTH: GetNotificationsResponse, NotificationListResponse
 */
export interface GetNotificationsResponse {
  notifications: NotificationRecord[]
  /** Cursor for the next page (null if no more pages) */
  nextCursor: string | null
  /** Total unread notifications for this user in this org (for badge display) */
  unreadCount: number
}

/**
 * Input for marking a single notification as read.
 *
 * SOURCE OF TRUTH: MarkAsReadInput
 */
export interface MarkAsReadInput {
  notificationId: string
  /** Used to verify ownership — only the recipient can mark their notification as read */
  userId: string
}

/**
 * Input for marking all notifications as read for a user in an org.
 *
 * SOURCE OF TRUTH: MarkAllAsReadInput
 */
export interface MarkAllAsReadInput {
  organizationId: string
  userId: string
}

/**
 * Input for deleting a single notification.
 *
 * SOURCE OF TRUTH: DeleteNotificationInput
 */
export interface DeleteNotificationInput {
  notificationId: string
  /** Used to verify ownership — only the recipient can delete their notification */
  userId: string
}

/**
 * Input for getting the unread notification count.
 *
 * SOURCE OF TRUTH: GetUnreadCountInput
 */
export interface GetUnreadCountInput {
  organizationId: string
  userId: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default number of notifications per page */
const DEFAULT_PAGE_LIMIT = 20

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create a single notification and emit a realtime event.
 *
 * Flow:
 * 1. Insert the notification record into the database
 * 2. Emit `notifications.created` so the user's UI updates instantly (bell badge, toast, etc.)
 * 3. Return the created notification
 *
 * WHY realtime emit: Without this, the user would only see new notifications
 * on their next page load or poll. The realtime event enables instant bell updates.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationRecord> {
  // Create the notification record in the database
  const notification = await prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      title: input.title,
      body: input.body,
      category: input.category,
      actionUrl: input.actionUrl ?? null,
      isRead: false,
      readAt: null,
    },
  })

  // Emit realtime event so the user's UI updates instantly.
  // The event shape matches the notifications.created schema in src/lib/realtime.ts
  // userId is included so clients can filter — only show toasts for YOUR notifications
  await realtime.emit('notifications.created', {
    organizationId: input.organizationId,
    userId: input.userId,
    notificationId: notification.id,
    title: input.title,
    body: input.body,
    category: input.category,
    actionUrl: input.actionUrl ?? undefined,
  })

  /**
   * Send web push notification to the user's subscribed PWA devices.
   * Fire-and-forget — push is best-effort and must never block in-app delivery.
   * Works from both Next.js server context and Trigger.dev cloud tasks.
   */
  sendPushToUser(input.organizationId, input.userId, {
    title: input.title,
    body: input.body,
    url: input.actionUrl ?? '/',
    tag: input.category,
  }).catch((err) => {
    console.error('[Push] Failed to send push to user:', err)
  })

  return notification as NotificationRecord
}

/**
 * Create notifications for multiple users at once.
 *
 * Flow:
 * 1. Build data array for all users
 * 2. Use createMany for efficient bulk insert (single DB round-trip)
 * 3. Emit a realtime event for EACH user individually
 *
 * WHY per-user events: Each user has their own realtime subscription channel.
 * A single bulk event wouldn't reach every user's client. We emit one event
 * per user so each person's bell icon updates independently.
 *
 * WHY createMany: Inserting 50 rows in one query is orders of magnitude faster
 * than 50 individual inserts. Only the realtime events need to be per-user.
 */
export async function createBulkNotifications(
  input: CreateBulkNotificationsInput
): Promise<{ count: number }> {
  // Build the data array — one notification record per target user
  const data = input.userIds.map((userId) => ({
    organizationId: input.organizationId,
    userId,
    title: input.title,
    body: input.body,
    category: input.category,
    actionUrl: input.actionUrl ?? null,
    isRead: false,
    readAt: null,
  }))

  /** DEBUG: Log every notification batch insert with stack trace to find duplicate sources */
  const callStack = new Error().stack
  console.log(`🔔 [NOTIF-DEBUG] createBulkNotifications: title="${input.title}", body="${input.body}", category="${input.category}", userCount=${input.userIds.length}, org=${input.organizationId}`)
  console.log(`🔔 [NOTIF-DEBUG] createBulkNotifications call stack:\n${callStack}`)

  // Bulk insert all notifications in a single DB round-trip
  const result = await prisma.notification.createMany({ data })

  // Emit a realtime event for each user so their UI updates.
  // We fire these in parallel for speed — order doesn't matter for notifications.
  const realtimePayload = {
    organizationId: input.organizationId,
    title: input.title,
    body: input.body,
    category: input.category,
    actionUrl: input.actionUrl ?? undefined,
  }

  await Promise.all(
    input.userIds.map(async (userId) => {
      // Each user needs their own event with a unique notificationId.
      // Since createMany doesn't return individual IDs, we query them.
      // This is a trade-off: one extra query per user vs. N individual creates.
      // For most use cases (org-wide = <50 users), this is acceptable.
      const userNotification = await prisma.notification.findFirst({
        where: {
          organizationId: input.organizationId,
          userId,
          title: input.title,
          body: input.body,
          category: input.category,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })

      if (userNotification) {
        await realtime.emit('notifications.created', {
          ...realtimePayload,
          userId,
          notificationId: userNotification.id,
        })
      }
    })
  )

  /**
   * Send web push notifications to ALL recipients' subscribed PWA devices.
   * Single query fetches all subscriptions, then fans out push sends in parallel.
   * Fire-and-forget — push failure must never block in-app notification delivery.
   */
  sendPushToUsers(input.organizationId, input.userIds, {
    title: input.title,
    body: input.body,
    url: input.actionUrl ?? '/',
    tag: input.category,
  }).catch((err) => {
    console.error('[Push] Failed to send push to users:', err)
  })

  return { count: result.count }
}

/**
 * Get a paginated list of notifications for a user in an org.
 *
 * Features:
 * - Cursor-based pagination (stable even as new notifications arrive)
 * - Optional unread-only filter for quick unread scanning
 * - Returns unreadCount alongside the list for badge display
 *
 * WHY cursor pagination: Offset-based pagination breaks when new rows are inserted
 * between pages (user sees duplicates or misses items). Cursor pagination is stable.
 *
 * WHY include unreadCount: The bell badge needs this number. Fetching it alongside
 * the list avoids an extra round-trip from the client.
 */
export async function getNotifications(
  input: GetNotificationsInput
): Promise<GetNotificationsResponse> {
  const limit = input.limit ?? DEFAULT_PAGE_LIMIT

  // Build the where clause — always scoped to org + user
  const where: Record<string, unknown> = {
    organizationId: input.organizationId,
    userId: input.userId,
  }

  // Optional: only show unread notifications
  if (input.unreadOnly) {
    where.isRead = false
  }

  // Run the notification query and unread count in parallel
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      // Fetch one extra to determine if there's a next page
      take: limit + 1,
      // Cursor-based pagination: start after the given notification ID
      ...(input.cursor
        ? {
            cursor: { id: input.cursor },
            skip: 1, // Skip the cursor item itself
          }
        : {}),
    }),

    // Always fetch unread count for the badge, regardless of filters
    prisma.notification.count({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        isRead: false,
      },
    }),
  ])

  // Determine if there's a next page by checking if we got more than `limit` results
  const hasNextPage = notifications.length > limit
  const trimmedNotifications = hasNextPage
    ? notifications.slice(0, limit)
    : notifications

  // The next cursor is the ID of the last item in the current page
  const nextCursor = hasNextPage
    ? trimmedNotifications[trimmedNotifications.length - 1]?.id ?? null
    : null

  return {
    notifications: trimmedNotifications as NotificationRecord[],
    nextCursor,
    unreadCount,
  }
}

/**
 * Mark a single notification as read.
 *
 * Flow:
 * 1. Update the notification (isRead = true, readAt = now)
 * 2. Verify ownership via userId in the where clause (prevents cross-user access)
 * 3. Emit `notifications.read` so other open tabs stay in sync
 *
 * WHY userId in where: This ensures a user can only mark THEIR OWN notifications
 * as read. Without this, anyone with a notificationId could mark others' notifications.
 */
export async function markAsRead(
  input: MarkAsReadInput
): Promise<NotificationRecord | null> {
  // Update only if the notification belongs to this user
  const notification = await prisma.notification.updateMany({
    where: {
      id: input.notificationId,
      userId: input.userId,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  })

  // If no rows were updated, the notification doesn't exist or doesn't belong to this user
  if (notification.count === 0) {
    return null
  }

  // Fetch the updated notification to return it and get the organizationId for the event
  const updated = await prisma.notification.findUnique({
    where: { id: input.notificationId },
  })

  if (updated) {
    // Emit realtime event so other open tabs/devices mark it as read too
    await realtime.emit('notifications.read', {
      organizationId: updated.organizationId,
      notificationId: updated.id,
    })
  }

  return updated as NotificationRecord | null
}

/**
 * Mark ALL unread notifications as read for a user in an org.
 *
 * WHY updateMany: A user clicking "Mark all as read" could have hundreds of unread
 * notifications. Updating them one-by-one would be absurdly slow. updateMany does it
 * in a single DB query.
 *
 * NOTE: We don't emit individual realtime events for each notification here.
 * The client that triggered "mark all as read" already knows to clear its local state.
 * Other tabs can refetch on focus.
 */
export async function markAllAsRead(
  input: MarkAllAsReadInput
): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  })

  return { count: result.count }
}

/**
 * Hard delete a single notification.
 *
 * WHY ownership check: The userId in the where clause ensures a user can only
 * delete their own notifications. Without this, any user with a notification ID
 * could delete someone else's notifications.
 *
 * WHY hard delete: Per project rules, we never use soft delete unless explicitly told.
 * Notifications are ephemeral by nature — once deleted, they're gone.
 */
export async function deleteNotification(
  input: DeleteNotificationInput
): Promise<boolean> {
  // deleteMany with compound where ensures ownership — returns count of deleted rows
  const result = await prisma.notification.deleteMany({
    where: {
      id: input.notificationId,
      userId: input.userId,
    },
  })

  // Returns true if the notification was found and deleted, false otherwise
  return result.count > 0
}

/**
 * Get the count of unread notifications for a user in an org.
 *
 * WHY a dedicated function: The bell icon badge needs just a number, not the full
 * notification list. This is a lightweight count query — much cheaper than fetching
 * all notifications just to count them client-side.
 */
export async function getUnreadCount(
  input: GetUnreadCountInput
): Promise<number> {
  return prisma.notification.count({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      isRead: false,
    },
  })
}

// ============================================================================
// PAYMENT NOTIFICATION CONTEXT RESOLUTION
// ============================================================================

/**
 * Return shape for payment notification context resolution.
 * Contains everything needed to build a payment notification body.
 *
 * SOURCE OF TRUTH: PaymentNotificationContext
 */
export interface PaymentNotificationContext {
  organizationId: string
  currency: string
  customerName?: string
}

/**
 * Look up a Transaction by PaymentIntent ID and resolve the customer name
 * from the lead relation for use in payment notifications.
 *
 * WHY: completeTransaction() and handleSubscriptionPayment() return the raw
 * Transaction record without the Lead relation. We need the lead's name for
 * a meaningful notification body like "$99.00 from John Doe".
 *
 * @param paymentIntentId - Stripe PaymentIntent ID to look up the transaction
 * @returns Object with organizationId, currency, and optional customerName
 */
export async function resolveTransactionNotificationData(
  paymentIntentId: string
): Promise<PaymentNotificationContext | null> {
  const transaction = await prisma.transaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: {
      organizationId: true,
      currency: true,
      lead: { select: { firstName: true, lastName: true } },
    },
  })

  if (!transaction) return null

  const leadName = transaction.lead
    ? `${transaction.lead.firstName ?? ''} ${transaction.lead.lastName ?? ''}`.trim()
    : undefined

  return {
    organizationId: transaction.organizationId,
    currency: transaction.currency,
    customerName: leadName || undefined,
  }
}

/**
 * Look up a Transaction by Stripe Subscription ID and resolve the customer
 * name from the lead relation for subscription payment notifications.
 *
 * @param subscriptionId - Stripe Subscription ID to look up the transaction
 * @returns Object with organizationId, currency, and optional customerName
 */
export async function resolveSubscriptionNotificationData(
  subscriptionId: string
): Promise<PaymentNotificationContext | null> {
  const transaction = await prisma.transaction.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: {
      organizationId: true,
      currency: true,
      lead: { select: { firstName: true, lastName: true } },
    },
  })

  if (!transaction) return null

  const leadName = transaction.lead
    ? `${transaction.lead.firstName ?? ''} ${transaction.lead.lastName ?? ''}`.trim()
    : undefined

  return {
    organizationId: transaction.organizationId,
    currency: transaction.currency,
    customerName: leadName || undefined,
  }
}

/**
 * Resolve a lead's display name from the database by leadId.
 * Used in test mode where lead records ARE created but Transaction records are NOT.
 *
 * @param leadId - The lead ID from Stripe metadata
 * @returns The lead's full name, or undefined if not found
 */
export async function resolveLeadName(leadId: string): Promise<string | undefined> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { firstName: true, lastName: true },
  })

  if (!lead) return undefined

  const name = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim()
  return name || undefined
}
