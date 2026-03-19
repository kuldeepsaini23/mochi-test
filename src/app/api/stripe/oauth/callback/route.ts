/**
 * Stripe OAuth Callback Route
 *
 * Handles OAuth redirect from Stripe after user authorizes connection.
 * SECURITY: State parameter is HMAC-signed to prevent forgery attacks.
 *
 * Flow:
 * 1. User authorizes on Stripe → Stripe redirects here with code + state
 * 2. Verify HMAC signature on state parameter (prevents attacker-crafted states)
 * 3. Exchange authorization code for account ID
 * 4. Save account ID to database
 * 5. Redirect user back to integrations page with success message
 *
 * State Format (signed):
 * - org-{organizationId}-{timestamp}-{hmacSignature}
 *
 * SOURCE OF TRUTH KEYWORDS: StripeOAuthCallback, OAuthStateVerification
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectStandardAccount, refreshAccountRestrictions } from '@/services/stripe/standard-account.service'
import { getOrganizationUrl } from '@/services/domain-lookup.service'
import { verifyOAuthState } from '@/lib/stripe/oauth-state'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle OAuth errors from Stripe
    if (error) {
      // On Stripe-side errors, attempt to verify state for redirect target.
      // If state is invalid/forged, fall back to platform URL.
      const stateResult = state ? verifyOAuthState(state) : null
      const redirectUrl = await getRedirectUrl(
        stateResult?.valid ? stateResult.entityType : null,
        stateResult?.valid ? stateResult.entityId : null,
        false,
        errorDescription || error
      )
      return NextResponse.redirect(redirectUrl)
    }

    // Validate required parameters
    if (!code || !state) {
      const redirectUrl = await getRedirectUrl(
        null,
        null,
        false,
        'Invalid OAuth callback parameters'
      )
      return NextResponse.redirect(redirectUrl)
    }

    // Verify HMAC signature on state to prevent forgery.
    // An attacker cannot craft a valid state for a victim's org without the signing secret.
    const stateResult = verifyOAuthState(state)

    if (!stateResult.valid || !stateResult.entityType || !stateResult.entityId) {
      console.error('[stripe-oauth] State verification failed:', stateResult.error)
      const redirectUrl = await getRedirectUrl(
        null,
        null,
        false,
        'OAuth state verification failed. Please try connecting again.'
      )
      return NextResponse.redirect(redirectUrl)
    }

    // Connect organization account — state is now cryptographically verified
    const result = await connectStandardAccount(code, stateResult.entityId)

    // Check for any account restrictions after connection
    // This ensures the cache is populated immediately (don't wait for webhook)
    await refreshAccountRestrictions(stateResult.entityId)

    // Success! Redirect back to integrations page on the user's domain
    const redirectUrl = await getRedirectUrl(
      stateResult.entityType,
      stateResult.entityId,
      true,
      'Stripe account connected successfully!'
    )
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    /** Log the real error server-side for debugging — never expose it to the client URL */
    console.error('[stripe-oauth] Callback error:', error)

    // Attempt to extract org for redirect — verify state even on error path
    const state = req.nextUrl.searchParams.get('state')
    const stateResult = state ? verifyOAuthState(state) : null

    const redirectUrl = await getRedirectUrl(
      stateResult?.valid ? stateResult.entityType : null,
      stateResult?.valid ? stateResult.entityId : null,
      false,
      'Failed to connect Stripe account. Please try again.'
    )
    return NextResponse.redirect(redirectUrl)
  }
}

/**
 * Get redirect URL based on entity type and result
 *
 * CRITICAL: This looks up the entity's actual domain (custom domain or subdomain)
 * and redirects the user there, not to the platform domain.
 *
 * @param entityType - Entity type ('org' only)
 * @param entityId - Entity ID (organization ID)
 * @param success - Whether the operation was successful
 * @param message - Success or error message to display
 * @returns Full redirect URL with query parameters
 */
async function getRedirectUrl(
  entityType: 'org' | null,
  entityId: string | null,
  success: boolean,
  message: string
): Promise<URL> {
  let baseUrl: string
  const path = '/settings/integrations'

  try {
    if (entityType === 'org' && entityId) {
      // Look up organization's domain (custom or subdomain)
      baseUrl = await getOrganizationUrl(entityId)
    } else {
      // Fallback to platform domain if entity lookup fails
      baseUrl = process.env.PLATFORM_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    }
  } catch (error) {
    // Fallback to platform domain on error
    baseUrl = process.env.PLATFORM_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  }

  const url = new URL(path, baseUrl)

  // Add success/error message as query parameter
  if (success) {
    url.searchParams.set('success', message)
  } else {
    url.searchParams.set('error', message)
  }

  return url
}
