/**
 * Integrations Page Skeleton
 * Loading state for integrations page
 */

import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardHeader,
} from '@/components/ui/card'

export function IntegrationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Section Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Integration Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <Card
            key={i}
            className="relative overflow-hidden border-border/50"
          >
            <CardHeader className="space-y-4">
              <div className="flex items-start justify-between">
                {/* Logo skeleton - 56x56 (w-14 h-14) */}
                <Skeleton className="w-14 h-14 rounded-lg" />
                {/* Button skeleton */}
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>

              <div className="space-y-2">
                {/* Title skeleton */}
                <Skeleton className="h-5 w-32" />
                {/* Description skeleton - 2 lines */}
                <div className="space-y-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  )
}
