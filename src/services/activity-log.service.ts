/**
 * Activity Log Service
 *
 * SOURCE OF TRUTH: ActivityLog, PlatformActivityTracking
 *
 * WHY: Tracks user actions (create/update/delete) across the platform
 * - Platform analytics: See if users are actively using Mochi
 * - Audit trail: Know who did what and when
 * - Churn detection: Identify users who stopped doing things
 *
 * WHAT WE TRACK:
 * - Create: New entities created (website, form, lead, product, etc.)
 * - Update: Entities modified
 * - Delete: Entities removed
 *
 * WHAT WE DON'T TRACK:
 * - Page views, clicks, or read-only actions
 * - System/automated actions (webhooks, crons)
 *
 * HOW IT WORKS:
 * Uses Next.js `after()` API to schedule logging AFTER the response is sent.
 * This guarantees:
 * 1. User gets immediate response (zero delay from logging)
 * 2. Logging is guaranteed to run (won't be cut off in serverless)
 * 3. Errors in logging never affect the main operation
 *
 * HOW TO USE:
 * Just call logActivity() - no await needed, it's synchronous.
 *
 * ```ts
 * import { logActivity } from '@/services/activity-log.service'
 *
 * // After creating a website - just call it, no await!
 * logActivity({
 *   userId: ctx.user.id,
 *   organizationId: orgId,
 *   action: 'create',
 *   entity: 'website',
 *   entityId: website.id,
 * })
 *
 * return website // Response sent immediately, logging happens after
 * ```
 */

import 'server-only'
import { after } from 'next/server'
import { prisma } from '@/lib/config'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Action types we track
 * SOURCE OF TRUTH: ActivityAction
 */
export type ActivityAction = 'create' | 'update' | 'delete'

/**
 * Entity types that can be logged
 * SOURCE OF TRUTH: ActivityEntity
 *
 * This is a non-exhaustive list - any string is accepted
 * to allow for future entity types without code changes
 */
export type ActivityEntity =
  | 'website'
  | 'page'
  | 'form'
  | 'form_submission'
  | 'lead'
  | 'product'
  | 'transaction'
  | 'payment_link'
  | 'pipeline'
  | 'pipeline_stage'
  | 'pipeline_card'
  | 'ticket'
  | 'email_template'
  | 'email_template_folder'
  | 'email_domain'
  | 'chat_widget'
  | 'calendar'
  | 'calendar_booking'
  | 'calendar_event_type'
  | 'cms_table'
  | 'cms_row'
  | 'store'
  | 'domain'
  | 'member'
  | 'invitation'
  | 'organization'
  | 'custom_data'
  | 'local_component'
  | string // Allow any string for flexibility

/**
 * Input for logging an activity
 * SOURCE OF TRUTH: LogActivityInput
 */
export interface LogActivityInput {
  userId: string
  organizationId: string
  action: ActivityAction
  entity: ActivityEntity
  entityId: string
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Log a user activity (create/update/delete)
 *
 * WHY: Call this after any create, update, or delete operation
 * HOW: Schedules a database write using Next.js after() API
 *
 * This function is SYNCHRONOUS - it schedules work to run AFTER the
 * response is sent to the user. No await needed, just call it.
 *
 * @param input - Activity details (who, what, where)
 */
export function logActivity(input: LogActivityInput): void {
  after(async () => {
    try {
      await prisma.activityLog.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
        },
      })
    } catch (error) {
      // Log but don't throw - activity logging should not break the main operation
      console.error('[ActivityLog] Failed to log activity:', error)
    }
  })
}

/**
 * Log multiple activities at once (batch)
 *
 * WHY: Use when a single operation affects multiple entities
 * HOW: Schedules a batch database write using Next.js after() API
 *
 * This function is SYNCHRONOUS - it schedules work to run AFTER the
 * response is sent to the user. No await needed, just call it.
 *
 * @param inputs - Array of activity details
 */
export function logActivities(inputs: LogActivityInput[]): void {
  if (inputs.length === 0) return

  after(async () => {
    try {
      await prisma.activityLog.createMany({
        data: inputs.map((input) => ({
          userId: input.userId,
          organizationId: input.organizationId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
        })),
      })
    } catch (error) {
      console.error('[ActivityLog] Failed to log batch activities:', error)
    }
  })
}

// ============================================================================
// QUERY FUNCTIONS (For Analytics)
// ============================================================================

/**
 * Get activity counts for an organization within a date range
 *
 * WHY: Used by portal analytics to show platform-wide activity
 * HOW: Aggregates activities by month
 *
 * @param organizationId - Optional: filter by organization
 * @param from - Start date
 * @param to - End date
 */
export async function getActivityCounts(options: {
  organizationId?: string
  from: Date
  to: Date
}): Promise<{
  total: number
  creates: number
  updates: number
  deletes: number
}> {
  const where = {
    createdAt: {
      gte: options.from,
      lte: options.to,
    },
    ...(options.organizationId && { organizationId: options.organizationId }),
  }

  const [total, creates, updates, deletes] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.count({ where: { ...where, action: 'create' } }),
    prisma.activityLog.count({ where: { ...where, action: 'update' } }),
    prisma.activityLog.count({ where: { ...where, action: 'delete' } }),
  ])

  return { total, creates, updates, deletes }
}

/**
 * Get unique active users within a date range
 *
 * WHY: Shows how many users are actually using the platform
 * HOW: Counts distinct userIds with activity
 *
 * @param from - Start date
 * @param to - End date
 * @param organizationId - Optional: filter by organization
 */
export async function getActiveUserCount(options: {
  from: Date
  to: Date
  organizationId?: string
}): Promise<number> {
  const result = await prisma.activityLog.groupBy({
    by: ['userId'],
    where: {
      createdAt: {
        gte: options.from,
        lte: options.to,
      },
      ...(options.organizationId && { organizationId: options.organizationId }),
    },
  })

  return result.length
}

/**
 * Get activities grouped by month
 *
 * WHY: Used for time-series charts in portal analytics
 * HOW: Groups activities by createdAt month
 *
 * @param from - Start date
 * @param to - End date
 */
export async function getActivitiesByMonth(options: {
  from: Date
  to: Date
}): Promise<Array<{ month: string; activities: number; uniqueUsers: number }>> {
  // Get all activities in range
  const activities = await prisma.activityLog.findMany({
    where: {
      createdAt: {
        gte: options.from,
        lte: options.to,
      },
    },
    select: {
      createdAt: true,
      userId: true,
    },
  })

  // Group by month
  const monthlyData = new Map<string, { activities: number; users: Set<string> }>()

  // Type annotation for when ActivityLog model is not yet in Prisma
  activities.forEach((activity: { createdAt: Date; userId: string }) => {
    const monthKey = activity.createdAt.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })

    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, { activities: 0, users: new Set() })
    }

    const data = monthlyData.get(monthKey)!
    data.activities++
    data.users.add(activity.userId)
  })

  // Convert to array
  return Array.from(monthlyData.entries()).map(([month, data]) => ({
    month,
    activities: data.activities,
    uniqueUsers: data.users.size,
  }))
}

/**
 * Get unique active organizations within a date range
 *
 * WHY: Shows how many organizations are actively using the platform
 * HOW: Counts distinct organizationIds with activity
 *
 * @param from - Start date
 * @param to - End date
 */
export async function getActiveOrganizationCount(options: {
  from: Date
  to: Date
}): Promise<number> {
  const result = await prisma.activityLog.groupBy({
    by: ['organizationId'],
    where: {
      createdAt: {
        gte: options.from,
        lte: options.to,
      },
    },
  })

  return result.length
}
