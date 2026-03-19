/**
 * Team Page Loading State
 *
 * WHY: Instant loading UI that matches actual page layout perfectly
 * HOW: Mimics ContentLayout + MemberManager with all static elements in place
 *
 * This creates the magical illusion of instant page loads by:
 * - Showing the EXACT same layout structure (ContentLayout wrapper)
 * - Keeping ALL static elements (headers, descriptions, buttons) in the EXACT same spots
 * - Only showing skeletons for dynamic content (member cards)
 * - User sees the page structure instantly, no "frozen" feeling
 */

import { ContentLayout } from '@/components/global/content-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, SearchIcon, ShieldCheck } from 'lucide-react'
import { SectionHeader } from '@/components/global/section-header'
import { Skeleton } from '@/components/ui/skeleton'

export default function TeamLoading() {
  return (
    <ContentLayout
      headerActions={
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Invite Member
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column - Team Members */}
        <div className="md:col-span-2 space-y-6">
          {/* Header Section - STATIC (keeps exact position) */}
          <SectionHeader
            title="Team Members"
            description="Manage team member access and permissions"
          />

          {/* Search Bar and Manage Roles Button - STATIC UI */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="pl-9 h-10"
                disabled
              />
            </div>
            <Button
              variant="outline"
              className="gap-2 h-10"
              disabled
            >
              <ShieldCheck className="h-4 w-4" />
              Manage Roles
            </Button>
          </div>

          {/* Members List Skeleton - ONLY dynamic content */}
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <MemberCardSkeleton key={i} />
            ))}
          </div>
        </div>

        {/* Right Column - Owner */}
        <div className="md:col-span-1 space-y-6">
          {/* Header Section - STATIC (keeps exact position) */}
          <SectionHeader
            title="Organization Owner"
            description="Primary organization administrator"
          />

          {/* Owner Card Skeleton */}
          <OwnerCardSkeleton />
        </div>
      </div>
    </ContentLayout>
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
