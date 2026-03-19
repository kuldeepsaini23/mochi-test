/**
 * Contracts tRPC Router
 *
 * API endpoints for contract and contract folder CRUD operations.
 * Used by the contracts listing page and contract builder UI.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractsRouter, ContractAPI, ContractFolderAPI
 *
 * CONTRACT ENDPOINTS:
 * - list: Get paginated list of contracts with search, folder, status, and template filters
 * - getById: Get single contract by ID
 * - create: Create new contract (defaults to DRAFT)
 * - update: Update existing contract metadata/content/status
 * - delete: Hard delete a contract
 * - duplicate: Copy an existing contract as DRAFT
 * - move: Move contract to a different folder
 * - createFromTemplate: Create a new contract instance from a template
 * - send: Send a DRAFT contract to a recipient (generates access token + emails)
 * - getByAccessToken: Public — fetch a contract by its access token (no auth)
 * - submitSignature: Public — submit signee data for a sent contract (no auth)
 * - listTemplates: List all contract templates (convenience wrapper)
 *
 * FOLDER ENDPOINTS:
 * - listFolders: Get folders at a given level (or root)
 * - getAllFolders: Get all folders (flat list for move dialog)
 * - getFolderBreadcrumb: Get navigation breadcrumb path
 * - createFolder: Create new folder
 * - updateFolder: Update folder name/color
 * - deleteFolder: Hard delete folder (moves contracts to root)
 * - moveFolder: Move folder to different parent
 *
 * PERMISSIONS:
 * - CONTRACTS_READ: list, getById, listFolders, getAllFolders, getFolderBreadcrumb
 * - CONTRACTS_CREATE: create, duplicate, createFolder
 * - CONTRACTS_UPDATE: update, move, updateFolder, moveFolder
 * - CONTRACTS_DELETE: delete, deleteFolder
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  createTRPCRouter,
  organizationProcedure,
  baseProcedure,
  createStructuredError,
} from '../init'
import { permissions } from '@/lib/better-auth/permissions'
import { ERROR_CODES } from '@/lib/errors'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import {
  listContracts,
  getContractById,
  createContract,
  updateContract,
  deleteContract,
  duplicateContract,
  moveContract,
  createFromTemplate,
  sendContract,
  getContractByAccessToken,
  submitContractSignature,
  revertContractToDraft,
} from '@/services/contract.service'
import { sendContractEmail } from '@/services/email.service'
import { recordOutboundEmail } from '@/services/inbox.service'
import { stripHtml } from '@/lib/utils/lead-helpers'
import {
  listContractFolders,
  getAllContractFolders,
  getContractFolderBreadcrumb,
  createContractFolder,
  updateContractFolder,
  deleteContractFolder,
  moveContractFolder,
} from '@/services/contract-folder.service'

// ============================================================================
// CONTRACT INPUT SCHEMAS
// ============================================================================

/** Schema for contract variables — user-defined name/value pairs */
const contractVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
})

/**
 * Schema for listing contracts with pagination, search, folder, and status filters.
 */
const listContractsSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  folderId: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SENT', 'COMPLETED', 'ARCHIVED']).optional(),
  /** Filter by template (true) vs instance (false) — omit for all */
  isTemplate: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

/**
 * Schema for getting a single contract by ID.
 */
const getContractByIdSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

/**
 * Schema for creating a new contract.
 */
const createContractSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  description: z.string().max(500).optional().nullable(),
  content: z.record(z.string(), z.unknown()).optional().nullable(),
  folderId: z.string().nullable().optional(),
  /** Whether this contract is a reusable template (defaults to false) */
  isTemplate: z.boolean().optional(),
  /** Contract variables — user-defined name/value pairs */
  variables: z.array(contractVariableSchema).optional().nullable(),
  /** Lead ID to set as the contract recipient at creation time */
  recipientId: z.string().optional().nullable(),
})

/**
 * Schema for updating a contract.
 */
const updateContractSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  content: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SENT', 'COMPLETED', 'ARCHIVED']).optional(),
  folderId: z.string().nullable().optional(),
  /** Toggle whether this contract is a template or an instance */
  isTemplate: z.boolean().optional(),
  /** Contract variables — user-defined name/value pairs */
  variables: z.array(contractVariableSchema).optional().nullable(),
  /** Lead ID of the recipient assigned to this contract */
  recipientId: z.string().nullable().optional(),
})

/**
 * Schema for deleting a contract.
 */
const deleteContractSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

/**
 * Schema for duplicating a contract.
 */
const duplicateContractSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

/**
 * Schema for moving a contract to a folder.
 */
const moveContractSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
  folderId: z.string().nullable(),
})

// ============================================================================
// FOLDER INPUT SCHEMAS
// ============================================================================

/**
 * Schema for listing folders at a given level.
 */
const listContractFoldersSchema = z.object({
  organizationId: z.string(),
  parentId: z.string().nullable().optional(),
})

/**
 * Schema for getting all folders (flat list for move dialog).
 */
const getAllContractFoldersSchema = z.object({
  organizationId: z.string(),
})

/**
 * Schema for getting folder breadcrumb navigation path.
 */
const getFolderBreadcrumbSchema = z.object({
  organizationId: z.string(),
  folderId: z.string(),
})

/**
 * Schema for creating a folder.
 */
const createContractFolderSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  parentId: z.string().nullable().optional(),
})

/**
 * Schema for updating a folder.
 */
const updateContractFolderSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
})

/**
 * Schema for deleting a folder.
 */
const deleteContractFolderSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

/**
 * Schema for moving a folder to a new parent.
 */
const moveContractFolderSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
  parentId: z.string().nullable(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const contractsRouter = createTRPCRouter({
  // ==========================================================================
  // CONTRACT ENDPOINTS
  // ==========================================================================

  /**
   * List contracts with pagination, search, folder filter, and status filter.
   */
  list: organizationProcedure({ requirePermission: permissions.CONTRACTS_READ })
    .input(listContractsSchema)
    .query(async ({ input }) => {
      return await listContracts(input)
    }),

  /**
   * Get a single contract by ID.
   */
  getById: organizationProcedure({ requirePermission: permissions.CONTRACTS_READ })
    .input(getContractByIdSchema)
    .query(async ({ input }) => {
      const contract = await getContractById(input.id, input.organizationId)

      if (!contract) {
        throw createStructuredError('NOT_FOUND', 'Contract not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Contract not found',
        })
      }

      return contract
    }),

  /**
   * Create a new contract with DRAFT status.
   * Feature-gated: contracts.limit checked at procedure level before handler runs.
   */
  create: organizationProcedure({
    requirePermission: permissions.CONTRACTS_CREATE,
    requireFeature: 'contracts.limit',
  })
    .input(createContractSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createContract({
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
          content: input.content ?? undefined,
          folderId: input.folderId,
          isTemplate: input.isTemplate,
          variables: input.variables,
          recipientId: input.recipientId,
        })

        // Increment usage after successful creation
        await incrementUsageAndInvalidate(ctx, input.organizationId, 'contracts.limit')

        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create contract'
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Update an existing contract's metadata, content, status, or folder.
   */
  update: organizationProcedure({ requirePermission: permissions.CONTRACTS_UPDATE })
    .input(updateContractSchema)
    .mutation(async ({ input }) => {
      try {
        return await updateContract(input.id, input.organizationId, {
          name: input.name,
          description: input.description,
          content: input.content,
          status: input.status,
          folderId: input.folderId,
          isTemplate: input.isTemplate,
          variables: input.variables,
          recipientId: input.recipientId,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update contract'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Contract not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Contract not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Permanently delete a contract (hard delete).
   */
  delete: organizationProcedure({ requirePermission: permissions.CONTRACTS_DELETE })
    .input(deleteContractSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteContract(input.id, input.organizationId)

        // Decrement usage after successful deletion
        await decrementUsageAndInvalidate(ctx, input.organizationId, 'contracts.limit')

        return { success: true, message: 'Contract deleted successfully' }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete contract'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Contract not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Contract not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Duplicate a contract as a new DRAFT with "Copy of" prefix.
   */
  duplicate: organizationProcedure({ requirePermission: permissions.CONTRACTS_CREATE })
    .input(duplicateContractSchema)
    .mutation(async ({ input }) => {
      try {
        return await duplicateContract(input.id, input.organizationId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to duplicate contract'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Contract not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Contract not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Move a contract to a different folder (or root).
   */
  move: organizationProcedure({ requirePermission: permissions.CONTRACTS_UPDATE })
    .input(moveContractSchema)
    .mutation(async ({ input }) => {
      try {
        return await moveContract(input.id, input.organizationId, input.folderId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to move contract'

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
   * Create a new contract instance from an existing template.
   * Copies the template's name, description, and content into a new DRAFT contract.
   * The resulting contract has isTemplate: false and templateId pointing to the source.
   * Feature-gated: contracts.limit checked at procedure level before handler runs.
   */
  createFromTemplate: organizationProcedure({
    requirePermission: permissions.CONTRACTS_CREATE,
    requireFeature: 'contracts.limit',
  })
    .input(
      z.object({
        organizationId: z.string(),
        templateId: z.string(),
        /** Optional name override — defaults to the template's name */
        name: z.string().min(1).max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createFromTemplate(input.templateId, input.organizationId, input.name)

        // Increment usage after successful creation from template
        await incrementUsageAndInvalidate(ctx, input.organizationId, 'contracts.limit')

        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create from template'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Template not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Template not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Send a contract to a recipient.
   *
   * Transitions the contract from DRAFT to SENT, assigns the recipient lead,
   * generates a secure access token for the public signing link, and sends
   * a notification email to the recipient.
   *
   * Requires CONTRACTS_UPDATE permission.
   */
  send: organizationProcedure({ requirePermission: permissions.CONTRACTS_UPDATE })
    .input(
      z.object({
        organizationId: z.string(),
        id: z.string(),
        recipientId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await sendContract(input.id, input.organizationId, input.recipientId)

        /**
         * Send the contract email to the recipient after marking as SENT.
         * Track whether email delivery failed so the frontend can warn the user.
         * NOTE: Email failure does NOT fail the mutation — contract is already SENT in DB.
         */
        let emailFailed = false
        let emailError: string | undefined

        try {
          const fullContract = await getContractByAccessToken(result.accessToken)
          if (fullContract?.recipient?.email) {
            const emailResult = await sendContractEmail({
              to: fullContract.recipient.email,
              contractName: fullContract.name,
              accessToken: result.accessToken,
              organizationId: input.organizationId,
              recipientName:
                [fullContract.recipient.firstName, fullContract.recipient.lastName]
                  .filter(Boolean)
                  .join(' ') || undefined,
            })

            if (!emailResult.success) {
              emailFailed = true
              emailError = emailResult.error ?? 'Failed to send email'
              console.error('Contract email send failed:', emailResult.error)
            }

            /**
             * Record the sent contract email in the lead's inbox conversation
             * WHY: Makes contract emails visible in the conversation tab
             * NOTE: Non-blocking — recording failure should NOT fail the mutation
             */
            if (emailResult.success && emailResult.html && fullContract.recipient) {
              try {
                await recordOutboundEmail({
                  organizationId: input.organizationId,
                  leadId: fullContract.recipient.id,
                  subject: `"${fullContract.name}" — Ready for your review`,
                  body: stripHtml(emailResult.html),
                  bodyHtml: emailResult.html,
                  toEmail: fullContract.recipient.email,
                  fromEmail: emailResult.fromAddress,
                  resendMessageId: emailResult.messageId,
                })
              } catch (recordError) {
                console.error('Failed to record contract email in inbox:', recordError)
              }
            }
          }
        } catch (err) {
          emailFailed = true
          emailError = err instanceof Error ? err.message : 'Failed to send email'
          console.error('Failed to send contract email:', err)
        }

        return { success: true, accessToken: result.accessToken, emailFailed, emailError }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send contract'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        if (message.includes('Only DRAFT')) {
          throw createStructuredError('BAD_REQUEST', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  /**
   * Revert a SENT contract back to DRAFT status.
   *
   * Clears the access token (invalidating any previously sent links)
   * and resets sentAt. This allows the user to edit the contract again.
   *
   * Requires CONTRACTS_UPDATE permission.
   */
  revertToDraft: organizationProcedure({ requirePermission: permissions.CONTRACTS_UPDATE })
    .input(
      z.object({
        organizationId: z.string(),
        id: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const contract = await revertContractToDraft(input.id, input.organizationId)
        return { success: true, contract }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to revert contract'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        if (message.includes('Only SENT')) {
          throw createStructuredError('BAD_REQUEST', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  /**
   * Get a contract by its public access token (NO AUTH REQUIRED).
   *
   * Used by the public contract signing page. The access token itself
   * acts as the authorization — no session or organization check is needed.
   * Returns the full contract with recipient lead data for variable interpolation.
   */
  getByAccessToken: baseProcedure
    .input(z.object({ accessToken: z.string().min(1) }))
    .query(async ({ input }) => {
      const contract = await getContractByAccessToken(input.accessToken)

      if (!contract) {
        throw createStructuredError('NOT_FOUND', 'Contract not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Contract not found or invalid access token',
        })
      }

      return contract
    }),

  /**
   * Submit a signed contract from the public view (NO AUTH REQUIRED).
   *
   * Stores the signee's filled form fields and signature data as JSON,
   * transitions the contract to COMPLETED status, and records the signedAt timestamp.
   * The access token acts as authorization — no session check needed.
   */
  submitSignature: baseProcedure
    .input(
      z.object({
        accessToken: z.string().min(1),
        signeeData: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const contract = await submitContractSignature(input.accessToken, input.signeeData)
        return { success: true, contractId: contract.id }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to submit signature'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        if (message.includes('already been signed')) {
          throw createStructuredError('BAD_REQUEST', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  /**
   * List all contract templates for the organization.
   * Convenience endpoint that wraps listContracts with isTemplate: true.
   * Used by the template picker modal when creating a contract from a template.
   */
  listTemplates: organizationProcedure({ requirePermission: permissions.CONTRACTS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return await listContracts({
        organizationId: input.organizationId,
        search: input.search,
        isTemplate: true,
        limit: 100,
      })
    }),

  // ==========================================================================
  // FOLDER ENDPOINTS
  // ==========================================================================

  /**
   * List folders at a given level (or root-level folders).
   */
  listFolders: organizationProcedure({ requirePermission: permissions.CONTRACTS_READ })
    .input(listContractFoldersSchema)
    .query(async ({ input }) => {
      return await listContractFolders(input.organizationId, input.parentId)
    }),

  /**
   * Get all folders as a flat list for move dialog tree.
   */
  getAllFolders: organizationProcedure({ requirePermission: permissions.CONTRACTS_READ })
    .input(getAllContractFoldersSchema)
    .query(async ({ input }) => {
      return await getAllContractFolders(input.organizationId)
    }),

  /**
   * Get breadcrumb navigation path for a folder.
   */
  getFolderBreadcrumb: organizationProcedure({ requirePermission: permissions.CONTRACTS_READ })
    .input(getFolderBreadcrumbSchema)
    .query(async ({ input }) => {
      return await getContractFolderBreadcrumb(input.folderId)
    }),

  /**
   * Create a new contract folder.
   */
  createFolder: organizationProcedure({
    requirePermission: permissions.CONTRACTS_CREATE,
  })
    .input(createContractFolderSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createContractFolder(input.organizationId, {
          name: input.name,
          color: input.color,
          parentId: input.parentId,
        })

        return result
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
   * Update a contract folder's name or color.
   */
  updateFolder: organizationProcedure({ requirePermission: permissions.CONTRACTS_UPDATE })
    .input(updateContractFolderSchema)
    .mutation(async ({ input }) => {
      try {
        return await updateContractFolder(input.id, input.organizationId, {
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
   * Permanently delete a contract folder (hard delete).
   * Contracts inside are moved to root level before deletion.
   */
  deleteFolder: organizationProcedure({ requirePermission: permissions.CONTRACTS_DELETE })
    .input(deleteContractFolderSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteContractFolder(input.id, input.organizationId)

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

  /**
   * Move a contract folder to a different parent (or root).
   * Validates against circular references.
   */
  moveFolder: organizationProcedure({ requirePermission: permissions.CONTRACTS_UPDATE })
    .input(moveContractFolderSchema)
    .mutation(async ({ input }) => {
      try {
        return await moveContractFolder(input.id, input.organizationId, input.parentId)
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
})
