/**
 * Web Push Notification Service
 *
 * SOURCE OF TRUTH KEYWORDS: PushService, WebPush, PushSubscription,
 *   SendPush, PushNotification, PWANotification
 *
 * WHY: Manages web push subscriptions and sends native push notifications
 * to users' devices. This enables PWA users to receive notifications even
 * when the app is closed or backgrounded — critical for mobile PWA UX.
 *
 * HOW: Uses the Web Push API (RFC 8030) via the `web-push` library.
 * VAPID (Voluntary Application Server Identification) keys authenticate
 * the server to push services (Google FCM, Apple APNs, Mozilla autopush).
 *
 * ARCHITECTURE:
 * - Subscribe: Client calls PushManager.subscribe() → sends subscription to server → stored in DB
 * - Send: Server queries subscriptions for user → sends push via web-push library → SW shows notification
 * - Cleanup: Expired/invalid subscriptions are automatically removed on send failure
 *
 * TRIGGER.DEV COMPATIBLE: All operations are HTTP-based (Prisma + web-push),
 * so this works from both Next.js server context and Trigger.dev cloud tasks.
 */

import 'server-only'

import webpush from 'web-push'
import { prisma } from '@/lib/config'

// ============================================================================
// VAPID CONFIGURATION
// ============================================================================

/**
 * VAPID keys for Web Push authentication.
 *
 * WHY VAPID: Push services (FCM, APNs) require the server to identify itself.
 * VAPID keys prove that push messages come from our server, not an impersonator.
 *
 * SETUP: Generate keys with `npx web-push generate-vapid-keys` and set env vars.
 * If keys are missing, push sending is a no-op (in-app notifications still work).
 */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:noreply@quaacko.com'

/** Whether VAPID keys are configured — push is disabled without them */
const isPushConfigured = VAPID_PUBLIC_KEY.length > 0 && VAPID_PRIVATE_KEY.length > 0

if (isPushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for saving a push subscription from the client.
 *
 * SOURCE OF TRUTH: SavePushSubscriptionInput
 */
export interface SavePushSubscriptionInput {
  organizationId: string
  userId: string
  /** The push service endpoint URL from PushSubscription.endpoint */
  endpoint: string
  /** The p256dh key from PushSubscription.getKey('p256dh') — base64url encoded */
  p256dh: string
  /** The auth key from PushSubscription.getKey('auth') — base64url encoded */
  auth: string
}

/**
 * Payload sent in a web push notification.
 * The service worker parses this JSON to show the native notification.
 *
 * SOURCE OF TRUTH: PushNotificationPayload
 */
export interface PushNotificationPayload {
  title: string
  body: string
  /** Icon shown in the notification (falls back to app icon) */
  icon?: string
  /** Badge icon for Android status bar */
  badge?: string
  /** URL to open when notification is clicked */
  url?: string
  /** Notification category tag for grouping/replacing */
  tag?: string
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Save or update a push subscription for a user.
 *
 * Uses upsert keyed on `endpoint` alone because one device/browser
 * can only have ONE push subscription. When a different user logs in
 * on the same device, the record is updated to point to the new user.
 *
 * WHY endpoint-only: On account switch (sign out → sign in as different user),
 * the browser push subscription stays the same (same endpoint). If we keyed
 * on [userId, endpoint], the old user's record would stay stale and the new
 * user would create a duplicate — causing notifications to go to the wrong account.
 */
export async function savePushSubscription(input: SavePushSubscriptionInput) {
  /**
   * Find existing subscription by endpoint first, then upsert by id.
   * The generated Prisma client uses a compound unique [userId, endpoint],
   * but we need to key on endpoint alone because the same browser/device
   * always produces the same endpoint — even after account switch.
   */
  const existing = await prisma.pushSubscription.findFirst({
    where: { endpoint: input.endpoint },
    select: { id: true },
  })

  if (existing) {
    /** Update existing record — transfers ownership on account switch */
    return prisma.pushSubscription.update({
      where: { id: existing.id },
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
      },
    })
  }

  /** No existing subscription for this endpoint — create a new record */
  return prisma.pushSubscription.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    },
  })
}

/**
 * Remove a push subscription when the user unsubscribes.
 *
 * WHY by endpoint: The endpoint uniquely identifies a browser's push
 * subscription. When unsubscribing, the client sends its endpoint so
 * we can remove the matching record.
 */
export async function removePushSubscription(userId: string, endpoint: string) {
  return prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  })
}

// ============================================================================
// PUSH SENDING
// ============================================================================

/**
 * Send a web push notification to ALL subscribed devices for a single user.
 *
 * Flow:
 * 1. Query all PushSubscription records for this user in this org
 * 2. Send push to each subscription in parallel
 * 3. Automatically delete expired/invalid subscriptions (410 Gone)
 *
 * WHY fire-and-forget: Push delivery is best-effort. A failed push should
 * never block in-app notification creation. The caller wraps this in try-catch.
 *
 * TRIGGER.DEV COMPATIBLE: Uses web-push (HTTP to push services) + Prisma (HTTP to DB).
 */
export async function sendPushToUser(
  organizationId: string,
  userId: string,
  payload: PushNotificationPayload
) {
  if (!isPushConfigured) {
    console.warn('[Push] VAPID keys not configured — skipping push send')
    return
  }

  /** Fetch all subscriptions for this user in this org */
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { organizationId, userId },
  })

  if (subscriptions.length === 0) {
    console.info('[Push] No subscriptions found for user', userId)
    return
  }

  console.info('[Push] Sending to', subscriptions.length, 'device(s) for user', userId)

  /** JSON payload that the service worker will parse */
  const pushPayload = JSON.stringify(payload)

  /**
   * Send to all devices in parallel.
   * Use allSettled so one failed device doesn't block the others.
   */
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload
        )
      } catch (error: unknown) {
        /**
         * 410 Gone = subscription expired (user cleared browser data, uninstalled app, etc.)
         * 404 Not Found = subscription endpoint no longer exists
         * In both cases, clean up the stale subscription record.
         */
        const statusCode = (error as { statusCode?: number })?.statusCode
        if (statusCode === 410 || statusCode === 404) {
          console.info('[Push] Removing expired subscription', sub.id)
          await prisma.pushSubscription.deleteMany({
            where: { id: sub.id },
          })
        } else {
          console.error('[Push] Send failed for subscription', sub.id, '→ status:', statusCode, error)
        }
      }
    })
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  console.info('[Push] Sent', sent, '/', results.length, 'push notifications')
  return { sent }
}

/**
 * Send web push notifications to multiple users at once.
 *
 * Used by createBulkNotifications to push to all recipients after
 * bulk-inserting in-app notification records.
 *
 * WHY separate from sendPushToUser: Avoids N sequential queries when
 * notifying an entire team. Fetches all subscriptions in one query,
 * then fans out push sends in parallel.
 */
export async function sendPushToUsers(
  organizationId: string,
  userIds: string[],
  payload: PushNotificationPayload
) {
  if (!isPushConfigured || userIds.length === 0) return

  /** Fetch all subscriptions for all target users in one query */
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      organizationId,
      userId: { in: userIds },
    },
  })

  if (subscriptions.length === 0) return

  const pushPayload = JSON.stringify(payload)

  /** Fan out pushes to all devices for all users in parallel */
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload
        )
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number })?.statusCode
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.deleteMany({
            where: { id: sub.id },
          })
        }
      }
    })
  )
}
