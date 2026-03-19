'use client'

/**
 * Calendar Hooks - TRPC Implementation with Optimistic UI
 *
 * SOURCE OF TRUTH: These hooks use TRPC for server communication with optimistic updates.
 * All data is persisted in the database via the calendar service layer.
 *
 * ARCHITECTURE:
 * - useCalendarEvents: Hook for fetching events by date range (week view)
 * - useCalendarEventsByDay: Hook for fetching events for a specific day
 * - useCalendarEventMutations: Mutations for event CRUD operations
 * - useEventCountsByMonth: Hook for month view indicators
 * - useUpcomingEvents: Hook for dashboard widget
 *
 * Search Keywords: SOURCE OF TRUTH, CALENDAR HOOKS, OPTIMISTIC UI, TRPC
 */

import { useMemo, useCallback } from 'react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

// ============================================================================
// TYPES - Client-friendly calendar event structure
// ============================================================================

/**
 * Event status values matching Prisma enum
 * SOURCE OF TRUTH: CalendarEventStatus enum in Prisma schema
 */
export type CalendarEventStatus = 'PENDING' | 'APPROVED' | 'CANCELLED'

/**
 * Calendar event type for UI components
 * WHY: Provides a clean interface for components, handles date transformation
 *
 * SOURCE OF TRUTH: CalendarEvent model in Prisma schema
 */
export interface CalendarEventUI {
  id: string
  organizationId: string
  title: string
  description: string | null
  startDate: Date
  endDate: Date
  isAllDay: boolean
  location: string | null
  meetingUrl: string | null
  color: string
  status: CalendarEventStatus
  assignedTo: {
    id: string
    name: string
    email: string
    image: string | null
  } | null
  lead: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
    avatarUrl: string | null
  } | null
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// TRANSFORMATION HELPERS
// ============================================================================

/**
 * Transforms TRPC calendar event data into client-friendly format
 * WHY: TRPC serializes dates as strings during transport, need conversion
 */
function transformEventData(event: {
  id: string
  organizationId: string
  title: string
  description: string | null
  startDate: Date | string
  endDate: Date | string
  isAllDay: boolean
  location: string | null
  meetingUrl: string | null
  color: string
  status: CalendarEventStatus
  createdAt: Date | string
  updatedAt: Date | string
  assignedTo?: {
    id: string
    user: {
      id: string
      name: string | null
      email: string
      image: string | null
    }
  } | null
  lead?: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
    avatarUrl: string | null
  } | null
}): CalendarEventUI {
  return {
    id: event.id,
    organizationId: event.organizationId,
    title: event.title,
    description: event.description,
    startDate: new Date(event.startDate),
    endDate: new Date(event.endDate),
    isAllDay: event.isAllDay,
    location: event.location,
    meetingUrl: event.meetingUrl,
    color: event.color,
    status: event.status,
    assignedTo: event.assignedTo?.user
      ? {
          id: event.assignedTo.id,
          name: event.assignedTo.user.name ?? 'Unknown',
          email: event.assignedTo.user.email,
          image: event.assignedTo.user.image,
        }
      : null,
    lead: event.lead
      ? {
          id: event.lead.id,
          firstName: event.lead.firstName,
          lastName: event.lead.lastName,
          email: event.lead.email,
          phone: event.lead.phone,
          avatarUrl: event.lead.avatarUrl,
        }
      : null,
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.updatedAt),
  }
}

// ============================================================================
// CALENDAR EVENTS BY DATE RANGE HOOK
// ============================================================================

/**
 * Hook for fetching calendar events by date range
 * WHY: Primary hook for week view - fetches events within visible range
 *
 * @param organizationId - Organization to fetch events for
 * @param startDate - Range start date
 * @param endDate - Range end date
 */
export function useCalendarEvents(
  organizationId: string,
  startDate: Date,
  endDate: Date
) {
  const utils = trpc.useUtils()

  const query = trpc.calendar.getByDateRange.useQuery(
    {
      organizationId,
      startDate,
      endDate,
      limit: 100, // Fetch plenty for week view
    },
    {
      enabled: !!organizationId,
      /**
       * Cache configuration for optimal UX:
       * - staleTime: Data is fresh for 5 minutes
       * - gcTime: Keep in cache for 30 minutes when inactive
       * WHY: Calendar data doesn't change frequently, caching improves navigation
       */
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Transform raw API data into client-friendly format with dates
   */
  const events = useMemo((): CalendarEventUI[] => {
    if (!query.data?.events) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return query.data.events.map((event: any) => transformEventData(event))
  }, [query.data?.events])

  /**
   * Invalidate cache to force re-fetch
   */
  const invalidate = useCallback(async () => {
    await utils.calendar.getByDateRange.invalidate({
      organizationId,
      startDate,
      endDate,
    })
  }, [utils.calendar.getByDateRange, organizationId, startDate, endDate])

  return {
    events,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? new Error(query.error.message) : null,
    invalidate,
    refetch: query.refetch,
    hasMore: query.data?.hasMore ?? false,
    nextCursor: query.data?.nextCursor ?? null,
  }
}

// ============================================================================
// CALENDAR EVENTS BY DAY HOOK
// ============================================================================

/**
 * Hook for fetching events for a specific day
 * WHY: Quick fetch for day view or event details sidebar
 */
export function useCalendarEventsByDay(organizationId: string, date: Date) {
  const query = trpc.calendar.getByDay.useQuery(
    { organizationId, date },
    {
      enabled: !!organizationId,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  const events = useMemo((): CalendarEventUI[] => {
    if (!query.data) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return query.data.map((event: any) => transformEventData(event))
  }, [query.data])

  return {
    events,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error.message) : null,
  }
}

// ============================================================================
// UPCOMING EVENTS HOOK - For dashboard widget
// ============================================================================

/**
 * Hook for fetching upcoming events for a team member
 * WHY: Dashboard widget showing next events for the current user
 */
export function useUpcomingEvents(
  organizationId: string,
  memberId: string,
  limit: number = 10
) {
  const query = trpc.calendar.getUpcoming.useQuery(
    { organizationId, memberId, limit },
    {
      enabled: !!organizationId && !!memberId,
      staleTime: 2 * 60 * 1000, // 2 minutes - more frequent refresh for upcoming
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: true, // Refresh on tab focus for dashboard
    }
  )

  const events = useMemo((): CalendarEventUI[] => {
    if (!query.data) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return query.data.map((event: any) => transformEventData(event))
  }, [query.data])

  return {
    events,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error.message) : null,
  }
}

// ============================================================================
// EVENT COUNTS BY MONTH HOOK - For month view indicators
// ============================================================================

/**
 * Hook for getting event counts by day for month view
 * WHY: Show event indicators on calendar cells without fetching full events
 */
export function useEventCountsByMonth(
  organizationId: string,
  year: number,
  month: number
) {
  const query = trpc.calendar.getCountsByDay.useQuery(
    { organizationId, year, month },
    {
      enabled: !!organizationId,
      staleTime: 10 * 60 * 1000, // 10 minutes - counts don't need frequent updates
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Return counts grouped by day (YYYY-MM-DD format)
   * Each day has { count: number, colors: string[] }
   */
  return {
    countsByDay: query.data ?? {},
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error.message) : null,
  }
}

// ============================================================================
// CALENDAR EVENT MUTATIONS HOOK - With Optimistic Updates
// ============================================================================

/**
 * Input type for creating/updating events
 * Used by both the mutation and optimistic update
 * SOURCE OF TRUTH: CalendarEvent model in Prisma schema
 */
export type CalendarEventInput = {
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
 * Hook for calendar event mutations with optimistic UI
 *
 * ARCHITECTURE: Uses optimistic updates for instant UI feedback.
 * - onOptimisticCreate: Called immediately to add event to local state
 * - onOptimisticUpdate: Called immediately to update event in local state
 * - onOptimisticDelete: Called immediately to remove event from local state
 * - onRollback: Called on error to revert local state
 *
 * Toast notifications provide user feedback.
 */
export function useCalendarEventMutations(
  organizationId: string,
  callbacks?: {
    onOptimisticCreate?: (tempEvent: CalendarEventUI) => void
    onOptimisticUpdate?: (eventId: string, updates: Partial<CalendarEventInput>) => void
    onOptimisticDelete?: (eventId: string) => void
    onRollback?: () => void
    onSuccess?: (event: CalendarEventUI) => void
  }
) {
  const utils = trpc.useUtils()

  /**
   * Invalidate all relevant calendar caches
   * WHY: After create/update/delete, refresh all calendar queries
   */
  const invalidateAll = useCallback(() => {
    utils.calendar.getByDateRange.invalidate()
    utils.calendar.getByDay.invalidate()
    utils.calendar.getUpcoming.invalidate()
    utils.calendar.getCountsByDay.invalidate()
  }, [utils.calendar])

  /**
   * Create event mutation with optimistic update
   */
  const createEventMutation = trpc.calendar.create.useMutation({
    onSuccess: (data) => {
      toast.success('Event created')
      // Transform and call success callback with the created event
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createdEvent = transformEventData(data as any)
      callbacks?.onSuccess?.(createdEvent)
      invalidateAll()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to create event')
      // Rollback optimistic update
      callbacks?.onRollback?.()
    },
  })

  /**
   * Update event mutation with optimistic update
   */
  const updateEventMutation = trpc.calendar.update.useMutation({
    onSuccess: (data) => {
      toast.success('Event updated')
      // Transform and call success callback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatedEvent = transformEventData(data as any)
      callbacks?.onSuccess?.(updatedEvent)
      invalidateAll()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update event')
      callbacks?.onRollback?.()
    },
  })

  /**
   * Delete event mutation with optimistic update
   */
  const deleteEventMutation = trpc.calendar.delete.useMutation({
    onSuccess: () => {
      toast.success('Event deleted')
      invalidateAll()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete event')
      callbacks?.onRollback?.()
    },
  })

  // ============================================================================
  // WRAPPER FUNCTIONS - With Optimistic Updates
  // ============================================================================

  /**
   * Create a new calendar event with optimistic update
   * Returns the temp ID immediately for tracking
   */
  const createEvent = useCallback(
    async (input: CalendarEventInput): Promise<string> => {
      // Generate temp ID for optimistic update
      const tempId = `temp-${Date.now()}`

      // Create optimistic event with status defaulting to PENDING
      const tempEvent: CalendarEventUI = {
        id: tempId,
        organizationId,
        title: input.title,
        description: input.description ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        isAllDay: input.isAllDay ?? false,
        location: input.location ?? null,
        meetingUrl: input.meetingUrl ?? null,
        color: input.color ?? 'blue',
        status: input.status ?? 'PENDING',
        assignedTo: null, // Will be populated on server response
        lead: null, // Will be populated on server response
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Apply optimistic update immediately
      callbacks?.onOptimisticCreate?.(tempEvent)

      // Send to server
      await createEventMutation.mutateAsync({
        organizationId,
        title: input.title,
        description: input.description,
        startDate: input.startDate,
        endDate: input.endDate,
        isAllDay: input.isAllDay ?? false,
        location: input.location,
        meetingUrl: input.meetingUrl,
        color: (input.color as 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'yellow' | 'gray') ?? 'blue',
        status: (input.status as 'PENDING' | 'APPROVED' | 'CANCELLED') ?? 'PENDING',
        assignedToId: input.assignedToId,
        leadId: input.leadId,
      })

      return tempId
    },
    [organizationId, createEventMutation, callbacks]
  )

  /**
   * Update an existing calendar event with optimistic update
   */
  const updateEvent = useCallback(
    async (eventId: string, input: Partial<CalendarEventInput>) => {
      // Apply optimistic update immediately
      callbacks?.onOptimisticUpdate?.(eventId, input)

      // Send to server
      return updateEventMutation.mutateAsync({
        organizationId,
        eventId,
        ...input,
        color: input.color as 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'yellow' | 'gray' | undefined,
        status: input.status as 'PENDING' | 'APPROVED' | 'CANCELLED' | undefined,
      })
    },
    [organizationId, updateEventMutation, callbacks]
  )

  /**
   * Delete a calendar event with optimistic update
   */
  const deleteEvent = useCallback(
    async (eventId: string) => {
      // Apply optimistic update immediately
      callbacks?.onOptimisticDelete?.(eventId)

      // Send to server
      return deleteEventMutation.mutateAsync({
        organizationId,
        eventId,
      })
    },
    [organizationId, deleteEventMutation, callbacks]
  )

  return {
    createEvent,
    updateEvent,
    deleteEvent,
    isCreating: createEventMutation.isPending,
    isUpdating: updateEventMutation.isPending,
    isDeleting: deleteEventMutation.isPending,
  }
}

// ============================================================================
// LEADS HOOK - For lead selector in event form
// ============================================================================

/**
 * Hook for fetching leads for assignment to calendar events
 * WHY: Event form needs a list of leads to link events to
 */
export function useLeadsForCalendar(organizationId: string) {
  const { data, isLoading } = trpc.leads.list.useQuery(
    { organizationId, pageSize: 100 },
    {
      enabled: !!organizationId,
      staleTime: 60000, // 1 minute
    }
  )

  /**
   * Transform leads into simplified format for selector
   */
  const leads = useMemo(() => {
    if (!data?.leads) return []
    return data.leads.map((lead: { id: string; firstName: string | null; lastName: string | null; email: string; phone: string | null; avatarUrl: string | null }) => ({
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      avatarUrl: lead.avatarUrl,
    }))
  }, [data?.leads])

  return {
    leads,
    isLoading,
  }
}

// ============================================================================
// EVENT COLOR OPTIONS - Constants for UI
// ============================================================================

/**
 * Available event colors for UI components
 * SOURCE OF TRUTH: Must match Prisma schema eventColorSchema
 */
export const EVENT_COLORS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
] as const

export type EventColor = (typeof EVENT_COLORS)[number]['value']
