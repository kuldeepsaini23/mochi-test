/**
 * Leads Page Content - Active Organization Pattern
 *
 * WHY: Client wrapper that connects AddLeadButton in header with LeadManager's dialog
 * HOW: Uses useActiveOrganization hook for org context
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSIONS:
 * - leads:read - Required to view this page
 * - leads:create - Show "Add Lead" button
 * - leads:update - Allow editing leads
 * - leads:delete - Allow deleting leads
 *
 * SOURCE OF TRUTH: Lead, ActiveOrganization
 */

'use client'

import { useState, useCallback } from 'react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/global/content-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadManager } from './lead-manager'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'

/**
 * Loading skeleton component for the leads page
 * Matches the visual layout of the actual content for smooth transitions
 */
function LeadsPageSkeleton() {
  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Section Header Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Search and Filters Skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Table Skeleton */}
        <div className="space-y-2">
          {/* Table Header */}
          <Skeleton className="h-12 w-full" />
          {/* Table Rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}

export function LeadsPageContent() {
  const [openDialogFn, setOpenDialogFn] = useState<(() => void) | null>(null)

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.LEADS_READ)

  /**
   * Register the dialog open function from LeadManager
   * This allows the header button to trigger the dialog
   */
  const handleRegisterOpenDialog = useCallback((fn: () => void) => {
    setOpenDialogFn(() => fn)
  }, [])

  /**
   * Permission checks for CRUD operations using hasPermission helper
   */
  const canCreate = hasPermission(permissions.LEADS_CREATE)
  const canUpdate = hasPermission(permissions.LEADS_UPDATE)
  const canDelete = hasPermission(permissions.LEADS_DELETE)

  /**
   * Early return: Show skeleton during initial load
   * Only shows if data is loading AND we don't have cached data
   */
  if (isLoadingOrg && !activeOrganization) {
    return <LeadsPageSkeleton />
  }

  /**
   * Early return: No organization found
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
   * Early return: User doesn't have leads:read permission
   */
  if (!hasAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view leads
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                leads:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  /**
   * Main render: Leads page with header action and lead manager
   */
  return (
    <ContentLayout
      headerActions={
        canCreate ? (
          <FeatureGate feature="leads.limit">
            <Button onClick={() => openDialogFn?.()}>
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Lead
            </Button>
          </FeatureGate>
        ) : null
      }
    >
      <LeadManager
        organizationId={organizationId}
        onRegisterOpenDialog={handleRegisterOpenDialog}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </ContentLayout>
  )
}
