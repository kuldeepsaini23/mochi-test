/**
 * Chat Widget Render Page
 *
 * WHY: Renders the chat widget inside an iframe for external embedding
 * HOW: Uses the SOURCE OF TRUTH ChatWidgetEmbed component
 *
 * This page is loaded inside an iframe created by the embed script.
 * It communicates with the parent window via postMessage for:
 * - Resize events (widget open/close)
 * - Toggle visibility
 *
 * SECURITY:
 * - Origin validation is done at the embed script level
 * - This page runs in an isolated iframe context
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetRender, EmbedRender
 */

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import * as chatWidgetService from '@/services/chat-widget.service'
import { ChatWidgetRenderClient } from './_components/chat-widget-render-client'

// ============================================================================
// TYPES
// ============================================================================

interface PageParams {
  params: Promise<{
    organizationId: string
    chatWidgetId: string
  }>
  searchParams: Promise<{
    isMobile?: string
  }>
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function ChatWidgetRenderPage({ params, searchParams }: PageParams) {
  const { organizationId, chatWidgetId } = await params
  const { isMobile: isMobileParam } = await searchParams

  /**
   * Parse isMobile from query param
   * WHY: Embed script passes REAL device type, widget can't detect it from iframe viewport
   * HOW: ?isMobile=true means real device is mobile, false means desktop
   * DEFAULT: true (safer - shows mobile UI if param missing)
   */
  const isMobileDevice = isMobileParam !== 'false'

  // Get request headers for origin validation
  const headersList = await headers()
  const referer = headersList.get('referer')

  // Fetch widget to validate it exists
  const widget = await chatWidgetService.getWidgetForEmbed(organizationId, chatWidgetId)

  if (!widget) {
    notFound()
  }

  // Get allowed domains
  const allowedDomains = (widget.allowedDomains as string[]) || []

  // If widget has allowed domains, validate the referer
  if (allowedDomains.length > 0 && referer) {
    try {
      const refererOrigin = new URL(referer).origin
      if (!chatWidgetService.isOriginAllowed(refererOrigin, allowedDomains)) {
        notFound()
      }
    } catch {
      // Invalid referer, allow (might be direct access for testing)
    }
  }

  return (
    <>
      {/*
        Force transparent background on html/body for iframe embedding
        WHY: globals.css sets bg-background on body which shows white
        HOW: Inline style tag in SSR ensures no flash of white
      */}
      <style dangerouslySetInnerHTML={{ __html: `
        html, body { background: transparent !important; }
      `}} />
      <ChatWidgetRenderClient
        organizationId={organizationId}
        chatWidgetId={chatWidgetId}
        isMobileDevice={isMobileDevice}
      />
    </>
  )
}

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: 'Chat Widget',
  robots: 'noindex, nofollow',
}
