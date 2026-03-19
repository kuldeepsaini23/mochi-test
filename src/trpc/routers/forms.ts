/**
 * ============================================================================
 * FORMS ROUTER - Form & Folder Operations
 * ============================================================================
 *
 * tRPC router for form and form folder management operations.
 * Supports nested folder organization like Google Drive.
 *
 * ARCHITECTURE: Organization → FormFolder (optional) → Form
 *
 * PERMISSIONS:
 * - FORMS_READ: List and view forms and folders
 * - FORMS_CREATE: Create new forms and folders
 * - FORMS_UPDATE: Edit forms and folders
 * - FORMS_DELETE: Delete forms and folders
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  baseProcedure,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import * as formService from '@/services/form.service'
import {
  listFormSubmissions,
  getFormSubmission,
  deleteFormSubmission,
} from '@/services/form-submission.service'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS - FOLDERS
// ============================================================================

/**
 * Schema for listing form folders
 */
export const listFormFoldersSchema = z.object({
  organizationId: z.string(),
  parentId: z.string().nullable().optional(),
  search: z.string().optional(),
})

/**
 * Schema for creating a form folder
 */
export const createFormFolderSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Folder name is required').max(100),
  parentId: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
})

/**
 * Schema for updating a form folder
 */
export const updateFormFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
  name: z.string().min(1).max(100).optional(),
  color: z.string().nullable().optional(),
})

/**
 * Schema for deleting a form folder
 */
export const deleteFormFolderSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for getting folder breadcrumb
 */
export const getFolderBreadcrumbSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

// ============================================================================
// INPUT SCHEMAS - FORMS
// ============================================================================

/**
 * Schema for listing forms with pagination
 */
export const listFormsSchema = z.object({
  organizationId: z.string(),
  folderId: z.string().nullable().optional(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED']).optional(),
})

/**
 * Schema for getting a single form by ID
 */
export const getFormSchema = z.object({
  organizationId: z.string(),
  formId: z.string(),
})

/**
 * Schema for getting a single form by slug
 */
export const getFormBySlugSchema = z.object({
  organizationId: z.string(),
  slug: z.string(),
})

/**
 * Schema for creating a new form
 */
export const createFormSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Form name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Slug must be lowercase, start/end with letter or number'
    )
    .optional(),
  folderId: z.string().nullable().optional(),
})

/**
 * Schema for updating a form.
 * Includes config for storing the form builder schema (elements, styles, settings).
 */
export const updateFormSchema = z.object({
  organizationId: z.string(),
  formId: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Slug must be lowercase, start/end with letter or number'
    )
    .optional(),
  folderId: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED']).optional(),
  /** Form builder schema (elements, styles, settings) stored as JSON */
  config: z.unknown().optional(),
})

/**
 * Schema for deleting a form
 */
export const deleteFormSchema = z.object({
  organizationId: z.string(),
  formId: z.string(),
})

/**
 * Schema for bulk deleting forms
 */
export const bulkDeleteFormsSchema = z.object({
  organizationId: z.string(),
  formIds: z.array(z.string()).min(1),
})

/**
 * Schema for moving form to folder
 */
export const moveFormSchema = z.object({
  organizationId: z.string(),
  formId: z.string(),
  folderId: z.string().nullable(),
})

// ============================================================================
// INPUT SCHEMAS - FORM SUBMISSIONS
// ============================================================================

/**
 * Schema for listing form submissions with filters and pagination.
 * Supports filtering by form, search by lead email/name, and date range.
 */
export const listSubmissionsSchema = z.object({
  organizationId: z.string(),
  formId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
})

/**
 * Schema for getting a single form submission by ID
 */
export const getSubmissionSchema = z.object({
  organizationId: z.string(),
  submissionId: z.string(),
})

/**
 * Schema for deleting a form submission by ID
 */
export const deleteSubmissionSchema = z.object({
  organizationId: z.string(),
  submissionId: z.string(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const formsRouter = createTRPCRouter({
  // ==========================================================================
  // FOLDER OPERATIONS
  // ==========================================================================

  /**
   * List all form folders at a specific level
   */
  listFolders: organizationProcedure({ requirePermission: permissions.FORMS_READ })
    .input(listFormFoldersSchema)
    .query(async ({ input }) => {
      return await formService.listFormFolders({
        organizationId: input.organizationId,
        parentId: input.parentId ?? null,
        search: input.search,
      })
    }),

  /**
   * Get folder breadcrumb for navigation
   */
  getFolderBreadcrumb: organizationProcedure({
    requirePermission: permissions.FORMS_READ,
  })
    .input(getFolderBreadcrumbSchema)
    .query(async ({ input }) => {
      return await formService.getFormFolderBreadcrumb(
        input.organizationId,
        input.folderId
      )
    }),

  /**
   * Create a new form folder
   */
  createFolder: organizationProcedure({
    requirePermission: permissions.FORMS_CREATE,
  })
    .input(createFormFolderSchema)
    .mutation(async ({ input }) => {
      return await formService.createFormFolder({
        organizationId: input.organizationId,
        name: input.name,
        parentId: input.parentId ?? null,
        color: input.color ?? null,
      })
    }),

  /**
   * Update a form folder
   */
  updateFolder: organizationProcedure({
    requirePermission: permissions.FORMS_UPDATE,
  })
    .input(updateFormFolderSchema)
    .mutation(async ({ input }) => {
      const { organizationId, folderId, ...data } = input
      return await formService.updateFormFolder(organizationId, folderId, data)
    }),

  /**
   * Delete a form folder (soft delete)
   */
  deleteFolder: organizationProcedure({
    requirePermission: permissions.FORMS_DELETE,
  })
    .input(deleteFormFolderSchema)
    .mutation(async ({ input }) => {
      return await formService.deleteFormFolder(
        input.organizationId,
        input.folderId
      )
    }),

  // ==========================================================================
  // FORM OPERATIONS
  // ==========================================================================

  /**
   * List all forms for organization with pagination
   */
  list: organizationProcedure({ requirePermission: permissions.FORMS_READ })
    .input(listFormsSchema)
    .query(async ({ input }) => {
      return await formService.listForms({
        organizationId: input.organizationId,
        folderId: input.folderId,
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
        status: input.status,
      })
    }),

  /**
   * Get a single form by ID
   */
  getById: organizationProcedure({
    requirePermission: permissions.FORMS_READ,
  })
    .input(getFormSchema)
    .query(async ({ input }) => {
      const form = await formService.getFormById(
        input.organizationId,
        input.formId
      )

      if (!form) {
        throw createStructuredError('NOT_FOUND', 'Form not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Form not found',
        })
      }

      return form
    }),

  /**
   * Get a single form by slug.
   * Used by the form builder to load existing forms by their URL-friendly slug.
   */
  getBySlug: organizationProcedure({
    requirePermission: permissions.FORMS_READ,
  })
    .input(getFormBySlugSchema)
    .query(async ({ input }) => {
      const form = await formService.getFormBySlug(
        input.organizationId,
        input.slug
      )

      if (!form) {
        throw createStructuredError('NOT_FOUND', 'Form not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Form not found',
        })
      }

      return form
    }),

  /**
   * Create a new form
   *
   * FEATURE GATE: forms.limit
   * Checks organization's form limit before creating, increments usage after success
   */
  /** Feature-gated: forms.limit checked at procedure level before handler runs */
  create: organizationProcedure({
    requirePermission: permissions.FORMS_CREATE,
    requireFeature: 'forms.limit',
  })
    .input(createFormSchema)
    .mutation(async ({ ctx, input }) => {
      // Generate slug if not provided
      let slug = input.slug
      if (!slug) {
        slug = await formService.generateUniqueSlug(
          input.organizationId,
          input.name
        )
      }

      const form = await formService.createForm({
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        slug,
        folderId: input.folderId ?? null,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'forms.limit')

      return form
    }),

  /**
   * Update a form
   */
  update: organizationProcedure({
    requirePermission: permissions.FORMS_UPDATE,
  })
    .input(updateFormSchema)
    .mutation(async ({ input }) => {
      const { organizationId, formId, ...data } = input
      return await formService.updateForm(organizationId, formId, data)
    }),

  /**
   * Delete a form (soft delete)
   *
   * FEATURE GATE: forms.limit
   * Decrements usage after successful deletion to free up quota
   */
  delete: organizationProcedure({
    requirePermission: permissions.FORMS_DELETE,
  })
    .input(deleteFormSchema)
    .mutation(async ({ ctx, input }) => {
      await formService.deleteForm(input.organizationId, input.formId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, input.organizationId, 'forms.limit')

      return { success: true, message: 'Form deleted' }
    }),

  /**
   * Bulk delete forms (soft delete)
   *
   * FEATURE GATE: forms.limit
   * Decrements usage by count of deleted forms to free up quota
   */
  bulkDelete: organizationProcedure({
    requirePermission: permissions.FORMS_DELETE,
  })
    .input(bulkDeleteFormsSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await formService.bulkDeleteForms(
        input.organizationId,
        input.formIds
      )

      // Decrement usage by count of deleted forms
      if (result.count > 0) {
        await decrementUsageAndInvalidate(
          ctx,
          input.organizationId,
          'forms.limit',
          result.count
        )
      }

      return { success: true, count: result.count }
    }),

  /**
   * Move form to a different folder
   */
  moveToFolder: organizationProcedure({
    requirePermission: permissions.FORMS_UPDATE,
  })
    .input(moveFormSchema)
    .mutation(async ({ input }) => {
      return await formService.moveFormToFolder(
        input.organizationId,
        input.formId,
        input.folderId
      )
    }),

  // ==========================================================================
  // PUBLIC ENDPOINTS (No authentication required)
  // ==========================================================================

  /**
   * Get a form by slug for public viewing.
   * PUBLIC - No auth required. Only returns PUBLISHED forms.
   *
   * WHY: Allows forms to be viewed and submitted without authentication.
   * SECURITY: Only published forms are returned. Draft/paused/archived are hidden.
   *
   * URL PATTERN: /forms/[slug] (public) vs /forms/[slug]/edit (protected)
   */
  getPublicFormBySlug: baseProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const form = await formService.getPublicFormBySlug(input.slug)

      if (!form) {
        throw createStructuredError('NOT_FOUND', 'Form not found or not published', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Form not found or not published',
        })
      }

      return form
    }),

  /**
   * Submit a form.
   * PUBLIC - No auth required. Anyone can submit a published form.
   *
   * WHY: Forms need to be submittable by anyone (public users, iframe embeds, etc.)
   * This is the SINGLE entry point for all form submissions.
   *
   * Processing Flow:
   * 1. Validates form exists and is PUBLISHED
   * 2. Auto-maps form fields to Lead fields by type
   * 3. Finds/creates lead by email (match-first logic)
   * 4. Distributes data to Lead, CustomDataResponse, FormSubmission
   * 5. Future: Triggers automations
   */
  submitForm: baseProcedure
    .input(
      z.object({
        formId: z.string(),
        data: z.record(z.string(), z.unknown()),
        metadata: z
          .object({
            referrerUrl: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Import the service here to avoid circular dependencies
      const { processFormSubmission } = await import('@/services/form-submission.service')
      const { headers } = await import('next/headers')

      // Extract metadata from request headers
      // Note: In Next.js App Router, we use headers() from next/headers
      const requestHeaders = await headers()
      const metadata = {
        ipAddress: requestHeaders.get('x-forwarded-for') ?? undefined,
        userAgent: requestHeaders.get('user-agent') ?? undefined,
        referrerUrl: input.metadata?.referrerUrl,
      }

      // Validate and convert input data to proper type
      const submissionData: Record<string, string | number | boolean | null | string[] | number[]> = {}
      for (const [key, value] of Object.entries(input.data)) {
        // Only include valid submission values
        if (
          value === null ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          submissionData[key] = value
        } else if (
          Array.isArray(value) &&
          value.every(v => typeof v === 'string' || typeof v === 'number')
        ) {
          submissionData[key] = value as string[] | number[]
        }
      }

      // Process the submission
      const result = await processFormSubmission({
        formId: input.formId,
        data: submissionData,
        metadata,
      })

      // Throw on failure so the client's catch handler is triggered
      if (!result.success) {
        throw createStructuredError('BAD_REQUEST', result.error ?? 'Form submission failed', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: result.error ?? 'Form submission failed',
        })
      }

      return {
        success: true,
        message: 'Form submitted successfully',
        submissionId: result.submissionId,
        leadId: result.leadId,
      }
    }),

  // ==========================================================================
  // FORM SUBMISSION OPERATIONS (Protected - requires authentication)
  // ==========================================================================

  /**
   * List form submissions with pagination, search, and date filters.
   *
   * Returns submissions enriched with form name/slug and lead contact info.
   * Org-scoped through the form's organizationId.
   */
  listSubmissions: organizationProcedure({
    requirePermission: permissions.FORMS_READ,
  })
    .input(listSubmissionsSchema)
    .query(async ({ input }) => {
      return await listFormSubmissions({
        organizationId: input.organizationId,
        formId: input.formId,
        search: input.search,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * Get a single form submission by ID with full details.
   *
   * Returns the submission data, form name, and associated lead info.
   * Throws NOT_FOUND if submission doesn't exist or isn't in the organization.
   */
  getSubmission: organizationProcedure({
    requirePermission: permissions.FORMS_READ,
  })
    .input(getSubmissionSchema)
    .query(async ({ input }) => {
      const submission = await getFormSubmission(
        input.organizationId,
        input.submissionId
      )

      if (!submission) {
        throw createStructuredError('NOT_FOUND', 'Submission not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Submission not found',
        })
      }

      return submission
    }),

  /**
   * Hard delete a form submission.
   *
   * Removes the submission record and decrements the form's submissionCount.
   * Org-scoped through the form's organizationId.
   */
  deleteSubmission: organizationProcedure({
    requirePermission: permissions.FORMS_DELETE,
  })
    .input(deleteSubmissionSchema)
    .mutation(async ({ input }) => {
      await deleteFormSubmission(input.organizationId, input.submissionId)
      return { success: true }
    }),
})
