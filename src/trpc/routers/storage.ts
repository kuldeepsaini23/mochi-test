/**
 * STORAGE ROUTER
 *
 * tRPC router for file storage operations.
 * Handles folders, files, upload URL generation, and trash management.
 *
 * PERMISSIONS:
 * - STORAGE_READ: List and view files/folders, view trash
 * - STORAGE_CREATE: Upload files, create folders
 * - STORAGE_DELETE: Delete files/folders, restore from trash
 *
 * PRIVACY MODEL:
 * - PRIVATE files are only accessible to organization members
 * - PUBLIC files get CDN URLs for direct access (digital products)
 *
 * TRASH SYSTEM:
 * - Deleted items go to trash (soft delete)
 * - Items in trash are automatically hard-deleted after 30 days
 * - Users can restore items from trash (cancels scheduled deletion)
 * - Users can permanently delete immediately from trash
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { runs } from '@trigger.dev/sdk/v3'
import {
  createTRPCRouter,
  organizationProcedure,
} from '../init'
import { permissions } from '@/lib/better-auth/permissions'
import * as storageService from '@/services/storage.service'
import { FileCategory, FileVisibility } from '@/generated/prisma'
import {
  generateUploadUrl,
  generateDownloadUrl,
  getFileExtension,
  getFileCategoryFromMimeType,
  getMaxFileSize,
  isR2Configured,
  deleteFile as deleteR2File,
  deleteFiles as deleteR2Files,
  moveFile as moveR2File,
  generateStorageKey,
  setFileInlineDisposition,
} from '@/lib/r2'
import {
  scheduledFolderDeletionTask,
  scheduledFileDeletionTask,
  videoProcessingTask,
} from '@/lib/trigger'
import {
  withFeatureGate,
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for listing folders
 */
const listFoldersSchema = z.object({
  organizationId: z.string(),
  parentId: z.string().nullable().optional(), // null = root
  search: z.string().optional(),
})

/**
 * Schema for getting folder by ID
 */
const getFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for creating a folder
 */
const createFolderSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Folder name is required').max(100),
  parentId: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
})

/**
 * Schema for updating a folder
 */
const updateFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
})

/**
 * Schema for deleting a folder
 */
const deleteFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for listing files
 */
const listFilesSchema = z.object({
  organizationId: z.string(),
  folderId: z.string().nullable().optional(), // null = root
  visibility: z.nativeEnum(FileVisibility).optional(),
  category: z.nativeEnum(FileCategory).optional(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(50),
})

/**
 * Schema for getting file by ID
 */
const getFileSchema = z.object({
  organizationId: z.string(),
  fileId: z.string(),
})

/**
 * Schema for creating a file record (after upload)
 */
const createFileSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  displayName: z.string().nullable().optional(),
  mimeType: z.string(),
  size: z.number().int().positive(),
  extension: z.string(),
  fileCategory: z.nativeEnum(FileCategory),
  storageKey: z.string(),
  publicUrl: z.string().nullable().optional(),
  thumbnailKey: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  visibility: z.nativeEnum(FileVisibility),
  folderId: z.string().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  duration: z.number().nullable().optional(),
})

/**
 * Schema for updating a file
 */
const updateFileSchema = z.object({
  organizationId: z.string(),
  fileId: z.string(),
  displayName: z.string().nullable().optional(),
  visibility: z.nativeEnum(FileVisibility).optional(),
  folderId: z.string().nullable().optional(),
})

/**
 * Schema for deleting files
 */
const deleteFilesSchema = z.object({
  organizationId: z.string(),
  fileIds: z.array(z.string()).min(1),
})

/**
 * Schema for moving files
 */
const moveFilesSchema = z.object({
  organizationId: z.string(),
  fileIds: z.array(z.string()).min(1),
  targetFolderId: z.string().nullable(),
})

/**
 * Schema for changing file visibility
 */
const changeVisibilitySchema = z.object({
  organizationId: z.string(),
  fileId: z.string(),
  visibility: z.nativeEnum(FileVisibility),
  publicUrl: z.string().nullable().optional(),
})

/**
 * Schema for getting folder breadcrumb
 */
const getBreadcrumbSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for getting storage stats
 */
const getStatsSchema = z.object({
  organizationId: z.string(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const storageRouter = createTRPCRouter({
  // ==========================================================================
  // FOLDER OPERATIONS
  // ==========================================================================

  /**
   * List folders in a directory
   */
  listFolders: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(listFoldersSchema)
    .query(async ({ input }) => {
      return await storageService.listFolders(input)
    }),

  /**
   * Get folder by ID with details
   */
  getFolder: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(getFolderSchema)
    .query(async ({ input }) => {
      const folder = await storageService.getFolderById(
        input.organizationId,
        input.folderId
      )

      if (!folder) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Folder not found',
        })
      }

      return folder
    }),

  /**
   * Get folder breadcrumb navigation
   */
  getFolderBreadcrumb: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(getBreadcrumbSchema)
    .query(async ({ input }) => {
      return await storageService.getFolderBreadcrumb(
        input.organizationId,
        input.folderId
      )
    }),

  /**
   * Validate folder access status
   *
   * Checks if a folder exists and is accessible:
   * - OK: Folder exists and is accessible
   * - IN_TRASH: Folder exists but is soft-deleted (show "in trash" message)
   * - NOT_FOUND: Folder doesn't exist (redirect to root)
   *
   * USAGE: Call this before rendering folder contents
   */
  validateFolder: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(getFolderSchema)
    .query(async ({ input }) => {
      return await storageService.getFolderStatus(
        input.organizationId,
        input.folderId
      )
    }),

  /**
   * Create a new folder
   */
  createFolder: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
    .input(createFolderSchema)
    .mutation(async ({ input }) => {
      return await storageService.createFolder(input)
    }),

  /**
   * Update a folder
   */
  updateFolder: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
    .input(updateFolderSchema)
    .mutation(async ({ input }) => {
      const { organizationId, folderId, ...data } = input
      return await storageService.updateFolder(organizationId, folderId, data)
    }),

  /**
   * Move folder to trash (soft delete with scheduled hard deletion)
   *
   * WHAT THIS DOES:
   * 1. Recursively finds ALL nested folders and files
   * 2. Soft-deletes everything in database (moves to trash)
   * 3. Schedules Trigger.dev task to hard delete after 30 days
   *
   * TRASH FLOW:
   * - Items stay in trash for 30 days
   * - User can restore from trash (cancels scheduled deletion)
   * - After 30 days, task permanently deletes from DB + R2
   */
  deleteFolder: organizationProcedure({ requirePermission: permissions.STORAGE_DELETE })
    .input(deleteFolderSchema)
    .mutation(async ({ input }) => {
      // Soft delete from database (returns data for scheduled deletion)
      const result = await storageService.deleteFolder(
        input.organizationId,
        input.folderId
      )

      // Schedule hard deletion task (30 days from now)
      // Task will sleep for 30 days, then hard delete if still in trash
      try {
        const handle = await scheduledFolderDeletionTask.trigger({
          organizationId: input.organizationId,
          folderId: input.folderId,
          allFolderIds: result.allFolderIds,
          storageKeys: result.storageKeys,
        })

        // Save run ID so we can cancel if user restores
        await storageService.updateFolderScheduledDeletion(
          input.organizationId,
          input.folderId,
          handle.id
        )
      } catch {
        // Log but don't fail - item is in trash, can be manually deleted later
      }

      return {
        success: result.success,
        deletedFolderCount: result.deletedFolderCount,
        deletedFileCount: result.deletedFileCount,
        movedToTrash: true,
      }
    }),

  // ==========================================================================
  // FILE OPERATIONS
  // ==========================================================================

  /**
   * List files with filtering and pagination
   */
  listFiles: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(listFilesSchema)
    .query(async ({ input }) => {
      return await storageService.listFiles(input)
    }),

  /**
   * Get file by ID
   */
  getFile: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(getFileSchema)
    .query(async ({ input }) => {
      const file = await storageService.getFileById(
        input.organizationId,
        input.fileId
      )

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        })
      }

      return file
    }),

  /**
   * Create a file record (after upload is complete)
   *
   * Also updates R2 object metadata to set Content-Disposition: inline
   * which enables videos/images to play/display in browser instead of downloading.
   *
   * For VIDEO files, automatically triggers HLS processing task.
   */
  createFile: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
    .input(createFileSchema)
    .mutation(async ({ input, ctx }) => {
      // Create database record
      const file = await storageService.createFile({
        ...input,
        uploadedById: ctx.user.id,
      })

      /* Track storage usage — increment the storage_kb counter by file size in KB.
       * Uses Math.ceil for accuracy — a 322 KB file counts as 322 KB, not rounded to 1 MB.
       * MUST match the per-file rounding used in permanent-delete decrements. */
      const fileSizeKb = Math.max(1, Math.ceil(input.size / 1024))
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'storage_kb.limit', fileSizeKb)

      // Set Content-Disposition: inline on the R2 object
      // This enables videos to play in browser instead of downloading
      // We do this AFTER upload because presigned PUT URLs cannot include
      // ContentDisposition without requiring the client to send it as a header
      try {
        await setFileInlineDisposition(input.storageKey, input.mimeType)
      } catch {
        // Log but don't fail - file is uploaded, inline viewing is a nice-to-have
      }

      // Auto-trigger HLS video processing for VIDEO files
      // This converts the video to adaptive bitrate streaming format
      if (input.fileCategory === 'VIDEO') {
        try {
          // Mark as pending immediately
          await storageService.updateFile(input.organizationId, file.id, {
            videoProcessingStatus: 'PENDING',
          })

          // Trigger the video processing task
          const handle = await videoProcessingTask.trigger({
            fileId: file.id,
            organizationId: input.organizationId,
            storageKey: input.storageKey,
            isPublic: input.visibility === 'PUBLIC',
          })

          // Save the run ID for tracking/cancellation
          await storageService.updateFile(input.organizationId, file.id, {
            processingRunId: handle.id,
          })
        } catch (error) {
          // Log but don't fail - file is uploaded, processing can be triggered manually
          // Mark as failed so user knows to retry
          await storageService.updateFile(input.organizationId, file.id, {
            videoProcessingStatus: 'FAILED',
            processingError: error instanceof Error ? error.message : 'Failed to start processing',
          })
        }
      }

      return file
    }),

  /**
   * Update a file
   */
  updateFile: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
    .input(updateFileSchema)
    .mutation(async ({ input }) => {
      const { organizationId, fileId, ...data } = input
      return await storageService.updateFile(organizationId, fileId, data)
    }),

  /**
   * Delete files (batch)
   */
  deleteFiles: organizationProcedure({ requirePermission: permissions.STORAGE_DELETE })
    .input(deleteFilesSchema)
    .mutation(async ({ input }) => {
      return await storageService.deleteFiles(
        input.organizationId,
        input.fileIds
      )
    }),

  /**
   * Move files to a different folder
   */
  moveFiles: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
    .input(moveFilesSchema)
    .mutation(async ({ input }) => {
      return await storageService.moveFiles(
        input.organizationId,
        input.fileIds,
        input.targetFolderId
      )
    }),

  /**
   * Change file visibility (PUBLIC/PRIVATE)
   *
   * SECURITY CRITICAL:
   * When changing to PRIVATE, the file is moved to a new random location in R2.
   * This invalidates any previously shared URLs - they become 404s.
   *
   * When changing to PUBLIC, the CDN URL is generated from current storageKey.
   */
  changeVisibility: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
    .input(changeVisibilitySchema)
    .mutation(async ({ input }) => {
      // Pass R2 functions for secure visibility changes
      // When making private: file is moved to new location, old URLs become 404
      return await storageService.changeFileVisibility(
        input.organizationId,
        input.fileId,
        input.visibility,
        moveR2File,
        generateStorageKey
      )
    }),

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get storage statistics
   */
  getStats: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(getStatsSchema)
    .query(async ({ input }) => {
      return await storageService.getStorageStats(input.organizationId)
    }),

  // ==========================================================================
  // R2 UPLOAD OPERATIONS
  // ==========================================================================

  /**
   * Check if R2 storage is configured
   *
   * WHY: Allow UI to show appropriate message if storage not set up
   * NOTE: Requires organizationId to go through organizationProcedure security
   */
  isConfigured: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(() => {
      return { configured: isR2Configured() }
    }),

  /**
   * Generate a presigned URL for uploading a file
   *
   * WHY: Client uploads directly to R2 to avoid server bandwidth
   * HOW: Generate signed PUT URL with metadata
   *
   * FLOW:
   * 1. Client requests upload URL with file info
   * 2. Server generates signed URL and storage key
   * 3. Client uploads file directly to R2
   * 4. Client calls createFile to save metadata
   */
  getUploadUrl: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
    .input(
      z.object({
        organizationId: z.string(),
        filename: z.string(),
        contentType: z.string(),
        contentLength: z.number().int().positive(),
        visibility: z.nativeEnum(FileVisibility),
        folderId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      /* Feature gate checked at handler level: variable increment amount based on file size.
       * Procedure-level requireFeature hardcodes increment=1, but storage needs the actual
       * file size in KB as the increment value to check against the quota correctly.
       * Uses Math.ceil so even tiny files (< 1 KB) count as 1 KB — accurate tracking. */
      const fileSizeKb = Math.max(1, Math.ceil(input.contentLength / 1024))
      await withFeatureGate(ctx, input.organizationId, 'storage_kb.limit', fileSizeKb)

      // Check if R2 is configured
      if (!isR2Configured()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Storage is not configured. Please set R2 environment variables.',
        })
      }

      // Validate file size
      const maxSize = getMaxFileSize(input.contentType)
      if (input.contentLength > maxSize) {
        throw new TRPCError({
          code: 'PAYLOAD_TOO_LARGE',
          message: `File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`,
        })
      }

      const { organizationId, filename, contentType, contentLength, visibility, folderId } = input

      // Generate upload URL
      const result = await generateUploadUrl({
        organizationId,
        filename,
        contentType,
        contentLength,
        isPublic: visibility === 'PUBLIC',
        folderId,
      })

      // Pre-calculate file metadata for client to use when creating record
      const extension = getFileExtension(filename)
      const fileCategory = getFileCategoryFromMimeType(contentType)

      return {
        ...result,
        extension,
        fileCategory,
      }
    }),

  /**
   * Generate a presigned URL for downloading a private file
   *
   * WHY: Private files need signed URLs for secure access
   * HOW: Generate signed GET URL with expiry
   */
  getDownloadUrl: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(
      z.object({
        organizationId: z.string(),
        fileId: z.string(),
      })
    )
    .query(async ({ input }) => {
      // Get file from database
      const file = await storageService.getFileById(input.organizationId, input.fileId)

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        })
      }

      // Public files don't need signed URLs
      if (file.visibility === 'PUBLIC' && file.publicUrl) {
        return { downloadUrl: file.publicUrl, expiresAt: null }
      }

      // Generate signed URL for private files
      const downloadUrl = await generateDownloadUrl({
        storageKey: file.storageKey,
        expiresIn: 3600, // 1 hour
      })

      return {
        downloadUrl,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      }
    }),

  /**
   * Move files to trash (soft delete with scheduled hard deletion)
   *
   * TRASH FLOW:
   * - Files stay in trash for 30 days
   * - User can restore from trash (cancels scheduled deletion)
   * - After 30 days, task permanently deletes from DB + R2
   */
  deleteFilesWithStorage: organizationProcedure({ requirePermission: permissions.STORAGE_DELETE })
    .input(
      z.object({
        organizationId: z.string(),
        fileIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ input }) => {
      const { organizationId, fileIds } = input

      // Get files to collect storage keys
      const storageKeys: string[] = []
      for (const fileId of fileIds) {
        const file = await storageService.getFileById(organizationId, fileId)
        if (file) {
          storageKeys.push(file.storageKey)
          if (file.thumbnailKey) {
            storageKeys.push(file.thumbnailKey)
          }
        }
      }

      // Soft delete from database (move to trash)
      await storageService.deleteFiles(organizationId, fileIds)

      // Schedule hard deletion task (30 days from now)
      try {
        const handle = await scheduledFileDeletionTask.trigger({
          organizationId,
          fileIds,
          storageKeys,
        })

        // Save run ID so we can cancel if user restores
        await storageService.updateFilesScheduledDeletion(
          organizationId,
          fileIds,
          handle.id
        )
      } catch {
        // Log but don't fail - files are in trash, can be manually deleted later
      }

      return { success: true, deletedCount: fileIds.length, movedToTrash: true }
    }),

  // ==========================================================================
  // TRASH OPERATIONS
  // ==========================================================================

  /**
   * List items in trash
   *
   * Returns both folders and files that have been soft-deleted.
   * Includes deletedAt date so UI can show countdown to permanent deletion.
   */
  listTrash: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return await storageService.listTrash(input.organizationId)
    }),

  /**
   * Restore a folder from trash
   *
   * Restores the folder and all its nested contents.
   * Cancels the scheduled deletion task.
   */
  restoreFolder: organizationProcedure({ requirePermission: permissions.STORAGE_DELETE })
    .input(z.object({
      organizationId: z.string(),
      folderId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const result = await storageService.restoreFolder(
        input.organizationId,
        input.folderId
      )

      // Cancel the scheduled deletion task
      if (result.scheduledDeletionRunId) {
        try {
          await runs.cancel(result.scheduledDeletionRunId)
        } catch {
          // Log but don't fail - folder is restored, task will check deletedAt anyway
        }
      }

      return {
        success: result.success,
        restoredFolders: result.restoredFolders,
      }
    }),

  /**
   * Restore files from trash
   */
  restoreFiles: organizationProcedure({ requirePermission: permissions.STORAGE_DELETE })
    .input(z.object({
      organizationId: z.string(),
      fileIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ input }) => {
      const result = await storageService.restoreFiles(
        input.organizationId,
        input.fileIds
      )

      // Cancel scheduled deletion tasks
      for (const runId of result.runIdsToCancel) {
        try {
          await runs.cancel(runId)
        } catch {
          // Log but don't fail - files are restored, task will check deletedAt anyway
        }
      }

      return {
        success: result.success,
        restoredFiles: result.restoredFiles,
      }
    }),

  /**
   * Permanently delete a folder (skip 30-day wait)
   *
   * Used when user wants to free up space immediately.
   */
  permanentlyDeleteFolder: organizationProcedure({ requirePermission: permissions.STORAGE_DELETE })
    .input(z.object({
      organizationId: z.string(),
      folderId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await storageService.permanentlyDeleteFolder(
        input.organizationId,
        input.folderId
      )

      // Cancel scheduled task if exists
      if (result.scheduledDeletionRunId) {
        try {
          await runs.cancel(result.scheduledDeletionRunId)
        } catch {
          // Log but don't fail - item is being permanently deleted anyway
        }
      }

      // Delete from R2
      if (isR2Configured() && result.storageKeys.length > 0) {
        try {
          await deleteR2Files(result.storageKeys)
        } catch {
          // Log but don't fail - database is already cleaned up
        }
      }

      /* Free up storage quota — decrement by per-file KB sum (matches upload increment).
       * Service already computes totalSizeKb with same Math.max(1, ...) rounding. */
      if (result.totalSizeKb > 0) {
        await decrementUsageAndInvalidate(ctx, input.organizationId, 'storage_kb.limit', result.totalSizeKb)
      }

      return {
        success: result.success,
        deletedFolders: result.deletedFolders,
        deletedFiles: result.deletedFiles,
      }
    }),

  /**
   * Permanently delete files (skip 30-day wait)
   */
  permanentlyDeleteFiles: organizationProcedure({ requirePermission: permissions.STORAGE_DELETE })
    .input(z.object({
      organizationId: z.string(),
      fileIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await storageService.permanentlyDeleteFiles(
        input.organizationId,
        input.fileIds
      )

      // Cancel scheduled tasks
      for (const runId of result.runIdsToCancel) {
        try {
          await runs.cancel(runId)
        } catch {
          // Log but don't fail - files are being permanently deleted anyway
        }
      }

      // Delete from R2
      if (isR2Configured() && result.storageKeys.length > 0) {
        try {
          await deleteR2Files(result.storageKeys)
        } catch {
          // Log but don't fail - database is already cleaned up
        }
      }

      /* Free up storage quota — decrement by per-file KB sum (matches upload increment).
       * Service already computes totalSizeKb with same Math.max(1, ...) rounding. */
      if (result.totalSizeKb > 0) {
        await decrementUsageAndInvalidate(ctx, input.organizationId, 'storage_kb.limit', result.totalSizeKb)
      }

      return {
        success: result.success,
        deletedFiles: result.deletedFiles,
      }
    }),

  /**
   * Empty entire trash (permanently delete everything)
   */
  emptyTrash: organizationProcedure({ requirePermission: permissions.STORAGE_DELETE })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await storageService.emptyTrash(input.organizationId)

      // Cancel all scheduled tasks
      for (const runId of result.runIdsToCancel) {
        try {
          await runs.cancel(runId)
        } catch {
          // Log but don't fail - trash is being emptied anyway
        }
      }

      // Delete from R2
      if (isR2Configured() && result.storageKeys.length > 0) {
        try {
          await deleteR2Files(result.storageKeys)
        } catch {
          // Log but don't fail - database is already cleaned up
        }
      }

      /* Free up storage quota — decrement by per-file KB sum (matches upload increment).
       * Service already computes totalSizeKb with same Math.max(1, ...) rounding. */
      if (result.totalSizeKb > 0) {
        await decrementUsageAndInvalidate(ctx, input.organizationId, 'storage_kb.limit', result.totalSizeKb)
      }

      return {
        success: result.success,
        deletedFolders: result.deletedFolders,
        deletedFiles: result.deletedFiles,
      }
    }),

  // ==========================================================================
  // VIDEO PROCESSING OPERATIONS
  // ==========================================================================

  /**
   * Get video playback URL
   *
   * Returns the appropriate URL for playing an HLS video:
   * - PUBLIC videos: CDN URL to HLS manifest (direct access)
   * - PRIVATE videos: Presigned URL to HLS manifest (authenticated access)
   *
   * IMPORTANT:
   * - Only returns URL if video processing is COMPLETED
   * - For private videos, URL expires after 4 hours (covers long course sessions)
   * - Private HLS segments are fetched via API route, not direct R2 access
   */
  getVideoPlaybackUrl: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(z.object({
      organizationId: z.string(),
      fileId: z.string(),
    }))
    .query(async ({ input }) => {
      const file = await storageService.getFileById(input.organizationId, input.fileId)

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        })
      }

      // Not a video file
      if (file.fileCategory !== 'VIDEO') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'File is not a video',
        })
      }

      // Video processing not complete
      if (file.videoProcessingStatus !== 'COMPLETED' || !file.hlsManifestKey) {
        return {
          playbackUrl: null,
          posterUrl: file.posterUrl,
          status: file.videoProcessingStatus,
          progress: file.processingProgress,
          error: file.processingError,
          qualities: file.hlsQualities,
        }
      }

      // PUBLIC videos use CDN URL directly
      if (file.visibility === 'PUBLIC' && file.hlsManifestUrl) {
        return {
          playbackUrl: file.hlsManifestUrl,
          posterUrl: file.posterUrl,
          status: file.videoProcessingStatus,
          progress: 100,
          error: null,
          qualities: file.hlsQualities,
        }
      }

      // PRIVATE videos use API route that handles authentication per-segment
      // The API route redirects to presigned URLs for each segment request
      // This allows HLS.js to fetch segments with relative paths
      const playbackUrl = `/api/storage/hls/${file.id}/master.m3u8`

      // Poster also needs to go through API route for private videos
      const posterUrl = file.posterKey
        ? `/api/storage/hls/${file.id}/poster.jpg`
        : null

      return {
        playbackUrl,
        posterUrl,
        status: file.videoProcessingStatus,
        progress: 100,
        error: null,
        qualities: file.hlsQualities,
      }
    }),

  /**
   * Get video processing status
   *
   * Returns current status and progress of video processing.
   * Use for polling progress during transcoding.
   */
  getVideoProcessingStatus: organizationProcedure({ requirePermission: permissions.STORAGE_READ })
    .input(z.object({
      organizationId: z.string(),
      fileId: z.string(),
    }))
    .query(async ({ input }) => {
      const file = await storageService.getFileById(input.organizationId, input.fileId)

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        })
      }

      return {
        status: file.videoProcessingStatus,
        progress: file.processingProgress,
        error: file.processingError,
        runId: file.processingRunId,
        hlsManifestUrl: file.hlsManifestUrl,
        posterUrl: file.posterUrl,
        qualities: file.hlsQualities,
        videoCodec: file.videoCodec,
        audioCodec: file.audioCodec,
        videoBitrate: file.videoBitrate,
        duration: file.duration,
        width: file.width,
        height: file.height,
      }
    }),

  /**
   * Trigger video processing manually
   *
   * Use to retry failed processing or process videos that were
   * uploaded before HLS processing was enabled.
   */
  triggerVideoProcessing: organizationProcedure({ requirePermission: permissions.STORAGE_CREATE })
    .input(z.object({
      organizationId: z.string(),
      fileId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const file = await storageService.getFileById(input.organizationId, input.fileId)

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        })
      }

      if (file.fileCategory !== 'VIDEO') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'File is not a video',
        })
      }

      // Don't allow re-processing if already in progress
      if (file.videoProcessingStatus === 'PROCESSING') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Video is already being processed',
        })
      }

      // Mark as pending
      await storageService.updateFile(input.organizationId, file.id, {
        videoProcessingStatus: 'PENDING',
        processingProgress: 0,
        processingError: null,
      })

      // Trigger the processing task
      const handle = await videoProcessingTask.trigger({
        fileId: file.id,
        organizationId: input.organizationId,
        storageKey: file.storageKey,
        isPublic: file.visibility === 'PUBLIC',
      })

      // Save the run ID
      await storageService.updateFile(input.organizationId, file.id, {
        processingRunId: handle.id,
      })

      return {
        success: true,
        runId: handle.id,
      }
    }),

})
