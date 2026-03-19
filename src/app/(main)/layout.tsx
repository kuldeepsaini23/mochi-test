/**
 * Main App Layout
 *
 * WHY: Layout for the main application routes
 * HOW: Includes providers needed by all routes (Theme, tRPC)
 *
 * This layout wraps all main app routes:
 * - (auth) - Authentication routes
 * - (protected) - Protected dashboard routes
 * - (public) - Public pages
 * - [domain] - Custom domain routes
 * - dashboard, onboarding, sites
 *
 * PERFORMANCE: RealtimeProvider is moved to (protected)/layout.tsx
 *              so auth pages don't establish unnecessary SSE connections.
 *
 * SOURCE OF TRUTH: MainAppLayout
 */

import { TRPCReactProvider } from '@/trpc/react-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { PlatformCurrencyProvider } from '@/components/providers/platform-currency-provider'
import { Toaster } from 'sonner'

export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <TRPCReactProvider>
        {/* Platform currency context for all platform-level monetary displays
         * (SaaS pricing, PAYG costs, wallet top-ups). Must be inside TRPCReactProvider. */}
        <PlatformCurrencyProvider>
          {children}
        </PlatformCurrencyProvider>
      </TRPCReactProvider>
      <Toaster richColors/>
    </ThemeProvider>
  )
}
