'use client'

/**
 * WEBSITES GRID COMPONENT
 *
 * Displays websites in a card grid format with visual previews.
 * Similar to the email templates grid view pattern.
 *
 * FEATURES:
 * - Visual card grid with screenshot previews
 * - Search filtering
 * - Pagination controls
 * - Empty state with helpful guidance
 * - Loading skeletons
 *
 * WHY THIS EXISTS:
 * - Grid view provides a more visual browsing experience
 * - Screenshots help users quickly identify websites
 * - Consistent with email templates grid pattern
 *
 * SOURCE OF TRUTH KEYWORDS: WebsitesGrid, WebsiteCardGrid, WebsiteGridView
 */

import { useId, useRef } from 'react'
import {
  CircleXIcon,
  ListFilterIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { WebsitePreviewCard } from './website-preview-card'
import type { WebsiteWithStatus } from './websites-table'

// ============================================================================
// TYPES
// ============================================================================

interface WebsitesGridProps {
  websites: WebsiteWithStatus[]
  isLoading: boolean
  isFetching: boolean
  search: string
  onSearchChange: (value: string) => void
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onWebsiteClick: (website: WebsiteWithStatus) => void
  /** Called on card hover - use for prefetching the edit page */
  onWebsiteHover?: (website: WebsiteWithStatus) => void
  onDelete?: (id: string) => void
  canDelete?: boolean
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

/**
 * Grid loading skeleton that matches the card layout.
 * Shows placeholder cards during initial load with portrait aspect ratio.
 */
function GridLoadingSkeleton() {
  return (
    <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <div key={i} className="flex flex-col">
          {/* Preview skeleton - portrait aspect ratio */}
          <Skeleton className="aspect-[3/4] rounded-xl" />
          {/* Info skeleton - minimal */}
          <div className="mt-2.5 space-y-1.5 px-0.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// EMPTY STATE
// ============================================================================

/**
 * Empty state shown when no websites match the search or organization has none.
 */
function EmptyState({ isSearching, searchTerm }: { isSearching: boolean; searchTerm: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Globe className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">
          {isSearching ? 'No results found' : 'No websites yet'}
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {isSearching
            ? `No websites match "${searchTerm}". Try a different search term.`
            : 'Create your first website to start building beautiful pages.'}
        </p>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WebsitesGrid({
  websites,
  isLoading,
  isFetching,
  search,
  onSearchChange,
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  onWebsiteClick,
  onWebsiteHover,
  onDelete,
  canDelete = true,
}: WebsitesGridProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const isSearching = search.length > 0
  const isEmpty = !isLoading && websites.length === 0

  return (
    <div className="flex flex-col">
      {/* Search Filter - Fixed at top */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
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
            placeholder="Search websites..."
            type="text"
            aria-label="Search websites"
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

        {/* Results count */}
        <div className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'website' : 'websites'}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && <GridLoadingSkeleton />}

      {/* Empty state */}
      {isEmpty && <EmptyState isSearching={isSearching} searchTerm={search} />}

      {/* Grid of website cards - portrait cards allow more columns */}
      {!isLoading && !isEmpty && (
        <div className={cn(
          'grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
          isFetching && 'opacity-60 pointer-events-none'
        )}>
          {websites.map((website) => (
            <WebsitePreviewCard
              key={website.id}
              website={website}
              onClick={() => onWebsiteClick(website)}
              onHover={onWebsiteHover ? () => onWebsiteHover(website) : undefined}
              onDelete={onDelete ? () => onDelete(website.id) : undefined}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Pagination - Fixed at bottom */}
      {!isEmpty && (
        <div className="flex items-center justify-between gap-8 pt-6 shrink-0">
          {/* Page size selector and results count */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="page-size-grid" className="text-sm text-muted-foreground">
                Per page:
              </Label>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => onPageSizeChange(Number(value))}
              >
                <SelectTrigger id="page-size-grid" className="h-8 w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="16">16</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              Showing {websites.length > 0 ? (page - 1) * pageSize + 1 : 0}-
              {Math.min(page * pageSize, total)} of {total}
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
      )}
    </div>
  )
}
