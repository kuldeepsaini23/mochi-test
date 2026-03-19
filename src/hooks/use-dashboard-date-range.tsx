/**
 * Dashboard Date Range Context & Hook
 *
 * WHY: Provides shared date range state for all dashboard charts
 * HOW: React context with date range picker state, passed to all chart queries
 *
 * USAGE:
 * 1. Wrap dashboard with <DashboardDateRangeProvider>
 * 2. Use useDashboardDateRange() in charts to get current range
 * 3. Date picker updates context, triggering all charts to refetch
 *
 * SOURCE OF TRUTH KEYWORDS: DashboardDateRange, DateRangeContext, ChartDateFilter
 */

'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { DateRange } from 'react-day-picker'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Dashboard date range context value
 * SOURCE OF TRUTH: DashboardDateRangeContext
 */
interface DashboardDateRangeContextValue {
  /** Current selected date range */
  dateRange: DateRange | undefined
  /** Set new date range (triggers chart refetch) */
  setDateRange: (range: DateRange | undefined) => void
  /** Get date range for API calls (converts DateRange to from/to dates) */
  getQueryDateRange: () => { from: Date; to: Date } | undefined
  /** Reset to default (last 12 months) */
  resetToDefault: () => void
  /** Check if using custom range or default */
  isCustomRange: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get default date range (last 12 months)
 */
function getDefaultDateRange(): DateRange {
  const to = new Date()
  const from = new Date()
  from.setMonth(from.getMonth() - 11)
  from.setDate(1)

  return { from, to }
}

// ============================================================================
// CONTEXT
// ============================================================================

const DashboardDateRangeContext = createContext<DashboardDateRangeContextValue | null>(null)

// ============================================================================
// PROVIDER
// ============================================================================

interface DashboardDateRangeProviderProps {
  children: ReactNode
  /** Optional initial date range */
  initialRange?: DateRange
}

/**
 * DashboardDateRangeProvider
 *
 * WHY: Shares date range state across all dashboard charts
 * HOW: Wrap dashboard content with this provider
 *
 * @example
 * ```tsx
 * <DashboardDateRangeProvider>
 *   <DashboardContent />
 * </DashboardDateRangeProvider>
 * ```
 */
export function DashboardDateRangeProvider({
  children,
  initialRange,
}: DashboardDateRangeProviderProps) {
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(
    initialRange ?? getDefaultDateRange()
  )
  const [isCustomRange, setIsCustomRange] = useState(false)

  /**
   * Set date range with custom flag
   */
  const setDateRange = useCallback((range: DateRange | undefined) => {
    setDateRangeState(range)
    setIsCustomRange(true)
  }, [])

  /**
   * Get date range formatted for API queries
   */
  const getQueryDateRange = useCallback(() => {
    if (!dateRange?.from || !dateRange?.to) {
      return undefined
    }

    // Ensure 'to' includes the full day
    const to = new Date(dateRange.to)
    to.setHours(23, 59, 59, 999)

    return {
      from: dateRange.from,
      to,
    }
  }, [dateRange])

  /**
   * Reset to default 12-month range
   */
  const resetToDefault = useCallback(() => {
    setDateRangeState(getDefaultDateRange())
    setIsCustomRange(false)
  }, [])

  return (
    <DashboardDateRangeContext.Provider
      value={{
        dateRange,
        setDateRange,
        getQueryDateRange,
        resetToDefault,
        isCustomRange,
      }}
    >
      {children}
    </DashboardDateRangeContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * useDashboardDateRange
 *
 * WHY: Access shared date range state in chart components
 * HOW: Call in any chart component within DashboardDateRangeProvider
 *
 * @throws Error if used outside DashboardDateRangeProvider
 *
 * @example
 * ```tsx
 * function Chart01() {
 *   const { getQueryDateRange } = useDashboardDateRange()
 *   const range = getQueryDateRange()
 *
 *   const { data } = trpc.dashboard.getRecurringRevenue.useQuery({
 *     organizationId,
 *     from: range?.from,
 *     to: range?.to,
 *   })
 * }
 * ```
 */
export function useDashboardDateRange(): DashboardDateRangeContextValue {
  const context = useContext(DashboardDateRangeContext)

  if (!context) {
    throw new Error(
      'useDashboardDateRange must be used within a DashboardDateRangeProvider'
    )
  }

  return context
}

/**
 * useDashboardDateRangeOptional
 *
 * WHY: Safe access to date range without throwing (for conditional rendering)
 * HOW: Returns null if not within provider
 */
export function useDashboardDateRangeOptional(): DashboardDateRangeContextValue | null {
  return useContext(DashboardDateRangeContext)
}
