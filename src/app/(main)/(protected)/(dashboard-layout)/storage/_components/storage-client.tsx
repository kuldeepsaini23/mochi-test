/**
 * STORAGE CLIENT COMPONENT
 *
 * Main client-side component for the file storage page.
 * Handles all state management, API calls, and user interactions.
 *
 * FEATURES:
 * - Folder navigation with breadcrumb
 * - Grid/List view toggle
 * - Search functionality
 * - File upload with drag-drop
 * - Folder creation
 * - File/Folder actions (rename, delete, move)
 *
 * PATTERNS:
 * - Uses optimistic UI updates for instant feedback
 * - Uses invalidate() instead of refetch() for cache management
 * - Uses shadcn AlertDialog instead of browser confirm()
 * - Shows loading/disabled states during operations
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/trpc/react-provider'
import { StorageHeader, type ViewMode } from './storage-header'
import { EmptyState } from './empty-state'
import { UploadDialog } from './upload-dialog'
import { CreateFolderDialog } from './create-folder-dialog'
import { TrashView } from './trash-view'
import { MoveToDialog } from './move-to-dialog'
import { EditFolderDialog } from './edit-folder-dialog'
import { FolderCard, FolderGrid, CreateFolderButton, FolderCardSkeleton } from '@/components/storage/folder-card'
import { FileCard, FileGrid, FileListItem, FileCardSkeleton, FileListItemSkeleton } from '@/components/storage/file-card'
import { useStorageInvalidation } from '../_hooks/use-storage-queries'
import { useFeatureGate } from '@/components/feature-gate'
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

// ============================================================================
// TYPES
// ============================================================================

interface StorageClientProps {
  organizationId: string
}

// State for tracking which items are being operated on
interface OperationState {
  deletingFolders: Set<string>
  deletingFiles: Set<string>
  updatingFiles: Set<string>
  updatingFolders: Set<string>
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StorageClient({ organizationId }: StorageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()

  // Centralized cache invalidation - SINGLE SOURCE OF TRUTH for all storage queries
  const {
    invalidateAfterFolderCreate,
    invalidateAfterFolderDelete,
    invalidateAfterFileDelete,
    invalidateAfterUpload,
  } = useStorageInvalidation({ organizationId })

  // Get current folder from URL
  const currentFolderId = searchParams.get('folder') || null

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false)
  const [isTrashView, setIsTrashView] = useState(false)

  /**
   * Feature gate for storage limit — used to display usage bar in the header.
   * NOTE: The upload button limit check is handled by <FeatureGate> wrappers
   * in StorageHeader and EmptyState, which intercept clicks and show the
   * upgrade modal automatically when at capacity.
   */
  const storageGate = useFeatureGate('storage_kb.limit')

  /** Opens the upload dialog — limit enforcement is handled by FeatureGate wrappers */
  const handleUploadClick = useCallback(() => {
    setShowUploadDialog(true)
  }, [])

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

  // Track which items are being operated on (for showing loading states)
  const [operations, setOperations] = useState<OperationState>({
    deletingFolders: new Set(),
    deletingFiles: new Set(),
    updatingFiles: new Set(),
    updatingFolders: new Set(),
  })

  // Helper to add/remove items from operation tracking
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

  // Query keys for cache management
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
  // FOLDER VALIDATION
  // ============================================================================
  // When navigating to a specific folder, validate it exists and isn't deleted
  // This prevents accessing soft-deleted folders via direct URL navigation

  const {
    data: folderValidation,
    isLoading: validatingFolder,
  } = trpc.storage.validateFolder.useQuery(
    { organizationId, folderId: currentFolderId! },
    {
      enabled: !!currentFolderId, // Only validate if we're in a folder
    }
  )

  // Handle folder validation result - redirect if folder doesn't exist
  useEffect(() => {
    if (folderValidation?.status === 'NOT_FOUND') {
      toast.error('Folder not found')
      router.replace('/storage')
    }
  }, [folderValidation, router])

  // Determine if the current folder is in trash
  const isFolderInTrash =
    currentFolderId && folderValidation?.status === 'IN_TRASH'
  const folderInTrashName =
    folderValidation?.status === 'IN_TRASH'
      ? folderValidation.folder.name
      : null

  // Fetch folders in current directory (only if folder is valid or we're at root)
  const { data: folders, isLoading: foldersLoading } =
    trpc.storage.listFolders.useQuery(foldersQueryKey, {
      enabled: !currentFolderId || folderValidation?.status === 'OK',
    })

  // Fetch files in current directory (only if folder is valid or we're at root)
  const { data: filesData, isLoading: filesLoading } =
    trpc.storage.listFiles.useQuery(filesQueryKey, {
      enabled: !currentFolderId || folderValidation?.status === 'OK',
    })

  // Fetch breadcrumb if in a folder
  const { data: breadcrumb } = trpc.storage.getFolderBreadcrumb.useQuery(
    { organizationId, folderId: currentFolderId! },
    { enabled: !!currentFolderId && folderValidation?.status === 'OK' }
  )

  // Fetch trash count for badge
  const { data: trashData } = trpc.storage.listTrash.useQuery({ organizationId })
  const trashCount =
    (trashData?.folders?.length || 0) + (trashData?.files?.length || 0)

  // ============================================================================
  // MUTATIONS WITH OPTIMISTIC UPDATES
  // ============================================================================

  /**
   * Create folder mutation with optimistic update.
   * Uses centralized invalidation to ensure all folder caches are refreshed.
   */
  const createFolderMutation = trpc.storage.createFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder created')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create folder')
    },
    onSettled: () => {
      // Invalidate ALL folder caches + stats (centralized invalidation)
      invalidateAfterFolderCreate()
    },
  })

  /**
   * Delete folder mutation with optimistic update.
   * Moves folder (and all nested contents) to trash.
   * Uses centralized invalidation to refresh all affected caches.
   */
  const deleteFolderMutation = trpc.storage.deleteFolder.useMutation({
    onMutate: async ({ folderId }) => {
      // Mark as deleting for UI feedback
      addOperation('deletingFolders', folderId)

      // Cancel any outgoing queries to prevent race conditions
      await utils.storage.listFolders.cancel(foldersQueryKey)

      // Snapshot current data for rollback on error
      const previousFolders = utils.storage.listFolders.getData(foldersQueryKey)

      // Optimistically remove from current folder list
      utils.storage.listFolders.setData(foldersQueryKey, (old) => {
        if (!old) return old
        return old.filter((f) => f.id !== folderId)
      })

      return { previousFolders }
    },
    onError: (error, { folderId }, context) => {
      // Rollback on error
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
      // Invalidate ALL related caches: folders, files, trash, stats (centralized)
      invalidateAfterFolderDelete()
    },
  })

  /**
   * Delete files mutation with optimistic update.
   *
   * IMPORTANT: Uses deleteFilesWithStorage (not deleteFiles) to:
   * 1. Soft delete from database (move to trash)
   * 2. Schedule Trigger.dev task for R2 deletion after 30 days
   * 3. Allow restoration before permanent deletion
   *
   * Also updates folder file counts optimistically.
   */
  const deleteFilesMutation = trpc.storage.deleteFilesWithStorage.useMutation({
    onMutate: async ({ fileIds }) => {
      // Mark files as deleting for UI feedback
      fileIds.forEach((id) => addOperation('deletingFiles', id))

      // Cancel any outgoing queries to prevent race conditions
      await utils.storage.listFiles.cancel(filesQueryKey)
      await utils.storage.listFolders.cancel(foldersQueryKey)

      const previousFiles = utils.storage.listFiles.getData(filesQueryKey)
      const previousFolders = utils.storage.listFolders.getData(foldersQueryKey)

      // Optimistically remove files from current folder list
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

      // Optimistically update current folder's file count in parent view
      // If we're in a folder, decrement that folder's count in the parent's folder list
      if (currentFolderId) {
        const parentFoldersKey = {
          organizationId,
          parentId: null as string | null, // Root level - where current folder is displayed
          search: searchQuery || undefined,
        }
        utils.storage.listFolders.setData(parentFoldersKey, (old) => {
          if (!old) return old
          return old.map((folder) => {
            if (folder.id === currentFolderId) {
              return {
                ...folder,
                _count: {
                  ...folder._count,
                  files: Math.max(0, folder._count.files - fileIds.length),
                },
              }
            }
            return folder
          })
        })
      }

      return { previousFiles, previousFolders }
    },
    onError: (error, { fileIds }, context) => {
      // Rollback on error
      if (context?.previousFiles) {
        utils.storage.listFiles.setData(filesQueryKey, context.previousFiles)
      }
      if (context?.previousFolders) {
        utils.storage.listFolders.setData(foldersQueryKey, context.previousFolders)
      }
      toast.error(error.message || 'Failed to delete file')
      fileIds.forEach((id) => removeOperation('deletingFiles', id))
    },
    onSuccess: (_, { fileIds }) => {
      toast.success(fileIds.length === 1 ? 'File moved to trash' : `${fileIds.length} files moved to trash`)
      fileIds.forEach((id) => removeOperation('deletingFiles', id))
    },
    onSettled: () => {
      // Invalidate ALL related caches: files, trash, stats, folders (centralized)
      invalidateAfterFileDelete()
      utils.storage.listFolders.invalidate()
    },
  })

  /**
   * Change file visibility mutation with optimistic update.
   * Updates file visibility (PUBLIC/PRIVATE) with instant UI feedback.
   */
  const changeVisibilityMutation = trpc.storage.changeVisibility.useMutation({
    onMutate: async ({ fileId, visibility }) => {
      addOperation('updatingFiles', fileId)

      await utils.storage.listFiles.cancel(filesQueryKey)
      const previousFiles = utils.storage.listFiles.getData(filesQueryKey)

      // Optimistically update visibility in current folder list
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
      // Invalidate ALL file caches (centralized) - visibility change doesn't affect trash/stats
      utils.storage.listFiles.invalidate()
    },
  })

  /**
   * Rename file mutation with optimistic update.
   * Updates file displayName with instant UI feedback.
   */
  const renameFileMutation = trpc.storage.updateFile.useMutation({
    onMutate: async ({ fileId, displayName }) => {
      addOperation('updatingFiles', fileId)

      await utils.storage.listFiles.cancel(filesQueryKey)
      const previousFiles = utils.storage.listFiles.getData(filesQueryKey)

      // Optimistically update displayName in current folder list
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

  /**
   * Move file mutation with optimistic update.
   * Moves file to a different folder.
   * Also updates folder file counts optimistically.
   */
  const moveFileMutation = trpc.storage.updateFile.useMutation({
    onMutate: async ({ fileId, folderId: targetFolderId }) => {
      addOperation('updatingFiles', fileId)

      // Cancel both files and folders queries
      await utils.storage.listFiles.cancel(filesQueryKey)
      await utils.storage.listFolders.cancel(foldersQueryKey)

      const previousFiles = utils.storage.listFiles.getData(filesQueryKey)
      const previousFolders = utils.storage.listFolders.getData(foldersQueryKey)

      // Optimistically remove from current folder files list
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

      // Optimistically update folder file counts in the current view
      // Decrement source folder count, increment target folder count
      utils.storage.listFolders.setData(foldersQueryKey, (old) => {
        if (!old) return old
        return old.map((folder) => {
          // If target folder is visible in current view, increment its count
          if (folder.id === targetFolderId) {
            return {
              ...folder,
              _count: { ...folder._count, files: folder._count.files + 1 },
            }
          }
          return folder
        })
      })

      // Also update parent folder view if we're moving from a subfolder
      // This handles the case where source folder is visible in parent's folder list
      if (currentFolderId) {
        const parentFoldersKey = {
          organizationId,
          parentId: null as string | null, // Root level
          search: searchQuery || undefined,
        }
        utils.storage.listFolders.setData(parentFoldersKey, (old) => {
          if (!old) return old
          return old.map((folder) => {
            if (folder.id === currentFolderId) {
              return {
                ...folder,
                _count: { ...folder._count, files: Math.max(0, folder._count.files - 1) },
              }
            }
            if (folder.id === targetFolderId) {
              return {
                ...folder,
                _count: { ...folder._count, files: folder._count.files + 1 },
              }
            }
            return folder
          })
        })
      }

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
      // Invalidate all folder and file caches to ensure counts are correct
      utils.storage.listFiles.invalidate()
      utils.storage.listFolders.invalidate()
    },
  })

  /**
   * Update folder mutation with optimistic update.
   * Used for renaming folders and changing colors.
   */
  const updateFolderMutation = trpc.storage.updateFolder.useMutation({
    onMutate: async ({ folderId, name, color }) => {
      addOperation('updatingFolders', folderId)

      await utils.storage.listFolders.cancel(foldersQueryKey)
      const previousFolders = utils.storage.listFolders.getData(foldersQueryKey)

      // Optimistically update folder name/color
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
      setEditFolderDialog(null) // Close edit dialog on success
    },
    onSettled: () => {
      utils.storage.listFolders.invalidate()
    },
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Navigation handlers
  const handleNavigate = useCallback(
    (folderId: string | null) => {
      if (folderId) {
        router.push(`/storage?folder=${folderId}`)
      } else {
        router.push('/storage')
      }
    },
    [router]
  )

  const handleFolderClick = useCallback(
    (folderId: string) => {
      // Don't navigate if folder is being deleted
      if (operations.deletingFolders.has(folderId)) return
      handleNavigate(folderId)
    },
    [handleNavigate, operations.deletingFolders]
  )

  // Create folder handler
  const handleCreateFolder = async (data: { name: string; color?: string }) => {
    await createFolderMutation.mutateAsync({
      organizationId,
      name: data.name,
      parentId: currentFolderId,
      color: data.color,
    })
  }

  // Open delete confirmation dialog for folder
  const handleDeleteFolderClick = (folderId: string, folderName: string) => {
    setDeleteDialog({
      open: true,
      type: 'folder',
      id: folderId,
      name: folderName,
    })
  }

  // Open delete confirmation dialog for file
  const handleDeleteFileClick = (fileId: string, fileName: string) => {
    setDeleteDialog({
      open: true,
      type: 'file',
      id: fileId,
      name: fileName,
    })
  }

  // Confirm delete action
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

  // Toggle file visibility
  const handleToggleVisibility = (
    fileId: string,
    currentVisibility: 'PUBLIC' | 'PRIVATE'
  ) => {
    const newVisibility = currentVisibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC'
    changeVisibilityMutation.mutate({
      organizationId,
      fileId,
      visibility: newVisibility,
    })
  }

  // Upload complete handler - uses centralized invalidation to refresh ALL caches
  const handleUploadComplete = () => {
    invalidateAfterUpload()
  }

  // Search handler
  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  // Toggle trash view handler
  const handleToggleTrash = () => {
    setIsTrashView(!isTrashView)
  }

  // Handle move file to different folder
  const handleMoveFile = useCallback((targetFolderId: string | null) => {
    if (!moveDialog) return

    moveFileMutation.mutate({
      organizationId,
      fileId: moveDialog.fileId,
      folderId: targetFolderId,
    })

    setMoveDialog(null)
  }, [moveDialog, moveFileMutation, organizationId])

  // Loading state (include folder validation when navigating to a specific folder)
  const isLoading =
    foldersLoading || filesLoading || (!!currentFolderId && validatingFolder)

  // Empty state check
  const isEmpty =
    !isLoading &&
    !isFolderInTrash &&
    (!folders || folders.length === 0) &&
    (!filesData?.files || filesData.files.length === 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header with breadcrumb, search, and actions */}
      <StorageHeader
        breadcrumb={breadcrumb || []}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSearch={handleSearch}
        searchQuery={searchQuery}
        onUpload={handleUploadClick}
        onNewFolder={() => setShowCreateFolderDialog(true)}
        onNavigate={handleNavigate}
        isTrashView={isTrashView}
        onToggleTrash={handleToggleTrash}
        trashCount={trashCount}
        storageUsage={storageGate}
      />

      {/* Content area */}
      <div className="flex-1">
        {/* Trash view - shown when isTrashView is true */}
        {isTrashView && <TrashView organizationId={organizationId} />}

        {/* Normal file/folder view - hidden when in trash */}
        {!isTrashView && (
          <>
            {/* Folder in trash message - when trying to access a soft-deleted folder */}
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

            {/* Loading skeleton - 1:1 match with actual UI structure */}
            {isLoading && viewMode === 'grid' && (
              <div className="space-y-6">
                {/* Folders section skeleton */}
                <div>
                  {/* Section heading - matches "text-sm font-medium text-muted-foreground mb-3" */}
                  <div className="h-[14px] w-14 rounded bg-muted/50 mb-3 animate-pulse" />
                  <FolderGrid>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <FolderCardSkeleton key={`folder-skeleton-${i}`} />
                    ))}
                  </FolderGrid>
                </div>

                {/* Files section skeleton */}
                <div>
                  {/* Section heading */}
                  <div className="h-[14px] w-10 rounded bg-muted/50 mb-3 animate-pulse" />
                  <FileGrid>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <FileCardSkeleton key={`file-skeleton-${i}`} />
                    ))}
                  </FileGrid>
                </div>
              </div>
            )}

            {/* Loading skeleton for list view */}
            {isLoading && viewMode === 'list' && (
              <div className="space-y-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <FileListItemSkeleton key={`list-skeleton-${i}`} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {isEmpty && !isLoading && (
              <EmptyState
                isInFolder={!!currentFolderId}
                onUpload={handleUploadClick}
                onNewFolder={() => setShowCreateFolderDialog(true)}
              />
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
                        const isDeleting = operations.deletingFolders.has(
                          folder.id
                        )
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
                              onDelete={() =>
                                handleDeleteFolderClick(folder.id, folder.name)
                              }
                              // Inline rename - called when user finishes editing name
                              onRename={(newName) => {
                                updateFolderMutation.mutate({
                                  organizationId,
                                  folderId: folder.id,
                                  name: newName,
                                })
                              }}
                              isRenaming={operations.updatingFolders.has(folder.id)}
                              // Edit modal - opens dialog for name + color changes
                              onEdit={() => {
                                setEditFolderDialog({
                                  open: true,
                                  folderId: folder.id,
                                  folderName: folder.name,
                                  folderColor: folder.color,
                                })
                              }}
                              onMove={() => {
                                // TODO: Implement folder move
                                toast.info('Folder move coming soon!')
                              }}
                            />
                          </div>
                        )
                      })}
                      {/* Quick create folder button - hidden during search */}
                      {!searchQuery && (
                        <CreateFolderButton
                          onClick={() => setShowCreateFolderDialog(true)}
                        />
                      )}
                    </FolderGrid>
                  </div>
                )}

                {/* Files section */}
                {filesData?.files && filesData.files.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-muted-foreground mb-3">
                      {searchQuery ? 'Matching Files' : 'Files'}
                    </h2>
                    <FileGrid>
                      {filesData.files.map((file) => {
                        const isDeleting = operations.deletingFiles.has(file.id)
                        const isUpdating = operations.updatingFiles.has(file.id)
                        const isOperating = isDeleting || isUpdating
                        return (
                          <div
                            key={file.id}
                            className={cn(
                              'transition-opacity',
                              isOperating && 'opacity-50 pointer-events-none'
                            )}
                          >
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
                              // Video HLS fields for inline playback
                              hlsManifestUrl={file.hlsManifestUrl}
                              posterUrl={file.posterUrl}
                              videoProcessingStatus={file.videoProcessingStatus}
                              onClick={() => {
                                if (isOperating) return
                                // TODO: Implement file preview
                              }}
                              onDownload={() => {
                                if (isOperating) return
                                // TODO: Implement download
                              }}
                              onDelete={() =>
                                handleDeleteFileClick(
                                  file.id,
                                  file.displayName || file.name
                                )
                              }
                              // Inline rename - double-click file name to edit
                              onRename={(newName) => {
                                renameFileMutation.mutate({
                                  organizationId,
                                  fileId: file.id,
                                  displayName: newName,
                                })
                              }}
                              isRenaming={operations.updatingFiles.has(file.id)}
                              onMove={() => {
                                // Open Move To modal with file info
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
                {filesData?.files.map((file) => {
                  const isDeleting = operations.deletingFiles.has(file.id)
                  const isUpdating = operations.updatingFiles.has(file.id)
                  const isOperating = isDeleting || isUpdating
                  return (
                    <div
                      key={file.id}
                      className={cn(
                        'transition-opacity',
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
                        onClick={() => {
                          if (isOperating) return
                          // TODO: Implement file preview
                        }}
                        onDownload={() => {
                          if (isOperating) return
                          // TODO: Implement download
                        }}
                        onDelete={() =>
                          handleDeleteFileClick(
                            file.id,
                            file.displayName || file.name
                          )
                        }
                        // Inline rename - double-click file name to edit
                        onRename={(newName) => {
                          renameFileMutation.mutate({
                            organizationId,
                            fileId: file.id,
                            displayName: newName,
                          })
                        }}
                        isRenaming={operations.updatingFiles.has(file.id)}
                        onMove={() => {
                          // Open Move To modal
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

      {/* Move To Dialog - folder tree for moving files */}
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

      {/* Edit Folder Dialog - for changing folder name and color */}
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
