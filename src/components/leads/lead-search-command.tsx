'use client'

/**
 * Lead Search Command Component
 *
 * REUSABLE component for searching and selecting leads across the app.
 * Uses command pattern with search, load more pagination, and create option.
 *
 * USE CASES:
 * - Email builder (Test button for variable preview)
 * - Inbox email composer (To field)
 * - Invoice builder (recipient selection)
 * - Contract builder (signee selection)
 * - Any feature that needs lead selection
 *
 * FEATURES:
 * - Command/Palette style UI with keyboard navigation
 * - Load more pagination using tRPC
 * - Search by name or email
 * - "Create new lead" option at bottom
 * - Integrates with existing CreateLeadDialog
 *
 * SOURCE OF TRUTH KEYWORDS: LeadSearchCommand, LeadPicker, LeadSelector
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import {
  Search,
  Loader2,
  User,
  UserPlus,
  Check,
  Mail,
  Phone,
  ChevronDown,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { trpc } from '@/trpc/react-provider'
import { getLeadAvatarColor } from '@/lib/utils/lead-helpers'
import { getTextColorForBackground } from '@/constants/colors'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Simplified lead type for the picker.
 * Contains only what's needed for display and selection.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadOption, LeadPickerItem
 */
export interface LeadOption {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  phone: string | null
  avatarUrl: string | null
}

interface LeadSearchCommandProps {
  /** Organization ID for fetching leads */
  organizationId: string
  /** Callback when a lead is selected */
  onSelect: (lead: LeadOption) => void
  /** Whether the command dialog is open */
  open: boolean
  /** Callback to control open state */
  onOpenChange: (open: boolean) => void
  /** Optional: Currently selected lead ID (for showing check mark) */
  selectedLeadId?: string
  /** Optional: Show create lead option (default: true) */
  showCreateOption?: boolean
  /** Optional: Callback when create new lead is triggered */
  onCreateNew?: () => void
  /** Optional: Title for the dialog */
  title?: string
  /** Optional: Placeholder for search input */
  placeholder?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get display name from lead first/last name
 */
function getDisplayName(lead: LeadOption): string {
  const parts = [lead.firstName, lead.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : lead.email.split('@')[0]
}

/**
 * Get initials from lead name for avatar fallback
 */
function getInitials(lead: LeadOption): string {
  const name = getDisplayName(lead)
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

export function LeadSearchCommand({
  organizationId,
  onSelect,
  open,
  onOpenChange,
  selectedLeadId,
  showCreateOption = true,
  onCreateNew,
  title = 'Search Leads',
  placeholder = 'Search by name or email...',
}: LeadSearchCommandProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [accumulatedLeads, setAccumulatedLeads] = useState<LeadOption[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  // Track last search to detect changes
  const lastSearchRef = useRef(search)
  const lastOpenRef = useRef(open)

  /**
   * Fetch leads with standard pagination.
   */
  const { data, isLoading, isFetching } = trpc.leads.list.useQuery(
    {
      organizationId,
      search: search.length >= 2 ? search : undefined,
      page,
      pageSize: 20,
    },
    {
      enabled: open && !!organizationId,
    }
  )

  /**
   * Transform leads from query data into LeadOption format.
   */
  const currentPageLeads = useMemo<LeadOption[]>(() => {
    if (!data?.leads) return []
    return data.leads.map((lead) => ({
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      avatarUrl: lead.avatarUrl,
    }))
  }, [data])

  /**
   * Handle search change - reset pagination
   */
  const handleSearchChange = useCallback((value: string) => {
    if (value !== lastSearchRef.current) {
      lastSearchRef.current = value
      setSearch(value)
      setPage(1)
      setAccumulatedLeads([])
    }
  }, [])

  /**
   * Handle dialog open change - reset state when closing
   */
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen && lastOpenRef.current) {
      // Reset state when closing
      lastSearchRef.current = ''
      setSearch('')
      setPage(1)
      setAccumulatedLeads([])
    }
    lastOpenRef.current = newOpen
    onOpenChange(newOpen)
  }, [onOpenChange])

  /**
   * Compute all leads - either from accumulated or current page
   * For page 1, use current page leads. For subsequent pages, accumulate.
   */
  const allLeads = useMemo<LeadOption[]>(() => {
    if (page === 1) {
      return currentPageLeads
    }
    // For page > 1, we need to accumulate
    // This works because handleLoadMore updates accumulatedLeads
    const existingIds = new Set(accumulatedLeads.map((l) => l.id))
    const newLeads = currentPageLeads.filter((l) => !existingIds.has(l.id))
    return [...accumulatedLeads, ...newLeads]
  }, [page, currentPageLeads, accumulatedLeads])

  /**
   * Check if there are more pages to load
   */
  const hasNextPage = data ? data.page < data.totalPages : false
  const totalCount = data?.total ?? 0

  /**
   * Load more leads - increment page and store current leads
   */
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetching) {
      // Save current leads before loading more
      setAccumulatedLeads(allLeads)
      setPage((p) => p + 1)
    }
  }, [hasNextPage, isFetching, allLeads])

  /**
   * Handle lead selection
   */
  const handleSelect = useCallback(
    (lead: LeadOption) => {
      onSelect(lead)
      onOpenChange(false)
    },
    [onSelect, onOpenChange]
  )

  /**
   * Handle create new lead
   */
  const handleCreateNew = useCallback(() => {
    onOpenChange(false)
    onCreateNew?.()
  }, [onOpenChange, onCreateNew])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 max-w-lg overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Command className="rounded-lg border-none" shouldFilter={false}>
          {/* Search input — CommandInput already includes a search icon and border */}
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={handleSearchChange}
          />

          {/* Results list */}
          <CommandList
            ref={listRef}
            className="max-h-[400px] overflow-y-auto"
          >
            {/* Loading state */}
            {isLoading && page === 1 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty state — centered in the list area */}
            {!isLoading && allLeads.length === 0 && search.length >= 2 && (
              <CommandEmpty className="py-8 flex flex-col items-center justify-center text-center">
                <User className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No leads found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Try a different search term
                </p>
              </CommandEmpty>
            )}

            {/* Prompt to search */}
            {!isLoading && allLeads.length === 0 && search.length < 2 && (
              <div className="py-8 text-center">
                <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Start typing to search leads
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Enter at least 2 characters
                </p>
              </div>
            )}

            {/* Lead results */}
            {allLeads.length > 0 && (
              <CommandGroup heading={`Leads (${totalCount})`}>
                {allLeads.map((lead) => (
                  <CommandItem
                    key={lead.id}
                    value={lead.id}
                    onSelect={() => handleSelect(lead)}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage
                        src={lead.avatarUrl ?? undefined}
                        alt={getDisplayName(lead)}
                      />
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={{
                          backgroundColor: getLeadAvatarColor(lead.id, lead.firstName),
                          color: getTextColorForBackground(getLeadAvatarColor(lead.id, lead.firstName)),
                        }}
                      >
                        {getInitials(lead)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {getDisplayName(lead)}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          {lead.email}
                        </span>
                        {lead.phone && (
                          <span className="flex items-center gap-1 shrink-0">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Check mark for selected lead */}
                    {selectedLeadId === lead.id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                ))}

                {/* Load more button */}
                {hasNextPage && (
                  <div className="flex items-center justify-center py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={isFetching}
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      {isFetching ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          <span>Load More</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* End of list indicator */}
                {!hasNextPage && allLeads.length > 0 && (
                  <div className="py-2 text-center">
                    <span className="text-xs text-muted-foreground/50">
                      End of results
                    </span>
                  </div>
                )}
              </CommandGroup>
            )}

            {/* Create new lead option */}
            {showCreateOption && onCreateNew && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCreateNew}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer text-primary"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">Create New Lead</p>
                      <p className="text-xs text-muted-foreground">
                        Add a new lead to your organization
                      </p>
                    </div>
                  </CommandItem>
                </CommandGroup>
              </>
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
 * Hook to easily use LeadSearchCommand with state management.
 *
 * SOURCE OF TRUTH KEYWORDS: useLeadSearch, LeadSearchHook
 *
 * @example
 * const { isOpen, openSearch, closeSearch, LeadSearchDialog } = useLeadSearch({
 *   organizationId,
 *   onSelect: (lead) => console.log('Selected:', lead),
 * })
 *
 * return (
 *   <>
 *     <Button onClick={openSearch}>Select Lead</Button>
 *     <LeadSearchDialog />
 *   </>
 * )
 */
export function useLeadSearch({
  organizationId,
  onSelect,
  selectedLeadId,
  showCreateOption = true,
  onCreateNew,
  title,
  placeholder,
}: Omit<LeadSearchCommandProps, 'open' | 'onOpenChange'>) {
  const [isOpen, setIsOpen] = useState(false)

  const openSearch = useCallback(() => setIsOpen(true), [])
  const closeSearch = useCallback(() => setIsOpen(false), [])

  const LeadSearchDialog = useCallback(
    () => (
      <LeadSearchCommand
        organizationId={organizationId}
        onSelect={onSelect}
        open={isOpen}
        onOpenChange={setIsOpen}
        selectedLeadId={selectedLeadId}
        showCreateOption={showCreateOption}
        onCreateNew={onCreateNew}
        title={title}
        placeholder={placeholder}
      />
    ),
    [
      organizationId,
      onSelect,
      isOpen,
      selectedLeadId,
      showCreateOption,
      onCreateNew,
      title,
      placeholder,
    ]
  )

  return {
    isOpen,
    openSearch,
    closeSearch,
    setIsOpen,
    LeadSearchDialog,
  }
}
