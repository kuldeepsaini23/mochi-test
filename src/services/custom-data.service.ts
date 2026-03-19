/**
 * Custom Data Service (DAL)
 *
 * Data Access Layer for custom data operations (datasets/categories, fields, responses).
 * This is the ONLY place that should interact with Prisma for custom data.
 *
 * tRPC routers call these functions after security checks.
 * Trigger tools must call tRPC endpoints (not this service directly).
 */

import { prisma } from '@/lib/config'
import { CustomDataFieldType, Prisma } from '@/generated/prisma'
import { logActivity, logActivities } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

export type DatasetCreateInput = {
  organizationId: string
  name: string
  description?: string | null
  icon?: string | null
  order?: number
}

export type DatasetUpdateInput = {
  name?: string
  slug?: string
  description?: string | null
  icon?: string | null
  order?: number
}

export type FieldCreateInput = {
  categoryId: string
  name: string
  label: string
  fieldType: CustomDataFieldType
  required?: boolean
  placeholder?: string | null
  helpText?: string | null
  defaultValue?: string | null
  validation?: Record<string, unknown> | null
  options?: string[] | null
  order?: number
}

export type FieldUpdateInput = {
  name?: string
  slug?: string
  label?: string
  fieldType?: CustomDataFieldType
  required?: boolean
  placeholder?: string | null
  helpText?: string | null
  defaultValue?: string | null
  validation?: Record<string, unknown> | null
  options?: string[] | null
  order?: number
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate URL-friendly slug from name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ============================================================================
// DATASET (CATEGORY) CRUD
// ============================================================================

/**
 * Check if dataset slug exists
 */
export async function checkDatasetSlugExists(
  organizationId: string,
  slug: string,
  excludeDatasetId?: string
): Promise<boolean> {
  const existing = await prisma.customDataCategory.findFirst({
    where: {
      organizationId,
      slug,
      deletedAt: null,
      ...(excludeDatasetId && { id: { not: excludeDatasetId } }),
    },
    select: { id: true },
  })
  return !!existing
}

/**
 * List all datasets for organization
 */
export async function listDatasets(organizationId: string, includeLeadCounts = false) {
  const categories = await prisma.customDataCategory.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      order: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          fields: {
            where: {
              deletedAt: null,
            },
          },
          ...(includeLeadCounts && {
            responses: true,
          }),
        },
      },
    },
    orderBy: {
      order: 'asc',
    },
  })

  return categories.map(category => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    icon: category.icon,
    order: category.order,
    fieldsCount: category._count.fields,
    leadsCount: includeLeadCounts ? (category._count as { responses?: number }).responses || 0 : undefined,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }))
}

/**
 * Get dataset by ID
 */
export async function getDatasetById(organizationId: string, datasetId: string) {
  return await prisma.customDataCategory.findFirst({
    where: {
      id: datasetId,
      organizationId,
      deletedAt: null,
    },
    include: {
      fields: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  })
}

/**
 * Get dataset by name
 */
export async function getDatasetByName(organizationId: string, name: string) {
  return await prisma.customDataCategory.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
    },
    include: {
      fields: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  })
}

/**
 * Get dataset by slug
 */
export async function getDatasetBySlug(organizationId: string, slug: string) {
  return await prisma.customDataCategory.findFirst({
    where: {
      organizationId,
      slug,
      deletedAt: null,
    },
    include: {
      fields: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  })
}

/**
 * Create a new dataset
 *
 * @param input - Dataset creation data
 * @param userId - Optional user ID for activity logging
 */
export async function createDataset(input: DatasetCreateInput, userId?: string) {
  const slug = generateSlug(input.name)

  const dataset = await prisma.customDataCategory.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      slug,
      description: input.description,
      icon: input.icon,
      order: input.order ?? 0,
    },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'custom_data',
      entityId: dataset.id,
    })
  }

  return dataset
}

/**
 * Update a dataset
 *
 * SECURITY: Requires organizationId to prevent cross-tenant updates.
 * Uses compound WHERE clause to ensure dataset belongs to organization.
 *
 * @param organizationId - Organization ID for ownership verification and activity logging
 * @param datasetId - Dataset ID to update
 * @param data - Update data
 * @param userId - Optional user ID for activity logging
 */
export async function updateDataset(
  organizationId: string,
  datasetId: string,
  data: DatasetUpdateInput,
  userId?: string
) {
  const updateData: Prisma.CustomDataCategoryUpdateInput = {}

  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.description !== undefined) updateData.description = data.description
  if (data.icon !== undefined) updateData.icon = data.icon
  if (data.order !== undefined) updateData.order = data.order

  // SECURITY: Validate dataset belongs to organization before updating
  const dataset = await prisma.customDataCategory.update({
    where: {
      id: datasetId,
      organizationId, // Defense-in-depth: ensures tenant isolation
      deletedAt: null,
    },
    data: updateData,
    include: {
      _count: {
        select: {
          fields: {
            where: {
              deletedAt: null,
            },
          },
        },
      },
    },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'custom_data',
      entityId: dataset.id,
    })
  }

  return dataset
}

/**
 * Hard delete a dataset and all its fields + responses.
 *
 * SECURITY: Requires organizationId to prevent cross-tenant deletion.
 * Uses a transaction to cascade-delete responses → fields → category atomically.
 *
 * @param organizationId - Organization ID for ownership verification and activity logging
 * @param datasetId - Dataset ID to delete
 * @param userId - Optional user ID for activity logging
 */
export async function deleteDataset(
  organizationId: string,
  datasetId: string,
  userId?: string
) {
  return await prisma.$transaction(async (tx) => {
    // SECURITY: Validate dataset belongs to organization before deleting
    const dataset = await tx.customDataCategory.findFirst({
      where: {
        id: datasetId,
        organizationId, // Defense-in-depth: ensures tenant isolation
        deletedAt: null,
      },
    })

    if (!dataset) {
      throw new Error('Dataset not found or not accessible')
    }

    // Cascade: delete all responses for this category
    await tx.customDataResponse.deleteMany({
      where: { categoryId: datasetId },
    })

    // Cascade: delete all fields in this category
    await tx.customDataField.deleteMany({
      where: { categoryId: datasetId },
    })

    // Delete the category itself
    await tx.customDataCategory.delete({
      where: { id: datasetId },
    })

    // Log activity for audit trail
    if (userId) {
      setImmediate(() => {
        logActivity({
          userId,
          organizationId,
          action: 'delete',
          entity: 'custom_data',
          entityId: datasetId,
        })
      })
    }

    return dataset
  })
}

/**
 * Reorder datasets
 *
 * SECURITY: Uses organizationId in WHERE clause for each update.
 * Ensures only datasets belonging to the organization can be reordered.
 */
export async function reorderDatasets(
  organizationId: string,
  orders: Array<{ categoryId: string; order: number }>
) {
  // SECURITY: Each update validates dataset belongs to organization
  await Promise.all(
    orders.map(co =>
      prisma.customDataCategory.update({
        where: {
          id: co.categoryId,
          organizationId, // Defense-in-depth: ensures tenant isolation
          deletedAt: null,
        },
        data: { order: co.order },
      })
    )
  )
}

/**
 * Verify all dataset IDs belong to organization
 */
export async function verifyDatasetOwnership(
  organizationId: string,
  datasetIds: string[]
): Promise<boolean> {
  const datasets = await prisma.customDataCategory.findMany({
    where: {
      id: { in: datasetIds },
      organizationId,
      deletedAt: null,
    },
    select: { id: true },
  })
  return datasets.length === datasetIds.length
}

// ============================================================================
// FIELD CRUD
// ============================================================================

/**
 * Check if field slug exists in category
 */
export async function checkFieldSlugExists(
  categoryId: string,
  slug: string,
  excludeFieldId?: string
): Promise<boolean> {
  const existing = await prisma.customDataField.findFirst({
    where: {
      categoryId,
      slug,
      deletedAt: null,
      ...(excludeFieldId && { id: { not: excludeFieldId } }),
    },
    select: { id: true },
  })
  return !!existing
}

/**
 * List fields for a dataset
 */
export async function listFields(categoryId: string) {
  return await prisma.customDataField.findMany({
    where: {
      categoryId,
      deletedAt: null,
    },
    orderBy: {
      order: 'asc',
    },
  })
}

/**
 * Get field by ID
 */
export async function getFieldById(organizationId: string, fieldId: string) {
  return await prisma.customDataField.findFirst({
    where: {
      id: fieldId,
      deletedAt: null,
      category: {
        organizationId,
        deletedAt: null,
      },
    },
    include: {
      category: true,
    },
  })
}

/**
 * Create a new field
 *
 * @param organizationId - Organization ID for activity logging
 * @param input - Field creation data
 * @param userId - Optional user ID for activity logging
 */
export async function createField(
  organizationId: string,
  input: FieldCreateInput,
  userId?: string
) {
  const slug = generateSlug(input.name)

  const field = await prisma.customDataField.create({
    data: {
      categoryId: input.categoryId,
      name: input.name,
      slug,
      label: input.label,
      fieldType: input.fieldType,
      required: input.required ?? false,
      placeholder: input.placeholder,
      helpText: input.helpText,
      defaultValue: input.defaultValue,
      validation: input.validation as Prisma.InputJsonValue | undefined,
      options: input.options as Prisma.InputJsonValue | undefined,
      order: input.order ?? 0,
    },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'custom_data',
      entityId: field.id,
    })
  }

  return field
}

/**
 * Update a field
 *
 * SECURITY: Requires organizationId to prevent cross-tenant updates.
 * Uses a transaction to atomically validate and update, preventing TOCTOU attacks.
 * Validates field belongs to a category owned by the organization.
 *
 * @param organizationId - Organization ID for ownership verification and activity logging
 * @param fieldId - Field ID to update
 * @param data - Update data
 * @param userId - Optional user ID for activity logging
 */
export async function updateField(
  organizationId: string,
  fieldId: string,
  data: FieldUpdateInput,
  userId?: string
) {
  const updateData: Prisma.CustomDataFieldUpdateInput = {}

  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.label !== undefined) updateData.label = data.label
  if (data.fieldType !== undefined) updateData.fieldType = data.fieldType
  if (data.required !== undefined) updateData.required = data.required
  if (data.placeholder !== undefined) updateData.placeholder = data.placeholder
  if (data.helpText !== undefined) updateData.helpText = data.helpText
  if (data.defaultValue !== undefined) updateData.defaultValue = data.defaultValue
  if (data.validation !== undefined) {
    updateData.validation = (data.validation ?? undefined) as Prisma.InputJsonValue | undefined
  }
  if (data.options !== undefined) {
    updateData.options = (data.options ?? undefined) as Prisma.InputJsonValue | undefined
  }
  if (data.order !== undefined) updateData.order = data.order

  // SECURITY: Use transaction to atomically validate and update, preventing TOCTOU attacks.
  // This ensures the field still belongs to the organization at the moment of update.
  return await prisma.$transaction(async (tx) => {
    // Verify field belongs to organization's category
    const field = await tx.customDataField.findFirst({
      where: {
        id: fieldId,
        deletedAt: null,
        category: {
          organizationId, // Defense-in-depth: ensures tenant isolation
          deletedAt: null,
        },
      },
    })

    if (!field) {
      throw new Error('Field not found or not accessible')
    }

    const updatedField = await tx.customDataField.update({
      where: { id: fieldId },
      data: updateData,
    })

    // Log activity for audit trail (outside transaction to not block it)
    if (userId) {
      // Schedule logging after transaction completes
      setImmediate(async () => {
        logActivity({
          userId,
          organizationId,
          action: 'update',
          entity: 'custom_data',
          entityId: updatedField.id,
        })
      })
    }

    return updatedField
  })
}

/**
 * Hard delete a field.
 *
 * SECURITY: Requires organizationId to prevent cross-tenant deletion.
 * Validates field belongs to a category owned by the organization before deleting.
 *
 * @param organizationId - Organization ID for ownership verification and activity logging
 * @param fieldId - Field ID to delete
 * @param userId - Optional user ID for activity logging
 */
export async function deleteField(
  organizationId: string,
  fieldId: string,
  userId?: string
) {
  // SECURITY: First verify field belongs to organization's category
  const field = await prisma.customDataField.findFirst({
    where: {
      id: fieldId,
      deletedAt: null,
      category: {
        organizationId, // Defense-in-depth: ensures tenant isolation
        deletedAt: null,
      },
    },
  })

  if (!field) {
    throw new Error('Field not found or not accessible')
  }

  // Hard delete the field permanently
  await prisma.customDataField.delete({
    where: { id: fieldId },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'custom_data',
      entityId: fieldId,
    })
  }

  return field
}

/**
 * Reorder fields within a category
 *
 * SECURITY: Validates all fields belong to the organization's category.
 * Uses compound validation before performing bulk update.
 */
export async function reorderFields(
  organizationId: string,
  categoryId: string,
  orders: Array<{ fieldId: string; order: number }>
) {
  // SECURITY: First verify category belongs to organization
  const category = await prisma.customDataCategory.findFirst({
    where: {
      id: categoryId,
      organizationId, // Defense-in-depth: ensures tenant isolation
      deletedAt: null,
    },
  })

  if (!category) {
    throw new Error('Category not found or not accessible')
  }

  // SECURITY: Verify all field IDs belong to this category
  const fieldIds = orders.map(o => o.fieldId)
  const validFields = await prisma.customDataField.findMany({
    where: {
      id: { in: fieldIds },
      categoryId,
      deletedAt: null,
    },
    select: { id: true },
  })

  if (validFields.length !== fieldIds.length) {
    throw new Error('One or more fields do not belong to this category')
  }

  // Now safe to update
  await Promise.all(
    orders.map(fo =>
      prisma.customDataField.update({
        where: { id: fo.fieldId },
        data: { order: fo.order },
      })
    )
  )
}

/**
 * Verify all field IDs belong to category
 */
export async function verifyFieldOwnership(
  categoryId: string,
  fieldIds: string[]
): Promise<boolean> {
  const fields = await prisma.customDataField.findMany({
    where: {
      id: { in: fieldIds },
      categoryId,
      deletedAt: null,
    },
    select: { id: true },
  })
  return fields.length === fieldIds.length
}

// ============================================================================
// RESPONSES (LEAD CUSTOM DATA)
// ============================================================================

/**
 * Get all responses for a lead (latest version for each category)
 */
export async function getResponsesForLead(organizationId: string, leadId: string) {
  // Get all categories for this organization
  const categories = await prisma.customDataCategory.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    orderBy: {
      order: 'asc',
    },
  })

  // Get latest response for each category
  const responses = await Promise.all(
    categories.map(async category => {
      const response = await prisma.customDataResponse.findFirst({
        where: {
          leadId,
          categoryId: category.id,
        },
        orderBy: {
          version: 'desc',
        },
      })

      return {
        categoryId: category.id,
        categoryName: category.name,
        categorySlug: category.slug,
        categoryIcon: category.icon,
        values: response?.values || {},
        version: response?.version || 0,
        updatedAt: response?.updatedAt || null,
      }
    })
  )

  return responses
}

/**
 * Get response for a specific category + lead (with version history)
 */
export async function getResponseForCategory(
  leadId: string,
  categoryId: string
) {
  return await prisma.customDataResponse.findMany({
    where: {
      leadId,
      categoryId,
    },
    orderBy: {
      version: 'desc',
    },
  })
}

/**
 * Save/update response (creates new version)
 *
 * SECURITY: Requires organizationId to prevent cross-tenant data modification.
 * Validates both lead and category belong to the same organization.
 */
export async function saveResponse(
  organizationId: string,
  leadId: string,
  categoryId: string,
  values: Record<string, unknown>
) {
  // SECURITY: Validate lead belongs to organization
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      organizationId, // Defense-in-depth: ensures tenant isolation
      deletedAt: null,
    },
  })

  if (!lead) {
    throw new Error('Lead not found or not accessible')
  }

  // SECURITY: Validate category belongs to organization
  const category = await prisma.customDataCategory.findFirst({
    where: {
      id: categoryId,
      organizationId, // Defense-in-depth: ensures tenant isolation
      deletedAt: null,
    },
  })

  if (!category) {
    throw new Error('Category not found or not accessible')
  }

  // Get latest version number
  const latestResponse = await prisma.customDataResponse.findFirst({
    where: {
      leadId,
      categoryId,
    },
    orderBy: {
      version: 'desc',
    },
  })

  const newVersion = (latestResponse?.version || 0) + 1

  // Create new response version
  const response = await prisma.customDataResponse.create({
    data: {
      leadId,
      categoryId,
      values: values as Prisma.InputJsonValue,
      version: newVersion,
    },
  })

  // Update lead activity
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastActivityAt: new Date() },
  })

  return response
}

// ============================================================================
// LEAD-DATASET RELATIONSHIPS
// ============================================================================

/**
 * Get leads in a dataset (leads with responses for this category)
 */
export async function getLeadsInDataset(
  organizationId: string,
  categoryId: string,
  limit = 100
) {
  const responses = await prisma.customDataResponse.findMany({
    where: {
      categoryId,
      lead: {
        organizationId,
        deletedAt: null,
      },
    },
    select: {
      leadId: true,
    },
    distinct: ['leadId'],
    take: limit,
  })

  const leadIds = responses.map(r => r.leadId)

  if (leadIds.length === 0) return []

  return await prisma.lead.findMany({
    where: {
      id: { in: leadIds },
      deletedAt: null,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
  })
}

/**
 * Add leads to dataset (create empty responses)
 *
 * SECURITY: Requires organizationId to prevent cross-tenant data creation.
 * Validates category belongs to organization before adding leads.
 */
export async function addLeadsToDataset(
  organizationId: string,
  categoryId: string,
  leadIds: string[],
  customData?: Record<string, unknown>
) {
  // SECURITY: Validate category belongs to organization
  const category = await prisma.customDataCategory.findFirst({
    where: {
      id: categoryId,
      organizationId, // Defense-in-depth: ensures tenant isolation
      deletedAt: null,
    },
  })

  if (!category) {
    throw new Error('Category not found or not accessible')
  }

  // SECURITY: Validate all leads belong to organization
  const validLeads = await prisma.lead.findMany({
    where: {
      id: { in: leadIds },
      organizationId, // Defense-in-depth: ensures tenant isolation
      deletedAt: null,
    },
    select: { id: true },
  })

  const validLeadIds = new Set(validLeads.map(l => l.id))

  const results = []

  for (const leadId of leadIds) {
    // Skip leads that don't belong to organization
    if (!validLeadIds.has(leadId)) continue

    // Check if already has a response
    const existing = await prisma.customDataResponse.findFirst({
      where: {
        leadId,
        categoryId,
      },
    })

    if (!existing) {
      const response = await prisma.customDataResponse.create({
        data: {
          leadId,
          categoryId,
          values: (customData || {}) as Prisma.InputJsonValue,
          version: 1,
        },
      })
      results.push(response)
    }
  }

  return results
}

/**
 * Remove leads from dataset (delete all responses)
 *
 * SECURITY: Requires organizationId to prevent cross-tenant data deletion.
 * Validates category belongs to organization before removing leads.
 */
export async function removeLeadsFromDataset(
  organizationId: string,
  categoryId: string,
  leadIds: string[]
) {
  // SECURITY: Validate category belongs to organization
  const category = await prisma.customDataCategory.findFirst({
    where: {
      id: categoryId,
      organizationId, // Defense-in-depth: ensures tenant isolation
      deletedAt: null,
    },
  })

  if (!category) {
    throw new Error('Category not found or not accessible')
  }

  // SECURITY: Only delete responses for leads belonging to organization
  return await prisma.customDataResponse.deleteMany({
    where: {
      categoryId,
      leadId: { in: leadIds },
      lead: {
        organizationId, // Defense-in-depth: ensures tenant isolation
      },
    },
  })
}

/**
 * Get lead IDs by email addresses
 */
export async function getLeadIdsByEmails(organizationId: string, emails: string[]) {
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      email: { in: emails },
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
    },
  })
  return leads
}

/**
 * Get lead IDs by tag names
 */
export async function getLeadIdsByTags(organizationId: string, tagNames: string[]) {
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      deletedAt: null,
      tags: {
        some: {
          tag: {
            name: { in: tagNames },
            deletedAt: null,
          },
        },
      },
    },
    select: {
      id: true,
    },
  })
  return leads.map(l => l.id)
}

// ============================================================================
// TRANSFORM HELPERS
// ============================================================================

/**
 * Transform dataset to API response format
 */
export function transformDataset(
  dataset: Prisma.CustomDataCategoryGetPayload<{
    include: { fields: true }
  }>
) {
  return {
    id: dataset.id,
    name: dataset.name,
    slug: dataset.slug,
    description: dataset.description,
    icon: dataset.icon,
    order: dataset.order,
    fields: dataset.fields.map(field => ({
      id: field.id,
      categoryId: field.categoryId,
      name: field.name,
      slug: field.slug,
      label: field.label,
      fieldType: field.fieldType,
      required: field.required,
      placeholder: field.placeholder,
      helpText: field.helpText,
      defaultValue: field.defaultValue,
      validation: field.validation,
      options: field.options,
      order: field.order,
      createdAt: field.createdAt,
      updatedAt: field.updatedAt,
    })),
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
  }
}

/**
 * Transform field to API response format
 */
export function transformField(field: Prisma.CustomDataFieldGetPayload<object>) {
  return {
    id: field.id,
    categoryId: field.categoryId,
    name: field.name,
    slug: field.slug,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    placeholder: field.placeholder,
    helpText: field.helpText,
    defaultValue: field.defaultValue,
    validation: field.validation,
    options: field.options,
    order: field.order,
    createdAt: field.createdAt,
    updatedAt: field.updatedAt,
  }
}

// ============================================================================
// VARIABLE SEARCH
// Paginated search for custom data fields used by variable picker
// SOURCE OF TRUTH KEYWORDS: searchVariables, VariableSearch, CustomDataVariableSearch
// ============================================================================

export interface SearchVariablesInput {
  organizationId: string
  query: string
  cursor?: string
  limit?: number
}

export interface VariableSearchResult {
  id: string
  fieldSlug: string
  fieldLabel: string
  categoryId: string
  categoryName: string
  categorySlug: string
  /** Full variable key for interpolation: lead.customData.{fieldSlug} */
  variableKey: string
}

export interface SearchVariablesOutput {
  items: VariableSearchResult[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Search custom data fields by query string with cursor-based pagination.
 * Searches across field labels and slugs in all categories for the organization.
 * Returns results formatted for the variable picker component.
 *
 * @param input - Search parameters including query, cursor, and limit
 * @returns Paginated search results with variable keys
 */
export async function searchVariables(input: SearchVariablesInput): Promise<SearchVariablesOutput> {
  const { organizationId, query, cursor, limit = 20 } = input

  // Skip search if query is too short
  if (!query || query.trim().length < 2) {
    return { items: [], nextCursor: null, hasMore: false }
  }

  const searchTerm = query.trim().toLowerCase()

  /**
   * Fetch fields with their categories, filtering by search term.
   * We search in field label and slug for matches.
   * Cursor-based pagination using field ID.
   */
  const fields = await prisma.customDataField.findMany({
    where: {
      deletedAt: null,
      category: {
        organizationId,
        deletedAt: null,
      },
      OR: [
        { label: { contains: searchTerm, mode: 'insensitive' } },
        { slug: { contains: searchTerm, mode: 'insensitive' } },
        { name: { contains: searchTerm, mode: 'insensitive' } },
      ],
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [
      { category: { order: 'asc' } },
      { order: 'asc' },
      { id: 'asc' },
    ],
    take: limit + 1, // Fetch one extra to check if there are more
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // Skip the cursor item itself
    }),
  })

  // Check if there are more results
  const hasMore = fields.length > limit
  const itemsToReturn = hasMore ? fields.slice(0, limit) : fields

  // Transform to VariableSearchResult format
  const items: VariableSearchResult[] = itemsToReturn.map(field => ({
    id: field.id,
    fieldSlug: field.slug,
    fieldLabel: field.label,
    categoryId: field.category.id,
    categoryName: field.category.name,
    categorySlug: field.category.slug,
    variableKey: `lead.customData.${field.slug}`,
  }))

  // Determine next cursor
  const nextCursor = hasMore && itemsToReturn.length > 0
    ? itemsToReturn[itemsToReturn.length - 1].id
    : null

  return {
    items,
    nextCursor,
    hasMore,
  }
}
