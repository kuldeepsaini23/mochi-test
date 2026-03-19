/**
 * Email Template Folder Service
 *
 * Data Access Layer (DAL) for email template folder organization.
 * Handles CRUD operations for nested folder structure (similar to StorageFolder).
 *
 * SOURCE OF TRUTH KEYWORDS: EmailTemplateFolderService, TemplateFolderDAL
 *
 * ARCHITECTURE:
 * - Self-referencing relation for nested folders
 * - Soft delete support
 * - Breadcrumb generation for navigation
 */

import { prisma } from '@/lib/config'
import type { EmailTemplateFolder } from '@/generated/prisma'
import { logActivity } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Folder with template count for display
 */
export interface EmailTemplateFolderWithCount extends EmailTemplateFolder {
  _count: {
    templates: number
    children: number
  }
}

/**
 * Breadcrumb item for folder navigation
 */
export interface FolderBreadcrumb {
  id: string
  name: string
}

/**
 * Input for creating a folder
 */
export interface CreateFolderInput {
  organizationId: string
  name: string
  parentId?: string | null
  color?: string | null
}

/**
 * Input for updating a folder
 */
export interface UpdateFolderInput {
  organizationId: string
  folderId: string
  name?: string
  color?: string | null
}

/**
 * Input for listing folders
 */
export interface ListFoldersInput {
  organizationId: string
  parentId?: string | null
  search?: string
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new email template folder.
 *
 * @param input - Folder creation input
 * @param userId - Optional user ID for activity logging
 * @returns Created folder
 */
export async function createEmailTemplateFolder(
  input: CreateFolderInput,
  userId?: string
): Promise<EmailTemplateFolder> {
  const { organizationId, name, parentId, color } = input

  // If parent specified, verify it exists
  if (parentId) {
    const parent = await prisma.emailTemplateFolder.findFirst({
      where: {
        id: parentId,
        organizationId,
        deletedAt: null,
      },
    })
    if (!parent) {
      throw new Error(`Parent folder not found: ${parentId}`)
    }
  }

  const folder = await prisma.emailTemplateFolder.create({
    data: {
      organizationId,
      name,
      parentId: parentId ?? null,
      color: color ?? null,
    },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'email_template_folder',
      entityId: folder.id,
    })
  }

  return folder
}

// ============================================================================
// READ
// ============================================================================

/**
 * Get a single folder by ID.
 *
 * @param organizationId - Organization context
 * @param folderId - Folder to fetch
 * @returns Folder or null if not found
 */
export async function getEmailTemplateFolderById(
  organizationId: string,
  folderId: string
): Promise<EmailTemplateFolder | null> {
  return await prisma.emailTemplateFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
      deletedAt: null,
    },
  })
}

/**
 * List folders with optional parent filter and search.
 *
 * @param input - List input with filters
 * @returns Array of folders with counts
 */
export async function listEmailTemplateFolders(
  input: ListFoldersInput
): Promise<EmailTemplateFolderWithCount[]> {
  const { organizationId, parentId, search } = input

  // Build where clause
  const where = {
    organizationId,
    deletedAt: null,
    // If search is provided, search across all folders (ignore parentId)
    // Otherwise, filter by parentId (null for root folders)
    ...(search
      ? {
          name: { contains: search, mode: 'insensitive' as const },
        }
      : {
          parentId: parentId ?? null,
        }),
  }

  const folders = await prisma.emailTemplateFolder.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          templates: {
            where: { deletedAt: null },
          },
          children: {
            where: { deletedAt: null },
          },
        },
      },
    },
  })

  return folders as EmailTemplateFolderWithCount[]
}

/**
 * Get all folders for a folder tree (used for "move to" dialogs).
 *
 * @param organizationId - Organization context
 * @returns All folders in organization
 */
export async function getAllEmailTemplateFolders(
  organizationId: string
): Promise<EmailTemplateFolderWithCount[]> {
  const folders = await prisma.emailTemplateFolder.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          templates: {
            where: { deletedAt: null },
          },
          children: {
            where: { deletedAt: null },
          },
        },
      },
    },
  })

  return folders as EmailTemplateFolderWithCount[]
}

/**
 * Get breadcrumb path for a folder.
 * Walks up the parent chain to build navigation path.
 *
 * @param organizationId - Organization context
 * @param folderId - Starting folder
 * @returns Array of breadcrumb items (root -> ... -> current)
 */
export async function getEmailTemplateFolderBreadcrumb(
  organizationId: string,
  folderId: string
): Promise<FolderBreadcrumb[]> {
  const breadcrumbs: FolderBreadcrumb[] = []
  let currentId: string | null = folderId

  // Walk up the parent chain (max 10 levels to prevent infinite loops)
  let depth = 0
  while (currentId && depth < 10) {
    const folderResult: { id: string; name: string; parentId: string | null } | null =
      await prisma.emailTemplateFolder.findFirst({
        where: {
          id: currentId,
          organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          parentId: true,
        },
      })

    if (!folderResult) break

    breadcrumbs.unshift({ id: folderResult.id, name: folderResult.name })
    currentId = folderResult.parentId
    depth++
  }

  return breadcrumbs
}

/**
 * Validate that a folder exists and belongs to the organization.
 *
 * @param organizationId - Organization context
 * @param folderId - Folder to validate
 * @returns True if folder is valid
 */
export async function validateEmailTemplateFolder(
  organizationId: string,
  folderId: string
): Promise<boolean> {
  const folder = await prisma.emailTemplateFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
      deletedAt: null,
    },
    select: { id: true },
  })

  return !!folder
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update a folder's name or color.
 *
 * @param input - Update input
 * @param userId - Optional user ID for activity logging
 * @returns Updated folder
 * @throws Error if folder not found
 */
export async function updateEmailTemplateFolder(
  input: UpdateFolderInput,
  userId?: string
): Promise<EmailTemplateFolder> {
  const { organizationId, folderId, name, color } = input

  const existing = await prisma.emailTemplateFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!existing) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (color !== undefined) data.color = color

  const folder = await prisma.emailTemplateFolder.update({
    where: { id: folderId },
    data,
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'email_template_folder',
      entityId: folder.id,
    })
  }

  return folder
}

/**
 * Move a folder to a new parent.
 *
 * @param organizationId - Organization context
 * @param folderId - Folder to move
 * @param newParentId - New parent folder (null for root)
 * @param userId - Optional user ID for activity logging
 * @returns Updated folder
 * @throws Error if folder not found or would create circular reference
 */
export async function moveEmailTemplateFolder(
  organizationId: string,
  folderId: string,
  newParentId: string | null,
  userId?: string
): Promise<EmailTemplateFolder> {
  const existing = await prisma.emailTemplateFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!existing) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  // Can't move folder into itself
  if (newParentId === folderId) {
    throw new Error('Cannot move folder into itself')
  }

  // Verify new parent exists (if specified)
  if (newParentId) {
    const newParent = await prisma.emailTemplateFolder.findFirst({
      where: {
        id: newParentId,
        organizationId,
        deletedAt: null,
      },
    })

    if (!newParent) {
      throw new Error(`Target folder not found: ${newParentId}`)
    }

    // Check for circular reference - can't move folder into its own descendant
    let checkId: string | null = newParentId
    let depth = 0
    while (checkId && depth < 10) {
      if (checkId === folderId) {
        throw new Error('Cannot move folder into its own descendant')
      }
      const checkFolderResult: { parentId: string | null } | null =
        await prisma.emailTemplateFolder.findUnique({
          where: { id: checkId },
          select: { parentId: true },
        })
      checkId = checkFolderResult?.parentId ?? null
      depth++
    }
  }

  const folder = await prisma.emailTemplateFolder.update({
    where: { id: folderId },
    data: { parentId: newParentId },
  })

  // Log activity if userId is provided (moving is an update action)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'email_template_folder',
      entityId: folder.id,
    })
  }

  return folder
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Soft delete a folder.
 * Templates in the folder are moved to root (folderId set to null).
 * Child folders are also soft deleted.
 *
 * @param organizationId - Organization context
 * @param folderId - Folder to delete
 * @param userId - Optional user ID for activity logging
 * @throws Error if folder not found
 */
export async function deleteEmailTemplateFolder(
  organizationId: string,
  folderId: string,
  userId?: string
): Promise<void> {
  const existing = await prisma.emailTemplateFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
      deletedAt: null,
    },
    include: {
      children: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  })

  if (!existing) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  const now = new Date()

  // Use transaction to ensure consistency
  await prisma.$transaction([
    // Move templates to root
    prisma.emailTemplate.updateMany({
      where: {
        folderId,
        organizationId,
        deletedAt: null,
      },
      data: { folderId: null },
    }),
    // Soft delete child folders recursively
    ...(await getDescendantFolderIds(organizationId, folderId)).map((id) =>
      prisma.emailTemplateFolder.update({
        where: { id },
        data: { deletedAt: now },
      })
    ),
    // Soft delete the folder itself
    prisma.emailTemplateFolder.update({
      where: { id: folderId },
      data: { deletedAt: now },
    }),
  ])

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'email_template_folder',
      entityId: folderId,
    })
  }
}

/**
 * Get all descendant folder IDs (recursive).
 * Helper for cascading soft delete.
 */
async function getDescendantFolderIds(
  organizationId: string,
  folderId: string
): Promise<string[]> {
  const children = await prisma.emailTemplateFolder.findMany({
    where: {
      parentId: folderId,
      organizationId,
      deletedAt: null,
    },
    select: { id: true },
  })

  const ids: string[] = []
  for (const child of children) {
    ids.push(child.id)
    const descendants = await getDescendantFolderIds(organizationId, child.id)
    ids.push(...descendants)
  }

  return ids
}
