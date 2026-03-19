/**
 * ============================================================================
 * NAVIGATION CONTROLLER
 * ============================================================================
 *
 * Pure function that decides whether the widget should navigate in
 * response to a MochiAIEvent. Extracts the FEATURE_ROUTES logic from
 * the MochiWidget into a testable, reusable decision function.
 *
 * Returns a NavigationDecision with:
 *   - shouldNavigate: whether to actually push a new route
 *   - targetUrl: the resolved URL (null if no navigation)
 *   - reason: why the decision was made (for logging/debugging)
 *
 * SOURCE OF TRUTH KEYWORDS: NavigationController, NavigationDecision,
 * ResolveNavigation
 * ============================================================================
 */

import type { MochiAIEvent } from '../events/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * The result of a navigation decision — tells the caller whether to navigate
 * and why the decision was made.
 *
 * SOURCE OF TRUTH KEYWORDS: NavigationDecision
 */
export interface NavigationDecision {
  /** Whether the widget should call router.push() */
  shouldNavigate: boolean
  /** The target URL to navigate to (null if shouldNavigate is false) */
  targetUrl: string | null
  /** Human-readable reason for the decision (useful for debugging) */
  reason:
    | 'navigated'
    | 'background_mode'
    | 'no_navigate_flag'
    | 'no_route'
    | 'already_on_page'
}

/**
 * Route builder function — takes an entity ID and optional data,
 * returns the URL to navigate to.
 */
type RouteBuilder = (entityId: string, data?: Record<string, string>) => string

/**
 * Configuration for the navigation resolution.
 */
interface NavigationConfig {
  /** Map of feature names to their route builder functions */
  featureRoutes: Record<string, RouteBuilder>
  /** The current browser pathname (from usePathname) */
  currentPathname: string
  /** The current browser search params string (from useSearchParams), e.g. "contract=abc123" */
  currentSearchParams?: string
  /** Whether background mode is active (suppresses all navigation) */
  backgroundMode: boolean
}

// ============================================================================
// RESOLVER
// ============================================================================

/**
 * Resolves whether to navigate in response to a MochiAIEvent.
 *
 * Decision priority:
 * 1. Background mode → never navigate
 * 2. Event.navigate !== true → no navigation requested
 * 3. No route for the feature → can't navigate
 * 4. Already on the target page → skip redundant navigation
 * 5. Otherwise → navigate
 *
 * @param event - The MochiAIEvent from a tool result or stream event
 * @param config - Navigation configuration (routes, pathname, background mode)
 * @returns NavigationDecision with shouldNavigate, targetUrl, and reason
 *
 * @example
 * ```ts
 * const decision = resolveNavigation(event, {
 *   featureRoutes: { contract: (id) => `/payments/contracts?contract=${id}` },
 *   currentPathname: '/dashboard',
 *   backgroundMode: false,
 * })
 *
 * if (decision.shouldNavigate && decision.targetUrl) {
 *   router.push(decision.targetUrl)
 * }
 * ```
 */
export function resolveNavigation(
  event: MochiAIEvent,
  config: NavigationConfig
): NavigationDecision {
  const { featureRoutes, currentPathname, currentSearchParams, backgroundMode } = config

  /** Background mode suppresses ALL navigation */
  if (backgroundMode) {
    return { shouldNavigate: false, targetUrl: null, reason: 'background_mode' }
  }

  /** Only navigate if the event explicitly requests it */
  if (!event.navigate) {
    return { shouldNavigate: false, targetUrl: null, reason: 'no_navigate_flag' }
  }

  /** Look up the route builder for this feature */
  const routeBuilder = featureRoutes[event.feature]
  if (!routeBuilder) {
    return { shouldNavigate: false, targetUrl: null, reason: 'no_route' }
  }

  /** Resolve the target URL from the route builder */
  const targetUrl = routeBuilder(event.entityId, event.data)

  /**
   * Skip navigation if the user is already on the exact target page.
   *
   * For routes WITH query params (e.g. /payments/contracts?contract=xxx),
   * we compare the full URL (pathname + query string) because the same
   * pathname can have completely different UI states based on query params
   * (e.g. contract list vs contract builder overlay).
   *
   * For routes WITHOUT query params, we compare just the pathname to
   * avoid false positives from unrelated query strings.
   */
  const [targetPath, targetQuery] = targetUrl.split('?')

  if (targetQuery) {
    /** Target has query params — compare full URL (pathname + query) */
    const currentFull = currentSearchParams
      ? `${currentPathname}?${currentSearchParams}`
      : currentPathname
    if (currentFull === targetUrl) {
      return { shouldNavigate: false, targetUrl, reason: 'already_on_page' }
    }
  } else {
    /** No query params — compare pathnames only */
    if (currentPathname && targetPath && currentPathname === targetPath) {
      return { shouldNavigate: false, targetUrl, reason: 'already_on_page' }
    }
  }

  return { shouldNavigate: true, targetUrl, reason: 'navigated' }
}
