/**
 * Lead Transactions Tab
 *
 * Displays all transactions associated with a lead inside the lead sheet.
 * Each row links to the full transaction detail page.
 * Uses the shared transaction utils for consistent formatting across the app.
 *
 * Uses cursor-based infinite scroll via useInfiniteQuery + LoadMoreTrigger
 * so we only fetch a page at a time and load more as the user scrolls.
 *
 * SOURCE OF TRUTH: Transaction type inferred from tRPC router output
 */

'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { CreditCard, ExternalLink } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { cn } from '@/lib/utils'
import { LoadMoreTrigger } from '@/components/pipelines/_components/load-more-trigger'
import {
  getStatusDisplay,
  formatBillingType,
  formatDate,
  formatCurrency,
} from '@/app/(main)/(protected)/(dashboard-layout)/payments/transactions/_components/utils'

interface LeadTransactionsTabProps {
  organizationId: string
  leadId: string
}

/** Skeleton placeholder shown while the first page of transactions is loading */
function TransactionSkeleton() {
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
 * LeadTransactionsTab — fetches and renders a lead's transaction history
 * with cursor-based infinite scroll pagination.
 * Shown as a tab inside the lead detail sheet.
 */
export function LeadTransactionsTab({ organizationId, leadId }: LeadTransactionsTabProps) {
  /**
   * Infinite query: fetches transactions page-by-page using cursor-based pagination.
   * getNextPageParam extracts the nextCursor from each page response so tRPC
   * knows what to pass on the next fetchNextPage() call.
   */
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.transactions.getForLeadInfinite.useInfiniteQuery(
    { organizationId, leadId, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!organizationId && !!leadId,
    },
  )

  /**
   * Flatten all pages into a single array of transactions.
   * Memoised so downstream rendering only re-runs when pages actually change.
   */
  const transactions = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.items)
  }, [data?.pages])

  /* Loading skeleton for the initial fetch */
  if (isLoading) {
    return <TransactionSkeleton />
  }

  /* Empty state when the lead has no transactions at all */
  if (!transactions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CreditCard className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">No transactions yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {transactions.map((transaction) => {
        /* Build product name string from transaction items */
        const productNames =
          transaction.items.length > 0
            ? transaction.items.map((item) => item.productName).join(', ')
            : 'Untitled product'

        /* Derive the primary billing type from the first item */
        const billingType =
          transaction.items.length > 0
            ? formatBillingType(transaction.items[0].billingType)
            : ''

        /* Status badge styling from shared utils */
        const status = getStatusDisplay(transaction.paymentStatus)

        return (
          <div key={transaction.id} className="group flex items-center border-b transition-colors hover:bg-muted/50">
            {/* Main link — navigates in-app via Next.js Link for cached navigation */}
            <Link
              href={`/payments/transactions/${transaction.id}`}
              className="flex flex-1 items-center justify-between px-4 py-3 min-w-0"
            >
              {/* Left: product names + billing type + date */}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">{productNames}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {billingType && <span>{billingType}</span>}
                  {billingType && <span>·</span>}
                  <span>{formatDate(transaction.createdAt)}</span>
                </div>
              </div>

              {/* Right: amount + status badge */}
              <div className="ml-4 flex flex-col items-end gap-1">
                <span className="text-sm font-medium">
                  {formatCurrency(transaction.originalAmount, transaction.currency)}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    status.bgColor,
                    status.color
                  )}
                >
                  {status.label}
                </span>
              </div>
            </Link>

            {/* Open in new browser tab */}
            <a
              href={`/payments/transactions/${transaction.id}`}
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

      {/* Infinite scroll trigger: loads the next page when scrolled into view */}
      <LoadMoreTrigger
        onLoadMore={() => fetchNextPage()}
        hasMore={hasNextPage ?? false}
        isLoading={isFetchingNextPage}
        rootMargin="200px"
      />
    </div>
  )
}
