/**
 * Booking Skeleton
 *
 * WHY: Loading state for public booking page
 * HOW: Matches the structure of the actual booking page
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, BookingSkeleton, Loading
 */

import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function BookingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Page Container */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        {/* Organization Header */}
        <div className="flex items-center justify-center gap-3 mb-8 sm:mb-12">
          <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-full" />
          <Skeleton className="h-6 w-32" />
        </div>

        {/* Booking Calendar Card */}
        <div className="flex justify-center">
          <Card className="w-full max-w-2xl shadow-lg">
            {/* Card Header */}
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-1 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-64" />
                  <div className="flex items-center gap-4 mt-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </div>
            </CardHeader>

            {/* Calendar Content */}
            <CardContent className="p-6 pt-0">
              {/* Section Title */}
              <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-24" />
              </div>

              {/* Calendar Grid */}
              <div className="mx-auto w-fit">
                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-4 px-2">
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-8 w-10 flex items-center justify-center">
                      <Skeleton className="h-4 w-6" />
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <div key={i} className="h-10 w-10 flex items-center justify-center">
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <Skeleton className="h-3 w-32 mx-auto" />
        </div>
      </div>
    </div>
  )
}
