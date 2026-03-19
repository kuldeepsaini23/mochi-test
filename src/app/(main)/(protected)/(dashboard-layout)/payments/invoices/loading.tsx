/**
 * Invoices Page Loading State
 *
 * Full-page skeleton that matches the invoices page layout.
 * Shown during initial page load and route transitions.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoicesLoading, InvoicesSkeleton
 */

import { Skeleton } from '@/components/ui/skeleton'

export default function InvoicesLoading() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Status filter pills skeleton */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Search bar skeleton */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64" />
      </div>

      {/* Invoice cards skeleton (grid) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-20" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
