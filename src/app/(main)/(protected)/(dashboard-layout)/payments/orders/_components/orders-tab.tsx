/**
 * Orders Tab Component - Active Organization Pattern
 *
 * WHY: Main container for order fulfillment management with table layout
 * HOW: Uses OrdersTable for listing, navigates to order page for details
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 * - Server-side pagination with search and filters
 * - Table-based design with optimistic updates
 * - Navigates to /payments/orders/[id] for order details
 *
 * IMPORTANT: Orders are NOT Transactions!
 * Orders are specifically for e-commerce products that require fulfillment.
 * A Transaction (payment record) gets attached to an Order.
 *
 * PERMISSIONS:
 * - canRead: View orders (uses TRANSACTIONS_READ permission)
 * - canUpdate: Update fulfillment status
 *
 * SOURCE OF TRUTH: Order model (not Transaction)
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDebounce } from '@/hooks/use-debounce'
import { trpc } from '@/trpc/react-provider'
import { OrdersTable } from './orders-table'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import type { FulfillmentStatus, OrderStatus } from '@/generated/prisma'
import OrdersLoading from '../loading'

/**
 * OrdersTab component with integrated organization caching
 * No props required - fetches organization data internally with aggressive caching
 */
export function OrdersTab() {
  const router = useRouter()

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permission using hook's hasPermission helper
   * Orders use TRANSACTIONS_READ permission
   */
  const hasAccess = hasPermission(permissions.TRANSACTIONS_READ)

  // Search and filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus[]>([])
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentStatus[]>([])
  const debouncedSearch = useDebounce(search, 300)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Reset page when search/filter changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, fulfillmentFilter])

  /**
   * Query orders with pagination
   * Uses the new orders router that queries the Order model
   */
  const { data, isLoading, isFetching } = trpc.orders.list.useQuery(
    {
      organizationId,
      search: debouncedSearch || undefined,
      page,
      pageSize,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      fulfillmentStatus: fulfillmentFilter.length > 0 ? fulfillmentFilter : undefined,
    },
    {
      enabled: !!organizationId && hasAccess,
      placeholderData: (previousData) => previousData,
    }
  )

  const orders = data?.orders ?? []
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0
  const statusCounts = data?.statusCounts ?? {}
  const fulfillmentCounts = data?.fulfillmentCounts ?? {}

  // Handlers
  const handleSearch = useCallback((value: string) => {
    setSearch(value)
  }, [])

  const handleStatusFilterChange = useCallback((statuses: OrderStatus[]) => {
    setStatusFilter(statuses)
  }, [])

  const handleFulfillmentFilterChange = useCallback((statuses: FulfillmentStatus[]) => {
    setFulfillmentFilter(statuses)
  }, [])

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
  }, [])

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize)
    setPage(1)
  }, [])

  // Navigate to order detail page
  const handleOrderClick = useCallback(
    (orderId: string) => {
      router.push(`/payments/orders/${orderId}`)
    },
    [router]
  )

  // Show loading skeleton while fetching organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <OrdersLoading />
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
          You do not have permission to view orders.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Orders</h2>
          <p className="text-sm text-muted-foreground">
            Manage order fulfillment and tracking for your e-commerce customers
          </p>
        </div>
      </div>

      {/* Orders Table */}
      <OrdersTable
        orders={orders}
        isLoading={isLoading}
        isFetching={isFetching}
        search={search}
        onSearchChange={handleSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        fulfillmentFilter={fulfillmentFilter}
        onFulfillmentFilterChange={handleFulfillmentFilterChange}
        statusCounts={statusCounts}
        fulfillmentCounts={fulfillmentCounts}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        total={total}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onOrderClick={handleOrderClick}
      />
    </>
  )
}
