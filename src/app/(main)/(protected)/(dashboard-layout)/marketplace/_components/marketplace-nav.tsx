/**
 * ============================================================================
 * MARKETPLACE NAVIGATION TABS — Tab Navigation + Create Wizard
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: MarketplaceNav, MarketplaceTabs, MarketplaceNavigation
 *
 * WHY: Provides quick navigation between marketplace pages (Browse, My Templates,
 * Installed) and a "Create" button that opens the template creation wizard in a
 * dialog. Follows the same border-b-2 tab pattern as SettingsNav.
 *
 * HOW: Client component that reads pathname for active state, renders Link-based
 * tabs with border-bottom highlight, and manages a Dialog for the create wizard.
 * Also checks for `?create=true` search param to auto-open the wizard — this
 * supports deep-linking from other parts of the app (e.g., "Save as Template").
 *
 * ARCHITECTURE:
 * - usePathname() for active tab detection
 * - useSearchParams() for auto-open create wizard (?create=true)
 * - Full-screen Dialog wraps TemplateWizardLayout (handles its own provider)
 * - Suspense boundary isolates useSearchParams to prevent hydration issues
 */

'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { TemplateWizardLayout } from '@/components/templates/template-wizard'
import { Button } from '@/components/ui/button'

// ============================================================================
// TAB CONFIGURATION — Static tab definitions for the marketplace
// ============================================================================

/** Tab definitions for the marketplace navigation */
const MARKETPLACE_TABS = [
  {
    label: 'Browse',
    href: '/marketplace',
    /** Exact match — only active when pathname is exactly /marketplace */
    exact: true,
  },
  {
    label: 'My Templates',
    href: '/marketplace/my-templates',
    exact: false,
  },
  {
    label: 'Installed',
    href: '/marketplace/installed',
    exact: false,
  },
] as const

// ============================================================================
// MAIN COMPONENT — Wrapped in Suspense for useSearchParams safety
// ============================================================================

/**
 * Marketplace navigation bar with tab links and a create button.
 * Wraps the inner component in Suspense because useSearchParams
 * requires a Suspense boundary in Next.js App Router.
 */
export function MarketplaceNav() {
  return (
    <Suspense fallback={<MarketplaceNavFallback />}>
      <MarketplaceNavInner />
    </Suspense>
  )
}

// ============================================================================
// INNER COMPONENT — Handles search params, tabs, and create wizard
// ============================================================================

/**
 * Inner navigation component that uses useSearchParams for auto-open detection.
 * Renders the tab bar and manages the create wizard dialog state.
 */
function MarketplaceNavInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /** Dialog state for the create template wizard */
  const [showCreateWizard, setShowCreateWizard] = useState(false)

  /**
   * Auto-open the create wizard when ?create=true is in the URL.
   * This supports deep-linking from other parts of the app
   * (e.g., feature context menus with "Save as Template").
   */
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreateWizard(true)
    }
  }, [searchParams])

  return (
    <>
      <div className="border-b border-border">
        <nav className="-mb-px flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {/* Tab Links — border-b-2 active indicator */}
          {MARKETPLACE_TABS.map((tab) => {
            /**
             * Active state detection:
             * - For "Browse" (exact: true): active only when pathname === '/marketplace'
             * - For others (exact: false): active when pathname starts with tab.href
             */
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href)

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  'hover:text-foreground hover:border-border',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
              >
                {tab.label}
              </Link>
            )
          })}

          {/* Create Button — aligned to the right, opens wizard dialog */}
          <div className="ml-auto pl-2">
            <Button
              onClick={() => setShowCreateWizard(true)}
              size="sm"
              variant="ghost"
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </div>
        </nav>
      </div>

      {/* Create Template Wizard — always mounted, visibility controlled by open prop */}
      {organizationId && (
        <TemplateWizardLayout
          open={showCreateWizard}
          mode="create"
          organizationId={organizationId}
          onClose={() => setShowCreateWizard(false)}
        />
      )}
    </>
  )
}

// ============================================================================
// FALLBACK — Skeleton for the Suspense boundary
// ============================================================================

/**
 * Static fallback while useSearchParams resolves.
 * Renders the tab links without active state or create button interactivity.
 */
function MarketplaceNavFallback() {
  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {MARKETPLACE_TABS.map((tab) => (
          <span
            key={tab.href}
            className="whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground"
          >
            {tab.label}
          </span>
        ))}
      </nav>
    </div>
  )
}
