/**
 * Widget Layout
 *
 * WHY: Minimal layout for embeddable chat widget iframe
 * HOW: No theme provider, transparent background, isolated from main app
 *
 * This layout is completely separate from the main app:
 * - No ThemeProvider (widget manages its own theme from config)
 * - Includes bare RealtimeProvider for live chat functionality (NOT RealtimeProviderWrapper)
 * - Transparent background for iframe embedding
 *
 * IMPORTANT: We use a bare RealtimeProvider instead of RealtimeProviderWrapper because:
 * - RealtimeProviderWrapper includes PermissionSyncProvider, NotificationSyncProvider,
 *   and ClarityIdentifyProvider — all of which call tRPC hooks internally
 * - Those hooks require TRPCReactProvider to be ABOVE them in the tree
 * - The widget is a PUBLIC iframe with no authenticated user, so those sync
 *   providers are unnecessary and would fail with "Unable to find tRPC Context"
 * - This matches the pattern used by ChatWidgetPublicEmbed
 *
 * SOURCE OF TRUTH: WidgetLayout, EmbedLayout
 */

import { TRPCReactProvider } from '@/trpc/react-provider'
import { WidgetRealtimeProvider } from './widget-realtime-provider'

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    /**
     * Widget container must be:
     * - Full viewport size (w-screen h-screen)
     * - Transparent background
     * - No overflow scrolling (widget handles its own scroll)
     */
    <div className="w-screen h-screen bg-transparent overflow-hidden">
      <TRPCReactProvider>
        <WidgetRealtimeProvider>{children}</WidgetRealtimeProvider>
      </TRPCReactProvider>
    </div>
  )
}

export const metadata = {
  title: 'Chat Widget',
  robots: 'noindex, nofollow',
}
