/**
 * ============================================================================
 * STEP ITEM
 * ============================================================================
 *
 * Renders a single execution step within a run.
 * Shows the step name, status icon, duration, branch info, and error/result.
 * For condition nodes: shows branch label and per-rule evaluation breakdown.
 *
 * SOURCE OF TRUTH: AutomationRunStep
 */

'use client'

import { cn } from '@/lib/utils'
import { getRunStatusDisplay } from '../../_lib/utils'
import type { AutomationRunStep } from '../../_lib/types'
import {
  getStatusIcon,
  formatDuration,
  formatDurationMs,
  formatStepResult,
} from './run-history-helpers'

// ============================================================================
// TYPES
// ============================================================================

interface StepItemProps {
  step: AutomationRunStep
  index: number
}

/**
 * Rule evaluation result from condition execution.
 * Each rule in a condition node produces one of these during execution.
 * SOURCE OF TRUTH KEYWORDS: ConditionRuleResult, RuleEvaluation
 */
interface RuleEvalResult {
  field: string
  fieldValue: unknown
  operator: string
  value: unknown
  result: boolean
  /** Per-rule logical operator (only present on branch conditions) */
  logicalOp?: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get a display label for the branch taken on a condition step.
 *
 * Priority:
 * 1. Branch node with branchLabel in output.result → use it (e.g., "Branch 1")
 * 2. if_else 'true'/'false' → "True"/"False"
 * 3. 'default' → "Default"
 * 4. Raw branch ID as last resort (truncated)
 */
function getBranchDisplayLabel(step: AutomationRunStep): string {
  const branchTaken = step.branchTaken
  if (!branchTaken) return ''

  // Check if the output.result has a branchLabel (branch nodes store this)
  const innerResult = (step.output?.result ?? step.output) as Record<string, unknown> | undefined
  if (innerResult?.branchLabel) {
    return String(innerResult.branchLabel)
  }

  // Standard if_else labels
  if (branchTaken === 'true') return 'True'
  if (branchTaken === 'false') return 'False'
  if (branchTaken === 'default') return 'Default'

  // Raw branch ID — truncate long IDs (e.g., "branch-17029...")
  if (branchTaken.length > 16) {
    return `${branchTaken.slice(0, 12)}...`
  }
  return branchTaken
}

/**
 * Get color class for the branch indicator.
 * Green for true/matched branches, amber for false/default.
 */
function getBranchColor(step: AutomationRunStep): string {
  const branchTaken = step.branchTaken
  if (!branchTaken) return 'text-muted-foreground'

  // if_else: true = green, false = amber
  if (branchTaken === 'true') return 'text-green-600'
  if (branchTaken === 'false') return 'text-amber-600'

  // branch nodes: default = amber, matched branch = green
  if (branchTaken === 'default') return 'text-amber-600'
  return 'text-green-600'
}

/**
 * Extract the rules array from the step output if it exists.
 * Rules are nested inside output.result.rules for condition nodes.
 */
function getRulesFromOutput(output: Record<string, unknown> | undefined): RuleEvalResult[] | null {
  if (!output) return null

  // output shape: { branchTaken, result: { condition?, branchMatched?, rules: [...] } }
  const innerResult = output.result as Record<string, unknown> | undefined
  if (innerResult?.rules && Array.isArray(innerResult.rules)) {
    return innerResult.rules as RuleEvalResult[]
  }

  return null
}

/**
 * Format an operator string for display (e.g., "not_equals" → "not equals").
 */
function formatOperator(operator: string): string {
  return operator.replace(/_/g, ' ')
}

/**
 * Format a value for display in the rule breakdown.
 * Truncates long strings and handles nullish values.
 */
function formatRuleValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)'
  const str = String(value)
  if (str.length > 24) return `${str.slice(0, 20)}...`
  return str
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepItem({ step, index }: StepItemProps) {
  const statusDisplay = getRunStatusDisplay(step.status)
  const StatusIcon = getStatusIcon(step.status)

  /**
   * Format duration from milliseconds or date range.
   */
  const getDurationDisplay = (): string | null => {
    // Prefer durationMs if available (more accurate)
    if (step.durationMs !== undefined) {
      return formatDurationMs(step.durationMs)
    }
    // Fall back to calculating from dates
    if (step.startedAt && step.completedAt) {
      return formatDuration(step.startedAt, step.completedAt)
    }
    return null
  }

  const duration = getDurationDisplay()
  const rules = getRulesFromOutput(step.output)

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {/* Step number and status */}
      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        <span className="text-[10px] text-muted-foreground/60 w-3 text-right">{index + 1}</span>
        <StatusIcon className={cn('h-3.5 w-3.5', statusDisplay.colorClass)} />
      </div>

      {/* Step info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium">{step.nodeName}</span>
          {/* Action type pill */}
          {step.actionType && (
            <span className="text-[10px] px-1.5 py-0.5 bg-accent dark:bg-background/30 rounded-lg text-muted-foreground">
              {step.actionType.replace(/_/g, ' ')}
            </span>
          )}
          {/* Duration */}
          {duration && (
            <span className="text-[10px] text-muted-foreground/70">
              {duration}
            </span>
          )}
        </div>

        {/* Branch taken for condition nodes — supports both if_else and branch nodes */}
        {step.branchTaken && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-muted-foreground/70">Branch:</span>
            <span className={cn('text-[10px] font-medium', getBranchColor(step))}>
              {getBranchDisplayLabel(step)}
            </span>
          </div>
        )}

        {/* Rule-by-rule evaluation breakdown for condition nodes */}
        {rules && rules.length > 0 && (
          <div className="mt-1 space-y-0.5 pl-1 border-l border-border/40">
            {rules.map((rule, ruleIdx) => (
              <div key={ruleIdx} className="flex items-center gap-1 text-[10px]">
                {/* Pass/fail indicator */}
                <span className={rule.result ? 'text-green-600' : 'text-red-500'}>
                  {rule.result ? '\u2713' : '\u2717'}
                </span>
                {/* Field name */}
                <span className="text-muted-foreground font-mono truncate max-w-[120px]" title={rule.field}>
                  {rule.field}
                </span>
                {/* Operator */}
                <span className="text-muted-foreground/60">
                  {formatOperator(rule.operator)}
                </span>
                {/* Expected value */}
                <span className="text-foreground/80 font-mono truncate max-w-[80px]" title={String(rule.value ?? '')}>
                  {formatRuleValue(rule.value)}
                </span>
                {/* Actual value — show what the field actually was */}
                {rule.fieldValue !== undefined && (
                  <span className="text-muted-foreground/50 truncate max-w-[80px]" title={String(rule.fieldValue ?? '')}>
                    was {formatRuleValue(rule.fieldValue)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Result summary for completed steps — skip for condition nodes since branch info is shown above */}
        {step.status === 'completed' && step.output && !step.branchTaken && (
          <div className="text-[10px] text-muted-foreground/70 mt-0.5">
            {formatStepResult(step.output)}
          </div>
        )}

        {/* Skip reason — amber to distinguish from red errors */}
        {step.status === 'skipped' && step.skipReason && (
          <p className="text-[10px] text-amber-600 mt-0.5">
            Skipped: {step.skipReason}
          </p>
        )}

        {/* Error message */}
        {step.error && (
          <p className="text-[10px] text-destructive mt-0.5">{step.error}</p>
        )}
      </div>
    </div>
  )
}
