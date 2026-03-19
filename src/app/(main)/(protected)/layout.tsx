/**
 * Protected Route Group Layout
 *
 * WHY: Shared authentication, authorization, and data prefetching for ALL protected routes.
 * HOW: Verifies auth, checks onboarding, prefetches common data, shows critical banners.
 *
 * ============================================================================
 * ARCHITECTURE - TWO-LAYER LAYOUT SYSTEM
 * ============================================================================
 *
 * This layout handles:
 * - Authentication verification (redirect to login if not authenticated)
 * - Onboarding check (redirect if no organizations)
 * - Data prefetching for instant client hydration
 * - Critical banners (subscription canceled, payment failed, Stripe restricted)
 *
 * Child route groups handle their own UI:
 * - (dashboard-layout): Adds AppSidebar + SidebarInset wrapper
 * - (website-builder): Full-screen builder (no sidebar)
 *
 * This separation ensures:
 * 1. Auth checks happen ONCE at the (protected) level
 * 2. UI layout is handled by specific route groups
 * 3. Builder gets auth protection without sidebar interference
 *
 * ============================================================================
 * DATA FLOW
 * ============================================================================
 *
 * 1. User visits any protected route
 * 2. This layout checks auth via tRPC (getUserOrganizations)
 * 3. If error → handleAuthError redirects appropriately
 * 4. If success → Prefetch common data for hydration
 * 5. Render banners + children
 * 6. Child layout (if any) adds its own UI wrapper
 *
 * ============================================================================
 */

import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'
import { auth } from '@/lib/better-auth/auth'
import { SubscriptionCanceledBanner } from '@/components/organization/subscription-canceled-banner'
import { PaymentFailedBanner } from '@/components/organization/payment-failed-banner'
import { StripeAccountRestrictedBanner } from '@/components/organization/stripe-account-restricted-banner'
import { ImpersonationBanner } from '@/components/impersonation-banner'
import { RealtimeProviderWrapper } from '@/components/realtime-provider-wrapper'
import { getSubdomain, getCustomDomain } from '@/lib/utils/domain'
import { MochiProvider } from '@/components/ai/mochi-widget/mochi-provider'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = getQueryClient()

  // ========================================================================
  // AUTHENTICATION & ONBOARDING CHECK
  // ========================================================================
  // Check if user is authenticated and has completed onboarding.
  // If not authenticated → handleAuthError redirects to /sign-in
  // If no organizations → handleAuthError redirects to /onboarding
  // This is the SINGLE auth check for all protected routes.
  const organizations = await queryClient
    .fetchQuery(trpc.organization.getUserOrganizations.queryOptions())
    .catch(handleAuthError)

  // ========================================================================
  // SUBDOMAIN/CUSTOM DOMAIN ACCESS CONTROL (SECURITY)
  // ========================================================================
  // CRITICAL: Prevent cross-tenant access via shared cookies
  // WHY: Cross-subdomain cookies (domain: .mochi.test) allow a session from
  //      user-a.mochi.test to be sent to user-b.mochi.test. Without this check,
  //      any authenticated user could access any organization's dashboard.
  // HOW: Check if current subdomain/custom domain matches one of user's organizations.
  //      If not, redirect to unauthorized page.
  // PERFORMANCE: Only runs when on a subdomain or custom domain (not root domain).
  //              Uses already-fetched organizations data - no extra DB query.
  const currentSubdomain = await getSubdomain()
  const currentCustomDomain = await getCustomDomain()

  // Only validate if we're on a subdomain or custom domain
  if (organizations && (currentSubdomain || currentCustomDomain)) {
    let hasAccess = false

    if (currentSubdomain) {
      // Check if user has access to this subdomain's organization
      // Organization slug must match the subdomain
      hasAccess = organizations.some((org) => org.slug === currentSubdomain)
    } else if (currentCustomDomain) {
      // Check if user has access to this custom domain's organization
      // Organization customDomain must match (with or without protocol)
      hasAccess = organizations.some((org) => {
        if (!org.customDomain) return false
        // Handle both "example.com" and "https://example.com" formats
        const cleanOrgDomain = org.customDomain.replace(/^https?:\/\//, '')
        return cleanOrgDomain === currentCustomDomain
      })
    }

    // SECURITY: If user doesn't have access, redirect to unauthorized
    if (!hasAccess) {
      console.warn('[SECURITY] Unauthorized subdomain/domain access attempt:', {
        subdomain: currentSubdomain,
        customDomain: currentCustomDomain,
        userOrganizations: organizations.map((o) => o.slug),
      })
      redirect('/unauthorized')
    }
  }

  // ========================================================================
  // IMPERSONATION CHECK
  // ========================================================================
  // Check if the current session is an impersonation session.
  // The session has an impersonatedBy field when a portal admin is impersonating.
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  // Type assertion for impersonatedBy field added by admin plugin
  const sessionData = session?.session as {
    impersonatedBy?: string | null
    activeOrganizationId?: string | null
  } | null

  const isImpersonating = !!sessionData?.impersonatedBy

  // ========================================================================
  // GET ACTIVE ORGANIZATION
  // ========================================================================
  // DOMAIN-FIRST approach for multi-tenancy:
  // 1. On subdomain (acme.mochi.test) → that org IS the active org
  // 2. On custom domain (mycompany.com) → that org IS the active org
  // 3. On root domain (mochi.test) → use session.activeOrganizationId
  //
  // This ensures domain-based isolation: user on acme.mochi.test can ONLY
  // see acme's data, regardless of session.activeOrganizationId.
  //
  // SECURITY:
  // - Access was validated above, so if we reach here on a subdomain/custom domain,
  //   user is guaranteed to be a member of that org
  // - getActiveOrganization validates membership for session-based selection
  //
  // SOURCE OF TRUTH: Domain > session.activeOrganizationId > default selection
  const activeOrg = await queryClient.fetchQuery(
    trpc.organization.getActiveOrganization.queryOptions()
  )

  // ========================================================================
  // DATA PREFETCHING
  // ========================================================================
  // Prefetch common data that most protected pages need.
  // This data is hydrated to the client for instant access.
  const prefetchPromises: Promise<unknown>[] = [
    queryClient.fetchQuery(trpc.user.getProfile.queryOptions()),
    queryClient.fetchQuery(trpc.user.getAccounts.queryOptions()),
  ]

  // Prefetch tier data for feature gates and promotion widgets
  if (activeOrg?.id) {
    prefetchPromises.push(
      queryClient.fetchQuery(
        trpc.usage.getTier.queryOptions({ organizationId: activeOrg.id })
      )
    )
  }

  // Prefetch usage metrics for feature limit checks
  if (activeOrg?.id) {
    prefetchPromises.push(
      queryClient.fetchQuery(
        trpc.usage.getUsageMetrics.queryOptions({
          organizationId: activeOrg.id,
        })
      )
    )
  }

  // Prefetch feature gates (combined tier + usage for client-side FeatureGate component)
  // SOURCE OF TRUTH: This enables instant feature gate checks on the client
  if (activeOrg?.id) {
    prefetchPromises.push(
      queryClient.fetchQuery(
        trpc.usage.getFeatureGates.queryOptions({
          organizationId: activeOrg.id,
        })
      )
    )
  }

  await Promise.all(prefetchPromises)

  // ========================================================================
  // BANNER STATE CALCULATION
  // ========================================================================
  // Determine which critical banners to show based on subscription/account status.
  // These banners appear at the top of ALL protected pages.
  let showCancellationBanner = false
  let showPaymentFailedBanner = false
  let showStripeRestrictedBanner = false
  let stripeRestrictedDashboardUrl: string | null = null
  let periodEnd: Date | null = null
  let subscriptionStatus: string | null = null

  if (activeOrg?.id && activeOrg.role === 'owner') {
    const tierData = await queryClient.fetchQuery(
      trpc.usage.getTier.queryOptions({ organizationId: activeOrg.id })
    )

    if (tierData?.subscription) {
      const isCanceled = tierData.subscription.cancelAtPeriodEnd === true
      const hasPeriodEnd = !!tierData.subscription.periodEnd
      subscriptionStatus = tierData.subscription.status

      // Show cancellation banner if user manually canceled (still has access until period end)
      if (isCanceled && hasPeriodEnd && tierData.subscription.periodEnd) {
        showCancellationBanner = true
        periodEnd = new Date(tierData.subscription.periodEnd)
      }

      // Show payment failed banner if payment failed and Stripe is retrying
      // past_due = payment failed, Stripe auto-retrying (~2 weeks grace period)
      if (subscriptionStatus === 'past_due') {
        showPaymentFailedBanner = true
      }
    }

    // Check Stripe connected account restrictions (only for owners)
    try {
      const restrictions = await queryClient.fetchQuery(
        trpc.integrations.getAccountRestrictions.queryOptions({
          organizationId: activeOrg.id,
        })
      )

      if (restrictions.hasRestrictions && restrictions.dashboardUrl) {
        showStripeRestrictedBanner = true
        stripeRestrictedDashboardUrl = restrictions.dashboardUrl
      }
    } catch {
      // Silently fail - don't block the app if we can't check restrictions
    }
  }

  // ========================================================================
  // RENDER
  // ========================================================================
  // Render banners (fixed position) and children.
  // Child layouts handle their own UI structure (sidebar, etc.)
  // PERFORMANCE: RealtimeProvider is here (not in main layout) so auth pages
  //              don't establish unnecessary SSE connections.
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RealtimeProviderWrapper>
        {/*
          CRITICAL BANNERS - Fixed position at top of viewport
          Priority order: Stripe Restricted > Payment Failed > Subscription Canceled
          These appear on ALL protected pages including the builder.
        */}

        {/* Stripe Account Restricted Banner (highest priority - account may be disabled) */}
        {showStripeRestrictedBanner && stripeRestrictedDashboardUrl && (
          <StripeAccountRestrictedBanner dashboardUrl={stripeRestrictedDashboardUrl} />
        )}

        {/* Payment Failed Banner (takes priority over cancellation) */}
        {!showStripeRestrictedBanner && showPaymentFailedBanner && activeOrg?.id && (
          <PaymentFailedBanner organizationId={activeOrg.id} />
        )}

        {/* Subscription Canceled Banner (shown only if no other critical banners) */}
        {!showStripeRestrictedBanner &&
          !showPaymentFailedBanner &&
          showCancellationBanner &&
          periodEnd &&
          activeOrg?.id && (
            <SubscriptionCanceledBanner
              periodEnd={periodEnd}
              organizationId={activeOrg.id}
            />
          )}

        {/* Children - either (dashboard-layout) with sidebar or (website-builder) full-screen */}
        {children}

        {/*
          Floating Mochi AI Chat — rendered here (parent layout) so the widget
          and its conversation history PERSIST across route group navigations
          (dashboard ↔ builder ↔ automation etc.) without losing state.
          Previously rendered separately in each child layout, which caused
          the chat to clear on every cross-layout navigation.
        */}
        {activeOrg?.id &&
          (activeOrg.role === 'owner' || activeOrg.permissions.includes('ai:use')) && (
            <MochiProvider organizationId={activeOrg.id} />
          )}

        {/* Impersonation Banner - Fixed at bottom when portal admin is impersonating a user */}
        <ImpersonationBanner
          isImpersonating={isImpersonating}
          user={
            session?.user
              ? {
                  id: session.user.id,
                  name: session.user.name ?? 'Unknown User',
                  email: session.user.email,
                  image: session.user.image,
                }
              : undefined
          }
          organization={
            activeOrg
              ? {
                  id: activeOrg.id,
                  name: activeOrg.name,
                }
              : null
          }
          role={activeOrg?.role ?? null}
        />
      </RealtimeProviderWrapper>
    </HydrationBoundary>
  )
}
