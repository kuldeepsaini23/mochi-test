/**
 * Service Worker for Mochi PWA
 *
 * WHY: A registered service worker is REQUIRED by Chrome/Android for PWA
 *      installability ("Add to Home Screen"). Without it, the install prompt
 *      will never appear.
 *
 * FEATURES:
 * - Instant activation (skipWaiting + clients.claim)
 * - Web Push notification handling (shows native notifications from server)
 * - Notification click handling (opens the app to the relevant URL)
 *
 * CACHING STRATEGY: Network-only (no caching).
 *   Mochi is a SaaS platform that requires live data (leads, payments,
 *   automations, chat). Stale cached data would cause bugs and confusion.
 *   The browser's default HTTP cache already handles static assets (/_next/static).
 *
 * LIFECYCLE:
 *   - install:  skipWaiting() → activate immediately without waiting for tabs to close
 *   - activate: clients.claim() → take control of all open tabs immediately
 */

/* Immediately activate the service worker on install */
self.addEventListener('install', () => {
  self.skipWaiting()
})

/* Claim all open clients immediately on activation */
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/*
 * ────────────────────────────────────────────────────
 * PUSH NOTIFICATIONS
 * ────────────────────────────────────────────────────
 *
 * Receives push events from the server (via web-push library) and
 * shows a native browser notification to the user.
 *
 * IMPORTANT — ALWAYS call showNotification():
 * Chrome REQUIRES that every push event results in a showNotification()
 * call. If we skip it (e.g., because the app tab is focused), Chrome will:
 *   1. Show a generic "This site has been updated in the background" notification
 *   2. Throttle or REVOKE push permission after repeated violations
 * This was the root cause of push notifications not working in production.
 *
 * The in-app Sonner toast from the Upstash SSE realtime channel is a
 * SEPARATE delivery mechanism. Both can fire at the same time — this is
 * how Stripe, Slack, Discord, etc. all handle notifications.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return

  /** Parse the JSON payload sent by our server */
  const data = event.data.json()

  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    /** Store the target URL so notificationclick can navigate to it */
    data: { url: data.url || '/' },
    /** Tag for notification grouping — same tag replaces previous notification */
    tag: data.tag || undefined,
    /**
     * renotify: true tells the browser to alert the user even when a
     * notification with the same tag already exists. Without this,
     * replacing a tagged notification is silent (no sound/vibration).
     */
    renotify: !!data.tag,
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Mochi', options)
  )
})

/*
 * Handle notification click — open or focus the app at the target URL.
 *
 * Flow:
 * 1. Close the notification
 * 2. Check if the app is already open in a tab
 * 3. If yes, focus that tab and navigate to the URL
 * 4. If no, open a new window/tab with the URL
 *
 * WHY matchAll + focus: On mobile PWA, clicking a notification should
 * bring the existing app to the foreground rather than opening a new tab.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      /** Try to focus an existing app window */
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(targetUrl)
          return
        }
      }
      /** No existing window — open a new one */
      return self.clients.openWindow(targetUrl)
    })
  )
})
