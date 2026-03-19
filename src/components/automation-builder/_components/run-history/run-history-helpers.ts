/**
 * ============================================================================
 * RUN HISTORY HELPERS
 * ============================================================================
 *
 * Shared types, transforms, and formatting utilities for the run history UI.
 * Used by run-history-panel, run-item, and step-item components.
 *
 * SOURCE OF TRUTH: AutomationRun, AutomationRunStep
 */

import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PlayIcon,
  ChevronRightIcon,
} from 'lucide-react'
import type { AutomationRunStatus, AutomationRunStep } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

export interface RunHistoryPanelProps {
  automationId: string
  organizationId: string
}

export type StatusFilter = 'all' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

/**
 * Transformed run type for display in the UI.
 * Matches the expected structure from the types.ts AutomationRun interface.
 */
export interface DisplayRun {
  id: string
  automationId: string
  status: AutomationRunStatus
  startedAt: Date
  completedAt?: Date
  triggerData: Record<string, unknown>
  steps: AutomationRunStep[]
  error?: string
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

/**
 * Map Prisma status (UPPER_CASE) to UI status (lower_case).
 */
export function prismaStatusToUi(status: string): AutomationRunStatus {
  const statusMap: Record<string, AutomationRunStatus> = {
    PENDING: 'pending',
    RUNNING: 'running',
    WAITING: 'running', // Treat WAITING as running for UI purposes
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  }
  return statusMap[status] || 'pending'
}

/**
 * Get the appropriate Lucide icon for a run/step status.
 */
export function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return CheckCircleIcon
    case 'failed':
      return XCircleIcon
    case 'running':
      return PlayIcon
    case 'pending':
      return ClockIcon
    case 'skipped':
      return ChevronRightIcon
    default:
      return ClockIcon
  }
}

// ============================================================================
// DATA TRANSFORMS
// ============================================================================

/**
 * API run shape as returned by tRPC (e.g. automation.listRuns).
 * Used as the input type for transformRunForDisplay and for casting to avoid
 * "Type instantiation is excessively deep" when mapping over tRPC results.
 */
export type ApiRunForDisplayInput = {
  id: string
  automationId: string | null
  status: string
  triggerData: unknown
  steps: unknown
  error: string | null
  startedAt: string | Date | null
  completedAt: string | Date | null
}

/**
 * Transform API run data to display format.
 * Note: Dates from tRPC come as strings (JSON serialization).
 */
export function transformRunForDisplay(apiRun: ApiRunForDisplayInput): DisplayRun {
  // Parse steps from JSON
  const stepsArray = Array.isArray(apiRun.steps) ? apiRun.steps : []
  const transformedSteps: AutomationRunStep[] = stepsArray.map((step: Record<string, unknown>) => {
    // Preserve all branch IDs — if_else uses 'true'/'false', branch nodes use branchId or 'default'
    const rawBranch = step.branchTaken
    const branchTaken: string | undefined = rawBranch ? String(rawBranch) : undefined
    return {
      nodeId: String(step.nodeId || ''),
      nodeName: String(step.nodeName || step.nodeId || 'Unknown'),
      nodeType: (step.nodeType as 'trigger' | 'action' | 'condition') || 'action',
      actionType: step.actionType ? String(step.actionType) : undefined,
      status: (step.status as AutomationRunStep['status']) || 'pending',
      startedAt: step.startedAt ? new Date(String(step.startedAt)) : undefined,
      completedAt: step.completedAt ? new Date(String(step.completedAt)) : undefined,
      durationMs: typeof step.durationMs === 'number' ? step.durationMs : undefined,
      output: step.result as Record<string, unknown> | undefined,
      error: step.error ? String(step.error) : undefined,
      skipReason: step.skipReason ? String(step.skipReason) : undefined,
      branchTaken,
    }
  })

  // Derive the display status from DB status + step results.
  // If DB says COMPLETED but all non-trigger steps were skipped, show "skipped" instead
  // so the user isn't misled into thinking work was actually done.
  let displayStatus = prismaStatusToUi(apiRun.status)
  if (displayStatus === 'completed') {
    const actionableSteps = transformedSteps.filter((s) => s.nodeType !== 'trigger')
    const allSkipped = actionableSteps.length > 0 && actionableSteps.every((s) => s.status === 'skipped')
    if (allSkipped) {
      displayStatus = 'skipped'
    }
  }

  return {
    id: apiRun.id,
    automationId: apiRun.automationId || '',
    status: displayStatus,
    startedAt: apiRun.startedAt ? new Date(apiRun.startedAt) : new Date(),
    completedAt: apiRun.completedAt ? new Date(apiRun.completedAt) : undefined,
    triggerData: (apiRun.triggerData != null && typeof apiRun.triggerData === 'object' && !Array.isArray(apiRun.triggerData))
      ? (apiRun.triggerData as Record<string, unknown>)
      : {},
    steps: transformedSteps,
    error: apiRun.error || undefined,
  }
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format duration between two dates (handles string dates from API).
 */
export function formatDuration(start: Date | string, end: Date | string): string {
  const startTime = typeof start === 'string' ? new Date(start).getTime() : start.getTime()
  const endTime = typeof end === 'string' ? new Date(end).getTime() : end.getTime()
  const ms = endTime - startTime

  return formatDurationMs(ms)
}

/**
 * Format duration from milliseconds.
 */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

/**
 * Format step result for display.
 * Shows a brief summary of what happened.
 */
export function formatStepResult(output: Record<string, unknown>): string | null {
  if (!output) return null

  // Handle common result patterns
  if (output.success === true) {
    if (output.messageId) return `Email sent (${output.messageId})`
    if (output.ticketId) return `Ticket created`
    if (output.tagId) return `Tag added`
    return 'Completed successfully'
  }

  if (output.skipped === true) {
    return `Skipped: ${output.reason || 'No action needed'}`
  }

  if (output.moved === true) {
    return 'Ticket moved'
  }

  if (output.updated) {
    const fields = output.updated as string[]
    return `Updated: ${fields.join(', ')}`
  }

  if (output.condition !== undefined) {
    return `Condition: ${output.condition ? 'true' : 'false'}`
  }

  // Branch condition results — output.result contains { branchMatched, branchLabel, rules, unconfigured? }
  const innerResult = output.result as Record<string, unknown> | undefined
  if (innerResult?.branchMatched) {
    // Don't show branch result text when unconfigured (skip reason is shown separately)
    if (innerResult.unconfigured) return null
    const label = (innerResult.branchLabel as string) || String(innerResult.branchMatched)
    return `Branch: ${label}`
  }

  // Also handle condition results nested in output.result (if_else stores { condition, rules } there)
  if (innerResult?.condition !== undefined) {
    return `Condition: ${innerResult.condition ? 'true' : 'false'}`
  }

  return null
}
