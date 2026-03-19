/**
 * ============================================================================
 * RESPONSIVE PAGE RENDERER - Auto-detecting breakpoint wrapper
 * ============================================================================
 *
 * A wrapper around PageRenderer that automatically detects viewport width
 * and passes the appropriate breakpoint. This is the SINGLE SOURCE OF TRUTH
 * for responsive rendering on live/published pages.
 *
 * ============================================================================
 * WHY THIS COMPONENT EXISTS
 * ============================================================================
 *
 * Previously, live pages used:
 * - PageRenderer with breakpoint="desktop" (default)
 * - CSS container queries to override styles at mobile widths
 *
 * This caused style drift because CSS targeting was fragile and error-prone.
 *
 * NOW, live pages use this component which:
 * - Detects viewport width via useBreakpoint hook
 * - Passes the correct breakpoint to PageRenderer
 * - PageRenderer computes styles directly for that breakpoint
 * - SAME code path as the mobile preview in the builder = no drift!
 *
 * ============================================================================
 * SSR FOUC PREVENTION
 * ============================================================================
 *
 * The server component (page.tsx) detects mobile devices via User-Agent header
 * and passes the result as `initialBreakpoint`. This seeds the useBreakpoint
 * hook's initial state so the SSR HTML already contains the correct layout
 * for mobile devices — no flash of desktop styles on mobile.
 *
 * The useBreakpoint hook still runs on the client to confirm/correct the
 * server's detection and handle viewport resize events.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * <ResponsivePageRenderer
 *   elements={elements}
 *   initialBreakpoint={detectedFromUserAgent}
 * />
 * ```
 *
 * ============================================================================
 */

'use client'

import { PageRenderer, type PageRendererProps } from './page-renderer'
import { useBreakpoint } from '../_hooks/use-breakpoint'
import type { Breakpoint } from '../_lib/types'

/**
 * Props for ResponsivePageRenderer.
 * Same as PageRendererProps but breakpoint is auto-detected (not passed in).
 */
export interface ResponsivePageRendererProps extends Omit<PageRendererProps, 'breakpoint'> {
  /**
   * Optional: Force a specific breakpoint (overrides auto-detection entirely).
   * Used by builder components that need to lock to a specific view.
   * NOTE: When set, initialBreakpoint has no effect since detection is bypassed.
   */
  forceBreakpoint?: PageRendererProps['breakpoint']

  /**
   * Server-detected initial breakpoint for SSR FOUC prevention.
   * Detected from User-Agent header in the server component (page.tsx).
   * Seeds the useBreakpoint hook's initial state so SSR renders the correct
   * layout for mobile devices from the start.
   *
   * The useBreakpoint hook still runs after hydration to confirm/correct
   * this value based on actual viewport width (handles edge cases like
   * unusual UAs or desktop browsers with narrow windows).
   */
  initialBreakpoint?: Breakpoint
}

/**
 * ResponsivePageRenderer - PageRenderer with automatic breakpoint detection.
 *
 * BEHAVIOR:
 * - On viewport >= 768px: renders with breakpoint="desktop"
 * - On viewport < 768px: renders with breakpoint="mobile"
 * - Updates automatically when viewport is resized
 * - When initialBreakpoint is provided, SSR renders with the correct
 *   layout from the start (no FOUC on mobile devices)
 *
 * This ensures live pages render EXACTLY the same as:
 * - Desktop view in the builder (when viewport is wide)
 * - Mobile preview in the builder (when viewport is narrow)
 *
 * NO MORE STYLE DRIFT between preview and live!
 */
export function ResponsivePageRenderer({
  forceBreakpoint,
  initialBreakpoint,
  ...props
}: ResponsivePageRendererProps) {
  /** Auto-detect breakpoint from viewport, seeded with server-detected value */
  const detectedBreakpoint = useBreakpoint(initialBreakpoint)

  /** Use forced breakpoint if provided, otherwise use detected */
  const breakpoint = forceBreakpoint ?? detectedBreakpoint

  return <PageRenderer {...props} breakpoint={breakpoint} />
}
