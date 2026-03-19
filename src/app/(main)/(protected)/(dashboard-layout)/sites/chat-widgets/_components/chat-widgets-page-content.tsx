/**
 * Chat Widgets Page Content - Active Organization Pattern
 *
 * WHY: Client component that displays chat widgets for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * This is the main container for the chat widgets list view with:
 * - Header with "Add Widget" button
 * - ChatWidgetsTab with grid, search, and pagination
 * - Create/edit dialog
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSIONS:
 * - stores:read - Can view chat widgets (using store permissions as placeholder)
 * - stores:create - Show "Add Widget" button in header
 * - stores:update - Allow editing chat widgets
 * - stores:delete - Allow deleting chat widgets
 *
 * SOURCE OF TRUTH: ChatWidget, ActiveOrganization
 */

'use client'

import { useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/global/content-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { ChatWidgetsTab } from './chat-widgets-tab'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'

/**
 * Main chat widgets page content component with client-side data fetching
 * No props needed - everything is fetched client-side with caching
 */
export function ChatWidgetsPageContent() {
  // Track the dialog opener function from ChatWidgetsTab
  const [openDialogFn, setOpenDialogFn] = useState<(() => void) | null>(null)

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================
  const { activeOrganization, isLoading, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  // Callback to register the dialog opener from ChatWidgetsTab
  const handleRegisterOpenDialog = useCallback((fn: () => void) => {
    setOpenDialogFn(() => fn)
  }, [])

  // ============================================================================
  // PERMISSION CHECKS - Using hasPermission helper from hook
  // Using store permissions as placeholder until we add chat widget permissions
  // ============================================================================
  const hasReadAccess = hasPermission(permissions.STORES_READ)
  const canCreate = hasPermission(permissions.STORES_CREATE)
  const canUpdate = hasPermission(permissions.STORES_UPDATE)
  const canDelete = hasPermission(permissions.STORES_DELETE)

  // ============================================================================
  // LOADING STATE - Show skeleton while organization data is being fetched
  // ============================================================================
  if (isLoading && !activeOrganization) {
    return <ChatWidgetsPageSkeleton />
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
  // NO ACCESS - User doesn't have permission to view chat widgets
  // ============================================================================
  if (!hasReadAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view chat widgets
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the appropriate
              permissions.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // MAIN CONTENT - User has access, render the chat widgets interface
  // ============================================================================
  return (
    <ContentLayout
      headerActions={
        canCreate ? (
          <FeatureGate feature="chat_widgets.limit">
            <Button size="sm" onClick={() => openDialogFn?.()}>
              <Plus className="size-4 mr-2" />
              Add Widget
            </Button>
          </FeatureGate>
        ) : null
      }
    >
      <ChatWidgetsTab
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
 * Loading skeleton for chat widgets page
 * WHY: Show skeleton that matches the page structure during initial load
 * Provides visual feedback while organization data is being fetched
 */
function ChatWidgetsPageSkeleton() {
  return (
    <ContentLayout
      headerActions={
        <Skeleton className="h-8 w-28" /> // Add Widget button skeleton
      }
    >
      <div className="space-y-6">
        {/* Search and filters skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>

        {/* Chat widgets grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}
