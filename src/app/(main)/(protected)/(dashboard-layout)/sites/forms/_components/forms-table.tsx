/**
 * Forms Table Component
 *
 * WHY: Displays forms in a paginated, sortable table with bulk actions
 * HOW: Uses @tanstack/react-table for sorting, selection, column visibility
 *
 * FEATURES:
 * - Paginated table with rows per page selector
 * - Search filtering
 * - Bulk selection and delete
 * - Column visibility toggle
 * - Row click for editing
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
  Share2,
  Globe,
  GlobeLock,
  FileText,
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
import type { FormStatus } from '@/generated/prisma'
import { ShareFormModal } from './share-form-modal'

// ============================================================================
// TYPES
// ============================================================================

// Note: Dates come as strings from tRPC serialization
export type FormWithMetadata = {
  id: string
  name: string
  description: string | null
  slug: string
  status: FormStatus
  viewCount: number
  submissionCount: number
  createdAt: string | Date
  updatedAt: string | Date
  publishedAt: string | Date | null
  folder: {
    id: string
    name: string
    color: string | null
  } | null
  _count: {
    submissions: number
  }
}

interface FormsTableProps {
  forms: FormWithMetadata[]
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
  onFormClick: (form: FormWithMetadata) => void
  onBulkDelete?: (ids: string[]) => void
  onDelete?: (id: string) => void
  onPublish?: (id: string, status: FormStatus) => void
  /** Navigate to the submissions page for a specific form (receives slug) */
  onViewSubmissions?: (slug: string) => void
  isBulkDeleting: boolean
  canDelete: boolean
  canPublish?: boolean
}

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

function StatusBadge({ status }: { status: FormStatus }) {
  const variants: Record<FormStatus, { label: string; className: string }> = {
    DRAFT: {
      label: 'Draft',
      className: 'bg-muted text-muted-foreground',
    },
    PUBLISHED: {
      label: 'Published',
      className: 'bg-green-500/10 text-green-600 dark:text-green-400',
    },
    PAUSED: {
      label: 'Paused',
      className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    },
    ARCHIVED: {
      label: 'Archived',
      className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
    },
  }

  const { label, className } = variants[status]

  return (
    <Badge variant="secondary" className={cn('font-medium', className)}>
      {label}
    </Badge>
  )
}

// ============================================================================
// TABLE COMPONENT
// ============================================================================

export function FormsTable({
  forms,
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
  onFormClick,
  onBulkDelete,
  onDelete,
  onPublish,
  onViewSubmissions,
  isBulkDeleting,
  canDelete,
  canPublish = true,
}: FormsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

  // Share modal state - tracks which form to share
  const [shareModalForm, setShareModalForm] = React.useState<FormWithMetadata | null>(null)

  // Define table columns
  const columns: ColumnDef<FormWithMetadata>[] = React.useMemo(
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
              // Update parent state
              if (value) {
                onSelectionChange(forms.map((f) => f.id))
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
              // Update parent state
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
      // Submissions column - count is clickable to navigate to submissions page
      {
        accessorKey: '_count.submissions',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Submissions
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const count = row.original._count.submissions
          return onViewSubmissions ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewSubmissions(row.original.slug)
              }}
              className="tabular-nums text-primary hover:underline cursor-pointer"
            >
              {count}
            </button>
          ) : (
            <span className="tabular-nums">{count}</span>
          )
        },
      },
      // Views column
      {
        accessorKey: 'viewCount',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Views
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.getValue('viewCount')}</span>
        ),
      },
      // Created date column
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Created
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Date(row.getValue('createdAt')).toLocaleDateString()}
          </span>
        ),
      },
      // Actions column
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const form = row.original

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
                <DropdownMenuItem onClick={() => onFormClick(form)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Form
                </DropdownMenuItem>
                {onViewSubmissions && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewSubmissions(form.slug)
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    View Submissions
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    setShareModalForm(form)
                  }}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
                {canPublish && onPublish && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      // Toggle between PUBLISHED and DRAFT
                      const newStatus = form.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
                      onPublish(form.id, newStatus)
                    }}
                  >
                    {form.status === 'PUBLISHED' ? (
                      <>
                        <GlobeLock className="mr-2 h-4 w-4" />
                        Unpublish
                      </>
                    ) : (
                      <>
                        <Globe className="mr-2 h-4 w-4" />
                        Publish
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {canDelete && onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(form.id)
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
    [forms, selectedIds, onSelectionChange, onFormClick, onDelete, canDelete, onPublish, canPublish, onViewSubmissions]
  )

  // Initialize table
  const table = useReactTable({
    data: forms,
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
          const index = forms.findIndex((f) => f.id === id)
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
            placeholder="Search forms..."
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
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
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
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
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
                  className={cn(
                    'cursor-pointer transition-colors',
                    isFetching && 'opacity-50'
                  )}
                  onClick={() => onFormClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No forms found.
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
            Page {page} of {totalPages}
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

      {/* Share Form Modal */}
      <ShareFormModal
        open={!!shareModalForm}
        onOpenChange={(open) => !open && setShareModalForm(null)}
        formName={shareModalForm?.name ?? ''}
        formSlug={shareModalForm?.slug ?? ''}
        formStatus={shareModalForm?.status}
      />
    </div>
  )
}
