/**
 * Push Notification Subscription Hook
 *
 * SOURCE OF TRUTH KEYWORDS: UsePushNotifications, PushSubscriptionHook,
 *   PWAPushHook, WebPushHook
 *
 * WHY: Manages the full lifecycle of web push notification subscriptions
 * on the client side. Handles permission requests, PushManager subscription,
 * and syncing the subscription with the server via tRPC.
 *
 * FLOW:
 * 1. Check if push is supported in this browser
 * 2. Check current notification permission state
 * 3. On subscribe: request permission → PushManager.subscribe() → save to server
 * 4. On unsubscribe: PushManager.unsubscribe() → remove from server
 *
 * STALE SUBSCRIPTION HANDLING:
 * If the VAPID key changed or the subscription was created on a different
 * domain, PushManager.subscribe() throws "Registration failed - push service error".
 * The subscribe function automatically clears any stale subscription and retries once.
 *
 * USAGE:
 * ```tsx
 * const { isSupported, permission, isSubscribed, subscribe, unsubscribe, error } = usePushNotifications()
 *
 * if (isSupported && permission !== 'denied') {
 *   <Button onClick={isSubscribed ? unsubscribe : subscribe}>
 *     {isSubscribed ? 'Disable' : 'Enable'} Push Notifications
 *   </Button>
 * }
 * ```
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert a base64 string to a Uint8Array.
 *
 * WHY: The PushManager.subscribe() API requires the applicationServerKey
 * as a Uint8Array, but VAPID public keys are stored as base64 strings.
 * This converts between the two formats.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Convert an ArrayBuffer to a base64url string.
 *
 * WHY: PushSubscription.getKey() returns ArrayBuffer, but we need to
 * send the keys as base64url strings to the server for storage.
 */
function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Check if the current page is in a secure context (HTTPS or localhost).
 *
 * WHY: Web Push API requires a secure context. On HTTP (non-localhost),
 * PushManager.subscribe() will always fail. We detect this early to
 * show a helpful error instead of a cryptic browser exception.
 */
function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false
  /** window.isSecureContext is the standard browser check */
  return window.isSecureContext
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook return type — everything the component needs to manage push subscriptions.
 *
 * SOURCE OF TRUTH: PushNotificationState
 */
interface PushNotificationState {
  /** Whether the browser supports push notifications */
  isSupported: boolean
  /** Current notification permission: 'default' | 'granted' | 'denied' */
  permission: NotificationPermission
  /** Whether the user is currently subscribed to push on this device */
  isSubscribed: boolean
  /** Whether a subscribe/unsubscribe operation is in progress */
  isLoading: boolean
  /** User-facing error message from the last subscribe/unsubscribe attempt */
  error: string | null
  /** Subscribe to push notifications (requests permission if needed) */
  subscribe: () => Promise<void>
  /** Unsubscribe from push notifications on this device */
  unsubscribe: () => Promise<void>
}

export function usePushNotifications(): PushNotificationState {
  const { activeOrganization } = useActiveOrganization()

  /** Whether the browser supports push */
  const [isSupported, setIsSupported] = useState(false)
  /** Current notification permission state */
  const [permission, setPermission] = useState<NotificationPermission>('default')
  /** Whether a PushSubscription currently exists for this browser */
  const [isSubscribed, setIsSubscribed] = useState(false)
  /** Loading state for subscribe/unsubscribe operations */
  const [isLoading, setIsLoading] = useState(false)
  /** User-facing error from the last subscribe/unsubscribe attempt */
  const [error, setError] = useState<string | null>(null)

  /** tRPC mutations for server-side subscription management */
  const subscribeMutation = trpc.pushSubscriptions.subscribe.useMutation()
  const unsubscribeMutation = trpc.pushSubscriptions.unsubscribe.useMutation()

  /**
   * On mount (and when user/org changes), check browser support and
   * re-register the existing subscription for the current user.
   *
   * WHY re-register on every mount: When a user signs out and a different
   * user signs in on the same device (PWA), the browser push subscription
   * stays the same but the DB record still points to the old user.
   * By silently calling subscribe on mount, we upsert by endpoint and
   * transfer ownership to the current user — fixing the account switch bug.
   */
  useEffect(() => {
    const checkAndSync = async () => {
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window

      setIsSupported(supported)

      if (!supported) return

      setPermission(Notification.permission)

      /** Check if there's an existing push subscription */
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      setIsSubscribed(!!existing)

      /**
       * Silent re-register: if the browser has a push subscription AND
       * the user is logged in, re-send it to the server so the DB record
       * points to the current user (handles account switch).
       */
      if (existing && activeOrganization?.id && Notification.permission === 'granted') {
        const p256dh = arrayBufferToBase64(existing.getKey('p256dh'))
        const auth = arrayBufferToBase64(existing.getKey('auth'))

        try {
          await subscribeMutation.mutateAsync({
            organizationId: activeOrganization.id,
            endpoint: existing.endpoint,
            p256dh,
            auth,
          })
        } catch {
          /** Silent — don't block UI if re-register fails */
        }
      }
    }

    checkAndSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id])

  /**
   * Core push subscription logic — separated so the retry path can reuse it.
   *
   * @param registration - The active ServiceWorkerRegistration
   * @param vapidKey - The VAPID public key as Uint8Array
   * @returns The PushSubscription on success
   */
  const attemptPushSubscribe = useCallback(
    async (registration: ServiceWorkerRegistration, vapidKey: Uint8Array) => {
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey as BufferSource,
      })
    },
    []
  )

  /**
   * Subscribe to push notifications.
   *
   * Flow:
   * 1. Check secure context (HTTPS or localhost required)
   * 2. Request notification permission from the user
   * 3. Subscribe via PushManager with our VAPID public key
   * 4. If subscribe fails (stale subscription), clear old subscription and retry ONCE
   * 5. Extract endpoint + keys from the subscription
   * 6. Send to server via tRPC to persist in PushSubscription table
   *
   * WHY THE RETRY:
   * "Registration failed - push service error" happens when there's a stale
   * push subscription from a different VAPID key or domain. The browser's push
   * service (FCM/Mozilla) rejects the new subscription because it conflicts.
   * Clearing the old subscription and re-subscribing fixes it.
   */
  const subscribe = useCallback(async () => {
    if (!isSupported || !activeOrganization?.id) return

    setIsLoading(true)
    setError(null)

    try {
      /**
       * Step 0: Check if we're in a secure context.
       * Web Push requires HTTPS or localhost. On HTTP (e.g., mochi.test:3000),
       * PushManager.subscribe() will always fail with a cryptic browser error.
       */
      if (!isSecureContext()) {
        setError('Push notifications require HTTPS or localhost. Use localhost:3000 for local testing.')
        setIsLoading(false)
        return
      }

      /** Step 1: Request permission (shows browser prompt if 'default') */
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') {
        setIsLoading(false)
        return
      }

      /** Step 2: Get service worker registration and VAPID key */
      const registration = await navigator.serviceWorker.ready
      const vapidKeyString = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

      if (!vapidKeyString) {
        setError('Push notifications not configured. VAPID key is missing.')
        console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — push subscription skipped')
        setIsLoading(false)
        return
      }

      const vapidKey = urlBase64ToUint8Array(vapidKeyString)

      /** Step 3: Subscribe via PushManager (with retry on stale subscription) */
      let subscription: PushSubscription

      try {
        subscription = await attemptPushSubscribe(registration, vapidKey)
      } catch (firstError) {
        /**
         * RETRY: If the first attempt fails, it's likely a stale subscription
         * from a different VAPID key, domain, or browser state. Clear it and retry.
         *
         * Common causes:
         * - VAPID key was regenerated (dev iteration)
         * - Subscription was created on a different origin (mochi.test vs localhost)
         * - Browser push service state is corrupted
         */
        console.warn('Push subscribe failed, clearing stale subscription and retrying:', firstError)

        try {
          const existingSub = await registration.pushManager.getSubscription()
          if (existingSub) {
            await existingSub.unsubscribe()
            console.log('Cleared stale push subscription, retrying...')
          }

          subscription = await attemptPushSubscribe(registration, vapidKey)
        } catch (retryError) {
          /**
           * Both attempts failed — surface a user-friendly error.
           * The most common remaining cause is the push service itself being
           * unreachable or the VAPID key being fundamentally invalid.
           */
          const errorMessage =
            retryError instanceof Error ? retryError.message : 'Unknown error'
          console.error('Push subscription failed after retry:', retryError)
          setError(`Push registration failed: ${errorMessage}`)
          setIsLoading(false)
          return
        }
      }

      /** Step 4: Extract keys for server storage */
      const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'))
      const auth = arrayBufferToBase64(subscription.getKey('auth'))

      /** Step 5: Save to server */
      await subscribeMutation.mutateAsync({
        organizationId: activeOrganization.id,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
      })

      setIsSubscribed(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('Push subscription failed:', err)
      setError(`Failed to enable notifications: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, activeOrganization?.id, subscribeMutation, attemptPushSubscribe])

  /**
   * Unsubscribe from push notifications.
   *
   * Flow:
   * 1. Get the current PushSubscription from the browser
   * 2. Unsubscribe via PushManager (tells the push service to stop sending)
   * 3. Remove from server via tRPC
   */
  const unsubscribe = useCallback(async () => {
    if (!isSupported) return

    setIsLoading(true)
    setError(null)

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        /** Tell push service to stop sending to this endpoint */
        await subscription.unsubscribe()

        /** Remove from our server */
        await unsubscribeMutation.mutateAsync({
          endpoint: subscription.endpoint,
        })
      }

      setIsSubscribed(false)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('Push unsubscribe failed:', err)
      setError(`Failed to disable notifications: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, unsubscribeMutation])

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  }
}
