/**
 * Websites Page Content - Active Organization Pattern
 *
 * WHY: Client component that displays websites for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * PATTERN: Same architecture as LeadsPageContent - separates header actions from content
 *          to maintain consistent layout across all dashboard pages
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSIONS:
 * - websites:read - Can view websites
 * - websites:create - Show "Add Website" button in header
 * - websites:update - Allow editing websites
 * - websites:delete - Allow deleting websites
 * - websites:publish - Allow publish/unpublish actions
 *
 * SOURCE OF TRUTH: Website, ActiveOrganization
 */

'use client'

import { useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/global/content-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { WebsitesTab } from './websites-tab'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'

/**
 * Main websites page content component with client-side data fetching
 * No props needed - everything is fetched client-side with caching
 */
export function WebsitesPageContent() {
  // State to hold the dialog open function from WebsitesTab
  const [openDialogFn, setOpenDialogFn] = useState<(() => void) | null>(null)

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================
  const { activeOrganization, isLoading, hasPermission, isOwner } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''
  const userRole = activeOrganization?.role ?? ''
  const userPermissions = activeOrganization?.permissions ?? []

  // Callback for WebsitesTab to register its dialog opener
  const handleRegisterOpenDialog = useCallback((fn: () => void) => {
    setOpenDialogFn(() => fn)
  }, [])

  // ============================================================================
  // PERMISSION CHECKS - Using hasPermission helper from hook
  // ============================================================================
  const hasReadAccess = hasPermission(permissions.WEBSITES_READ)
  const canCreate = hasPermission(permissions.WEBSITES_CREATE)

  // ============================================================================
  // LOADING STATE - Show skeleton while organization data is being fetched
  // ============================================================================
  if (isLoading && !activeOrganization) {
    return <WebsitesPageSkeleton />
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
  // NO ACCESS - User doesn't have websites:read permission
  // ============================================================================
  if (!hasReadAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view websites
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                websites:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // MAIN CONTENT - User has access, render the websites interface
  // ============================================================================
  return (
    <ContentLayout
      headerActions={
        canCreate ? (
          <FeatureGate feature="websites.limit">
            <Button onClick={() => openDialogFn?.()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Website
            </Button>
          </FeatureGate>
        ) : null
      }
    >
      <WebsitesTab
        organizationId={organizationId}
        userRole={userRole}
        userPermissions={userPermissions}
        onRegisterOpenDialog={handleRegisterOpenDialog}
      />
    </ContentLayout>
  )
}

// ============================================================================
// LOADING SKELETON - Matches the page layout structure
// ============================================================================

/**
 * Loading skeleton for websites page
 * WHY: Show skeleton that matches the page structure during initial load
 * Provides visual feedback while organization data is being fetched
 */
function WebsitesPageSkeleton() {
  return (
    <ContentLayout
      headerActions={
        <Skeleton className="h-9 w-32" /> // Add Website button skeleton
      }
    >
      <div className="space-y-6">
        {/* Search and filters skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>

        {/* Websites grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}
