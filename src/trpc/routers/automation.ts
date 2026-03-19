/**
 * Automation tRPC Router
 *
 * API endpoints for automation workflow CRUD operations.
 * Used by the automation builder UI to create and manage automation workflows.
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationRouter, AutomationAPI, WorkflowAPI
 *
 * ENDPOINTS:
 * - list: Get paginated list of automations with search and status filter
 * - getById: Get single automation by ID with full schema
 * - create: Create new automation (starts as draft)
 * - update: Update automation name, description, schema, trigger config
 * - updateStatus: Change automation status (draft/active/paused/archived)
 * - delete: Hard delete automation (runs kept for audit)
 * - duplicate: Clone an existing automation
 * - listRuns: Get run history for an automation
 * - getRunById: Get single run details with step logs
 *
 * PERMISSIONS:
 * - AUTOMATIONS_READ: Required for list, getById, listRuns, getRunById
 * - AUTOMATIONS_CREATE: Required for create, duplicate
 * - AUTOMATIONS_UPDATE: Required for update, updateStatus
 * - AUTOMATIONS_DELETE: Required for delete
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { permissions } from '@/lib/better-auth/permissions'
import { ERROR_CODES } from '@/lib/errors'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import {
  getAutomationBySlug,
  updateAutomationSlug,
  listAutomations,
  getAutomationById,
  createAutomation,
  updateAutomation,
  updateAutomationStatus,
  deleteAutomation,
  bulkDeleteAutomations,
  duplicateAutomation,
  listAutomationRuns,
  getAutomationRunById,
} from '@/services/automation.service'
import {
  createAutomationFolder,
  listAutomationFolders,
  getAllAutomationFolders,
  getAutomationFolderBreadcrumb,
  updateAutomationFolder,
  deleteAutomationFolder,
  moveAutomationToFolder,
  bulkMoveAutomationsToFolder,
} from '@/services/automation-folder.service'

// NOTE: Types (AutomationStatus, AutomationTriggerType, AutomationRunStatus) will be available
// from '@/generated/prisma' after running `npx prisma generate`

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Valid automation trigger types matching Prisma enum.
 * SOURCE OF TRUTH: AutomationTriggerType enum in schema.prisma
 *
 * NOTE: APPOINTMENT_STARTED is deprecated from the UI but kept here
 * for backward compat with existing automations. New automations should
 * use APPOINTMENT_SCHEDULED + wait_for_event(appointment_started) instead.
 */
const automationTriggerTypeSchema = z.enum([
  'FORM_SUBMITTED',
  'PIPELINE_TICKET_MOVED',
  'PAYMENT_COMPLETED',
  'APPOINTMENT_SCHEDULED',
  'APPOINTMENT_STARTED', // DEPRECATED — kept for backward compat
  'TRIAL_STARTED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_CANCELLED',
])

/**
 * Valid automation status values matching Prisma enum.
 * SOURCE OF TRUTH: AutomationStatus enum in schema.prisma
 */
const automationStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'])

/**
 * Schema for React Flow node structure.
 * Validates the basic structure of automation nodes.
 * SOURCE OF TRUTH KEYWORDS: AutomationNodeSchema, ReactFlowNode
 */
const automationNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Schema for React Flow edge structure.
 * Validates the connections between nodes.
 * SOURCE OF TRUTH KEYWORDS: AutomationEdgeSchema, ReactFlowEdge
 */
const automationEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Schema for the complete automation workflow schema.
 * Contains nodes and edges from React Flow.
 * SOURCE OF TRUTH KEYWORDS: AutomationSchemaStructure, WorkflowSchema
 */
const automationSchemaSchema = z.object({
  nodes: z.array(automationNodeSchema).default([]),
  edges: z.array(automationEdgeSchema).default([]),
})

// ============================================================================
// LIST SCHEMAS
// ============================================================================

/**
 * Schema for listing automations with pagination and filters.
 */
export const listAutomationsSchema = z.object({
  organizationId: z.string(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: automationStatusSchema.optional(),
  triggerType: automationTriggerTypeSchema.optional(),
  folderId: z.string().nullable().optional(), // null = root, undefined = all
})

/**
 * Schema for getting a single automation by ID.
 */
export const getAutomationSchema = z.object({
  organizationId: z.string(),
  automationId: z.string(),
})

/**
 * Schema for getting a single automation by slug.
 * Slug is unique per organization.
 */
export const getAutomationBySlugSchema = z.object({
  organizationId: z.string(),
  slug: z.string().min(1, 'Slug is required'),
})

// ============================================================================
// CREATE/UPDATE SCHEMAS
// ============================================================================

/**
 * Schema for creating a new automation.
 * Automations start as DRAFT status by default.
 */
export const createAutomationSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500).optional(),
  triggerType: automationTriggerTypeSchema,
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  schema: automationSchemaSchema.optional(),
  folderId: z.string().nullable().optional(), // Optional folder assignment
})

/**
 * Schema for updating an automation.
 */
export const updateAutomationSchema = z.object({
  organizationId: z.string(),
  automationId: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  triggerType: automationTriggerTypeSchema.optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional().nullable(),
  schema: automationSchemaSchema.optional(),
})

/**
 * Schema for updating automation status.
 * Separate endpoint for status changes to allow specific validation.
 */
export const updateAutomationStatusSchema = z.object({
  organizationId: z.string(),
  automationId: z.string(),
  status: automationStatusSchema,
})

/**
 * Schema for updating automation slug.
 * Slug must be lowercase, alphanumeric with hyphens only.
 */
export const updateAutomationSlugSchema = z.object({
  organizationId: z.string(),
  automationId: z.string(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
})

/**
 * Schema for deleting an automation.
 */
export const deleteAutomationSchema = z.object({
  organizationId: z.string(),
  automationId: z.string(),
})

/**
 * Schema for bulk deleting automations.
 */
export const bulkDeleteAutomationsSchema = z.object({
  organizationId: z.string(),
  automationIds: z.array(z.string()).min(1, 'At least one automation ID is required'),
})

/**
 * Schema for duplicating an automation.
 */
export const duplicateAutomationSchema = z.object({
  organizationId: z.string(),
  automationId: z.string(),
})

// ============================================================================
// RUN HISTORY SCHEMAS
// ============================================================================

/**
 * Schema for listing automation runs.
 */
export const listAutomationRunsSchema = z.object({
  organizationId: z.string(),
  automationId: z.string().optional(), // Optional: if not provided, list all runs for org
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  status: z.enum(['PENDING', 'RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
})

/**
 * Schema for getting a single run.
 */
export const getAutomationRunSchema = z.object({
  organizationId: z.string(),
  runId: z.string(),
})

// ============================================================================
// FOLDER SCHEMAS
// ============================================================================

/**
 * Schema for listing automation folders.
 * parentId: null = root folders, undefined = all folders, string = children of specified folder
 */
export const listAutomationFoldersSchema = z.object({
  organizationId: z.string(),
  parentId: z.string().nullable().optional(),
  search: z.string().optional(),
})

/**
 * Schema for getting all folders (used for move dialog tree view).
 */
export const getAllAutomationFoldersSchema = z.object({
  organizationId: z.string(),
})

/**
 * Schema for creating an automation folder.
 */
export const createAutomationFolderSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  parentId: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #3B82F6)')
    .optional(),
})

/**
 * Schema for updating an automation folder.
 */
export const updateAutomationFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
})

/**
 * Schema for deleting an automation folder.
 */
export const deleteAutomationFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for getting folder breadcrumb navigation.
 */
export const getAutomationFolderBreadcrumbSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for moving a single automation to a folder.
 */
export const moveAutomationToFolderSchema = z.object({
  organizationId: z.string(),
  automationId: z.string(),
  folderId: z.string().nullable(), // null = move to root
})

/**
 * Schema for bulk moving automations to a folder.
 */
export const bulkMoveAutomationsToFolderSchema = z.object({
  organizationId: z.string(),
  automationIds: z.array(z.string()).min(1, 'At least one automation ID is required'),
  folderId: z.string().nullable(), // null = move to root
})

// ============================================================================
// ROUTER
// ============================================================================

export const automationRouter = createTRPCRouter({
  // ==========================================================================
  // AUTOMATION CRUD ENDPOINTS
  // ==========================================================================

  /**
   * List automations with pagination, search, and filters.
   * Supports folder filtering: folderId = null for root, folderId = string for specific folder
   */
  list: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_READ })
    .input(listAutomationsSchema)
    .query(async ({ input }) => {
      return await listAutomations({
        organizationId: input.organizationId,
        page: input.page,
        pageSize: input.pageSize,
        search: input.search,
        status: input.status,
        triggerType: input.triggerType,
        folderId: input.folderId,
      })
    }),

  /**
   * Get a single automation by ID with full schema.
   */
  getById: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_READ })
    .input(getAutomationSchema)
    .query(async ({ input }) => {
      const automation = await getAutomationById(input.organizationId, input.automationId)

      if (!automation) {
        throw createStructuredError('NOT_FOUND', 'Automation not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Automation not found',
        })
      }

      return automation
    }),

  /**
   * Get a single automation by slug with full schema.
   * Slug is unique per organization, used for URL-friendly routing.
   */
  getBySlug: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_READ })
    .input(getAutomationBySlugSchema)
    .query(async ({ input }) => {
      const automation = await getAutomationBySlug(input.organizationId, input.slug)

      if (!automation) {
        throw createStructuredError('NOT_FOUND', 'Automation not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Automation not found',
        })
      }

      return automation
    }),

  /**
   * Create a new automation.
   * Starts as DRAFT status by default.
   * Slug is auto-generated from the name.
   * Feature-gated: automations.limit checked at procedure level before handler runs.
   */
  create: organizationProcedure({
    requirePermission: permissions.AUTOMATIONS_CREATE,
    requireFeature: 'automations.limit',
  })
    .input(createAutomationSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await createAutomation({
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig,
        schema: input.schema,
        folderId: input.folderId,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'automations.limit')

      return result
    }),

  /**
   * Update an existing automation.
   */
  update: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_UPDATE })
    .input(updateAutomationSchema)
    .mutation(async ({ input }) => {
      const automation = await updateAutomation(
        input.organizationId,
        input.automationId,
        {
          name: input.name,
          description: input.description,
          triggerType: input.triggerType,
          triggerConfig: input.triggerConfig,
          schema: input.schema,
        }
      )

      if (!automation) {
        throw createStructuredError('NOT_FOUND', 'Automation not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Automation not found',
        })
      }

      return automation
    }),

  /**
   * Update automation status.
   * Validates that automation has valid configuration before activating.
   */
  updateStatus: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_UPDATE })
    .input(updateAutomationStatusSchema)
    .mutation(async ({ input }) => {
      const result = await updateAutomationStatus(
        input.organizationId,
        input.automationId,
        input.status
      )

      if (!result.found) {
        throw createStructuredError('NOT_FOUND', 'Automation not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Automation not found',
        })
      }

      if ('validationError' in result && result.validationError) {
        throw createStructuredError('BAD_REQUEST', 'Cannot activate automation without nodes', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: result.validationError,
        })
      }

      return result.automation
    }),

  /**
   * Update automation slug.
   * Validates uniqueness within organization before updating.
   */
  updateSlug: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_UPDATE })
    .input(updateAutomationSlugSchema)
    .mutation(async ({ input }) => {
      try {
        const automation = await updateAutomationSlug(
          input.organizationId,
          input.automationId,
          input.slug
        )
        return { slug: automation.slug }
      } catch (error) {
        if (error instanceof Error && error.message.includes('already in use')) {
          throw createStructuredError('BAD_REQUEST', error.message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: error.message,
          })
        }
        throw error
      }
    }),

  /**
   * Delete an automation (hard delete).
   * Runs are preserved for audit trail (automationId set to null).
   */
  delete: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_DELETE })
    .input(deleteAutomationSchema)
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteAutomation(input.organizationId, input.automationId)

      if (!deleted) {
        throw createStructuredError('NOT_FOUND', 'Automation not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Automation not found',
        })
      }

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, input.organizationId, 'automations.limit')

      return { success: true, message: 'Automation deleted successfully' }
    }),

  /**
   * Bulk delete multiple automations.
   * Returns the count of deleted automations.
   */
  bulkDelete: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_DELETE })
    .input(bulkDeleteAutomationsSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await bulkDeleteAutomations(input.organizationId, input.automationIds)

      if ('notFoundIds' in result) {
        const { notFoundIds } = result as { notFoundIds: string[] }
        throw createStructuredError('NOT_FOUND', 'Some automations not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: `Automations not found: ${notFoundIds.join(', ')}`,
        })
      }

      const deletedCount = (result as { count: number }).count

      // Decrement usage by the number of actually deleted automations
      if (deletedCount > 0) {
        await decrementUsageAndInvalidate(ctx, input.organizationId, 'automations.limit', deletedCount)
      }

      return { count: deletedCount }
    }),

  /**
   * Duplicate an existing automation.
   * Creates a copy with "(Copy)" appended to the name, status set to DRAFT.
   * Generates a new unique slug for the copy.
   * Feature-gated: automations.limit checked at procedure level before handler runs.
   */
  duplicate: organizationProcedure({
    requirePermission: permissions.AUTOMATIONS_CREATE,
    requireFeature: 'automations.limit',
  })
    .input(duplicateAutomationSchema)
    .mutation(async ({ ctx, input }) => {
      const automation = await duplicateAutomation(input.organizationId, input.automationId)

      if (!automation) {
        throw createStructuredError('NOT_FOUND', 'Automation not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Automation not found',
        })
      }

      // Increment usage after successful duplication
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'automations.limit')

      return automation
    }),

  // ==========================================================================
  // RUN HISTORY ENDPOINTS
  // ==========================================================================

  /**
   * List automation runs with pagination and filters.
   */
  listRuns: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_READ })
    .input(listAutomationRunsSchema)
    .query(async ({ input }) => {
      return await listAutomationRuns({
        organizationId: input.organizationId,
        automationId: input.automationId,
        page: input.page,
        pageSize: input.pageSize,
        status: input.status,
      })
    }),

  /**
   * Get a single run with full details including step logs.
   */
  getRunById: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_READ })
    .input(getAutomationRunSchema)
    .query(async ({ input }) => {
      const run = await getAutomationRunById(input.organizationId, input.runId)

      if (!run) {
        throw createStructuredError('NOT_FOUND', 'Automation run not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Automation run not found',
        })
      }

      return run
    }),

  // ==========================================================================
  // FOLDER ENDPOINTS
  // ==========================================================================

  /**
   * List folders in a parent folder (or root).
   * Returns folders with automation and children counts.
   */
  listFolders: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_READ })
    .input(listAutomationFoldersSchema)
    .query(async ({ input }) => {
      return await listAutomationFolders(input)
    }),

  /**
   * Get all folders for folder tree view (used in move dialog).
   * Returns all folders in organization for building hierarchical tree.
   */
  getAllFolders: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_READ })
    .input(getAllAutomationFoldersSchema)
    .query(async ({ input }) => {
      return await getAllAutomationFolders(input.organizationId)
    }),

  /**
   * Get breadcrumb navigation path for a folder.
   * Returns array of folders from root to the specified folder.
   */
  getFolderBreadcrumb: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_READ })
    .input(getAutomationFolderBreadcrumbSchema)
    .query(async ({ input }) => {
      return await getAutomationFolderBreadcrumb(input.organizationId, input.folderId)
    }),

  /**
   * Create a new folder.
   * Supports nested folders via parentId.
   */
  createFolder: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_CREATE })
    .input(createAutomationFolderSchema)
    .mutation(async ({ input }) => {
      return await createAutomationFolder(input)
    }),

  /**
   * Update a folder's name or color.
   */
  updateFolder: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_UPDATE })
    .input(updateAutomationFolderSchema)
    .mutation(async ({ input }) => {
      try {
        return await updateAutomationFolder(input)
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', error.message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: error.message,
          })
        }
        throw error
      }
    }),

  /**
   * Delete a folder (hard delete).
   * Automations are moved to root, child folders are deleted.
   */
  deleteFolder: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_DELETE })
    .input(deleteAutomationFolderSchema)
    .mutation(async ({ input }) => {
      try {
        await deleteAutomationFolder(input.organizationId, input.folderId)
        return { success: true, message: 'Folder deleted successfully' }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', error.message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: error.message,
          })
        }
        throw error
      }
    }),

  /**
   * Move a single automation to a folder.
   * Pass folderId = null to move to root.
   */
  moveToFolder: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_UPDATE })
    .input(moveAutomationToFolderSchema)
    .mutation(async ({ input }) => {
      try {
        await moveAutomationToFolder(input.organizationId, input.automationId, input.folderId)
        return { success: true, message: 'Automation moved successfully' }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', error.message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: error.message,
          })
        }
        throw error
      }
    }),

  /**
   * Bulk move multiple automations to a folder.
   * Pass folderId = null to move to root.
   */
  bulkMoveToFolder: organizationProcedure({ requirePermission: permissions.AUTOMATIONS_UPDATE })
    .input(bulkMoveAutomationsToFolderSchema)
    .mutation(async ({ input }) => {
      try {
        await bulkMoveAutomationsToFolder(
          input.organizationId,
          input.automationIds,
          input.folderId
        )
        return { success: true, count: input.automationIds.length }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', error.message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: error.message,
          })
        }
        throw error
      }
    }),
})
