/**
 * Dashboard Date Picker
 *
 * WHY: Provides date range selection for filtering dashboard analytics
 * HOW: Uses calendar-05 style dual calendar with DateRange picker,
 *      plus a preset sidebar for quick common ranges and month/year
 *      dropdown navigation for fast jumping.
 *
 * INTEGRATION:
 * - Connects to DashboardDateRangeProvider context
 * - Placed in ContentLayout headerActions slot
 * - Draft state lets users freely adjust dates without triggering refetches
 * - Commits to context only on popover close (click outside) or preset click
 *
 * SOURCE OF TRUTH KEYWORDS: DashboardDatePicker, DateRangeFilter, DatePresets
 */

'use client'

import * as React from 'react'
import { CalendarIcon, RotateCcw } from 'lucide-react'
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  subMonths,
  startOfYear,
  startOfMonth,
  isSameDay,
} from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useDashboardDateRange } from '@/hooks/use-dashboard-date-range'

// ============================================================================
// PRESET DEFINITIONS
// ============================================================================

interface DatePreset {
  /** Display label for the preset button */
  label: string
  /** Function that computes the from/to DateRange for this preset */
  getRange: () => DateRange
}

/**
 * Quick-select date range presets.
 * WHY: Users shouldn't have to manually click two dates for common ranges.
 * Each preset computes its range relative to "now" so it's always current.
 */
const DATE_PRESETS: DatePreset[] = [
  {
    label: 'Today',
    getRange: () => {
      const today = new Date()
      return { from: startOfDay(today), to: endOfDay(today) }
    },
  },
  {
    label: 'Last 7 days',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 30 days',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 29)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 3 months',
    getRange: () => ({
      from: startOfMonth(subMonths(new Date(), 2)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 6 months',
    getRange: () => ({
      from: startOfMonth(subMonths(new Date(), 5)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 12 months',
    getRange: () => {
      const now = new Date()
      const from = new Date(now)
      from.setMonth(from.getMonth() - 11)
      from.setDate(1)
      return { from, to: endOfDay(now) }
    },
  },
  {
    label: 'Year to date',
    getRange: () => ({
      from: startOfYear(new Date()),
      to: endOfDay(new Date()),
    }),
  },
]

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * DashboardDatePicker Component
 *
 * WHY: Allow users to filter dashboard data by date range
 * HOW: Popover with a preset sidebar (left) and dual calendar (right).
 *      Uses LOCAL draft state so users can freely click/adjust dates
 *      without triggering chart refetches. The draft only commits to
 *      context when the popover CLOSES (click outside / Escape), or
 *      when a preset is clicked (instant apply). Month/year dropdowns
 *      let users jump directly to any month without clicking arrows.
 */
export function DashboardDatePicker() {
  const { dateRange, setDateRange, resetToDefault, isCustomRange } = useDashboardDateRange()
  const [open, setOpen] = React.useState(false)

  /**
   * Local draft state for in-progress date selection.
   * WHY: The calendar fires onSelect on EVERY click — first click sets `from`,
   * second click sets `to`. If we pushed every intermediate state to context,
   * all charts would refetch twice per selection. Instead we buffer the
   * selection locally and only commit to context when both dates are set.
   */
  const [draft, setDraft] = React.useState<DateRange | undefined>(dateRange)

  /** Sync draft when the popover opens so it always starts from current range */
  React.useEffect(() => {
    if (open) {
      setDraft(dateRange)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Format the display text for the trigger button.
   * Shows the committed context range (not the draft).
   */
  const displayText = React.useMemo(() => {
    if (!dateRange?.from) return 'Select date range'
    if (!dateRange.to) return format(dateRange.from, 'MMM d, yyyy')
    return `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`
  }, [dateRange])

  /**
   * Check if a preset matches the current committed date range.
   * WHY: Highlights the active preset so users know which range is selected.
   */
  const isPresetActive = React.useCallback(
    (preset: DatePreset) => {
      if (!dateRange?.from || !dateRange?.to) return false
      const range = preset.getRange()
      if (!range.from || !range.to) return false
      return isSameDay(dateRange.from, range.from) && isSameDay(dateRange.to, range.to)
    },
    [dateRange]
  )

  /**
   * Handle preset click — compute the range, commit to context, close popover.
   * WHY: Presets are instant — no need for the user to close the popover manually.
   */
  const handlePresetClick = React.useCallback(
    (preset: DatePreset) => {
      const range = preset.getRange()
      setDateRange(range)
      setOpen(false)
    },
    [setDateRange]
  )

  /**
   * Handle popover open/close.
   * WHY: Commit the draft to context only when the popover CLOSES (click outside
   * or Escape). This lets users freely click/adjust dates without triggering
   * chart refetches on every click. If the draft is incomplete (only `from`
   * selected), discard it and keep the previous range.
   */
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && draft?.from && draft?.to) {
        setDateRange(draft)
      }
      setOpen(nextOpen)
    },
    [draft, setDateRange]
  )

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'justify-start text-left font-normal h-9 text-xs sm:text-sm',
              !dateRange && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{displayText}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          {/* Layout: presets sidebar (left) + dual calendar (right) */}
          <div className="flex flex-col sm:flex-row">
            {/* Preset sidebar */}
            <div className="flex flex-row gap-1 overflow-x-auto border-b p-2 sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r sm:p-3">
              {DATE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'justify-start whitespace-nowrap text-xs sm:text-sm',
                    isPresetActive(preset) && 'bg-accent text-accent-foreground'
                  )}
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Dual calendar with month/year dropdowns */}
            {/* showOutsideDays disabled to prevent the same week appearing in both */}
            {/* panels when adjacent months share a week row (e.g., Apr 27-30 showing */}
            {/* in both April and May panels with range highlights — visually confusing) */}
            <div className="p-0">
              <Calendar
                mode="range"
                defaultMonth={draft?.from}
                selected={draft}
                onSelect={setDraft}
                numberOfMonths={2}
                showOutsideDays={false}
                className="rounded-lg border-0"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {isCustomRange && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={resetToDefault}
          title="Reset to last 12 months"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
