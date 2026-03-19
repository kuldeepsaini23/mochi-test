/**
 * Profile Settings Router
 *
 * WHY: Manage user profile settings (name, email)
 * HOW: Uses protectedProcedure for auth, delegates to profile service
 *
 * ARCHITECTURE:
 * - Uses protectedProcedure to ensure user is authenticated
 * - No permission checks - all authenticated users can manage their own profile
 * - Delegates all DB access to profile.service.ts
 */

import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../init'
import {
  getUserProfile,
  updateUserName,
  updateUserEmail,
} from '@/services/profile.service'
import { TRPCError } from '@trpc/server'

export const profileRouter = createTRPCRouter({
  /**
   * Get current user's profile
   *
   * CACHE BEHAVIOR:
   * - Server: Fetches fresh data from DB via service
   * - Client: Set staleTime: Infinity, refetch manually after updates
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserProfile(ctx.user.id)

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      })
    }

    return user
  }),

  /**
   * Update user name
   */
  updateName: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required').max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updatedUser = await updateUserName(ctx.user.id, input.name)

      return {
        success: true,
        user: updatedUser,
      }
    }),

  /**
   * Update user email
   *
   * NOTE: Setting emailVerified to false when email changes
   * In production, send verification email here
   */
  updateEmail: protectedProcedure
    .input(
      z.object({
        email: z.string().email('Invalid email address'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await updateUserEmail(ctx.user.id, input.email)

      if (result.conflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Email is already in use by another account',
        })
      }

      // TODO: Send email verification email here

      return {
        success: true,
        user: result.user,
        message: 'Email updated. Please verify your new email address.',
      }
    }),
})
