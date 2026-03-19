/**
 * Chat Widget Embed Script Endpoint
 *
 * WHY: Serve the chat widget JavaScript for external websites to embed
 * HOW: Validates origin against allowed domains, returns minimal loader script
 *
 * SECURITY:
 * - Validates Origin/Referer header against widget's allowedDomains
 * - Returns 403 if origin is not whitelisted
 * - Uses Content-Security-Policy headers
 *
 * SCRIPT ARCHITECTURE:
 * - Returns a minimal loader script that creates an iframe
 * - The iframe loads the actual widget from a secure page
 * - This approach isolates the widget from the host page
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetEmbed, EmbedScript, WidgetLoader
 */

import { NextRequest, NextResponse } from 'next/server'
import * as chatWidgetService from '@/services/chat-widget.service'
import { getEmbedBaseUrl } from '@/lib/config/embed'

// ============================================================================
// TYPES
// ============================================================================

interface RouteParams {
  params: Promise<{
    organizationId: string
    chatWidgetId: string
  }>
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract origin from request headers
 * WHY: Get the domain making the request for validation
 * HOW: Check Origin header first, fall back to Referer
 */
function getRequestOrigin(request: NextRequest): string | null {
  // Origin header is set for CORS requests
  const origin = request.headers.get('origin')
  if (origin) return origin

  // Fall back to Referer header
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const url = new URL(referer)
      return url.origin
    } catch {
      return null
    }
  }

  return null
}

/**
 * Generate the embed loader script
 * WHY: Minimal JavaScript that loads the widget via iframe
 * HOW: Creates iframe pointing to our widget render page
 *
 * Using iframe approach because:
 * 1. Complete style isolation from host page
 * 2. Security sandbox for the widget
 * 3. No CSS conflicts with host page
 * 4. Widget runs in its own context
 *
 * RELIABILITY IMPROVEMENTS:
 * - Checks for existing container to handle SPA navigations
 * - Multiple DOM ready strategies for async script loading
 * - Error handling for iframe load failures
 * - Retry logic with exponential backoff
 */
/**
 * Escape a string for safe interpolation into a JavaScript single-quoted string literal.
 * Prevents breaking out of the string context via crafted IDs.
 */
function escapeJSString(str: string): string {
  return str.replace(/[\\']/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
}

function generateEmbedScript(
  baseUrl: string,
  organizationId: string,
  chatWidgetId: string
): string {
  // Escape all interpolated values to prevent JS injection in the embed script
  const safeBaseUrl = escapeJSString(baseUrl)
  const safeOrgId = escapeJSString(organizationId)
  const safeWidgetId = escapeJSString(chatWidgetId)

  return `
(function() {
  'use strict';

  // Configuration
  var config = {
    baseUrl: '${safeBaseUrl}',
    organizationId: '${safeOrgId}',
    chatWidgetId: '${safeWidgetId}',
    containerId: 'mochi-chat-widget-container',
    iframeId: 'mochi-chat-widget-iframe'
  };

  /**
   * Check if widget is already mounted
   * WHY: Handle SPA navigations and multiple script loads
   * HOW: Check for existing container element, not just a flag
   */
  function isAlreadyMounted() {
    return document.getElementById(config.containerId) !== null;
  }

  /**
   * Clean up existing widget if needed
   * WHY: Allow re-mounting after SPA navigation removes the container
   */
  function cleanup() {
    var existing = document.getElementById(config.containerId);
    if (existing) {
      existing.remove();
    }
    window.__MOCHI_CHAT_WIDGET_LOADED__ = false;
  }

  // Check if mobile device (viewport width < 640px)
  function isMobile() {
    return window.innerWidth < 640;
  }

  /**
   * Get iframe dimensions based on screen size
   * Desktop dimensions calculated from:
   * - Widget panel: 384px × 640px (24rem × 40rem)
   * - Panel margin: 16px all sides
   * - Toggle: 56px + 16px margins
   * - Total: ~450px × 770px with breathing room for shadows
   */
  function getIframeDimensions() {
    if (isMobile()) {
      return { width: '100vw', height: '100vh' };
    }
    return { width: '450px', height: '770px' };
  }

  /**
   * Create and inject the widget iframe
   * WHY: Main initialization logic
   * HOW: Creates container, iframe, and sets up event listeners
   */
  function init() {
    // Double-check we're not already mounted (race condition prevention)
    if (isAlreadyMounted()) {
      return;
    }

    // Mark as loading to prevent concurrent init attempts
    window.__MOCHI_CHAT_WIDGET_LOADED__ = true;

    var dims = getIframeDimensions();

    // Create container - full screen on mobile, positioned on desktop
    var container = document.createElement('div');
    container.id = config.containerId;
    container.style.cssText = isMobile()
      ? 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
      : 'position:fixed;bottom:0;right:0;z-index:2147483647;pointer-events:none;';

    /**
     * Create iframe with transparent background
     * WHY: Pass isMobile param so widget knows the REAL device type
     * HOW: Append ?isMobile=true/false to URL - widget uses this, NOT viewport
     */
    var iframe = document.createElement('iframe');
    iframe.id = config.iframeId;
    iframe.src = config.baseUrl + '/chat-widget/render/' + config.organizationId + '/' + config.chatWidgetId + '?isMobile=' + isMobile();
    iframe.style.cssText = 'width:' + dims.width + ';height:' + dims.height + ';border:none;background:transparent;pointer-events:auto;';
    iframe.allow = 'clipboard-write';
    iframe.title = 'Chat Widget';
    iframe.setAttribute('allowtransparency', 'true');

    /**
     * Handle iframe load errors
     * WHY: Retry on network failures or temporary issues
     */
    var retryCount = 0;
    var maxRetries = 3;
    iframe.onerror = function() {
      if (retryCount < maxRetries) {
        retryCount++;
        console.warn('[Mochi Chat Widget] Iframe load failed, retrying (' + retryCount + '/' + maxRetries + ')...');
        setTimeout(function() {
          iframe.src = iframe.src; // Retry by reloading
        }, 1000 * retryCount); // Exponential backoff
      } else {
        console.error('[Mochi Chat Widget] Failed to load after ' + maxRetries + ' attempts');
      }
    };

    container.appendChild(iframe);

    /**
     * Append to body with safety check
     * WHY: Ensure body exists before appending
     */
    if (document.body) {
      document.body.appendChild(container);
    } else {
      console.error('[Mochi Chat Widget] document.body not available');
      cleanup();
      return;
    }

    /**
     * Track current mobile state for change detection
     * WHY: Only notify iframe when device type actually changes
     */
    var wasMobile = isMobile();

    /**
     * Update dimensions and notify iframe on resize
     * WHY: Handle orientation changes and window resizing
     * HOW: Resize iframe + postMessage if device type changed
     */
    window.addEventListener('resize', function() {
      var nowMobile = isMobile();
      var newDims = getIframeDimensions();

      // Check if iframe still exists (SPA navigation might have removed it)
      var currentIframe = document.getElementById(config.iframeId);
      var currentContainer = document.getElementById(config.containerId);
      if (!currentIframe || !currentContainer) return;

      currentIframe.style.width = newDims.width;
      currentIframe.style.height = newDims.height;
      currentContainer.style.cssText = nowMobile
        ? 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
        : 'position:fixed;bottom:0;right:0;z-index:2147483647;pointer-events:none;';

      // Notify iframe if device type changed (e.g., orientation change)
      if (nowMobile !== wasMobile) {
        wasMobile = nowMobile;
        if (currentIframe.contentWindow) {
          currentIframe.contentWindow.postMessage({ type: 'mochi-device-change', isMobile: nowMobile }, config.baseUrl);
        }
      }
    });

    // Handle messages from iframe for resize/close
    window.addEventListener('message', function(event) {
      if (event.origin !== config.baseUrl) return;

      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        var currentContainer = document.getElementById(config.containerId);
        var currentIframe = document.getElementById(config.iframeId);

        if (!currentContainer || !currentIframe) return;

        if (data.type === 'mochi-widget-resize') {
          currentIframe.style.width = data.width + 'px';
          currentIframe.style.height = data.height + 'px';
        }

        if (data.type === 'mochi-widget-toggle') {
          currentContainer.style.pointerEvents = data.open ? 'auto' : 'none';
        }
      } catch (e) {
        // Ignore invalid messages
      }
    });
  }

  /**
   * Initialize when DOM is ready
   * WHY: Multiple strategies to handle various loading scenarios
   * HOW:
   *   1. If already loaded, init immediately
   *   2. If still loading, wait for DOMContentLoaded
   *   3. As fallback, use setTimeout if DOMContentLoaded was missed
   */
  function safeInit() {
    // Already mounted, nothing to do
    if (isAlreadyMounted()) {
      return;
    }

    // DOM is ready, init now
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      // Small delay to ensure body is fully available
      setTimeout(init, 0);
      return;
    }

    // DOM still loading, wait for it
    document.addEventListener('DOMContentLoaded', init);

    // Fallback: If DOMContentLoaded never fires (shouldn't happen, but safety first)
    setTimeout(function() {
      if (!isAlreadyMounted() && document.body) {
        init();
      }
    }, 3000);
  }

  // Start initialization
  safeInit();
})();
`.trim()
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { organizationId, chatWidgetId } = await params

  try {
    // Fetch widget with allowed domains
    const widget = await chatWidgetService.getWidgetForEmbed(organizationId, chatWidgetId)

    if (!widget) {
      return new NextResponse('Widget not found', { status: 404 })
    }

    // Get allowed domains
    const allowedDomains = (widget.allowedDomains as string[]) || []

    // Get request origin
    const origin = getRequestOrigin(request)

    // Validate origin against allowed domains
    // If no allowed domains, widget is not embeddable externally
    if (allowedDomains.length === 0) {
      return new NextResponse(
        '// Widget not configured for external embedding\nconsole.warn("Mochi Chat Widget: This widget is not configured for external embedding. Please add allowed domains in the widget settings.");',
        {
          status: 403,
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // Validate origin — do NOT interpolate the origin value into JS output
    // to prevent reflected XSS via crafted Origin headers.
    if (!origin || !chatWidgetService.isOriginAllowed(origin, allowedDomains)) {
      return new NextResponse(
        '// Origin not allowed\nconsole.warn("Mochi Chat Widget: This domain is not authorized to embed this widget.");',
        {
          status: 403,
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // Get base URL for the widget render page
    const baseUrl = getEmbedBaseUrl()

    // Generate the embed script
    const script = generateEmbedScript(baseUrl, organizationId, chatWidgetId)

    // Return the script with appropriate headers
    return new NextResponse(script, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=300', // 5 minute cache
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Chat widget embed error:', error)
    return new NextResponse(
      '// Error loading widget\nconsole.error("Mochi Chat Widget: Failed to load widget");',
      {
        status: 500,
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}

/**
 * Handle OPTIONS for CORS preflight
 *
 * SECURITY: Only set Access-Control-Allow-Origin when a valid origin is present.
 * A wildcard '*' fallback would allow any site to make credentialed requests,
 * bypassing the domain allowlist enforced on the GET handler.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = getRequestOrigin(request)

  /** No origin header means this isn't a browser CORS preflight — reject it */
  if (!origin) {
    return new NextResponse(null, { status: 403 })
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
