/**
 * Custom Data Router
 *
 * tRPC router for custom data management (categories, fields, and responses).
 * Uses organizationProcedure for authorization.
 * All data access goes through custom-data.service.ts (DAL).
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { CustomDataFieldType } from '@/generated/prisma'
import * as customDataService from '@/services/custom-data.service'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS - Exported for use by AI tools (single source of truth)
// ============================================================================

// Category Schemas (Dataset = Category in the UI/API)
export const createCategorySchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  order: z.number().optional().default(0),
})

export const updateCategorySchema = z.object({
  organizationId: z.string(),
  categoryId: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  order: z.number().optional(),
})

export const getCategorySchema = z.object({
  organizationId: z.string(),
  categoryId: z.string(),
})

export const deleteCategorySchema = z.object({
  organizationId: z.string(),
  categoryId: z.string(),
})

export const listCategoriesSchema = z.object({
  organizationId: z.string(),
})

export const reorderCategoriesSchema = z.object({
  organizationId: z.string(),
  categoryOrders: z.array(
    z.object({
      categoryId: z.string(),
      order: z.number(),
    })
  ),
})

// Field Schemas
// IMPORTANT: Options must be string[] for SELECT/RADIO/MULTISELECT fields
// The frontend expects ["Option 1", "Option 2", "Option 3"] format
export const optionsSchema = z.array(z.string()).optional().nullable()

export const createFieldSchema = z.object({
  organizationId: z.string(),
  categoryId: z.string(),
  name: z.string().min(1, 'Field name is required'),
  label: z.string().min(1, 'Field label is required'),
  fieldType: z.nativeEnum(CustomDataFieldType),
  required: z.boolean().optional().default(false),
  placeholder: z.string().optional().nullable(),
  helpText: z.string().optional().nullable(),
  defaultValue: z.string().optional().nullable(),
  validation: z.record(z.string(), z.unknown()).optional().nullable(),
  options: optionsSchema,
  order: z.number().optional().default(0),
})

export const updateFieldSchema = z.object({
  organizationId: z.string(),
  fieldId: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  fieldType: z.nativeEnum(CustomDataFieldType).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional().nullable(),
  helpText: z.string().optional().nullable(),
  defaultValue: z.string().optional().nullable(),
  validation: z.record(z.string(), z.unknown()).optional().nullable(),
  options: optionsSchema,
  order: z.number().optional(),
})

export const reorderFieldsSchema = z.object({
  organizationId: z.string(),
  categoryId: z.string(),
  fieldOrders: z.array(
    z.object({
      fieldId: z.string(),
      order: z.number(),
    })
  ),
})

// Response Schemas
export const saveResponseSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
  categoryId: z.string(),
  values: z.record(z.string(), z.any()), // Dynamic field values
})

// Variable Search Schema
// SOURCE OF TRUTH KEYWORDS: searchVariablesSchema, VariableSearchInput
export const searchVariablesSchema = z.object({
  organizationId: z.string(),
  query: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
})

// ============================================================================
// ROUTER
// ============================================================================

export const customDataRouter = createTRPCRouter({
  // ==========================================================================
  // CATEGORIES
  // ==========================================================================

  /**
   * List all categories for organization (without fields)
   */
  listCategories: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const { organizationId } = input

      // listDatasets already returns transformed data with fieldsCount
      return await customDataService.listDatasets(organizationId)
    }),

  /**
   * Get single category with its fields
   */
  getCategory: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        categoryId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, categoryId } = input

      const category = await customDataService.getDatasetById(organizationId, categoryId)

      if (!category) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        order: category.order,
        fields: category.fields.map(customDataService.transformField),
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      }
    }),

  /**
   * Create a new category (CMS table / data set)
   *
   * FEATURE GATE: cms_tables.limit
   * Checks organization's CMS table limit before creating, increments usage after success.
   * SOURCE OF TRUTH: CmsTablesFeatureGate
   */
  /** Feature-gated: cms_tables.limit checked at procedure level before handler runs */
  createCategory: organizationProcedure({
    requirePermission: permissions.CUSTOM_FIELDS_CREATE,
    requireFeature: 'cms_tables.limit',
  })
    .input(createCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, name, description, icon, order } = input

      // Auto-generate slug from name
      const slug = customDataService.generateSlug(name)

      // Check for duplicate slug
      const slugExists = await customDataService.checkDatasetSlugExists(organizationId, slug)

      if (slugExists) {
        throw createStructuredError(
          'BAD_REQUEST',
          'A category with this name already exists',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'A category with this name already exists',
          }
        )
      }

      const category = await customDataService.createDataset({
        organizationId,
        name,
        description,
        icon,
        order,
      })

      /* Increment CMS table usage after successful creation */
      await incrementUsageAndInvalidate(ctx, organizationId, 'cms_tables.limit')

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        order: category.order,
        fieldsCount: 0,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      }
    }),

  /**
   * Update a category
   */
  updateCategory: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_UPDATE })
    .input(updateCategorySchema)
    .mutation(async ({ input }) => {
      const { organizationId, categoryId, name, slug, description, icon, order } = input

      // Verify category exists and belongs to organization
      const existing = await customDataService.getDatasetById(organizationId, categoryId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      // Auto-generate slug from name if name is being changed
      let newSlug = slug
      if (name && name !== existing.name && !slug) {
        newSlug = customDataService.generateSlug(name)
      }

      // Check for duplicate slug if slug is being changed
      if (newSlug && newSlug !== existing.slug) {
        const slugExists = await customDataService.checkDatasetSlugExists(
          organizationId,
          newSlug,
          categoryId
        )

        if (slugExists) {
          throw createStructuredError(
            'BAD_REQUEST',
            'A category with this slug already exists',
            {
              errorCode: ERROR_CODES.VALIDATION_ERROR,
              message: 'A category with this slug already exists',
            }
          )
        }
      }

      // SECURITY: Pass organizationId for defense-in-depth validation
      const category = await customDataService.updateDataset(organizationId, categoryId, {
        ...(name && { name }),
        ...(newSlug && { slug: newSlug }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
        ...(order !== undefined && { order }),
      })

      // Get field count
      const fields = await customDataService.listFields(categoryId)

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        order: category.order,
        fieldsCount: fields.length,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      }
    }),

  /**
   * Delete a category (hard delete)
   *
   * FEATURE GATE: cms_tables.limit
   * Decrements usage after successful deletion to free up quota.
   * SOURCE OF TRUTH: CmsTablesFeatureGate
   */
  deleteCategory: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_DELETE })
    .input(
      z.object({
        organizationId: z.string(),
        categoryId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, categoryId } = input

      // Verify category exists and belongs to organization
      const existing = await customDataService.getDatasetById(organizationId, categoryId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      // SECURITY: Pass organizationId for defense-in-depth validation
      await customDataService.deleteDataset(organizationId, categoryId)

      /* Decrement CMS table usage after successful deletion */
      await decrementUsageAndInvalidate(ctx, organizationId, 'cms_tables.limit')

      return { success: true, message: 'Category deleted' }
    }),

  /**
   * Reorder categories
   */
  reorderCategories: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_UPDATE })
    .input(reorderCategoriesSchema)
    .mutation(async ({ input }) => {
      const { organizationId, categoryOrders } = input

      // Verify all categories exist and belong to organization
      const categoryIds = categoryOrders.map(co => co.categoryId)
      const ownershipValid = await customDataService.verifyDatasetOwnership(
        organizationId,
        categoryIds
      )

      if (!ownershipValid) {
        throw createStructuredError('BAD_REQUEST', 'Invalid category IDs', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'One or more categories not found',
        })
      }

      await customDataService.reorderDatasets(organizationId, categoryOrders)

      return { success: true, message: 'Categories reordered' }
    }),

  // ==========================================================================
  // FIELDS
  // ==========================================================================

  /**
   * List fields for a category
   */
  listFields: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        categoryId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, categoryId } = input

      // Verify category exists and belongs to organization
      const category = await customDataService.getDatasetById(organizationId, categoryId)

      if (!category) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      const fields = await customDataService.listFields(categoryId)

      return fields.map(customDataService.transformField)
    }),

  /**
   * Get single field by id
   */
  getField: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        fieldId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, fieldId } = input

      const field = await customDataService.getFieldById(organizationId, fieldId)

      if (!field) {
        throw createStructuredError('NOT_FOUND', 'Field not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Field not found',
        })
      }

      return customDataService.transformField(field)
    }),

  /**
   * Create a new field
   */
  createField: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_CREATE })
    .input(createFieldSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        organizationId,
        categoryId,
        name,
        label,
        fieldType,
        required,
        placeholder,
        helpText,
        defaultValue,
        validation,
        options,
        order,
      } = input

      // Verify category exists and belongs to organization
      const category = await customDataService.getDatasetById(organizationId, categoryId)

      if (!category) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      // Auto-generate slug from name
      const slug = customDataService.generateSlug(name)

      // Check for duplicate slug in this category
      const slugExists = await customDataService.checkFieldSlugExists(categoryId, slug)

      if (slugExists) {
        throw createStructuredError(
          'BAD_REQUEST',
          'A field with this name already exists in this category',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'A field with this name already exists in this category',
          }
        )
      }

      const field = await customDataService.createField(
        organizationId,
        {
          categoryId,
          name,
          label,
          fieldType,
          required,
          placeholder,
          helpText,
          defaultValue,
          validation,
          options,
          order,
        },
        ctx.user.id
      )

      return customDataService.transformField(field)
    }),

  /**
   * Update a field
   */
  updateField: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_UPDATE })
    .input(updateFieldSchema)
    .mutation(async ({ input }) => {
      const {
        organizationId,
        fieldId,
        name,
        slug,
        label,
        fieldType,
        required,
        placeholder,
        helpText,
        defaultValue,
        validation,
        options,
        order,
      } = input

      // Verify field exists and belongs to organization
      const existing = await customDataService.getFieldById(organizationId, fieldId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Field not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Field not found',
        })
      }

      // Auto-generate slug from name if name is being changed
      let newSlug = slug
      if (name && name !== existing.name && !slug) {
        newSlug = customDataService.generateSlug(name)
      }

      // Check for duplicate slug if slug is being changed
      if (newSlug && newSlug !== existing.slug) {
        const slugExists = await customDataService.checkFieldSlugExists(
          existing.categoryId,
          newSlug,
          fieldId
        )

        if (slugExists) {
          throw createStructuredError(
            'BAD_REQUEST',
            'A field with this slug already exists in this category',
            {
              errorCode: ERROR_CODES.VALIDATION_ERROR,
              message: 'A field with this slug already exists in this category',
            }
          )
        }
      }

      // SECURITY: Pass organizationId for defense-in-depth validation
      const field = await customDataService.updateField(organizationId, fieldId, {
        ...(name && { name }),
        ...(newSlug && { slug: newSlug }),
        ...(label && { label }),
        ...(fieldType && { fieldType }),
        ...(required !== undefined && { required }),
        ...(placeholder !== undefined && { placeholder }),
        ...(helpText !== undefined && { helpText }),
        ...(defaultValue !== undefined && { defaultValue }),
        ...(validation !== undefined && { validation }),
        ...(options !== undefined && { options }),
        ...(order !== undefined && { order }),
      })

      return customDataService.transformField(field)
    }),

  /**
   * Delete a field (soft delete)
   */
  deleteField: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_DELETE })
    .input(
      z.object({
        organizationId: z.string(),
        fieldId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { organizationId, fieldId } = input

      // Verify field exists and belongs to organization
      const existing = await customDataService.getFieldById(organizationId, fieldId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Field not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Field not found',
        })
      }

      // SECURITY: Pass organizationId for defense-in-depth validation
      await customDataService.deleteField(organizationId, fieldId)

      return { success: true, message: 'Field deleted' }
    }),

  /**
   * Reorder fields within a category
   */
  reorderFields: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_UPDATE })
    .input(reorderFieldsSchema)
    .mutation(async ({ input }) => {
      const { organizationId, categoryId, fieldOrders } = input

      // Verify category exists and belongs to organization
      const category = await customDataService.getDatasetById(organizationId, categoryId)

      if (!category) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      // Verify all fields exist and belong to this category
      const fieldIds = fieldOrders.map(fo => fo.fieldId)
      const ownershipValid = await customDataService.verifyFieldOwnership(categoryId, fieldIds)

      if (!ownershipValid) {
        throw createStructuredError('BAD_REQUEST', 'Invalid field IDs', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'One or more fields not found',
        })
      }

      // SECURITY: Pass organizationId for defense-in-depth validation
      await customDataService.reorderFields(organizationId, categoryId, fieldOrders)

      return { success: true, message: 'Fields reordered' }
    }),

  // ==========================================================================
  // RESPONSES (LEAD CUSTOM DATA)
  // ==========================================================================

  /**
   * Get all responses for a lead (latest version for each category)
   */
  getResponsesForLead: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        leadId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, leadId } = input

      // Note: Lead validation happens in the service
      const responses = await customDataService.getResponsesForLead(organizationId, leadId)

      return responses
    }),

  /**
   * Get response for a specific category + lead (with version history)
   */
  getResponseForCategory: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        leadId: z.string(),
        categoryId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, leadId, categoryId } = input

      // Verify category exists and belongs to organization
      const category = await customDataService.getDatasetById(organizationId, categoryId)

      if (!category) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      // Get all versions of the response
      const responses = await customDataService.getResponseForCategory(leadId, categoryId)

      return {
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          icon: category.icon,
          fields: category.fields.map(customDataService.transformField),
        },
        responses: responses.map(response => ({
          id: response.id,
          values: response.values,
          version: response.version,
          createdAt: response.createdAt,
          updatedAt: response.updatedAt,
        })),
        currentResponse: responses[0] || null,
      }
    }),

  /**
   * Save/update response (creates new version)
   */
  saveResponse: organizationProcedure({ requirePermission: permissions.LEADS_UPDATE })
    .input(saveResponseSchema)
    .mutation(async ({ input }) => {
      const { organizationId, leadId, categoryId, values } = input

      // Verify category exists and belongs to organization
      const category = await customDataService.getDatasetById(organizationId, categoryId)

      if (!category) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      // SECURITY: Pass organizationId for defense-in-depth validation
      // Service validates both lead and category belong to organization
      const response = await customDataService.saveResponse(organizationId, leadId, categoryId, values)

      return {
        id: response.id,
        leadId: response.leadId,
        categoryId: response.categoryId,
        values: response.values,
        version: response.version,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
      }
    }),

  // ==========================================================================
  // VARIABLE SEARCH
  // Paginated search for custom data fields (used by variable picker)
  // SOURCE OF TRUTH KEYWORDS: searchVariables, VariablePickerSearch
  // ==========================================================================

  /**
   * Search custom data fields by query with pagination.
   * Returns results formatted for the variable picker component.
   * Uses cursor-based pagination for efficient infinite scroll.
   */
  searchVariables: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_READ })
    .input(searchVariablesSchema)
    .query(async ({ input }) => {
      const { organizationId, query, cursor, limit } = input

      return await customDataService.searchVariables({
        organizationId,
        query,
        cursor,
        limit,
      })
    }),

  /**
   * List rows (lead responses) in a dataset with their field values.
   * Returns leads with their latest custom data for the given category.
   * WHY: Mochi AI needs this to read dataset rows and display/update data.
   *
   * SOURCE OF TRUTH KEYWORDS: getDatasetRows, CmsRows
   */
  getDatasetRows: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        categoryId: z.string(),
        limit: z.number().min(1).max(100).optional().default(50),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, categoryId, limit } = input

      /**
       * Verify category belongs to org, then fetch leads with their
       * latest response version for this category.
       */
      const category = await customDataService.getDatasetById(organizationId, categoryId)
      if (!category) {
        throw createStructuredError('NOT_FOUND', 'Category not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Category not found',
        })
      }

      /** Get all leads in this dataset */
      const leads = await customDataService.getLeadsInDataset(organizationId, categoryId, limit)

      /**
       * For each lead, fetch their latest response (custom data values).
       * We use getResponseForCategory which returns version history.
       */
      const rows = await Promise.all(
        leads.map(async (lead) => {
          const responseData = await customDataService.getResponseForCategory(lead.id, categoryId)
          const latestResponse = responseData[0] || null

          return {
            leadId: lead.id,
            leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email || 'Unknown',
            leadEmail: lead.email,
            values: (latestResponse?.values as Record<string, unknown>) || {},
            version: latestResponse?.version || 0,
            updatedAt: latestResponse?.updatedAt || lead.createdAt,
          }
        })
      )

      return {
        categoryId,
        categoryName: category.name,
        fields: category.fields.map((f) => ({
          id: f.id,
          slug: f.slug,
          label: f.label,
          fieldType: f.fieldType,
        })),
        rows,
        total: rows.length,
      }
    }),

  /**
   * Add leads to a dataset (category) by creating empty responses.
   * WHY: Mochi AI uses this to bulk-associate leads with custom data categories.
   * Validates category belongs to organization before adding (tenant isolation).
   */
  addLeadsToCategory: organizationProcedure({ requirePermission: permissions.CUSTOM_FIELDS_CREATE })
    .input(
      z.object({
        organizationId: z.string(),
        categoryId: z.string(),
        leadIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ input }) => {
      return await customDataService.addLeadsToDataset(
        input.organizationId,
        input.categoryId,
        input.leadIds
      )
    }),
})
