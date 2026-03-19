import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { SearchIcon } from 'lucide-react'
import { PageContainer } from '../global/page-container'

export function TeamMembersSkeleton() {
  return (
    <PageContainer>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column - Team Members */}
        <div className="md:col-span-2 space-y-6">
          {/* Header Section - Static */}
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              Team Members
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage team member access and permissions
            </p>
          </div>

          {/* Search Bar - Static */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search"
              disabled
              className="pl-9 h-10"
            />
          </div>

          {/* Member Cards Skeleton */}
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Skeleton className="size-10 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column - Owner */}
        <div className="md:col-span-1 space-y-6">
          {/* Header Section - Static */}
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Organization Owner</h2>
            <p className="text-sm text-muted-foreground">
              Primary organization administrator
            </p>
          </div>

          {/* Owner Card Skeleton */}
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Skeleton className="size-10 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
