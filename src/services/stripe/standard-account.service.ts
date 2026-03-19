/**
 * Stripe Standard Account Service
 *
 * Handles Stripe Standard account connection via OAuth.
 * Following DAL pattern: Pure business logic, no auth checks.
 *
 * SECURITY: All organizationId values come from validated sessions (API routes).
 *
 * ACCOUNT TYPE: Standard
 * - Connected accounts handle their own onboarding with Stripe
 * - They are responsible for their own fraud and disputes
 * - Platform collects TIER-AWARE application fees (see STRIPE_TRANSACTION_FEES in feature-gates.ts)
 * - Uses OAuth flow to connect existing Stripe accounts
 *
 * TIER-AWARE PLATFORM FEES:
 * - free: 10% platform fee
 * - starter: 7% platform fee
 * - pro: 5% platform fee
 * - enterprise: 3% platform fee
 * - portal: 0% platform fee (no fee for portal organizations)
 *
 * Account Flow:
 * 1. User clicks "Connect Stripe"
 * 2. Redirected to Stripe OAuth page
 * 3. User authorizes access to their Stripe account
 * 4. Stripe redirects back with auth code
 * 5. Exchange code for account ID
 * 6. Save account ID to database
 *
 * KEY BENEFITS:
 * - Connected accounts bear their own risk (fraud, chargebacks)
 * - Platform collects tier-based application fees on direct charges
 * - Full Stripe Dashboard access for connected accounts
 * - Lower platform costs (no per-account fees)
 *
 * SOURCE OF TRUTH: StripeStandardAccountService, TierAwareApplicationFees
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { stripe } from '@/lib/config'
import { createSignedOAuthState } from '@/lib/stripe/oauth-state'

const STRIPE_PLATFORM_CLIENT_ID = process.env.STRIPE_PLATFORM_CLIENT_ID || ''

/**
 * Generate Stripe OAuth URL for Standard account connection
 *
 * @param organizationId - Studio organization ID (from validated session)
 * @param redirectUri - Where Stripe should redirect after OAuth
 * @returns OAuth authorization URL
 */
export async function getStandardAccountOAuthUrl(
  organizationId: string,
  redirectUri: string
): Promise<string> {
  // Check if organization already has a connected account
  const existingOrg = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      stripeConnectedAccountId: true,
    },
  })

  if (existingOrg?.stripeConnectedAccountId) {
    throw new Error('Organization already has a connected Stripe account')
  }

  // Generate OAuth URL with prefixed state for multi-entity support
  const params = new URLSearchParams({
    response_type: 'code', // REQUIRED: OAuth response type
    client_id: STRIPE_PLATFORM_CLIENT_ID,
    state: createSignedOAuthState(organizationId), // HMAC-signed state prevents forgery (see oauth-state.ts)
    scope: 'read_write', // Standard account permissions
    redirect_uri: redirectUri,
  })

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`
}

/**
 * Complete OAuth flow by exchanging authorization code for account ID
 *
 * @param code - Authorization code from Stripe OAuth callback
 * @param organizationId - Studio organization ID (from state parameter)
 */
export async function connectStandardAccount(
  code: string,
  organizationId: string
): Promise<{ accountId: string; country: string | null; currency: string | null }> {
  // Exchange authorization code for account ID
  const response = await stripe.oauth.token({
    grant_type: 'authorization_code',
    code,
  })

  const accountId = response.stripe_user_id

  if (!accountId) {
    throw new Error('Failed to get Stripe account ID from OAuth response')
  }

  // Fetch account details to get country and default currency
  // This is the SOURCE OF TRUTH for organization currency going forward
  const account = await stripe.accounts.retrieve(accountId)

  // Extract country and currency from the connected account
  // Currency is stored in lowercase (e.g., 'usd', 'eur', 'gbp')
  const country = account.country || null
  const currency = account.default_currency?.toLowerCase() || null

  // Save account ID, country, and currency to database
  // Currency becomes the single source of truth for all monetary operations
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeConnectedAccountId: accountId,
      stripeAccountCountry: country,
      stripeAccountCurrency: currency,
    },
  })

  return { accountId, country, currency }
}

/**
 * Get Standard account connection status
 *
 * @param organizationId - Studio organization ID (from validated session)
 * @returns Account status
 */
export async function getStandardAccountStatus(organizationId: string): Promise<{
  connected: boolean
  accountId: string | null
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      stripeConnectedAccountId: true,
    },
  })

  return {
    connected: !!org?.stripeConnectedAccountId,
    accountId: org?.stripeConnectedAccountId || null,
  }
}

/**
 * Disconnect Standard account
 *
 * Revokes OAuth access and clears database records.
 * WARNING: This is destructive and cannot be undone.
 *
 * @param organizationId - Studio organization ID (from validated session)
 */
export async function disconnectStandardAccount(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      stripeConnectedAccountId: true,
    },
  })

  if (!org?.stripeConnectedAccountId) {
    throw new Error('No connected account found')
  }

  // Revoke OAuth access
  try {
    await stripe.oauth.deauthorize({
      client_id: STRIPE_PLATFORM_CLIENT_ID,
      stripe_user_id: org.stripeConnectedAccountId,
    })
  } catch (error) {
    // Continue to clear database even if revocation fails
  }

  // Clear database record including currency fields
  // After disconnection, organization will fall back to default USD
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeConnectedAccountId: null,
      stripeAccountCountry: null,
      stripeAccountCurrency: null,
      stripeAccountRestricted: false,
      stripeAccountRestrictedReason: null,
    },
  })
}

/**
 * Check if connected account has restrictions or pending requirements
 *
 * Uses cached values from database (updated via account.updated webhook).
 * Falls back to Stripe API if cache miss, and updates cache for future requests.
 *
 * @param organizationId - Studio organization ID (from validated session)
 * @returns Account status with restriction info
 */
export async function getConnectedAccountRestrictions(organizationId: string): Promise<{
  hasRestrictions: boolean
  disabledReason: string | null
  dashboardUrl: string | null
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      stripeConnectedAccountId: true,
      stripeAccountRestricted: true,
      stripeAccountRestrictedReason: true,
    },
  })

  if (!org?.stripeConnectedAccountId) {
    return {
      hasRestrictions: false,
      disabledReason: null,
      dashboardUrl: null,
    }
  }

  // Use cached value - it's updated via webhook
  const dashboardUrl = org.stripeAccountRestricted
    ? `https://dashboard.stripe.com/b/${org.stripeConnectedAccountId}/account/status`
    : null

  return {
    hasRestrictions: org.stripeAccountRestricted,
    disabledReason: org.stripeAccountRestrictedReason,
    dashboardUrl,
  }
}

/**
 * Update cached account status from Stripe account data
 *
 * Updates both restriction status AND currency/country information.
 * Currency is the SOURCE OF TRUTH for all monetary operations.
 *
 * Called from:
 * 1. account.updated webhook (real-time updates)
 * 2. After OAuth connection (initial check)
 *
 * @param stripeAccountId - Stripe account ID (acct_xxx)
 * @param account - Optional Stripe account object (avoids extra API call if already fetched)
 */
export async function updateAccountRestrictionCache(
  stripeAccountId: string,
  account?: {
    country?: string | null
    default_currency?: string | null
    requirements?: {
      disabled_reason?: string | null
      currently_due?: string[] | null
      past_due?: string[] | null
    } | null
  }
): Promise<void> {
  try {
    // If account data not provided, fetch from Stripe
    const accountData = account ?? await stripe.accounts.retrieve(stripeAccountId)

    // Check if account has any restrictions
    const hasRestrictions =
      !!accountData.requirements?.disabled_reason ||
      (accountData.requirements?.currently_due?.length ?? 0) > 0 ||
      (accountData.requirements?.past_due?.length ?? 0) > 0

    // Update cache in database including currency and country
    // Currency sync ensures organization always uses Stripe account's currency
    await prisma.organization.updateMany({
      where: { stripeConnectedAccountId: stripeAccountId },
      data: {
        stripeAccountRestricted: hasRestrictions,
        stripeAccountRestrictedReason: accountData.requirements?.disabled_reason || null,
        stripeAccountCountry: accountData.country || null,
        stripeAccountCurrency: accountData.default_currency?.toLowerCase() || null,
      },
    })
  } catch (error) {
    // Failed to update cache - will retry on next webhook
  }
}

/**
 * Check restrictions directly from Stripe API and update cache
 *
 * Use this when you need fresh data (e.g., after OAuth connection).
 * For normal reads, use getConnectedAccountRestrictions which uses cache.
 *
 * @param organizationId - Studio organization ID
 */
export async function refreshAccountRestrictions(organizationId: string): Promise<{
  hasRestrictions: boolean
  disabledReason: string | null
  dashboardUrl: string | null
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })

  if (!org?.stripeConnectedAccountId) {
    return {
      hasRestrictions: false,
      disabledReason: null,
      dashboardUrl: null,
    }
  }

  try {
    // Fetch fresh data from Stripe
    const account = await stripe.accounts.retrieve(org.stripeConnectedAccountId)

    // Update cache
    await updateAccountRestrictionCache(org.stripeConnectedAccountId, account)

    // Check restrictions
    const hasRestrictions =
      !!account.requirements?.disabled_reason ||
      (account.requirements?.currently_due?.length ?? 0) > 0 ||
      (account.requirements?.past_due?.length ?? 0) > 0

    const dashboardUrl = hasRestrictions
      ? `https://dashboard.stripe.com/b/${org.stripeConnectedAccountId}/account/status`
      : null

    return {
      hasRestrictions,
      disabledReason: account.requirements?.disabled_reason || null,
      dashboardUrl,
    }
  } catch (error) {
    return {
      hasRestrictions: false,
      disabledReason: null,
      dashboardUrl: null,
    }
  }
}

