/**
 * ============================================================================
 * RUN HISTORY PANEL
 * ============================================================================
 *
 * Main panel that fetches and displays automation run history.
 * Handles data fetching, filtering, and renders the list of RunItems.
 *
 * FEATURES:
 * - Fetches runs via tRPC with auto-refresh (10s interval)
 * - Filter by status (all, completed, failed, running, pending)
 * - Loading, error, and empty states
 *
 * SOURCE OF TRUTH: AutomationRun, AutomationRunStep
 */

'use client'

import { useState, useMemo } from 'react'
import {
  PlayIcon,
  AlertCircleIcon,
  FilterIcon,
  Loader2Icon,
  RefreshCwIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { RunItem } from './run-item'
import {
  transformRunForDisplay,
  type ApiRunForDisplayInput,
  type RunHistoryPanelProps,
  type StatusFilter,
  type DisplayRun,
} from './run-history-helpers'

// ============================================================================
// COMPONENT
// ============================================================================

export function RunHistoryPanel({ automationId, organizationId }: RunHistoryPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())

  /**
   * Fetch runs from database via tRPC.
   */
  const {
    data: runsData,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = trpc.automation.listRuns.useQuery(
    {
      organizationId,
      automationId,
      pageSize: 50, // Show last 50 runs
      ...(statusFilter !== 'all' && { status: statusFilter as 'PENDING' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' }),
    },
    {
      // Refetch every 10 seconds to show new runs
      refetchInterval: 10000,
    }
  )

  /**
   * Transform API data to display format.
   */
  const allRuns = useMemo<DisplayRun[]>(() => {
    const raw = runsData?.runs
    if (!raw || !Array.isArray(raw)) return []
    const runs = raw as unknown as ApiRunForDisplayInput[]
    return runs.map(transformRunForDisplay)
  }, [runsData])

  /**
   * Toggle run expansion.
   */
  const toggleRunExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev)
      if (next.has(runId)) {
        next.delete(runId)
      } else {
        next.add(runId)
      }
      return next
    })
  }

  /**
   * Handle refresh click.
   */
  const handleRefresh = () => {
    refetch()
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-accent dark:bg-muted/50">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground mb-3" />
        <p className="text-xs text-muted-foreground">Loading run history...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-accent dark:bg-muted/50">
        <AlertCircleIcon className="h-6 w-6 text-destructive mb-3" />
        <p className="text-sm text-destructive mb-1">Failed to load run history</p>
        <p className="text-xs text-muted-foreground mb-3">{error.message}</p>
        <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-7 text-xs">
          <RefreshCwIcon className="h-3 w-3 mr-1.5" />
          Retry
        </Button>
      </div>
    )
  }

  // Empty state when no runs exist
  if (allRuns.length === 0 && statusFilter === 'all') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-accent dark:bg-muted/50">
        <div className="rounded-2xl bg-white dark:bg-muted p-4 mb-4">
          <PlayIcon className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium mb-1">No runs yet</h3>
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          This automation hasn&apos;t been triggered yet. Once it runs, you&apos;ll see the
          execution history here.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-accent dark:bg-muted/50">
      {/* Floating header bar — filter controls */}
      <div className="flex items-center justify-between px-6 pt-16 pb-3">
        <div>
          <h2 className="text-sm font-medium">Run History</h2>
          <p className="text-[11px] text-muted-foreground">
            {runsData?.total ?? allRuns.length} total run{(runsData?.total ?? allRuns.length) !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefetching}
            className="h-7 w-7"
          >
            <RefreshCwIcon className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
          </Button>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[120px] h-7 text-xs rounded-xl border-0 bg-white dark:bg-muted">
              <FilterIcon className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All Runs</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="RUNNING">Running</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Runs list — card-style items with gaps instead of dividers */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {allRuns.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No runs match the selected filter
          </div>
        ) : (
          <div className="space-y-2">
            {allRuns.map((run) => (
              <RunItem
                key={run.id}
                run={run}
                isExpanded={expandedRuns.has(run.id)}
                onToggle={() => toggleRunExpanded(run.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
