/**
 * Onboarding Layout
 *
 * WHY: Shared layout for onboarding flow
 * HOW: Validate user is authenticated, prefetch plans
 *
 * REALTIME: Includes RealtimeProviderWrapper for payment completion events
 * The payment step uses realtime to receive instant notification when
 * Stripe webhook completes organization creation (replaces polling)
 */

import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'
import { RealtimeProviderWrapper } from '@/components/realtime-provider-wrapper'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = getQueryClient()

  // Check if user is authenticated + has onboarding access
  // Prevents users who already completed onboarding from re-accessing this flow
  await queryClient
    .fetchQuery(trpc.organization.checkOnboardingAccess.queryOptions())
    .catch(handleAuthError)

  // Prefetch plans for plan selection step
  void queryClient.prefetchQuery(trpc.features.getAvailablePlans.queryOptions())

  // Prefetch trial status for instant trial badge updates
  void queryClient.prefetchQuery(trpc.payment.getUserTrialStatus.queryOptions())

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RealtimeProviderWrapper>
        {children}
      </RealtimeProviderWrapper>
    </HydrationBoundary>
  )
}
