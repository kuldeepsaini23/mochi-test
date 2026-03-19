/**
 * Store Detail Page - Active Organization Pattern
 *
 * WHY: Client component that loads store data for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * ARCHITECTURE:
 * - Client component = instant navigation (no loading.tsx flash)
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Fetches store data client-side with loading state
 * - Uses optimistic UI for all updates
 *
 * PERMISSIONS:
 * - canUpdate: Can edit store details, add/remove products
 * - canDelete: Can delete store
 *
 * SOURCE OF TRUTH: Store, StoreProduct, ActiveOrganization
 */

'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { trpc } from '@/trpc/react-provider'
import { StoreDetail } from './_components/store-detail'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { ContentLayout } from '@/components/global/content-layout'

interface StorePageProps {
  params: Promise<{ storeId: string }>
}

export default function StorePage({ params }: StorePageProps) {
  const { storeId } = use(params)

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()

  // Fetch store data client-side
  const { data: store, isLoading: isLoadingStore } = trpc.stores.getById.useQuery(
    {
      organizationId: activeOrganization?.id || '',
      storeId,
    },
    {
      enabled: !!activeOrganization?.id,
    }
  )

  // Show nothing while checking org (instant if cached)
  if (isLoadingOrg && !activeOrganization) return null

  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  // Check stores:read permission using hook helper
  const hasAccess = hasPermission(permissions.STORES_READ)

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this store.
        </p>
      </div>
    )
  }

  // Show loading state while fetching store
  if (isLoadingStore) {
    return <StoreDetailLoading />
  }

  if (!store) {
    notFound()
  }

  return (
    <StoreDetail
      store={store}
      organizationId={activeOrganization.id}
      userRole={activeOrganization.role}
      userPermissions={activeOrganization.permissions}
    />
  )
}

/**
 * Loading skeleton for store detail page
 * WHY: Show skeleton while store data is being fetched
 * Uses ContentLayout to match the actual page structure
 */
function StoreDetailLoading() {
  return (
    <ContentLayout
      headerActions={
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-8" />
        </div>
      }
    >
      <div className="space-y-6">
        {/* Products heading skeleton */}
        <Skeleton className="h-6 w-32" />

        {/* Toolbar skeleton — search + view button */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-60" />
          <Skeleton className="h-9 w-20" />
        </div>

        {/* Table skeleton — matches the TanStack React Table layout */}
        <div className="rounded-md border bg-background overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 h-11 border-b bg-background">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
              <Skeleton className="h-4 w-4 shrink-0" />
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="h-10 w-10 rounded-md shrink-0" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>

        {/* Pagination skeleton */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </div>
    </ContentLayout>
  )
}
