/**
 * Fields Table Component
 *
 * WHY: Display and manage custom fields for selected data set
 * HOW: Similar pattern to leads table with columns for field properties
 *
 * ARCHITECTURE:
 * - Checkbox for selection
 * - Field Name (label), Type columns with truncation
 * - Actions in toolbar when rows selected (like leads table)
 * - Search filter, bulk delete, pagination
 * - Empty state when no data set selected or no fields
 */

'use client'

import { useMemo, useId, useRef, useState } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table'
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleXIcon,
  Columns3Icon,
  ListFilterIcon,
  Trash2Icon,
  TypeIcon,
  CalendarIcon,
  CheckSquareIcon,
  HashIcon,
  TextIcon,
  ToggleLeftIcon,
  ListIcon,
  MailIcon,
  PhoneIcon,
  LinkIcon,
  FolderIcon,
  PlusIcon,
  KeyIcon,
  PencilIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

// Field type from our API
export interface CustomField {
  id: string
  categoryId: string
  name: string
  label: string
  slug: string
  fieldType: string
  required: boolean
  placeholder: string | null
  helpText: string | null
  defaultValue: string | null
  validation: unknown
  options: unknown
  order: number
  createdAt: Date | string
  updatedAt: Date | string
}

interface FieldsTableProps {
  fields: CustomField[]
  totalFields: number
  searchQuery: string
  onSearchChange: (query: string) => void
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onBulkDelete: (ids: string[]) => void
  isDeleting?: boolean
  isLoading?: boolean
  selectedDataSetId: string | null
  onAddField: () => void
  onEditField: (field: CustomField) => void
  onDeleteField: (field: CustomField) => void
}

// Helper to get icon for field type
function getFieldTypeIcon(fieldType: string) {
  switch (fieldType) {
    case 'TEXT':
      return <TextIcon className="h-4 w-4" />
    case 'NUMBER':
      return <HashIcon className="h-4 w-4" />
    case 'EMAIL':
      return <MailIcon className="h-4 w-4" />
    case 'PHONE':
      return <PhoneIcon className="h-4 w-4" />
    case 'URL':
      return <LinkIcon className="h-4 w-4" />
    case 'TEXTAREA':
      return <TextIcon className="h-4 w-4" />
    case 'SELECT':
      return <ListIcon className="h-4 w-4" />
    case 'CHECKBOX':
      return <CheckSquareIcon className="h-4 w-4" />
    case 'TOGGLE':
      return <ToggleLeftIcon className="h-4 w-4" />
    case 'DATE':
      return <CalendarIcon className="h-4 w-4" />
    default:
      return <TypeIcon className="h-4 w-4" />
  }
}

// Helper to format field type display
function formatFieldType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

export function FieldsTable({
  fields,
  totalFields,
  searchQuery,
  onSearchChange,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  onBulkDelete,
  isDeleting,
  isLoading,
  selectedDataSetId,
  onAddField,
  onEditField,
  onDeleteField,
}: FieldsTableProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'label',
      desc: false,
    },
  ])
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  // Copy field key to clipboard
  const copyFieldKey = async (slug: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click
    try {
      // Check if clipboard API is available (requires HTTPS or localhost)
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(slug)
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement('textarea')
        textArea.value = slug
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      toast.success('Field key copied to clipboard')
    } catch (err) {
      toast.error('Failed to copy to clipboard')
    }
  }

  // Handle row click to edit field
  const handleRowClick = (field: CustomField) => {
    onEditField(field)
  }

  // Define columns - simplified without inline actions
  const columns: ColumnDef<CustomField>[] = useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        size: 40,
        enableSorting: false,
        enableHiding: false,
      },
      {
        header: 'Field Name',
        accessorKey: 'label',
        cell: ({ row }) => (
          <div className="font-medium truncate max-w-[180px]" title={row.getValue('label')}>
            {row.getValue('label')}
          </div>
        ),
        size: 200,
        enableHiding: false,
      },
      {
        header: 'Type',
        accessorKey: 'fieldType',
        cell: ({ row }) => {
          const fieldType = row.getValue('fieldType') as string
          return (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground shrink-0">
                {getFieldTypeIcon(fieldType)}
              </span>
              <span className="text-sm truncate">{formatFieldType(fieldType)}</span>
            </div>
          )
        },
        size: 140,
      },
      {
        header: 'Key',
        accessorKey: 'slug',
        cell: ({ row }) => (
          <button
            onClick={(e) => copyFieldKey(row.getValue('slug'), e)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Click to copy field key"
          >
            <KeyIcon className="h-3.5 w-3.5" />
            <code className="bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">
              {row.getValue('slug')}
            </code>
          </button>
        ),
        size: 160,
      },
    ],
    []
  )

  const table = useReactTable({
    data: fields,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
    },
    manualPagination: true,
    pageCount: totalPages,
  })

  // Get selected row count
  const selectedCount = Object.keys(rowSelection).length

  // Handle bulk delete
  const handleBulkDelete = () => {
    const selectedIds = Object.keys(rowSelection)
    if (selectedIds.length > 0) {
      onBulkDelete(selectedIds)
      setRowSelection({})
    }
  }

  // Get selected field for single selection actions
  const selectedFieldIds = Object.keys(rowSelection)
  const selectedField = selectedFieldIds.length === 1
    ? fields.find(f => f.id === selectedFieldIds[0])
    : null

  // Show empty state when no data set is selected
  if (!selectedDataSetId) {
    return (
      <div className="h-full flex items-center justify-center rounded-md border bg-background">
        <div className="text-center">
          <FolderIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">No Data Set Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select a data set from the sidebar to view its fields
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters and Bulk Actions - Fixed at top */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Search fields */}
          <div className="relative">
            <Input
              id={`${id}-input`}
              ref={inputRef}
              className={cn('peer min-w-60 ps-9', Boolean(searchQuery) && 'pe-9')}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search fields..."
              type="text"
              aria-label="Search fields"
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
              <ListFilterIcon size={16} aria-hidden="true" />
            </div>
            {Boolean(searchQuery) && (
              <button
                className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 transition-[color,box-shadow] outline-none hover:text-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Clear search"
                onClick={() => {
                  onSearchChange('')
                  if (inputRef.current) {
                    inputRef.current.focus()
                  }
                }}
              >
                <CircleXIcon size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Toggle columns visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3Icon className="-ms-1 opacity-60" size={16} aria-hidden="true" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Actions & Add Field */}
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedCount} selected
              </span>
              {/* Edit button - only show when exactly 1 field is selected */}
              {selectedField && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onEditField(selectedField)
                    setRowSelection({})
                  }}
                >
                  <PencilIcon className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
              {/* Delete button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedField) {
                    onDeleteField(selectedField)
                    setRowSelection({})
                  } else {
                    handleBulkDelete()
                  }
                }}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </>
          )}
          <Button size="sm" onClick={onAddField}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add Field
          </Button>
        </div>
      </div>

      {/* Table - Scrollable area */}
      <div className="flex-1 min-h-0 overflow-hidden rounded-md border bg-background">
        <div className="h-full overflow-auto">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-muted bg-background">
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        style={{ width: `${header.getSize()}px` }}
                        className="h-11"
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <div
                            className={cn(
                              header.column.getCanSort() &&
                                'flex h-full cursor-pointer items-center justify-between gap-2 select-none'
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                            onKeyDown={(e) => {
                              if (
                                header.column.getCanSort() &&
                                (e.key === 'Enter' || e.key === ' ')
                              ) {
                                e.preventDefault()
                                header.column.getToggleSortingHandler()?.(e)
                              }
                            }}
                            tabIndex={header.column.getCanSort() ? 0 : undefined}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: (
                                <ChevronUpIcon
                                  className="shrink-0 opacity-60"
                                  size={16}
                                  aria-hidden="true"
                                />
                              ),
                              desc: (
                                <ChevronDownIcon
                                  className="shrink-0 opacity-60"
                                  size={16}
                                  aria-hidden="true"
                                />
                              ),
                            }[header.column.getIsSorted() as string] ?? null}
                          </div>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Loading skeleton rows
                [...Array(5)].map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell>
                      <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        onClick={(e) => {
                          // Prevent row click when clicking checkbox or key button
                          if (cell.column.id === 'select' || cell.column.id === 'slug') {
                            e.stopPropagation()
                          }
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No fields found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination - Fixed at bottom */}
      <div className="flex items-center justify-between gap-8 pt-4 shrink-0">
        {/* Page size selector and results count */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="page-size" className="text-sm text-muted-foreground">
              Rows per page:
            </Label>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger id="page-size" className="h-8 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {fields.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-
            {Math.min(currentPage * pageSize, totalFields)} of {totalFields} fields
          </div>
        </div>

        {/* Pagination buttons */}
        <div>
          <Pagination>
            <PaginationContent>
              {/* First page button */}
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => onPageChange(1)}
                  disabled={currentPage === 1}
                  aria-label="Go to first page"
                >
                  <ChevronFirstIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              {/* Previous page button */}
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Go to previous page"
                >
                  <ChevronLeftIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              {/* Next page button */}
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  aria-label="Go to next page"
                >
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              {/* Last page button */}
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => onPageChange(totalPages)}
                  disabled={currentPage >= totalPages}
                  aria-label="Go to last page"
                >
                  <ChevronLastIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  )
}
