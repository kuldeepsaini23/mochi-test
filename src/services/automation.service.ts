/**
 * Automation Service (DAL)
 *
 * Data Access Layer for automation workflow operations.
 * Handles automation triggering, execution, and run management.
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationService, AutomationTrigger, WorkflowExecution
 *
 * KEY FUNCTIONS:
 * - triggerAutomation: Main entry point when an event fires (form submitted, payment completed, etc.)
 * - findAutomationsForEvent: Query active automations matching a trigger type and config
 * - createAutomationRun: Record a new automation execution
 * - updateAutomationRun: Update run status and step logs
 * - updateAutomationStats: Update automation statistics after run completion
 *
 * TRIGGER FLOW:
 * 1. Event occurs (form submission, payment completed, appointment scheduled, etc.)
 * 2. Service endpoint calls triggerAutomation() with event type and context
 * 3. findAutomationsForEvent queries matching active automations
 * 4. For each matching automation, createAutomationRun and dispatch to Trigger.dev
 * 5. Trigger.dev task executes nodes, updating run status via updateAutomationRun
 * 6. On completion, updateAutomationStats updates the automation record
 */

import { prisma } from '@/lib/config'
import type { Prisma } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Automation trigger types matching the Prisma enum.
 * SOURCE OF TRUTH: AutomationTriggerType in schema.prisma
 */
export type AutomationTriggerType =
  | 'FORM_SUBMITTED'
  | 'PIPELINE_TICKET_MOVED'
  | 'PAYMENT_COMPLETED'
  | 'TRIAL_STARTED'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'APPOINTMENT_SCHEDULED'
  | 'APPOINTMENT_STARTED'

/**
 * Automation run status matching the Prisma enum.
 * SOURCE OF TRUTH: AutomationRunStatus in schema.prisma
 */
export type AutomationRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

/**
 * Trigger context - data passed when an automation is triggered.
 * Contains the leadId and trigger-specific data.
 * SOURCE OF TRUTH KEYWORDS: TriggerContext, AutomationTriggerData
 */
export interface TriggerContext {
  /** The lead associated with this trigger (optional — ticket may have no lead attached) */
  leadId?: string
  /** Organization ID */
  organizationId: string
  /** Trigger-specific data (form submission, transaction, appointment, etc.) */
  triggerData: TriggerSpecificData
}

/**
 * Trigger-specific data types.
 * Each trigger type has its own data shape.
 * SOURCE OF TRUTH KEYWORDS: TriggerSpecificData, TriggerPayload
 */
export type TriggerSpecificData =
  | FormSubmittedTriggerData
  | PipelineTicketMovedTriggerData
  | PaymentCompletedTriggerData
  | TrialStartedTriggerData
  | SubscriptionRenewedTriggerData
  | SubscriptionCancelledTriggerData
  | AppointmentScheduledTriggerData
  | AppointmentStartedTriggerData

export interface FormSubmittedTriggerData {
  type: 'FORM_SUBMITTED'
  formId: string
  formName: string
  submissionId: string
  submissionData: Record<string, unknown>
}

export interface PipelineTicketMovedTriggerData {
  type: 'PIPELINE_TICKET_MOVED'
  ticketId: string
  pipelineId: string
  fromStageId: string
  fromStageName: string
  toStageId: string
  toStageName: string
}

/**
 * SOURCE OF TRUTH: PaymentCompletedTriggerData, ProductPaymentTrigger
 *
 * Fired once PER ITEM in the transaction. A cart with 3 items fires
 * triggerAutomation 3 times, each with that item's productId/priceId.
 * priceId is the most specific identifier (a product can have many prices).
 */
export interface PaymentCompletedTriggerData {
  type: 'PAYMENT_COMPLETED'
  transactionId: string
  /**
   * Per-item amount in cents — the amount attributable to THIS specific product/price.
   * For live mode: comes from TransactionItem.totalAmount (quantity * unitAmount).
   * For test mode: falls back to checkoutTotal when per-item amounts aren't available.
   * SOURCE OF TRUTH: PerItemTriggerAmount
   */
  amount: number
  /**
   * Total Stripe charge amount for the entire checkout/invoice (cents).
   * Includes all items (main product + order bumps + cart items).
   * Use this when you need the full checkout total rather than per-item.
   * SOURCE OF TRUTH: CheckoutTotalTriggerAmount
   */
  checkoutTotal: number
  currency: string
  /** The product this specific trigger invocation is for */
  productId: string
  productName: string
  /** The exact price purchased — primary identifier (product can have many prices) */
  priceId: string
  priceName: string
  /** Billing type of this specific item */
  billingType: 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT'
  /** True if this is a renewal/subsequent payment, not the first charge */
  isRenewal: boolean
  /** Legacy: payment link ID if payment came from a payment link */
  paymentLinkId?: string
}

/**
 * SOURCE OF TRUTH: TrialStartedTriggerData, TrialAutomationTrigger
 *
 * Fired per trial item when a trial subscription begins ($0 charged).
 * Includes trial duration and end date for "trial ending soon" email sequences.
 */
export interface TrialStartedTriggerData {
  type: 'TRIAL_STARTED'
  transactionId: string
  productId: string
  productName: string
  priceId: string
  priceName: string
  /** Number of trial days (e.g. 7, 14, 30) */
  trialDays: number
  /** ISO date when the trial ends */
  trialEndsAt: string
  currency: string
}

/**
 * SOURCE OF TRUTH: SubscriptionRenewedTriggerData, RenewalAutomationTrigger
 *
 * Fired per RECURRING/SPLIT item when a 2nd+ subscription payment succeeds.
 * paymentNumber indicates which payment this is (2 = first renewal, 3 = second, etc.)
 */
export interface SubscriptionRenewedTriggerData {
  type: 'SUBSCRIPTION_RENEWED'
  transactionId: string
  /** Stripe invoice amount for this renewal (cents) */
  amount: number
  currency: string
  productId: string
  productName: string
  priceId: string
  priceName: string
  /** Which payment number this is (2 = first renewal, 3 = second, etc.) */
  paymentNumber: number
}

/**
 * SOURCE OF TRUTH: SubscriptionCancelledTriggerData, ChurnAutomationTrigger
 *
 * Fired per item when a subscription ends (user cancel, churn, payment failure).
 * cancelReason comes from Stripe's cancellation_details when available.
 */
export interface SubscriptionCancelledTriggerData {
  type: 'SUBSCRIPTION_CANCELLED'
  transactionId: string
  productId: string
  productName: string
  priceId: string
  priceName: string
  /** Stripe cancellation reason (e.g. 'cancellation_requested', 'payment_failed') */
  cancelReason?: string
  currency: string
}

export interface AppointmentScheduledTriggerData {
  type: 'APPOINTMENT_SCHEDULED'
  appointmentId: string
  calendarId: string
  appointmentTitle: string
  startDate: Date
  endDate: Date
}

export interface AppointmentStartedTriggerData {
  type: 'APPOINTMENT_STARTED'
  appointmentId: string
  calendarId: string
}

/**
 * Step log entry for automation run.
 * Contains detailed information about each step execution.
 * SOURCE OF TRUTH KEYWORDS: AutomationStepLog, RunStepResult
 */
export interface AutomationStepLog {
  /** The unique node ID from the schema */
  nodeId: string
  /** Human-readable name of the node (e.g., "Send Welcome Email") */
  nodeName: string
  /** The node type (trigger, action, condition) */
  nodeType: string
  /** The specific action/trigger type (e.g., "send_email", "add_tag") */
  actionType?: string
  /** Current execution status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  /** ISO timestamp when step started */
  startedAt?: string
  /** ISO timestamp when step completed */
  completedAt?: string
  /** Duration in milliseconds */
  durationMs?: number
  /** Result data from the action (action-specific) */
  result?: unknown
  /** Error message if step failed */
  error?: string
  /** Human-readable reason why this step was skipped (missing data, not a system error) */
  skipReason?: string
  /** For condition nodes: which branch was taken (if_else: 'true'/'false', branch: branchId or 'default') */
  branchTaken?: string
  /** Input data used by this step (for debugging) */
  input?: Record<string, unknown>
  /** Number of retry attempts if any */
  retryAttempt?: number
}

/**
 * Result of triggering automations.
 */
export interface TriggerResult {
  triggered: number
  automationIds: string[]
  runIds: string[]
}

// ============================================================================
// SLUG GENERATION
// ============================================================================

/**
 * Generate a unique slug for an automation.
 * Converts the automation name to a URL-safe slug automatically.
 *
 * Algorithm:
 * 1. Convert name to lowercase
 * 2. Remove special characters (keep only a-z, 0-9, and hyphens)
 * 3. Replace spaces with hyphens
 * 4. Remove duplicate hyphens
 * 5. Limit to 50 characters
 * 6. Check uniqueness per organization
 * 7. If exists, append counter (-1, -2, etc.)
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationSlug, SlugGeneration
 *
 * @param organizationId - Organization to check uniqueness within
 * @param baseName - The automation name to convert to slug
 * @returns Unique slug for this organization
 *
 * @example
 * generateUniqueSlug("org123", "Welcome Email Flow") // "welcome-email-flow"
 * generateUniqueSlug("org123", "Welcome Email Flow") // "welcome-email-flow-1" (if first exists)
 */
export async function generateUniqueSlug(
  organizationId: string,
  baseName: string
): Promise<string> {
  // Step 1: Convert name to slug format
  let slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove duplicate hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50)

  // Handle empty slug (e.g., if name was all special characters)
  if (!slug) {
    slug = 'automation'
  }

  // Step 2: Check for uniqueness
  let counter = 0
  let finalSlug = slug

  while (true) {
    const existing = await prisma.automation.findUnique({
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

/**
 * Get an automation by its slug.
 * Uses the unique organizationId_slug index for efficient lookup.
 *
 * @param organizationId - Organization to search in
 * @param slug - The automation slug
 * @returns Full automation data or null if not found
 */
export async function getAutomationBySlug(organizationId: string, slug: string) {
  return prisma.automation.findUnique({
    where: {
      organizationId_slug: {
        organizationId,
        slug,
      },
    },
  })
}

/**
 * Update an automation's slug.
 *
 * Validates that the new slug is unique within the organization
 * before updating. Returns the updated automation with new slug.
 *
 * @param organizationId - Organization the automation belongs to
 * @param automationId - ID of the automation to update
 * @param newSlug - The new slug (must be unique per organization)
 * @returns Updated automation data
 * @throws Error if slug already exists in organization
 */
export async function updateAutomationSlug(
  organizationId: string,
  automationId: string,
  newSlug: string
) {
  // Check if slug already exists for another automation in this organization
  const existing = await prisma.automation.findFirst({
    where: {
      organizationId,
      slug: newSlug,
      NOT: { id: automationId },
    },
  })

  if (existing) {
    throw new Error(`Slug "${newSlug}" is already in use by another automation`)
  }

  return prisma.automation.update({
    where: { id: automationId },
    data: { slug: newSlug },
  })
}

// ============================================================================
// AUTOMATION CRUD OPERATIONS (Router Data Access Layer)
// ============================================================================
// SOURCE OF TRUTH: AutomationCRUD, AutomationListQuery, AutomationRunHistory

/**
 * List automations with pagination, search, and filters.
 *
 * WHY: Main endpoint for automation list page with search, status, and folder filtering.
 * HOW: Returns paginated results with folder info and run stats.
 *
 * SOURCE OF TRUTH: AutomationListPaginated, AutomationFilters
 */
export async function listAutomations(input: {
  organizationId: string
  page: number
  pageSize: number
  search?: string
  status?: string
  triggerType?: string
  folderId?: string | null
}) {
  const { organizationId, page, pageSize, search, status, triggerType, folderId } = input

  // Build where clause (cast to Prisma type to satisfy enum constraints)
  const where: Prisma.AutomationWhereInput = {
    organizationId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(status && { status: status as Prisma.AutomationWhereInput['status'] }),
    ...(triggerType && { triggerType: triggerType as Prisma.AutomationWhereInput['triggerType'] }),
    // Only filter by folder when folderId is explicitly passed (including null for root)
    ...(folderId !== undefined && { folderId }),
  }

  // Fetch automations and count in parallel
  const [automations, total] = await Promise.all([
    prisma.automation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        triggerType: true,
        totalRuns: true,
        successfulRuns: true,
        failedRuns: true,
        lastRunAt: true,
        createdAt: true,
        updatedAt: true,
        folderId: true,
        folder: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    }),
    prisma.automation.count({ where }),
  ])

  return {
    automations,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get a single automation by ID with full schema.
 *
 * SOURCE OF TRUTH: AutomationGetById
 *
 * @param organizationId - Organization ID for security scoping
 * @param automationId - Automation ID to fetch
 */
export async function getAutomationById(organizationId: string, automationId: string) {
  return await prisma.automation.findFirst({
    where: {
      id: automationId,
      organizationId,
    },
  })
}

/**
 * Get automation schema for execution by the Trigger.dev task.
 *
 * WHY: The automation execution task needs the schema (nodes/edges) and trigger type
 * to walk through the workflow. Uses findUnique for efficient ID-based lookup
 * with a minimal select to avoid transferring unnecessary data.
 *
 * SOURCE OF TRUTH: GetAutomationSchemaForExecution, AutomationExecutionFetch
 *
 * @param automationId - The automation ID to fetch
 * @returns Automation with schema, name, and triggerType, or null if not found
 */
export async function getAutomationSchemaForExecution(automationId: string) {
  return await prisma.automation.findUnique({
    where: { id: automationId },
    select: {
      id: true,
      name: true,
      schema: true,
      triggerType: true,
    },
  })
}

/**
 * Create a new automation with auto-generated slug.
 *
 * WHY: Creates an automation in DRAFT status with a unique slug from the name.
 * HOW: Generates slug, then creates the record.
 *
 * SOURCE OF TRUTH: AutomationCreate, AutomationDraft
 */
export async function createAutomation(input: {
  organizationId: string
  name: string
  description?: string
  triggerType: string
  triggerConfig?: Record<string, unknown> | null
  schema?: { nodes: unknown[]; edges: unknown[] }
  folderId?: string | null
}) {
  const slug = await generateUniqueSlug(input.organizationId, input.name)

  return await prisma.automation.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      slug,
      description: input.description,
      triggerType: input.triggerType as Prisma.AutomationCreateInput['triggerType'],
      triggerConfig: (input.triggerConfig ?? undefined) as Prisma.InputJsonValue | undefined,
      schema: (input.schema ?? { nodes: [], edges: [] }) as Prisma.InputJsonValue,
      status: 'DRAFT',
      folderId: input.folderId ?? null,
    },
  })
}

/**
 * Update an existing automation's fields.
 *
 * WHY: Allows updating automation name, description, trigger config, and schema.
 * HOW: Verifies existence, then applies partial update.
 *
 * SOURCE OF TRUTH: AutomationUpdate
 *
 * @returns Updated automation or null if not found
 */
export async function updateAutomation(
  organizationId: string,
  automationId: string,
  data: {
    name?: string
    description?: string | null
    triggerType?: string
    triggerConfig?: Record<string, unknown> | null
    schema?: { nodes: unknown[]; edges: unknown[] }
  }
) {
  // Verify automation exists
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, organizationId },
  })

  if (!existing) {
    return null
  }

  // Build update data — only include defined fields
  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.triggerType !== undefined) updateData.triggerType = data.triggerType
  if (data.triggerConfig !== undefined) updateData.triggerConfig = data.triggerConfig
  if (data.schema !== undefined) updateData.schema = data.schema

  return await prisma.automation.update({
    where: { id: automationId },
    data: updateData,
  })
}

/**
 * Update automation status with validation.
 *
 * WHY: Status changes (especially ACTIVE) require schema validation.
 * HOW: Validates schema has nodes before allowing ACTIVE status.
 *
 * SOURCE OF TRUTH: AutomationStatusUpdate, AutomationActivation
 *
 * @returns Object with automation data or validation error info
 */
export async function updateAutomationStatus(
  organizationId: string,
  automationId: string,
  status: string
) {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, organizationId },
  })

  if (!existing) {
    return { found: false as const }
  }

  // Validate before activating
  if (status === 'ACTIVE') {
    const schema = existing.schema as { nodes?: unknown[]; edges?: unknown[] } | null
    if (!schema?.nodes || schema.nodes.length === 0) {
      return { found: true as const, validationError: 'Automation must have at least one node to be activated' }
    }
  }

  const automation = await prisma.automation.update({
    where: { id: automationId },
    data: { status: status as Prisma.AutomationUpdateInput['status'] },
  })

  return { found: true as const, automation }
}

/**
 * Delete a single automation (hard delete).
 *
 * WHY: Permanently removes automation. Runs are preserved with automationId set to null.
 * HOW: Verifies existence then hard deletes.
 *
 * SOURCE OF TRUTH: AutomationDelete, AutomationHardDelete
 *
 * @returns true if deleted, false if not found
 */
export async function deleteAutomation(organizationId: string, automationId: string) {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, organizationId },
  })

  if (!existing) {
    return false
  }

  await prisma.automation.delete({
    where: { id: automationId },
  })

  return true
}

/**
 * Bulk delete multiple automations (hard delete).
 *
 * WHY: Allows deleting multiple automations at once from the list view.
 * HOW: Verifies all exist, then deletes them all.
 *
 * SOURCE OF TRUTH: AutomationBulkDelete
 *
 * @returns Object with count of deleted or list of notFound IDs
 */
export async function bulkDeleteAutomations(
  organizationId: string,
  automationIds: string[]
) {
  const existing = await prisma.automation.findMany({
    where: {
      id: { in: automationIds },
      organizationId,
    },
    select: { id: true },
  })

  const existingIds = existing.map((a) => a.id)
  const notFoundIds = automationIds.filter((id) => !existingIds.includes(id))

  if (notFoundIds.length > 0) {
    return { notFoundIds }
  }

  const result = await prisma.automation.deleteMany({
    where: {
      id: { in: automationIds },
      organizationId,
    },
  })

  return { count: result.count }
}

/**
 * Duplicate an existing automation.
 *
 * WHY: Allows cloning an automation for quick iteration.
 * HOW: Fetches existing, creates copy with "(Copy)" suffix and DRAFT status.
 *
 * SOURCE OF TRUTH: AutomationDuplicate, AutomationClone
 *
 * @returns Duplicated automation or null if source not found
 */
export async function duplicateAutomation(organizationId: string, automationId: string) {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, organizationId },
  })

  if (!existing) {
    return null
  }

  const newName = `${existing.name} (Copy)`
  const slug = await generateUniqueSlug(organizationId, newName)

  const duplicate = await prisma.automation.create({
    data: {
      organizationId,
      name: newName,
      slug,
      description: existing.description,
      triggerType: existing.triggerType,
      triggerConfig: existing.triggerConfig ?? undefined,
      schema: existing.schema ?? { nodes: [], edges: [] },
      status: 'DRAFT',
    },
  })

  // Propagate origin marker if the source automation was installed from a template.
  // This ensures duplicated template-installed automations retain their lineage.
  const { propagateOriginMarker } = await import('@/lib/templates/origin-hash')
  await propagateOriginMarker(automationId, duplicate.id, 'AUTOMATION', organizationId)

  return duplicate
}

/**
 * List automation runs with pagination and filters.
 *
 * SOURCE OF TRUTH: AutomationRunList, RunHistory
 */
export async function listAutomationRuns(input: {
  organizationId: string
  automationId?: string
  page: number
  pageSize: number
  status?: string
}) {
  const { organizationId, automationId, page, pageSize, status } = input

  // Cast to Prisma type to satisfy enum constraints
  const where: Prisma.AutomationRunWhereInput = {
    organizationId,
    ...(automationId && { automationId }),
    ...(status && { status: status as Prisma.AutomationRunWhereInput['status'] }),
  }

  const [runs, total] = await Promise.all([
    prisma.automationRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        automationId: true,
        status: true,
        triggerData: true,
        currentNodeId: true,
        steps: true,
        error: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        automation: {
          select: {
            id: true,
            name: true,
            triggerType: true,
          },
        },
      },
    }),
    prisma.automationRun.count({ where }),
  ])

  return {
    runs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get a single automation run by ID with full details.
 *
 * SOURCE OF TRUTH: AutomationRunDetail
 */
export async function getAutomationRunById(organizationId: string, runId: string) {
  return await prisma.automationRun.findFirst({
    where: {
      id: runId,
      organizationId,
    },
    include: {
      automation: {
        select: {
          id: true,
          name: true,
          triggerType: true,
          schema: true,
        },
      },
    },
  })
}

// ============================================================================
// TRIGGER AUTOMATION
// ============================================================================

/**
 * Trigger automations for an event.
 *
 * This is the main entry point called from various services when events occur.
 * It finds all matching active automations and creates runs for each.
 *
 * @param triggerType - The type of trigger event
 * @param context - The trigger context with leadId and trigger-specific data
 * @returns Result with number triggered and IDs
 *
 * @example
 * // In form-submission.service.ts after processing submission:
 * await triggerAutomation('FORM_SUBMITTED', {
 *   organizationId: form.organizationId,
 *   leadId: lead.id,
 *   triggerData: {
 *     type: 'FORM_SUBMITTED',
 *     formId: form.id,
 *     formName: form.name,
 *     submissionId: submission.id,
 *     submissionData: input.data,
 *   },
 * })
 */
export async function triggerAutomation(
  triggerType: AutomationTriggerType,
  context: TriggerContext
): Promise<TriggerResult> {
  // Find all active automations matching this trigger type and config
  const automations = await findAutomationsForEvent(
    context.organizationId,
    triggerType,
    context.triggerData
  )

  if (automations.length === 0) {
    return { triggered: 0, automationIds: [], runIds: [] }
  }

  const runIds: string[] = []

  // Create a run for each matching automation
  for (const automation of automations) {
    const run = await createAutomationRun({
      automationId: automation.id,
      organizationId: context.organizationId,
      triggerData: {
        leadId: context.leadId,
        ...context.triggerData,
      },
    })

    runIds.push(run.id)

    // Dispatch to Trigger.dev for execution
    // This is done asynchronously - we don't wait for completion
    await dispatchToTriggerDev(automation.id, run.id, context)
  }

  return {
    triggered: automations.length,
    automationIds: automations.map((a) => a.id),
    runIds,
  }
}

/**
 * Find active automations matching a trigger event.
 *
 * Supports both v1 (triggerType column) and v2 (multi-trigger via schema) automations:
 *
 * v1: Queries by triggerType column → filters by triggerConfig
 * v2: Also queries ALL active automations for the org and checks schema trigger nodes
 *     connected to the Start node. This enables multi-trigger automations where
 *     ANY connected trigger can fire the automation.
 *
 * @param organizationId - Organization to search in
 * @param triggerType - Type of trigger event
 * @param triggerData - Trigger-specific data for config matching
 * @returns Array of matching automations (deduplicated by ID)
 */
export async function findAutomationsForEvent(
  organizationId: string,
  triggerType: AutomationTriggerType,
  triggerData: TriggerSpecificData
): Promise<Array<{ id: string; name: string; schema: unknown; triggerConfig: unknown }>> {
  // Type for automation query result
  type AutomationQueryResult = { id: string; name: string; schema: unknown; triggerConfig: unknown; triggerType: string }

  // Query ALL active automations for this org (supports v2 multi-trigger matching)
  const automations: AutomationQueryResult[] = await prisma.automation.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      schema: true,
      triggerConfig: true,
      triggerType: true,
    },
  })

  // Filter: automation matches if it has a matching trigger (v1 column or v2 schema)
  return automations.filter((automation: AutomationQueryResult) => {
    return automationMatchesEvent(automation, triggerType, triggerData)
  })
}

/**
 * Check if an automation matches an incoming trigger event.
 *
 * v2 (Start node): Inspects trigger nodes connected to the Start node in the schema.
 * Matches if ANY connected trigger node matches the event type AND config.
 *
 * v1 fallback: Uses the triggerType column + triggerConfig for matching.
 *
 * @param automation - The automation to check
 * @param eventType - The incoming event trigger type
 * @param triggerData - Event-specific data for config matching
 * @returns true if the automation should fire for this event
 */
function automationMatchesEvent(
  automation: { schema: unknown; triggerType: string; triggerConfig: unknown },
  eventType: AutomationTriggerType,
  triggerData: TriggerSpecificData
): boolean {
  const schema = automation.schema as { nodes?: Array<{ id: string; type: string; data?: Record<string, unknown> }>; edges?: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }> } | null

  // v2: Check trigger nodes connected to Start node
  if (schema?.nodes) {
    const startNode = schema.nodes.find((n) => n.id === 'start_node')
    if (startNode) {
      const triggerEdges = (schema.edges ?? []).filter(
        (e) => e.target === 'start_node' && e.targetHandle === 'triggers'
      )
      const triggerNodeIds = new Set(triggerEdges.map((e) => e.source))
      const triggerNodes = schema.nodes.filter(
        (n) => triggerNodeIds.has(n.id) && n.type === 'trigger'
      )

      // Match if ANY trigger node matches the event type and config
      return triggerNodes.some((triggerNode) => {
        const nodeData = triggerNode.data ?? {}
        const nodeTriggerType = (nodeData.triggerType as string)?.toUpperCase()
        if (nodeTriggerType !== eventType) return false

        // Check trigger config stored in the node's data.config
        const nodeConfig = (nodeData.config as Record<string, unknown>) ?? {}
        return matchesTriggerConfig(nodeConfig, triggerData)
      })
    }
  }

  // v1 fallback: use triggerType column + triggerConfig
  if (automation.triggerType !== eventType) return false
  return matchesTriggerConfig(automation.triggerConfig, triggerData)
}

/**
 * Check if trigger data matches automation's trigger config.
 *
 * For example:
 * - FORM_SUBMITTED with config { formId: "abc" } only matches if triggerData.formId === "abc"
 * - PAYMENT_COMPLETED with config { priceId: "xyz" } only matches if triggerData.priceId === "xyz"
 * - If no config specified (null/empty), matches all events of that type
 *
 * @param triggerConfig - The automation's trigger config (may be null)
 * @param triggerData - The actual trigger event data
 * @returns true if the config matches (or no config specified)
 */
function matchesTriggerConfig(
  triggerConfig: unknown,
  triggerData: TriggerSpecificData
): boolean {
  // No config = matches all events of this type
  if (!triggerConfig || typeof triggerConfig !== 'object') {
    return true
  }

  const config = triggerConfig as Record<string, unknown>

  // Check each config field against trigger data
  switch (triggerData.type) {
    case 'FORM_SUBMITTED':
      // If formId specified in config, must match
      if (config.formId && config.formId !== triggerData.formId) {
        return false
      }
      break

    case 'PIPELINE_TICKET_MOVED':
      // If pipelineId specified, must match
      if (config.pipelineId && config.pipelineId !== triggerData.pipelineId) {
        return false
      }
      // If toStageId specified (trigger when updating TO specific stage), must match
      if (config.toStageId && config.toStageId !== triggerData.toStageId) {
        return false
      }
      // If fromStageId specified (trigger when updating FROM specific stage), must match
      if (config.fromStageId && config.fromStageId !== triggerData.fromStageId) {
        return false
      }
      break

    case 'PAYMENT_COMPLETED':
      // priceId is most specific — if set, only match that exact price
      if (config.priceId && config.priceId !== triggerData.priceId) {
        return false
      }
      // productId matches any price under that product (broader filter)
      if (config.productId && !config.priceId && config.productId !== triggerData.productId) {
        return false
      }
      // minAmount filter — only trigger if payment meets the threshold
      // config.minAmount is in dollars, triggerData.amount is in cents
      if (config.minAmount && triggerData.amount < Number(config.minAmount) * 100) {
        return false
      }
      // currency filter — must match exactly (case-insensitive)
      if (config.currency && String(config.currency).toLowerCase() !== triggerData.currency.toLowerCase()) {
        return false
      }
      // Legacy: paymentLinkId matching (backward compat for existing automations)
      if (config.paymentLinkId && config.paymentLinkId !== triggerData.paymentLinkId) {
        return false
      }
      break

    /**
     * TRIAL_STARTED, SUBSCRIPTION_RENEWED, SUBSCRIPTION_CANCELLED
     * All share the same product/price filter pattern as PAYMENT_COMPLETED.
     */
    case 'TRIAL_STARTED':
      if (config.priceId && config.priceId !== triggerData.priceId) {
        return false
      }
      if (config.productId && !config.priceId && config.productId !== triggerData.productId) {
        return false
      }
      break

    case 'SUBSCRIPTION_RENEWED':
      if (config.priceId && config.priceId !== triggerData.priceId) {
        return false
      }
      if (config.productId && !config.priceId && config.productId !== triggerData.productId) {
        return false
      }
      if (config.minAmount && triggerData.amount < Number(config.minAmount) * 100) {
        return false
      }
      break

    case 'SUBSCRIPTION_CANCELLED':
      if (config.priceId && config.priceId !== triggerData.priceId) {
        return false
      }
      if (config.productId && !config.priceId && config.productId !== triggerData.productId) {
        return false
      }
      break

    case 'APPOINTMENT_SCHEDULED':
    case 'APPOINTMENT_STARTED':
      // If calendarId specified, must match
      if (config.calendarId && config.calendarId !== triggerData.calendarId) {
        return false
      }
      break

  }

  return true
}

// ============================================================================
// AUTOMATION RUN MANAGEMENT
// ============================================================================

/**
 * Create a new automation run record.
 *
 * Called when an automation is triggered. Creates the initial run record
 * with PENDING status before dispatching to Trigger.dev.
 */
export async function createAutomationRun(input: {
  automationId: string
  organizationId: string
  triggerData: Record<string, unknown>
}): Promise<{ id: string }> {
  const run = await prisma.automationRun.create({
    data: {
      automationId: input.automationId,
      organizationId: input.organizationId,
      triggerData: input.triggerData as Prisma.InputJsonValue,
      status: 'PENDING',
      steps: [],
    },
    select: { id: true },
  })

  return run
}

/**
 * Update an automation run's status and optionally other fields.
 *
 * Called by Trigger.dev task to update run progress.
 */
export async function updateAutomationRun(
  runId: string,
  data: {
    status?: AutomationRunStatus
    steps?: AutomationStepLog[]
    currentNodeId?: string | null
    triggerDevRunId?: string
    waitTokenId?: string | null
    error?: string | null
    startedAt?: Date
    completedAt?: Date
  }
): Promise<void> {
  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      ...(data.status && { status: data.status }),
      ...(data.steps && { steps: data.steps as unknown as Prisma.InputJsonValue }),
      ...(data.currentNodeId !== undefined && { currentNodeId: data.currentNodeId }),
      ...(data.triggerDevRunId && { triggerDevRunId: data.triggerDevRunId }),
      ...(data.waitTokenId !== undefined && { waitTokenId: data.waitTokenId }),
      ...(data.error !== undefined && { error: data.error }),
      ...(data.startedAt && { startedAt: data.startedAt }),
      ...(data.completedAt && { completedAt: data.completedAt }),
    },
  })
}

/**
 * Get an automation run by ID.
 */
export async function getAutomationRun(runId: string) {
  return prisma.automationRun.findUnique({
    where: { id: runId },
    include: {
      automation: {
        select: {
          id: true,
          name: true,
          schema: true,
          triggerType: true,
        },
      },
    },
  })
}

/**
 * Update automation statistics after a run completes.
 *
 * Called when a run finishes (completed or failed) to update
 * the parent automation's stats.
 */
export async function updateAutomationStats(
  automationId: string,
  success: boolean
): Promise<void> {
  await prisma.automation.update({
    where: { id: automationId },
    data: {
      totalRuns: { increment: 1 },
      ...(success
        ? { successfulRuns: { increment: 1 } }
        : { failedRuns: { increment: 1 } }),
      lastRunAt: new Date(),
    },
  })
}

// ============================================================================
// TRIGGER.DEV DISPATCH
// ============================================================================

/**
 * Dispatch an automation run to Trigger.dev for execution.
 *
 * This function triggers the Trigger.dev task that will:
 * 1. Walk through the automation's nodes
 * 2. Execute each action with interpolated variables
 * 3. Handle conditions, delays, and wait-for-event actions
 * 4. Update run status and logs
 *
 * @param automationId - The automation to execute
 * @param runId - The run record ID
 * @param context - The trigger context with lead and event data
 */
async function dispatchToTriggerDev(
  automationId: string,
  runId: string,
  context: TriggerContext
): Promise<void> {
  try {
    // Dynamic import to avoid issues if trigger.dev is not configured
    const { automationExecutionTask } = await import('@/lib/trigger/automation/execution-task')

    // Trigger the task and store the Trigger.dev run ID for debugging/correlation.
    // Cast triggerData to Record<string, unknown> for Trigger.dev schema compatibility.
    const handle = await automationExecutionTask.trigger({
      automationId,
      runId,
      organizationId: context.organizationId,
      leadId: context.leadId ?? '',
      triggerData: context.triggerData as unknown as Record<string, unknown>,
    })

    // Store the Trigger.dev run ID so we can correlate our DB run with the task
    if (handle?.id) {
      await updateAutomationRun(runId, { triggerDevRunId: handle.id })
    }
  } catch (error) {
    // Log error but don't fail - the run is already created
    // Mark run as failed if we can't dispatch
    console.error('Failed to dispatch automation to Trigger.dev:', error)

    await updateAutomationRun(runId, {
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Failed to dispatch to Trigger.dev',
      completedAt: new Date(),
    })

    // Still update stats to track the failure
    await updateAutomationStats(automationId, false)
  }
}

// ============================================================================
// RESUME WAITING AUTOMATION
// ============================================================================

/**
 * Resume an automation run that was waiting for an event.
 *
 * Called when the waited-for event occurs (e.g., appointment starts,
 * email opened, etc.). Finds runs waiting for this event and resumes them.
 *
 * @param waitTokenId - The wait token to match
 * @param eventData - Additional data from the event
 */
export async function resumeWaitingAutomation(
  waitTokenId: string,
  eventData?: Record<string, unknown>
): Promise<void> {
  // Find the waiting run
  const run = await prisma.automationRun.findFirst({
    where: {
      waitTokenId,
      status: 'WAITING',
    },
    select: {
      id: true,
      automationId: true,
      organizationId: true,
      triggerData: true,
      currentNodeId: true,
    },
  })

  if (!run || !run.automationId) {
    console.warn(`No waiting automation found for waitTokenId: ${waitTokenId}`)
    return
  }

  try {
    // Dynamic import
    const { automationExecutionTask } = await import('@/lib/trigger/automation/execution-task')

    // Resume the task from where it left off
    // Cast triggerData to Record<string, unknown> for Trigger.dev schema compatibility
    await automationExecutionTask.trigger({
      automationId: run.automationId,
      runId: run.id,
      organizationId: run.organizationId,
      leadId: ((run.triggerData as Record<string, unknown>)?.leadId as string) ?? '',
      triggerData: run.triggerData as unknown as Record<string, unknown>,
      resumeFromNodeId: run.currentNodeId ?? undefined,
      resumeEventData: eventData,
    })

    // Clear the wait token
    await updateAutomationRun(run.id, {
      waitTokenId: null,
      status: 'RUNNING',
    })
  } catch (error) {
    console.error('Failed to resume waiting automation:', error)

    await updateAutomationRun(run.id, {
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Failed to resume automation',
      completedAt: new Date(),
    })
  }
}

// ============================================================================
// RESUME WAITING AUTOMATIONS BY EVENT (PATTERN-BASED)
// ============================================================================

/**
 * Resume ALL automation runs waiting for a specific event type and identifier.
 *
 * Unlike resumeWaitingAutomation() which matches an exact token, this function
 * uses a `startsWith` query to find all runs whose waitTokenId begins with
 * the given prefix. This enables batch resumption — e.g., when an appointment
 * starts, ALL automations waiting on that specific booking are resumed.
 *
 * TOKEN FORMAT: `appt_start:{bookingId}:` → matches `appt_start:{bookingId}:{runId}`
 *
 * @param tokenPrefix - The prefix to match against waitTokenId (e.g., "appt_start:abc123:")
 * @param eventData - Optional data from the triggering event, passed to the resumed task
 * @returns Number of automations resumed
 */
export async function resumeWaitingAutomationsByEvent(
  tokenPrefix: string,
  eventData?: Record<string, unknown>
): Promise<number> {
  // Find ALL waiting runs whose token starts with this prefix
  const waitingRuns = await prisma.automationRun.findMany({
    where: {
      waitTokenId: { startsWith: tokenPrefix },
      status: 'WAITING',
    },
    select: {
      id: true,
      automationId: true,
      organizationId: true,
      triggerData: true,
      currentNodeId: true,
    },
  })

  if (waitingRuns.length === 0) {
    console.log(`No waiting automations found for token prefix: ${tokenPrefix}`)
    return 0
  }

  console.log(`Found ${waitingRuns.length} waiting automation(s) for prefix: ${tokenPrefix}`)

  // Dynamic import to avoid circular dependency
  const { automationExecutionTask } = await import('@/lib/trigger/automation/execution-task')

  let resumed = 0

  for (const run of waitingRuns) {
    if (!run.automationId) continue

    try {
      // Resume the task from where it left off
      await automationExecutionTask.trigger({
        automationId: run.automationId,
        runId: run.id,
        organizationId: run.organizationId,
        leadId: ((run.triggerData as Record<string, unknown>)?.leadId as string) ?? '',
        triggerData: run.triggerData as unknown as Record<string, unknown>,
        resumeFromNodeId: run.currentNodeId ?? undefined,
        resumeEventData: eventData,
      })

      // Clear the wait token and mark as running
      await updateAutomationRun(run.id, {
        waitTokenId: null,
        status: 'RUNNING',
      })

      resumed++
    } catch (error) {
      console.error(`Failed to resume waiting automation ${run.id}:`, error)

      await updateAutomationRun(run.id, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Failed to resume automation',
        completedAt: new Date(),
      })
    }
  }

  return resumed
}

// ============================================================================
// CANCEL AUTOMATION RUN
// ============================================================================

/**
 * Cancel an automation run.
 *
 * Can be called to stop a running or waiting automation.
 *
 * @param runId - The run to cancel
 * @param organizationId - For security validation
 */
export async function cancelAutomationRun(
  runId: string,
  organizationId: string
): Promise<boolean> {
  const run = await prisma.automationRun.findFirst({
    where: {
      id: runId,
      organizationId,
      status: { in: ['PENDING', 'RUNNING', 'WAITING'] },
    },
  })

  if (!run) {
    return false
  }

  await updateAutomationRun(runId, {
    status: 'CANCELLED',
    completedAt: new Date(),
  })

  // Update stats
  if (run.automationId) {
    await updateAutomationStats(run.automationId, false)
  }

  return true
}
