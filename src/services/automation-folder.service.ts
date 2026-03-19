/**
 * Automation Folder Service
 *
 * Data Access Layer (DAL) for automation folder organization.
 * Handles CRUD operations for nested folder structure.
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationFolderService, AutomationFolderDAL
 *
 * ARCHITECTURE:
 * - Self-referencing relation for nested folders
 * - Hard delete (no soft delete per project guidelines)
 * - Breadcrumb generation for navigation
 */

import { prisma } from '@/lib/config'
import type { AutomationFolder } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Folder with automation and children counts for display
 */
export interface AutomationFolderWithCount extends AutomationFolder {
  _count: {
    automations: number
    children: number
  }
}

/**
 * Breadcrumb item for folder navigation
 */
export interface AutomationFolderBreadcrumb {
  id: string
  name: string
}

/**
 * Input for creating a folder
 */
export interface CreateAutomationFolderInput {
  organizationId: string
  name: string
  parentId?: string | null
  color?: string | null
}

/**
 * Input for updating a folder
 */
export interface UpdateAutomationFolderInput {
  organizationId: string
  folderId: string
  name?: string
  color?: string | null
}

/**
 * Input for listing folders
 */
export interface ListAutomationFoldersInput {
  organizationId: string
  parentId?: string | null
  search?: string
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new automation folder.
 *
 * Validates parent folder exists if specified.
 * Folders can be nested (parentId points to another folder).
 *
 * @param input - Folder creation input
 * @returns Created folder
 * @throws Error if parent folder not found
 */
export async function createAutomationFolder(
  input: CreateAutomationFolderInput
): Promise<AutomationFolder> {
  const { organizationId, name, parentId, color } = input

  // If parent specified, verify it exists and belongs to organization
  if (parentId) {
    const parent = await prisma.automationFolder.findFirst({
      where: {
        id: parentId,
        organizationId,
      },
    })
    if (!parent) {
      throw new Error(`Parent folder not found: ${parentId}`)
    }
  }

  return await prisma.automationFolder.create({
    data: {
      organizationId,
      name,
      parentId: parentId ?? null,
      color: color ?? null,
    },
  })
}

// ============================================================================
// READ
// ============================================================================

/**
 * Get a single folder by ID.
 *
 * @param organizationId - Organization context for security
 * @param folderId - Folder to fetch
 * @returns Folder or null if not found
 */
export async function getAutomationFolderById(
  organizationId: string,
  folderId: string
): Promise<AutomationFolder | null> {
  return await prisma.automationFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
    },
  })
}

/**
 * List folders with optional parent filter and search.
 *
 * When search is provided, searches across all folders (ignores parentId).
 * Otherwise, filters by parentId (null for root folders).
 *
 * @param input - List input with filters
 * @returns Array of folders with counts
 */
export async function listAutomationFolders(
  input: ListAutomationFoldersInput
): Promise<AutomationFolderWithCount[]> {
  const { organizationId, parentId, search } = input

  // Build where clause
  // If search is provided, search across all folders (ignore parentId)
  // Otherwise, filter by parentId (null for root folders)
  const where = {
    organizationId,
    ...(search
      ? {
          name: { contains: search, mode: 'insensitive' as const },
        }
      : {
          parentId: parentId ?? null,
        }),
  }

  const folders = await prisma.automationFolder.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          automations: true,
          children: true,
        },
      },
    },
  })

  return folders as AutomationFolderWithCount[]
}

/**
 * Get all folders for a folder tree (used for "move to" dialogs).
 *
 * Returns all folders in organization with counts for building
 * a hierarchical tree view.
 *
 * @param organizationId - Organization context
 * @returns All folders in organization with counts
 */
export async function getAllAutomationFolders(
  organizationId: string
): Promise<AutomationFolderWithCount[]> {
  const folders = await prisma.automationFolder.findMany({
    where: {
      organizationId,
    },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          automations: true,
          children: true,
        },
      },
    },
  })

  return folders as AutomationFolderWithCount[]
}

/**
 * Get breadcrumb path for a folder.
 *
 * Walks up the parent chain to build navigation path from root to current.
 * Max depth of 10 to prevent infinite loops in case of data corruption.
 *
 * @param organizationId - Organization context
 * @param folderId - Starting folder
 * @returns Array of breadcrumb items ordered from root to current
 */
export async function getAutomationFolderBreadcrumb(
  organizationId: string,
  folderId: string
): Promise<AutomationFolderBreadcrumb[]> {
  const breadcrumbs: AutomationFolderBreadcrumb[] = []
  let currentId: string | null = folderId

  // Walk up the parent chain (max 10 levels to prevent infinite loops)
  let depth = 0
  while (currentId && depth < 10) {
    const folderResult: { id: string; name: string; parentId: string | null } | null =
      await prisma.automationFolder.findFirst({
        where: {
          id: currentId,
          organizationId,
        },
        select: {
          id: true,
          name: true,
          parentId: true,
        },
      })

    if (!folderResult) break

    // Add to beginning of array (building from current up to root)
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
export async function validateAutomationFolder(
  organizationId: string,
  folderId: string
): Promise<boolean> {
  const folder = await prisma.automationFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
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
 * @returns Updated folder
 * @throws Error if folder not found
 */
export async function updateAutomationFolder(
  input: UpdateAutomationFolderInput
): Promise<AutomationFolder> {
  const { organizationId, folderId, name, color } = input

  const existing = await prisma.automationFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
    },
  })

  if (!existing) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  // Build update data only with provided fields
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (color !== undefined) data.color = color

  return await prisma.automationFolder.update({
    where: { id: folderId },
    data,
  })
}

/**
 * Move a folder to a new parent.
 *
 * Validates that the move won't create a circular reference
 * (folder can't be moved into itself or its descendants).
 *
 * @param organizationId - Organization context
 * @param folderId - Folder to move
 * @param newParentId - New parent folder (null for root)
 * @returns Updated folder
 * @throws Error if folder not found or would create circular reference
 */
export async function moveAutomationFolder(
  organizationId: string,
  folderId: string,
  newParentId: string | null
): Promise<AutomationFolder> {
  const existing = await prisma.automationFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
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
    const newParent = await prisma.automationFolder.findFirst({
      where: {
        id: newParentId,
        organizationId,
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
        await prisma.automationFolder.findUnique({
          where: { id: checkId },
          select: { parentId: true },
        })
      checkId = checkFolderResult?.parentId ?? null
      depth++
    }
  }

  return await prisma.automationFolder.update({
    where: { id: folderId },
    data: { parentId: newParentId },
  })
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Hard delete a folder.
 *
 * Process:
 * 1. Move all automations in this folder to root (folderId = null)
 * 2. Recursively delete all child folders
 * 3. Delete the folder itself
 *
 * @param organizationId - Organization context
 * @param folderId - Folder to delete
 * @throws Error if folder not found
 */
export async function deleteAutomationFolder(
  organizationId: string,
  folderId: string
): Promise<void> {
  const existing = await prisma.automationFolder.findFirst({
    where: {
      id: folderId,
      organizationId,
    },
    include: {
      children: {
        select: { id: true },
      },
    },
  })

  if (!existing) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  // Get all descendant folder IDs for cascading delete
  const descendantIds = await getDescendantFolderIds(organizationId, folderId)

  // Use transaction to ensure consistency
  await prisma.$transaction([
    // Move automations from this folder to root
    prisma.automation.updateMany({
      where: {
        folderId,
        organizationId,
      },
      data: { folderId: null },
    }),
    // Move automations from all descendant folders to root
    ...descendantIds.map((id) =>
      prisma.automation.updateMany({
        where: {
          folderId: id,
          organizationId,
        },
        data: { folderId: null },
      })
    ),
    // Delete all descendant folders
    ...descendantIds.map((id) =>
      prisma.automationFolder.delete({
        where: { id },
      })
    ),
    // Delete the folder itself
    prisma.automationFolder.delete({
      where: { id: folderId },
    }),
  ])
}

/**
 * Get all descendant folder IDs (recursive).
 *
 * Helper function for cascading delete operations.
 * Returns IDs in an order suitable for deletion (children before parents).
 *
 * @param organizationId - Organization context
 * @param folderId - Starting folder
 * @returns Array of descendant folder IDs
 */
async function getDescendantFolderIds(
  organizationId: string,
  folderId: string
): Promise<string[]> {
  const children = await prisma.automationFolder.findMany({
    where: {
      parentId: folderId,
      organizationId,
    },
    select: { id: true },
  })

  const ids: string[] = []
  for (const child of children) {
    // Get descendants first (for proper delete order)
    const descendants = await getDescendantFolderIds(organizationId, child.id)
    ids.push(...descendants)
    ids.push(child.id)
  }

  return ids
}

// ============================================================================
// MOVE AUTOMATIONS
// ============================================================================

/**
 * Move a single automation to a folder.
 *
 * @param organizationId - Organization context
 * @param automationId - Automation to move
 * @param folderId - Target folder (null for root)
 * @throws Error if automation not found or folder not found
 */
export async function moveAutomationToFolder(
  organizationId: string,
  automationId: string,
  folderId: string | null
): Promise<void> {
  // Verify automation exists and belongs to organization
  const automation = await prisma.automation.findFirst({
    where: {
      id: automationId,
      organizationId,
    },
    select: { id: true },
  })

  if (!automation) {
    throw new Error(`Automation not found: ${automationId}`)
  }

  // If folder specified, verify it exists
  if (folderId) {
    const folder = await prisma.automationFolder.findFirst({
      where: {
        id: folderId,
        organizationId,
      },
      select: { id: true },
    })

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`)
    }
  }

  await prisma.automation.update({
    where: { id: automationId },
    data: { folderId },
  })
}

/**
 * Move multiple automations to a folder.
 *
 * Bulk operation for moving multiple automations at once.
 *
 * @param organizationId - Organization context
 * @param automationIds - Automations to move
 * @param folderId - Target folder (null for root)
 * @throws Error if folder not found
 */
export async function bulkMoveAutomationsToFolder(
  organizationId: string,
  automationIds: string[],
  folderId: string | null
): Promise<void> {
  // If folder specified, verify it exists
  if (folderId) {
    const folder = await prisma.automationFolder.findFirst({
      where: {
        id: folderId,
        organizationId,
      },
      select: { id: true },
    })

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`)
    }
  }

  // Update all automations in a single query
  await prisma.automation.updateMany({
    where: {
      id: { in: automationIds },
      organizationId,
    },
    data: { folderId },
  })
}
