/**
 * Member Availability Router
 *
 * WHY: Manage personal working hours for team members
 * HOW: Uses organizationProcedure to ensure user is authenticated and has org access
 *
 * ARCHITECTURE:
 * - Uses organizationProcedure with calendar permissions for managing others
 * - Users can always manage their own availability
 * - Admins can view team member availability for scheduling
 *
 * SOURCE OF TRUTH KEYWORDS: MemberAvailability, WorkingHours, TeamMemberSchedule
 */

import { z } from 'zod'
import { createTRPCRouter, organizationProcedure, protectedProcedure } from '../init'
import { TRPCError } from '@trpc/server'
import { permissions } from '@/lib/better-auth/permissions'
import * as memberAvailabilityService from '@/services/member-availability.service'

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for single day availability
 * SOURCE OF TRUTH: MemberAvailabilityInput type
 */
const availabilityDaySchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  isEnabled: z.boolean(),
})

/**
 * Schema for full week availability
 * SOURCE OF TRUTH: BulkMemberAvailabilityInput type
 */
const fullWeekAvailabilitySchema = z.array(availabilityDaySchema).length(7)

// ============================================================================
// ROUTER
// ============================================================================

export const memberAvailabilityRouter = createTRPCRouter({
  /**
   * Get current user's availability in the active organization
   *
   * WHY: Users need to see and manage their own working hours
   * HOW: Finds member record for user in org, returns availability
   */
  getMyAvailability: organizationProcedure({})
    .input(z.object({
      organizationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { organizationId } = input
      const userId = ctx.user.id

      // Get member ID for this user in this organization
      const memberId = await memberAvailabilityService.getMemberIdForUser(userId, organizationId)

      if (!memberId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'You are not a member of this organization',
        })
      }

      // Get or initialize availability
      const hasAvailability = await memberAvailabilityService.hasMemberAvailability(memberId)

      if (!hasAvailability) {
        // Initialize with defaults if not set up yet
        return memberAvailabilityService.initializeMemberAvailability(memberId)
      }

      return memberAvailabilityService.getMemberAvailability(memberId)
    }),

  /**
   * Update current user's availability for the entire week
   *
   * WHY: Users update their working hours in one operation
   * HOW: Replaces all 7 days of availability
   */
  updateMyAvailability: organizationProcedure({})
    .input(z.object({
      organizationId: z.string(),
      availability: fullWeekAvailabilitySchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, availability } = input
      const userId = ctx.user.id

      // Get member ID for this user in this organization
      const memberId = await memberAvailabilityService.getMemberIdForUser(userId, organizationId)

      if (!memberId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'You are not a member of this organization',
        })
      }

      // Validate time ranges
      for (const day of availability) {
        if (day.isEnabled) {
          const startMinutes = parseTimeToMinutes(day.startTime)
          const endMinutes = parseTimeToMinutes(day.endTime)

          if (startMinutes >= endMinutes) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Invalid time range for ${getDayName(day.dayOfWeek)}: end time must be after start time`,
            })
          }
        }
      }

      return memberAvailabilityService.updateAllMemberAvailability({
        memberId,
        availability,
      })
    }),

  /**
   * Update current user's availability for a single day
   *
   * WHY: Quick update for one day without affecting others
   * HOW: Upserts the availability for the specific day
   */
  updateMyAvailabilityForDay: organizationProcedure({})
    .input(z.object({
      organizationId: z.string(),
      dayOfWeek: z.number().min(0).max(6),
      startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
      endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...dayInput } = input
      const userId = ctx.user.id

      // Get member ID for this user in this organization
      const memberId = await memberAvailabilityService.getMemberIdForUser(userId, organizationId)

      if (!memberId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'You are not a member of this organization',
        })
      }

      // Validate time range if enabled
      if (dayInput.isEnabled) {
        const startMinutes = parseTimeToMinutes(dayInput.startTime)
        const endMinutes = parseTimeToMinutes(dayInput.endTime)

        if (startMinutes >= endMinutes) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'End time must be after start time',
          })
        }
      }

      return memberAvailabilityService.updateMemberAvailabilityForDay(memberId, dayInput)
    }),

  /**
   * Get a team member's availability (admin view)
   *
   * WHY: Admins need to see team member schedules for planning
   * HOW: Requires calendar:read permission
   */
  getMemberAvailability: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(z.object({
      organizationId: z.string(),
      memberId: z.string(),
    }))
    .query(async ({ input }) => {
      const { organizationId, memberId } = input

      // Verify member belongs to this organization
      const isMemberInOrg = await memberAvailabilityService.verifyMemberInOrganization(
        memberId,
        organizationId
      )

      if (!isMemberInOrg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found in this organization',
        })
      }

      // Get or initialize availability
      const hasAvailability = await memberAvailabilityService.hasMemberAvailability(memberId)

      if (!hasAvailability) {
        return memberAvailabilityService.initializeMemberAvailability(memberId)
      }

      return memberAvailabilityService.getMemberAvailability(memberId)
    }),

  /**
   * Get multiple team members' availability (for booking calendars)
   *
   * WHY: Slot generation needs availability from all assigned team members
   * HOW: Returns availability for multiple member IDs at once
   */
  getMultipleMembersAvailability: organizationProcedure({ requirePermission: permissions.CALENDAR_READ })
    .input(z.object({
      organizationId: z.string(),
      memberIds: z.array(z.string()).min(1).max(50),
    }))
    .query(async ({ input }) => {
      const { organizationId, memberIds } = input

      // Verify all members belong to this organization
      const validMembers = await memberAvailabilityService.findMembersInOrganization(
        memberIds,
        organizationId
      )

      const validMemberIds = validMembers.map((m) => m.id)

      if (validMemberIds.length === 0) {
        return []
      }

      return memberAvailabilityService.getMultipleMembersAvailability(validMemberIds)
    }),

  // ============================================================================
  // TIMEZONE OPERATIONS
  // ============================================================================

  /**
   * Get current user's timezone
   *
   * WHY: Display user's timezone in settings
   * HOW: Returns timezone from user record
   */
  getMyTimezone: protectedProcedure
    .query(async ({ ctx }) => {
      const timezone = await memberAvailabilityService.getUserTimezone(ctx.user.id)
      return { timezone }
    }),

  /**
   * Update current user's timezone
   *
   * WHY: Users can change their timezone preference
   * HOW: Updates user record with new timezone
   */
  updateMyTimezone: protectedProcedure
    .input(z.object({
      timezone: z.string().min(1, 'Timezone is required'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate timezone is valid IANA timezone
      try {
        Intl.DateTimeFormat(undefined, { timeZone: input.timezone })
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid timezone',
        })
      }

      const result = await memberAvailabilityService.updateUserTimezone(ctx.user.id, input.timezone)

      return {
        success: true,
        timezone: result.timezone,
      }
    }),
})

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse HH:mm time string to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Get day name from day of week number
 */
function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[dayOfWeek] ?? 'Unknown'
}
