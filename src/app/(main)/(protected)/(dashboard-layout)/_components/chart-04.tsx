/**
 * Chart04 - Affiliate Referrals
 *
 * WHY: Displays referral leads and conversion trends over time
 * HOW: Fetches data from dashboard.getAffiliateReferrals, renders as line chart
 *
 * NOTE: Renamed from "Refunds" to "Affiliate Referrals" per requirements
 *
 * DATA:
 * - actual: Number of referral leads per month
 * - converted: Number of referrals that converted to customers
 *
 * SOURCE OF TRUTH KEYWORDS: AffiliateReferralsChart, ReferralChart
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

// ============================================================================
// CHART CONFIG
// ============================================================================

const chartConfig = {
  actual: {
    label: 'Referrals',
    color: 'var(--chart-4)',
  },
  converted: {
    label: 'Converted',
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

export function Chart04() {
  const id = useId()

  // Get organization context
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  // Get date range from context
  const { getQueryDateRange } = useDashboardDateRange()
  const dateRange = getQueryDateRange()

  // Fetch data
  const { data, isLoading, error } = trpc.dashboard.getAffiliateReferrals.useQuery(
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

  // Loading state
  if (isLoading || !organizationId) {
    return <ChartSkeleton />
  }

  // Error state
  if (error) {
    return (
      <Card className="gap-4 border-none">
        <CardHeader>
          <CardTitle>Affiliate Referrals</CardTitle>
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
  const totals = data?.totals || { totalReferrals: 0, totalConverted: 0, conversionRate: 0 }

  // Format totals for display
  const referralsTotal = totals.totalReferrals.toLocaleString()
  const conversionDisplay = `${totals.conversionRate}% converted`

  // Render chart (Recharts handles empty data gracefully with empty chart structure)
  return (
    <Card className="gap-4 border-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <CardTitle>Affiliate Referrals</CardTitle>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    Tracks leads referred to your organization and their conversion rate.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-start gap-2">
              <div className="font-semibold text-2xl">{referralsTotal}</div>
              <Badge className="mt-1.5 bg-emerald-500/24 text-emerald-500 border-none">
                {conversionDisplay}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-4"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                Referrals
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-3"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                Converted
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-60 w-full [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-(--chart-4)/10 [&_.recharts-rectangle.recharts-tooltip-inner-cursor]:fill-white/20"
        >
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ left: -12, right: 12, top: 12 }}
          >
            <defs>
              <linearGradient
                id={`${id}-gradient`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop
                  offset="0%"
                  stopColor="var(--chart-5)"
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-4)"
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
              tickFormatter={(value) => value.slice(0, 3)}
              stroke="var(--border)"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => {
                if (value === 0) return '0'
                if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                return value.toString()
              }}
              interval="preserveStartEnd"
            />
            <Line
              type="linear"
              dataKey="converted"
              stroke="var(--color-converted)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <ChartTooltip
              content={
                <CustomTooltipContent
                  colorMap={{
                    actual: 'var(--chart-4)',
                    converted: 'var(--chart-3)',
                  }}
                  labelMap={{
                    actual: 'Referrals',
                    converted: 'Converted',
                  }}
                  dataKeys={['actual', 'converted']}
                  valueFormatter={(value) => value.toLocaleString()}
                />
              }
              cursor={<CustomCursor fill="var(--chart-4)" />}
            />
            <Line
              type="linear"
              dataKey="actual"
              stroke={`url(#${id}-gradient)`}
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 5,
                fill: 'var(--chart-4)',
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
