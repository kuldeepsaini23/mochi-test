/**
 * Chart06 - Marketplace / Platform Revenue
 *
 * WHY: Platform-currency earnings (template sales, future merch, affiliates)
 * must be shown separately from connect-account revenue. The seller's main
 * charts (Chart01-05) show earnings in their Stripe currency (e.g., CAD).
 * This chart shows earnings in the platform currency (e.g., USD) with
 * gross, fees, and net income breakdown.
 *
 * DATA:
 * - gross: Total platform-currency revenue
 * - fees: Platform fees deducted
 * - net: Net income after platform fees
 *
 * SOURCE OF TRUTH KEYWORDS: PlatformRevenueChart, MarketplaceChart, Chart06
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Info } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { useDashboardDateRange } from '@/hooks/use-dashboard-date-range'
import { formatCurrency } from '@/lib/utils'

// ============================================================================
// CHART CONFIG
// ============================================================================

const chartConfig = {
  gross: {
    label: 'Gross Revenue',
    color: 'var(--chart-4)',
  },
} satisfies ChartConfig

// ============================================================================
// LOADING SKELETON
// ============================================================================

function ChartSkeleton() {
  return (
    <Card className="gap-4 border-none @2xl:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
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

export function Chart06() {
  const id = useId()

  /** Get organization context */
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  /** Get date range from shared dashboard context */
  const { getQueryDateRange } = useDashboardDateRange()
  const dateRange = getQueryDateRange()

  /** Fetch platform revenue data */
  const { data, isLoading, error } = trpc.dashboard.getPlatformRevenue.useQuery(
    {
      organizationId: organizationId || '',
      from: dateRange?.from,
      to: dateRange?.to,
    },
    {
      enabled: !!organizationId,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Platform currency is always USD (or whatever the platform Stripe account uses).
   * This is different from the org's connect-account currency used in Chart01-05.
   */
  const platformCurrency = 'usd'

  if (isLoading || !organizationId) {
    return <ChartSkeleton />
  }

  if (error) {
    return (
      <Card className="gap-4 border-none">
        <CardHeader>
          <CardTitle>Marketplace Revenue</CardTitle>
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
  const totals = data?.totals || { totalGross: 0, totalFees: 0, totalNet: 0, change: 0 }

  const netTotal = formatCurrency(totals.totalNet, platformCurrency)
  const grossTotal = formatCurrency(totals.totalGross, platformCurrency)
  const feesTotal = formatCurrency(totals.totalFees, platformCurrency)
  const changeText = totals.change >= 0 ? `+${totals.change}%` : `${totals.change}%`
  const isPositive = totals.change >= 0

  /** X-axis ticks — show first and last month */
  const firstMonth = chartData[0]?.month ?? ''
  const lastMonth = chartData[chartData.length - 1]?.month ?? ''
  const xAxisTicks = firstMonth === lastMonth ? [firstMonth] : [firstMonth, lastMonth]

  return (
    <Card className="gap-4 border-none @2xl:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <CardTitle>Marketplace Revenue</CardTitle>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Gross revenue from template sales, merch, and affiliates before platform fees are deducted.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-start gap-2">
              <div className="font-semibold text-2xl">{grossTotal}</div>
              <Badge
                className={`mt-1.5 border-none ${
                  isPositive
                    ? 'bg-emerald-500/24 text-emerald-500'
                    : 'bg-rose-500/24 text-rose-500'
                }`}
              >
                {changeText}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              Fees: {feesTotal} &middot; Net: {netTotal}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-4"
              />
              <div className="text-[13px]/3 text-muted-foreground/50">Gross Revenue</div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-60 w-full [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-(--chart-4)/15"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            maxBarSize={20}
            margin={{ left: -12, right: 12, top: 12 }}
          >
            <defs>
              <linearGradient id={`${id}-net`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-4)" />
                <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.6} />
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
                    gross: 'var(--chart-4)',
                  }}
                  labelMap={{
                    gross: 'Gross Revenue',
                  }}
                  dataKeys={['gross']}
                  valueFormatter={(value) => formatCurrency(value, platformCurrency)}
                />
              }
            />
            <Bar dataKey="gross" fill={`url(#${id}-net)`} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
