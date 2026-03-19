'use client'

/**
 * Notification Bell Component
 *
 * SOURCE OF TRUTH KEYWORDS: NotificationBell, NotificationBellIcon, NotificationBadge
 *
 * WHY: The bell icon with unread count badge that lives in the page header
 * next to the theme toggle. Clicking it opens a popover with the full
 * notification dropdown.
 *
 * FEATURES:
 * - Bell icon from lucide-react
 * - Red badge with unread count (only shown when > 0)
 * - Popover-based dropdown using shadcn Popover
 * - Queries `notifications.unreadCount` for the badge number
 *
 * REALTIME: The unread count auto-updates because `useNotificationRealtime`
 * (mounted in RealtimeProviderWrapper) invalidates the notifications cache
 * whenever a new notification arrives or one is marked as read.
 */

import { Bell } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { NotificationDropdown } from './notification-dropdown'

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Bell icon with unread badge that opens the notification dropdown.
 *
 * Placed in the page header next to the theme toggle.
 * Uses the same variant="outline" size="icon" styling as ThemeToggle.
 */
export function NotificationBell() {
  const { activeOrganization } = useActiveOrganization()

  /**
   * Fetch unread notification count for the badge.
   * This is a lightweight count-only query (no full notification objects).
   * Enabled only when we have an active organization.
   */
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(
    { organizationId: activeOrganization?.id ?? '' },
    { enabled: !!activeOrganization?.id }
  )

  /** Display count — cap at 99 to prevent badge overflow */
  const displayCount = unreadCount !== undefined ? Math.min(unreadCount, 99) : 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={
            displayCount > 0
              ? `${displayCount} unread notifications`
              : 'Notifications'
          }
        >
          <Bell className="h-[1.2rem] w-[1.2rem]" />

          {/* Unread count badge — only render when there are unread notifications */}
          {displayCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {displayCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      {/* Dropdown content — aligned to end (right) to match header positioning */}
      <PopoverContent
        className="w-[380px] p-0"
        align="end"
        sideOffset={8}
      >
        <NotificationDropdown />
      </PopoverContent>
    </Popover>
  )
}
