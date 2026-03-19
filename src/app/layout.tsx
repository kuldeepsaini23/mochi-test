/**
 * Root Layout
 *
 * WHY: Minimal root layout shared by all routes
 * HOW: Only includes html, body, fonts, global CSS, and PWA service worker registration
 *
 * Route-specific providers are in:
 * - (main)/layout.tsx - Main app with ThemeProvider, Realtime, tRPC
 * - (widget)/layout.tsx - Minimal layout for embeddable widget
 *
 * PWA: The ServiceWorkerRegister component is placed here so the service worker
 *      is registered on ALL pages (dashboard, public website, auth, widget).
 *      The manifest.ts file in this same directory provides the web app manifest.
 *
 * SOURCE OF TRUTH: RootLayout
 */

import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'
import { ClarityProvider } from '@/components/clarity-provider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

/**
 * Global Metadata for Mochi
 *
 * WHY: Provides default title, description, and PWA-related meta tags.
 * HOW: Next.js merges this with page-specific metadata via the metadata API.
 *      The manifest link is automatically injected by Next.js because
 *      src/app/manifest.ts exists — no need to add it manually.
 *
 * SOURCE OF TRUTH: Global App Metadata
 */
export const metadata: Metadata = {
  title: {
    default: 'Mochi',
    template: '%s | Mochi',
  },
  description: 'All-in-one business management platform',
  applicationName: 'Mochi',
  /* iOS PWA configuration — enables standalone mode on Apple devices */
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mochi',
  },
  /* Prevents iOS from auto-detecting phone numbers as links */
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

/**
 * Viewport Configuration
 *
 * WHY: Controls the viewport behavior and theme color for PWA.
 * HOW: Next.js 16 exports viewport separately from metadata.
 *
 * Key settings for native app feel:
 * - width=device-width, initial-scale=1: Standard responsive viewport
 * - maximumScale=1, userScalable=false: Prevents zoom on input focus (native behavior)
 * - themeColor: The browser fills the notch / status bar / home indicator
 *   areas with this color automatically. This creates a clean, seamless
 *   border that matches the dark theme — no CSS env() hacks needed.
 *
 * NOTE: We intentionally do NOT use viewportFit='cover' here.
 *   'cover' extends content behind the notch, requiring manual safe-area
 *   padding on every layout. Instead, we let the browser handle it — it
 *   fills those areas with themeColor, keeping headers visible and clean.
 *
 * SOURCE OF TRUTH: Global Viewport Configuration
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {/* PWA: Registers the service worker for installability */}
        <ServiceWorkerRegister />
        {/* Microsoft Clarity: Session recordings, heatmaps, and behavioral analytics */}
        <ClarityProvider />
        {children}
      </body>
    </html>
  )
}
