/**
 * STORAGE BROWSER HOOK
 *
 * Custom hook for managing storage browser state and cache invalidation.
 * Provides centralized cache management for the reusable StorageBrowser component.
 *
 * This is similar to use-storage-queries.ts but designed to work
 * independently of URL parameters for modal/embedded usage.
 */

import { trpc } from '@/trpc/react-provider'
import { useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface UseStorageBrowserOptions {
  organizationId: string
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook providing centralized cache invalidation for storage browser.
 * Similar to useStorageInvalidation but isolated for reusable component.
 */
export function useStorageBrowserInvalidation({ organizationId }: UseStorageBrowserOptions) {
  const utils = trpc.useUtils()

  /**
   * Invalidate ALL folder listings across all parent folders.
   */
  const invalidateFolders = useCallback(() => {
    utils.storage.listFolders.invalidate()
    utils.storage.getFolderBreadcrumb.invalidate()
    utils.storage.validateFolder.invalidate()
  }, [utils])

  /**
   * Invalidate ALL file listings across all folders.
   */
  const invalidateFiles = useCallback(() => {
    utils.storage.listFiles.invalidate()
  }, [utils])

  /**
   * Invalidate trash listing.
   */
  const invalidateTrash = useCallback(() => {
    utils.storage.listTrash.invalidate({ organizationId })
  }, [utils, organizationId])

  /**
   * Invalidate storage statistics + feature gate usage data.
   * Also refreshes the usage.getFeatureGates query so the storage usage bar stays in sync.
   */
  const invalidateStats = useCallback(() => {
    utils.storage.getStats.invalidate({ organizationId })
    utils.usage.getFeatureGates.invalidate({ organizationId })
  }, [utils, organizationId])

  /**
   * Invalidate everything storage-related.
   */
  const invalidateAll = useCallback(() => {
    invalidateFolders()
    invalidateFiles()
    invalidateTrash()
    invalidateStats()
  }, [invalidateFolders, invalidateFiles, invalidateTrash, invalidateStats])

  /**
   * Invalidate after folder deletion.
   */
  const invalidateAfterFolderDelete = useCallback(() => {
    invalidateFolders()
    invalidateFiles()
    invalidateTrash()
    invalidateStats()
  }, [invalidateFolders, invalidateFiles, invalidateTrash, invalidateStats])

  /**
   * Invalidate after file deletion.
   */
  const invalidateAfterFileDelete = useCallback(() => {
    invalidateFiles()
    invalidateFolders()
    invalidateTrash()
    invalidateStats()
  }, [invalidateFiles, invalidateFolders, invalidateTrash, invalidateStats])

  /**
   * Invalidate after restoring from trash.
   */
  const invalidateAfterRestore = useCallback(() => {
    invalidateFolders()
    invalidateFiles()
    invalidateTrash()
    invalidateStats()
  }, [invalidateFolders, invalidateFiles, invalidateTrash, invalidateStats])

  /**
   * Invalidate after uploading files.
   */
  const invalidateAfterUpload = useCallback(() => {
    invalidateFiles()
    invalidateFolders()
    invalidateStats()
  }, [invalidateFiles, invalidateFolders, invalidateStats])

  /**
   * Invalidate after creating a folder.
   */
  const invalidateAfterFolderCreate = useCallback(() => {
    invalidateFolders()
    invalidateStats()
  }, [invalidateFolders, invalidateStats])

  return {
    invalidateFolders,
    invalidateFiles,
    invalidateTrash,
    invalidateStats,
    invalidateAll,
    invalidateAfterFolderDelete,
    invalidateAfterFileDelete,
    invalidateAfterRestore,
    invalidateAfterUpload,
    invalidateAfterFolderCreate,
  }
}
