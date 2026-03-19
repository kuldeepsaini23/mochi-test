'use client'

/**
 * Calendar List Client Component
 *
 * WHY: Displays all available booking calendars for an organization
 * HOW: Shows cards for each calendar with links to individual booking pages
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, CalendarList, PublicBooking
 */

import Image from 'next/image'
import Link from 'next/link'
import { Clock, Video, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

type CalendarData = {
  id: string
  name: string
  slug: string
  description: string | null
  duration: number
  color: string
  locationType: string
}

type OrganizationData = {
  name: string
  logo: string | null
}

type CalendarListClientProps = {
  organization: OrganizationData
  calendars: CalendarData[]
  orgSlug: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get color class for calendar accent
 */
function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    pink: 'bg-pink-500',
    yellow: 'bg-amber-500',
    gray: 'bg-gray-500',
  }
  return colorMap[color] || colorMap.blue
}

/**
 * Format duration for display
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CalendarListClient({
  organization,
  calendars,
  orgSlug,
}: CalendarListClientProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Page Container */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        {/* Organization Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            {organization.logo ? (
              <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-full overflow-hidden border bg-background">
                <Image
                  src={organization.logo}
                  alt={organization.name}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-2xl">
                {organization.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold">{organization.name}</h1>
          <p className="text-muted-foreground mt-2">
            Select a booking type to schedule an appointment
          </p>
        </div>

        {/* Calendars List */}
        {calendars.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No booking calendars are currently available.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {calendars.map((calendar) => (
              <Link
                key={calendar.id}
                href={`/book/${orgSlug}/${calendar.slug}`}
                className="block group"
              >
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={cn(
                        'w-1 h-10 rounded-full shrink-0',
                        getColorClass(calendar.color)
                      )}
                    />
                    <div className="min-w-0">
                      <h3 className="font-medium group-hover:text-primary transition-colors truncate">
                        {calendar.name}
                      </h3>
                      {calendar.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                          {calendar.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(calendar.duration)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Video className="h-3.5 w-3.5" />
                          {calendar.locationType === 'google_meet' ? 'Google Meet' : 'Video Call'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by{' '}
            <span className="font-medium text-foreground">Mochi</span>
          </p>
        </div>
      </div>
    </div>
  )
}
