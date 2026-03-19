/**
 * ============================================================================
 * TEMPLATE LIBRARY — NAVIGATION HOOK & TRIGGER
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: UseTemplateLibrary, TemplateLibraryTrigger,
 * TemplateLibraryButton, SaveAsTemplate, TemplateLibraryNav
 *
 * WHY: Provides a simple API for navigating to the dashboard marketplace
 * page from anywhere in the app. Replaces the old modal-based approach —
 * public browsing lives at /templates, dashboard management at /marketplace.
 *
 * USAGE EXAMPLES:
 *
 * 1. BROWSE MODE (sidebar link):
 *    <TemplateLibraryTrigger>
 *      <Button>Browse Templates</Button>
 *    </TemplateLibraryTrigger>
 *
 * 2. CREATE MODE with preselected feature (context menus, builder toolbars):
 *    <TemplateLibraryTrigger
 *      preselectedFeature={{ featureType: 'FORM', featureId: formId }}
 *    >
 *      <DropdownMenuItem>Save as Template</DropdownMenuItem>
 *    </TemplateLibraryTrigger>
 *
 * 3. HOOK (for programmatic navigation):
 *    const { navigateToTemplates } = useTemplateLibraryNavigation()
 *    // Later: navigateToTemplates()
 *    // Or with create wizard: navigateToTemplates({ create: true, featureType: 'WEBSITE', featureId: '...' })
 *    // NOTE: navigateToTemplates goes to /marketplace (dashboard) not /templates (public)
 */

'use client'

import { useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import type { TemplateCategory } from '@/lib/templates/types'

// ============================================================================
// HOOK — For programmatic navigation to the templates page
// ============================================================================

interface NavigateOptions {
  /** Open the create wizard on arrival */
  create?: boolean
  /** Pre-select a feature type for the create wizard */
  featureType?: TemplateCategory
  /** Pre-select a feature ID for the create wizard */
  featureId?: string
}

/**
 * Hook for programmatic navigation to the templates page.
 * Replaces the old useTemplateLibraryModal hook.
 *
 * @example
 * const { navigateToTemplates } = useTemplateLibraryNavigation()
 * navigateToTemplates() // browse
 * navigateToTemplates({ create: true, featureType: 'WEBSITE', featureId: 'abc' }) // create wizard
 */
export function useTemplateLibraryNavigation() {
  const router = useRouter()

  /**
   * Navigate to the dashboard marketplace page (/marketplace).
   * When create options are provided, adds query params so the page
   * can auto-open the create wizard with the feature preselected.
   */
  const navigateToTemplates = useCallback(
    (options?: NavigateOptions) => {
      const params = new URLSearchParams()

      if (options?.create) {
        params.set('create', 'true')
      }
      if (options?.featureType) {
        params.set('featureType', options.featureType)
      }
      if (options?.featureId) {
        params.set('featureId', options.featureId)
      }

      const query = params.toString()
      router.push(`/marketplace${query ? `?${query}` : ''}`)
    },
    [router]
  )

  return { navigateToTemplates }
}

// ============================================================================
// TRIGGER — Reusable wrapper that navigates to templates on click
// ============================================================================

interface TemplateLibraryTriggerProps {
  /** The clickable element that triggers navigation */
  children: ReactNode
  /** Pre-select a feature for "Save as Template" flows */
  preselectedFeature?: { featureType: TemplateCategory; featureId: string }
}

/**
 * Reusable trigger component that wraps any clickable element.
 * Clicking the child navigates to the dashboard templates page.
 *
 * For "Save as Template" flows, pass preselectedFeature to navigate
 * with query params that auto-open the create wizard.
 */
export function TemplateLibraryTrigger({
  children,
  preselectedFeature,
}: TemplateLibraryTriggerProps) {
  /**
   * Build the target URL — always points to /marketplace (dashboard route).
   * Create flows include query params for auto-opening the wizard.
   */
  const href = preselectedFeature
    ? `/marketplace?create=true&featureType=${preselectedFeature.featureType}&featureId=${preselectedFeature.featureId}`
    : '/marketplace'

  return (
    <Link href={href} className="cursor-pointer">
      {children}
    </Link>
  )
}
