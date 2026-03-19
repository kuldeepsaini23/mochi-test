/**
 * Portal Pagination Component
 *
 * SOURCE OF TRUTH: Portal List Pagination
 * Consistent pagination across all portal pages.
 * Matches the products table pagination style.
 */

'use client'

import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PortalPaginationProps {
  /** Current page (1-indexed) */
  page: number
  /** Items per page */
  pageSize: number
  /** Total number of pages */
  totalPages: number
  /** Total number of items */
  total: number
  /** Number of items on current page */
  currentCount: number
  /** Callback when page changes */
  onPageChange: (page: number) => void
  /** Callback when page size changes */
  onPageSizeChange: (size: number) => void
  /** Label for items (e.g., "organizations", "users") */
  itemLabel?: string
}

export function PortalPagination({
  page,
  pageSize,
  totalPages,
  total,
  currentCount,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'items',
}: PortalPaginationProps) {
  // Don't render if no data
  if (total === 0) return null

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      {/* Left side: Page size selector and count */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">
            Per page:
          </Label>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground">
          {startItem}-{endItem} of {total}
        </span>
      </div>

      {/* Right side: Pagination buttons */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            aria-label="First page"
          >
            <ChevronFirstIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <span className="px-2 text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            aria-label="Last page"
          >
            <ChevronLastIcon className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
