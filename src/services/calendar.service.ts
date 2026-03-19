/**
 * Calendar Service (DAL)
 *
 * Data Access Layer for all calendar event operations.
 * This is the ONLY place that should interact with Prisma for calendar events.
 *
 * SOURCE OF TRUTH KEYWORDS: Calendar, CalendarEvent, Scheduling, Meetings, Appointments
 *
 * tRPC routers call these functions after security checks.
 */

import { prisma } from '@/lib/config'
import type { Prisma, CalendarEventStatus } from '@/generated/prisma'
import { logActivity, logActivities } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input type for creating a calendar event
 * SOURCE OF TRUTH: CalendarEvent model in Prisma schema
 */
export type CalendarEventCreateInput = {
  organizationId: string
  title: string
  description?: string | null
  startDate: Date
  endDate: Date
  isAllDay?: boolean
  location?: string | null
  meetingUrl?: string | null
  color?: string
  status?: CalendarEventStatus
  assignedToId?: string | null
  leadId?: string | null
}

/**
 * Input type for updating a calendar event
 * SOURCE OF TRUTH: CalendarEvent model in Prisma schema
 */
export type CalendarEventUpdateInput = {
  title?: string
  description?: string | null
  startDate?: Date
  endDate?: Date
  isAllDay?: boolean
  location?: string | null
  meetingUrl?: string | null
  color?: string
  status?: CalendarEventStatus
  assignedToId?: string | null
  leadId?: string | null
}

// ============================================================================
// DEFAULT INCLUDES - Standard relations to include with queries
// ============================================================================

/**
 * Event include configuration
 * WHY: Include assigned team member and lead details for display
 */
const CALENDAR_EVENT_INCLUDE = {
  assignedTo: {
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  },
  lead: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.CalendarEventInclude

// ============================================================================
// CALENDAR EVENT CRUD
// ============================================================================

/**
 * Get a single calendar event by ID
 */
export async function getEvent(eventId: string) {
  return prisma.calendarEvent.findUnique({
    where: { id: eventId },
    include: CALENDAR_EVENT_INCLUDE,
  })
}

/**
 * Get events for a date range with pagination
 * WHY: Enable efficient loading of events for week/month views
 * HOW: Uses cursor-based pagination with startDate as cursor
 *
 * @param organizationId - Organization to fetch events for
 * @param startDate - Range start date
 * @param endDate - Range end date
 * @param limit - Number of events to fetch per page
 * @param cursor - Optional cursor (ISO date string) to start from
 * @returns Paginated events with nextCursor
 */
export async function getEventsByDateRange(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 50,
  cursor?: string | null
) {
  /**
   * Query events that overlap with the date range
   * An event overlaps if:
   * - Event starts before range ends AND
   * - Event ends after range starts
   */
  const events = await prisma.calendarEvent.findMany({
    where: {
      organizationId,
      // Event overlaps with date range
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      // Cursor-based pagination using startDate
      ...(cursor && { startDate: { gt: new Date(cursor) } }),
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    include: CALENDAR_EVENT_INCLUDE,
  })

  // Check if there are more items
  let nextCursor: string | null = null
  const hasMore = events.length > limit

  if (hasMore) {
    // Remove the extra item and get its startDate as cursor
    const nextItem = events.pop()
    nextCursor = nextItem?.startDate.toISOString() ?? null
  }

  return {
    events,
    nextCursor,
    hasMore,
  }
}

/**
 * Get all events for a specific day
 * WHY: Quick fetch for day view without pagination
 */
export async function getEventsForDay(organizationId: string, date: Date) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  return prisma.calendarEvent.findMany({
    where: {
      organizationId,
      // Event overlaps with the day
      startDate: { lte: dayEnd },
      endDate: { gte: dayStart },
    },
    orderBy: [{ isAllDay: 'desc' }, { startDate: 'asc' }],
    include: CALENDAR_EVENT_INCLUDE,
  })
}

/**
 * Get upcoming events for a user (assigned to them)
 * WHY: Show personalized upcoming events in dashboard or notifications
 */
export async function getUpcomingEventsForMember(
  organizationId: string,
  memberId: string,
  limit: number = 10
) {
  const now = new Date()

  return prisma.calendarEvent.findMany({
    where: {
      organizationId,
      assignedToId: memberId,
      startDate: { gte: now },
    },
    orderBy: { startDate: 'asc' },
    take: limit,
    include: CALENDAR_EVENT_INCLUDE,
  })
}

/**
 * Get events linked to a specific lead
 * WHY: Show calendar events in lead detail view
 */
export async function getEventsForLead(
  organizationId: string,
  leadId: string,
  limit: number = 20
) {
  return prisma.calendarEvent.findMany({
    where: {
      organizationId,
      leadId,
    },
    orderBy: { startDate: 'desc' },
    take: limit,
    include: CALENDAR_EVENT_INCLUDE,
  })
}

/**
 * Create a new calendar event
 * WHY: Insert new event with all fields including status
 *
 * @param input - Calendar event data
 * @param userId - Optional: User ID for activity logging
 */
export async function createEvent(input: CalendarEventCreateInput, userId?: string) {
  const event = await prisma.calendarEvent.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
      isAllDay: input.isAllDay ?? false,
      location: input.location,
      meetingUrl: input.meetingUrl,
      color: input.color ?? 'blue',
      status: input.status ?? 'PENDING',
      assignedToId: input.assignedToId,
      leadId: input.leadId,
    },
    include: CALENDAR_EVENT_INCLUDE,
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'calendar',
      entityId: event.id,
    })
  }

  return event
}

/**
 * Update a calendar event
 *
 * @param eventId - Event ID to update
 * @param input - Update data
 * @param organizationId - Optional: Organization ID for activity logging
 * @param userId - Optional: User ID for activity logging
 */
export async function updateEvent(
  eventId: string,
  input: CalendarEventUpdateInput,
  organizationId?: string,
  userId?: string
) {
  const event = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: input,
    include: CALENDAR_EVENT_INCLUDE,
  })

  // Log activity for audit trail
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'calendar',
      entityId: event.id,
    })
  }

  return event
}

/**
 * Delete a calendar event
 * WHY: Hard delete - permanently removes from database
 *
 * @param eventId - Event ID to delete
 * @param organizationId - Optional: Organization ID for activity logging
 * @param userId - Optional: User ID for activity logging
 */
export async function deleteEvent(eventId: string, organizationId?: string, userId?: string) {
  const event = await prisma.calendarEvent.delete({
    where: { id: eventId },
  })

  // Log activity for audit trail
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'calendar',
      entityId: event.id,
    })
  }

  return event
}

/**
 * Bulk delete events
 * WHY: For cleaning up recurring events or batch operations
 *
 * @param eventIds - Array of event IDs to delete
 * @param organizationId - Optional: Organization ID for activity logging
 * @param userId - Optional: User ID for activity logging
 */
export async function deleteEventsBulk(
  eventIds: string[],
  organizationId?: string,
  userId?: string
) {
  const result = await prisma.calendarEvent.deleteMany({
    where: { id: { in: eventIds } },
  })

  // Log bulk delete activity for audit trail
  if (userId && organizationId && eventIds.length > 0) {
    logActivities(
      eventIds.map((id) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'calendar',
        entityId: id,
      }))
    )
  }

  return result
}

// ============================================================================
// VERIFICATION HELPERS
// ============================================================================

/**
 * Verify an event belongs to an organization
 */
export async function verifyEventOwnership(
  eventId: string,
  organizationId: string
): Promise<boolean> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, organizationId },
    select: { id: true },
  })
  return !!event
}

/**
 * Verify a member belongs to an organization
 * WHY: Validate assignedToId before creating/updating events
 */
export async function verifyMemberInOrganization(
  memberId: string,
  organizationId: string
): Promise<boolean> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true },
  })
  return !!member
}

/**
 * Verify a lead belongs to an organization
 * WHY: Validate leadId before creating/updating events
 */
export async function verifyLeadInOrganization(
  leadId: string,
  organizationId: string
): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId, deletedAt: null },
    select: { id: true },
  })
  return !!lead
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get event count for date range
 * WHY: Show event count badges on calendar month view
 */
export async function getEventCountByDateRange(
  organizationId: string,
  startDate: Date,
  endDate: Date
) {
  return prisma.calendarEvent.count({
    where: {
      organizationId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  })
}

/**
 * Get events grouped by day for a month
 * WHY: Show event indicators on month view calendar
 */
export async function getEventCountsByDay(
  organizationId: string,
  year: number,
  month: number
) {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)

  const events = await prisma.calendarEvent.findMany({
    where: {
      organizationId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: {
      id: true,
      startDate: true,
      color: true,
    },
  })

  // Group events by day
  const eventsByDay = new Map<string, { count: number; colors: string[] }>()

  for (const event of events) {
    const dayKey = event.startDate.toISOString().split('T')[0]
    const existing = eventsByDay.get(dayKey) ?? { count: 0, colors: [] }
    existing.count++
    if (!existing.colors.includes(event.color)) {
      existing.colors.push(event.color)
    }
    eventsByDay.set(dayKey, existing)
  }

  return Object.fromEntries(eventsByDay)
}
