/**
 * STORAGE PAGE CLIENT COMPONENT - Active Organization Pattern
 *
 * Client-side wrapper for the storage page that handles:
 * 1. Organization context via useActiveOrganization hook
 * 2. Permission checking (storage:read)
 * 3. Loading states with skeleton UI
 * 4. Rendering the StorageBrowser component
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * Search Keywords: SOURCE OF TRUTH, STORAGE CLIENT, ACTIVE ORGANIZATION
 */

'use client'

import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { ContentLayout } from '@/components/global/content-layout'
import { StorageBrowser } from '@/components/storage-browser'

// ============================================================================
// LOADING SKELETON
// ============================================================================

/**
 * StoragePageSkeleton - Loading placeholder that matches the page layout
 * Shown only on first load; subsequent navigations render from cache
 */
function StoragePageSkeleton() {
  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Header skeleton - matches storage header layout */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>

        {/* Grid skeleton - matches file/folder grid layout */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoragePageClient() {
  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check if user has storage:read permission
   * Uses hook's hasPermission helper (owners have full access)
   */
  const hasAccess = hasPermission(permissions.STORAGE_READ)

  // ============================================================================
  // EARLY RETURNS - Handle loading and error states
  // ============================================================================

  /**
   * Show skeleton only on initial load when no cached data exists
   * On re-navigation, cached data is available immediately (no skeleton)
   */
  if (isLoading && !activeOrganization) {
    return <StoragePageSkeleton />
  }

  /**
   * No organization found - user may not be a member of any organization
   */
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

  /**
   * Permission denied - user lacks storage:read permission
   */
  if (!hasAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view storage
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                storage:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // MAIN RENDER - Storage browser with full functionality
  // ============================================================================

  return (
    <ContentLayout>
      <StorageBrowser
        organizationId={organizationId}
        mode="browse"
        showTrash={true}
        showUpload={true}
        showCreateFolder={true}
      />
    </ContentLayout>
  )
}
