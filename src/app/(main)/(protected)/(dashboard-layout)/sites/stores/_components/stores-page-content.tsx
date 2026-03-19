/**
 * Stores Page Content - Active Organization Pattern
 *
 * WHY: Client component that displays stores for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * This is the main container for the stores list view with:
 * - Header with "Add Store" button
 * - StoresTab with table, search, and pagination
 * - Create/edit dialog
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSIONS:
 * - stores:read - Can view stores
 * - stores:create - Show "Add Store" button in header
 * - stores:update - Allow editing stores
 * - stores:delete - Allow deleting stores
 *
 * SOURCE OF TRUTH: Store, StoreProduct, ActiveOrganization
 */

'use client'

import { useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/global/content-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { StoresTab } from './stores-tab'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'

/**
 * Main stores page content component with client-side data fetching
 * No props needed - everything is fetched client-side with caching
 */
export function StoresPageContent() {
  // Track the dialog opener function from StoresTab
  const [openDialogFn, setOpenDialogFn] = useState<(() => void) | null>(null)

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================
  const { activeOrganization, isLoading, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  // Callback to register the dialog opener from StoresTab
  const handleRegisterOpenDialog = useCallback((fn: () => void) => {
    setOpenDialogFn(() => fn)
  }, [])

  // ============================================================================
  // PERMISSION CHECKS - Using hasPermission helper from hook
  // ============================================================================
  const hasReadAccess = hasPermission(permissions.STORES_READ)
  const canCreate = hasPermission(permissions.STORES_CREATE)
  const canUpdate = hasPermission(permissions.STORES_UPDATE)
  const canDelete = hasPermission(permissions.STORES_DELETE)

  // ============================================================================
  // LOADING STATE - Show skeleton while organization data is being fetched
  // ============================================================================
  if (isLoading && !activeOrganization) {
    return <StoresPageSkeleton />
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
  // NO ACCESS - User doesn't have stores:read permission
  // ============================================================================
  if (!hasReadAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view stores
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                stores:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // MAIN CONTENT - User has access, render the stores interface
  // ============================================================================
  return (
    <ContentLayout
      headerActions={
        canCreate ? (
          <FeatureGate feature="stores.limit">
            <Button size="sm" onClick={() => openDialogFn?.()}>
              <Plus className="size-4 mr-2" />
              Add Store
            </Button>
          </FeatureGate>
        ) : null
      }
    >
      <StoresTab
        organizationId={organizationId}
        onRegisterOpenDialog={handleRegisterOpenDialog}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </ContentLayout>
  )
}

// ============================================================================
// LOADING SKELETON - Matches the page layout structure
// ============================================================================

/**
 * Loading skeleton for stores page
 * WHY: Show skeleton that matches the page structure during initial load
 * Provides visual feedback while organization data is being fetched
 */
function StoresPageSkeleton() {
  return (
    <ContentLayout
      headerActions={
        <Skeleton className="h-8 w-28" /> // Add Store button skeleton
      }
    >
      <div className="space-y-5">
        {/* Search bar skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
        </div>

        {/* Card grid skeleton — matches the card layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <Skeleton className="aspect-[16/9] w-full rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}
