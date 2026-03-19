/**
 * ============================================================================
 * FORM SERVICE (DAL) - Form & Folder Operations
 * ============================================================================
 *
 * Data Access Layer for Form and FormFolder operations.
 * This is the ONLY place that should interact with Prisma for forms.
 *
 * ============================================================================
 * ARCHITECTURE: Organization → FormFolder (optional) → Form
 * ============================================================================
 *
 * Forms can be organized in nested folders (like Google Drive).
 * A form can exist at root level (no folder) or inside any folder.
 */

import 'server-only'
import { prisma } from '@/lib/config'
import type { FormStatus } from '@/generated/prisma'
import { logActivity, logActivities } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

export type FormCreateInput = {
  organizationId: string
  name: string
  description?: string | null
  slug: string
  folderId?: string | null
  /** Optional form config JSON containing elements, styles, settings (FormSchema) */
  config?: unknown
}

export type FormUpdateInput = {
  name?: string
  description?: string | null
  slug?: string
  folderId?: string | null
  status?: FormStatus
  config?: unknown
  submitButtonText?: string
  successMessage?: string
  redirectUrl?: string | null
  notifyEmails?: string[]
  enableCaptcha?: boolean
  submissionLimit?: number | null
}

export type ListFormsInput = {
  organizationId: string
  folderId?: string | null
  search?: string
  page?: number
  pageSize?: number
  status?: FormStatus
}

export type FormFolderCreateInput = {
  organizationId: string
  name: string
  parentId?: string | null
  color?: string | null
}

export type FormFolderUpdateInput = {
  name?: string
  color?: string | null
}

// ============================================================================
// FORM FOLDER OPERATIONS
// ============================================================================

/**
 * List all form folders for organization at a specific level.
 *
 * WHY: Provides folder listing for navigation UI.
 * HOW: Filters by parentId to get folders at specific level.
 */
export async function listFormFolders(input: {
  organizationId: string
  parentId?: string | null
  search?: string
}) {
  const { organizationId, parentId = null, search } = input

  const where = {
    organizationId,
    deletedAt: null,
    // If parentId is explicitly null, show root folders; otherwise show children
    parentId: parentId,
    ...(search && {
      name: { contains: search, mode: 'insensitive' as const },
    }),
  }

  const folders = await prisma.formFolder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          forms: true,
          children: {
            where: { deletedAt: null },
          },
        },
      },
    },
  })

  return folders
}

/**
 * Create a new form folder.
 *
 * WHY: Allows users to organize forms into categories.
 * HOW: Creates folder with optional parent for nesting support.
 *
 * @param input - Folder creation input data
 * @param userId - Optional userId for activity logging
 */
export async function createFormFolder(input: FormFolderCreateInput, userId?: string) {
  const { organizationId, name, parentId, color } = input

  // Build path based on parent
  let path = '/'
  if (parentId) {
    const parent = await prisma.formFolder.findUnique({
      where: { id: parentId },
      select: { path: true, name: true },
    })
    if (parent) {
      path = parent.path === '/' ? `/${parent.name}` : `${parent.path}/${parent.name}`
    }
  }

  const folder = await prisma.formFolder.create({
    data: {
      organizationId,
      name,
      parentId,
      path,
      color,
    },
  })

  // Log activity for folder creation
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'form',
      entityId: folder.id,
    })
  }

  return folder
}

/**
 * Update a form folder.
 *
 * @param organizationId - Organization the folder belongs to
 * @param folderId - ID of the folder to update
 * @param data - Updated folder data
 * @param userId - Optional userId for activity logging
 */
export async function updateFormFolder(
  organizationId: string,
  folderId: string,
  data: FormFolderUpdateInput,
  userId?: string
) {
  const folder = await prisma.formFolder.update({
    where: {
      id: folderId,
      organizationId,
      deletedAt: null,
    },
    data,
  })

  // Log activity for folder update
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'form',
      entityId: folder.id,
    })
  }

  return folder
}

/**
 * Delete a form folder (soft delete).
 * Moves forms in folder to root before deleting.
 *
 * @param organizationId - Organization the folder belongs to
 * @param folderId - ID of the folder to delete
 * @param userId - Optional userId for activity logging
 */
export async function deleteFormFolder(organizationId: string, folderId: string, userId?: string) {
  // Move forms in this folder to root before deleting folder
  await prisma.form.updateMany({
    where: {
      organizationId,
      folderId,
    },
    data: {
      folderId: null,
    },
  })

  // Soft delete the folder
  await prisma.formFolder.update({
    where: {
      id: folderId,
      organizationId,
    },
    data: {
      deletedAt: new Date(),
    },
  })

  // Log activity for folder deletion
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'form',
      entityId: folderId,
    })
  }

  return { success: true }
}

/**
 * Get folder breadcrumb for navigation.
 */
export async function getFormFolderBreadcrumb(
  organizationId: string,
  folderId: string
): Promise<{ id: string; name: string }[]> {
  const breadcrumb: { id: string; name: string }[] = []
  let currentId: string | null = folderId

  while (currentId) {
    const folderData: { id: string; name: string; parentId: string | null } | null =
      await prisma.formFolder.findFirst({
        where: { id: currentId, organizationId, deletedAt: null },
        select: { id: true, name: true, parentId: true },
      })

    if (!folderData) break

    breadcrumb.unshift({ id: folderData.id, name: folderData.name })
    currentId = folderData.parentId
  }

  return breadcrumb
}

// ============================================================================
// FORM CRUD OPERATIONS
// ============================================================================

/**
 * List forms for organization with pagination and filtering.
 *
 * WHY: Provides paginated access to forms with folder filtering.
 * HOW: Uses Prisma pagination with optional folder and search filters.
 */
export async function listForms(input: ListFormsInput) {
  const {
    organizationId,
    folderId,
    search,
    page = 1,
    pageSize = 10,
    status,
  } = input

  // Build where clause
  const where = {
    organizationId,
    // Handle folderId filtering - null means root level
    ...(folderId !== undefined && { folderId }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
        { slug: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  // Get total count
  const total = await prisma.form.count({ where })

  // Get paginated forms
  const forms = await prisma.form.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      folder: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
      _count: {
        select: {
          submissions: true,
        },
      },
    },
  })

  return {
    forms,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get a single form by ID.
 */
export async function getFormById(organizationId: string, formId: string) {
  return await prisma.form.findFirst({
    where: {
      id: formId,
      organizationId,
    },
    include: {
      folder: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
      _count: {
        select: {
          submissions: true,
        },
      },
    },
  })
}

/**
 * Get a single form by slug.
 *
 * WHY: Forms are accessed by slug in the URL for SEO-friendly routes.
 * HOW: Uses the unique organizationId_slug index for efficient lookup.
 */
export async function getFormBySlug(organizationId: string, slug: string) {
  return await prisma.form.findUnique({
    where: {
      organizationId_slug: {
        organizationId,
        slug,
      },
    },
    include: {
      folder: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
      _count: {
        select: {
          submissions: true,
        },
      },
    },
  })
}

/**
 * Create a new form.
 *
 * WHY: Allows users to create new forms for data collection.
 * HOW: Creates form with optional folder assignment.
 *
 * SECURITY: Validates folderId belongs to the organization to prevent
 * cross-organization folder assignment (IDOR vulnerability fix).
 *
 * @param input - Form creation input data
 * @param userId - Optional userId for activity logging
 */
export async function createForm(input: FormCreateInput, userId?: string) {
  const { organizationId, name, description, slug, folderId, config } = input

  // SECURITY: Validate folderId belongs to this organization if provided
  if (folderId) {
    const folder = await prisma.formFolder.findFirst({
      where: {
        id: folderId,
        organizationId,
      },
    })

    if (!folder) {
      throw new Error('Folder not found')
    }
  }

  // Check for slug uniqueness within organization
  const existing = await prisma.form.findUnique({
    where: {
      organizationId_slug: {
        organizationId,
        slug,
      },
    },
  })

  if (existing) {
    throw new Error('A form with this slug already exists')
  }

  const form = await prisma.form.create({
    data: {
      organizationId,
      name,
      description,
      slug,
      folderId,
      ...(config ? { config } : {}),
    },
    include: {
      folder: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  })

  // Log activity for form creation
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'form',
      entityId: form.id,
    })
  }

  return form
}

/**
 * Update a form.
 *
 * SECURITY: Validates folderId belongs to the organization to prevent
 * cross-organization folder assignment (IDOR vulnerability fix).
 *
 * @param organizationId - Organization the form belongs to
 * @param formId - ID of the form to update
 * @param data - Updated form data
 * @param userId - Optional userId for activity logging
 */
export async function updateForm(
  organizationId: string,
  formId: string,
  data: FormUpdateInput,
  userId?: string
) {
  // If updating slug, check for uniqueness
  if (data.slug) {
    const existing = await prisma.form.findFirst({
      where: {
        organizationId,
        slug: data.slug,
        id: { not: formId },
      },
    })

    if (existing) {
      throw new Error('A form with this slug already exists')
    }
  }

  // SECURITY: Validate folderId belongs to this organization if provided
  if (data.folderId !== undefined && data.folderId !== null) {
    const folder = await prisma.formFolder.findFirst({
      where: {
        id: data.folderId,
        organizationId,
      },
    })

    if (!folder) {
      throw new Error('Folder not found')
    }
  }

  // Build update data, filtering out undefined values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {}

  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.folderId !== undefined) updateData.folderId = data.folderId
  if (data.status !== undefined) updateData.status = data.status
  if (data.config !== undefined) updateData.config = data.config
  if (data.submitButtonText !== undefined) updateData.submitButtonText = data.submitButtonText
  if (data.successMessage !== undefined) updateData.successMessage = data.successMessage
  if (data.redirectUrl !== undefined) updateData.redirectUrl = data.redirectUrl
  if (data.notifyEmails !== undefined) updateData.notifyEmails = data.notifyEmails
  if (data.enableCaptcha !== undefined) updateData.enableCaptcha = data.enableCaptcha
  if (data.submissionLimit !== undefined) updateData.submissionLimit = data.submissionLimit

  const form = await prisma.form.update({
    where: {
      id: formId,
      organizationId,
    },
    data: updateData,
    include: {
      folder: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  })

  // Log activity for form update
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'form',
      entityId: form.id,
    })
  }

  return form
}

/**
 * Delete a form (hard delete).
 * Also deletes all associated submissions.
 *
 * @param organizationId - Organization the form belongs to
 * @param formId - ID of the form to delete
 * @param userId - Optional userId for activity logging
 */
export async function deleteForm(organizationId: string, formId: string, userId?: string) {
  // Delete submissions first (cascade)
  await prisma.formSubmission.deleteMany({
    where: { formId },
  })

  // Delete the form
  await prisma.form.delete({
    where: {
      id: formId,
      organizationId,
    },
  })

  // Log activity for form deletion
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'form',
      entityId: formId,
    })
  }

  return { success: true }
}

/**
 * Bulk delete forms (hard delete).
 * Also deletes all associated submissions.
 *
 * @param organizationId - Organization the forms belong to
 * @param formIds - IDs of the forms to delete
 * @param userId - Optional userId for activity logging
 */
export async function bulkDeleteForms(organizationId: string, formIds: string[], userId?: string) {
  // Delete submissions first (cascade)
  await prisma.formSubmission.deleteMany({
    where: { formId: { in: formIds } },
  })

  // Delete the forms
  const result = await prisma.form.deleteMany({
    where: {
      id: { in: formIds },
      organizationId,
    },
  })

  // Log activities for bulk form deletion
  if (userId && formIds.length > 0) {
    logActivities(
      formIds.map((formId) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'form',
        entityId: formId,
      }))
    )
  }

  return { count: result.count }
}

/**
 * Move form to a different folder.
 *
 * SECURITY: Validates folderId belongs to the organization to prevent
 * cross-organization folder assignment (IDOR vulnerability fix).
 *
 * @param organizationId - Organization the form belongs to
 * @param formId - ID of the form to move
 * @param folderId - ID of the target folder (null for root)
 * @param userId - Optional userId for activity logging
 */
export async function moveFormToFolder(
  organizationId: string,
  formId: string,
  folderId: string | null,
  userId?: string
) {
  // SECURITY: Validate folderId belongs to this organization if provided
  if (folderId) {
    const folder = await prisma.formFolder.findFirst({
      where: {
        id: folderId,
        organizationId,
      },
    })

    if (!folder) {
      throw new Error('Folder not found')
    }
  }

  const form = await prisma.form.update({
    where: {
      id: formId,
      organizationId,
    },
    data: {
      folderId,
    },
  })

  // Log activity for form move (considered an update)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'form',
      entityId: form.id,
    })
  }

  return form
}

/**
 * Get a form by its slug for public viewing.
 *
 * WHY: Public form page needs to fetch form data without authentication.
 * HOW: Fetches form by slug, returns only if status is PUBLISHED.
 *
 * SECURITY: Only returns published forms. Draft/paused/archived forms
 * are not accessible publicly.
 *
 * NOTE: Slug is unique per organization, but since this is public,
 * we search globally. If multiple orgs have the same slug, this will
 * return the first match. Consider adding organization subdomain support.
 */
export async function getPublicFormBySlug(slug: string) {
  return await prisma.form.findFirst({
    where: {
      slug,
      status: 'PUBLISHED',
    },
    select: {
      id: true,
      name: true,
      slug: true,
      config: true,
      organization: {
        select: {
          id: true,
          name: true,
          logo: true,
        },
      },
    },
  })
}

/**
 * Generate a unique slug for a form.
 */
export async function generateUniqueSlug(
  organizationId: string,
  baseName: string
): Promise<string> {
  // Convert name to slug format
  let slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)

  // Check if slug exists
  let counter = 0
  let finalSlug = slug

  while (true) {
    const existing = await prisma.form.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug: finalSlug,
        },
      },
    })

    if (!existing) {
      return finalSlug
    }

    counter++
    finalSlug = `${slug}-${counter}`
  }
}
