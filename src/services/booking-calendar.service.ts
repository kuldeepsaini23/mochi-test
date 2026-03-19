/**
 * Booking Calendar Service (DAL)
 *
 * Data Access Layer for booking calendar operations.
 * This is the ONLY place that should interact with Prisma for booking calendars.
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, BookingAvailability, CalendarBooking, Appointments, Scheduling
 *
 * FEATURES:
 * - Create/manage multiple booking calendar types
 * - Set availability schedules per calendar
 * - Handle public bookings from external users
 * - Generate available time slots
 *
 * tRPC routers call these functions after security checks.
 */

import { prisma } from '@/lib/config'
import type { Prisma, BookingStatus } from '@/generated/prisma'
import { runs } from '@trigger.dev/sdk/v3'
import { appointmentStartedTask } from '@/lib/trigger'
import { logActivity } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input type for creating a booking calendar
 * SOURCE OF TRUTH: BookingCalendar model in Prisma schema
 */
export type BookingCalendarCreateInput = {
  organizationId: string
  name: string
  slug: string
  description?: string | null
  duration?: number
  bufferBefore?: number
  bufferAfter?: number
  color?: string
  locationType?: string
  locationDetails?: string | null
  isActive?: boolean
  defaultAssigneeId?: string | null
  /** Max days ahead a booker can see/book slots. null = unlimited. */
  maxBookingDays?: number | null
}

/**
 * Input type for updating a booking calendar
 * SOURCE OF TRUTH: BookingCalendar model in Prisma schema
 */
export type BookingCalendarUpdateInput = {
  name?: string
  slug?: string
  description?: string | null
  duration?: number
  bufferBefore?: number
  bufferAfter?: number
  color?: string
  locationType?: string
  locationDetails?: string | null
  isActive?: boolean
  defaultAssigneeId?: string | null
  /** Max days ahead a booker can see/book slots. null = unlimited. */
  maxBookingDays?: number | null
}

/**
 * Input type for setting availability
 * SOURCE OF TRUTH: BookingAvailability model in Prisma schema
 */
export type AvailabilityInput = {
  dayOfWeek: number // 0-6 (Sunday-Saturday)
  startTime: string // HH:mm format
  endTime: string // HH:mm format
  isEnabled: boolean
}

/**
 * Input type for creating a booking
 * SOURCE OF TRUTH: CalendarBooking model in Prisma schema
 */
export type BookingCreateInput = {
  bookingCalendarId: string
  organizationId: string
  startTime: Date
  endTime: Date
  bookerName: string
  bookerEmail: string
  bookerPhone?: string | null
  notes?: string | null
  /** Optional: Lead ID to link as attendee on the calendar event */
  leadId?: string | null
}

// ============================================================================
// DEFAULT INCLUDES
// ============================================================================

/**
 * Booking calendar include configuration
 * WHY: Include availability schedule for display
 */
const BOOKING_CALENDAR_INCLUDE = {
  availability: {
    orderBy: { dayOfWeek: 'asc' as const },
  },
  // Include assignees with their member and user info for avatar display
  assignees: {
    where: { isActive: true },
    orderBy: { priority: 'asc' as const },
    include: {
      member: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BookingCalendarInclude

/**
 * Booking include configuration
 * WHY: Include calendar and event details
 */
const BOOKING_INCLUDE = {
  bookingCalendar: {
    select: {
      id: true,
      name: true,
      duration: true,
      color: true,
      locationType: true,
      locationDetails: true,
    },
  },
  calendarEvent: {
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      meetingUrl: true,
    },
  },
} satisfies Prisma.CalendarBookingInclude

// ============================================================================
// BOOKING CALENDAR CRUD
// ============================================================================

/**
 * Get a single booking calendar by ID
 */
export async function getBookingCalendar(calendarId: string) {
  return prisma.bookingCalendar.findUnique({
    where: { id: calendarId },
    include: BOOKING_CALENDAR_INCLUDE,
  })
}

/**
 * Get a booking calendar by slug (for public booking pages)
 */
export async function getBookingCalendarBySlug(organizationId: string, slug: string) {
  return prisma.bookingCalendar.findUnique({
    where: {
      organizationId_slug: { organizationId, slug },
    },
    include: BOOKING_CALENDAR_INCLUDE,
  })
}

/**
 * Get all booking calendars for an organization
 */
export async function getBookingCalendars(organizationId: string) {
  return prisma.bookingCalendar.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: BOOKING_CALENDAR_INCLUDE,
  })
}

/**
 * Get only active booking calendars (for public booking page)
 */
export async function getActiveBookingCalendars(organizationId: string) {
  return prisma.bookingCalendar.findMany({
    where: { organizationId, isActive: true },
    orderBy: { name: 'asc' },
    include: BOOKING_CALENDAR_INCLUDE,
  })
}

/**
 * Create a new booking calendar
 * WHY: Creates the calendar - availability comes from assigned team members
 * NOTE: Requires at least one assignee to be set after creation for slots to appear
 *
 * @param input - Booking calendar data
 * @param userId - Optional: User ID for activity logging
 */
export async function createBookingCalendar(input: BookingCalendarCreateInput, userId?: string) {
  const calendar = await prisma.bookingCalendar.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      duration: input.duration ?? 30,
      bufferBefore: input.bufferBefore ?? 0,
      bufferAfter: input.bufferAfter ?? 0,
      color: input.color ?? 'blue',
      locationType: input.locationType ?? 'virtual',
      locationDetails: input.locationDetails,
      isActive: input.isActive ?? true,
      defaultAssigneeId: input.defaultAssigneeId,
      // Booking limit: null = unlimited (default), positive int = max days ahead
      maxBookingDays: input.maxBookingDays ?? null,
    },
    include: BOOKING_CALENDAR_INCLUDE,
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'calendar_event_type',
      entityId: calendar.id,
    })
  }

  return calendar
}

/**
 * Update a booking calendar
 *
 * @param calendarId - Calendar ID to update
 * @param input - Update data
 * @param organizationId - Optional: Organization ID for activity logging
 * @param userId - Optional: User ID for activity logging
 */
export async function updateBookingCalendar(
  calendarId: string,
  input: BookingCalendarUpdateInput,
  organizationId?: string,
  userId?: string
) {
  const calendar = await prisma.bookingCalendar.update({
    where: { id: calendarId },
    data: input,
    include: BOOKING_CALENDAR_INCLUDE,
  })

  // Log activity for audit trail
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'calendar_event_type',
      entityId: calendar.id,
    })
  }

  return calendar
}

/**
 * Delete a booking calendar
 * WHY: Hard delete - removes calendar and all related availability
 *
 * @param calendarId - Calendar ID to delete
 * @param organizationId - Optional: Organization ID for activity logging
 * @param userId - Optional: User ID for activity logging
 */
export async function deleteBookingCalendar(
  calendarId: string,
  organizationId?: string,
  userId?: string
) {
  const calendar = await prisma.bookingCalendar.delete({
    where: { id: calendarId },
  })

  // Log activity for audit trail
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'calendar_event_type',
      entityId: calendar.id,
    })
  }

  return calendar
}

// ============================================================================
// AVAILABILITY MANAGEMENT
// ============================================================================

/**
 * Update availability for a specific day
 */
export async function updateAvailability(
  bookingCalendarId: string,
  dayOfWeek: number,
  data: { startTime?: string; endTime?: string; isEnabled?: boolean }
) {
  return prisma.bookingAvailability.upsert({
    where: {
      bookingCalendarId_dayOfWeek: { bookingCalendarId, dayOfWeek },
    },
    update: data,
    create: {
      bookingCalendarId,
      dayOfWeek,
      startTime: data.startTime ?? '09:00',
      endTime: data.endTime ?? '17:00',
      isEnabled: data.isEnabled ?? true,
    },
  })
}

/**
 * Bulk update all availability for a calendar
 * WHY: Update entire week schedule at once
 */
export async function updateAllAvailability(
  bookingCalendarId: string,
  availability: AvailabilityInput[]
) {
  return prisma.$transaction(
    availability.map((day) =>
      prisma.bookingAvailability.upsert({
        where: {
          bookingCalendarId_dayOfWeek: {
            bookingCalendarId,
            dayOfWeek: day.dayOfWeek,
          },
        },
        update: {
          startTime: day.startTime,
          endTime: day.endTime,
          isEnabled: day.isEnabled,
        },
        create: {
          bookingCalendarId,
          dayOfWeek: day.dayOfWeek,
          startTime: day.startTime,
          endTime: day.endTime,
          isEnabled: day.isEnabled,
        },
      })
    )
  )
}

// ============================================================================
// BOOKING CRUD
// ============================================================================

/**
 * Get a booking by ID
 */
export async function getBooking(bookingId: string) {
  return prisma.calendarBooking.findUnique({
    where: { id: bookingId },
    include: BOOKING_INCLUDE,
  })
}

/**
 * Check if a booking is still confirmed for automation triggering.
 *
 * WHY: The appointment-started scheduler needs to verify the booking is still
 * CONFIRMED at execution time. The booking may have been cancelled between
 * scheduling and execution. This is defense-in-depth alongside runs.cancel().
 *
 * SOURCE OF TRUTH: VerifyBookingConfirmed, AppointmentStartedCheck
 *
 * @param bookingId - The booking ID to verify
 * @param organizationId - Organization scope for security
 * @returns Booking ID if confirmed, null if not found or not confirmed
 */
export async function isBookingConfirmed(
  bookingId: string,
  organizationId: string
): Promise<{ id: string } | null> {
  return await prisma.calendarBooking.findFirst({
    where: {
      id: bookingId,
      organizationId,
      status: 'CONFIRMED',
    },
    select: { id: true },
  })
}

/**
 * Get all bookings for a booking calendar
 */
export async function getBookingsForCalendar(
  bookingCalendarId: string,
  options?: {
    status?: BookingStatus
    startDate?: Date
    endDate?: Date
    limit?: number
  }
) {
  return prisma.calendarBooking.findMany({
    where: {
      bookingCalendarId,
      ...(options?.status && { status: options.status }),
      ...(options?.startDate && { startTime: { gte: options.startDate } }),
      ...(options?.endDate && { endTime: { lte: options.endDate } }),
    },
    orderBy: { startTime: 'asc' },
    take: options?.limit,
    include: BOOKING_INCLUDE,
  })
}

/**
 * Get all bookings for an organization
 */
export async function getBookingsForOrganization(
  organizationId: string,
  options?: {
    status?: BookingStatus
    startDate?: Date
    endDate?: Date
    limit?: number
  }
) {
  return prisma.calendarBooking.findMany({
    where: {
      organizationId,
      ...(options?.status && { status: options.status }),
      ...(options?.startDate && { startTime: { gte: options.startDate } }),
      ...(options?.endDate && { endTime: { lte: options.endDate } }),
    },
    orderBy: { startTime: 'asc' },
    take: options?.limit,
    include: BOOKING_INCLUDE,
  })
}

/**
 * Create a new booking and corresponding calendar event
 * WHY: When someone books a time slot, create both the booking and the internal calendar event
 *
 * NOTE: Bookings created by external users (public booking page) do not have a userId,
 * so activity logging is optional here. Only logs if userId is provided.
 *
 * @param input - Booking data
 * @param userId - Optional: User ID for activity logging (only if booked by internal user)
 */
export async function createBooking(input: BookingCreateInput, userId?: string) {
  const booking = await prisma.$transaction(async (tx) => {
    // Get the booking calendar to get organization and settings
    const calendar = await tx.bookingCalendar.findUnique({
      where: { id: input.bookingCalendarId },
      select: {
        id: true,
        name: true,
        color: true,
        locationType: true,
        locationDetails: true,
        defaultAssigneeId: true,
        organizationId: true,
      },
    })

    if (!calendar) {
      throw new Error('Booking calendar not found')
    }

    // Create the internal calendar event first
    // WHY: Links the event to the assigned team member and optionally to a lead (if booking was made by a known lead)
    const calendarEvent = await tx.calendarEvent.create({
      data: {
        organizationId: calendar.organizationId,
        title: `${calendar.name} - ${input.bookerName}`,
        description: input.notes
          ? `Booking from: ${input.bookerName}\nEmail: ${input.bookerEmail}\n${input.bookerPhone ? `Phone: ${input.bookerPhone}\n` : ''}\nNotes: ${input.notes}`
          : `Booking from: ${input.bookerName}\nEmail: ${input.bookerEmail}${input.bookerPhone ? `\nPhone: ${input.bookerPhone}` : ''}`,
        startDate: input.startTime,
        endDate: input.endTime,
        color: calendar.color,
        location:
          calendar.locationType === 'in_person'
            ? calendar.locationDetails
            : null,
        status: 'APPROVED', // Bookings are auto-approved
        assignedToId: calendar.defaultAssigneeId,
        // Link lead as attendee if provided (from sticky session)
        leadId: input.leadId ?? null,
      },
    })

    // Create the booking record
    const createdBooking = await tx.calendarBooking.create({
      data: {
        bookingCalendarId: input.bookingCalendarId,
        organizationId: calendar.organizationId,
        startTime: input.startTime,
        endTime: input.endTime,
        bookerName: input.bookerName,
        bookerEmail: input.bookerEmail,
        bookerPhone: input.bookerPhone,
        notes: input.notes,
        status: 'CONFIRMED',
        calendarEventId: calendarEvent.id,
      },
      include: BOOKING_INCLUDE,
    })

    // Trigger automations for APPOINTMENT_SCHEDULED event
    // This fires any active automations listening for new appointment bookings.
    // leadId is optional — bookings without a lead still trigger, and lead-dependent
    // steps will gracefully skip with a reason (SkipActionError system).
    try {
      const { triggerAutomation } = await import('@/services/automation.service')
      await triggerAutomation('APPOINTMENT_SCHEDULED', {
        organizationId: calendar.organizationId,
        leadId: input.leadId ?? undefined,
        triggerData: {
          type: 'APPOINTMENT_SCHEDULED',
          appointmentId: createdBooking.id,
          calendarId: input.bookingCalendarId,
          appointmentTitle: calendarEvent.title,
          startDate: input.startTime,
          endDate: input.endTime,
        },
      })
    } catch (automationError) {
      // Log but don't fail the booking creation if automation trigger fails
      console.error('Failed to trigger automation for appointment scheduled:', automationError)
    }

    return createdBooking
  })

  // Schedule a delayed APPOINTMENT_STARTED task to fire at the booking's start time
  // WHY: Instead of a cron polling every minute, we schedule a one-off delayed task
  // per booking. Same pattern as scheduledFolderDeletionTask in storage.
  try {
    const handle = await appointmentStartedTask.trigger(
      {
        bookingId: booking.id,
        bookingCalendarId: input.bookingCalendarId,
        organizationId: input.organizationId,
        bookerEmail: input.bookerEmail,
      },
      { delay: input.startTime }
    )

    // Save run ID so we can cancel if the booking is cancelled
    await prisma.calendarBooking.update({
      where: { id: booking.id },
      data: { scheduledStartRunId: handle.id },
    })
  } catch (scheduleError) {
    // Log but don't fail booking creation if scheduling fails
    console.error('Failed to schedule appointment-started task:', scheduleError)
  }

  // Log activity for audit trail (only if internal user created the booking)
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'calendar_booking',
      entityId: booking.id,
    })
  }

  return booking
}

/**
 * Update booking status
 *
 * @param bookingId - Booking ID to update
 * @param status - New booking status
 * @param organizationId - Optional: Organization ID for activity logging
 * @param userId - Optional: User ID for activity logging
 */
export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  organizationId?: string,
  userId?: string
) {
  const booking = await prisma.calendarBooking.update({
    where: { id: bookingId },
    data: { status },
    include: BOOKING_INCLUDE,
  })

  // If booking is being cancelled, cancel the scheduled APPOINTMENT_STARTED task
  // WHY: Prevents the automation from firing for a cancelled booking
  if (status === 'CANCELLED' && booking.scheduledStartRunId) {
    try {
      await runs.cancel(booking.scheduledStartRunId)
    } catch {
      // Log but don't fail — task will check CONFIRMED status anyway
    }
  }

  // Log activity for audit trail
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'calendar_booking',
      entityId: booking.id,
    })
  }

  return booking
}

/**
 * Cancel a booking
 * WHY: Cancels both the booking and the associated calendar event
 *
 * @param bookingId - Booking ID to cancel
 * @param organizationId - Optional: Organization ID for activity logging
 * @param userId - Optional: User ID for activity logging
 */
export async function cancelBooking(
  bookingId: string,
  organizationId?: string,
  userId?: string
) {
  const booking = await prisma.$transaction(async (tx) => {
    // Update booking status
    const cancelledBooking = await tx.calendarBooking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
      include: { calendarEvent: true },
    })

    // Cancel the associated calendar event if it exists
    if (cancelledBooking.calendarEventId) {
      await tx.calendarEvent.update({
        where: { id: cancelledBooking.calendarEventId },
        data: { status: 'CANCELLED' },
      })
    }

    return cancelledBooking
  })

  // Cancel the scheduled APPOINTMENT_STARTED task if it exists
  // WHY: No point firing the automation for a cancelled booking.
  // Defense-in-depth: the task also checks CONFIRMED status before firing.
  if (booking.scheduledStartRunId) {
    try {
      await runs.cancel(booking.scheduledStartRunId)
    } catch {
      // Log but don't fail — task will check CONFIRMED status anyway
    }
  }

  // Log activity for audit trail
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'calendar_booking',
      entityId: booking.id,
    })
  }

  return booking
}

// ============================================================================
// AVAILABLE SLOTS CALCULATION
// ============================================================================

/**
 * Get the timezone offset in minutes for a given timezone at a specific date
 * WHY: We need to know how far ahead/behind a timezone is from UTC to convert times
 *
 * @param date - Reference date to check offset at (DST can change offset)
 * @param timezone - IANA timezone identifier (e.g., "America/New_York")
 * @returns Offset in minutes (positive = ahead of UTC, negative = behind)
 */
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  // Get UTC components directly from the date
  const utcYear = date.getUTCFullYear()
  const utcMonth = date.getUTCMonth()
  const utcDay = date.getUTCDate()
  const utcHour = date.getUTCHours()
  const utcMinute = date.getUTCMinutes()

  // Get timezone components using formatToParts (avoids string parsing issues)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)

  const tzYear = parseInt(parts.find(p => p.type === 'year')?.value ?? '0')
  const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value ?? '1') - 1
  const tzDay = parseInt(parts.find(p => p.type === 'day')?.value ?? '1')
  let tzHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
  const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')

  // Handle midnight representation (some locales use 24 instead of 00)
  if (tzHour === 24) tzHour = 0

  // Convert both to comparable milliseconds using UTC to avoid local timezone interference
  const utcTotal = Date.UTC(utcYear, utcMonth, utcDay, utcHour, utcMinute)
  const tzTotal = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute)

  // Difference in minutes: positive = timezone is ahead of UTC
  return (tzTotal - utcTotal) / (60 * 1000)
}

/**
 * Create a Date object representing a specific local time in a specific timezone
 * WHY: Member availability times like "09:00" mean 09:00 in THEIR timezone, not the server's
 *      We need to properly convert this to a UTC Date object for calculations
 *
 * Example:
 *   createDateInTimezone(2026, 0, 18, 9, 0, "America/New_York")
 *   => Date representing 09:00 EST = 14:00 UTC (since EST is UTC-5)
 *
 * @param year - Full year (e.g., 2026)
 * @param month - Month (0-indexed, 0 = January)
 * @param day - Day of month
 * @param hour - Hour (0-23)
 * @param minute - Minute (0-59)
 * @param timezone - IANA timezone identifier
 * @returns Date object representing that moment in UTC
 */
function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  // Start with a rough UTC estimate using the same numeric values
  const roughUtc = new Date(Date.UTC(year, month, day, hour, minute, 0, 0))

  // Get the offset for this timezone at this rough time
  // If timezone is UTC-5, offset will be -300 (300 minutes behind UTC)
  const offset = getTimezoneOffsetMinutes(roughUtc, timezone)

  // To convert local time to UTC: subtract the offset
  // Example: 09:00 in UTC-5 timezone
  //   roughUtc = 09:00 UTC
  //   offset = -300 (timezone is 5 hours behind UTC)
  //   result = 09:00 UTC - (-300 min) = 09:00 UTC + 5 hours = 14:00 UTC ✓
  const firstGuess = new Date(roughUtc.getTime() - offset * 60 * 1000)

  // Verify the offset at our calculated time (handles DST edge cases)
  const offset2 = getTimezoneOffsetMinutes(firstGuess, timezone)
  if (offset !== offset2) {
    // DST transition occurred between our guess and target, recalculate
    return new Date(roughUtc.getTime() - offset2 * 60 * 1000)
  }

  return firstGuess
}

/**
 * Parse HH:mm time string and create a UTC Date object for a specific date and timezone
 * WHY: Availability times are stored as strings in the member's timezone
 *      We need to interpret them correctly and convert to UTC for slot generation
 *
 * @param date - The date to use (year, month, day)
 * @param timeString - Time in HH:mm format
 * @param timezone - The timezone the time string is in
 * @returns Date object in UTC representing that moment
 */
function parseTimeInTimezone(date: Date, timeString: string, timezone: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number)
  return createDateInTimezone(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    timezone
  )
}

/**
 * Smart Slot Generation Result
 * WHY: Return available slots with info about which members can handle them
 *
 * SOURCE OF TRUTH: SlotMember type in booking-calendar.tsx mirrors this
 */
type SmartSlot = {
  startTime: string
  endTime: string
  availableMembers?: {
    memberId: string
    memberName: string
    memberImage: string | null
    timezone: string
  }[]
}

/**
 * Get available time slots using smart member availability
 * WHY: Calculate slots based on assigned team members' individual availability and calendar events
 *
 * ALGORITHM:
 * 1. If calendar has assigned team members, use their availability
 * 2. For each potential slot, check if ANY member is available (OR logic)
 * 3. A member is available if:
 *    - Their personal availability covers the slot time
 *    - They don't have conflicting calendar events
 *    - The slot is in the future
 * 4. If no assignees, fall back to calendar's BookingAvailability
 *
 * TIMEZONE HANDLING:
 * - Member availability is stored in their timezone (User.timezone)
 * - Slots are generated in UTC and returned as ISO strings
 * - Booker's timezone conversion happens on the client
 *
 * @param bookingCalendarId - The booking calendar ID
 * @param date - The date to check availability for (in UTC)
 * @param bookerTimezone - Optional: The booker's timezone for display purposes
 * @returns Array of available time slots as ISO strings
 */
export async function getAvailableSlotsWithMemberAvailability(
  bookingCalendarId: string,
  date: Date,
  bookerTimezone: string = 'UTC'
): Promise<SmartSlot[]> {
  // Get the booking calendar with assignees and their availability
  const calendar = await getBookingCalendarWithAssignees(bookingCalendarId)

  if (!calendar || !calendar.isActive) {
    return []
  }

  /**
   * Enforce max booking days limit for slot generation
   * WHY: If the requested date is beyond the configured advance booking window,
   * return no slots. This is a server-side guard matching the getAvailableDates filter.
   * Belt-and-suspenders with the frontend check - never trust the client alone.
   *
   * SOURCE OF TRUTH KEYWORDS: MaxBookingDays, BookingLimit, SlotGeneration
   */
  if (calendar.maxBookingDays !== null && calendar.maxBookingDays !== undefined) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxBookableDate = new Date(today)
    maxBookableDate.setDate(maxBookableDate.getDate() + calendar.maxBookingDays)

    const requestedDate = new Date(date)
    requestedDate.setHours(0, 0, 0, 0)

    if (requestedDate > maxBookableDate) {
      return [] // Date is beyond the max booking window
    }
  }

  const dayOfWeek = date.getDay()
  const slots: SmartSlot[] = []
  const slotDuration = calendar.duration
  const bufferBefore = calendar.bufferBefore
  const bufferAfter = calendar.bufferAfter
  const totalSlotTime = slotDuration + bufferBefore + bufferAfter
  const now = new Date()

  // If calendar has assignees, use their availability
  if (calendar.assignees && calendar.assignees.length > 0) {
    // For each assignee, determine their available time ranges for this day
    type MemberAvailabilityWindow = {
      memberId: string
      memberName: string
      memberImage: string | null
      timezone: string
      dayStart: Date
      dayEnd: Date
      events: { startDate: Date; endDate: Date }[]
    }

    const memberWindows: MemberAvailabilityWindow[] = []

    for (const assignee of calendar.assignees) {
      const member = assignee.member
      const user = member.user
      const memberTimezone = user.timezone ?? 'UTC'

      // Find member's availability for this day of week
      const memberDayAvailability = member.availability?.find(
        (a) => a.dayOfWeek === dayOfWeek && a.isEnabled
      )

      if (!memberDayAvailability) {
        continue // This member is not available on this day
      }

      // Parse member's availability times directly in their timezone and get UTC equivalent
      // WHY: "09:00" in New York (UTC-5) = 14:00 UTC, not 09:00 UTC
      // The old code was incorrectly interpreting times in the server's timezone
      const dayStartUtc = parseTimeInTimezone(date, memberDayAvailability.startTime, memberTimezone)
      const dayEndUtc = parseTimeInTimezone(date, memberDayAvailability.endTime, memberTimezone)

      // Get member's calendar events for this date range
      const memberEvents = await prisma.calendarEvent.findMany({
        where: {
          organizationId: calendar.organizationId,
          assignedToId: member.id,
          status: { not: 'CANCELLED' },
          startDate: { lt: dayEndUtc },
          endDate: { gt: dayStartUtc },
        },
        select: {
          startDate: true,
          endDate: true,
        },
      })

      memberWindows.push({
        memberId: member.id,
        memberName: user.name,
        memberImage: user.image,
        timezone: memberTimezone,
        dayStart: dayStartUtc,
        dayEnd: dayEndUtc,
        events: memberEvents,
      })
    }

    if (memberWindows.length === 0) {
      return [] // No members available on this day
    }

    // Find the earliest start and latest end across all member windows
    const earliestStart = new Date(
      Math.min(...memberWindows.map((w) => w.dayStart.getTime()))
    )
    const latestEnd = new Date(
      Math.max(...memberWindows.map((w) => w.dayEnd.getTime()))
    )

    // Get existing bookings for this calendar on this date
    const existingBookings = await prisma.calendarBooking.findMany({
      where: {
        bookingCalendarId,
        status: { not: 'CANCELLED' },
        startTime: { gte: earliestStart, lt: latestEnd },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    })

    // Generate slots
    let currentSlot = new Date(earliestStart)

    while (currentSlot.getTime() + slotDuration * 60000 <= latestEnd.getTime()) {
      const slotStart = new Date(currentSlot.getTime() + bufferBefore * 60000)
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000)

      // Skip past slots
      if (slotStart <= now) {
        currentSlot = new Date(currentSlot.getTime() + totalSlotTime * 60000)
        continue
      }

      // Check if slot conflicts with existing bookings
      const hasBookingConflict = existingBookings.some((booking) => {
        const bookingStart = new Date(booking.startTime)
        const bookingEnd = new Date(booking.endTime)
        return slotStart < bookingEnd && slotEnd > bookingStart
      })

      if (hasBookingConflict) {
        currentSlot = new Date(currentSlot.getTime() + totalSlotTime * 60000)
        continue
      }

      // Find which members are available for this slot
      const availableMembers: { memberId: string; memberName: string; memberImage: string | null; timezone: string }[] = []

      for (const member of memberWindows) {
        // Check if slot falls within member's availability window
        if (slotStart < member.dayStart || slotEnd > member.dayEnd) {
          continue // Slot outside member's working hours
        }

        // Check if member has conflicting events
        const hasEventConflict = member.events.some((event) => {
          const eventStart = new Date(event.startDate)
          const eventEnd = new Date(event.endDate)
          return slotStart < eventEnd && slotEnd > eventStart
        })

        if (!hasEventConflict) {
          availableMembers.push({
            memberId: member.memberId,
            memberName: member.memberName,
            memberImage: member.memberImage,
            timezone: member.timezone,
          })
        }
      }

      // If at least one member is available, add the slot
      if (availableMembers.length > 0) {
        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          availableMembers,
        })
      }

      currentSlot = new Date(currentSlot.getTime() + totalSlotTime * 60000)
    }

    return slots
  }

  // No assignees means no availability - team members are required
  return []
}

/**
 * Get available time slots for a booking calendar on a specific date (LEGACY)
 * WHY: Calculate which slots are open based on availability and existing bookings
 *
 * NOTE: This is the legacy function that uses BookingAvailability on the calendar itself.
 * For smart availability based on team members, use getAvailableSlotsWithMemberAvailability.
 *
 * @param bookingCalendarId - The booking calendar ID
 * @param date - The date to check availability for
 * @returns Array of available time slots as ISO strings
 */
export async function getAvailableSlots(
  bookingCalendarId: string,
  date: Date
): Promise<{ startTime: string; endTime: string }[]> {
  // Get the booking calendar with availability
  const calendar = await prisma.bookingCalendar.findUnique({
    where: { id: bookingCalendarId },
    include: {
      availability: true,
    },
  })

  if (!calendar || !calendar.isActive) {
    return []
  }

  // Get the day of week for the requested date
  const dayOfWeek = date.getDay()

  // Find availability for this day
  const dayAvailability = calendar.availability.find(
    (a) => a.dayOfWeek === dayOfWeek && a.isEnabled
  )

  if (!dayAvailability) {
    return [] // No availability for this day
  }

  // Parse start and end times
  const [startHour, startMinute] = dayAvailability.startTime.split(':').map(Number)
  const [endHour, endMinute] = dayAvailability.endTime.split(':').map(Number)

  // Create date objects for the availability window
  const dayStart = new Date(date)
  dayStart.setHours(startHour, startMinute, 0, 0)

  const dayEnd = new Date(date)
  dayEnd.setHours(endHour, endMinute, 0, 0)

  // Get existing bookings for this calendar on this date
  const existingBookings = await prisma.calendarBooking.findMany({
    where: {
      bookingCalendarId,
      status: { not: 'CANCELLED' },
      startTime: { gte: dayStart, lt: dayEnd },
    },
    select: {
      startTime: true,
      endTime: true,
    },
  })

  // Also get calendar events that might block slots (assigned to default assignee)
  const existingEvents = calendar.defaultAssigneeId
    ? await prisma.calendarEvent.findMany({
        where: {
          organizationId: calendar.organizationId,
          assignedToId: calendar.defaultAssigneeId,
          status: { not: 'CANCELLED' },
          startDate: { lt: dayEnd },
          endDate: { gt: dayStart },
        },
        select: {
          startDate: true,
          endDate: true,
        },
      })
    : []

  // Generate all possible slots
  const slots: { startTime: string; endTime: string }[] = []
  const slotDuration = calendar.duration
  const bufferBefore = calendar.bufferBefore
  const bufferAfter = calendar.bufferAfter
  const totalSlotTime = slotDuration + bufferBefore + bufferAfter

  let currentSlot = new Date(dayStart)
  const now = new Date()

  while (currentSlot.getTime() + slotDuration * 60000 <= dayEnd.getTime()) {
    const slotStart = new Date(currentSlot.getTime() + bufferBefore * 60000)
    const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000)
    const slotEndWithBuffer = new Date(slotEnd.getTime() + bufferAfter * 60000)

    // Check if slot is in the past
    if (slotStart > now) {
      // Check if slot conflicts with existing bookings
      const hasConflict = existingBookings.some((booking) => {
        const bookingStart = new Date(booking.startTime)
        const bookingEnd = new Date(booking.endTime)
        return slotStart < bookingEnd && slotEnd > bookingStart
      })

      // Check if slot conflicts with existing calendar events
      const hasEventConflict = existingEvents.some((event) => {
        const eventStart = new Date(event.startDate)
        const eventEnd = new Date(event.endDate)
        return slotStart < eventEnd && slotEnd > eventStart
      })

      if (!hasConflict && !hasEventConflict) {
        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
        })
      }
    }

    // Move to next slot
    currentSlot = new Date(currentSlot.getTime() + totalSlotTime * 60000)
  }

  return slots
}

/**
 * Get available dates for a booking calendar in a month
 * WHY: Show which dates have availability based on assigned team members
 *
 * ALGORITHM:
 * 1. Collect enabled days from all assigned member availabilities
 * 2. A date is available if ANY member has that day enabled
 * 3. No assignees = no available dates (team members are required)
 */
export async function getAvailableDates(
  bookingCalendarId: string,
  year: number,
  month: number
): Promise<string[]> {
  // Get calendar with assignees and their availability
  const calendar = await getBookingCalendarWithAssignees(bookingCalendarId)

  if (!calendar || !calendar.isActive) {
    return []
  }

  // No assignees means no availability - team members are required
  if (!calendar.assignees || calendar.assignees.length === 0) {
    return []
  }

  // Collect all enabled days from all members
  const enabledDays = new Set<number>()

  for (const assignee of calendar.assignees) {
    if (assignee.member.availability) {
      for (const avail of assignee.member.availability) {
        if (avail.isEnabled) {
          enabledDays.add(avail.dayOfWeek)
        }
      }
    }
  }

  if (enabledDays.size === 0) {
    return [] // No members have any days enabled
  }

  // Generate dates for the month that fall on enabled days
  const dates: string[] = []
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  /**
   * Calculate the max bookable date based on the calendar's maxBookingDays setting
   * WHY: Limits how far ahead external bookers can see/book slots
   * null = no limit (all future dates on enabled days are available)
   * positive integer = only dates within N days from today are bookable
   *
   * SOURCE OF TRUTH KEYWORDS: MaxBookingDays, BookingLimit, AdvanceBooking
   */
  let maxBookableDate: Date | null = null
  if (calendar.maxBookingDays !== null && calendar.maxBookingDays !== undefined) {
    maxBookableDate = new Date(today)
    maxBookableDate.setDate(maxBookableDate.getDate() + calendar.maxBookingDays)
  }

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    // Only include future dates on enabled days
    if (d >= today && enabledDays.has(d.getDay())) {
      // Enforce max booking days limit if set
      // WHY: Prevents showing dates beyond the configured advance booking window
      if (maxBookableDate && d > maxBookableDate) {
        continue
      }

      // Format date as YYYY-MM-DD using local date components
      // WHY: toISOString() converts to UTC which can shift the date by a day
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dates.push(dateStr)
    }
  }

  return dates
}

// ============================================================================
// VERIFICATION HELPERS
// ============================================================================

/**
 * Verify a booking calendar belongs to an organization
 */
export async function verifyCalendarOwnership(
  calendarId: string,
  organizationId: string
): Promise<boolean> {
  const calendar = await prisma.bookingCalendar.findFirst({
    where: { id: calendarId, organizationId },
    select: { id: true },
  })
  return !!calendar
}

/**
 * Verify a booking belongs to an organization
 */
export async function verifyBookingOwnership(
  bookingId: string,
  organizationId: string
): Promise<boolean> {
  const booking = await prisma.calendarBooking.findFirst({
    where: { id: bookingId, organizationId },
    select: { id: true },
  })
  return !!booking
}

/**
 * Check if a slug is available for an organization
 */
export async function isSlugAvailable(
  organizationId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.bookingCalendar.findFirst({
    where: {
      organizationId,
      slug,
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { id: true },
  })
  return !existing
}

// ============================================================================
// ASSIGNEE MANAGEMENT
// SOURCE OF TRUTH: BookingCalendarAssignee model
// ============================================================================

/**
 * Input type for adding/updating assignees
 */
export type AssigneeInput = {
  memberId: string
  isActive?: boolean
  priority?: number
}

/**
 * Get all assignees for a booking calendar
 * WHY: Display which team members are assigned to handle this calendar
 */
export async function getCalendarAssignees(bookingCalendarId: string) {
  return prisma.bookingCalendarAssignee.findMany({
    where: { bookingCalendarId },
    orderBy: { priority: 'asc' },
    include: {
      member: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              timezone: true,
            },
          },
        },
      },
    },
  })
}

/**
 * Add an assignee to a booking calendar
 * WHY: Team members can be assigned to handle bookings for this calendar
 */
export async function addCalendarAssignee(
  bookingCalendarId: string,
  input: AssigneeInput
) {
  return prisma.bookingCalendarAssignee.create({
    data: {
      bookingCalendarId,
      memberId: input.memberId,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 0,
    },
    include: {
      member: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              timezone: true,
            },
          },
        },
      },
    },
  })
}

/**
 * Remove an assignee from a booking calendar
 * WHY: Team member is no longer responsible for this calendar
 */
export async function removeCalendarAssignee(
  bookingCalendarId: string,
  memberId: string
) {
  return prisma.bookingCalendarAssignee.delete({
    where: {
      bookingCalendarId_memberId: {
        bookingCalendarId,
        memberId,
      },
    },
  })
}

/**
 * Update an assignee's settings (active status, priority)
 * WHY: Adjust assignee configuration without removing them
 */
export async function updateCalendarAssignee(
  bookingCalendarId: string,
  memberId: string,
  input: { isActive?: boolean; priority?: number }
) {
  return prisma.bookingCalendarAssignee.update({
    where: {
      bookingCalendarId_memberId: {
        bookingCalendarId,
        memberId,
      },
    },
    data: input,
    include: {
      member: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              timezone: true,
            },
          },
        },
      },
    },
  })
}

/**
 * Set all assignees for a calendar at once (replace existing)
 * WHY: Bulk update assignees from the edit dialog
 */
export async function setCalendarAssignees(
  bookingCalendarId: string,
  memberIds: string[]
) {
  return prisma.$transaction(async (tx) => {
    // Remove all existing assignees
    await tx.bookingCalendarAssignee.deleteMany({
      where: { bookingCalendarId },
    })

    // Add new assignees if any provided
    if (memberIds.length > 0) {
      await tx.bookingCalendarAssignee.createMany({
        data: memberIds.map((memberId, index) => ({
          bookingCalendarId,
          memberId,
          isActive: true,
          priority: index,
        })),
      })
    }

    // Return updated calendar with assignees
    return tx.bookingCalendar.findUnique({
      where: { id: bookingCalendarId },
      include: {
        ...BOOKING_CALENDAR_INCLUDE,
        assignees: {
          orderBy: { priority: 'asc' },
          include: {
            member: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    timezone: true,
                  },
                },
              },
            },
          },
        },
      },
    })
  })
}

/**
 * Validate that a single member exists in the given organization.
 * WHY: Routers need to verify member ownership before assigning to calendars.
 * Returns the member's ID if found, null otherwise.
 *
 * SOURCE OF TRUTH: Member model in Prisma schema, MemberOrganizationValidation
 */
export async function findMemberInOrganization(
  memberId: string,
  organizationId: string
): Promise<{ id: string } | null> {
  return prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true },
  })
}

/**
 * Validate that multiple member IDs exist in the given organization.
 * WHY: Bulk assignee operations need to verify all members belong to the org.
 * Returns the subset of member IDs that are valid (exist in the org).
 *
 * SOURCE OF TRUTH: Member model in Prisma schema, BulkMemberOrganizationValidation
 */
export async function findMembersInOrganization(
  memberIds: string[],
  organizationId: string
): Promise<{ id: string }[]> {
  return prisma.member.findMany({
    where: {
      id: { in: memberIds },
      organizationId,
    },
    select: { id: true },
  })
}

/**
 * Look up an organization by its slug for public booking pages.
 * WHY: Public routes receive organization slug from URL, need to resolve to org ID.
 * Returns basic org info (id, name, logo) or null if not found.
 *
 * SOURCE OF TRUTH: Organization model in Prisma schema, OrganizationSlugLookup
 */
export async function getOrganizationBySlug(
  slug: string
): Promise<{ id: string; name: string; logo: string | null } | null> {
  return prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, logo: true },
  })
}

/**
 * Get a booking calendar with its assignees
 * WHY: Need full assignee details for slot generation
 */
export async function getBookingCalendarWithAssignees(calendarId: string) {
  return prisma.bookingCalendar.findUnique({
    where: { id: calendarId },
    include: {
      ...BOOKING_CALENDAR_INCLUDE,
      assignees: {
        where: { isActive: true },
        orderBy: { priority: 'asc' },
        include: {
          member: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                  timezone: true,
                },
              },
              availability: true,
            },
          },
        },
      },
    },
  })
}
