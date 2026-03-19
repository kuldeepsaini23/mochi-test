/**
 * Dashboard Analytics Service
 *
 * WHY: Provides analytics data for dashboard charts from real transaction data
 * HOW: Aggregates transaction data by month for visualization
 *
 * ARCHITECTURE:
 * - Each function returns data in the exact format required by charts
 * - Data is grouped by month for time-series visualization
 * - All amounts are in cents (consistent with transaction model)
 *
 * SOURCE OF TRUTH KEYWORDS: DashboardAnalytics, ChartData, RevenueMetrics
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { Prisma } from '@/generated/prisma'

// ============================================================================
// PLATFORM PAYMENT FILTER
// ============================================================================

/**
 * Application-level filter that EXCLUDES platform-currency transactions.
 * WHY: Platform payments (template sales, future merch, affiliates) use platform
 * currency (e.g., USD) and must NOT be mixed into the seller's connect-account
 * revenue charts (which are in the seller's Stripe currency, e.g., CAD).
 *
 * WHY NOT PRISMA: Prisma's JSON path filter generates SQL like
 * NOT (metadata#>'{key}' = 'true'::jsonb). When the key doesn't exist,
 * the #> path extraction returns NULL, and NOT(NULL) = NULL in SQL 3-valued
 * logic, which EXCLUDES the row. This incorrectly filters out ALL non-platform
 * transactions. PostgreSQL's @> containment operator works correctly but Prisma
 * doesn't use it. So we filter in JS after fetching — simple and correct.
 *
 * SOURCE OF TRUTH KEYWORDS: PlatformPaymentFilter, ExcludePlatformPayments
 */
function excludePlatformPayments<T extends { metadata: unknown }>(
  transactions: T[]
): T[] {
  return transactions.filter((tx) => {
    const meta = tx.metadata as Record<string, unknown> | null
    return meta?.platformPayment !== true
  })
}

/**
 * Prisma JSON filter that ONLY includes platform-currency transactions.
 * WHY: The marketplace chart needs to show ONLY platform-currency earnings
 * (template sales, future merch, affiliates) — the inverse of the main charts.
 *
 * SOURCE OF TRUTH KEYWORDS: PlatformPaymentOnlyFilter, IncludePlatformPayments
 */
const ONLY_PLATFORM_PAYMENTS: Prisma.TransactionWhereInput = {
  metadata: {
    path: ['platformPayment'],
    equals: true,
  },
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Date range for filtering analytics data
 * SOURCE OF TRUTH: DashboardDateRange
 */
export interface DashboardDateRange {
  from: Date
  to: Date
}

/**
 * Monthly revenue data point for Chart01 (Recurring Revenue)
 * SOURCE OF TRUTH: RecurringRevenueDataPoint
 */
export interface RecurringRevenueDataPoint {
  month: string // Format: "Mon YYYY" (e.g., "Jan 2025")
  actual: number // Actual MRR/ARR in cents
  projected: number // Projected growth (calculated)
}

/**
 * Monthly revenue data point for Chart02 (Total Revenue)
 * SOURCE OF TRUTH: TotalRevenueDataPoint
 */
export interface TotalRevenueDataPoint {
  month: string
  actual: number // Total revenue in cents
  projected: number // Previous period for comparison
}

/**
 * Affiliate referrals data point for Chart04
 * SOURCE OF TRUTH: AffiliateReferralsDataPoint
 */
export interface AffiliateReferralsDataPoint {
  month: string
  actual: number // Number of referral leads
  converted: number // Number that converted to customers
}

/**
 * Platform revenue data point for Chart06 (Marketplace Earnings)
 * Shows gross revenue, platform fees, and net income for platform-currency transactions.
 *
 * SOURCE OF TRUTH: PlatformRevenueDataPoint
 */
export interface PlatformRevenueDataPoint {
  month: string
  gross: number // Gross amount in platform currency (cents)
  fees: number // Platform fees deducted (cents)
  net: number // Net income after fees (cents)
}

/**
 * Sales breakdown by product/type for Chart05
 * SOURCE OF TRUTH: SalesBreakdownDataPoint
 */
export interface SalesBreakdownDataPoint {
  month: string
  oneTime: number // One-time payments count/amount
  recurring: number // Recurring subscriptions count/amount
  splitPayment: number // Split payment count/amount
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
export function getDefaultDateRange(): DashboardDateRange {
  const to = new Date()
  const from = new Date()
  from.setMonth(from.getMonth() - 11) // Last 12 months including current
  from.setDate(1) // Start of month

  return { from, to }
}

// ============================================================================
// CHART 01: RECURRING REVENUE (MRR/ARR)
// ============================================================================

/**
 * Get Monthly Recurring Revenue (MRR) data
 *
 * WHY: Chart01 shows MRR/ARR trends over time
 * HOW: Aggregates paidAmount from RECURRING billing type transactions
 *
 * @param organizationId - Organization to fetch data for
 * @param dateRange - Date range to filter (defaults to last 12 months)
 * @returns Array of monthly MRR data points
 */
export async function getRecurringRevenueData(
  organizationId: string,
  dateRange?: DashboardDateRange
): Promise<{
  data: RecurringRevenueDataPoint[]
  totals: {
    mrr: number
    arr: number
    mrrChange: number
    arrChange: number
  }
}> {
  const range = dateRange ?? getDefaultDateRange()
  const months = getMonthsBetween(range.from, range.to)

  /**
   * Get recurring transactions grouped by month.
   * Platform-currency transactions (template sales, merch, affiliates) are
   * filtered out in JS after fetching — see excludePlatformPayments() for why.
   */
  const rawTransactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      billingType: 'RECURRING',
      paymentStatus: { in: ['ACTIVE', 'PAID', 'PARTIALLY_PAID'] },
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      paidAmount: true,
      createdAt: true,
      metadata: true,
    },
  })
  const transactions = excludePlatformPayments(rawTransactions)

  // Group by month
  const monthlyData = new Map<string, number>()
  months.forEach((month) => {
    monthlyData.set(formatMonthYear(month), 0)
  })

  transactions.forEach((tx) => {
    const monthKey = formatMonthYear(tx.createdAt)
    if (monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, (monthlyData.get(monthKey) || 0) + tx.paidAmount)
    }
  })

  // Convert to array and calculate projections
  const data: RecurringRevenueDataPoint[] = []
  let previousActual = 0

  monthlyData.forEach((actual, month) => {
    // Projected is based on previous month's growth
    const projected = previousActual > 0 ? Math.round(actual * 0.1) : Math.round(actual * 0.15)
    data.push({ month, actual, projected })
    previousActual = actual
  })

  /**
   * Calculate period-over-period change
   * WHY: Comparing last month to second-to-last often shows 0% with sparse data
   * HOW: Compare first half of period to second half for meaningful trend
   */
  const midpoint = Math.floor(data.length / 2)
  const firstHalf = data.slice(0, midpoint)
  const secondHalf = data.slice(midpoint)

  const firstHalfSum = firstHalf.reduce((sum, d) => sum + d.actual, 0)
  const secondHalfSum = secondHalf.reduce((sum, d) => sum + d.actual, 0)

  // Calculate change: positive = growth, negative = decline
  const mrrChange = firstHalfSum > 0
    ? ((secondHalfSum - firstHalfSum) / firstHalfSum) * 100
    : secondHalfSum > 0 ? 100 : 0

  // Current MRR = most recent month with data, or last month
  const currentMRR = [...data].reverse().find(d => d.actual > 0)?.actual || data[data.length - 1]?.actual || 0

  return {
    data,
    totals: {
      mrr: currentMRR,
      arr: currentMRR * 12,
      mrrChange: Math.round(mrrChange * 10) / 10, // Round to 1 decimal
      arrChange: Math.round(mrrChange * 10) / 10,
    },
  }
}

// ============================================================================
// CHART 02: TOTAL REVENUE
// ============================================================================

/**
 * Get Total Revenue data
 *
 * WHY: Chart02 shows total revenue trends (renamed from Active Subscribers)
 * HOW: Aggregates paidAmount from ALL paid transactions
 *
 * @param organizationId - Organization to fetch data for
 * @param dateRange - Date range to filter
 * @returns Array of monthly total revenue data points
 */
export async function getTotalRevenueData(
  organizationId: string,
  dateRange?: DashboardDateRange
): Promise<{
  data: TotalRevenueDataPoint[]
  totals: {
    totalRevenue: number
    change: number
  }
}> {
  const range = dateRange ?? getDefaultDateRange()
  const months = getMonthsBetween(range.from, range.to)

  /**
   * Get all paid transactions grouped by month.
   * Platform-currency transactions are filtered out in JS after fetching —
   * see excludePlatformPayments() for why Prisma JSON path filters fail here.
   */
  const rawTransactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      paymentStatus: { in: ['PAID', 'ACTIVE', 'PARTIALLY_PAID'] },
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      paidAmount: true,
      refundedAmount: true,
      createdAt: true,
      metadata: true,
    },
  })
  const transactions = excludePlatformPayments(rawTransactions)

  // Group by month (net revenue = paid - refunded)
  const monthlyData = new Map<string, number>()
  months.forEach((month) => {
    monthlyData.set(formatMonthYear(month), 0)
  })

  transactions.forEach((tx) => {
    const monthKey = formatMonthYear(tx.createdAt)
    const netAmount = tx.paidAmount - tx.refundedAmount
    if (monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, (monthlyData.get(monthKey) || 0) + netAmount)
    }
  })

  // Convert to array with previous period as "projected"
  const data: TotalRevenueDataPoint[] = []
  let previousActual = 0

  monthlyData.forEach((actual, month) => {
    data.push({
      month,
      actual,
      projected: previousActual, // Use previous month for comparison
    })
    previousActual = actual
  })

  // Calculate totals
  const totalRevenue = data.reduce((sum, d) => sum + d.actual, 0)

  /**
   * Calculate period-over-period change
   * WHY: Comparing last month to second-to-last often shows 0% with sparse data
   * HOW: Compare first half of period to second half for meaningful trend
   */
  const midpoint = Math.floor(data.length / 2)
  const firstHalf = data.slice(0, midpoint)
  const secondHalf = data.slice(midpoint)

  const firstHalfSum = firstHalf.reduce((sum, d) => sum + d.actual, 0)
  const secondHalfSum = secondHalf.reduce((sum, d) => sum + d.actual, 0)

  // Calculate change: positive = growth, negative = decline
  const change = firstHalfSum > 0
    ? ((secondHalfSum - firstHalfSum) / firstHalfSum) * 100
    : secondHalfSum > 0 ? 100 : 0

  return {
    data,
    totals: {
      totalRevenue,
      change: Math.round(change * 10) / 10,
    },
  }
}

// ============================================================================
// CHART 04: AFFILIATE REFERRALS
// ============================================================================

/**
 * Get Affiliate Referrals data
 *
 * WHY: Chart04 shows referral leads and conversions (replaced Refunds)
 * HOW: Counts leads with source="Referral" and tracks conversions
 *
 * @param organizationId - Organization to fetch data for
 * @param dateRange - Date range to filter
 * @returns Array of monthly referral data points
 */
export async function getAffiliateReferralsData(
  organizationId: string,
  dateRange?: DashboardDateRange
): Promise<{
  data: AffiliateReferralsDataPoint[]
  totals: {
    totalReferrals: number
    totalConverted: number
    conversionRate: number
  }
}> {
  const range = dateRange ?? getDefaultDateRange()
  const months = getMonthsBetween(range.from, range.to)

  // Get referral leads grouped by month
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      source: { contains: 'Referral', mode: 'insensitive' },
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  })

  // Group by month
  const monthlyReferrals = new Map<string, number>()
  const monthlyConverted = new Map<string, number>()

  months.forEach((month) => {
    const key = formatMonthYear(month)
    monthlyReferrals.set(key, 0)
    monthlyConverted.set(key, 0)
  })

  leads.forEach((lead) => {
    const monthKey = formatMonthYear(lead.createdAt)
    if (monthlyReferrals.has(monthKey)) {
      monthlyReferrals.set(monthKey, (monthlyReferrals.get(monthKey) || 0) + 1)
      // Converted = status is ACTIVE (actively engaged/converted leads)
      if (lead.status === 'ACTIVE') {
        monthlyConverted.set(monthKey, (monthlyConverted.get(monthKey) || 0) + 1)
      }
    }
  })

  // Convert to array
  const data: AffiliateReferralsDataPoint[] = []
  monthlyReferrals.forEach((actual, month) => {
    data.push({
      month,
      actual,
      converted: monthlyConverted.get(month) || 0,
    })
  })

  // Calculate totals
  const totalReferrals = data.reduce((sum, d) => sum + d.actual, 0)
  const totalConverted = data.reduce((sum, d) => sum + d.converted, 0)
  const conversionRate = totalReferrals > 0 ? (totalConverted / totalReferrals) * 100 : 0

  return {
    data,
    totals: {
      totalReferrals,
      totalConverted,
      conversionRate: Math.round(conversionRate * 10) / 10,
    },
  }
}

// ============================================================================
// CHART 05: SALES BREAKDOWN BY BILLING TYPE
// ============================================================================

/**
 * Get Sales Breakdown by billing type
 *
 * WHY: Chart05 shows sales distribution across billing types
 * HOW: Groups transactions by billingType (ONE_TIME, RECURRING, SPLIT_PAYMENT)
 *
 * @param organizationId - Organization to fetch data for
 * @param dateRange - Date range to filter
 * @param mode - 'count' for transaction count, 'amount' for revenue
 * @returns Array of monthly sales breakdown data
 */
export async function getSalesBreakdownData(
  organizationId: string,
  dateRange?: DashboardDateRange,
  mode: 'count' | 'amount' = 'count'
): Promise<{
  data: SalesBreakdownDataPoint[]
  totals: {
    total: number
    oneTime: number
    recurring: number
    splitPayment: number
    change: number
  }
}> {
  const range = dateRange ?? getDefaultDateRange()
  const months = getMonthsBetween(range.from, range.to)

  /**
   * Get transactions grouped by billing type.
   * Platform-currency transactions are filtered out in JS after fetching —
   * see excludePlatformPayments() for why Prisma JSON path filters fail here.
   */
  const rawTransactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      paymentStatus: { in: ['PAID', 'ACTIVE', 'PARTIALLY_PAID'] },
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      billingType: true,
      paidAmount: true,
      createdAt: true,
      metadata: true,
    },
  })
  const transactions = excludePlatformPayments(rawTransactions)

  // Initialize monthly buckets
  const monthlyOneTime = new Map<string, number>()
  const monthlyRecurring = new Map<string, number>()
  const monthlySplit = new Map<string, number>()

  months.forEach((month) => {
    const key = formatMonthYear(month)
    monthlyOneTime.set(key, 0)
    monthlyRecurring.set(key, 0)
    monthlySplit.set(key, 0)
  })

  // Group transactions
  transactions.forEach((tx) => {
    const monthKey = formatMonthYear(tx.createdAt)
    const value = mode === 'count' ? 1 : tx.paidAmount

    if (tx.billingType === 'ONE_TIME' && monthlyOneTime.has(monthKey)) {
      monthlyOneTime.set(monthKey, (monthlyOneTime.get(monthKey) || 0) + value)
    } else if (tx.billingType === 'RECURRING' && monthlyRecurring.has(monthKey)) {
      monthlyRecurring.set(monthKey, (monthlyRecurring.get(monthKey) || 0) + value)
    } else if (tx.billingType === 'SPLIT_PAYMENT' && monthlySplit.has(monthKey)) {
      monthlySplit.set(monthKey, (monthlySplit.get(monthKey) || 0) + value)
    }
  })

  // Convert to array
  const data: SalesBreakdownDataPoint[] = []
  monthlyOneTime.forEach((oneTime, month) => {
    data.push({
      month,
      oneTime,
      recurring: monthlyRecurring.get(month) || 0,
      splitPayment: monthlySplit.get(month) || 0,
    })
  })

  // Calculate totals
  const totalOneTime = data.reduce((sum, d) => sum + d.oneTime, 0)
  const totalRecurring = data.reduce((sum, d) => sum + d.recurring, 0)
  const totalSplit = data.reduce((sum, d) => sum + d.splitPayment, 0)
  const total = totalOneTime + totalRecurring + totalSplit

  /**
   * Calculate period-over-period change
   * WHY: Comparing last month to second-to-last often shows 0% with sparse data
   * HOW: Compare first half of period to second half for meaningful trend
   */
  const midpoint = Math.floor(data.length / 2)
  const firstHalf = data.slice(0, midpoint)
  const secondHalf = data.slice(midpoint)

  const firstHalfSum = firstHalf.reduce(
    (sum, d) => sum + d.oneTime + d.recurring + d.splitPayment,
    0
  )
  const secondHalfSum = secondHalf.reduce(
    (sum, d) => sum + d.oneTime + d.recurring + d.splitPayment,
    0
  )

  // Calculate change: positive = growth, negative = decline
  const change = firstHalfSum > 0
    ? ((secondHalfSum - firstHalfSum) / firstHalfSum) * 100
    : secondHalfSum > 0 ? 100 : 0

  return {
    data,
    totals: {
      total,
      oneTime: totalOneTime,
      recurring: totalRecurring,
      splitPayment: totalSplit,
      change: Math.round(change * 10) / 10,
    },
  }
}

// ============================================================================
// CHART 06: PLATFORM / MARKETPLACE REVENUE
// ============================================================================

/**
 * Get Platform Revenue data (template sales, future merch, affiliates)
 *
 * WHY: Platform-currency transactions (e.g., USD) must be shown separately
 * from connect-account revenue (e.g., CAD). This chart shows marketplace
 * earnings with gross, platform fees, and net income breakdown.
 *
 * HOW: Queries ONLY transactions with { platformPayment: true } in metadata.
 * Reads platformFeeCents from each transaction's metadata for accurate
 * fee deduction (fees are stored at time of purchase, not recalculated).
 *
 * FUTURE-PROOF: Any new platform-currency flow (affiliates, merch) just needs
 * to set { platformPayment: true, platformFeeCents: X } in metadata and
 * it will automatically appear in this chart.
 *
 * SOURCE OF TRUTH KEYWORDS: PlatformRevenueChart, MarketplaceRevenue, Chart06
 *
 * @param organizationId - Organization to fetch data for
 * @param dateRange - Date range to filter
 * @returns Array of monthly platform revenue data with gross/fees/net
 */
export async function getPlatformRevenueData(
  organizationId: string,
  dateRange?: DashboardDateRange
): Promise<{
  data: PlatformRevenueDataPoint[]
  totals: {
    totalGross: number
    totalFees: number
    totalNet: number
    change: number
  }
}> {
  const range = dateRange ?? getDefaultDateRange()
  const months = getMonthsBetween(range.from, range.to)

  /**
   * Fetch ONLY platform-currency transactions.
   * These are transactions where metadata.platformPayment === true.
   * Include metadata to extract platformFeeCents for net income calculation.
   */
  const transactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      paymentStatus: { in: ['PAID', 'ACTIVE', 'PARTIALLY_PAID'] },
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
      ...ONLY_PLATFORM_PAYMENTS,
    },
    select: {
      paidAmount: true,
      metadata: true,
      createdAt: true,
    },
  })

  /** Monthly buckets for gross, fees, and net */
  const monthlyGross = new Map<string, number>()
  const monthlyFees = new Map<string, number>()

  months.forEach((month) => {
    const key = formatMonthYear(month)
    monthlyGross.set(key, 0)
    monthlyFees.set(key, 0)
  })

  transactions.forEach((tx) => {
    const monthKey = formatMonthYear(tx.createdAt)
    if (!monthlyGross.has(monthKey)) return

    monthlyGross.set(monthKey, (monthlyGross.get(monthKey) || 0) + tx.paidAmount)

    /**
     * Extract platformFeeCents from metadata.
     * WHY: Fee percentage varies by tier and can change over time,
     * so we use the fee stored at transaction time for accuracy.
     */
    const meta = tx.metadata as Record<string, unknown> | null
    const feeCents = typeof meta?.platformFeeCents === 'number' ? meta.platformFeeCents : 0
    monthlyFees.set(monthKey, (monthlyFees.get(monthKey) || 0) + feeCents)
  })

  /** Build data array with gross, fees, and net per month */
  const data: PlatformRevenueDataPoint[] = []
  monthlyGross.forEach((gross, month) => {
    const fees = monthlyFees.get(month) || 0
    data.push({
      month,
      gross,
      fees,
      net: gross - fees,
    })
  })

  /** Calculate totals */
  const totalGross = data.reduce((sum, d) => sum + d.gross, 0)
  const totalFees = data.reduce((sum, d) => sum + d.fees, 0)
  const totalNet = totalGross - totalFees

  /** Period-over-period change based on gross revenue */
  const midpoint = Math.floor(data.length / 2)
  const firstHalfGross = data.slice(0, midpoint).reduce((sum, d) => sum + d.gross, 0)
  const secondHalfGross = data.slice(midpoint).reduce((sum, d) => sum + d.gross, 0)

  const change = firstHalfGross > 0
    ? ((secondHalfGross - firstHalfGross) / firstHalfGross) * 100
    : secondHalfGross > 0 ? 100 : 0

  return {
    data,
    totals: {
      totalGross,
      totalFees,
      totalNet,
      change: Math.round(change * 10) / 10,
    },
  }
}

// ============================================================================
// DASHBOARD SUMMARY
// ============================================================================

/**
 * Get Dashboard Summary (all metrics at once)
 *
 * WHY: Efficient single query for dashboard overview cards
 * HOW: Parallel queries for all key metrics
 *
 * @param organizationId - Organization to fetch data for
 * @param dateRange - Date range to filter
 */
export async function getDashboardSummary(
  organizationId: string,
  dateRange?: DashboardDateRange
): Promise<{
  mrr: number
  totalRevenue: number
  totalReferrals: number
  totalSales: number
}> {
  const range = dateRange ?? getDefaultDateRange()

  const [recurringResult, revenueResult, referralsResult, salesResult] = await Promise.all([
    getRecurringRevenueData(organizationId, range),
    getTotalRevenueData(organizationId, range),
    getAffiliateReferralsData(organizationId, range),
    getSalesBreakdownData(organizationId, range, 'count'),
  ])

  return {
    mrr: recurringResult.totals.mrr,
    totalRevenue: revenueResult.totals.totalRevenue,
    totalReferrals: referralsResult.totals.totalReferrals,
    totalSales: salesResult.totals.total,
  }
}
