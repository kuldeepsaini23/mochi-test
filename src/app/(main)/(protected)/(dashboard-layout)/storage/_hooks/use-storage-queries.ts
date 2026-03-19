/**
 * STORAGE QUERY HOOKS & CACHE UTILITIES
 *
 * Centralized hook for managing storage-related React Query cache.
 * This is the SINGLE SOURCE OF TRUTH for all storage cache invalidation.
 *
 * WHY THIS EXISTS:
 * - Prevents stale data by ensuring consistent invalidation patterns
 * - Centralizes query key management to avoid mismatches
 * - Provides optimistic update helpers for instant UI feedback
 *
 * INVALIDATION STRATEGY:
 * - Use broad invalidation (no specific params) to invalidate ALL cached variants
 * - React Query will only refetch queries that are currently active
 * - This prevents stale data when navigating between folders
 *
 * USAGE:
 * ```tsx
 * const { invalidateAll, invalidateFolders, invalidateFiles } = useStorageInvalidation(orgId)
 *
 * // After any mutation that changes files:
 * invalidateFiles()
 *
 * // After folder operations:
 * invalidateFolders()
 *
 * // After operations that affect multiple areas (delete, restore):
 * invalidateAll()
 * ```
 */

import { trpc } from '@/trpc/react-provider'
import { useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface StorageInvalidationOptions {
  /**
   * Organization ID - required for stats invalidation
   */
  organizationId: string
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook providing centralized cache invalidation for storage queries.
 *
 * IMPORTANT: Always use these methods instead of manually calling
 * utils.storage.*.invalidate() to ensure consistency.
 */
export function useStorageInvalidation({ organizationId }: StorageInvalidationOptions) {
  const utils = trpc.useUtils()

  /**
   * Invalidate ALL folder listings across all parent folders.
   * Use after: create folder, delete folder, restore folder, move folder
   */
  const invalidateFolders = useCallback(() => {
    // No params = invalidate ALL cached folder queries (all parent folders)
    utils.storage.listFolders.invalidate()
    // Also invalidate breadcrumbs since folder hierarchy may have changed
    utils.storage.getFolderBreadcrumb.invalidate()
    // Invalidate folder validation cache
    utils.storage.validateFolder.invalidate()
  }, [utils])

  /**
   * Invalidate ALL file listings across all folders.
   * Use after: upload file, delete file, restore file, move file, change visibility
   */
  const invalidateFiles = useCallback(() => {
    // No params = invalidate ALL cached file queries (all folders)
    utils.storage.listFiles.invalidate()
  }, [utils])

  /**
   * Invalidate trash listing.
   * Use after: delete (move to trash), restore, permanent delete, empty trash
   */
  const invalidateTrash = useCallback(() => {
    utils.storage.listTrash.invalidate({ organizationId })
  }, [utils, organizationId])

  /**
   * Invalidate storage statistics + feature gate usage data.
   * Use after: any operation that changes file counts or storage usage.
   * Also refreshes the usage.getFeatureGates query so the storage usage bar updates.
   */
  const invalidateStats = useCallback(() => {
    utils.storage.getStats.invalidate({ organizationId })
    // Refresh feature gate data so the storage_kb.limit usage bar stays in sync
    utils.usage.getFeatureGates.invalidate({ organizationId })
  }, [utils, organizationId])

  /**
   * Invalidate EVERYTHING storage-related.
   * Use after: operations that affect multiple areas (delete folder with files, restore, empty trash)
   *
   * This is the SAFEST option when unsure what to invalidate.
   * React Query only refetches active queries, so this is performant.
   */
  const invalidateAll = useCallback(() => {
    invalidateFolders()
    invalidateFiles()
    invalidateTrash()
    invalidateStats()
  }, [invalidateFolders, invalidateFiles, invalidateTrash, invalidateStats])

  /**
   * Invalidate after a folder is deleted (moved to trash).
   * This affects: folder listings, trash, and stats
   */
  const invalidateAfterFolderDelete = useCallback(() => {
    invalidateFolders()
    invalidateFiles() // Folder may contain files that are now in trash
    invalidateTrash()
    invalidateStats()
  }, [invalidateFolders, invalidateFiles, invalidateTrash, invalidateStats])

  /**
   * Invalidate after files are deleted (moved to trash).
   * This affects: file listings, folder file counts, trash, and stats
   */
  const invalidateAfterFileDelete = useCallback(() => {
    invalidateFiles()
    invalidateFolders() // Folder's _count.files needs refresh
    invalidateTrash()
    invalidateStats()
  }, [invalidateFiles, invalidateFolders, invalidateTrash, invalidateStats])

  /**
   * Invalidate after restoring from trash.
   * This affects: trash, files/folders listings, and stats
   */
  const invalidateAfterRestore = useCallback(() => {
    invalidateFolders()
    invalidateFiles()
    invalidateTrash()
    invalidateStats()
  }, [invalidateFolders, invalidateFiles, invalidateTrash, invalidateStats])

  /**
   * Invalidate after uploading files.
   * This affects: file listings, folder file counts, and stats
   */
  const invalidateAfterUpload = useCallback(() => {
    invalidateFiles()
    invalidateFolders() // Folder's _count.files needs refresh
    invalidateStats()
  }, [invalidateFiles, invalidateFolders, invalidateStats])

  /**
   * Invalidate after creating a folder.
   * This affects: folder listings and stats
   */
  const invalidateAfterFolderCreate = useCallback(() => {
    invalidateFolders()
    invalidateStats()
  }, [invalidateFolders, invalidateStats])

  return {
    // Low-level invalidation methods
    invalidateFolders,
    invalidateFiles,
    invalidateTrash,
    invalidateStats,
    invalidateAll,
    // High-level operation-specific methods (preferred)
    invalidateAfterFolderDelete,
    invalidateAfterFileDelete,
    invalidateAfterRestore,
    invalidateAfterUpload,
    invalidateAfterFolderCreate,
  }
}

// ============================================================================
// OPTIMISTIC UPDATE HELPERS
// ============================================================================

/**
 * Helper to create an optimistic update context for folder operations.
 *
 * PATTERN:
 * 1. Cancel outgoing queries
 * 2. Snapshot current data
 * 3. Optimistically update
 * 4. Return context for rollback
 *
 * @example
 * onMutate: async ({ folderId }) => {
 *   const context = await prepareOptimisticFolderRemoval(utils, folderId)
 *   return context
 * }
 */
export async function prepareOptimisticFolderRemoval(
  utils: ReturnType<typeof trpc.useUtils>,
  organizationId: string,
  parentId: string | null,
  folderId: string
) {
  // Cancel any outgoing queries to prevent overwrite
  await utils.storage.listFolders.cancel()

  // Snapshot ALL folder caches (we'll update all that match)
  // Note: getData without params returns undefined, so we work with specific cache
  const queryKey = { organizationId, parentId }
  const previousFolders = utils.storage.listFolders.getData(queryKey)

  // Optimistically remove from the specific cache
  utils.storage.listFolders.setData(queryKey, (old) => {
    if (!old) return old
    return old.filter((f) => f.id !== folderId)
  })

  return { previousFolders, queryKey }
}

/**
 * Rollback helper for folder operations
 */
export function rollbackFolderRemoval(
  utils: ReturnType<typeof trpc.useUtils>,
  context: { previousFolders: any; queryKey: any } | undefined
) {
  if (context?.previousFolders && context.queryKey) {
    utils.storage.listFolders.setData(context.queryKey, context.previousFolders)
  }
}
