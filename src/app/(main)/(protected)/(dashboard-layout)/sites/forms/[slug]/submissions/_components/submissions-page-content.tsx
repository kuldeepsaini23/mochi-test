/**
 * Submissions Page Content - Active Organization Pattern
 *
 * WHY: Client component that displays form submissions for a specific form
 * HOW: Resolves slug → formId via tRPC getBySlug, then renders SubmissionsTab
 *
 * ROUTE: /sites/forms/[slug]/submissions
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Resolves form by slug (slug-based URL like the edit route)
 * - Shows back navigation to the forms list
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSIONS:
 * - forms:read - Can view submissions
 * - forms:delete - Allow deleting submissions
 *
 * SOURCE OF TRUTH: FormSubmission, Form, ActiveOrganization
 */

'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ContentLayout } from '@/components/global/content-layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SubmissionsTab } from './submissions-tab'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES
// ============================================================================

interface SubmissionsPageContentProps {
  slug: string
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Main submissions page content component.
 * Resolves form by slug, handles org loading, permission checks,
 * and renders SubmissionsTab with the resolved formId.
 */
export function SubmissionsPageContent({ slug }: SubmissionsPageContentProps) {
  const router = useRouter()

  // Get active organization for permissions and org scoping
  const { activeOrganization, isLoading, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''
  const userRole = activeOrganization?.role ?? ''
  const userPermissions = activeOrganization?.permissions ?? []

  // Resolve slug → form (need the formId for the submissions query)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: form, isLoading: isFormLoading } = (trpc.forms.getBySlug as any).useQuery(
    { organizationId, slug },
    { enabled: !!organizationId }
  )

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if ((isLoading && !activeOrganization) || isFormLoading) {
    return <SubmissionsPageSkeleton />
  }

  // ============================================================================
  // NO ORGANIZATION
  // ============================================================================
  if (!activeOrganization) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // NO ACCESS
  // ============================================================================
  if (!hasPermission(permissions.FORMS_READ)) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view form submissions
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                forms:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // FORM NOT FOUND
  // ============================================================================
  if (!form) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">Form not found</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/sites/forms')}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Forms
            </Button>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // MAIN CONTENT
  // ============================================================================
  return (
    <ContentLayout
      headerActions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/sites/forms')}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Forms
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{form.name} — Submissions</h2>
          <p className="text-sm text-muted-foreground">
            View and manage responses submitted to this form.
          </p>
        </div>

        <SubmissionsTab
          organizationId={organizationId}
          formId={form.id}
          userRole={userRole}
          userPermissions={userPermissions}
        />
      </div>
    </ContentLayout>
  )
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

/**
 * Loading skeleton for submissions page.
 * Matches the page layout structure during initial load.
 */
function SubmissionsPageSkeleton() {
  return (
    <ContentLayout
      headerActions={<Skeleton className="h-8 w-32" />}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="rounded-md border">
          <div className="p-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </ContentLayout>
  )
}
