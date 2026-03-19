'use client'

/**
 * Calendar Week View Grid Component
 *
 * WHY: Display a week-based calendar grid with time slots and events
 * HOW: Clean minimal grid with muted backgrounds, timezone-aware event display
 *
 * TIMEZONE HANDLING:
 * - Events are stored in UTC in the database
 * - Displayed in the user's preferred timezone (from profile settings)
 * - Event positions calculated based on user's timezone, not browser timezone
 *
 * SOURCE OF TRUTH: Uses CalendarEvent from @/hooks/use-calendar via types.ts
 *
 * Search Keywords: SOURCE OF TRUTH, WEEK VIEW, CALENDAR GRID, TIME SLOTS, TIMEZONE
 */

import { useMemo, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from './types'
import { getTimeInTimezone, getDateInTimezone } from './types'
import { EventCard } from './event-card'

/** Time configuration - Full 24-hour day display */
const START_HOUR = 0 // 12:00 AM (midnight)
const END_HOUR = 23 // 11:00 PM (last slot shows 11 PM - 12 AM)
const HOUR_HEIGHT = 64
/** Minimum column width for each day - kept narrow so grid fits on tablet screens */
const MIN_COL_WIDTH = 80

/** Generate time slot labels */
function generateTimeSlots(): { hour: number; label: string }[] {
  const slots: { hour: number; label: string }[] = []
  for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
    const displayHour = hour % 12 || 12
    const ampm = hour < 12 ? 'AM' : 'PM'
    slots.push({ hour, label: `${displayHour} ${ampm}` })
  }
  return slots
}

/** Get the days of the current week */
function getWeekDays(currentDate: Date): Date[] {
  const days: Date[] = []
  const startOfWeek = new Date(currentDate)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek)
    day.setDate(startOfWeek.getDate() + i)
    days.push(day)
  }
  return days
}

/**
 * Check if two dates are the same day
 * WHY: Used for highlighting "today" in the grid
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/** Format day header */
function formatDayHeader(date: Date): { dayName: string; dayNumber: number } {
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  return { dayName: dayNames[date.getDay()], dayNumber: date.getDate() }
}

/**
 * Calculate event position with timezone support
 * WHY: Events fit exactly in their time slots based on user's timezone
 *
 * @param event - Calendar event with UTC dates
 * @param timezone - User's preferred timezone (IANA format)
 */
function calculateEventPosition(event: CalendarEvent, timezone: string): { top: number; height: number } {
  // Get start time in user's timezone
  const startTime = getTimeInTimezone(event.startDate, timezone)
  const startHour = startTime.hour
  const startMinutes = startTime.minutes

  // Get end time in user's timezone
  const endDate = event.endDate || new Date(event.startDate.getTime() + 60 * 60 * 1000)
  const endTime = getTimeInTimezone(endDate, timezone)
  const endHour = endTime.hour
  const endMinutes = endTime.minutes

  const top = (startHour - START_HOUR) * HOUR_HEIGHT + (startMinutes / 60) * HOUR_HEIGHT
  const durationHours = endHour - startHour + (endMinutes - startMinutes) / 60
  const height = Math.max(durationHours * HOUR_HEIGHT - 4, 28)

  return { top: Math.max(0, top), height }
}

type WeekViewGridProps = {
  currentDate: Date
  events: CalendarEvent[]
  /** User's timezone for event display (IANA format, e.g., "America/New_York") */
  timezone: string
  onEventClick?: (event: CalendarEvent) => void
  onSlotClick?: (date: Date, hour: number) => void
  className?: string
}

/**
 * Get events that overlap with a specific day in the user's timezone
 * WHY: Filter events array to show only events relevant to each day column
 *
 * @param events - All events
 * @param date - The day to check (in local browser time, represents the calendar column)
 * @param timezone - User's preferred timezone
 */
function getEventsForDay(events: CalendarEvent[], date: Date, timezone: string): CalendarEvent[] {
  // Get the day's date components (year, month, day) from the column date
  const dayYear = date.getFullYear()
  const dayMonth = date.getMonth()
  const dayDate = date.getDate()

  return events.filter((event) => {
    // Get event start date in user's timezone
    const eventStartInTz = getDateInTimezone(event.startDate, timezone)
    const eventEndInTz = getDateInTimezone(event.endDate, timezone)

    // Check if event overlaps with this day in the user's timezone
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
}

/**
 * Get all-day events for a specific day
 * @param events - All events
 * @param date - The day to check
 * @param timezone - User's timezone
 */
function getAllDayEventsForDay(events: CalendarEvent[], date: Date, timezone: string): CalendarEvent[] {
  return getEventsForDay(events, date, timezone).filter((event) => event.isAllDay)
}

/**
 * Get timed (non-all-day) events for a specific day
 * @param events - All events
 * @param date - The day to check
 * @param timezone - User's timezone
 */
function getTimedEventsForDay(events: CalendarEvent[], date: Date, timezone: string): CalendarEvent[] {
  return getEventsForDay(events, date, timezone).filter((event) => !event.isAllDay)
}

export function WeekViewGrid({
  currentDate,
  events,
  timezone,
  onEventClick,
  onSlotClick,
  className,
}: WeekViewGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const timeSlots = useMemo(() => generateTimeSlots(), [])
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate])
  const today = useMemo(() => new Date(), [])

  /**
   * Scroll to current time on mount - centers view around current hour
   * WHY: Improve UX by showing the current time slot immediately when calendar loads
   * Uses user's timezone for correct hour calculation
   */
  useEffect(() => {
    if (gridRef.current) {
      // Get current hour in user's timezone (not browser's local time)
      const timeInUserTz = getTimeInTimezone(new Date(), timezone)
      const currentHour = timeInUserTz.hour
      // Scroll to show current time with some context above it (2 hours before)
      const scrollTop = Math.max(0, (currentHour - 2) * HOUR_HEIGHT)
      gridRef.current.scrollTop = scrollTop
    }
  }, [timezone])

  /**
   * Get events for each day - using timezone for correct day assignment
   * WHY: Events need to be filtered based on user's timezone, not browser timezone
   */
  const eventsByDay = useMemo(() => {
    return weekDays.map((day) => ({
      day,
      allDayEvents: getAllDayEventsForDay(events, day, timezone),
      timedEvents: getTimedEventsForDay(events, day, timezone),
    }))
  }, [weekDays, events, timezone])

  const hasAllDayEvents = eventsByDay.some((d) => d.allDayEvents.length > 0)
  const totalGridHeight = timeSlots.length * HOUR_HEIGHT

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header row with day names */}
      <div className="flex shrink-0 border-b border-border">
        <div className="w-14 shrink-0" />
        {weekDays.map((day, idx) => {
          const { dayName, dayNumber } = formatDayHeader(day)
          const isToday = isSameDay(day, today)

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'flex-1 min-w-[80px] text-center py-3',
                idx > 0 && 'border-l border-border/60'
              )}
            >
              <div className={cn(
                'text-[10px] font-medium tracking-wide',
                isToday ? 'text-primary' : 'text-muted-foreground'
              )}>
                {dayName}
              </div>
              <div className={cn(
                'text-sm font-semibold mt-0.5',
                isToday && 'bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto'
              )}>
                {dayNumber}
              </div>
            </div>
          )
        })}
      </div>

      {/* All-day events row */}
      {hasAllDayEvents && (
        <div className="flex shrink-0 border-b border-border min-h-[40px]">
          <div className="w-14 shrink-0 flex items-center justify-end pr-2">
            <span className="text-[10px] text-muted-foreground">All day</span>
          </div>
          {eventsByDay.map(({ day, allDayEvents }, idx) => (
            <div
              key={day.toISOString()}
              className={cn(
                'flex-1 min-w-[80px] p-1',
                idx > 0 && 'border-l border-border/60'
              )}
            >
              {allDayEvents.map((event) => (
                <EventCard key={event.id} event={event} compact onClick={onEventClick} timezone={timezone} className="mb-1" />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={gridRef} className="flex-1 overflow-auto">
        <div className="flex relative" style={{ minHeight: `${totalGridHeight + 16}px` }}>
          {/* Time labels column - sticky positioned */}
          <div className="w-14 shrink-0 pt-2">
            {timeSlots.map((slot) => (
              <div
                key={slot.hour}
                className="relative"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <span className="absolute top-0 right-2 text-[10px] text-muted-foreground -translate-y-1/2">
                  {slot.label}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns with events */}
          {eventsByDay.map(({ day, timedEvents }, idx) => {
            const isToday = isSameDay(day, today)

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex-1 min-w-[80px] relative pt-2',
                  idx > 0 && 'border-l border-border/60',
                  isToday && 'bg-primary/[0.03]'
                )}
                style={{ height: `${totalGridHeight + 16}px` }}
              >
                {/* Hour grid lines */}
                {timeSlots.map((slot, slotIdx) => (
                  <div
                    key={slot.hour}
                    className={cn(
                      'absolute left-0 right-0 cursor-pointer transition-colors',
                      'hover:bg-muted/40',
                      'border-t border-border/50'
                    )}
                    style={{
                      top: `${(slot.hour - START_HOUR) * HOUR_HEIGHT + 8}px`,
                      height: `${HOUR_HEIGHT}px`
                    }}
                    onClick={() => onSlotClick?.(day, slot.hour)}
                  />
                ))}

                {/* Current time indicator - positioned in user's timezone */}
                {isToday && <CurrentTimeIndicator timezone={timezone} />}

                {/* Events - offset by 8px for top padding, positioned based on user's timezone */}
                {timedEvents.map((event) => {
                  const { top, height } = calculateEventPosition(event, timezone)
                  const isCompact = height < 50

                  return (
                    <div
                      key={event.id}
                      className="absolute left-1 right-1 z-10"
                      style={{ top: `${top + 10}px`, height: `${height}px` }}
                    >
                      <EventCard
                        event={event}
                        compact={isCompact}
                        onClick={onEventClick}
                        timezone={timezone}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Current time indicator - shows red line at current time
 * WHY: Visual indicator to help users see where "now" is on the calendar
 *
 * TIMEZONE-AWARE: Uses user's timezone to position the line correctly
 * The current time is converted from UTC to user's timezone before calculating position
 *
 * @param timezone - User's preferred timezone (IANA format, e.g., "America/New_York")
 */
function CurrentTimeIndicator({ timezone }: { timezone: string }) {
  // Get current time in user's timezone (not browser's local time)
  const now = new Date()
  const timeInUserTz = getTimeInTimezone(now, timezone)
  const currentHour = timeInUserTz.hour
  const currentMinutes = timeInUserTz.minutes

  // Always visible since we now show full 24 hours (START_HOUR=0, END_HOUR=23)
  const top = (currentHour - START_HOUR) * HOUR_HEIGHT + (currentMinutes / 60) * HOUR_HEIGHT

  return (
    <div
      className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
      style={{ top: `${top + 8}px` }}
    >
      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
      <div className="flex-1 h-[2px] bg-red-500" />
    </div>
  )
}
