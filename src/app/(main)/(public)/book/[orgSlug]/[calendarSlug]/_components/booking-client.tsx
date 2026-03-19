'use client'

/**
 * Booking Client Component
 *
 * WHY: Renders the public booking calendar picker with organization branding
 * HOW: Simple wrapper that passes data to BookingCalendarPicker
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, PublicBooking, BookingClient
 */

import { useState, useMemo } from 'react'
import { BookingCalendarPicker } from '@/components/booking'
import { CheckCircle, Clock, Video, Globe, User, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

type Availability = {
  dayOfWeek: number
  startTime: string
  endTime: string
  isEnabled: boolean
}

type CalendarData = {
  id: string
  name: string
  description: string | null
  duration: number
  color: string
  locationType: string
  locationDetails: string | null
  availability: Availability[]
  /**
   * Max days ahead a booker can see/book slots
   * WHY: Limits advance booking window on the public calendar
   * null = unlimited (no restriction)
   * SOURCE OF TRUTH KEYWORDS: MaxBookingDays, BookingLimit
   */
  maxBookingDays?: number | null
}

type OrganizationData = {
  id: string
  name: string
  logo: string | null
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

type BookingClientProps = {
  organization: OrganizationData
  calendar: CalendarData
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BookingClient({ organization, calendar }: BookingClientProps) {
  const [bookingComplete, setBookingComplete] = useState(false)
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null)

  /**
   * Get user's timezone for proper time display
   * WHY: Times should be shown in the booker's local timezone
   */
  const userTimezone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }, [])

  const handleBookingComplete = (result: BookingResult) => {
    setBookingResult(result)
    setBookingComplete(true)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full">
        {bookingComplete && bookingResult ? (
          /**
           * Confirmation State - Minimal Modern Design
           * WHY: Match the booking calendar's clean aesthetic
           * Layout: Two-panel design matching the booking flow
           */
          <div className="flex justify-center">
            <div className={cn(
              'flex flex-col lg:flex-row bg-muted/60 rounded-2xl overflow-hidden',
              'w-full lg:inline-flex lg:w-auto max-w-full'
            )}>
              {/* Left Panel - Meeting Info */}
              <div className="w-full lg:w-72 p-6 shrink-0 border-b lg:border-b-0 lg:border-r border-border/50 flex flex-col">
                <div className="flex-1">
                  {/* Organization Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold mb-4">
                    {organization.name?.charAt(0).toUpperCase() || 'M'}
                  </div>

                  {/* Organization Name */}
                  <p className="text-sm text-muted-foreground mb-1">{organization.name}</p>

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

                {/* Booking details */}
                <div className="space-y-4 flex-1">
                  {/* Date & Time - prominent display */}
                  <div className="bg-muted/40 rounded-xl p-4">
                    <div className="text-2xl font-semibold">
                      {bookingResult.startTime.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        timeZone: userTimezone,
                      })}
                    </div>
                    <div className="text-lg text-muted-foreground mt-1">
                      {bookingResult.startTime.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                        timeZone: userTimezone,
                      })}
                      {' – '}
                      {bookingResult.endTime.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
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
                        `${bookingResult.calendarName} with ${organization.name}`,
                        bookingResult.startTime,
                        bookingResult.endTime,
                        `Meeting with ${organization.name}\n\nBooked by: ${bookingResult.bookerName} (${bookingResult.bookerEmail})`,
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
          </div>
        ) : (
          // Booking Calendar - centered with flex
          <div className="w-full flex justify-center">
            <BookingCalendarPicker
              calendarId={calendar.id}
              calendarName={calendar.name}
              description={calendar.description}
              duration={calendar.duration}
              color={calendar.color}
              locationType={calendar.locationType}
              locationDetails={calendar.locationDetails}
              onBookingComplete={handleBookingComplete}
              organizationId={organization.id}
              organizationName={organization.name}
              organizationLogo={organization.logo}
              /** Pass max booking days for frontend UX (prevents forward nav past limit) */
              maxBookingDays={calendar.maxBookingDays}
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by{' '}
            <span className="font-medium text-foreground">Mochi</span>
          </p>
        </div>
      </div>
    </div>
  )
}
