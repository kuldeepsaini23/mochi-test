/**
 * Transaction Detail Loading Skeleton
 *
 * Matches the mini-dashboard layout of transaction-detail.tsx.
 * Hero stat area → Items → Customer → Summary → Activity Feed.
 * Single column, max-w-3xl.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export default function TransactionDetailLoading() {
  return (
    <div className="max-w-3xl">
      {/* Back link */}
      <Link
        href="/payments/transactions"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Transactions
      </Link>

      {/* Hero stat area skeleton */}
      <div className="rounded-xl bg-muted/30 p-6 mb-8">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-9 w-44 mb-2" />
        <Skeleton className="h-4 w-56 mb-2" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-3 w-48" />
        </div>
        {/* Segmented bar placeholder */}
        <div className="flex gap-1 mt-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-2 flex-1 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-3 w-20 mt-1.5" />
      </div>

      {/* Items section skeleton */}
      <div className="pb-6 mb-6 border-b border-border/40">
        <Skeleton className="h-3 w-12 mb-3" />
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 min-w-0 space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>

      {/* Customer section skeleton */}
      <div className="pb-6 mb-6 border-b border-border/40">
        <Skeleton className="h-3 w-20 mb-3" />
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary section skeleton */}
      <div className="pb-6 mb-6 border-b border-border/40">
        <Skeleton className="h-3 w-16 mb-3" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="contents">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Activity feed skeleton */}
      <div>
        <Skeleton className="h-3 w-20 mb-3" />
        <div className="space-y-0">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
