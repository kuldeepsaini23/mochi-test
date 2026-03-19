'use client'

/**
 * Wallet Transactions Table Component
 *
 * WHY: Display all wallet transactions with pagination and filtering
 * HOW: Server-side pagination pattern similar to products table
 *
 * TRANSACTION TYPES:
 * - TOP_UP: Manual or automatic wallet funding
 * - CHARGE: Usage-based deductions (AI, SMS, etc.)
 * - REFUND: Credits returned to wallet
 *
 * SOURCE OF TRUTH: WalletTransaction, Pagination pattern from products-table
 */

import { useMemo, useId, useRef, useState } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleXIcon,
  ListFilterIcon,
  FilterIcon,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Zap,
  MessageSquare,
  Bot,
  HelpCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Transaction type enum
 * WHY: Distinguishes between different wallet operations
 */
export type WalletTransactionType = 'TOP_UP' | 'CHARGE' | 'REFUND'

/**
 * Transaction status enum
 * WHY: Tracks the lifecycle of each transaction
 */
export type WalletTransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

/**
 * Category of charges (what the money was used for)
 * WHY: Helps users understand what they're being charged for
 *
 * NOTE: Must match WalletChargeCategory enum from Prisma schema
 * SOURCE OF TRUTH: WalletChargeCategory in prisma/schema.prisma
 */
export type ChargeCategory =
  | 'AUTO_TOP_UP'
  | 'MANUAL_TOP_UP'
  | 'FREE_CREDIT'
  | 'REFUND'
  | 'AI_USAGE'
  | 'SMS'
  | 'EMAIL'
  | 'STORAGE'
  | 'API_CALLS'
  | 'OTHER'

/**
 * Wallet transaction record
 * SOURCE OF TRUTH: WalletTransaction model (to be created in Prisma)
 */
export interface WalletTransaction {
  id: string
  organizationId: string
  type: WalletTransactionType
  status: WalletTransactionStatus
  category: ChargeCategory
  amount: number // In millicents (positive for top-up, negative for charges)
  currency: string
  description: string
  metadata?: Record<string, unknown> | null
  balanceAfter: number // Balance after this transaction (in millicents)
  createdAt: Date | string
}

interface WalletTransactionsTableProps {
  transactions: WalletTransaction[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  typeFilter: WalletTransactionType | undefined
  onTypeFilterChange: (type: WalletTransactionType | undefined) => void
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

// ============================================================================
// HELPERS
// ============================================================================

import { formatWalletAmount } from '@/lib/utils'

/**
 * Format wallet amount for display with sign indicator.
 * WHY: Wallet transactions need +/- sign display.
 * NOTE: Wallet amounts are in MILLICENTS (1000 = $1.00) for sub-cent pricing accuracy.
 * Uses formatWalletAmount (divides by 1000) for base formatting, then adds sign.
 */
function formatAmount(amountInMillicents: number, currency: string = 'USD'): string {
  const formatted = formatWalletAmount(Math.abs(amountInMillicents), currency)
  return amountInMillicents >= 0 ? `+${formatted}` : `-${formatted}`
}

/**
 * Get icon for transaction category
 * WHY: Visual indication of what the charge was for
 */
function getCategoryIcon(category: ChargeCategory) {
  switch (category) {
    case 'AI_USAGE':
      return <Bot className="h-4 w-4" />
    case 'SMS':
      return <MessageSquare className="h-4 w-4" />
    case 'EMAIL':
      return <Zap className="h-4 w-4" />
    case 'MANUAL_TOP_UP':
    case 'AUTO_TOP_UP':
    case 'FREE_CREDIT':
      return <ArrowUpCircle className="h-4 w-4" />
    case 'REFUND':
      return <ArrowUpCircle className="h-4 w-4" />
    case 'API_CALLS':
      return <Zap className="h-4 w-4" />
    default:
      return <HelpCircle className="h-4 w-4" />
  }
}

/**
 * Get label for transaction category
 */
function getCategoryLabel(category: ChargeCategory): string {
  switch (category) {
    case 'AI_USAGE':
      return 'AI Usage'
    case 'SMS':
      return 'SMS'
    case 'EMAIL':
      return 'Email'
    case 'STORAGE':
      return 'Storage'
    case 'MANUAL_TOP_UP':
      return 'Manual Top-up'
    case 'AUTO_TOP_UP':
      return 'Auto Top-up'
    case 'FREE_CREDIT':
      return 'Free Credit'
    case 'REFUND':
      return 'Refund'
    case 'API_CALLS':
      return 'API Calls'
    default:
      return 'Other'
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WalletTransactionsTable({
  transactions,
  isLoading,
  isFetching,
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
}: WalletTransactionsTableProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])

  // Define columns
  const columns: ColumnDef<WalletTransaction>[] = useMemo(
    () => [
      {
        header: 'Date',
        accessorKey: 'createdAt',
        cell: ({ row }) => {
          const date = new Date(row.original.createdAt)
          return (
            <div className="text-sm">
              <div className="font-medium">
                {format(date, 'MMM d, yyyy')}
              </div>
              <div className="text-muted-foreground text-xs">
                {format(date, 'h:mm a')}
              </div>
            </div>
          )
        },
        size: 140,
      },
      {
        header: 'Type',
        accessorKey: 'type',
        cell: ({ row }) => {
          const type = row.original.type
          const isTopUp = type === 'TOP_UP'
          const isRefund = type === 'REFUND'

          return (
            <Badge
              variant="secondary"
              className={cn(
                'text-xs font-medium',
                isTopUp && 'bg-emerald-500/10 text-emerald-500',
                isRefund && 'bg-blue-500/10 text-blue-500',
                type === 'CHARGE' && 'bg-orange-500/10 text-orange-500'
              )}
            >
              {isTopUp && <ArrowUpCircle className="h-3 w-3 mr-1" />}
              {isRefund && <RefreshCw className="h-3 w-3 mr-1" />}
              {type === 'CHARGE' && <ArrowDownCircle className="h-3 w-3 mr-1" />}
              {type.replace('_', ' ')}
            </Badge>
          )
        },
        size: 120,
      },
      {
        header: 'Category',
        accessorKey: 'category',
        cell: ({ row }) => {
          const category = row.original.category
          return (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {getCategoryIcon(category)}
              </span>
              <span>{getCategoryLabel(category)}</span>
            </div>
          )
        },
        size: 140,
      },
      {
        header: 'Description',
        accessorKey: 'description',
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground truncate max-w-[200px]">
            {row.original.description}
          </div>
        ),
        size: 200,
      },
      {
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) => {
          const amount = row.original.amount
          const isPositive = amount > 0

          return (
            <div
              className={cn(
                'text-sm font-semibold tabular-nums',
                isPositive ? 'text-emerald-500' : 'text-foreground'
              )}
            >
              {formatAmount(amount, row.original.currency)}
            </div>
          )
        },
        size: 120,
      },
      {
        header: 'Balance',
        accessorKey: 'balanceAfter',
        cell: ({ row }) => {
          const balance = row.original.balanceAfter
          const isNegative = balance < 0

          return (
            <div
              className={cn(
                'text-sm tabular-nums',
                isNegative ? 'text-red-500' : 'text-muted-foreground'
              )}
            >
              {/* Running balance — no +/- sign, just the amount */}
              {formatWalletAmount(balance, row.original.currency)}
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

          return (
            <Badge
              variant="secondary"
              className={cn(
                'text-xs',
                status === 'COMPLETED' && 'bg-emerald-500/10 text-emerald-500',
                status === 'PENDING' && 'bg-amber-500/10 text-amber-500',
                status === 'FAILED' && 'bg-red-500/10 text-red-500'
              )}
            >
              {status}
            </Badge>
          )
        },
        size: 100,
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
    getRowId: (row) => row.id,
    state: {
      sorting,
    },
    manualPagination: true,
    pageCount: totalPages,
  })

  return (
    <div className="flex flex-col">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 pb-4 shrink-0">
        {/* Search filter */}
        <div className="relative">
          <Input
            id={`${id}-input`}
            ref={inputRef}
            className={cn('peer min-w-60 ps-9', Boolean(search) && 'pe-9')}
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
                inputRef.current?.focus()
              }}
            >
              <CircleXIcon size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Type filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <FilterIcon className="-ms-1 opacity-60" size={16} aria-hidden="true" />
              Type
              {typeFilter !== undefined && (
                <span className="-me-1 inline-flex h-5 max-h-full items-center rounded border bg-background px-1 font-[inherit] text-[0.625rem] font-medium text-muted-foreground/70">
                  1
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto min-w-36 p-3" align="start">
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">
                Filter by Type
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-type-all`}
                    checked={typeFilter === undefined}
                    onCheckedChange={() => onTypeFilterChange(undefined)}
                  />
                  <Label htmlFor={`${id}-type-all`} className="font-normal">
                    All
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-type-topup`}
                    checked={typeFilter === 'TOP_UP'}
                    onCheckedChange={() =>
                      onTypeFilterChange(typeFilter === 'TOP_UP' ? undefined : 'TOP_UP')
                    }
                  />
                  <Label htmlFor={`${id}-type-topup`} className="font-normal">
                    Top-ups
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-type-charge`}
                    checked={typeFilter === 'CHARGE'}
                    onCheckedChange={() =>
                      onTypeFilterChange(typeFilter === 'CHARGE' ? undefined : 'CHARGE')
                    }
                  />
                  <Label htmlFor={`${id}-type-charge`} className="font-normal">
                    Charges
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-type-refund`}
                    checked={typeFilter === 'REFUND'}
                    onCheckedChange={() =>
                      onTypeFilterChange(typeFilter === 'REFUND' ? undefined : 'REFUND')
                    }
                  />
                  <Label htmlFor={`${id}-type-refund`} className="font-normal">
                    Refunds
                  </Label>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border bg-background">
        <div className="max-h-[400px] overflow-auto">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-muted bg-background">
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
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: <ChevronUpIcon className="shrink-0 opacity-60" size={16} />,
                            desc: <ChevronDownIcon className="shrink-0 opacity-60" size={16} />,
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Loading skeleton rows
                [...Array(5)].map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-14 bg-muted animate-pulse rounded" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
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
                    No transactions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
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
              <SelectTrigger id="page-size" className="h-8 w-17">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="50">50</SelectItem>
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
