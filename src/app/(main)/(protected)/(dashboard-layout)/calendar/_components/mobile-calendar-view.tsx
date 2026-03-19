'use client'

/**
 * Mobile Calendar View Component
 *
 * WHY: Provide a mobile-friendly calendar experience
 * HOW: Uses shadcn Calendar for date selection with a scrollable event list below
 *
 * LAYOUT:
 * - Top half: Calendar month view for date selection
 * - Bottom half: Scrollable list of events for the selected day
 *
 * TIMEZONE HANDLING:
 * - Events are stored in UTC in the database
 * - Displayed in the user's preferred timezone (from profile settings)
 * - Event filtering uses user's timezone for correct day assignment
 *
 * SOURCE OF TRUTH: Uses CalendarEvent from @/hooks/use-calendar via types.ts
 *
 * Search Keywords: SOURCE OF TRUTH, MOBILE VIEW, CALENDAR MOBILE, RESPONSIVE, TIMEZONE
 */

import { useMemo } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus, CalendarDays, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from './types'
import { EventCard } from './event-card'
import { formatTimeRange, formatTimeRangeInTimezone, getDateInTimezone } from './types'
import { FeatureGate } from '@/components/feature-gate'

type MobileCalendarViewProps = {
  /** Currently selected date */
  selectedDate: Date
  /** Callback when date is selected */
  onDateSelect: (date: Date) => void
  /** All events to display */
  events: CalendarEvent[]
  /** User's timezone for event display (IANA format, e.g., "America/New_York") */
  timezone: string
  /** Callback when an event is clicked */
  onEventClick?: (event: CalendarEvent) => void
  /** Callback when create event button is clicked */
  onCreateEvent?: () => void
  /** Whether user can create events */
  canCreate?: boolean
  className?: string
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Get events for a specific day using timezone
 * WHY: Filter events based on user's timezone for correct day assignment
 *
 * @param events - All events
 * @param date - The day to check (local browser date representing the calendar day)
 * @param timezone - User's preferred timezone
 */
function getEventsForDay(events: CalendarEvent[], date: Date, timezone: string): CalendarEvent[] {
  // Get the day's date components from the selected date
  const dayYear = date.getFullYear()
  const dayMonth = date.getMonth()
  const dayDate = date.getDate()

  return events
    .filter((event) => {
      // Get event start/end dates in user's timezone
      const eventStartInTz = getDateInTimezone(event.startDate, timezone)
      const eventEndInTz = getDateInTimezone(event.endDate, timezone)

      // Check if event overlaps with this day in user's timezone
      const startsOnOrBefore =
        eventStartInTz.year < dayYear ||
        (eventStartInTz.year === dayYear && eventStartInTz.month < dayMonth) ||
        (eventStartInTz.year === dayYear && eventStartInTz.month === dayMonth && eventStartInTz.day <= dayDate)

      const endsOnOrAfter =
        eventEndInTz.year > dayYear ||
        (eventEndInTz.year === dayYear && eventEndInTz.month > dayMonth) ||
        (eventEndInTz.year === dayYear && eventEndInTz.month === dayMonth && eventEndInTz.day >= dayDate)

      return startsOnOrBefore && endsOnOrAfter
    })
    .sort((a, b) => {
      // All-day events first, then by start time
      if (a.isAllDay && !b.isAllDay) return -1
      if (!a.isAllDay && b.isAllDay) return 1
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    })
}

/**
 * Get dates that have events for calendar dot indicators
 * WHY: Show indicators on dates with events in user's timezone
 *
 * @param events - All events
 * @param timezone - User's preferred timezone
 */
function getDatesWithEvents(events: CalendarEvent[], timezone: string): Set<string> {
  const dates = new Set<string>()
  events.forEach((event) => {
    // Get the event start date in user's timezone
    const dateInTz = getDateInTimezone(event.startDate, timezone)
    dates.add(`${dateInTz.year}-${dateInTz.month}-${dateInTz.day}`)
  })
  return dates
}

/**
 * Format date for header display
 */
function formatDateHeader(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameDay(date, today)) {
    return 'Today'
  } else if (isSameDay(date, tomorrow)) {
    return 'Tomorrow'
  } else if (isSameDay(date, yesterday)) {
    return 'Yesterday'
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function MobileCalendarView({
  selectedDate,
  onDateSelect,
  events,
  timezone,
  onEventClick,
  onCreateEvent,
  canCreate = true,
  className,
}: MobileCalendarViewProps) {
  const today = useMemo(() => new Date(), [])

  /**
   * Check if selected date is today
   */
  const isToday = useMemo(
    () => isSameDay(selectedDate, today),
    [selectedDate, today]
  )

  /**
   * Events for the selected day - filtered using user's timezone
   */
  const dayEvents = useMemo(
    () => getEventsForDay(events, selectedDate, timezone),
    [events, selectedDate, timezone]
  )

  /**
   * Dates with events for calendar dot indicators - using user's timezone
   */
  const datesWithEvents = useMemo(
    () => getDatesWithEvents(events, timezone),
    [events, timezone]
  )

  /**
   * Custom day content with event indicators
   * WHY: Show dots on dates that have events in user's timezone
   */
  const modifiers = useMemo(() => {
    const hasEvents: Date[] = []
    events.forEach((event) => {
      // Get the event date in user's timezone
      const dateInTz = getDateInTimezone(event.startDate, timezone)
      const date = new Date(dateInTz.year, dateInTz.month, dateInTz.day)
      // Only add unique dates
      if (!hasEvents.some((d) => isSameDay(d, date))) {
        hasEvents.push(date)
      }
    })
    return { hasEvents }
  }, [events, timezone])

  /**
   * Handle Today button click
   * WHY: Quick navigation back to current date when user gets lost
   */
  const handleTodayClick = () => {
    onDateSelect(new Date())
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Calendar Section - Top Half */}
      <div className="shrink-0 border-b bg-sidebar">
        {/* Today Button Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
          <span className="text-sm font-medium text-muted-foreground">
            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <Button
            variant={isToday ? 'secondary' : 'outline'}
            size="sm"
            onClick={handleTodayClick}
            className="h-7 text-xs gap-1.5"
            disabled={isToday}
          >
            <CircleDot className="h-3 w-3" />
            Today
          </Button>
        </div>

        <div className="flex justify-center py-2">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && onDateSelect(date)}
            defaultMonth={selectedDate}
            modifiers={modifiers}
            modifiersClassNames={{
              hasEvents: 'relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary',
            }}
            className="w-full max-w-[350px]"
          />
        </div>
      </div>

      {/* Events Section - Bottom Half */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Selected Date Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-10">
          <div>
            <h3 className="font-semibold text-sm">
              {formatDateHeader(selectedDate)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {dayEvents.length === 0
                ? 'No events'
                : `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {/* FeatureGate intercepts click and shows upgrade modal when calendar limit is reached */}
          {canCreate && onCreateEvent && (
            <FeatureGate feature="calendars.limit">
              <Button
                size="sm"
                onClick={onCreateEvent}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </FeatureGate>
          )}
        </div>

        {/* Scrollable Events List */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {dayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <CalendarDays className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No events scheduled
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Tap the + button to create an event
                </p>
              </div>
            ) : (
              dayEvents.map((event) => (
                <MobileEventCard
                  key={event.id}
                  event={event}
                  timezone={timezone}
                  onClick={() => onEventClick?.(event)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

/**
 * Mobile Event Card - Larger touch target with more details
 * WHY: Mobile users need larger tap areas and more visible information
 * Uses timezone for correct time display
 */
function MobileEventCard({
  event,
  timezone,
  onClick,
}: {
  event: CalendarEvent
  /** User's timezone for time display */
  timezone: string
  onClick?: () => void
}) {
  const statusConfig = {
    PENDING: { label: 'Pending', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    APPROVED: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    CANCELLED: { label: 'Cancelled', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  }

  const isCancelled = event.status === 'CANCELLED'
  const status = statusConfig[event.status]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-xl transition-all',
        'dark:bg-muted/40 backdrop-blur-lg bg-card',
        'dark:border-t dark:ring-background dark:ring-1 dark:shadow-sm',
        'ring-1 ring-border',
        'hover:ring-primary/50 active:scale-[0.98]',
        isCancelled && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Color indicator */}
        <div
          className={cn(
            'w-1 rounded-full self-stretch min-h-[40px]',
            `bg-${event.color}-500`
          )}
          style={{
            backgroundColor: getEventColor(event.color),
          }}
        />

        <div className="flex-1 min-w-0">
          {/* Title and Status */}
          <div className="flex items-start justify-between gap-2">
            <h4
              className={cn(
                'font-medium text-sm line-clamp-2',
                isCancelled && 'line-through decoration-muted-foreground/50'
              )}
            >
              {event.title}
            </h4>
            <span
              className={cn(
                'shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium',
                status.className
              )}
            >
              {status.label}
            </span>
          </div>

          {/* Time - displayed in user's timezone */}
          <p className="text-xs text-muted-foreground mt-1">
            {event.isAllDay ? 'All day' : formatTimeRangeInTimezone(event.startDate, event.endDate, timezone)}
          </p>

          {/* Description preview */}
          {event.description && (
            <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">
              {event.description}
            </p>
          )}

          {/* Location or Meeting Link */}
          {(event.location || event.meetingUrl) && (
            <p className="text-xs text-muted-foreground mt-1.5 truncate">
              {event.location || 'Virtual meeting'}
            </p>
          )}

          {/* Assignee and Lead Attendee */}
          {(event.assignedTo || event.lead) && (
            <div className="flex items-center gap-2 mt-2">
              {/* Assigned Team Member */}
              {event.assignedTo && (
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
                    {event.assignedTo.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  <span className="text-xs text-muted-foreground truncate">
                    {event.assignedTo.name}
                  </span>
                </div>
              )}

              {/* Lead Attendee - shown with different styling */}
              {event.lead && (
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    {event.lead.firstName && event.lead.lastName
                      ? `${event.lead.firstName[0]}${event.lead.lastName[0]}`.toUpperCase()
                      : event.lead.email.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs text-muted-foreground truncate">
                    {[event.lead.firstName, event.lead.lastName].filter(Boolean).join(' ') || event.lead.email}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

/**
 * Get CSS color value for event color
 */
function getEventColor(color: string): string {
  const colorMap: Record<string, string> = {
    blue: '#3b82f6',
    orange: '#f97316',
    green: '#10b981',
    purple: '#8b5cf6',
    red: '#ef4444',
    pink: '#ec4899',
    yellow: '#f59e0b',
    gray: '#6b7280',
  }
  return colorMap[color] || colorMap.gray
}
