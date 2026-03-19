/**
 * Websites Table Component
 *
 * WHY: Display websites (categories) in a paginated, searchable table with bulk actions
 * HOW: Uses @tanstack/react-table for sorting, selection, and column visibility
 *
 * FEATURES:
 * - Search filtering
 * - Column visibility toggle
 * - Bulk selection and deletion
 * - Row click to edit
 *
 * ARCHITECTURE NOTE:
 * Websites are CATEGORIES/GROUPINGS that contain multiple pages.
 * Publish status is now at the PAGE level, not the website level.
 * Each page can be individually published/unpublished in the builder.
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
  Globe,
  GlobeIcon,
  MoreHorizontal,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

/**
 * Website type for table/grid display.
 *
 * ARCHITECTURE: Domain → Website (Category) → Pages
 *
 * A Website is a CATEGORY/GROUPING that contains multiple pages.
 * The actual page URLs come from canvasData.pages[pageId].info.slug.
 *
 * NOTE:
 * - faviconUrl and logoUrl are now on Domain, not Website
 * - Domain info is included for navigation
 * - canvasData contains the pages with their URL slugs
 * - Publish status is at the PAGE level, not website level
 * - Domain can be null when hard-deleted - websites remain accessible via websiteId
 *
 * SOURCE OF TRUTH KEYWORDS: WebsiteWithStatus, WebsiteListItem
 */
export interface WebsiteWithStatus {
  id: string
  organizationId: string
  domainId: string | null // Null when domain is hard-deleted
  name: string
  description: string | null
  createdAt: Date | string
  updatedAt: Date | string
  canvasData?: unknown // Contains pages with their URL slugs
  deletedAt?: Date | string | null // For soft delete tracking
  /** Auto-generated preview ID for preview URLs (e.g., "a7x9k2m5") */
  previewId: string | null
  /**
   * Domain info - null when domain is hard-deleted or not connected.
   * NOTE: domain.name was removed from schema - only customDomain exists now.
   */
  domain: {
    id: string
    customDomain: string
  } | null // Null when domain is hard-deleted or not connected
  /** First page info - for instant navigation and preview display */
  pages?: {
    slug: string
    name?: string
    status?: string
    /**
     * Preview image captured when page is published.
     * Includes storageKey as fallback for URL construction if publicUrl is null.
     * SOURCE OF TRUTH KEYWORDS: PagePreviewImage, WebsiteCardPreview
     */
    previewImage?: {
      id: string
      publicUrl: string | null
      storageKey: string
    } | null
  }[]
  /** Page count for displaying stats */
  _count?: {
    pages: number
  }
}

interface WebsitesTableProps {
  websites: WebsiteWithStatus[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onWebsiteClick: (website: WebsiteWithStatus) => void
  /** Called on row hover - use for prefetching the edit page */
  onWebsiteHover?: (website: WebsiteWithStatus) => void
  onBulkDelete?: (ids: string[]) => void
  onDelete?: (id: string) => void
  isBulkDeleting: boolean
  canDelete?: boolean
}

export function WebsitesTable({
  websites,
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
  onWebsiteClick,
  onWebsiteHover,
  onBulkDelete,
  onDelete,
  isBulkDeleting,
  canDelete = true,
}: WebsitesTableProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'name',
      desc: false,
    },
  ])
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  // Define columns
  const columns: ColumnDef<WebsiteWithStatus>[] = useMemo(
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
        header: 'Website',
        accessorKey: 'name',
        cell: ({ row }) => {
          // NOTE: logoUrl is now on Domain, not Website
          // We show a Globe icon as the default avatar
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0 rounded-md">
                <AvatarFallback className="rounded-md bg-muted">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{row.original.name}</div>
                {row.original.description && (
                  <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {row.original.description}
                  </div>
                )}
              </div>
            </div>
          )
        },
        size: 280,
        enableHiding: false,
      },
      {
        header: 'Domain',
        accessorKey: 'domain.customDomain',
        cell: ({ row }) => {
          const domain = row.original.domain
          // Domain is null when hard-deleted or never assigned
          const isDomainMissing = !domain

          // Extract first page slug from canvasData for preview
          const canvasData = row.original.canvasData as {
            pages?: Record<string, { info?: { slug?: string } }>
            pageOrder?: string[]
          } | null

          let firstPageSlug = ''
          if (canvasData?.pages && canvasData?.pageOrder?.length) {
            const firstPageId = canvasData.pageOrder[0]
            const firstPage = canvasData.pages[firstPageId]
            if (firstPage?.info?.slug) {
              firstPageSlug = firstPage.info.slug.replace(/^\//, '')
            }
          }

          // Show fallback when domain is missing (hard-deleted or never assigned)
          if (isDomainMissing) {
            return (
              <div className="space-y-1">
                <div className="text-sm font-medium flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <GlobeIcon className="h-3.5 w-3.5" />
                  No domain
                </div>
                <div className="text-xs text-muted-foreground">
                  Assign to a domain to publish
                </div>
              </div>
            )
          }

          return (
            <div className="space-y-1">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <GlobeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {domain.customDomain}
              </div>
              {firstPageSlug && (
                <div className="text-xs text-muted-foreground">
                  /{firstPageSlug}
                </div>
              )}
            </div>
          )
        },
        size: 200,
      },
      {
        header: 'Created',
        accessorKey: 'createdAt',
        cell: ({ row }) => {
          const date = new Date(row.original.createdAt)
          return (
            <div className="text-sm text-muted-foreground">
              {date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
              })}
            </div>
          )
        },
        size: 100,
      },
      {
        header: 'Updated',
        accessorKey: 'updatedAt',
        cell: ({ row }) => {
          const date = new Date(row.original.updatedAt)
          return (
            <div className="text-sm text-muted-foreground">
              {date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
              })}
            </div>
          )
        },
        size: 100,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const website = row.original

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onWebsiteClick(website)}>
                  Edit Website
                </DropdownMenuItem>
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete?.(website.id)
                      }}
                    >
                      <Trash2Icon className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [canDelete, onDelete, onWebsiteClick]
  )

  const table = useReactTable({
    data: websites,
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
  // Handle bulk delete request - opens confirmation dialog in parent
  const handleBulkDeleteRequest = () => {
    const selectedIds = Object.keys(rowSelection)
    if (selectedIds.length > 0 && onBulkDelete) {
      onBulkDelete(selectedIds)
      // Note: rowSelection is cleared by parent after successful delete
    }
  }

  return (
    <div className="flex flex-col">
      {/* Filters and Bulk Actions - Fixed at top */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Search filter */}
          <div className="relative">
            <Input
              id={`${id}-input`}
              ref={inputRef}
              className={cn(
                'peer min-w-60 ps-9',
                Boolean(search) && 'pe-9'
              )}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search websites..."
              type="text"
              aria-label="Search websites"
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
              <ListFilterIcon size={16} aria-hidden="true" />
            </div>
            {Boolean(search) && (
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
                <Columns3Icon
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true"
                />
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
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Bulk Actions - Only show if canDelete */}
        <div className="flex items-center gap-2">
          {canDelete && selectedCount > 0 && onBulkDelete && (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedCount} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDeleteRequest}
                disabled={isBulkDeleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                {isBulkDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table - Scrollable area */}
      <div className="overflow-hidden rounded-md border bg-background">
        <div className="max-h-[calc(100vh-22rem)] overflow-auto">
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
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
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
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )
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
                    <TableCell><div className="h-4 w-4 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-muted animate-pulse rounded-md" />
                        <div className="space-y-2">
                          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-28 bg-muted animate-pulse rounded" />
                      </div>
                    </TableCell>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-8 w-8 bg-muted animate-pulse rounded" /></TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="cursor-pointer"
                    onClick={() => onWebsiteClick(row.original)}
                    onMouseEnter={() => onWebsiteHover?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        onClick={(e) => {
                          // Prevent row click when clicking checkbox or actions
                          if (cell.column.id === 'select' || cell.column.id === 'actions') {
                            e.stopPropagation()
                          }
                        }}
                      >
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
                    No websites found.
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
            Showing {websites.length > 0 ? (page - 1) * pageSize + 1 : 0}-
            {Math.min(page * pageSize, total)} of {total} websites
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
                  disabled={page === 1}
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
                  onClick={() => onPageChange(page - 1)}
                  disabled={page === 1}
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
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
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
                  disabled={page >= totalPages}
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
