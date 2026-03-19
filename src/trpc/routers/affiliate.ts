/**
 * Affiliate Router
 *
 * WHY: Handle affiliate link generation and referral tracking
 * HOW: Delegates all DB access to affiliate.service.ts
 */

import { z } from 'zod'
import { baseProcedure, createTRPCRouter, protectedProcedure } from '@/trpc/init'
import {
  getOrCreateAffiliateCode,
  getAffiliateByCode,
  trackAffiliateReferral,
  getAffiliateStats,
  getAffiliateReferrals,
} from '@/services/affiliate.service'
import { TRPCError } from '@trpc/server'

export const affiliateRouter = createTRPCRouter({
  /**
   * Get or create affiliate code for current user
   */
  getAffiliateLink: protectedProcedure.query(async ({ ctx }) => {
    const user = await getOrCreateAffiliateCode(ctx.user.id)

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND' })
    }

    return {
      affiliateCode: user.affiliateCode,
      userId: user.id,
      userName: user.name,
      userImage: user.image,
    }
  }),

  /**
   * Get affiliate info by code (for displaying on sign-up page)
   */
  getAffiliateInfo: baseProcedure
    .input(
      z.object({
        code: z.string(),
      })
    )
    .query(async ({ input }) => {
      const user = await getAffiliateByCode(input.code)

      if (!user) {
        return null
      }

      return {
        id: user.id,
        name: user.name,
        image: user.image,
        affiliateCode: user.affiliateCode,
      }
    }),

  /**
   * Track affiliate referral on sign-up
   */
  trackReferral: protectedProcedure
    .input(
      z.object({
        affiliateCode: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await trackAffiliateReferral(ctx.user.id, input.affiliateCode)

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Affiliate not found',
        })
      }

      return { success: true }
    }),

  /**
   * Get referral stats for current user
   */
  getReferralStats: protectedProcedure.query(async ({ ctx }) => {
    return await getAffiliateStats(ctx.user.id)
  }),

  /**
   * Get list of users referred by current user
   */
  getReferrals: protectedProcedure.query(async ({ ctx }) => {
    return await getAffiliateReferrals(ctx.user.id)
  }),
})
