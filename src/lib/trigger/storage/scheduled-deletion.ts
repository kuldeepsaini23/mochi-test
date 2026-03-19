/**
 * SCHEDULED DELETION TASK
 *
 * Trigger.dev task that permanently deletes files and folders after 30 days in trash.
 *
 * SECURITY MODEL:
 * - Task is triggered ONLY from our storage router when user moves items to trash
 * - Task payload contains organization ID and item IDs - verified before deletion
 * - Task runs server-side with direct Prisma access - no external HTTP endpoints
 * - Items are verified to still be soft-deleted before hard deletion
 * - If user restores items, they won't be deleted (deletedAt will be null)
 *
 * FLOW:
 * 1. User deletes folder/files → soft delete in DB → trigger this task
 * 2. Task sleeps for 30 days using wait.for() (no charges during sleep)
 * 3. After 30 days, task wakes and verifies items are still soft-deleted
 * 4. If still deleted: hard delete from DB and R2
 * 5. If restored: do nothing (user changed their mind)
 *
 * CANCELLATION:
 * - When user restores items, we cancel the scheduled run using runs.cancel()
 * - The scheduledDeletionRunId field stores the run ID for cancellation
 */

import { schemaTask, wait } from '@trigger.dev/sdk'
import { z } from 'zod'
import { deleteFiles as deleteR2Files, isR2Configured } from '@/lib/r2'
import {
  findFolderForDeletionCheck,
  hardDeleteFolderBatch,
  findFilesStillInTrash,
  findFilesInFolders,
  hardDeleteFilesBatch,
} from '@/services/storage.service'
import { decrementUsage } from '@/services/feature-gate.service'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Deletion delay in days
 * Items remain in trash for this duration before permanent deletion
 */
const DELETION_DELAY_DAYS = 30

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Input schema for folder deletion task
 */
const scheduledFolderDeletionSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
  // All nested folder IDs that were soft-deleted together
  allFolderIds: z.array(z.string()),
  // All storage keys to delete from R2
  storageKeys: z.array(z.string()),
})

/**
 * Input schema for file deletion task
 */
const scheduledFileDeletionSchema = z.object({
  organizationId: z.string(),
  fileIds: z.array(z.string()),
  storageKeys: z.array(z.string()),
})

// ============================================================================
// FOLDER DELETION TASK
// ============================================================================

/**
 * Scheduled Folder Deletion Task
 *
 * Permanently deletes a folder and all its contents after 30 days.
 * Verifies folder is still in trash before deleting.
 *
 * WHY wait.for():
 * - Trigger.dev doesn't charge for sleeping tasks
 * - Task state is persisted, so it survives server restarts
 * - We can cancel the run if user restores the folder
 */
export const scheduledFolderDeletionTask = schemaTask({
  id: 'storage-scheduled-folder-deletion',
  description: 'Permanently delete a folder and its contents after 30 days in trash',
  schema: scheduledFolderDeletionSchema,
  run: async (input) => {
    const { organizationId, folderId, allFolderIds, storageKeys } = input

    // Sleep for 30 days - no charges during this time
    await wait.for({ days: DELETION_DELAY_DAYS })

    // Verify the root folder is still soft-deleted (user didn't restore it)
    // Delegates to storage.service.ts for database access
    const rootFolder = await findFolderForDeletionCheck(folderId, organizationId)

    // If folder doesn't exist or was restored (deletedAt is null), abort
    if (!rootFolder) {
      return { success: true, reason: 'folder_not_found', hardDeleted: false }
    }

    if (!rootFolder.deletedAt) {
      return { success: true, reason: 'folder_restored', hardDeleted: false }
    }

    /* Fetch files before deletion to compute per-file KB for usage decrement.
     * Uses same Math.ceil(bytes / 1024) as upload increment for symmetry. */
    const files = await findFilesInFolders(organizationId, allFolderIds)
    const totalSizeKb = files.reduce(
      (sum, f) => sum + Math.max(1, Math.ceil(f.size / 1024)),
      0
    )

    // Hard delete from database in a transaction (via storage service)
    // Delete files first (due to foreign key), then folders
    await hardDeleteFolderBatch(organizationId, allFolderIds)

    // Delete from R2 (best effort - don't fail if R2 errors)
    if (isR2Configured() && storageKeys.length > 0) {
      try {
        await deleteR2Files(storageKeys)
      } catch {
        // Log but don't throw - database is already cleaned up
      }
    }

    /* Decrement storage usage counter so quota reflects freed space */
    if (totalSizeKb > 0) {
      try {
        await decrementUsage(organizationId, 'storage_kb.limit', totalSizeKb)
      } catch {
        // Best effort - don't fail the deletion if counter update fails
      }
    }

    return {
      success: true,
      reason: 'hard_deleted',
      hardDeleted: true,
      deletedFolders: allFolderIds.length,
      deletedFiles: files.length,
    }
  },
})

// ============================================================================
// FILE DELETION TASK
// ============================================================================

/**
 * Scheduled File Deletion Task
 *
 * Permanently deletes individual files after 30 days.
 * Used when files are deleted independently (not via folder deletion).
 */
export const scheduledFileDeletionTask = schemaTask({
  id: 'storage-scheduled-file-deletion',
  description: 'Permanently delete files after 30 days in trash',
  schema: scheduledFileDeletionSchema,
  run: async (input) => {
    const { organizationId, fileIds, storageKeys } = input

    // Sleep for 30 days
    await wait.for({ days: DELETION_DELAY_DAYS })

    // Get files that are still soft-deleted (not restored)
    // Delegates to storage.service.ts for database access
    const filesToDelete = await findFilesStillInTrash(fileIds, organizationId)

    if (filesToDelete.length === 0) {
      return { success: true, reason: 'all_restored', hardDeleted: false }
    }

    // Collect actual storage keys to delete (some might have been restored)
    const keysToDelete: string[] = []
    for (const file of filesToDelete) {
      keysToDelete.push(file.storageKey)
      if (file.thumbnailKey) {
        keysToDelete.push(file.thumbnailKey)
      }
    }

    const fileIdsToDelete = filesToDelete.map((f) => f.id)

    /* Compute per-file KB freed before deletion — same Math.ceil(bytes / 1024) as upload increment */
    const totalSizeKb = filesToDelete.reduce(
      (sum, f) => sum + Math.max(1, Math.ceil(f.size / 1024)),
      0
    )

    // Hard delete from database (via storage service)
    await hardDeleteFilesBatch(fileIdsToDelete, organizationId)

    // Delete from R2
    if (isR2Configured() && keysToDelete.length > 0) {
      try {
        await deleteR2Files(keysToDelete)
      } catch {
        // Log but don't throw - database is already cleaned up
      }
    }

    /* Decrement storage usage counter so quota reflects freed space */
    if (totalSizeKb > 0) {
      try {
        await decrementUsage(organizationId, 'storage_kb.limit', totalSizeKb)
      } catch {
        // Best effort - don't fail the deletion if counter update fails
      }
    }

    return {
      success: true,
      reason: 'hard_deleted',
      hardDeleted: true,
      deletedFiles: fileIdsToDelete.length,
      restoredFiles: fileIds.length - fileIdsToDelete.length,
    }
  },
})
