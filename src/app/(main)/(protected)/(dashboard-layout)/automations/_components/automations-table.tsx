/**
 * Automations Table Component
 *
 * WHY: Displays automations in a paginated, sortable table with bulk actions
 * HOW: Uses @tanstack/react-table for sorting, selection, column visibility
 *
 * FEATURES:
 * - Paginated table with rows per page selector
 * - Search filtering
 * - Bulk selection and delete
 * - Column sorting
 * - Row click for editing
 *
 * SOURCE OF TRUTH: AutomationsTable, AutomationListItem
 */

'use client'

import * as React from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowUpDown,
  MoreHorizontal,
  Trash2,
  Search,
  Edit,
  Play,
  Pause,
  Archive,
  Copy,
  FolderInput,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getStatusDisplay, formatRelativeTime } from '@/components/automation-builder/_lib/utils'
import { getNodeEntry } from '@/components/automation-builder/_lib/node-registry'
import type { AutomationStatus } from '@/components/automation-builder/_lib/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Automation type from tRPC response.
 * Matches the select fields in the list query.
 * Note: Dates come as strings from tRPC (JSON serialization).
 * SOURCE OF TRUTH: AutomationListItem
 */
export type AutomationListItem = {
  id: string
  name: string
  slug: string | null
  description: string | null
  status: string
  triggerType: string
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastRunAt: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
  folderId?: string | null
  folder?: {
    id: string
    name: string
    color: string | null
  } | null
}

interface AutomationsTableProps {
  automations: AutomationListItem[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onAutomationClick: (automation: AutomationListItem) => void
  onBulkDelete?: (ids: string[]) => void
  onDelete?: (id: string) => void
  onToggleStatus?: (automation: AutomationListItem) => void
  onArchive?: (automation: AutomationListItem) => void
  onDuplicate?: (automation: AutomationListItem) => void
  onMove?: (automation: AutomationListItem) => void
  isBulkDeleting: boolean
  canDelete: boolean
  canUpdate: boolean
  canExecute: boolean
}

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

/**
 * Status badge component with appropriate colors.
 * Converts Prisma UPPER_CASE status to UI lowercase.
 */
function StatusBadge({ status }: { status: string }) {
  const uiStatus = status.toLowerCase() as AutomationStatus
  const display = getStatusDisplay(uiStatus)

  return (
    <Badge variant="secondary" className={cn('font-medium', display.bgClass, display.colorClass)}>
      {display.label}
    </Badge>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get trigger display name from automation's triggerType.
 * Handles Prisma UPPER_SNAKE_CASE format.
 */
function getTriggerDisplay(triggerType: string): string {
  const uiType = triggerType.toLowerCase()
  const entry = getNodeEntry(uiType as Parameters<typeof getNodeEntry>[0])
  return entry?.label ?? 'Unknown trigger'
}

// ============================================================================
// TABLE COMPONENT
// ============================================================================

export function AutomationsTable({
  automations,
  isLoading,
  isFetching,
  search,
  onSearchChange,
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  selectedIds,
  onSelectionChange,
  onAutomationClick,
  onBulkDelete,
  onDelete,
  onToggleStatus,
  onArchive,
  onDuplicate,
  onMove,
  isBulkDeleting,
  canDelete,
  canUpdate,
  canExecute,
}: AutomationsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

  /**
   * Define table columns.
   * Includes selection, name, status, trigger, runs, last run, and actions.
   */
  const columns: ColumnDef<AutomationListItem>[] = React.useMemo(
    () => [
      // Selection column
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => {
              table.toggleAllPageRowsSelected(!!value)
              if (value) {
                onSelectionChange(automations.map((a) => a.id))
              } else {
                onSelectionChange([])
              }
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => {
              row.toggleSelected(!!value)
              if (value) {
                onSelectionChange([...selectedIds, row.original.id])
              } else {
                onSelectionChange(selectedIds.filter((id) => id !== row.original.id))
              }
            }}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      // Name column
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.getValue('name')}</span>
            <span className="text-xs text-muted-foreground">
              /{row.original.slug}
            </span>
          </div>
        ),
      },
      // Status column
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.getValue('status')} />,
      },
      // Trigger column
      {
        accessorKey: 'triggerType',
        header: 'Trigger',
        cell: ({ row }) => (
          <span className="text-sm">{getTriggerDisplay(row.getValue('triggerType'))}</span>
        ),
      },
      // Runs column
      {
        accessorKey: 'totalRuns',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Runs
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.totalRuns.toLocaleString()}</span>
        ),
      },
      // Last Run column
      {
        accessorKey: 'lastRunAt',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Last Run
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatRelativeTime(row.original.lastRunAt)}
          </span>
        ),
        // Custom sorting for date strings/objects - handles null values and type inconsistencies
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.lastRunAt
          const b = rowB.original.lastRunAt
          // Null values sort to the end
          if (!a && !b) return 0
          if (!a) return 1
          if (!b) return -1
          // Convert to timestamps for comparison
          const timeA = new Date(a).getTime()
          const timeB = new Date(b).getTime()
          // Handle invalid dates
          if (isNaN(timeA) && isNaN(timeB)) return 0
          if (isNaN(timeA)) return 1
          if (isNaN(timeB)) return -1
          return timeA - timeB
        },
      },
      // Actions column
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const automation = row.original

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                {canUpdate && (
                  <DropdownMenuItem onClick={() => onAutomationClick(automation)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canExecute && automation.status !== 'ARCHIVED' && onToggleStatus && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleStatus(automation)
                    }}
                  >
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
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onArchive(automation)
                    }}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                )}
                {onDuplicate && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onDuplicate(automation)
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                )}
                {canUpdate && onMove && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onMove(automation)
                    }}
                  >
                    <FolderInput className="mr-2 h-4 w-4" />
                    Move to...
                  </DropdownMenuItem>
                )}
                {canDelete && onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(automation.id)
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [
      automations,
      selectedIds,
      onSelectionChange,
      onAutomationClick,
      onDelete,
      onToggleStatus,
      onArchive,
      onDuplicate,
      onMove,
      canDelete,
      canUpdate,
      canExecute,
    ]
  )

  /**
   * Initialize react-table with manual pagination.
   */
  const table = useReactTable({
    data: automations,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection: selectedIds.reduce(
        (acc, id) => {
          const index = automations.findIndex((a) => a.id === id)
          if (index !== -1) acc[index] = true
          return acc
        },
        {} as Record<string, boolean>
      ),
    },
    manualPagination: true,
    pageCount: totalPages,
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search automations..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Bulk actions */}
        {selectedIds.length > 0 && canDelete && onBulkDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onBulkDelete(selectedIds)}
            disabled={isBulkDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: pageSize }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn('cursor-pointer transition-colors', isFetching && 'opacity-50')}
                  onClick={() => onAutomationClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No automations found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {selectedIds.length} of {total} row(s) selected
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Rows per page */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50].map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page info */}
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages || 1}
          </span>

          {/* Navigation buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
