'use client'

/**
 * ContainerOverlay Component - Pure Presentational Lane for DragOverlay
 *
 * This is a PURE PRESENTATIONAL component used inside DragOverlay.
 * It has NO drag hooks whatsoever - the DragOverlay handles all positioning.
 *
 * SOURCE OF TRUTH: Official dnd-kit pattern
 * IMPORTANT: Never add useSortable/useDroppable to this component!
 */

import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCurrencySymbol } from '@/constants/currencies'
import { SortableItem } from './sortable-item'
import type { PipelineLane } from '@/types/pipeline'

/**
 * Formats a dollar amount as compact currency (e.g., 14500 -> "$14.5k").
 * Uses getCurrencySymbol for proper currency-aware symbol display.
 *
 * NOTE: Pipeline ticket values are stored in dollars (Float), NOT cents.
 */
function formatCompactCurrency(valueInDollars: number, currency: string = 'usd'): string {
  const sym = getCurrencySymbol(currency)
  if (valueInDollars >= 1000000) {
    return `${sym}${(valueInDollars / 1000000).toFixed(1)}M`
  }
  if (valueInDollars >= 1000) {
    return `${sym}${(valueInDollars / 1000).toFixed(1)}k`
  }
  return `${sym}${valueInDollars.toFixed(0)}`
}

interface ContainerOverlayProps {
  lane: PipelineLane
  /** Organization's currency code for proper symbol display (e.g., 'usd', 'eur') */
  currency?: string
}

/**
 * ContainerOverlay - Pure visual representation of a lane during drag
 *
 * This component is rendered inside DragOverlay and follows the cursor.
 * It shows the lane header and a preview of the first few tickets.
 */
export function ContainerOverlay({ lane, currency = 'usd' }: ContainerOverlayProps) {
  /**
   * Use server-calculated total value if available, otherwise fallback to calculating from loaded tickets
   * WHY: Server-calculated value is accurate regardless of pagination state
   */
  const totalValue = lane.totalValue ?? lane.tickets.reduce(
    (sum, ticket) => sum + (ticket.value ?? 0),
    0
  )
  /**
   * Use server-provided ticket count if available, otherwise use loaded tickets length
   */
  const ticketCount = lane.ticketCount ?? lane.tickets.length

  return (
    <div
      className={cn(
        'flex flex-col shrink-0 w-80 h-96 bg-muted/40 rounded-xl',
        'border border-border shadow-xl',
        'cursor-grabbing'
      )}
    >
      {/* Lane Header - Matches DroppableContainer */}
      <div className="flex items-center gap-2 p-3 ">
        <div className="p-1 text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-medium flex-1 truncate">{lane.name}</h3>
        <span className="text-xs text-muted-foreground">
          {ticketCount}
        </span>
        <span className="text-xs text-muted-foreground">•</span>
        <span className="text-xs font-medium">
          {formatCompactCurrency(totalValue, currency)}
        </span>
      </div>

      {/* Tickets Preview */}
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2">
        <div className="space-y-2">
          {lane.tickets.slice(0, 3).map((ticket) => (
            <SortableItem
              key={ticket.id}
              id={ticket.id}
              ticket={ticket}
              isOverlay
            />
          ))}
          {lane.tickets.length > 3 && (
            <div className="text-xs text-muted-foreground text-center py-2">
              +{lane.tickets.length - 3} more
            </div>
          )}
          {lane.tickets.length === 0 && (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              No tickets
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
