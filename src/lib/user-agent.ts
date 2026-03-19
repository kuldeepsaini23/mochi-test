/**
 * ============================================================================
 * USER-AGENT MOBILE DETECTION - Server-side device type detection
 * ============================================================================
 *
 * SOURCE OF TRUTH: Server-side mobile detection, ssr-breakpoint, user-agent-mobile
 *
 * Parses User-Agent strings to detect mobile phones (NOT tablets).
 * Used by the public website page server component to determine the correct
 * initial breakpoint for SSR, preventing FOUC (Flash of Unstyled Content).
 *
 * ============================================================================
 * WHY NOT TABLETS?
 * ============================================================================
 *
 * The website builder's mobile breakpoint threshold is 768px.
 * iPads and most tablets have viewport widths >= 768px, so they should
 * receive the 'desktop' breakpoint. Only phones (typically < 768px wide)
 * should receive 'mobile'.
 *
 * ============================================================================
 * DEVICE COVERAGE
 * ============================================================================
 *
 * Detected as MOBILE (phones):
 * - iPhone (all models)
 * - Android phones (Chrome on Android phones includes "Mobile" in UA)
 * - Windows Phone
 * - iPod
 * - BlackBerry, BB10
 * - Opera Mini/Mobile
 * - IEMobile
 *
 * NOT detected as mobile (tablets, desktops):
 * - iPad (viewport >= 768px)
 * - Android tablets ("Android" without "Mobile" = tablet)
 * - All desktop browsers
 * - Bots/crawlers (treated as desktop for SEO — they see full layout)
 *
 * ============================================================================
 */

import type { Breakpoint } from '@/components/website-builder/builder-v1.2/_lib/types'

/**
 * Regex to match mobile phone User-Agent strings.
 *
 * KEY DISTINCTIONS:
 * - "Android" + "Mobile" = phone. "Android" alone = could be tablet.
 * - "iPhone" is always a phone. "iPad" is excluded (>= 768px viewport).
 * - Windows Phone, iPod, BlackBerry are always phones.
 */
const MOBILE_PHONE_UA_REGEX =
  /iPhone|iPod|Android.*Mobile|Mobile.*Android|Windows Phone|BlackBerry|BB10|Opera Mini|Opera Mobi|IEMobile/i

/**
 * Detects whether a User-Agent string represents a mobile phone
 * and returns the appropriate Breakpoint value for SSR rendering.
 *
 * This is a best-effort heuristic — the client-side useBreakpoint hook
 * will confirm/correct the breakpoint after hydration using actual viewport width.
 *
 * @param userAgent - The User-Agent header string (can be null from headers().get())
 * @returns 'mobile' for phones, 'desktop' for everything else
 */
export function detectInitialBreakpoint(userAgent: string | null): Breakpoint {
  if (!userAgent) return 'desktop'
  return MOBILE_PHONE_UA_REGEX.test(userAgent) ? 'mobile' : 'desktop'
}
