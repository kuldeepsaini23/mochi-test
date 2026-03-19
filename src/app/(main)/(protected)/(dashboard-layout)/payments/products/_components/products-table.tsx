/**
 * Products Table Component
 * Enhanced table with search, filters, bulk operations, and pagination
 * Following the same architecture as leads-table.tsx
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
  FilterIcon,
  ListFilterIcon,
  Trash2Icon,
  Package,
  ImageIcon,
} from 'lucide-react'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { formatCurrency, formatBillingType } from './utils'
import type { BillingType, BillingInterval } from '@/generated/prisma'

// Product type from our API
export interface ProductPrice {
  id: string
  productId: string
  name: string
  amount: number
  currency: string
  billingType: BillingType
  interval: BillingInterval | null
  intervalCount: number | null
  installments: number | null
  installmentInterval: BillingInterval | null
  installmentIntervalCount: number | null
  /** Free trial duration in days — null means no trial */
  trialDays: number | null
  stripePriceId: string | null
  active: boolean
  features: {
    id: string
    priceId: string
    name: string
    description: string | null
    order: number
    createdAt: string
    updatedAt: string
  }[]
  createdAt: string
  updatedAt: string
}

export interface ProductWithPrices {
  id: string
  organizationId: string
  name: string
  description: string | null
  imageUrl: string | null
  stripeProductId: string | null
  active: boolean
  /** Whether inventory tracking is enabled for this product */
  trackInventory: boolean
  /** Current available stock count */
  inventoryQuantity: number
  /** Allow purchases when out of stock */
  allowBackorder: boolean
  /** Alert threshold for low stock */
  lowStockThreshold: number | null
  prices: ProductPrice[]
  createdAt: string
  updatedAt: string
}

interface ProductsTableProps {
  products: ProductWithPrices[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  activeOnly: boolean | undefined
  onActiveFilterChange: (active: boolean | undefined) => void
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onProductClick: (product: ProductWithPrices) => void
  onBulkDelete?: (ids: string[]) => void
  onDelete?: (id: string) => void
  isBulkDeleting: boolean
  canDelete?: boolean
}

export function ProductsTable({
  products,
  isLoading,
  isFetching,
  search,
  onSearchChange,
  activeOnly,
  onActiveFilterChange,
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  selectedIds,
  onSelectionChange,
  onProductClick,
  onBulkDelete,
  onDelete,
  isBulkDeleting,
  canDelete = true,
}: ProductsTableProps) {
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Define columns
  const columns: ColumnDef<ProductWithPrices>[] = useMemo(
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
        header: 'Product',
        accessorKey: 'name',
        cell: ({ row }) => {
          const hasImage = !!row.original.imageUrl
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0 rounded-md">
                {hasImage ? (
                  <AvatarImage
                    src={row.original.imageUrl!}
                    alt={row.original.name}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="rounded-md bg-muted">
                  {hasImage ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Package className="h-5 w-5 text-muted-foreground" />
                  )}
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
        header: 'Pricing',
        accessorKey: 'prices',
        cell: ({ row }) => {
          const prices = row.original.prices
          if (prices.length === 0) {
            return <span className="text-sm text-muted-foreground">No prices</span>
          }

          // Show first price and count
          const firstPrice = prices[0]
          return (
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {formatCurrency(firstPrice.amount, firstPrice.currency)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatBillingType(firstPrice)}
                {prices.length > 1 && (
                  <span className="ml-1">+{prices.length - 1} more</span>
                )}
              </div>
            </div>
          )
        },
        size: 160,
      },
      {
        header: 'Status',
        accessorKey: 'active',
        cell: ({ row }) => {
          const isActive = row.original.active
          return (
            <Badge
              variant={isActive ? 'default' : 'secondary'}
              className={cn(
                'text-xs',
                isActive
                  ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          )
        },
        size: 100,
      },
      {
        /** Stock/inventory column — displays different states based on tracking config */
        header: 'Stock',
        accessorKey: 'inventoryQuantity',
        cell: ({ row }) => {
          const { trackInventory, inventoryQuantity, allowBackorder, lowStockThreshold } =
            row.original

          /* If inventory tracking is disabled, show a neutral label */
          if (!trackInventory) {
            return (
              <span className="text-sm text-muted-foreground">Not tracked</span>
            )
          }

          /* Out of stock scenarios */
          if (inventoryQuantity <= 0) {
            /* Backorder allowed — warn but don't block */
            if (allowBackorder) {
              return (
                <span className="text-sm font-medium text-orange-500">
                  0 (Backorder)
                </span>
              )
            }
            /* Fully out of stock */
            return (
              <span className="text-sm font-medium text-red-500">
                Out of stock
              </span>
            )
          }

          /* Low stock — quantity is positive but at or below the alert threshold */
          if (
            lowStockThreshold !== null &&
            inventoryQuantity <= lowStockThreshold
          ) {
            return (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-orange-500">
                  {inventoryQuantity}
                </span>
                <Badge
                  variant="secondary"
                  className="bg-orange-500/10 text-orange-500 text-[0.625rem] px-1.5 py-0"
                >
                  Low
                </Badge>
              </div>
            )
          }

          /* Healthy stock level */
          return (
            <span className="text-sm font-medium text-emerald-500">
              {inventoryQuantity}
            </span>
          )
        },
        size: 120,
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
    ],
    []
  )

  const table = useReactTable({
    data: products,
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
    if (selectedIds.length > 0 && onBulkDelete) {
      onBulkDelete(selectedIds)
      setRowSelection({})
      setDeleteDialogOpen(false)
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
              placeholder="Search products..."
              type="text"
              aria-label="Search products"
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

          {/* Filter by status */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <FilterIcon
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true"
                />
                Status
                {activeOnly !== undefined && (
                  <span className="-me-1 inline-flex h-5 max-h-full items-center rounded border bg-background px-1 font-[inherit] text-[0.625rem] font-medium text-muted-foreground/70">
                    1
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-36 p-3" align="start">
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Filter by Status
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-status-all`}
                      checked={activeOnly === undefined}
                      onCheckedChange={() => onActiveFilterChange(undefined)}
                    />
                    <Label htmlFor={`${id}-status-all`} className="font-normal">
                      All
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-status-active`}
                      checked={activeOnly === true}
                      onCheckedChange={() => onActiveFilterChange(activeOnly === true ? undefined : true)}
                    />
                    <Label htmlFor={`${id}-status-active`} className="font-normal">
                      Active
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-status-inactive`}
                      checked={activeOnly === false}
                      onCheckedChange={() => onActiveFilterChange(activeOnly === false ? undefined : false)}
                    />
                    <Label htmlFor={`${id}-status-inactive`} className="font-normal">
                      Inactive
                    </Label>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

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
                onClick={() => setDeleteDialogOpen(true)}
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
                        <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                      </div>
                    </TableCell>
                    <TableCell><div className="h-5 w-14 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-4 w-12 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="cursor-pointer"
                    onClick={() => onProductClick(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        onClick={(e) => {
                          // Prevent row click when clicking checkbox
                          if (cell.column.id === 'select') {
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
                    No products found.
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
            Showing {products.length > 0 ? (page - 1) * pageSize + 1 : 0}-
            {Math.min(page * pageSize, total)} of {total} products
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete {selectedCount} product{selectedCount !== 1 ? 's' : ''}.
              This action cannot be undone. The products will be archived in Stripe
              and removed from your dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
