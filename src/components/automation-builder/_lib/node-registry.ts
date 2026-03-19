/**
 * ============================================================================
 * AUTOMATION NODE REGISTRY
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationNodeRegistry, NodeRegistryEntry
 *
 * Central registry of all available automation nodes.
 * Used by the sidebar to display draggable nodes and by the canvas
 * to render the correct component for each node type.
 *
 * STRUCTURE:
 * - Each node has metadata for display in sidebar
 * - Nodes are grouped by category (trigger, action, condition, control)
 * - Icons use Lucide React for consistency
 */

import type { LucideIcon } from 'lucide-react'
import {
  // Trigger icons
  FileText,
  TagsIcon,
  ArrowRightLeft,
  CreditCard,
  CalendarPlus,
  RefreshCw,
  XCircle,
  // Action icons
  Mail,

  Tags,
  Kanban,
  MoveRight,
  Clock,
  Hourglass,
  Bell,
  Webhook,
  // Condition icons
  GitBranch,
} from 'lucide-react'

import type {
  AutomationNodeCategory,
  AutomationTriggerType,
  AutomationActionType,
  AutomationConditionType,
  AutomationNodeType,
  TriggerConfig,
  ActionConfig,
  ConditionConfig,
  BranchConditionConfig,
} from './types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Metadata for a single automation node type.
 */
export interface NodeRegistryEntry {
  /** The node type identifier */
  type: AutomationNodeType
  /** Display label in sidebar and node */
  label: string
  /** Short description for tooltip/sidebar */
  description: string
  /** Icon component */
  icon: LucideIcon
  /** Category for grouping and styling */
  category: AutomationNodeCategory
}

/**
 * Category metadata for sidebar sections.
 */
export interface NodeCategoryMeta {
  id: AutomationNodeCategory
  label: string
  description: string
  /** Tailwind color class for the category */
  colorClass: string
  /** Background color class for node headers */
  headerColorClass: string
}

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

/**
 * Category metadata for styling and grouping.
 * Uses subtle, muted colors for a cleaner UI (matching form builder style).
 */
export const NODE_CATEGORIES: NodeCategoryMeta[] = [
  {
    id: 'trigger',
    label: 'Triggers',
    description: 'Events that start the automation',
    colorClass: 'text-muted-foreground',
    headerColorClass: 'bg-muted',
  },
  {
    id: 'action',
    label: 'Actions',
    description: 'Operations to perform',
    colorClass: 'text-muted-foreground',
    headerColorClass: 'bg-muted',
  },
  {
    id: 'condition',
    label: 'Conditions',
    description: 'Branching logic',
    colorClass: 'text-muted-foreground',
    headerColorClass: 'bg-muted',
  },
  {
    id: 'control',
    label: 'Control',
    description: 'Flow control nodes',
    colorClass: 'text-muted-foreground',
    headerColorClass: 'bg-muted',
  },
]

// ============================================================================
// TRIGGER REGISTRY
// ============================================================================

/**
 * Registry of all available trigger types.
 */
export const TRIGGER_REGISTRY: NodeRegistryEntry[] = [
  {
    type: 'form_submitted',
    label: 'Form Submitted',
    description: 'When a form receives a submission',
    icon: FileText,
    category: 'trigger',
  },
  {
    type: 'pipeline_ticket_moved',
    label: 'Ticket Updated',
    description: 'When a pipeline ticket is updated',
    icon: ArrowRightLeft,
    category: 'trigger',
  },
  {
    type: 'payment_completed',
    label: 'Payment Completed',
    description: 'When a payment is successfully processed',
    icon: CreditCard,
    category: 'trigger',
  },
  {
    type: 'appointment_scheduled',
    label: 'Appointment Scheduled',
    description: 'When a booking is made on a calendar',
    icon: CalendarPlus,
    category: 'trigger',
  },
  // DEPRECATED: appointment_started trigger removed from UI palette.
  // Use "Appointment Scheduled → Wait for Event (appointment_started)" instead.
  // The trigger type is kept in Prisma enum + tRPC for backward compat.
  {
    type: 'trial_started',
    label: 'Trial Started',
    description: 'When a free trial subscription begins',
    icon: Clock,
    category: 'trigger',
  },
  {
    type: 'subscription_renewed',
    label: 'Subscription Renewed',
    description: 'When a recurring subscription payment succeeds',
    icon: RefreshCw,
    category: 'trigger',
  },
  {
    type: 'subscription_cancelled',
    label: 'Subscription Cancelled',
    description: 'When a subscription is cancelled or churns',
    icon: XCircle,
    category: 'trigger',
  },
]

// ============================================================================
// ACTION REGISTRY
// ============================================================================

/**
 * Registry of all available action types.
 */
export const ACTION_REGISTRY: NodeRegistryEntry[] = [
  {
    type: 'send_email',
    label: 'Send Email',
    description: 'Send an email to the lead',
    icon: Mail,
    category: 'action',
  },
  {
    type: 'add_tag',
    label: 'Add Tag',
    description: 'Add a tag to the lead',
    icon: Tags,
    category: 'action',
  },
  {
    type: 'remove_tag',
    label: 'Remove Tag',
    description: 'Remove a tag from the lead',
    icon: TagsIcon,
    category: 'action',
  },
  {
    type: 'create_pipeline_ticket',
    label: 'Create Ticket',
    description: 'Create a new pipeline ticket',
    icon: Kanban,
    category: 'action',
  },
  {
    type: 'update_pipeline_ticket',
    label: 'Update Ticket',
    description: 'Update a pipeline ticket stage',
    icon: MoveRight,
    category: 'action',
  },
  {
    type: 'wait_delay',
    label: 'Wait / Delay',
    description: 'Pause for a specified duration',
    icon: Clock,
    category: 'control',
  },
  {
    type: 'wait_for_event',
    label: 'Wait for Event',
    description: 'Pause until a specific event occurs',
    icon: Hourglass,
    category: 'control',
  },
  {
    type: 'send_notification',
    label: 'Send Notification',
    description: 'Notify team members',
    icon: Bell,
    category: 'action',
  },
  {
    type: 'call_webhook',
    label: 'Call Webhook',
    description: 'Make an HTTP request to external URL',
    icon: Webhook,
    category: 'action',
  },
]

// ============================================================================
// CONDITION REGISTRY
// ============================================================================

/**
 * Registry of all available condition types.
 */
export const CONDITION_REGISTRY: NodeRegistryEntry[] = [
  // Old if_else removed from sidebar — existing automations still render/execute
  // via backward compat in properties-drawer, condition-node, and execution-task.
  {
    type: 'branch',
    label: 'If',
    description: 'Route to different paths based on conditions',
    icon: GitBranch,
    category: 'condition',
  },
]

// ============================================================================
// COMBINED REGISTRY
// ============================================================================

/**
 * Complete registry of all automation nodes.
 * This is the source of truth for available nodes.
 */
export const NODE_REGISTRY: NodeRegistryEntry[] = [
  ...TRIGGER_REGISTRY,
  ...ACTION_REGISTRY,
  ...CONDITION_REGISTRY,
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get node registry entry by type.
 */
export function getNodeEntry(type: AutomationNodeType): NodeRegistryEntry | undefined {
  return NODE_REGISTRY.find((entry) => entry.type === type)
}

/**
 * Get all nodes in a category.
 */
export function getNodesByCategory(category: AutomationNodeCategory): NodeRegistryEntry[] {
  return NODE_REGISTRY.filter((entry) => entry.category === category)
}

/**
 * Get category metadata by ID.
 */
export function getCategoryMeta(category: AutomationNodeCategory): NodeCategoryMeta | undefined {
  return NODE_CATEGORIES.find((cat) => cat.id === category)
}

/**
 * Get nodes grouped by category for sidebar display.
 */
export function getGroupedNodes(): Map<AutomationNodeCategory, NodeRegistryEntry[]> {
  const grouped = new Map<AutomationNodeCategory, NodeRegistryEntry[]>()

  for (const category of NODE_CATEGORIES) {
    const nodes = getNodesByCategory(category.id)
    if (nodes.length > 0) {
      grouped.set(category.id, nodes)
    }
  }

  return grouped
}

/**
 * Check if a node type is a trigger.
 */
export function isTriggerType(type: AutomationNodeType): type is AutomationTriggerType {
  return TRIGGER_REGISTRY.some((entry) => entry.type === type)
}

/**
 * Check if a node type is an action.
 */
export function isActionType(type: AutomationNodeType): type is AutomationActionType {
  return ACTION_REGISTRY.some((entry) => entry.type === type)
}

/**
 * Check if a node type is a condition.
 */
export function isConditionType(type: AutomationNodeType): type is AutomationConditionType {
  return CONDITION_REGISTRY.some((entry) => entry.type === type)
}

/**
 * Get the icon component for a node type.
 */
export function getNodeIcon(type: AutomationNodeType): LucideIcon | undefined {
  const entry = getNodeEntry(type)
  return entry?.icon
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Get default configuration for a trigger type.
 */
export function getDefaultTriggerConfig(type: AutomationTriggerType): TriggerConfig {
  switch (type) {
    case 'form_submitted':
      return { type: 'form_submitted' }
    case 'pipeline_ticket_moved':
      return { type: 'pipeline_ticket_moved' }
    case 'payment_completed':
      return { type: 'payment_completed' }
    case 'appointment_scheduled':
      return { type: 'appointment_scheduled' }
    // DEPRECATED: appointment_started kept for backward compat with existing automations
    case 'appointment_started':
      return { type: 'appointment_started' }
    case 'trial_started':
      return { type: 'trial_started' }
    case 'subscription_renewed':
      return { type: 'subscription_renewed' }
    case 'subscription_cancelled':
      return { type: 'subscription_cancelled' }
    default:
      throw new Error(`Unknown trigger type: ${type}`)
  }
}

/**
 * Get default configuration for an action type.
 */
export function getDefaultActionConfig(type: AutomationActionType): ActionConfig {
  switch (type) {
    case 'send_email':
      return { type: 'send_email', mode: 'template', fromEmail: '', fromName: '' }
    case 'add_tag':
      return { type: 'add_tag' }
    case 'remove_tag':
      return { type: 'remove_tag' }
    case 'create_pipeline_ticket':
      return { type: 'create_pipeline_ticket', titleTemplate: '{{lead.firstName}} {{lead.lastName}}' }
    case 'update_pipeline_ticket':
      return { type: 'update_pipeline_ticket' }
    case 'wait_delay':
      return { type: 'wait_delay', delayAmount: 1, delayUnit: 'hours' }
    case 'wait_for_event':
      return { type: 'wait_for_event', eventType: 'appointment_started', timeoutHours: 72, timeoutAction: 'continue' }
    case 'send_notification':
      return { type: 'send_notification', titleTemplate: 'New Lead Activity', bodyTemplate: '{{lead.fullName}} triggered an automation', channel: 'in_app' }
    case 'call_webhook':
      return { type: 'call_webhook', url: '', method: 'POST', contentType: 'application/json' }
    default:
      throw new Error(`Unknown action type: ${type}`)
  }
}

/**
 * Get default configuration for a condition type.
 */
export function getDefaultConditionConfig(type: AutomationConditionType): ConditionConfig {
  switch (type) {
    case 'if_else':
      return { type: 'if_else', conditions: [], logicalOperator: 'and' }
    case 'branch':
      return {
        type: 'branch',
        branches: [
          {
            id: `branch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            label: 'Branch 1',
            conditions: [],
            logicalOperator: 'and',
          },
        ],
        hasDefault: true,
      } satisfies BranchConditionConfig
    default:
      throw new Error(`Unknown condition type: ${type}`)
  }
}
