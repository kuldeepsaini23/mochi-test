/**
 * ============================================================================
 * AUTOMATION BUILDER - PUBLIC EXPORTS
 * ============================================================================
 *
 * Public API for the automation builder component.
 * Import from '@/components/automation-builder' to use.
 *
 * SOURCE OF TRUTH: AutomationBuilderTypes
 */

// Main component
export { AutomationBuilder } from './automation-builder'

// Context and hooks
export {
  AutomationBuilderProvider,
  useAutomationBuilder,
} from './_lib/automation-builder-context'

// Types
export type {
  // Node categories and types
  AutomationNodeCategory,
  AutomationTriggerType,
  AutomationActionType,
  AutomationConditionType,
  AutomationNodeType,
  // Configurations
  TriggerConfig,
  ActionConfig,
  ConditionConfig,
  ConditionRule,
  ConditionOperator,
  // Node data
  AutomationNodeData,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
  // React Flow types
  AutomationNode,
  AutomationEdge,
  // Automation types
  AutomationSchema,
  AutomationStatus,
  Automation,
  AutomationStats,
  // Run types
  AutomationRunStatus,
  AutomationRun,
  AutomationRunStep,
  // Builder state
  AutomationBuilderState,
  AutomationBuilderProps,
  // Other types
  BuilderSelection,
  DragState,
  HistoryEntry,
} from './_lib/types'

// Default values
export {
  DEFAULT_AUTOMATION_SCHEMA,
  DEFAULT_AUTOMATION_STATS,
  DEFAULT_BUILDER_STATE_PARTIAL,
} from './_lib/types'

// Registry
export {
  NODE_REGISTRY,
  NODE_CATEGORIES,
  TRIGGER_REGISTRY,
  ACTION_REGISTRY,
  CONDITION_REGISTRY,
  getNodeEntry,
  getNodesByCategory,
  getCategoryMeta,
  getGroupedNodes,
  isTriggerType,
  isActionType,
  isConditionType,
  getNodeIcon,
  getDefaultTriggerConfig,
  getDefaultActionConfig,
  getDefaultConditionConfig,
} from './_lib/node-registry'

// Utilities
export {
  createAutomationNode,
  generateNodeId,
  generateEdgeId,
  generateConditionRuleId,
  validateNode,
  getAvailableVariables,
  formatVariableTemplate,
  getStatusDisplay,
  getRunStatusDisplay,
  formatDelay,
  formatRelativeTime,
} from './_lib/utils'
