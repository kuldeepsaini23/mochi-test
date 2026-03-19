/**
 * Transactions Tab Component - Active Organization Pattern
 *
 * WHY: Main container for transaction management with table layout
 * HOW: Uses TransactionsTable for listing, navigates to transaction page for details
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 * - Server-side pagination with search and filters
 * - Table-based design with optimistic updates
 * - Navigates to /payments/transactions/[id] for transaction details
 *
 * PERMISSIONS:
 * - canRead: View transactions (checked via hasPermission)
 * - canUpdate: Update transaction status
 * - canCancel: Cancel transactions
 * - canRefund: Process refunds
 *
 * SOURCE OF TRUTH: Transaction, ActiveOrganization
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDebounce } from '@/hooks/use-debounce'
import { trpc } from '@/trpc/react-provider'
import { TransactionsTable, type TransactionWithRelations } from './transactions-table'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import type { TransactionPaymentStatus } from '@/generated/prisma'
import TransactionsLoading from '../loading'

/**
 * TransactionsTab component with integrated organization caching
 * No props required - fetches organization data internally with aggressive caching
 */
export function TransactionsTab() {
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

  // Query transactions with pagination (only when we have an organization and access)
  const { data, isLoading, isFetching } = trpc.transactions.list.useQuery(
    {
      organizationId,
      search: debouncedSearch || undefined,
      page,
      pageSize,
      paymentStatus: statusFilter.length > 0 ? statusFilter : undefined,
    },
    {
      enabled: !!organizationId && hasAccess,
      placeholderData: (previousData) => previousData,
    }
  )

  // Memoize transactions data for stable reference
  const transactions = useMemo(() => data?.transactions ?? [], [data?.transactions])
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

  // Navigate to transaction detail page
  const handleTransactionClick = useCallback((transaction: TransactionWithRelations) => {
    router.push(`/payments/transactions/${transaction.id}`)
  }, [router])

  // Show loading skeleton while fetching organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <TransactionsLoading />
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
          You do not have permission to view transactions.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Transactions</h2>
          <p className="text-sm text-muted-foreground">
            View and manage all payment transactions for your organization
          </p>
        </div>
      </div>

      {/* Transactions Table */}
      <TransactionsTable
        transactions={transactions}
        isLoading={isLoading}
        isFetching={isFetching}
        search={search}
        onSearchChange={handleSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        statusCounts={statusCounts}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        total={total}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onTransactionClick={handleTransactionClick}
      />
    </>
  )
}
