'use client'

/**
 * Team Search Command Component
 *
 * REUSABLE component for searching and selecting team members across the app.
 * Uses command pattern with search functionality.
 *
 * USE CASES:
 * - Pipeline tickets (assignee selection)
 * - Task assignment
 * - Any feature that needs team member selection
 *
 * FEATURES:
 * - Command/Palette style UI with keyboard navigation
 * - Search by name or email
 * - Uses organization members from tRPC
 *
 * SOURCE OF TRUTH KEYWORDS: TeamSearchCommand, TeamMemberPicker, TeamMemberSelector
 */

import { useState, useCallback, useMemo } from 'react'
import { Search, Loader2, User, Check } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Simplified team member type for the picker.
 * Contains only what's needed for display and selection.
 *
 * SOURCE OF TRUTH KEYWORDS: TeamMemberOption, TeamMemberPickerItem
 */
export interface TeamMemberOption {
  id: string
  name: string
  email: string
  image: string | null
}

interface TeamSearchCommandProps {
  /** Organization ID for fetching team members */
  organizationId: string
  /** Callback when a team member is selected */
  onSelect: (member: TeamMemberOption | null) => void
  /** Whether the command dialog is open */
  open: boolean
  /** Callback to control open state */
  onOpenChange: (open: boolean) => void
  /** Optional: Currently selected member ID (for showing check mark) */
  selectedMemberId?: string | null
  /** Optional: Allow unassigning (default: true) */
  allowUnassign?: boolean
  /** Optional: Title for the dialog */
  title?: string
  /** Optional: Placeholder for search input */
  placeholder?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get initials from name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TeamSearchCommand({
  organizationId,
  onSelect,
  open,
  onOpenChange,
  selectedMemberId,
  allowUnassign = true,
  title = 'Select Team Member',
  placeholder = 'Search by name or email...',
}: TeamSearchCommandProps) {
  const [search, setSearch] = useState('')

  /**
   * Fetch organization members
   */
  const { data, isLoading } = trpc.organization.getOrganizationMembers.useQuery(
    { organizationId },
    {
      enabled: open && !!organizationId,
      staleTime: 60000,
    }
  )

  /**
   * Transform and filter members
   */
  const members = useMemo<TeamMemberOption[]>(() => {
    if (!data) return []

    const transformed = data
      .filter((member) => !member.isPending)
      .map((member) => ({
        id: member.id,
        name: member.user.name ?? 'Unknown',
        email: member.user.email,
        image: member.user.image ?? null,
      }))

    // Filter by search term
    if (search.length >= 1) {
      const searchLower = search.toLowerCase()
      return transformed.filter(
        (m) =>
          m.name.toLowerCase().includes(searchLower) ||
          m.email.toLowerCase().includes(searchLower)
      )
    }

    return transformed
  }, [data, search])

  /**
   * Handle search change
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [])

  /**
   * Handle dialog open change - reset state when closing
   */
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setSearch('')
      }
      onOpenChange(newOpen)
    },
    [onOpenChange]
  )

  /**
   * Handle member selection
   */
  const handleSelect = useCallback(
    (member: TeamMemberOption | null) => {
      onSelect(member)
      onOpenChange(false)
    },
    [onSelect, onOpenChange]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 max-w-md overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Command className="rounded-lg border-none" shouldFilter={false}>
          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={handleSearchChange}
              className="h-12 border-none focus:ring-0"
            />
          </div>

          {/* Results list */}
          <CommandList className="max-h-[300px] overflow-y-auto">
            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty state */}
            {!isLoading && members.length === 0 && search.length >= 1 && (
              <CommandEmpty className="py-8">
                <User className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No members found</p>
              </CommandEmpty>
            )}

            {/* Unassign option */}
            {allowUnassign && !isLoading && (
              <CommandGroup>
                <CommandItem
                  value="unassigned"
                  onSelect={() => handleSelect(null)}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground">Unassigned</span>
                  {!selectedMemberId && (
                    <Check className="h-4 w-4 text-primary ml-auto shrink-0" />
                  )}
                </CommandItem>
              </CommandGroup>
            )}

            {/* Member results */}
            {!isLoading && members.length > 0 && (
              <CommandGroup heading="Team Members">
                {members.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.id}
                    onSelect={() => handleSelect(member)}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={member.image ?? undefined} alt={member.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.email}
                      </p>
                    </div>

                    {/* Check mark for selected member */}
                    {selectedMemberId === member.id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// EXPORT HOOK FOR EASY USAGE
// ============================================================================

/**
 * Hook to easily use TeamSearchCommand with state management.
 *
 * SOURCE OF TRUTH KEYWORDS: useTeamSearch, TeamSearchHook
 */
export function useTeamSearch({
  organizationId,
  onSelect,
  selectedMemberId,
  allowUnassign = true,
  title,
  placeholder,
}: Omit<TeamSearchCommandProps, 'open' | 'onOpenChange'>) {
  const [isOpen, setIsOpen] = useState(false)

  const openSearch = useCallback(() => setIsOpen(true), [])
  const closeSearch = useCallback(() => setIsOpen(false), [])

  const TeamSearchDialog = useCallback(
    () => (
      <TeamSearchCommand
        organizationId={organizationId}
        onSelect={onSelect}
        open={isOpen}
        onOpenChange={setIsOpen}
        selectedMemberId={selectedMemberId}
        allowUnassign={allowUnassign}
        title={title}
        placeholder={placeholder}
      />
    ),
    [organizationId, onSelect, isOpen, selectedMemberId, allowUnassign, title, placeholder]
  )

  return {
    isOpen,
    openSearch,
    closeSearch,
    setIsOpen,
    TeamSearchDialog,
  }
}
