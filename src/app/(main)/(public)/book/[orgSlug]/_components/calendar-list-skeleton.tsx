/**
 * Calendar List Skeleton
 *
 * WHY: Loading state for organization booking list page
 * HOW: Matches the structure of the actual calendar list page
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, CalendarListSkeleton, Loading
 */

import { Skeleton } from '@/components/ui/skeleton'

export function CalendarListSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Page Container */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        {/* Organization Header */}
        <div className="flex flex-col items-center mb-8 sm:mb-12">
          <Skeleton className="h-14 w-14 sm:h-16 sm:w-16 rounded-full mb-4" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>

        {/* Calendars List */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-4">
                <Skeleton className="w-1 h-10 rounded-full shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                  <div className="flex gap-4">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-5 w-5 rounded" />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <Skeleton className="h-3 w-32 mx-auto" />
        </div>
      </div>
    </div>
  )
}
