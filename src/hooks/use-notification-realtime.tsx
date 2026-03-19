/**
 * Notification Realtime Sync Hook
 *
 * SOURCE OF TRUTH KEYWORDS: NotificationRealtime, NotificationSync,
 *   NotificationRealtimeHook, UseNotificationRealtime
 *
 * WHY: Listens for realtime notification events so the UI can update instantly
 * when a new notification arrives or when a notification is marked as read.
 * Without this, the user would only see new notifications on their next page
 * load or manual refresh.
 *
 * HOW: Subscribes to `notifications.created` and `notifications.read` events
 * via the Upstash realtime client, then invalidates the tRPC notification
 * cache so React Query refetches the notification list and unread count.
 *
 * FILTERING: Each `notifications.created` event includes a `userId` field.
 * The hook only processes events for the CURRENT user — otherwise a bulk
 * notification to 10 org members would show 10 toasts for every member.
 *
 * TOASTS: Payment notifications get a special Stripe-style card toast with
 * the app icon and cha-ching sound. All other categories use the standard toast.
 *
 * EVENTS HANDLED:
 * - notifications.created: New notification for THIS user — invalidate list + show toast
 * - notifications.read: A notification was marked as read (from another tab/device)
 *
 * PATTERN: Follows the same structure as use-permission-sync.ts
 *
 * USAGE: Added once in RealtimeProviderWrapper via NotificationSyncProvider.
 * Do NOT add this hook in multiple components — it would cause duplicate processing.
 */

'use client'

import { useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useRealtime } from '@/lib/realtime-client'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { getCategorySound } from '@/lib/notifications/category-sounds'

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to sync notifications in realtime across all dashboard pages.
 *
 * Listens for notification events and invalidates the tRPC cache so the
 * notification bell, dropdown, and list components update automatically.
 *
 * Filters events by userId so only notifications for the current user
 * trigger toasts and cache invalidation — prevents duplicate toasts when
 * bulk notifications are sent to multiple org members.
 */
export function useNotificationRealtime() {
  const utils = trpc.useUtils()

  /**
   * Get current user from cached profile data.
   * Same pattern as use-permission-sync.ts — uses tRPC instead of session atom.
   */
  const { data: user } = trpc.user.getProfile.useQuery(undefined, {
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const userId = user?.id

  /**
   * Track last processed event to prevent duplicate processing.
   * SSE can sometimes deliver the same event multiple times on reconnection.
   */
  const lastProcessedRef = useRef<string>('')
  /*aasdasd*/

  /**
   * Subscribe to notification-related realtime events.
   *
   * CRITICAL: Filter `notifications.created` by userId so we only show
   * toasts for notifications meant for THIS user. Without this filter,
   * a Send Notification to 4 org members = 4 toasts for every member.
   */
  useRealtime({
    events: ['notifications.created', 'notifications.read'],
    onData({ event, data }) {
      /** Skip if no user session yet */
      if (!userId) return

      /** Deduplicate — SSE can redeliver events on reconnect */
      const eventId = `${event}-${JSON.stringify(data)}`
      if (lastProcessedRef.current === eventId) return
      lastProcessedRef.current = eventId

      if (event === 'notifications.created') {
        /**
         * New notification received.
         *
         * Only process if this event is for the CURRENT user.
         * Upstash broadcasts to all clients — we filter client-side.
         */
        if (data.userId !== userId) return

        utils.notifications.invalidate()

        /**
         * Payment-specific: invalidate all payment-related data so the
         * dashboard revenue charts, transactions list, and orders list
         * update in realtime when a payment comes through.
         */
        if (data.category === 'payment') {
          utils.dashboard.getRecurringRevenue.invalidate()
          utils.dashboard.getTotalRevenue.invalidate()
          utils.dashboard.getSalesBreakdown.invalidate()
          utils.dashboard.getSummary.invalidate()
          utils.transactions.invalidate()
          utils.orders.invalidate()
        }

        /**
         * Show category-specific toast.
         * Payment notifications get a Stripe-style card with the app icon.
         * All other categories use the standard Sonner toast.
         */
        if (data.category === 'payment') {
          toast.custom(
            (id) => (
              <div
                className="flex items-start gap-3 w-[356px] p-3 rounded-xl bg-background border shadow-lg"
                role="alert"
              >
                {/* App icon — rounded like a native notification */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/icon-192x192.png"
                  alt="Mochi"
                  width={40}
                  height={40}
                  className="rounded-lg flex-shrink-0"
                />

                {/* Content: title + body */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {data.title}
                    </p>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      just now
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                    {data.body}
                  </p>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => toast.dismiss(id)}
                  className="flex-shrink-0 p-0.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
            { duration: 6000 }
          )
        } else {
          toast(data.title, {
            description: data.body,
            duration: 5000,
          })
        }

        /** Play the category-specific notification sound (if one is configured) */
        const soundUrl = getCategorySound(data.category)
        if (soundUrl) {
          new Audio(soundUrl).play().catch(() => {})
        }
      } else if (event === 'notifications.read') {
        /**
         * Notification marked as read (from another tab or device).
         *
         * Just invalidate the cache — no toast needed for read events.
         * This keeps the unread count badge and read/unread styling in sync
         * across all open tabs.
         */
        utils.notifications.invalidate()
      }
    },
  })

  /**
   * Clear last processed ref when userId changes
   * (e.g., when user signs out and back in)
   */
  useEffect(() => {
    lastProcessedRef.current = ''
  }, [userId])
}
