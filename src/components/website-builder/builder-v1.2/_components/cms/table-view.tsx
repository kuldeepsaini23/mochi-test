/**
 * ============================================================================
 * TABLE VIEW - CMS Data Grid with Sheet-Based Row Editing
 * ============================================================================
 *
 * Compact, spreadsheet-style data grid with row-click-to-edit via CmsRowSheet.
 * Matches the builder's dense UI style with proper pagination controls.
 *
 * KEY FEATURES:
 * - Click any row to open the CmsRowSheet for editing
 * - Page size selector (10, 20, 30, 50, 100)
 * - "Showing X-Y of Z rows" format
 * - Type-aware cell rendering (read-only in the grid)
 * - Server-side pagination, sorting, search
 * - Bulk row selection and delete
 *
 * ROW EDITING:
 * - Click a row to open CmsRowSheet (slide-in panel from right)
 * - Sheet handles create and edit modes
 * - Dirty tracking with discard confirmation
 *
 * ============================================================================
 */

'use client'

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
} from 'react'

// ============================================================================
// DEBOUNCE HOOK - Delays value updates for performance
// ============================================================================

/**
 * Custom hook for debouncing a value.
 * Returns the debounced value after the specified delay.
 * Used for search input to prevent excessive API calls.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
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
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Trash2,
  Search,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronFirst,
  ChevronLast,
  Columns3,
  Pencil,
  AlertTriangle,
  Copy,
  Lock,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Skeleton } from '@/components/ui/skeleton'
import { format, parseISO } from 'date-fns'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { ColumnEditor } from './column-editor'
import { CmsRowSheet } from './cms-row-sheet'
import { ColumnTypeIcon } from './column-type-icon'
import { parseCmsColorValue } from './cms-field-renderers'
import type { CmsColumn, CmsColumnType, CmsRow, CmsTable } from './types'
import { gradientConfigToCSS } from '../../_lib/gradient-utils'
import { ContentPreview } from '@/components/editor/content-preview'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Page size options for pagination dropdown */
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const

interface TableViewProps {
  table: CmsTable
  organizationId: string
  /**
   * When true, the table is a system table (synced from an ecommerce store).
   * System tables allow custom column CRUD and editing custom column values,
   * but block row creation/deletion (rows are store-synced).
   */
  isSystemTable?: boolean
}

/**
 * CMS data grid with sheet-based row editing and proper pagination.
 * Click any row to open CmsRowSheet for editing. Uses tRPC for all data operations.
 */
export function TableView({
  table,
  organizationId,
  isSystemTable = false,
}: TableViewProps) {
  /**
   * Granular permission flags derived from isSystemTable.
   * System tables allow column/cell editing but block row creation/deletion
   * since rows are synced from the ecommerce store.
   */
  const isRowCreationBlocked = isSystemTable
  const isRowDeletionBlocked = isSystemTable
  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(20)

  // Search input with proper debouncing (300ms delay)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  // Table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  // Sheet state for CmsRowSheet — null row = create mode, CmsRow = edit mode
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [sheetRow, setSheetRow] = useState<CmsRow | null>(null)

  // Modal states
  const [showColumnEditor, setShowColumnEditor] = useState(false)
  const [editingColumn, setEditingColumn] = useState<CmsColumn | null>(null)
  const [deletingRowIds, setDeletingRowIds] = useState<string[]>([])
  const [deletingColumn, setDeletingColumn] = useState<CmsColumn | null>(null)

  // Reset page to 1 when search term changes (after debounce)
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Reset page when page size changes
  const handlePageSizeChange = useCallback((newSize: string) => {
    setPageSize(parseInt(newSize))
    setPage(1)
  }, [])

  // Fetch columns for this table
  const { data: columnsData, isLoading: isLoadingColumns } =
    trpc.cms.listColumns.useQuery({
      organizationId,
      tableId: table.id,
    })

  /**
   * Cast columns through unknown to avoid deep type instantiation errors.
   * This is a workaround for tRPC's complex inferred types.
   */
  const columns = useMemo(
    () => (columnsData as unknown as CmsColumn[]) ?? [],
    [columnsData],
  )

  // Fetch rows with pagination
  const {
    data: rowsData,
    isLoading: isLoadingRows,
    isFetching: isFetchingRows,
  } = trpc.cms.listRows.useQuery({
    organizationId,
    tableId: table.id,
    page,
    pageSize,
    search: debouncedSearch || undefined,
    sortBy: sorting[0]?.id,
    sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
  })

  const rows = rowsData?.rows ?? []
  const totalPages = rowsData?.totalPages ?? 1
  const total = rowsData?.total ?? 0

  /**
   * Check if this table's content is displayed on a published website.
   * When true, a banner informs the user that edits will update their live site.
   */
  const { data: isTableLive } = trpc.cms.isTableLive.useQuery(
    { organizationId, tableId: table.id },
    { staleTime: 60_000 },
  )

  // Calculate "Showing X-Y of Z" values
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo = Math.min(page * pageSize, total)

  const utils = trpc.useUtils()

  // ============================================================================
  // BULK DELETE MUTATION
  // ============================================================================

  const bulkDelete = trpc.cms.bulkDeleteRows.useMutation({
    onMutate: async ({ rowIds }) => {
      await utils.cms.listRows.cancel()
      const previous = utils.cms.listRows.getData({
        organizationId,
        tableId: table.id,
        page,
        pageSize,
      })
      utils.cms.listRows.setData(
        { organizationId, tableId: table.id, page, pageSize },
        (old) =>
          old
            ? {
                ...old,
                rows: old.rows.filter((r) => !rowIds.includes(r.id)),
                total: old.total - rowIds.length,
              }
            : old,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        utils.cms.listRows.setData(
          { organizationId, tableId: table.id, page, pageSize },
          context.previous,
        )
      }
    },
    onSuccess: () => {
      setRowSelection({})
      setDeletingRowIds([])
    },
    onSettled: () => {
      utils.cms.listRows.invalidate({ organizationId, tableId: table.id })
      utils.cms.listTables.invalidate({ organizationId })
    },
  })

  const handleBulkDeleteConfirm = useCallback(() => {
    if (deletingRowIds.length === 0) return
    bulkDelete.mutate({
      organizationId,
      tableId: table.id,
      rowIds: deletingRowIds,
    })
  }, [deletingRowIds, bulkDelete, organizationId, table.id])

  // ============================================================================
  // DUPLICATE ROW MUTATION - Creates a copy of an existing row
  // ============================================================================

  /**
   * Mutation for duplicating a row.
   * Uses optimistic UI to immediately show the duplicated row in the table
   * while the server request is pending. Rolls back on error.
   */
  const duplicateRow = trpc.cms.createRow.useMutation({
    onMutate: async ({ values }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await utils.cms.listRows.cancel()

      // Snapshot the current data for potential rollback
      const previous = utils.cms.listRows.getData({
        organizationId,
        tableId: table.id,
        page,
        pageSize,
        search: debouncedSearch || undefined,
        sortBy: sorting[0]?.id,
        sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
      })

      // Create an optimistic row with a temporary ID
      // Order is set to 0 since it will be first in the list, server will assign real order
      const optimisticRow: CmsRow = {
        id: `temp-${Date.now()}`,
        tableId: table.id,
        values: values as Record<string, unknown>,
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Optimistically add the duplicated row to the list
      utils.cms.listRows.setData(
        {
          organizationId,
          tableId: table.id,
          page,
          pageSize,
          search: debouncedSearch || undefined,
          sortBy: sorting[0]?.id,
          sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
        },
        (old) =>
          old
            ? {
                ...old,
                rows: [optimisticRow, ...old.rows],
                total: old.total + 1,
              }
            : old,
      )

      return { previous }
    },
    onError: (err, _vars, context) => {
      // Roll back to the snapshot on error
      if (context?.previous) {
        utils.cms.listRows.setData(
          {
            organizationId,
            tableId: table.id,
            page,
            pageSize,
            search: debouncedSearch || undefined,
            sortBy: sorting[0]?.id,
            sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
          },
          context.previous,
        )
      }
      toast.error(err.message || 'Failed to duplicate row')
    },
    onSettled: () => {
      // Refetch to get the real row data from server
      utils.cms.listRows.invalidate({ organizationId, tableId: table.id })
      utils.cms.listTables.invalidate({ organizationId })
    },
  })

  /**
   * Handle row duplication.
   * Copies all editable values from the source row and creates a new row.
   * System columns (DATE_CREATED, DATE_UPDATED) are auto-generated by the server.
   */
  const handleDuplicateRow = useCallback(
    (row: CmsRow) => {
      // Filter out system columns - they will be auto-generated for the new row
      const valuesToDuplicate: Record<string, unknown> = {}
      for (const col of columns) {
        if (
          col.columnType === 'DATE_CREATED' ||
          col.columnType === 'DATE_UPDATED'
        ) {
          continue
        }
        if (row.values[col.slug] !== undefined) {
          valuesToDuplicate[col.slug] = row.values[col.slug]
        }
      }

      // Let the server calculate the order value (max + 1) to prevent
      // integer overflow — Date.now() exceeds PostgreSQL's Int max (~2.1B).
      // Server uses max(order) + 1 which ensures unique, safe ordering.
      duplicateRow.mutate({
        organizationId,
        tableId: table.id,
        values: valuesToDuplicate,
      })
    },
    [columns, duplicateRow, organizationId, table.id],
  )

  // ============================================================================
  // DELETE COLUMN MUTATION
  // ============================================================================

  /**
   * Mutation for deleting a column.
   * Immediately invalidates caches on success for instant UI update.
   * WARNING: This permanently deletes all data for this column in all rows.
   */
  const deleteColumnMutation = trpc.cms.deleteColumn.useMutation({
    onSuccess: () => {
      setDeletingColumn(null)
      // Refetch to ensure consistency
      utils.cms.listColumns.invalidate({ organizationId, tableId: table.id })
      utils.cms.listRows.invalidate({ organizationId, tableId: table.id })
      utils.cms.listTables.invalidate({ organizationId })
    },
  })

  /**
   * Handle column delete confirmation.
   * Called when user confirms the delete action.
   */
  const handleDeleteColumnConfirm = useCallback(() => {
    if (!deletingColumn) return
    deleteColumnMutation.mutate({
      organizationId,
      columnId: deletingColumn.id,
    })
  }, [deletingColumn, deleteColumnMutation, organizationId])

  // ============================================================================
  // TABLE COLUMNS DEFINITION
  // ============================================================================

  /**
   * Build table columns dynamically from CMS schema.
   * Includes selection checkbox, read-only data columns, and row actions.
   */
  const tableColumns = useMemo<ColumnDef<CmsRow>[]>(() => {
    if (!columns.length) return []

    const cols: ColumnDef<CmsRow>[] = []

    // Selection checkbox column — only show when row deletion is allowed (selection is for bulk delete)
    if (!isRowDeletionBlocked) {
      cols.push({
        id: 'select',
        header: ({ table: t }) => (
          <Checkbox
            checked={
              t.getIsAllPageRowsSelected() ||
              (t.getIsSomePageRowsSelected() ? 'indeterminate' : undefined)
            }
            onCheckedChange={(value) => t.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            className="h-3.5 w-3.5"
          />
        ),
        cell: ({ row }) => (
          /* stopPropagation prevents the row click from opening the sheet */
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              className="h-3.5 w-3.5"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 32,
      })
    }

    // Data columns from CMS schema — rendered as read-only cells in the grid
    for (const column of columns) {
      /**
       * Hide internal columns for system store tables (read-only).
       * - options.internal flag: new stores mark internal columns (stripe_price_id, etc.)
       * - Slug blocklist: existing stores that predate the options.internal flag
       * - Allowlist: inventory_quantity and in_stock are always shown even if they
       *   have options.internal from older store table definitions.
       */
      const alwaysVisibleSlugs = ['inventory_quantity', 'in_stock']
      if (
        isSystemTable &&
        !alwaysVisibleSlugs.includes(column.slug) &&
        ((column.options as Record<string, unknown> | null)?.internal ||
          [
            'currency',
            'billing_type',
            'billing_interval',
            'interval_count',
          ].includes(column.slug))
      )
        continue

      // Check if this column is protected (system columns cannot be edited/deleted)
      const isProtectedColumn = column.isSystem === true

      cols.push({
        id: column.slug,
        accessorFn: (row) => row.values[column.slug],
        header: ({ column: col }) => (
          <div className="flex items-center gap-1 group/header">
            {/* Sort button - clicking sorts the column */}
            <button
              className="flex items-center gap-1.5 hover:text-foreground/90 transition-colors text-left flex-1 min-w-0"
              onClick={() => col.toggleSorting(col.getIsSorted() === 'asc')}
            >
              <ColumnTypeIcon
                type={column.columnType}
                className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/50"
              />
              <span className="truncate text-[11px] font-semibold">
                {column.name}
              </span>
              {/* Lock icon for protected system columns on system tables */}
              {isProtectedColumn && isSystemTable && (
                <Lock className="w-3 h-3 flex-shrink-0 text-muted-foreground/40" />
              )}
              {col.getIsSorted() === 'asc' ? (
                <ChevronUp className="w-3 h-3 flex-shrink-0 text-foreground/70" />
              ) : col.getIsSorted() === 'desc' ? (
                <ChevronDown className="w-3 h-3 flex-shrink-0 text-foreground/70" />
              ) : (
                <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-0 group-hover/header:opacity-30 transition-opacity" />
              )}
            </button>

            {/* Column actions dropdown — show for custom (non-protected) columns, even on system tables */}
            {!isProtectedColumn && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 opacity-0 group-hover/header:opacity-100 transition-all">
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-36"
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingColumn(column)
                      setShowColumnEditor(true)
                    }}
                    className="text-xs gap-2"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Column
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeletingColumn(column)}
                    className="text-xs text-destructive focus:text-destructive gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Column
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ),
        /**
         * Cell renderer — all cells are read-only in the grid.
         * Clicking the row opens CmsRowSheet for editing.
         */
        cell: ({ getValue }) => (
          <ReadOnlyCell
            value={getValue()}
            columnType={column.columnType}
          />
        ),
        enableSorting: true,
      })
    }

    /**
     * Actions column (edit, duplicate, delete).
     * Always shown — system tables only get "Edit Row" (no duplicate/delete since rows are store-synced).
     */
    cols.push({
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        /* stopPropagation prevents the row click from opening the sheet */
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-32"
            >
              <DropdownMenuItem
                onClick={() => {
                  setSheetRow(row.original)
                  setIsSheetOpen(true)
                }}
                className="text-xs gap-2"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Row
              </DropdownMenuItem>
              {/* Duplicate and delete are blocked on system tables (rows are store-synced) */}
              {!isRowDeletionBlocked && (
                <>
                  <DropdownMenuItem
                    onClick={() => handleDuplicateRow(row.original)}
                    className="text-xs gap-2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeletingRowIds([row.original.id])}
                    className="text-xs text-destructive focus:text-destructive gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    })

    return cols
  }, [
    columns,
    handleDuplicateRow,
    isSystemTable,
    isRowCreationBlocked,
    isRowDeletionBlocked,
  ])

  // React Table instance
  const reactTable = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, columnVisibility, rowSelection },
    enableRowSelection: !isRowDeletionBlocked,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
  })

  const selectedCount = Object.values(rowSelection).filter(Boolean).length
  const isLoading = isLoadingColumns || isLoadingRows

  return (
    /* Grid layout ensures toolbar width is independent of table content width.
     * Conditional grid rows — when banner is hidden, 3 rows (toolbar + table + footer);
     * when banner is shown, 4 rows. This prevents grid children from shifting into
     * wrong rows (e.g. table landing in an auto row instead of 1fr). */
    <div className={cn(
      "grid h-full w-full min-w-0 overflow-hidden",
      isTableLive
        ? "grid-rows-[auto_auto_1fr_auto]"
        : "grid-rows-[auto_1fr_auto]"
    )}>
      {/* Live Website Banner — shown when this table's data appears on a published site */}
      {isTableLive && (
        <div className="px-3 py-2 border-b border-blue-200/60 dark:border-blue-800/40 bg-blue-50/80 dark:bg-blue-950/30 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
          <Globe className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            This content is live on your website. Cached data takes time to propogate.
          </span>
        </div>
      )}

      {/* Toolbar - Clean, single row with refined spacing and muted tones */}
      {/* Grid constrains width to container; flex layout inside for item arrangement */}
      <div className="px-3 py-2 border-b border-border/60 flex items-center gap-3 bg-muted/20 min-w-0 overflow-hidden">
        {/* Search input with refined styling - fixed width, shrinks on small screens */}
        <div className="relative w-[180px] sm:w-[220px] flex-shrink min-w-0">
          {/* Show loading spinner when debouncing or fetching, search icon otherwise */}
          {search !== debouncedSearch || (isFetchingRows && !isLoading) ? (
            <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 animate-spin" />
          ) : (
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          )}
          <input
            type="text"
            placeholder="Search rows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs bg-background border border-border/60 rounded-md placeholder:text-muted-foreground/40 focus:outline-none focus:border-border focus:ring-1 focus:ring-ring/20 transition-colors"
          />
        </div>

        {/* Column visibility toggle - desktop only */}
        <div className="hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 px-2.5 text-xs flex items-center gap-1.5 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border transition-all">
                <Columns3 className="h-3.5 w-3.5" />
                <span>Columns</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44"
            >
              {columns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.slug}
                  checked={columnVisibility[col.slug] !== false}
                  onCheckedChange={(checked) =>
                    setColumnVisibility((prev) => ({
                      ...prev,
                      [col.slug]: checked,
                    }))
                  }
                  className="text-xs"
                >
                  {col.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Spacer pushes actions to right - flex-grow expands, shrink allows collapse, basis-0 starts at 0 */}
        <div className="flex-grow shrink basis-0" />

        {/* Bulk delete button — appears when rows selected and deletion is allowed */}
        {!isRowDeletionBlocked && selectedCount > 0 && (
          <button
            onClick={() =>
              setDeletingRowIds(
                rows
                  .filter((_, i) => rowSelection[i.toString()])
                  .map((r) => r.id),
              )
            }
            className="h-8 px-2.5 text-xs flex items-center gap-1.5 rounded-md border border-destructive/20 text-destructive/80 hover:text-destructive hover:bg-destructive/5 hover:border-destructive/30 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Delete</span>
            <span className="font-medium">({selectedCount})</span>
          </button>
        )}

        {/* Desktop: Separate action buttons — column creation always allowed, row creation gated */}
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => {
              setEditingColumn(null)
              setShowColumnEditor(true)
            }}
            className="h-8 px-2.5 text-xs flex items-center gap-1.5 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border transition-all"
          >
            <Columns3 className="h-3.5 w-3.5" />
            <span>Column</span>
          </button>
          {/* Add Row button — hidden when row creation is blocked (system tables) */}
          {!isRowCreationBlocked && (
            <button
              onClick={() => {
                setSheetRow(null)
                setIsSheetOpen(true)
              }}
              className="h-8 px-3 text-xs flex items-center gap-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Row</span>
            </button>
          )}
        </div>

        {/* Mobile: Compact dropdown for actions — always shown, row creation gated */}
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 px-3 text-xs flex items-center gap-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors font-medium">
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40"
            >
              {/* Add Row option — hidden when row creation is blocked (system tables) */}
              {!isRowCreationBlocked && (
                <DropdownMenuItem
                  onClick={() => {
                    setSheetRow(null)
                    setIsSheetOpen(true)
                  }}
                  className="text-xs gap-2"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Row
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  setEditingColumn(null)
                  setShowColumnEditor(true)
                }}
                className="text-xs gap-2"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Add Column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table content - scrolls both horizontally and vertically within bounds */}
      {/* Grid row takes 1fr; overflow-auto allows scrolling; min-w-0 prevents content from expanding container */}
      <div className="overflow-auto min-w-0">
        {isLoading ? (
          <TableViewSkeleton />
        ) : columns.length === 0 ? (
          /* No columns defined yet — show empty state without table headers */
          <EmptyTableState
            hasSearch={!!debouncedSearch}
            hasColumns={false}
            isReadOnly={isRowCreationBlocked}
            onAddRow={() => {
              setSheetRow(null)
              setIsSheetOpen(true)
            }}
            onAddColumn={() => {
              setEditingColumn(null)
              setShowColumnEditor(true)
            }}
          />
        ) : (
          <>
            {/* Always render the table with column headers when columns exist */}
            <Table className="w-full table-fixed">
              {/* Table header with refined muted styling */}
              <TableHeader className="sticky top-0 bg-muted/30 z-10">
                {reactTable.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="hover:bg-transparent border-none"
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{
                          width:
                            header.id === 'select'
                              ? 40
                              : header.id === 'actions'
                                ? 50
                                : 180,
                        }}
                        className="h-9 px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide whitespace-nowrap border-b border-border/40"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              {/* Table body — only render rows when they exist */}
              {rows.length > 0 && (
                <TableBody>
                  {reactTable.getRowModel().rows.map((row, index) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={cn(
                        'h-10 transition-colors',
                        row.getIsSelected()
                          ? 'bg-muted/50'
                          : index % 2 === 0
                            ? 'bg-transparent'
                            : 'bg-muted/10',
                        'hover:bg-muted/40',
                        'cursor-pointer',
                      )}
                      /* Always allow opening the row sheet — system tables can still edit custom column values */
                      onClick={() => {
                        setSheetRow(row.original)
                        setIsSheetOpen(true)
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className="px-3 py-1.5 border-b border-border/30 text-[13px] overflow-hidden"
                        >
                          <div className="truncate">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
            {/* Show empty state below the column headers when no rows exist */}
            {rows.length === 0 && (
              <EmptyTableState
                hasSearch={!!debouncedSearch}
                hasColumns={true}
                isReadOnly={isRowCreationBlocked}
                onAddRow={() => {
                  setSheetRow(null)
                  setIsSheetOpen(true)
                }}
                onAddColumn={() => {
                  setEditingColumn(null)
                  setShowColumnEditor(true)
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Pagination footer - Clean, muted design with clear hierarchy */}
      <div className="px-4 py-2.5 border-t border-border/40 flex-shrink-0 bg-muted/15 text-xs min-w-0 overflow-hidden">
        {/* Mobile: Stacked layout for better touch targets */}
        <div className="flex sm:hidden flex-col gap-3">
          {/* Top row: Page size + row count info */}
          <div className="flex items-center justify-between">
            <Select
              value={pageSize.toString()}
              onValueChange={handlePageSizeChange}
            >
              <SelectTrigger className="h-8 w-[70px] text-xs border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem
                    key={size}
                    value={size.toString()}
                    className="text-xs"
                  >
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground/70 text-[11px]">
              {showingFrom}-{showingTo} of {total}
            </span>
          </div>
          {/* Bottom row: Navigation with larger touch targets */}
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1 || isFetchingRows}
              className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronFirst className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetchingRows}
              className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-4 py-1 text-muted-foreground/80 font-medium tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isFetchingRows}
              className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages || isFetchingRows}
              className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLast className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Desktop: Single row, balanced layout */}
        <div className="hidden sm:flex items-center justify-between gap-6">
          {/* Left: Page size selector with label */}
          <div className="flex items-center gap-2.5">
            <span className="text-muted-foreground/60 text-[11px]">
              Rows per page
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={handlePageSizeChange}
            >
              <SelectTrigger className="h-7 w-[65px] text-xs border-border/50 bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem
                    key={size}
                    value={size.toString()}
                    className="text-xs"
                  >
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Center: Row count info - subtle */}
          <div className="text-muted-foreground/60 text-[11px]">
            Showing{' '}
            <span className="text-muted-foreground font-medium">
              {showingFrom}-{showingTo}
            </span>{' '}
            of{' '}
            <span className="text-muted-foreground font-medium">{total}</span>{' '}
            rows
          </div>

          {/* Right: Navigation controls - compact and refined */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1 || isFetchingRows}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              title="First page"
            >
              <ChevronFirst className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetchingRows}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2.5 text-muted-foreground/70 text-[11px] tabular-nums">
              <span className="font-medium text-muted-foreground">{page}</span>{' '}
              / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isFetchingRows}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages || isFetchingRows}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              title="Last page"
            >
              <ChevronLast className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Column Editor Modal */}
      <ColumnEditor
        isOpen={showColumnEditor}
        onClose={() => {
          setShowColumnEditor(false)
          setEditingColumn(null)
        }}
        tableId={table.id}
        organizationId={organizationId}
        column={editingColumn}
      />

      {/* CmsRowSheet — slides in from the right for row create/edit */}
      <CmsRowSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        tableId={table.id}
        organizationId={organizationId}
        columns={columns}
        row={sheetRow}
        isSystemTable={isSystemTable}
      />

      {/* Delete Row Confirmation */}
      <AlertDialog
        open={deletingRowIds.length > 0}
        onOpenChange={(open) => !open && setDeletingRowIds([])}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deletingRowIds.length === 1 ? 'Row' : 'Rows'}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will permanently delete {deletingRowIds.length}{' '}
                  {deletingRowIds.length === 1 ? 'row' : 'rows'}. This cannot be
                  undone.
                </p>
                {isTableLive && (
                  <p className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                    <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                    This will also update your published website.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Column Confirmation - Shows warning about data loss */}
      <AlertDialog
        open={!!deletingColumn}
        onOpenChange={(open) => !open && setDeletingColumn(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <AlertDialogTitle className="text-base">
                Delete "{deletingColumn?.name}" Column?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>This action cannot be undone. Deleting this column will:</p>
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>Permanently remove the column from this table</li>
                  <li>
                    <span className="text-destructive font-medium">
                      Delete all data
                    </span>{' '}
                    stored in this column across all {total}{' '}
                    {total === 1 ? 'row' : 'rows'}
                  </li>
                </ul>
                {isTableLive && (
                  <p className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-sm">
                    <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                    This will also update your published website.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteColumnMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteColumnConfirm}
              disabled={deleteColumnMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteColumnMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Column'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================================
// READ-ONLY CELL - Display-only cell renderer
// ============================================================================

interface ReadOnlyCellProps {
  value: unknown
  columnType: CmsColumnType
}

/**
 * Read-only cell renderer with type-aware formatting.
 * Uses muted, consistent styling across all cell types.
 */
function ReadOnlyCell({ value, columnType }: ReadOnlyCellProps) {
  // Empty value placeholder - subtle dash
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/30 text-[12px]">—</span>
  }

  switch (columnType) {
    case 'BOOLEAN':
      return (
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
            value
              ? 'bg-foreground/10 text-foreground/80'
              : 'bg-muted/60 text-muted-foreground/60',
          )}
        >
          {value ? 'Yes' : 'No'}
        </span>
      )

    case 'NUMBER':
      return (
        <span className="font-mono text-[12px] tabular-nums text-foreground/80">
          {typeof value === 'number' ? value.toLocaleString() : String(value)}
        </span>
      )

    case 'DATE':
      // User-entered dates are stored as YYYY-MM-DD strings
      // Parse and format them correctly to avoid timezone issues
      try {
        const dateStr = value as string
        // Parse the date string properly - for YYYY-MM-DD format, parse as local date
        const date = dateStr.includes('T')
          ? parseISO(dateStr)
          : new Date(dateStr + 'T00:00:00')
        return (
          <span className="text-[12px] text-muted-foreground/80 whitespace-nowrap">
            {format(date, 'MMM d, yyyy')}
          </span>
        )
      } catch {
        return (
          <span className="text-[12px] text-muted-foreground/60">
            {String(value)}
          </span>
        )
      }

    case 'DATE_CREATED':
    case 'DATE_UPDATED':
      // System timestamps are ISO strings with full datetime
      try {
        const date = parseISO(value as string)
        return (
          <span className="text-[12px] text-muted-foreground/80 whitespace-nowrap">
            {format(date, 'MMM d, yyyy h:mm a')}
          </span>
        )
      } catch {
        return (
          <span className="text-[12px] text-muted-foreground/60">
            {String(value)}
          </span>
        )
      }

    case 'MULTISELECT':
      if (Array.isArray(value)) {
        return (
          <div className="flex flex-wrap gap-1">
            {value.slice(0, 2).map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted/50 text-[10px] text-muted-foreground font-medium"
              >
                {tag}
              </span>
            ))}
            {value.length > 2 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted/30 text-[10px] text-muted-foreground/60">
                +{value.length - 2}
              </span>
            )}
          </div>
        )
      }
      return (
        <span className="text-[12px] text-foreground/70">{String(value)}</span>
      )

    case 'IMAGE_URL':
      if (typeof value === 'string' && value.startsWith('http')) {
        return (
          <div className="flex items-center gap-2">
            <img
              src={value}
              alt=""
              className="w-7 h-7 rounded-md object-cover bg-muted/50 flex-shrink-0 border border-border/30"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            <span className="text-[11px] text-muted-foreground/60 truncate max-w-[100px]">
              {value}
            </span>
          </div>
        )
      }
      return (
        <span className="text-[12px] text-muted-foreground/60 truncate max-w-[120px]">
          {String(value)}
        </span>
      )

    case 'GALLERY':
      /**
       * GALLERY CELL DISPLAY
       * Shows up to 3 overlapping thumbnails with a count badge for additional images.
       * Each thumbnail slightly overlaps the previous one for a compact stacked look.
       */
      if (Array.isArray(value) && value.length > 0) {
        const urls = value as string[]
        const visible = urls.slice(0, 3)
        const remaining = urls.length - visible.length
        return (
          <div className="flex items-center">
            {/* Stacked overlapping thumbnails */}
            <div className="flex items-center -space-x-2">
              {visible.map((url, i) => (
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt=""
                  className="w-7 h-7 rounded-md object-cover bg-muted/50 flex-shrink-0 border border-border/30 ring-2 ring-background"
                  style={{ zIndex: visible.length - i }}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ))}
            </div>
            {/* Count badge for remaining images */}
            {remaining > 0 && (
              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted/50 text-[10px] text-muted-foreground/70 font-medium">
                +{remaining}
              </span>
            )}
          </div>
        )
      }
      return <span className="text-muted-foreground/30 text-[12px]">—</span>

    case 'COLOR':
      /**
       * COLOR CELL DISPLAY
       * Shows a color swatch with support for both solid colors and gradients.
       * Parses the stored CmsColorValue format: { color: string, gradient?: GradientConfig }
       * Falls back to treating string values as solid colors for backwards compatibility.
       */
      const colorVal = parseCmsColorValue(value)
      const hasGradient = !!colorVal.gradient
      const isColorTransparent =
        !hasGradient &&
        (colorVal.color === 'transparent' ||
          colorVal.color === 'rgba(0,0,0,0)' ||
          colorVal.color === '')

      // Generate background style - gradient takes precedence over solid color
      const swatchBackground = hasGradient
        ? gradientConfigToCSS(colorVal.gradient!)
        : colorVal.color

      return (
        <div className="flex items-center gap-2">
          {/* Color/Gradient swatch */}
          {isColorTransparent ? (
            <div className="w-6 h-6 rounded border border-border/50 bg-white relative overflow-hidden flex-shrink-0">
              {/* Red diagonal line for transparent */}
              <div className="absolute inset-0">
                <div
                  className="absolute bg-destructive"
                  style={{
                    width: '141%',
                    height: '2px',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%) rotate(45deg)',
                  }}
                />
              </div>
            </div>
          ) : (
            <div
              className="w-6 h-6 rounded border border-border/50 flex-shrink-0"
              style={{ background: swatchBackground }}
            />
          )}
          {/* Label - shows gradient type or hex value */}
          <span className="text-[11px] text-muted-foreground/70 font-mono">
            {hasGradient
              ? `${colorVal.gradient!.type === 'radial' ? 'Radial' : 'Linear'} Gradient`
              : isColorTransparent
                ? 'None'
                : colorVal.color.toUpperCase()}
          </span>
        </div>
      )

    case 'RICH_TEXT':
      return <ContentPreview content={String(value)} maxHeight={40} className="text-xs" />

    case 'TEXT':
    default:
      return (
        <span className="text-[12px] text-foreground/80 line-clamp-1">
          {String(value)}
        </span>
      )
  }
}

// ============================================================================
// EMPTY STATE
// ============================================================================

/**
 * Empty state component with context-aware messaging.
 * Shows different states based on search results, columns, or rows.
 * In read-only mode, does not show action buttons.
 */
function EmptyTableState({
  hasSearch,
  hasColumns,
  isReadOnly,
  onAddRow,
  onAddColumn,
}: {
  hasSearch: boolean
  hasColumns: boolean
  isReadOnly: boolean
  onAddRow: () => void
  onAddColumn: () => void
}) {
  // No search results state
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[240px] p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-4">
          <Search className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-muted-foreground/80 mb-1">
          No results found
        </p>
        <p className="text-xs text-muted-foreground/50">
          Try adjusting your search term
        </p>
      </div>
    )
  }

  // No columns state - need to add columns first (not applicable for read-only)
  if (!hasColumns) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[240px] p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
          <Columns3 className="w-5 h-5 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-medium text-foreground/80 mb-1">
          No columns yet
        </p>
        <p className="text-xs text-muted-foreground/60 mb-5 max-w-[200px]">
          {isReadOnly
            ? 'This table has no columns defined'
            : 'Define your table structure by adding columns'}
        </p>
        {!isReadOnly && (
          <button
            onClick={onAddColumn}
            className="h-8 px-4 text-xs flex items-center gap-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Column
          </button>
        )}
      </div>
    )
  }

  // No rows state - table is ready for data
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[240px] p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        {isReadOnly ? (
          <Lock className="w-5 h-5 text-muted-foreground/30" />
        ) : (
          <Plus className="w-5 h-5 text-muted-foreground/30" />
        )}
      </div>
      <p className="text-sm font-medium text-foreground/80 mb-1">No rows yet</p>
      <p className="text-xs text-muted-foreground/60 mb-5 max-w-[200px]">
        {isReadOnly
          ? 'This table has no data. Add products from the store page.'
          : 'Start adding content to your table'}
      </p>
      {!isReadOnly && (
        <button
          onClick={onAddRow}
          className="h-8 px-4 text-xs flex items-center gap-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Row
        </button>
      )}
    </div>
  )
}

// ============================================================================
// TABLE VIEW SKELETON - Loading state for the data grid
// ============================================================================

/**
 * Skeleton loading state for the table view.
 * Mimics the table header and rows structure with animated placeholders.
 */
function TableViewSkeleton() {
  // Generate random widths for variety in skeleton appearance
  const columnWidths = [40, 180, 120, 150, 100, 80]

  return (
    <div className="w-full">
      {/* Table header skeleton */}
      <div className="sticky top-0 bg-muted/30 z-10 border-b border-border/40">
        <div className="flex items-center h-9 px-3 gap-4">
          {/* Checkbox column */}
          <Skeleton className="w-4 h-4 rounded" />
          {/* Column headers */}
          {columnWidths.slice(1).map((width, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5"
            >
              <Skeleton className="w-3.5 h-3.5 rounded" />
              <Skeleton
                className="h-3"
                style={{ width: `${width * 0.6}px` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Table rows skeleton */}
      <div className="divide-y divide-border/30">
        {Array.from({ length: 8 }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex items-center h-10 px-3 gap-4"
            style={{ opacity: 1 - rowIndex * 0.08 }}
          >
            {/* Checkbox */}
            <Skeleton className="w-4 h-4 rounded" />
            {/* Cell values */}
            {columnWidths.slice(1).map((width, colIndex) => (
              <Skeleton
                key={colIndex}
                className="h-4 rounded"
                style={{
                  width: `${width * (0.5 + Math.random() * 0.5)}px`,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="px-4 py-2.5 border-t border-border/40 bg-muted/15">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-7 w-16 rounded" />
          </div>
          <Skeleton className="h-4 w-32 rounded" />
          <div className="flex items-center gap-1">
            <Skeleton className="w-7 h-7 rounded" />
            <Skeleton className="w-7 h-7 rounded" />
            <Skeleton className="w-12 h-4 rounded" />
            <Skeleton className="w-7 h-7 rounded" />
            <Skeleton className="w-7 h-7 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

