'use client'

/**
 * Booking Calendar Component
 *
 * WHY: Public-facing calendar picker for external users to book appointments
 * HOW: Three-column layout - info panel, calendar, time slots (Cal.com style)
 *      Left panel shows meeting info, center shows calendar, right panel slides in
 *      with time slots after date selection with a smooth animation.
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, PublicBooking, TimeSlots, Appointments
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Clock,
  User,
  Users,
  Mail,
  Phone,
  FileText,
  Loader2,
  CheckCircle,
  Video,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Globe,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { useLeadSession } from '@/hooks/use-lead-session'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Member availability info for a time slot
 * SOURCE OF TRUTH: SmartSlot type in booking-calendar.service.ts
 */
type SlotMember = {
  memberId: string
  memberName: string
  memberImage: string | null
  timezone: string
}

/**
 * Time slot with available team members
 * WHY: Shows user who they are booking with when they select a slot
 */
type TimeSlot = {
  startTime: string
  endTime: string
  /** Team members available for this slot */
  availableMembers?: SlotMember[]
}

type BookingResult = {
  id: string
  startTime: Date
  endTime: Date
  bookerName: string
  bookerEmail: string
  calendarName: string
  duration: number
  locationType: string
  locationDetails: string | null
}

type BookingCalendarPickerProps = {
  calendarId: string
  calendarName: string
  description?: string | null
  duration: number
  color?: string
  locationType?: string
  locationDetails?: string | null
  onBookingComplete?: (booking: BookingResult) => void
  className?: string
  /** Organization ID for lead session (sticky form prefill) */
  organizationId?: string
  organizationName?: string
  organizationLogo?: string | null
  /**
   * Max days ahead a booker can see/book slots
   * WHY: Controls how far into the future the calendar allows navigation/booking
   * null/undefined = unlimited (no restriction)
   * SOURCE OF TRUTH KEYWORDS: MaxBookingDays, BookingLimit, AdvanceBooking
   */
  maxBookingDays?: number | null
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTimeSlot(isoString: string, use24h: boolean = false): string {
  const date = new Date(isoString)
  if (use24h) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase()
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

/**
 * Generate Google Calendar URL for adding an event
 * WHY: Allow users to easily add the booking to their personal calendar
 *
 * @param title - Event title
 * @param startTime - Event start time (Date object)
 * @param endTime - Event end time (Date object)
 * @param description - Event description
 * @param location - Event location (optional)
 * @returns Google Calendar URL that opens the event creation page
 */
function generateGoogleCalendarUrl(
  title: string,
  startTime: Date,
  endTime: Date,
  description: string,
  location?: string
): string {
  // Format dates as YYYYMMDDTHHMMSSZ (UTC format for Google Calendar)
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatDate(startTime)}/${formatDate(endTime)}`,
    details: description,
  })

  if (location) {
    params.set('location', location)
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/**
 * Get display info for the team member(s) who will handle a time slot
 * WHY: User needs to know who they are booking with before confirming
 *
 * LOGIC:
 * - Single member available: Show their name and avatar (they will handle this booking)
 * - Multiple members available: Show generic message (system will assign one)
 * - No members: Should not happen (slots wouldn't be available)
 *
 * @param slot - Time slot with availableMembers array
 * @returns Object with display text, avatar, and whether it's a single specific person
 */
function getSlotMemberInfo(slot: TimeSlot | null): {
  displayName: string
  isSingleMember: boolean
  memberName?: string
  memberImage?: string | null
} {
  if (!slot?.availableMembers || slot.availableMembers.length === 0) {
    return { displayName: 'Team member', isSingleMember: false }
  }

  if (slot.availableMembers.length === 1) {
    // Single team member - show their name and image
    const member = slot.availableMembers[0]
    return {
      displayName: member.memberName,
      isSingleMember: true,
      memberName: member.memberName,
      memberImage: member.memberImage,
    }
  }

  // Multiple team members available - don't let user choose
  return {
    displayName: 'A team member',
    isSingleMember: false,
  }
}

// ============================================================================
// BOOKING STEPS
// ============================================================================

type BookingStep = 'select-datetime' | 'enter-details' | 'confirmation'

// ============================================================================
// INITIAL LOADING SKELETON
// ============================================================================

/**
 * BookingCalendarSkeleton
 * Shows a loading skeleton for the left panel (meeting info) and center panel (calendar)
 * The right panel (time slots) is intentionally hidden during initial load
 * Uses inline-flex to fit content and stay centered
 */
function BookingCalendarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      // Full width on mobile, fit content on desktop
      'flex flex-col bg-muted/60 rounded-2xl overflow-hidden',
      'w-full lg:inline-flex lg:w-auto',
      'max-w-full',
      className
    )}>
      <div className="flex flex-col lg:flex-row">
        {/* Left Panel Skeleton - fixed width on desktop, full width on mobile */}
        <div className="w-full lg:w-72 lg:h-[500px] p-4 sm:p-6 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border/50">
          {/* Avatar skeleton */}
          <Skeleton className="w-10 h-10 rounded-full mb-4" />
          {/* Org name skeleton */}
          <Skeleton className="h-4 w-24 mb-2" />
          {/* Title skeleton */}
          <Skeleton className="h-6 w-40 mb-4" />
          {/* Details skeleton */}
          <div className="space-y-3 mt-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>

        {/* Center Panel - Calendar Skeleton with fixed width on desktop */}
        <div className="w-full lg:w-[400px] lg:h-[500px] p-4 sm:p-6 flex-shrink-0">
          {/* Calendar Header skeleton */}
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>

          {/* Day Headers skeleton */}
          <div className="grid grid-cols-7 mb-2">
            {DAY_NAMES.map((day) => (
              <div key={day} className="text-center py-2">
                <Skeleton className="h-3 w-8 mx-auto" />
              </div>
            ))}
          </div>

          {/* Calendar Grid skeleton */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-square rounded-lg"
                style={{
                  // Staggered animation for a wave effect
                  animationDelay: `${(i % 7) * 30 + Math.floor(i / 7) * 50}ms`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BookingCalendarPicker({
  calendarId,
  calendarName,
  description,
  duration,
  locationType = 'google_meet',
  onBookingComplete,
  className,
  organizationId,
  organizationName,
  maxBookingDays,
}: BookingCalendarPickerProps) {
  const [step, setStep] = useState<BookingStep>('select-datetime')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [use24h, setUse24h] = useState(false)

  // State for controlling right panel visibility with animation
  // showTimeSlotsPanel controls whether the panel is rendered
  // animateTimeSlotsPanel controls the CSS transition state
  const [showTimeSlotsPanel, setShowTimeSlotsPanel] = useState(false)
  const [animateTimeSlotsPanel, setAnimateTimeSlotsPanel] = useState(false)

  // Calendar navigation state
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())

  // Booker details form
  const [bookerName, setBookerName] = useState('')
  const [bookerEmail, setBookerEmail] = useState('')
  const [bookerPhone, setBookerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null)

  /**
   * Lead Session Hook for Sticky Form Prefill
   * WHY: If visitor has previously submitted a form, prefill their info
   * HOW: Uses lead session token stored in browser to identify returning visitors
   *
   * SOURCE OF TRUTH: Same pattern used in form-renderer.tsx for sticky form prefill
   */
  const leadSession = useLeadSession(organizationId || '')

  // Destructure for convenience in other parts of the component
  // Note: leadId is obtained from identify() result during submission, not from session state
  const { isLoading: isLoadingLeadSession, identify } = leadSession

  /**
   * Prefill form fields with lead data when session is identified
   * WHY: Better UX - returning visitors don't need to re-enter their info
   *
   * IMPORTANT: This effect mirrors the form-renderer.tsx implementation:
   * - Check organizationId first (lead session requires it)
   * - Check isIdentified and lead existence
   * - Do NOT include current form values (bookerName, etc.) in dependency array
   *   to avoid stale closure issues and unnecessary re-runs
   *
   * SOURCE OF TRUTH: Same pattern as form-renderer.tsx LEAD SESSION PREFILL
   */
  useEffect(() => {
    // Skip if no organization ID (lead session won't work without it)
    if (!organizationId) {
      return
    }

    // Skip if lead session not identified or no lead data
    if (!leadSession.isIdentified || !leadSession.lead) {
      return
    }

    const { lead } = leadSession

    // Prefill name (combine firstName and lastName)
    if (lead.firstName || lead.lastName) {
      const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ')
      setBookerName(fullName)
    }

    // Prefill email
    if (lead.email) {
      setBookerEmail(lead.email)
    }

    // Prefill phone
    if (lead.phone) {
      setBookerPhone(lead.phone)
    }
  }, [organizationId, leadSession.isIdentified, leadSession.lead])

  // Get user timezone - must be defined before queries that use it
  const userTimezone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }, [])

  /**
   * Calculate the maximum bookable date based on maxBookingDays setting
   * WHY: Used to prevent navigating to months entirely beyond the booking window
   * and to visually distinguish dates that are out of the booking range.
   * null = no limit (unrestricted forward navigation)
   *
   * SOURCE OF TRUTH KEYWORDS: MaxBookingDays, BookingLimit, AdvanceBooking
   */
  const maxBookableDate = useMemo(() => {
    if (maxBookingDays == null) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + maxBookingDays)
    return maxDate
  }, [maxBookingDays])

  // Query available dates
  // WHY: Always fetch fresh data to reflect current team member availability
  const availableDatesQuery = trpc.bookingCalendar.getAvailableDates.useQuery(
    {
      calendarId,
      year: viewYear,
      month: viewMonth + 1,
    },
    {
      staleTime: 0, // Always refetch to get current availability
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    }
  )

  // Query available time slots
  // WHY: Always fetch fresh data to reflect current team member availability
  const availableSlotsQuery = trpc.bookingCalendar.getAvailableSlots.useQuery(
    { calendarId, date: selectedDate!, bookerTimezone: userTimezone },
    {
      enabled: !!selectedDate,
      staleTime: 0, // Always refetch to get current availability
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    }
  )

  // Extract slots and team timezones from the query response
  const availableSlots = availableSlotsQuery.data?.slots ?? []
  const teamTimezones = availableSlotsQuery.data?.teamTimezones ?? []

  // Check if booker's timezone differs from all team member timezones
  // WHY: Only show timezone note when there's an actual timezone conversion happening
  const showTimezoneNote = teamTimezones.length > 0 && !teamTimezones.includes(userTimezone)

  const createBookingMutation = trpc.bookingCalendar.createPublicBooking.useMutation()

  /**
   * Effect: Animate the time slots panel in/out
   * When a date is selected and slots are loaded, show the panel with animation
   * Uses a two-step animation: first render the element, then trigger CSS transition
   */
  useEffect(() => {
    if (selectedDate) {
      // Show the panel container first
      setShowTimeSlotsPanel(true)
      // Trigger the slide-in animation after a brief delay for the DOM to update
      const timer = setTimeout(() => {
        setAnimateTimeSlotsPanel(true)
      }, 50)
      return () => clearTimeout(timer)
    } else {
      // Animate out first, then remove from DOM
      setAnimateTimeSlotsPanel(false)
      const timer = setTimeout(() => {
        setShowTimeSlotsPanel(false)
      }, 300) // Match the CSS transition duration
      return () => clearTimeout(timer)
    }
  }, [selectedDate])

  // Check if a date is available
  // WHY: Returns true only if date is explicitly in the availableDates array from backend
  // Returns false if data is loading/fetching to prevent showing dates as available during refresh
  const isDateAvailable = useCallback((year: number, month: number, day: number) => {
    // If data is loading or refetching, treat as unavailable to prevent false positives
    if (!availableDatesQuery.data || availableDatesQuery.isFetching) return false
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return availableDatesQuery.data.includes(dateStr)
  }, [availableDatesQuery.data, availableDatesQuery.isFetching])

  // Check if date is today
  const isToday = useCallback((year: number, month: number, day: number) => {
    const today = new Date()
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  }, [])

  // Check if date is selected
  const isSelected = useCallback((year: number, month: number, day: number) => {
    if (!selectedDate) return false
    return selectedDate.getFullYear() === year &&
           selectedDate.getMonth() === month &&
           selectedDate.getDate() === day
  }, [selectedDate])

  // Navigate months
  const goToPrevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }, [viewMonth])

  const goToNextMonth = useCallback(() => {
    /**
     * Prevent navigating to months entirely beyond the max booking window
     * WHY: No point showing a month with zero bookable dates
     */
    if (maxBookableDate) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear
      // Block if the first day of next month is beyond the max bookable date
      if (new Date(nextYear, nextMonth, 1) > maxBookableDate) {
        return
      }
    }

    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }, [viewMonth, viewYear, maxBookableDate])

  /**
   * Determine if the next month navigation arrow should be disabled
   * WHY: Visually indicate that forward navigation is blocked when maxBookingDays is set
   */
  const isNextMonthDisabled = useMemo(() => {
    if (!maxBookableDate) return false
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear
    return new Date(nextYear, nextMonth, 1) > maxBookableDate
  }, [viewMonth, viewYear, maxBookableDate])

  // Handle date selection
  const handleDateSelect = useCallback((day: number) => {
    const newDate = new Date(viewYear, viewMonth, day)
    setSelectedDate(newDate)
    setSelectedSlot(null)
  }, [viewYear, viewMonth])

  const handleSlotSelect = useCallback((slot: TimeSlot) => {
    setSelectedSlot(slot)
  }, [])

  const handleContinue = useCallback(() => {
    if (selectedDate && selectedSlot) {
      setStep('enter-details')
    }
  }, [selectedDate, selectedSlot])

  const handleSubmit = useCallback(async () => {
    if (!selectedSlot || !bookerName || !bookerEmail) return

    try {
      /**
       * STEP 1: Identify the lead FIRST before creating the booking
       * WHY: This creates/updates the lead and gives us the leadId to link to the booking
       * The lead will then appear in the Leads section AND on the calendar event view
       *
       * If the lead already exists with the same email but different info, it will be updated.
       * This is the same pattern used by form submissions for consistency.
       */
      const nameParts = bookerName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const identifyResult = await identify(bookerEmail, {
        firstName,
        lastName,
        phone: bookerPhone || undefined,
        source: 'booking',
      })

      /**
       * STEP 2: Create the booking with the lead linked
       * WHY: Links the lead as an attendee on the calendar event for tracking and display
       * The leadId from identify() ensures the booking is connected to the lead record
       *
       * Also pass bookerTimezone for slot verification
       * WHY: Backend needs to verify slot using same timezone as display
       */
      const result = await createBookingMutation.mutateAsync({
        calendarId,
        startTime: new Date(selectedSlot.startTime),
        bookerName,
        bookerEmail,
        bookerPhone: bookerPhone || null,
        notes: notes || null,
        leadId: identifyResult.success && identifyResult.leadId ? identifyResult.leadId : null,
        bookerTimezone: userTimezone,
      })

      const booking: BookingResult = {
        id: result.booking.id,
        startTime: new Date(result.booking.startTime),
        endTime: new Date(result.booking.endTime),
        bookerName: result.booking.bookerName,
        bookerEmail: result.booking.bookerEmail,
        calendarName: result.booking.calendarName,
        duration: result.booking.duration,
        locationType: result.booking.locationType,
        locationDetails: result.booking.locationDetails,
      }

      setBookingResult(booking)
      setStep('confirmation')
      trackEvent(CLARITY_EVENTS.APPOINTMENT_BOOKED)
      onBookingComplete?.(booking)
    } catch (error) {
      console.error('Booking failed:', error)
    }
  }, [selectedSlot, bookerName, bookerEmail, bookerPhone, notes, calendarId, createBookingMutation, onBookingComplete, userTimezone, identify])

  const handleBack = useCallback(() => {
    if (step === 'enter-details') {
      setStep('select-datetime')
    }
  }, [step])

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
    const days: (number | null)[] = []

    // Add empty cells for days before the first day
    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }

    return days
  }, [viewYear, viewMonth])

  // Show initial loading skeleton when calendar data hasn't loaded yet
  // This provides a smooth loading experience before any dates are available
  const isInitialLoading = availableDatesQuery.isLoading && !availableDatesQuery.data

  if (isInitialLoading && step === 'select-datetime') {
    return <BookingCalendarSkeleton className={className} />
  }

  // Determine if we're showing the calendar view (needs wider layout for time slots)
  const isCalendarView = step === 'select-datetime'
  const isFormView = step === 'enter-details'

  // Width should be wider when showing calendar + time slots, narrower for form
  const showWideLayout = isCalendarView && showTimeSlotsPanel

  return (
    <div
      className={cn(
        // Full width on mobile, fit content on desktop for centered animation
        'flex flex-col bg-muted/60 rounded-2xl overflow-hidden',
        'w-full lg:inline-flex lg:w-auto',
        'transition-all duration-500 ease-out',
        'max-w-full',
        className
      )}
    >
      {/* Main layout for select-datetime and enter-details steps */}
      {(isCalendarView || isFormView) && (
        <div className="flex flex-col lg:flex-row">
          {/* Left Panel - Meeting Info (always visible) */}
          {/* border-b on mobile, border-r on desktop for visual separation */}
          {/* Height matches content area for consistent layout */}
          <div className="w-full lg:w-72 lg:h-[500px] p-6 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border/50 flex flex-col">
            {/* Top content */}
            <div className="flex-1">
              {/* Mobile: horizontal layout for meeting info to save vertical space */}
              {/* Desktop: vertical stacked layout */}
              <div className="flex items-start gap-4 lg:block">
                {/* Organization Avatar */}
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0 lg:mb-4">
                  {organizationName?.charAt(0).toUpperCase() || 'M'}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Organization Name */}
                  <p className="text-sm text-muted-foreground mb-1">{organizationName || 'Organization'}</p>

                  {/* Meeting Title */}
                  <h2 className="text-xl font-semibold">{calendarName}</h2>

                  {/* Description */}
                  {description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              {/* Meeting Details - row on mobile, column on desktop */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-y-3 text-sm text-muted-foreground mt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{duration}m</span>
                </div>
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  <span>{locationType === 'google_meet' ? 'Google Meet' : 'Video Call'}</span>
                </div>
                {/* Timezone indicator - shows user's timezone prominently */}
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span className="truncate" title={userTimezone}>
                    {userTimezone.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {/**
               * Team Member Display
               * WHY: Shows who the user is booking with after selecting a time slot
               *
               * LOGIC:
               * - Only shows when a slot is selected (selectedSlot exists)
               * - Single member: Shows name and avatar (they will handle this booking)
               * - Multiple members: Shows generic message (system assigns one)
               */}
              {selectedSlot && (() => {
                const memberInfo = getSlotMemberInfo(selectedSlot)
                return (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-3">
                      {memberInfo.isSingleMember && memberInfo.memberImage ? (
                        // Show team member avatar if available
                        <img
                          src={memberInfo.memberImage}
                          alt={memberInfo.memberName || 'Team member'}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        // Show icon placeholder for multiple members or no image
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          {memberInfo.isSingleMember ? (
                            <User className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Users className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {memberInfo.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {memberInfo.isSingleMember ? 'will be your host' : 'will be assigned'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })()}

            </div>

            {/* Timezone Note - only shown when booker's timezone differs from team */}
            {showTimezoneNote && (
              <p className="text-[11px] text-muted-foreground/70 pt-4">
                Times adjusted to {userTimezone.split('/').pop()?.replace(/_/g, ' ')}
              </p>
            )}
          </div>

          {/* Right Content Area - contains either Calendar+TimeSlots OR Form */}
          {/* Uses relative positioning for stacked transition animations */}
          {/* Fixed height on desktop to prevent layout shifts, auto on mobile so */}
          {/* stacked calendar + time slots don't get clipped */}
          <div className="flex-1 relative overflow-hidden h-auto lg:h-[500px]">

            {/* Calendar View (Calendar + Time Slots) */}
            {/* Transitions out to the left when form is shown */}
            <div
              className={cn(
                'flex flex-col lg:flex-row h-full',
                'transition-all duration-500 ease-out',
                isCalendarView
                  ? 'opacity-100 translate-x-0 relative'
                  : 'opacity-0 -translate-x-8 absolute inset-0 pointer-events-none'
              )}
            >
              {/* Calendar Panel - full width on mobile, fixed width on desktop */}
              <div className="w-full lg:w-[400px] p-4 sm:p-6 flex-shrink-0">
                {/* Calendar Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-medium">
                    {MONTH_NAMES[viewMonth]}{' '}
                    <span className="text-muted-foreground">{viewYear}</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={goToPrevMonth}
                      className="h-8 w-8"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={goToNextMonth}
                      className="h-8 w-8"
                      disabled={isNextMonthDisabled}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 mb-2">
                  {DAY_NAMES.map((day) => (
                    <div
                      key={day}
                      className="text-center text-xs font-medium text-muted-foreground py-2"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                {/* Show skeleton during initial load OR refetch (e.g., window focus) */}
                {availableDatesQuery.isLoading || availableDatesQuery.isFetching ? (
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 35 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-square rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, index) => {
                      if (day === null) {
                        return <div key={`empty-${index}`} className="aspect-square" />
                      }

                      const available = isDateAvailable(viewYear, viewMonth, day)
                      const today = isToday(viewYear, viewMonth, day)
                      const selected = isSelected(viewYear, viewMonth, day)

                      return (
                        <button
                          key={day}
                          onClick={() => available && handleDateSelect(day)}
                          disabled={!available}
                          className={cn(
                            'aspect-square rounded-lg text-sm font-medium transition-colors relative flex items-center justify-center',
                            // Base styles
                            !available && 'text-muted-foreground/40 cursor-not-allowed',
                            // Available but not selected
                            available && !selected && 'bg-muted hover:bg-muted/80 text-foreground',
                            // Selected state
                            selected && 'ring-2 ring-foreground bg-transparent',
                            // Today indicator
                            today && !selected && 'ring-1 ring-primary'
                          )}
                        >
                          {day}
                          {/* Selected dot indicator */}
                          {selected && (
                            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-foreground" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Time Slots Panel (inside Calendar View) */}
              {/* On desktop: width animates from 0 to 288px. On mobile: height animates. */}
              <div
                className={cn(
                  'flex-shrink-0 overflow-hidden flex flex-col',
                  'transition-all duration-500 ease-out',
                  showTimeSlotsPanel && isCalendarView
                    ? 'w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-border/50'
                    : 'lg:w-0 max-h-0 lg:max-h-none border-0',
                  // Expand max-height on mobile when panel is visible
                  showTimeSlotsPanel && isCalendarView && 'max-h-[400px] lg:max-h-none'
                )}
              >
                {/* Inner content wrapper with flex layout for sticky footer */}
                <div
                  className={cn(
                    'lg:min-w-[288px] h-full flex flex-col transition-opacity duration-300',
                    animateTimeSlotsPanel ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  {/* Time Slots Header */}
                  <div className="flex items-center justify-between p-6 pb-2">
                    <h3 className="text-sm font-medium">
                      {selectedDate?.toLocaleDateString('en-US', { weekday: 'short' })}{' '}
                      <span className="text-muted-foreground">
                        {selectedDate?.getDate()}
                      </span>
                    </h3>

                    {/* 12h/24h Toggle */}
                    <div className="flex items-center bg-muted rounded-lg p-0.5 text-xs">
                      <button
                        onClick={() => setUse24h(false)}
                        className={cn(
                          'px-2 py-1 rounded-md transition-colors',
                          !use24h ? 'bg-background shadow-sm' : 'text-muted-foreground'
                        )}
                      >
                        12h
                      </button>
                      <button
                        onClick={() => setUse24h(true)}
                        className={cn(
                          'px-2 py-1 rounded-md transition-colors',
                          use24h ? 'bg-background shadow-sm' : 'text-muted-foreground'
                        )}
                      >
                        24h
                      </button>
                    </div>
                  </div>

                  {/* Time Slots List with fade effect */}
                  <MarqueeFade
                    className="flex-1 overflow-hidden"
                    showBottomFade={!!selectedSlot}
                    fadeHeight={32}
                  >
                    <div className="space-y-2 h-full overflow-y-auto px-6 pb-4">
                      {/* Show skeleton during initial load OR refetch (e.g., window focus) */}
                      {availableSlotsQuery.isLoading || availableSlotsQuery.isFetching ? (
                        <>
                          {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton
                              key={i}
                              className="h-11 w-full rounded-lg"
                              style={{ animationDelay: `${i * 50}ms` }}
                            />
                          ))}
                        </>
                      ) : availableSlots.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No available times
                        </p>
                      ) : (
                        <>
                          {availableSlots.map((slot, index) => {
                            const isSelected = selectedSlot?.startTime === slot.startTime

                            return (
                              <button
                                key={slot.startTime}
                                onClick={() => handleSlotSelect(slot)}
                                className={cn(
                                  'w-full rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 py-2.5 px-3',
                                  'animate-in fade-in slide-in-from-right-2',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/60 hover:bg-muted text-foreground'
                                )}
                                style={{
                                  animationDelay: `${index * 30}ms`,
                                  animationFillMode: 'backwards'
                                }}
                              >
                                {/* Time with availability indicator - minimal display */}
                                <span className={cn(
                                  'w-2 h-2 rounded-full',
                                  isSelected ? 'bg-primary-foreground/70' : 'bg-emerald-500'
                                )} />
                                <span className="font-medium">{formatTimeSlot(slot.startTime, use24h)}</span>
                              </button>
                            )
                          })}
                        </>
                      )}
                    </div>
                  </MarqueeFade>

                  {/* Sticky Footer - Continue Button */}
                  <div
                    className={cn(
                      'p-6 pt-2 transition-all duration-300',
                      selectedSlot
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-4 pointer-events-none h-0 p-0 overflow-hidden'
                    )}
                  >
                    <Button
                      onClick={handleContinue}
                      className="w-full"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            {/* End of Calendar View */}

            {/* Form View - Enter Details */}
            {/* Transitions in from the right when calendar view transitions out */}
            <div
              className={cn(
                'w-full lg:w-[400px] flex-shrink-0 min-h-[480px] lg:h-full flex flex-col',
                'transition-all duration-500 ease-out',
                isFormView
                  ? 'opacity-100 translate-x-0 relative'
                  : 'opacity-0 translate-x-8 absolute inset-0 pointer-events-none'
              )}
            >
              {/* Header with back button - fixed at top */}
              <div className="flex items-center gap-2 p-6 pb-2">
                <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h3 className="font-medium">Enter Your Details</h3>
              </div>

              {/* Scrollable form content with fade effect */}
              <MarqueeFade
                className="flex-1 overflow-hidden"
                showBottomFade={true}
                fadeHeight={32}
              >
                <div className="h-full overflow-y-auto px-6 pb-4">
                  {/* Selected time summary */}
                  <div className="bg-muted/50 rounded-lg p-4 mb-6">
                    <p className="font-medium">{calendarName}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedDate?.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}{' '}
                      at {selectedSlot && formatTimeSlot(selectedSlot.startTime, use24h)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {duration}m · {locationType === 'google_meet' ? 'Google Meet' : 'Video Call'}
                    </p>
                  </div>

                  {/* Form fields - shows shimmer while lead session is loading */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        Name *
                      </Label>
                      <div className="relative">
                        <Input
                          id="name"
                          value={bookerName}
                          onChange={(e) => setBookerName(e.target.value)}
                          placeholder="Your full name"
                          disabled={isLoadingLeadSession}
                          autoComplete="name"
                        />
                        {isLoadingLeadSession && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/60 to-transparent animate-shimmer rounded-md" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        Email *
                      </Label>
                      <div className="relative">
                        <Input
                          id="email"
                          type="email"
                          value={bookerEmail}
                          onChange={(e) => setBookerEmail(e.target.value)}
                          placeholder="your@email.com"
                          disabled={isLoadingLeadSession}
                          autoComplete="email"
                        />
                        {isLoadingLeadSession && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/60 to-transparent animate-shimmer rounded-md" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        Phone (optional)
                      </Label>
                      <div className="relative">
                        <Input
                          id="phone"
                          type="tel"
                          value={bookerPhone}
                          onChange={(e) => setBookerPhone(e.target.value)}
                          placeholder="+1 (555) 123-4567"
                          disabled={isLoadingLeadSession}
                          autoComplete="tel"
                        />
                        {isLoadingLeadSession && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/60 to-transparent animate-shimmer rounded-md" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes" className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Notes (optional)
                      </Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Anything you'd like us to know..."
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              </MarqueeFade>

              {/* Sticky Footer - Submit Button */}
              <div className="p-6 pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={!bookerName || !bookerEmail || createBookingMutation.isPending}
                  className="w-full"
                >
                  {createBookingMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    'Confirm Booking'
                  )}
                </Button>

                {createBookingMutation.isError && (
                  <p className="text-sm text-destructive text-center mt-2">
                    {createBookingMutation.error?.message || 'Failed to create booking.'}
                  </p>
                )}
              </div>
            </div>
            {/* End of Form View */}

          </div>
          {/* End of Right Content Area */}
        </div>
      )}

      {/* Step: Confirmation - matches the minimal modern theme */}
      {step === 'confirmation' && bookingResult && (
        <div className="flex flex-col lg:flex-row">
          {/* Left Panel - Meeting Info (matches booking flow) */}
          <div className="w-full lg:w-72 lg:h-[500px] p-4 sm:p-6 shrink-0 border-b lg:border-b-0 lg:border-r border-border/50 flex flex-col">
            <div className="flex-1">
              {/* Organization Avatar */}
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold mb-4">
                {organizationName?.charAt(0).toUpperCase() || 'M'}
              </div>

              {/* Organization Name */}
              <p className="text-sm text-muted-foreground mb-1">{organizationName || 'Organization'}</p>

              {/* Meeting Title */}
              <h2 className="text-xl font-semibold">{bookingResult.calendarName}</h2>

              {/* Meeting Details */}
              <div className="space-y-3 text-sm text-muted-foreground mt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{bookingResult.duration}m</span>
                </div>
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  <span>{bookingResult.locationType === 'google_meet' ? 'Google Meet' : 'Video Call'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span className="truncate" title={userTimezone}>
                    {userTimezone.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Confirmation Details */}
          <div className="flex-1 p-6 lg:w-[400px] flex flex-col">
            {/* Success indicator - subtle and minimal */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold">Confirmed</h3>
                <p className="text-xs text-muted-foreground">Your meeting is scheduled</p>
              </div>
            </div>

            {/* Booking details card */}
            <div className="space-y-4 flex-1">
              {/* Date & Time - prominent display */}
              <div className="bg-muted/40 rounded-xl p-4">
                <div className="text-2xl font-semibold">
                  {bookingResult.startTime.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="text-lg text-muted-foreground mt-1">
                  {bookingResult.startTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: !use24h,
                    timeZone: userTimezone,
                  })}
                  {' – '}
                  {bookingResult.endTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: !use24h,
                    timeZone: userTimezone,
                  })}
                </div>
                {/* Timezone indicator */}
                <p className="text-xs text-muted-foreground/70 mt-2">
                  {userTimezone.split('/').pop()?.replace(/_/g, ' ')}
                </p>
              </div>

              {/* Attendee info */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{bookingResult.bookerName}</p>
                    <p className="text-xs text-muted-foreground">{bookingResult.bookerEmail}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Add to Google Calendar button */}
            <div className="pt-4 mt-4 border-t border-border/50">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  const calendarUrl = generateGoogleCalendarUrl(
                    `${calendarName} with ${organizationName}`,
                    bookingResult.startTime,
                    bookingResult.endTime,
                    `Meeting with ${organizationName}\n\nBooked by: ${bookingResult.bookerName} (${bookingResult.bookerEmail})`,
                    bookingResult.locationType === 'google_meet' ? 'Google Meet' : undefined
                  )
                  window.open(calendarUrl, '_blank')
                }}
              >
                <Calendar className="h-4 w-4" />
                Add to Google Calendar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BookingCalendarPicker
