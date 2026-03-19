/**
 * useAutomationVariables — Hook for trigger-aware variable picker props
 *
 * Reads the current trigger types from the automation builder context and
 * resolves the correct variable categories via TRIGGER_CATEGORY_MAP.
 * Returns props ready to spread onto the shared VariablePicker component.
 *
 * Supports multi-trigger automations: finds ALL triggers connected to the
 * Start node and unions their variable categories (deduplicated by category ID).
 *
 * WHY: Avoids duplicating trigger-resolution logic in every action config.
 * Each action component just calls this hook and passes the result to VariablePicker.
 *
 * SOURCE OF TRUTH: TRIGGER_CATEGORY_MAP from @/lib/variables/variable-categories.ts
 * Keywords: AUTOMATION_VARIABLES, TRIGGER_AWARE_VARIABLES, USE_AUTOMATION_VARIABLES
 */

import { useMemo } from 'react'
import { useAutomationBuilder } from './automation-builder-context'
import type { TriggerNodeData, AutomationTriggerType } from './types'
import { START_NODE_ID } from './types'
import {
  SHARED_CATEGORIES,
  TRIGGER_CATEGORY_MAP,
  type VariableCategory,
} from '@/lib/variables/variable-categories'

interface AutomationVariableProps {
  /** Organization ID from the automation builder context */
  organizationId: string
  /** Trigger-filtered categories (or all shared categories as fallback) */
  categories: VariableCategory[]
  /** All connected trigger types (for use by Branch condition field registry) */
  triggerTypes: AutomationTriggerType[]
}

/**
 * Returns `organizationId`, `categories`, and `triggerTypes` props.
 * Reads ALL connected trigger types from the builder context to determine
 * which categories to show. Supports multi-trigger automations via Start node.
 */
export function useAutomationVariables(): AutomationVariableProps {
  const { state, organizationId } = useAutomationBuilder()

  /**
   * Find all trigger types in the automation.
   *
   * Strategy (in order):
   * 1. v2: Find triggers connected to Start node via "triggers" handle edges
   * 2. Fallback: Find ALL trigger nodes on the canvas (even if not yet connected)
   *    This ensures triggers are visible in Branch conditions even before
   *    the user draws the edge to the Start node.
   */
  const triggerTypes = useMemo(() => {
    // First try: find triggers connected to Start node via edges
    const startNode = state.schema.nodes.find((n) => n.id === START_NODE_ID)
    if (startNode) {
      const triggerEdges = state.schema.edges.filter(
        (e) => e.target === START_NODE_ID && e.targetHandle === 'triggers'
      )
      if (triggerEdges.length > 0) {
        const triggerNodeIds = new Set(triggerEdges.map((e) => e.source))
        const connected = state.schema.nodes
          .filter((n) => triggerNodeIds.has(n.id) && n.data.nodeCategory === 'trigger')
          .map((n) => (n.data as TriggerNodeData).triggerType)

        if (connected.length > 0) return connected
      }
    }

    // Fallback: find ALL trigger nodes on the canvas (connected or not)
    const allTriggers = state.schema.nodes
      .filter((n) => n.data.nodeCategory === 'trigger')
      .map((n) => (n.data as TriggerNodeData).triggerType)

    return allTriggers
  }, [state.schema.nodes, state.schema.edges])

  /**
   * Union all categories across all trigger types (deduplicate by category ID).
   * Falls back to SHARED_CATEGORIES if no triggers are connected.
   */
  const categories = useMemo(() => {
    if (triggerTypes.length === 0) return SHARED_CATEGORIES

    const seen = new Set<string>()
    const result: VariableCategory[] = []

    for (const tt of triggerTypes) {
      const cats = TRIGGER_CATEGORY_MAP[tt] ?? SHARED_CATEGORIES
      for (const cat of cats) {
        if (!seen.has(cat.id)) {
          seen.add(cat.id)
          result.push(cat)
        }
      }
    }

    return result.length > 0 ? result : SHARED_CATEGORIES
  }, [triggerTypes])

  return { organizationId, categories, triggerTypes }
}
