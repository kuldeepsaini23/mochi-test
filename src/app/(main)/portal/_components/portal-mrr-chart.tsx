/**
 * Portal MRR Chart - Platform-Wide Recurring Revenue
 *
 * WHY: Displays total MRR/ARR across ALL organizations on the platform
 * HOW: Fetches data from portal.getMRRData, renders as stacked bar chart
 *
 * SOURCE OF TRUTH KEYWORDS: PortalMRRChart, PlatformMRR, PortalARR
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/react-provider'
import { getCurrencySymbol, DEFAULT_CURRENCY } from '@/constants/currencies'
import { formatCurrency } from '@/lib/utils'

// ============================================================================
// CHART CONFIG
// ============================================================================

const chartConfig = {
  actual: {
    label: 'Actual',
    color: 'var(--chart-1)',
  },
  projected: {
    label: 'Projected',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

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
          <Skeleton className="h-7 w-20" />
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

export function PortalMRRChart() {
  const id = useId()
  const [selectedValue, setSelectedValue] = useState('off')

  // Fetch platform-wide MRR data
  const { data, isLoading, error } = trpc.portal.getMRRData.useQuery(
    {},
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    }
  )

  // Fetch platform currency from Stripe platform account
  const { data: platformCurrency } = trpc.portal.getPlatformCurrency.useQuery(
    undefined,
    {
      staleTime: 30 * 60 * 1000, // 30 minutes (rarely changes)
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
          <CardTitle>Recurring Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-60 text-muted-foreground">
            Failed to load data
          </div>
        </CardContent>
      </Card>
    )
  }

  // Process data for MRR/ARR toggle
  const mrrData = data?.data || []
  const arrData = mrrData.map((item) => ({
    ...item,
    actual: item.actual * 12,
    projected: item.projected * 12,
  }))

  const totals = data?.totals || { mrr: 0, arr: 0, mrrChange: 0, arrChange: 0 }

  // Get platform currency from Stripe (defaults to 'usd')
  const currency = platformCurrency || DEFAULT_CURRENCY
  const currencySymbol = getCurrencySymbol(currency)

  // Format totals for display using platform currency
  const mrrTotal = formatCurrency(totals.mrr, currency)
  const mrrChange =
    totals.mrrChange >= 0 ? `+${totals.mrrChange}%` : `${totals.mrrChange}%`
  const arrTotal = formatCurrency(totals.arr, currency)
  const arrChange =
    totals.arrChange >= 0 ? `+${totals.arrChange}%` : `${totals.arrChange}%`

  const chartData = selectedValue === 'on' ? arrData : mrrData
  const displayTotal = selectedValue === 'on' ? arrTotal : mrrTotal
  const displayChange = selectedValue === 'on' ? arrChange : mrrChange
  const isPositive =
    selectedValue === 'on' ? totals.arrChange >= 0 : totals.mrrChange >= 0

  // Get first and last month for X-axis (handles empty data gracefully)
  // Deduplicate to avoid React key collision when both are the same month
  const firstMonth = chartData[0]?.month ?? ''
  const lastMonth = chartData[chartData.length - 1]?.month ?? ''
  const xAxisTicks = firstMonth === lastMonth ? [firstMonth] : [firstMonth, lastMonth]

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <CardTitle>Recurring Revenue</CardTitle>
            <div className="flex items-start gap-2">
              <div className="font-semibold text-2xl">{displayTotal}</div>
              <Badge
                className={`mt-1.5 border-none ${
                  isPositive
                    ? 'bg-emerald-500/24 text-emerald-500'
                    : 'bg-rose-500/24 text-rose-500'
                }`}
              >
                {displayChange}
              </Badge>
            </div>
          </div>
          <div className="bg-muted dark:bg-black/50 inline-flex h-7 rounded-lg p-0.5 shrink-0">
            <RadioGroup
              value={selectedValue}
              onValueChange={setSelectedValue}
              className="group text-xs after:border after:border-border after:bg-background has-focus-visible:after:border-ring has-focus-visible:after:ring-ring/50 relative inline-grid grid-cols-[1fr_1fr] items-center gap-0 font-medium after:absolute after:inset-y-0 after:w-1/2 after:rounded-md after:shadow-xs after:transition-[translate,box-shadow] after:duration-300 after:ease-[cubic-bezier(0.16,1,0.3,1)] has-focus-visible:after:ring-[3px] data-[state=off]:after:translate-x-0 data-[state=on]:after:translate-x-full"
              data-state={selectedValue}
            >
              <label className="group-data-[state=on]:text-muted-foreground/50 relative z-10 inline-flex h-full min-w-8 cursor-pointer items-center justify-center px-2 whitespace-nowrap transition-colors select-none">
                MRR
                <RadioGroupItem id={`${id}-1`} value="off" className="sr-only" />
              </label>
              <label className="group-data-[state=off]:text-muted-foreground/50 relative z-10 inline-flex h-full min-w-8 cursor-pointer items-center justify-center px-2 whitespace-nowrap transition-colors select-none">
                ARR
                <RadioGroupItem id={`${id}-2`} value="on" className="sr-only" />
              </label>
            </RadioGroup>
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
              tickFormatter={(value) => {
                /* Chart data values are in cents — convert to dollars for display */
                const dollars = value / 100
                if (dollars === 0) return `${currencySymbol}0`
                if (dollars >= 1000000) return `${currencySymbol}${(dollars / 1000000).toFixed(1)}M`
                if (dollars >= 1000) return `${currencySymbol}${(dollars / 1000).toFixed(0)}K`
                return `${currencySymbol}${dollars.toFixed(0)}`
              }}
            />
            <ChartTooltip
              content={
                <CustomTooltipContent
                  colorMap={{
                    actual: 'var(--chart-1)',
                    projected: 'var(--chart-3)',
                  }}
                  labelMap={{
                    actual: 'Actual',
                    projected: 'Projected',
                  }}
                  dataKeys={['actual', 'projected']}
                  valueFormatter={(value) => formatCurrency(value, currency)}
                />
              }
            />
            <Bar dataKey="actual" fill={`url(#${id}-gradient)`} stackId="a" />
            <Bar dataKey="projected" fill="var(--color-projected)" stackId="a" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
