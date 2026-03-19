/**
 * ============================================================================
 * BUILDER CONTEXT - Provides builder-wide configuration and utilities
 * ============================================================================
 *
 * This context provides access to:
 * - Domain name (for URL construction when switching pages)
 * - Navigation utilities (for updating browser URL on page switch)
 *
 * WHY CONTEXT?
 * - Domain name needs to be available in deeply nested components (PagesPanel)
 * - Avoids prop drilling through Sidebar → PagesPanel
 * - Provides centralized URL navigation logic
 *
 * ============================================================================
 */

'use client'

import { createContext, useContext, useCallback, type ReactNode } from 'react'

// ============================================================================
// CONTEXT TYPE
// ============================================================================

interface BuilderContextValue {
  /** The domain name (e.g., "webprodigies") - used for URL construction. Null when domain is deleted. */
  domainName: string | null

  /** The website ID - used for creating new pages (upsert) and fallback URL routing */
  websiteId: string

  /** The domain ID - used for creating new pages. Null when domain is deleted. */
  domainId: string | null

  /** The organization ID - used for tRPC mutations */
  organizationId: string

  /** Whether e-commerce is enabled for this website - controls visibility of e-commerce elements in sidebar */
  enableEcommerce: boolean

  /**
   * Chat widget ID to display on this website (in preview and live view).
   * Null means no chat widget is assigned.
   * SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
   */
  chatWidgetId: string | null

  /**
   * Navigate to a specific page URL.
   * Updates the browser URL without full page reload.
   * Uses domainName if available, otherwise falls back to websiteId.
   *
   * @param slug - The page slug (e.g., "/about" or "about")
   */
  navigateToPage: (slug: string) => void
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const BuilderContext = createContext<BuilderContextValue | null>(null)

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface BuilderProviderProps {
  /** The domain name from the website data. Null when domain is deleted. */
  domainName: string | null
  /** The website ID - used for creating new pages and fallback URL routing */
  websiteId: string
  /** The domain ID - used for creating new pages. Null when domain is deleted. */
  domainId: string | null
  /** The organization ID - used for tRPC mutations */
  organizationId: string
  /** Whether e-commerce is enabled for this website */
  enableEcommerce?: boolean
  /** Chat widget ID to display on this website. SOURCE OF TRUTH: WebsiteChatWidget */
  chatWidgetId?: string | null
  children: ReactNode
}

/**
 * Provider component that supplies builder configuration to all children.
 *
 * USAGE:
 * ```tsx
 * <BuilderProvider domainName={data.domainName}>
 *   <Canvas ... />
 * </BuilderProvider>
 * ```
 */
export function BuilderProvider({ domainName, websiteId, domainId, organizationId, enableEcommerce = false, chatWidgetId = null, children }: BuilderProviderProps) {
  /**
   * Navigate to a page URL without full page reload.
   *
   * HOW IT WORKS:
   * 1. Constructs the URL: /{domainName}/{slug}/edit (or /{websiteId}/{slug}/edit if no domain)
   * 2. Uses window.history.replaceState() to update URL without adding to history
   * 3. Uses shallow routing to prevent page reload (maintains Redux state)
   *
   * WHY replace() INSTEAD OF push():
   * - Each page switch shouldn't create browser history entries
   * - User doesn't expect back button to cycle through every page they viewed
   * - Similar to how Figma handles page switches
   *
   * FALLBACK: When domain is deleted (domainName is null), uses websiteId in URL.
   * The backend route handler supports two-phase lookup (domain name → website ID).
   */
  const navigateToPage = useCallback(
    (slug: string) => {
      // Normalize slug: remove leading slash, handle root path
      const normalizedSlug = slug.replace(/^\//, '') || 'home'

      // Use domainName if available, otherwise fall back to websiteId
      const identifier = domainName || websiteId

      // Construct the URL
      const url = `/${identifier}/${normalizedSlug}/edit`

      // Update URL without full navigation (shallow)
      // Using window.history directly for true shallow update (no server roundtrip)
      window.history.replaceState(null, '', url)
    },
    [domainName, websiteId]
  )

  return (
    <BuilderContext.Provider value={{ domainName, websiteId, domainId, organizationId, enableEcommerce, chatWidgetId, navigateToPage }}>
      {children}
    </BuilderContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to access builder context.
 *
 * @throws Error if used outside of BuilderProvider
 *
 * USAGE:
 * ```tsx
 * const { domainName, navigateToPage } = useBuilderContext()
 *
 * // Navigate when switching pages
 * navigateToPage(page.info.slug)
 * ```
 */
export function useBuilderContext(): BuilderContextValue {
  const context = useContext(BuilderContext)

  if (!context) {
    throw new Error(
      'useBuilderContext must be used within a BuilderProvider. ' +
      'Make sure to wrap your component tree with <BuilderProvider>.'
    )
  }

  return context
}

/**
 * Safe version of useBuilderContext that returns null if not inside BuilderProvider.
 *
 * This is useful for components that can render in both:
 * - Builder mode (has BuilderProvider)
 * - Published mode (no BuilderProvider)
 *
 * USAGE:
 * ```tsx
 * const context = useBuilderContextSafe()
 * const organizationId = props.organizationId || context?.organizationId
 * ```
 */
export function useBuilderContextSafe(): BuilderContextValue | null {
  return useContext(BuilderContext)
}
