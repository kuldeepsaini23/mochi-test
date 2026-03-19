'use client'

/**
 * Template Picker Modal — Template Management + Contract Creation
 *
 * Dual-purpose modal that combines template browsing/management with
 * contract creation. Opens when "Create Contract" is clicked on the Contracts page.
 *
 * LAYOUT (follows StorageBrowser modal pattern):
 * - Header: "Select A Template" title + "Create Template" + "New Folder" buttons
 * - Search bar with breadcrumb navigation
 * - "Folders" section using FolderCard / FolderGrid from storage components
 * - "Templates" section with preview cards, checkboxes, context menus
 * - Bulk selection bar for multi-delete
 * - Blank Contract card always first in templates grid
 *
 * TEMPLATE MANAGEMENT:
 * - Folder navigation with breadcrumb trail
 * - Create new folders via CreateFolderDialog (same dialog as storage)
 * - Rename/delete folders via FolderCard context menu
 * - Multi-select templates with checkboxes → bulk delete
 * - Individual template delete via context menu
 * - Debounced search (300ms) across ALL folders
 *
 * SOURCE OF TRUTH KEYWORDS: TemplatePickerModal, CreateContractFlow, TemplateManagement
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Plus,
  Search,
  FileText,
  Loader2,
  ChevronRight,
  Home,
  MoreHorizontal,
  Trash2,
  LayoutTemplate,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ContentPreview } from '@/components/editor/content-preview'
import {
  FolderCard,
  FolderGrid,
  CreateFolderButton,
} from '@/components/storage/folder-card'
import { CreateFolderDialog } from '@/app/(main)/(protected)/(dashboard-layout)/storage/_components/create-folder-dialog'

// ============================================================================
// TYPES
// ============================================================================

interface TemplatePickerModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback to close the modal */
  onClose: () => void
  /** Organization ID for API calls */
  organizationId: string
  /**
   * Called when a contract/template should be opened in the builder.
   * For blank contracts: called with the newly created contract ID.
   * For templates: called with the template's own ID (opens it in the builder).
   */
  onContractCreated: (contractId: string) => void
}

/** State for the delete confirmation dialog — tracks what's being deleted */
interface DeleteDialogState {
  type: 'template' | 'templates-bulk' | 'folder'
  ids: string[]
  name: string
}

// ============================================================================
// DEBOUNCE HOOK
// ============================================================================

/**
 * Custom hook that debounces a string value by a given delay.
 * WHY: Prevents excessive API calls while the user types in the search input.
 */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [value, delayMs])

  return debouncedValue
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TemplatePickerModal({
  open,
  onClose,
  organizationId,
  onContractCreated,
}: TemplatePickerModalProps) {
  // --------------------------------------------------------------------------
  // STATE
  // --------------------------------------------------------------------------

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  /** Current folder ID for navigation (null = root) */
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  /** Multi-select: set of selected template IDs */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  /** Whether the create folder dialog is open */
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false)

  /** Delete confirmation dialog state */
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null)

  const isSearching = debouncedSearch.length > 0
  const hasSelection = selectedIds.size > 0

  // --------------------------------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------------------------------

  /** Fetch templates — when searching, search ALL folders; otherwise filter by folder */
  const templatesQuery = trpc.contracts.list.useQuery(
    {
      organizationId,
      isTemplate: true,
      limit: 100,
      ...(isSearching
        ? { search: debouncedSearch }
        : { folderId: currentFolderId }),
    },
    { enabled: open }
  )
  const templates = templatesQuery.data?.contracts ?? []

  /** Fetch folders at the current level (only when NOT searching) */
  const foldersQuery = trpc.contracts.listFolders.useQuery(
    { organizationId, parentId: currentFolderId },
    { enabled: open && !isSearching }
  )
  const folders = foldersQuery.data ?? []

  /** Fetch breadcrumb for current folder navigation */
  const breadcrumbQuery = trpc.contracts.getFolderBreadcrumb.useQuery(
    { organizationId, folderId: currentFolderId! },
    { enabled: open && !!currentFolderId && !isSearching }
  )
  const breadcrumb = breadcrumbQuery.data ?? []

  const utils = trpc.useUtils()

  // --------------------------------------------------------------------------
  // MUTATIONS
  // --------------------------------------------------------------------------

  /** Create a blank contract (isTemplate: false) */
  const createBlankMutation = trpc.contracts.create.useMutation({
    onSuccess: (data) => {
      toast.success('Blank contract created')
      utils.contracts.list.invalidate()
      onContractCreated(data.id)
      handleClose()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create contract')
    },
  })

  /** Create a blank template (isTemplate: true) — "Create Template" button */
  const createTemplateMutation = trpc.contracts.create.useMutation({
    onSuccess: (data) => {
      toast.success('Template created')
      utils.contracts.list.invalidate()
      onContractCreated(data.id)
      handleClose()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create template')
    },
  })

  /** Create a new folder inside the current folder */
  const createFolderMutation = trpc.contracts.createFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder created')
      utils.contracts.listFolders.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create folder')
    },
  })

  /** Rename a folder */
  const updateFolderMutation = trpc.contracts.updateFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder renamed')
      utils.contracts.listFolders.invalidate()
      utils.contracts.getFolderBreadcrumb.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to rename folder')
    },
  })

  /** Delete a folder (moves its templates to root) */
  const deleteFolderMutation = trpc.contracts.deleteFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder deleted')
      utils.contracts.listFolders.invalidate()
      utils.contracts.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete folder')
    },
  })

  /** Delete a template */
  const deleteTemplateMutation = trpc.contracts.delete.useMutation({
    onSuccess: () => {
      utils.contracts.list.invalidate()
      utils.contracts.listFolders.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete template')
    },
  })

  // --------------------------------------------------------------------------
  // HANDLERS — Modal lifecycle
  // --------------------------------------------------------------------------

  /** Reset all state and close the modal */
  const handleClose = useCallback(() => {
    setSearch('')
    setCurrentFolderId(null)
    setSelectedIds(new Set())
    setShowCreateFolderDialog(false)
    setDeleteDialog(null)
    onClose()
  }, [onClose])

  // --------------------------------------------------------------------------
  // HANDLERS — Contract/Template creation
  // --------------------------------------------------------------------------

  /** Create a blank (empty) contract — isTemplate: false */
  const handleCreateBlank = useCallback(() => {
    if (createBlankMutation.isPending) return
    createBlankMutation.mutate({
      organizationId,
      name: 'Untitled Contract',
      isTemplate: false,
    })
  }, [organizationId, createBlankMutation])

  /** Create a blank template — isTemplate: true, opens in builder */
  const handleCreateTemplate = useCallback(() => {
    if (createTemplateMutation.isPending) return
    createTemplateMutation.mutate({
      organizationId,
      name: 'Untitled Template',
      isTemplate: true,
      folderId: currentFolderId,
    })
  }, [organizationId, currentFolderId, createTemplateMutation])

  /** Open a template in the builder (no mutation, builder handles "Use Template") */
  const handleOpenTemplate = useCallback((templateId: string) => {
    onContractCreated(templateId)
    handleClose()
  }, [onContractCreated, handleClose])

  // --------------------------------------------------------------------------
  // HANDLERS — Folder navigation + CRUD
  // --------------------------------------------------------------------------

  /** Navigate into a folder, clearing selection */
  const handleNavigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId)
    setSelectedIds(new Set())
  }, [])

  /** Create folder via the CreateFolderDialog */
  const handleCreateFolder = useCallback(async (data: { name: string; color?: string }) => {
    await createFolderMutation.mutateAsync({
      organizationId,
      name: data.name,
      color: data.color,
      parentId: currentFolderId,
    })
  }, [organizationId, currentFolderId, createFolderMutation])

  // --------------------------------------------------------------------------
  // HANDLERS — Template selection (multi-select)
  // --------------------------------------------------------------------------

  const handleToggleSelect = useCallback((templateId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(templates.map((t) => t.id)))
  }, [templates])

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // --------------------------------------------------------------------------
  // HANDLERS — Delete confirmation + execution
  // --------------------------------------------------------------------------

  const handleDeleteTemplateClick = useCallback((id: string, name: string) => {
    setDeleteDialog({ type: 'template', ids: [id], name })
  }, [])

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedIds.size === 0) return
    setDeleteDialog({
      type: 'templates-bulk',
      ids: Array.from(selectedIds),
      name: `${selectedIds.size} template${selectedIds.size > 1 ? 's' : ''}`,
    })
  }, [selectedIds])

  const handleDeleteFolderClick = useCallback((id: string, name: string) => {
    setDeleteDialog({ type: 'folder', ids: [id], name })
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDialog) return

    if (deleteDialog.type === 'folder') {
      deleteFolderMutation.mutate({ organizationId, id: deleteDialog.ids[0] })
    } else {
      const promises = deleteDialog.ids.map((id) =>
        deleteTemplateMutation.mutateAsync({ organizationId, id })
      )
      try {
        await Promise.all(promises)
        const count = deleteDialog.ids.length
        toast.success(`${count} template${count > 1 ? 's' : ''} deleted`)
        setSelectedIds(new Set())
      } catch {
        /* Individual errors handled by mutation onError */
      }
    }

    setDeleteDialog(null)
  }, [deleteDialog, organizationId, deleteFolderMutation, deleteTemplateMutation])

  // --------------------------------------------------------------------------
  // COMPUTED
  // --------------------------------------------------------------------------

  const isLoadingContent = templatesQuery.isLoading || (!isSearching && foldersQuery.isLoading)
  const hasFolders = !isLoadingContent && !isSearching && folders.length > 0
  const hasTemplates = !isLoadingContent && templates.length > 0
  const hasNoContent = !isLoadingContent && folders.length === 0 && templates.length === 0

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-3xl lg:max-w-4xl max-h-[85vh] flex flex-col">
        {/* ================================================================
            HEADER — Title + action buttons (follows StorageBrowserHeader)
            ================================================================ */}
        <DialogHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <DialogTitle>Select A Template</DialogTitle>
            <DialogDescription>
              Pick a template to preview or start from scratch
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateTemplate}
              disabled={createTemplateMutation.isPending}
            >
              {createTemplateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <LayoutTemplate className="h-4 w-4 mr-1.5" />
              )}
              Create Template
            </Button>
          </div>
        </DialogHeader>

        {/* ================================================================
            TOOLBAR — Breadcrumb + Search
            ================================================================ */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Breadcrumb navigation */}
          {!isSearching ? (
            <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
              <button
                onClick={() => handleNavigateToFolder(null)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md transition-colors shrink-0',
                  'hover:bg-muted',
                  !currentFolderId && 'font-medium text-foreground'
                )}
              >
                <Home className="w-4 h-4" />
                <span>Templates</span>
              </button>
              {currentFolderId && breadcrumb.map((folder: { id: string; name: string }, index: number) => (
                <div key={folder.id} className="flex items-center shrink-0">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <button
                    onClick={() => handleNavigateToFolder(folder.id)}
                    className={cn(
                      'px-2 py-1 rounded-md transition-colors truncate max-w-[100px] sm:max-w-[150px]',
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
          ) : (
            <p className="text-xs text-muted-foreground">
              Searching across all folders for &quot;{debouncedSearch}&quot;
            </p>
          )}

          {/* Search input */}
          <div className="relative sm:w-56 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* ================================================================
            BULK SELECTION BAR — shown when templates are checked
            ================================================================ */}
        {hasSelection && (
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <button onClick={handleSelectAll} className="text-xs text-primary hover:underline">
                Select all
              </button>
              <button onClick={handleDeselectAll} className="text-xs text-muted-foreground hover:underline">
                Clear
              </button>
            </div>
            <Button variant="destructive" size="sm" onClick={handleBulkDeleteClick}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete ({selectedIds.size})
            </Button>
          </div>
        )}

        {/* ================================================================
            SCROLLABLE CONTENT AREA — Folders + Templates sections
            ================================================================ */}
        <div className="overflow-y-auto flex-1 min-h-0 space-y-6 py-1">

          {/* Loading skeleton */}
          {isLoadingContent && (
            <div className="space-y-6">
              <div>
                <div className="h-4 w-16 bg-muted rounded mb-3" />
                <FolderGrid>
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[120px] rounded-xl" />
                  ))}
                </FolderGrid>
              </div>
              <div>
                <div className="h-4 w-20 bg-muted rounded mb-3" />
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[180px] rounded-xl" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              FOLDERS SECTION — FolderCard grid (storage pattern)
              ============================================================ */}
          {hasFolders && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Folders
              </h2>
              <FolderGrid>
                {folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    id={folder.id}
                    name={folder.name}
                    fileCount={folder._count.contracts}
                    color={folder.color || undefined}
                    onClick={() => handleNavigateToFolder(folder.id)}
                    onDoubleClick={() => handleNavigateToFolder(folder.id)}
                    onRename={(newName) => {
                      updateFolderMutation.mutate({
                        organizationId,
                        id: folder.id,
                        name: newName,
                      })
                    }}
                    onDelete={() => handleDeleteFolderClick(folder.id, folder.name)}
                  />
                ))}
                {/* Quick create folder button — same as storage pattern */}
                <CreateFolderButton
                  onClick={() => setShowCreateFolderDialog(true)}
                />
              </FolderGrid>
            </div>
          )}

          {/* Show standalone create folder button when no folders exist and not searching */}
          {!isLoadingContent && !isSearching && folders.length === 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Folders
              </h2>
              <FolderGrid>
                <CreateFolderButton
                  onClick={() => setShowCreateFolderDialog(true)}
                />
              </FolderGrid>
            </div>
          )}

          {/* ============================================================
              TEMPLATES SECTION — Template cards with actions
              ============================================================ */}
          {(hasTemplates || !isLoadingContent) && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                {isSearching ? 'Matching Templates' : 'Templates'}
              </h2>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {/* Blank Contract card — always first */}
                <button
                  type="button"
                  onClick={handleCreateBlank}
                  disabled={createBlankMutation.isPending}
                  className={cn(
                    'flex flex-col items-center justify-center gap-3',
                    'h-[180px] rounded-xl border-2 border-dashed border-border',
                    'bg-background transition-all duration-200 cursor-pointer',
                    'hover:border-primary/50 hover:bg-muted/30',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                  )}
                >
                  {createBlankMutation.isPending ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Plus className="h-6 w-6 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        Blank Contract
                      </span>
                    </>
                  )}
                </button>

                {/* Template cards — click to open, checkbox for multi-select */}
                {templates.map((template) => {
                  const isSelected = selectedIds.has(template.id)

                  /** Ensure content is a string for ContentPreview */
                  const contentString =
                    template.content === null || template.content === undefined
                      ? null
                      : typeof template.content === 'string'
                        ? template.content
                        : JSON.stringify(template.content)

                  return (
                    <div
                      key={template.id}
                      className={cn(
                        'group relative flex flex-col rounded-xl border bg-card overflow-hidden',
                        'h-[180px] transition-all duration-200 text-left',
                        isSelected
                          ? 'ring-2 ring-primary border-primary'
                          : 'border-border/60 hover:border-primary/40 hover:shadow-md'
                      )}
                    >
                      {/* Clickable area — opens template in builder */}
                      <button
                        type="button"
                        onClick={() => handleOpenTemplate(template.id)}
                        className="flex-1 overflow-hidden p-3 cursor-pointer"
                      >
                        {contentString ? (
                          <div className="pointer-events-none">
                            <ContentPreview
                              content={contentString}
                              maxHeight={100}
                              className="text-[10px]"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <FileText className="h-8 w-8 text-muted-foreground/40" />
                          </div>
                        )}
                      </button>

                      {/* Template info footer */}
                      <div className="border-t px-3 py-2 bg-muted/30">
                        <p className="text-xs font-medium truncate">{template.name}</p>
                      </div>

                      {/* Checkbox — top left, visible on hover or when selected */}
                      <div
                        className={cn(
                          'absolute top-2 left-2 transition-opacity',
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleSelect(template.id)}
                          className="h-5 w-5 bg-background/90 backdrop-blur-sm shadow-sm border-border"
                        />
                      </div>

                      {/* Context menu — top right on hover */}
                      <div
                        className={cn(
                          'absolute top-2 right-2 transition-opacity',
                          'opacity-0 group-hover:opacity-100'
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-6 w-6 bg-background/90 backdrop-blur-sm shadow-sm hover:bg-background"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteTemplateClick(template.id, template.name)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state — no folders or templates found while searching */}
          {hasNoContent && isSearching && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No templates matching &quot;{debouncedSearch}&quot;
              </p>
            </div>
          )}
        </div>
      </DialogContent>

      {/* ================================================================
          CREATE FOLDER DIALOG — Same dialog as storage module
          ================================================================ */}
      <CreateFolderDialog
        open={showCreateFolderDialog}
        onClose={() => setShowCreateFolderDialog(false)}
        onCreate={handleCreateFolder}
        isLoading={createFolderMutation.isPending}
      />

      {/* ================================================================
          DELETE CONFIRMATION — Handles templates, bulk, and folders
          ================================================================ */}
      <AlertDialog
        open={!!deleteDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialog?.type === 'folder'
                ? 'Delete Folder'
                : `Delete ${deleteDialog?.type === 'templates-bulk' ? 'Templates' : 'Template'}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog?.type === 'folder' ? (
                <>
                  Are you sure you want to delete the folder &quot;{deleteDialog.name}&quot;?
                  <span className="block mt-2">
                    Templates inside will be moved to root. This action cannot be undone.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to delete {deleteDialog?.name}?
                  <span className="block mt-2">This action cannot be undone.</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFolderMutation.isPending || deleteTemplateMutation.isPending
                ? 'Deleting...'
                : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
