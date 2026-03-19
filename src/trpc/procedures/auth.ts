/**
 * Authentication Procedures
 *
 * Building blocks for authentication checks
 * Use these as the base for your endpoints
 *
 * AUTHENTICATION MODES:
 * 1. Session-based: Normal web requests with cookies
 * 2. IST-based: Internal service tokens for Trigger tasks, automation, etc.
 *
 * Both modes populate ctx.user - downstream code doesn't need to know the difference.
 */

import { TRPCError } from '@trpc/server'
import { baseProcedure } from './base'

/**
 * Protected Procedure
 *
 * Requires: User must be authenticated (via session OR internal service token)
 * Context: Adds { user, session, authSource, istPayload } to ctx
 *
 * @example
 * ```ts
 * getUserProfile: protectedProcedure.query(({ ctx }) => {
 *   return ctx.user // ✅ Always defined (from session or IST)
 * })
 * ```
 */
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  // Resolve auth lazily — this triggers session/IST resolution only when needed.
  // Public routes (baseProcedure) skip this, avoiding the cookies() call that
  // crashes static pages in Next.js 16.
  await ctx.resolveAuth()

  // Authentication check: user must be present (from session OR IST)
  // Note: IST authentication may not have a session, but will have a user
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    })
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session, // May be null for IST auth
      user: ctx.user,
      authSource: ctx.authSource,
      istPayload: ctx.istPayload,
    },
  })
})
