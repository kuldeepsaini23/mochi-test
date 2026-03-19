/**
 * ============================================================================
 * AUTOMATION BUILDER UTILITIES
 * ============================================================================
 *
 * Helper functions for the automation builder.
 */

import { v4 as uuid } from 'uuid'
import type {
  AutomationNode,
  AutomationNodeData,
  AutomationNodeType,
  AutomationTriggerType,
  AutomationActionType,
  AutomationConditionType,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
} from './types'
import {
  getNodeEntry,
  getDefaultTriggerConfig,
  getDefaultActionConfig,
  getDefaultConditionConfig,
  isTriggerType,
  isActionType,
  isConditionType,
} from './node-registry'

// ============================================================================
// NODE CREATION
// ============================================================================

/**
 * Create a new automation node from a node type.
 *
 * WHY: Provides a factory function to create properly typed and configured nodes
 * from the node registry when dragging from the sidebar.
 *
 * @param type - The node type to create
 * @param position - The position to place the node on the canvas
 * @returns A fully configured AutomationNode
 */
export function createAutomationNode(
  type: AutomationNodeType,
  position: { x: number; y: number }
): AutomationNode {
  // Start node is created automatically — it cannot be dragged from the sidebar
  if ((type as string) === 'start') {
    throw new Error('Start node cannot be created manually')
  }

  const entry = getNodeEntry(type)
  if (!entry) {
    throw new Error(`Unknown node type: ${type}`)
  }

  const id = `node_${uuid()}`

  // Create the appropriate node data based on category
  let data: AutomationNodeData

  if (isTriggerType(type)) {
    data = {
      label: entry.label,
      description: entry.description,
      isConfigured: false,
      nodeCategory: 'trigger',
      triggerType: type,
      config: getDefaultTriggerConfig(type),
    } as TriggerNodeData
  } else if (isActionType(type)) {
    data = {
      label: entry.label,
      description: entry.description,
      isConfigured: false,
      nodeCategory: 'action',
      actionType: type,
      config: getDefaultActionConfig(type),
    } as ActionNodeData
  } else if (isConditionType(type)) {
    data = {
      label: entry.label,
      description: entry.description,
      isConfigured: false,
      nodeCategory: 'condition',
      conditionType: type,
      config: getDefaultConditionConfig(type),
    } as ConditionNodeData
  } else {
    throw new Error(`Cannot create node for type: ${type}`)
  }

  return {
    id,
    type: entry.category === 'control' ? 'action' : entry.category,
    position,
    data,
  }
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique ID for nodes.
 */
export function generateNodeId(): string {
  return `node_${uuid()}`
}

/**
 * Generate a unique ID for edges.
 */
export function generateEdgeId(): string {
  return `edge_${uuid()}`
}

/**
 * Generate a unique ID for condition rules.
 */
export function generateConditionRuleId(): string {
  return `rule_${uuid()}`
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a node is properly configured.
 *
 * WHY: Used to show validation state on nodes and prevent activation
 * of automations with incomplete configurations.
 *
 * @param node - The node to validate
 * @returns Object with isValid flag and array of error messages
 */
export function validateNode(node: AutomationNode): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  const { data } = node

  // Check trigger-specific validation
  if (data.nodeCategory === 'trigger') {
    const triggerData = data as TriggerNodeData
    const config = triggerData.config

    if (config.type === 'form_submitted') {
      // Form trigger requires a form to be selected
      if (!config.formId) {
        errors.push('Select a form to watch')
      }
    } else if (config.type === 'pipeline_ticket_moved') {
      // Pipeline trigger requires at least a pipeline to be selected
      if (!config.pipelineId) {
        errors.push('Select a pipeline to watch')
      }
    }
    // Other trigger types have no required config
  }

  // Check action-specific validation
  if (data.nodeCategory === 'action') {
    const actionData = data as ActionNodeData
    const config = actionData.config

    if (config.type === 'send_email') {
      const emailMode = config.mode ?? 'template'
      if (emailMode === 'template') {
        if (!config.emailTemplateId) {
          errors.push('Select an email template')
        }
      } else {
        if (!config.subject) {
          errors.push('Enter an email subject')
        }
        if (!config.body) {
          errors.push('Enter an email body')
        }
      }
    } else if (config.type === 'add_tag' || config.type === 'remove_tag') {
      if (!config.tags || config.tags.length === 0) {
        errors.push('Select at least one tag')
      }
    } else if (config.type === 'create_pipeline_ticket') {
      if (!config.pipelineId || !config.stageId) {
        errors.push('Select a pipeline and stage')
      }
    } else if (config.type === 'update_pipeline_ticket') {
      if (!config.pipelineId || !config.toStageId) {
        errors.push('Select a pipeline and target stage')
      }
    } else if (config.type === 'wait_delay') {
      if (config.delayAmount <= 0) {
        errors.push('Delay must be greater than 0')
      }
    }
  }

  // Check condition-specific validation
  if (data.nodeCategory === 'condition') {
    const conditionData = data as ConditionNodeData
    if (conditionData.config.type === 'if_else') {
      if (conditionData.config.conditions.length === 0) {
        errors.push('Add at least one condition')
      }
    } else if (conditionData.config.type === 'branch') {
      if (conditionData.config.branches.length === 0) {
        errors.push('Add at least one branch')
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// ============================================================================
// AVAILABLE DATA (VARIABLES)
// ============================================================================

/**
 * Data variable available in automation steps.
 */
export interface AvailableVariable {
  /** Variable path (e.g., 'lead.email', 'trigger.formData.company') */
  path: string
  /** Display label */
  label: string
  /** Data type hint */
  type: 'string' | 'number' | 'boolean' | 'object'
  /** Description */
  description: string
}

/**
 * Get available variables based on the trigger type.
 *
 * WHY: Each trigger type provides different data that can be used
 * in subsequent actions. This function returns the available variables
 * for the variable picker in action configurations.
 *
 * @param triggerType - The trigger type of the automation
 * @returns Array of available variables
 */
export function getAvailableVariables(triggerType: AutomationTriggerType): AvailableVariable[] {
  // Base variables always available (lead data)
  const baseVariables: AvailableVariable[] = [
    { path: 'lead.id', label: 'Lead ID', type: 'string', description: 'Unique lead identifier' },
    { path: 'lead.email', label: 'Lead Email', type: 'string', description: 'Lead email address' },
    { path: 'lead.firstName', label: 'First Name', type: 'string', description: 'Lead first name' },
    { path: 'lead.lastName', label: 'Last Name', type: 'string', description: 'Lead last name' },
    { path: 'lead.phone', label: 'Phone', type: 'string', description: 'Lead phone number' },
    { path: 'lead.status', label: 'Lead Status', type: 'string', description: 'Lead status (LEAD, PROSPECT, etc.)' },
  ]

  // Trigger-specific variables
  const triggerVariables: AvailableVariable[] = []

  switch (triggerType) {
    case 'form_submitted':
      triggerVariables.push(
        { path: 'trigger.formId', label: 'Form ID', type: 'string', description: 'ID of the submitted form' },
        { path: 'trigger.formName', label: 'Form Name', type: 'string', description: 'Name of the submitted form' },
        { path: 'trigger.formData', label: 'Form Data', type: 'object', description: 'All form submission data' },
        { path: 'trigger.submittedAt', label: 'Submitted At', type: 'string', description: 'Submission timestamp' }
      )
      break

    case 'pipeline_ticket_moved':
      triggerVariables.push(
        { path: 'trigger.ticketId', label: 'Ticket ID', type: 'string', description: 'ID of the ticket' },
        { path: 'trigger.ticketTitle', label: 'Ticket Title', type: 'string', description: 'Title of the ticket' },
        { path: 'trigger.pipelineId', label: 'Pipeline ID', type: 'string', description: 'ID of the pipeline' },
        { path: 'trigger.pipelineName', label: 'Pipeline Name', type: 'string', description: 'Name of the pipeline' },
        { path: 'trigger.fromStageId', label: 'From Stage ID', type: 'string', description: 'ID of the source stage' },
        { path: 'trigger.fromStageName', label: 'From Stage Name', type: 'string', description: 'Name of the source stage' },
        { path: 'trigger.toStageId', label: 'To Stage ID', type: 'string', description: 'ID of the target stage' },
        { path: 'trigger.toStageName', label: 'To Stage Name', type: 'string', description: 'Name of the target stage' },
        { path: 'trigger.movedAt', label: 'Updated At', type: 'string', description: 'When the ticket was updated' }
      )
      break
  }

  return [...baseVariables, ...triggerVariables]
}

/**
 * Format a variable path as a template string.
 * E.g., 'lead.email' -> '{{lead.email}}'
 */
export function formatVariableTemplate(path: string): string {
  return `{{${path}}}`
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

/**
 * Get display properties for automation status.
 */
export function getStatusDisplay(status: string): {
  label: string
  colorClass: string
  bgClass: string
} {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        colorClass: 'text-green-600',
        bgClass: 'bg-green-100',
      }
    case 'draft':
      return {
        label: 'Draft',
        colorClass: 'text-slate-600',
        bgClass: 'bg-slate-100',
      }
    case 'paused':
      return {
        label: 'Paused',
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-100',
      }
    case 'archived':
      return {
        label: 'Archived',
        colorClass: 'text-red-600',
        bgClass: 'bg-red-100',
      }
    default:
      return {
        label: status,
        colorClass: 'text-slate-600',
        bgClass: 'bg-slate-100',
      }
  }
}

/**
 * Get display properties for run status.
 */
export function getRunStatusDisplay(status: string): {
  label: string
  colorClass: string
  bgClass: string
} {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        colorClass: 'text-green-600',
        bgClass: 'bg-green-100',
      }
    case 'running':
      return {
        label: 'Running',
        colorClass: 'text-blue-600',
        bgClass: 'bg-blue-100',
      }
    case 'pending':
      return {
        label: 'Pending',
        colorClass: 'text-slate-600',
        bgClass: 'bg-slate-100',
      }
    case 'failed':
      return {
        label: 'Failed',
        colorClass: 'text-red-600',
        bgClass: 'bg-red-100',
      }
    case 'skipped':
      return {
        label: 'Skipped',
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-100',
      }
    case 'cancelled':
      return {
        label: 'Cancelled',
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-100',
      }
    default:
      return {
        label: status,
        colorClass: 'text-slate-600',
        bgClass: 'bg-slate-100',
      }
  }
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

/**
 * Format a delay configuration as human-readable text.
 */
export function formatDelay(amount: number, unit: 'minutes' | 'hours' | 'days'): string {
  const plural = amount !== 1 ? 's' : ''
  return `${amount} ${unit.slice(0, -1)}${plural}`
}

/**
 * Format a date as relative time (e.g., "2 hours ago").
 * Accepts Date objects, ISO strings, or any value that can be converted to a Date.
 * Handles edge cases from tRPC/JSON serialization gracefully.
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  // Handle null/undefined
  if (!date) {
    return 'Never'
  }

  // Convert to Date object, handling various input formats
  let dateObj: Date
  if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === 'string') {
    dateObj = new Date(date)
  } else {
    // Attempt to convert any other type
    try {
      dateObj = new Date(date as unknown as string | number)
    } catch {
      return 'Unknown'
    }
  }

  // Check if the date is valid
  if (isNaN(dateObj.getTime())) {
    return 'Invalid date'
  }

  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) {
    return 'Just now'
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  } else {
    return dateObj.toLocaleDateString()
  }
}
