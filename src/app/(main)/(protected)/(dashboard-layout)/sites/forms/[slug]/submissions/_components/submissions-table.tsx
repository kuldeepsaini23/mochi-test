/**
 * Submissions Table Component
 *
 * WHY: Displays form submissions in a paginated, sortable table with bulk actions
 * HOW: Uses @tanstack/react-table for sorting, selection, and column visibility
 *
 * SOURCE OF TRUTH: FormSubmissionWithDetails from form-submission.service.ts
 */

'use client'

import * as React from 'react'
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowUpDown,
  MoreHorizontal,
  Trash2,
  Search,
  Eye,
  Calendar as CalendarIcon,
  X,
} from 'lucide-react'
import { format } from 'date-fns'

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { FormSubmissionWithDetails } from '@/services/form-submission.service'

// ============================================================================
// TYPES
// ============================================================================

/** Serialized FormSubmissionWithDetails — dates come as strings from tRPC */
export type SubmissionRowData = Omit<FormSubmissionWithDetails, 'createdAt'> & {
  createdAt: string | Date
}

interface SubmissionsTableProps {
  submissions: SubmissionRowData[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  dateFrom: Date | undefined
  dateTo: Date | undefined
  onDateFromChange: (date: Date | undefined) => void
  onDateToChange: (date: Date | undefined) => void
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onSubmissionClick: (submission: SubmissionRowData) => void
  onBulkDelete?: (ids: string[]) => void
  onDelete?: (id: string) => void
  isBulkDeleting: boolean
  canDelete: boolean
}

/** Extracts first few string values from submission data for a table preview */
function getSubmissionPreview(data: unknown): string {
  if (!data || typeof data !== 'object') return '-'
  const entries = Object.entries(data as Record<string, unknown>)
  const previews: string[] = []
  for (const [, value] of entries) {
    if (typeof value === 'string' && value.trim().length > 0) {
      previews.push(value.trim())
    }
    if (previews.length >= 2) break
  }
  return previews.length > 0 ? previews.join(', ') : '-'
}

/** Reusable date picker button for the date range filter */
function DatePickerButton({
  date,
  onDateChange,
  placeholder,
}: {
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  placeholder: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 w-[130px] justify-start text-left font-normal',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {date ? format(date, 'MMM d, yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onDateChange} initialFocus />
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// TABLE COMPONENT
// ============================================================================

export function SubmissionsTable({
  submissions,
  isLoading,
  isFetching,
  search,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  selectedIds,
  onSelectionChange,
  onSubmissionClick,
  onBulkDelete,
  onDelete,
  isBulkDeleting,
  canDelete,
}: SubmissionsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const hasDateFilter = dateFrom !== undefined || dateTo !== undefined

  const columns: ColumnDef<SubmissionRowData>[] = React.useMemo(
    () => [
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
              onSelectionChange(value ? submissions.map((s) => s.id) : [])
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => {
              row.toggleSelected(!!value)
              onSelectionChange(
                value
                  ? [...selectedIds, row.original.id]
                  : selectedIds.filter((id) => id !== row.original.id)
              )
            }}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => {
          const lead = row.original.lead
          if (!lead) return <span className="text-muted-foreground text-sm">No lead linked</span>
          const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ')
          return (
            <div className="flex flex-col">
              {name && <span className="font-medium text-sm">{name}</span>}
              <span className="text-xs text-muted-foreground">{lead.email}</span>
            </div>
          )
        },
      },
      {
        id: 'preview',
        header: 'Response Preview',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
            {getSubmissionPreview(row.original.data)}
          </span>
        ),
      },
      {
        id: 'formName',
        header: 'Form',
        cell: ({ row }) => <span className="text-sm">{row.original.form.name}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Submitted
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {format(new Date(row.getValue('createdAt')), 'MMM d, yyyy h:mm a')}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const submission = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onSubmissionClick(submission)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                {canDelete && onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete(submission.id) }}
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
    [submissions, selectedIds, onSelectionChange, onSubmissionClick, onDelete, canDelete]
  )

  const table = useReactTable({
    data: submissions,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnVisibility,
      rowSelection: selectedIds.reduce(
        (acc, id) => {
          const index = submissions.findIndex((s) => s.id === id)
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerButton date={dateFrom} onDateChange={onDateFromChange} placeholder="From date" />
          <DatePickerButton date={dateTo} onDateChange={onDateToChange} placeholder="To date" />
          {hasDateFilter && (
            <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => { onDateFromChange(undefined); onDateToChange(undefined) }}>
              <X className="h-4 w-4" />
            </Button>
          )}
          {selectedIds.length > 0 && canDelete && onBulkDelete && (
            <Button variant="destructive" size="sm" onClick={() => onBulkDelete(selectedIds)} disabled={isBulkDeleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete ({selectedIds.length})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-36" /></div></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn('cursor-pointer transition-colors', isFetching && 'opacity-50')}
                  onClick={() => onSubmissionClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">No submissions found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{selectedIds.length} of {total} row(s) selected</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select value={pageSize.toString()} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50].map((size) => (<SelectItem key={size} value={size.toString()}>{size}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages || 1}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
