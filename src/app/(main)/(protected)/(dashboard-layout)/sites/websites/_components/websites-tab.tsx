/**
 * Websites Tab Component
 *
 * WHY: Main container for website management with table/grid layout
 * HOW: Uses WebsitesTable for table view, WebsitesGrid for card grid view
 *
 * ARCHITECTURE:
 * - Server-side pagination with search
 * - Dual view: Table (bulk operations) or Grid (visual previews)
 * - Navigates to /{website.previewId}/{slug}/edit for website editing
 * - Full CRUD with optimistic updates
 * - Header button is controlled by parent via onRegisterOpenDialog callback
 *
 * VIEW MODES:
 * - Table: Traditional table with checkboxes, bulk operations, sorting
 * - Grid: Visual card grid with screenshot previews (like email templates)
 *
 * PERMISSIONS:
 * - canCreate: Enable "Add Website" functionality (button rendered by parent)
 * - canUpdate: Navigate to builder for editing
 * - canDelete: Show delete buttons and bulk delete
 *
 * NOTE: Publish status is now at the PAGE level, not website level.
 * Each page can be individually published/unpublished in the builder.
 *
 * SOURCE OF TRUTH KEYWORDS: WebsitesTab, WebsitesList, WebsiteViewToggle
 */

'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Grid3X3, List } from 'lucide-react'
import { useDebounce } from '@/hooks/use-debounce'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WebsitesTable, type WebsiteWithStatus } from './websites-table'
import { WebsitesGrid } from './websites-grid'
import { WebsiteDialog } from './website-dialog'
import { DeleteWebsiteDialog } from './delete-website-dialog'
import { BulkDeleteWebsitesDialog } from './bulk-delete-websites-dialog'
import { permissions } from '@/lib/better-auth/permissions'

/**
 * View mode type for switching between table and grid views.
 */
type ViewMode = 'table' | 'grid'

interface WebsitesTabProps {
  organizationId: string
  userRole: string
  userPermissions: string[]
  /** Callback to register dialog opener with parent (for header button) */
  onRegisterOpenDialog?: (fn: () => void) => void
}

export function WebsitesTab({
  organizationId,
  userRole,
  userPermissions,
  onRegisterOpenDialog,
}: WebsitesTabProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  // Compute permissions
  const canCreate = useMemo(
    () =>
      userRole === 'owner' ||
      userPermissions.includes(permissions.WEBSITES_CREATE),
    [userRole, userPermissions]
  )
  const canUpdate = useMemo(
    () =>
      userRole === 'owner' ||
      userPermissions.includes(permissions.WEBSITES_UPDATE),
    [userRole, userPermissions]
  )
  const canDelete = useMemo(
    () =>
      userRole === 'owner' ||
      userPermissions.includes(permissions.WEBSITES_DELETE),
    [userRole, userPermissions]
  )

  // View mode state - grid view shows visual previews, table shows bulk operations
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Search state
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  // Pagination state - different defaults for table vs grid
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(viewMode === 'grid' ? 12 : 10)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Dialog state
  const [websiteDialogOpen, setWebsiteDialogOpen] = useState(false)

  // Delete dialog state - for single website deletion with name confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [websiteToDelete, setWebsiteToDelete] =
    useState<WebsiteWithStatus | null>(null)

  // Bulk delete dialog state
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [websitesToBulkDelete, setWebsitesToBulkDelete] = useState<
    WebsiteWithStatus[]
  >([])

  // Reset page when search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Query websites with pagination
  // Uses aggressive caching to prevent refetching on every page visit
  const { data, isLoading, isFetching } = trpc.websites.list.useQuery(
    {
      organizationId,
      search: debouncedSearch || undefined,
      page,
      pageSize,
    },
    {
      enabled: !!organizationId,
      placeholderData: (previousData) => previousData,
      // Cache for 5 minutes - data is considered fresh and won't refetch
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 30 minutes after component unmounts
      gcTime: 30 * 60 * 1000,
      // Don't refetch when window regains focus
      refetchOnWindowFocus: false,
    }
  )

  // Memoize websites data for stable reference
  const websites = useMemo(() => data?.websites ?? [], [data?.websites])
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  // Bulk delete mutation with optimistic update
  const bulkDeleteMutation = trpc.websites.bulkDelete.useMutation({
    onMutate: async ({ websiteIds }) => {
      // Cancel outgoing queries
      await utils.websites.list.cancel()

      // Get current query key
      const queryKey = {
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      }
      const previousData = utils.websites.list.getData(queryKey)

      // Optimistically update the cache
      utils.websites.list.setData(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          websites: old.websites.filter((w) => !websiteIds.includes(w.id)),
          total: old.total - websiteIds.length,
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.websites.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error(err.message || 'Failed to delete websites')
    },
    onSuccess: (result) => {
      toast.success(
        `${result.count} website${result.count > 1 ? 's' : ''} deleted`
      )
      setSelectedIds([])
    },
    onSettled: () => {
      // Always refetch to ensure sync
      utils.websites.list.invalidate()
    },
  })

  // Delete single website mutation with optimistic update
  const deleteMutation = trpc.websites.delete.useMutation({
    onMutate: async ({ websiteId }) => {
      await utils.websites.list.cancel()

      const queryKey = {
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      }
      const previousData = utils.websites.list.getData(queryKey)

      utils.websites.list.setData(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          websites: old.websites.filter((w) => w.id !== websiteId),
          total: old.total - 1,
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      if (context?.previousData) {
        utils.websites.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error(err.message || 'Failed to delete website')
    },
    onSuccess: () => {
      toast.success('Website deleted')
    },
    onSettled: () => {
      utils.websites.list.invalidate()
    },
  })

  // Handlers
  const handleSearch = useCallback((value: string) => {
    setSearch(value)
  }, [])

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
  }, [])

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize)
    setPage(1)
  }, [])

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids)
  }, [])

  /**
   * Build the edit URL for a website.
   *
   * WHY: Uses the best available identifier for clean, functional URLs.
   * HOW: Prefers domain.customDomain for production-ready URLs,
   *      falls back to previewId for preview URLs.
   *
   * URL IDENTIFIER PRIORITY:
   * 1. domain.customDomain (e.g., "webprodigies.com") - for production URLs
   * 2. previewId (e.g., "a7x9k2m5") - for preview URLs
   * 3. website.id - last resort fallback
   *
   * Returns null only if website has no pages.
   */
  const getEditUrl = useCallback(
    (website: WebsiteWithStatus): string | null => {
      const firstPageSlug = website.pages?.[0]?.slug
      if (!firstPageSlug) return null

      // Prefer customDomain when connected (cleaner production URL)
      // Fallback to previewId for preview URLs, then website ID as last resort
      const identifier = website.domain?.customDomain || website.previewId || website.id
      return `/${identifier}/${firstPageSlug}/edit`
    },
    []
  )

  /**
   * Track which URLs have been prefetched to avoid duplicate calls.
   * Also used for debouncing hover events.
   */
  const prefetchedUrlsRef = useRef<Set<string>>(new Set())
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Prefetch the builder page on hover (debounced).
   *
   * WHY: By the time user clicks, the page is already in browser cache.
   * HOW: Uses Next.js router.prefetch() which loads the page bundle ahead of time.
   *
   * DEBOUNCE: Waits 150ms before prefetching to avoid spam when scrolling.
   * DEDUP: Only prefetches each URL once per session.
   */
  const handleWebsiteHover = useCallback(
    (website: WebsiteWithStatus) => {
      const url = getEditUrl(website)
      if (!url) return

      // Skip if already prefetched
      if (prefetchedUrlsRef.current.has(url)) return

      // Clear any pending prefetch
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }

      // Debounce: wait 150ms before prefetching
      hoverTimeoutRef.current = setTimeout(() => {
        if (!prefetchedUrlsRef.current.has(url)) {
          router.prefetch(url)
          prefetchedUrlsRef.current.add(url)
        }
      }, 150)
    },
    [router, getEditUrl]
  )

  /**
   * Navigate to website builder using first page slug.
   *
   * WHY: A "Website" is a CATEGORY/GROUPING, not a single page.
   * Pages are now FIRST-CLASS entities in the Page table, not embedded in canvasData.
   *
   * HOW: The first page slug is already included in the list query response,
   * so we can navigate INSTANTLY without any extra network request.
   * The page is also prefetched on hover for even faster navigation.
   *
   * FALLBACK: Uses /_/[websiteId]/[slug]/edit when domain is deleted.
   */
  const handleWebsiteClick = useCallback(
    (website: WebsiteWithStatus) => {
      const url = getEditUrl(website)

      if (!url) {
        toast.error('This website has no pages yet. Add a page first.')
        return
      }

      // Navigate instantly - uses fallback route if domain is deleted
      router.push(url)
    },
    [router, getEditUrl]
  )

  // Open bulk delete confirmation dialog (called from table)
  const handleRequestBulkDelete = useCallback(
    (ids: string[]) => {
      // Find the website objects for the selected IDs
      const selectedWebsites = websites.filter((w) => ids.includes(w.id))
      setWebsitesToBulkDelete(selectedWebsites)
      setBulkDeleteDialogOpen(true)
    },
    [websites]
  )

  // Confirm bulk delete (called from dialog)
  const handleConfirmBulkDelete = useCallback(
    (ids: string[]) => {
      bulkDeleteMutation.mutate(
        {
          organizationId,
          websiteIds: ids,
        },
        {
          onSuccess: () => {
            setBulkDeleteDialogOpen(false)
            setWebsitesToBulkDelete([])
            setSelectedIds([])
          },
        }
      )
    },
    [bulkDeleteMutation, organizationId]
  )

  // Open single delete confirmation dialog (called from table)
  const handleRequestDelete = useCallback(
    (id: string) => {
      const website = websites.find((w) => w.id === id)
      if (website) {
        setWebsiteToDelete(website)
        setDeleteDialogOpen(true)
      }
    },
    [websites]
  )

  // Confirm single delete (called from dialog)
  const handleConfirmDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(
        {
          organizationId,
          websiteId: id,
        },
        {
          onSuccess: () => {
            setDeleteDialogOpen(false)
            setWebsiteToDelete(null)
          },
        }
      )
    },
    [deleteMutation, organizationId]
  )

  const handleAddWebsite = useCallback(() => {
    setWebsiteDialogOpen(true)
  }, [])

  // Register dialog opener with parent component (for header button)
  useEffect(() => {
    if (onRegisterOpenDialog && canCreate) {
      onRegisterOpenDialog(handleAddWebsite)
    }
  }, [onRegisterOpenDialog, canCreate, handleAddWebsite])

  /**
   * Handle view mode change and reset pagination appropriately.
   * Grid view uses different page size defaults (multiples of grid columns).
   */
  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    if (newMode === viewMode) return
    setViewMode(newMode)
    setPage(1)
    // Reset page size to appropriate default for new view mode
    setPageSize(newMode === 'grid' ? 12 : 10)
    // Clear selections when switching views (table-only feature)
    setSelectedIds([])
  }, [viewMode])

  return (
    <>
      {/* View Mode Toggle - top right above content */}
      <div className="flex justify-end mb-4">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && handleViewModeChange(value as ViewMode)}
          className="bg-muted rounded-md p-1"
        >
          <ToggleGroupItem
            value="grid"
            aria-label="Grid view"
            className="h-8 px-3 data-[state=on]:bg-background gap-2"
          >
            <Grid3X3 className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Grid</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="table"
            aria-label="Table view"
            className="h-8 px-3 data-[state=on]:bg-background gap-2"
          >
            <List className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Table</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Grid View - Visual card grid with screenshot previews */}
      {viewMode === 'grid' && (
        <WebsitesGrid
          websites={websites}
          isLoading={isLoading}
          isFetching={isFetching}
          search={search}
          onSearchChange={handleSearch}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          total={total}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onWebsiteClick={handleWebsiteClick}
          onWebsiteHover={handleWebsiteHover}
          onDelete={canDelete ? handleRequestDelete : undefined}
          canDelete={canDelete}
        />
      )}

      {/* Table View - Traditional table with bulk operations */}
      {viewMode === 'table' && (
        <WebsitesTable
          websites={websites}
          isLoading={isLoading}
          isFetching={isFetching}
          search={search}
          onSearchChange={handleSearch}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          total={total}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          onWebsiteClick={handleWebsiteClick}
          onWebsiteHover={handleWebsiteHover}
          onBulkDelete={canDelete ? handleRequestBulkDelete : undefined}
          onDelete={canDelete ? handleRequestDelete : undefined}
          isBulkDeleting={bulkDeleteMutation.isPending}
          canDelete={canDelete}
        />
      )}

      {/* Add Website Dialog - Only render if canCreate */}
      {canCreate && (
        <WebsiteDialog
          open={websiteDialogOpen}
          onOpenChange={setWebsiteDialogOpen}
          organizationId={organizationId}
          website={null}
        />
      )}

      {/* Single Delete Confirmation Dialog - requires typing website name */}
      <DeleteWebsiteDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setWebsiteToDelete(null)
        }}
        website={websiteToDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteMutation.isPending}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <BulkDeleteWebsitesDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(open) => {
          setBulkDeleteDialogOpen(open)
          if (!open) setWebsitesToBulkDelete([])
        }}
        websites={websitesToBulkDelete}
        onConfirm={handleConfirmBulkDelete}
        isDeleting={bulkDeleteMutation.isPending}
      />
    </>
  )
}
