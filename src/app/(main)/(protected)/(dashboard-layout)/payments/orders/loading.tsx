/**
 * Orders Page Loading State
 *
 * WHY: Instant loading UI that matches actual page layout 100%
 * HOW: Uses EXACT same wrapper structure + internal table skeleton
 *
 * CRITICAL: All static elements (header, buttons, filters) are in the EXACT
 * same positions as the real page. Only the table rows show skeletons.
 * This prevents layout shifts and creates blazing fast perceived load times.
 */

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  ListFilterIcon,
  FilterIcon,
  Columns3Icon,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function OrdersLoading() {
  return (
    <>
      {/* Header - EXACT same as OrdersTab */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Orders</h2>
          <p className="text-sm text-muted-foreground">
            Manage order fulfillment and tracking for your customers
          </p>
        </div>
      </div>

      {/* EXACT same wrapper as OrdersTable */}
      <div className="flex flex-col">
        {/* Filters - EXACT same structure */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Search filter - EXACT same */}
            <div className="relative">
              <Input
                className="peer min-w-60 ps-9"
                placeholder="Search orders..."
                disabled
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
                <ListFilterIcon size={16} aria-hidden="true" />
              </div>
            </div>

            {/* Filter by fulfillment status - EXACT same */}
            <Button variant="outline" disabled>
              <FilterIcon
                className="-ms-1 opacity-60"
                size={16}
                aria-hidden="true"
              />
              Fulfillment
            </Button>

            {/* Toggle columns visibility - EXACT same */}
            <Button variant="outline" disabled>
              <Columns3Icon
                className="-ms-1 opacity-60"
                size={16}
                aria-hidden="true"
              />
              View
            </Button>
          </div>
        </div>

        {/* Table - EXACT same wrapper structure */}
        <div className="overflow-hidden rounded-md border bg-background">
          <div className="max-h-[calc(100vh-22rem)] overflow-auto">
            <Table className="table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="hover:bg-muted bg-background">
                  <TableHead className="h-11" style={{ width: '200px' }}>Order</TableHead>
                  <TableHead className="h-11" style={{ width: '220px' }}>Customer</TableHead>
                  <TableHead className="h-11" style={{ width: '160px' }}>Product</TableHead>
                  <TableHead className="h-11" style={{ width: '120px' }}>Amount</TableHead>
                  <TableHead className="h-11" style={{ width: '120px' }}>Payment</TableHead>
                  <TableHead className="h-11" style={{ width: '140px' }}>Fulfillment</TableHead>
                  <TableHead className="h-11" style={{ width: '100px' }}>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* EXACT same skeleton rows */}
                {[...Array(5)].map((_, i) => (
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
                        <div className="space-y-1.5">
                          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                        </div>
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
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination - EXACT same structure */}
        <div className="flex flex-col-reverse items-center gap-4 pt-4 md:flex-row md:justify-between">
          <div className="text-sm tabular-nums text-muted-foreground">
            <span className="text-foreground font-medium">0</span> of{' '}
            <span className="text-foreground font-medium">0</span> row(s)
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <div className="text-sm font-medium tabular-nums">
              Page 1 of 1
            </div>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
