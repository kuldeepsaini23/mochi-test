'use client'

/**
 * Calendar Page Content - Active Organization Pattern with tRPC + Optimistic UI
 *
 * WHY: Main client component orchestrating the calendar UI with events
 * HOW: Displays calendar header with navigation and week view grid
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Maintains local events state for optimistic updates
 * - Server sync happens via query invalidation, optimistic updates for instant UI
 * - Permission-based access control via hasPermission helper
 *
 * OPTIMISTIC UPDATES:
 * - Create: Add temp event immediately, replace with server response
 * - Update: Update event in local state immediately
 * - Delete: Remove event from local state immediately
 * - On error: Rollback to last known good state
 *
 * PERMISSIONS:
 * - calendar:read - Required to view calendar
 * - calendar:create - Required to create events
 * - calendar:update - Required to edit events
 * - calendar:delete - Required to delete events
 *
 * SOURCE OF TRUTH KEYWORDS: CalendarPageContent, ActiveOrganization, CALENDAR, TRPC, OPTIMISTIC
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { useIsMobile } from '@/hooks/use-media-query'
import { useUserTimezone } from '@/hooks/use-user-timezone'
import {
  useCalendarEvents,
  useCalendarEventMutations,
  type CalendarEventUI,
  type CalendarEventInput,
  type CalendarEventStatus,
} from '@/hooks/use-calendar'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/page-header'
import type { EventColor } from './types'
import { CalendarHeader } from './calendar-header'
import { WeekViewGrid } from './week-view-grid'
import { MobileCalendarView } from './mobile-calendar-view'
import { EventDialog } from './event-dialog'

// ============================================================================
// CALENDAR LOADING SKELETONS
// ============================================================================

/**
 * Full Page Desktop Calendar Skeleton (includes page header)
 * WHY: Used for initial org load when nothing is rendered yet
 */
function DesktopCalendarSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-6 w-32" />
      </div>
      <DesktopCalendarContentSkeleton />
    </div>
  )
}

/**
 * Desktop Calendar Content Skeleton (no page header)
 * WHY: Used when page header is already rendered but events are loading
 */
function DesktopCalendarContentSkeleton() {
  return (
    <>
      {/* Calendar header skeleton */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-20" />
          <div className="flex gap-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Calendar grid skeleton */}
      <div className="flex-1 p-3">
        <div className="h-full rounded-xl border bg-sidebar overflow-hidden">
          {/* Days header row */}
          <div className="flex border-b">
            <div className="w-16 shrink-0" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-1 py-3 border-l first:border-l-0"
              >
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="flex flex-1">
            <div className="w-16 shrink-0">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-14 flex items-start justify-end pr-2 pt-0">
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7">
              {Array.from({ length: 7 }).map((_, dayIndex) => (
                <div key={dayIndex} className="border-l first:border-l-0">
                  {Array.from({ length: 12 }).map((_, hourIndex) => (
                    <div key={hourIndex} className="h-14 border-b border-border/50" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Full Page Mobile Calendar Skeleton (includes page header)
 * WHY: Used for initial org load when nothing is rendered yet
 */
function MobileCalendarSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-6 w-32" />
      </div>
      <MobileCalendarContentSkeleton />
    </div>
  )
}

/**
 * Mobile Calendar Content Skeleton (no page header)
 * WHY: Used when page header is already rendered but events are loading
 */
function MobileCalendarContentSkeleton() {
  return (
    <>
      {/* Calendar section */}
      <div className="shrink-0 border-b bg-sidebar">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-16" />
        </div>
        <div className="flex justify-center py-4">
          <div className="w-full max-w-[320px] space-y-2">
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex justify-center">
                  <Skeleton className="h-4 w-6" />
                </div>
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, dayIndex) => (
                  <div key={dayIndex} className="flex justify-center py-1">
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Events section */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-8 w-14" />
        </div>
        <div className="flex-1 p-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-3 rounded-xl border">
              <div className="flex items-start gap-3">
                <Skeleton className="w-1 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ============================================================================
// MAIN CALENDAR PAGE CONTENT COMPONENT
// ============================================================================

export function CalendarPageContent() {
  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()

  /**
   * Get user's timezone preference for event display
   * WHY: Events should be displayed in user's preferred timezone, not browser timezone
   * Falls back to browser timezone if not set in profile
   */
  const { timezone: userTimezone } = useUserTimezone()

  /**
   * Check permissions using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasCalendarAccess = hasPermission(permissions.CALENDAR_READ)
  const hasCalendarCreate = hasPermission(permissions.CALENDAR_CREATE)
  const hasCalendarUpdate = hasPermission(permissions.CALENDAR_UPDATE)
  const hasCalendarDelete = hasPermission(permissions.CALENDAR_DELETE)

  /**
   * Responsive: Check if mobile viewport
   * WHY: Render MobileCalendarView on mobile, WeekViewGrid on desktop
   */
  const isMobile = useIsMobile()

  // ============================================================================
  // LOCAL STATE
  // ============================================================================

  /**
   * Current date for the calendar view
   * Determines which week is displayed
   */
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  /**
   * Event dialog state
   * - selectedEvent: The event being edited (null for create mode)
   * - isDialogOpen: Whether the dialog is visible
   * - defaultDate: Pre-filled date when clicking on a time slot
   */
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventUI | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogDefaultDate, setDialogDefaultDate] = useState<Date | null>(null)

  /**
   * Local events state for optimistic updates
   * WHY: Separates UI state from server state for instant feedback
   */
  const [localEvents, setLocalEvents] = useState<CalendarEventUI[]>([])

  /**
   * Snapshot for rollback on error
   * WHY: If mutation fails, we restore this state
   */
  const snapshotRef = useRef<CalendarEventUI[]>([])

  // ============================================================================
  // CALCULATE DATE RANGE FOR WEEK VIEW
  // ============================================================================

  /**
   * Calculate the week's start and end dates for tRPC query
   * WHY: Fetch only events within the visible week range
   */
  const { weekStart, weekEnd } = useMemo(() => {
    const start = new Date(currentDate)
    start.setDate(start.getDate() - start.getDay()) // Sunday
    start.setHours(0, 0, 0, 0)

    const end = new Date(start)
    end.setDate(end.getDate() + 6) // Saturday
    end.setHours(23, 59, 59, 999)

    return { weekStart: start, weekEnd: end }
  }, [currentDate])

  // ============================================================================
  // TRPC DATA FETCHING - Calendar Events
  // ============================================================================

  /**
   * Fetch calendar events for the current week
   * Uses tRPC query with caching
   */
  const {
    events: serverEvents,
    isLoading: isLoadingEvents,
    error: eventsError,
  } = useCalendarEvents(
    activeOrganization?.id ?? '',
    weekStart,
    weekEnd
  )

  /**
   * Sync server events to local state when not in middle of optimistic update
   * WHY: Keep local state in sync with server, but don't override optimistic updates
   */
  useEffect(() => {
    if (serverEvents && serverEvents.length >= 0) {
      setLocalEvents(serverEvents)
    }
  }, [serverEvents])

  // ============================================================================
  // OPTIMISTIC UPDATE CALLBACKS
  // ============================================================================

  /**
   * Save snapshot before optimistic update
   * WHY: Allows rollback on error
   */
  const saveSnapshot = useCallback(() => {
    snapshotRef.current = [...localEvents]
  }, [localEvents])

  /**
   * Rollback to snapshot on error
   */
  const rollback = useCallback(() => {
    setLocalEvents(snapshotRef.current)
  }, [])

  /**
   * Optimistically add a new event
   */
  const handleOptimisticCreate = useCallback((tempEvent: CalendarEventUI) => {
    saveSnapshot()
    setLocalEvents((prev) => [...prev, tempEvent])
  }, [saveSnapshot])

  /**
   * Optimistically update an existing event
   * WHY: Includes status field for immediate visual feedback on status changes
   */
  const handleOptimisticUpdate = useCallback((eventId: string, updates: Partial<CalendarEventInput>) => {
    saveSnapshot()
    setLocalEvents((prev) =>
      prev.map((event) =>
        event.id === eventId
          ? {
              ...event,
              ...updates,
              startDate: updates.startDate ?? event.startDate,
              endDate: updates.endDate ?? event.endDate,
              status: updates.status ?? event.status,
              updatedAt: new Date(),
            }
          : event
      )
    )
  }, [saveSnapshot])

  /**
   * Optimistically delete an event
   */
  const handleOptimisticDelete = useCallback((eventId: string) => {
    saveSnapshot()
    setLocalEvents((prev) => prev.filter((event) => event.id !== eventId))
  }, [saveSnapshot])

  /**
   * On mutation success - replace temp event with server event
   */
  const handleMutationSuccess = useCallback((serverEvent: CalendarEventUI) => {
    setLocalEvents((prev) => {
      // Find and replace temp event with server event
      const hasTempEvent = prev.some((e) => e.id.startsWith('temp-'))
      if (hasTempEvent) {
        // Replace temp events with server event
        return prev.filter((e) => !e.id.startsWith('temp-')).concat(serverEvent)
      }
      // For updates, replace the existing event
      return prev.map((e) => (e.id === serverEvent.id ? serverEvent : e))
    })
  }, [])

  /**
   * Calendar event mutations with optimistic update callbacks
   */
  const {
    createEvent,
    updateEvent,
    deleteEvent,
    isCreating,
    isUpdating,
    isDeleting,
  } = useCalendarEventMutations(activeOrganization?.id ?? '', {
    onOptimisticCreate: handleOptimisticCreate,
    onOptimisticUpdate: handleOptimisticUpdate,
    onOptimisticDelete: handleOptimisticDelete,
    onRollback: rollback,
    onSuccess: handleMutationSuccess,
  })

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /** Handle date navigation */
  const handleDateChange = useCallback((date: Date) => {
    setCurrentDate(date)
  }, [])

  /**
   * Handle event click - open dialog in edit mode
   */
  const handleEventClick = useCallback((event: CalendarEventUI) => {
    setSelectedEvent(event)
    setDialogDefaultDate(null)
    setIsDialogOpen(true)
  }, [])

  /**
   * Handle empty slot click - open dialog in create mode with pre-filled date/time
   */
  const handleSlotClick = useCallback((date: Date, hour: number) => {
    if (!hasCalendarCreate) return
    const eventDate = new Date(date)
    eventDate.setHours(hour, 0, 0, 0)
    setSelectedEvent(null)
    setDialogDefaultDate(eventDate)
    setIsDialogOpen(true)
  }, [hasCalendarCreate])

  /** Handle create event button click from header */
  const handleCreateNewEvent = useCallback(() => {
    setSelectedEvent(null)
    setDialogDefaultDate(null)
    setIsDialogOpen(true)
  }, [])

  /** Handle dialog close */
  const handleDialogClose = useCallback((open: boolean) => {
    setIsDialogOpen(open)
    if (!open) {
      setSelectedEvent(null)
      setDialogDefaultDate(null)
    }
  }, [])

  /**
   * Handle event creation from dialog
   * Uses optimistic update for instant UI feedback
   */
  const handleEventCreate = useCallback(async (eventData: {
    title: string
    description?: string
    startDate: Date
    endDate: Date
    location?: string
    meetingUrl?: string
    color: EventColor
    status: CalendarEventStatus
    leadId?: string | null
    assignedToId?: string | null
  }) => {
    try {
      await createEvent({
        title: eventData.title,
        description: eventData.description,
        startDate: eventData.startDate,
        endDate: eventData.endDate,
        location: eventData.location,
        meetingUrl: eventData.meetingUrl,
        color: eventData.color,
        status: eventData.status,
        leadId: eventData.leadId,
        assignedToId: eventData.assignedToId,
      })
      handleDialogClose(false)
    } catch (error) {
      // Error handled by mutation's onError callback
      console.error('Failed to create event:', error)
    }
  }, [createEvent, handleDialogClose])

  /**
   * Handle event update from dialog
   * Uses optimistic update for instant UI feedback
   */
  const handleEventUpdate = useCallback(async (eventId: string, eventData: {
    title: string
    description?: string
    startDate: Date
    endDate: Date
    location?: string
    meetingUrl?: string
    color: EventColor
    status: CalendarEventStatus
    leadId?: string | null
    assignedToId?: string | null
  }) => {
    try {
      await updateEvent(eventId, {
        title: eventData.title,
        description: eventData.description,
        startDate: eventData.startDate,
        endDate: eventData.endDate,
        location: eventData.location,
        meetingUrl: eventData.meetingUrl,
        color: eventData.color,
        status: eventData.status,
        leadId: eventData.leadId,
        assignedToId: eventData.assignedToId,
      })
      handleDialogClose(false)
    } catch (error) {
      console.error('Failed to update event:', error)
    }
  }, [updateEvent, handleDialogClose])

  /**
   * Handle event deletion from dialog
   * Uses optimistic update for instant UI feedback
   */
  const handleEventDelete = useCallback(async (eventId: string) => {
    try {
      await deleteEvent(eventId)
      handleDialogClose(false)
    } catch (error) {
      console.error('Failed to delete event:', error)
    }
  }, [deleteEvent, handleDialogClose])

  // ============================================================================
  // EARLY RETURNS - Loading state and permission checks
  // ============================================================================

  /**
   * Show skeleton only on initial org load
   * WHY: After initial load, cache is populated and isLoadingOrg is false
   * This means re-navigation renders instantly without skeleton
   * Uses responsive skeleton based on viewport
   */
  if (isLoadingOrg && !activeOrganization) {
    return isMobile ? <MobileCalendarSkeleton /> : <DesktopCalendarSkeleton />
  }

  /** No organization found - show error state */
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2 p-6">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  /** Permission denied - show access denied message */
  if (!hasCalendarAccess) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            You don&apos;t have permission to view the calendar
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              calendar:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  /**
   * Mobile View: Calendar picker with scrollable event list
   * Desktop View: Week grid with time slots
   */
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Global page header with breadcrumbs */}
      <div className="border-b">
        <PageHeader />
      </div>

      {/* Loading and error states */}
      {isLoadingEvents && localEvents.length === 0 ? (
        isMobile ? (
          <MobileCalendarContentSkeleton />
        ) : (
          <DesktopCalendarContentSkeleton />
        )
      ) : eventsError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-destructive">Failed to load events</div>
        </div>
      ) : isMobile ? (
        /**
         * MOBILE VIEW
         * Shows shadcn Calendar for date selection with scrollable event list below
         */
        <MobileCalendarView
          selectedDate={currentDate}
          onDateSelect={handleDateChange}
          events={localEvents}
          timezone={userTimezone}
          onEventClick={handleEventClick}
          onCreateEvent={hasCalendarCreate ? handleCreateNewEvent : undefined}
          canCreate={hasCalendarCreate}
          className="flex-1 min-h-0"
        />
      ) : (
        /**
         * DESKTOP VIEW
         * Shows week grid with time slots and header navigation
         */
        <>
          {/* Calendar header with navigation - desktop only */}
          {/* Shows timezone indicator so team member knows events are adapted to their profile timezone */}
          <CalendarHeader
            currentDate={currentDate}
            onDateChange={handleDateChange}
            onCreateEvent={hasCalendarCreate ? handleCreateNewEvent : undefined}
            timezone={userTimezone}
          />

          {/* Calendar content area - Week view */}
          {/* overflow-x-auto allows horizontal scroll on tablet-sized screens where the */}
          {/* 7-column grid (min 756px) exceeds available width */}
          <div className="flex-1 min-h-0 p-3 overflow-x-auto">
            <div className="h-full rounded-xl border overflow-hidden bg-sidebar min-w-[620px]">
              <WeekViewGrid
                currentDate={currentDate}
                events={localEvents}
                timezone={userTimezone}
                onEventClick={handleEventClick}
                onSlotClick={handleSlotClick}
              />
            </div>
          </div>
        </>
      )}

      {/* Event Dialog - Supports both create and edit modes */}
      {/* Event Dialog - Uses user's timezone for date/time display and input */}
      <EventDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        organizationId={activeOrganization.id}
        timezone={userTimezone}
        event={selectedEvent}
        defaultDate={dialogDefaultDate}
        onCreate={handleEventCreate}
        onUpdate={handleEventUpdate}
        onDelete={handleEventDelete}
        isSubmitting={isCreating || isUpdating}
        isDeleting={isDeleting}
        canEdit={hasCalendarUpdate}
        canDelete={hasCalendarDelete}
      />
    </div>
  )
}
