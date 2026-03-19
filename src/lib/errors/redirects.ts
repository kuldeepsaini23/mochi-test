/**
 * Error-based Redirect Handler
 *
 * WHY: Centralized error → redirect mapping for structured tRPC errors
 * HOW: Checks error codes and redirects to appropriate pages
 *
 * HANDLES BOTH:
 * - TRPCError (server-side: direct tRPC calls)
 * - TRPCClientError (client-side: HTTP calls)
 *
 * USAGE:
 * ```typescript
 * try {
 *   await queryClient.fetchQuery(trpc.user.getProfile.queryOptions())
 * } catch (error) {
 *   handleAuthError(error) // Redirects based on error code
 * }
 * ```
 */

import { redirect } from 'next/navigation'
import { TRPCClientError } from '@trpc/client'
import { TRPCError } from '@trpc/server'
import { ERROR_CODES, type StructuredErrorCause } from '@/lib/errors'

/**
 * Handles tRPC auth errors and redirects appropriately
 *
 * @param error - The error to handle (TRPCError or TRPCClientError)
 * @throws Redirects - this function never returns, it always redirects
 */
export function handleAuthError(error: unknown): never {
  // Handle server-side TRPCError (from direct tRPC calls)
  if (error instanceof TRPCError) {
    const cause = error.cause as StructuredErrorCause | undefined

    // Map error codes to redirect destinations
    if (cause?.errorCode === ERROR_CODES.ONBOARDING_INCOMPLETE) {
      redirect('/onboarding')
    }

    if (cause?.errorCode === ERROR_CODES.STUDIO_ONBOARDING_COMPLETED) {
      redirect('/')
    }

    if (cause?.errorCode === ERROR_CODES.PENDING_INVITATION) {
      const invitationId = 'invitationId' in cause ? cause.invitationId : ''
      redirect(`/accept-invitation?id=${invitationId}`)
    }

    // UNAUTHORIZED - no structured error code
    if (error.code === 'UNAUTHORIZED') {
      redirect('/sign-in')
    }
  }

  // Handle client-side TRPCClientError (from HTTP calls)
  if (error instanceof TRPCClientError) {
    const errorData = error.data as
      | { cause?: StructuredErrorCause; code?: string }
      | undefined
    const cause = errorData?.cause

    // Map error codes to redirect destinations
    if (cause?.errorCode === ERROR_CODES.ONBOARDING_INCOMPLETE) {
      redirect('/onboarding')
    }

    if (cause?.errorCode === ERROR_CODES.STUDIO_ONBOARDING_COMPLETED) {
      redirect('/')
    }

    if (cause?.errorCode === ERROR_CODES.PENDING_INVITATION) {
      const invitationId = 'invitationId' in cause ? cause.invitationId : ''
      redirect(`/accept-invitation?id=${invitationId}`)
    }

    // UNAUTHORIZED - no structured error code
    if (errorData?.code === 'UNAUTHORIZED') {
      redirect('/sign-in')
    }
  }

  // Unknown error - default to sign in
  redirect('/sign-in')
}
