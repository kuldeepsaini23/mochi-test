/**
 * Email Templates tRPC Router
 *
 * API endpoints for email template and folder CRUD operations.
 * Used by the email template builder UI to manage templates.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailTemplatesRouter, TemplateAPI, TemplateFolderAPI
 *
 * TEMPLATE ENDPOINTS:
 * - list: Get paginated list of templates with search and folder filter
 * - getById: Get single template by ID
 * - create: Create new template
 * - update: Update existing template
 * - delete: Soft delete template
 * - duplicate: Copy an existing template
 * - move: Move template to a different folder
 *
 * FOLDER ENDPOINTS:
 * - listFolders: Get folders in a parent (or root)
 * - createFolder: Create new folder
 * - updateFolder: Update folder name/color
 * - deleteFolder: Delete folder (moves templates to root)
 * - moveFolder: Move folder to different parent
 * - getFolderBreadcrumb: Get navigation path for folder
 * - getAllFolders: Get all folders (for move dialog tree)
 *
 * PERMISSIONS:
 * - EMAIL_TEMPLATES_READ: Required for list, getById, listFolders, getFolderBreadcrumb
 * - EMAIL_TEMPLATES_CREATE: Required for create, duplicate, createFolder
 * - EMAIL_TEMPLATES_UPDATE: Required for update, move, updateFolder, moveFolder
 * - EMAIL_TEMPLATES_DELETE: Required for delete, deleteFolder
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
  createEmailTemplate,
  getEmailTemplateById,
  listEmailTemplates,
  updateEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
  moveEmailTemplate,
  previewTemplate,
  sendTestEmail,
} from '@/services/email-template.service'
import { buildVariableContext } from '@/lib/variables/context-builder'
import {
  createEmailTemplateFolder,
  listEmailTemplateFolders,
  getAllEmailTemplateFolders,
  getEmailTemplateFolderBreadcrumb,
  updateEmailTemplateFolder,
  moveEmailTemplateFolder,
  deleteEmailTemplateFolder,
  validateEmailTemplateFolder,
} from '@/services/email-template-folder.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for a single email block.
 * Validates the structure of blocks in template content.
 *
 * Includes all block types:
 * - Basic: heading, text, button, image, divider, columns
 * - Composite: list, pricing-card, testimonial-card, feature-card, stats-card, alert-card, countdown-timer, social-proof
 *
 * NOTE: Spacer is deprecated - use marginTop/marginBottom on blocks instead.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailBlockSchema, BlockValidation
 */
const emailBlockSchema = z.object({
  id: z.string(),
  type: z.enum([
    // Basic blocks
    'heading',
    'text',
    'button',
    'image',
    'divider',
    'spacer', // Deprecated but kept for backwards compatibility
    'columns',
    // Composite blocks
    'list',
    'pricing-card',
    'testimonial-card',
    'feature-card',
    'stats-card',
    'alert-card',
    'countdown-timer',
    'social-proof',
  ]),
  props: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Gradient stop schema for email gradients.
 * SOURCE OF TRUTH KEYWORDS: GradientStopSchema
 */
const gradientStopSchema = z.object({
  id: z.string(),
  color: z.string(),
  position: z.number().min(0).max(100),
})

/**
 * Gradient config schema for email backgrounds.
 * SOURCE OF TRUTH KEYWORDS: GradientConfigSchema
 */
const gradientConfigSchema = z.object({
  type: z.enum(['linear', 'radial']),
  stops: z.array(gradientStopSchema).min(2),
  angle: z.number().min(0).max(360).optional(),
  radialShape: z.enum(['circle', 'ellipse']).optional(),
  radialPosition: z.object({ x: z.number(), y: z.number() }).optional(),
})

/**
 * Schema for email canvas/container settings.
 * Supports both solid colors and gradients for backgrounds.
 * SOURCE OF TRUTH KEYWORDS: EmailSettingsSchema
 */
const emailSettingsSchema = z.object({
  bodyBackgroundColor: z.string(),
  bodyBackgroundGradient: gradientConfigSchema.optional(),
  containerBackgroundColor: z.string(),
  containerBackgroundGradient: gradientConfigSchema.optional(),
  containerPadding: z.number(),
  containerBorderRadius: z.number(),
  containerMaxWidth: z.number(),
})

// ============================================================================
// TEMPLATE SCHEMAS
// ============================================================================

/**
 * Schema for listing templates with pagination and folder filter.
 */
export const listEmailTemplatesSchema = z.object({
  organizationId: z.string(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  folderId: z.string().nullable().optional(), // null = root, undefined = all
})

/**
 * Schema for getting a single template.
 */
export const getEmailTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
})

/**
 * Schema for creating a new template.
 */
export const createEmailTemplateSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500).optional(),
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(200, 'Subject must be 200 characters or less'),
  content: z.array(emailBlockSchema).min(1, 'At least one block is required'),
  emailSettings: emailSettingsSchema.optional(),
  folderId: z.string().nullable().optional(),
})

/**
 * Schema for updating a template.
 */
export const updateEmailTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  subject: z.string().min(1).max(200).optional(),
  content: z.array(emailBlockSchema).min(1).optional(),
  emailSettings: emailSettingsSchema.optional(),
  folderId: z.string().nullable().optional(),
})

/**
 * Schema for deleting a template.
 */
export const deleteEmailTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
})

/**
 * Schema for duplicating a template.
 */
export const duplicateEmailTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
})

/**
 * Schema for moving a template to a folder.
 */
export const moveEmailTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
  folderId: z.string().nullable(), // null = move to root
})

/**
 * Schema for previewing a template.
 */
export const previewEmailTemplateSchema = z.object({
  blocks: z.array(emailBlockSchema).min(1),
  subject: z.string(),
})

/**
 * Schema for fetching real variable context for a lead.
 * Used by email builder preview to show REAL lead data.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadVariableContextSchema, TestLeadContextSchema
 */
export const getLeadVariableContextSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
})

/**
 * Schema for sending a test email with the current template.
 * Uses real lead data for variable interpolation.
 *
 * SOURCE OF TRUTH KEYWORDS: SendTestEmailSchema, TestEmailSchema
 */
export const sendTestEmailSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
  subject: z.string().min(1, 'Subject is required'),
  blocks: z.array(emailBlockSchema).min(1, 'At least one block is required'),
  emailSettings: emailSettingsSchema.optional(),
})

// ============================================================================
// FOLDER SCHEMAS
// ============================================================================

/**
 * Schema for listing folders.
 */
export const listFoldersSchema = z.object({
  organizationId: z.string(),
  parentId: z.string().nullable().optional(), // null = root folders
  search: z.string().optional(),
})

/**
 * Schema for creating a folder.
 */
export const createFolderSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  parentId: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

/**
 * Schema for updating a folder.
 */
export const updateFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
})

/**
 * Schema for deleting a folder.
 */
export const deleteFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for moving a folder.
 */
export const moveFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
  newParentId: z.string().nullable(), // null = move to root
})

/**
 * Schema for getting folder breadcrumb.
 */
export const getFolderBreadcrumbSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for validating a folder exists.
 */
export const validateFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for getting all folders (for tree view).
 */
export const getAllFoldersSchema = z.object({
  organizationId: z.string(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const emailTemplatesRouter = createTRPCRouter({
  // ==========================================================================
  // TEMPLATE ENDPOINTS
  // ==========================================================================

  /**
   * List email templates with pagination, search, and folder filter.
   */
  list: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(listEmailTemplatesSchema)
    .query(async ({ input }) => {
      return await listEmailTemplates(input)
    }),

  /**
   * Get a single email template by ID.
   */
  getById: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(getEmailTemplateSchema)
    .query(async ({ input }) => {
      const template = await getEmailTemplateById(input.organizationId, input.templateId)

      if (!template) {
        throw createStructuredError('NOT_FOUND', 'Email template not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Email template not found',
        })
      }

      return template
    }),

  /**
   * Create a new email template.
   *
   * FEATURE GATE: email_templates.limit
   * Checks organization's template limit before creating, increments usage after success
   */
  /** Feature-gated: email_templates.limit checked at procedure level before handler runs */
  create: organizationProcedure({
    requirePermission: permissions.EMAIL_TEMPLATES_CREATE,
    requireFeature: 'email_templates.limit',
  })
    .input(createEmailTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const template = await createEmailTemplate({
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
          subject: input.subject,
          content: input.content as unknown as import('@/types/email-templates').EmailBlock[],
          emailSettings: input.emailSettings as import('@/types/email-templates').EmailSettings | undefined,
          folderId: input.folderId,
        })

        // Increment usage after successful creation
        await incrementUsageAndInvalidate(ctx, input.organizationId, 'email_templates.limit')

        return template
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create template'
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Update an existing email template.
   */
  update: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_UPDATE })
    .input(updateEmailTemplateSchema)
    .mutation(async ({ input }) => {
      try {
        return await updateEmailTemplate({
          organizationId: input.organizationId,
          templateId: input.templateId,
          name: input.name,
          description: input.description ?? undefined,
          subject: input.subject,
          content: input.content as unknown as
            | import('@/types/email-templates').EmailBlock[]
            | undefined,
          emailSettings: input.emailSettings as import('@/types/email-templates').EmailSettings | undefined,
          folderId: input.folderId,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update template'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Email template not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Email template not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Delete (soft delete) an email template.
   *
   * FEATURE GATE: email_templates.limit
   * Decrements usage after successful deletion to free up quota
   */
  delete: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_DELETE })
    .input(deleteEmailTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteEmailTemplate(input.organizationId, input.templateId)

        // Decrement usage after successful deletion
        await decrementUsageAndInvalidate(ctx, input.organizationId, 'email_templates.limit')

        return { success: true, message: 'Email template deleted successfully' }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete template'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Email template not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Email template not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Duplicate an existing email template.
   *
   * FEATURE GATE: email_templates.limit
   * Duplicating creates a new template, so we need to check the limit
   */
  /** Feature-gated: email_templates.limit checked at procedure level before handler runs */
  duplicate: organizationProcedure({
    requirePermission: permissions.EMAIL_TEMPLATES_CREATE,
    requireFeature: 'email_templates.limit',
  })
    .input(duplicateEmailTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const template = await duplicateEmailTemplate(input.organizationId, input.templateId)

        // Increment usage after successful duplication
        await incrementUsageAndInvalidate(ctx, input.organizationId, 'email_templates.limit')

        return template
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to duplicate template'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Email template not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Email template not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Move a template to a different folder.
   */
  move: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_UPDATE })
    .input(moveEmailTemplateSchema)
    .mutation(async ({ input }) => {
      try {
        return await moveEmailTemplate(input.organizationId, input.templateId, input.folderId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to move template'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Preview a template without saving.
   */
  preview: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(previewEmailTemplateSchema)
    .mutation(async ({ input }) => {
      try {
        return await previewTemplate(
          input.blocks as unknown as import('@/types/email-templates').EmailBlock[],
          input.subject
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to preview template'
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Get REAL variable context for a lead.
   *
   * WHY: Email builder preview needs real lead data (custom fields, transactions,
   * organization info, etc.) instead of hardcoded sample data.
   *
   * HOW: Uses buildVariableContext to fetch all real data from the database.
   *
   * This endpoint is called when a test lead is selected in the email builder.
   * The returned context contains REAL data for:
   * - Lead info (name, email, address, etc.)
   * - Custom data fields (all custom values for this lead)
   * - Transactions (payment history if any)
   * - Submissions (form submissions if any)
   * - Organization info (name, logo, domain)
   * - Current datetime
   *
   * SOURCE OF TRUTH KEYWORDS: GetLeadVariableContext, TestLeadRealData
   */
  getLeadVariableContext: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(getLeadVariableContextSchema)
    .query(async ({ input }) => {
      try {
        const context = await buildVariableContext(
          input.organizationId,
          input.leadId,
          {
            includeAllTransactions: true,
            includeAllSubmissions: true,
          }
        )
        return context
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch lead context'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Lead not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Lead not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Send a test email to a lead with the current template.
   *
   * WHY: Allows users to test their email template with real lead data
   * before sending to actual recipients.
   *
   * HOW:
   * 1. Renders the template blocks to HTML
   * 2. Fetches real variable context for the lead
   * 3. Interpolates variables in subject and HTML
   * 4. Sends via Resend with [TEST] prefix in subject
   *
   * SECURITY: Requires EMAIL_TEMPLATES_READ permission
   *
   * SOURCE OF TRUTH KEYWORDS: SendTestEmailEndpoint, TestEmailAPI
   */
  sendTestEmail: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(sendTestEmailSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await sendTestEmail({
          organizationId: input.organizationId,
          leadId: input.leadId,
          subject: input.subject,
          blocks: input.blocks as import('@/types/email-templates').EmailBlock[],
          emailSettings: input.emailSettings,
        })

        if (!result.success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: result.error ?? 'Failed to send test email',
          })
        }

        return { success: true, messageId: result.messageId }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        const message = error instanceof Error ? error.message : 'Failed to send test email'
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  // ==========================================================================
  // FOLDER ENDPOINTS
  // ==========================================================================

  /**
   * List folders in a parent (or root).
   */
  listFolders: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(listFoldersSchema)
    .query(async ({ input }) => {
      return await listEmailTemplateFolders(input)
    }),

  /**
   * Get all folders for tree view (move dialog).
   */
  getAllFolders: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(getAllFoldersSchema)
    .query(async ({ input }) => {
      return await getAllEmailTemplateFolders(input.organizationId)
    }),

  /**
   * Get folder breadcrumb for navigation.
   */
  getFolderBreadcrumb: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(getFolderBreadcrumbSchema)
    .query(async ({ input }) => {
      return await getEmailTemplateFolderBreadcrumb(input.organizationId, input.folderId)
    }),

  /**
   * Validate that a folder exists.
   */
  validateFolder: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_READ })
    .input(validateFolderSchema)
    .query(async ({ input }) => {
      return await validateEmailTemplateFolder(input.organizationId, input.folderId)
    }),

  /**
   * Create a new folder.
   */
  createFolder: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_CREATE })
    .input(createFolderSchema)
    .mutation(async ({ input }) => {
      try {
        return await createEmailTemplateFolder({
          organizationId: input.organizationId,
          name: input.name,
          parentId: input.parentId,
          color: input.color,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create folder'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Parent folder not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Parent folder not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Update a folder's name or color.
   */
  updateFolder: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_UPDATE })
    .input(updateFolderSchema)
    .mutation(async ({ input }) => {
      try {
        return await updateEmailTemplateFolder({
          organizationId: input.organizationId,
          folderId: input.folderId,
          name: input.name,
          color: input.color,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update folder'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Folder not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Folder not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Move a folder to a different parent.
   */
  moveFolder: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_UPDATE })
    .input(moveFolderSchema)
    .mutation(async ({ input }) => {
      try {
        return await moveEmailTemplateFolder(
          input.organizationId,
          input.folderId,
          input.newParentId
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to move folder'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        if (message.includes('Cannot move')) {
          throw createStructuredError('BAD_REQUEST', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Delete a folder (templates moved to root).
   */
  deleteFolder: organizationProcedure({ requirePermission: permissions.EMAIL_TEMPLATES_DELETE })
    .input(deleteFolderSchema)
    .mutation(async ({ input }) => {
      try {
        await deleteEmailTemplateFolder(input.organizationId, input.folderId)
        return { success: true, message: 'Folder deleted successfully' }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete folder'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Folder not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Folder not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),
})
