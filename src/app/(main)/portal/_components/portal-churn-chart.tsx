/**
 * Portal Subscription Health Chart - Platform-Wide Subscription Tracking
 *
 * WHY: Shows subscription health across the platform (active vs churned)
 * HOW: Fetches data from portal.getChurnData, renders as line chart
 *
 * DISPLAYS:
 * - Active subscriptions (healthy, engaged customers)
 * - Churned subscriptions (canceled, past_due, etc.)
 * - Overall churn rate percentage
 *
 * SOURCE OF TRUTH KEYWORDS: PortalChurnChart, PlatformChurn, SubscriptionHealth
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
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// CHART CONFIG
// ============================================================================

const chartConfig = {
  churned: {
    label: 'Churned',
    color: 'var(--chart-4)', // Use different color for churn (negative metric)
  },
  active: {
    label: 'Active',
    color: 'var(--chart-1)',
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
    <Card className="gap-4">
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

export function PortalChurnChart() {
  const id = useId()

  // Fetch platform-wide churn data
  const { data, isLoading, error } = trpc.portal.getChurnData.useQuery(
    {},
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    }
  )

  // Loading state
  if (isLoading) {
    return <ChartSkeleton />
  }

  // Error state
  if (error) {
    return (
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Subscription Health</CardTitle>
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
  const totals = data?.totals || {
    totalChurned: 0,
    totalActive: 0,
    churnRate: 0,
    churnChange: 0,
  }

  // Format churn rate and change for display
  // Note: For churn, NEGATIVE change is GOOD (less churn)
  const churnRateDisplay = `${totals.churnRate}%`
  const churnChange =
    totals.churnChange >= 0
      ? `+${totals.churnChange}%`
      : `${totals.churnChange}%`

  // Invert the positive/negative coloring for churn (less churn = good = green)
  const isPositive = totals.churnChange <= 0

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle>Subscription Health</CardTitle>
            <div className="flex items-start gap-2">
              <div className="font-semibold text-2xl">{churnRateDisplay}</div>
              <Badge
                className={`mt-1.5 border-none ${
                  isPositive
                    ? 'bg-emerald-500/24 text-emerald-500'
                    : 'bg-rose-500/24 text-rose-500'
                }`}
              >
                {churnChange}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-1"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">Active</div>
            </div>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-4"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                Churned
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
              tickFormatter={(value) => {
                if (value === 0) return '0'
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                return `${value}`
              }}
              interval="preserveStartEnd"
            />
            <Line
              type="linear"
              dataKey="churned"
              stroke="var(--chart-4)"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 5,
                fill: 'var(--chart-4)',
                stroke: 'var(--background)',
                strokeWidth: 2,
              }}
            />
            <ChartTooltip
              content={
                <CustomTooltipContent
                  colorMap={{
                    churned: 'var(--chart-4)',
                    active: 'var(--chart-1)',
                  }}
                  labelMap={{
                    churned: 'Churned',
                    active: 'Active',
                  }}
                  dataKeys={['active', 'churned']}
                  valueFormatter={(value) => value.toLocaleString()}
                />
              }
              cursor={<CustomCursor fill="var(--chart-4)" />}
            />
            <Line
              type="linear"
              dataKey="active"
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
