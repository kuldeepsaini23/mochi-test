'use client'

/**
 * Calendar Header Component
 *
 * WHY: Provide navigation controls for the week view calendar
 * HOW: Displays current week date range, navigation arrows, today button, and new event button
 *
 * FEATURES:
 * - Navigate to previous/next week
 * - Jump to today
 * - Create new event button
 *
 * Search Keywords: SOURCE OF TRUTH, CALENDAR HEADER, NAVIGATION, WEEK VIEW
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus, Globe } from 'lucide-react'
import { FeatureGate } from '@/components/feature-gate'

/**
 * Format the week date range for display in the header
 * Shows "January 2024" if same month, or "Dec 2023 - Jan 2024" if spanning months
 */
function formatWeekRange(currentDate: Date): string {
  // Get start and end of week
  const startOfWeek = new Date(currentDate)
  const dayOfWeek = startOfWeek.getDay()
  startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek)

  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)

  const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }

  // If same month, show "January 2024"
  if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
    return startOfWeek.toLocaleDateString('en-US', options)
  }

  // If different months, show "Dec 2023 - Jan 2024"
  const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return `${startMonth} - ${endMonth}`
}

type CalendarHeaderProps = {
  /** Current date being displayed */
  currentDate: Date
  /** Handler to change the current date */
  onDateChange: (date: Date) => void
  /** Handler to create a new event */
  onCreateEvent?: () => void
  /** User's timezone for display (IANA format, e.g., "America/New_York") */
  timezone?: string
  /** Additional CSS classes */
  className?: string
}

export function CalendarHeader({
  currentDate,
  onDateChange,
  onCreateEvent,
  timezone,
  className,
}: CalendarHeaderProps) {
  const dateRangeText = useMemo(
    () => formatWeekRange(currentDate),
    [currentDate]
  )

  /** Navigate to previous week */
  const handlePrevious = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() - 7)
    onDateChange(newDate)
  }

  /** Navigate to next week */
  const handleNext = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + 7)
    onDateChange(newDate)
  }

  /** Jump to today */
  const handleToday = () => {
    onDateChange(new Date())
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3 border-b bg-background',
        className
      )}
    >
      {/* Left section - Navigation and date display */}
      {/* gap-2 and flex-wrap so controls wrap gracefully on narrow screens */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Today button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleToday}
          className="h-8"
        >
          Today
        </Button>

        {/* Navigation arrows */}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevious}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous week</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next week</span>
          </Button>
        </div>

        {/* Current date range - truncate on narrow screens */}
        <h2 className="text-base lg:text-lg font-semibold truncate">{dateRangeText}</h2>

        {/* Timezone indicator - shows user's timezone so they know times are adapted */}
        {timezone && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-md text-xs text-muted-foreground"
            title={`Events shown in ${timezone}`}
          >
            <Globe className="h-3 w-3" />
            <span>{timezone.split('/').pop()?.replace(/_/g, ' ')}</span>
          </div>
        )}
      </div>

      {/* Right section - Create event button (only if user has permission) */}
      {/* FeatureGate intercepts click and shows upgrade modal when calendar limit is reached */}
      {onCreateEvent && (
        <FeatureGate feature="calendars.limit">
          <Button
            size="sm"
            onClick={onCreateEvent}
            className="h-8 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Event</span>
          </Button>
        </FeatureGate>
      )}
    </div>
  )
}
