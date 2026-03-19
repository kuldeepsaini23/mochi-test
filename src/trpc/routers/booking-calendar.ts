/**
 * Booking Calendar Router
 *
 * tRPC router for booking calendar management.
 * Uses organizationProcedure for authorization (internal routes).
 * Uses baseProcedure for public booking page routes.
 * All data access goes through booking-calendar.service.ts (DAL).
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, BookingAvailability, CalendarBooking, Appointments
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  baseProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import * as bookingCalendarService from '@/services/booking-calendar.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Valid colors for booking calendars
 */
const bookingColorSchema = z.enum([
  'blue',
  'green',
  'purple',
  'orange',
  'red',
  'pink',
  'yellow',
  'gray',
])

/**
 * Valid location types
 * google_meet: Auto-generated Google Meet link
 * custom_link: User-provided meeting link
 */
const locationTypeSchema = z.enum(['google_meet', 'custom_link'])

/**
 * Valid booking status values
 * SOURCE OF TRUTH: BookingStatus enum in Prisma schema
 */
const bookingStatusSchema = z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'])

/**
 * Availability input for a single day
 */
const availabilityDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format'),
  isEnabled: z.boolean(),
})

/**
 * Schema for creating a booking calendar
 */
export const createBookingCalendarSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required').max(100),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500).optional().nullable(),
  duration: z.number().int().min(5).max(480).default(30), // 5 min to 8 hours
  bufferBefore: z.number().int().min(0).max(120).default(0),
  bufferAfter: z.number().int().min(0).max(120).default(0),
  color: bookingColorSchema.optional().default('blue'),
  locationType: locationTypeSchema.optional().default('google_meet'),
  locationDetails: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  defaultAssigneeId: z.string().optional().nullable(),
  /**
   * Max days ahead a booker can see/book slots
   * WHY: Limits advance booking window (e.g., 5 = only next 5 days)
   * null = unlimited (no restriction on how far ahead someone can book)
   * SOURCE OF TRUTH KEYWORDS: MaxBookingDays, BookingLimit, AdvanceBooking
   */
  maxBookingDays: z.number().int().min(1).max(365).optional().nullable(),
})

/**
 * Schema for updating a booking calendar
 */
export const updateBookingCalendarSchema = z.object({
  organizationId: z.string(),
  calendarId: z.string(),
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string().max(500).optional().nullable(),
  duration: z.number().int().min(5).max(480).optional(),
  bufferBefore: z.number().int().min(0).max(120).optional(),
  bufferAfter: z.number().int().min(0).max(120).optional(),
  color: bookingColorSchema.optional(),
  locationType: locationTypeSchema.optional(),
  locationDetails: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  defaultAssigneeId: z.string().optional().nullable(),
  /**
   * Max days ahead a booker can see/book slots
   * null = unlimited, positive int = max days ahead
   */
  maxBookingDays: z.number().int().min(1).max(365).optional().nullable(),
})

/**
 * Schema for updating availability
 */
export const updateAvailabilitySchema = z.object({
  organizationId: z.string(),
  calendarId: z.string(),
  availability: z.array(availabilityDaySchema).length(7), // Must include all 7 days
})

/**
 * Schema for getting a booking calendar
 */
export const getBookingCalendarSchema = z.object({
  organizationId: z.string(),
  calendarId: z.string(),
})

/**
 * Schema for deleting a booking calendar
 */
export const deleteBookingCalendarSchema = z.object({
  organizationId: z.string(),
  calendarId: z.string(),
})

/**
 * Schema for getting bookings
 */
export const getBookingsSchema = z.object({
  organizationId: z.string(),
  calendarId: z.string().optional(),
  status: bookingStatusSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().int().positive().max(100).default(50),
})

/**
 * Schema for updating booking status
 */
export const updateBookingStatusSchema = z.object({
  organizationId: z.string(),
  bookingId: z.string(),
  status: bookingStatusSchema,
})

/**
 * Schema for cancelling a booking
 */
export const cancelBookingSchema = z.object({
  organizationId: z.string(),
  bookingId: z.string(),
})

// ============================================================================
// PUBLIC SCHEMAS (for public booking page - no auth required)
// ============================================================================

/**
 * Schema for getting public booking calendar info
 */
export const getPublicCalendarSchema = z.object({
  organizationSlug: z.string(),
  calendarSlug: z.string(),
})

/**
 * Schema for getting available slots
 */
export const getAvailableSlotsSchema = z.object({
  calendarId: z.string(),
  date: z.coerce.date(),
})

/**
 * Schema for getting available dates in a month
 */
export const getAvailableDatesSchema = z.object({
  calendarId: z.string(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

/**
 * Schema for creating a public booking
 * SOURCE OF TRUTH: CalendarBooking, CalendarEvent (for leadId linking)
 */
export const createPublicBookingSchema = z.object({
  calendarId: z.string(),
  startTime: z.coerce.date(),
  bookerName: z.string().min(1, 'Name is required').max(100),
  bookerEmail: z.string().email('Invalid email address'),
  bookerPhone: z.string().max(20).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  /** Optional: Lead ID to link as attendee on the calendar event (from sticky session) */
  leadId: z.string().optional().nullable(),
  /** Booker's timezone for slot verification (IANA format, e.g., "America/New_York") */
  bookerTimezone: z.string().optional(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const bookingCalendarRouter = createTRPCRouter({
  // ============================================================================
  // INTERNAL ROUTES (require authentication)
  // ============================================================================

  /**
   * Get all booking calendars for an organization
   */
  list: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return await bookingCalendarService.getBookingCalendars(input.organizationId)
    }),

  /**
   * Get a single booking calendar by ID
   */
  getById: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(getBookingCalendarSchema)
    .query(async ({ input }) => {
      const { organizationId, calendarId } = input

      // Verify ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      const calendar = await bookingCalendarService.getBookingCalendar(calendarId)
      if (!calendar) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      return calendar
    }),

  /**
   * Create a new booking calendar.
   * Feature-gated: calendars.limit checked at procedure level before handler runs.
   */
  create: organizationProcedure({
    requirePermission: permissions.CALENDAR_CREATE,
    requireFeature: 'calendars.limit',
  })
    .input(createBookingCalendarSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, slug, defaultAssigneeId, ...data } = input

      // Check if slug is available
      const isAvailable = await bookingCalendarService.isSlugAvailable(organizationId, slug)
      if (!isAvailable) {
        throw createStructuredError('BAD_REQUEST', 'Slug already in use', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'This URL slug is already in use. Please choose a different one.',
        })
      }

      // Validate defaultAssigneeId if provided
      if (defaultAssigneeId) {
        const member = await bookingCalendarService.findMemberInOrganization(
          defaultAssigneeId,
          organizationId
        )
        if (!member) {
          throw createStructuredError('BAD_REQUEST', 'Invalid team member', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'The default assignee does not exist in this organization',
          })
        }
      }

      const result = await bookingCalendarService.createBookingCalendar({
        organizationId,
        slug,
        defaultAssigneeId,
        ...data,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, organizationId, 'calendars.limit')

      return result
    }),

  /**
   * Update a booking calendar
   */
  update: organizationProcedure({ requirePermission: permissions.CALENDAR_UPDATE })
    .input(updateBookingCalendarSchema)
    .mutation(async ({ input }) => {
      const { organizationId, calendarId, slug, defaultAssigneeId, ...updateData } = input

      // Verify ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      // Check if new slug is available (excluding current calendar)
      if (slug) {
        const isAvailable = await bookingCalendarService.isSlugAvailable(
          organizationId,
          slug,
          calendarId
        )
        if (!isAvailable) {
          throw createStructuredError('BAD_REQUEST', 'Slug already in use', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'This URL slug is already in use. Please choose a different one.',
          })
        }
      }

      // Validate defaultAssigneeId if provided
      if (defaultAssigneeId) {
        const member = await bookingCalendarService.findMemberInOrganization(
          defaultAssigneeId,
          organizationId
        )
        if (!member) {
          throw createStructuredError('BAD_REQUEST', 'Invalid team member', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'The default assignee does not exist in this organization',
          })
        }
      }

      return await bookingCalendarService.updateBookingCalendar(calendarId, {
        slug,
        defaultAssigneeId,
        ...updateData,
      })
    }),

  /**
   * Update availability for a booking calendar
   */
  updateAvailability: organizationProcedure({ requirePermission: permissions.CALENDAR_UPDATE })
    .input(updateAvailabilitySchema)
    .mutation(async ({ input }) => {
      const { organizationId, calendarId, availability } = input

      // Verify ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      // Validate time ranges
      for (const day of availability) {
        if (day.isEnabled && day.startTime >= day.endTime) {
          throw createStructuredError('BAD_REQUEST', 'Invalid time range', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: `End time must be after start time for day ${day.dayOfWeek}`,
          })
        }
      }

      await bookingCalendarService.updateAllAvailability(calendarId, availability)

      return await bookingCalendarService.getBookingCalendar(calendarId)
    }),

  /**
   * Delete a booking calendar
   */
  delete: organizationProcedure({ requirePermission: permissions.CALENDAR_DELETE })
    .input(deleteBookingCalendarSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, calendarId } = input

      // Verify ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      await bookingCalendarService.deleteBookingCalendar(calendarId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, organizationId, 'calendars.limit')

      return { success: true, message: 'Booking calendar deleted' }
    }),

  // ============================================================================
  // ASSIGNEE MANAGEMENT
  // SOURCE OF TRUTH: BookingCalendarAssignee model
  // ============================================================================

  /**
   * Get assignees for a booking calendar
   * WHY: Display which team members are assigned to handle this calendar
   */
  getAssignees: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(z.object({
      organizationId: z.string(),
      calendarId: z.string(),
    }))
    .query(async ({ input }) => {
      const { organizationId, calendarId } = input

      // Verify ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      return await bookingCalendarService.getCalendarAssignees(calendarId)
    }),

  /**
   * Set assignees for a booking calendar
   * WHY: Bulk update which team members are assigned to this calendar
   * NOTE: At least one assignee is REQUIRED - availability comes from team members
   */
  setAssignees: organizationProcedure({ requirePermission: permissions.CALENDAR_UPDATE })
    .input(z.object({
      organizationId: z.string(),
      calendarId: z.string(),
      memberIds: z.array(z.string()).min(1, 'At least one team member is required'),
    }))
    .mutation(async ({ input }) => {
      const { organizationId, calendarId, memberIds } = input

      // Verify calendar ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      // Verify all members belong to this organization
      const validMembers = await bookingCalendarService.findMembersInOrganization(
        memberIds,
        organizationId
      )

      const validMemberIds = new Set(validMembers.map((m) => m.id))
      const invalidIds = memberIds.filter((id) => !validMemberIds.has(id))

      if (invalidIds.length > 0) {
        throw createStructuredError('BAD_REQUEST', 'Invalid team members', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Some team members do not exist in this organization',
        })
      }

      return await bookingCalendarService.setCalendarAssignees(calendarId, memberIds)
    }),

  /**
   * Add a single assignee to a booking calendar
   * WHY: Add a new team member without affecting existing assignees
   */
  addAssignee: organizationProcedure({ requirePermission: permissions.CALENDAR_UPDATE })
    .input(z.object({
      organizationId: z.string(),
      calendarId: z.string(),
      memberId: z.string(),
      priority: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const { organizationId, calendarId, memberId, priority } = input

      // Verify calendar ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      // Verify member belongs to organization
      const member = await bookingCalendarService.findMemberInOrganization(
        memberId,
        organizationId
      )

      if (!member) {
        throw createStructuredError('BAD_REQUEST', 'Invalid team member', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Team member does not exist in this organization',
        })
      }

      return await bookingCalendarService.addCalendarAssignee(calendarId, {
        memberId,
        priority,
      })
    }),

  /**
   * Remove an assignee from a booking calendar
   * WHY: Remove a team member from handling this calendar
   * NOTE: Cannot remove the last assignee - at least one is required
   */
  removeAssignee: organizationProcedure({ requirePermission: permissions.CALENDAR_UPDATE })
    .input(z.object({
      organizationId: z.string(),
      calendarId: z.string(),
      memberId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { organizationId, calendarId, memberId } = input

      // Verify calendar ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      // Check if this is the last assignee - cannot remove
      const currentAssignees = await bookingCalendarService.getCalendarAssignees(calendarId)
      if (currentAssignees.length <= 1) {
        throw createStructuredError('BAD_REQUEST', 'Cannot remove last assignee', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'At least one team member must be assigned to the calendar',
        })
      }

      await bookingCalendarService.removeCalendarAssignee(calendarId, memberId)
      return { success: true }
    }),

  /**
   * Get booking calendar with full assignee details
   * WHY: Need complete assignee info including their availability for slot generation
   */
  getWithAssignees: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(z.object({
      organizationId: z.string(),
      calendarId: z.string(),
    }))
    .query(async ({ input }) => {
      const { organizationId, calendarId } = input

      // Verify ownership
      const isOwner = await bookingCalendarService.verifyCalendarOwnership(
        calendarId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      const calendar = await bookingCalendarService.getBookingCalendarWithAssignees(calendarId)
      if (!calendar) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found',
        })
      }

      return calendar
    }),

  /**
   * Get all bookings for an organization
   */
  getBookings: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(getBookingsSchema)
    .query(async ({ input }) => {
      const { organizationId, calendarId, status, startDate, endDate, limit } = input

      if (calendarId) {
        // Verify calendar ownership
        const isOwner = await bookingCalendarService.verifyCalendarOwnership(
          calendarId,
          organizationId
        )
        if (!isOwner) {
          throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Booking calendar not found',
          })
        }

        return await bookingCalendarService.getBookingsForCalendar(calendarId, {
          status,
          startDate,
          endDate,
          limit,
        })
      }

      return await bookingCalendarService.getBookingsForOrganization(organizationId, {
        status,
        startDate,
        endDate,
        limit,
      })
    }),

  /**
   * Update booking status
   */
  updateBookingStatus: organizationProcedure({ requirePermission: permissions.CALENDAR_UPDATE })
    .input(updateBookingStatusSchema)
    .mutation(async ({ input }) => {
      const { organizationId, bookingId, status } = input

      // Verify booking ownership
      const isOwner = await bookingCalendarService.verifyBookingOwnership(
        bookingId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking not found',
        })
      }

      return await bookingCalendarService.updateBookingStatus(bookingId, status)
    }),

  /**
   * Cancel a booking
   */
  cancelBooking: organizationProcedure({ requirePermission: permissions.CALENDAR_UPDATE })
    .input(cancelBookingSchema)
    .mutation(async ({ input }) => {
      const { organizationId, bookingId } = input

      // Verify booking ownership
      const isOwner = await bookingCalendarService.verifyBookingOwnership(
        bookingId,
        organizationId
      )
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Booking not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking not found',
        })
      }

      return await bookingCalendarService.cancelBooking(bookingId)
    }),

  // ============================================================================
  // PUBLIC ROUTES (no authentication required - for public booking pages)
  // ============================================================================

  /**
   * Get public booking calendar info by organization and calendar slug
   * WHY: Public booking page needs calendar details without auth
   */
  getPublicCalendar: baseProcedure
    .input(getPublicCalendarSchema)
    .query(async ({ input }) => {
      const { organizationSlug, calendarSlug } = input

      // Get organization by slug
      const organization = await bookingCalendarService.getOrganizationBySlug(organizationSlug)

      if (!organization) {
        throw createStructuredError('NOT_FOUND', 'Organization not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Organization not found',
        })
      }

      // Get the booking calendar
      const calendar = await bookingCalendarService.getBookingCalendarBySlug(
        organization.id,
        calendarSlug
      )

      if (!calendar || !calendar.isActive) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found or not available',
        })
      }

      return {
        organization: {
          id: organization.id, // Include ID for lead session
          name: organization.name,
          logo: organization.logo,
        },
        calendar: {
          id: calendar.id,
          name: calendar.name,
          description: calendar.description,
          duration: calendar.duration,
          color: calendar.color,
          locationType: calendar.locationType,
          locationDetails: calendar.locationDetails,
          availability: calendar.availability,
          /**
           * Max days ahead for advance booking
           * WHY: Frontend uses this to visually disable dates beyond the limit
           * null = no limit on how far ahead someone can book
           */
          maxBookingDays: calendar.maxBookingDays,
        },
      }
    }),

  /**
   * Get active booking calendars for public organization page
   */
  getPublicCalendars: baseProcedure
    .input(z.object({ organizationSlug: z.string() }))
    .query(async ({ input }) => {
      const { organizationSlug } = input

      // Get organization by slug
      const organization = await bookingCalendarService.getOrganizationBySlug(organizationSlug)

      if (!organization) {
        throw createStructuredError('NOT_FOUND', 'Organization not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Organization not found',
        })
      }

      const calendars = await bookingCalendarService.getActiveBookingCalendars(organization.id)

      return {
        organization: {
          name: organization.name,
          logo: organization.logo,
        },
        calendars: calendars.map((cal) => ({
          id: cal.id,
          name: cal.name,
          slug: cal.slug,
          description: cal.description,
          duration: cal.duration,
          color: cal.color,
          locationType: cal.locationType,
        })),
      }
    }),

  /**
   * Get available time slots for a specific date
   * WHY: Uses smart slot generation based on assigned team members' availability
   *
   * SMART AVAILABILITY:
   * - Uses assigned team members' personal availability settings
   * - Checks each member's calendar events for conflicts
   * - Returns slots where at least one member is free
   * - No assignees = no available slots (team members are required)
   */
  getAvailableSlots: baseProcedure
    .input(getAvailableSlotsSchema.extend({
      bookerTimezone: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { calendarId, date, bookerTimezone } = input

      // Verify calendar exists and is active
      const calendar = await bookingCalendarService.getBookingCalendar(calendarId)
      if (!calendar || !calendar.isActive) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found or not available',
        })
      }

      // Use smart slot generation that considers member availability
      const smartSlots = await bookingCalendarService.getAvailableSlotsWithMemberAvailability(
        calendarId,
        date,
        bookerTimezone ?? 'UTC'
      )

      // Extract unique team member timezones from all slots
      // WHY: Frontend uses this to show timezone conversion note only when booker's TZ differs
      const teamTimezones = [
        ...new Set(
          smartSlots.flatMap((slot) =>
            slot.availableMembers?.map((m) => m.timezone) ?? []
          )
        ),
      ]

      // Return slots with team timezone info for conditional UI display
      return {
        slots: smartSlots.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          // Include member info for potential future UI features
          ...(slot.availableMembers && { availableMembers: slot.availableMembers }),
        })),
        // Unique timezones of available team members
        teamTimezones,
      }
    }),

  /**
   * Get available dates for a month
   */
  getAvailableDates: baseProcedure
    .input(getAvailableDatesSchema)
    .query(async ({ input }) => {
      const { calendarId, year, month } = input

      // Verify calendar exists and is active
      const calendar = await bookingCalendarService.getBookingCalendar(calendarId)
      if (!calendar || !calendar.isActive) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found or not available',
        })
      }

      return await bookingCalendarService.getAvailableDates(calendarId, year, month)
    }),

  /**
   * Create a public booking
   * WHY: External users can book time slots without authentication
   * NOTE: If leadId is provided (from sticky session), the lead will be linked as attendee on the calendar event
   *
   * SLOT VERIFICATION:
   * Uses getAvailableSlotsWithMemberAvailability() (same as getAvailableSlots route)
   * to ensure consistent slot availability logic between display and booking
   */
  createPublicBooking: baseProcedure
    .input(createPublicBookingSchema)
    .mutation(async ({ input }) => {
      const { calendarId, startTime, bookerName, bookerEmail, bookerPhone, notes, leadId, bookerTimezone } = input

      // Get calendar to verify it exists and get duration
      const calendar = await bookingCalendarService.getBookingCalendar(calendarId)
      if (!calendar || !calendar.isActive) {
        throw createStructuredError('NOT_FOUND', 'Booking calendar not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Booking calendar not found or not available',
        })
      }

      // Calculate end time based on duration
      const endTime = new Date(startTime.getTime() + calendar.duration * 60000)

      /**
       * Verify the slot is still available using SMART slot generation
       * WHY: Must use the same function as getAvailableSlots route for consistency
       * The legacy getAvailableSlots() uses BookingAvailability on the calendar,
       * but slots are displayed using team member availability
       */
      const availableSlots = await bookingCalendarService.getAvailableSlotsWithMemberAvailability(
        calendarId,
        startTime,
        bookerTimezone ?? 'UTC'
      )
      const isSlotAvailable = availableSlots.some(
        (slot) => new Date(slot.startTime).getTime() === startTime.getTime()
      )

      if (!isSlotAvailable) {
        throw createStructuredError('BAD_REQUEST', 'Slot not available', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'This time slot is no longer available. Please select another time.',
        })
      }

      // Create the booking
      // WHY: Pass leadId to link the lead as attendee on the calendar event (if from sticky session)
      const booking = await bookingCalendarService.createBooking({
        bookingCalendarId: calendarId,
        organizationId: calendar.organizationId,
        startTime,
        endTime,
        bookerName,
        bookerEmail,
        bookerPhone,
        notes,
        leadId,
      })

      return {
        success: true,
        booking: {
          id: booking.id,
          startTime: booking.startTime,
          endTime: booking.endTime,
          bookerName: booking.bookerName,
          bookerEmail: booking.bookerEmail,
          calendarName: calendar.name,
          duration: calendar.duration,
          locationType: calendar.locationType,
          locationDetails: calendar.locationDetails,
        },
      }
    }),
})
