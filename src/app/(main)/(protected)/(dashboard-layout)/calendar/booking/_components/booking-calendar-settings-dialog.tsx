'use client'

/**
 * Booking Calendar Settings Dialog
 *
 * WHY: Unified modal for creating and editing booking calendars
 * HOW: Sidebar + Content layout pattern (matches website builder settings)
 *
 * LAYOUT:
 * ┌─────────────────────────────────────────────────┐
 * │ Dialog                                          │
 * ├──────────────┬──────────────────────────────────┤
 * │ SIDEBAR      │ CONTENT AREA                     │
 * │              │                                  │
 * │ • General    │  [Section Header]                │
 * │ • Schedule   │  ────────────────────────────    │
 * │ • Team       │  [Scrollable Content]            │
 * │              │                                  │
 * └──────────────┴──────────────────────────────────┘
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendarSettings, CalendarDialog, TeamAssignment
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings,
  Calendar,
  Users,
  Loader2,
  Check,
  Clock,
  Link as LinkIcon,
  Palette,
} from 'lucide-react'
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

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-emerald-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-amber-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
]

const LOCATION_OPTIONS = [
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'custom_link', label: 'Custom Link' },
]

type SettingsSection = 'general' | 'schedule' | 'team'

const settingsNav = [
  { id: 'general' as const, name: 'General', icon: Settings },
  { id: 'schedule' as const, name: 'Schedule', icon: Calendar },
  { id: 'team' as const, name: 'Team', icon: Users },
]

// ============================================================================
// TYPES
// ============================================================================

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
  /** Max days ahead a booker can see/book. null = unlimited. */
  maxBookingDays?: number | null
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

type BookingCalendarSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If provided, edit mode. Otherwise, create mode. */
  calendar?: BookingCalendar | null
}

export function BookingCalendarSettingsDialog({
  open,
  onOpenChange,
  calendar,
}: BookingCalendarSettingsDialogProps) {
  const isEditMode = !!calendar
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  // Active section
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  // tRPC utils
  const utils = trpc.useUtils()

  // ============================================================================
  // FORM STATE
  // ============================================================================

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('30')
  const [color, setColor] = useState('blue')
  const [locationType, setLocationType] = useState('google_meet')
  const [customLink, setCustomLink] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [bufferBefore, setBufferBefore] = useState('0')
  const [bufferAfter, setBufferAfter] = useState('0')
  /**
   * Max booking days state
   * WHY: Controls how far ahead bookers can see/book slots
   * Empty string = unlimited (no restriction), number string = max days
   */
  const [maxBookingDays, setMaxBookingDays] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  // Team members state
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())

  // ============================================================================
  // QUERIES
  // ============================================================================

  // Fetch organization members
  const membersQuery = trpc.organization.getOrganizationMembers.useQuery(
    { organizationId: organizationId! },
    { enabled: open && !!organizationId }
  )

  // Fetch current assignees (edit mode only)
  const assigneesQuery = trpc.bookingCalendar.getAssignees.useQuery(
    { organizationId: organizationId!, calendarId: calendar?.id ?? '' },
    { enabled: open && isEditMode && !!organizationId && !!calendar?.id }
  )

  // ============================================================================
  // INITIALIZE FORM
  // ============================================================================

  // Reset form when dialog opens/closes or calendar changes
  useEffect(() => {
    if (!open) {
      // Reset to defaults on close
      setActiveSection('general')
      setSlugManuallyEdited(false)
      return
    }

    if (isEditMode && calendar) {
      // Populate form with existing data
      setName(calendar.name)
      setSlug(calendar.slug)
      setDescription(calendar.description || '')
      setDuration(calendar.duration.toString())
      setColor(calendar.color)
      setLocationType(calendar.locationType || 'google_meet')
      setCustomLink(calendar.locationDetails || '')
      setIsActive(calendar.isActive)
      setBufferBefore((calendar.bufferBefore || 0).toString())
      setBufferAfter((calendar.bufferAfter || 0).toString())
      // Set max booking days - empty string means unlimited (null in DB)
      setMaxBookingDays(calendar.maxBookingDays != null ? calendar.maxBookingDays.toString() : '')
      setSlugManuallyEdited(true)
    } else {
      // Reset to defaults for create mode
      setName('')
      setSlug('')
      setDescription('')
      setDuration('30')
      setColor('blue')
      setLocationType('google_meet')
      setCustomLink('')
      setIsActive(true)
      setBufferBefore('0')
      setBufferAfter('0')
      setMaxBookingDays('') // Default: unlimited
      setSelectedMemberIds(new Set())
    }
  }, [open, calendar, isEditMode])

  // Initialize selected members from assignees
  useEffect(() => {
    if (assigneesQuery.data) {
      setSelectedMemberIds(new Set(assigneesQuery.data.map((a) => a.memberId)))
    }
  }, [assigneesQuery.data])

  // Auto-generate slug from name (create mode only)
  useEffect(() => {
    if (!isEditMode && !slugManuallyEdited && name) {
      setSlug(generateSlug(name))
    }
  }, [name, slugManuallyEdited, isEditMode])

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const createMutation = trpc.bookingCalendar.create.useMutation({
    onSuccess: (data) => {
      utils.bookingCalendar.list.invalidate()
      toast.success('Booking calendar created')
      // After creation, set assignees if any selected
      if (selectedMemberIds.size > 0 && data?.id) {
        setAssigneesMutation.mutate({
          organizationId: organizationId!,
          calendarId: data.id,
          memberIds: Array.from(selectedMemberIds),
        })
      } else {
        onOpenChange(false)
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create booking calendar')
    },
  })

  const updateMutation = trpc.bookingCalendar.update.useMutation({
    onSuccess: () => {
      utils.bookingCalendar.list.invalidate()
      toast.success('Booking calendar updated')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update booking calendar')
    },
  })

  const setAssigneesMutation = trpc.bookingCalendar.setAssignees.useMutation({
    onSuccess: () => {
      utils.bookingCalendar.list.invalidate()
      utils.bookingCalendar.getAssignees.invalidate()
      toast.success('Team members updated')
      if (!isEditMode) {
        onOpenChange(false)
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update team members')
    },
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSaveGeneral = useCallback(() => {
    if (!organizationId) return
    if (!name.trim() || !slug.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    if (locationType === 'custom_link' && !customLink.trim()) {
      toast.error('Please enter a custom meeting link')
      return
    }

    // Require at least one team member for new calendars
    // WHY: Availability comes from team members - no members = no slots
    if (!isEditMode && selectedMemberIds.size === 0) {
      toast.error('Please select at least one team member in the Team tab')
      setActiveSection('team')
      return
    }

    const data = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      duration: parseInt(duration),
      color: color as 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'yellow' | 'gray',
      locationType: locationType as 'google_meet' | 'custom_link',
      locationDetails: locationType === 'custom_link' ? customLink.trim() : null,
      isActive,
      bufferBefore: parseInt(bufferBefore) || 0,
      bufferAfter: parseInt(bufferAfter) || 0,
      /**
       * Max booking days: empty = unlimited (null), otherwise parse as int
       * WHY: Controls how far ahead external bookers can book appointments
       */
      maxBookingDays: maxBookingDays.trim() ? parseInt(maxBookingDays) : null,
    }

    if (isEditMode && calendar) {
      updateMutation.mutate({
        organizationId,
        calendarId: calendar.id,
        ...data,
      })
    } else {
      createMutation.mutate({
        organizationId,
        ...data,
      })
    }
  }, [
    organizationId,
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
    maxBookingDays,
    isEditMode,
    calendar,
    updateMutation,
    createMutation,
    selectedMemberIds,
    setActiveSection,
  ])

  const handleSaveTeamMembers = useCallback(() => {
    if (!organizationId || !calendar) return

    // Require at least one team member
    if (selectedMemberIds.size === 0) {
      toast.error('At least one team member is required')
      return
    }

    setAssigneesMutation.mutate({
      organizationId,
      calendarId: calendar.id,
      memberIds: Array.from(selectedMemberIds),
    })
  }, [organizationId, calendar, selectedMemberIds, setAssigneesMutation])

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

  // Check if team has changes
  const hasTeamChanges = useMemo(() => {
    if (!assigneesQuery.data) return selectedMemberIds.size > 0
    const currentIds = new Set(assigneesQuery.data.map((a) => a.memberId))
    if (currentIds.size !== selectedMemberIds.size) return true
    for (const id of selectedMemberIds) {
      if (!currentIds.has(id)) return true
    }
    return false
  }, [assigneesQuery.data, selectedMemberIds])

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    setAssigneesMutation.isPending

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[700px] lg:max-w-[800px]">
        <SidebarProvider className="items-start">
          {/* Sidebar Navigation */}
          <Sidebar collapsible="none" className="hidden md:flex border-r">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {settingsNav.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          onClick={() => setActiveSection(item.id)}
                          isActive={activeSection === item.id}
                          className="cursor-pointer"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          {/* Main Content Area */}
          <main className="flex h-[550px] flex-1 flex-col overflow-hidden">
            {/* Header */}
            <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
              <div>
                <h2 className="text-lg font-semibold">
                  {isEditMode ? 'Edit Booking Calendar' : 'Create Booking Calendar'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {settingsNav.find((n) => n.id === activeSection)?.name}
                </p>
              </div>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* General Section */}
              {activeSection === 'general' && (
                <div className="space-y-6">
                  {/* Active toggle */}
                  {isEditMode && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label>Active</Label>
                        <p className="text-xs text-muted-foreground">
                          When disabled, people can&apos;t book this calendar
                        </p>
                      </div>
                      <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                  )}

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
                      <span className="text-sm text-muted-foreground shrink-0">/book/</span>
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

                  {/* Duration and Color */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Duration
                      </Label>
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
                      <Label className="flex items-center gap-1.5">
                        <Palette className="h-3.5 w-3.5" />
                        Color
                      </Label>
                      <Select value={color} onValueChange={setColor}>
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
                    </div>
                  </div>

                  {/* Max Booking Days */}
                  {/* WHY: Limits how far ahead external users can book appointments */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Max Booking Days Ahead
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={maxBookingDays}
                      onChange={(e) => setMaxBookingDays(e.target.value)}
                      placeholder="Unlimited"
                    />
                    <p className="text-xs text-muted-foreground">
                      Limit how far ahead people can book. Leave empty for unlimited.
                    </p>
                  </div>

                  {/* Location Type */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <LinkIcon className="h-3.5 w-3.5" />
                      Meeting Location
                    </Label>
                    <Select value={locationType} onValueChange={setLocationType}>
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

                  {/* Custom Link */}
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
                    </div>
                  )}
                </div>
              )}

              {/* Schedule Section */}
              {activeSection === 'schedule' && (
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <h3 className="font-medium">Smart Availability</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Available time slots are automatically calculated based on your assigned
                      team members&apos; personal availability settings.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      A slot is available when <strong>at least one</strong> team member is
                      free during that time.
                    </p>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                    <p className="text-sm font-medium">To adjust availability:</p>
                    <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                      <li>Go to <strong>Settings → Profile</strong></li>
                      <li>Scroll to the <strong>Availability</strong> section</li>
                      <li>Set your working hours and timezone</li>
                    </ol>
                  </div>

                  {selectedMemberIds.size > 0 && (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                      <strong>{selectedMemberIds.size}</strong> team member
                      {selectedMemberIds.size !== 1 ? 's' : ''} assigned to this calendar.
                    </div>
                  )}

                  {selectedMemberIds.size === 0 && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-400">
                      No team members assigned yet. Go to the Team tab to assign members.
                    </div>
                  )}
                </div>
              )}

              {/* Team Section */}
              {activeSection === 'team' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Assign team members to handle bookings for this calendar. Available time
                      slots are based on each member&apos;s personal availability settings.
                    </p>
                    <p className="text-sm font-medium text-primary">
                      At least one team member is required.
                    </p>
                  </div>

                  {/* Members List */}
                  <div className="space-y-2">
                    {membersQuery.isLoading || (isEditMode && assigneesQuery.isLoading) ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                            <Skeleton className="h-5 w-5 rounded" />
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <div className="space-y-1 flex-1">
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

                              <Avatar className="h-8 w-8">
                                <AvatarImage src={member.user?.image ?? undefined} />
                                <AvatarFallback className="text-xs">
                                  {member.user?.name?.charAt(0).toUpperCase() ?? '?'}
                                </AvatarFallback>
                              </Avatar>

                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                  {member.user?.name ?? 'Unknown'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.user?.email ?? ''}
                                </p>
                              </div>

                              <Badge variant="outline" className="text-xs capitalize">
                                {member.role}
                              </Badge>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No team members found</p>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  {selectedMemberIds.size > 0 && (
                    <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                      <strong>{selectedMemberIds.size}</strong> team member
                      {selectedMemberIds.size !== 1 ? 's' : ''} selected. Time slots will be
                      shown when at least one team member is available based on their personal
                      availability settings.
                    </div>
                  )}

                  {!isEditMode && selectedMemberIds.size === 0 && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-400">
                      Select at least one team member to enable calendar creation.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sticky Footer with Save Button */}
            <footer className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex justify-end">
                {/* Create mode: single button to create calendar */}
                {!isEditMode && (
                  <Button onClick={handleSaveGeneral} disabled={isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Calendar
                  </Button>
                )}

                {/* Edit mode: show appropriate save button based on active section */}
                {isEditMode && activeSection === 'general' && (
                  <Button onClick={handleSaveGeneral} disabled={isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Changes
                  </Button>
                )}

                {isEditMode && activeSection === 'team' && (
                  <Button
                    onClick={handleSaveTeamMembers}
                    disabled={isSaving || !hasTeamChanges || selectedMemberIds.size === 0}
                  >
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Team Members
                  </Button>
                )}

                {/* Schedule section has no save - it's informational only */}
                {isEditMode && activeSection === 'schedule' && (
                  <Button variant="outline" onClick={() => setActiveSection('team')}>
                    Go to Team Settings
                  </Button>
                )}
              </div>
            </footer>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
