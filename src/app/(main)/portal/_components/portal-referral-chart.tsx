/**
 * Portal Referral Sources Chart — Donut visualization
 *
 * WHY: Shows where platform users discovered the product
 * HOW: Fetches aggregated onboarding survey data and renders a donut pie chart
 *
 * SOURCE OF TRUTH KEYWORDS: PortalReferralChart, ReferralSources, OnboardingSurvey
 */

'use client'

import { useId } from 'react'
import { PieChart, Pie, Cell } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// CHART COLORS — Maps to CSS custom property chart palette
// ============================================================================

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-1)', // wraps for 6+ items
]

// ============================================================================
// CHART CONFIG — Required by ChartContainer for CSS variable theming
// ============================================================================

const chartConfig = {
  count: {
    label: 'Count',
  },
} satisfies ChartConfig

// ============================================================================
// LOADING SKELETON
// ============================================================================

function ChartSkeleton() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-60 w-full" />
      </CardContent>
    </Card>
  )
}

// ============================================================================
// CUSTOM TOOLTIP — Shows label, count, and percentage on hover
// ============================================================================

interface TooltipPayloadItem {
  payload: {
    label: string
    count: number
    fill: string
  }
}

function ReferralTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  total: number
}) {
  if (!active || !payload?.length) return null

  const item = payload[0].payload
  const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0'

  return (
    <div className="bg-popover text-popover-foreground grid min-w-32 items-start gap-1.5 rounded-lg border px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <div
          className="size-2 rounded-xs"
          style={{ backgroundColor: item.fill }}
        />
        <span className="font-medium">{item.label}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Count</span>
        <span className="font-mono font-medium tabular-nums">
          {item.count.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Share</span>
        <span className="font-mono font-medium tabular-nums">{percentage}%</span>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PortalReferralChart() {
  const id = useId()

  // Fetch aggregated onboarding survey data
  const { data, isLoading, error } = trpc.portal.getOnboardingSurveyData.useQuery(
    undefined,
    {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  if (isLoading) return <ChartSkeleton />

  if (error) {
    return (
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Referral Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-60 text-muted-foreground">
            Failed to load data
          </div>
        </CardContent>
      </Card>
    )
  }

  const referralData = data?.referralSource || []
  const totalOrgs = data?.totalOrganizations || 0

  // Assign colors to each referral source
  const chartData = referralData.map((item, index) => ({
    ...item,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }))

  // Calculate total referral responses (some orgs may not have answered)
  const totalResponses = referralData.reduce((sum, item) => sum + item.count, 0)

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="space-y-0.5">
          <CardTitle>Referral Sources</CardTitle>
          <div className="font-semibold text-2xl">
            {totalOrgs.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground ml-1.5">
              organizations
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">
            No survey data yet
          </div>
        ) : (
          <div className="space-y-4">
            {/* Donut chart */}
            <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
              <PieChart>
                <ChartTooltip
                  content={<ReferralTooltip total={totalResponses} />}
                />
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={50}
                  outerRadius={80}
                  strokeWidth={2}
                  stroke="var(--background)"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            {/* Legend — color swatch + label + count */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {chartData.map((item) => {
                const percentage =
                  totalResponses > 0
                    ? ((item.count / totalResponses) * 100).toFixed(0)
                    : '0'
                return (
                  <div key={item.value} className="flex items-center gap-2 text-sm">
                    <div
                      className="size-2.5 shrink-0 rounded-xs"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className="text-muted-foreground truncate">{item.label}</span>
                    <span className="ml-auto font-mono text-xs tabular-nums">
                      {percentage}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
