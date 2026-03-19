/**
 * Portal Activity Chart - Platform-Wide User Activity
 *
 * SOURCE OF TRUTH: PortalActivityChart, PlatformUserEngagement
 *
 * WHY: Shows if users are ACTUALLY USING the platform
 * HOW: Tracks user activity (create/update/delete actions)
 *
 * METRICS DISPLAYED:
 * - Activities: Number of user actions (direct measure of app usage)
 * - Active Users: Unique users with activity (platform stickiness)
 * - New Users: User signups (platform growth)
 *
 * NOTE: Currently uses sessions as a proxy for activities until the
 * ActivityLog model is added to Prisma. Once added, this will show
 * actual create/update/delete actions for more accurate engagement tracking.
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
  activities: {
    label: 'Activities',
    color: 'var(--chart-1)',
  },
  activeUsers: {
    label: 'Active Users',
    color: 'var(--chart-2)',
  },
  newUsers: {
    label: 'New Users',
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

// Get app name from env or use default
const appName = process.env.NEXT_PUBLIC_APP_NAME || 'App'

export function PortalActivityChart() {
  const id = useId()

  // Fetch platform-wide activity data (sessions-based)
  const { data, isLoading, error } = trpc.portal.getActivityData.useQuery(
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
          <CardTitle>{appName} Activity</CardTitle>
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
    totalActivities: 0,
    totalActiveUsers: 0,
    totalNewUsers: 0,
    activityChange: 0,
  }

  // Display total activities as the main metric (primary engagement indicator)
  const activityChange =
    totals.activityChange >= 0
      ? `+${totals.activityChange}%`
      : `${totals.activityChange}%`
  const isPositive = totals.activityChange >= 0

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle>{appName} Activity</CardTitle>
            <div className="flex items-start gap-2">
              <div className="font-semibold text-2xl">
                {totals.totalActivities.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  activities
                </span>
              </div>
              <Badge
                className={`mt-1.5 border-none ${
                  isPositive
                    ? 'bg-emerald-500/24 text-emerald-500'
                    : 'bg-rose-500/24 text-rose-500'
                }`}
              >
                {activityChange}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {totals.totalActiveUsers.toLocaleString()} active users
              {' \u2022 '}
              {totals.totalNewUsers.toLocaleString()} new users
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-1"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">Activities</div>
            </div>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-2"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                Active Users
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-xs bg-chart-3"
              ></div>
              <div className="text-[13px]/3 text-muted-foreground/50">
                New Users
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
              dataKey="activeUsers"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <Line
              type="linear"
              dataKey="newUsers"
              stroke="var(--chart-3)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <ChartTooltip
              content={
                <CustomTooltipContent
                  colorMap={{
                    activities: 'var(--chart-1)',
                    activeUsers: 'var(--chart-2)',
                    newUsers: 'var(--chart-3)',
                  }}
                  labelMap={{
                    activities: 'Activities',
                    activeUsers: 'Active Users',
                    newUsers: 'New Users',
                  }}
                  dataKeys={['activities', 'activeUsers', 'newUsers']}
                  valueFormatter={(value) => value.toLocaleString()}
                />
              }
              cursor={<CustomCursor fill="var(--chart-1)" />}
            />
            <Line
              type="linear"
              dataKey="activities"
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
