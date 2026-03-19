/**
 * Automations Page Content - List and Manage Automations with Folder Organization
 *
 * WHY: Client component that displays all automations in a paginated table with folder support
 * HOW: Uses tRPC to fetch automations from database with server-side pagination
 *
 * FEATURES:
 * - Folder-based organization (nested folders)
 * - URL state management for folders (?folder=xxx)
 * - Breadcrumb navigation
 * - Paginated table with sorting and search (debounced)
 * - Bulk selection and delete
 * - Create new automation dialog
 * - Edit/delete/toggle status/archive/duplicate/move actions
 * - Optimistic updates for mutations
 *
 * ARCHITECTURE:
 * - URL state for folder navigation (shareable links)
 * - Server-side pagination with search
 * - Table-based design with bulk operations
 * - Full CRUD with optimistic updates
 *
 * PERMISSIONS:
 * - automations:read - Required to view this page
 * - automations:create - Show "Create Automation" button
 * - automations:update - Allow editing automations
 * - automations:delete - Allow deleting automations
 * - automations:execute - Allow activating/pausing automations
 *
 * SOURCE OF TRUTH: Automation, AutomationFolder, AutomationBuilderTypes
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  PlusIcon,
  FolderPlus,
  Home,
  ChevronRight,
  MoreHorizontal,
  Palette,
  Trash2,
  Grid3X3,
  List,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/global/content-layout'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FolderShape } from '@/components/ui/folder-shape'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { useDebounce } from '@/hooks/use-debounce'
import { permissions } from '@/lib/better-auth/permissions'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AutomationsTable, type AutomationListItem } from './automations-table'
import { AutomationCard } from './automation-card'
import { BulkDeleteAutomationsDialog } from './bulk-delete-automations-dialog'
import { AutomationDialog } from './automation-dialog'
import { CreateAutomationFolderDialog } from './create-automation-folder-dialog'
import { EditAutomationFolderDialog } from './edit-automation-folder-dialog'
import { MoveAutomationDialog } from './move-automation-dialog'
import { FeatureGate } from '@/components/feature-gate'

// ============================================================================
// TYPES
// ============================================================================

/**
 * View mode for automations display — grid cards or table rows.
 * SOURCE OF TRUTH: AutomationsViewMode
 */
type ViewMode = 'grid' | 'list'

// ============================================================================
// LOADING SKELETON
// ============================================================================

/**
 * Loading skeleton for the automations page.
 * WHY: Show skeleton that matches the page structure during initial load.
 */
function AutomationsPageSkeleton() {
  return (
    <ContentLayout
      headerActions={
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Button disabled>
            <PlusIcon className="mr-2 h-4 w-4" />
            Create Automation
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-4 w-24" />
        </div>
        {/* Folder grid skeleton */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-3">
              <Skeleton className="w-16 h-12" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <AutomationsTable
          automations={[]}
          isLoading={true}
          isFetching={false}
          search=""
          onSearchChange={() => {}}
          page={1}
          pageSize={10}
          totalPages={1}
          total={0}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          selectedIds={[]}
          onSelectionChange={() => {}}
          onAutomationClick={() => {}}
          isBulkDeleting={false}
          canDelete={false}
          canUpdate={false}
          canExecute={false}
        />
      </div>
    </ContentLayout>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AutomationsPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()

  // URL state - folder ID from query params
  const currentFolderId = searchParams.get('folder') || null

  // View mode state — grid cards or table rows
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Search state with debounce
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [automationToDelete, setAutomationToDelete] = useState<AutomationListItem | null>(null)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [automationsToBulkDelete, setAutomationsToBulkDelete] = useState<AutomationListItem[]>([])

  // Folder dialog states
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [editFolderDialog, setEditFolderDialog] = useState<{
    open: boolean
    folderId: string
    folderName: string
    folderColor: string | null
  } | null>(null)
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{
    open: boolean
    folderId: string
    folderName: string
  } | null>(null)
  const [moveDialog, setMoveDialog] = useState<{
    open: boolean
    automationId: string
    automationName: string
    currentFolderId: string | null
  } | null>(null)

  /**
   * Get active organization and permissions.
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Permission checks.
   */
  const hasAccess = hasPermission(permissions.AUTOMATIONS_READ)
  const canCreate = hasPermission(permissions.AUTOMATIONS_CREATE)
  const canUpdate = hasPermission(permissions.AUTOMATIONS_UPDATE)
  const canDelete = hasPermission(permissions.AUTOMATIONS_DELETE)
  const canExecute = hasPermission(permissions.AUTOMATIONS_EXECUTE)

  // Reset page when search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // ==========================================================================
  // URL STATE MANAGEMENT
  // ==========================================================================

  /**
   * Update URL params - maintains folder context
   */
  const updateUrlParams = useCallback(
    (params: { folder?: string | null }) => {
      const newParams = new URLSearchParams(searchParams.toString())

      if (params.folder !== undefined) {
        if (params.folder === null) {
          newParams.delete('folder')
        } else {
          newParams.set('folder', params.folder)
        }
      }

      const queryString = newParams.toString()
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  /**
   * Navigate to a folder
   */
  const handleNavigateToFolder = useCallback(
    (folderId: string | null) => {
      updateUrlParams({ folder: folderId })
      // Reset pagination when navigating folders
      setPage(1)
      setSelectedIds([])
    },
    [updateUrlParams]
  )

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  /**
   * Fetch automations from database via tRPC with pagination.
   * When at root level (no folder selected), shows ALL automations.
   * When in a folder, shows only automations in that folder.
   */
  const {
    data: automationsData,
    isLoading: isLoadingAutomations,
    isFetching,
  } = trpc.automation.list.useQuery(
    {
      organizationId,
      search: debouncedSearch || undefined,
      page,
      pageSize,
      // Only filter by folder when explicitly viewing a folder
      // undefined = show all automations (root view)
      // string = show automations in specific folder
      folderId: currentFolderId,
    },
    {
      enabled: !!organizationId,
      placeholderData: (previousData) => previousData,
    }
  )

  /**
   * Fetch folders in current directory
   */
  const { data: folders, isLoading: isLoadingFolders } = trpc.automation.listFolders.useQuery(
    {
      organizationId,
      parentId: currentFolderId,
      search: debouncedSearch || undefined,
    },
    {
      enabled: !!organizationId,
      staleTime: 30000,
    }
  )

  /**
   * Fetch breadcrumb for current folder
   */
  const { data: breadcrumb } = trpc.automation.getFolderBreadcrumb.useQuery(
    { organizationId, folderId: currentFolderId! },
    { enabled: !!currentFolderId && !!organizationId }
  )

  // Memoize automations data
  const automations = useMemo(
    () => (automationsData?.automations ?? []) as unknown as AutomationListItem[],
    [automationsData?.automations]
  )
  const totalPages = automationsData?.totalPages ?? 1
  const total = automationsData?.total ?? 0

  // ==========================================================================
  // FOLDER MUTATIONS
  // ==========================================================================

  /**
   * Create folder mutation
   */
  const createFolderMutation = trpc.automation.createFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder created')
      utils.automation.listFolders.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create folder')
    },
  })

  /**
   * Update folder mutation
   */
  const updateFolderMutation = trpc.automation.updateFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder updated')
      utils.automation.listFolders.invalidate()
      setEditFolderDialog(null)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update folder')
    },
  })

  /**
   * Delete folder mutation
   */
  const deleteFolderMutation = trpc.automation.deleteFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder deleted')
      utils.automation.listFolders.invalidate()
      utils.automation.list.invalidate()
      setDeleteFolderDialog(null)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete folder')
    },
  })

  /**
   * Move automation to folder mutation
   */
  const moveMutation = trpc.automation.moveToFolder.useMutation({
    onSuccess: () => {
      toast.success('Automation moved')
      utils.automation.list.invalidate()
      utils.automation.listFolders.invalidate()
      setMoveDialog(null)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to move automation')
    },
  })

  // ==========================================================================
  // AUTOMATION MUTATIONS WITH OPTIMISTIC UPDATES
  // ==========================================================================

  /**
   * Update status mutation with optimistic update.
   */
  const updateStatusMutation = trpc.automation.updateStatus.useMutation({
    onMutate: async ({ automationId, status }) => {
      await utils.automation.list.cancel()

      const queryKey = {
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
        folderId: currentFolderId,
      }
      const previousData = utils.automation.list.getData(queryKey)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      utils.automation.list.setData(queryKey, (old: any) => {
        if (!old) return old
        return {
          ...old,
          automations: old.automations.map((a: { id: string }) =>
            a.id === automationId ? { ...a, status } : a
          ),
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      if (context?.previousData) {
        utils.automation.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
            folderId: currentFolderId,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.previousData as any
        )
      }
      toast.error(err.message || 'Failed to update status')
    },
    onSuccess: (_data, variables) => {
      const statusLabel = variables.status === 'ACTIVE' ? 'activated' : variables.status.toLowerCase()
      toast.success(`Automation ${statusLabel}`)
    },
    onSettled: () => {
      utils.automation.list.invalidate()
    },
  })

  /**
   * Delete single automation mutation with optimistic update.
   */
  const deleteMutation = trpc.automation.delete.useMutation({
    onMutate: async ({ automationId }) => {
      await utils.automation.list.cancel()

      const queryKey = {
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
        folderId: currentFolderId,
      }
      const previousData = utils.automation.list.getData(queryKey)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      utils.automation.list.setData(queryKey, (old: any) => {
        if (!old) return old
        return {
          ...old,
          automations: old.automations.filter((a: { id: string }) => a.id !== automationId),
          total: old.total - 1,
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      if (context?.previousData) {
        utils.automation.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
            folderId: currentFolderId,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.previousData as any
        )
      }
      toast.error(err.message || 'Failed to delete automation')
    },
    onSuccess: () => {
      toast.success('Automation deleted')
    },
    onSettled: () => {
      utils.automation.list.invalidate()
      utils.automation.listFolders.invalidate()
    },
  })

  /**
   * Bulk delete mutation with optimistic update.
   */
  const bulkDeleteMutation = trpc.automation.bulkDelete.useMutation({
    onMutate: async ({ automationIds }) => {
      await utils.automation.list.cancel()

      const queryKey = {
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
        folderId: currentFolderId,
      }
      const previousData = utils.automation.list.getData(queryKey)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      utils.automation.list.setData(queryKey, (old: any) => {
        if (!old) return old
        return {
          ...old,
          automations: old.automations.filter((a: { id: string }) => !automationIds.includes(a.id)),
          total: old.total - automationIds.length,
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      if (context?.previousData) {
        utils.automation.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
            folderId: currentFolderId,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.previousData as any
        )
      }
      toast.error(err.message || 'Failed to delete automations')
    },
    onSuccess: (result) => {
      toast.success(`${result.count} automation${result.count > 1 ? 's' : ''} deleted`)
      setSelectedIds([])
    },
    onSettled: () => {
      utils.automation.list.invalidate()
      utils.automation.listFolders.invalidate()
    },
  })

  /**
   * Duplicate automation mutation.
   */
  const duplicateMutation = trpc.automation.duplicate.useMutation({
    onSuccess: (automation) => {
      toast.success('Automation duplicated')
      const identifier = automation.slug ?? automation.id
      router.push(`/automations/${identifier}/edit`)
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to duplicate automation')
    },
    onSettled: () => {
      utils.automation.list.invalidate()
    },
  })

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

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

  const handleCreate = useCallback(() => {
    setCreateDialogOpen(true)
  }, [])

  const handleAutomationClick = useCallback(
    (automation: AutomationListItem) => {
      const identifier = automation.slug ?? automation.id
      router.push(`/automations/${identifier}/edit`)
    },
    [router]
  )

  const handleToggleStatus = useCallback(
    (automation: AutomationListItem) => {
      const newStatus = automation.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
      updateStatusMutation.mutate({
        organizationId,
        automationId: automation.id,
        status: newStatus,
      })
    },
    [organizationId, updateStatusMutation]
  )

  const handleArchive = useCallback(
    (automation: AutomationListItem) => {
      updateStatusMutation.mutate({
        organizationId,
        automationId: automation.id,
        status: 'ARCHIVED',
      })
    },
    [organizationId, updateStatusMutation]
  )

  const handleDuplicate = useCallback(
    (automation: AutomationListItem) => {
      duplicateMutation.mutate({
        organizationId,
        automationId: automation.id,
      })
    },
    [organizationId, duplicateMutation]
  )

  const handleRequestDelete = useCallback(
    (id: string) => {
      const automation = automations.find((a) => a.id === id)
      if (automation) {
        setAutomationToDelete(automation)
        setDeleteDialogOpen(true)
      }
    },
    [automations]
  )

  const handleConfirmDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(
        {
          organizationId,
          automationId: id,
        },
        {
          onSuccess: () => {
            setDeleteDialogOpen(false)
            setAutomationToDelete(null)
          },
        }
      )
    },
    [deleteMutation, organizationId]
  )

  const handleRequestBulkDelete = useCallback(
    (ids: string[]) => {
      const selectedAutomations = automations.filter((a) => ids.includes(a.id))
      setAutomationsToBulkDelete(selectedAutomations)
      setBulkDeleteDialogOpen(true)
    },
    [automations]
  )

  const handleConfirmBulkDelete = useCallback(
    (ids: string[]) => {
      bulkDeleteMutation.mutate(
        {
          organizationId,
          automationIds: ids,
        },
        {
          onSuccess: () => {
            setBulkDeleteDialogOpen(false)
            setAutomationsToBulkDelete([])
            setSelectedIds([])
          },
        }
      )
    },
    [bulkDeleteMutation, organizationId]
  )

  /**
   * Handle move automation action - opens move dialog
   */
  const handleMoveClick = useCallback((automation: AutomationListItem) => {
    setMoveDialog({
      open: true,
      automationId: automation.id,
      automationName: automation.name,
      currentFolderId: automation.folderId ?? null,
    })
  }, [])

  /**
   * Handle move confirmation from dialog
   */
  const handleMoveAutomation = useCallback(
    (targetFolderId: string | null) => {
      if (!moveDialog) return
      moveMutation.mutate({
        organizationId,
        automationId: moveDialog.automationId,
        folderId: targetFolderId,
      })
    },
    [moveDialog, moveMutation, organizationId]
  )

  /**
   * Handle create folder
   */
  const handleCreateFolder = useCallback(
    async (data: { name: string; color?: string }) => {
      await createFolderMutation.mutateAsync({
        organizationId,
        name: data.name,
        parentId: currentFolderId,
        color: data.color,
      })
    },
    [createFolderMutation, organizationId, currentFolderId]
  )

  /**
   * Handle delete folder confirmation
   */
  const handleConfirmDeleteFolder = useCallback(() => {
    if (!deleteFolderDialog) return
    deleteFolderMutation.mutate({
      organizationId,
      folderId: deleteFolderDialog.folderId,
    })
  }, [deleteFolderDialog, deleteFolderMutation, organizationId])

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Loading state
  if (isLoadingOrg && !activeOrganization) {
    return <AutomationsPageSkeleton />
  }

  // No organization
  if (!activeOrganization) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </ContentLayout>
    )
  }

  // No permission
  if (!hasAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view automations
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">automations:read</code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  const isSearching = debouncedSearch.length > 0

  return (
    <ContentLayout
      headerActions={
        <div className="flex items-center gap-2">
          {canCreate && (
            <>
              <Button variant="outline" onClick={() => setCreateFolderOpen(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                New Folder
              </Button>
              <FeatureGate feature="automations.limit">
                <Button onClick={handleCreate}>
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Create Automation
                </Button>
              </FeatureGate>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => handleNavigateToFolder(null)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md transition-colors shrink-0',
              'hover:bg-muted',
              !currentFolderId && !isSearching && 'font-medium text-foreground'
            )}
          >
            <Home className="w-4 h-4" />
            <span>All Automations</span>
          </button>

          {breadcrumb?.map((folder, index) => (
            <div key={folder.id} className="flex items-center shrink-0">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <button
                onClick={() => handleNavigateToFolder(folder.id)}
                className={cn(
                  'px-2 py-1 rounded-md transition-colors truncate max-w-[150px]',
                  'hover:bg-muted',
                  index === breadcrumb.length - 1 && 'font-medium text-foreground'
                )}
                title={folder.name}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </nav>

        {/* View mode toggle — grid or list */}
        <div className="flex items-center justify-between gap-4">
          {/* Search bar for grid mode (table has its own built-in search) */}
          {viewMode === 'grid' && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search automations..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {/* Spacer when in list mode (table renders its own search) */}
          {viewMode === 'list' && <div />}

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && setViewMode(value as ViewMode)}
            className="bg-muted rounded-md p-1"
          >
            <ToggleGroupItem
              value="grid"
              aria-label="Grid view"
              className="h-7 w-7 p-0 data-[state=on]:bg-background"
            >
              <Grid3X3 className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              aria-label="List view"
              className="h-7 w-7 p-0 data-[state=on]:bg-background"
            >
              <List className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Grid view — folder icons + automation cards */}
        {viewMode === 'grid' && (
          <>
            {/* Folders — grid icons */}
            {!isLoadingFolders && folders && folders.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  {isSearching ? 'Matching Folders' : 'Folders'}
                </h3>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className={cn(
                        'group relative flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all duration-200',
                        'hover:bg-muted/50'
                      )}
                      onClick={() => handleNavigateToFolder(folder.id)}
                    >
                      {/* Folder dropdown menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity',
                              'hover:bg-muted'
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={() =>
                              setEditFolderDialog({
                                open: true,
                                folderId: folder.id,
                                folderName: folder.name,
                                folderColor: folder.color,
                              })
                            }
                          >
                            <Palette className="mr-2 h-4 w-4" />
                            Edit Folder
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              setDeleteFolderDialog({
                                open: true,
                                folderId: folder.id,
                                folderName: folder.name,
                              })
                            }
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Folder icon */}
                      <div className="w-16 h-auto">
                        <FolderShape color={folder.color || undefined} size={64} />
                      </div>

                      {/* Folder name and count */}
                      <div className="flex flex-col items-center text-center max-w-full">
                        <span className="text-sm font-medium truncate max-w-[80px]" title={folder.name}>
                          {folder.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {folder._count.automations} {folder._count.automations === 1 ? 'automation' : 'automations'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loading skeleton for folders — grid */}
            {isLoadingFolders && (
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-2 p-3">
                    <Skeleton className="w-16 h-12" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            )}

            {isLoadingAutomations ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-lg border p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-3 w-full" />
                    <div className="border-t pt-3 flex gap-4">
                      <Skeleton className="h-3 w-8" />
                      <Skeleton className="h-3 w-8" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                  </div>
                ))}
              </div>
            ) : automations.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No automations found.
              </div>
            ) : (
              <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', isFetching && 'opacity-50')}>
                {automations.map((automation) => (
                  <AutomationCard
                    key={automation.id}
                    automation={automation}
                    onClick={() => handleAutomationClick(automation)}
                    onDelete={canDelete ? () => handleRequestDelete(automation.id) : undefined}
                    onToggleStatus={canExecute ? () => handleToggleStatus(automation) : undefined}
                    onArchive={canUpdate ? () => handleArchive(automation) : undefined}
                    onDuplicate={canCreate ? () => handleDuplicate(automation) : undefined}
                    onMove={canUpdate ? () => handleMoveClick(automation) : undefined}
                    canDelete={canDelete}
                    canUpdate={canUpdate}
                    canExecute={canExecute}
                  />
                ))}
              </div>
            )}

            {/* Grid view pagination */}
            {!isLoadingAutomations && automations.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {total} automation{total !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages || 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* List view — folder rows + automations table */}
        {viewMode === 'list' && (
          <>
            {/* Folders — list rows */}
            {!isLoadingFolders && folders && folders.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  {isSearching ? 'Matching Folders' : 'Folders'}
                </h3>
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={cn(
                      'group flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors',
                      'hover:bg-muted/50'
                    )}
                    onClick={() => handleNavigateToFolder(folder.id)}
                  >
                    {/* Small folder icon for list view */}
                    <div className="w-10 h-10 shrink-0">
                      <svg
                        viewBox="0 0 120 90"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-full h-full"
                      >
                        <path
                          d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
                          fill={folder.color || '#3f3f46'}
                        />
                      </svg>
                    </div>

                    {/* Folder info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{folder.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {folder._count.automations} {folder._count.automations === 1 ? 'automation' : 'automations'}
                      </p>
                    </div>

                    {/* Actions dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() =>
                            setEditFolderDialog({
                              open: true,
                              folderId: folder.id,
                              folderName: folder.name,
                              folderColor: folder.color,
                            })
                          }
                        >
                          <Palette className="mr-2 h-4 w-4" />
                          Edit Folder
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() =>
                            setDeleteFolderDialog({
                              open: true,
                              folderId: folder.id,
                              folderName: folder.name,
                            })
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}

            {/* Loading skeleton for folders — list rows */}
            {isLoadingFolders && (
              <div className="space-y-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-3">
                    <Skeleton className="w-10 h-10 rounded" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            )}

          <AutomationsTable
            automations={automations}
            isLoading={isLoadingAutomations}
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
            onAutomationClick={handleAutomationClick}
            onBulkDelete={canDelete ? handleRequestBulkDelete : undefined}
            onDelete={canDelete ? handleRequestDelete : undefined}
            onToggleStatus={canExecute ? handleToggleStatus : undefined}
            onArchive={canUpdate ? handleArchive : undefined}
            onDuplicate={canCreate ? handleDuplicate : undefined}
            onMove={canUpdate ? handleMoveClick : undefined}
            isBulkDeleting={bulkDeleteMutation.isPending}
            canDelete={canDelete}
            canUpdate={canUpdate}
            canExecute={canExecute}
          />
          </>
        )}
      </div>

      {/* Create Automation Dialog */}
      <AutomationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        organizationId={organizationId}
        folderId={currentFolderId}
      />

      {/* Create Folder Dialog */}
      <CreateAutomationFolderDialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreate={handleCreateFolder}
        isLoading={createFolderMutation.isPending}
      />

      {/* Edit Folder Dialog */}
      {editFolderDialog && (
        <EditAutomationFolderDialog
          open={editFolderDialog.open}
          onClose={() => setEditFolderDialog(null)}
          folderId={editFolderDialog.folderId}
          folderName={editFolderDialog.folderName}
          folderColor={editFolderDialog.folderColor}
          onSave={(data) => {
            updateFolderMutation.mutate({
              organizationId,
              folderId: editFolderDialog.folderId,
              name: data.name,
              color: data.color,
            })
          }}
          isSaving={updateFolderMutation.isPending}
        />
      )}

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog
        open={deleteFolderDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setDeleteFolderDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteFolderDialog?.folderName}&quot;?
              <span className="block mt-2 text-amber-600 dark:text-amber-500">
                Automations in this folder will be moved to root. Subfolders will also be deleted.
              </span>
              <span className="block mt-2">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFolderMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteFolder}
              disabled={deleteFolderMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFolderMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Automation Dialog */}
      {moveDialog && (
        <MoveAutomationDialog
          open={moveDialog.open}
          onClose={() => setMoveDialog(null)}
          automationId={moveDialog.automationId}
          automationName={moveDialog.automationName}
          organizationId={organizationId}
          currentFolderId={moveDialog.currentFolderId}
          onMove={handleMoveAutomation}
          isMoving={moveMutation.isPending}
        />
      )}

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{automationToDelete?.name}&quot; and all its run
              history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => automationToDelete && handleConfirmDelete(automationToDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <BulkDeleteAutomationsDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(open) => {
          setBulkDeleteDialogOpen(open)
          if (!open) setAutomationsToBulkDelete([])
        }}
        automations={automationsToBulkDelete}
        onConfirm={handleConfirmBulkDelete}
        isDeleting={bulkDeleteMutation.isPending}
      />
    </ContentLayout>
  )
}
