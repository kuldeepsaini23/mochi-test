'use client'

/**
 * Edit Booking Calendar Dialog
 *
 * WHY: Modal for editing existing booking calendar settings and availability
 * HOW: Tabbed form with general settings and weekly availability schedule
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, EditDialog, Availability, CalendarForm
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { trpc } from '@/trpc/react-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Users, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ============================================================================
// CONSTANTS
// ============================================================================

const DURATION_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
]

/**
 * SOURCE OF TRUTH: BookingCalendarColor
 * Color options for booking calendars - must match tRPC schema
 */
type BookingCalendarColor = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'yellow' | 'gray'

const COLOR_OPTIONS: { value: BookingCalendarColor; label: string; class: string }[] = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-emerald-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-amber-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
]

/**
 * SOURCE OF TRUTH: BookingCalendarLocationType
 * Location type options for booking calendars - must match tRPC schema
 */
type BookingCalendarLocationType = 'google_meet' | 'custom_link'

const LOCATION_OPTIONS: { value: BookingCalendarLocationType; label: string }[] = [
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'custom_link', label: 'Custom Link' },
]

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const hour = Math.floor(i / 4)
  const minute = (i % 4) * 15
  return {
    value: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
    label: new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  }
})

// ============================================================================
// TYPES
// ============================================================================

type AvailabilityDay = {
  dayOfWeek: number
  startTime: string
  endTime: string
  isEnabled: boolean
}

type BookingCalendar = {
  id: string
  name: string
  slug: string
  description: string | null
  duration: number
  color: string
  isActive: boolean
  locationType: string
  locationDetails?: string | null
  bufferBefore?: number
  bufferAfter?: number
  availability?: AvailabilityDay[]
}

// ============================================================================
// COMPONENT
// ============================================================================

type EditBookingCalendarDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  calendar: BookingCalendar
}

export function EditBookingCalendarDialog({
  open,
  onOpenChange,
  organizationId,
  calendar,
}: EditBookingCalendarDialogProps) {
  // tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  // ============================================================================
  // TEAM MEMBERS QUERIES
  // ============================================================================

  /**
   * Fetch organization members for team assignment
   * WHY: Need list of all members to select from
   */
  const membersQuery = trpc.organization.getOrganizationMembers.useQuery(
    { organizationId },
    { enabled: open }
  )

  /**
   * Fetch current assignees for this calendar
   * WHY: Show which members are already assigned
   */
  const assigneesQuery = trpc.bookingCalendar.getAssignees.useQuery(
    { organizationId, calendarId: calendar.id },
    { enabled: open }
  )

  // Selected member IDs state
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())

  // Initialize selected members when assignees data loads
  useEffect(() => {
    if (assigneesQuery.data) {
      setSelectedMemberIds(new Set(assigneesQuery.data.map((a) => a.memberId)))
    }
  }, [assigneesQuery.data])

  // Form state
  const [name, setName] = useState(calendar.name)
  const [slug, setSlug] = useState(calendar.slug)
  const [description, setDescription] = useState(calendar.description || '')
  const [duration, setDuration] = useState(calendar.duration.toString())
  const [color, setColor] = useState<BookingCalendarColor>(calendar.color as BookingCalendarColor)
  const [locationType, setLocationType] = useState<BookingCalendarLocationType>((calendar.locationType || 'google_meet') as BookingCalendarLocationType)
  const [customLink, setCustomLink] = useState(calendar.locationDetails || '')
  const [isActive, setIsActive] = useState(calendar.isActive)
  const [bufferBefore, setBufferBefore] = useState((calendar.bufferBefore || 0).toString())
  const [bufferAfter, setBufferAfter] = useState((calendar.bufferAfter || 0).toString())

  // Availability state - initialize with defaults if not provided
  const [availability, setAvailability] = useState<AvailabilityDay[]>(() => {
    if (calendar.availability && calendar.availability.length === 7) {
      return calendar.availability
    }
    // Default availability
    return DAYS_OF_WEEK.map((day) => ({
      dayOfWeek: day.value,
      startTime: '09:00',
      endTime: '17:00',
      isEnabled: day.value >= 1 && day.value <= 5, // Mon-Fri enabled
    }))
  })

  // Update form when calendar changes
  useEffect(() => {
    setName(calendar.name)
    setSlug(calendar.slug)
    setDescription(calendar.description || '')
    setDuration(calendar.duration.toString())
    setColor(calendar.color as BookingCalendarColor)
    setLocationType((calendar.locationType || 'google_meet') as BookingCalendarLocationType)
    setCustomLink(calendar.locationDetails || '')
    setIsActive(calendar.isActive)
    setBufferBefore((calendar.bufferBefore || 0).toString())
    setBufferAfter((calendar.bufferAfter || 0).toString())
    if (calendar.availability && calendar.availability.length === 7) {
      setAvailability(calendar.availability)
    }
  }, [calendar])

  // Update calendar mutation
  const updateMutation = trpc.bookingCalendar.update.useMutation({
    onSuccess: () => {
      utils.bookingCalendar.list.invalidate()
      toast.success('Booking calendar updated')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update booking calendar')
    },
  })

  // Update availability mutation
  const updateAvailabilityMutation = trpc.bookingCalendar.updateAvailability.useMutation({
    onSuccess: () => {
      utils.bookingCalendar.list.invalidate()
      toast.success('Availability updated')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update availability')
    },
  })

  // Set assignees mutation
  const setAssigneesMutation = trpc.bookingCalendar.setAssignees.useMutation({
    onSuccess: () => {
      utils.bookingCalendar.list.invalidate()
      utils.bookingCalendar.getAssignees.invalidate()
      toast.success('Team members updated')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update team members')
    },
  })

  // Handle general settings save
  const handleSaveGeneral = useCallback(() => {
    if (!name.trim() || !slug.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    // Validate custom link if selected
    if (locationType === 'custom_link' && !customLink.trim()) {
      toast.error('Please enter a custom meeting link')
      return
    }

    updateMutation.mutate({
      organizationId,
      calendarId: calendar.id,
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      duration: parseInt(duration),
      color,
      locationType,
      locationDetails: locationType === 'custom_link' ? customLink.trim() : null,
      isActive,
      bufferBefore: parseInt(bufferBefore) || 0,
      bufferAfter: parseInt(bufferAfter) || 0,
    })
  }, [
    organizationId,
    calendar.id,
    name,
    slug,
    description,
    duration,
    color,
    locationType,
    customLink,
    isActive,
    bufferBefore,
    bufferAfter,
    updateMutation,
  ])

  // Handle availability save
  const handleSaveAvailability = useCallback(() => {
    updateAvailabilityMutation.mutate({
      organizationId,
      calendarId: calendar.id,
      availability,
    })
  }, [organizationId, calendar.id, availability, updateAvailabilityMutation])

  // Update availability for a specific day
  const updateDayAvailability = useCallback(
    (dayOfWeek: number, updates: Partial<AvailabilityDay>) => {
      setAvailability((prev) =>
        prev.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...updates } : day))
      )
    },
    []
  )

  // Toggle member selection
  const toggleMemberSelection = useCallback((memberId: string) => {
    setSelectedMemberIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(memberId)) {
        newSet.delete(memberId)
      } else {
        newSet.add(memberId)
      }
      return newSet
    })
  }, [])

  // Handle save team members
  const handleSaveTeamMembers = useCallback(() => {
    setAssigneesMutation.mutate({
      organizationId,
      calendarId: calendar.id,
      memberIds: Array.from(selectedMemberIds),
    })
  }, [organizationId, calendar.id, selectedMemberIds, setAssigneesMutation])

  // Check if team members have changed
  const hasTeamChanges = useMemo(() => {
    if (!assigneesQuery.data) return false
    const currentIds = new Set(assigneesQuery.data.map((a) => a.memberId))
    if (currentIds.size !== selectedMemberIds.size) return true
    for (const id of selectedMemberIds) {
      if (!currentIds.has(id)) return true
    }
    return false
  }, [assigneesQuery.data, selectedMemberIds])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Booking Calendar</DialogTitle>
          <DialogDescription>
            Update settings and availability for this booking calendar.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          {/* General Settings Tab */}
          <TabsContent value="general" className="flex-1 overflow-y-auto mt-4 space-y-4">
            {/* Active toggle */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  When disabled, people can&apos;t book this calendar
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 30 Minute Meeting"
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="edit-slug">URL Slug *</Label>
              <Input
                id="edit-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="30-minute-meeting"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this meeting is for..."
                rows={2}
              />
            </div>

            {/* Duration and Color row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration *</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <Select value={color} onValueChange={(v) => setColor(v as BookingCalendarColor)}>
                  <SelectTrigger>
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${COLOR_OPTIONS.find((c) => c.value === color)?.class}`}
                        />
                        {COLOR_OPTIONS.find((c) => c.value === color)?.label}
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${option.class}`} />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Buffer times */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Buffer Before (min)</Label>
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={bufferBefore}
                  onChange={(e) => setBufferBefore(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">Time before meeting</p>
              </div>
              <div className="space-y-2">
                <Label>Buffer After (min)</Label>
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={bufferAfter}
                  onChange={(e) => setBufferAfter(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">Time after meeting</p>
              </div>
            </div>

            {/* Location Type */}
            <div className="space-y-2">
              <Label>Meeting Location</Label>
              <Select value={locationType} onValueChange={(v) => setLocationType(v as BookingCalendarLocationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom Link Input */}
            {locationType === 'custom_link' && (
              <div className="space-y-2">
                <Label htmlFor="edit-customLink">Meeting Link *</Label>
                <Input
                  id="edit-customLink"
                  type="url"
                  value={customLink}
                  onChange={(e) => setCustomLink(e.target.value)}
                  placeholder="https://zoom.us/j/123456789"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your Zoom, Teams, or other meeting link
                </p>
              </div>
            )}

            <div className="pt-2">
              <Button onClick={handleSaveGeneral} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="flex-1 overflow-y-auto mt-4 space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Set which days and times people can book appointments.
            </p>

            {DAYS_OF_WEEK.map((day) => {
              const dayAvailability = availability.find((a) => a.dayOfWeek === day.value)
              if (!dayAvailability) return null

              return (
                <div
                  key={day.value}
                  className="flex items-center gap-4 p-3 border rounded-lg"
                >
                  <Switch
                    checked={dayAvailability.isEnabled}
                    onCheckedChange={(enabled) =>
                      updateDayAvailability(day.value, { isEnabled: enabled })
                    }
                  />
                  <span className="w-24 font-medium">{day.label}</span>

                  {dayAvailability.isEnabled ? (
                    <>
                      <Select
                        value={dayAvailability.startTime}
                        onValueChange={(time) =>
                          updateDayAvailability(day.value, { startTime: time })
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={time.value} value={time.value}>
                              {time.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <span className="text-muted-foreground">to</span>

                      <Select
                        value={dayAvailability.endTime}
                        onValueChange={(time) =>
                          updateDayAvailability(day.value, { endTime: time })
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={time.value} value={time.value}>
                              {time.label}
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
            })}

            <div className="pt-2">
              <Button
                onClick={handleSaveAvailability}
                disabled={updateAvailabilityMutation.isPending}
              >
                {updateAvailabilityMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Availability
              </Button>
            </div>
          </TabsContent>

          {/* Team Members Tab */}
          <TabsContent value="team" className="flex-1 overflow-y-auto mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>Team Members</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Assign team members to handle bookings for this calendar. Availability
                will be based on each member&apos;s personal working hours.
              </p>
            </div>

            {/* Members List */}
            <div className="space-y-2">
              {membersQuery.isLoading || assigneesQuery.isLoading ? (
                // Loading skeleton
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Skeleton className="h-5 w-5 rounded" />
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : membersQuery.data && membersQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {membersQuery.data.map((member) => {
                    const isSelected = selectedMemberIds.has(member.id)
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleMemberSelection(member.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 border rounded-lg transition-colors text-left',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                        )}
                      >
                        {/* Checkbox indicator */}
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/40'
                          )}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </div>

                        {/* Avatar */}
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.user?.image ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {member.user?.name?.charAt(0).toUpperCase() ?? '?'}
                          </AvatarFallback>
                        </Avatar>

                        {/* Member info */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {member.user?.name ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.user?.email ?? ''}
                          </p>
                        </div>

                        {/* Role badge */}
                        <span className="text-xs text-muted-foreground capitalize">
                          {member.role}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No team members found</p>
                </div>
              )}
            </div>

            {/* Info about personal availability */}
            {selectedMemberIds.size > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <p>
                  <strong>{selectedMemberIds.size}</strong> team member{selectedMemberIds.size !== 1 ? 's' : ''} selected.
                  Time slots will be shown when at least one team member is available
                  based on their personal availability settings.
                </p>
              </div>
            )}

            {/* Save button */}
            <div className="pt-2">
              <Button
                onClick={handleSaveTeamMembers}
                disabled={setAssigneesMutation.isPending || !hasTeamChanges}
              >
                {setAssigneesMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Team Members
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
