/**
 * Web App Manifest for Mochi PWA
 *
 * WHY: Enables "Add to Home Screen" and native-like app experience on
 *      mobile and desktop devices. Defines app name, icons, colors, and
 *      display behavior.
 *
 * HOW: Next.js 16 serves this as a special cached Route Handler at
 *      /manifest.webmanifest and automatically injects a <link rel="manifest">
 *      tag in the HTML <head>.
 *
 * MULTI-TENANT NOTE:
 *   start_url: '/' is relative to the current origin. When installed from
 *   acme.mochi.test → opens acme.mochi.test/
 *   When installed from a custom domain → opens that domain's root.
 *   Each tenant's installed PWA opens their own workspace automatically.
 *
 * ICONS:
 *   Icons are placeholder PNGs in public/icons/. To replace them, drop in
 *   your own PNGs with the same file names and sizes, or re-run:
 *     node scripts/generate-pwa-icons.mjs
 *
 * SOURCE OF TRUTH: PWA Manifest Configuration
 */
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mochi',
    short_name: 'Mochi',
    description: 'All-in-one business management platform',
    start_url: '/',
    display: 'standalone',
    /* zinc-950 — matches the app's dark theme body background */
    background_color: '#09090b',
    /* zinc-950 — controls status bar / address bar color on mobile */
    theme_color: '#09090b',
    orientation: 'any',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-maskable-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
