/**
 * ============================================================================
 * BASE NODE COMPONENT
 * ============================================================================
 *
 * Shared wrapper component for all automation nodes.
 * Provides consistent styling, handles, and layout.
 *
 * DESIGN (Modern minimal):
 * - Super-rounded single container (no separate header bar)
 * - Icon + label in a clean top row
 * - Config preview content below
 * - Horizontal flow: target handle on left, source handle on right
 *
 * SOURCE OF TRUTH: AutomationNode, NodeRegistryEntry
 */

'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { getNodeEntry } from '../../_lib/node-registry'
import type { AutomationNodeData } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

export interface BaseNodeProps {
  /** Node data */
  data: AutomationNodeData
  /** Whether the node is selected */
  selected: boolean
  /** Whether to show the source handle (right) */
  showSourceHandle?: boolean
  /** Whether to show the target handle (left) */
  showTargetHandle?: boolean
  /** Custom content to render below the icon+title row */
  children?: React.ReactNode
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BaseNode = memo(function BaseNode({
  data,
  selected,
  showSourceHandle = true,
  showTargetHandle = true,
  children,
}: BaseNodeProps) {
  const nodeType = getNodeTypeFromData(data)
  const nodeEntry = nodeType ? getNodeEntry(nodeType as Parameters<typeof getNodeEntry>[0]) : null
  const Icon = nodeEntry?.icon

  return (
    <div
      className={cn(
        'group min-w-[160px] max-w-[220px]',
        'bg-white dark:bg-muted rounded-3xl',
        'transition-all duration-200',
        selected && 'ring-2 ring-muted-foreground/30 ring-offset-2 ring-offset-background'
      )}
    >
      {/* Target Handle (left) — incoming connections in horizontal flow */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            '!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-background !rounded-full',
            '!-left-1.5 hover:!bg-muted-foreground/70 hover:!scale-150 !transition-all',
            '!opacity-0 group-hover:!opacity-100'
          )}
        />
      )}

      {/* Single clean container — icon + title row, content below */}
      <div className="px-4 py-3 space-y-2">
        {/* Icon + Title row */}
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <span className="text-sm font-medium truncate text-foreground">{data.label}</span>
        </div>

        {/* Body content — config previews or description */}
        {children ?? (
          <>
            {!data.isConfigured && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                Needs configuration
              </div>
            )}
          </>
        )}
      </div>

      {/* Source Handle (right) — outgoing connections in horizontal flow */}
      {showSourceHandle && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            '!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-background !rounded-full',
            '!-right-1.5 hover:!bg-muted-foreground/70 hover:!scale-150 !transition-all',
            '!opacity-0 group-hover:!opacity-100'
          )}
        />
      )}
    </div>
  )
})

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
