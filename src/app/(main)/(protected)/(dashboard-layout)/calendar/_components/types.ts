/**
 * Calendar Feature Type Definitions
 *
 * WHY: Type-safe calendar event data structures for UI components
 * HOW: Re-exports CalendarEventUI from hooks as the SOURCE OF TRUTH
 *
 * SOURCE OF TRUTH: CalendarEventUI from @/hooks/use-calendar
 * The Prisma CalendarEvent model is the database source of truth.
 *
 * Search Keywords: SOURCE OF TRUTH, CALENDAR TYPES, EVENT TYPES, TIMEZONE
 */

import { formatInTimezone, utcToTimezone } from '@/lib/timezone/timezone-utils'

// Re-export the UI types from the hook as the source of truth
export type { CalendarEventUI as CalendarEvent, CalendarEventStatus } from '@/hooks/use-calendar'

/** Event color type - matches Prisma schema eventColorSchema */
export type EventColor = 'blue' | 'orange' | 'green' | 'purple' | 'red' | 'pink' | 'yellow' | 'gray'

/** Calendar view type */
export type CalendarViewType = 'day' | 'week' | 'month'

/** Time slot for the week/day view grid */
export type TimeSlot = {
  hour: number
  label: string
}

/**
 * Format time from Date to display string (browser timezone)
 * WHY: Legacy function for backward compatibility
 */
export function formatTime(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  const displayMinutes = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`
  return `${displayHours}${displayMinutes} ${ampm}`
}

/**
 * Format time in a specific timezone
 * WHY: Display calendar event times in user's preferred timezone
 *
 * @param date - UTC date to format
 * @param timezone - IANA timezone (e.g., "America/New_York")
 * @returns Formatted time string (e.g., "9:30 AM")
 */
export function formatTimeInTimezone(date: Date, timezone: string): string {
  return formatInTimezone(date, timezone, 'h:mm a')
}

/**
 * Get hours and minutes of a date in a specific timezone
 * WHY: Calculate event positions based on user's timezone, not browser timezone
 *
 * @param date - UTC date
 * @param timezone - IANA timezone (e.g., "America/New_York")
 * @returns Object with hour (0-23) and minutes (0-59) in the target timezone
 */
export function getTimeInTimezone(date: Date, timezone: string): { hour: number; minutes: number } {
  const zonedDate = utcToTimezone(date, timezone)
  return {
    hour: zonedDate.getHours(),
    minutes: zonedDate.getMinutes(),
  }
}

/**
 * Get the date components in a specific timezone
 * WHY: Determine which day an event falls on in user's timezone
 *
 * @param date - UTC date
 * @param timezone - IANA timezone
 * @returns Object with year, month, day in the target timezone
 */
export function getDateInTimezone(date: Date, timezone: string): { year: number; month: number; day: number } {
  const zonedDate = utcToTimezone(date, timezone)
  return {
    year: zonedDate.getFullYear(),
    month: zonedDate.getMonth(),
    day: zonedDate.getDate(),
  }
}

/** Format date range for event display (browser timezone - legacy) */
export function formatTimeRange(start: Date, end?: Date): string {
  const startStr = formatTime(start)
  if (!end) return startStr
  const endStr = formatTime(end)
  return `${startStr} - ${endStr}`
}

/**
 * Format date range in a specific timezone
 * WHY: Display event time ranges in user's preferred timezone
 *
 * @param start - UTC start date
 * @param end - UTC end date (optional)
 * @param timezone - IANA timezone
 * @returns Formatted time range string (e.g., "9:00 AM - 10:30 AM")
 */
export function formatTimeRangeInTimezone(start: Date, end: Date | undefined, timezone: string): string {
  const startStr = formatTimeInTimezone(start, timezone)
  if (!end) return startStr
  const endStr = formatTimeInTimezone(end, timezone)
  return `${startStr} - ${endStr}`
}
