/**
 * Chart03 - MRR Growth (Hidden by Default)
 *
 * WHY: Shows monthly recurring revenue growth with churn breakdown
 * HOW: Renders stacked bar chart with revenues vs churn
 *
 * STATUS: Hidden by default as a customization add-on
 * Users can enable this chart in their dashboard customization settings
 *
 * NOTE: This chart is kept for future use when dashboard customization is implemented.
 * The dashboard-content component controls visibility via the `enabled` prop.
 *
 * SOURCE OF TRUTH KEYWORDS: MRRGrowthChart, ChurnChart, DashboardAddOn
 */

'use client'

import { useId } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import { CustomTooltipContent } from '@/components/charts-extra'
import { Badge } from '@/components/ui/badge'

// ============================================================================
// CHART CONFIG
// ============================================================================

const chartConfig = {
  revenues: {
    label: 'Revenues',
    color: 'var(--chart-1)',
  },
  churn: {
    label: 'Churn',
    color: 'var(--chart-4)',
  },
} satisfies ChartConfig

// ============================================================================
// PROPS
// ============================================================================

interface Chart03Props {
  /**
   * Whether the chart is enabled/visible
   * When false, renders null (hidden)
   * @default false
   */
  enabled?: boolean
}

// ============================================================================
// MOCK DATA (will be replaced when MRR Growth API is implemented)
// ============================================================================

const chartDataMock = [
  { month: 'Jan 2025', revenues: 750000, churn: -150000 },
  { month: 'Feb 2025', revenues: 900000, churn: -70000 },
  { month: 'Mar 2025', revenues: 950000, churn: -220000 },
  { month: 'Apr 2025', revenues: 1350000, churn: -180000 },
  { month: 'May 2025', revenues: 650000, churn: -80000 },
  { month: 'Jun 2025', revenues: 1450000, churn: -280000 },
  { month: 'Jul 2025', revenues: 950000, churn: -150000 },
  { month: 'Aug 2025', revenues: 500000, churn: -120000 },
  { month: 'Sep 2025', revenues: 1300000, churn: -280000 },
  { month: 'Oct 2025', revenues: 1050000, churn: -40000 },
  { month: 'Nov 2025', revenues: 1550000, churn: -120000 },
  { month: 'Dec 2025', revenues: 900000, churn: -200000 },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Chart03({ enabled = false }: Chart03Props) {
  const id = useId()

  /**
   * Hidden by default as a dashboard customization add-on
   * Returns null when not enabled to remove from layout
   */
  if (!enabled) {
    return null
  }

  const chartData = chartDataMock
  const growthTotal = '$1,426,297'
  const growthChange = '+4.6%'

  // Get first and last month for X-axis
  // Deduplicate to avoid React key collision when both are the same month
  const firstMonth = chartData[0]?.month as string
  const lastMonth = chartData[chartData.length - 1]?.month as string
  const xAxisTicks = firstMonth === lastMonth ? [firstMonth] : [firstMonth, lastMonth]

  return (
    <Card className="gap-4 border-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle>MRR Growth</CardTitle>
            <div className="flex items-start gap-2">
              <div className="font-semibold text-2xl">{growthTotal}</div>
              <Badge className="mt-1.5 bg-emerald-500/24 text-emerald-500 border-none">
                {growthChange}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-1"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                Revenues
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-4"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">Churn</div>
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
            stackOffset="sign"
            maxBarSize={20}
            margin={{ left: -12, right: 12, top: 12 }}
          >
            <defs>
              <linearGradient id={`${id}-gradient`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" />
                <stop offset="100%" stopColor="var(--chart-2)" />
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
              /** Convert cents → dollars before applying K/M shorthand */
              tickFormatter={(value) => {
                const dollars = value / 100
                if (dollars === 0) return '$0'
                if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(1)}M`
                if (dollars >= 1000) return `$${(dollars / 1000).toFixed(0)}K`
                return `$${Math.round(dollars)}`
              }}
            />
            <ChartTooltip
              content={
                <CustomTooltipContent
                  colorMap={{
                    revenues: 'var(--chart-1)',
                    churn: 'var(--chart-4)',
                  }}
                  labelMap={{
                    revenues: 'Revenues',
                    churn: 'Churn',
                  }}
                  dataKeys={['revenues', 'churn']}
                  valueFormatter={(value) => `$${value.toLocaleString()}`}
                />
              }
            />
            <Bar dataKey="revenues" fill={`url(#${id}-gradient)`} stackId="a" />
            <Bar dataKey="churn" fill="var(--color-churn)" stackId="a" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
