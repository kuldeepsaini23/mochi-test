/**
 * Chart05 - Sales Breakdown by Billing Type
 *
 * WHY: Displays sales distribution across billing types (ONE_TIME, RECURRING, SPLIT_PAYMENT)
 * HOW: Fetches data from dashboard.getSalesBreakdown, renders as stacked bar chart
 *
 * NOTE: Renamed from "Affiliate Subscriptions Sold" to "Sales Breakdown"
 *
 * DATA:
 * - oneTime: One-time payment transactions
 * - recurring: Recurring subscription transactions
 * - splitPayment: Split payment plan transactions
 *
 * TOGGLE:
 * - Count mode: Shows number of transactions
 * - Amount mode: Shows revenue amount in cents
 *
 * SOURCE OF TRUTH KEYWORDS: SalesBreakdownChart, BillingTypeChart
 */

'use client'

import { useId, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import { CustomTooltipContent } from '@/components/charts-extra'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Info } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { useDashboardDateRange } from '@/hooks/use-dashboard-date-range'
import { formatCurrency } from '@/lib/utils'
import { getCurrencySymbol } from '@/constants/currencies'

// ============================================================================
// CHART CONFIG
// ============================================================================

const chartConfig = {
  oneTime: {
    label: 'One-Time',
    color: 'var(--chart-4)',
  },
  recurring: {
    label: 'Recurring',
    color: 'var(--chart-1)',
  },
  splitPayment: {
    label: 'Split Payment',
    color: 'var(--chart-6)',
  },
} satisfies ChartConfig

// ============================================================================
// LOADING SKELETON
// ============================================================================

function ChartSkeleton() {
  return (
    <Card className="gap-4 border-none">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-7 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-60 w-full" />
      </CardContent>
    </Card>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Chart05() {
  const id = useId()
  const [selectedMode, setSelectedMode] = useState<'count' | 'amount'>('count')

  // Get organization context
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  // Get currency from organization
  const currency = activeOrganization?.stripeAccountCurrency || 'usd'

  // Get date range from context
  const { getQueryDateRange } = useDashboardDateRange()
  const dateRange = getQueryDateRange()

  // Fetch data with selected mode
  const { data, isLoading, error } = trpc.dashboard.getSalesBreakdown.useQuery(
    {
      organizationId: organizationId || '',
      from: dateRange?.from,
      to: dateRange?.to,
      mode: selectedMode,
    },
    {
      enabled: !!organizationId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    }
  )

  // Loading state
  if (isLoading || !organizationId) {
    return <ChartSkeleton />
  }

  // Error state
  if (error) {
    return (
      <Card className="gap-4 border-none">
        <CardHeader>
          <CardTitle>Sales Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-60 text-muted-foreground">
            Failed to load data
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = data?.data || []
  const totals = data?.totals || { total: 0, oneTime: 0, recurring: 0, splitPayment: 0, change: 0 }

  // Format totals for display
  const totalDisplay =
    selectedMode === 'amount'
      ? formatCurrency(totals.total, currency)
      : totals.total.toLocaleString()
  const changeDisplay = totals.change >= 0 ? `+${totals.change}%` : `${totals.change}%`
  const isPositive = totals.change >= 0

  // Get first and last month for X-axis (handles empty data gracefully)
  // Deduplicate to avoid React key collision when both are the same month
  const firstMonth = chartData[0]?.month ?? ''
  const lastMonth = chartData[chartData.length - 1]?.month ?? ''
  const xAxisTicks = firstMonth === lastMonth ? [firstMonth] : [firstMonth, lastMonth]

  /**
   * Format Y-axis tick values
   * - Count mode: Shows numbers (1K, 2K, etc.)
   * - Amount mode: Shows currency ($1K, $2K, etc.)
   */
  /** Currency symbol for compact axis labels (e.g., $, €, £) */
  const sym = getCurrencySymbol(currency)

  const formatYAxisTick = (value: number) => {
    if (value === 0) return selectedMode === 'amount' ? `${sym}0` : '0'
    if (selectedMode === 'amount') {
      /** Convert cents → dollars before applying K/M shorthand */
      const dollars = value / 100
      if (dollars >= 1000000) return `${sym}${(dollars / 1000000).toFixed(0)}M`
      if (dollars >= 1000) return `${sym}${(dollars / 1000).toFixed(0)}K`
      return `${sym}${Math.round(dollars)}`
    }
    /** Count mode — no conversion needed */
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  /**
   * Format tooltip values
   * - Count mode: Shows plain numbers
   * - Amount mode: Shows formatted currency
   */
  const formatTooltipValue = (value: number) => {
    if (selectedMode === 'amount') {
      return formatCurrency(value, currency)
    }
    return value.toLocaleString()
  }

  return (
    <Card className="gap-4 border-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <CardTitle>Sales Breakdown</CardTitle>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    Amounts shown are gross revenue before platform fees are deducted.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-start gap-2">
              <div className="font-semibold text-2xl">{totalDisplay}</div>
              <Badge
                className={`mt-1.5 border-none ${
                  isPositive
                    ? 'bg-emerald-500/24 text-emerald-500'
                    : 'bg-rose-500/24 text-rose-500'
                }`}
              >
                {changeDisplay}
              </Badge>
            </div>
          </div>
          <div className="bg-muted dark:bg-black/50 inline-flex h-7 rounded-lg p-0.5 shrink-0">
            <RadioGroup
              value={selectedMode}
              onValueChange={(value) => setSelectedMode(value as 'count' | 'amount')}
              className="group text-xs after:border after:border-border after:bg-background has-focus-visible:after:border-ring has-focus-visible:after:ring-ring/50 relative inline-grid grid-cols-[1fr_1fr] items-center gap-0 font-medium after:absolute after:inset-y-0 after:w-1/2 after:rounded-md after:shadow-xs after:transition-[translate,box-shadow] after:duration-300 after:ease-[cubic-bezier(0.16,1,0.3,1)] has-focus-visible:after:ring-[3px] data-[state=count]:after:translate-x-0 data-[state=amount]:after:translate-x-full"
              data-state={selectedMode}
            >
              <label className="group-data-[state=amount]:text-muted-foreground/50 relative z-10 inline-flex h-full min-w-8 cursor-pointer items-center justify-center px-2 whitespace-nowrap transition-colors select-none">
                Count
                <RadioGroupItem
                  id={`${id}-count`}
                  value="count"
                  className="sr-only"
                />
              </label>
              <label className="group-data-[state=count]:text-muted-foreground/50 relative z-10 inline-flex h-full min-w-8 cursor-pointer items-center justify-center px-2 whitespace-nowrap transition-colors select-none">
                Amount
                <RadioGroupItem
                  id={`${id}-amount`}
                  value="amount"
                  className="sr-only"
                />
              </label>
            </RadioGroup>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-4"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                One-Time
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-1"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                Recurring
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-6"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                Split Payment
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-60 w-full [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-(--chart-1)/15"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            maxBarSize={20}
            margin={{ left: -12, right: 12, top: 12 }}
          >
            <defs>
              <linearGradient
                id={`${id}-gradient`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--chart-1)"
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-2)"
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="2 2"
              stroke="var(--border)"
            />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={12}
              ticks={xAxisTicks}
              stroke="var(--border)"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxisTick}
            />
            <ChartTooltip
              content={
                <CustomTooltipContent
                  colorMap={{
                    oneTime: 'var(--chart-4)',
                    recurring: 'var(--chart-1)',
                    splitPayment: 'var(--chart-6)',
                  }}
                  labelMap={{
                    oneTime: 'One-Time',
                    recurring: 'Recurring',
                    splitPayment: 'Split Payment',
                  }}
                  dataKeys={['oneTime', 'recurring', 'splitPayment']}
                  valueFormatter={formatTooltipValue}
                />
              }
            />
            <Bar
              dataKey="oneTime"
              fill="var(--chart-4)"
              stackId="a"
            />
            <Bar
              dataKey="recurring"
              fill={`url(#${id}-gradient)`}
              stackId="a"
            />
            <Bar
              dataKey="splitPayment"
              fill="var(--chart-6)"
              stackId="a"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
