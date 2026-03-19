/**
 * ============================================================================
 * PAGE RENDERER - Utility Functions
 * ============================================================================
 *
 * SOURCE OF TRUTH: Page Renderer Utilities
 *
 * Helper functions for the PageRenderer component including:
 * - Navigation link resolution with context-aware routing
 * - Building lookup structures from flat element arrays
 *
 * ============================================================================
 */

import type { CanvasElement } from '../../../_lib/types'
import type { LookupStructures } from './types'

/**
 * Resolves a navigation link href with context-aware routing.
 *
 * BEHAVIOR:
 * - External links (http://, https://): Returns unchanged
 * - Internal links (e.g., "/about", "/contact"): Prepends basePath if provided
 * - Hash links (e.g., "#section"): Returns unchanged
 * - Empty/undefined: Returns "#" as fallback
 *
 * CONTEXT-AWARE ROUTING:
 * - Public sites: basePath = "/domain" (e.g., "/webprodigies")
 *   Link "/about" → "/webprodigies/about"
 * - Preview mode: basePath = preview path
 *   Link "/about" → "/preview/site-id/about"
 * - No basePath: Links work as-is (for builder mode or same-domain)
 *
 * @param href - The original href from the link configuration
 * @param basePath - Optional base path for the current context
 * @returns Resolved href with correct routing
 */
export function resolveNavigationHref(href: string | undefined, basePath?: string): string {
  // Handle empty/undefined href
  if (!href) return '#'

  // External links - return unchanged
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href
  }

  // Hash-only links - return unchanged
  if (href.startsWith('#')) {
    return href
  }

  // No basePath - return link as-is
  if (!basePath) {
    return href
  }

  // Internal link with basePath - prepend the base path
  // Ensure proper slash handling: "/webprodigies" + "/about" = "/webprodigies/about"
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  const normalizedHref = href.startsWith('/') ? href : `/${href}`

  return `${normalizedBase}${normalizedHref}`
}

/**
 * Builds lookup structures from a flat array of elements.
 *
 * This allows us to store only the elements array in the database,
 * then derive rootIds and childrenMap at render time.
 *
 * @param elements - Array of canvas elements
 * @returns Object with elementsMap, rootIds, and childrenMap
 */
export function buildLookupStructures(elements: CanvasElement[]): LookupStructures {
  // Build elements map for O(1) lookup by ID
  const elementsMap: Record<string, CanvasElement> = {}
  for (const element of elements) {
    elementsMap[element.id] = element
  }

  // Build rootIds (elements with no parent) and childrenMap
  const rootIds: string[] = []
  const childrenMap: Record<string, string[]> = {}

  for (const element of elements) {
    if (element.parentId === null) {
      // Root element (should be the page)
      rootIds.push(element.id)
    } else {
      // Child element - add to parent's children list
      if (!childrenMap[element.parentId]) {
        childrenMap[element.parentId] = []
      }
      childrenMap[element.parentId].push(element.id)
    }
  }

  return { elementsMap, rootIds, childrenMap }
}
