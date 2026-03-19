'use client'

/**
 * Booking Calendars Content Component
 *
 * WHY: Main client component for managing booking calendars
 * HOW: Lists all booking calendars with options to create, edit, delete, and copy link
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, CalendarManagement, BookingList
 */

import { useState, useCallback } from 'react'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { trpc } from '@/trpc/react-provider'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Plus,
  MoreHorizontal,
  Clock,
  Edit,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Video,
  Users,
  Globe,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { BookingCalendarSettingsDialog } from './booking-calendar-settings-dialog'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Assignee user info for avatar display
 * SOURCE OF TRUTH: BookingCalendarAssignee with Member and User relations
 */
type AssigneeUser = {
  id: string
  name: string | null
  email: string
  image: string | null
}

type CalendarAssignee = {
  id: string
  member: {
    id: string
    user: AssigneeUser
  }
}

/**
 * BookingCalendar type for UI display
 * SOURCE OF TRUTH: BookingCalendarUIType
 * Note: createdAt comes as string from tRPC serialization
 */
type BookingCalendar = {
  id: string
  name: string
  slug: string
  description: string | null
  duration: number
  color: string
  isActive: boolean
  locationType: string
  createdAt: string | Date
  assignees?: CalendarAssignee[]
  /** Max days ahead a booker can see/book. null = unlimited. */
  maxBookingDays?: number | null
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
// LOADING SKELETON
// ============================================================================

function BookingCalendarsSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// BOOKING CALENDAR ROW
// ============================================================================

function BookingCalendarRow({
  calendar,
  organizationSlug,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: {
  calendar: BookingCalendar
  organizationSlug: string
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
  canDelete: boolean
}) {
  const [copied, setCopied] = useState(false)

  // Generate public booking URL
  const bookingUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/book/${organizationSlug}/${calendar.slug}`

  // Copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }, [bookingUrl])

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors',
        !calendar.isActive && 'opacity-50'
      )}
    >
      {/* Left: Calendar info */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{calendar.name}</span>
            {!calendar.isActive && (
              <Badge variant="secondary" className="text-xs">
                Inactive
              </Badge>
            )}
          </div>
          {calendar.description && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {calendar.description}
            </p>
          )}
          {/* Duration & location shown inline on mobile (hidden on md+ where separate column exists) */}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground md:hidden">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(calendar.duration)}
            </span>
            <span className="flex items-center gap-1">
              <Video className="h-3 w-3" />
              {calendar.locationType === 'google_meet' ? 'Google Meet' : 'Custom Link'}
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Team Members Avatars */}
      <div className="hidden sm:flex items-center px-4">
        {calendar.assignees && calendar.assignees.length > 0 ? (
          <TooltipProvider delayDuration={200}>
            <div className="flex -space-x-2">
              {/* Show first 3 avatars */}
              {calendar.assignees.slice(0, 3).map((assignee) => (
                <Tooltip key={assignee.id}>
                  <TooltipTrigger asChild>
                    <Avatar className="h-7 w-7 border-2 border-background cursor-default">
                      <AvatarImage
                        src={assignee.member.user.image ?? undefined}
                        alt={assignee.member.user.name ?? 'Team member'}
                      />
                      <AvatarFallback className="text-xs bg-muted">
                        {(assignee.member.user.name ?? assignee.member.user.email)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{assignee.member.user.name ?? assignee.member.user.email}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {/* Show +N indicator if more than 3 */}
              {calendar.assignees.length > 3 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center cursor-default">
                      <span className="text-xs font-medium text-muted-foreground">
                        +{calendar.assignees.length - 3}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{calendar.assignees.length - 3} more team members</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        ) : (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-default">
                  <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>No team members assigned</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Middle: Duration & Location */}
      <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground px-4">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(calendar.duration)}
        </span>
        <span className="flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5" />
          {calendar.locationType === 'google_meet' ? 'Google Meet' : 'Custom Link'}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleCopyLink}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => window.open(bookingUrl, '_blank')}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>

        {(canEdit || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Video className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium mb-1">No booking calendars</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Create a booking calendar to let people schedule meetings with you.
      </p>
      <Button onClick={onCreateClick} size="sm">
        <Plus className="h-4 w-4 mr-2" />
        Create Calendar
      </Button>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BookingCalendarsContent() {
  // Organization and permissions
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()

  const canRead = hasPermission(permissions.CALENDAR_READ)
  const canCreate = hasPermission(permissions.CALENDAR_CREATE)
  const canEdit = hasPermission(permissions.CALENDAR_UPDATE)
  const canDelete = hasPermission(permissions.CALENDAR_DELETE)

  // Dialog states - unified settings dialog for create/edit
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [editingCalendar, setEditingCalendar] = useState<BookingCalendar | null>(null)
  const [deletingCalendar, setDeletingCalendar] = useState<BookingCalendar | null>(null)

  // Handler to open create dialog
  const openCreateDialog = useCallback(() => {
    setEditingCalendar(null)
    setSettingsDialogOpen(true)
  }, [])

  // Handler to open edit dialog
  const openEditDialog = useCallback((calendar: BookingCalendar) => {
    setEditingCalendar(calendar)
    setSettingsDialogOpen(true)
  }, [])

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  // Fetch booking calendars
  const calendarsQuery = trpc.bookingCalendar.list.useQuery(
    { organizationId: activeOrganization?.id ?? '' },
    { enabled: !!activeOrganization?.id && canRead }
  )

  // Delete mutation
  const deleteMutation = trpc.bookingCalendar.delete.useMutation({
    onSuccess: () => {
      utils.bookingCalendar.list.invalidate()
      toast.success('Calendar deleted')
      setDeletingCalendar(null)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete')
    },
  })

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(() => {
    if (!deletingCalendar || !activeOrganization) return
    deleteMutation.mutate({
      organizationId: activeOrganization.id,
      calendarId: deletingCalendar.id,
    })
  }, [deletingCalendar, activeOrganization, deleteMutation])

  // Loading state
  if (isLoadingOrg && !activeOrganization) {
    return <BookingCalendarsSkeleton />
  }

  // No organization
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found.
        </p>
      </div>
    )
  }

  // No permission
  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            No permission to view booking calendars
          </p>
        </div>
      </div>
    )
  }

  const calendars = calendarsQuery.data ?? []

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Page header */}
      <div className="border-b">
        <PageHeader />
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Header with title and create button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold">Booking Calendars</h1>
            <p className="text-sm text-muted-foreground">
              Let people schedule meetings with you
            </p>
          </div>
          {canCreate && (
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Calendar
            </Button>
          )}
        </div>

        {/* Loading state */}
        {calendarsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : calendars.length === 0 ? (
          <EmptyState onCreateClick={openCreateDialog} />
        ) : (
          <div className="space-y-2">
            {calendars.map((calendar) => (
              <BookingCalendarRow
                key={calendar.id}
                calendar={calendar as BookingCalendar}
                organizationSlug={activeOrganization.slug}
                onEdit={() => openEditDialog(calendar as BookingCalendar)}
                onDelete={() => setDeletingCalendar(calendar as BookingCalendar)}
                canEdit={canEdit}
                canDelete={canDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Unified Settings Dialog (handles both create and edit) */}
      <BookingCalendarSettingsDialog
        open={settingsDialogOpen}
        onOpenChange={(open) => {
          setSettingsDialogOpen(open)
          if (!open) setEditingCalendar(null)
        }}
        calendar={editingCalendar}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deletingCalendar} onOpenChange={(open) => !open && setDeletingCalendar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Calendar</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deletingCalendar?.name}&quot;? The booking link will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
