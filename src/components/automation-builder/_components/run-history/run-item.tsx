/**
 * ============================================================================
 * RUN ITEM
 * ============================================================================
 *
 * Renders a single automation run as an expandable row.
 * Shows status, timing, step count, and expands to reveal step details,
 * error messages, and trigger data.
 *
 * SOURCE OF TRUTH: DisplayRun, AutomationRunStep
 */

'use client'

import {
  ChevronDownIcon,
  ChevronRightIcon,
  AlertCircleIcon,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { getRunStatusDisplay, formatRelativeTime } from '../../_lib/utils'
import { StepItem } from './step-item'
import { getStatusIcon, formatDuration } from './run-history-helpers'
import type { DisplayRun } from './run-history-helpers'

// ============================================================================
// TYPES
// ============================================================================

interface RunItemProps {
  run: DisplayRun
  isExpanded: boolean
  onToggle: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RunItem({ run, isExpanded, onToggle }: RunItemProps) {
  const statusDisplay = getRunStatusDisplay(run.status)
  const StatusIcon = getStatusIcon(run.status)

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className={cn(
        'bg-white dark:bg-muted rounded-2xl transition-all duration-200',
        isExpanded && 'ring-1 ring-muted-foreground/10'
      )}>
        {/* Run header — clickable row */}
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 py-3 text-left transition-colors rounded-2xl">
            <div className="flex items-center gap-3">
              {/* Expand/collapse chevron */}
              <div className="shrink-0">
                {isExpanded ? (
                  <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>

              {/* Status icon */}
              <div className={cn('shrink-0', statusDisplay.colorClass)}>
                <StatusIcon className="h-4 w-4" />
              </div>

              {/* Run info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {formatRelativeTime(run.startedAt)}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      statusDisplay.bgClass,
                      statusDisplay.colorClass
                    )}
                  >
                    {statusDisplay.label}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {run.steps.length} step{run.steps.length !== 1 ? 's' : ''}
                  {run.completedAt && (
                    <span className="ml-1.5">
                      · {formatDuration(run.startedAt, run.completedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        {/* Expanded content — steps and details */}
        <CollapsibleContent>
          <div className="px-4 pb-3 ml-10">
            {/* Error message if failed */}
            {run.error && (
              <div className="mb-2.5 px-3 py-2 bg-destructive/5 rounded-xl text-xs text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{run.error}</span>
                </div>
              </div>
            )}

            {/* Steps */}
            {run.steps.length > 0 ? (
              <div className="space-y-1">
                {run.steps.map((step, index) => (
                  <StepItem key={step.nodeId} step={step} index={index} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground py-1">No step details available</p>
            )}

            {/* Trigger data preview */}
            {run.triggerData && Object.keys(run.triggerData).length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-muted-foreground/5">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Trigger Data</p>
                <pre className="text-[11px] bg-accent dark:bg-background/30 px-3 py-2 rounded-xl overflow-auto max-h-24 text-muted-foreground">
                  {JSON.stringify(run.triggerData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
