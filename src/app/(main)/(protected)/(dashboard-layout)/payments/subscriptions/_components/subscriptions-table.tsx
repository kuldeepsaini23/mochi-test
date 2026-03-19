/**
 * Subscriptions Table Component
 *
 * Displays recurring transactions in a subscription-focused layout.
 * Reuses the same data model (TransactionWithRelations) but shows
 * subscription-specific columns: trial info, interval pricing, subscription status.
 *
 * Follows the exact same architecture as transactions-table.tsx:
 * - TanStack Table with manual pagination
 * - Status filter popover
 * - Column visibility toggle
 * - Search input with debounce
 *
 * SOURCE OF TRUTH KEYWORDS: SubscriptionsTable, TransactionWithRelations
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  getStatusDisplay,
  formatDate,
  getCustomerDisplayName,
  getCustomerInitials,
} from '../../transactions/_components/utils'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import type { TransactionPaymentStatus } from '@/generated/prisma'
import type { TransactionWithRelations } from '@/types/transaction'

interface SubscriptionsTableProps {
  subscriptions: TransactionWithRelations[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  statusFilter: TransactionPaymentStatus[]
  onStatusFilterChange: (statuses: TransactionPaymentStatus[]) => void
  statusCounts: Record<string, number>
  /** Which statuses to show in the filter popover (subscription-relevant only) */
  availableStatuses: TransactionPaymentStatus[]
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onSubscriptionClick: (transaction: TransactionWithRelations) => void
}

/**
 * Maps interval values to display suffixes for recurring pricing.
 * SOURCE OF TRUTH: IntervalSuffixMap
 */
function getIntervalSuffix(interval: string | null): string {
  switch (interval) {
    case 'MONTH':
      return '/mo'
    case 'YEAR':
      return '/yr'
    case 'WEEK':
      return '/wk'
    case 'DAY':
      return '/day'
    default:
      return ''
  }
}

/**
 * Formats trial info for display.
 * Shows "X-day trial" with end date if available.
 */
function formatTrialInfo(
  trialDays: number | null,
  trialEndsAt: Date | string | null
): string | null {
  if (!trialDays || trialDays <= 0) return null

  if (trialEndsAt) {
    const endDate = new Date(trialEndsAt)
    const now = new Date()

    /** If trial has ended, show "Ended" with date */
    if (endDate < now) {
      return `${trialDays}-day trial (ended ${formatDate(endDate)})`
    }

    /** Active trial — show when it ends */
    return `${trialDays}-day trial (ends ${formatDate(endDate)})`
  }

  return `${trialDays}-day trial`
}

export function SubscriptionsTable({
  subscriptions,
  isLoading,
  isFetching,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  availableStatuses,
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  onSubscriptionClick,
}: SubscriptionsTableProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])

  /**
   * Column definitions for the subscriptions table.
   * Tailored for subscription management with trial, interval, and status columns.
   */
  const columns: ColumnDef<TransactionWithRelations>[] = useMemo(
    () => [
      /**
       * Customer column — avatar, name, and email from the linked lead.
       * Same pattern as transactions table.
       */
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
      /**
       * Product(s) column — shows the first RECURRING product with image and price name.
       * Filters out ONE_TIME items since they are not part of the subscription itself
       * (they were bundled on the first invoice by Stripe in mixed-cart checkouts).
       * Additional recurring items shown as "+N more".
       */
      {
        header: 'Product(s)',
        accessorKey: 'items',
        cell: ({ row }) => {
          /** Only show recurring/split items — ONE_TIME items don't belong on the subscriptions tab */
          const recurringItems = row.original.items.filter(
            (item) => item.billingType !== 'ONE_TIME'
          )
          if (recurringItems.length === 0) {
            return <span className="text-sm text-muted-foreground">No items</span>
          }

          const firstItem = recurringItems[0]
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
                  {recurringItems.length > 1 && (
                    <span className="ml-1">+{recurringItems.length - 1} more</span>
                  )}
                </div>
              </div>
            </div>
          )
        },
        size: 200,
      },
      /**
       * Amount column — shows the recurring price with interval suffix (e.g. $29.99/mo).
       * Only sums recurring/split items — ONE_TIME items are excluded because they
       * were one-off charges on the first invoice, not part of the recurring amount.
       * Interval is derived from the first recurring item.
       */
      {
        header: 'Amount',
        accessorKey: 'originalAmount',
        cell: ({ row }) => {
          const { currency } = row.original
          /** Sum only recurring items to get the true subscription amount */
          const recurringItems = row.original.items.filter(
            (item) => item.billingType !== 'ONE_TIME'
          )
          const recurringAmount = recurringItems.reduce(
            (sum, item) => sum + item.totalAmount, 0
          )
          const firstRecurringItem = recurringItems[0]
          const intervalSuffix = firstRecurringItem
            ? getIntervalSuffix(firstRecurringItem.interval)
            : ''

          return (
            <div className="font-medium">
              {formatCurrency(recurringAmount, currency)}
              {intervalSuffix && (
                <span className="text-xs text-muted-foreground font-normal">
                  {intervalSuffix}
                </span>
              )}
            </div>
          )
        },
        size: 120,
      },
      /**
       * Status column — subscription lifecycle status with color-coded badges.
       * Focused on subscription states: ACTIVE, TRIALING, CANCELED, FAILED, DISPUTED.
       */
      {
        header: 'Status',
        accessorKey: 'paymentStatus',
        cell: ({ row }) => {
          const { paymentStatus } = row.original
          const { label, color, bgColor, icon } = getStatusDisplay(paymentStatus)

          /** Render the appropriate status icon based on the icon key */
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
            <Badge
              variant="secondary"
              className={cn('text-xs font-medium gap-1 w-fit', bgColor, color)}
            >
              <StatusIcon />
              {label}
            </Badge>
          )
        },
        size: 150,
      },
      /**
       * Trial column — shows trial duration and end date if applicable.
       * Only rendered when the transaction has trialDays > 0.
       */
      {
        header: 'Trial',
        accessorKey: 'trialDays',
        cell: ({ row }) => {
          const { trialDays, trialEndsAt } = row.original
          const trialInfo = formatTrialInfo(trialDays, trialEndsAt)

          if (!trialInfo) {
            return <span className="text-sm text-muted-foreground">—</span>
          }

          return (
            <div className="text-sm text-muted-foreground">{trialInfo}</div>
          )
        },
        size: 160,
      },
      /**
       * Started column — when the subscription was created.
       */
      {
        header: 'Started',
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
      /**
       * Actions column — link arrow to navigate to transaction detail page.
       */
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
    data: subscriptions,
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
   * Handle status filter checkbox changes.
   * Adds or removes a status from the active filter array.
   */
  const handleStatusChange = (checked: boolean, value: TransactionPaymentStatus) => {
    const newFilter = checked
      ? [...statusFilter, value]
      : statusFilter.filter((s) => s !== value)
    onStatusFilterChange(newFilter)
  }

  return (
    <div className="flex flex-col">
      {/* Filters — search, status filter, column visibility toggle */}
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
              placeholder="Search subscriptions..."
              type="text"
              aria-label="Search subscriptions"
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

          {/* Filter by subscription status */}
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
                  {availableStatuses.map((value, i) => {
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

      {/* Table — scrollable area with sticky header */}
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
                /* Loading skeleton rows matching the subscription column layout */
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
                      <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="h-5 w-24 bg-muted animate-pulse rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 bg-muted animate-pulse rounded" />
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
                    onClick={() => onSubscriptionClick(row.original)}
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
                    No subscriptions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination — page size selector, result count, and navigation buttons */}
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
            Showing {subscriptions.length > 0 ? (page - 1) * pageSize + 1 : 0}-
            {Math.min(page * pageSize, total)} of {total} subscriptions
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
