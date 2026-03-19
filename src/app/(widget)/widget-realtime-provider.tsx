/**
 * Widget Realtime Provider
 *
 * WHY: The widget iframe needs RealtimeProvider for live chat SSE connections,
 * but must NOT use RealtimeProviderWrapper which includes PermissionSyncProvider,
 * NotificationSyncProvider, and ClarityIdentifyProvider — all of which call
 * tRPC hooks that require an authenticated user session.
 *
 * HOW: Bare RealtimeProvider with the same SSE config (url, withCredentials,
 * maxReconnectAttempts) used by the main app, but without any auth-dependent
 * sync providers.
 *
 * SOURCE OF TRUTH KEYWORDS: WidgetRealtimeProvider, WidgetSSE
 */

'use client'

import { RealtimeProvider } from '@upstash/realtime/client'

interface WidgetRealtimeProviderProps {
  children: React.ReactNode
}

export function WidgetRealtimeProvider({ children }: WidgetRealtimeProviderProps) {
  return (
    <RealtimeProvider
      api={{
        /**
         * SSE endpoint URL — must be explicit so it resolves correctly
         * regardless of the current page URL (custom domain or preview).
         */
        url: '/api/realtime',
        /**
         * Enable credentials for cross-origin SSE.
         * WHY: Widget runs in an iframe on external sites — SSE connections
         * need CORS credentials to reach our API.
         */
        withCredentials: true,
      }}
      /**
       * Increase reconnection attempts for tunnel/proxy scenarios
       * WHY: Cloudflare tunnels and proxies can timeout SSE connections
       */
      maxReconnectAttempts={50}
    >
      {children}
    </RealtimeProvider>
  )
}
