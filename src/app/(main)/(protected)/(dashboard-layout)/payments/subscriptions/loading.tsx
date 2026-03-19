/**
 * Subscriptions Page Loading State
 *
 * WHY: Instant loading UI that matches actual page layout
 * HOW: Uses same wrapper structure with skeleton rows for zero layout shift
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

export default function SubscriptionsLoading() {
  return (
    <>
      {/* Header — matches SubscriptionsTab layout */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            View and manage all recurring subscriptions for your organization
          </p>
        </div>
      </div>

      {/* Table wrapper — matches SubscriptionsTable structure */}
      <div className="flex flex-col">
        {/* Filters skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Input
                className="peer min-w-60 ps-9"
                placeholder="Search subscriptions..."
                disabled
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
                <ListFilterIcon size={16} aria-hidden="true" />
              </div>
            </div>
            <Button variant="outline" disabled>
              <FilterIcon className="-ms-1 opacity-60" size={16} aria-hidden="true" />
              Status
            </Button>
            <Button variant="outline" disabled>
              <Columns3Icon className="-ms-1 opacity-60" size={16} aria-hidden="true" />
              View
            </Button>
          </div>
        </div>

        {/* Table skeleton */}
        <div className="overflow-hidden rounded-md border bg-background">
          <div className="max-h-[calc(100vh-22rem)] overflow-auto">
            <Table className="table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="hover:bg-muted bg-background">
                  <TableHead className="h-11" style={{ width: '220px' }}>Customer</TableHead>
                  <TableHead className="h-11" style={{ width: '200px' }}>Product(s)</TableHead>
                  <TableHead className="h-11" style={{ width: '120px' }}>Amount</TableHead>
                  <TableHead className="h-11" style={{ width: '150px' }}>Status</TableHead>
                  <TableHead className="h-11" style={{ width: '160px' }}>Trial</TableHead>
                  <TableHead className="h-11" style={{ width: '100px' }}>Started</TableHead>
                  <TableHead className="h-11" style={{ width: '40px' }}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...Array(5)].map((_, i) => (
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
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  )
}
