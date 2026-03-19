'use client'

/**
 * ============================================================================
 * Stores Table Component — Card Grid Layout
 * ============================================================================
 *
 * WHY: Display stores in a professional card grid with search, selection,
 *      and pagination. Replaces the old flat table with a visually
 *      premium card-based design.
 *
 * HOW: Uses a responsive card grid (1–4 columns) with hover effects,
 *      prominent store images, and clean typography.
 *
 * Features:
 * - Search input with clear button
 * - Card selection for bulk actions (checkbox on hover)
 * - Click card to navigate to store detail
 * - Inline edit button (visible on hover)
 * - Pagination controls with page size selector
 *
 * SOURCE OF TRUTH: Store, StoreProduct, Ecommerce
 * ============================================================================
 */

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  Search,
  X,
  Trash2,
  Pencil,
  Store as StoreIcon,
  Package,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ============================================================================
// TYPES
// ============================================================================

interface Store {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  createdAt: string
  updatedAt: string
  _count: {
    products: number
  }
}

interface StoresTableProps {
  stores: Store[]
  totalStores: number
  searchQuery: string
  onSearchChange: (value: string) => void
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onEdit?: (store: Store) => void
  onBulkDelete?: (ids: string[]) => void
  isDeleting?: boolean
  isLoading?: boolean
  canDelete?: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoresTable({
  stores,
  totalStores,
  searchQuery,
  onSearchChange,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  onEdit,
  onBulkDelete,
  isDeleting,
  isLoading,
  canDelete,
}: StoresTableProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  /** Whether all visible stores are selected */
  const allSelected = useMemo(() => {
    return stores.length > 0 && stores.every((store) => selectedIds.has(store.id))
  }, [stores, selectedIds])

  /** Whether some (but not all) visible stores are selected */
  const someSelected = useMemo(() => {
    return stores.some((store) => selectedIds.has(store.id)) && !allSelected
  }, [stores, selectedIds, allSelected])

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(stores.map((store) => store.id)))
    }
  }

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleCardClick = (store: Store) => {
    router.push(`/sites/stores/${store.id}`)
  }

  const handleDelete = () => {
    if (onBulkDelete && selectedIds.size > 0) {
      onBulkDelete(Array.from(selectedIds))
      setSelectedIds(new Set())
      setDeleteDialogOpen(false)
    }
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="space-y-5">
      {/* ================================================================
       * TOOLBAR — Search, Select All, Bulk Actions
       * ================================================================ */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search stores..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Select All toggle — only when stores exist */}
          {canDelete && stores.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                // @ts-expect-error - indeterminate is valid but not in types
                indeterminate={someSelected}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Select all
              </span>
            </div>
          )}
        </div>

        {/* Bulk Delete — visible when items are selected */}
        {selectedIds.size > 0 && canDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={isDeleting}
          >
            <Trash2 className="size-4 mr-2" />
            Delete ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* ================================================================
       * CONTENT — Loading, Empty, or Card Grid
       * ================================================================ */}
      {isLoading ? (
        /* Loading skeleton grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border bg-card p-4 space-y-3"
            >
              <Skeleton className="aspect-[16/9] w-full rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : stores.length === 0 ? (
        /* Empty State — clean, premium look */
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="rounded-full bg-muted p-4 mb-4">
            <StoreIcon className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold mb-1">
            {searchQuery ? 'No stores found' : 'No stores yet'}
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            {searchQuery
              ? 'Try adjusting your search to find what you\'re looking for.'
              : 'Create your first store to start selling products.'}
          </p>
        </div>
      ) : (
        /* Store Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {stores.map((store) => {
            const isSelected = selectedIds.has(store.id)

            return (
              <div
                key={store.id}
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick(store)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleCardClick(store)
                  }
                }}
                className={`
                  group relative rounded-xl border bg-card overflow-hidden
                  cursor-pointer transition-all duration-200
                  hover:border-primary/30 hover:shadow-md
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${isSelected ? 'border-primary ring-1 ring-primary/20' : ''}
                `}
              >
                {/* --------------------------------------------------------
                 * Store Image / Placeholder — 16:9 aspect ratio
                 * -------------------------------------------------------- */}
                <div className="relative aspect-[16/9] bg-muted/40 overflow-hidden">
                  {store.imageUrl ? (
                    <img
                      src={store.imageUrl}
                      alt={store.name}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center">
                      <StoreIcon className="size-10 text-muted-foreground/40" />
                    </div>
                  )}

                  {/* Checkbox overlay — top-left, visible on hover or when selected */}
                  {canDelete && (
                    <div
                      className={`
                        absolute top-2.5 left-2.5 transition-opacity duration-150
                        ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                      `}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectOne(store.id)
                      }}
                    >
                      <div className="size-6 rounded-md bg-background/80 backdrop-blur-sm border shadow-sm flex items-center justify-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelectOne(store.id)}
                          aria-label={`Select ${store.name}`}
                          className="size-4"
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions dropdown — top-right, visible on hover */}
                  {onEdit && (
                    <div
                      className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 bg-background/80 backdrop-blur-sm border shadow-sm"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => onEdit(store)}>
                            <Pencil className="size-4 mr-2" />
                            Edit Store
                          </DropdownMenuItem>
                          {canDelete && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedIds(new Set([store.id]))
                                setDeleteDialogOpen(true)
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>

                {/* --------------------------------------------------------
                 * Card Content — name, description, meta
                 * -------------------------------------------------------- */}
                <div className="p-4 space-y-2">
                  {/* Store name */}
                  <h3 className="font-medium text-sm leading-tight truncate">
                    {store.name}
                  </h3>

                  {/* Description — 2 lines max */}
                  {store.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {store.description}
                    </p>
                  )}

                  {/* Meta row — product count badge + created date */}
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="secondary" className="text-xs gap-1 font-normal">
                      <Package className="size-3" />
                      {store._count.products} {store._count.products === 1 ? 'product' : 'products'}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(store.createdAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ================================================================
       * PAGINATION — Page info, size selector, navigation
       * ================================================================ */}
      {totalStores > 0 && (
        <div className="flex items-center justify-between pt-1">
          {/* Total count */}
          <p className="text-sm text-muted-foreground">
            {totalStores} store{totalStores !== 1 ? 's' : ''} total
          </p>

          <div className="flex items-center gap-4">
            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Show</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => onPageSizeChange(Number(value))}
              >
                <SelectTrigger className="w-16 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
                {currentPage} / {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
       * DELETE CONFIRMATION DIALOG
       * ================================================================ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stores</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} store
              {selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.
              Products will be removed from these stores but not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
