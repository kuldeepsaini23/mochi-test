/**
 * Transaction Detail Page Component - Active Organization Pattern
 *
 * WHY: Wrapper component that handles organization and transaction data fetching
 * HOW: Uses useActiveOrganization hook for org context, then fetches transaction client-side
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 * - Fetches transaction data client-side with loading states
 * - Renders TransactionDetail component with all necessary props
 *
 * PERMISSIONS:
 * - canUpdate: Can update transaction status
 * - canCancel: Can cancel the transaction
 * - canRefund: Can process refunds
 *
 * SOURCE OF TRUTH: Transaction, ActiveOrganization
 */

'use client'

import { notFound } from 'next/navigation'
import { trpc } from '@/trpc/react-provider'
import { TransactionDetail } from './transaction-detail'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import TransactionDetailLoading from '../loading'

interface TransactionDetailPageProps {
  transactionId: string
}

/**
 * TransactionDetailPage component with integrated organization caching
 * Only requires transactionId prop - fetches organization data internally with aggressive caching
 */
export function TransactionDetailPage({ transactionId }: TransactionDetailPageProps) {
  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Extract role and permissions from active organization for child components
   */
  const userRole = activeOrganization?.role ?? ''
  const userPermissions = activeOrganization?.permissions ?? []

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.TRANSACTIONS_READ)

  // Fetch transaction data client-side (only when we have an organization and access)
  const { data: transaction, isLoading: isLoadingTransaction } =
    trpc.transactions.getById.useQuery(
      {
        organizationId,
        transactionId,
      },
      {
        enabled: !!organizationId && hasAccess,
      }
    )

  // Show loading skeleton while fetching organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <TransactionDetailLoading />
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
          You do not have permission to view this transaction.
        </p>
      </div>
    )
  }

  // Show loading state while fetching transaction
  if (isLoadingTransaction) {
    return <TransactionDetailLoading />
  }

  // Handle transaction not found
  if (!transaction) {
    notFound()
  }

  // Render transaction detail with all organization data
  return (
    <TransactionDetail
      transaction={transaction}
      organizationId={organizationId}
      userRole={userRole}
      userPermissions={userPermissions}
    />
  )
}
