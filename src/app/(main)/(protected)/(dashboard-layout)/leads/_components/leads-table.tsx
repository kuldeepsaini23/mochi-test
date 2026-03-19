/**
 * Leads Table Component
 * Enhanced table with smart shrinkable columns and bulk operations
 * Columns: Avatar+Name, Email, Phone, Location (emoji), Assigned (avatar), Tags, CLTV, Activity
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
  HelpCircleIcon,
  ListFilterIcon,
  Trash2Icon,
  EyeIcon,
  EyeOffIcon,
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
import { cn } from '@/lib/utils'
import {
  getLeadInitials,
  getLeadDisplayName,
  formatCLTV,
  getLeadAvatarColor,
  formatRelativeTime,
  formatStatus,
} from '@/lib/utils/lead-helpers'
import {
  getConsistentColor,
  getTextColorForBackground,
  getStatusColor,
} from '@/constants/colors'
import { getCountryFlag, getCountryName } from '@/constants/countries'
import type { LeadStatus } from '@/generated/prisma'

// Lead type from our API (dates are serialized as ISO strings from tRPC)
export interface LeadWithRelations {
  id: string
  organizationId: string
  firstName: string | null
  lastName: string | null
  fullName: string
  email: string
  phone: string | null
  avatarUrl: string | null
  location: string
  locationCode: string
  source: string | null
  address: string | null
  address2: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  country: string | null
  cltv: number
  status: LeadStatus
  assignedToId: string | null
  assignedTo: {
    id: string
    name: string
    email: string
    image: string | null
  } | null
  tags: {
    id: string
    name: string
    color: string
  }[]
  lastActivityAt: string
  createdAt: string
  updatedAt: string
}

interface LeadsTableProps {
  leads: LeadWithRelations[]
  totalLeads: number
  searchQuery: string
  onSearchChange: (query: string) => void
  statusFilter: LeadStatus[]
  onStatusFilterChange: (statuses: LeadStatus[]) => void
  statusCounts: Record<string, number>
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onLeadClick: (lead: LeadWithRelations) => void
  onBulkDelete?: (ids: string[]) => void
  isDeleting?: boolean
  isLoading?: boolean
  canDelete?: boolean
}

export function LeadsTable({
  leads,
  totalLeads,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  onLeadClick,
  onBulkDelete,
  isDeleting,
  isLoading,
  canDelete = true,
}: LeadsTableProps) {
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
  const [showAllTags, setShowAllTags] = useState(true)

  // Status options
  const statusOptions: LeadStatus[] = ['LEAD', 'PROSPECT', 'ACTIVE', 'INACTIVE']

  // Define columns
  const columns: ColumnDef<LeadWithRelations>[] = useMemo(
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
        header: 'Contact',
        accessorKey: 'name',
        cell: ({ row }) => {
          const avatarBg = getLeadAvatarColor(row.original.id, row.original.fullName)
          const avatarText = getTextColorForBackground(avatarBg)
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage
                  src={row.original.avatarUrl || undefined}
                  alt={getLeadDisplayName(row.original.fullName)}
                />
                <AvatarFallback
                  className="text-xs font-medium"
                  style={{ backgroundColor: avatarBg, color: avatarText }}
                >
                  {getLeadInitials(row.original.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="font-medium min-w-0 truncate">
                {getLeadDisplayName(row.original.fullName)}
              </div>
            </div>
          )
        },
        size: 200,
        enableHiding: false,
      },
      {
        header: 'Email',
        accessorKey: 'email',
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground truncate">{row.getValue('email')}</div>
        ),
        size: 240,
      },
      {
        header: 'Phone',
        accessorKey: 'phone',
        cell: ({ row }) => (
          <div className="text-sm truncate">{row.getValue('phone') || '—'}</div>
        ),
        size: 160,
      },
      {
        header: 'Location',
        accessorKey: 'country',
        cell: ({ row }) => {
          const countryCode = row.original.country
          // Build location display name from city, state, and country
          const parts = [
            row.original.city,
            row.original.state,
            countryCode ? getCountryName(countryCode) : null,
          ].filter(Boolean)
          const locationDisplay = parts.length > 0 ? parts.join(', ') : 'Unknown'

          return (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center cursor-help">
                    <span className="text-xl leading-none">
                      {getCountryFlag(countryCode || '')}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{locationDisplay}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        size: 80,
      },
      {
        header: 'Assigned',
        accessorKey: 'assignedTo',
        cell: ({ row }) => {
          const assignedTo = row.original.assignedTo
          if (!assignedTo) {
            return (
              <div className="flex items-center justify-center">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">—</span>
                </div>
              </div>
            )
          }
          const assignedBg = getConsistentColor(assignedTo.name)
          const assignedText = getTextColorForBackground(assignedBg)
          const initials = assignedTo.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)

          return (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center cursor-help">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={assignedTo.image || undefined} alt={assignedTo.name} />
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={{ backgroundColor: assignedBg, color: assignedText }}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-0.5">
                    <p className="font-medium text-xs">{assignedTo.name}</p>
                    <p className="text-xs text-muted-foreground">{assignedTo.email}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        size: 100,
      },
      {
        header: () => (
          <div className="flex items-center gap-2">
            <span>Tags</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowAllTags(!showAllTags)
              }}
              className="hover:text-foreground transition-colors"
            >
              {showAllTags ? (
                <EyeIcon className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <EyeOffIcon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
        ),
        accessorKey: 'tags',
        cell: ({ row }) => {
          const tags = row.original.tags

          if (tags.length === 0) {
            return <span className="text-xs text-muted-foreground">—</span>
          }

          // If showAllTags is false, just show count
          if (!showAllTags) {
            return (
              <span className="text-xs text-muted-foreground">
                ({tags.length} {tags.length === 1 ? 'Tag' : 'Tags'})
              </span>
            )
          }

          // Show all tags wrapped
          return (
            <div className="flex flex-wrap items-center gap-1">
              {tags.map((tag) => {
                const textColor = getTextColorForBackground(tag.color)
                return (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-xs px-1.5 py-0 font-medium border-0"
                    style={{ backgroundColor: tag.color, color: textColor }}
                  >
                    {tag.name}
                  </Badge>
                )
              })}
            </div>
          )
        },
        size: 180,
      },
      {
        header: () => (
          <div className="flex items-center gap-1">
            <span>CLTV</span>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircleIcon className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-semibold text-xs">Customer Lifetime Value</p>
                    <p className="text-xs text-muted-foreground">
                      The total revenue generated from this contact over their entire relationship
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ),
        accessorKey: 'cltv',
        cell: ({ row }) => {
          const amount = row.getValue('cltv') as number
          return <div className="font-medium">{formatCLTV(amount)}</div>
        },
        size: 120,
      },
      {
        header: 'Activity',
        accessorKey: 'lastActivityAt',
        cell: ({ row }) => {
          const lastActivityAt = row.getValue('lastActivityAt') as Date
          const relativeTime = formatRelativeTime(lastActivityAt)

          return (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-sm text-muted-foreground cursor-help truncate">
                    {relativeTime}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {new Date(lastActivityAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        size: 140,
      },
    ],
    [showAllTags]
  )

  const table = useReactTable({
    data: leads,
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

  const handleStatusChange = (checked: boolean, value: LeadStatus) => {
    const newFilter = checked
      ? [...statusFilter, value]
      : statusFilter.filter((s) => s !== value)
    onStatusFilterChange(newFilter)
  }

  // Get selected row count
  const selectedCount = Object.keys(rowSelection).length

  // Handle bulk delete
  const handleBulkDelete = () => {
    const selectedIds = Object.keys(rowSelection)
    if (selectedIds.length > 0 && onBulkDelete) {
      onBulkDelete(selectedIds)
      setRowSelection({})
    }
  }

  return (
    <div className="flex flex-col">
      {/* Filters and Bulk Actions - Fixed at top */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Filter by name, email, phone, location */}
          <div className="relative">
            <Input
              id={`${id}-input`}
              ref={inputRef}
              className={cn(
                'peer min-w-60 ps-9',
                Boolean(searchQuery) && 'pe-9'
              )}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search leads..."
              type="text"
              aria-label="Search leads"
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
            <PopoverContent className="w-auto min-w-36 p-3" align="start">
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Filter by Status
                </div>
                <div className="space-y-3">
                  {statusOptions.map((value, i) => (
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
                        {formatStatus(value)}{' '}
                        <span className="ms-2 text-xs text-muted-foreground">
                          {statusCounts[value] || 0}
                        </span>
                      </Label>
                    </div>
                  ))}
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
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table - Scrollable area */}
      <div className="overflow-hidden rounded-md border bg-background">
        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
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
                      <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
                      <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                    </div>
                  </TableCell>
                  <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-5 w-5 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-8 w-8 bg-muted animate-pulse rounded-full" /></TableCell>
                  <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded" /></TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="cursor-pointer"
                  onClick={() => onLeadClick(row.original)}
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
                  No leads found.
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
            Showing {leads.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-
            {Math.min(currentPage * pageSize, totalLeads)} of {totalLeads} leads
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
