/**
 * ============================================================================
 * INSTALLED TEMPLATES CONTENT — Client Wrapper for Installed Templates View
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: InstalledContent, InstalledTemplatesWrapper
 *
 * WHY: Client component that resolves the active organization, then wraps
 * InstalledTemplatesView in a TemplateLibraryProvider. The provider is needed
 * because InstalledTemplatesView reads organizationId from the template
 * library context for fetching installed template data.
 *
 * HOW: Uses useActiveOrganization hook, shows a loader while resolving, then
 * renders the provider + view. Same wrapper pattern as MyTemplatesContent
 * to keep the installed/page.tsx as a clean server component.
 */

'use client'

import { Loader2 } from 'lucide-react'

import { useActiveOrganization } from '@/hooks/use-active-organization'
import { TemplateLibraryProvider } from '@/components/templates/template-library-context'
import { InstalledTemplatesView } from '@/components/templates/installed-templates-view'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Wrapper that handles org loading state before rendering Installed Templates.
 * Wraps the view in TemplateLibraryProvider so useTemplateLibrary()
 * inside InstalledTemplatesView can access the organizationId.
 */
export function InstalledContent() {
  const { activeOrganization, isLoading } = useActiveOrganization()

  /** Show centered spinner while the organization is loading */
  if (isLoading || !activeOrganization) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <TemplateLibraryProvider organizationId={activeOrganization.id}>
      <InstalledTemplatesView />
    </TemplateLibraryProvider>
  )
}
