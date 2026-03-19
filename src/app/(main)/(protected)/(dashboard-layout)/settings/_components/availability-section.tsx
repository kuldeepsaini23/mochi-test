'use client'

/**
 * Availability Settings Section
 *
 * WHY: Allows users to set their personal working hours for booking calendars
 * HOW: Weekly schedule editor with time ranges per day
 *
 * SOURCE OF TRUTH KEYWORDS: MemberAvailability, WorkingHours, AvailabilitySettings
 *
 * FEATURES:
 * - Set working hours for each day of the week
 * - Enable/disable specific days
 * - Timezone display and selection
 * - Auto-save on blur for smooth UX
 */

import { useState, useEffect, useCallback } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { SectionHeader } from '@/components/global/section-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Loader2, Clock, Globe, Check, ChevronsUpDown } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { COMMON_TIMEZONES } from '@/lib/timezone/timezone-utils'

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_NAMES = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

/**
 * Generate time options for select dropdowns
 * WHY: Provides 15-minute intervals from 00:00 to 23:45
 */
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      const label = formatTime(value)
      options.push({ value, label })
    }
  }
  return options
}

/**
 * Format HH:mm time to 12-hour format for display
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}

const TIME_OPTIONS = generateTimeOptions()

// ============================================================================
// TYPES
// ============================================================================

type AvailabilityDay = {
  dayOfWeek: number
  startTime: string
  endTime: string
  isEnabled: boolean
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function AvailabilitySkeleton() {
  return (
    <div className="space-y-4">
      {/* Timezone skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-64" />
      </div>

      {/* Days skeleton */}
      <div className="space-y-3 mt-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-10 w-28" />
          </div>
        ))}
      </div>

      <Skeleton className="h-9 w-32 mt-4" />
    </div>
  )
}

// ============================================================================
// DAY ROW COMPONENT
// ============================================================================

type DayRowProps = {
  day: AvailabilityDay
  dayInfo: { value: number; label: string; short: string }
  onChange: (day: AvailabilityDay) => void
  disabled?: boolean
}

function DayRow({ day, dayInfo, onChange, disabled }: DayRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 py-3 px-4 rounded-lg transition-colors',
        day.isEnabled ? 'bg-muted/50' : 'bg-transparent',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Enable/Disable Switch */}
      <Switch
        checked={day.isEnabled}
        onCheckedChange={(checked) =>
          onChange({ ...day, isEnabled: checked })
        }
        disabled={disabled}
      />

      {/* Day Name */}
      <span
        className={cn(
          'w-28 text-sm font-medium',
          !day.isEnabled && 'text-muted-foreground'
        )}
      >
        {dayInfo.label}
      </span>

      {/* Time Range - only show when enabled */}
      {day.isEnabled ? (
        <>
          {/* Start Time */}
          <Select
            value={day.startTime}
            onValueChange={(value) => onChange({ ...day, startTime: value })}
            disabled={disabled}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {TIME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-muted-foreground">to</span>

          {/* End Time */}
          <Select
            value={day.endTime}
            onValueChange={(value) => onChange({ ...day, endTime: value })}
            disabled={disabled}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {TIME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">Unavailable</span>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AvailabilitySection() {
  // Get active organization
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Fetch user's current availability
   * WHY: Need existing schedule to populate the form
   */
  const {
    data: availabilityData,
    isLoading: isLoadingAvailability,
    error: availabilityError,
  } = trpc.memberAvailability.getMyAvailability.useQuery(
    { organizationId: organizationId! },
    {
      enabled: !!organizationId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  )

  /**
   * Fetch user's timezone
   * WHY: Display and allow changing timezone
   */
  const {
    data: timezoneData,
    isLoading: isLoadingTimezone,
  } = trpc.memberAvailability.getMyTimezone.useQuery(undefined, {
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const utils = trpc.useUtils()

  // ============================================================================
  // LOCAL STATE
  // ============================================================================

  /**
   * Default availability when no data exists
   * WHY: Show sensible defaults (Mon-Fri 9-5) so users can edit immediately
   */
  const defaultAvailability: AvailabilityDay[] = DAY_NAMES.map((day) => ({
    dayOfWeek: day.value,
    startTime: '09:00',
    endTime: '17:00',
    isEnabled: day.value >= 1 && day.value <= 5, // Mon-Fri enabled
  }))

  const [localAvailability, setLocalAvailability] = useState<AvailabilityDay[]>(defaultAvailability)
  const [localTimezone, setLocalTimezone] = useState<string>('UTC')
  const [hasChanges, setHasChanges] = useState(false)
  const [timezonePopoverOpen, setTimezonePopoverOpen] = useState(false)

  // Sync server data to local state
  useEffect(() => {
    if (availabilityData && availabilityData.length > 0) {
      const sorted = [...availabilityData].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      setLocalAvailability(
        sorted.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          startTime: day.startTime,
          endTime: day.endTime,
          isEnabled: day.isEnabled,
        }))
      )
    }
  }, [availabilityData])

  useEffect(() => {
    if (timezoneData?.timezone) {
      setLocalTimezone(timezoneData.timezone)
    }
  }, [timezoneData?.timezone])

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /**
   * Update availability mutation
   * WHY: Saves the entire weekly schedule at once
   */
  const updateAvailabilityMutation = trpc.memberAvailability.updateMyAvailability.useMutation({
    onSuccess: () => {
      utils.memberAvailability.getMyAvailability.invalidate()
      toast.success('Availability updated')
      setHasChanges(false)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update availability')
    },
  })

  /**
   * Update timezone mutation
   * WHY: Saves timezone preference
   */
  const updateTimezoneMutation = trpc.memberAvailability.updateMyTimezone.useMutation({
    onSuccess: () => {
      utils.memberAvailability.getMyTimezone.invalidate()
      toast.success('Timezone updated')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update timezone')
    },
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Handle day change
   * WHY: Update local state and track changes
   */
  const handleDayChange = useCallback((updatedDay: AvailabilityDay) => {
    setLocalAvailability((prev) =>
      prev.map((day) =>
        day.dayOfWeek === updatedDay.dayOfWeek ? updatedDay : day
      )
    )
    setHasChanges(true)
  }, [])

  /**
   * Handle save availability
   * WHY: Persist changes to database
   */
  const handleSave = useCallback(() => {
    // Validate time ranges
    for (const day of localAvailability) {
      if (day.isEnabled) {
        const [startHour, startMin] = day.startTime.split(':').map(Number)
        const [endHour, endMin] = day.endTime.split(':').map(Number)
        const startMinutes = startHour * 60 + startMin
        const endMinutes = endHour * 60 + endMin

        if (startMinutes >= endMinutes) {
          toast.error(`${DAY_NAMES[day.dayOfWeek].label}: End time must be after start time`)
          return
        }
      }
    }

    if (!organizationId) return
    updateAvailabilityMutation.mutate({ organizationId, availability: localAvailability })
  }, [localAvailability, updateAvailabilityMutation])

  /**
   * Handle timezone change
   * WHY: Update timezone preference
   */
  const handleTimezoneChange = useCallback(
    (timezone: string) => {
      setLocalTimezone(timezone)
      updateTimezoneMutation.mutate({ timezone })
    },
    [updateTimezoneMutation]
  )

  // ============================================================================
  // RENDER
  // ============================================================================

  const isLoading = !organizationId || isLoadingAvailability || isLoadingTimezone
  const isSaving = updateAvailabilityMutation.isPending

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Availability"
          description="Set your working hours for booking calendars"
        />
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <AvailabilitySkeleton />
        </div>
      </div>
    )
  }

  // Show error state if availability failed to load
  if (availabilityError) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Availability"
          description="Set your working hours for booking calendars"
        />
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Working Hours</h4>
            <p className="text-sm text-muted-foreground">
              Configure when you&apos;re available for meetings.
            </p>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              {availabilityError.message || 'Unable to load availability settings. You may not be a member of this organization.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Availability"
        description="Set your working hours for booking calendars"
      />

      <Separator />

      <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
        {/* Left Column - Description */}
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Working Hours</h4>
          <p className="text-sm text-muted-foreground">
            Configure when you&apos;re available for meetings. This applies to
            all booking calendars you&apos;re assigned to.
          </p>
        </div>

        {/* Right Column - Form */}
        <div className="space-y-6 max-w-lg">
          {/* Timezone Selector - Searchable Combobox */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Timezone
            </Label>
            <Popover open={timezonePopoverOpen} onOpenChange={setTimezonePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={timezonePopoverOpen}
                  className="w-full max-w-xs justify-between font-normal"
                  disabled={updateTimezoneMutation.isPending}
                >
                  {/* Display selected timezone label or placeholder */}
                  {localTimezone
                    ? COMMON_TIMEZONES.find((tz) => tz.value === localTimezone)?.label ?? localTimezone
                    : 'Select timezone...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search timezone..." />
                  <CommandList>
                    <CommandEmpty>No timezone found.</CommandEmpty>
                    {/* Group timezones by region for organized display */}
                    {['UTC', 'Americas', 'Europe', 'Africa', 'Middle East', 'Asia', 'Pacific'].map((region) => {
                      const regionTimezones = COMMON_TIMEZONES.filter((tz) => tz.region === region)
                      if (regionTimezones.length === 0) return null
                      return (
                        <CommandGroup key={region} heading={region}>
                          {regionTimezones.map((tz) => (
                            <CommandItem
                              key={tz.value}
                              value={`${tz.label} ${tz.value}`}
                              onSelect={() => {
                                handleTimezoneChange(tz.value)
                                setTimezonePopoverOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  localTimezone === tz.value ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              {tz.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              All times are displayed in your selected timezone
            </p>
          </div>

          {/* Weekly Schedule */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5 mb-3">
              <Clock className="h-3.5 w-3.5" />
              Weekly Schedule
            </Label>

            <div className="space-y-1 rounded-lg border p-2">
              {DAY_NAMES.map((dayInfo) => {
                const dayData = localAvailability.find(
                  (d) => d.dayOfWeek === dayInfo.value
                )

                if (!dayData) return null

                return (
                  <DayRow
                    key={dayInfo.value}
                    day={dayData}
                    dayInfo={dayInfo}
                    onChange={handleDayChange}
                    disabled={isSaving}
                  />
                )
              })}
            </div>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            size="sm"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Availability
          </Button>
        </div>
      </div>
    </div>
  )
}
