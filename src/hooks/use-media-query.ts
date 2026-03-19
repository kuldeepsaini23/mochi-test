'use client'

/**
 * useMediaQuery Hook
 *
 * WHY: Detect screen size changes for responsive component rendering
 * HOW: Uses window.matchMedia API with SSR-safe initial state
 *
 * USAGE:
 * const isMobile = useMediaQuery('(max-width: 768px)')
 * const isDesktop = useMediaQuery('(min-width: 1024px)')
 *
 * SOURCE OF TRUTH KEYWORDS: useMediaQuery, ResponsiveHook, ScreenSize
 */

import { useState, useEffect } from 'react'

/**
 * Hook to detect if a media query matches
 * @param query - CSS media query string (e.g., '(max-width: 768px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  /**
   * Start with false for SSR - prevents hydration mismatch
   * The actual value will be set in useEffect on client
   */
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    // Create media query list
    const mediaQuery = window.matchMedia(query)

    // Set initial value
    setMatches(mediaQuery.matches)

    /**
     * Handler for media query changes
     * Updates state when screen size changes
     */
    function handleChange(event: MediaQueryListEvent) {
      setMatches(event.matches)
    }

    // Modern browsers use addEventListener
    mediaQuery.addEventListener('change', handleChange)

    // Cleanup on unmount
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [query])

  return matches
}

/**
 * Preset breakpoints matching Tailwind CSS defaults
 */
export const breakpoints = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
} as const

/**
 * Hook to check if screen is mobile (< 768px)
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}

/**
 * Hook to check if screen is tablet or larger (>= 768px)
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px)')
}

/**
 * Hook to check if screen is desktop or larger (>= 1024px)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
