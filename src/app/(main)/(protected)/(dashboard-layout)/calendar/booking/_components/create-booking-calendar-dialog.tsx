'use client'

/**
 * Create Booking Calendar Dialog
 *
 * WHY: Modal for creating new booking calendar types
 * HOW: Form with name, slug, duration, availability settings
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, CreateDialog, CalendarForm
 */

import { useState, useCallback, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

// ============================================================================
// COMPONENT
// ============================================================================

type CreateBookingCalendarDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
}

export function CreateBookingCalendarDialog({
  open,
  onOpenChange,
  organizationId,
}: CreateBookingCalendarDialogProps) {
  // tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  // Form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('30')
  const [color, setColor] = useState<BookingCalendarColor>('blue')
  const [locationType, setLocationType] = useState<BookingCalendarLocationType>('google_meet')
  const [customLink, setCustomLink] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugManuallyEdited && name) {
      setSlug(generateSlug(name))
    }
  }, [name, slugManuallyEdited])

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName('')
      setSlug('')
      setDescription('')
      setDuration('30')
      setColor('blue')
      setLocationType('google_meet')
      setCustomLink('')
      setSlugManuallyEdited(false)
    }
  }, [open])

  // Create mutation
  const createMutation = trpc.bookingCalendar.create.useMutation({
    onSuccess: () => {
      utils.bookingCalendar.list.invalidate()
      toast.success('Booking calendar created')
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create booking calendar')
    },
  })

  // Handle form submission
  const handleSubmit = useCallback(() => {
    if (!name.trim() || !slug.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    // Validate custom link if selected
    if (locationType === 'custom_link' && !customLink.trim()) {
      toast.error('Please enter a custom meeting link')
      return
    }

    createMutation.mutate({
      organizationId,
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      duration: parseInt(duration),
      color,
      locationType,
      locationDetails: locationType === 'custom_link' ? customLink.trim() : null,
    })
  }, [organizationId, name, slug, description, duration, color, locationType, customLink, createMutation])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Booking Calendar</DialogTitle>
          <DialogDescription>
            Create a new booking calendar that people can use to schedule meetings with you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 30 Minute Meeting"
            />
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug *</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/book/org/</span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  setSlugManuallyEdited(true)
                }}
                placeholder="30-minute-meeting"
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This will be part of your booking link
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
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
              <Label htmlFor="customLink">Meeting Link *</Label>
              <Input
                id="customLink"
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
