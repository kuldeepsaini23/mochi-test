'use client'

/**
 * Event Dialog Component - Create/Edit Calendar Events
 *
 * WHY: Allow users to create new events and edit/delete existing ones
 * HOW: Modal dialog with form fields, supports both create and edit modes
 *
 * MODES:
 * - Create Mode: When no `event` prop is passed
 * - Edit Mode: When `event` prop is passed, allows editing and deleting
 *
 * FIELDS:
 * - Title (required)
 * - Description (optional)
 * - Date (required)
 * - Start Time (required)
 * - End Time (required)
 * - Location (optional) - physical location or text description
 * - Meeting URL (optional) - Google Meet, Zoom, etc.
 * - Color (required) - for visual categorization
 *
 * Search Keywords: SOURCE OF TRUTH, EVENT DIALOG, CALENDAR FORM, CREATE EVENT, EDIT EVENT
 */

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { utcToTimezone, timezoneToUtc } from '@/lib/timezone/timezone-utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar, Clock, MapPin, Video, Palette, Loader2, Trash2, CheckCircle2, User, Users, X, Globe } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { LeadSearchCommand, type LeadOption } from '@/components/leads/lead-search-command'
import { TeamSearchCommand, type TeamMemberOption } from '@/components/team/team-search-command'
import type { CalendarEvent, EventColor } from './types'
import type { CalendarEventStatus } from '@/hooks/use-calendar'

/** Available event colors for categorization */
const EVENT_COLORS: { value: EventColor; label: string; className: string }[] = [
  { value: 'blue', label: 'Blue', className: 'bg-blue-500' },
  { value: 'green', label: 'Green', className: 'bg-emerald-500' },
  { value: 'purple', label: 'Purple', className: 'bg-violet-500' },
  { value: 'orange', label: 'Orange', className: 'bg-orange-500' },
  { value: 'red', label: 'Red', className: 'bg-red-500' },
  { value: 'pink', label: 'Pink', className: 'bg-pink-500' },
  { value: 'yellow', label: 'Yellow', className: 'bg-amber-500' },
  { value: 'gray', label: 'Gray', className: 'bg-zinc-400' },
]

/**
 * Available event status options
 * SOURCE OF TRUTH: CalendarEventStatus enum in Prisma schema
 */
const EVENT_STATUSES: { value: CalendarEventStatus; label: string; description: string }[] = [
  { value: 'PENDING', label: 'Pending', description: 'Awaiting approval' },
  { value: 'APPROVED', label: 'Approved', description: 'Confirmed and scheduled' },
  { value: 'CANCELLED', label: 'Cancelled', description: 'Event will not take place' },
]

/** Generate time options in 30-minute intervals */
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const h = hour.toString().padStart(2, '0')
      const m = minute.toString().padStart(2, '0')
      const value = `${h}:${m}`
      const displayHour = hour % 12 || 12
      const ampm = hour < 12 ? 'AM' : 'PM'
      const displayMinute = minute === 0 ? '' : ':30'
      const label = `${displayHour}${displayMinute} ${ampm}`
      options.push({ value, label })
    }
  }
  return options
}

/**
 * Format date to YYYY-MM-DD for input[type="date"]
 * WHY: Converts UTC date to user's timezone for correct date display
 *
 * @param date - UTC date from database
 * @param timezone - User's timezone (IANA format)
 */
function formatDateForInput(date: Date, timezone?: string): string {
  // Convert UTC to user's timezone if provided
  const localDate = timezone ? utcToTimezone(date, timezone) : date
  const year = localDate.getFullYear()
  const month = (localDate.getMonth() + 1).toString().padStart(2, '0')
  const day = localDate.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format time to HH:MM for select value
 * WHY: Converts UTC time to user's timezone for correct time display
 *
 * @param date - UTC date from database
 * @param timezone - User's timezone (IANA format)
 */
function formatTimeForInput(date: Date, timezone?: string): string {
  // Convert UTC to user's timezone if provided
  const localDate = timezone ? utcToTimezone(date, timezone) : date
  const hours = localDate.getHours().toString().padStart(2, '0')
  const minutes = localDate.getMinutes() < 30 ? '00' : '30'
  return `${hours}:${minutes}`
}

/** Parse time string (HH:MM) to hours and minutes */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return { hours, minutes }
}

type EventDialogProps = {
  /** Whether the dialog is open */
  open: boolean
  /** Handler to change open state */
  onOpenChange: (open: boolean) => void
  /** Organization ID for lead/team member search */
  organizationId: string
  /** User's timezone for date/time display (IANA format, e.g., "America/New_York") */
  timezone?: string
  /** Default date/time when clicking on a time slot (for create mode) */
  defaultDate?: Date | null
  /** Event to edit (if provided, dialog is in edit mode) */
  event?: CalendarEvent | null
  /** Handler when form is submitted for creating */
  onCreate?: (eventData: {
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
  }) => void
  /** Handler when form is submitted for updating */
  onUpdate?: (eventId: string, eventData: {
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
  }) => void
  /** Handler when delete is confirmed */
  onDelete?: (eventId: string) => void
  /** Whether the form is currently submitting */
  isSubmitting?: boolean
  /** Whether delete is in progress */
  isDeleting?: boolean
  /** Whether user can edit (has update permission) */
  canEdit?: boolean
  /** Whether user can delete (has delete permission) */
  canDelete?: boolean
}

export function EventDialog({
  open,
  onOpenChange,
  organizationId,
  timezone,
  defaultDate,
  event,
  onCreate,
  onUpdate,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
  canEdit = true,
  canDelete = true,
}: EventDialogProps) {
  const timeOptions = useMemo(() => generateTimeOptions(), [])

  /** Is this dialog in edit mode? */
  const isEditMode = !!event

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [location, setLocation] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [color, setColor] = useState<EventColor>('blue')
  const [status, setStatus] = useState<CalendarEventStatus>('PENDING')

  /**
   * Lead (attendee) state
   * WHY: Store selected lead for calendar event association
   */
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null)
  const [isLeadSearchOpen, setIsLeadSearchOpen] = useState(false)

  /**
   * Team member (assignee) state
   * WHY: Store assigned team member who handles this event
   */
  const [selectedAssignee, setSelectedAssignee] = useState<TeamMemberOption | null>(null)
  const [isTeamSearchOpen, setIsTeamSearchOpen] = useState(false)

  /** Delete confirmation dialog */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  /**
   * Reset form when dialog opens or event changes
   * In edit mode: populate with event data (converted to user's timezone)
   * In create mode: use defaults
   *
   * WHY: Event dates are stored in UTC, must convert to user's timezone for display
   */
  useEffect(() => {
    if (open) {
      if (event) {
        // Edit mode - populate with event data, converting UTC to user's timezone
        setTitle(event.title)
        setDescription(event.description ?? '')
        setDate(formatDateForInput(event.startDate, timezone))
        setStartTime(formatTimeForInput(event.startDate, timezone))
        setEndTime(formatTimeForInput(event.endDate, timezone))
        setLocation(event.location ?? '')
        setMeetingUrl(event.meetingUrl ?? '')
        setColor(event.color as EventColor)
        setStatus(event.status as CalendarEventStatus)

        // Populate lead if exists
        if (event.lead) {
          setSelectedLead({
            id: event.lead.id,
            firstName: event.lead.firstName,
            lastName: event.lead.lastName,
            email: event.lead.email,
            phone: event.lead.phone,
            avatarUrl: event.lead.avatarUrl,
          })
        } else {
          setSelectedLead(null)
        }

        // Populate assignee if exists
        if (event.assignedTo) {
          setSelectedAssignee({
            id: event.assignedTo.id,
            name: event.assignedTo.name,
            email: event.assignedTo.email,
            image: event.assignedTo.image,
          })
        } else {
          setSelectedAssignee(null)
        }
      } else if (defaultDate) {
        // Create mode with default date (already in user's timezone from slot click)
        setDate(formatDateForInput(defaultDate, timezone))
        setStartTime(formatTimeForInput(defaultDate, timezone))
        const endDate = new Date(defaultDate)
        endDate.setHours(endDate.getHours() + 1)
        setEndTime(formatTimeForInput(endDate, timezone))
        // Reset other fields
        setTitle('')
        setDescription('')
        setLocation('')
        setMeetingUrl('')
        setColor('blue')
        setStatus('PENDING')
        setSelectedLead(null)
        setSelectedAssignee(null)
      } else {
        // Create mode without default date
        const today = new Date()
        setDate(formatDateForInput(today, timezone))
        setStartTime('09:00')
        setEndTime('10:00')
        setTitle('')
        setDescription('')
        setLocation('')
        setMeetingUrl('')
        setColor('blue')
        setStatus('PENDING')
        setSelectedLead(null)
        setSelectedAssignee(null)
      }
    }
    // Reset delete confirmation and search dialogs when dialog closes
    if (!open) {
      setShowDeleteConfirm(false)
      setIsLeadSearchOpen(false)
      setIsTeamSearchOpen(false)
    }
  }, [open, event, defaultDate, timezone])

  /**
   * Validate and submit the form
   * WHY: Converts user's timezone date/time back to UTC for database storage
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !date || !startTime || !endTime) {
      return
    }

    // Parse date and times (these are in user's timezone)
    const [year, month, day] = date.split('-').map(Number)
    const { hours: startHours, minutes: startMinutes } = parseTime(startTime)
    const { hours: endHours, minutes: endMinutes } = parseTime(endTime)

    // Create dates in user's local representation first
    let startDate = new Date(year, month - 1, day, startHours, startMinutes)
    let endDate = new Date(year, month - 1, day, endHours, endMinutes)

    // If end time is before start time, assume it's the next day
    if (endDate <= startDate) {
      endDate.setDate(endDate.getDate() + 1)
    }

    // Convert from user's timezone to UTC for storage
    // WHY: Database stores dates in UTC, user inputs are in their preferred timezone
    if (timezone) {
      startDate = timezoneToUtc(startDate, timezone)
      endDate = timezoneToUtc(endDate, timezone)
    }

    const eventData = {
      title: title.trim(),
      description: description.trim() || undefined,
      startDate,
      endDate,
      location: location.trim() || undefined,
      meetingUrl: meetingUrl.trim() || undefined,
      color,
      status,
      leadId: selectedLead?.id ?? null,
      assignedToId: selectedAssignee?.id ?? null,
    }

    if (isEditMode && event) {
      onUpdate?.(event.id, eventData)
    } else {
      onCreate?.(eventData)
    }
  }

  /** Handle delete confirmation */
  const handleDeleteConfirm = () => {
    if (event) {
      onDelete?.(event.id)
    }
    setShowDeleteConfirm(false)
  }

  const isFormDisabled = isSubmitting || isDeleting || (isEditMode && !canEdit)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
          <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit Event' : 'Create Event'}</DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? 'Update the event details below.'
                  : 'Add a new event to your calendar. Fill in the details below.'}
              </DialogDescription>
            </DialogHeader>

            {/* Scrollable form fields area */}
            <div className="grid gap-4 py-4 overflow-y-auto pr-1">
              {/* Title */}
              <div className="grid gap-2">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Event title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={isFormDisabled}
                />
              </div>

              {/* Description */}
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Add a description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={isFormDisabled}
                />
              </div>

              {/* Date */}
              <div className="grid gap-2">
                <Label htmlFor="date" className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={isFormDisabled}
                />
              </div>

              {/* Time row - Start and End */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="start-time" className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Start Time <span className="text-destructive">*</span>
                  </Label>
                  <Select value={startTime} onValueChange={setStartTime} disabled={isFormDisabled}>
                    <SelectTrigger id="start-time">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="end-time" className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    End Time <span className="text-destructive">*</span>
                  </Label>
                  <Select value={endTime} onValueChange={setEndTime} disabled={isFormDisabled}>
                    <SelectTrigger id="end-time">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Timezone indicator - shows user's timezone for clarity */}
              {timezone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  <span>Times shown in {timezone.split('/').pop()?.replace(/_/g, ' ')}</span>
                </div>
              )}

              {/* Location */}
              <div className="grid gap-2">
                <Label htmlFor="location" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Location
                </Label>
                <Input
                  id="location"
                  placeholder="Add a location (optional)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={isFormDisabled}
                />
              </div>

              {/* Meeting URL */}
              <div className="grid gap-2">
                <Label htmlFor="meeting-url" className="flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" />
                  Meeting Link
                </Label>
                <Input
                  id="meeting-url"
                  type="url"
                  placeholder="https://meet.google.com/... or Zoom link"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  disabled={isFormDisabled}
                />
              </div>

              {/* Color */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" />
                  Color
                </Label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      disabled={isFormDisabled}
                      className={cn(
                        'w-7 h-7 rounded-full transition-all',
                        c.className,
                        color === c.value
                          ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                          : 'hover:scale-105',
                        isFormDisabled && 'opacity-50 cursor-not-allowed'
                      )}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Status
                </Label>
                <Select value={status} onValueChange={(v) => setStatus(v as CalendarEventStatus)} disabled={isFormDisabled}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <span>{s.label}</span>
                          <span className="text-xs text-muted-foreground">- {s.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lead (Attendee) */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Lead (Attendee)
                </Label>
                {selectedLead ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={selectedLead.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {[selectedLead.firstName, selectedLead.lastName]
                          .filter(Boolean)
                          .map((n) => n?.[0])
                          .join('')
                          .toUpperCase() || selectedLead.email[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {[selectedLead.firstName, selectedLead.lastName].filter(Boolean).join(' ') || selectedLead.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{selectedLead.email}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setSelectedLead(null)}
                      disabled={isFormDisabled}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-muted-foreground font-normal"
                    onClick={() => setIsLeadSearchOpen(true)}
                    disabled={isFormDisabled}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Select a lead...
                  </Button>
                )}
              </div>

              {/* Assignee (Team Member) */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Assignee
                </Label>
                {selectedAssignee ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={selectedAssignee.image ?? undefined} />
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {selectedAssignee.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedAssignee.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{selectedAssignee.email}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setSelectedAssignee(null)}
                      disabled={isFormDisabled}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-muted-foreground font-normal"
                    onClick={() => setIsTeamSearchOpen(true)}
                    disabled={isFormDisabled}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Assign to team member...
                  </Button>
                )}
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between shrink-0 pt-4 border-t">
              {/* Delete button - only in edit mode with permission */}
              {isEditMode && canDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSubmitting || isDeleting}
                  className="w-full sm:w-auto"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </>
                  )}
                </Button>
              )}

              {/* Cancel and Submit buttons */}
              <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting || isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!title.trim() || !date || isSubmitting || isDeleting || (isEditMode && !canEdit)}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isEditMode ? 'Saving...' : 'Creating...'}
                    </>
                  ) : (
                    isEditMode ? 'Save Changes' : 'Create Event'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{event?.title}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lead Search Dialog */}
      <LeadSearchCommand
        organizationId={organizationId}
        open={isLeadSearchOpen}
        onOpenChange={setIsLeadSearchOpen}
        selectedLeadId={selectedLead?.id}
        onSelect={(lead) => setSelectedLead(lead)}
        showCreateOption={false}
        title="Select Lead (Attendee)"
        placeholder="Search leads by name or email..."
      />

      {/* Team Member Search Dialog */}
      <TeamSearchCommand
        organizationId={organizationId}
        open={isTeamSearchOpen}
        onOpenChange={setIsTeamSearchOpen}
        selectedMemberId={selectedAssignee?.id}
        onSelect={(member) => setSelectedAssignee(member)}
        allowUnassign={false}
        title="Select Assignee"
        placeholder="Search team members..."
      />
    </>
  )
}

// Re-export with old name for backwards compatibility during migration
export { EventDialog as CreateEventDialog }
