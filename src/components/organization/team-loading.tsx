import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '../global/section-header'

/**
 * Team Loading Skeleton
 *
 * WHY: Provides instant visual feedback while data is being fetched
 * HOW: Mimics the exact layout of the team page with skeleton placeholders
 *
 * USAGE: Wrap MemberManager in Suspense with this as fallback
 * ARCHITECTURE: Shows page structure immediately, loads data in background
 */

export function TeamLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Left Column - Team Members */}
      <div className="md:col-span-2 space-y-6">
        {/* Header Section */}
        <SectionHeader
          title="Team Members"
          description="Manage team member access and permissions"
        />

        {/* Search Bar and Manage Roles Button */}
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[140px]" />
        </div>

        {/* Members List Skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <MemberCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Right Column - Owner */}
      <div className="md:col-span-1 space-y-6">
        {/* Header Section */}
        <SectionHeader
          title="Organization Owner"
          description="Primary organization administrator"
        />

        {/* Owner Card Skeleton */}
        <OwnerCardSkeleton />
      </div>
    </div>
  )
}

function MemberCardSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Avatar Skeleton */}
        <Skeleton className="size-10 rounded-full shrink-0" />

        {/* Name and Email Skeleton */}
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>

      {/* Badge and Actions Skeleton */}
      <div className="flex items-center gap-3 shrink-0">
        <Skeleton className="h-5 w-20 hidden sm:block" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  )
}

function OwnerCardSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Avatar Skeleton */}
        <Skeleton className="size-10 rounded-full shrink-0" />

        {/* Name and Email Skeleton */}
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>

      {/* Owner Badge Skeleton */}
      <div className="flex items-center gap-3 shrink-0">
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  )
}
