/**
 * Contract Folder Service
 *
 * Data Access Layer (DAL) for contract folder organization.
 * Handles CRUD operations for nested folder structure (same pattern as EmailTemplateFolder).
 *
 * SOURCE OF TRUTH KEYWORDS: ContractFolderService, ContractFolderDAL, ContractFolderCRUD
 *
 * ARCHITECTURE:
 * - Self-referencing relation for nested folders (ContractFolderHierarchy)
 * - HARD DELETE only (no soft delete)
 * - Breadcrumb generation for folder navigation
 * - On folder delete: contracts are moved to root, child folders are hard-deleted
 */

import { prisma } from '@/lib/config'
import type { ContractFolder } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Folder with contract and children counts for display.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractFolderWithCount
 */
export interface ContractFolderWithCount extends ContractFolder {
  _count: {
    contracts: number
    children: number
  }
}

/**
 * Breadcrumb item for folder navigation UI.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractFolderBreadcrumb
 */
export interface ContractFolderBreadcrumb {
  id: string
  name: string
}

// ============================================================================
// LIST
// ============================================================================

/**
 * List contract folders at a given level.
 * When parentId is provided, lists children of that folder.
 * When parentId is null/undefined, lists root-level folders.
 * Includes counts of contracts and child folders for UI display.
 *
 * @param organizationId - Organization context
 * @param parentId - Parent folder ID (null/undefined for root-level folders)
 * @returns Array of folders with contract and children counts
 */
export async function listContractFolders(
  organizationId: string,
  parentId?: string | null
): Promise<ContractFolderWithCount[]> {
  const folders = await prisma.contractFolder.findMany({
    where: {
      organizationId,
      parentId: parentId ?? null,
    },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          contracts: true,
          children: true,
        },
      },
    },
  })

  return folders as ContractFolderWithCount[]
}

// ============================================================================
// GET ALL (FLAT LIST)
// ============================================================================

/**
 * Get all contract folders as a flat list for "move to" dialogs.
 * Returns all folders in the organization regardless of nesting level,
 * with counts for building a folder tree in the UI.
 *
 * @param organizationId - Organization context
 * @returns All folders in the organization with counts
 */
export async function getAllContractFolders(
  organizationId: string
): Promise<ContractFolderWithCount[]> {
  const folders = await prisma.contractFolder.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          contracts: true,
          children: true,
        },
      },
    },
  })

  return folders as ContractFolderWithCount[]
}

// ============================================================================
// BREADCRUMB
// ============================================================================

/**
 * Get breadcrumb path for a folder by walking up the parent chain.
 * Used for folder navigation in the contracts list view.
 * Max depth of 10 levels to prevent infinite loops from circular references.
 *
 * @param folderId - Starting folder
 * @returns Array of breadcrumb items ordered root -> ... -> current
 */
export async function getContractFolderBreadcrumb(
  folderId: string
): Promise<ContractFolderBreadcrumb[]> {
  const breadcrumbs: ContractFolderBreadcrumb[] = []
  let currentId: string | null = folderId
  let depth = 0

  // Walk up the parent chain, collecting breadcrumb items
  while (currentId && depth < 10) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.contractFolder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      })

    if (!folder) break

    // Prepend to build root -> ... -> current order
    breadcrumbs.unshift({ id: folder.id, name: folder.name })
    currentId = folder.parentId
    depth++
  }

  return breadcrumbs
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new contract folder.
 * Validates parent folder exists if parentId is specified.
 *
 * @param organizationId - Organization context
 * @param data - Folder creation data (name, color, parentId)
 * @returns Created folder
 * @throws Error if parent folder not found
 */
export async function createContractFolder(
  organizationId: string,
  data: { name: string; color?: string | null; parentId?: string | null }
): Promise<ContractFolder> {
  // Validate parent folder exists if provided
  if (data.parentId) {
    const parent = await prisma.contractFolder.findFirst({
      where: { id: data.parentId, organizationId },
    })
    if (!parent) {
      throw new Error(`Parent folder not found: ${data.parentId}`)
    }
  }

  return await prisma.contractFolder.create({
    data: {
      organizationId,
      name: data.name,
      color: data.color ?? null,
      parentId: data.parentId ?? null,
    },
  })
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update a contract folder's name or color.
 * Only updates fields that are explicitly provided.
 *
 * @param id - Folder ID
 * @param organizationId - Organization context for access control
 * @param data - Fields to update (name, color)
 * @returns Updated folder
 * @throws Error if folder not found
 */
export async function updateContractFolder(
  id: string,
  organizationId: string,
  data: { name?: string; color?: string | null }
): Promise<ContractFolder> {
  // Verify the folder exists and belongs to this organization
  const existing = await prisma.contractFolder.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract folder not found: ${id}`)
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.color !== undefined) updateData.color = data.color

  return await prisma.contractFolder.update({
    where: { id },
    data: updateData,
  })
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Permanently delete a contract folder (HARD DELETE).
 * Before deleting, moves all contracts in this folder to root (folderId = null).
 * Also hard-deletes all descendant folders (cascading delete).
 *
 * @param id - Folder ID
 * @param organizationId - Organization context for access control
 * @throws Error if folder not found
 */
export async function deleteContractFolder(
  id: string,
  organizationId: string
): Promise<void> {
  // Verify the folder exists
  const existing = await prisma.contractFolder.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract folder not found: ${id}`)
  }

  // Collect all descendant folder IDs for cascading delete
  const descendantIds = await getDescendantFolderIds(organizationId, id)

  // Use a transaction to ensure atomicity:
  // 1. Move all contracts from this folder and descendants to root
  // 2. Delete all descendant folders
  // 3. Delete this folder
  await prisma.$transaction([
    // Move contracts from this folder to root
    prisma.contract.updateMany({
      where: { folderId: id, organizationId },
      data: { folderId: null },
    }),
    // Move contracts from descendant folders to root
    ...(descendantIds.length > 0
      ? [
          prisma.contract.updateMany({
            where: { folderId: { in: descendantIds }, organizationId },
            data: { folderId: null },
          }),
        ]
      : []),
    // Delete descendant folders (children first doesn't matter since we use IDs)
    ...(descendantIds.length > 0
      ? [
          prisma.contractFolder.deleteMany({
            where: { id: { in: descendantIds } },
          }),
        ]
      : []),
    // Delete this folder
    prisma.contractFolder.delete({
      where: { id },
    }),
  ])
}

/**
 * Recursively collect all descendant folder IDs.
 * Used for cascading hard delete of nested folders.
 *
 * @param organizationId - Organization context
 * @param folderId - Parent folder to start from
 * @returns Array of all descendant folder IDs
 */
async function getDescendantFolderIds(
  organizationId: string,
  folderId: string
): Promise<string[]> {
  const children = await prisma.contractFolder.findMany({
    where: { parentId: folderId, organizationId },
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

// ============================================================================
// MOVE
// ============================================================================

/**
 * Move a contract folder to a new parent.
 * Validates the move won't create a circular reference
 * (e.g., can't move a folder into its own descendant).
 *
 * @param id - Folder ID to move
 * @param organizationId - Organization context for access control
 * @param parentId - New parent folder ID (null to move to root)
 * @returns Updated folder
 * @throws Error if folder not found, moving into itself, or circular reference
 */
export async function moveContractFolder(
  id: string,
  organizationId: string,
  parentId: string | null
): Promise<ContractFolder> {
  // Verify the folder exists
  const existing = await prisma.contractFolder.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract folder not found: ${id}`)
  }

  // Can't move folder into itself
  if (parentId === id) {
    throw new Error('Cannot move folder into itself')
  }

  // If moving to a parent, verify it exists and check for circular reference
  if (parentId) {
    const newParent = await prisma.contractFolder.findFirst({
      where: { id: parentId, organizationId },
    })

    if (!newParent) {
      throw new Error(`Target folder not found: ${parentId}`)
    }

    // Walk up from the target parent to check for circular reference
    let checkId: string | null = parentId
    let depth = 0
    while (checkId && depth < 10) {
      if (checkId === id) {
        throw new Error('Cannot move folder into its own descendant')
      }
      const checkFolder: { parentId: string | null } | null =
        await prisma.contractFolder.findUnique({
          where: { id: checkId },
          select: { parentId: true },
        })
      checkId = checkFolder?.parentId ?? null
      depth++
    }
  }

  return await prisma.contractFolder.update({
    where: { id },
    data: { parentId },
  })
}
