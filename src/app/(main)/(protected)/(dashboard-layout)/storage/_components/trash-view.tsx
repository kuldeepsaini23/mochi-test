/**
 * TRASH VIEW COMPONENT
 *
 * Displays items that have been moved to trash (soft deleted).
 * Shows countdown to automatic permanent deletion (30 days from deletedAt).
 *
 * FEATURES:
 * - List deleted folders and files
 * - Show time remaining before permanent deletion
 * - Restore items (cancels scheduled deletion)
 * - Permanently delete items immediately
 * - Empty entire trash
 * - Optimistic UI updates for all operations
 * - Per-item loading states during operations
 *
 * SECURITY:
 * - All actions go through tRPC with permission checks
 * - Scheduled deletions are cancelled via Trigger.dev runs.cancel()
 */

'use client'

import { useState } from 'react'
import { trpc } from '@/trpc/react-provider'
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Clock,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { FileIcon } from '@/components/storage/file-icons'
import { toast } from 'sonner'
import { useStorageInvalidation } from '../_hooks/use-storage-queries'

// ============================================================================
// TYPES
// ============================================================================

interface TrashViewProps {
  organizationId: string
}

/**
 * Tracks which items are currently being operated on
 * Used to show loading states (opacity) on individual items
 */
interface OperationState {
  restoringFolders: Set<string>
  restoringFiles: Set<string>
  deletingFolders: Set<string>
  deletingFiles: Set<string>
  emptyingTrash: boolean
}

// ============================================================================
// HELPER: Calculate days remaining before permanent deletion
// ============================================================================

/**
 * Calculates days remaining before permanent deletion
 * Items are permanently deleted 30 days after being moved to trash
 */
function getDaysRemaining(deletedAt: Date): number {
  const deletionDate = new Date(deletedAt)
  const permanentDeletionDate = new Date(
    deletionDate.getTime() + 30 * 24 * 60 * 60 * 1000
  )
  const now = new Date()
  const msRemaining = permanentDeletionDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)))
}

/**
 * Formats the time remaining in a human-readable format
 */
function formatTimeRemaining(deletedAt: Date): string {
  const days = getDaysRemaining(deletedAt)
  if (days === 0) return 'Deleting soon'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TrashView({ organizationId }: TrashViewProps) {
  // Track selected items for bulk actions
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  // Track which items are being operated on (for per-item loading states)
  const [operations, setOperations] = useState<OperationState>({
    restoringFolders: new Set(),
    restoringFiles: new Set(),
    deletingFolders: new Set(),
    deletingFiles: new Set(),
    emptyingTrash: false,
  })

  // tRPC utilities for cache management (optimistic updates)
  const utils = trpc.useUtils()

  // Centralized cache invalidation - SINGLE SOURCE OF TRUTH
  const { invalidateAfterRestore, invalidateAll } = useStorageInvalidation({ organizationId })

  // Query key for trash listing
  const trashQueryKey = { organizationId }

  // Fetch trash contents
  const { data: trash, isLoading } = trpc.storage.listTrash.useQuery(trashQueryKey)

  // ============================================================================
  // OPERATION STATE HELPERS
  // ============================================================================

  /**
   * Add an item to an operation set (marks it as being operated on)
   */
  const addOperation = (
    type: 'restoringFolders' | 'restoringFiles' | 'deletingFolders' | 'deletingFiles',
    id: string
  ) => {
    setOperations((prev) => ({
      ...prev,
      [type]: new Set(prev[type]).add(id),
    }))
  }

  /**
   * Remove an item from an operation set (marks operation as complete)
   */
  const removeOperation = (
    type: 'restoringFolders' | 'restoringFiles' | 'deletingFolders' | 'deletingFiles',
    id: string
  ) => {
    setOperations((prev) => {
      const newSet = new Set(prev[type])
      newSet.delete(id)
      return { ...prev, [type]: newSet }
    })
  }

  /**
   * Remove multiple items from an operation set
   */
  const removeOperations = (
    type: 'restoringFolders' | 'restoringFiles' | 'deletingFolders' | 'deletingFiles',
    ids: string[]
  ) => {
    setOperations((prev) => {
      const newSet = new Set(prev[type])
      ids.forEach((id) => newSet.delete(id))
      return { ...prev, [type]: newSet }
    })
  }

  // ============================================================================
  // MUTATIONS WITH OPTIMISTIC UPDATES
  // ============================================================================

  /**
   * Restore a folder from trash.
   * - Optimistically removes from trash view
   * - Uses centralized invalidation to refresh all affected caches
   */
  const restoreFolderMutation = trpc.storage.restoreFolder.useMutation({
    onMutate: async ({ folderId }) => {
      // Mark folder as being restored for UI feedback
      addOperation('restoringFolders', folderId)

      // Cancel any outgoing queries to prevent race conditions
      await utils.storage.listTrash.cancel(trashQueryKey)

      // Snapshot current data for rollback on error
      const previousTrash = utils.storage.listTrash.getData(trashQueryKey)

      // Optimistically remove folder from trash
      utils.storage.listTrash.setData(trashQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          folders: old.folders.filter((f) => f.id !== folderId),
        }
      })

      return { previousTrash }
    },
    onError: (error, { folderId }, context) => {
      // Rollback on error
      if (context?.previousTrash) {
        utils.storage.listTrash.setData(trashQueryKey, context.previousTrash)
      }
      toast.error(error.message || 'Failed to restore folder')
      removeOperation('restoringFolders', folderId)
    },
    onSuccess: (_, { folderId }) => {
      toast.success('Folder restored')
      removeOperation('restoringFolders', folderId)
      // Remove from selection
      setSelectedFolders((prev) => {
        const newSet = new Set(prev)
        newSet.delete(folderId)
        return newSet
      })
    },
    onSettled: () => {
      // Invalidate ALL related caches: folders, files, trash, stats (centralized)
      invalidateAfterRestore()
    },
  })

  /**
   * Restore files from trash.
   * - Optimistically removes from trash view
   * - Uses centralized invalidation to refresh all affected caches
   */
  const restoreFilesMutation = trpc.storage.restoreFiles.useMutation({
    onMutate: async ({ fileIds }) => {
      // Mark files as being restored for UI feedback
      fileIds.forEach((id) => addOperation('restoringFiles', id))

      await utils.storage.listTrash.cancel(trashQueryKey)
      const previousTrash = utils.storage.listTrash.getData(trashQueryKey)

      // Optimistically remove files from trash
      utils.storage.listTrash.setData(trashQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          files: old.files.filter((f) => !fileIds.includes(f.id)),
        }
      })

      return { previousTrash }
    },
    onError: (error, { fileIds }, context) => {
      if (context?.previousTrash) {
        utils.storage.listTrash.setData(trashQueryKey, context.previousTrash)
      }
      toast.error(error.message || 'Failed to restore files')
      removeOperations('restoringFiles', fileIds)
    },
    onSuccess: (_, { fileIds }) => {
      toast.success(fileIds.length === 1 ? 'File restored' : `${fileIds.length} files restored`)
      removeOperations('restoringFiles', fileIds)
      // Remove from selection
      setSelectedFiles((prev) => {
        const newSet = new Set(prev)
        fileIds.forEach((id) => newSet.delete(id))
        return newSet
      })
    },
    onSettled: () => {
      // Invalidate ALL related caches: folders, files, trash, stats (centralized)
      invalidateAfterRestore()
    },
  })

  /**
   * Permanently delete a folder.
   * - Optimistically removes from trash view
   * - Deletes from R2 storage immediately
   * - Uses centralized invalidation to refresh stats
   */
  const permanentlyDeleteFolderMutation = trpc.storage.permanentlyDeleteFolder.useMutation({
    onMutate: async ({ folderId }) => {
      addOperation('deletingFolders', folderId)

      await utils.storage.listTrash.cancel(trashQueryKey)
      const previousTrash = utils.storage.listTrash.getData(trashQueryKey)

      // Optimistically remove folder from trash
      utils.storage.listTrash.setData(trashQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          folders: old.folders.filter((f) => f.id !== folderId),
        }
      })

      return { previousTrash }
    },
    onError: (error, { folderId }, context) => {
      if (context?.previousTrash) {
        utils.storage.listTrash.setData(trashQueryKey, context.previousTrash)
      }
      toast.error(error.message || 'Failed to delete folder')
      removeOperation('deletingFolders', folderId)
    },
    onSuccess: (_, { folderId }) => {
      toast.success('Folder permanently deleted')
      removeOperation('deletingFolders', folderId)
      setSelectedFolders((prev) => {
        const newSet = new Set(prev)
        newSet.delete(folderId)
        return newSet
      })
    },
    onSettled: () => {
      // Invalidate ALL caches - permanent deletion affects storage stats
      invalidateAll()
    },
  })

  /**
   * Permanently delete files.
   * - Optimistically removes from trash view
   * - Deletes from R2 storage immediately
   * - Uses centralized invalidation to refresh stats
   */
  const permanentlyDeleteFilesMutation = trpc.storage.permanentlyDeleteFiles.useMutation({
    onMutate: async ({ fileIds }) => {
      fileIds.forEach((id) => addOperation('deletingFiles', id))

      await utils.storage.listTrash.cancel(trashQueryKey)
      const previousTrash = utils.storage.listTrash.getData(trashQueryKey)

      // Optimistically remove files from trash
      utils.storage.listTrash.setData(trashQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          files: old.files.filter((f) => !fileIds.includes(f.id)),
        }
      })

      return { previousTrash }
    },
    onError: (error, { fileIds }, context) => {
      if (context?.previousTrash) {
        utils.storage.listTrash.setData(trashQueryKey, context.previousTrash)
      }
      toast.error(error.message || 'Failed to delete files')
      removeOperations('deletingFiles', fileIds)
    },
    onSuccess: (_, { fileIds }) => {
      toast.success(fileIds.length === 1 ? 'File permanently deleted' : `${fileIds.length} files permanently deleted`)
      removeOperations('deletingFiles', fileIds)
      setSelectedFiles((prev) => {
        const newSet = new Set(prev)
        fileIds.forEach((id) => newSet.delete(id))
        return newSet
      })
    },
    onSettled: () => {
      // Invalidate ALL caches - permanent deletion affects storage stats
      invalidateAll()
    },
  })

  /**
   * Empty entire trash.
   * - Optimistically clears all items
   * - Permanently deletes everything from R2 and database
   * - Uses centralized invalidation to refresh all caches including stats
   */
  const emptyTrashMutation = trpc.storage.emptyTrash.useMutation({
    onMutate: async () => {
      setOperations((prev) => ({ ...prev, emptyingTrash: true }))

      await utils.storage.listTrash.cancel(trashQueryKey)
      const previousTrash = utils.storage.listTrash.getData(trashQueryKey)

      // Optimistically clear all items from trash
      utils.storage.listTrash.setData(trashQueryKey, () => ({ folders: [], files: [] }))

      return { previousTrash }
    },
    onError: (error, _, context) => {
      if (context?.previousTrash) {
        utils.storage.listTrash.setData(trashQueryKey, context.previousTrash)
      }
      toast.error(error.message || 'Failed to empty trash')
      setOperations((prev) => ({ ...prev, emptyingTrash: false }))
    },
    onSuccess: () => {
      toast.success('Trash emptied')
      setOperations((prev) => ({ ...prev, emptyingTrash: false }))
      setSelectedFolders(new Set())
      setSelectedFiles(new Set())
    },
    onSettled: () => {
      // Invalidate ALL caches - emptying trash significantly affects stats
      invalidateAll()
    },
  })

  // ============================================================================
  // COMPUTED STATE
  // ============================================================================

  // Check if any operations are in progress (for disabling bulk actions)
  const isOperating =
    restoreFolderMutation.isPending ||
    restoreFilesMutation.isPending ||
    permanentlyDeleteFolderMutation.isPending ||
    permanentlyDeleteFilesMutation.isPending ||
    emptyTrashMutation.isPending ||
    operations.emptyingTrash

  // Handler: Toggle folder selection
  const toggleFolderSelection = (folderId: string) => {
    const newSelected = new Set(selectedFolders)
    if (newSelected.has(folderId)) {
      newSelected.delete(folderId)
    } else {
      newSelected.add(folderId)
    }
    setSelectedFolders(newSelected)
  }

  // Handler: Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    const newSelected = new Set(selectedFiles)
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId)
    } else {
      newSelected.add(fileId)
    }
    setSelectedFiles(newSelected)
  }

  // Handler: Restore selected items
  const handleRestoreSelected = async () => {
    // Restore folders one by one (each has its own scheduled deletion)
    for (const folderId of selectedFolders) {
      await restoreFolderMutation.mutateAsync({ organizationId, folderId })
    }

    // Restore files in batch
    if (selectedFiles.size > 0) {
      await restoreFilesMutation.mutateAsync({
        organizationId,
        fileIds: Array.from(selectedFiles),
      })
    }
  }

  // Handler: Permanently delete selected items
  const handleDeleteSelected = async () => {
    // Delete folders one by one
    for (const folderId of selectedFolders) {
      await permanentlyDeleteFolderMutation.mutateAsync({
        organizationId,
        folderId,
      })
    }

    // Delete files in batch
    if (selectedFiles.size > 0) {
      await permanentlyDeleteFilesMutation.mutateAsync({
        organizationId,
        fileIds: Array.from(selectedFiles),
      })
    }
  }

  // Handler: Empty entire trash
  const handleEmptyTrash = async () => {
    await emptyTrashMutation.mutateAsync({ organizationId })
  }

  // Calculate total selected count
  const totalSelected = selectedFolders.size + selectedFiles.size
  const hasSelection = totalSelected > 0

  // Check if trash is empty
  const isEmpty =
    !isLoading &&
    (!trash?.folders || trash.folders.length === 0) &&
    (!trash?.files || trash.files.length === 0)

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  // Empty trash state
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          <Trash2 className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Trash is empty</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Items you delete will appear here. They will be permanently deleted
          after 30 days.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Action bar (shown when items are selected or for empty trash) */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {hasSelection ? (
            <span>{totalSelected} item(s) selected</span>
          ) : (
            <span>
              {(trash?.folders?.length || 0) + (trash?.files?.length || 0)}{' '}
              item(s) in trash
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Restore selected button */}
          {hasSelection && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestoreSelected}
              disabled={isOperating}
            >
              {isOperating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              Restore
            </Button>
          )}

          {/* Delete selected button */}
          {hasSelection && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isOperating}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Forever
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. {totalSelected} item(s) will
                    be permanently deleted from storage.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteSelected}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Forever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Empty trash button */}
          {!hasSelection && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isOperating}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Empty Trash
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Empty trash?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <span className="block">
                      All items in trash will be permanently deleted. This
                      action cannot be undone.
                    </span>
                    <span className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="w-4 h-4" />
                      This will free up storage space immediately.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleEmptyTrash}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Empty Trash
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Trash items list */}
      <div className="space-y-2">
        {/* Folders */}
        {trash?.folders?.map((folder) => {
          // Check if this specific folder is being operated on
          const isRestoring = operations.restoringFolders.has(folder.id)
          const isDeleting = operations.deletingFolders.has(folder.id)
          const isItemOperating = isRestoring || isDeleting

          return (
            <TrashItem
              key={folder.id}
              id={folder.id}
              type="folder"
              name={folder.name}
              deletedAt={new Date(folder.deletedAt!)}
              isSelected={selectedFolders.has(folder.id)}
              onToggleSelect={() => toggleFolderSelection(folder.id)}
              onRestore={() =>
                restoreFolderMutation.mutate({
                  organizationId,
                  folderId: folder.id,
                })
              }
              onDelete={() =>
                permanentlyDeleteFolderMutation.mutate({
                  organizationId,
                  folderId: folder.id,
                })
              }
              isOperating={isOperating || isItemOperating}
              isRestoring={isRestoring}
              isDeleting={isDeleting}
              color={folder.color}
            />
          )
        })}

        {/* Files */}
        {trash?.files?.map((file) => {
          // Check if this specific file is being operated on
          const isRestoring = operations.restoringFiles.has(file.id)
          const isDeleting = operations.deletingFiles.has(file.id)
          const isItemOperating = isRestoring || isDeleting

          return (
            <TrashItem
              key={file.id}
              id={file.id}
              type="file"
              name={file.displayName || file.name}
              deletedAt={new Date(file.deletedAt!)}
              isSelected={selectedFiles.has(file.id)}
              onToggleSelect={() => toggleFileSelection(file.id)}
              onRestore={() =>
                restoreFilesMutation.mutate({
                  organizationId,
                  fileIds: [file.id],
                })
              }
              onDelete={() =>
                permanentlyDeleteFilesMutation.mutate({
                  organizationId,
                  fileIds: [file.id],
                })
              }
              isOperating={isOperating || isItemOperating}
              isRestoring={isRestoring}
              isDeleting={isDeleting}
              extension={file.extension}
              category={file.fileCategory}
            />
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// TRASH ITEM COMPONENT
// ============================================================================

interface TrashItemProps {
  id: string
  type: 'folder' | 'file'
  name: string
  deletedAt: Date
  isSelected: boolean
  onToggleSelect: () => void
  onRestore: () => void
  onDelete: () => void
  isOperating: boolean
  /** Whether this specific item is being restored */
  isRestoring?: boolean
  /** Whether this specific item is being deleted */
  isDeleting?: boolean
  // Folder-specific
  color?: string | null
  // File-specific
  extension?: string
  category?: string
}

/**
 * Individual trash item row component
 * Shows item info, days remaining, and restore/delete actions
 * Displays loading state when item is being operated on
 */
function TrashItem({
  id,
  type,
  name,
  deletedAt,
  isSelected,
  onToggleSelect,
  onRestore,
  onDelete,
  isOperating,
  isRestoring = false,
  isDeleting = false,
  color,
  extension,
  category,
}: TrashItemProps) {
  const daysRemaining = getDaysRemaining(deletedAt)
  const isUrgent = daysRemaining <= 3

  // Whether this specific item is being operated on (for visual feedback)
  const isItemBusy = isRestoring || isDeleting

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3 rounded-lg border transition-all duration-200',
        'hover:bg-muted/50',
        isSelected && 'bg-muted border-primary/50',
        // Show loading state with reduced opacity when this item is being operated on
        isItemBusy && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Checkbox */}
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggleSelect}
        aria-label={`Select ${name}`}
      />

      {/* Icon */}
      <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
        {type === 'folder' ? (
          <svg
            viewBox="0 0 120 90"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full opacity-60"
          >
            <path
              d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
              fill={color || '#3f3f46'}
            />
          </svg>
        ) : (
          <div className="w-8 h-8 flex items-center justify-center opacity-60">
            <FileIcon extension={extension} category={category as any} size="sm" />
          </div>
        )}
      </div>

      {/* Name and info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {type === 'folder' ? 'Folder' : extension?.toUpperCase() || 'File'}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span
            className={cn(
              'text-xs flex items-center gap-1',
              isUrgent ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            <Clock className="w-3 h-3" />
            {formatTimeRemaining(deletedAt)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onRestore()
          }}
          disabled={isOperating || isItemBusy}
          title="Restore"
        >
          {isRestoring ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isOperating || isItemBusy}
              title="Delete forever"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                &quot;{name}&quot; will be permanently deleted. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
