/**
 * ============================================================================
 * USE BREAKPOINT HOOK - Viewport-based responsive breakpoint detection
 * ============================================================================
 *
 * Detects the current viewport width and returns the appropriate breakpoint.
 * This is the SINGLE SOURCE OF TRUTH for responsive behavior across the app.
 *
 * ============================================================================
 * WHY THIS APPROACH (NOT CSS CONTAINER QUERIES)
 * ============================================================================
 *
 * Previously, we used CSS container queries to handle responsive styles:
 * - Desktop styles applied via inline React styles
 * - Mobile overrides applied via @container CSS rules
 *
 * This caused problems:
 * 1. CSS had to target specific DOM elements (data-element-content vs data-element-id)
 * 2. Different element types had different DOM structures
 * 3. Styles drifted between preview and live modes
 * 4. Complex CSS specificity issues (!important everywhere)
 *
 * The NEW approach is simpler:
 * 1. Detect viewport width with this hook
 * 2. Pass breakpoint prop to PageRenderer
 * 3. PageRenderer computes ALL styles directly for that breakpoint
 * 4. No CSS container queries needed = no targeting issues
 *
 * ============================================================================
 * BREAKPOINT THRESHOLD
 * ============================================================================
 *
 * Mobile breakpoint: < 768px (matches common tablet/mobile threshold)
 * This is consistent with the mobile preview frame width in the builder.
 *
 * ============================================================================
 * PERFORMANCE
 * ============================================================================
 *
 * - Uses ResizeObserver for efficient resize detection
 * - Debounces resize events to avoid excessive re-renders
 * - Only triggers re-render when breakpoint actually changes
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * function MyPage() {
 *   const breakpoint = useBreakpoint()
 *   return <PageRenderer elements={elements} breakpoint={breakpoint} />
 * }
 * ```
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Breakpoint } from '../_lib/types'

/**
 * Mobile breakpoint threshold in pixels.
 * Viewports narrower than this are considered "mobile".
 */
const MOBILE_BREAKPOINT = 768

/**
 * Debounce delay for resize events (in milliseconds).
 * Prevents excessive re-renders during resize drag.
 */
const RESIZE_DEBOUNCE_MS = 100

/**
 * Hook that returns the current breakpoint based on viewport width.
 *
 * RETURNS:
 * - 'mobile' when viewport width < 768px
 * - 'desktop' when viewport width >= 768px
 *
 * BEHAVIOR:
 * - Uses initialBreakpoint for SSR (defaults to 'desktop' if not provided)
 * - Updates automatically when viewport is resized
 * - Debounced to avoid performance issues during resize drag
 *
 * SSR FOUC PREVENTION:
 * When initialBreakpoint is passed (detected from User-Agent on the server),
 * the SSR HTML matches the client's viewport from the first paint.
 * The useEffect still runs after hydration as a confirmation/correction
 * in case the UA detection was wrong (e.g., desktop UA on a small window).
 *
 * @param initialBreakpoint - Server-detected breakpoint from User-Agent header.
 *                            Falls back to 'desktop' if not provided.
 */
export function useBreakpoint(initialBreakpoint?: Breakpoint): Breakpoint {
  /**
   * Initialize breakpoint from server-detected value (if provided).
   * This ensures SSR HTML matches the client's expected layout,
   * preventing FOUC (Flash of Unstyled Content) on mobile devices.
   */
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(initialBreakpoint ?? 'desktop')

  /**
   * Calculate breakpoint from current window width.
   * Wrapped in useCallback to avoid recreating on every render.
   */
  const calculateBreakpoint = useCallback((): Breakpoint => {
    if (typeof window === 'undefined') return 'desktop'
    return window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop'
  }, [])

  useEffect(() => {
    // Skip on server
    if (typeof window === 'undefined') return

    // Set initial breakpoint on mount
    setBreakpoint(calculateBreakpoint())

    // Debounce timer reference
    let debounceTimer: NodeJS.Timeout | null = null

    /**
     * Handle resize events with debouncing.
     * Only updates state if breakpoint actually changes.
     */
    const handleResize = () => {
      // Clear existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      // Schedule update after debounce delay
      debounceTimer = setTimeout(() => {
        const newBreakpoint = calculateBreakpoint()
        setBreakpoint((current) => {
          // Only update if breakpoint changed (prevents unnecessary re-renders)
          return current !== newBreakpoint ? newBreakpoint : current
        })
      }, RESIZE_DEBOUNCE_MS)
    }

    // Listen to resize events
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
  }, [calculateBreakpoint])

  return breakpoint
}

