/**
 * Portal Fees Chart - Platform Transaction Fees
 *
 * WHY: Shows total platform fees earned from transactions
 * HOW: Fetches data from portal.getFeesData, renders as bar chart
 *
 * FEES BY TIER:
 * - free: 10% platform fee
 * - starter: 7% platform fee
 * - pro: 5% platform fee
 * - enterprise: 3% platform fee
 * - portal: 0% platform fee
 *
 * SOURCE OF TRUTH KEYWORDS: PortalFeesChart, PlatformFees
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
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/react-provider'
import { getCurrencySymbol, DEFAULT_CURRENCY } from '@/constants/currencies'
import { formatCurrency } from '@/lib/utils'

// ============================================================================
// CHART CONFIG
// ============================================================================

const chartConfig = {
  fees: {
    label: 'Platform Fees',
    color: 'var(--chart-1)',
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

export function PortalFeesChart() {
  const id = useId()

  // Fetch platform fees data
  const { data, isLoading, error } = trpc.portal.getFeesData.useQuery(
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
          <CardTitle>Platform Fees</CardTitle>
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
    totalFees: 0,
    totalTransactions: 0,
    feeChange: 0,
  }

  // Get platform currency from Stripe (defaults to 'usd')
  const currency = platformCurrency || DEFAULT_CURRENCY
  const currencySymbol = getCurrencySymbol(currency)

  // Format totals for display using platform currency
  const feesTotal = formatCurrency(totals.totalFees, currency)
  const feeChange =
    totals.feeChange >= 0 ? `+${totals.feeChange}%` : `${totals.feeChange}%`
  const isPositive = totals.feeChange >= 0

  // Get first and last month for X-axis
  // Deduplicate to avoid React key collision when both are the same month
  const firstMonth = chartData[0]?.month ?? ''
  const lastMonth = chartData[chartData.length - 1]?.month ?? ''
  const xAxisTicks = firstMonth === lastMonth ? [firstMonth] : [firstMonth, lastMonth]

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <CardTitle>Platform Fees</CardTitle>
            <div className="flex items-start gap-2">
              <div className="font-semibold text-2xl">{feesTotal}</div>
              <Badge
                className={`mt-1.5 border-none ${
                  isPositive
                    ? 'bg-emerald-500/24 text-emerald-500'
                    : 'bg-rose-500/24 text-rose-500'
                }`}
              >
                {feeChange}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              from {totals.totalTransactions.toLocaleString()} transactions
            </p>
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
                    fees: 'var(--chart-1)',
                  }}
                  labelMap={{
                    fees: 'Platform Fees',
                  }}
                  dataKeys={['fees']}
                  valueFormatter={(value) => formatCurrency(value, currency)}
                />
              }
            />
            <Bar dataKey="fees" fill={`url(#${id}-gradient)`} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
