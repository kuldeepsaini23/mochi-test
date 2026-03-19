'use client'

/**
 * Editor Skeleton Component
 *
 * WHY: Show loading state while chat widget data is fetching
 * HOW: Skeleton layout matching the editor structure
 *
 * SOURCE OF TRUTH: ChatWidgetEditor
 */

import { Skeleton } from '@/components/ui/skeleton'

// ============================================================================
// COMPONENT
// ============================================================================

export function EditorSkeleton() {
  return (
    <div className="h-full flex">
      {/* Sidebar skeleton */}
      <aside className="w-72 border-r flex flex-col">
        <div className="p-3 border-b">
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="p-4 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="flex-1 flex flex-col items-center justify-center bg-muted/30">
        <Skeleton className="h-5 w-40 mb-2" />
        <Skeleton className="h-3 w-60 mb-4" />
        <Skeleton className="w-[22rem] h-[34rem] rounded-xl" />
      </main>
    </div>
  )
}
