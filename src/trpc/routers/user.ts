/**
 * User Router
 *
 * Thin controllers - just call services
 * All auth checks happen in procedures BEFORE this runs
 */

import { createTRPCRouter, protectedProcedure } from '../init'
import { getUserMemberships } from '@/services/membership.service'
import { getUserBasicInfo } from '@/services/profile.service'

export const userRouter = createTRPCRouter({
  /**
   * Get current user profile
   *
   * Returns: Basic user info for UI (fetched from DB to ensure fresh data)
   *
   * WHY: Fetch from DB instead of ctx.user to ensure updates propagate
   * when profile changes
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    // Fetch fresh data from database (not session)
    const user = await getUserBasicInfo(ctx.user.id)

    // Fallback to session data if DB query fails (shouldn't happen)
    return user || {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      image: ctx.user.image,
    }
  }),

  /**
   * Get user's accounts for team switcher
   *
   * Returns: All organizations the user belongs to
   *
   * INCLUDES: slug field for subdomain URL building (used in unauthorized page redirect)
   */
  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    // Get memberships from service
    const memberships = await getUserMemberships(ctx.user.id)

    // Transform to accounts format
    const accounts = memberships.map((member) => ({
      id: member.organization.id,
      name: member.organization.name,
      slug: member.organization.slug,
      logo: member.organization.logo,
      role: member.role,
      type: 'organization' as const,
    }))

    return { accounts }
  }),
})
