/**
 * STORAGE SERVICE (DAL)
 *
 * Data Access Layer for file storage operations.
 * Handles folders and files CRUD with privacy controls.
 *
 * ARCHITECTURE:
 * - Folders: Support nested hierarchy via parentId
 * - Files: Support PUBLIC/PRIVATE visibility
 * - All operations scoped to organizationId
 *
 * PRIVACY MODEL:
 * - PRIVATE: Internal org files, accessed via signed URLs
 * - PUBLIC: Digital products, direct CDN access
 */

import 'server-only'
import { prisma } from '@/lib/config'
import type { FileCategory, FileVisibility } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

export type CreateFolderInput = {
  organizationId: string
  name: string
  parentId?: string | null
  color?: string | null
  icon?: string | null
}

export type UpdateFolderInput = {
  name?: string
  parentId?: string | null
  color?: string | null
  icon?: string | null
}

export type CreateFileInput = {
  organizationId: string
  name: string
  displayName?: string | null
  mimeType: string
  size: number
  extension: string
  fileCategory: FileCategory
  storageKey: string
  publicUrl?: string | null
  thumbnailKey?: string | null
  thumbnailUrl?: string | null
  visibility: FileVisibility
  folderId?: string | null
  width?: number | null
  height?: number | null
  duration?: number | null
  uploadedById?: string | null
}

export type UpdateFileInput = {
  displayName?: string | null
  visibility?: FileVisibility
  folderId?: string | null
  publicUrl?: string | null
  thumbnailUrl?: string | null
  // HLS video processing fields
  videoProcessingStatus?: 'NONE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  processingError?: string | null
  processingProgress?: number | null
  processingRunId?: string | null
  hlsManifestKey?: string | null
  hlsManifestUrl?: string | null
  posterKey?: string | null
  posterUrl?: string | null
  hlsQualities?: string[]
  videoCodec?: string | null
  audioCodec?: string | null
  videoBitrate?: number | null
  duration?: number | null
  width?: number | null
  height?: number | null
}

export type ListFilesInput = {
  organizationId: string
  folderId?: string | null // null = root level
  visibility?: FileVisibility
  category?: FileCategory
  search?: string
  page?: number
  pageSize?: number
}

export type ListFoldersInput = {
  organizationId: string
  parentId?: string | null // null = root level
  search?: string
}

/**
 * Folder status result type
 * Used to determine if a folder exists, is in trash, or doesn't exist
 */
export type FolderStatus =
  | { status: 'OK'; folder: { id: string; name: string; deletedAt: null } }
  | { status: 'IN_TRASH'; folder: { id: string; name: string; deletedAt: Date } }
  | { status: 'NOT_FOUND' }

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

/**
 * Create a new folder
 *
 * WHY: Organize files into hierarchical structure
 * HOW: Creates folder with optional parent for nesting
 *
 * PATH CALCULATION:
 * - If root folder (no parent): path = "/"
 * - If nested: path = parent.path + "/" + name
 *
 * VALIDATION:
 * - If parentId is provided, parent must exist and NOT be soft-deleted
 * - Parent must belong to the same organization
 */
export async function createFolder(input: CreateFolderInput) {
  const { organizationId, name, parentId, color, icon } = input

  // Calculate path based on parent (validate parent exists and is not deleted)
  let path = '/'
  if (parentId) {
    // Must use findFirst with deletedAt check - findUnique would find soft-deleted folders
    const parent = await prisma.storageFolder.findFirst({
      where: {
        id: parentId,
        organizationId, // Ensure parent belongs to same org
        deletedAt: null, // Exclude soft-deleted folders
      },
      select: { path: true, name: true },
    })

    // If parentId provided but parent doesn't exist or is deleted, throw error
    if (!parent) {
      throw new Error('Parent folder not found or has been deleted')
    }

    path = parent.path === '/' ? `/${parent.name}` : `${parent.path}/${parent.name}`
  }

  return await prisma.storageFolder.create({
    data: {
      organizationId,
      name,
      parentId,
      path,
      color,
      icon,
    },
    include: {
      _count: {
        select: { files: true, children: true },
      },
    },
  })
}

/**
 * Get folder by ID
 */
export async function getFolderById(organizationId: string, folderId: string) {
  return await prisma.storageFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
      deletedAt: null,
    },
    include: {
      parent: {
        select: { id: true, name: true, path: true },
      },
      _count: {
        select: { files: true, children: true },
      },
    },
  })
}

/**
 * Check folder status for access validation
 *
 * Returns one of three statuses:
 * - OK: Folder exists and is accessible
 * - IN_TRASH: Folder exists but is soft-deleted (in trash)
 * - NOT_FOUND: Folder doesn't exist or belongs to different org
 *
 * USAGE:
 * Call this before listing files/folders in a specific folder
 * to provide proper feedback to the user
 */
export async function getFolderStatus(
  organizationId: string,
  folderId: string
): Promise<FolderStatus> {
  // First, try to find the folder without deletedAt filter
  const folder = await prisma.storageFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
    },
    select: {
      id: true,
      name: true,
      deletedAt: true,
    },
  })

  // Folder doesn't exist or belongs to different org
  if (!folder) {
    return { status: 'NOT_FOUND' }
  }

  // Folder is in trash (soft-deleted)
  if (folder.deletedAt) {
    return {
      status: 'IN_TRASH',
      folder: {
        id: folder.id,
        name: folder.name,
        deletedAt: folder.deletedAt,
      },
    }
  }

  // Folder exists and is accessible
  return {
    status: 'OK',
    folder: {
      id: folder.id,
      name: folder.name,
      deletedAt: null,
    },
  }
}

/**
 * List folders in a directory
 *
 * @param parentId - null for root folders, folder ID for nested
 *
 * GLOBAL SEARCH BEHAVIOR:
 * When `search` is provided, we search across ALL folders in the organization
 * regardless of the parentId. This provides a global search experience.
 * When no search query, we filter by parentId as usual.
 */
export async function listFolders(input: ListFoldersInput) {
  const { organizationId, parentId, search } = input

  // When searching, ignore parentId to search globally
  // When not searching, filter by parentId as usual
  const folderFilter = search
    ? {} // Global search - no parent filter
    : { parentId: parentId ?? null } // Normal view - filter by parent

  return await prisma.storageFolder.findMany({
    where: {
      organizationId,
      ...folderFilter,
      deletedAt: null,
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
    },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { files: true, children: true },
      },
      // Include parent info for search results to show folder path
      parent: search
        ? {
            select: { id: true, name: true },
          }
        : false,
    },
  })
}

/**
 * Update a folder
 *
 * VALIDATION:
 * - Folder must exist and not be soft-deleted
 * - If changing parentId, new parent must exist and not be soft-deleted
 * - Cannot move folder into itself or its descendants (circular reference)
 */
export async function updateFolder(
  organizationId: string,
  folderId: string,
  input: UpdateFolderInput
) {
  // Verify folder belongs to organization and is not deleted
  const existing = await prisma.storageFolder.findFirst({
    where: { id: folderId, organizationId, deletedAt: null },
  })

  if (!existing) {
    throw new Error('Folder not found')
  }

  // If changing parent, recalculate path and validate new parent
  let path = existing.path
  if (input.parentId !== undefined) {
    if (input.parentId) {
      // Prevent moving folder into itself
      if (input.parentId === folderId) {
        throw new Error('Cannot move folder into itself')
      }

      // Validate parent exists, is not deleted, and belongs to same org
      const parent = await prisma.storageFolder.findFirst({
        where: {
          id: input.parentId,
          organizationId,
          deletedAt: null,
        },
        select: { path: true, name: true },
      })

      if (!parent) {
        throw new Error('Parent folder not found or has been deleted')
      }

      path = parent.path === '/' ? `/${parent.name}` : `${parent.path}/${parent.name}`
    } else {
      // Moving to root
      path = '/'
    }
  }

  return await prisma.storageFolder.update({
    where: { id: folderId },
    data: {
      ...input,
      path,
    },
    include: {
      _count: {
        select: { files: true, children: true },
      },
    },
  })
}

/**
 * Get all descendant folder IDs recursively
 *
 * WHY: Need to find ALL nested folders (children, grandchildren, etc.)
 * HOW: Recursive query building the full tree of folder IDs
 *
 * @param organizationId - Organization scope
 * @param folderId - Starting folder ID
 * @returns Array of all descendant folder IDs (NOT including the starting folder)
 */
async function getAllDescendantFolderIds(
  organizationId: string,
  folderId: string
): Promise<string[]> {
  const descendantIds: string[] = []

  // Get immediate children
  const children = await prisma.storageFolder.findMany({
    where: {
      organizationId,
      parentId: folderId,
      deletedAt: null,
    },
    select: { id: true },
  })

  // For each child, recursively get their descendants
  for (const child of children) {
    descendantIds.push(child.id)
    const grandchildren = await getAllDescendantFolderIds(organizationId, child.id)
    descendantIds.push(...grandchildren)
  }

  return descendantIds
}

/**
 * Move folder to trash (soft delete with scheduled hard deletion)
 *
 * WHAT THIS DOES:
 * 1. Finds ALL descendant folders (children, grandchildren, etc.)
 * 2. Collects ALL files in the folder AND all descendants
 * 3. Soft-deletes everything in the database (moves to trash)
 * 4. Returns data needed to schedule hard deletion task
 *
 * TRASH FLOW:
 * - Items stay in trash for 30 days
 * - User can restore from trash (cancels scheduled deletion)
 * - After 30 days, Trigger.dev task permanently deletes from DB + R2
 *
 * @returns Object with folder IDs and storage keys for scheduled deletion
 */
export async function deleteFolder(organizationId: string, folderId: string) {
  // Verify folder belongs to organization and exists
  const existing = await prisma.storageFolder.findFirst({
    where: { id: folderId, organizationId, deletedAt: null },
  })

  if (!existing) {
    throw new Error('Folder not found')
  }

  // Step 1: Get ALL descendant folder IDs recursively
  const descendantFolderIds = await getAllDescendantFolderIds(organizationId, folderId)

  // All folder IDs to delete (including the target folder)
  const allFolderIds = [folderId, ...descendantFolderIds]

  // Step 2: Get ALL files in these folders (for R2 cleanup)
  const filesToDelete = await prisma.storageFile.findMany({
    where: {
      organizationId,
      folderId: { in: allFolderIds },
      deletedAt: null,
    },
    select: {
      id: true,
      storageKey: true,
      thumbnailKey: true,
    },
  })

  // Collect storage keys for R2 deletion
  const storageKeys: string[] = []
  for (const file of filesToDelete) {
    storageKeys.push(file.storageKey)
    if (file.thumbnailKey) {
      storageKeys.push(file.thumbnailKey)
    }
  }

  const now = new Date()

  // Step 3: Soft delete everything in a transaction
  await prisma.$transaction([
    // Soft delete ALL files in all folders
    prisma.storageFile.updateMany({
      where: {
        organizationId,
        folderId: { in: allFolderIds },
        deletedAt: null,
      },
      data: { deletedAt: now },
    }),
    // Soft delete ALL folders (target + all descendants)
    prisma.storageFolder.updateMany({
      where: {
        organizationId,
        id: { in: allFolderIds },
        deletedAt: null,
      },
      data: { deletedAt: now },
    }),
  ])

  // Return all data needed for scheduling deletion task
  return {
    success: true,
    allFolderIds, // All folder IDs that were soft-deleted
    deletedFolderCount: allFolderIds.length,
    deletedFileCount: filesToDelete.length,
    storageKeys, // All storage keys for R2 deletion
  }
}

/**
 * Get folder breadcrumb path
 *
 * Returns array of folders from root to current for navigation
 */
export async function getFolderBreadcrumb(organizationId: string, folderId: string) {
  const breadcrumb: Array<{ id: string; name: string }> = []

  let nextId: string | null = folderId

  // Traverse up the folder hierarchy to build breadcrumb path
  while (nextId) {
    const folderData: { id: string; name: string; parentId: string | null } | null =
      await prisma.storageFolder.findFirst({
        where: { id: nextId, organizationId, deletedAt: null },
        select: { id: true, name: true, parentId: true },
      })

    if (!folderData) break

    breadcrumb.unshift({ id: folderData.id, name: folderData.name })
    nextId = folderData.parentId
  }

  return breadcrumb
}

// ============================================================================
// API ROUTE ACCESS HELPERS
// ============================================================================

/**
 * Look up a storage file for private file access authorization.
 *
 * WHY: The /api/storage/[fileId] route needs to verify the file exists,
 * is not trashed, and retrieve its metadata to generate a presigned URL.
 *
 * SOURCE OF TRUTH KEYWORDS: StorageFileAccessLookup, PrivateFileAccess
 *
 * @param fileId - Storage file ID to look up
 * @returns File metadata for presigned URL generation, or null if not found/trashed
 */
export async function getFileForAccess(fileId: string) {
  return await prisma.storageFile.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      displayName: true,
      mimeType: true,
      storageKey: true,
      visibility: true,
      organizationId: true,
    },
  })
}

/**
 * Look up a storage file for HLS video stream authorization.
 *
 * WHY: The /api/storage/hls/[fileId]/[...path] route needs to verify the file
 * is a video with completed HLS processing, check visibility, and get the
 * HLS manifest key to construct the storage path.
 *
 * SOURCE OF TRUTH KEYWORDS: StorageFileHlsLookup, HlsStreamAccess
 *
 * @param fileId - Storage file ID to look up
 * @returns File metadata for HLS stream access, or null if not found
 */
export async function getFileForHlsAccess(fileId: string) {
  return await prisma.storageFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      organizationId: true,
      visibility: true,
      fileCategory: true,
      videoProcessingStatus: true,
      hlsManifestKey: true,
      deletedAt: true,
    },
  })
}

/**
 * Check if a user has membership in a specific organization.
 *
 * WHY: The storage API routes need to verify the authenticated user
 * belongs to the file's organization before granting access.
 * This is a thin wrapper to avoid direct prisma.member.findFirst in routes.
 *
 * SOURCE OF TRUTH KEYWORDS: StorageMembershipCheck, FileAccessAuthorization
 *
 * @param userId - User ID to check
 * @param organizationId - Organization ID to check membership in
 * @returns Member record with id, or null if not a member
 */
export async function checkMembershipForFileAccess(userId: string, organizationId: string) {
  return await prisma.member.findFirst({
    where: {
      userId,
      organizationId,
    },
    select: { id: true },
  })
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Create a new file record
 *
 * WHY: Track uploaded files with metadata and privacy settings
 * HOW: Creates file record after upload to R2 is complete
 *
 * VALIDATION:
 * - If folderId provided, folder must exist and not be soft-deleted
 */
export async function createFile(input: CreateFileInput) {
  // Validate folder exists if folderId is provided
  if (input.folderId) {
    const folder = await prisma.storageFolder.findFirst({
      where: {
        id: input.folderId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    })

    if (!folder) {
      throw new Error('Folder not found or has been deleted')
    }
  }

  return await prisma.storageFile.create({
    data: input,
  })
}

/**
 * Get file by ID (within organization scope)
 *
 * SECURITY: Returns accessUrl based on visibility
 * - PUBLIC: Direct CDN URL
 * - PRIVATE: Authenticated API route
 */
export async function getFileById(organizationId: string, fileId: string) {
  const file = await prisma.storageFile.findFirst({
    where: {
      id: fileId,
      organizationId,
      deletedAt: null,
    },
    include: {
      folder: {
        select: { id: true, name: true, path: true },
      },
    },
  })

  if (!file) return null

  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

  // Apply security-aware URL handling
  if (file.visibility === 'PRIVATE') {
    return {
      ...file,
      publicUrl: null, // Never expose for private files
      accessUrl: `/api/storage/${file.id}`,
    }
  } else {
    let cdnUrl = file.publicUrl
    if (!cdnUrl && R2_PUBLIC_URL && file.storageKey) {
      cdnUrl = `${R2_PUBLIC_URL}/${file.storageKey}`
    }
    return {
      ...file,
      publicUrl: cdnUrl,
      accessUrl: cdnUrl,
    }
  }
}

/**
 * List files with filtering and pagination
 *
 * SECURITY MODEL:
 * - PUBLIC files: Direct CDN URL exposed for embedding/sharing
 * - PRIVATE files: Never expose direct CDN URL, use authenticated API route
 *
 * The `accessUrl` field provides the URL to use for viewing the file:
 * - PUBLIC: Direct CDN URL (fast, cacheable, embeddable)
 * - PRIVATE: API route that requires authentication (/api/storage/[fileId])
 *
 * IMPORTANT: Private files NEVER get their publicUrl exposed to the client.
 * Even if attackers somehow get the storage key, they can't construct the URL
 * because we don't expose the R2_PUBLIC_URL pattern for private files.
 */
export async function listFiles(input: ListFilesInput) {
  const {
    organizationId,
    folderId,
    visibility,
    category,
    search,
    page = 1,
    pageSize = 50,
  } = input

  // GLOBAL SEARCH BEHAVIOR:
  // When `search` is provided, we search across ALL files in the organization
  // regardless of folderId. This provides a global search experience.
  // When no search query, we filter by folderId as usual.
  const folderFilter = search
    ? {} // Global search - no folder filter
    : { folderId: folderId === undefined ? undefined : folderId } // Normal view

  const where = {
    organizationId,
    ...folderFilter,
    deletedAt: null,
    ...(visibility && { visibility }),
    ...(category && { fileCategory: category }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { displayName: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [files, total] = await Promise.all([
    prisma.storageFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // Include folder info when searching to show file location
      include: search
        ? {
            folder: {
              select: { id: true, name: true },
            },
          }
        : undefined,
    }),
    prisma.storageFile.count({ where }),
  ])

  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

  // Process files with security-aware URL handling
  const filesWithSecureUrls = files.map((file) => {
    if (file.visibility === 'PRIVATE') {
      // PRIVATE FILES: Never expose the direct CDN URL
      // Use authenticated API route instead
      return {
        ...file,
        publicUrl: null, // Explicitly null - never expose
        accessUrl: `/api/storage/${file.id}`, // Authenticated route
      }
    } else {
      // PUBLIC FILES: Direct CDN URL for fast access
      let cdnUrl = file.publicUrl
      if (!cdnUrl && R2_PUBLIC_URL && file.storageKey) {
        cdnUrl = `${R2_PUBLIC_URL}/${file.storageKey}`
      }
      return {
        ...file,
        publicUrl: cdnUrl,
        accessUrl: cdnUrl, // Direct CDN for public files
      }
    }
  })

  return {
    files: filesWithSecureUrls,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

/**
 * Update a file
 *
 * SECURITY: Validates folderId belongs to the organization to prevent
 * cross-organization folder assignment (IDOR vulnerability fix).
 */
export async function updateFile(
  organizationId: string,
  fileId: string,
  input: UpdateFileInput
) {
  // Verify file belongs to organization
  const existing = await prisma.storageFile.findFirst({
    where: { id: fileId, organizationId, deletedAt: null },
  })

  if (!existing) {
    throw new Error('File not found')
  }

  // SECURITY: Validate folderId belongs to this organization if provided
  if (input.folderId !== undefined && input.folderId !== null) {
    const folder = await prisma.storageFolder.findFirst({
      where: {
        id: input.folderId,
        organizationId,
        deletedAt: null,
      },
    })

    if (!folder) {
      throw new Error('Folder not found')
    }
  }

  return await prisma.storageFile.update({
    where: { id: fileId },
    data: input,
  })
}

/**
 * Delete a file (soft delete)
 */
export async function deleteFile(organizationId: string, fileId: string) {
  const existing = await prisma.storageFile.findFirst({
    where: { id: fileId, organizationId, deletedAt: null },
  })

  if (!existing) {
    throw new Error('File not found')
  }

  return await prisma.storageFile.update({
    where: { id: fileId },
    data: { deletedAt: new Date() },
  })
}

/**
 * Batch delete files
 */
export async function deleteFiles(organizationId: string, fileIds: string[]) {
  return await prisma.storageFile.updateMany({
    where: {
      id: { in: fileIds },
      organizationId,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  })
}

/**
 * Move files to a different folder
 */
export async function moveFiles(
  organizationId: string,
  fileIds: string[],
  targetFolderId: string | null
) {
  // If moving to a folder, verify it exists
  if (targetFolderId) {
    const folder = await prisma.storageFolder.findFirst({
      where: { id: targetFolderId, organizationId, deletedAt: null },
    })
    if (!folder) {
      throw new Error('Target folder not found')
    }
  }

  return await prisma.storageFile.updateMany({
    where: {
      id: { in: fileIds },
      organizationId,
      deletedAt: null,
    },
    data: { folderId: targetFolderId },
  })
}

/**
 * Change file visibility
 *
 * SECURITY CRITICAL:
 * When changing from PUBLIC to PRIVATE:
 * - Move file to a NEW random location in R2
 * - Old URL immediately becomes a 404
 * - Anyone who had the old link can no longer access it
 *
 * When changing from PRIVATE to PUBLIC:
 * - Generate CDN URL from current storageKey
 *
 * @param moveFileInR2 - Function to move file in R2 storage (injected to avoid circular deps)
 */
export async function changeFileVisibility(
  organizationId: string,
  fileId: string,
  visibility: FileVisibility,
  moveFileInR2?: (sourceKey: string, destKey: string) => Promise<void>,
  generateNewKey?: (options: { organizationId: string; filename: string; isPublic: boolean; folderId?: string | null }) => string
) {
  const existing = await prisma.storageFile.findFirst({
    where: { id: fileId, organizationId, deletedAt: null },
  })

  if (!existing) {
    throw new Error('File not found')
  }

  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

  // No change needed if visibility is the same
  if (existing.visibility === visibility) {
    return existing
  }

  // =========================================================================
  // CHANGING TO PRIVATE: Move file to new location, invalidate old URL
  // =========================================================================
  if (visibility === 'PRIVATE') {
    // If R2 functions provided, move the file to a new secret location
    if (moveFileInR2 && generateNewKey) {
      // Generate a completely new storage key (removes 'public/' prefix, new random path)
      const newStorageKey = generateNewKey({
        organizationId,
        filename: existing.name,
        isPublic: false, // Private = no 'public/' prefix
        folderId: existing.folderId,
      })

      // Move the file in R2 (copy to new location, delete old)
      await moveFileInR2(existing.storageKey, newStorageKey)

      // Update database with new key and clear publicUrl
      return await prisma.storageFile.update({
        where: { id: fileId },
        data: {
          visibility: 'PRIVATE',
          storageKey: newStorageKey,
          publicUrl: null, // Clear - no public URL for private files
        },
      })
    }

    // Fallback if R2 functions not provided (just update DB)
    // NOTE: This is less secure - old URL might still work
    return await prisma.storageFile.update({
      where: { id: fileId },
      data: {
        visibility: 'PRIVATE',
        publicUrl: null,
      },
    })
  }

  // =========================================================================
  // CHANGING TO PUBLIC: Generate CDN URL from storage key
  // =========================================================================
  if (visibility === 'PUBLIC') {
    // Generate public CDN URL
    const newPublicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${existing.storageKey}`
      : null

    return await prisma.storageFile.update({
      where: { id: fileId },
      data: {
        visibility: 'PUBLIC',
        publicUrl: newPublicUrl,
      },
    })
  }

  // Shouldn't reach here, but TypeScript needs this
  return existing
}

// ============================================================================
// STORAGE STATS
// ============================================================================

/**
 * Get storage statistics for an organization
 */
/**
 * Calculate the true storage usage in KB using per-file Math.ceil(bytes / 1024).
 * This MUST match the increment logic in createFile so the counter stays accurate.
 *
 * WHY: The usage counter can drift from reality due to old code that didn't track
 * small files, partial failures, or bugs. This function queries every active file
 * and computes the correct total, which can be used to reconcile the counter.
 *
 * SOURCE OF TRUTH: StorageUsageKbCalculation, ReconcileStorageUsage
 */
export async function calculateRealStorageUsageKb(organizationId: string): Promise<number> {
  /* Query all active file sizes — includes trashed files since they still
   * occupy R2 storage and count against quota until permanently deleted. */
  const files = await prisma.storageFile.findMany({
    where: { organizationId },
    select: { size: true },
  })

  return files.reduce(
    (sum, f) => sum + Math.max(1, Math.ceil(f.size / 1024)),
    0
  )
}

export async function getStorageStats(organizationId: string) {
  const [
    totalFiles,
    totalSize,
    publicFiles,
    privateFiles,
    byCategory,
  ] = await Promise.all([
    // Total file count
    prisma.storageFile.count({
      where: { organizationId, deletedAt: null },
    }),
    // Total size
    prisma.storageFile.aggregate({
      where: { organizationId, deletedAt: null },
      _sum: { size: true },
    }),
    // Public file count
    prisma.storageFile.count({
      where: { organizationId, deletedAt: null, visibility: 'PUBLIC' },
    }),
    // Private file count
    prisma.storageFile.count({
      where: { organizationId, deletedAt: null, visibility: 'PRIVATE' },
    }),
    // Files by category
    prisma.storageFile.groupBy({
      by: ['fileCategory'],
      where: { organizationId, deletedAt: null },
      _count: true,
      _sum: { size: true },
    }),
  ])

  return {
    totalFiles,
    totalSize: totalSize._sum.size ?? 0,
    publicFiles,
    privateFiles,
    byCategory: byCategory.map((c) => ({
      category: c.fileCategory,
      count: c._count,
      size: c._sum.size ?? 0,
    })),
  }
}

// ============================================================================
// TRASH OPERATIONS
// ============================================================================

/**
 * Update folder with scheduled deletion run ID
 *
 * Called after triggering the scheduled deletion task.
 * Stores the Trigger.dev run ID so we can cancel if user restores.
 */
export async function updateFolderScheduledDeletion(
  organizationId: string,
  folderId: string,
  runId: string
) {
  return await prisma.storageFolder.update({
    where: { id: folderId },
    data: { scheduledDeletionRunId: runId },
  })
}

/**
 * Update files with scheduled deletion run ID
 */
export async function updateFilesScheduledDeletion(
  organizationId: string,
  fileIds: string[],
  runId: string
) {
  return await prisma.storageFile.updateMany({
    where: {
      id: { in: fileIds },
      organizationId,
    },
    data: { scheduledDeletionRunId: runId },
  })
}

/**
 * List items in trash (soft-deleted folders and files)
 *
 * Returns both folders and files that have been deleted but not yet
 * permanently removed. Shows deletedAt date so UI can display countdown.
 */
export async function listTrash(organizationId: string) {
  const [folders, files] = await Promise.all([
    // Get trashed folders (only root level - deleted folder's children are shown inside it)
    prisma.storageFolder.findMany({
      where: {
        organizationId,
        deletedAt: { not: null },
        // Only show root-level trashed folders (not nested ones inside deleted parent)
        OR: [
          { parentId: null },
          {
            parent: {
              deletedAt: null, // Parent is not deleted, so this folder was deleted directly
            },
          },
        ],
      },
      orderBy: { deletedAt: 'desc' },
      include: {
        _count: {
          select: { files: true, children: true },
        },
      },
    }),
    // Get trashed files (not in a trashed folder - those are restored with the folder)
    prisma.storageFile.findMany({
      where: {
        organizationId,
        deletedAt: { not: null },
        // Only show files that were deleted directly, not via folder deletion
        OR: [
          { folderId: null },
          {
            folder: {
              deletedAt: null, // Parent folder is not deleted
            },
          },
        ],
      },
      orderBy: { deletedAt: 'desc' },
    }),
  ])

  return { folders, files }
}

/**
 * Restore a folder and all its contents from trash
 *
 * WHAT THIS DOES:
 * 1. Clears deletedAt on the folder and all descendants
 * 2. Clears deletedAt on all files in those folders
 * 3. Clears scheduledDeletionRunId (caller should cancel the task)
 *
 * @returns Object with run ID to cancel (if any)
 */
export async function restoreFolder(organizationId: string, folderId: string) {
  // Get the folder to restore (must be in trash)
  const folder = await prisma.storageFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
      deletedAt: { not: null },
    },
    select: {
      id: true,
      scheduledDeletionRunId: true,
    },
  })

  if (!folder) {
    throw new Error('Folder not found in trash')
  }

  // Get all descendant folder IDs
  // Note: We need to find descendants that were deleted at the same time
  const allFolderIds = [folderId]

  // Recursive function to get all trashed descendants
  async function getDeletedDescendants(parentId: string): Promise<string[]> {
    const children = await prisma.storageFolder.findMany({
      where: {
        organizationId,
        parentId,
        deletedAt: { not: null },
      },
      select: { id: true },
    })

    const ids: string[] = []
    for (const child of children) {
      ids.push(child.id)
      const grandchildren = await getDeletedDescendants(child.id)
      ids.push(...grandchildren)
    }
    return ids
  }

  const descendantIds = await getDeletedDescendants(folderId)
  allFolderIds.push(...descendantIds)

  // Restore everything in a transaction
  await prisma.$transaction([
    // Restore all files in these folders
    prisma.storageFile.updateMany({
      where: {
        organizationId,
        folderId: { in: allFolderIds },
        deletedAt: { not: null },
      },
      data: {
        deletedAt: null,
        scheduledDeletionRunId: null,
      },
    }),
    // Restore all folders
    prisma.storageFolder.updateMany({
      where: {
        organizationId,
        id: { in: allFolderIds },
        deletedAt: { not: null },
      },
      data: {
        deletedAt: null,
        scheduledDeletionRunId: null,
      },
    }),
  ])

  return {
    success: true,
    restoredFolders: allFolderIds.length,
    scheduledDeletionRunId: folder.scheduledDeletionRunId,
  }
}

/**
 * Restore files from trash
 *
 * @returns Object with run IDs to cancel (if any)
 */
export async function restoreFiles(organizationId: string, fileIds: string[]) {
  // Get files to restore (must be in trash)
  const files = await prisma.storageFile.findMany({
    where: {
      id: { in: fileIds },
      organizationId,
      deletedAt: { not: null },
    },
    select: {
      id: true,
      scheduledDeletionRunId: true,
    },
  })

  if (files.length === 0) {
    throw new Error('No files found in trash')
  }

  // Collect unique run IDs to cancel
  const runIdsToCancel = [...new Set(
    files
      .map((f) => f.scheduledDeletionRunId)
      .filter((id): id is string => id !== null)
  )]

  // Restore files
  await prisma.storageFile.updateMany({
    where: {
      id: { in: fileIds },
      organizationId,
      deletedAt: { not: null },
    },
    data: {
      deletedAt: null,
      scheduledDeletionRunId: null,
    },
  })

  return {
    success: true,
    restoredFiles: files.length,
    runIdsToCancel,
  }
}

/**
 * Permanently delete a folder immediately (skip 30-day wait)
 *
 * Used when user wants to free up space immediately.
 * Directly hard deletes from DB, returns storage keys for R2 deletion.
 */
export async function permanentlyDeleteFolder(organizationId: string, folderId: string) {
  // Get the folder (must be in trash)
  const folder = await prisma.storageFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
      deletedAt: { not: null },
    },
    select: {
      id: true,
      scheduledDeletionRunId: true,
    },
  })

  if (!folder) {
    throw new Error('Folder not found in trash')
  }

  // Get all descendant folder IDs
  async function getDeletedDescendants(parentId: string): Promise<string[]> {
    const children = await prisma.storageFolder.findMany({
      where: {
        organizationId,
        parentId,
      },
      select: { id: true },
    })

    const ids: string[] = []
    for (const child of children) {
      ids.push(child.id)
      const grandchildren = await getDeletedDescendants(child.id)
      ids.push(...grandchildren)
    }
    return ids
  }

  const descendantIds = await getDeletedDescendants(folderId)
  const allFolderIds = [folderId, ...descendantIds]

  // Get all files for R2 cleanup — includes size for storage usage tracking
  const files = await prisma.storageFile.findMany({
    where: {
      organizationId,
      folderId: { in: allFolderIds },
    },
    select: {
      size: true,
      storageKey: true,
      thumbnailKey: true,
    },
  })

  const storageKeys: string[] = []
  for (const file of files) {
    storageKeys.push(file.storageKey)
    if (file.thumbnailKey) {
      storageKeys.push(file.thumbnailKey)
    }
  }

  // Hard delete from DB
  await prisma.$transaction([
    prisma.storageFile.deleteMany({
      where: {
        organizationId,
        folderId: { in: allFolderIds },
      },
    }),
    prisma.storageFolder.deleteMany({
      where: {
        organizationId,
        id: { in: allFolderIds },
      },
    }),
  ])

  /* Sum per-file KB freed — uses Math.ceil(bytes / 1024) to match the
   * per-file rounding used during upload increment for accurate tracking. */
  const totalSizeKb = files.reduce(
    (sum, f) => sum + Math.max(1, Math.ceil(f.size / 1024)),
    0
  )

  return {
    success: true,
    deletedFolders: allFolderIds.length,
    deletedFiles: files.length,
    totalSizeKb,
    storageKeys,
    scheduledDeletionRunId: folder.scheduledDeletionRunId,
  }
}

/**
 * Permanently delete files immediately
 */
export async function permanentlyDeleteFiles(organizationId: string, fileIds: string[]) {
  // Get files (must be in trash) — includes size for storage usage tracking
  const files = await prisma.storageFile.findMany({
    where: {
      id: { in: fileIds },
      organizationId,
      deletedAt: { not: null },
    },
    select: {
      id: true,
      size: true,
      storageKey: true,
      thumbnailKey: true,
      scheduledDeletionRunId: true,
    },
  })

  if (files.length === 0) {
    throw new Error('No files found in trash')
  }

  const storageKeys: string[] = []
  const runIdsToCancel: string[] = []

  for (const file of files) {
    storageKeys.push(file.storageKey)
    if (file.thumbnailKey) {
      storageKeys.push(file.thumbnailKey)
    }
    if (file.scheduledDeletionRunId) {
      runIdsToCancel.push(file.scheduledDeletionRunId)
    }
  }

  // Hard delete from DB
  await prisma.storageFile.deleteMany({
    where: {
      id: { in: fileIds },
      organizationId,
    },
  })

  /* Sum per-file KB freed — uses Math.ceil(bytes / 1024) to match the
   * per-file rounding used during upload increment for accurate tracking. */
  const totalSizeKb = files.reduce(
    (sum, f) => sum + Math.max(1, Math.ceil(f.size / 1024)),
    0
  )

  return {
    success: true,
    deletedFiles: files.length,
    totalSizeKb,
    storageKeys,
    runIdsToCancel: [...new Set(runIdsToCancel)],
  }
}

// ============================================================================
// VIDEO PROCESSING HELPERS (Trigger.dev Tasks)
// ============================================================================
// Used by video-processing.ts trigger task to update file status during HLS encoding.
// SOURCE OF TRUTH KEYWORDS: VideoProcessingUpdate, StorageFileProgressUpdate

/**
 * Update a storage file's processing progress and optional extra fields.
 *
 * WHY: The video processing trigger task updates progress during HLS encoding
 * (download, probe, transcode, upload) so the UI can show a progress bar.
 *
 * SOURCE OF TRUTH: UpdateStorageFileProgress, VideoProcessingProgressUpdate
 *
 * @param fileId - The storage file being processed
 * @param progress - Processing progress percentage (0-100)
 * @param extra - Additional fields to update (e.g., video metadata, HLS URLs)
 */
export async function updateStorageFileProgress(
  fileId: string,
  progress: number,
  extra?: Record<string, unknown>
) {
  return await prisma.storageFile.update({
    where: { id: fileId },
    data: {
      processingProgress: progress,
      ...extra,
    },
  })
}

/**
 * Mark a storage file as processing started.
 *
 * WHY: Sets the initial PROCESSING status, clears any previous error,
 * and stores the Trigger.dev run ID for tracking/cancellation.
 *
 * SOURCE OF TRUTH: MarkVideoProcessingStarted, VideoProcessingInit
 *
 * @param fileId - The storage file being processed
 * @param runId - The Trigger.dev run ID for this processing job
 */
export async function markStorageFileProcessingStarted(
  fileId: string,
  runId: string
) {
  return await prisma.storageFile.update({
    where: { id: fileId },
    data: {
      videoProcessingStatus: 'PROCESSING',
      processingProgress: 0,
      processingRunId: runId,
      processingError: null,
    },
  })
}

/**
 * Mark a storage file as processing completed with HLS data.
 *
 * WHY: After HLS encoding finishes, stores the manifest key/URL, poster, and
 * quality variants so the video player can load them.
 *
 * SOURCE OF TRUTH: MarkVideoProcessingCompleted, VideoProcessingDone
 *
 * @param fileId - The storage file that was processed
 * @param data - HLS manifest, poster, and quality data
 */
export async function markStorageFileProcessingCompleted(
  fileId: string,
  data: {
    hlsManifestKey: string
    hlsManifestUrl: string | null
    posterKey: string
    posterUrl: string | null
    hlsQualities: string[]
  }
) {
  return await prisma.storageFile.update({
    where: { id: fileId },
    data: {
      videoProcessingStatus: 'COMPLETED',
      processingProgress: 100,
      ...data,
    },
  })
}

/**
 * Mark a storage file as processing failed.
 *
 * WHY: If HLS encoding fails, store the error message so the UI can display it
 * and the user can decide to retry.
 *
 * SOURCE OF TRUTH: MarkVideoProcessingFailed, VideoProcessingError
 *
 * @param fileId - The storage file that failed processing
 * @param errorMessage - Human-readable error description
 */
export async function markStorageFileProcessingFailed(
  fileId: string,
  errorMessage: string
) {
  return await prisma.storageFile.update({
    where: { id: fileId },
    data: {
      videoProcessingStatus: 'FAILED',
      processingError: errorMessage,
    },
  })
}

/**
 * Update a storage file with video metadata from ffprobe.
 *
 * WHY: After probing the video, we store codec, bitrate, duration, and resolution
 * so the UI can display video info without re-probing.
 *
 * SOURCE OF TRUTH: UpdateVideoMetadata, StorageFileVideoMetadata
 *
 * @param fileId - The storage file to update
 * @param metadata - Video metadata from ffprobe
 */
export async function updateStorageFileVideoMetadata(
  fileId: string,
  metadata: {
    videoCodec: string
    audioCodec: string
    videoBitrate: number
    duration: number
    width: number
    height: number
  }
) {
  return await prisma.storageFile.update({
    where: { id: fileId },
    data: {
      processingProgress: 15,
      ...metadata,
    },
  })
}

// ============================================================================
// SCHEDULED DELETION HELPERS (Trigger.dev Tasks)
// ============================================================================
// Used by scheduled-deletion.ts trigger task to verify and hard-delete trashed items.
// SOURCE OF TRUTH KEYWORDS: ScheduledDeletionVerify, HardDeleteStorage

/**
 * Find a storage folder by ID for deletion verification.
 *
 * WHY: The scheduled deletion task needs to verify the root folder is still
 * soft-deleted (user didn't restore it) before hard deleting.
 *
 * SOURCE OF TRUTH: FindFolderForDeletion, VerifyFolderStillDeleted
 *
 * @param folderId - The folder to check
 * @param organizationId - Organization scope for security
 * @returns Folder ID and deletedAt status, or null if not found
 */
export async function findFolderForDeletionCheck(
  folderId: string,
  organizationId: string
) {
  return await prisma.storageFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
    },
    select: {
      id: true,
      deletedAt: true,
    },
  })
}

/**
 * Hard delete files and folders in a folder deletion batch.
 *
 * WHY: After the 30-day trash period, permanently removes all files and folders
 * from the database in a single transaction (files first due to foreign key).
 *
 * SOURCE OF TRUTH: HardDeleteFolderBatch, PermanentFolderDeletion
 *
 * @param organizationId - Organization scope for security
 * @param allFolderIds - All folder IDs to hard delete (root + descendants)
 */
/**
 * Find files in given folders — used by scheduled deletion to compute freed MB.
 *
 * SOURCE OF TRUTH: FindFilesInFolders, ScheduledDeletionUsageDecrement
 *
 * @param organizationId - Organization scope for security
 * @param folderIds - Folder IDs to search
 * @returns Files with their sizes for usage decrement calculation
 */
export async function findFilesInFolders(
  organizationId: string,
  folderIds: string[]
) {
  return await prisma.storageFile.findMany({
    where: {
      organizationId,
      folderId: { in: folderIds },
    },
    select: {
      id: true,
      size: true,
    },
  })
}

export async function hardDeleteFolderBatch(
  organizationId: string,
  allFolderIds: string[]
) {
  return await prisma.$transaction([
    prisma.storageFile.deleteMany({
      where: {
        organizationId,
        folderId: { in: allFolderIds },
      },
    }),
    prisma.storageFolder.deleteMany({
      where: {
        organizationId,
        id: { in: allFolderIds },
      },
    }),
  ])
}

/**
 * Find files still in trash for scheduled file deletion.
 *
 * WHY: After the 30-day trash period, we need to check which files are still
 * soft-deleted (not restored) before hard deleting them.
 *
 * SOURCE OF TRUTH: FindFilesStillInTrash, VerifyFilesForDeletion
 *
 * @param fileIds - The file IDs to check
 * @param organizationId - Organization scope for security
 * @returns Files that are still soft-deleted with their storage keys
 */
export async function findFilesStillInTrash(
  fileIds: string[],
  organizationId: string
) {
  return await prisma.storageFile.findMany({
    where: {
      id: { in: fileIds },
      organizationId,
      deletedAt: { not: null },
    },
    select: {
      id: true,
      size: true,
      storageKey: true,
      thumbnailKey: true,
    },
  })
}

/**
 * Hard delete files by IDs within an organization.
 *
 * WHY: After the 30-day trash period, permanently removes files from the database.
 *
 * SOURCE OF TRUTH: HardDeleteFilesBatch, PermanentFileDeletion
 *
 * @param fileIds - The file IDs to hard delete
 * @param organizationId - Organization scope for security
 */
export async function hardDeleteFilesBatch(
  fileIds: string[],
  organizationId: string
) {
  return await prisma.storageFile.deleteMany({
    where: {
      id: { in: fileIds },
      organizationId,
    },
  })
}

// ============================================================================
// SCREENSHOT CAPTURE HELPERS (Trigger.dev Tasks)
// ============================================================================
// Used by screenshot-capture.ts trigger task to manage page preview storage files.
// SOURCE OF TRUTH KEYWORDS: ScreenshotStorageFile, PagePreviewFile

/**
 * Find an existing storage file by storageKey (including soft-deleted files).
 *
 * WHY: The screenshot capture task needs to check if a file with the same
 * storageKey already exists before creating a new one. This check includes
 * soft-deleted files because storageKey has a unique constraint across the
 * entire table, not just active records.
 *
 * SOURCE OF TRUTH: FindStorageFileByKey, ScreenshotFileKeyLookup
 *
 * @param organizationId - Organization scope for security
 * @param storageKey - The R2 storage key to look up
 * @returns File ID and deletedAt status, or null if not found
 */
export async function findStorageFileByKey(
  organizationId: string,
  storageKey: string
) {
  return await prisma.storageFile.findFirst({
    where: {
      organizationId,
      storageKey,
    },
    select: { id: true, deletedAt: true },
  })
}

/**
 * Hard delete a storage file by ID.
 *
 * WHY: When a soft-deleted file has the same storageKey as a new file being
 * created, we hard delete the old record to free up the unique constraint.
 *
 * SOURCE OF TRUTH: HardDeleteStorageFileById, FreeStorageKey
 *
 * @param fileId - The file ID to hard delete
 */
export async function hardDeleteStorageFileById(fileId: string) {
  return await prisma.storageFile.delete({
    where: { id: fileId },
  })
}

/**
 * Update an existing storage file's size and public URL (e.g., on re-publish).
 *
 * WHY: When a page is re-published, the screenshot file already exists.
 * We just need to update the file size (new screenshot may differ) and URL.
 *
 * SOURCE OF TRUTH: UpdateStorageFileForRePublish, ScreenshotFileUpdate
 *
 * @param fileId - The file ID to update
 * @param data - Updated size and public URL
 * @returns Updated file with ID
 */
export async function updateStorageFileForScreenshot(
  fileId: string,
  data: { size: number; publicUrl: string | null }
) {
  return await prisma.storageFile.update({
    where: { id: fileId },
    data: {
      size: data.size,
      publicUrl: data.publicUrl,
      updatedAt: new Date(),
    },
    select: { id: true },
  })
}

/**
 * Update a page's preview image reference using a raw query.
 *
 * WHY: The Page model may not have the previewImageId column yet (migration pending).
 * Using a raw query allows graceful handling when the column doesn't exist.
 *
 * SOURCE OF TRUTH: UpdatePagePreviewImage, PagePreviewImageLink
 *
 * @param pageId - The page to update
 * @param storageFileId - The storage file ID of the screenshot
 */
export async function updatePagePreviewImage(
  pageId: string,
  storageFileId: string
) {
  return await prisma.$executeRaw`
    UPDATE "page"
    SET "previewImageId" = ${storageFileId}
    WHERE id = ${pageId}
  `
}

/**
 * Empty entire trash (permanently delete everything)
 */
export async function emptyTrash(organizationId: string) {
  // Get all trashed folders (root level only to avoid duplicates)
  const trashedFolders = await prisma.storageFolder.findMany({
    where: {
      organizationId,
      deletedAt: { not: null },
    },
    select: {
      id: true,
      scheduledDeletionRunId: true,
    },
  })

  // Get all trashed files — includes size for storage usage tracking
  const trashedFiles = await prisma.storageFile.findMany({
    where: {
      organizationId,
      deletedAt: { not: null },
    },
    select: {
      id: true,
      size: true,
      storageKey: true,
      thumbnailKey: true,
      scheduledDeletionRunId: true,
    },
  })

  // Collect storage keys and run IDs
  const storageKeys: string[] = []
  const runIdsToCancel: string[] = []

  for (const file of trashedFiles) {
    storageKeys.push(file.storageKey)
    if (file.thumbnailKey) {
      storageKeys.push(file.thumbnailKey)
    }
    if (file.scheduledDeletionRunId) {
      runIdsToCancel.push(file.scheduledDeletionRunId)
    }
  }

  for (const folder of trashedFolders) {
    if (folder.scheduledDeletionRunId) {
      runIdsToCancel.push(folder.scheduledDeletionRunId)
    }
  }

  // Hard delete everything
  await prisma.$transaction([
    prisma.storageFile.deleteMany({
      where: {
        organizationId,
        deletedAt: { not: null },
      },
    }),
    prisma.storageFolder.deleteMany({
      where: {
        organizationId,
        deletedAt: { not: null },
      },
    }),
  ])

  /* Sum per-file KB freed — uses Math.ceil(bytes / 1024) to match the
   * per-file rounding used during upload increment for accurate tracking. */
  const totalSizeKb = trashedFiles.reduce(
    (sum, f) => sum + Math.max(1, Math.ceil(f.size / 1024)),
    0
  )

  return {
    success: true,
    deletedFolders: trashedFolders.length,
    deletedFiles: trashedFiles.length,
    totalSizeKb,
    storageKeys,
    runIdsToCancel: [...new Set(runIdsToCancel)],
  }
}
