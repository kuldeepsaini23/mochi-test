/**
 * Websites Page Loading State
 *
 * WHY: Instant loading UI that appears the MOMENT user navigates to this page.
 * HOW: Next.js automatically shows this while the page component loads.
 *
 * This creates the magical illusion of instant page loads by:
 * - Showing the EXACT same layout structure as the actual page
 * - User sees the page skeleton instantly instead of frozen screen
 * - Subsequent visits are even faster due to React Query caching
 */

import { ContentLayout } from '@/components/global/content-layout'
import { Skeleton } from '@/components/ui/skeleton'

export default function WebsitesLoading() {
  return (
    <ContentLayout
      headerActions={
        <Skeleton className="h-9 w-32" /> // Add Website button skeleton
      }
    >
      <div className="space-y-6">
        {/* View toggle skeleton */}
        <div className="flex justify-end">
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>

        {/* Search and filters skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>

        {/* Websites grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}
