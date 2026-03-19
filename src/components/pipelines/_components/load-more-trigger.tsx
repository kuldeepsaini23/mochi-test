'use client'

/**
 * LoadMoreTrigger Component - Intersection Observer for Infinite Scroll
 *
 * WHY: Triggers loading more items when the user scrolls near the end of a list.
 * Uses IntersectionObserver for efficient scroll detection without scroll event listeners.
 *
 * USAGE:
 * <LoadMoreTrigger
 *   onLoadMore={() => fetchNextPage()}
 *   hasMore={hasNextPage}
 *   isLoading={isFetchingNextPage}
 * />
 *
 * SOURCE OF TRUTH: InfiniteScroll, LoadMore, IntersectionObserver
 */

import { useEffect, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadMoreTriggerProps {
  /**
   * Callback to load more items
   * WHY: Called when the trigger element becomes visible
   */
  onLoadMore: () => void

  /**
   * Whether there are more items to load
   * WHY: Prevents unnecessary fetch attempts when all items are loaded
   */
  hasMore: boolean

  /**
   * Whether items are currently being fetched
   * WHY: Prevents duplicate fetch calls and shows loading state
   */
  isLoading: boolean

  /**
   * Threshold for triggering load (0-1)
   * WHY: 0 means trigger when element is fully visible, 1 means trigger as soon as any part is visible
   * Default 0.1 triggers when 10% of the element is visible
   */
  threshold?: number

  /**
   * Root margin for the observer
   * WHY: Allows triggering before the element is actually visible (e.g., "100px" starts loading 100px before)
   * Default "100px" provides buffer for smooth loading experience
   */
  rootMargin?: string

  /**
   * Direction of scroll - affects which axis to observe
   * WHY: Horizontal scroll needs different observation logic than vertical
   */
  direction?: 'vertical' | 'horizontal'

  /**
   * Custom className for the trigger element
   */
  className?: string
}

export function LoadMoreTrigger({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 0.1,
  rootMargin = '100px',
  direction = 'vertical',
  className,
}: LoadMoreTriggerProps) {
  const triggerRef = useRef<HTMLDivElement>(null)

  /**
   * Stable callback ref to prevent re-creating observer on every render
   */
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  /**
   * Handle intersection changes
   * WHY: Called when the trigger element enters or exits the viewport
   */
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry?.isIntersecting && hasMore && !isLoading) {
        onLoadMoreRef.current()
      }
    },
    [hasMore, isLoading]
  )

  /**
   * Set up IntersectionObserver
   * WHY: Efficiently detects when user scrolls near the end of the list
   */
  useEffect(() => {
    const element = triggerRef.current
    if (!element) return

    const observer = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin:
        direction === 'horizontal' ? `0px ${rootMargin} 0px 0px` : `0px 0px ${rootMargin} 0px`,
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [handleIntersection, threshold, rootMargin, direction])

  // Don't render anything if there's nothing more to load
  if (!hasMore && !isLoading) {
    return null
  }

  return (
    <div
      ref={triggerRef}
      className={cn(
        'flex items-center justify-center py-4',
        direction === 'horizontal' && 'px-4 h-full',
        className
      )}
      aria-hidden="true"
    >
      {isLoading && (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
