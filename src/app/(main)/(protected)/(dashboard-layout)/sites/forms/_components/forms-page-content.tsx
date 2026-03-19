/**
 * Forms Page Content - Active Organization Pattern
 *
 * WHY: Client component that displays forms for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * This component serves as the bridge between:
 * - ContentLayout header (where "Add Form" and "New Folder" buttons live)
 * - FormsTab (where dialog state and form logic lives)
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSIONS:
 * - forms:read - Can view forms
 * - forms:create - Show "Add Form" and "New Folder" buttons in header
 * - forms:update - Allow editing forms
 * - forms:delete - Allow deleting forms and folders
 *
 * SOURCE OF TRUTH: Form, FormFolder, ActiveOrganization
 */

'use client'

import { useCallback, useState } from 'react'
import { ContentLayout } from '@/components/global/content-layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, FolderPlus } from 'lucide-react'
import { FormsTab } from './forms-tab'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'

/**
 * Main forms page content component with client-side data fetching
 * No props needed - everything is fetched client-side with caching
 */
export function FormsPageContent() {
  // Dialog opener callbacks registered by child component
  const [openFormDialog, setOpenFormDialog] = useState<(() => void) | null>(null)
  const [openFolderDialog, setOpenFolderDialog] = useState<(() => void) | null>(null)

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================
  const { activeOrganization, isLoading, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''
  const userRole = activeOrganization?.role ?? ''
  const userPermissions = activeOrganization?.permissions ?? []

  // Callback for child to register form dialog opener
  const handleRegisterFormDialog = useCallback((fn: () => void) => {
    setOpenFormDialog(() => fn)
  }, [])

  // Callback for child to register folder dialog opener
  const handleRegisterFolderDialog = useCallback((fn: () => void) => {
    setOpenFolderDialog(() => fn)
  }, [])

  // ============================================================================
  // PERMISSION CHECKS - Using hasPermission helper from hook
  // ============================================================================
  const hasReadAccess = hasPermission(permissions.FORMS_READ)
  const canCreate = hasPermission(permissions.FORMS_CREATE)

  // ============================================================================
  // LOADING STATE - Show skeleton while organization data is being fetched
  // ============================================================================
  if (isLoading && !activeOrganization) {
    return <FormsPageSkeleton />
  }

  // ============================================================================
  // NO ORGANIZATION - User doesn't belong to any organization
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
  // NO ACCESS - User doesn't have forms:read permission
  // ============================================================================
  if (!hasReadAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view forms
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
  // MAIN CONTENT - User has access, render the forms interface
  // ============================================================================
  return (
    <ContentLayout
      headerActions={
        canCreate && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openFolderDialog?.()}
              className="gap-1.5"
            >
              <FolderPlus className="h-4 w-4" />
              New Folder
            </Button>
            <FeatureGate feature="forms.limit">
              <Button
                size="sm"
                onClick={() => openFormDialog?.()}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add Form
              </Button>
            </FeatureGate>
          </div>
        )
      }
    >
      <FormsTab
        organizationId={organizationId}
        userRole={userRole}
        userPermissions={userPermissions}
        onRegisterOpenFormDialog={handleRegisterFormDialog}
        onRegisterOpenFolderDialog={handleRegisterFolderDialog}
      />
    </ContentLayout>
  )
}

// ============================================================================
// LOADING SKELETON - Matches the page layout structure
// ============================================================================

/**
 * Loading skeleton for forms page
 * WHY: Show skeleton that matches the page structure during initial load
 * Provides visual feedback while organization data is being fetched
 */
function FormsPageSkeleton() {
  return (
    <ContentLayout
      headerActions={
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28" /> {/* New Folder button */}
          <Skeleton className="h-8 w-24" /> {/* Add Form button */}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Search and filters skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>

        {/* Forms grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}
