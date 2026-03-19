/**
 * Member Availability Service (DAL)
 *
 * Data Access Layer for member availability operations.
 * This is the ONLY place that should interact with Prisma for member availability.
 *
 * SOURCE OF TRUTH KEYWORDS: MemberAvailability, TeamMemberSchedule, WorkingHours, UserTimezone
 *
 * FEATURES:
 * - Set personal working hours for team members
 * - Get member availability for slot generation
 * - Handle timezone conversions
 *
 * tRPC routers call these functions after security checks.
 */

import { prisma } from '@/lib/config'
import type { Prisma } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input type for setting member availability
 * SOURCE OF TRUTH: MemberAvailability model in Prisma schema
 */
export type MemberAvailabilityInput = {
  dayOfWeek: number // 0-6 (Sunday-Saturday)
  startTime: string // HH:mm format
  endTime: string // HH:mm format
  isEnabled: boolean
}

/**
 * Input type for bulk updating member availability
 * SOURCE OF TRUTH: MemberAvailability model in Prisma schema
 */
export type BulkMemberAvailabilityInput = {
  memberId: string
  availability: MemberAvailabilityInput[]
}

/**
 * Member availability with member and user details
 * SOURCE OF TRUTH: MemberAvailability model with relations
 */
export type MemberAvailabilityWithDetails = {
  id: string
  memberId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isEnabled: boolean
  createdAt: Date
  updatedAt: Date
  member: {
    id: string
    userId: string
    user: {
      id: string
      name: string
      email: string
      image: string | null
      timezone: string | null
    }
  }
}

// ============================================================================
// DEFAULT INCLUDES
// ============================================================================

/**
 * Member availability include configuration
 * WHY: Include member and user details for display and timezone handling
 */
const MEMBER_AVAILABILITY_INCLUDE = {
  member: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          timezone: true,
        },
      },
    },
  },
} satisfies Prisma.MemberAvailabilityInclude

// ============================================================================
// DEFAULT AVAILABILITY
// ============================================================================

/**
 * Default working hours (Mon-Fri 9am-5pm)
 * WHY: Provides sensible defaults for new team members
 */
const DEFAULT_AVAILABILITY: MemberAvailabilityInput[] = [
  { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', isEnabled: false }, // Sunday
  { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isEnabled: true },  // Monday
  { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isEnabled: true },  // Tuesday
  { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isEnabled: true },  // Wednesday
  { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isEnabled: true },  // Thursday
  { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isEnabled: true },  // Friday
  { dayOfWeek: 6, startTime: '09:00', endTime: '17:00', isEnabled: false }, // Saturday
]

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get member availability by member ID
 * WHY: Retrieves the weekly availability schedule for a specific member
 */
export async function getMemberAvailability(memberId: string) {
  return prisma.memberAvailability.findMany({
    where: { memberId },
    orderBy: { dayOfWeek: 'asc' },
    include: MEMBER_AVAILABILITY_INCLUDE,
  })
}

/**
 * Get member availability for a specific day
 * WHY: Used when generating time slots for a specific date
 */
export async function getMemberAvailabilityForDay(memberId: string, dayOfWeek: number) {
  return prisma.memberAvailability.findUnique({
    where: {
      memberId_dayOfWeek: {
        memberId,
        dayOfWeek,
      },
    },
    include: MEMBER_AVAILABILITY_INCLUDE,
  })
}

/**
 * Get availability for multiple members
 * WHY: Used when a booking calendar has multiple assignees
 */
export async function getMultipleMembersAvailability(memberIds: string[]) {
  return prisma.memberAvailability.findMany({
    where: {
      memberId: { in: memberIds },
    },
    orderBy: [{ memberId: 'asc' }, { dayOfWeek: 'asc' }],
    include: MEMBER_AVAILABILITY_INCLUDE,
  })
}

/**
 * Check if member has availability set up
 * WHY: Determines if we need to create default availability
 */
export async function hasMemberAvailability(memberId: string): Promise<boolean> {
  const count = await prisma.memberAvailability.count({
    where: { memberId },
  })
  return count > 0
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Initialize default availability for a member
 * WHY: New members get sensible default working hours (Mon-Fri 9-5)
 */
export async function initializeMemberAvailability(memberId: string) {
  // Check if already initialized
  const existing = await hasMemberAvailability(memberId)
  if (existing) {
    return getMemberAvailability(memberId)
  }

  // Create default availability for all 7 days
  await prisma.memberAvailability.createMany({
    data: DEFAULT_AVAILABILITY.map((day) => ({
      memberId,
      dayOfWeek: day.dayOfWeek,
      startTime: day.startTime,
      endTime: day.endTime,
      isEnabled: day.isEnabled,
    })),
  })

  return getMemberAvailability(memberId)
}

/**
 * Update availability for a single day
 * WHY: Allows granular updates to specific days
 */
export async function updateMemberAvailabilityForDay(
  memberId: string,
  input: MemberAvailabilityInput
) {
  return prisma.memberAvailability.upsert({
    where: {
      memberId_dayOfWeek: {
        memberId,
        dayOfWeek: input.dayOfWeek,
      },
    },
    update: {
      startTime: input.startTime,
      endTime: input.endTime,
      isEnabled: input.isEnabled,
    },
    create: {
      memberId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      isEnabled: input.isEnabled,
    },
    include: MEMBER_AVAILABILITY_INCLUDE,
  })
}

/**
 * Bulk update availability for all days
 * WHY: Efficient way to save the entire weekly schedule at once
 */
export async function updateAllMemberAvailability(input: BulkMemberAvailabilityInput) {
  const { memberId, availability } = input

  // Use a transaction to ensure atomicity
  return prisma.$transaction(async (tx) => {
    // Delete existing availability
    await tx.memberAvailability.deleteMany({
      where: { memberId },
    })

    // Create new availability records
    await tx.memberAvailability.createMany({
      data: availability.map((day) => ({
        memberId,
        dayOfWeek: day.dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        isEnabled: day.isEnabled,
      })),
    })

    // Return updated availability
    return tx.memberAvailability.findMany({
      where: { memberId },
      orderBy: { dayOfWeek: 'asc' },
      include: MEMBER_AVAILABILITY_INCLUDE,
    })
  })
}

/**
 * Delete all member availability
 * WHY: Cleanup when member is removed or reset is needed
 */
export async function deleteMemberAvailability(memberId: string) {
  return prisma.memberAvailability.deleteMany({
    where: { memberId },
  })
}

// ============================================================================
// USER TIMEZONE OPERATIONS
// ============================================================================

/**
 * Get user timezone by member ID
 * WHY: Need to know member's timezone for slot generation
 */
export async function getMemberTimezone(memberId: string): Promise<string> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      user: {
        select: { timezone: true },
      },
    },
  })

  return member?.user?.timezone ?? 'UTC'
}

/**
 * Update user timezone
 * WHY: Users can change their timezone in settings
 */
export async function updateUserTimezone(userId: string, timezone: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { timezone },
    select: {
      id: true,
      timezone: true,
    },
  })
}

/**
 * Get user timezone by user ID
 * WHY: Direct user lookup for profile settings
 */
export async function getUserTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })

  return user?.timezone ?? 'UTC'
}

// ============================================================================
// VERIFICATION HELPERS
// ============================================================================

/**
 * Validate that multiple member IDs exist in the given organization.
 * WHY: Bulk availability lookups need to verify all members belong to the org first.
 * Returns the subset of member IDs that are valid (exist in the org).
 *
 * SOURCE OF TRUTH: Member model in Prisma schema, BulkMemberOrganizationValidation
 */
export async function findMembersInOrganization(
  memberIds: string[],
  organizationId: string
): Promise<{ id: string }[]> {
  return prisma.member.findMany({
    where: {
      id: { in: memberIds },
      organizationId,
    },
    select: { id: true },
  })
}

/**
 * Verify member belongs to organization
 * WHY: Security check before allowing availability updates
 */
export async function verifyMemberInOrganization(
  memberId: string,
  organizationId: string
): Promise<boolean> {
  const member = await prisma.member.findFirst({
    where: {
      id: memberId,
      organizationId,
    },
  })

  return !!member
}

/**
 * Get member ID for a user in an organization
 * WHY: Users access availability via their member record in the org
 */
export async function getMemberIdForUser(
  userId: string,
  organizationId: string
): Promise<string | null> {
  const member = await prisma.member.findFirst({
    where: {
      userId,
      organizationId,
    },
    select: { id: true },
  })

  return member?.id ?? null
}
