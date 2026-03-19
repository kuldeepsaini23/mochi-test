/**
 * Chat Widget Render Client Component
 *
 * WHY: Client-side wrapper for the chat widget in iframe context
 * HOW: Renders ChatWidgetEmbed component with device type detection
 *
 * FEATURES:
 * - Renders the SOURCE OF TRUTH ChatWidgetEmbed component
 * - Receives isMobileDevice from parent via URL param (initial)
 * - Listens for device type changes via postMessage (on resize)
 * - Passes device type to ChatWidgetEmbed for proper UI rendering
 *
 * NOTE: TRPCReactProvider is provided by (widget)/layout.tsx
 * NOTE: Transparent background is set via page.tsx using inline styles
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetRenderClient, EmbedClient
 */

'use client'

import { useState, useEffect } from 'react'
import { ChatWidgetEmbed } from '@/components/chat-widget/chat-widget-embed'

// ============================================================================
// TYPES
// ============================================================================

interface ChatWidgetRenderClientProps {
  organizationId: string
  chatWidgetId: string
  isMobileDevice: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChatWidgetRenderClient({
  organizationId,
  chatWidgetId,
  isMobileDevice: initialIsMobile,
}: ChatWidgetRenderClientProps) {
  /**
   * Track device type state
   * WHY: Can change on orientation/resize - parent notifies via postMessage
   * HOW: Initial value from URL param, updates via 'mochi-device-change' message
   */
  const [isMobileDevice, setIsMobileDevice] = useState(initialIsMobile)

  /**
   * Listen for device type changes from parent window
   * WHY: When user rotates device or resizes browser, embed script sends update
   * HOW: Parent sends { type: 'mochi-device-change', isMobile: boolean }
   */
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Validate message structure
      if (!event.data || typeof event.data !== 'object') return
      if (event.data.type !== 'mochi-device-change') return
      if (typeof event.data.isMobile !== 'boolean') return

      setIsMobileDevice(event.data.isMobile)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div className="w-full h-full bg-transparent">
      <ChatWidgetEmbed
        organizationId={organizationId}
        chatWidgetId={chatWidgetId}
        isMobileDevice={isMobileDevice}
      />
    </div>
  )
}
