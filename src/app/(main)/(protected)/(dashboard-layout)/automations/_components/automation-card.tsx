/**
 * Automation Card Component - Grid View Card for Automations
 *
 * WHY: Provides a visual card layout for the grid view mode on the automations list page.
 * HOW: Displays automation name, status, trigger type, run stats, and actions in a compact card.
 *
 * Matches the same data and actions available in AutomationsTable rows,
 * just in a card-based layout for the grid view toggle.
 *
 * SOURCE OF TRUTH: AutomationListItem, AutomationCard
 */

'use client'

import {
  MoreHorizontal,
  Trash2,
  Edit,
  Play,
  Pause,
  Archive,
  Copy,
  FolderInput,
  ZapIcon,
  BarChart3Icon,
  CheckCircleIcon,
  XCircleIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { getStatusDisplay, formatRelativeTime } from '@/components/automation-builder/_lib/utils'
import { getNodeEntry } from '@/components/automation-builder/_lib/node-registry'
import type { AutomationListItem } from './automations-table'

// ============================================================================
// TYPES
// ============================================================================

interface AutomationCardProps {
  automation: AutomationListItem
  onClick: () => void
  onDelete?: () => void
  onToggleStatus?: () => void
  onArchive?: () => void
  onDuplicate?: () => void
  onMove?: () => void
  canDelete: boolean
  canUpdate: boolean
  canExecute: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get trigger display name from automation's triggerType.
 * Converts Prisma UPPER_SNAKE_CASE to lowercase for node registry lookup.
 */
function getTriggerDisplay(triggerType: string): { label: string; Icon: React.ComponentType<{ className?: string }> | null } {
  const uiType = triggerType.toLowerCase()
  const entry = getNodeEntry(uiType as Parameters<typeof getNodeEntry>[0])
  return {
    label: entry?.label ?? 'Unknown trigger',
    Icon: entry?.icon ?? null,
  }
}

// ============================================================================
// STATUS BADGE (reused from automations-table pattern)
// ============================================================================

/**
 * Status badge with color coding.
 * Converts Prisma UPPER_CASE status to UI lowercase for display lookup.
 */
function StatusBadge({ status }: { status: string }) {
  const uiStatus = status.toLowerCase()
  const display = getStatusDisplay(uiStatus)

  return (
    <Badge variant="secondary" className={cn('font-medium text-xs', display.bgClass, display.colorClass)}>
      {display.label}
    </Badge>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AutomationCard({
  automation,
  onClick,
  onDelete,
  onToggleStatus,
  onArchive,
  onDuplicate,
  onMove,
  canDelete,
  canUpdate,
  canExecute,
}: AutomationCardProps) {
  const trigger = getTriggerDisplay(automation.triggerType)
  const TriggerIcon = trigger.Icon

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-lg border bg-card cursor-pointer',
        'transition-all duration-200 hover:shadow-md hover:border-foreground/20'
      )}
      onClick={onClick}
    >
      {/* Actions dropdown - top right corner */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'absolute top-2 right-2 h-7 w-7 z-10',
              'opacity-0 group-hover:opacity-100 transition-opacity'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {canUpdate && (
            <DropdownMenuItem onClick={onClick}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          {canExecute && automation.status !== 'ARCHIVED' && onToggleStatus && (
            <DropdownMenuItem onClick={onToggleStatus}>
              {automation.status === 'ACTIVE' ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
          )}
          {canUpdate && automation.status !== 'ARCHIVED' && onArchive && (
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
          )}
          {canUpdate && onMove && (
            <DropdownMenuItem onClick={onMove}>
              <FolderInput className="mr-2 h-4 w-4" />
              Move to...
            </DropdownMenuItem>
          )}
          {canDelete && onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Header: Name + Status */}
        <div className="space-y-1 pr-8">
          <h3 className="font-medium text-sm truncate" title={automation.name}>
            {automation.name}
          </h3>
          {automation.slug && (
            <p className="text-xs text-muted-foreground truncate">/{automation.slug}</p>
          )}
        </div>

        {/* Status badge */}
        <StatusBadge status={automation.status} />

        {/* Trigger type */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {TriggerIcon ? (
            <TriggerIcon className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ZapIcon className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{trigger.label}</span>
        </div>
      </div>

      {/* Footer: Run stats */}
      <div className="mt-auto border-t px-4 py-3 space-y-2">
        {/* Run counts */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground" title="Total runs">
            <BarChart3Icon className="h-3 w-3" />
            <span className="tabular-nums">{automation.totalRuns}</span>
          </div>
          <div className="flex items-center gap-1 text-green-600" title="Successful runs">
            <CheckCircleIcon className="h-3 w-3" />
            <span className="tabular-nums">{automation.successfulRuns}</span>
          </div>
          <div className="flex items-center gap-1 text-red-600" title="Failed runs">
            <XCircleIcon className="h-3 w-3" />
            <span className="tabular-nums">{automation.failedRuns}</span>
          </div>
        </div>

        {/* Last run */}
        <p className="text-xs text-muted-foreground">
          {automation.lastRunAt
            ? `Last run ${formatRelativeTime(automation.lastRunAt)}`
            : 'Never run'}
        </p>
      </div>
    </div>
  )
}
