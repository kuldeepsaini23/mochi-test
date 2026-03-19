/**
 * ============================================================================
 * START NODE COMPONENT
 * ============================================================================
 *
 * Permanent, non-deletable connector node between triggers and the action sequence.
 * Sits at the center of the automation canvas.
 *
 * DESIGN:
 * - Matches existing node theme (rounded-3xl, bg-white dark:bg-muted)
 * - Same handle styling as BaseNode (muted-foreground)
 * - Left handle (id="triggers", type=target) with "Triggers" label
 * - Right handle (id="sequence", type=source) with "Sequence" label
 * - Handles always visible (not hidden on hover like BaseNode)
 * - Cannot be deleted — no hover delete UI
 * - No properties drawer — clicking does nothing
 *
 * NOTE: Does NOT extend BaseNode because the layout is different (two labeled handles).
 *
 * SOURCE OF TRUTH: StartNodeData, START_NODE_ID
 */

'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StartNodeData } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

type StartNodeType = Node<StartNodeData & Record<string, unknown>, 'start'>

// ============================================================================
// COMPONENT
// ============================================================================

export const StartNode = memo(function StartNode({
  selected,
}: NodeProps<StartNodeType>) {
  return (
    <div
      className={cn(
        'relative flex items-center',
        'bg-white dark:bg-muted rounded-3xl px-5 py-3',
        'transition-all duration-200',
        selected && 'ring-2 ring-muted-foreground/30 ring-offset-2 ring-offset-background'
      )}
    >
      {/* Left handle — triggers connect here (many-to-one, OR logic) */}
      <Handle
        id="triggers"
        type="target"
        position={Position.Left}
        className={cn(
          '!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-background !rounded-full',
          '!-left-1.5 hover:!bg-muted-foreground/70 hover:!scale-150 !transition-all'
        )}
      />

      {/* "Triggers" label on left side */}
      <span className="absolute -left-16 text-[10px] font-medium text-muted-foreground/60 select-none">
        Triggers
      </span>

      {/* Center: play icon + label */}
      <div className="flex items-center gap-1.5">
        <Play className="h-3.5 w-3.5 text-foreground fill-foreground" />
        <span className="text-sm font-medium text-foreground">Start</span>
      </div>

      {/* Right handle — action/condition sequence connects here (one-to-one) */}
      <Handle
        id="sequence"
        type="source"
        position={Position.Right}
        className={cn(
          '!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-background !rounded-full',
          '!-right-1.5 hover:!bg-muted-foreground/70 hover:!scale-150 !transition-all'
        )}
      />

      {/* "Sequence" label on right side */}
      <span className="absolute -right-18 text-[10px] font-medium text-muted-foreground/60 select-none">
        Sequence
      </span>
    </div>
  )
})
