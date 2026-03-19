/**
 * Timezone Utilities
 *
 * WHY: Centralized timezone handling for booking calendar system
 * HOW: Uses date-fns-tz for accurate timezone conversions
 *
 * BOOKING SYSTEM TIMEZONE FLOW:
 * 1. Team members set availability in THEIR timezone (stored in User.timezone)
 * 2. When generating slots, convert member availability to UTC
 * 3. When displaying to booker, convert UTC slots to BOOKER'S timezone
 * 4. Booker sees slots in their local time, books in their time
 * 5. Calendar event created in UTC, displayed correctly for both parties
 *
 * SOURCE OF TRUTH KEYWORDS: TimezoneUtils, BookingTimezone, AvailabilityTimezone
 */

import { format, parse, addMinutes, startOfDay, isBefore, isAfter } from 'date-fns'
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Time slot with timezone info
 * SOURCE OF TRUTH: SmartTimeSlot type for booking availability
 */
export type SmartTimeSlot = {
  /** Start time in UTC (ISO string) */
  startTimeUtc: string
  /** End time in UTC (ISO string) */
  endTimeUtc: string
  /** Start time formatted for display in booker's timezone */
  startTimeDisplay: string
  /** End time formatted for display in booker's timezone */
  endTimeDisplay: string
  /** Available team members for this slot */
  availableMembers: {
    memberId: string
    memberName: string
    timezone: string
  }[]
}

/**
 * Member availability window for a specific day
 * SOURCE OF TRUTH: MemberDayWindow type for slot calculation
 */
export type MemberDayWindow = {
  memberId: string
  memberName: string
  timezone: string
  /** Start of availability in UTC */
  startUtc: Date
  /** End of availability in UTC */
  endUtc: Date
  /** Whether this day is enabled */
  isEnabled: boolean
}

// ============================================================================
// TIMEZONE DETECTION
// ============================================================================

/**
 * Get the browser's timezone
 * WHY: Auto-detect booker's timezone for display
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Validate if a timezone string is valid IANA timezone
 * WHY: Ensure timezone inputs are valid before processing
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

// ============================================================================
// TIMEZONE CONVERSION
// ============================================================================

/**
 * Convert a time string (HH:mm) on a given date from one timezone to another
 * WHY: Member availability is stored as HH:mm in their timezone, need to convert to UTC
 *
 * @param date - The base date (used for determining DST offset)
 * @param timeString - Time in HH:mm format (e.g., "09:00")
 * @param fromTimezone - Source timezone (e.g., "America/New_York")
 * @param toTimezone - Target timezone (e.g., "UTC")
 * @returns Date object in the target timezone
 */
export function convertTimeOnDate(
  date: Date,
  timeString: string,
  fromTimezone: string,
  toTimezone: string
): Date {
  // Parse the time string
  const [hours, minutes] = timeString.split(':').map(Number)

  // Create a date in the source timezone
  const zonedDate = toZonedTime(date, fromTimezone)
  zonedDate.setHours(hours, minutes, 0, 0)

  // Convert to UTC first
  const utcDate = fromZonedTime(zonedDate, fromTimezone)

  // If target is UTC, return as-is
  if (toTimezone === 'UTC') {
    return utcDate
  }

  // Convert to target timezone
  return toZonedTime(utcDate, toTimezone)
}

/**
 * Convert a Date from UTC to a specific timezone for display
 * WHY: Bookers need to see slots in their local time
 */
export function utcToTimezone(utcDate: Date, timezone: string): Date {
  return toZonedTime(utcDate, timezone)
}

/**
 * Convert a Date from a specific timezone to UTC
 * WHY: Store all times in UTC for consistency
 */
export function timezoneToUtc(localDate: Date, timezone: string): Date {
  return fromZonedTime(localDate, timezone)
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

/**
 * Format a UTC date in a specific timezone
 * WHY: Display times in booker's timezone with proper formatting
 *
 * @param utcDate - Date in UTC
 * @param timezone - Target timezone for display
 * @param formatString - date-fns format string (default: "h:mm a")
 */
export function formatInTimezone(
  utcDate: Date | string,
  timezone: string,
  formatString: string = 'h:mm a'
): string {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate
  return formatInTimeZone(date, timezone, formatString)
}

/**
 * Format a time range in a specific timezone
 * WHY: Display slot ranges like "9:00 AM - 9:30 AM"
 */
export function formatTimeRange(
  startUtc: Date | string,
  endUtc: Date | string,
  timezone: string
): string {
  const startFormatted = formatInTimezone(startUtc, timezone, 'h:mm a')
  const endFormatted = formatInTimezone(endUtc, timezone, 'h:mm a')
  return `${startFormatted} - ${endFormatted}`
}

/**
 * Get timezone abbreviation for display
 * WHY: Show "EST", "PST", etc. next to times
 */
export function getTimezoneAbbreviation(timezone: string, date: Date = new Date()): string {
  return formatInTimeZone(date, timezone, 'zzz')
}

/**
 * Get full timezone label for display
 * WHY: User-friendly timezone display
 */
export function getTimezoneLabel(timezone: string, date: Date = new Date()): string {
  const abbr = getTimezoneAbbreviation(timezone, date)
  const offset = formatInTimeZone(date, timezone, 'xxxxx')
  return `${timezone.replace(/_/g, ' ')} (${abbr}, UTC${offset})`
}

// ============================================================================
// SLOT GENERATION HELPERS
// ============================================================================

/**
 * Parse HH:mm time string to minutes since midnight
 * WHY: Easier to compare and calculate with minutes
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Convert minutes since midnight to HH:mm string
 */
export function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * Generate member's availability window for a specific date
 * WHY: Convert member's HH:mm availability to UTC Date range for the given date
 *
 * @param date - The date to generate availability for (in UTC)
 * @param startTime - Member's start time in HH:mm (in their timezone)
 * @param endTime - Member's end time in HH:mm (in their timezone)
 * @param memberTimezone - Member's timezone (IANA format)
 * @returns Object with startUtc and endUtc dates
 */
export function getMemberAvailabilityWindow(
  date: Date,
  startTime: string,
  endTime: string,
  memberTimezone: string
): { startUtc: Date; endUtc: Date } {
  // Get the start of the requested date in member's timezone
  const dateInMemberTz = toZonedTime(date, memberTimezone)
  const dayStart = startOfDay(dateInMemberTz)

  // Parse times and create dates in member's timezone
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)

  const memberStart = new Date(dayStart)
  memberStart.setHours(startHours, startMinutes, 0, 0)

  const memberEnd = new Date(dayStart)
  memberEnd.setHours(endHours, endMinutes, 0, 0)

  // Convert to UTC
  const startUtc = fromZonedTime(memberStart, memberTimezone)
  const endUtc = fromZonedTime(memberEnd, memberTimezone)

  return { startUtc, endUtc }
}

/**
 * Check if a time slot overlaps with an event
 * WHY: Filter out slots that conflict with existing calendar events
 */
export function hasTimeConflict(
  slotStart: Date,
  slotEnd: Date,
  eventStart: Date,
  eventEnd: Date
): boolean {
  return isBefore(slotStart, eventEnd) && isAfter(slotEnd, eventStart)
}

/**
 * Check if a time slot falls within an availability window
 * WHY: Ensure slots are only generated within working hours
 */
export function isWithinWindow(
  slotStart: Date,
  slotEnd: Date,
  windowStart: Date,
  windowEnd: Date
): boolean {
  return !isBefore(slotStart, windowStart) && !isAfter(slotEnd, windowEnd)
}

// ============================================================================
// GMT OFFSET & TIMEZONE LABEL FORMATTING
// ============================================================================

/**
 * Timezone option for dropdown selectors
 * SOURCE OF TRUTH: TimezoneOption type for timezone dropdowns
 */
export type TimezoneOption = {
  value: string      // IANA timezone identifier (e.g., "America/New_York")
  label: string      // Display label with GMT offset (e.g., "(GMT-5:00) New York")
  offset: number     // Offset in minutes (for sorting)
  city: string       // City/region name without GMT prefix
}

/**
 * Calculate GMT offset for a timezone
 * WHY: Display user-friendly offset like "(GMT+5:30)" in timezone dropdowns
 *
 * @param timezone - IANA timezone identifier (e.g., "Asia/Dubai")
 * @param date - Date to calculate offset for (defaults to now, important for DST)
 * @returns Offset in minutes from UTC (e.g., 240 for GMT+4)
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  try {
    // Get the offset by comparing local time in the timezone vs UTC
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }))
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60)
  } catch {
    return 0
  }
}

/**
 * Format offset minutes to GMT string
 * WHY: Display offset in standard format like "GMT+5:30" or "GMT-8:00"
 *
 * @param offsetMinutes - Offset in minutes (e.g., 330 for +5:30)
 * @returns Formatted string like "GMT+5:30" or "GMT-8:00"
 */
export function formatGmtOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60

  if (minutes === 0) {
    return `GMT${sign}${hours}`
  }
  return `GMT${sign}${hours}:${String(minutes).padStart(2, '0')}`
}

/**
 * Generate timezone label with GMT offset
 * WHY: User-friendly display like "(GMT+4:00) Dubai" for timezone dropdowns
 *
 * @param timezone - IANA timezone identifier
 * @param cityName - Display name for the city/region
 * @param date - Date for offset calculation (for DST awareness)
 * @returns Formatted label like "(GMT+4:00) Dubai"
 */
export function formatTimezoneLabel(
  timezone: string,
  cityName: string,
  date: Date = new Date()
): string {
  const offset = getTimezoneOffset(timezone, date)
  const gmtString = formatGmtOffset(offset)
  return `(${gmtString}) ${cityName}`
}

/**
 * Create a TimezoneOption from timezone and city name
 * WHY: Build timezone dropdown options with proper labels and sorting
 */
export function createTimezoneOption(
  timezone: string,
  cityName: string,
  date: Date = new Date()
): TimezoneOption {
  const offset = getTimezoneOffset(timezone, date)
  return {
    value: timezone,
    label: formatTimezoneLabel(timezone, cityName, date),
    offset,
    city: cityName,
  }
}

/**
 * Get timezone for a country code
 * WHY: Used during user creation to auto-set timezone
 * SOURCE OF TRUTH: Countries file (src/constants/countries.ts)
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "US", "GB", "AE")
 * @returns IANA timezone string or UTC as fallback
 */
export function getTimezoneForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return 'UTC'

  // Dynamic import to avoid circular dependency - countries.ts imports from here
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getCountryByCode } = require('@/constants/countries')
  const country = getCountryByCode(countryCode)
  return country?.timezone ?? 'UTC'
}

// ============================================================================
// COMMON TIMEZONES LIST
// ============================================================================

/**
 * Common timezone option with region grouping
 * SOURCE OF TRUTH: CommonTimezoneOption for timezone dropdown selectors
 */
export type CommonTimezoneOption = {
  value: string   // IANA timezone identifier
  label: string   // Display label with GMT offset
  region: string  // Region grouping for organized dropdowns
}

/**
 * List of commonly used timezones grouped by region
 * WHY: Provides a curated list of timezones for user selection in dropdowns
 * HOW: Organized by geographic region with GMT offset labels for clarity
 *
 * SOURCE OF TRUTH KEYWORDS: CommonTimezones, TimezoneDropdown, AvailabilityTimezones
 */
export const COMMON_TIMEZONES: CommonTimezoneOption[] = [
  // UTC
  { value: 'UTC', label: '(GMT+0) UTC', region: 'UTC' },

  // Americas
  { value: 'America/New_York', label: '(GMT-5) New York', region: 'Americas' },
  { value: 'America/Chicago', label: '(GMT-6) Chicago', region: 'Americas' },
  { value: 'America/Denver', label: '(GMT-7) Denver', region: 'Americas' },
  { value: 'America/Los_Angeles', label: '(GMT-8) Los Angeles', region: 'Americas' },
  { value: 'America/Anchorage', label: '(GMT-9) Anchorage', region: 'Americas' },
  { value: 'Pacific/Honolulu', label: '(GMT-10) Honolulu', region: 'Americas' },
  { value: 'America/Toronto', label: '(GMT-5) Toronto', region: 'Americas' },
  { value: 'America/Vancouver', label: '(GMT-8) Vancouver', region: 'Americas' },
  { value: 'America/Mexico_City', label: '(GMT-6) Mexico City', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: '(GMT-3) São Paulo', region: 'Americas' },
  { value: 'America/Buenos_Aires', label: '(GMT-3) Buenos Aires', region: 'Americas' },
  { value: 'America/Bogota', label: '(GMT-5) Bogotá', region: 'Americas' },
  { value: 'America/Lima', label: '(GMT-5) Lima', region: 'Americas' },

  // Europe
  { value: 'Europe/London', label: '(GMT+0) London', region: 'Europe' },
  { value: 'Europe/Paris', label: '(GMT+1) Paris', region: 'Europe' },
  { value: 'Europe/Berlin', label: '(GMT+1) Berlin', region: 'Europe' },
  { value: 'Europe/Amsterdam', label: '(GMT+1) Amsterdam', region: 'Europe' },
  { value: 'Europe/Brussels', label: '(GMT+1) Brussels', region: 'Europe' },
  { value: 'Europe/Madrid', label: '(GMT+1) Madrid', region: 'Europe' },
  { value: 'Europe/Rome', label: '(GMT+1) Rome', region: 'Europe' },
  { value: 'Europe/Zurich', label: '(GMT+1) Zurich', region: 'Europe' },
  { value: 'Europe/Stockholm', label: '(GMT+1) Stockholm', region: 'Europe' },
  { value: 'Europe/Oslo', label: '(GMT+1) Oslo', region: 'Europe' },
  { value: 'Europe/Helsinki', label: '(GMT+2) Helsinki', region: 'Europe' },
  { value: 'Europe/Athens', label: '(GMT+2) Athens', region: 'Europe' },
  { value: 'Europe/Moscow', label: '(GMT+3) Moscow', region: 'Europe' },
  { value: 'Europe/Istanbul', label: '(GMT+3) Istanbul', region: 'Europe' },

  // Africa
  { value: 'Africa/Cairo', label: '(GMT+2) Cairo', region: 'Africa' },
  { value: 'Africa/Johannesburg', label: '(GMT+2) Johannesburg', region: 'Africa' },
  { value: 'Africa/Lagos', label: '(GMT+1) Lagos', region: 'Africa' },
  { value: 'Africa/Nairobi', label: '(GMT+3) Nairobi', region: 'Africa' },
  { value: 'Africa/Casablanca', label: '(GMT+1) Casablanca', region: 'Africa' },

  // Middle East
  { value: 'Asia/Dubai', label: '(GMT+4) Dubai', region: 'Middle East' },
  { value: 'Asia/Riyadh', label: '(GMT+3) Riyadh', region: 'Middle East' },
  { value: 'Asia/Jerusalem', label: '(GMT+2) Jerusalem', region: 'Middle East' },
  { value: 'Asia/Tehran', label: '(GMT+3:30) Tehran', region: 'Middle East' },
  { value: 'Asia/Kuwait', label: '(GMT+3) Kuwait', region: 'Middle East' },
  { value: 'Asia/Qatar', label: '(GMT+3) Doha', region: 'Middle East' },

  // Asia
  { value: 'Asia/Kolkata', label: '(GMT+5:30) Mumbai', region: 'Asia' },
  { value: 'Asia/Dhaka', label: '(GMT+6) Dhaka', region: 'Asia' },
  { value: 'Asia/Bangkok', label: '(GMT+7) Bangkok', region: 'Asia' },
  { value: 'Asia/Singapore', label: '(GMT+8) Singapore', region: 'Asia' },
  { value: 'Asia/Hong_Kong', label: '(GMT+8) Hong Kong', region: 'Asia' },
  { value: 'Asia/Shanghai', label: '(GMT+8) Shanghai', region: 'Asia' },
  { value: 'Asia/Taipei', label: '(GMT+8) Taipei', region: 'Asia' },
  { value: 'Asia/Seoul', label: '(GMT+9) Seoul', region: 'Asia' },
  { value: 'Asia/Tokyo', label: '(GMT+9) Tokyo', region: 'Asia' },
  { value: 'Asia/Manila', label: '(GMT+8) Manila', region: 'Asia' },
  { value: 'Asia/Jakarta', label: '(GMT+7) Jakarta', region: 'Asia' },
  { value: 'Asia/Karachi', label: '(GMT+5) Karachi', region: 'Asia' },

  // Pacific
  { value: 'Australia/Sydney', label: '(GMT+11) Sydney', region: 'Pacific' },
  { value: 'Australia/Melbourne', label: '(GMT+11) Melbourne', region: 'Pacific' },
  { value: 'Australia/Brisbane', label: '(GMT+10) Brisbane', region: 'Pacific' },
  { value: 'Australia/Perth', label: '(GMT+8) Perth', region: 'Pacific' },
  { value: 'Pacific/Auckland', label: '(GMT+13) Auckland', region: 'Pacific' },
  { value: 'Pacific/Fiji', label: '(GMT+12) Fiji', region: 'Pacific' },
]
