/**
 * ============================================================================
 * CONDITION NODE COMPONENT
 * ============================================================================
 *
 * Node component for condition types (if_else and branch).
 * Conditions create branching logic in the workflow.
 *
 * DESIGN:
 * - if_else: 2 fixed handles (True at 35%, Else at 80%) — backward compat
 * - branch: N dynamic handles (one per branch + default), evenly spaced
 *
 * Each handle ID maps to a branch's ID (or 'true'/'false'/'default'),
 * which the execution engine uses to find the next node via edges.
 *
 * SOURCE OF TRUTH: ConditionNodeData, BranchConditionConfig
 */

'use client'

import { memo, useMemo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { getNodeEntry } from '../../_lib/node-registry'
import type {
  ConditionNodeData,
  AutomationConditionType,
  BranchConditionConfig,
  IfElseConditionConfig,
} from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

type ConditionNodeType = Node<ConditionNodeData & Record<string, unknown>, 'condition'>

/** Handle definition for rendering dynamic source handles */
interface HandleDef {
  id: string
  label: string
  /** Vertical position as percentage (0-100) */
  position: number
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ConditionNode = memo(function ConditionNode({
  data,
  selected,
}: NodeProps<ConditionNodeType>) {
  const typedData = data as ConditionNodeData
  const nodeEntry = getNodeEntry(typedData.conditionType as AutomationConditionType)
  const Icon = nodeEntry?.icon

  /**
   * Compute source handles based on condition type.
   * - if_else: fixed True (35%) and Else (80%) handles
   * - branch: dynamic handles per branch + default, evenly spaced
   */
  const handles = useMemo<HandleDef[]>(() => {
    const config = typedData.config

    if (config.type === 'branch') {
      const branchConfig = config as BranchConditionConfig
      const totalHandles = branchConfig.branches.length + 1 // +1 for default

      return [
        ...branchConfig.branches.map((branch, i) => ({
          id: branch.id,
          label: branch.label,
          position: ((i + 1) / (totalHandles + 1)) * 100,
        })),
        {
          id: 'default',
          label: 'Default',
          position: (totalHandles / (totalHandles + 1)) * 100,
        },
      ]
    }

    // if_else backward compat — fixed True/Else positions
    return [
      { id: 'true', label: 'True', position: 35 },
      { id: 'false', label: 'Else', position: 80 },
    ]
  }, [typedData.config])

  /** Whether this is a branch-type node (vs if_else) */
  const isBranch = typedData.config.type === 'branch'

  return (
    <div
      className={cn(
        'group min-w-[240px] max-w-[320px]',
        'bg-white dark:bg-muted rounded-3xl',
        'transition-all duration-200',
        (selected ?? false) && 'ring-2 ring-muted-foreground/30 ring-offset-2 ring-offset-background'
      )}
    >
      {/* Target Handle (left) — incoming connections */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-background !rounded-full',
          '!-left-1.5',
          '!opacity-0 group-hover:!opacity-100 !transition-all'
        )}
      />

      {/* Icon + Title row */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <span className="text-sm font-medium truncate text-foreground">{typedData.label}</span>
        </div>
      </div>

      {/* Condition preview content */}
      <div className="px-4 pb-2">
        {isBranch ? (
          <BranchPreview config={typedData.config as BranchConditionConfig} />
        ) : (
          <IfElsePreview config={typedData.config as IfElseConditionConfig} />
        )}
      </div>

      {/* Handle labels section — shows branch labels next to their handles */}
      <div className="border-t border-muted-foreground/10 px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {handles.map((handle) => (
            <span
              key={handle.id}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded',
                handle.id === 'default' || handle.id === 'false'
                  ? 'text-muted-foreground/70 bg-muted/50'
                  : 'text-muted-foreground font-medium bg-muted'
              )}
            >
              {handle.label}
            </span>
          ))}
        </div>
      </div>

      {/* Dynamic source handles — positioned based on computed percentages */}
      {handles.map((handle) => (
        <Handle
          key={handle.id}
          type="source"
          position={Position.Right}
          id={handle.id}
          className={cn(
            '!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-background !rounded-full',
            '!-right-1.5',
            '!opacity-0 group-hover:!opacity-100 !transition-all'
          )}
          style={{ top: `${handle.position}%` }}
        />
      ))}
    </div>
  )
})

// ============================================================================
// BRANCH PREVIEW
// ============================================================================

/**
 * Shows a compact preview for branch-type conditions.
 * Displays first branch's conditions + branch count summary.
 */
function BranchPreview({ config }: { config: BranchConditionConfig }) {
  const totalBranches = config.branches.length
  const totalConditions = config.branches.reduce((sum, b) => sum + b.conditions.length, 0)

  if (totalBranches === 0 || totalConditions === 0) {
    return (
      <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
        Add conditions to branches
      </div>
    )
  }

  // Show first branch's first condition as preview
  const firstBranch = config.branches[0]
  const firstRule = firstBranch.conditions[0]

  return (
    <div className="space-y-1">
      {firstRule && (
        <div className="text-[11px] text-muted-foreground truncate bg-muted rounded-lg px-2.5 py-1.5">
          {firstRule.fieldLabel} {formatOperator(firstRule.operator)} {String(firstRule.value)}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground/60 px-2.5">
        {totalBranches} branch{totalBranches !== 1 ? 'es' : ''} + default
        {totalConditions > 1 && ` ({totalConditions} rules)`}
      </div>
    </div>
  )
}

// ============================================================================
// IF/ELSE PREVIEW (backward compat)
// ============================================================================

/**
 * Shows a compact preview of the if/else condition rules inside the node.
 * Displays up to 2 rules with the logical operator between them.
 */
function IfElsePreview({ config }: { config: IfElseConditionConfig }) {
  if (config.conditions.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
        Add conditions
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {config.conditions.slice(0, 2).map((condition, index) => (
        <div
          key={condition.id}
          className="text-[11px] text-muted-foreground truncate bg-muted rounded-lg px-2.5 py-1.5"
        >
          {index > 0 && (
            <span className="text-muted-foreground/80 font-medium uppercase mr-1 text-[10px]">
              {config.logicalOperator}
            </span>
          )}
          {condition.fieldLabel} {formatOperator(condition.operator)} {String(condition.value)}
        </div>
      ))}
      {config.conditions.length > 2 && (
        <div className="text-[10px] text-muted-foreground/60 px-2.5">
          +{config.conditions.length - 2} more
        </div>
      )}
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format condition operator for compact display
 */
function formatOperator(operator: string): string {
  const operatorMap: Record<string, string> = {
    equals: '==',
    not_equals: '!=',
    contains: 'contains',
    not_contains: 'not contains',
    starts_with: 'starts with',
    ends_with: 'ends with',
    is_empty: 'is empty',
    is_not_empty: 'is not empty',
    greater_than: '>',
    less_than: '<',
    greater_or_equal: '>=',
    less_or_equal: '<=',
  }
  return operatorMap[operator] ?? operator
}
