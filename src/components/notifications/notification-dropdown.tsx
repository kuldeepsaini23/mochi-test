'use client'

/**
 * Notification Dropdown Component
 *
 * SOURCE OF TRUTH KEYWORDS: NotificationDropdown, NotificationPanel, NotificationPopoverContent
 *
 * WHY: The popover content that appears when the bell icon is clicked.
 * Shows a scrollable list of notifications with a header containing
 * "Notifications" title and "Mark all as read" button.
 *
 * FEATURES:
 * - Header with title + "Mark all as read" (only visible when there are unread items)
 * - Scrollable list of NotificationItem components with MarqueeFade edge effects
 * - Loading skeleton state while data is fetching
 * - Empty state when there are no notifications
 * - Infinite scroll via IntersectionObserver (LoadMoreTrigger)
 * - Footer with push notification toggle for PWA devices
 *
 * DATA: Fetches from tRPC `notifications.list` with cursor-based pagination.
 * Cache invalidation is handled by the realtime hook (useNotificationRealtime)
 * which runs in the RealtimeProviderWrapper.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { LoadMoreTrigger } from '@/components/pipelines/_components/load-more-trigger'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { NotificationItem } from './notification-item'
import { PushNotificationPrompt } from './push-notification-prompt'

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Notification dropdown panel.
 *
 * Rendered inside the PopoverContent from notification-bell.tsx.
 * Handles its own data fetching, mutations, and loading/empty states.
 */
export function NotificationDropdown() {
  const { activeOrganization } = useActiveOrganization()
  const utils = trpc.useUtils()

  // ========================================================================
  // QUERIES
  // ========================================================================

  /**
   * Fetch the paginated notification list.
   * Includes unreadCount in the response for the "Mark all as read" visibility.
   * Enabled only when we have an active organization.
   */
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.notifications.list.useInfiniteQuery(
    {
      organizationId: activeOrganization?.id ?? '',
      limit: 20,
    },
    {
      enabled: !!activeOrganization?.id,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  )

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  /**
   * Mark a single notification as read.
   * On success, invalidate the notification cache so the UI updates.
   */
  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.invalidate()
    },
  })

  /**
   * Mark ALL notifications as read.
   * On success, invalidate the notification cache so the UI updates.
   */
  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.invalidate()
    },
  })

  /**
   * Delete a single notification.
   * On success, invalidate the notification cache so the UI updates.
   */
  const deleteMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.invalidate()
    },
  })

  // ========================================================================
  // HANDLERS
  // ========================================================================

  /** Mark a single notification as read */
  const handleMarkAsRead = (notificationId: string) => {
    if (!activeOrganization?.id) return
    markAsReadMutation.mutate({
      organizationId: activeOrganization.id,
      notificationId,
    })
  }

  /** Mark all notifications as read */
  const handleMarkAllAsRead = () => {
    if (!activeOrganization?.id) return
    markAllAsReadMutation.mutate({
      organizationId: activeOrganization.id,
    })
  }

  /** Delete a notification */
  const handleDelete = (notificationId: string) => {
    if (!activeOrganization?.id) return
    deleteMutation.mutate({
      organizationId: activeOrganization.id,
      notificationId,
    })
  }

  // ========================================================================
  // SCROLL TRACKING (for MarqueeFade edge effects)
  // ========================================================================

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  /** Update fade indicators based on current scroll position */
  const updateScrollIndicators = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    setCanScrollUp(scrollTop > 5)
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 5)
  }, [])

  /** Re-check scroll indicators when notification list changes (new page loaded, etc.) */
  useEffect(() => {
    updateScrollIndicators()
  }, [data, updateScrollIndicators])

  /** Observe container resize to keep fades in sync */
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(updateScrollIndicators)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [updateScrollIndicators])

  // ========================================================================
  // DERIVED DATA
  // ========================================================================

  /** Flatten all pages into a single notifications array */
  const notifications = data?.pages.flatMap((page) => page.notifications) ?? []

  /** Unread count from the first page (included in every page response) */
  const unreadCount = data?.pages[0]?.unreadCount ?? 0

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="flex flex-col">
      {/* Header: title + mark all as read button */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={handleMarkAllAsRead}
            disabled={markAllAsReadMutation.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Push notification prompt — shown at the top when user hasn't enabled push yet */}
      <PushNotificationPrompt />

      {/* Notification list — MarqueeFade wraps a native scrollable div for edge effects */}
      <MarqueeFade
        showTopFade={canScrollUp}
        showBottomFade={canScrollDown}
        fadeHeight={32}
        className="min-h-0"
      >
        <div
          ref={scrollContainerRef}
          onScroll={updateScrollIndicators}
          className="h-[400px] overflow-y-auto"
        >
          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-1 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <Skeleton className="h-4 w-4 rounded mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <p className="text-sm text-muted-foreground">
                No notifications yet
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                You&apos;ll see notifications here when something happens
              </p>
            </div>
          )}

          {/* Notification items */}
          {!isLoading && notifications.length > 0 && (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  onDelete={handleDelete}
                />
              ))}

              {/* Infinite scroll trigger — auto-fetches next page when scrolled into view */}
              <LoadMoreTrigger
                onLoadMore={() => fetchNextPage()}
                hasMore={hasNextPage ?? false}
                isLoading={isFetchingNextPage}
                rootMargin="50px"
                className="py-3"
              />
            </div>
          )}
        </div>
      </MarqueeFade>
    </div>
  )
}
