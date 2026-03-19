/**
 * ============================================================================
 * NOTIFICATIONS ROUTER - In-App Notification Management
 * ============================================================================
 *
 * tRPC router for managing user notifications within an organization.
 *
 * ALL endpoints are protected via organizationProcedure (requires auth + org membership).
 * No special permission is required — every org member can manage their OWN notifications.
 * Ownership is enforced at the service layer (userId in where clauses).
 *
 * ENDPOINTS:
 * - list: Paginated notification feed with optional unread filter
 * - unreadCount: Lightweight count for the bell badge
 * - markAsRead: Mark a single notification as read (emits realtime)
 * - markAllAsRead: Mark all notifications as read in one shot
 * - delete: Hard delete a single notification (ownership verified)
 *
 * SOURCE OF TRUTH KEYWORDS: NotificationRouter, NotificationTRPC, NotificationAPI
 */

import { z } from 'zod'
import { createTRPCRouter, organizationProcedure } from '../init'
import * as notificationService from '@/services/notification.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for listing notifications.
 * Supports cursor-based pagination and optional unread-only filter.
 */
const listNotificationsSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** Cursor for pagination — ID of the last notification from previous page */
  cursor: z.string().nullish(),
  /** Number of notifications per page (default: 20, max: 100) */
  limit: z.number().min(1).max(100).optional(),
  /** When true, only return unread notifications */
  unreadOnly: z.boolean().optional(),
})

/**
 * Schema for getting unread count.
 * Lightweight — only needs organizationId (userId comes from session).
 */
const unreadCountSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
})

/**
 * Schema for marking a single notification as read.
 */
const markAsReadSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  notificationId: z.string().min(1, 'Notification ID is required'),
})

/**
 * Schema for marking all notifications as read.
 */
const markAllAsReadSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
})

/**
 * Schema for deleting a single notification.
 */
const deleteNotificationSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  notificationId: z.string().min(1, 'Notification ID is required'),
})

// ============================================================================
// ROUTER
// ============================================================================

export const notificationsRouter = createTRPCRouter({
  /**
   * Get a paginated list of notifications for the current user.
   *
   * Uses cursor-based pagination for stability when new notifications arrive.
   * Also returns unreadCount in the same response to power the bell badge
   * without requiring a separate request.
   *
   * @example
   * ```ts
   * const { notifications, nextCursor, unreadCount } = await trpc.notifications.list.query({
   *   organizationId: 'org_xxx',
   *   limit: 20,
   *   unreadOnly: false,
   * })
   * ```
   */
  list: organizationProcedure({})
    .input(listNotificationsSchema)
    .query(async ({ ctx, input }) => {
      return await notificationService.getNotifications({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        cursor: input.cursor ?? undefined,
        limit: input.limit,
        unreadOnly: input.unreadOnly,
      })
    }),

  /**
   * Get the count of unread notifications for the current user.
   *
   * Lightweight count query used by the bell badge icon.
   * Avoids fetching full notification objects just to count them.
   *
   * @example
   * ```ts
   * const count = await trpc.notifications.unreadCount.query({
   *   organizationId: 'org_xxx',
   * })
   * ```
   */
  unreadCount: organizationProcedure({})
    .input(unreadCountSchema)
    .query(async ({ ctx, input }) => {
      return await notificationService.getUnreadCount({
        organizationId: input.organizationId,
        userId: ctx.user.id,
      })
    }),

  /**
   * Mark a single notification as read.
   *
   * Ownership is verified at the service layer — only the notification's
   * recipient can mark it as read. Emits `notifications.read` realtime event
   * so other open tabs/devices stay in sync.
   *
   * @example
   * ```ts
   * await trpc.notifications.markAsRead.mutate({
   *   organizationId: 'org_xxx',
   *   notificationId: 'notif_xxx',
   * })
   * ```
   */
  markAsRead: organizationProcedure({})
    .input(markAsReadSchema)
    .mutation(async ({ ctx, input }) => {
      return await notificationService.markAsRead({
        notificationId: input.notificationId,
        userId: ctx.user.id,
      })
    }),

  /**
   * Mark all unread notifications as read for the current user in this org.
   *
   * Uses updateMany for efficiency — a single DB query regardless of
   * how many unread notifications exist. Returns the count of updated records.
   *
   * @example
   * ```ts
   * const { count } = await trpc.notifications.markAllAsRead.mutate({
   *   organizationId: 'org_xxx',
   * })
   * ```
   */
  markAllAsRead: organizationProcedure({})
    .input(markAllAsReadSchema)
    .mutation(async ({ ctx, input }) => {
      return await notificationService.markAllAsRead({
        organizationId: input.organizationId,
        userId: ctx.user.id,
      })
    }),

  /**
   * Hard delete a single notification.
   *
   * Ownership is verified at the service layer — only the notification's
   * recipient can delete it. Returns true if deleted, false if not found
   * or not owned by the user.
   *
   * WHY hard delete: Per project rules, notifications are ephemeral and
   * use hard delete. No soft delete / deletedAt pattern.
   *
   * @example
   * ```ts
   * const deleted = await trpc.notifications.delete.mutate({
   *   organizationId: 'org_xxx',
   *   notificationId: 'notif_xxx',
   * })
   * ```
   */
  delete: organizationProcedure({})
    .input(deleteNotificationSchema)
    .mutation(async ({ ctx, input }) => {
      return await notificationService.deleteNotification({
        notificationId: input.notificationId,
        userId: ctx.user.id,
      })
    }),
})
