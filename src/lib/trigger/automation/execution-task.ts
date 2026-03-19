/**
 * AUTOMATION EXECUTION TASK
 *
 * Trigger.dev task that executes automation workflows.
 * Walks through automation nodes, executes actions, handles conditions and delays.
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationExecutionTask, WorkflowExecution, AutomationRunner
 *
 * EXECUTION FLOW:
 * 1. Receive automation ID, run ID, and trigger context
 * 2. Fetch automation schema (nodes and edges)
 * 3. Build variable context for the lead + trigger data
 * 4. Walk through nodes following edge connections:
 *    - Execute action nodes (send email, update lead, etc.)
 *    - Evaluate condition nodes (if/else branching)
 *    - Handle delay nodes (wait X minutes/hours/days)
 *    - Handle wait-for-event nodes (pause until external event)
 * 5. Update run status and step logs after each node
 * 6. Mark run as completed/failed when done
 *
 * ACTION EXECUTORS:
 * - send_email: Render template and send via Resend
 * - add_tag: Add tag to lead
 * - remove_tag: Remove tag from lead
 * - create_pipeline_ticket: Create new ticket in pipeline
 * - update_pipeline_ticket: Move existing ticket to new stage
 * - send_notification: Send internal notification
 * - call_webhook: Make HTTP request to external URL
 */

import { schemaTask, logger, wait } from '@trigger.dev/sdk'
import { z } from 'zod'
import {
  updateAutomationRun,
  updateAutomationStats,
  getAutomationSchemaForExecution,
  type AutomationStepLog,
} from '@/services/automation.service'
import { buildAutomationContext } from '@/lib/variables/context-builder'
import { interpolate } from '@/lib/variables/interpolate'
import type { VariableContext } from '@/lib/variables/types'

// Service imports for action executors
import { renderTemplateForLead } from '@/services/email-template.service'
import { sendMarketingEmail } from '@/services/email.service'
import {
  addTagToLeadForAutomation,
  removeTagFromLeadForAutomation,
} from '@/services/leads.service'
import {
  createTicketForLead,
  findTicketByLeadId,
  moveTicketToLane,
} from '@/services/pipeline.service'
import { getOrganizationMembers } from '@/services/membership.service'
import { createBulkNotifications } from '@/services/notification.service'

// ============================================================================
// SKIP ACTION ERROR
// ============================================================================

/**
 * Thrown by action executors when a step cannot execute due to missing data,
 * NOT a system error. The execution loop catches this separately from regular
 * errors to mark the step as "skipped" instead of "failed."
 *
 * Examples: lead has no email, no ticket found to update, no lead attached.
 * System errors (API down, DB timeout) should throw regular Error instead.
 *
 * SOURCE OF TRUTH KEYWORDS: SkipActionError, GracefulSkip, AutomationSkip
 */
class SkipActionError extends Error {
  /** Human-readable reason displayed in the run history UI */
  readonly skipReason: string

  constructor(skipReason: string) {
    super(`Skip: ${skipReason}`)
    this.name = 'SkipActionError'
    this.skipReason = skipReason
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Node structure from React Flow schema.
 */
interface AutomationNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

/**
 * Edge structure from React Flow schema.
 */
interface AutomationEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

/**
 * Automation schema structure.
 */
interface AutomationSchema {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
}

/**
 * Task input payload.
 */
interface ExecutionPayload {
  automationId: string
  runId: string
  organizationId: string
  leadId: string
  /** Trigger-specific data (cast from Record<string, unknown> due to Zod schema) */
  triggerData: Record<string, unknown>
  resumeFromNodeId?: string
  resumeEventData?: Record<string, unknown>
}

// ============================================================================
// MAIN TASK
// ============================================================================

/**
 * Automation execution task.
 *
 * This is the main entry point for executing automations.
 * Called by automation.service.ts when a trigger fires.
 */
export const automationExecutionTask = schemaTask({
  id: 'automation-execution',
  // Retry configuration
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  // Schema validation
  schema: z.object({
    automationId: z.string(),
    runId: z.string(),
    organizationId: z.string(),
    leadId: z.string(),
    triggerData: z.record(z.string(), z.unknown()),
    resumeFromNodeId: z.string().optional(),
    resumeEventData: z.record(z.string(), z.unknown()).optional(),
  }),
  run: async (payload: ExecutionPayload) => {
    const { automationId, runId, organizationId, leadId, triggerData, resumeFromNodeId } = payload

    logger.info('Starting automation execution', { automationId, runId, leadId })

    try {
      // Mark run as running
      await updateAutomationRun(runId, {
        status: 'RUNNING',
        startedAt: new Date(),
      })

      // Fetch automation schema via automation service (DAL pattern)
      const automation = await getAutomationSchemaForExecution(automationId)

      if (!automation) {
        throw new Error(`Automation not found: ${automationId}`)
      }

      const schema = automation.schema as unknown as AutomationSchema
      if (!schema?.nodes || schema.nodes.length === 0) {
        throw new Error('Automation has no nodes')
      }

      // Build variable context
      const context = await buildAutomationContext(organizationId, leadId, {
        type: triggerData.type as string,
        ...triggerData,
      })

      logger.info('Built variable context', {
        leadId,
        hasTransaction: !!context.lead.transaction?.id,
        hasTrigger: !!context.trigger,
      })

      // Initialize step logs
      const stepLogs: AutomationStepLog[] = []

      // Find starting node: Start node's sequence target, trigger fallback, or resume point
      let currentNodeId = resumeFromNodeId ?? findFirstExecutionNode(schema)

      if (!currentNodeId) {
        throw new Error('No starting node found')
      }

      // Walk through nodes
      while (currentNodeId) {
        const node = schema.nodes.find((n) => n.id === currentNodeId)

        if (!node) {
          logger.warn(`Node not found: ${currentNodeId}`)
          break
        }

        // Extract node metadata for detailed logging
        const nodeData = node.data || {}
        const nodeName = (nodeData.label as string) || (nodeData.name as string) || node.id
        const actionType = (nodeData.actionType as string) || (nodeData.triggerType as string)

        logger.info(`Executing node: ${node.id} (${node.type})`, { nodeName, actionType })

        // Record start time for duration calculation
        const stepStartTime = Date.now()

        // Create step log entry with enhanced details
        const stepLog: AutomationStepLog = {
          nodeId: node.id,
          nodeName,
          nodeType: node.type,
          actionType,
          status: 'running',
          startedAt: new Date().toISOString(),
          // Store sanitized input data for debugging (exclude sensitive fields)
          input: sanitizeInputForLogging(nodeData),
        }

        try {
          // Execute node based on type
          const result = await executeNode(node, context, payload)

          // Calculate duration
          const stepEndTime = Date.now()
          const durationMs = stepEndTime - stepStartTime

          stepLog.status = 'completed'
          stepLog.completedAt = new Date().toISOString()
          stepLog.durationMs = durationMs
          stepLog.result = result

          // Override to 'skipped' if the condition node had no conditions configured.
          // This gives clear UI feedback: "Skipped: No conditions configured" instead of "Completed".
          const resultRecord = result as Record<string, unknown> | undefined
          if (resultRecord?.result && (resultRecord.result as Record<string, unknown>).unconfigured === true) {
            stepLog.status = 'skipped'
            stepLog.skipReason = ((resultRecord.result as Record<string, unknown>).reason as string) ?? 'No conditions configured'
          }

          // Handle condition node branch tracking (if_else: 'true'/'false', branch: branchId or 'default')
          if (result?.branchTaken) {
            stepLog.branchTaken = result.branchTaken
          }

          // Handle special results
          if (result?.action === 'wait') {
            // Pause execution - will be resumed later.
            // Calculate the NEXT node from graph edges so resumption continues
            // from the correct node (result.nextNodeId is undefined for wait nodes).
            const nextAfterWait = findNextNode(schema.edges, node.id)
            stepLog.status = 'completed'
            stepLogs.push(stepLog)

            await updateAutomationRun(runId, {
              status: 'WAITING',
              steps: stepLogs,
              currentNodeId: nextAfterWait ?? null,
              waitTokenId: result.waitTokenId,
            })

            logger.info('Automation paused for wait', { waitTokenId: result.waitTokenId })
            return { status: 'waiting', waitTokenId: result.waitTokenId }
          }

          stepLogs.push(stepLog)

          // Update run with current progress
          await updateAutomationRun(runId, {
            steps: stepLogs,
            currentNodeId: node.id,
          })

          // Find next node
          if (result?.nextNodeId) {
            // Condition node specified next node explicitly
            currentNodeId = result.nextNodeId
          } else if (result?.branchTaken) {
            // Condition node — follow edge based on branch taken (if_else: 'true'/'false', branch: branchId or 'default')
            currentNodeId = findNextNodeByBranch(schema.edges, node.id, result.branchTaken)
          } else {
            // Follow edge to next node
            currentNodeId = findNextNode(schema.edges, node.id)
          }
        } catch (error) {
          // Calculate duration even for skipped/failed steps
          const stepEndTime = Date.now()
          const durationMs = stepEndTime - stepStartTime
          stepLog.completedAt = new Date().toISOString()
          stepLog.durationMs = durationMs

          if (error instanceof SkipActionError) {
            // SKIP — missing data, not a system error. Step is "skipped", automation continues.
            // Run can still be COMPLETED if no steps actually fail.
            stepLog.status = 'skipped'
            stepLog.skipReason = error.skipReason
            logger.info(`Node ${node.id} skipped: ${error.skipReason}`, { nodeName, actionType })
          } else {
            // FAIL — system/infrastructure error (API down, DB timeout, etc.)
            stepLog.status = 'failed'
            stepLog.error = error instanceof Error ? error.message : 'Unknown error'
            logger.error(`Node ${node.id} failed`, { error, nodeName, actionType })
          }

          stepLogs.push(stepLog)

          // Continue to next node regardless (don't halt the automation)
          currentNodeId = findNextNode(schema.edges, node.id)
        }
      }

      // Determine final run status:
      // - FAILED: at least one step has status 'failed' (system/infrastructure error)
      // - COMPLETED: all steps completed or skipped (missing data is NOT a failure)
      const failedSteps = stepLogs.filter((step) => step.status === 'failed')
      const skippedSteps = stepLogs.filter((step) => step.status === 'skipped')

      if (failedSteps.length > 0) {
        // Build a descriptive error message listing which steps failed
        const failedStepNames = failedSteps.map((step) => step.nodeName)
        const errorMessage = `${failedSteps.length} step(s) failed: ${failedStepNames.join(', ')}`

        await updateAutomationRun(runId, {
          status: 'FAILED',
          steps: stepLogs,
          error: errorMessage,
          completedAt: new Date(),
        })

        // Count as a failed run in automation stats
        await updateAutomationStats(automationId, false)

        logger.warn('Automation completed with step failures', {
          automationId,
          runId,
          failedSteps: failedStepNames,
          skippedSteps: skippedSteps.map((s) => s.nodeName),
        })

        return { status: 'failed', steps: stepLogs.length, failedSteps: failedSteps.length }
      }

      // No failed steps — run is COMPLETED (skipped steps are fine, not errors)
      await updateAutomationRun(runId, {
        status: 'COMPLETED',
        steps: stepLogs,
        completedAt: new Date(),
      })

      await updateAutomationStats(automationId, true)

      // Log skipped steps for visibility if any were skipped
      if (skippedSteps.length > 0) {
        logger.info('Automation completed with skipped steps', {
          automationId,
          runId,
          skippedSteps: skippedSteps.map((s) => `${s.nodeName}: ${s.skipReason}`),
        })
      } else {
        logger.info('Automation completed successfully', { automationId, runId })
      }

      return { status: 'completed', steps: stepLogs.length, skippedSteps: skippedSteps.length }
    } catch (error) {
      logger.error('Automation execution failed', { error, automationId, runId })

      // Mark run as failed
      await updateAutomationRun(runId, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      })

      // Update automation stats
      await updateAutomationStats(automationId, false)

      // IMPORTANT: Do NOT re-throw the error here.
      // Re-throwing causes Trigger.dev to retry the task, which:
      // 1. Resets status back to RUNNING (overwriting FAILED)
      // 2. Increments failedRuns stats multiple times per run
      // 3. If the retry is killed by maxDuration timeout, status stays stuck at RUNNING forever
      // Our error handling is complete — FAILED status and stats are already set.
      return { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' }
    }
  },
})

// ============================================================================
// NODE EXECUTION
// ============================================================================

/**
 * Execute a single node based on its type.
 */
async function executeNode(
  node: AutomationNode,
  context: VariableContext,
  payload: ExecutionPayload
): Promise<{ action?: string; nextNodeId?: string; waitTokenId?: string; result?: unknown; branchTaken?: string } | void> {
  const nodeData = node.data || {}

  switch (node.type) {
    // Trigger and Start nodes don't execute anything — they're for matching/routing only
    case 'trigger':
    case 'start':
      return

    // Action nodes
    case 'action':
      return executeAction(nodeData, context, payload)

    // Condition nodes
    case 'condition':
      return executeCondition(nodeData, context)

    default:
      logger.warn(`Unknown node type: ${node.type}`)
      return
  }
}

/**
 * Execute an action node.
 */
async function executeAction(
  data: Record<string, unknown>,
  context: VariableContext,
  payload: ExecutionPayload
): Promise<{ action?: string; result?: unknown; waitTokenId?: string; nextNodeId?: string; branchTaken?: string } | void> {
  const actionType = data.actionType as string

  switch (actionType) {
    case 'send_email':
      return executeSendEmail(data, context, payload)

    case 'add_tag':
      return executeAddTag(data, context, payload)

    case 'remove_tag':
      return executeRemoveTag(data, context, payload)

    case 'create_pipeline_ticket':
      return executeCreatePipelineTicket(data, context, payload)

    case 'update_pipeline_ticket':
      return executeUpdatePipelineTicket(data, context, payload)

    case 'wait_delay':
      return executeWaitDelay(data)

    case 'wait_for_event':
      return executeWaitForEvent(data, payload)

    case 'send_notification':
      return executeSendNotification(data, context, payload)

    case 'call_webhook':
      return executeCallWebhook(data, context)

    default:
      logger.warn(`Unknown action type: ${actionType}`)
      return
  }
}

// ============================================================================
// ACTION EXECUTORS
// ============================================================================

/**
 * Send email action — supports two modes:
 *
 * TEMPLATE MODE (default):
 * Uses a pre-built email template. Renders blocks to HTML, interpolates
 * variables, then sends via Resend.
 *
 * BODY MODE:
 * Sends a plain-text email. Subject and body are interpolated for
 * {{variable}} replacement, then sent directly via Resend.
 *
 * Config fields (from SendEmailActionConfig):
 * - mode: 'template' | 'body' (defaults to 'template')
 * - emailTemplateId: Template ID (required in template mode)
 * - subjectOverride: Optional subject override (template mode)
 * - subject: Subject line (required in body mode)
 * - body: Plain text body with {{variables}} (required in body mode)
 * - fromEmail: Sender email address (required)
 * - fromName: Sender display name (required)
 *
 * Recipient is auto-resolved from context (lead.email).
 */
async function executeSendEmail(
  data: Record<string, unknown>,
  context: VariableContext,
  payload: ExecutionPayload
): Promise<{ result: unknown }> {
  const config = (data.config as Record<string, unknown>) || {}
  const mode = (config.mode as string) || 'template'
  const fromEmail = config.fromEmail as string | undefined
  const fromName = config.fromName as string | undefined

  if (!fromEmail) {
    throw new Error('Sender email address is required')
  }
  if (!fromName) {
    throw new Error('Sender name is required')
  }

  const recipient = context.lead.email

  // Skip if lead has no email — can't send to nobody
  if (!recipient) {
    throw new SkipActionError('Lead has no email address')
  }

  /** Build the from header: "Display Name <email>" or just "email" */
  const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail

  if (mode === 'body') {
    /* ── BODY MODE: plain text with variable interpolation ── */
    const rawSubject = config.subject as string
    const rawBody = config.body as string

    if (!rawSubject) throw new Error('Email subject is required')
    if (!rawBody) throw new Error('Email body is required')

    /** Interpolate {{variables}} in both subject and body */
    const subject = interpolate(rawSubject, context)
    const emailBody = interpolate(rawBody, context)

    /** Send plain text — data.body is picked first by sendMarketingEmail */
    const result = await sendMarketingEmail({
      template: 'campaign',
      to: recipient,
      subject,
      data: { body: emailBody },
      fromOrganizationId: payload.organizationId,
      from: fromHeader,
    })

    logger.info('Plain text email sent', { to: recipient, from: fromEmail, mode: 'body' })
    return { result: { success: true, messageId: result?.messageId } }
  }

  /* ── TEMPLATE MODE (existing behavior) ── */
  const templateId = config.emailTemplateId as string
  const subjectOverride = config.subjectOverride as string | undefined

  if (!templateId) {
    throw new Error('Email template ID is required')
  }

  const rendered = await renderTemplateForLead(templateId, payload.organizationId, payload.leadId)
  if (!rendered) {
    throw new Error('Failed to render email template')
  }

  /** Use subject override if provided, otherwise use template subject */
  let subject = subjectOverride || rendered.subject
  subject = interpolate(subject, context)

  const result = await sendMarketingEmail({
    template: 'campaign',
    to: recipient,
    subject,
    data: { html: rendered.html },
    fromOrganizationId: payload.organizationId,
    from: fromHeader,
  })

  logger.info('Template email sent', { to: recipient, from: fromEmail, templateId })
  return { result: { success: true, messageId: result?.messageId } }
}

/**
 * Add tag action — supports multiple tags per action node.
 *
 * Config fields (from AddTagActionConfig):
 * - tags: Array of { id, name } objects to add
 */
async function executeAddTag(
  data: Record<string, unknown>,
  _context: VariableContext,
  payload: ExecutionPayload
): Promise<{ result: unknown }> {
  const config = (data.config as Record<string, unknown>) || {}
  const tags = config.tags as Array<{ id: string; name: string }> | undefined

  if (!tags || tags.length === 0) {
    throw new Error('At least one tag is required')
  }

  // Skip if no lead is attached to this execution
  if (!payload.leadId) {
    throw new SkipActionError('No lead attached to add tags to')
  }

  /** Add each tag sequentially to the lead, skipping individual tag errors */
  const results = []
  for (const tag of tags) {
    try {
      const result = await addTagToLeadForAutomation(payload.leadId, tag.id)
      results.push({ tagId: tag.id, tagName: tag.name, ...result })
    } catch (err) {
      // Log individual tag failure but continue with the rest
      logger.warn(`Failed to add tag "${tag.name}" to lead`, { tagId: tag.id, error: err })
      results.push({ tagId: tag.id, tagName: tag.name, skipped: true })
    }
  }

  logger.info('Tags added to lead', { leadId: payload.leadId, tagCount: tags.length, results })

  return { result: { added: results } }
}

/**
 * Remove tag action — supports multiple tags per action node.
 *
 * Config fields (from RemoveTagActionConfig):
 * - tags: Array of { id, name } objects to remove
 */
async function executeRemoveTag(
  data: Record<string, unknown>,
  _context: VariableContext,
  payload: ExecutionPayload
): Promise<{ result: unknown }> {
  const config = (data.config as Record<string, unknown>) || {}
  const tags = config.tags as Array<{ id: string; name: string }> | undefined

  if (!tags || tags.length === 0) {
    throw new Error('At least one tag is required')
  }

  // Skip if no lead is attached to this execution
  if (!payload.leadId) {
    throw new SkipActionError('No lead attached to remove tags from')
  }

  /** Remove each tag sequentially from the lead, skipping individual tag errors */
  const results = []
  for (const tag of tags) {
    try {
      const result = await removeTagFromLeadForAutomation(payload.leadId, tag.id)
      results.push({ tagId: tag.id, tagName: tag.name, ...result })
    } catch (err) {
      // Log individual tag failure but continue with the rest
      logger.warn(`Failed to remove tag "${tag.name}" from lead`, { tagId: tag.id, error: err })
      results.push({ tagId: tag.id, tagName: tag.name, skipped: true })
    }
  }

  logger.info('Tags removed from lead', { leadId: payload.leadId, tagCount: tags.length, results })

  return { result: { removed: results } }
}

/**
 * Create pipeline ticket action.
 * Note: stageId in config maps to laneId in Prisma schema (lanes are displayed as "stages" in UI)
 *
 * Config fields (from CreatePipelineTicketActionConfig):
 * - pipelineId: ID of the pipeline
 * - pipelineName: Display name (UI only)
 * - stageId: ID of the stage (maps to laneId in Prisma)
 * - stageName: Display name (UI only)
 * - titleTemplate: Title template with variable support
 * - descriptionTemplate: Description template with variable support
 * - valueTemplate: Value template (for deal value)
 */
async function executeCreatePipelineTicket(
  data: Record<string, unknown>,
  context: VariableContext,
  payload: ExecutionPayload
): Promise<{ result: unknown }> {
  // Config is stored in data.config
  const config = (data.config as Record<string, unknown>) || {}
  // stageId from config is actually the laneId in Prisma
  const laneId = config.stageId as string
  const titleTemplate = config.titleTemplate as string | undefined
  const descriptionTemplate = config.descriptionTemplate as string | undefined
  const valueTemplate = config.valueTemplate as string | undefined

  if (!laneId) {
    throw new Error('Lane ID (stageId) is required to create a ticket')
  }

  // Skip if no lead is attached — can't create a ticket without a lead
  if (!payload.leadId) {
    throw new SkipActionError('No lead attached to create a pipeline ticket for')
  }

  // Interpolate title and description
  const interpolatedTitle = titleTemplate ? interpolate(titleTemplate, context) : `Ticket for ${context.lead.fullName}`
  const interpolatedDescription = descriptionTemplate ? interpolate(descriptionTemplate, context) : undefined

  // Parse value from template if provided
  let ticketValue = context.lead.cltv ?? 0
  if (valueTemplate) {
    const interpolatedValue = interpolate(valueTemplate, context)
    const parsed = parseFloat(interpolatedValue)
    if (!isNaN(parsed)) {
      ticketValue = parsed
    }
  }

  // Use pipeline service to create ticket
  const ticket = await createTicketForLead({
    laneId,
    leadId: payload.leadId,
    title: interpolatedTitle,
    description: interpolatedDescription,
    value: ticketValue,
  })

  logger.info('Pipeline ticket created', { ticketId: ticket.id, laneId })

  return { result: { created: true, ticketId: ticket.id } }
}

/**
 * Update pipeline ticket action.
 * Note: toStageId in config maps to laneId in Prisma schema (lanes are displayed as "stages" in UI)
 *
 * Config fields (from UpdatePipelineTicketActionConfig):
 * - pipelineId: ID of the pipeline
 * - pipelineName: Display name (UI only)
 * - toStageId: ID of the target stage (maps to laneId in Prisma)
 * - toStageName: Display name (UI only)
 */
async function executeUpdatePipelineTicket(
  data: Record<string, unknown>,
  _context: VariableContext,
  payload: ExecutionPayload
): Promise<{ result: unknown }> {
  // Config is stored in data.config
  const config = (data.config as Record<string, unknown>) || {}
  // toStageId from config is actually the target laneId in Prisma
  const toLaneId = config.toStageId as string

  if (!toLaneId) {
    throw new Error('Target lane ID (toStageId) is required')
  }

  // Skip if no lead is attached — can't find a ticket without a lead
  if (!payload.leadId) {
    throw new SkipActionError('No lead attached to update pipeline ticket for')
  }

  // Find the most recent ticket for this lead using pipeline service
  const ticket = await findTicketByLeadId(payload.leadId)

  if (!ticket) {
    throw new SkipActionError('No pipeline ticket found for this lead')
  }

  // Move ticket to target lane
  const updatedTicket = await moveTicketToLane(ticket.id, toLaneId)

  logger.info('Pipeline ticket updated', { ticketId: updatedTicket.id, toLaneId })

  return { result: { updated: true, ticketId: updatedTicket.id, toLaneId } }
}

/**
 * Wait delay action.
 * Uses Trigger.dev's wait.for() to pause execution.
 *
 * Config fields (from WaitDelayActionConfig):
 * - delayAmount: Number of units to wait
 * - delayUnit: Unit of time ('minutes', 'hours', 'days')
 */
async function executeWaitDelay(data: Record<string, unknown>): Promise<void> {
  // Config is stored in data.config
  const config = (data.config as Record<string, unknown>) || {}
  const amount = config.delayAmount as number
  const unit = config.delayUnit as 'minutes' | 'hours' | 'days'

  if (!amount || !unit) {
    throw new Error('Wait amount and unit are required')
  }

  // Convert to appropriate format
  let waitDuration: string
  switch (unit) {
    case 'minutes':
      waitDuration = `${amount}m`
      break
    case 'hours':
      waitDuration = `${amount}h`
      break
    case 'days':
      waitDuration = `${amount * 24}h`
      break
    default:
      waitDuration = `${amount}m`
  }

  logger.info('Waiting', { amount, unit, waitDuration })

  // Use Trigger.dev wait
  await wait.for({ seconds: amount * (unit === 'minutes' ? 60 : unit === 'hours' ? 3600 : 86400) })
}

/**
 * Wait for event action.
 * Pauses execution until an external event occurs.
 *
 * DETERMINISTIC TOKEN FORMAT (by event type):
 * - appointment_started: `appt_start:{appointmentId}:{runId}`
 *   → Enables pattern-based lookup: find ALL runs waiting for a specific booking
 * - email events: `email_{type}:{runId}_{timestamp}` (generic, for future use)
 *
 * Config fields (from WaitForEventActionConfig):
 * - eventType: Type of event to wait for
 * - sourceEmailNodeId: ID of the Send Email node to track (email events)
 * - calendarId: Calendar filter for appointment events
 * - timeoutHours: Maximum hours to wait (optional)
 * - timeoutAction: What to do on timeout ('continue', 'stop')
 */
async function executeWaitForEvent(
  data: Record<string, unknown>,
  payload: ExecutionPayload
): Promise<{ action: 'wait'; waitTokenId: string; nextNodeId?: string }> {
  // Config is stored in data.config
  const config = (data.config as Record<string, unknown>) || {}
  const eventType = config.eventType as string
  const timeoutHours = config.timeoutHours as number | undefined

  if (!eventType) {
    throw new Error('Event type is required')
  }

  // Generate deterministic wait token based on event type.
  // Appointment tokens use the bookingId from triggerData so the scheduler
  // can find ALL runs waiting for a specific appointment via startsWith query.
  let waitTokenId: string

  if (eventType === 'appointment_started') {
    const appointmentId = payload.triggerData.appointmentId as string | undefined
    if (appointmentId) {
      waitTokenId = `appt_start:${appointmentId}:${payload.runId}`
    } else {
      // Fallback if no appointmentId in trigger data (shouldn't happen for APPOINTMENT_SCHEDULED)
      waitTokenId = `appt_start:unknown:${payload.runId}`
    }
  } else {
    // Email events and other future event types use generic format
    waitTokenId = `email_${eventType}:${payload.runId}_${Date.now()}`
  }

  logger.info('Setting up wait for event', { eventType, waitTokenId, timeoutHours })

  // Return wait action - the automation service will handle resumption
  return {
    action: 'wait',
    waitTokenId,
    nextNodeId: undefined, // Next node determined by graph edges in the main loop
  }
}

/**
 * Send notification action.
 * Sends internal notifications to team members via 3 channels:
 * - In-app: Creates Notification records + emits realtime events + sends web push to PWA devices
 * - Email: Sends HTML email via the marketing email system
 * - Both: Sends in-app + email simultaneously
 *
 * Uses membership.service.ts for member lookup (DAL pattern).
 * Uses notification.service.ts for in-app notification creation + push delivery.
 *
 * TRIGGER.DEV COMPATIBLE: All dependencies (Prisma, Upstash, web-push) are HTTP-based
 * and work from Trigger.dev's cloud environment without a Next.js server context.
 */
async function executeSendNotification(
  data: Record<string, unknown>,
  context: VariableContext,
  payload: ExecutionPayload
): Promise<{ result: unknown }> {
  const config = (data.config as Record<string, unknown>) || {}
  const titleTemplate = (config.titleTemplate as string) || 'Automation Notification'
  const bodyTemplate = (config.bodyTemplate as string) || ''
  const channel = (config.channel as string) || 'in_app'
  const notifyMemberIds = config.notifyMemberIds as string[] | undefined

  // Interpolate templates with variable context
  const title = interpolate(titleTemplate, context)
  const body = interpolate(bodyTemplate, context)

  logger.info('Sending notification', { title, channel, notifyMemberIds })

  // Get members to notify using membership service (DAL pattern)
  const members = await getOrganizationMembers(payload.organizationId, notifyMemberIds)

  // Skip if no members found after filtering — nobody to notify
  if (members.length === 0) {
    throw new SkipActionError('No team members found to notify')
  }

  /**
   * Create in-app notifications for each member.
   * Uses createBulkNotifications from the notification service which:
   * 1. Bulk-inserts Notification records (single DB round-trip)
   * 2. Emits realtime events per user so their bell icon updates instantly
   * 3. Sends web push notifications to subscribed PWA devices
   *
   * This runs in Trigger.dev's cloud — works because Prisma, Upstash realtime,
   * and web-push are all HTTP-based and don't require a Next.js server context.
   */
  if (channel === 'in_app' || channel === 'both') {
    const userIds = members.map((m) => m.user.id)

    await createBulkNotifications({
      organizationId: payload.organizationId,
      userIds,
      title,
      body,
      category: 'automation',
    })

    logger.info('In-app notifications created', {
      title,
      recipientCount: userIds.length,
    })
  }

  // Send email notification using marketing email system (supports custom HTML)
  if (channel === 'email' || channel === 'both') {
    // Build simple HTML email content
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${title}</h2>
        <p style="color: #666; line-height: 1.6;">${body}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">This is an automated notification from your automation workflow.</p>
      </div>
    `

    for (const member of members) {
      if (member.user.email) {
        await sendMarketingEmail({
          template: 'campaign',
          to: member.user.email,
          subject: title,
          data: { html: htmlContent },
          fromOrganizationId: payload.organizationId,
        })
      }
    }

    logger.info('Email notifications sent', { count: members.filter((m) => m.user.email).length })
  }

  return { result: { sent: true, channel, title, recipientCount: members.length } }
}

/**
 * Call webhook action.
 * Makes an HTTP request to an external URL.
 */
async function executeCallWebhook(
  data: Record<string, unknown>,
  context: VariableContext
): Promise<{ result: unknown }> {
  const config = (data.config as Record<string, unknown>) || {}
  const url = config.url as string
  const method = (config.method as string) || 'POST'
  const headers = (config.headers as Record<string, string>) || {}
  const bodyTemplate = config.bodyTemplate as string | undefined
  const contentType = (config.contentType as string) || 'application/json'

  if (!url) {
    throw new Error('Webhook URL is required')
  }

  // SSRF protection — validate the URL targets a public endpoint before fetching.
  // Blocks internal networks, cloud metadata, and non-HTTP protocols.
  const { validateWebhookUrl } = await import('./url-validation')
  const validation = await validateWebhookUrl(url)
  if (!validation.safe) {
    throw new Error(`Webhook URL blocked: ${validation.reason}`)
  }

  // Build request headers
  const requestHeaders: Record<string, string> = {
    'Content-Type': contentType,
    ...headers,
  }

  // Interpolate header values with context
  for (const [key, value] of Object.entries(requestHeaders)) {
    if (typeof value === 'string') {
      requestHeaders[key] = interpolate(value, context)
    }
  }

  // Build request body
  let requestBody: string | undefined
  if (bodyTemplate && ['POST', 'PUT', 'PATCH'].includes(method)) {
    const interpolatedBody = interpolate(bodyTemplate, context)

    // Try to parse as JSON to validate, then stringify
    if (contentType === 'application/json') {
      try {
        // Parse to validate JSON, then re-stringify
        const parsed = JSON.parse(interpolatedBody)
        requestBody = JSON.stringify(parsed)
      } catch {
        // If parsing fails, send as-is
        requestBody = interpolatedBody
      }
    } else {
      requestBody = interpolatedBody
    }
  }

  logger.info('Calling webhook', { url, method, hasBody: !!requestBody })

  // Make the request
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  })

  const responseText = await response.text()
  let responseData: unknown
  try {
    responseData = JSON.parse(responseText)
  } catch {
    responseData = responseText
  }

  logger.info('Webhook response', { status: response.status, ok: response.ok })

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}: ${responseText.slice(0, 200)}`)
  }

  return {
    result: {
      success: true,
      status: response.status,
      response: responseData,
    },
  }
}

// ============================================================================
// CONDITION EXECUTION
// ============================================================================

/**
 * Execute a condition node.
 * Evaluates all condition rules with AND/OR logic and returns which path to follow.
 * Includes branchTaken for detailed run history logging.
 *
 * Config fields (from IfElseConditionConfig):
 * - conditions: Array of { id, field, fieldLabel, operator, value }
 * - logicalOperator: 'and' | 'or'
 *
 * The trueNodeId/falseNodeId are determined by following edges with 'true'/'false' handles.
 */
async function executeCondition(
  data: Record<string, unknown>,
  context: VariableContext
): Promise<{ nextNodeId?: string; branchTaken: string; result: unknown }> {
  // Config is stored in data.config
  const config = (data.config as Record<string, unknown>) || {}
  const configType = config.type as string

  // Dispatch to branch condition handler if config type is 'branch'
  if (configType === 'branch') {
    return executeBranchCondition(config, context)
  }

  // Default: if_else condition logic
  const conditions = config.conditions as Array<{
    id: string
    field: string
    fieldLabel: string
    operator: string
    value: unknown
  }> | undefined
  const logicalOperator = (config.logicalOperator as 'and' | 'or') || 'and'

  // Handle empty or missing conditions — mark as unconfigured so the main loop can skip this step
  if (!conditions || conditions.length === 0) {
    logger.warn('No conditions configured, defaulting to false branch (unconfigured)')
    return {
      nextNodeId: undefined, // Edge lookup happens in main loop
      branchTaken: 'false',
      result: { condition: false, reason: 'No conditions configured', unconfigured: true },
    }
  }

  // Evaluate all conditions
  const ruleResults: Array<{ field: string; fieldValue: unknown; operator: string; value: unknown; result: boolean }> = []

  for (const rule of conditions) {
    // Special case: _triggerType is a meta-field for "which trigger fired" checks.
    // Normalize to lowercase because the UI picker stores lowercase values
    // but the Prisma enum is UPPER_CASE.
    let fieldValue: unknown
    if (rule.field === '_triggerType') {
      const rawType = context.trigger?.type
      fieldValue = typeof rawType === 'string' ? rawType.toLowerCase() : rawType
    } else {
      fieldValue = getValueFromPath(context, rule.field)
    }
    const result = evaluateCondition(fieldValue, rule.operator, rule.value)
    ruleResults.push({
      field: rule.field,
      fieldValue,
      operator: rule.operator,
      value: rule.value,
      result,
    })
  }

  // Combine results using logical operator
  let finalResult: boolean
  if (logicalOperator === 'and') {
    // All conditions must be true
    finalResult = ruleResults.every((r) => r.result)
  } else {
    // Any condition must be true
    finalResult = ruleResults.some((r) => r.result)
  }

  // Log every rule evaluation with actual vs expected for Trigger.dev dashboard visibility
  logger.info(`If/Else condition evaluated: ${finalResult ? 'TRUE' : 'FALSE'}`, {
    logicalOperator,
    finalResult,
    rules: ruleResults.map((r) => ({
      field: r.field,
      operator: r.operator,
      expected: r.value,
      actual: r.fieldValue,
      passed: r.result,
    })),
  })

  return {
    nextNodeId: undefined, // Edge lookup happens in main loop based on branchTaken
    branchTaken: finalResult ? 'true' : 'false',
    result: {
      condition: finalResult,
      logicalOperator,
      rules: ruleResults,
    },
  }
}

/**
 * Execute a branch condition node.
 * Evaluates branches top-to-bottom. First branch where ALL/ANY conditions pass wins.
 * Falls back to 'default' branch if no branch matches.
 *
 * Branch conditions support a special '_triggerType' field that checks the trigger
 * type from context, enabling "which trigger fired" conditions.
 */
function executeBranchCondition(
  config: Record<string, unknown>,
  context: VariableContext
): { nextNodeId?: string; branchTaken: string; result: unknown } {
  const branches = config.branches as Array<{
    id: string
    label: string
    conditions: Array<{
      id: string
      field: string
      fieldLabel: string
      operator: string
      value: unknown
      pickerType?: string
      /** Per-rule AND/OR — falls back to branch-level logicalOperator for old data */
      logicalOperator?: 'and' | 'or'
    }>
    /** Branch-level fallback for old data that doesn't have per-rule operators */
    logicalOperator: 'and' | 'or'
  }> | undefined

  if (!branches || branches.length === 0) {
    logger.warn('No branches configured, falling back to default')
    return {
      nextNodeId: undefined,
      branchTaken: 'default',
      result: { branchMatched: 'default', reason: 'No branches configured', unconfigured: true },
    }
  }

  // If every branch has zero conditions, treat as unconfigured — skip instead of running empty checks
  const allBranchesEmpty = branches.every((b) => b.conditions.length === 0)
  if (allBranchesEmpty) {
    logger.warn('All branches have empty conditions, falling back to default (unconfigured)')
    return {
      nextNodeId: undefined,
      branchTaken: 'default',
      result: { branchMatched: 'default', reason: 'No conditions configured', unconfigured: true },
    }
  }

  // Evaluate each branch top-to-bottom — first match wins.
  // Collect all rule results so the "no match" fallback can include them in the response
  // for debugging in run history (shows why each branch failed).
  const allBranchResults: Array<{ branchId: string; branchLabel: string; passed: boolean; rules: Array<{ field: string; fieldValue: unknown; operator: string; value: unknown; logicalOp: string; result: boolean }> }> = []

  for (const branch of branches) {
    if (branch.conditions.length === 0) continue

    const ruleResults: Array<{ field: string; fieldValue: unknown; operator: string; value: unknown; logicalOp: string; result: boolean }> = []

    for (const rule of branch.conditions) {
      let fieldValue: unknown

      // Special case: _triggerType checks the trigger type from context.
      // Normalize to lowercase because the UI picker stores values as lowercase
      // (e.g., "pipeline_ticket_moved") but the Prisma enum is UPPER_CASE
      // (e.g., "PIPELINE_TICKET_MOVED").
      if (rule.field === '_triggerType') {
        const rawType = context.trigger?.type
        fieldValue = typeof rawType === 'string' ? rawType.toLowerCase() : rawType
      } else {
        fieldValue = getValueFromPath(context, rule.field)
      }

      const result = evaluateCondition(fieldValue, rule.operator, rule.value)
      // Per-rule operator, falling back to branch-level for backward compat
      const logicalOp = rule.logicalOperator ?? branch.logicalOperator
      ruleResults.push({ field: rule.field, fieldValue, operator: rule.operator, value: rule.value, logicalOp, result })
    }

    /**
     * Evaluate per-rule operators left-to-right:
     * First rule is always the starting result.
     * Each subsequent rule applies its own AND/OR to the accumulated result.
     * e.g., R1 AND R2 OR R3 => ((R1 AND R2) OR R3)
     */
    let passed = ruleResults[0].result
    for (let i = 1; i < ruleResults.length; i++) {
      const { logicalOp, result } = ruleResults[i]
      passed = logicalOp === 'and' ? passed && result : passed || result
    }

    allBranchResults.push({ branchId: branch.id, branchLabel: branch.label, passed, rules: ruleResults })

    // Log each branch evaluation for Trigger.dev dashboard visibility
    logger.info(`Branch "${branch.label}" evaluated: ${passed ? 'MATCHED' : 'no match'}`, {
      branchId: branch.id,
      branchLabel: branch.label,
      passed,
      rules: ruleResults.map((r) => ({
        field: r.field,
        operator: r.operator,
        expected: r.value,
        actual: r.fieldValue,
        passed: r.result,
      })),
    })

    if (passed) {

      return {
        nextNodeId: undefined, // Edge lookup in main loop via branchTaken
        branchTaken: branch.id,
        result: {
          branchMatched: branch.id,
          branchLabel: branch.label,
          rules: ruleResults,
        },
      }
    }
  }

  // No branch matched — fall to default. Include all evaluated rules for debugging visibility.
  // The first branch's rules are used as the "rules" array for the step item UI breakdown.
  const firstBranchRules = allBranchResults[0]?.rules ?? []
  logger.info('No branch matched, falling back to default', {
    evaluatedBranches: allBranchResults.map((b) => ({
      branchId: b.branchId,
      branchLabel: b.branchLabel,
      passed: b.passed,
      ruleResults: b.rules.map((r) => ({ field: r.field, operator: r.operator, result: r.result, fieldValue: r.fieldValue, expected: r.value })),
    })),
  })
  return {
    nextNodeId: undefined,
    branchTaken: 'default',
    result: { branchMatched: 'default', reason: 'No branch conditions matched', rules: firstBranchRules },
  }
}

/**
 * Get value from context using dot notation path.
 */
function getValueFromPath(context: VariableContext, path: string): unknown {
  const segments = path.split('.')
  let current: unknown = context

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

/**
 * Evaluate a single condition rule.
 *
 * Handles type coercion for cross-type comparisons:
 * - equals/not_equals: coerces to number if either side is numeric
 * - contains/not_contains: works for both strings and arrays (lead.tags is string[])
 * - greater_than/less_than/etc.: always coerces to number
 * - is_empty/is_not_empty: checks for falsy, empty strings, and empty arrays
 */
function evaluateCondition(fieldValue: unknown, operator: string, compareValue: unknown): boolean {
  switch (operator) {
    case 'equals':
    case 'eq': {
      // Coerce to number when either side is numeric (e.g., amount: 100 vs "100")
      if (typeof fieldValue === 'number' || typeof compareValue === 'number') {
        return Number(fieldValue) === Number(compareValue)
      }
      return String(fieldValue) === String(compareValue)
    }

    case 'not_equals':
    case 'neq': {
      if (typeof fieldValue === 'number' || typeof compareValue === 'number') {
        return Number(fieldValue) !== Number(compareValue)
      }
      return String(fieldValue) !== String(compareValue)
    }

    case 'contains': {
      // Array support (e.g., lead.tags contains 'VIP')
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(String(compareValue))
      }
      return typeof fieldValue === 'string' && fieldValue.includes(String(compareValue))
    }

    case 'not_contains': {
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(String(compareValue))
      }
      return typeof fieldValue === 'string' && !fieldValue.includes(String(compareValue))
    }

    case 'starts_with':
      return typeof fieldValue === 'string' && fieldValue.startsWith(String(compareValue))

    case 'ends_with':
      return typeof fieldValue === 'string' && fieldValue.endsWith(String(compareValue))

    case 'greater_than':
    case 'gt':
      return Number(fieldValue) > Number(compareValue)

    case 'less_than':
    case 'lt':
      return Number(fieldValue) < Number(compareValue)

    case 'greater_than_or_equals':
    case 'gte':
    case 'greater_or_equal':
      return Number(fieldValue) >= Number(compareValue)

    case 'less_than_or_equals':
    case 'lte':
    case 'less_or_equal':
      return Number(fieldValue) <= Number(compareValue)

    case 'is_empty':
      if (Array.isArray(fieldValue)) return fieldValue.length === 0
      return !fieldValue || (typeof fieldValue === 'string' && fieldValue.trim() === '')

    case 'is_not_empty':
      if (Array.isArray(fieldValue)) return fieldValue.length > 0
      return !!fieldValue && (typeof fieldValue !== 'string' || fieldValue.trim() !== '')

    case 'has_tag':
      return Array.isArray(fieldValue) && fieldValue.includes(String(compareValue))

    case 'not_has_tag':
      return !Array.isArray(fieldValue) || !fieldValue.includes(String(compareValue))

    default:
      logger.warn(`Unknown operator: ${operator}`)
      return false
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find the first execution node — the node where execution should begin.
 *
 * v2 (Start node): Follow Start node → sequence edge to find the first action/condition.
 * This skips both trigger nodes and the Start node itself (they're for matching, not execution).
 *
 * v1 fallback: Find trigger node, then follow its edge to the first action.
 * If no outgoing edge, returns the trigger node ID (will be a no-op in executeNode).
 */
function findFirstExecutionNode(schema: AutomationSchema): string | undefined {
  // v2: Find Start node → follow its "sequence" edge to first action/condition
  const startNode = schema.nodes.find((n) => n.id === 'start_node')
  if (startNode) {
    const sequenceEdge = schema.edges.find(
      (e) => e.source === 'start_node' && e.sourceHandle === 'sequence'
    )
    return sequenceEdge?.target
  }

  // v1 fallback: find trigger node, then follow its outgoing edge
  const triggerNode = findTriggerNode(schema.nodes)
  if (triggerNode) {
    const nextEdge = schema.edges.find((e) => e.source === triggerNode.id)
    return nextEdge?.target ?? triggerNode.id
  }

  return undefined
}

/**
 * Find the trigger node (entry point) in the schema.
 * Used as v1 fallback when no Start node exists.
 */
function findTriggerNode(nodes: AutomationNode[]): AutomationNode | undefined {
  return nodes.find((n) => n.type === 'trigger')
}

/**
 * Find the next node following an edge from the source node.
 */
function findNextNode(edges: AutomationEdge[], sourceNodeId: string): string | undefined {
  const edge = edges.find((e) => e.source === sourceNodeId)
  return edge?.target
}

/**
 * Find the next node following a condition branch.
 * Supports both if_else ('true'/'false') and branch (branchId/'default') handles.
 * Looks for edges with sourceHandle matching the branch name.
 */
function findNextNodeByBranch(edges: AutomationEdge[], sourceNodeId: string, branch: string): string | undefined {
  // First try to find edge with exact matching sourceHandle
  const branchEdge = edges.find((e) => e.source === sourceNodeId && e.sourceHandle === branch)
  if (branchEdge) {
    return branchEdge.target
  }

  // Fallback: look for edge with handle containing the branch name (e.g., 'condition-true', 'output-false')
  const fallbackEdge = edges.find((e) =>
    e.source === sourceNodeId &&
    e.sourceHandle?.toLowerCase().includes(branch.toLowerCase())
  )
  if (fallbackEdge) {
    return fallbackEdge.target
  }

  // Last resort: if only one edge exists and branch is 'true', follow it
  const singleEdge = edges.filter((e) => e.source === sourceNodeId)
  if (singleEdge.length === 1 && branch === 'true') {
    logger.warn('No branch-specific edge found, following only available edge', { sourceNodeId, branch })
    return singleEdge[0].target
  }

  logger.warn('No matching edge found for branch', { sourceNodeId, branch })
  return undefined
}

/**
 * Sanitize node data for logging.
 * Removes sensitive fields and truncates large values.
 * This ensures we log useful debugging info without exposing secrets or bloating logs.
 */
function sanitizeInputForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization']
  const maxValueLength = 200

  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    // Skip sensitive fields
    if (sensitiveFields.some((f) => key.toLowerCase().includes(f))) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    // Skip internal fields
    if (key === 'position' || key === 'measured') {
      continue
    }

    // Handle different value types
    if (typeof value === 'string') {
      // Truncate long strings
      sanitized[key] = value.length > maxValueLength ? `${value.slice(0, maxValueLength)}...` : value
    } else if (typeof value === 'object' && value !== null) {
      // For nested objects, just log that it exists with its keys
      if (Array.isArray(value)) {
        sanitized[key] = `[Array(${value.length})]`
      } else {
        sanitized[key] = `{${Object.keys(value).join(', ')}}`
      }
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}
