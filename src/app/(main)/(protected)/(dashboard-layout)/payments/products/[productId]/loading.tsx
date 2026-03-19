/**
 * Product Detail Loading State
 *
 * WHY: Instant loading UI that matches actual product detail layout 100%
 * HOW: Uses EXACT same structure with static elements and skeletons for dynamic content
 *
 * CRITICAL: All static elements (back button, headers, labels) are in the EXACT
 * same positions as the real page. Only dynamic content shows skeletons.
 * This prevents layout shifts and creates blazing fast perceived load times.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { SectionHeader } from '@/components/global/section-header'

export default function ProductDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header - EXACT same structure */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/payments/products">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32 mt-1" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <Separator />

      {/* Main Content - EXACT same layout */}
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* Left Column - Product Details */}
        <div className="space-y-8">
          {/* Product Info Section */}
          <div className="space-y-6">
            <SectionHeader
              title="Product Details"
              description="Manage your product information"
            />

            <div className="space-y-4">
              {/* Product Image */}
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>

              {/* Product Name */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          </div>

          {/* Prices Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <SectionHeader
                title="Pricing Options"
                description="Configure pricing for this product"
              />
              <Skeleton className="h-9 w-28" />
            </div>

            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Payment Links */}
        <div className="space-y-6">
          <SectionHeader
            title="Payment Links"
            description="Share these links to accept payments"
          />

          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
