/**
 * Affiliate Service (DAL)
 *
 * Pure data access layer for affiliate/referral operations.
 * NO business logic - just database queries.
 *
 * SOURCE OF TRUTH: AffiliateDAL, ReferralQueries
 */

import 'server-only'

import { prisma } from '@/lib/config'
import { nanoid } from 'nanoid'

/**
 * Get or create an affiliate code for a user.
 *
 * WHY: Each user can share a unique affiliate code for referral tracking.
 * HOW: Returns existing code or generates a new one if not set.
 *
 * SOURCE OF TRUTH: AffiliateCodeLookup
 */
export async function getOrCreateAffiliateCode(userId: string) {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      affiliateCode: true,
      name: true,
      image: true,
    },
  })

  if (!user) return null

  // Generate affiliate code if not exists
  if (!user.affiliateCode) {
    const affiliateCode = nanoid(10)
    user = await prisma.user.update({
      where: { id: userId },
      data: { affiliateCode },
      select: {
        id: true,
        affiliateCode: true,
        name: true,
        image: true,
      },
    })
  }

  return user
}

/**
 * Get affiliate info by code (public lookup).
 *
 * WHY: Sign-up page displays the referrer's info when using an affiliate link.
 * HOW: Looks up user by their unique affiliate code.
 *
 * SOURCE OF TRUTH: AffiliatePublicLookup
 */
export async function getAffiliateByCode(code: string) {
  return await prisma.user.findUnique({
    where: { affiliateCode: code },
    select: {
      id: true,
      name: true,
      image: true,
      affiliateCode: true,
    },
  })
}

/**
 * Track a referral from an affiliate code.
 *
 * WHY: Records which user referred the current user for commission tracking.
 * HOW: Looks up the affiliate by code, then sets referredBy on the new user.
 *
 * SOURCE OF TRUTH: AffiliateReferralTrack
 *
 * @returns null if affiliate not found, or { success: true } on success
 */
export async function trackAffiliateReferral(userId: string, affiliateCode: string) {
  const affiliate = await prisma.user.findUnique({
    where: { affiliateCode },
    select: { id: true },
  })

  if (!affiliate) return null

  await prisma.user.update({
    where: { id: userId },
    data: { referredBy: affiliate.id },
  })

  return { success: true as const }
}

/**
 * Get referral stats for a user.
 *
 * WHY: Dashboard shows how many users have been referred.
 * HOW: Counts all users with referredBy pointing to this user.
 *
 * SOURCE OF TRUTH: AffiliateStats
 */
export async function getAffiliateStats(userId: string) {
  const totalReferrals = await prisma.user.count({
    where: { referredBy: userId },
  })

  return { totalReferrals }
}

/**
 * Get list of referred users.
 *
 * WHY: Dashboard shows details of all referred users.
 * HOW: Lists all users with referredBy pointing to this user.
 *
 * SOURCE OF TRUTH: AffiliateReferralList
 */
export async function getAffiliateReferrals(userId: string) {
  return await prisma.user.findMany({
    where: { referredBy: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}
