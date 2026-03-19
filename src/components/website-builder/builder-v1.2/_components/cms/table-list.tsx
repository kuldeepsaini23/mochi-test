/**
 * ============================================================================
 * TABLE LIST - Compact Sidebar Navigation with Server-Side Search
 * ============================================================================
 *
 * Compact table list with server-side pagination and debounced search.
 * Supports rename, delete, and selection.
 *
 * FEATURES:
 * - Two tabs: Custom (user-created) and Internal (system tables like Ecommerce)
 * - System tables show lock icon and cannot be edited/deleted
 * - Server-side search with 300ms debounce
 * - Paginated results (50 tables per page)
 * - Infinite scroll loading for large table counts
 *
 * ============================================================================
 */

'use client'

import { useState, useCallback, useRef, useEffect, KeyboardEvent, useMemo } from 'react'
import { Table2, MoreHorizontal, Pencil, Trash2, Search, Loader2, Lock, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Badge } from '@/components/ui/badge'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES
// ============================================================================

/**
 * CMS Table type for list view.
 * Matches the tRPC listTables response shape.
 * Note: Dates are ISO strings from the API.
 *
 * SOURCE OF TRUTH: CmsTable model in Prisma schema
 */
interface CmsTable {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  order: number
  /** True if this is a system table (e.g., synced from Ecommerce store) */
  isSystemTable: boolean
  /** ID of the store this table is synced with (if any) */
  sourceStoreId: string | null
  columnsCount: number
  rowsCount: number
  createdAt: string
  updatedAt: string
}

/** Tab options for filtering tables */
type TableTab = 'custom' | 'internal'

interface TableListProps {
  /** Organization ID for fetching tables */
  organizationId: string
  /** Currently selected table ID */
  selectedTableId: string | null
  /** Callback when a table is selected */
  onSelectTable: (tableId: string) => void
  /** Callback when a table is deleted */
  onTableDeleted: (tableId: string) => void
}

// ============================================================================
// DEBOUNCE HOOK
// ============================================================================

/**
 * Custom hook for debouncing a value.
 * Returns the debounced value after the specified delay.
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TableList({
  organizationId,
  selectedTableId,
  onSelectTable,
  onTableDeleted,
}: TableListProps) {
  // Tab state - default to custom tables
  const [activeTab, setActiveTab] = useState<TableTab>('custom')

  // Search state with debouncing
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)

  // UI state
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null)
  const [deletingTable, setDeletingTable] = useState<CmsTable | null>(null)

  // Ref for infinite scroll
  const listContainerRef = useRef<HTMLDivElement>(null)

  const utils = trpc.useUtils()

  /**
   * Fetch tables using tRPC's useInfiniteQuery for proper caching.
   * Data is cached between sessions - no redundant refetches when reopening CMS.
   * Uses cursor-based pagination for efficient page loading.
   */
  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.cms.listTables.useInfiniteQuery(
    {
      organizationId,
      limit: 50,
      search: debouncedSearch || undefined,
    },
    {
      // Get the next cursor from the response for pagination
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      // Keep previous data while fetching new search results
      placeholderData: (prev) => prev,
    }
  )

  // Flatten all pages into a single array of tables
  const allTables = data?.pages.flatMap((page) => page.tables) ?? []

  // Filter tables by tab (custom vs internal/system)
  const tables = useMemo(() => {
    return allTables.filter((table) => {
      if (activeTab === 'internal') {
        return table.isSystemTable
      }
      return !table.isSystemTable
    })
  }, [allTables, activeTab])

  // Count for tab badges
  const customCount = useMemo(
    () => allTables.filter((t) => !t.isSystemTable).length,
    [allTables]
  )
  const internalCount = useMemo(
    () => allTables.filter((t) => t.isSystemTable).length,
    [allTables]
  )

  /**
   * Handle infinite scroll - load more when near bottom.
   * Uses tRPC's fetchNextPage for proper cache management.
   */
  const handleScroll = useCallback(() => {
    const container = listContainerRef.current
    if (!container || !hasNextPage || isFetchingNextPage) return

    const { scrollTop, scrollHeight, clientHeight } = container
    // Load more when within 100px of bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Mutations
  const updateTable = trpc.cms.updateTable.useMutation({
    onSuccess: () => {
      utils.cms.listTables.invalidate({ organizationId })
    },
  })

  const deleteTable = trpc.cms.deleteTable.useMutation({
    onSuccess: (_data, { tableId }) => {
      utils.cms.listTables.invalidate({ organizationId })
      onTableDeleted(tableId)
    },
  })

  const handleRenameComplete = useCallback(
    (tableId: string, newName: string, originalName: string) => {
      const trimmedName = newName.trim()
      if (!trimmedName || trimmedName === originalName) {
        setRenamingTableId(null)
        return
      }
      updateTable.mutate({ organizationId, tableId, name: trimmedName })
      setRenamingTableId(null)
    },
    [organizationId, updateTable]
  )

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingTable) return
    deleteTable.mutate({ organizationId, tableId: deletingTable.id })
    setDeletingTable(null)
  }, [deletingTable, organizationId, deleteTable])

  // Show loading indicator when debouncing search or fetching initial data
  const isSearching = searchInput !== debouncedSearch || (isFetching && !isFetchingNextPage)

  return (
    <div className="flex flex-col h-full">
      {/* Tabs: Custom vs Internal */}
      <div className="p-2 shrink-0 border-b border-border/40">
        <div className="flex gap-1 p-0.5 bg-muted/30 rounded-md">
          <button
            onClick={() => setActiveTab('custom')}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded transition-all',
              activeTab === 'custom'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Custom
            {customCount > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">({customCount})</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('internal')}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded transition-all flex items-center justify-center gap-1',
              activeTab === 'internal'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Lock className="w-3 h-3" />
            Internal
            {internalCount > 0 && (
              <span className="text-[10px] opacity-60">({internalCount})</span>
            )}
          </button>
        </div>
      </div>

      {/* Search input with loading indicator */}
      <div className="p-2 shrink-0 border-b border-border/40">
        <div className="relative">
          {isSearching ? (
            <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 animate-spin" />
          ) : (
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          )}
          <input
            type="text"
            placeholder="Search tables..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs bg-muted/30 border border-border/50 rounded-md placeholder:text-muted-foreground/50 focus:outline-none focus:bg-background focus:border-border focus:ring-1 focus:ring-ring/20 transition-colors"
          />
        </div>
      </div>

      {/* Table list with infinite scroll */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto px-1.5 py-1.5"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <TableListSkeleton />
        ) : tables.length === 0 ? (
          <div className="py-8 text-center">
            <Table2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground/60">
              {debouncedSearch ? 'No matching tables' : 'No tables yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {tables.map((table) => (
              <TableItem
                key={table.id}
                table={table}
                isSelected={selectedTableId === table.id}
                isRenaming={renamingTableId === table.id}
                onSelect={() => onSelectTable(table.id)}
                onStartRename={() => setRenamingTableId(table.id)}
                onRenameComplete={(newName) =>
                  handleRenameComplete(table.id, newName, table.name)
                }
                onCancelRename={() => setRenamingTableId(null)}
                onDelete={() => setDeletingTable(table)}
              />
            ))}

            {/* Load more indicator */}
            {isFetchingNextPage && (
              <div className="py-2 text-center">
                <Loader2 className="w-4 h-4 mx-auto animate-spin text-muted-foreground/40" />
              </div>
            )}

            {/* Show count when searching */}
            {debouncedSearch && tables.length > 0 && !hasNextPage && (
              <div className="py-2 text-center text-[10px] text-muted-foreground/50">
                {tables.length} table{tables.length !== 1 ? 's' : ''} found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete dialog */}
      <AlertDialog
        open={!!deletingTable}
        onOpenChange={(open) => !open && setDeletingTable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Table?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deletingTable?.name}&quot; and all {deletingTable?.rowsCount ?? 0} rows?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================================
// TABLE ITEM
// ============================================================================

interface TableItemProps {
  table: CmsTable
  isSelected: boolean
  isRenaming: boolean
  onSelect: () => void
  onStartRename: () => void
  onRenameComplete: (newName: string) => void
  onCancelRename: () => void
  onDelete: () => void
}

function TableItem({
  table,
  isSelected,
  isRenaming,
  onSelect,
  onStartRename,
  onRenameComplete,
  onCancelRename,
  onDelete,
}: TableItemProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editedName, setEditedName] = useState(table.name)

  // System tables cannot be edited or deleted
  const isSystemTable = table.isSystemTable
  const isEcommerceTable = !!table.sourceStoreId

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onRenameComplete(editedName)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditedName(table.name)
      onCancelRename()
    }
  }

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  // Reset edited name when table changes
  useEffect(() => {
    setEditedName(table.name)
  }, [table.name])

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] cursor-pointer transition-all duration-150',
        isSelected
          ? 'bg-muted/80 text-foreground shadow-sm'
          : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
      )}
      onClick={() => !isRenaming && onSelect()}
    >
      {/* Table icon - different for system tables */}
      {isEcommerceTable ? (
        <ShoppingCart
          className={cn(
            'w-4 h-4 shrink-0 transition-colors',
            isSelected
              ? 'text-primary'
              : 'text-primary/60 group-hover:text-primary'
          )}
        />
      ) : isSystemTable ? (
        <Lock
          className={cn(
            'w-4 h-4 shrink-0 transition-colors',
            isSelected
              ? 'text-amber-500'
              : 'text-amber-500/60 group-hover:text-amber-500'
          )}
        />
      ) : (
        <Table2
          className={cn(
            'w-4 h-4 shrink-0 transition-colors',
            isSelected
              ? 'text-foreground'
              : 'text-muted-foreground/60 group-hover:text-muted-foreground'
          )}
        />
      )}

      {/* Table name - editable or static */}
      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => onRenameComplete(editedName)}
          className="flex-1 min-w-0 text-[13px] bg-background border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring/30"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 min-w-0 truncate font-medium">{table.name}</span>
      )}

      {/* System table badge */}
      {isSystemTable && !isRenaming && (
        <Badge
          variant="outline"
          className={cn(
            'text-[9px] px-1 py-0 h-4 border-none font-normal',
            isEcommerceTable
              ? 'bg-primary/10 text-primary'
              : 'bg-amber-500/10 text-amber-600'
          )}
        >
          {isEcommerceTable ? 'Store' : 'System'}
        </Badge>
      )}

      {/* Row count badge */}
      {!isRenaming && !isSystemTable && (
        <span
          className={cn(
            'text-[10px] tabular-nums px-1.5 py-0.5 rounded-full transition-colors',
            isSelected
              ? 'bg-background text-muted-foreground'
              : 'bg-muted/50 text-muted-foreground/60'
          )}
        >
          {table.rowsCount}
        </span>
      )}

      {/* Actions dropdown - hidden for system tables */}
      {!isRenaming && !isSystemTable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'w-6 h-6 flex items-center justify-center rounded-md transition-all duration-150',
                'opacity-0 group-hover:opacity-100 hover:bg-background',
                isSelected && 'opacity-100'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={onStartRename} className="text-xs gap-2">
              <Pencil className="w-3.5 h-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-xs gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Lock indicator for system tables - shows on hover */}
      {isSystemTable && !isRenaming && (
        <div
          className={cn(
            'w-6 h-6 flex items-center justify-center rounded-md',
            'opacity-0 group-hover:opacity-60'
          )}
          title="This table is synced with Ecommerce. Manage it from the store page."
        >
          <Lock className="w-3 h-3 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SKELETON
// ============================================================================

/**
 * Skeleton loading state for the table list.
 */
function TableListSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2.5 py-2 rounded-md animate-pulse"
          style={{ opacity: 1 - i * 0.1 }}
        >
          <div className="w-4 h-4 rounded bg-muted/50" />
          <div className="h-4 flex-1 rounded bg-muted/50" />
          <div className="w-6 h-4 rounded-full bg-muted/30" />
        </div>
      ))}
    </div>
  )
}
