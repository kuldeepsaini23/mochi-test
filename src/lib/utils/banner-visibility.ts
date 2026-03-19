/**
 * ============================================================================
 * SHARED BANNER VISIBILITY CHECK
 * ============================================================================
 *
 * SOURCE OF TRUTH for determining whether any critical banner is visible.
 * Used by ALL layout files (dashboard, builders, etc.) to add padding
 * that prevents content from being hidden behind fixed-position banners.
 *
 * WHY: The banners (StripeAccountRestricted, PaymentFailed, SubscriptionCanceled)
 * are rendered with `absolute z-50` in the (protected)/layout.tsx. Child layouts
 * need to know if a banner is showing so they can offset their content.
 *
 * HOW: Reads from React Query cache (data already prefetched by protected layout).
 * Returns instantly without network requests.
 *
 * USAGE: Call `getShowAnyBanner()` in any server layout under (protected)/.
 *
 * SOURCE OF TRUTH KEYWORDS: BannerVisibility, showAnyBanner, getShowAnyBanner
 */

import { getQueryClient, trpc } from '@/trpc/server'

/**
 * Check if any critical banner is currently visible.
 * Reads from query cache — no network requests.
 * Must be called from a server component under the (protected) layout
 * (which prefetches all the data this function reads).
 */
export async function getShowAnyBanner(): Promise<boolean> {
  const queryClient = getQueryClient()

  /* Get active organization from cache */
  const activeOrg = await queryClient.fetchQuery(
    trpc.organization.getActiveOrganization.queryOptions()
  )

  /* Only owners see banners, and only when an org is active */
  if (!activeOrg?.id || activeOrg.role !== 'owner') {
    return false
  }

  /* Read tier data from cache */
  const tierData = await queryClient.fetchQuery(
    trpc.usage.getTier.queryOptions({ organizationId: activeOrg.id })
  )

  if (tierData?.subscription) {
    const isCanceled = tierData.subscription.cancelAtPeriodEnd === true
    const hasPeriodEnd = !!tierData.subscription.periodEnd
    const subscriptionStatus = tierData.subscription.status

    /* Subscription canceled banner */
    if (isCanceled && hasPeriodEnd) {
      return true
    }

    /* Payment failed banner */
    if (subscriptionStatus === 'past_due') {
      return true
    }
  }

  /* Stripe account restricted banner */
  try {
    const restrictions = await queryClient.fetchQuery(
      trpc.integrations.getAccountRestrictions.queryOptions({
        organizationId: activeOrg.id,
      })
    )

    if (restrictions?.hasRestrictions && restrictions?.dashboardUrl) {
      return true
    }
  } catch {
    /* Silently fail — don't block the app if restrictions check fails */
  }

  return false
}
