'use client'

/**
 * Notification Item Component
 *
 * SOURCE OF TRUTH KEYWORDS: NotificationItem, NotificationRow, NotificationListItem
 *
 * WHY: Renders a single notification row inside the notification dropdown.
 * Each row shows the category icon, title, body preview, relative time,
 * and an unread indicator. Clicking navigates to the actionUrl (if present)
 * and marks the notification as read. A delete button appears on hover.
 *
 * PROPS:
 * - notification: The full NotificationRecord from the service layer
 * - onMarkAsRead: Callback fired when the notification should be marked as read
 * - onDelete: Callback fired when the user deletes the notification
 */

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/notifications/category-icons'
import { Button } from '@/components/ui/button'
// ============================================================================
// CLIENT NOTIFICATION TYPE
// ============================================================================

/**
 * Client-side notification shape.
 *
 * WHY: tRPC serializes Date → string over the wire, so the client receives
 * string date fields, not Date objects. This type mirrors NotificationRecord
 * from the service but accepts both string and Date for date fields so it
 * works with the serialized tRPC response.
 *
 * SOURCE OF TRUTH: ClientNotification
 */
export interface ClientNotification {
  id: string
  organizationId: string
  userId: string
  title: string
  body: string
  category: string
  actionUrl: string | null
  isRead: boolean
  readAt: string | Date | null
  createdAt: string | Date
}

// ============================================================================
// RELATIVE TIME HELPER
// ============================================================================

/**
 * Converts a Date into a human-readable relative time string.
 *
 * WHY: Avoids adding date-fns as a dependency just for "time ago" formatting.
 * This covers the common cases (just now, minutes, hours, days) which is
 * sufficient for notification timestamps.
 */
function getRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ============================================================================
// PROPS
// ============================================================================

interface NotificationItemProps {
  /** The notification record (tRPC-serialized — dates are strings) */
  notification: ClientNotification
  /** Callback when this notification should be marked as read */
  onMarkAsRead: (notificationId: string) => void
  /** Callback when this notification should be deleted */
  onDelete: (notificationId: string) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Individual notification row.
 *
 * Layout: [CategoryIcon] [Title + Body + Time] [DeleteButton on hover]
 *
 * Unread notifications have a bolder title and a small blue dot indicator.
 * Clicking the row marks it as read and navigates to the actionUrl if present.
 */
export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: NotificationItemProps) {
  const router = useRouter()

  /** Resolve the lucide icon for this notification's category */
  const Icon = getCategoryIcon(notification.category)

  /**
   * Handle clicking the notification row.
   * 1. Mark as read (if not already)
   * 2. Navigate to actionUrl if one exists
   */
  const handleClick = () => {
    if (!notification.isRead) {
      onMarkAsRead(notification.id)
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl)
    }
  }

  /**
   * Handle delete button click.
   * Stops event propagation so the row's onClick doesn't also fire.
   */
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(notification.id)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
      className={cn(
        'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
        'hover:bg-muted/50',
        /* Unread notifications get a subtle left border accent */
        !notification.isRead && 'bg-muted/30'
      )}
    >
      {/* Category icon — sized to match the title line height */}
      <div className="mt-0.5 flex-shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Content: title, body, and relative time */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          {/* Title — bold when unread for visual distinction */}
          <p
            className={cn(
              'text-sm truncate',
              !notification.isRead ? 'font-semibold text-foreground' : 'text-foreground/80'
            )}
          >
            {notification.title}
          </p>

          {/* Unread dot indicator — small blue circle */}
          {!notification.isRead && (
            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-blue-500" />
          )}
        </div>

        {/* Body preview — truncated to one line */}
        <p className="text-xs text-muted-foreground truncate">
          {notification.body}
        </p>

        {/* Relative timestamp */}
        <p className="text-xs text-muted-foreground/60">
          {getRelativeTime(new Date(notification.createdAt))}
        </p>
      </div>

      {/* Delete button — visible on hover, positioned to the right */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
        onClick={handleDelete}
        aria-label="Delete notification"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  )
}
