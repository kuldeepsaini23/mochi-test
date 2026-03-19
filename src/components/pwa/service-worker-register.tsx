'use client'

/**
 * Service Worker Registration Component
 *
 * WHY: Registers the service worker (/sw.js) so the browser recognizes
 *      this app as an installable PWA. Without registration, Chrome/Android
 *      won't show the "Add to Home Screen" / install prompt.
 *
 * HOW: Runs once on mount in the browser via useEffect.
 *      Renders nothing (null) — zero visual impact.
 *
 * PLACEMENT: Rendered in the root layout (src/app/layout.tsx) so the
 *            service worker is registered on ALL pages — dashboard,
 *            public website pages, auth pages, etc.
 *
 * CRITICAL: updateViaCache: 'none' tells the browser to ALWAYS fetch sw.js
 *           from the network when checking for updates, bypassing the HTTP cache.
 *           Without this, production deployments may serve a stale service worker
 *           from cache, preventing push notification fixes from taking effect.
 *           (Per official Next.js PWA docs: https://nextjs.org/docs/app/guides/progressive-web-apps)
 *
 * SOURCE OF TRUTH: PWA Service Worker Registration
 */
import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    /* Only register in browsers that support service workers */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((error) => {
          console.error('Service worker registration failed:', error)
        })
    }
  }, [])

  /* Renders nothing — this is a side-effect-only component */
  return null
}
