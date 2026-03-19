/**
 * ============================================================================
 * MY TEMPLATES CONTENT — Client Wrapper for My Templates View
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: MyTemplatesContent, MyTemplatesWrapper
 *
 * WHY: Client component that resolves the active organization, then wraps
 * MyTemplatesView in a TemplateLibraryProvider. The provider is needed because
 * MyTemplatesView reads organizationId from the template library context.
 *
 * HOW: Uses useActiveOrganization hook, shows a loader while resolving, then
 * renders the provider + view. This pattern keeps the page.tsx as a clean
 * server component with just metadata and the content import.
 */

'use client'

import { Loader2 } from 'lucide-react'

import { useActiveOrganization } from '@/hooks/use-active-organization'
import { TemplateLibraryProvider } from '@/components/templates/template-library-context'
import { MyTemplatesView } from '@/components/templates/my-templates-view'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Wrapper that handles org loading state before rendering My Templates.
 * Wraps the view in TemplateLibraryProvider so useTemplateLibrary()
 * inside MyTemplatesView can access the organizationId.
 */
export function MyTemplatesContent() {
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
      <MyTemplatesView />
    </TemplateLibraryProvider>
  )
}
