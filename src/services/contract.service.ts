/**
 * Contract Service
 *
 * Data Access Layer (DAL) for contracts.
 * Handles CRUD operations for legal contracts and agreements
 * that use a Lexical editor for rich-text content.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractService, ContractDAL, ContractCRUD
 *
 * ARCHITECTURE:
 * - Contracts stored in database with JSON content (Lexical SerializedEditorState)
 * - Content includes decorator nodes for signatures and input fields
 * - Folder organization mirrors EmailTemplateFolder pattern
 * - HARD DELETE only (no soft delete)
 */

import { prisma } from '@/lib/config'
import type { Contract, ContractStatus } from '@/generated/prisma'
import { nanoid } from 'nanoid'
import { sendContractSignedEmail } from '@/services/email.service'
import { recordOutboundEmail } from '@/services/inbox.service'
import { stripHtml } from '@/lib/utils/lead-helpers'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Contract with its folder relation included.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractWithFolder
 */
export type ContractWithFolder = Contract & {
  folder: { id: string; name: string; color: string | null } | null
}

/**
 * Paginated result for listing contracts.
 *
 * SOURCE OF TRUTH KEYWORDS: ListContractsResult
 */
export interface ListContractsResult {
  contracts: ContractWithFolder[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * Filters for listing contracts.
 *
 * SOURCE OF TRUTH KEYWORDS: ListContractsInput
 */
export interface ListContractsInput {
  organizationId: string
  search?: string
  folderId?: string | null
  status?: ContractStatus
  /** Filter by template vs instance — true = templates only, false = instances only, undefined = all */
  isTemplate?: boolean
  page?: number
  limit?: number
}

/**
 * Input for creating a contract.
 *
 * SOURCE OF TRUTH KEYWORDS: CreateContractInput
 */
export interface CreateContractInput {
  organizationId: string
  name: string
  description?: string | null
  content?: object | null
  folderId?: string | null
  /** Whether this contract is a reusable template (defaults to false) */
  isTemplate?: boolean
  /** Contract variables — user-defined name/value pairs stored as JSON */
  variables?: object[] | null
  /** Lead ID to set as the contract recipient (signer) at creation time */
  recipientId?: string | null
}

/**
 * Input for updating a contract.
 *
 * SOURCE OF TRUTH KEYWORDS: UpdateContractInput
 */
export interface UpdateContractInput {
  name?: string
  description?: string | null
  content?: object | null
  status?: ContractStatus
  folderId?: string | null
  /** Toggle whether this contract is a template or an instance */
  isTemplate?: boolean
  /** Contract variables — user-defined name/value pairs stored as JSON */
  variables?: object[] | null
  /** Recipient lead ID — the lead this contract is addressed to */
  recipientId?: string | null
}

/**
 * Contract with folder AND recipient lead data included.
 * Used by the public contract view to display lead info.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractWithRecipient, ContractPublicView
 */
export type ContractWithRecipient = Contract & {
  folder: { id: string; name: string; color: string | null } | null
  recipient: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
    avatarUrl: string | null
    address: string | null
    city: string | null
    state: string | null
    zipCode: string | null
    country: string | null
    status: string | null
    source: string | null
    cltv: number | null
  } | null
}

/**
 * Result of sending a contract — includes the generated access token.
 *
 * SOURCE OF TRUTH KEYWORDS: SendContractResult
 */
export interface SendContractResult {
  contract: ContractWithFolder
  accessToken: string
}

// ============================================================================
// LIST
// ============================================================================

/**
 * List contracts with pagination, search, folder filter, and status filter.
 *
 * When search is provided, it searches across ALL folders (ignoring folderId).
 * Otherwise it filters by folderId (null = root level contracts).
 * Includes the folder relation for displaying folder info in the list view.
 *
 * @param input - Pagination, search, folder, and status filters
 * @returns Paginated list of contracts with folder relation
 */
export async function listContracts(
  input: ListContractsInput
): Promise<ListContractsResult> {
  const { organizationId, page = 1, limit = 20, search, folderId, status, isTemplate } = input

  // Build where clause
  // Search mode: search by name across all folders, ignore folderId
  // Browse mode: filter by folderId (null = root level)
  // isTemplate filter: when provided, only return templates (true) or instances (false)
  const where = {
    organizationId,
    ...(status ? { status } : {}),
    ...(isTemplate !== undefined ? { isTemplate } : {}),
    ...(search
      ? {
          name: { contains: search, mode: 'insensitive' as const },
        }
      : {
          folderId: folderId ?? null,
        }),
  }

  // Fetch contracts and total count in parallel for performance
  const [contracts, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        folder: {
          select: { id: true, name: true, color: true },
        },
        recipient: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.contract.count({ where }),
  ])

  return {
    contracts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ============================================================================
// GET BY ID
// ============================================================================

/**
 * Get a single contract by ID with folder relation.
 * Ensures the contract belongs to the given organization.
 *
 * @param id - Contract ID
 * @param organizationId - Organization context for access control
 * @returns Contract with folder relation, or null if not found
 */
export async function getContractById(
  id: string,
  organizationId: string
): Promise<ContractWithRecipient | null> {
  const contract = await prisma.contract.findFirst({
    where: { id, organizationId },
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
      /**
       * Include the recipient lead data so the builder can prepopulate
       * the recipient card and map lead variables for live preview.
       */
      recipient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
          status: true,
          source: true,
          cltv: true,
        },
      },
    },
  })
  return contract as ContractWithRecipient | null
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new contract with DRAFT status.
 * Content defaults to null (empty Lexical editor state).
 *
 * @param input - Contract creation input
 * @returns Created contract with folder relation
 */
export async function createContract(
  input: CreateContractInput
): Promise<ContractWithFolder> {
  const { organizationId, name, description, content, folderId, isTemplate, variables, recipientId } = input

  /**
   * If recipientId is provided, validate the lead exists in this org
   * before creating — prevents FK constraint violations from hallucinated IDs.
   */
  if (recipientId) {
    const lead = await prisma.lead.findFirst({
      where: { id: recipientId, organizationId },
      select: { id: true },
    })
    if (!lead) {
      throw new Error(`Recipient lead not found: ${recipientId}. Make sure the lead exists in this organization.`)
    }
  }

  return await prisma.contract.create({
    data: {
      organizationId,
      name,
      description: description ?? null,
      content: content ?? undefined,
      folderId: folderId ?? null,
      isTemplate: isTemplate ?? false,
      variables: variables ?? undefined,
      recipientId: recipientId ?? null,
      // status defaults to DRAFT via schema default
    },
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
    },
  })
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update an existing contract's metadata, content, status, or folder.
 * Only updates fields that are explicitly provided (undefined fields are skipped).
 *
 * @param id - Contract ID
 * @param organizationId - Organization context for access control
 * @param data - Fields to update
 * @returns Updated contract with folder relation
 * @throws Error if contract not found
 */
export async function updateContract(
  id: string,
  organizationId: string,
  data: UpdateContractInput
): Promise<ContractWithFolder> {
  // Verify the contract exists and belongs to this organization
  const existing = await prisma.contract.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract not found: ${id}`)
  }

  // Build update payload — only include fields that were explicitly provided
  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.content !== undefined) updateData.content = data.content
  if (data.status !== undefined) updateData.status = data.status
  if (data.folderId !== undefined) updateData.folderId = data.folderId
  if (data.isTemplate !== undefined) updateData.isTemplate = data.isTemplate
  if (data.variables !== undefined) updateData.variables = data.variables

  /**
   * Validate recipientId before setting — the lead must exist and belong
   * to this organization. Prevents FK constraint violations when the AI
   * passes a stale or hallucinated lead ID.
   */
  if (data.recipientId !== undefined) {
    if (data.recipientId === null) {
      updateData.recipientId = null
    } else {
      const lead = await prisma.lead.findFirst({
        where: { id: data.recipientId, organizationId },
        select: { id: true },
      })
      if (!lead) {
        throw new Error(`Recipient lead not found: ${data.recipientId}. Make sure the lead exists in this organization.`)
      }
      updateData.recipientId = data.recipientId
    }
  }

  return await prisma.contract.update({
    where: { id },
    data: updateData,
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
    },
  })
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Permanently delete a contract (HARD DELETE).
 * Verifies the contract belongs to the given organization before deleting.
 *
 * @param id - Contract ID
 * @param organizationId - Organization context for access control
 * @throws Error if contract not found
 */
export async function deleteContract(
  id: string,
  organizationId: string
): Promise<void> {
  // Verify the contract exists and belongs to this organization
  const existing = await prisma.contract.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract not found: ${id}`)
  }

  await prisma.contract.delete({
    where: { id },
  })
}

// ============================================================================
// DUPLICATE
// ============================================================================

/**
 * Duplicate a contract.
 * Creates a copy with "Copy of " prefix, same folder, and DRAFT status.
 * Content (Lexical editor state) is preserved as-is.
 *
 * @param id - Contract ID to duplicate
 * @param organizationId - Organization context for access control
 * @returns New contract copy with folder relation
 * @throws Error if source contract not found
 */
export async function duplicateContract(
  id: string,
  organizationId: string
): Promise<ContractWithFolder> {
  // Fetch the source contract
  const existing = await prisma.contract.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract not found: ${id}`)
  }

  const duplicate = await prisma.contract.create({
    data: {
      organizationId,
      name: `Copy of ${existing.name}`,
      description: existing.description,
      content: existing.content ?? undefined,
      folderId: existing.folderId,
      variables: existing.variables ?? undefined,
      // Always start duplicated contracts as DRAFT regardless of source status
      status: 'DRAFT',
    },
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
    },
  })

  // Propagate origin marker if the source contract was installed from a template.
  // This ensures duplicated template-installed contracts retain their lineage.
  const { propagateOriginMarker } = await import('@/lib/templates/origin-hash')
  await propagateOriginMarker(id, duplicate.id, 'CONTRACT', organizationId)

  return duplicate
}

// ============================================================================
// MOVE
// ============================================================================

/**
 * Move a contract to a different folder.
 *
 * @param id - Contract ID to move
 * @param organizationId - Organization context for access control
 * @param folderId - Target folder ID (null to move to root)
 * @returns Updated contract with folder relation
 * @throws Error if contract not found or target folder not found
 */
export async function moveContract(
  id: string,
  organizationId: string,
  folderId: string | null
): Promise<ContractWithFolder> {
  // Verify the contract exists
  const existing = await prisma.contract.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract not found: ${id}`)
  }

  // Verify target folder exists if specified
  if (folderId) {
    const folder = await prisma.contractFolder.findFirst({
      where: { id: folderId, organizationId },
    })
    if (!folder) {
      throw new Error(`Target folder not found: ${folderId}`)
    }
  }

  return await prisma.contract.update({
    where: { id },
    data: { folderId },
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
    },
  })
}

// ============================================================================
// CREATE FROM TEMPLATE
// ============================================================================

/**
 * Create a new contract instance from an existing template.
 *
 * Fetches the template (must have isTemplate: true), then creates a new
 * independent contract instance that copies the template's name, description,
 * and content. The new instance starts as DRAFT with isTemplate: false.
 *
 * The templateId field on the new instance tracks which template it came from
 * (informational only — instances are independent copies).
 *
 * SOURCE OF TRUTH KEYWORDS: CreateFromTemplate, ContractInstanceFromTemplate
 *
 * @param templateId - ID of the template to create an instance from
 * @param organizationId - Organization context for access control
 * @param name - Optional override name (defaults to template's name)
 * @returns New contract instance with folder relation
 * @throws Error if template not found or not a template
 */
export async function createFromTemplate(
  templateId: string,
  organizationId: string,
  name?: string
): Promise<ContractWithFolder> {
  // Fetch the source template — must exist, belong to this org, and be a template
  const template = await prisma.contract.findFirst({
    where: { id: templateId, organizationId, isTemplate: true },
  })

  if (!template) {
    throw new Error('Template not found')
  }

  // Create a new contract instance by duplicating template content
  // Instance is independent — changes to the template won't affect it
  return await prisma.contract.create({
    data: {
      organizationId,
      name: name || template.name,
      description: template.description,
      content: template.content ?? undefined,
      variables: template.variables ?? undefined,
      isTemplate: false,
      templateId: template.id,
      status: 'DRAFT',
      folderId: null, // Instances start at root level
    },
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
    },
  })
}

// ============================================================================
// SEND CONTRACT
// ============================================================================

/**
 * Send a contract to its recipient.
 *
 * Generates a unique accessToken for the public signing link,
 * sets the status to SENT, and records the sentAt timestamp.
 * The recipientId must be provided — the lead must exist.
 *
 * WHY: Sending a contract is a distinct action that changes status
 * and generates a secure link. Status should not be manually changed.
 *
 * SOURCE OF TRUTH KEYWORDS: SendContract, ContractSend
 *
 * @param id - Contract ID to send
 * @param organizationId - Organization context for access control
 * @param recipientId - Lead ID of the recipient
 * @returns Updated contract + the generated accessToken
 * @throws Error if contract not found or already sent
 */
export async function sendContract(
  id: string,
  organizationId: string,
  recipientId: string
): Promise<SendContractResult> {
  // Verify the contract exists and belongs to this organization
  const existing = await prisma.contract.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract not found: ${id}`)
  }

  if (existing.status !== 'DRAFT') {
    throw new Error('Only DRAFT contracts can be sent')
  }

  // Verify the lead exists
  const lead = await prisma.lead.findFirst({
    where: { id: recipientId },
  })

  if (!lead) {
    throw new Error(`Recipient lead not found: ${recipientId}`)
  }

  // Generate a secure access token for the public signing link
  const accessToken = nanoid(32)

  const contract = await prisma.contract.update({
    where: { id },
    data: {
      status: 'SENT',
      recipientId,
      accessToken,
      sentAt: new Date(),
    } as Record<string, unknown>,
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
    },
  })

  return { contract: contract as ContractWithFolder, accessToken }
}

// ============================================================================
// GET BY ACCESS TOKEN (PUBLIC)
// ============================================================================

/**
 * Get a contract by its public access token.
 *
 * Used by the public contract view page — no organization check needed
 * because the accessToken itself acts as the authorization.
 * Includes recipient lead data for variable interpolation.
 *
 * SOURCE OF TRUTH KEYWORDS: GetByAccessToken, ContractPublicFetch
 *
 * @param accessToken - Unique access token from the signing URL
 * @returns Contract with recipient lead data, or null if not found
 */
export async function getContractByAccessToken(
  accessToken: string
): Promise<ContractWithRecipient | null> {
  /**
   * Defensive: accessToken field may not exist in schema yet.
   * Use raw query-like approach via where clause — Prisma will
   * return null if the field doesn't exist or no match is found.
   */
  const contract = await prisma.contract.findFirst({
    where: { accessToken } as Record<string, unknown>,
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
      recipient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
          status: true,
          source: true,
          cltv: true,
        },
      },
      /**
       * Include the organization for org variable resolution (name, logo, customDomain).
       * WHY: Public view needs org data to interpolate organization.name, etc.
       */
      organization: {
        select: {
          id: true,
          name: true,
          logo: true,
          customDomain: true,
        },
      },
    },
  })

  return contract as (ContractWithRecipient & {
    organization: { id: string; name: string; logo: string | null; customDomain: string | null }
  }) | null
}

// ============================================================================
// REVERT TO DRAFT
// ============================================================================

/**
 * Revert a SENT contract back to DRAFT status.
 *
 * Clears the accessToken to invalidate any previously sent links,
 * and clears the sentAt timestamp. This allows the user to edit
 * the contract again and re-send when ready.
 *
 * SOURCE OF TRUTH KEYWORDS: RevertToDraft, ContractRevert
 *
 * @param id - Contract ID to revert
 * @param organizationId - Organization context for access control
 * @returns Updated contract with folder relation
 * @throws Error if contract not found or not in SENT status
 */
export async function revertContractToDraft(
  id: string,
  organizationId: string
): Promise<ContractWithFolder> {
  const existing = await prisma.contract.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Contract not found: ${id}`)
  }

  if (existing.status !== 'SENT') {
    throw new Error('Only SENT contracts can be reverted to DRAFT')
  }

  /**
   * Clear accessToken to invalidate all previously sent links.
   * WHY: Moving to DRAFT means the contract is being edited — the
   * old signing link should no longer work for security reasons.
   */
  return await prisma.contract.update({
    where: { id },
    data: {
      status: 'DRAFT',
      accessToken: null,
      sentAt: null,
    } as Record<string, unknown>,
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
    },
  })
}

// ============================================================================
// SUBMIT CONTRACT SIGNATURE (PUBLIC)
// ============================================================================

/**
 * Submit a signed contract from the public view.
 *
 * Stores the signee's filled form fields and signature data as JSON,
 * sets the status to COMPLETED, and records the signedAt timestamp.
 *
 * SOURCE OF TRUTH KEYWORDS: SubmitSignature, ContractSign, ContractComplete
 *
 * @param accessToken - Access token from the signing URL
 * @param signeeData - JSON containing filled form fields + signature confirmations
 * @returns Updated contract
 * @throws Error if contract not found or already completed
 */
export async function submitContractSignature(
  accessToken: string,
  signeeData: Record<string, unknown>
): Promise<ContractWithRecipient> {
  // Find the contract by access token
  const existing = await prisma.contract.findFirst({
    where: { accessToken } as Record<string, unknown>,
  })

  if (!existing) {
    throw new Error('Contract not found')
  }

  if (existing.status === 'COMPLETED') {
    throw new Error('Contract has already been signed')
  }

  const contract = await prisma.contract.update({
    where: { id: existing.id },
    data: {
      status: 'COMPLETED',
      signeeData,
      signedAt: new Date(),
    } as Record<string, unknown>,
    include: {
      folder: {
        select: { id: true, name: true, color: true },
      },
      recipient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
        },
      },
    },
  })

  /**
   * Send signed confirmation email to the recipient
   *
   * WHY: The signer should receive confirmation that their contract
   * has been authorized, along with a link to view it at any time.
   *
   * NOTE: Fire-and-forget — we don't fail the signing if the email fails.
   * The contract is already saved as COMPLETED at this point.
   */
  if (contract.recipient?.email && accessToken) {
    const recipientName = [contract.recipient.firstName, contract.recipient.lastName]
      .filter(Boolean)
      .join(' ') || undefined

    sendContractSignedEmail({
      to: contract.recipient.email,
      contractName: contract.name,
      accessToken,
      organizationId: contract.organizationId,
      recipientName,
    }).then((emailResult) => {
      /**
       * Record the signed confirmation email in the lead's inbox conversation
       * WHY: Makes contract signed emails visible in the conversation tab
       * NOTE: Fire-and-forget — recording failure is non-fatal
       */
      if (emailResult.success && emailResult.html && contract.recipient) {
        recordOutboundEmail({
          organizationId: contract.organizationId,
          leadId: contract.recipient.id,
          subject: `"${contract.name}" — Signed & Authorized`,
          body: stripHtml(emailResult.html),
          bodyHtml: emailResult.html,
          toEmail: contract.recipient.email,
          fromEmail: emailResult.fromAddress,
          resendMessageId: emailResult.messageId,
        }).catch((recordError) => {
          console.error('Failed to record contract signed email in inbox:', recordError)
        })
      }
    }).catch((err) => {
      console.error('Failed to send contract signed email:', err)
    })
  }

  return contract as ContractWithRecipient
}
