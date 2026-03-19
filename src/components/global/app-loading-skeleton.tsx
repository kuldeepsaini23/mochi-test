/**
 * App Loading Skeleton
 *
 * WHY: Reusable full-screen loading state that matches the app layout
 * HOW: Shows sidebar placeholder + content area that mirrors real UI
 *
 * USAGE: Show after successful sign-in/sign-up while redirecting to dashboard
 *
 * STRUCTURE: Mirrors the dashboard layout exactly:
 * - Left: Sidebar placeholder (matches real sidebar structure)
 * - Right: Content area with rounded corners
 */

'use client'

import { Skeleton } from '@/components/ui/skeleton'

export function AppLoadingSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex h-screen w-full bg-sidebar">
      {/* ================================================================
          SIDEBAR - Matches real sidebar structure exactly
          ================================================================ */}
      <aside className="hidden h-full w-64 flex-col p-4 md:flex">
        {/* Team Switcher - Logo + Org name + Plan */}
        <div className="flex items-center gap-3 px-2 h-16 mb-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>

        {/* Search bar */}
        <Skeleton className="h-9 w-full rounded-md mb-4" />

        {/* Navigation - General section */}
        <div className="flex flex-col gap-1">
          {/* Section label */}
          <Skeleton className="h-3 w-14 mb-2 ml-2" />

          {/* Nav items */}
          <NavItemSkeleton />
          <NavItemSkeleton />
          <NavItemSkeleton hasChevron />
          <NavItemSkeleton hasChevron />
          <NavItemSkeleton hasChevron />
          <NavItemSkeleton />
          <NavItemSkeleton />
          <NavItemSkeleton />
          <NavItemSkeleton />
          <NavItemSkeleton />
          <NavItemSkeleton hasChevron />
        </div>

        {/* User profile at bottom */}
        <div className="mt-auto flex items-center gap-3 px-2 py-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex flex-col gap-1.5 flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </aside>

      {/* ================================================================
          MAIN CONTENT AREA - Clean rounded container
          ================================================================ */}
      <main className="flex flex-1 flex-col md:pb-2 md:pt-2 md:pr-2">
        <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-background shadow-sm" />
      </main>
    </div>
  )
}

/**
 * Single nav item skeleton - matches SidebarMenuButton structure
 */
function NavItemSkeleton({ hasChevron = false }: { hasChevron?: boolean }) {
  return (
    <div className="flex items-center gap-3 h-9 px-2 rounded-md">
      <Skeleton className="h-5 w-5" />
      <Skeleton className="h-3.5 w-20" />
      {hasChevron && <Skeleton className="h-4 w-4 ml-auto" />}
    </div>
  )
}
