/**
 * Send Notification Helpers
 *
 * SOURCE OF TRUTH KEYWORDS: SendNotification, NotifyAllMembers, NotifyMembers,
 *   NotificationHelper, ServerNotification
 *
 * WHY: Convenience wrappers around the notification service so that any feature
 * in the app can send notifications with a single import. These helpers handle
 * the common patterns (single user, all org members, specific members) without
 * requiring callers to know about the underlying service details.
 *
 * HOW: Each function maps the typed NotificationPayload/BulkNotificationPayload
 * to the service's CreateNotificationInput/CreateBulkNotificationsInput and
 * delegates to the service layer for DB insert + realtime emit.
 *
 * IMPORTANT: This is a server-only file. It imports from the notification service
 * which uses Prisma and realtime — neither of which work in client components.
 *
 * USAGE:
 * ```ts
 * import { sendNotification, notifyAllMembers } from '@/lib/notifications/send-notification'
 *
 * // Single user
 * await sendNotification({
 *   organizationId: 'org_123',
 *   userId: 'user_456',
 *   title: 'Payment received',
 *   body: '$99.00 from John Doe',
 *   category: 'payment',
 *   actionUrl: '/payments/txn_789',
 * })
 *
 * // All org members
 * await notifyAllMembers({
 *   organizationId: 'org_123',
 *   title: 'New lead',
 *   body: 'Jane Smith submitted a form',
 *   category: 'lead',
 * })
 * ```
 */

import 'server-only'

import {
  createNotification,
  createBulkNotifications,
} from '@/services/notification.service'
import { getAllMemberUserIds } from '@/services/membership.service'
import type { NotificationPayload, BulkNotificationPayload } from './types'

// ============================================================================
// SINGLE USER
// ============================================================================

/**
 * Send a notification to a single user.
 *
 * This is the simplest helper — maps a typed NotificationPayload directly
 * to the notification service's createNotification function.
 *
 * @param params - Typed notification payload with enforced NotificationCategory
 * @returns The created notification record
 */
export async function sendNotification(
  params: NotificationPayload
) {
  return createNotification({
    organizationId: params.organizationId,
    userId: params.userId,
    title: params.title,
    body: params.body,
    category: params.category,
    actionUrl: params.actionUrl ?? null,
  })
}

// ============================================================================
// ALL ORG MEMBERS
// ============================================================================

/**
 * Send a notification to ALL members of an organization.
 *
 * Flow:
 * 1. Query all member userIds for the given organization
 * 2. Early return if the org has no members (shouldn't happen, but safe)
 * 3. Delegate to createBulkNotifications for efficient bulk insert + realtime
 *
 * WHY fetch members here instead of requiring callers to pass userIds:
 * Most org-wide notifications don't have a pre-fetched member list. This helper
 * encapsulates the member lookup so callers don't need to import Prisma directly.
 *
 * @param params - Notification content (no userId — targets all members)
 * @returns Object with count of notifications created
 */
export async function notifyAllMembers(
  params: BulkNotificationPayload
) {
  // Fetch all member userIds for this organization
  // Delegates to membership.service.ts for database access (DAL pattern)
  const members = await getAllMemberUserIds(params.organizationId)

  // Extract unique userIds — a user should only get one notification
  const userIds = members.map((m) => m.userId)

  // Guard: if there are no members, nothing to send
  if (userIds.length === 0) {
    return { count: 0 }
  }

  return createBulkNotifications({
    organizationId: params.organizationId,
    userIds,
    title: params.title,
    body: params.body,
    category: params.category,
    actionUrl: params.actionUrl ?? null,
  })
}

// ============================================================================
// SPECIFIC MEMBERS
// ============================================================================

/**
 * Send a notification to a specific set of users in an organization.
 *
 * Useful when you know exactly which users should be notified (e.g., only
 * the assigned team member, or a subset of users with a certain role).
 *
 * @param params - Notification content plus the target userIds
 * @returns Object with count of notifications created
 */
export async function notifyMembers(
  params: BulkNotificationPayload & { userIds: string[] }
) {
  // Guard: if no userIds provided, nothing to send
  if (params.userIds.length === 0) {
    return { count: 0 }
  }

  return createBulkNotifications({
    organizationId: params.organizationId,
    userIds: params.userIds,
    title: params.title,
    body: params.body,
    category: params.category,
    actionUrl: params.actionUrl ?? null,
  })
}
