/**
 * Lead Orders Tab
 *
 * Displays all orders associated with a lead inside the lead sheet.
 * Each row links to the full order detail page.
 * Uses shared order utils for consistent formatting across the app.
 * Implements cursor-based infinite scroll for paginated loading.
 *
 * SOURCE OF TRUTH: Order type inferred from tRPC router output (orders.getForLeadInfinite)
 */

'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Package, ExternalLink } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { cn } from '@/lib/utils'
import { LoadMoreTrigger } from '@/components/pipelines/_components/load-more-trigger'
import {
  getOrderStatusDisplay,
  getFulfillmentStatusDisplay,
  formatOrderDate,
  formatOrderId,
  formatCurrency,
} from '@/app/(main)/(protected)/(dashboard-layout)/payments/orders/_components/utils'

interface LeadOrdersTabProps {
  organizationId: string
  leadId: string
}

/** Skeleton placeholder shown while orders are loading */
function OrderSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between border-b px-4 py-3">
          <div className="space-y-2">
            <div className="h-4 w-36 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2 text-right">
            <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-5 w-20 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * LeadOrdersTab — fetches and renders a lead's order history with infinite scroll.
 * Shown as a tab inside the lead detail sheet.
 * Uses cursor-based pagination to load orders in pages of 20.
 */
export function LeadOrdersTab({ organizationId, leadId }: LeadOrdersTabProps) {
  /** Infinite query — fetches pages of orders using cursor-based pagination */
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.orders.getForLeadInfinite.useInfiniteQuery(
    { organizationId, leadId, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!organizationId && !!leadId,
    },
  )

  /** Flatten all pages into a single orders array for rendering */
  const orders = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.items)
  }, [data?.pages])

  /* Loading skeleton */
  if (isLoading) {
    return <OrderSkeleton />
  }

  /* Empty state */
  if (!orders.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">No orders yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {orders.map((order) => {
        /* Build product name string from transaction items */
        const productNames =
          order.transaction && order.transaction.items.length > 0
            ? order.transaction.items.map(
                (item: (typeof order.transaction.items)[number]) => item.productName
              ).join(', ')
            : formatOrderId(order.id)

        /* Order and fulfillment status badge styling from shared utils */
        const orderStatus = getOrderStatusDisplay(order.status)
        const fulfillmentStatus = getFulfillmentStatusDisplay(order.fulfillmentStatus)

        return (
          <div key={order.id} className="group flex items-center border-b transition-colors hover:bg-muted/50">
            {/* Main link — navigates in-app via Next.js Link for cached navigation */}
            <Link
              href={`/payments/orders/${order.id}`}
              className="flex flex-1 items-center justify-between px-4 py-3 min-w-0"
            >
              {/* Left: product names + order ID + date */}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">{productNames}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatOrderId(order.id)}</span>
                  <span>·</span>
                  <span>{formatOrderDate(order.createdAt)}</span>
                </div>
              </div>

              {/* Right: amount + status badges */}
              <div className="ml-4 flex flex-col items-end gap-1">
                {order.transaction && (
                  <span className="text-sm font-medium">
                    {formatCurrency(order.transaction.totalAmount, order.transaction.currency)}
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      orderStatus.badgeClass
                    )}
                  >
                    {orderStatus.label}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      fulfillmentStatus.badgeClass
                    )}
                  >
                    {fulfillmentStatus.label}
                  </span>
                </div>
              </div>
            </Link>

            {/* Open in new browser tab */}
            <a
              href={`/payments/orders/${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 p-3 text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )
      })}

      {/* Infinite scroll trigger — loads next page when scrolled into view */}
      <LoadMoreTrigger
        onLoadMore={() => fetchNextPage()}
        hasMore={hasNextPage ?? false}
        isLoading={isFetchingNextPage}
        rootMargin="200px"
      />
    </div>
  )
}
