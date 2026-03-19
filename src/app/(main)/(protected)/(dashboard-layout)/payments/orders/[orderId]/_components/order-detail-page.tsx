/**
 * Order Detail Page Component - Active Organization Pattern
 *
 * WHY: Wrapper component that handles organization and order data fetching
 * HOW: Uses useActiveOrganization hook for org context, then fetches order client-side
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 * - Fetches order data client-side with loading states
 * - Renders OrderDetail component with all necessary props
 *
 * IMPORTANT: Orders are NOT Transactions!
 * Orders are specifically for e-commerce products that require fulfillment.
 * A Transaction (payment record) gets attached to an Order.
 *
 * PERMISSIONS:
 * - canUpdate: Can update fulfillment status, add tracking, manage notes
 *
 * SOURCE OF TRUTH: Order model (not Transaction)
 */

'use client'

import { notFound } from 'next/navigation'
import { trpc } from '@/trpc/react-provider'
import { OrderDetail } from './order-detail'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import OrderDetailLoading from '../loading'

interface OrderDetailPageProps {
  orderId: string
}

/**
 * OrderDetailPage component with integrated organization caching
 * Only requires orderId prop - fetches organization data internally with aggressive caching
 */
export function OrderDetailPage({ orderId }: OrderDetailPageProps) {
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
   * Orders use TRANSACTIONS_READ permission
   */
  const hasAccess = hasPermission(permissions.TRANSACTIONS_READ)

  /**
   * Fetch order data client-side using the orders router
   * Orders are a separate entity from Transactions
   */
  const { data: order, isLoading: isLoadingOrder } = trpc.orders.getById.useQuery(
    {
      organizationId,
      orderId,
    },
    {
      enabled: !!organizationId && hasAccess,
    }
  )

  // Show loading skeleton while fetching organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <OrderDetailLoading />
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
          You do not have permission to view this order.
        </p>
      </div>
    )
  }

  // Show loading state while fetching order
  if (isLoadingOrder) {
    return <OrderDetailLoading />
  }

  // Handle order not found
  if (!order) {
    notFound()
  }

  // Render order detail with all organization data
  return (
    <OrderDetail
      order={order}
      organizationId={organizationId}
      userRole={userRole}
      userPermissions={userPermissions}
    />
  )
}
