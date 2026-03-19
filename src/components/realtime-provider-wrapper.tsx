'use client'

/**
 * Realtime Provider Wrapper
 *
 * WHY: RealtimeProvider from @upstash/realtime uses React context which requires 'use client'
 * HOW: Wraps children with RealtimeProvider in a client component
 *
 * FEATURES:
 * - Provides realtime SSE connection for all events
 * - Automatically syncs permissions when roles/permissions change
 * - Handles member removal with redirect to prevent access denied errors
 * - Automatically syncs notifications when new ones arrive or are read
 *
 * CONFIGURATION:
 * - withCredentials: true - Required for cross-origin SSE in iframes (chat widget on external sites)
 * - maxReconnectAttempts: 50 - More resilient reconnection for flaky tunnel connections
 *
 * SOURCE OF TRUTH KEYWORDS: RealtimeProviderWrapper, RealtimeClientProvider
 */

import { RealtimeProvider } from '@upstash/realtime/client'
import { usePermissionSync } from '@/hooks/use-permission-sync'
import { useNotificationRealtime } from '@/hooks/use-notification-realtime'
import { useClarityIdentify } from '@/hooks/use-clarity-identify'

interface RealtimeProviderWrapperProps {
  children: React.ReactNode
}

/**
 * Internal component to use hooks inside RealtimeProvider context
 *
 * WHY: usePermissionSync uses useRealtime which requires RealtimeProvider context
 * HOW: Wrap children in a component that sets up the permission sync
 */
function PermissionSyncProvider({ children }: { children: React.ReactNode }) {
  /**
   * Set up realtime permission synchronization
   *
   * EVENTS HANDLED:
   * - permissions.memberUpdated: Invalidates cache when user's role changes
   * - permissions.roleUpdated: Invalidates cache when role definition changes
   * - permissions.memberRemoved: Redirects user out of org they were removed from
   */
  usePermissionSync({ showNotifications: true })

  return <>{children}</>
}

/**
 * Internal component that sets up realtime notification synchronization.
 *
 * WHY a separate component: useNotificationRealtime uses useRealtime which
 * requires RealtimeProvider context. Wrapping it in its own component follows
 * the same pattern as PermissionSyncProvider and keeps concerns separated.
 *
 * EVENTS HANDLED:
 * - notifications.created: Invalidates tRPC cache + shows toast for new notifications
 * - notifications.read: Invalidates tRPC cache to sync read state across tabs
 */
function NotificationSyncProvider({ children }: { children: React.ReactNode }) {
  useNotificationRealtime()

  return <>{children}</>
}

/**
 * Internal component that identifies the authenticated user in Microsoft Clarity.
 *
 * WHY: Links session recordings to userId and tags with org context.
 * HOW: Calls Clarity.identify() once when user/org data is available.
 *      Non-blocking — never delays rendering or throws errors.
 */
function ClarityIdentifyProvider({ children }: { children: React.ReactNode }) {
  useClarityIdentify()

  return <>{children}</>
}

export function RealtimeProviderWrapper({ children }: RealtimeProviderWrapperProps) {
  return (
    <RealtimeProvider
      api={{
        /**
         * SSE endpoint URL - MUST be explicitly set!
         *
         * WHY: When only passing partial api config, the default url is lost.
         *      Without explicit url, EventSource resolves relative to current page,
         *      causing wrong URLs like /chat-widget/render/{orgId}/undefined
         */
        url: '/api/realtime',
        /**
         * Enable credentials for cross-origin SSE requests
         *
         * WHY: Chat widget runs in an iframe on external sites (GHL, Webflow, etc.)
         *      SSE connections from iframe to our API need credentials for CORS
         */
        withCredentials: true,
      }}
      /**
       * Increase reconnection attempts for tunnel/proxy scenarios
       *
       * WHY: Cloudflare tunnels and other proxies can timeout SSE connections
       *      More attempts means better resilience for embedded widgets
       */
      maxReconnectAttempts={50}
    >
      <PermissionSyncProvider>
        <NotificationSyncProvider>
          <ClarityIdentifyProvider>{children}</ClarityIdentifyProvider>
        </NotificationSyncProvider>
      </PermissionSyncProvider>
    </RealtimeProvider>
  )
}
