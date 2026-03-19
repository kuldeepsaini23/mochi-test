/**
 * Portal User Demographics Chart — Horizontal percentage bars
 *
 * WHY: Shows who the platform users are (role, team size, intended use)
 * HOW: Fetches aggregated onboarding survey data and renders 3 sections
 *      of horizontal percentage bars — one section per survey question
 *
 * SOURCE OF TRUTH KEYWORDS: PortalDemographicsChart, UserDemographics, OnboardingSurvey
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES — Mirrors SurveyCategoryItem from portal-analytics.service
// ============================================================================

interface SurveyCategoryItem {
  value: string
  label: string
  count: number
}

// ============================================================================
// BAR COLORS — One color per section for visual distinction
// ============================================================================

const SECTION_COLORS = {
  role: 'var(--chart-1)',
  teamSize: 'var(--chart-2)',
  intendedUse: 'var(--chart-3)',
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function ChartSkeleton() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// PERCENTAGE BAR SECTION — Renders one category's breakdown
// ============================================================================

interface BarSectionProps {
  title: string
  items: SurveyCategoryItem[]
  color: string
}

function BarSection({ title, items, color }: BarSectionProps) {
  // Find the max count so we can scale bars relative to the largest
  const maxCount = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 0
  const totalCount = items.reduce((sum, i) => sum + i.count, 0)

  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-1.5">
        {items.map((item) => {
          // Bar width relative to max value (largest bar = 100%)
          const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0
          // Percentage of total responses
          const percentage =
            totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(0) : '0'

          return (
            <div key={item.value} className="flex items-center gap-3">
              {/* Label — fixed width for alignment */}
              <span className="text-sm text-muted-foreground w-32 shrink-0 truncate">
                {item.label}
              </span>

              {/* Bar track + fill */}
              <div className="flex-1 h-6 bg-muted/50 rounded-md overflow-hidden relative">
                <div
                  className="h-full rounded-md transition-all duration-500"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: color,
                    opacity: 0.8,
                  }}
                />
              </div>

              {/* Count + percentage */}
              <div className="flex items-center gap-1.5 shrink-0 w-16 justify-end">
                <span className="text-sm font-mono tabular-nums font-medium">
                  {item.count}
                </span>
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  ({percentage}%)
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PortalDemographicsChart() {
  // Fetch aggregated onboarding survey data (shared query with referral chart)
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
          <CardTitle>User Demographics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-60 text-muted-foreground">
            Failed to load data
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalOrgs = data?.totalOrganizations || 0
  const hasData =
    (data?.role?.length || 0) > 0 ||
    (data?.teamSize?.length || 0) > 0 ||
    (data?.intendedUse?.length || 0) > 0

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="space-y-0.5">
          <CardTitle>User Demographics</CardTitle>
          <div className="font-semibold text-2xl">
            {totalOrgs.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground ml-1.5">
              organizations
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">
            No survey data yet
          </div>
        ) : (
          <div className="space-y-5">
            <BarSection
              title="Role"
              items={data?.role || []}
              color={SECTION_COLORS.role}
            />
            <BarSection
              title="Team Size"
              items={data?.teamSize || []}
              color={SECTION_COLORS.teamSize}
            />
            <BarSection
              title="Intended Use"
              items={data?.intendedUse || []}
              color={SECTION_COLORS.intendedUse}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
