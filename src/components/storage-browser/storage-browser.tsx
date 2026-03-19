/**
 * STORAGE BROWSER COMPONENT
 *
 * A fully reusable, self-contained storage browser component.
 * Can be used anywhere in the application to browse, select, and manage files.
 *
 * FEATURES:
 * - File type filtering (images, videos, documents, etc.)
 * - Selection modes (browse, single-select, multi-select)
 * - Full CRUD operations (upload, create folder, rename, delete, move)
 * - Trash management
 * - Grid/List view toggle
 * - Search functionality
 * - Breadcrumb navigation
 *
 * USAGE:
 * ```tsx
 * // Browse mode (full storage page)
 * <StorageBrowser organizationId="org_123" />
 *
 * // Select single image
 * <StorageBrowser
 *   organizationId="org_123"
 *   mode="select"
 *   fileFilter="image"
 *   onSelect={(file) => console.log(file)}
 * />
 *
 * // Multi-select videos with confirmation
 * <StorageBrowser
 *   organizationId="org_123"
 *   mode="multi-select"
 *   fileFilter="video"
 *   maxSelection={5}
 *   onConfirm={(files) => console.log(files)}
 * />
 * ```
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/trpc/react-provider'
import { StorageBrowserHeader } from './storage-browser-header'
import { useStorageBrowserInvalidation } from './use-storage-browser'
import { FolderCard, FolderGrid, CreateFolderButton, FolderCardSkeleton } from '@/components/storage/folder-card'
import { FileCard, FileGrid, FileListItem, FileCardSkeleton, FileListItemSkeleton } from '@/components/storage/file-card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { cn } from '@/lib/utils'
import type {
  StorageBrowserProps,
  ViewMode,
  SelectedFile,
} from './types'

// Import dialogs from storage page (we'll reuse them)
import { UploadDialog } from '@/app/(main)/(protected)/(dashboard-layout)/storage/_components/upload-dialog'
import { CreateFolderDialog } from '@/app/(main)/(protected)/(dashboard-layout)/storage/_components/create-folder-dialog'
import { MoveToDialog } from '@/app/(main)/(protected)/(dashboard-layout)/storage/_components/move-to-dialog'
import { EditFolderDialog } from '@/app/(main)/(protected)/(dashboard-layout)/storage/_components/edit-folder-dialog'
import { TrashView } from '@/app/(main)/(protected)/(dashboard-layout)/storage/_components/trash-view'
import { EmptyState } from '@/app/(main)/(protected)/(dashboard-layout)/storage/_components/empty-state'
import { FolderOpen, Check } from 'lucide-react'
import { FeatureGate, useFeatureGate } from '@/components/feature-gate'

// ============================================================================
// TYPES
// ============================================================================

/**
 * State for tracking which items are being operated on.
 * Used to show loading states during mutations.
 */
interface OperationState {
  deletingFolders: Set<string>
  deletingFiles: Set<string>
  updatingFiles: Set<string>
  updatingFolders: Set<string>
}

// ============================================================================
// FILE FILTER MAPPING
// ============================================================================

/**
 * Maps our FileTypeFilter values to Prisma FileCategory.
 */
const filterToCategoryMap: Record<string, string | null> = {
  all: null,
  image: 'IMAGE',
  video: 'VIDEO',
  audio: 'AUDIO',
  document: 'DOCUMENT',
  archive: 'ARCHIVE',
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StorageBrowser({
  organizationId,
  fileFilter = 'all',
  mode = 'browse',
  onSelect,
  onConfirm,
  onClose,
  showTrash = true,
  showUpload = true,
  showCreateFolder = true,
  initialFolderId = null,
  title,
  subtitle,
  isModal = false,
  className,
  maxSelection,
  confirmButtonText = 'Select',
  cancelButtonText = 'Cancel',
}: StorageBrowserProps) {
  const utils = trpc.useUtils()

  // Centralized cache invalidation
  const {
    invalidateAfterFolderCreate,
    invalidateAfterFolderDelete,
    invalidateAfterFileDelete,
    invalidateAfterUpload,
  } = useStorageBrowserInvalidation({ organizationId })

  /**
   * Fetch current storage usage from the feature gate system.
   * Used for the usage bar display in the header (storageUsage prop).
   * Storage limit enforcement is handled by <FeatureGate> wrappers on upload buttons,
   * NOT by manual state — the FeatureGate component intercepts clicks and shows
   * the upgrade modal automatically when at capacity.
   */
  const storageGate = useFeatureGate('storage_kb.limit')

  // ============================================================================
  // STATE
  // ============================================================================

  // Current folder (internal state instead of URL params)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId)

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false)
  const [isTrashView, setIsTrashView] = useState(false)

  // Selection state (for select/multi-select modes)
  const [selectedFiles, setSelectedFiles] = useState<Map<string, SelectedFile>>(new Map())

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    type: 'folder' | 'file'
    id: string
    name: string
  } | null>(null)

  // Move To dialog state
  const [moveDialog, setMoveDialog] = useState<{
    open: boolean
    fileId: string
    fileName: string
  } | null>(null)

  // Edit Folder dialog state
  const [editFolderDialog, setEditFolderDialog] = useState<{
    open: boolean
    folderId: string
    folderName: string
    folderColor: string | null
  } | null>(null)

  // Operation tracking (for loading states)
  const [operations, setOperations] = useState<OperationState>({
    deletingFolders: new Set(),
    deletingFiles: new Set(),
    updatingFiles: new Set(),
    updatingFolders: new Set(),
  })

  // ============================================================================
  // OPERATION HELPERS
  // ============================================================================

  const addOperation = (type: keyof OperationState, id: string) => {
    setOperations((prev) => ({
      ...prev,
      [type]: new Set([...prev[type], id]),
    }))
  }

  const removeOperation = (type: keyof OperationState, id: string) => {
    setOperations((prev) => {
      const newSet = new Set(prev[type])
      newSet.delete(id)
      return { ...prev, [type]: newSet }
    })
  }

  // ============================================================================
  // QUERY KEYS
  // ============================================================================

  const foldersQueryKey = {
    organizationId,
    parentId: currentFolderId,
    search: searchQuery || undefined,
  }

  const filesQueryKey = {
    organizationId,
    folderId: currentFolderId,
    search: searchQuery || undefined,
    pageSize: 100,
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // Validate folder exists (when navigating to a specific folder)
  const {
    data: folderValidation,
    isLoading: validatingFolder,
  } = trpc.storage.validateFolder.useQuery(
    { organizationId, folderId: currentFolderId! },
    { enabled: !!currentFolderId }
  )

  /**
   * Reset to root when folder validation fails.
   * This is an intentional side effect triggered by query data -
   * we need to reset navigation when the folder doesn't exist.
   */
  useEffect(() => {
    if (folderValidation?.status === 'NOT_FOUND') {
      toast.error('Folder not found')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset based on server validation
      setCurrentFolderId(null)
    }
  }, [folderValidation])

  // Check if folder is in trash
  const isFolderInTrash = currentFolderId && folderValidation?.status === 'IN_TRASH'
  const folderInTrashName = folderValidation?.status === 'IN_TRASH' ? folderValidation.folder.name : null

  // Fetch folders
  const { data: folders, isLoading: foldersLoading } = trpc.storage.listFolders.useQuery(
    foldersQueryKey,
    { enabled: !currentFolderId || folderValidation?.status === 'OK' }
  )

  // Fetch files
  const { data: filesData, isLoading: filesLoading } = trpc.storage.listFiles.useQuery(
    filesQueryKey,
    { enabled: !currentFolderId || folderValidation?.status === 'OK' }
  )

  // Fetch breadcrumb
  const { data: breadcrumb } = trpc.storage.getFolderBreadcrumb.useQuery(
    { organizationId, folderId: currentFolderId! },
    { enabled: !!currentFolderId && folderValidation?.status === 'OK' }
  )

  // Fetch trash count
  const { data: trashData } = trpc.storage.listTrash.useQuery(
    { organizationId },
    { enabled: showTrash }
  )
  const trashCount = (trashData?.folders?.length || 0) + (trashData?.files?.length || 0)

  // ============================================================================
  // FILE FILTERING
  // ============================================================================

  /**
   * Filter files based on the fileFilter prop.
   * Folders are always shown for navigation.
   * Using filesData.files in dependency for React Compiler compatibility.
   */
  const files = filesData?.files
  const filteredFiles = useMemo(() => {
    if (!files) return []

    // If no filter, return all files
    if (fileFilter === 'all') return files

    // Map filter to category
    const targetCategory = filterToCategoryMap[fileFilter]
    if (!targetCategory) return files

    // Filter files by category
    return files.filter((file) => file.fileCategory === targetCategory)
  }, [files, fileFilter])

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  // Create folder mutation
  const createFolderMutation = trpc.storage.createFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder created')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create folder')
    },
    onSettled: () => {
      invalidateAfterFolderCreate()
    },
  })

  // Delete folder mutation with optimistic update
  const deleteFolderMutation = trpc.storage.deleteFolder.useMutation({
    onMutate: async ({ folderId }) => {
      addOperation('deletingFolders', folderId)
      await utils.storage.listFolders.cancel(foldersQueryKey)
      const previousFolders = utils.storage.listFolders.getData(foldersQueryKey)
      utils.storage.listFolders.setData(foldersQueryKey, (old) => {
        if (!old) return old
        return old.filter((f) => f.id !== folderId)
      })
      return { previousFolders }
    },
    onError: (error, { folderId }, context) => {
      if (context?.previousFolders) {
        utils.storage.listFolders.setData(foldersQueryKey, context.previousFolders)
      }
      toast.error(error.message || 'Failed to delete folder')
      removeOperation('deletingFolders', folderId)
    },
    onSuccess: (_, { folderId }) => {
      toast.success('Folder moved to trash')
      removeOperation('deletingFolders', folderId)
    },
    onSettled: () => {
      invalidateAfterFolderDelete()
    },
  })

  // Delete files mutation with optimistic update
  const deleteFilesMutation = trpc.storage.deleteFilesWithStorage.useMutation({
    onMutate: async ({ fileIds }) => {
      fileIds.forEach((id) => addOperation('deletingFiles', id))
      await utils.storage.listFiles.cancel(filesQueryKey)
      await utils.storage.listFolders.cancel(foldersQueryKey)
      const previousFiles = utils.storage.listFiles.getData(filesQueryKey)
      const previousFolders = utils.storage.listFolders.getData(foldersQueryKey)
      utils.storage.listFiles.setData(filesQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          files: old.files.filter((f) => !fileIds.includes(f.id)),
          pagination: {
            ...old.pagination,
            total: old.pagination.total - fileIds.length,
          },
        }
      })
      return { previousFiles, previousFolders }
    },
    onError: (error, { fileIds }, context) => {
      if (context?.previousFiles) {
        utils.storage.listFiles.setData(filesQueryKey, context.previousFiles)
      }
      toast.error(error.message || 'Failed to delete file')
      fileIds.forEach((id) => removeOperation('deletingFiles', id))
    },
    onSuccess: (_, { fileIds }) => {
      toast.success(fileIds.length === 1 ? 'File moved to trash' : `${fileIds.length} files moved to trash`)
      fileIds.forEach((id) => removeOperation('deletingFiles', id))
      // Remove from selection if selected
      setSelectedFiles((prev) => {
        const newMap = new Map(prev)
        fileIds.forEach((id) => newMap.delete(id))
        return newMap
      })
    },
    onSettled: () => {
      invalidateAfterFileDelete()
      utils.storage.listFolders.invalidate()
    },
  })

  // Change visibility mutation
  const changeVisibilityMutation = trpc.storage.changeVisibility.useMutation({
    onMutate: async ({ fileId, visibility }) => {
      addOperation('updatingFiles', fileId)
      await utils.storage.listFiles.cancel(filesQueryKey)
      const previousFiles = utils.storage.listFiles.getData(filesQueryKey)
      utils.storage.listFiles.setData(filesQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          files: old.files.map((f) =>
            f.id === fileId ? { ...f, visibility } : f
          ),
        }
      })
      return { previousFiles }
    },
    onError: (error, { fileId }, context) => {
      if (context?.previousFiles) {
        utils.storage.listFiles.setData(filesQueryKey, context.previousFiles)
      }
      toast.error(error.message || 'Failed to change visibility')
      removeOperation('updatingFiles', fileId)
    },
    onSuccess: (_, { fileId, visibility }) => {
      toast.success(`File is now ${visibility.toLowerCase()}`)
      removeOperation('updatingFiles', fileId)
    },
    onSettled: () => {
      utils.storage.listFiles.invalidate()
    },
  })

  // Rename file mutation
  const renameFileMutation = trpc.storage.updateFile.useMutation({
    onMutate: async ({ fileId, displayName }) => {
      addOperation('updatingFiles', fileId)
      await utils.storage.listFiles.cancel(filesQueryKey)
      const previousFiles = utils.storage.listFiles.getData(filesQueryKey)
      utils.storage.listFiles.setData(filesQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          files: old.files.map((f) =>
            f.id === fileId ? { ...f, displayName: displayName || f.displayName } : f
          ),
        }
      })
      return { previousFiles }
    },
    onError: (error, { fileId }, context) => {
      if (context?.previousFiles) {
        utils.storage.listFiles.setData(filesQueryKey, context.previousFiles)
      }
      toast.error(error.message || 'Failed to rename file')
      removeOperation('updatingFiles', fileId)
    },
    onSuccess: (_, { fileId }) => {
      toast.success('File renamed')
      removeOperation('updatingFiles', fileId)
    },
    onSettled: () => {
      utils.storage.listFiles.invalidate()
    },
  })

  // Move file mutation
  const moveFileMutation = trpc.storage.updateFile.useMutation({
    onMutate: async ({ fileId }) => {
      addOperation('updatingFiles', fileId)
      await utils.storage.listFiles.cancel(filesQueryKey)
      await utils.storage.listFolders.cancel(foldersQueryKey)
      const previousFiles = utils.storage.listFiles.getData(filesQueryKey)
      const previousFolders = utils.storage.listFolders.getData(foldersQueryKey)
      utils.storage.listFiles.setData(filesQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          files: old.files.filter((f) => f.id !== fileId),
          pagination: {
            ...old.pagination,
            total: old.pagination.total - 1,
          },
        }
      })
      return { previousFiles, previousFolders }
    },
    onError: (error, { fileId }, context) => {
      if (context?.previousFiles) {
        utils.storage.listFiles.setData(filesQueryKey, context.previousFiles)
      }
      if (context?.previousFolders) {
        utils.storage.listFolders.setData(foldersQueryKey, context.previousFolders)
      }
      toast.error(error.message || 'Failed to move file')
      removeOperation('updatingFiles', fileId)
    },
    onSuccess: (_, { fileId }) => {
      toast.success('File moved')
      removeOperation('updatingFiles', fileId)
    },
    onSettled: () => {
      utils.storage.listFiles.invalidate()
      utils.storage.listFolders.invalidate()
    },
  })

  // Update folder mutation
  const updateFolderMutation = trpc.storage.updateFolder.useMutation({
    onMutate: async ({ folderId, name, color }) => {
      addOperation('updatingFolders', folderId)
      await utils.storage.listFolders.cancel(foldersQueryKey)
      const previousFolders = utils.storage.listFolders.getData(foldersQueryKey)
      utils.storage.listFolders.setData(foldersQueryKey, (old) => {
        if (!old) return old
        return old.map((folder) => {
          if (folder.id === folderId) {
            return {
              ...folder,
              name: name ?? folder.name,
              color: color !== undefined ? color : folder.color,
            }
          }
          return folder
        })
      })
      return { previousFolders }
    },
    onError: (error, { folderId }, context) => {
      if (context?.previousFolders) {
        utils.storage.listFolders.setData(foldersQueryKey, context.previousFolders)
      }
      toast.error(error.message || 'Failed to update folder')
      removeOperation('updatingFolders', folderId)
    },
    onSuccess: (_, { folderId }) => {
      toast.success('Folder updated')
      removeOperation('updatingFolders', folderId)
      setEditFolderDialog(null)
    },
    onSettled: () => {
      utils.storage.listFolders.invalidate()
    },
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Navigation
  const handleNavigate = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId)
  }, [])

  const handleFolderClick = useCallback((folderId: string) => {
    if (operations.deletingFolders.has(folderId)) return
    handleNavigate(folderId)
  }, [handleNavigate, operations.deletingFolders])

  // Create folder
  const handleCreateFolder = async (data: { name: string; color?: string }) => {
    await createFolderMutation.mutateAsync({
      organizationId,
      name: data.name,
      parentId: currentFolderId,
      color: data.color,
    })
  }

  // Delete handlers
  const handleDeleteFolderClick = (folderId: string, folderName: string) => {
    setDeleteDialog({
      open: true,
      type: 'folder',
      id: folderId,
      name: folderName,
    })
  }

  const handleDeleteFileClick = (fileId: string, fileName: string) => {
    setDeleteDialog({
      open: true,
      type: 'file',
      id: fileId,
      name: fileName,
    })
  }

  const handleConfirmDelete = () => {
    if (!deleteDialog) return

    if (deleteDialog.type === 'folder') {
      deleteFolderMutation.mutate({
        organizationId,
        folderId: deleteDialog.id,
      })
    } else {
      deleteFilesMutation.mutate({
        organizationId,
        fileIds: [deleteDialog.id],
      })
    }

    setDeleteDialog(null)
  }

  // Visibility toggle
  const handleToggleVisibility = (fileId: string, currentVisibility: 'PUBLIC' | 'PRIVATE') => {
    const newVisibility = currentVisibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC'
    changeVisibilityMutation.mutate({
      organizationId,
      fileId,
      visibility: newVisibility,
    })
  }

  // Upload complete
  const handleUploadComplete = () => {
    invalidateAfterUpload()
  }

  // Search
  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  // Toggle trash view
  const handleToggleTrash = () => {
    setIsTrashView(!isTrashView)
  }

  // Move file
  const handleMoveFile = useCallback((targetFolderId: string | null) => {
    if (!moveDialog) return

    moveFileMutation.mutate({
      organizationId,
      fileId: moveDialog.fileId,
      folderId: targetFolderId,
    })

    setMoveDialog(null)
  }, [moveDialog, moveFileMutation, organizationId])

  // ============================================================================
  // SELECTION HANDLERS
  // ============================================================================

  /**
   * Convert file data to SelectedFile format
   */
  const fileToSelectedFile = useCallback((file: typeof filteredFiles[0]): SelectedFile => ({
    id: file.id,
    name: file.name,
    displayName: file.displayName,
    extension: file.extension,
    category: file.fileCategory,
    size: file.size,
    visibility: file.visibility,
    accessUrl: file.accessUrl,
    publicUrl: file.publicUrl,
    thumbnailUrl: file.thumbnailUrl,
    hlsManifestUrl: file.hlsManifestUrl,
    posterUrl: file.posterUrl,
    videoProcessingStatus: file.videoProcessingStatus,
    mimeType: file.mimeType,
  }), [])

  /**
   * Handle file selection/deselection
   */
  const handleFileSelect = useCallback((file: typeof filteredFiles[0]) => {
    if (mode === 'browse') return

    const selectedFile = fileToSelectedFile(file)

    if (mode === 'select') {
      // Single select - immediately call onSelect
      setSelectedFiles(new Map([[file.id, selectedFile]]))
      onSelect?.(selectedFile)
    } else if (mode === 'multi-select') {
      setSelectedFiles((prev) => {
        const newMap = new Map(prev)
        if (newMap.has(file.id)) {
          // Deselect
          newMap.delete(file.id)
        } else {
          // Check max selection
          if (maxSelection && newMap.size >= maxSelection) {
            toast.error(`Maximum ${maxSelection} files can be selected`)
            return prev
          }
          // Select
          newMap.set(file.id, selectedFile)
        }
        return newMap
      })
    }
  }, [mode, fileToSelectedFile, onSelect, maxSelection])

  /**
   * Handle confirm button click (multi-select mode)
   */
  const handleConfirmSelection = useCallback(() => {
    const files = Array.from(selectedFiles.values())
    onConfirm?.(files)
  }, [selectedFiles, onConfirm])

  /**
   * Check if a file is selected
   */
  const isFileSelected = useCallback((fileId: string) => {
    return selectedFiles.has(fileId)
  }, [selectedFiles])

  // ============================================================================
  // COMPUTED STATE
  // ============================================================================

  const isLoading = foldersLoading || filesLoading || (!!currentFolderId && validatingFolder)

  const isEmpty =
    !isLoading &&
    !isFolderInTrash &&
    (!folders || folders.length === 0) &&
    filteredFiles.length === 0

  const hasSelection = selectedFiles.size > 0
  const isSelectMode = mode === 'select' || mode === 'multi-select'

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <StorageBrowserHeader
        breadcrumb={breadcrumb || []}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSearch={handleSearch}
        searchQuery={searchQuery}
        onUpload={showUpload ? () => setShowUploadDialog(true) : undefined}
        onNewFolder={showCreateFolder ? () => setShowCreateFolderDialog(true) : undefined}
        onNavigate={handleNavigate}
        isTrashView={isTrashView}
        onToggleTrash={showTrash ? handleToggleTrash : undefined}
        trashCount={trashCount}
        showUpload={showUpload}
        showCreateFolder={showCreateFolder}
        showTrash={showTrash}
        title={title}
        subtitle={subtitle}
        mode={mode}
        fileFilter={fileFilter}
        isModal={isModal}
        onClose={onClose}
        storageUsage={storageGate}
      />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Trash view */}
        {isTrashView && <TrashView organizationId={organizationId} />}

        {/* Normal file/folder view */}
        {!isTrashView && (
          <>
            {/* Folder in trash message */}
            {isFolderInTrash && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
                  <svg
                    viewBox="0 0 120 90"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-12 h-12 opacity-60"
                  >
                    <path
                      d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
                      fill="#f59e0b"
                      fillOpacity="0.5"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  This folder is in the trash
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                  The folder &quot;{folderInTrashName}&quot; has been moved to
                  trash. You can restore it from the trash to access its
                  contents again.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleNavigate(null)}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Go to My Files
                  </button>
                  <button
                    onClick={() => setIsTrashView(true)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    View Trash
                  </button>
                </div>
              </div>
            )}

            {/* Loading skeleton - Grid */}
            {isLoading && viewMode === 'grid' && (
              <div className="space-y-6">
                <div>
                  <div className="h-[14px] w-14 rounded bg-muted/50 mb-3 animate-pulse" />
                  <FolderGrid>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <FolderCardSkeleton key={`folder-skeleton-${i}`} />
                    ))}
                  </FolderGrid>
                </div>
                <div>
                  <div className="h-[14px] w-10 rounded bg-muted/50 mb-3 animate-pulse" />
                  <FileGrid>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <FileCardSkeleton key={`file-skeleton-${i}`} />
                    ))}
                  </FileGrid>
                </div>
              </div>
            )}

            {/* Loading skeleton - List */}
            {isLoading && viewMode === 'list' && (
              <div className="space-y-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <FileListItemSkeleton key={`list-skeleton-${i}`} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {isEmpty && !isLoading && (
              fileFilter !== 'all' ? (
                // Custom empty state when filtering
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                    <FolderOpen className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    No {fileFilter}s found
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                    {currentFolderId
                      ? `This folder doesn't contain any ${fileFilter} files.`
                      : `You haven't uploaded any ${fileFilter} files yet.`}
                  </p>
                  {/* Upload button — gated by storage limit via FeatureGate wrapper */}
                  {showUpload && (
                    <FeatureGate feature="storage_kb.limit">
                      <Button onClick={() => setShowUploadDialog(true)}>
                        Upload Files
                      </Button>
                    </FeatureGate>
                  )}
                </div>
              ) : (
                <EmptyState
                  isInFolder={!!currentFolderId}
                  onUpload={() => setShowUploadDialog(true)}
                  onNewFolder={() => setShowCreateFolderDialog(true)}
                />
              )
            )}

            {/* Grid View */}
            {!isLoading && !isEmpty && !isFolderInTrash && viewMode === 'grid' && (
              <div className="space-y-6">
                {/* Search results indicator */}
                {searchQuery && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Showing results for</span>
                    <span className="font-medium text-foreground">&quot;{searchQuery}&quot;</span>
                    <span>across all folders</span>
                  </div>
                )}

                {/* Folders section */}
                {folders && folders.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-muted-foreground mb-3">
                      {searchQuery ? 'Matching Folders' : 'Folders'}
                    </h2>
                    <FolderGrid>
                      {folders.map((folder) => {
                        const isDeleting = operations.deletingFolders.has(folder.id)
                        return (
                          <div
                            key={folder.id}
                            className={cn(
                              'transition-opacity',
                              isDeleting && 'opacity-50 pointer-events-none'
                            )}
                          >
                            <FolderCard
                              id={folder.id}
                              name={folder.name}
                              fileCount={folder._count.files}
                              color={folder.color || undefined}
                              onClick={() => handleFolderClick(folder.id)}
                              onDoubleClick={() => handleFolderClick(folder.id)}
                              onDelete={() => handleDeleteFolderClick(folder.id, folder.name)}
                              onRename={(newName) => {
                                updateFolderMutation.mutate({
                                  organizationId,
                                  folderId: folder.id,
                                  name: newName,
                                })
                              }}
                              isRenaming={operations.updatingFolders.has(folder.id)}
                              onEdit={() => {
                                setEditFolderDialog({
                                  open: true,
                                  folderId: folder.id,
                                  folderName: folder.name,
                                  folderColor: folder.color,
                                })
                              }}
                              onMove={() => {
                                toast.info('Folder move coming soon!')
                              }}
                            />
                          </div>
                        )
                      })}
                      {/* Quick create folder button - hidden during search */}
                      {!searchQuery && showCreateFolder && (
                        <CreateFolderButton
                          onClick={() => setShowCreateFolderDialog(true)}
                        />
                      )}
                    </FolderGrid>
                  </div>
                )}

                {/* Files section */}
                {filteredFiles.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-muted-foreground mb-3">
                      {searchQuery ? 'Matching Files' : 'Files'}
                      {fileFilter !== 'all' && ` (${fileFilter}s only)`}
                    </h2>
                    <FileGrid>
                      {filteredFiles.map((file) => {
                        const isDeleting = operations.deletingFiles.has(file.id)
                        const isUpdating = operations.updatingFiles.has(file.id)
                        const isOperating = isDeleting || isUpdating
                        const isSelected = isFileSelected(file.id)

                        return (
                          <div
                            key={file.id}
                            className={cn(
                              'relative transition-opacity',
                              isOperating && 'opacity-50 pointer-events-none'
                            )}
                          >
                            {/* Selection checkbox overlay for select modes */}
                            {isSelectMode && (
                              <div
                                className={cn(
                                  'absolute top-2 left-2 z-10',
                                  isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                )}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleFileSelect(file)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-background"
                                />
                              </div>
                            )}

                            <FileCard
                              id={file.id}
                              organizationId={organizationId}
                              name={file.displayName || file.name}
                              extension={file.extension}
                              category={file.fileCategory}
                              size={file.size}
                              thumbnailUrl={file.thumbnailUrl}
                              accessUrl={file.accessUrl}
                              publicUrl={file.publicUrl}
                              visibility={file.visibility}
                              hlsManifestUrl={file.hlsManifestUrl}
                              posterUrl={file.posterUrl}
                              videoProcessingStatus={file.videoProcessingStatus}
                              isSelected={isSelected}
                              onClick={() => {
                                if (isOperating) return
                                if (isSelectMode) {
                                  handleFileSelect(file)
                                }
                              }}
                              onDownload={() => {
                                if (isOperating) return
                                // TODO: Implement download
                              }}
                              onDelete={() => handleDeleteFileClick(file.id, file.displayName || file.name)}
                              onRename={(newName) => {
                                renameFileMutation.mutate({
                                  organizationId,
                                  fileId: file.id,
                                  displayName: newName,
                                })
                              }}
                              isRenaming={operations.updatingFiles.has(file.id)}
                              onMove={() => {
                                setMoveDialog({
                                  open: true,
                                  fileId: file.id,
                                  fileName: file.displayName || file.name,
                                })
                              }}
                              onToggleVisibility={() =>
                                handleToggleVisibility(file.id, file.visibility)
                              }
                              className={cn(
                                isSelectMode && 'cursor-pointer',
                                isSelected && 'ring-2 ring-primary'
                              )}
                            />
                          </div>
                        )
                      })}
                    </FileGrid>
                  </div>
                )}
              </div>
            )}

            {/* List View */}
            {!isLoading && !isEmpty && !isFolderInTrash && viewMode === 'list' && (
              <div className="space-y-2">
                {/* Search results indicator */}
                {searchQuery && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2">
                    <span>Showing results for</span>
                    <span className="font-medium text-foreground">&quot;{searchQuery}&quot;</span>
                    <span>across all folders</span>
                  </div>
                )}

                {/* Folders */}
                <div className="space-y-1">
                  {folders?.map((folder) => {
                    const isDeleting = operations.deletingFolders.has(folder.id)
                    return (
                      <div
                        key={folder.id}
                        className={cn(
                          'flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-opacity',
                          isDeleting && 'opacity-50 pointer-events-none'
                        )}
                        onClick={() => handleFolderClick(folder.id)}
                      >
                        <div className="w-10 h-10 flex-shrink-0">
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
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {folder.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {folder._count.files} files
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Files */}
                <div className="space-y-1">
                  {filteredFiles.map((file) => {
                    const isDeleting = operations.deletingFiles.has(file.id)
                    const isUpdating = operations.updatingFiles.has(file.id)
                    const isOperating = isDeleting || isUpdating
                    const isSelected = isFileSelected(file.id)

                    return (
                      <div
                        key={file.id}
                        className={cn(
                          'relative transition-opacity',
                          isOperating && 'opacity-50 pointer-events-none'
                        )}
                      >
                        <FileListItem
                          id={file.id}
                          name={file.displayName || file.name}
                          extension={file.extension}
                          category={file.fileCategory}
                          size={file.size}
                          thumbnailUrl={file.thumbnailUrl}
                          accessUrl={file.accessUrl}
                          publicUrl={file.publicUrl}
                          visibility={file.visibility}
                          createdAt={new Date(file.createdAt)}
                          isSelected={isSelected}
                          onClick={() => {
                            if (isOperating) return
                            if (isSelectMode) {
                              handleFileSelect(file)
                            }
                          }}
                          onDownload={() => {
                            if (isOperating) return
                            // TODO: Implement download
                          }}
                          onDelete={() =>
                            handleDeleteFileClick(file.id, file.displayName || file.name)
                          }
                          onRename={(newName) => {
                            renameFileMutation.mutate({
                              organizationId,
                              fileId: file.id,
                              displayName: newName,
                            })
                          }}
                          isRenaming={operations.updatingFiles.has(file.id)}
                          onMove={() => {
                            setMoveDialog({
                              open: true,
                              fileId: file.id,
                              fileName: file.displayName || file.name,
                            })
                          }}
                          onToggleVisibility={() =>
                            handleToggleVisibility(file.id, file.visibility)
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Selection footer (only for select/multi-select modes) */}
      {isSelectMode && !isTrashView && (
        <div className="flex items-center justify-between pt-4 mt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {hasSelection ? (
              <span>
                {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
                {maxSelection && ` (max ${maxSelection})`}
              </span>
            ) : (
              <span>No files selected</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isModal && onClose && (
              <Button variant="outline" onClick={onClose}>
                {cancelButtonText}
              </Button>
            )}
            {mode === 'multi-select' && onConfirm && (
              <Button
                onClick={handleConfirmSelection}
                disabled={!hasSelection}
              >
                <Check className="w-4 h-4 mr-2" />
                {confirmButtonText}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <UploadDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        folderId={currentFolderId}
        organizationId={organizationId}
        onUploadComplete={handleUploadComplete}
      />

      <CreateFolderDialog
        open={showCreateFolderDialog}
        onClose={() => setShowCreateFolderDialog(false)}
        onCreate={handleCreateFolder}
        isLoading={createFolderMutation.isPending}
      />

      <MoveToDialog
        open={moveDialog?.open ?? false}
        onClose={() => setMoveDialog(null)}
        fileId={moveDialog?.fileId ?? ''}
        fileName={moveDialog?.fileName ?? ''}
        organizationId={organizationId}
        currentFolderId={currentFolderId}
        onMove={handleMoveFile}
        isMoving={moveFileMutation.isPending}
      />

      <EditFolderDialog
        open={editFolderDialog?.open ?? false}
        onClose={() => setEditFolderDialog(null)}
        folderId={editFolderDialog?.folderId ?? ''}
        folderName={editFolderDialog?.folderName ?? ''}
        folderColor={editFolderDialog?.folderColor}
        onSave={(data) => {
          if (!editFolderDialog?.folderId) return
          updateFolderMutation.mutate({
            organizationId,
            folderId: editFolderDialog.folderId,
            name: data.name,
            color: data.color,
          })
        }}
        isSaving={updateFolderMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteDialog?.name}&quot; will be moved to trash.
              {deleteDialog?.type === 'folder' && (
                <span className="block mt-2 text-amber-600 dark:text-amber-500">
                  All files and subfolders inside will also be moved to trash.
                </span>
              )}
              <span className="block mt-2">
                Items in trash are automatically deleted after 30 days. You can
                restore them before then.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
