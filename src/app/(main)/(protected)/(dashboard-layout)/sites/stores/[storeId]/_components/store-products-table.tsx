'use client'

/**
 * ============================================================================
 * Store Products Table — TanStack React Table
 * ============================================================================
 *
 * WHY: Display products within a store in a professional table matching
 *      the products page table pattern.
 *
 * HOW: Uses TanStack React Table with client-side search, sorting,
 *      pagination, column visibility, and bulk actions.
 *
 * Features:
 * - Client-side search (filters by product name)
 * - Client-side pagination with configurable page size
 * - Column sorting
 * - Column visibility toggle
 * - Row selection with bulk remove
 * - Per-row actions: change price, remove
 *
 * SOURCE OF TRUTH: StoreProduct, ProductPrice, Store
 * ============================================================================
 */

import { useMemo, useId, useRef, useState } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
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
  Package,
  Trash2Icon,
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
import { cn, formatCurrency } from '@/lib/utils'

// ============================================================================
// TYPES — SOURCE OF TRUTH: StoreProduct, ProductPrice
// ============================================================================

interface ProductPrice {
  id: string
  name: string
  amount: number
  currency: string
  billingType: string
  interval: string | null
  intervalCount: number | null
}

interface StoreProduct {
  id: string
  storeId: string
  productId: string
  priceId: string
  order: number
  product: {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
    prices: ProductPrice[]
  }
  price: ProductPrice
}

interface StoreProductsTableProps {
  products: StoreProduct[]
  canUpdate: boolean
  onRemoveProduct: (productId: string) => void
  onChangePriceStart: (productId: string) => void
  changePriceProductId: string | null
  onChangePriceConfirm: (productId: string, priceId: string) => void
  onChangePriceCancel: () => void
  onBulkRemove?: (productIds: string[]) => void
}

// ============================================================================
// HELPERS
// ============================================================================

/** Only ONE_TIME and RECURRING are supported in stores */
const STORE_SUPPORTED_BILLING_TYPES = ['ONE_TIME', 'RECURRING'] as const

function getStoreSupportedPrices(prices: ProductPrice[]): ProductPrice[] {
  return prices.filter((p) =>
    STORE_SUPPORTED_BILLING_TYPES.includes(
      p.billingType as (typeof STORE_SUPPORTED_BILLING_TYPES)[number]
    )
  )
}

/** Format billing type for display in the table */
function formatBillingType(price: ProductPrice): string {
  if (price.billingType === 'ONE_TIME') return 'One-time'
  if (price.billingType === 'RECURRING' && price.interval) {
    const count = price.intervalCount || 1
    const interval = price.interval.toLowerCase()
    return count === 1 ? `Every ${interval}` : `Every ${count} ${interval}s`
  }
  return ''
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoreProductsTable({
  products,
  canUpdate,
  onRemoveProduct,
  onChangePriceStart,
  changePriceProductId,
  onChangePriceConfirm,
  onChangePriceCancel,
  onBulkRemove,
}: StoreProductsTableProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // ========================================================================
  // COLUMN DEFINITIONS
  // ========================================================================

  const columns: ColumnDef<StoreProduct>[] = useMemo(
    () => [
      /* Select checkbox column */
      ...(canUpdate
        ? [
            {
              id: 'select',
              header: ({ table }: { table: ReturnType<typeof useReactTable<StoreProduct>> }) => (
                <Checkbox
                  checked={
                    table.getIsAllPageRowsSelected() ||
                    (table.getIsSomePageRowsSelected() && 'indeterminate')
                  }
                  onCheckedChange={(value: boolean) =>
                    table.toggleAllPageRowsSelected(!!value)
                  }
                  aria-label="Select all"
                />
              ),
              cell: ({ row }: { row: { getIsSelected: () => boolean; toggleSelected: (val: boolean) => void } }) => (
                <Checkbox
                  checked={row.getIsSelected()}
                  onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
                  aria-label="Select row"
                />
              ),
              size: 40,
              enableSorting: false,
              enableHiding: false,
            } as ColumnDef<StoreProduct>,
          ]
        : []),

      /* Product — name + image */
      {
        header: 'Product',
        accessorFn: (row: StoreProduct) => row.product.name,
        id: 'name',
        cell: ({ row }) => {
          const product = row.original.product
          const hasImage = !!product.imageUrl
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0 rounded-md">
                {hasImage ? (
                  <AvatarImage
                    src={product.imageUrl!}
                    alt={product.name}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="rounded-md bg-muted">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{product.name}</div>
                {product.description && (
                  <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {product.description}
                  </div>
                )}
              </div>
            </div>
          )
        },
        size: 280,
        enableHiding: false,
      },

      /* Price — amount + billing type */
      {
        header: 'Price',
        id: 'price',
        accessorFn: (row: StoreProduct) => row.price.amount,
        cell: ({ row }) => {
          const price = row.original.price
          return (
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                {formatCurrency(price.amount, price.currency)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatBillingType(price)}
              </div>
            </div>
          )
        },
        size: 140,
      },

      /* Price Name — badge */
      {
        header: 'Price Name',
        id: 'priceName',
        accessorFn: (row: StoreProduct) => row.price.name,
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-xs font-normal">
            {row.original.price.name}
          </Badge>
        ),
        size: 140,
      },

      /* Billing — type badge */
      {
        header: 'Billing',
        id: 'billing',
        accessorFn: (row: StoreProduct) => row.price.billingType,
        cell: ({ row }) => {
          const isOneTime = row.original.price.billingType === 'ONE_TIME'
          return (
            <Badge
              variant={isOneTime ? 'default' : 'secondary'}
              className={cn(
                'text-xs',
                isOneTime
                  ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                  : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
              )}
            >
              {isOneTime ? 'One-time' : 'Recurring'}
            </Badge>
          )
        },
        size: 110,
      },

      /* Actions — change price, remove */
      ...(canUpdate
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: StoreProduct } }) => {
                const storeProduct = row.original
                const supportedPrices = getStoreSupportedPrices(
                  storeProduct.product.prices
                )

                /* If currently in "change price" mode for this product */
                if (changePriceProductId === storeProduct.productId) {
                  return (
                    <div className="flex items-center gap-2">
                      <Select
                        value={storeProduct.priceId}
                        onValueChange={(priceId) =>
                          onChangePriceConfirm(storeProduct.productId, priceId)
                        }
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {supportedPrices.map((price) => (
                            <SelectItem key={price.id} value={price.id}>
                              {price.name} —{' '}
                              {formatCurrency(price.amount, price.currency)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={onChangePriceCancel}
                      >
                        Cancel
                      </Button>
                    </div>
                  )
                }

                return (
                  <div className="flex items-center justify-end gap-1">
                    {supportedPrices.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() =>
                          onChangePriceStart(storeProduct.productId)
                        }
                      >
                        Change Price
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onRemoveProduct(storeProduct.productId)}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                )
              },
              size: 200,
              enableSorting: false,
              enableHiding: false,
            } as ColumnDef<StoreProduct>,
          ]
        : []),
    ],
    [
      canUpdate,
      changePriceProductId,
      onChangePriceStart,
      onChangePriceConfirm,
      onChangePriceCancel,
      onRemoveProduct,
    ]
  )

  // ========================================================================
  // TABLE INSTANCE — client-side filtering + pagination
  // ========================================================================

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.productId,
    globalFilterFn: (row, _columnId, filterValue) => {
      /** Search by product name (case-insensitive) */
      const name = row.original.product.name.toLowerCase()
      return name.includes(String(filterValue).toLowerCase())
    },
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    initialState: {
      pagination: { pageSize: 10 },
    },
  })

  const selectedCount = Object.keys(rowSelection).length
  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalRows = table.getFilteredRowModel().rows.length
  const totalPages = table.getPageCount()

  /** Bulk remove handler */
  const handleBulkRemove = () => {
    const selectedProductIds = Object.keys(rowSelection)
    if (selectedProductIds.length > 0 && onBulkRemove) {
      onBulkRemove(selectedProductIds)
      setRowSelection({})
      setDeleteDialogOpen(false)
    }
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="flex flex-col">
      {/* ================================================================
       * TOOLBAR — Search, Column Visibility, Bulk Actions
       * ================================================================ */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Search input */}
          <div className="relative">
            <Input
              id={`${id}-search`}
              ref={inputRef}
              className={cn(
                'peer min-w-60 ps-9',
                Boolean(globalFilter) && 'pe-9'
              )}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search products..."
              type="text"
              aria-label="Search store products"
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
              <ListFilterIcon size={16} aria-hidden="true" />
            </div>
            {Boolean(globalFilter) && (
              <button
                className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 transition-[color,box-shadow] outline-none hover:text-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Clear search"
                onClick={() => {
                  setGlobalFilter('')
                  inputRef.current?.focus()
                }}
              >
                <CircleXIcon size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Column visibility toggle */}
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
                .map((column) => (
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
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Bulk remove — visible when rows selected */}
        <div className="flex items-center gap-2">
          {canUpdate && selectedCount > 0 && onBulkRemove && (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedCount} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                Remove
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ================================================================
       * TABLE
       * ================================================================ */}
      <div className="overflow-hidden rounded-md border bg-background">
        <div className="max-h-[calc(100vh-22rem)] overflow-auto">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="hover:bg-muted bg-background"
                >
                  {headerGroup.headers.map((header) => (
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
                          tabIndex={
                            header.column.getCanSort() ? 0 : undefined
                          }
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
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        onClick={(e) => {
                          /* Prevent row actions when clicking select checkbox */
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
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="size-8 opacity-50" />
                      <p className="text-sm">
                        {globalFilter
                          ? 'No products match your search'
                          : 'No products in this store yet'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ================================================================
       * PAGINATION
       * ================================================================ */}
      <div className="flex items-center justify-between gap-8 pt-4 shrink-0">
        {/* Page size + total count */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label
              htmlFor={`${id}-page-size`}
              className="text-sm text-muted-foreground"
            >
              Rows per page:
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger id={`${id}-page-size`} className="h-8 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing{' '}
            {totalRows > 0 ? pageIndex * pageSize + 1 : 0}–
            {Math.min((pageIndex + 1) * pageSize, totalRows)} of {totalRows}{' '}
            product{totalRows !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Page navigation buttons */}
        <div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Go to first page"
                >
                  <ChevronFirstIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Go to previous page"
                >
                  <ChevronLeftIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Go to next page"
                >
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon"
                  variant="outline"
                  className="disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => table.setPageIndex(totalPages - 1)}
                  disabled={!table.getCanNextPage()}
                  aria-label="Go to last page"
                >
                  <ChevronLastIcon size={16} aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>

      {/* ================================================================
       * BULK REMOVE CONFIRMATION DIALOG
       * ================================================================ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Products</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedCount} product
              {selectedCount !== 1 ? 's' : ''} from this store? The products
              themselves will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
