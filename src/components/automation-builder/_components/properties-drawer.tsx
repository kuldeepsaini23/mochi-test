/**
 * ============================================================================
 * PROPERTIES DRAWER
 * ============================================================================
 *
 * Right-side drawer panel for editing selected node properties.
 * Opens when a node is selected on the canvas.
 *
 * FEATURES:
 * - Shows node type and description
 * - Type-specific configuration forms
 * - Available variables section
 * - Delete node button
 *
 * SOURCE OF TRUTH: AutomationNode, AutomationNodeData
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TrashIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAutomationBuilder } from '../_lib/automation-builder-context'
import { getNodeEntry, getCategoryMeta } from '../_lib/node-registry'
import { validateNodeConfig, type FieldErrors } from '../_lib/config-schemas'
import { cn } from '@/lib/utils'
import type {
  AutomationNode,
  AutomationNodeData,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
  TriggerConfig,
  ActionConfig,
  ConditionConfig,
} from '../_lib/types'
import {
  // Trigger Configs
  TriggerFormSubmittedConfig,
  TriggerPipelineTicketMovedConfig,
  TriggerPaymentCompletedConfig,
  TriggerAppointmentScheduledConfig,
  TriggerAppointmentStartedConfig,
  TriggerTrialStartedConfig,
  TriggerSubscriptionRenewedConfig,
  TriggerSubscriptionCancelledConfig,
  // Action Configs
  ActionSendEmailConfig,

  ActionAddTagConfig,
  ActionRemoveTagConfig,
  ActionCreatePipelineTicketConfig,
  ActionUpdatePipelineTicketConfig,
  ActionWaitDelayConfig,
  ActionWaitForEventConfig,
  ActionSendNotificationConfig,
  ActionCallWebhookConfig,
  // Condition Configs
  ConditionIfElseConfig,
  ConditionBranchConfig,
} from './node-configs'

// ============================================================================
// COMPONENT
// ============================================================================

export function PropertiesDrawer() {
  const { state, dispatch } = useAutomationBuilder()
  /** Field-level config validation errors (field path → message) */
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  /** Label-level validation error */
  const [labelError, setLabelError] = useState<string | null>(null)

  /**
   * Get the selected node
   */
  const selectedNode = useMemo(() => {
    if (!state.selection.selectedNodeId) return null
    return state.schema.nodes.find((n) => n.id === state.selection.selectedNodeId) ?? null
  }, [state.selection.selectedNodeId, state.schema.nodes])

  /**
   * Whether there are any validation errors (label or config fields).
   */
  const hasErrors = labelError !== null || Object.keys(fieldErrors).length > 0

  /**
   * Clear stale validation errors when user selects a different node.
   */
  const selectedNodeId = selectedNode?.id ?? null
  useEffect(() => {
    setFieldErrors({})
    setLabelError(null)
  }, [selectedNodeId])

  /**
   * Check if drawer should be open
   */
  const isOpen = selectedNode !== null

  /**
   * Close the drawer and clear validation errors.
   */
  const handleClose = useCallback(() => {
    setFieldErrors({})
    setLabelError(null)
    dispatch({ type: 'SELECT_NODE', payload: { nodeId: null } })
  }, [dispatch])

  /**
   * Save button handler.
   * Validates label (required) and config fields via Zod.
   * - If valid: clears errors and closes the drawer
   * - If invalid: sets field errors so they display inline below each input
   */
  const handleSave = useCallback(() => {
    if (!selectedNode) return

    // Start node has no properties — should never reach here, but guard anyway
    if (selectedNode.data.nodeCategory === 'start') {
      dispatch({ type: 'SELECT_NODE', payload: { nodeId: null } })
      return
    }

    // Validate label — required for all node types
    const trimmedLabel = selectedNode.data.label?.trim()
    const newLabelError = !trimmedLabel ? 'Label is required' : null

    // Validate config fields via Zod schemas
    const config = getConfigFromData(selectedNode.data)
    const category = selectedNode.data.nodeCategory as 'trigger' | 'action' | 'condition' | 'control'
    const newFieldErrors = validateNodeConfig(
      category,
      config as unknown as Parameters<typeof validateNodeConfig>[1]
    )

    setLabelError(newLabelError)
    setFieldErrors(newFieldErrors)

    // If any errors, keep drawer open
    if (newLabelError || Object.keys(newFieldErrors).length > 0) {
      return
    }

    // Valid — close drawer
    dispatch({ type: 'SELECT_NODE', payload: { nodeId: null } })
  }, [selectedNode, dispatch])

  /**
   * Cancel button handler.
   * Simply closes the drawer without any validation.
   */
  const handleCancel = useCallback(() => {
    handleClose()
  }, [handleClose])

  /**
   * Delete the selected node
   */
  const handleDelete = useCallback(() => {
    if (!selectedNode) return
    dispatch({ type: 'DELETE_NODE', payload: { nodeId: selectedNode.id } })
  }, [selectedNode, dispatch])

  /**
   * Update the node's label
   */
  const handleLabelChange = useCallback(
    (label: string) => {
      if (!selectedNode) return
      dispatch({
        type: 'UPDATE_NODE',
        payload: {
          nodeId: selectedNode.id,
          data: { ...selectedNode.data, label },
        },
      })
    },
    [selectedNode, dispatch]
  )


  /**
   * Get node type display info
   */
  const nodeTypeInfo = useMemo(() => {
    if (!selectedNode) return null

    const nodeType = getNodeTypeFromData(selectedNode.data)
    if (!nodeType) return null

    const entry = getNodeEntry(nodeType as Parameters<typeof getNodeEntry>[0])
    const categoryMeta = getCategoryMeta(selectedNode.data.nodeCategory)

    return {
      entry,
      categoryMeta,
      Icon: entry?.icon,
    }
  }, [selectedNode])

  return (
    <AnimatePresence>
      {isOpen && selectedNode && nodeTypeInfo && (
        <motion.div
          initial={{ width: 0, marginLeft: 0, opacity: 0, filter: 'blur(8px)' }}
          animate={{ width: 360, marginLeft: 12, opacity: 1, filter: 'blur(0px)' }}
          exit={{ width: 0, marginLeft: 0, opacity: 0, filter: 'blur(8px)' }}
          transition={{ type: 'spring', stiffness: 200, damping: 24, mass: 0.8 }}
          className="h-full shrink-0 overflow-hidden"
        >
          <div className="h-full w-[360px] flex flex-col bg-white dark:bg-muted rounded-3xl overflow-hidden">
            {/* Header — Apple-style: bold title, description, action icons */}
            <div className="px-6 pt-6 pb-2 shrink-0">
              <div className="flex items-start justify-between">
                <h2 className="text-base font-semibold tracking-tight">
                  {nodeTypeInfo.entry?.label ?? 'Node'}
                </h2>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDelete}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {nodeTypeInfo.entry?.description ?? nodeTypeInfo.categoryMeta?.label}
              </p>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
              <div className="space-y-5">
                {/* Name — inline row: label left, input right */}
                <div className="space-y-1">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium shrink-0 w-16">Name</span>
                    <Input
                      id="node-label"
                      value={selectedNode.data.label}
                      onChange={(e) => handleLabelChange(e.target.value)}
                      placeholder="Node name"
                      className={cn(
                        'h-9 py-2 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm flex-1',
                        labelError && 'ring-1 ring-muted-foreground/30'
                      )}
                    />
                  </div>
                  {labelError && (
                    <p className="text-xs text-muted-foreground pl-20">{labelError}</p>
                  )}
                </div>

                {/* Type-specific configuration */}
                <NodeConfigForm node={selectedNode} fieldErrors={fieldErrors} />
              </div>
            </div>

            {/* Sticky bottom controls */}
            <div className="shrink-0 px-6 pb-6 pt-3">
              {hasErrors && (
                <p className="text-xs text-muted-foreground mb-3">
                  Please fill in the required fields above.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSave} className="flex-1 rounded-xl h-9">
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  className="flex-1 rounded-xl h-9"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ============================================================================
// NODE CONFIG FORM
// ============================================================================

interface NodeConfigFormProps {
  node: AutomationNode
  fieldErrors: FieldErrors
}

/**
 * Renders the appropriate configuration form based on node type.
 * Routes to specific config components for each trigger, action, and condition type.
 * Passes fieldErrors to each config component for inline error display.
 */
function NodeConfigForm({ node, fieldErrors }: NodeConfigFormProps) {
  const { dispatch } = useAutomationBuilder()
  const { data } = node

  /**
   * Update the node's config.
   * Uses type assertion to handle discriminated union updates properly.
   */
  const handleConfigChange = useCallback(
    (newConfig: TriggerConfig | ActionConfig | ConditionConfig) => {
      // Create update data with the new config
      // Cast to unknown first to handle the discriminated union properly
      const updatedData = {
        ...data,
        config: newConfig,
        isConfigured: true,
      } as unknown as Partial<AutomationNodeData>

      dispatch({
        type: 'UPDATE_NODE',
        payload: {
          nodeId: node.id,
          data: updatedData,
        },
      })
    },
    [node.id, data, dispatch]
  )

  /**
   * Render trigger config forms.
   */
  if (data.nodeCategory === 'trigger') {
    const triggerData = data as TriggerNodeData
    const config = triggerData.config

    switch (config.type) {
      case 'form_submitted':
        return (
          <TriggerFormSubmittedConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'pipeline_ticket_moved':
        return (
          <TriggerPipelineTicketMovedConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'payment_completed':
        return (
          <TriggerPaymentCompletedConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'appointment_scheduled':
        return (
          <TriggerAppointmentScheduledConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      // DEPRECATED: appointment_started trigger removed from UI.
      // Existing automations with this trigger still render via the scheduled config.
      case 'appointment_started':
        return (
          <TriggerAppointmentStartedConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'trial_started':
        return (
          <TriggerTrialStartedConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'subscription_renewed':
        return (
          <TriggerSubscriptionRenewedConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'subscription_cancelled':
        return (
          <TriggerSubscriptionCancelledConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      default:
        return <UnknownConfigPlaceholder data={data} />
    }
  }

  /**
   * Render action config forms.
   */
  if (data.nodeCategory === 'action') {
    const actionData = data as ActionNodeData
    const config = actionData.config

    switch (config.type) {
      case 'send_email':
        return (
          <ActionSendEmailConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'add_tag':
        return (
          <ActionAddTagConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'remove_tag':
        return (
          <ActionRemoveTagConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'create_pipeline_ticket':
        return (
          <ActionCreatePipelineTicketConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'update_pipeline_ticket':
        return (
          <ActionUpdatePipelineTicketConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'wait_delay':
        return (
          <ActionWaitDelayConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'wait_for_event':
        return (
          <ActionWaitForEventConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'send_notification':
        return (
          <ActionSendNotificationConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'call_webhook':
        return (
          <ActionCallWebhookConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      default:
        return <UnknownConfigPlaceholder data={data} />
    }
  }

  /**
   * Render condition config forms.
   */
  if (data.nodeCategory === 'condition') {
    const conditionData = data as ConditionNodeData
    const config = conditionData.config

    switch (config.type) {
      case 'if_else':
        return (
          <ConditionIfElseConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      case 'branch':
        return (
          <ConditionBranchConfig
            config={config}
            onChange={handleConfigChange}
            errors={fieldErrors}
          />
        )
      default:
        return <UnknownConfigPlaceholder data={data} />
    }
  }

  return <UnknownConfigPlaceholder data={data} />
}

/**
 * Fallback placeholder for unknown node types.
 */
function UnknownConfigPlaceholder({ data }: { data: AutomationNodeData }) {
  return (
    <p className="text-sm text-muted-foreground">
      No configuration available for this {data.nodeCategory}.
    </p>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the specific node type from node data
 */
function getNodeTypeFromData(data: AutomationNodeData): string | null {
  if (data.nodeCategory === 'trigger') {
    return (data as { triggerType?: string }).triggerType ?? null
  }
  if (data.nodeCategory === 'action') {
    return (data as { actionType?: string }).actionType ?? null
  }
  if (data.nodeCategory === 'condition') {
    return (data as { conditionType?: string }).conditionType ?? null
  }
  return null
}

/**
 * Get the config object from node data
 */
function getConfigFromData(data: AutomationNodeData): Record<string, unknown> {
  if ('config' in data && typeof data.config === 'object' && data.config !== null) {
    return data.config as unknown as Record<string, unknown>
  }
  return {}
}
