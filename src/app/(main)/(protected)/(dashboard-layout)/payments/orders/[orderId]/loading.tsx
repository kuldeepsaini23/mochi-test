/**
 * Order Detail Loading State
 *
 * WHY: Instant loading UI that matches actual order detail layout 100%
 * HOW: Uses EXACT same structure with static elements and skeletons for dynamic content
 *
 * CRITICAL: All static elements (header, back button, section labels) are in the EXACT
 * same positions as the real page. Only dynamic content shows skeletons.
 * This prevents layout shifts and creates blazing fast perceived load times.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export default function OrderDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header - EXACT same structure */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/payments/orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Order</h1>
            <Skeleton className="h-5 w-40 mt-1" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>

      {/* Main Content - EXACT same grid layout with border */}
      <div className="border rounded-lg overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_360px]">
          {/* Left Column - Order Details */}
          <div className="lg:border-r">
            {/* Order Summary Section */}
            <div className="p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Order Summary</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </div>

            {/* Customer Section */}
            <div className="border-t p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Customer</p>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            </div>

            {/* Payment Section */}
            <div className="border-t p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Payment</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Fulfillment & Notes */}
          <div className="border-t lg:border-t-0">
            {/* Fulfillment Section */}
            <div className="p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Fulfillment</p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <Skeleton className="h-10 w-full" />
              </div>
            </div>

            {/* Tracking Section */}
            <div className="border-t p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Tracking</p>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>

            {/* Notes Section */}
            <div className="border-t p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Notes</p>
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="p-3 rounded-lg border space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
