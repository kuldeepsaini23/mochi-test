/**
 * Calendar Router
 *
 * tRPC router for calendar event management.
 * Uses organizationProcedure for authorization.
 * All data access goes through calendar.service.ts (DAL).
 *
 * SOURCE OF TRUTH KEYWORDS: Calendar, CalendarEvent, Scheduling, Meetings, Appointments
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import * as calendarService from '@/services/calendar.service'

// ============================================================================
// INPUT SCHEMAS - Exported for use by AI tools (single source of truth)
// ============================================================================

/**
 * Valid event colors for visual categorization
 */
const eventColorSchema = z.enum([
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
 * Valid event status values
 * SOURCE OF TRUTH: CalendarEventStatus enum in Prisma schema
 */
const eventStatusSchema = z.enum(['PENDING', 'APPROVED', 'CANCELLED'])

/**
 * Schema for getting events by date range
 * NOTE: Uses z.coerce.date() to handle JSON serialization (dates come as strings from client)
 */
export const getEventsByDateRangeSchema = z.object({
  organizationId: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  limit: z.number().int().positive().max(100).default(50),
  cursor: z.string().nullish(),
})

/**
 * Schema for getting events for a specific day
 */
export const getEventsForDaySchema = z.object({
  organizationId: z.string(),
  date: z.coerce.date(),
})

/**
 * Schema for getting a single event
 */
export const getEventSchema = z.object({
  organizationId: z.string(),
  eventId: z.string(),
})

/**
 * Schema for getting events linked to a lead
 */
export const getEventsForLeadSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
  limit: z.number().int().positive().max(50).default(20),
})

/**
 * Schema for getting upcoming events for a team member
 */
export const getUpcomingEventsSchema = z.object({
  organizationId: z.string(),
  memberId: z.string(),
  limit: z.number().int().positive().max(20).default(10),
})

/**
 * Schema for creating a calendar event
 * NOTE: Uses z.coerce.date() to handle JSON serialization
 */
export const createEventSchema = z.object({
  organizationId: z.string(),
  title: z.string().min(1, 'Event title is required'),
  description: z.string().optional().nullable(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isAllDay: z.boolean().optional().default(false),
  location: z.string().optional().nullable(),
  meetingUrl: z.string().url().optional().nullable().or(z.literal('')),
  color: eventColorSchema.optional().default('blue'),
  status: eventStatusSchema.optional().default('PENDING'),
  assignedToId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
})

/**
 * Schema for updating a calendar event
 */
export const updateEventSchema = z.object({
  organizationId: z.string(),
  eventId: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isAllDay: z.boolean().optional(),
  location: z.string().optional().nullable(),
  meetingUrl: z.string().url().optional().nullable().or(z.literal('')),
  color: eventColorSchema.optional(),
  status: eventStatusSchema.optional(),
  assignedToId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
})

/**
 * Schema for deleting a calendar event
 */
export const deleteEventSchema = z.object({
  organizationId: z.string(),
  eventId: z.string(),
})

/**
 * Schema for getting event counts by day (for month view indicators)
 */
export const getEventCountsByDaySchema = z.object({
  organizationId: z.string(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

// ============================================================================
// ROUTER
// ============================================================================

export const calendarRouter = createTRPCRouter({
  // ============================================================================
  // READ OPERATIONS
  // ============================================================================

  /**
   * Get events for a date range with pagination
   * WHY: Main query for week/month calendar views
   * HOW: Cursor-based pagination using event startDate
   */
  getByDateRange: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(getEventsByDateRangeSchema)
    .query(async ({ input }) => {
      const { organizationId, startDate, endDate, limit, cursor } = input
      return await calendarService.getEventsByDateRange(
        organizationId,
        startDate,
        endDate,
        limit,
        cursor
      )
    }),

  /**
   * Get all events for a specific day
   * WHY: Quick fetch for day view without pagination
   */
  getByDay: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(getEventsForDaySchema)
    .query(async ({ input }) => {
      const { organizationId, date } = input
      return await calendarService.getEventsForDay(organizationId, date)
    }),

  /**
   * Get a single event by ID
   */
  getById: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(getEventSchema)
    .query(async ({ input }) => {
      const { organizationId, eventId } = input

      // Verify ownership
      const isOwner = await calendarService.verifyEventOwnership(eventId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Event not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Event not found',
        })
      }

      const event = await calendarService.getEvent(eventId)
      if (!event) {
        throw createStructuredError('NOT_FOUND', 'Event not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Event not found',
        })
      }

      return event
    }),

  /**
   * Get events linked to a specific lead
   * WHY: Show calendar events in lead detail view
   */
  getByLead: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(getEventsForLeadSchema)
    .query(async ({ input }) => {
      const { organizationId, leadId, limit } = input

      // Verify lead ownership
      const isLeadOwner = await calendarService.verifyLeadInOrganization(leadId, organizationId)
      if (!isLeadOwner) {
        throw createStructuredError('NOT_FOUND', 'Lead not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lead not found',
        })
      }

      return await calendarService.getEventsForLead(organizationId, leadId, limit)
    }),

  /**
   * Get upcoming events for a team member
   * WHY: Dashboard widget, notifications, personal calendar view
   */
  getUpcoming: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(getUpcomingEventsSchema)
    .query(async ({ input }) => {
      const { organizationId, memberId, limit } = input

      // Verify member belongs to organization
      const isMemberValid = await calendarService.verifyMemberInOrganization(
        memberId,
        organizationId
      )
      if (!isMemberValid) {
        throw createStructuredError('NOT_FOUND', 'Member not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Member not found',
        })
      }

      return await calendarService.getUpcomingEventsForMember(organizationId, memberId, limit)
    }),

  /**
   * Get event counts grouped by day for a month
   * WHY: Show event indicators on month view calendar cells
   */
  getCountsByDay: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(getEventCountsByDaySchema)
    .query(async ({ input }) => {
      const { organizationId, year, month } = input
      return await calendarService.getEventCountsByDay(organizationId, year, month)
    }),

  // ============================================================================
  // WRITE OPERATIONS
  // ============================================================================

  /**
   * Create a new calendar event.
   * Feature-gated: calendars.limit checked at procedure level before handler runs.
   */
  create: organizationProcedure({
    requirePermission: permissions.CALENDAR_CREATE,
    requireFeature: 'calendars.limit',
  })
    .input(createEventSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, assignedToId, leadId, meetingUrl, status, ...eventData } = input

      // Validate assignedToId if provided
      if (assignedToId) {
        const isMemberValid = await calendarService.verifyMemberInOrganization(
          assignedToId,
          organizationId
        )
        if (!isMemberValid) {
          throw createStructuredError('BAD_REQUEST', 'Invalid team member', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'The assigned team member does not exist in this organization',
          })
        }
      }

      // Validate leadId if provided
      if (leadId) {
        const isLeadValid = await calendarService.verifyLeadInOrganization(leadId, organizationId)
        if (!isLeadValid) {
          throw createStructuredError('BAD_REQUEST', 'Invalid lead', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'The lead does not exist in this organization',
          })
        }
      }

      // Validate date range
      if (eventData.endDate < eventData.startDate) {
        throw createStructuredError('BAD_REQUEST', 'Invalid date range', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'End date must be after start date',
        })
      }

      const result = await calendarService.createEvent({
        organizationId,
        assignedToId,
        leadId,
        // Convert empty string to null for meetingUrl
        meetingUrl: meetingUrl || null,
        status,
        ...eventData,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, organizationId, 'calendars.limit')

      return result
    }),

  /**
   * Update a calendar event
   */
  update: organizationProcedure({ requirePermission: permissions.CALENDAR_UPDATE })
    .input(updateEventSchema)
    .mutation(async ({ input }) => {
      const { organizationId, eventId, assignedToId, leadId, meetingUrl, status, ...updateData } = input

      // Verify event ownership
      const isOwner = await calendarService.verifyEventOwnership(eventId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Event not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Event not found',
        })
      }

      // Validate assignedToId if provided
      if (assignedToId !== undefined && assignedToId !== null) {
        const isMemberValid = await calendarService.verifyMemberInOrganization(
          assignedToId,
          organizationId
        )
        if (!isMemberValid) {
          throw createStructuredError('BAD_REQUEST', 'Invalid team member', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'The assigned team member does not exist in this organization',
          })
        }
      }

      // Validate leadId if provided
      if (leadId !== undefined && leadId !== null) {
        const isLeadValid = await calendarService.verifyLeadInOrganization(leadId, organizationId)
        if (!isLeadValid) {
          throw createStructuredError('BAD_REQUEST', 'Invalid lead', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'The lead does not exist in this organization',
          })
        }
      }

      // Validate date range if both dates provided
      if (updateData.startDate && updateData.endDate && updateData.endDate < updateData.startDate) {
        throw createStructuredError('BAD_REQUEST', 'Invalid date range', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'End date must be after start date',
        })
      }

      return await calendarService.updateEvent(eventId, {
        assignedToId,
        leadId,
        // Convert empty string to null for meetingUrl
        meetingUrl: meetingUrl === '' ? null : meetingUrl,
        status,
        ...updateData,
      })
    }),

  /**
   * Delete a calendar event
   * WHY: Hard delete - permanently removes from database
   */
  delete: organizationProcedure({ requirePermission: permissions.CALENDAR_DELETE })
    .input(deleteEventSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, eventId } = input

      // Verify event ownership
      const isOwner = await calendarService.verifyEventOwnership(eventId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Event not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Event not found',
        })
      }

      await calendarService.deleteEvent(eventId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, organizationId, 'calendars.limit')

      return { success: true, message: 'Event deleted' }
    }),
})
