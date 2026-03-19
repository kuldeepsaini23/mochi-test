/**
 * Subscriptions Tab Component - Filtered View of Recurring Transactions
 *
 * WHY: Provides a dedicated view for managing recurring subscriptions
 * HOW: Reuses the transactions.list tRPC endpoint with billingType=RECURRING filter
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Filters by billingType=RECURRING to show only subscription transactions
 * - Navigates to /payments/subscriptions/[id] for dedicated subscription detail view
 * - Permission-based access control via hasPermission helper
 *
 * SOURCE OF TRUTH: TransactionWithRelations, ActiveOrganization
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDebounce } from '@/hooks/use-debounce'
import { trpc } from '@/trpc/react-provider'
import { SubscriptionsTable } from './subscriptions-table'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import type { TransactionPaymentStatus } from '@/generated/prisma'
import type { TransactionWithRelations } from '@/types/transaction'

/**
 * Subscription-relevant status options for filtering.
 * Only shows statuses that apply to recurring subscriptions.
 */
const SUBSCRIPTION_STATUSES: TransactionPaymentStatus[] = [
  'TRIALING',
  'ACTIVE',
  'CANCELED',
  'FAILED',
  'DISPUTED',
]

/**
 * SubscriptionsTab component — fetches RECURRING transactions from tRPC
 * No props required — fetches organization data internally with aggressive caching
 */
export function SubscriptionsTab() {
  const router = useRouter()

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
  const hasAccess = hasPermission(permissions.TRANSACTIONS_READ)

  // Search and filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TransactionPaymentStatus[]>([])
  const debouncedSearch = useDebounce(search, 300)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Reset page when search/filter changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter])

  /**
   * Query transactions filtered by billingType=RECURRING
   * This reuses the same list endpoint but narrows to subscription-only data
   */
  const { data, isLoading, isFetching } = trpc.transactions.list.useQuery(
    {
      organizationId,
      search: debouncedSearch || undefined,
      page,
      pageSize,
      billingType: 'RECURRING',
      paymentStatus: statusFilter.length > 0 ? statusFilter : undefined,
    },
    {
      enabled: !!organizationId && hasAccess,
      placeholderData: (previousData) => previousData,
    }
  )

  // Memoize data for stable reference
  const subscriptions = useMemo(() => data?.transactions ?? [], [data?.transactions])
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0
  const statusCounts = data?.statusCounts ?? {}

  // Handlers
  const handleSearch = useCallback((value: string) => {
    setSearch(value)
  }, [])

  const handleStatusFilterChange = useCallback((statuses: TransactionPaymentStatus[]) => {
    setStatusFilter(statuses)
  }, [])

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
  }, [])

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize)
    setPage(1)
  }, [])

  /**
   * Navigate to the dedicated subscription detail page when clicking a subscription row.
   * Uses the subscription-specific detail view for a subscription-focused experience.
   */
  const handleSubscriptionClick = useCallback((transaction: TransactionWithRelations) => {
    router.push(`/payments/subscriptions/${transaction.id}`)
  }, [router])

  // Show loading state while fetching organization data
  if (isLoadingOrg && !activeOrganization) {
    return <SubscriptionsLoadingSkeleton />
  }

  // Handle no organization found
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  // Handle no access permission
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view subscriptions.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            View and manage all recurring subscriptions for your organization
          </p>
        </div>
      </div>

      {/* Subscriptions Table */}
      <SubscriptionsTable
        subscriptions={subscriptions}
        isLoading={isLoading}
        isFetching={isFetching}
        search={search}
        onSearchChange={handleSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        statusCounts={statusCounts}
        availableStatuses={SUBSCRIPTION_STATUSES}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        total={total}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSubscriptionClick={handleSubscriptionClick}
      />
    </>
  )
}

/**
 * Inline loading skeleton matching the subscriptions layout.
 * Prevents layout shift during initial organization data fetch.
 */
function SubscriptionsLoadingSkeleton() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            View and manage all recurring subscriptions for your organization
          </p>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-60 bg-muted animate-pulse rounded-md" />
            <div className="h-9 w-24 bg-muted animate-pulse rounded-md" />
            <div className="h-9 w-20 bg-muted animate-pulse rounded-md" />
          </div>
        </div>
        <div className="overflow-hidden rounded-md border bg-background">
          <div className="space-y-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
