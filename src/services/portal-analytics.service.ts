/**
 * Portal Analytics Service
 *
 * WHY: Provides platform-wide analytics data for the portal dashboard
 * HOW: Aggregates data across ALL organizations for platform-level insights
 *
 * ARCHITECTURE:
 * - Each function returns data in the exact format required by portal charts
 * - Data is grouped by month for time-series visualization
 * - All amounts are in cents (consistent with transaction model)
 *
 * SOURCE OF TRUTH KEYWORDS: PortalAnalytics, PlatformMetrics, PortalDashboard
 */

import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/config'
import { stripe } from '@/lib/config/stripe'
import { PLANS, getStripeTransactionFee, type PlanKey } from '@/lib/config/feature-gates'
import { DEFAULT_CURRENCY } from '@/constants/currencies'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Date range for filtering analytics data
 * SOURCE OF TRUTH: PortalDateRange
 */
export interface PortalDateRange {
  from: Date
  to: Date
}

/**
 * Monthly MRR data point for Portal MRR Chart
 * SOURCE OF TRUTH: PortalMRRDataPoint
 */
export interface PortalMRRDataPoint {
  month: string // Format: "Mon YYYY" (e.g., "Jan 2025")
  actual: number // Actual MRR in cents (aggregated across all orgs)
  projected: number // Projected growth (calculated)
}

/**
 * Monthly activity data point for Portal Activity Chart
 * SOURCE OF TRUTH: PortalActivityDataPoint
 *
 * WHY: Activity log-based tracking shows ACTUAL app usage
 * - Activities = create/update/delete actions (direct measure of platform engagement)
 * - Active Users = unique users with activities (platform stickiness)
 * - New Users = growth metric (platform acquisition)
 *
 * HOW: Queries ActivityLog table which tracks every create/update/delete
 * action across the platform via the activity-log.service.ts
 */
export interface PortalActivityDataPoint {
  month: string
  activities: number // Number of create/update/delete actions (direct measure of app usage)
  activeUsers: number // Unique users who performed actions (platform stickiness)
  newUsers: number // New users signed up (platform growth)
}

/**
 * Monthly churn data point for Portal Churn Chart
 * SOURCE OF TRUTH: PortalChurnDataPoint
 */
export interface PortalChurnDataPoint {
  month: string
  churned: number // Number of canceled subscriptions
  active: number // Number of active subscriptions
}

/**
 * Monthly platform fees data point
 * SOURCE OF TRUTH: PortalFeesDataPoint
 */
export interface PortalFeesDataPoint {
  month: string
  fees: number // Platform fees earned in cents
  transactions: number // Number of transactions that generated fees
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format date to "Mon YYYY" string (e.g., "Jan 2025")
 */
function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/**
 * Generate array of months between two dates
 */
function getMonthsBetween(from: Date, to: Date): Date[] {
  const months: Date[] = []
  const current = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)

  while (current <= end) {
    months.push(new Date(current))
    current.setMonth(current.getMonth() + 1)
  }

  return months
}

/**
 * Get default date range (last 12 months)
 */
export function getDefaultPortalDateRange(): PortalDateRange {
  const to = new Date()
  const from = new Date()
  from.setMonth(from.getMonth() - 11) // Last 12 months including current
  from.setDate(1) // Start of month

  return { from, to }
}

/**
 * Map subscription plan to tier for fee calculation
 * Subscription.plan stores the tier key (e.g., 'free', 'starter', 'pro')
 */
function getPlanTier(plan: string): PlanKey {
  const validTiers: PlanKey[] = ['free', 'starter', 'pro', 'enterprise', 'portal']
  if (validTiers.includes(plan as PlanKey)) {
    return plan as PlanKey
  }
  return 'free' // Default to free tier if unknown
}

// ============================================================================
// PLATFORM CURRENCY (FROM STRIPE PLATFORM ACCOUNT)
// ============================================================================

/**
 * Internal function to fetch the platform's Stripe account currency.
 * Wrapped with React cache() for request-level deduplication.
 *
 * SOURCE OF TRUTH: PlatformStripeCurrency
 */
async function fetchPlatformCurrency(): Promise<string> {
  try {
    // Retrieve the platform's own Stripe account (no accountId = platform account)
    const account = await stripe.accounts.retrieve()

    // Return the default currency from the platform's Stripe account
    // Falls back to DEFAULT_CURRENCY if not set
    return account.default_currency?.toLowerCase() || DEFAULT_CURRENCY
  } catch (error) {
    console.error('[Portal] Failed to fetch platform Stripe account:', error)
    // Fallback to USD if Stripe call fails
    return DEFAULT_CURRENCY
  }
}

/**
 * Get the platform's currency from the Stripe platform account.
 *
 * WHY: Portal displays platform-wide revenue metrics. The currency should
 * match the platform's Stripe account currency for accuracy.
 *
 * HOW: Fetches the platform's Stripe account and returns its default_currency.
 * Uses React cache() for request-level deduplication.
 *
 * CACHING: Cached at request level. Multiple calls within a single request
 * will only hit Stripe once.
 *
 * @returns ISO 4217 lowercase currency code (e.g., 'usd', 'aed', 'eur')
 */
export const getPlatformCurrency = cache(fetchPlatformCurrency)

// ============================================================================
// PORTAL MRR (PLATFORM-WIDE RECURRING REVENUE)
// ============================================================================

/**
 * Cached function to fetch Stripe prices for all plans
 *
 * WHY: Avoid repeated Stripe API calls for the same price data
 * HOW: Fetches all plan prices once and caches at request level
 *
 * SOURCE OF TRUTH: PlanStripePrices
 *
 * @returns Map of plan key -> monthly price in cents
 */
async function fetchPlanPrices(): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>()

  // Collect all Stripe price IDs from PLANS config
  const planPriceIds: Array<{ planKey: string; priceId: string; isYearly: boolean }> = []

  Object.entries(PLANS).forEach(([planKey, plan]) => {
    if (plan.stripe.monthly) {
      planPriceIds.push({ planKey, priceId: plan.stripe.monthly, isYearly: false })
    } else if (plan.stripe.yearly) {
      // If no monthly price, use yearly and divide by 12
      planPriceIds.push({ planKey, priceId: plan.stripe.yearly, isYearly: true })
    }
  })

  // Fetch all prices from Stripe in parallel
  const pricePromises = planPriceIds.map(async ({ planKey, priceId, isYearly }) => {
    try {
      const price = await stripe.prices.retrieve(priceId)
      // Convert yearly to monthly if needed
      const monthlyAmount = isYearly
        ? Math.round((price.unit_amount || 0) / 12)
        : (price.unit_amount || 0)
      return { planKey, amount: monthlyAmount }
    } catch (error) {
      console.error(`[Portal] Failed to fetch price for plan ${planKey}:`, error)
      return { planKey, amount: 0 }
    }
  })

  const results = await Promise.all(pricePromises)
  results.forEach(({ planKey, amount }) => {
    priceMap.set(planKey, amount)
  })

  return priceMap
}

/**
 * Cached version of fetchPlanPrices - request-level deduplication
 */
export const getPlanPrices = cache(fetchPlanPrices)

/**
 * Get Platform-Wide Monthly Recurring Revenue (MRR)
 *
 * SOURCE OF TRUTH: PortalMRRData, PlatformMRR
 *
 * WHY: Shows total MRR/ARR based on ACTIVE subscriptions
 * HOW: Fetches all active subscriptions, maps to plan prices from Stripe,
 *      and calculates monthly recurring revenue.
 *
 * CALCULATION:
 * - MRR = Sum of (subscription plan monthly price) for all active subscriptions
 * - ARR = MRR * 12
 *
 * ACTIVE SUBSCRIPTIONS = status IN ('active', 'trialing') AND NOT cancelAtPeriodEnd
 *
 * @param dateRange - Date range for historical chart (defaults to last 12 months)
 * @returns MRR data with monthly breakdown and totals
 */
export async function getPortalMRRData(
  dateRange?: PortalDateRange
): Promise<{
  data: PortalMRRDataPoint[]
  totals: {
    mrr: number
    arr: number
    mrrChange: number
    arrChange: number
  }
}> {
  const range = dateRange ?? getDefaultPortalDateRange()
  const months = getMonthsBetween(range.from, range.to)

  // Get plan prices from Stripe (cached at request level)
  const planPrices = await getPlanPrices()

  // Get ALL subscriptions - we need to know when they became active
  const allSubscriptions = await prisma.subscription.findMany({
    select: {
      plan: true,
      status: true,
      cancelAtPeriodEnd: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  // Initialize monthly buckets
  const monthlyMRR = new Map<string, number>()
  months.forEach((month) => {
    monthlyMRR.set(formatMonthYear(month), 0)
  })

  // For each month, calculate MRR based on subscriptions active at that time
  // This is a simplification: we assume if a subscription exists and is active,
  // it contributes to MRR from its createdAt date forward
  months.forEach((monthDate) => {
    const monthKey = formatMonthYear(monthDate)
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59)

    let monthMRR = 0

    allSubscriptions.forEach((sub) => {
      // Was this subscription created before or during this month?
      if (sub.createdAt <= monthEnd) {
        // Is it currently active or was it active during this month?
        // For simplicity: if status is active/trialing now and not cancelled, count it
        // For historical accuracy, we'd need subscription status history
        const isActive = sub.status === 'active' || sub.status === 'trialing'
        const isCancelled = sub.cancelAtPeriodEnd === true || sub.status === 'canceled'

        // If subscription was created before this month ended and is currently active
        if (isActive && !isCancelled) {
          const planPrice = planPrices.get(sub.plan) || 0
          monthMRR += planPrice
        }
      }
    })

    monthlyMRR.set(monthKey, monthMRR)
  })

  // Calculate current MRR (subscriptions active RIGHT NOW)
  let currentMRR = 0
  allSubscriptions.forEach((sub) => {
    const isActive = sub.status === 'active' || sub.status === 'trialing'
    const isCancelled = sub.cancelAtPeriodEnd === true || sub.status === 'canceled'

    if (isActive && !isCancelled) {
      const planPrice = planPrices.get(sub.plan) || 0
      currentMRR += planPrice
    }
  })

  // Convert to array and calculate projections
  const data: PortalMRRDataPoint[] = []
  let previousActual = 0

  monthlyMRR.forEach((actual, month) => {
    // Projected = growth estimate based on trend
    const projected = previousActual > 0
      ? Math.round((actual - previousActual) * 0.5) // 50% of growth continues
      : Math.round(actual * 0.1) // 10% growth projection for first month with data
    data.push({ month, actual, projected: Math.max(0, projected) })
    previousActual = actual
  })

  // Calculate period-over-period change (compare first half to second half of range)
  const midpoint = Math.floor(data.length / 2)
  const firstHalf = data.slice(0, midpoint)
  const secondHalf = data.slice(midpoint)

  const firstHalfAvg = firstHalf.length > 0
    ? firstHalf.reduce((sum, d) => sum + d.actual, 0) / firstHalf.length
    : 0
  const secondHalfAvg = secondHalf.length > 0
    ? secondHalf.reduce((sum, d) => sum + d.actual, 0) / secondHalf.length
    : 0

  const mrrChange = firstHalfAvg > 0
    ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
    : secondHalfAvg > 0
      ? 100
      : 0

  return {
    data,
    totals: {
      mrr: currentMRR,
      arr: currentMRR * 12,
      mrrChange: Math.round(mrrChange * 10) / 10,
      arrChange: Math.round(mrrChange * 10) / 10,
    },
  }
}

// ============================================================================
// PORTAL ACTIVITY (PLATFORM-WIDE USER ACTIVITY)
// ============================================================================

/**
 * Get Platform-Wide User Activity
 *
 * SOURCE OF TRUTH: PortalActivityData, PlatformUserEngagement
 *
 * WHY: Shows if users are ACTUALLY USING the platform
 * HOW: Queries ActivityLog table for real create/update/delete actions
 *
 * METRICS:
 * - Activities: Number of create/update/delete actions (direct measure of app usage)
 * - Active Users: Unique users with activity (platform stickiness)
 * - New Users: User signups (platform growth)
 *
 * @param dateRange - Date range to filter (defaults to last 12 months)
 * @returns Array of monthly activity data points
 */
export async function getPortalActivityData(
  dateRange?: PortalDateRange
): Promise<{
  data: PortalActivityDataPoint[]
  totals: {
    totalActivities: number
    totalActiveUsers: number
    totalNewUsers: number
    activityChange: number
  }
}> {
  const range = dateRange ?? getDefaultPortalDateRange()
  const months = getMonthsBetween(range.from, range.to)

  // Run queries in parallel for better performance
  const [activities, newUsers] = await Promise.all([
    // Get all activity logs in date range (direct measure of app usage)
    // Each activity = one create/update/delete action
    prisma.activityLog.findMany({
      where: {
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      select: {
        createdAt: true,
        userId: true,
      },
    }),
    // Get new users in date range (platform growth)
    prisma.user.findMany({
      where: {
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      select: {
        createdAt: true,
      },
    }),
  ])

  // Initialize monthly buckets
  const monthlyActivities = new Map<string, number>()
  const monthlyActiveUsers = new Map<string, Set<string>>()
  const monthlyNewUsers = new Map<string, number>()

  months.forEach((month) => {
    const key = formatMonthYear(month)
    monthlyActivities.set(key, 0)
    monthlyActiveUsers.set(key, new Set())
    monthlyNewUsers.set(key, 0)
  })

  // Group activities by month and track unique users
  // Type annotation for when ActivityLog model is not yet in Prisma
  activities.forEach((activity: { createdAt: Date; userId: string }) => {
    const monthKey = formatMonthYear(activity.createdAt)
    if (monthlyActivities.has(monthKey)) {
      // Count total activities (create/update/delete actions)
      monthlyActivities.set(monthKey, (monthlyActivities.get(monthKey) || 0) + 1)
      // Track unique users (for active users count)
      monthlyActiveUsers.get(monthKey)?.add(activity.userId)
    }
  })

  // Group new users by month
  newUsers.forEach((user: { createdAt: Date }) => {
    const monthKey = formatMonthYear(user.createdAt)
    if (monthlyNewUsers.has(monthKey)) {
      monthlyNewUsers.set(monthKey, (monthlyNewUsers.get(monthKey) || 0) + 1)
    }
  })

  // Convert to array
  const data: PortalActivityDataPoint[] = []
  monthlyActivities.forEach((activityCount, month) => {
    data.push({
      month,
      activities: activityCount,
      activeUsers: monthlyActiveUsers.get(month)?.size || 0,
      newUsers: monthlyNewUsers.get(month) || 0,
    })
  })

  // Calculate totals
  const totalActivities = data.reduce((sum, d) => sum + d.activities, 0)
  // Total active users = unique users across ALL months (not sum of monthly)
  const allActiveUserIds = new Set<string>()
  activities.forEach((a: { userId: string }) => allActiveUserIds.add(a.userId))
  const totalActiveUsers = allActiveUserIds.size
  const totalNewUsers = data.reduce((sum, d) => sum + d.newUsers, 0)

  // Calculate activity change (based on activities - primary engagement metric)
  const midpoint = Math.floor(data.length / 2)
  const firstHalf = data.slice(0, midpoint)
  const secondHalf = data.slice(midpoint)

  const firstHalfActivities = firstHalf.reduce((sum, d) => sum + d.activities, 0)
  const secondHalfActivities = secondHalf.reduce((sum, d) => sum + d.activities, 0)

  const activityChange =
    firstHalfActivities > 0
      ? ((secondHalfActivities - firstHalfActivities) / firstHalfActivities) * 100
      : secondHalfActivities > 0
        ? 100
        : 0

  return {
    data,
    totals: {
      totalActivities,
      totalActiveUsers,
      totalNewUsers,
      activityChange: Math.round(activityChange * 10) / 10,
    },
  }
}

// ============================================================================
// PORTAL CHURN (PLATFORM-WIDE SUBSCRIPTION CHURN)
// ============================================================================

/**
 * Get Platform-Wide Subscription Health Data
 *
 * WHY: Shows subscription health across the platform (active vs churned)
 * HOW: Gets ALL subscriptions and groups by current status + tracks churn events
 *
 * IMPORTANT: This tracks subscriptions (billing accounts), not transactions.
 * A subscription can be:
 * - active/trialing: Currently paying or in trial
 * - canceled/past_due/unpaid: Churned or at risk
 *
 * The chart shows:
 * - Active: Count of currently active subscriptions
 * - Churned: Count of subscriptions that churned (by when they were last updated)
 *
 * @param dateRange - Date range for tracking churn events (defaults to last 12 months)
 * @returns Array of monthly subscription health data points
 */
export async function getPortalChurnData(
  dateRange?: PortalDateRange
): Promise<{
  data: PortalChurnDataPoint[]
  totals: {
    totalChurned: number
    totalActive: number
    churnRate: number
    churnChange: number
  }
}> {
  const range = dateRange ?? getDefaultPortalDateRange()
  const months = getMonthsBetween(range.from, range.to)

  // Get ALL subscriptions (not filtered by date - we want current totals)
  const allSubscriptions = await prisma.subscription.findMany({
    select: {
      createdAt: true,
      updatedAt: true,
      status: true,
      cancelAtPeriodEnd: true,
    },
  })

  // Count current totals
  let currentActive = 0
  let currentChurned = 0

  // Track churn events by month (when subscriptions transitioned to churned state)
  const monthlyChurned = new Map<string, number>()
  const monthlyNewActive = new Map<string, number>()

  months.forEach((month) => {
    const key = formatMonthYear(month)
    monthlyChurned.set(key, 0)
    monthlyNewActive.set(key, 0)
  })

  // Categorize subscriptions
  allSubscriptions.forEach((sub) => {
    // Churned = canceled, past_due, unpaid, incomplete_expired, or marked for cancellation
    const isChurned =
      sub.status === 'canceled' ||
      sub.status === 'past_due' ||
      sub.status === 'unpaid' ||
      sub.status === 'incomplete_expired' ||
      sub.cancelAtPeriodEnd === true

    // Active = active or trialing
    const isActive = sub.status === 'active' || sub.status === 'trialing'

    if (isChurned) {
      currentChurned++
      // Track when the subscription churned (use updatedAt as proxy for churn date)
      const churnMonthKey = formatMonthYear(sub.updatedAt)
      if (monthlyChurned.has(churnMonthKey)) {
        monthlyChurned.set(churnMonthKey, (monthlyChurned.get(churnMonthKey) || 0) + 1)
      }
    } else if (isActive) {
      currentActive++
      // Track when subscription became active (createdAt)
      const activeMonthKey = formatMonthYear(sub.createdAt)
      if (monthlyNewActive.has(activeMonthKey)) {
        monthlyNewActive.set(activeMonthKey, (monthlyNewActive.get(activeMonthKey) || 0) + 1)
      }
    }
  })

  // Build running totals for the chart (cumulative view)
  // This shows how many subscriptions were active/churned up to each month
  const data: PortalChurnDataPoint[] = []
  let runningActive = 0
  let runningChurned = 0

  // Sort months chronologically and build cumulative data
  const sortedMonths = Array.from(monthlyChurned.keys())
  sortedMonths.forEach((month) => {
    runningActive += monthlyNewActive.get(month) || 0
    runningChurned += monthlyChurned.get(month) || 0

    data.push({
      month,
      churned: runningChurned,
      active: runningActive,
    })
  })

  // Use current totals (not cumulative sums from chart data)
  // These represent the actual current state of all subscriptions
  const totalChurned = currentChurned
  const totalActive = currentActive

  // Churn rate = churned / (active + churned) * 100
  // This shows what percentage of all subscriptions ever created have churned
  const churnRate =
    totalActive + totalChurned > 0
      ? (totalChurned / (totalActive + totalChurned)) * 100
      : 0

  // Calculate churn change (comparing recent period to earlier period)
  const midpoint = Math.floor(months.length / 2)
  const firstHalfMonths = sortedMonths.slice(0, midpoint)
  const secondHalfMonths = sortedMonths.slice(midpoint)

  const firstHalfChurned = firstHalfMonths.reduce(
    (sum, m) => sum + (monthlyChurned.get(m) || 0),
    0
  )
  const secondHalfChurned = secondHalfMonths.reduce(
    (sum, m) => sum + (monthlyChurned.get(m) || 0),
    0
  )

  // Negative change is GOOD for churn (less churn)
  const churnChange =
    firstHalfChurned > 0
      ? ((secondHalfChurned - firstHalfChurned) / firstHalfChurned) * 100
      : secondHalfChurned > 0
        ? 100
        : 0

  return {
    data,
    totals: {
      totalChurned,
      totalActive,
      churnRate: Math.round(churnRate * 10) / 10,
      churnChange: Math.round(churnChange * 10) / 10,
    },
  }
}

// ============================================================================
// PORTAL PLATFORM FEES (REVENUE FROM TRANSACTION FEES)
// ============================================================================

/**
 * Get Platform Fees Data
 *
 * WHY: Shows total platform fees earned from transactions
 * HOW: Calculates fees based on transaction amounts and organization tiers
 *
 * FEES BY TIER:
 * - free: 10% platform fee
 * - starter: 7% platform fee
 * - pro: 5% platform fee
 * - enterprise: 3% platform fee
 * - portal: 0% platform fee
 *
 * @param dateRange - Date range to filter (defaults to last 12 months)
 * @returns Array of monthly fees data points
 */
export async function getPortalFeesData(
  dateRange?: PortalDateRange
): Promise<{
  data: PortalFeesDataPoint[]
  totals: {
    totalFees: number
    totalTransactions: number
    feeChange: number
  }
}> {
  const range = dateRange ?? getDefaultPortalDateRange()
  const months = getMonthsBetween(range.from, range.to)

  // Get all paid transactions with their organization's subscription
  const transactions = await prisma.transaction.findMany({
    where: {
      paymentStatus: { in: ['PAID', 'ACTIVE', 'PARTIALLY_PAID'] },
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      paidAmount: true,
      createdAt: true,
      organizationId: true,
    },
  })

  // Get organization tiers (subscriptions)
  const orgIds = [...new Set(transactions.map((tx) => tx.organizationId))]
  const subscriptions = await prisma.subscription.findMany({
    where: {
      referenceId: { in: orgIds },
    },
    select: {
      referenceId: true,
      plan: true,
    },
  })

  // Create org -> tier map
  const orgTierMap = new Map<string, PlanKey>()
  subscriptions.forEach((sub) => {
    orgTierMap.set(sub.referenceId, getPlanTier(sub.plan))
  })

  // Initialize monthly buckets
  const monthlyFees = new Map<string, number>()
  const monthlyTransactionCount = new Map<string, number>()

  months.forEach((month) => {
    const key = formatMonthYear(month)
    monthlyFees.set(key, 0)
    monthlyTransactionCount.set(key, 0)
  })

  // Calculate fees for each transaction
  transactions.forEach((tx) => {
    const monthKey = formatMonthYear(tx.createdAt)
    if (!monthlyFees.has(monthKey)) return

    // Get tier for this org (default to 'free' if no subscription found)
    const tier = orgTierMap.get(tx.organizationId) || 'free'
    const feeConfig = getStripeTransactionFee(tier)

    // Calculate fee (percentage + fixed)
    const fee = Math.round(tx.paidAmount * feeConfig.percentage) + feeConfig.fixedCents

    monthlyFees.set(monthKey, (monthlyFees.get(monthKey) || 0) + fee)
    monthlyTransactionCount.set(
      monthKey,
      (monthlyTransactionCount.get(monthKey) || 0) + 1
    )
  })

  // Convert to array
  const data: PortalFeesDataPoint[] = []
  monthlyFees.forEach((fees, month) => {
    data.push({
      month,
      fees,
      transactions: monthlyTransactionCount.get(month) || 0,
    })
  })

  // Calculate totals
  const totalFees = data.reduce((sum, d) => sum + d.fees, 0)
  const totalTransactions = data.reduce((sum, d) => sum + d.transactions, 0)

  // Calculate fee change
  const midpoint = Math.floor(data.length / 2)
  const firstHalf = data.slice(0, midpoint)
  const secondHalf = data.slice(midpoint)

  const firstHalfFees = firstHalf.reduce((sum, d) => sum + d.fees, 0)
  const secondHalfFees = secondHalf.reduce((sum, d) => sum + d.fees, 0)

  const feeChange =
    firstHalfFees > 0
      ? ((secondHalfFees - firstHalfFees) / firstHalfFees) * 100
      : secondHalfFees > 0
        ? 100
        : 0

  return {
    data,
    totals: {
      totalFees,
      totalTransactions,
      feeChange: Math.round(feeChange * 10) / 10,
    },
  }
}

// ============================================================================
// PORTAL DASHBOARD SUMMARY
// ============================================================================

/**
 * Get Portal Dashboard Summary (all metrics at once)
 *
 * SOURCE OF TRUTH: PortalDashboardSummary
 *
 * WHY: Efficient single call for all portal dashboard data
 * HOW: Parallel queries for all key metrics
 *
 * @param dateRange - Date range to filter
 */
// ============================================================================
// ONBOARDING SURVEY AGGREGATION TYPES
// ============================================================================

/**
 * A single category bucket with its raw value, display label, and count
 * SOURCE OF TRUTH: OnboardingSurveyCategoryItem
 */
export interface OnboardingSurveyCategoryItem {
  value: string
  label: string
  count: number
}

/**
 * Aggregated onboarding survey data across all organizations
 * SOURCE OF TRUTH: OnboardingSurveyAggregates
 */
export interface OnboardingSurveyAggregates {
  totalOrganizations: number
  referralSource: OnboardingSurveyCategoryItem[]
  role: OnboardingSurveyCategoryItem[]
  teamSize: OnboardingSurveyCategoryItem[]
  intendedUse: OnboardingSurveyCategoryItem[]
}

// ============================================================================
// LABEL MAPS — Human-readable labels for onboarding survey values
// ============================================================================

const REFERRAL_SOURCE_LABELS: Record<string, string> = {
  search: 'Search Engine',
  social: 'Social Media',
  friend: 'Friend or Colleague',
  blog: 'Blog or Article',
  advertisement: 'Advertisement',
  other: 'Other',
}

const ROLE_LABELS: Record<string, string> = {
  business_owner: 'Business Owner',
  team_member: 'Team Member',
  freelancer: 'Freelancer',
  student: 'Student',
}

const TEAM_SIZE_LABELS: Record<string, string> = {
  solo: 'Just me',
  '2_10': '2-10 people',
  '11_50': '11-50 people',
  '50_plus': '50+ people',
}

const INTENDED_USE_LABELS: Record<string, string> = {
  client_management: 'Client Management',
  marketing: 'Marketing & Automation',
  payments: 'Online Payments',
  all: 'Everything',
}

// ============================================================================
// GET ONBOARDING SURVEY DATA
// ============================================================================

/**
 * Aggregate onboarding survey data across all non-portal organizations
 *
 * WHY: Portal owners need to understand who their users are and where they come from
 * HOW: Queries all org metadata JSON, parses survey fields, counts occurrences per category
 *
 * SOURCE OF TRUTH: getOnboardingSurveyData
 */
export const getOnboardingSurveyData = cache(
  async (): Promise<OnboardingSurveyAggregates> => {
    // Fetch all non-portal organizations that have metadata
    const organizations = await prisma.organization.findMany({
      where: {
        isPortalOrganization: false,
        metadata: { not: null },
      },
      select: { metadata: true },
    })

    // Counters for each survey field
    const referralCounts: Record<string, number> = {}
    const roleCounts: Record<string, number> = {}
    const teamSizeCounts: Record<string, number> = {}
    const intendedUseCounts: Record<string, number> = {}

    // Parse each org's metadata and tally up the survey responses
    for (const org of organizations) {
      if (!org.metadata) continue

      try {
        const parsed = JSON.parse(org.metadata) as Record<string, unknown>

        if (typeof parsed.referralSource === 'string' && parsed.referralSource) {
          referralCounts[parsed.referralSource] = (referralCounts[parsed.referralSource] || 0) + 1
        }
        if (typeof parsed.role === 'string' && parsed.role) {
          roleCounts[parsed.role] = (roleCounts[parsed.role] || 0) + 1
        }
        if (typeof parsed.teamSize === 'string' && parsed.teamSize) {
          teamSizeCounts[parsed.teamSize] = (teamSizeCounts[parsed.teamSize] || 0) + 1
        }
        if (typeof parsed.intendedUse === 'string' && parsed.intendedUse) {
          intendedUseCounts[parsed.intendedUse] = (intendedUseCounts[parsed.intendedUse] || 0) + 1
        }
      } catch {
        // Skip orgs with invalid JSON metadata
        continue
      }
    }

    /** Convert a counts map into a sorted array of category items */
    const toSortedArray = (
      counts: Record<string, number>,
      labels: Record<string, string>
    ): OnboardingSurveyCategoryItem[] =>
      Object.entries(counts)
        .map(([value, count]) => ({
          value,
          label: labels[value] || value,
          count,
        }))
        .sort((a, b) => b.count - a.count) // Highest count first

    return {
      totalOrganizations: organizations.length,
      referralSource: toSortedArray(referralCounts, REFERRAL_SOURCE_LABELS),
      role: toSortedArray(roleCounts, ROLE_LABELS),
      teamSize: toSortedArray(teamSizeCounts, TEAM_SIZE_LABELS),
      intendedUse: toSortedArray(intendedUseCounts, INTENDED_USE_LABELS),
    }
  }
)

// ============================================================================
// PORTAL DASHBOARD SUMMARY
// ============================================================================

export async function getPortalDashboardSummary(
  dateRange?: PortalDateRange
): Promise<{
  mrr: number
  arr: number
  totalActivities: number
  totalActiveUsers: number
  churnRate: number
  totalFees: number
}> {
  const range = dateRange ?? getDefaultPortalDateRange()

  const [mrrResult, activityResult, churnResult, feesResult] = await Promise.all([
    getPortalMRRData(range),
    getPortalActivityData(range),
    getPortalChurnData(range),
    getPortalFeesData(range),
  ])

  return {
    mrr: mrrResult.totals.mrr,
    arr: mrrResult.totals.arr,
    totalActivities: activityResult.totals.totalActivities,
    totalActiveUsers: activityResult.totals.totalActiveUsers,
    churnRate: churnResult.totals.churnRate,
    totalFees: feesResult.totals.totalFees,
  }
}
