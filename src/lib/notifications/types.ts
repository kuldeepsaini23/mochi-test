/**
 * Notification Types
 *
 * SOURCE OF TRUTH KEYWORDS: NotificationCategory, NotificationPayload,
 *   NotificationTypes, NotificationCategoryUnion
 *
 * WHY: Defines the canonical category type and payload interface used throughout
 * the notification system. Every feature that sends or displays notifications
 * imports from here to ensure type consistency.
 *
 * CATEGORIES:
 * - payment: Stripe payment events (completed, failed, refunded)
 * - lead: New lead creation, lead updates, form submissions
 * - automation: Automation triggers fired, workflow completions
 * - form: Form submission events
 * - appointment: Calendar bookings, cancellations, reminders
 * - contract: Contract sent, viewed, signed
 * - invoice: Invoice sent, paid, overdue
 * - system: Platform-level announcements, billing, limits
 * - inbox: New messages, email received, chat messages
 * - pipeline: Pipeline ticket created, moved, completed
 */

// ============================================================================
// CATEGORY TYPE
// ============================================================================

/**
 * All valid notification categories.
 *
 * This union type is the SINGLE SOURCE OF TRUTH for notification grouping.
 * The notification service stores this as a string in the DB, but every
 * caller should use this type for compile-time safety.
 *
 * SOURCE OF TRUTH: NotificationCategory, NotificationCategoryType
 */
export type NotificationCategory =
  | 'payment'
  | 'lead'
  | 'automation'
  | 'form'
  | 'appointment'
  | 'contract'
  | 'invoice'
  | 'system'
  | 'inbox'
  | 'pipeline'

// ============================================================================
// PAYLOAD INTERFACE
// ============================================================================

/**
 * Typed payload for creating a notification.
 *
 * This is the external-facing interface that feature code uses when calling
 * the sendNotification helpers. It mirrors CreateNotificationInput from the
 * service but enforces NotificationCategory instead of raw string.
 *
 * SOURCE OF TRUTH: NotificationPayload, NotificationSendPayload
 */
export interface NotificationPayload {
  /** The organization this notification belongs to */
  organizationId: string
  /** The target user who will receive this notification */
  userId: string
  /** Short headline shown in the notification list */
  title: string
  /** Longer description / detail text */
  body: string
  /** Category for grouping/filtering — must be a valid NotificationCategory */
  category: NotificationCategory
  /** Optional deep-link URL for click-through navigation */
  actionUrl?: string
}

// ============================================================================
// BULK PAYLOAD INTERFACE
// ============================================================================

/**
 * Typed payload for sending a notification to multiple users.
 *
 * Used by notifyAllMembers and notifyMembers helpers.
 * Omits `userId` since it targets multiple users via `userIds`.
 *
 * SOURCE OF TRUTH: BulkNotificationPayload, NotificationBulkSendPayload
 */
export interface BulkNotificationPayload {
  /** The organization this notification belongs to */
  organizationId: string
  /** Short headline shown in the notification list */
  title: string
  /** Longer description / detail text */
  body: string
  /** Category for grouping/filtering — must be a valid NotificationCategory */
  category: NotificationCategory
  /** Optional deep-link URL for click-through navigation */
  actionUrl?: string
}
