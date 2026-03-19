'use client'

/**
 * Calendar Event Card Component
 *
 * WHY: Display individual calendar events with title, time, assigned member, and status
 * HOW: Clean card matching pipeline ticket styling with small color dot
 *
 * DESIGN: Matches pipeline ticket card - ring border, muted dark bg
 * STATUS DISPLAY: Shows visual indicators for PENDING, APPROVED, CANCELLED states
 *
 * SOURCE OF TRUTH: Uses CalendarEventUI from @/hooks/use-calendar
 *
 * Search Keywords: SOURCE OF TRUTH, EVENT CARD, CALENDAR EVENT, EVENT STATUS
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Video, Clock, CheckCircle, XCircle } from 'lucide-react'
import type { CalendarEvent, EventColor } from './types'
import { formatTimeRange, formatTimeRangeInTimezone } from './types'
import type { CalendarEventStatus } from '@/hooks/use-calendar'

/** Color dot classes for categorization */
function getColorDotClass(color: string): string {
  const colorMap: Record<EventColor, string> = {
    blue: 'bg-blue-500',
    orange: 'bg-orange-500',
    green: 'bg-emerald-500',
    purple: 'bg-violet-500',
    red: 'bg-red-500',
    pink: 'bg-pink-500',
    yellow: 'bg-amber-500',
    gray: 'bg-zinc-400',
  }
  return colorMap[color as EventColor] || colorMap.gray
}

/**
 * Status styling configuration
 * WHY: Visual differentiation between PENDING, APPROVED, and CANCELLED events
 */
const STATUS_CONFIG: Record<CalendarEventStatus, {
  icon: typeof Clock
  label: string
  className: string
  cardClassName: string
}> = {
  PENDING: {
    icon: Clock,
    label: 'Pending',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    cardClassName: '',
  },
  APPROVED: {
    icon: CheckCircle,
    label: 'Approved',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    cardClassName: '',
  },
  CANCELLED: {
    icon: XCircle,
    label: 'Cancelled',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    cardClassName: 'opacity-60 line-through decoration-muted-foreground/50',
  },
}

/**
 * Status Badge Component
 * WHY: Compact status indicator for calendar events
 */
function StatusIndicator({ status, compact = false }: { status: CalendarEventStatus; compact?: boolean }) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  if (compact) {
    // Only show icon for compact view
    return (
      <div className={cn('size-3.5 flex items-center justify-center rounded-sm', config.className)}>
        <Icon className="size-2.5" />
      </div>
    )
  }

  return (
    <Badge
      variant="outline"
      className={cn('h-4 px-1 py-0 text-[9px] gap-0.5 font-medium', config.className)}
    >
      <Icon className="size-2.5" />
      {config.label}
    </Badge>
  )
}

type EventCardProps = {
  event: CalendarEvent
  compact?: boolean
  onClick?: (event: CalendarEvent) => void
  /** User's timezone for time display (IANA format). Falls back to browser timezone if not provided */
  timezone?: string
  className?: string
}

/**
 * Assigned Team Member Avatar
 *
 * WHY: Display the team member assigned to handle this calendar event
 * Shows a single avatar for the assigned member (from tRPC data)
 */
function AssignedMemberAvatar({ assignedTo }: { assignedTo: CalendarEvent['assignedTo'] }) {
  if (!assignedTo) return null

  return (
    <Avatar className="size-5 ring-1 ring-background">
      <AvatarImage src={assignedTo.image ?? undefined} alt={assignedTo.name} />
      <AvatarFallback className="text-[8px] font-medium bg-muted text-muted-foreground">
        {assignedTo.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * Lead Attendee Avatar
 *
 * WHY: Display the lead linked to this calendar event (e.g., from booking)
 * Shows avatar with different styling to distinguish from team members
 */
function LeadAttendeeAvatar({ lead }: { lead: CalendarEvent['lead'] }) {
  if (!lead) return null

  // Build full name from first/last name
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email

  // Get initials for fallback
  const initials = lead.firstName && lead.lastName
    ? `${lead.firstName[0]}${lead.lastName[0]}`.toUpperCase()
    : lead.email.substring(0, 2).toUpperCase()

  return (
    <Avatar className="size-5 ring-1 ring-primary/30">
      <AvatarImage src={lead.avatarUrl ?? undefined} alt={fullName} />
      <AvatarFallback className="text-[8px] font-medium bg-primary/10 text-primary">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * Event Card Component - matches pipeline ticket styling
 * WHY: Display calendar events with timezone-aware time formatting
 */
export function EventCard({ event, compact = false, onClick, timezone, className }: EventCardProps) {
  const colorDotClass = useMemo(() => getColorDotClass(event.color), [event.color])
  const statusConfig = STATUS_CONFIG[event.status]
  const isCancelled = event.status === 'CANCELLED'

  /**
   * Format time range based on timezone
   * WHY: Show times in user's preferred timezone
   */
  const formattedTimeRange = useMemo(() => {
    if (event.isAllDay) return 'All day'
    if (timezone) {
      return formatTimeRangeInTimezone(event.startDate, event.endDate, timezone)
    }
    // Fallback to browser timezone
    return formatTimeRange(event.startDate, event.endDate)
  }, [event.startDate, event.endDate, event.isAllDay, timezone])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(event)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(event)
        }
      }}
      className={cn(
        // Match pipeline ticket card styling exactly - includes dark:border-t for lighter top border
        'group w-full h-full text-left rounded-xl p-2 transition-shadow duration-200 overflow-hidden',
        'dark:bg-muted/40 backdrop-blur-lg bg-card',
        'dark:border-t dark:ring-background dark:ring-1 dark:shadow-sm',
        'ring-1 ring-border',
        'hover:ring-primary/50 cursor-pointer',
        // Apply cancelled styling - reduced opacity
        isCancelled && 'opacity-60',
        className
      )}
    >
      <div className={cn(
        'h-full relative',
        compact ? 'flex items-center gap-2' : 'flex flex-col gap-0.5'
      )}>
        {/* Color dot - top right */}
        <div className={cn('absolute top-0 right-0 size-2 rounded-full shrink-0', colorDotClass)} />

        {/* Compact layout: Title + Time in single row */}
        {compact ? (
          <>
            <StatusIndicator status={event.status} compact />
            <span className={cn(
              'font-medium text-[11px] leading-tight text-foreground truncate flex-1 pr-4',
              isCancelled && 'line-through decoration-muted-foreground/50'
            )}>
              {event.title}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formattedTimeRange}
            </span>
          </>
        ) : (
          <>
            {/* Full layout: Stacked with assigned member and meeting link */}
            <div className="flex items-start gap-1.5 pr-4">
              <span className={cn(
                'font-medium text-[11px] leading-tight text-foreground line-clamp-2',
                isCancelled && 'line-through decoration-muted-foreground/50'
              )}>
                {event.title}
              </span>
            </div>

            <span className="text-[10px] text-muted-foreground">
              {formattedTimeRange}
            </span>

            {/* Status Badge + Assigned Member + Lead Attendee + Meeting Link */}
            <div className="flex items-center justify-between gap-2 mt-auto pt-1">
              <div className="flex items-center gap-1.5">
                <StatusIndicator status={event.status} />
                {/* Show both assigned member and lead attendee with overlapping avatars */}
                <div className="flex items-center -space-x-1">
                  <AssignedMemberAvatar assignedTo={event.assignedTo} />
                  <LeadAttendeeAvatar lead={event.lead} />
                </div>
              </div>

              {event.meetingUrl && !isCancelled && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-5 px-1.5 text-[9px] gap-1 ml-auto"
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(event.meetingUrl!, '_blank', 'noopener,noreferrer')
                  }}
                >
                  <Video className="size-2.5" />
                  Join
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
