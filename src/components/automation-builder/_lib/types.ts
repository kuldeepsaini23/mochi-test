/**
 * ============================================================================
 * AUTOMATION BUILDER TYPES
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationBuilderTypes, WorkflowTypes, AutomationNode,
 * AutomationEdge, AutomationSchema, AutomationTrigger, AutomationAction
 *
 * Type definitions for the automation/workflow builder system.
 * These types define the structure of automations, nodes, connections, and runs.
 *
 * ARCHITECTURE:
 * - AutomationSchema: Root schema containing nodes and edges
 * - AutomationNode: Individual nodes (triggers, actions, conditions)
 * - AutomationEdge: Connections between nodes
 * - AutomationRun: Execution history records
 */

import type { Node, Edge } from '@xyflow/react'

// ============================================================================
// NODE CATEGORIES
// ============================================================================

/**
 * Categories of nodes in the automation builder.
 * Each category has a distinct color in the UI.
 * SOURCE OF TRUTH: AutomationNodeCategory
 */
export type AutomationNodeCategory = 'trigger' | 'action' | 'condition' | 'control' | 'start'

// ============================================================================
// TRIGGER TYPES
// ============================================================================

/**
 * All available trigger types.
 * Triggers are the starting points of automations - events that initiate the workflow.
 * SOURCE OF TRUTH: AutomationTriggerType
 */
export type AutomationTriggerType =
  | 'form_submitted'
  | 'pipeline_ticket_moved'
  | 'payment_completed'
  | 'appointment_scheduled'
  | 'appointment_started'
  | 'trial_started'
  | 'subscription_renewed'
  | 'subscription_cancelled'

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * All available action types.
 * Actions are operations performed as part of the workflow.
 * SOURCE OF TRUTH: AutomationActionType
 */
export type AutomationActionType =
  | 'send_email'
  | 'add_tag'
  | 'remove_tag'
  | 'create_pipeline_ticket'
  | 'update_pipeline_ticket'
  | 'wait_delay'
  | 'wait_for_event'
  | 'send_notification'
  | 'call_webhook'

// ============================================================================
// CONDITION TYPES
// ============================================================================

/**
 * Condition node types for branching logic.
 * SOURCE OF TRUTH: AutomationConditionType
 */
export type AutomationConditionType = 'if_else' | 'branch'

/**
 * Combined node type union for all possible node types.
 */
export type AutomationNodeType =
  | AutomationTriggerType
  | AutomationActionType
  | AutomationConditionType

// ============================================================================
// TRIGGER CONFIGURATIONS
// ============================================================================

/**
 * Configuration for form_submitted trigger.
 * Fires when a specific form receives a submission.
 */
export interface FormSubmittedTriggerConfig {
  type: 'form_submitted'
  /** ID of the form to watch (optional - if not set, watches all forms) */
  formId?: string
  /** Display name of the form (for UI) */
  formName?: string
}

/**
 * Configuration for pipeline_ticket_moved trigger.
 * Fires when a ticket is updated to a specific stage in a pipeline.
 */
export interface PipelineTicketMovedTriggerConfig {
  type: 'pipeline_ticket_moved'
  /** ID of the pipeline to watch */
  pipelineId?: string
  /** Display name of the pipeline (for UI) */
  pipelineName?: string
  /** ID of the source stage (optional - if not set, watches any source) */
  fromStageId?: string
  /** Display name of the source stage (for UI) */
  fromStageName?: string
  /** ID of the target stage (optional - if not set, watches any target) */
  toStageId?: string
  /** Display name of the target stage (for UI) */
  toStageName?: string
}

/**
 * Configuration for payment_completed trigger.
 * Fires when a payment is successfully completed.
 *
 * Matching priority: priceId (most specific) > productId (any price) > paymentLinkId (legacy).
 * SOURCE OF TRUTH: PaymentCompletedTriggerConfig, PaymentTriggerFilter
 */
export interface PaymentCompletedTriggerConfig {
  type: 'payment_completed'
  /** Minimum amount to trigger (optional) */
  minAmount?: number
  /** Currency filter (optional - e.g., 'USD', 'EUR') */
  currency?: string
  /** Product ID filter — matches any price under this product */
  productId?: string
  /** Display name of the product (for UI) */
  productName?: string
  /** Price ID filter — matches this exact price only (most specific) */
  priceId?: string
  /** Display name of the price (for UI) */
  priceName?: string
  /** Legacy: Payment link ID filter (backward compat for existing automations) */
  paymentLinkId?: string
}

/**
 * Configuration for trial_started trigger.
 * Fires when a free trial subscription begins for a product/price.
 * SOURCE OF TRUTH: TrialStartedTriggerConfig
 */
export interface TrialStartedTriggerConfig {
  type: 'trial_started'
  /** Product ID filter — matches any price under this product */
  productId?: string
  /** Display name of the product (for UI) */
  productName?: string
  /** Price ID filter — matches this exact price only (most specific) */
  priceId?: string
  /** Display name of the price (for UI) */
  priceName?: string
}

/**
 * Configuration for subscription_renewed trigger.
 * Fires when a recurring subscription payment succeeds (renewal invoice paid).
 * SOURCE OF TRUTH: SubscriptionRenewedTriggerConfig
 */
export interface SubscriptionRenewedTriggerConfig {
  type: 'subscription_renewed'
  /** Product ID filter — matches any price under this product */
  productId?: string
  /** Display name of the product (for UI) */
  productName?: string
  /** Price ID filter — matches this exact price only (most specific) */
  priceId?: string
  /** Display name of the price (for UI) */
  priceName?: string
  /** Minimum renewal amount to trigger (optional) */
  minAmount?: number
}

/**
 * Configuration for subscription_cancelled trigger.
 * Fires when a subscription is cancelled or churns (customer or merchant initiated).
 * SOURCE OF TRUTH: SubscriptionCancelledTriggerConfig
 */
export interface SubscriptionCancelledTriggerConfig {
  type: 'subscription_cancelled'
  /** Product ID filter — matches any price under this product */
  productId?: string
  /** Display name of the product (for UI) */
  productName?: string
  /** Price ID filter — matches this exact price only (most specific) */
  priceId?: string
  /** Display name of the price (for UI) */
  priceName?: string
}

/**
 * Configuration for appointment_scheduled trigger.
 * Fires when an appointment is booked through a booking calendar.
 */
export interface AppointmentScheduledTriggerConfig {
  type: 'appointment_scheduled'
  /** ID of the booking calendar to watch (optional - if not set, watches all) */
  calendarId?: string
  /** Display name of the calendar (for UI) */
  calendarName?: string
}

/**
 * Configuration for appointment_started trigger.
 * Fires when an appointment's start time is reached.
 */
export interface AppointmentStartedTriggerConfig {
  type: 'appointment_started'
  /** ID of the booking calendar to watch (optional - if not set, watches all) */
  calendarId?: string
  /** Display name of the calendar (for UI) */
  calendarName?: string
}

/**
 * Union of all trigger configurations.
 */
export type TriggerConfig =
  | FormSubmittedTriggerConfig
  | PipelineTicketMovedTriggerConfig
  | PaymentCompletedTriggerConfig
  | AppointmentScheduledTriggerConfig
  | AppointmentStartedTriggerConfig
  | TrialStartedTriggerConfig
  | SubscriptionRenewedTriggerConfig
  | SubscriptionCancelledTriggerConfig

// ============================================================================
// ACTION CONFIGURATIONS
// ============================================================================

/**
 * Email send mode — template uses a pre-built rich template,
 * body allows writing a plain-text email with variable interpolation.
 * SOURCE OF TRUTH: SendEmailMode
 */
export type SendEmailMode = 'template' | 'body'

/**
 * Configuration for send_email action.
 * Supports two modes:
 * - template: select a pre-built email template (with preview + inline editing)
 * - body: write a plain-text email body directly with {{variable}} support
 *
 * Recipient is auto-resolved from context (lead.email).
 * The sender ("from") address is required so the email has a valid sender identity.
 *
 * SOURCE OF TRUTH: SendEmailActionConfig
 */
export interface SendEmailActionConfig {
  type: 'send_email'
  /** Which mode: template (rich editor) or body (plain text). Defaults to 'template'. */
  mode?: SendEmailMode
  // --- Template mode fields ---
  /** ID of the email template to use (required in template mode) */
  emailTemplateId?: string
  /** Display name of the template (for UI) */
  emailTemplateName?: string
  /** Optional subject line override for template mode */
  subjectOverride?: string
  // --- Body mode fields ---
  /** Subject line (required in body mode) */
  subject?: string
  /** Plain text body with {{variable}} support (required in body mode) */
  body?: string
  // --- Shared fields ---
  /** Sender email address (required — e.g., "noreply@yourdomain.com") */
  fromEmail?: string
  /** Sender display name (required — e.g., "Acme Support") */
  fromName?: string
}

/**
 * Configuration for add_tag action.
 * Adds one or more tags to the lead.
 */
export interface AddTagActionConfig {
  type: 'add_tag'
  /** Tags to add (id for execution, name for UI display) */
  tags?: Array<{ id: string; name: string }>
}

/**
 * Configuration for remove_tag action.
 * Removes one or more tags from the lead.
 */
export interface RemoveTagActionConfig {
  type: 'remove_tag'
  /** Tags to remove (id for execution, name for UI display) */
  tags?: Array<{ id: string; name: string }>
}

/**
 * Configuration for create_pipeline_ticket action.
 * Creates a new ticket in a pipeline.
 */
export interface CreatePipelineTicketActionConfig {
  type: 'create_pipeline_ticket'
  /** ID of the pipeline */
  pipelineId?: string
  /** Display name of the pipeline (for UI) */
  pipelineName?: string
  /** ID of the stage to create the ticket in */
  stageId?: string
  /** Display name of the stage (for UI) */
  stageName?: string
  /** Title template with variable support */
  titleTemplate?: string
  /** Description template with variable support */
  descriptionTemplate?: string
  /** Value template (for deal value) */
  valueTemplate?: string
}

/**
 * Configuration for update_pipeline_ticket action.
 * Updates an existing ticket (move to different stage, update fields).
 */
export interface UpdatePipelineTicketActionConfig {
  type: 'update_pipeline_ticket'
  /** ID of the pipeline */
  pipelineId?: string
  /** Display name of the pipeline (for UI) */
  pipelineName?: string
  /** ID of the target stage */
  toStageId?: string
  /** Display name of the target stage (for UI) */
  toStageName?: string
}

/**
 * Configuration for wait_delay action.
 * Pauses the automation for a specified duration.
 */
export interface WaitDelayActionConfig {
  type: 'wait_delay'
  /** Amount of time to wait */
  delayAmount: number
  /** Unit of time */
  delayUnit: 'minutes' | 'hours' | 'days'
}

/**
 * Configuration for wait_for_event action.
 * Pauses the automation until a specific event occurs.
 */
export interface WaitForEventActionConfig {
  type: 'wait_for_event'
  /** Type of event to wait for — appointment_started pauses until the booking starts */
  eventType: 'appointment_started' | 'email_opened' | 'email_clicked'
  /**
   * Reference to a Send Email node in this workflow.
   * The system will wait for events on the email sent by that node.
   * Only relevant for email_opened / email_clicked events.
   */
  sourceEmailNodeId?: string
  /** Display label of the referenced email node */
  sourceEmailNodeLabel?: string
  /** Booking calendar ID filter for appointment_started events */
  calendarId?: string
  /** Display name of the calendar (for UI) */
  calendarName?: string
  /** Maximum time to wait (in hours) before timing out */
  timeoutHours?: number
  /** What to do if timeout is reached */
  timeoutAction?: 'continue' | 'stop'
}

/**
 * Configuration for send_notification action.
 * Sends an internal notification to team members.
 */
export interface SendNotificationActionConfig {
  type: 'send_notification'
  /** Notification title template */
  titleTemplate: string
  /** Notification body template */
  bodyTemplate: string
  /** Member IDs to notify (if empty, notifies all) */
  notifyMemberIds?: string[]
  /** Notification channel (in-app, email, both) */
  channel?: 'in_app' | 'email' | 'both'
}

/**
 * Configuration for call_webhook action.
 * Makes an HTTP request to an external URL.
 */
export interface CallWebhookActionConfig {
  type: 'call_webhook'
  /** URL to call */
  url: string
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Custom headers as key-value pairs */
  headers?: Record<string, string>
  /** Request body template (for POST/PUT/PATCH) */
  bodyTemplate?: string
  /** Content type for body */
  contentType?: 'application/json' | 'application/x-www-form-urlencoded'
}

/**
 * Union of all action configurations.
 */
export type ActionConfig =
  | SendEmailActionConfig
  | AddTagActionConfig
  | RemoveTagActionConfig
  | CreatePipelineTicketActionConfig
  | UpdatePipelineTicketActionConfig
  | WaitDelayActionConfig
  | WaitForEventActionConfig
  | SendNotificationActionConfig
  | CallWebhookActionConfig

// ============================================================================
// CONDITION CONFIGURATION
// ============================================================================

/**
 * Comparison operators for condition rules.
 */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'

/**
 * Single condition rule for IF/ELSE logic.
 * SOURCE OF TRUTH: ConditionRule
 */
export interface ConditionRule {
  id: string
  /** Field to check (e.g., 'lead.email', 'lead.status', 'trigger.formData.company') */
  field: string
  /** Display label for the field (for UI) */
  fieldLabel: string
  /** Comparison operator */
  operator: ConditionOperator
  /** Value to compare against */
  value: string | number | boolean
}

/**
 * Configuration for if_else condition node.
 */
export interface IfElseConditionConfig {
  type: 'if_else'
  /** Condition rules to evaluate */
  conditions: ConditionRule[]
  /** How to combine multiple conditions */
  logicalOperator: 'and' | 'or'
}

/**
 * Picker type for branch condition value inputs.
 * Determines which dynamic picker to render based on the selected condition field.
 * SOURCE OF TRUTH: BranchPickerType, ConditionFieldPickerType
 */
export type BranchPickerType =
  | 'text'
  | 'form'
  | 'pipeline'
  | 'pipeline_stage'
  | 'product'
  | 'calendar'
  | 'tag'
  | 'lead_status'
  | 'trigger_type'
  | 'billing_type'
  | 'payment_status'

/**
 * A single condition rule within a branch — extends ConditionRule with a pickerType
 * for dynamic value input rendering.
 * SOURCE OF TRUTH: BranchConditionRule, BranchConditionField
 */
export interface BranchConditionRule {
  id: string
  /** Dot-notation key (e.g., 'trigger.form.name', 'lead.status', '_triggerType') */
  field: string
  /** Display label for the field (for UI) */
  fieldLabel: string
  /** Comparison operator */
  operator: ConditionOperator
  /** Value to compare against */
  value: string | number | boolean
  /** Which picker to render for the value input (derived from field selection) */
  pickerType?: BranchPickerType
  /**
   * How this rule connects to the previous rule.
   * First rule in a branch doesn't use this (it's always "IF").
   * Subsequent rules choose 'and' or 'or' individually.
   * Falls back to branch-level logicalOperator for backward compat.
   */
  logicalOperator?: 'and' | 'or'
}

/**
 * One branch in the Branch node — has its own compound conditions.
 * SOURCE OF TRUTH: BranchDefinition, BranchPath
 */
export interface BranchDefinition {
  id: string
  /** Display label (e.g., "Branch 1", "VIP Path") */
  label: string
  /** Condition rules for this branch */
  conditions: BranchConditionRule[]
  /** How to combine multiple conditions in this branch */
  logicalOperator: 'and' | 'or'
}

/**
 * Branch condition config — supports N dynamic branches with compound conditions.
 * Replaces if_else for new automations. Branches are evaluated top-to-bottom,
 * first match wins. Default branch catches everything else.
 * SOURCE OF TRUTH: BranchConditionConfig, BranchNodeConfig
 */
export interface BranchConditionConfig {
  type: 'branch'
  /** Ordered list of branches — evaluated top-to-bottom, first match wins */
  branches: BranchDefinition[]
  /** Default branch always exists — catches everything else (no conditions to configure) */
  hasDefault: true
}

/**
 * Union of all condition configurations.
 */
export type ConditionConfig = IfElseConditionConfig | BranchConditionConfig

// ============================================================================
// NODE DATA STRUCTURES
// ============================================================================

/**
 * Base interface for all node data.
 * Contains common properties shared by all node types.
 *
 * Note: Index signature allows additional properties and satisfies
 * React Flow's Record<string, unknown> constraint.
 */
export interface BaseNodeData {
  /** Display label for the node */
  label: string
  /** Optional description */
  description?: string
  /** Whether node is properly configured */
  isConfigured: boolean
  /** Validation errors if any */
  errors?: string[]
  /** Allow additional properties for React Flow compatibility */
  [key: string]: unknown
}

/**
 * Trigger node data structure.
 */
export interface TriggerNodeData extends BaseNodeData {
  nodeCategory: 'trigger'
  triggerType: AutomationTriggerType
  config: TriggerConfig
}

/**
 * Action node data structure.
 */
export interface ActionNodeData extends BaseNodeData {
  nodeCategory: 'action'
  actionType: AutomationActionType
  config: ActionConfig
}

/**
 * Condition node data structure.
 */
export interface ConditionNodeData extends BaseNodeData {
  nodeCategory: 'condition'
  conditionType: AutomationConditionType
  config: ConditionConfig
}

/**
 * Start node data structure.
 * The Start node is a permanent, non-deletable connector between triggers (left)
 * and the action/condition sequence (right). It has no properties drawer.
 * SOURCE OF TRUTH: StartNodeData, StartNode
 */
export interface StartNodeData extends BaseNodeData {
  nodeCategory: 'start'
}

/**
 * Union of all node data types.
 */
export type AutomationNodeData = TriggerNodeData | ActionNodeData | ConditionNodeData | StartNodeData

// ============================================================================
// REACT FLOW NODE/EDGE TYPES
// ============================================================================

/**
 * React Flow node with automation-specific data.
 * SOURCE OF TRUTH: AutomationNode
 *
 * Note: BaseNodeData includes an index signature that satisfies React Flow's
 * Record<string, unknown> constraint.
 */
export type AutomationNode = Node<AutomationNodeData, 'trigger' | 'action' | 'condition' | 'start'>

/**
 * React Flow edge for automation connections.
 * SOURCE OF TRUTH: AutomationEdge
 */
export type AutomationEdge = Edge<{
  /** Label for the edge (e.g., 'True', 'False' for condition branches) */
  label?: string
}>

// ============================================================================
// AUTOMATION SCHEMA
// ============================================================================

/**
 * Complete automation schema.
 * This is stored as JSON in the database.
 * SOURCE OF TRUTH: AutomationSchema
 */
export interface AutomationSchema {
  /** Schema version for future migrations (optional for legacy data) */
  version?: number
  /** All nodes in the automation */
  nodes: AutomationNode[]
  /** All edges/connections between nodes */
  edges: AutomationEdge[]
}

// ============================================================================
// AUTOMATION STATUS
// ============================================================================

/**
 * Automation status values.
 * SOURCE OF TRUTH: AutomationStatus
 */
export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived'

// ============================================================================
// AUTOMATION ENTITY
// ============================================================================

/**
 * Complete automation object.
 * This represents the full automation as stored in the database.
 * SOURCE OF TRUTH: Automation
 */
export interface Automation {
  id: string
  /** Organization this automation belongs to */
  organizationId: string
  /** Display name of the automation */
  name: string
  /** Optional description */
  description?: string
  /** Current status */
  status: AutomationStatus
  /** Trigger type for this automation */
  triggerType?: string
  /** The automation schema (nodes and edges) */
  schema: AutomationSchema
  /** Creation timestamp (string from tRPC JSON serialization, Date when constructed locally) */
  createdAt: Date | string
  /** Last update timestamp (string from tRPC JSON serialization, Date when constructed locally) */
  updatedAt: Date | string
  /** Run statistics (optional since not always included) */
  stats?: AutomationStats
}

/**
 * Automation run statistics.
 */
export interface AutomationStats {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastRunAt?: Date
}

// ============================================================================
// RUN HISTORY
// ============================================================================

/**
 * Run status values.
 * Note: 'skipped' is a UI-only status — derived when all non-trigger steps were skipped.
 * The DB stores 'COMPLETED' for these runs since nothing actually failed.
 */
export type AutomationRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped'

/**
 * Single automation run record.
 * SOURCE OF TRUTH: AutomationRun
 */
export interface AutomationRun {
  id: string
  automationId: string
  status: AutomationRunStatus
  startedAt: Date
  completedAt?: Date
  /** Data from the trigger event */
  triggerData: Record<string, unknown>
  /** Step-by-step execution log */
  steps: AutomationRunStep[]
  /** Error message if failed */
  error?: string
}

/**
 * Single step in an automation run.
 * Contains detailed execution information for debugging and history display.
 */
export interface AutomationRunStep {
  nodeId: string
  /** Human-readable name of the node */
  nodeName: string
  /** Node type (trigger, action, condition) */
  nodeType: 'trigger' | 'action' | 'condition'
  /** Specific action/trigger type (e.g., "send_email", "add_tag") */
  actionType?: string
  /** Current execution status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  /** When step started (ISO string from API) */
  startedAt?: Date | string
  /** When step completed (ISO string from API) */
  completedAt?: Date | string
  /** Duration in milliseconds */
  durationMs?: number
  /** Step output/result data */
  output?: Record<string, unknown>
  /** Error message if step failed */
  error?: string
  /** Human-readable reason why this step was skipped (missing data, not a system error) */
  skipReason?: string
  /** For condition nodes: which branch was taken (if_else: 'true'/'false', branch: branchId or 'default') */
  branchTaken?: string
  /** Input data used by this step (for debugging) */
  input?: Record<string, unknown>
}

// ============================================================================
// BUILDER STATE TYPES
// ============================================================================

/**
 * Selection state for the builder.
 */
export interface BuilderSelection {
  /** Currently selected node ID */
  selectedNodeId: string | null
}

/**
 * Drag state for node palette.
 */
export interface DragState {
  /** Whether dragging is active */
  isDragging: boolean
  /** Type of node being dragged from palette */
  draggedNodeType: AutomationNodeType | null
}

/**
 * Undo/redo history entry.
 */
export interface HistoryEntry {
  /** Snapshot of the schema */
  schema: AutomationSchema
  /** Timestamp of the change */
  timestamp: number
  /** Description of the change */
  description: string
}

/**
 * Complete builder state.
 * SOURCE OF TRUTH: AutomationBuilderState
 */
export interface AutomationBuilderState {
  /** Automation ID */
  id: string
  /** Automation name */
  name: string
  /** Automation description */
  description: string
  /** Current status */
  status: AutomationStatus
  /** Current schema (nodes and edges) */
  schema: AutomationSchema
  /** Selection state */
  selection: BuilderSelection
  /** Drag state */
  drag: DragState
  /** Undo/redo history */
  history: HistoryEntry[]
  /** Current history index */
  historyIndex: number
  /** Whether there are unsaved changes */
  isDirty: boolean
  /** Active tab in the builder */
  activeTab: 'build' | 'activity'
  /** Whether the properties drawer is open */
  isDrawerOpen: boolean
  /** Whether auto-save is enabled */
  autoSaveEnabled: boolean
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/**
 * Props for the main AutomationBuilder component.
 */
export interface AutomationBuilderProps {
  /** Organization ID */
  organizationId: string
  /** Automation ID (for editing existing) */
  automationId?: string
  /** URL slug for the automation */
  slug?: string
  /** Initial automation data */
  initialAutomation?: Automation
  /** Callback when automation is saved */
  onSave?: (automation: Automation) => Promise<void>
  /** Callback when status changes */
  onStatusChange?: (status: AutomationStatus) => Promise<void>
  /** Callback when slug changes */
  onSlugChange?: (slug: string) => void | Promise<void>
  /** Callback when builder is closed */
  onClose?: () => void
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Fixed ID for the Start node — used throughout the builder for guards and lookups.
 * SOURCE OF TRUTH: START_NODE_ID, StartNode
 */
export const START_NODE_ID = 'start_node'

/**
 * Default automation schema with a Start node at the center.
 * The Start node is always present and connects triggers (left) to actions (right).
 */
export const DEFAULT_AUTOMATION_SCHEMA: AutomationSchema = {
  version: 2,
  nodes: [
    {
      id: START_NODE_ID,
      type: 'start',
      position: { x: 400, y: 200 },
      data: {
        label: 'Start',
        isConfigured: true,
        nodeCategory: 'start',
      } as StartNodeData,
    },
  ],
  edges: [],
}

/**
 * Default automation statistics.
 */
export const DEFAULT_AUTOMATION_STATS: AutomationStats = {
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0,
}

/**
 * Default builder state (partial - without automation-specific data).
 */
export const DEFAULT_BUILDER_STATE_PARTIAL: Omit<
  AutomationBuilderState,
  'id' | 'name' | 'description' | 'status' | 'schema'
> = {
  selection: { selectedNodeId: null },
  drag: { isDragging: false, draggedNodeType: null },
  history: [],
  historyIndex: -1,
  isDirty: false,
  activeTab: 'build',
  isDrawerOpen: false,
  autoSaveEnabled: true, // Auto-save ON by default (matches form builder UX)
}
