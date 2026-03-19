/**
 * ============================================================================
 * MOCHI WIDGET - TASK ITEM
 * ============================================================================
 *
 * A collapsible task item showing the status of a tool call execution.
 * Matches the builder AI widget's task-item visual style with theme-aware colors,
 * rounded border cards, and status-colored borders.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiTaskItem, ToolCallDisplay
 * ============================================================================
 */

'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Check, Loader2, Circle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MochiToolCall, MochiToolCallStatus } from '@/lib/ai/mochi/types'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Maps a camelCase tool name to a human-readable label.
 * e.g., "createLead" -> "Create Lead"
 */
function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

/**
 * Gets the icon for a tool call status — same icon/color scheme as builder AI widget
 */
function getStatusIcon(status: MochiToolCallStatus) {
  switch (status) {
    case 'complete':
      return <Check className="h-4 w-4 text-emerald-500" />
    case 'executing':
      return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-400" />
    case 'cancelled':
      return <AlertCircle className="h-4 w-4 text-amber-400" />
    case 'pending':
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

interface TaskItemProps {
  /** The tool call to display */
  toolCall: MochiToolCall
  /** Optional className */
  className?: string
}

/**
 * TaskItem — Displays a single tool call with collapsible result details.
 * Uses the builder AI widget's visual pattern: rounded-lg border cards with
 * status-based border/bg colors.
 */
export function TaskItem({ toolCall, className }: TaskItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasResult = !!toolCall.result
  const resultMessage = toolCall.result?.message as string | undefined

  return (
    <div
      className={cn(
        'rounded-lg border border-border/50 bg-muted/50 overflow-hidden',
        'transition-colors duration-150',
        toolCall.status === 'executing' && 'border-blue-500/40 bg-blue-500/10',
        toolCall.status === 'cancelled' && 'border-amber-500/40 bg-amber-500/10',
        toolCall.status === 'error' && 'border-red-500/40 bg-red-500/10',
        className
      )}
    >
      {/* Task Header */}
      <button
        onClick={() => hasResult && setIsExpanded(!isExpanded)}
        disabled={!hasResult}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5',
          'text-left transition-colors duration-150',
          hasResult && 'hover:bg-muted/50 cursor-pointer',
          !hasResult && 'cursor-default'
        )}
      >
        {/* Status Icon */}
        <div className="shrink-0">
          {getStatusIcon(toolCall.status)}
        </div>

        {/* Tool Name */}
        <span
          className={cn(
            'flex-1 text-sm font-medium',
            toolCall.status === 'complete' && 'text-foreground',
            toolCall.status === 'executing' && 'text-foreground',
            toolCall.status === 'cancelled' && 'text-amber-500 dark:text-amber-300',
            toolCall.status === 'pending' && 'text-muted-foreground',
            toolCall.status === 'error' && 'text-red-500 dark:text-red-300'
          )}
        >
          {humanizeToolName(toolCall.toolName)}
        </span>

        {/* Expand/Collapse Icon */}
        {hasResult && (
          <div className="shrink-0 text-muted-foreground">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        )}
      </button>

      {/* Expandable Result Details */}
      {hasResult && isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/50">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {resultMessage || JSON.stringify(toolCall.result, null, 2)}
          </p>
        </div>
      )}
    </div>
  )
}

export default TaskItem
