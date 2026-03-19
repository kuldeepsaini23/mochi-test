/**
 * Profile Service (DAL)
 *
 * Pure data access layer for user profile operations.
 * NO business logic - just database queries.
 *
 * SOURCE OF TRUTH: ProfileDAL, UserProfileQueries
 */

import 'server-only'

import { prisma } from '@/lib/config'

/** Standard user profile select shape */
const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  twoFactorEnabled: true,
} as const

/**
 * Get user profile by ID.
 *
 * WHY: Returns fresh user data from database (not stale session data).
 * HOW: Selects standard profile fields for the user.
 *
 * SOURCE OF TRUTH: UserProfileLookup
 */
export async function getUserProfile(userId: string) {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT,
  })
}

/**
 * Get basic user info (id, name, email, image) for lightweight lookups.
 *
 * WHY: Team switcher and navigation only need minimal user data.
 * HOW: Returns subset of profile fields for display purposes.
 *
 * SOURCE OF TRUTH: UserBasicInfo
 */
export async function getUserBasicInfo(userId: string) {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  })
}

/**
 * Update user name.
 *
 * WHY: Profile settings allow users to change their display name.
 * HOW: Updates name field, returns updated profile.
 *
 * SOURCE OF TRUTH: UserNameUpdate
 */
export async function updateUserName(userId: string, name: string) {
  return await prisma.user.update({
    where: { id: userId },
    data: { name },
    select: PROFILE_SELECT,
  })
}

/**
 * Update user email with uniqueness check.
 *
 * WHY: Profile settings allow users to change their email address.
 * HOW: Checks if email is already taken, then updates email and resets verification.
 *
 * SOURCE OF TRUTH: UserEmailUpdate
 *
 * @returns { conflict: true } if email taken, or { conflict: false, user } on success
 */
export async function updateUserEmail(userId: string, email: string) {
  // Check if email is already taken by another user
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })

  if (existingUser && existingUser.id !== userId) {
    return { conflict: true as const }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      email,
      // Reset email verification when changing email
      emailVerified: false,
    },
    select: PROFILE_SELECT,
  })

  return { conflict: false as const, user: updatedUser }
}
