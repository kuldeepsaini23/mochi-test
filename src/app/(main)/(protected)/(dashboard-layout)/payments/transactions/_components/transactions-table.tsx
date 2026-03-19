/**
 * Transactions Table Component
 * Enhanced table with search, filters, and pagination
 * Following the same architecture as products-table.tsx
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
  Package,
  ExternalLink,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  AlertTriangle,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  getStatusDisplay,
  getRefundStatusDisplay,
  formatDate,
  getCustomerDisplayName,
  getCustomerInitials,
  getPaymentProgress,
  formatPaymentProgress,
  formatBillingType,
} from './utils'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import { BILLING_TYPES } from '@/constants/billing'
import type { TransactionPaymentStatus } from '@/generated/prisma'
import type { TransactionWithRelations } from '@/types/transaction'

// Re-export for consumers
export type { TransactionWithRelations }

interface TransactionsTableProps {
  transactions: TransactionWithRelations[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  statusFilter: TransactionPaymentStatus[]
  onStatusFilterChange: (statuses: TransactionPaymentStatus[]) => void
  statusCounts: Record<string, number>
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onTransactionClick: (transaction: TransactionWithRelations) => void
}

/**
 * Status filter options using the new TransactionPaymentStatus enum
 * NEW ARCHITECTURE: COMPLETED→PAID, SUBSCRIPTION→ACTIVE, removed PENDING/REFUNDED/PARTIALLY_REFUNDED, CHARGEBACK→DISPUTED
 */
const STATUS_OPTIONS: TransactionPaymentStatus[] = [
  'AWAITING_PAYMENT',
  'PARTIALLY_PAID',
  'PAID',
  'TRIALING',
  'ACTIVE',
  'FAILED',
  'CANCELED',
  'DISPUTED',
]

export function TransactionsTable({
  transactions,
  isLoading,
  isFetching,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  onTransactionClick,
}: TransactionsTableProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])

  // Define columns
  const columns: ColumnDef<TransactionWithRelations>[] = useMemo(
    () => [
      {
        header: 'Customer',
        accessorKey: 'lead',
        cell: ({ row }) => {
          const lead = row.original.lead
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
        size: 220,
        enableHiding: false,
      },
      {
        header: 'Products',
        accessorKey: 'items',
        cell: ({ row }) => {
          const items = row.original.items
          if (items.length === 0) {
            return <span className="text-sm text-muted-foreground">No items</span>
          }

          const firstItem = items[0]
          return (
            <div className="flex items-center gap-2">
              {firstItem.productImage ? (
                <Avatar className="h-8 w-8 shrink-0 rounded-md">
                  <AvatarImage
                    src={firstItem.productImage}
                    alt={firstItem.productName}
                    className="object-cover"
                  />
                  <AvatarFallback className="rounded-md bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-md bg-muted flex items-center justify-center">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {firstItem.productName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {firstItem.priceName}
                  {items.length > 1 && (
                    <span className="ml-1">+{items.length - 1} more</span>
                  )}
                </div>
              </div>
            </div>
          )
        },
        size: 200,
      },
      /**
       * Type column — shows billing type (One-time, Recurring, Installments).
       * Essential for mixed-cart checkouts where multiple Transactions are created.
       * SOURCE OF TRUTH: TransactionTypeColumn
       */
      {
        header: 'Type',
        accessorKey: 'billingType',
        cell: ({ row }) => {
          const { billingType, trialDays } = row.original
          return (
            <div className="space-y-0.5">
              <div className="text-sm">{formatBillingType(billingType)}</div>
              {trialDays && trialDays > 0 && (
                <div className="text-xs text-muted-foreground">
                  {trialDays}-day trial
                </div>
              )}
            </div>
          )
        },
        size: 100,
      },
      /**
       * Amount column — shows what was actually charged in this payment event.
       * No interval suffix — transactions are payments, not subscriptions.
       * The "/mo" or "/yr" context belongs on the Subscriptions tab.
       *
       * SOURCE OF TRUTH: TransactionAmountColumn
       */
      {
        header: 'Amount',
        accessorKey: 'paidAmount',
        cell: ({ row }) => {
          /** paidAmount = what Stripe actually collected (not the product price).
           * For trials this is $0, for paid transactions it's the invoice total. */
          const { paidAmount, refundedAmount, currency } = row.original
          const hasRefund = refundedAmount > 0

          return (
            <div className="space-y-0.5">
              <div className="font-medium">
                {formatCurrency(paidAmount, currency)}
              </div>
              {hasRefund && (
                <div className="text-xs text-purple-600">
                  -{formatCurrency(refundedAmount, currency)} refunded
                </div>
              )}
            </div>
          )
        },
        size: 120,
      },
      /**
       * Status column - displays payment status and refund state separately
       * NEW ARCHITECTURE: Uses paymentStatus field and computes refund state from amounts
       */
      {
        header: 'Status',
        accessorKey: 'paymentStatus',
        cell: ({ row }) => {
          const { paymentStatus, paidAmount, refundedAmount } = row.original
          const { label, color, bgColor, icon } = getStatusDisplay(paymentStatus)
          const refundStatus = getRefundStatusDisplay(paidAmount, refundedAmount)

          const StatusIcon = () => {
            switch (icon) {
              case 'check':
                return <CheckCircle className="h-3.5 w-3.5" />
              case 'clock':
                return <Clock className="h-3.5 w-3.5" />
              case 'x':
                return <XCircle className="h-3.5 w-3.5" />
              case 'refresh':
                return <RefreshCw className="h-3.5 w-3.5" />
              case 'alert':
                return <AlertTriangle className="h-3.5 w-3.5" />
              default:
                return null
            }
          }

          return (
            <div className="flex flex-col gap-1.5">
              <Badge
                variant="secondary"
                className={cn('text-xs font-medium gap-1 w-fit', bgColor, color)}
              >
                <StatusIcon />
                {label}
              </Badge>
              {refundStatus && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-xs font-medium gap-1 w-fit',
                    refundStatus.bgColor,
                    refundStatus.color
                  )}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {refundStatus.label}
                </Badge>
              )}
            </div>
          )
        },
        size: 150,
      },
      /**
       * Progress column - shows payment progress for installments and subscriptions
       * NEW ARCHITECTURE: Uses successfulPayments instead of completedPayments, paymentStatus instead of status
       * Status values: PAID instead of COMPLETED, ACTIVE instead of SUBSCRIPTION
       */
      {
        header: 'Progress',
        accessorKey: 'successfulPayments',
        cell: ({ row }) => {
          const { successfulPayments, totalPayments, paymentStatus, items } = row.original
          const billingType = items[0]?.billingType

          // Only show progress bar for SPLIT_PAYMENT (installments)
          // For ONE_TIME: show "Paid in full" or dash
          // For RECURRING: show payment count for active subscriptions
          if (billingType === BILLING_TYPES.ONE_TIME) {
            if (paymentStatus === 'PAID') {
              return (
                <span className="text-sm text-muted-foreground">Paid in full</span>
              )
            }
            return <span className="text-sm text-muted-foreground">—</span>
          }

          /**
           * RECURRING items — show payment count instead of subscription state labels.
           * Subscription context lives on the Subscriptions tab; here we show raw payment data.
           */
          if (billingType === BILLING_TYPES.RECURRING) {
            if (successfulPayments > 0) {
              return (
                <span className="text-sm text-muted-foreground">
                  {successfulPayments} payment{successfulPayments !== 1 ? 's' : ''}
                </span>
              )
            }
            return <span className="text-sm text-muted-foreground">—</span>
          }

          // SPLIT_PAYMENT - show progress bar
          const progress = getPaymentProgress(successfulPayments, totalPayments)

          return (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1.5 cursor-help w-24">
                    <Progress value={progress} className="h-1.5" />
                    <div className="text-xs text-muted-foreground">
                      {formatPaymentProgress(successfulPayments, totalPayments)}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {successfulPayments} of {totalPayments} payments completed
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        size: 120,
      },
      {
        header: 'Date',
        accessorKey: 'createdAt',
        cell: ({ row }) => {
          const date = new Date(row.original.createdAt)
          return (
            <div className="text-sm text-muted-foreground">
              {formatDate(date)}
            </div>
          )
        },
        size: 100,
      },
      {
        header: '',
        id: 'actions',
        cell: () => (
          <div className="flex justify-end">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </div>
        ),
        size: 40,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    []
  )

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnVisibility,
    },
    manualPagination: true,
    pageCount: totalPages,
  })

  /**
   * Handle status filter changes
   * NEW ARCHITECTURE: Uses TransactionPaymentStatus instead of TransactionStatus
   */
  const handleStatusChange = (checked: boolean, value: TransactionPaymentStatus) => {
    const newFilter = checked
      ? [...statusFilter, value]
      : statusFilter.filter((s) => s !== value)
    onStatusFilterChange(newFilter)
  }

  return (
    <div className="flex flex-col">
      {/* Filters - Fixed at top */}
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
              placeholder="Search transactions..."
              type="text"
              aria-label="Search transactions"
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
                {statusFilter.length > 0 && (
                  <span className="-me-1 inline-flex h-5 max-h-full items-center rounded border bg-background px-1 font-[inherit] text-[0.625rem] font-medium text-muted-foreground/70">
                    {statusFilter.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-44 p-3" align="start">
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Filter by Status
                </div>
                <div className="space-y-3">
                  {STATUS_OPTIONS.map((value, i) => {
                    const { label } = getStatusDisplay(value)
                    return (
                      <div key={value} className="flex items-center gap-2">
                        <Checkbox
                          id={`${id}-status-${i}`}
                          checked={statusFilter.includes(value)}
                          onCheckedChange={(checked: boolean) =>
                            handleStatusChange(checked, value)
                          }
                        />
                        <Label
                          htmlFor={`${id}-status-${i}`}
                          className="flex grow justify-between gap-2 font-normal"
                        >
                          {label}
                          <span className="ms-2 text-xs text-muted-foreground">
                            {statusCounts[value] || 0}
                          </span>
                        </Label>
                      </div>
                    )
                  })}
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
                        <div className="space-y-1.5">
                          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-14 bg-muted animate-pulse rounded" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5 w-24">
                        <div className="h-1.5 w-full bg-muted animate-pulse rounded" />
                        <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => onTransactionClick(row.original)}
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
                    No transactions found.
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
            Showing {transactions.length > 0 ? (page - 1) * pageSize + 1 : 0}-
            {Math.min(page * pageSize, total)} of {total} transactions
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
