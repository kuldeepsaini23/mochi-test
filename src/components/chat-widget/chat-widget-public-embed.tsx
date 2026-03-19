/**
 * Chat Widget Public Embed
 *
 * Lightweight wrapper for rendering ChatWidgetEmbed on PUBLIC pages
 * (published websites) where RealtimeProvider is NOT available.
 *
 * WHY: Published website pages live under (main)/[domain] which has TRPCReactProvider
 * but NOT RealtimeProvider (that's only in (protected) layout for authenticated users).
 * ChatWidgetEmbed → useChatWidgetSession → useRealtime → needs RealtimeProvider.
 *
 * HOW: Wraps ChatWidgetEmbed with a bare RealtimeProvider — no PermissionSyncProvider
 * or NotificationSyncProvider since public pages have no authenticated user.
 *
 * DIFFERENCE FROM RealtimeProviderWrapper:
 * - RealtimeProviderWrapper includes PermissionSync + NotificationSync (needs auth)
 * - This component provides ONLY the RealtimeProvider context (public-safe)
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetPublicEmbed, PublicChatWidgetWrapper
 */

'use client'

import { RealtimeProvider } from '@upstash/realtime/client'
import { ChatWidgetEmbed } from './chat-widget-embed'

interface ChatWidgetPublicEmbedProps {
  organizationId: string
  chatWidgetId: string
}

export function ChatWidgetPublicEmbed({
  organizationId,
  chatWidgetId,
}: ChatWidgetPublicEmbedProps) {
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
         * WHY: Custom domain pages need CORS credentials for the SSE connection.
         */
        withCredentials: true,
      }}
      maxReconnectAttempts={50}
    >
      <ChatWidgetEmbed
        organizationId={organizationId}
        chatWidgetId={chatWidgetId}
      />
    </RealtimeProvider>
  )
}
