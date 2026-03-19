/**
 * Subscription Detail Page Component — Active Organization Pattern
 *
 * WHY: Wrapper component that handles organization context and data fetching for subscription detail.
 * HOW: Uses useActiveOrganization hook for org context, then fetches transaction client-side.
 *
 * Follows the exact same pattern as TransactionDetailPage:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Permission-based access control via hasPermission helper
 * - Fetches transaction data client-side with loading states
 * - Renders SubscriptionDetail component with all necessary props
 *
 * SOURCE OF TRUTH KEYWORDS: SubscriptionDetailPage, ActiveOrganization
 */

'use client'

import { notFound } from 'next/navigation'
import { trpc } from '@/trpc/react-provider'
import { SubscriptionDetail } from './subscription-detail'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import SubscriptionDetailLoading from '../loading'

interface SubscriptionDetailPageProps {
  subscriptionId: string
}

/**
 * SubscriptionDetailPage — fetches org context and transaction data,
 * then renders the SubscriptionDetail component.
 * Only requires subscriptionId prop — everything else is fetched internally.
 */
export function SubscriptionDetailPage({ subscriptionId }: SubscriptionDetailPageProps) {
  /**
   * Get active organization from the hook.
   * This respects domain-first approach and session activeOrganizationId.
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /** Extract role and permissions for child components */
  const userRole = activeOrganization?.role ?? ''
  const userPermissions = activeOrganization?.permissions ?? []

  /**
   * Check permission using hook's hasPermission helper.
   * Owners have full access, members need explicit TRANSACTIONS_READ permission.
   */
  const hasAccess = hasPermission(permissions.TRANSACTIONS_READ)

  /**
   * Fetch transaction data client-side.
   * Subscriptions use the same Transaction model, so we reuse transactions.getById.
   * Only fetches when we have an organization and the user has access.
   */
  const { data: transaction, isLoading: isLoadingTransaction } =
    trpc.transactions.getById.useQuery(
      {
        organizationId,
        transactionId: subscriptionId,
      },
      {
        enabled: !!organizationId && hasAccess,
      }
    )

  /* Show loading skeleton while fetching organization data (only on initial load) */
  if (isLoadingOrg && !activeOrganization) {
    return <SubscriptionDetailLoading />
  }

  /* Handle no organization found */
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  /* Handle no access permission */
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this subscription.
        </p>
      </div>
    )
  }

  /* Show loading state while fetching transaction */
  if (isLoadingTransaction) {
    return <SubscriptionDetailLoading />
  }

  /* Handle subscription not found */
  if (!transaction) {
    notFound()
  }

  /* Render subscription detail with all organization data */
  return (
    <SubscriptionDetail
      transaction={transaction}
      organizationId={organizationId}
      userRole={userRole}
      userPermissions={userPermissions}
    />
  )
}
