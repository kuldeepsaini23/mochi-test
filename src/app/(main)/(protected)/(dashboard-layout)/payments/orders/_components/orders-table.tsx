/**
 * Orders Table Component
 *
 * Table for displaying and managing orders with focus on fulfillment status.
 *
 * IMPORTANT: Orders are NOT Transactions!
 * Orders are specifically for e-commerce products that require fulfillment.
 * A Transaction (payment record) gets attached to an Order.
 *
 * SOURCE OF TRUTH: Order model (from orders router)
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
  ChevronUpIcon,
  Columns3Icon,
  FilterIcon,
  ListFilterIcon,
  Package,
  PackageCheck,
  PackageX,
  Truck,
  ChevronLeftIcon,
  ChevronRightIcon,
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  formatOrderId,
  formatOrderDate,
  formatCurrency,
  getFulfillmentStatusDisplay,
  getPaymentStatusDisplay,
  getOrderStatusDisplay,
  getCustomerDisplayName,
  getCustomerInitials,
} from './utils'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import type {
  FulfillmentStatus,
  OrderStatus,
} from '@/generated/prisma'

import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/trpc/routers/_app'

/**
 * SOURCE OF TRUTH: TransformedOrder
 * Inferred from the tRPC router output of orders.getById.
 * This ensures the type always matches what the client actually receives,
 * avoiding serialization mismatches between server and client types.
 */
type RouterOutputs = inferRouterOutputs<AppRouter>
export type TransformedOrder = NonNullable<RouterOutputs['orders']['getById']>

interface OrdersTableProps {
  orders: TransformedOrder[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  statusFilter: OrderStatus[]
  onStatusFilterChange: (statuses: OrderStatus[]) => void
  fulfillmentFilter: FulfillmentStatus[]
  onFulfillmentFilterChange: (statuses: FulfillmentStatus[]) => void
  statusCounts: Record<string, number>
  fulfillmentCounts: Record<string, number>
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onOrderClick: (orderId: string) => void
}

/**
 * Fulfillment status filter options
 */
const FULFILLMENT_OPTIONS: FulfillmentStatus[] = [
  'UNFULFILLED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'CANCELED',
]

/**
 * Order status filter options
 */
const STATUS_OPTIONS: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELED',
  'REFUNDED',
]

/**
 * Get icon for fulfillment status
 */
function getFulfillmentIcon(status: FulfillmentStatus) {
  switch (status) {
    case 'FULFILLED':
      return PackageCheck
    case 'PARTIALLY_FULFILLED':
      return Truck
    case 'CANCELED':
      return PackageX
    default:
      return Package
  }
}

export function OrdersTable({
  orders,
  isLoading,
  isFetching,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  fulfillmentFilter,
  onFulfillmentFilterChange,
  statusCounts,
  fulfillmentCounts,
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  onOrderClick,
}: OrdersTableProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])

  // Define columns for orders table
  const columns: ColumnDef<TransformedOrder>[] = useMemo(
    () => [
      {
        header: 'Order',
        accessorKey: 'id',
        cell: ({ row }) => {
          const order = row.original
          return (
            <div className="space-y-0.5">
              <div className="font-medium font-mono text-sm">
                {formatOrderId(order.id)}
              </div>
              <div className="text-xs text-muted-foreground">
                {order.transaction?.billingType?.replace('_', ' ') ?? 'N/A'}
              </div>
            </div>
          )
        },
        size: 160,
        enableHiding: false,
      },
      {
        header: 'Customer',
        accessorKey: 'customer',
        cell: ({ row }) => {
          const lead = row.original.transaction?.lead ?? null
          const displayName = getCustomerDisplayName(lead)
          const initials = getCustomerInitials(lead)
          const avatarBg = lead ? getConsistentColor(displayName) : '#6b7280'
          const avatarText = getTextColorForBackground(avatarBg)

          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage
                  src={lead?.avatarUrl || undefined}
                  alt={displayName}
                />
                <AvatarFallback
                  className="text-xs font-medium"
                  style={{ backgroundColor: avatarBg, color: avatarText }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{displayName}</div>
                {lead && (
                  <div className="text-xs text-muted-foreground truncate">
                    {lead.email}
                  </div>
                )}
              </div>
            </div>
          )
        },
        size: 200,
        enableHiding: false,
      },
      {
        header: 'Items',
        accessorKey: 'items',
        cell: ({ row }) => {
          const items = row.original.transaction?.items ?? []
          if (items.length === 0) return <span className="text-muted-foreground">-</span>

          const firstItem = items[0]
          const hasMore = items.length > 1

          return (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 shrink-0 rounded-md">
                <AvatarImage
                  src={firstItem.productImage || undefined}
                  alt={firstItem.productName}
                  className="object-cover"
                />
                <AvatarFallback className="rounded-md bg-muted">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="truncate font-medium">{firstItem.productName}</span>
                {hasMore && (
                  <span className="text-xs text-muted-foreground ml-1">
                    +{items.length - 1} more
                  </span>
                )}
              </div>
            </div>
          )
        },
        size: 180,
      },
      {
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) => {
          const transaction = row.original.transaction
          if (!transaction) return <span className="text-muted-foreground">-</span>

          /**
           * Show the primary transaction's originalAmount — the charge amount for this payment event.
           * Trial orders show a Trial badge. Each Transaction = one payment event, so display is simple.
           *
           * SOURCE OF TRUTH: OrderTableAmount
           */
          const hasTrial =
            transaction.trialDays &&
            transaction.trialDays > 0 &&
            transaction.paymentStatus === 'TRIALING'

          return (
            <div className="space-y-0.5">
              <span className="font-medium">
                {formatCurrency(transaction.paidAmount, transaction.currency)}
              </span>
              {hasTrial && (
                <div className="flex items-center gap-1">
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                  >
                    Trial
                  </Badge>
                </div>
              )}
            </div>
          )
        },
        size: 120,
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => {
          const status = row.original.status
          const display = getOrderStatusDisplay(status)
          return (
            <Badge variant="secondary" className={cn('text-xs', display.badgeClass)}>
              {display.label}
            </Badge>
          )
        },
        size: 110,
      },
      {
        header: 'Fulfillment',
        accessorKey: 'fulfillmentStatus',
        cell: ({ row }) => {
          const status = row.original.fulfillmentStatus
          const display = getFulfillmentStatusDisplay(status)
          const Icon = getFulfillmentIcon(status)

          return (
            <Badge variant="secondary" className={cn('text-xs', display.badgeClass)}>
              <Icon className="mr-1 h-3 w-3" />
              {display.label}
            </Badge>
          )
        },
        size: 130,
      },
      {
        header: 'Date',
        accessorKey: 'createdAt',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatOrderDate(row.original.createdAt)}
          </span>
        ),
        size: 100,
      },
    ],
    []
  )

  // Initialize table
  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnVisibility,
    },
    manualPagination: true,
    pageCount: totalPages,
  })

  // Handle filter toggles
  const handleStatusToggle = (status: OrderStatus, checked: boolean) => {
    if (checked) {
      onStatusFilterChange([...statusFilter, status])
    } else {
      onStatusFilterChange(statusFilter.filter((s) => s !== status))
    }
  }

  const handleFulfillmentToggle = (status: FulfillmentStatus, checked: boolean) => {
    if (checked) {
      onFulfillmentFilterChange([...fulfillmentFilter, status])
    } else {
      onFulfillmentFilterChange(fulfillmentFilter.filter((s) => s !== status))
    }
  }

  // Render skeleton rows for loading state
  const renderSkeletonRows = () => {
    return [...Array(5)].map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        <TableCell>
          <div className="space-y-1.5">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-16 bg-muted animate-pulse rounded" />
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
            <div className="space-y-1.5">
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
              <div className="h-3 w-36 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-muted animate-pulse rounded-md" />
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          </div>
        </TableCell>
        <TableCell>
          <div className="h-4 w-16 bg-muted animate-pulse rounded" />
        </TableCell>
        <TableCell>
          <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
        </TableCell>
        <TableCell>
          <div className="h-5 w-24 bg-muted animate-pulse rounded-full" />
        </TableCell>
        <TableCell>
          <div className="h-4 w-16 bg-muted animate-pulse rounded" />
        </TableCell>
      </TableRow>
    ))
  }

  return (
    <div className="flex flex-col">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Search filter */}
          <div className="relative">
            <Input
              ref={inputRef}
              id={`${id}-search`}
              className={cn(
                'peer min-w-60 ps-9',
                isFetching && 'opacity-70'
              )}
              placeholder="Search orders..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={isLoading}
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
              <ListFilterIcon size={16} aria-hidden="true" />
            </div>
          </div>

          {/* Order status filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" disabled={isLoading}>
                <FilterIcon
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true"
                />
                Status
                {statusFilter.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 h-5 min-w-5 rounded-full px-1.5 text-xs"
                  >
                    {statusFilter.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start">
              <div className="space-y-3">
                <p className="text-sm font-medium">Filter by status</p>
                <div className="space-y-2">
                  {STATUS_OPTIONS.map((status) => {
                    const display = getOrderStatusDisplay(status)
                    const count = statusCounts[status] ?? 0
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <Checkbox
                          id={`${id}-status-${status}`}
                          checked={statusFilter.includes(status)}
                          onCheckedChange={(checked) =>
                            handleStatusToggle(status, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={`${id}-status-${status}`}
                          className="flex-1 cursor-pointer"
                        >
                          {display.label}
                        </Label>
                        <Badge variant="secondary" className="text-xs">
                          {count}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
                {statusFilter.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => onStatusFilterChange([])}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Fulfillment status filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" disabled={isLoading}>
                <FilterIcon
                  className="-ms-1 opacity-60"
                  size={16}
                  aria-hidden="true"
                />
                Fulfillment
                {fulfillmentFilter.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 h-5 min-w-5 rounded-full px-1.5 text-xs"
                  >
                    {fulfillmentFilter.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start">
              <div className="space-y-3">
                <p className="text-sm font-medium">Filter by fulfillment</p>
                <div className="space-y-2">
                  {FULFILLMENT_OPTIONS.map((status) => {
                    const display = getFulfillmentStatusDisplay(status)
                    const count = fulfillmentCounts[status] ?? 0
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <Checkbox
                          id={`${id}-filter-${status}`}
                          checked={fulfillmentFilter.includes(status)}
                          onCheckedChange={(checked) =>
                            handleFulfillmentToggle(status, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={`${id}-filter-${status}`}
                          className="flex-1 cursor-pointer"
                        >
                          {display.label}
                        </Label>
                        <Badge variant="secondary" className="text-xs">
                          {count}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
                {fulfillmentFilter.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => onFulfillmentFilterChange([])}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Column visibility toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isLoading}>
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
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    className="capitalize"
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border bg-background">
        <div className="max-h-[calc(100vh-22rem)] overflow-auto">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-muted bg-background">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-11"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            'flex items-center gap-1',
                            header.column.getCanSort() && 'cursor-pointer select-none'
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' && (
                            <ChevronUpIcon className="h-4 w-4" />
                          )}
                          {header.column.getIsSorted() === 'desc' && (
                            <ChevronDownIcon className="h-4 w-4" />
                          )}
                        </div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                renderSkeletonRows()
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        {search || statusFilter.length > 0 || fulfillmentFilter.length > 0
                          ? 'No orders found matching your filters'
                          : 'No orders yet'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => onOrderClick(row.original.id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col-reverse items-center gap-4 pt-4 md:flex-row md:justify-between">
        <div className="text-sm tabular-nums text-muted-foreground">
          <span className="text-foreground font-medium">{orders.length}</span> of{' '}
          <span className="text-foreground font-medium">{total}</span> row(s)
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(parseInt(value))}
            disabled={isLoading}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="25">25 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Previous
          </Button>
          <div className="text-sm font-medium tabular-nums">
            Page {page} of {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || isLoading}
          >
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
