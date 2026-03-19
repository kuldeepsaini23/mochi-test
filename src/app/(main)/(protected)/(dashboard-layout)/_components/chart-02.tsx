/**
 * Chart02 - Total Revenue
 *
 * WHY: Displays total revenue trends across all payment types
 * HOW: Fetches data from dashboard.getTotalRevenue, renders as line chart
 *
 * NOTE: Renamed from "Active Subscribers" to "Total Revenue" per requirements
 *
 * DATA:
 * - actual: Net revenue (paidAmount - refundedAmount) from all transactions
 * - projected: Previous month for comparison
 *
 * SOURCE OF TRUTH KEYWORDS: TotalRevenueChart, RevenueChart
 */

'use client'

import { useId } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  Rectangle,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import { CustomTooltipContent } from '@/components/charts-extra'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  actual: {
    label: 'Current',
    color: 'var(--chart-1)',
  },
  projected: {
    label: 'Previous',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

// ============================================================================
// CUSTOM CURSOR
// ============================================================================

interface CustomCursorProps {
  fill?: string
  pointerEvents?: string
  height?: number
  points?: Array<{ x: number; y: number }>
  className?: string
}

function CustomCursor(props: CustomCursorProps) {
  const { fill, pointerEvents, height, points, className } = props

  if (!points || points.length === 0) {
    return null
  }

  const { x, y } = points[0]!
  return (
    <>
      <Rectangle
        x={x - 12}
        y={y}
        fill={fill}
        pointerEvents={pointerEvents}
        width={24}
        height={height}
        className={className}
        type="linear"
      />
      <Rectangle
        x={x - 1}
        y={y}
        fill={fill}
        pointerEvents={pointerEvents}
        width={1}
        height={height}
        className="recharts-tooltip-inner-cursor"
        type="linear"
      />
    </>
  )
}

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

export function Chart02() {
  const id = useId()

  // Get organization context
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  // Get date range from context
  const { getQueryDateRange } = useDashboardDateRange()
  const dateRange = getQueryDateRange()

  // Fetch data
  const { data, isLoading, error } = trpc.dashboard.getTotalRevenue.useQuery(
    {
      organizationId: organizationId || '',
      from: dateRange?.from,
      to: dateRange?.to,
    },
    {
      enabled: !!organizationId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    }
  )

  // Get currency from organization (SOURCE OF TRUTH: Stripe account currency)
  const currency = activeOrganization?.stripeAccountCurrency || 'usd'
  /** Currency symbol for compact axis labels (e.g., $, €, £) */
  const sym = getCurrencySymbol(currency)

  // Loading state
  if (isLoading || !organizationId) {
    return <ChartSkeleton />
  }

  // Error state
  if (error) {
    return (
      <Card className="gap-4 border-none">
        <CardHeader>
          <CardTitle>Total Revenue</CardTitle>
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
  const totals = data?.totals || { totalRevenue: 0, change: 0 }

  // Format totals for display
  const revenueTotal = formatCurrency(totals.totalRevenue, currency)
  const revenueChange = totals.change >= 0 ? `+${totals.change}%` : `${totals.change}%`
  const isPositive = totals.change >= 0

  // Render chart (Recharts handles empty data gracefully with empty chart structure)
  return (
    <Card className="gap-4 border-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <CardTitle>Total Revenue</CardTitle>
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
              <div className="font-semibold text-2xl">{revenueTotal}</div>
              <Badge
                className={`mt-1.5 border-none ${
                  isPositive
                    ? 'bg-emerald-500/24 text-emerald-500'
                    : 'bg-rose-500/24 text-rose-500'
                }`}
              >
                {revenueChange}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-1"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">Current</div>
            </div>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-3"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                Previous
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-60 w-full [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-(--chart-1)/10 [&_.recharts-rectangle.recharts-tooltip-inner-cursor]:fill-white/20"
        >
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ left: -12, right: 12, top: 12 }}
          >
            <defs>
              <linearGradient id={`${id}-gradient`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--chart-2)" />
                <stop offset="100%" stopColor="var(--chart-1)" />
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
              tickFormatter={(value) => value.slice(0, 3)}
              stroke="var(--border)"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              /** Convert cents → dollars before applying K/M shorthand */
              tickFormatter={(value) => {
                const dollars = value / 100
                if (dollars === 0) return `${sym}0`
                if (dollars >= 1000000) return `${sym}${(dollars / 1000000).toFixed(1)}M`
                if (dollars >= 1000) return `${sym}${(dollars / 1000).toFixed(0)}K`
                return `${sym}${Math.round(dollars)}`
              }}
              interval="preserveStartEnd"
            />
            <Line
              type="linear"
              dataKey="projected"
              stroke="var(--color-projected)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <ChartTooltip
              content={
                <CustomTooltipContent
                  colorMap={{
                    actual: 'var(--chart-1)',
                    projected: 'var(--chart-3)',
                  }}
                  labelMap={{
                    actual: 'Current',
                    projected: 'Previous',
                  }}
                  dataKeys={['actual', 'projected']}
                  valueFormatter={(value) => formatCurrency(value, currency)}
                />
              }
              cursor={<CustomCursor fill="var(--chart-1)" />}
            />
            <Line
              type="linear"
              dataKey="actual"
              stroke={`url(#${id}-gradient)`}
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 5,
                fill: 'var(--chart-1)',
                stroke: 'var(--background)',
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
