'use client'

/**
 * Push Notification Prompt
 *
 * SOURCE OF TRUTH KEYWORDS: PushNotificationPrompt, PushPrompt, EnableNotifications
 *
 * WHY: Shows at the top of the notification dropdown when the user hasn't
 * enabled native push notifications yet. This is the most natural place —
 * the user just clicked the bell, they're already thinking about notifications.
 *
 * BEHAVIOR:
 * - Shows when: push is supported + not subscribed
 * - Permission 'default' → "Turn on" button → requests browser permission → subscribes → hides
 * - Permission 'denied' → shows instructions to unblock in browser settings
 *   (this happens when the browser auto-blocks or user accidentally clicked Block)
 * - "X" → saves dismissal to localStorage → hides (only for 'default' state,
 *   denied state always shows so the user knows why push isn't working)
 * - Hidden if already subscribed or browser doesn't support push
 *
 * PLACEMENT: Top of notification-dropdown.tsx, right after the header,
 * before the notification list. Disappears entirely once push is enabled.
 */

import { useState, useEffect } from 'react'
import { BellRing, ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/use-push-notifications'

/** LocalStorage key to track if the user dismissed the prompt */
const DISMISSED_KEY = 'mochi_push_prompt_dismissed'

export function PushNotificationPrompt() {
  const { isSupported, permission, isSubscribed, isLoading, error, subscribe } =
    usePushNotifications()

  /** Whether the user has previously dismissed this prompt */
  const [isDismissed, setIsDismissed] = useState(true) // Default true to prevent flash

  /** Check localStorage on mount to see if user already dismissed */
  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    setIsDismissed(dismissed === 'true')
  }, [])

  /** Dismiss the prompt permanently */
  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setIsDismissed(true)
  }

  /**
   * Enable push and then hide the prompt.
   * Only dismiss if the subscribe actually succeeds — if it fails
   * (e.g. DB save error), the prompt stays so the user can retry.
   */
  const handleEnable = async () => {
    await subscribe()
    /** Check if the subscription actually stuck (isSubscribed updates in the hook) */
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      handleDismiss()
    }
  }

  /**
   * Don't render if:
   * - Browser doesn't support push (no service worker / PushManager / Notification API)
   * - User is already subscribed to push on this device
   */
  if (!isSupported || isSubscribed) {
    return null
  }

  /**
   * If the browser blocked notifications (permission === 'denied'), ALWAYS
   * show the prompt with unblock instructions — even if the user previously
   * dismissed it. They need to know why push isn't working and how to fix it.
   *
   * For 'default' permission (hasn't been asked yet), respect the dismiss.
   */
  const isDenied = permission === 'denied'

  if (isDismissed && !isDenied) {
    return null
  }

  /**
   * DENIED STATE: Browser has blocked notifications for this site.
   * This happens when:
   * - User clicked "Block" on the browser permission dialog
   * - Browser auto-blocked for privacy (common on HTTP or subdomain origins)
   * - Chrome's "Quieter notifications" feature silently denied the request
   *
   * The user MUST manually unblock in browser settings — we can't request
   * permission again programmatically once it's denied.
   */
  if (isDenied) {
    return (
      <div className="flex items-start gap-3 px-4 py-2.5 border-b bg-destructive/5">
        <ShieldAlert className="h-4 w-4 text-destructive/70 flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground/80">
            Notifications blocked
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            Click the lock icon in the address bar, find
            &quot;Notifications&quot;, and set it to &quot;Allow&quot;. Then
            reload the page.
          </p>
        </div>
      </div>
    )
  }

  /**
   * ERROR STATE: Push subscription failed with a specific error.
   * Show the error message so the user knows what went wrong.
   */
  if (error) {
    return (
      <div className="flex items-start gap-3 px-4 py-2.5 border-b bg-destructive/5">
        <ShieldAlert className="h-4 w-4 text-destructive/70 flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground/80">
            Push notifications unavailable
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {error}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  /**
   * DEFAULT STATE: Permission hasn't been requested yet.
   * Show the "Turn on" button that triggers the browser permission dialog.
   */
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30">
      <BellRing className="h-4 w-4 text-muted-foreground flex-shrink-0" />

      <p className="flex-1 text-xs text-muted-foreground">
        Turn on desktop notifications
      </p>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="default"
          size="sm"
          className="h-6 text-xs px-2.5 rounded-md"
          onClick={handleEnable}
          disabled={isLoading}
        >
          {isLoading ? 'Enabling...' : 'Turn on'}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
