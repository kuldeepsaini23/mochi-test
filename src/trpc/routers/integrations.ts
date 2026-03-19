/**
 * Integrations Router
 *
 * Handles Stripe Standard account operations and integration management.
 * Thin controllers - just call services. Auth/permission checks in procedures.
 */

import { z } from 'zod'
import { createTRPCRouter, organizationProcedure } from '../init'
import {
  getStandardAccountOAuthUrl,
  connectStandardAccount,
  getStandardAccountStatus,
  disconnectStandardAccount,
  getConnectedAccountRestrictions,
} from '@/services/stripe/standard-account.service'
import { getStudioIntegrations } from '@/services/integration/integration.service'
import { getStripeConnectedAccountId } from '@/services/organization.service'
import { stripe } from '@/lib/config'

export const integrationsRouter = createTRPCRouter({
  /**
   * Get all integrations with their connection status
   *
   * Returns list of available integrations (e.g., Stripe) with current status.
   * Shows connected, pending, or disconnected state for each integration.
   *
   * Requires: integrations:read permission
   */
  getIntegrations: organizationProcedure({ requirePermission: 'integrations:read' })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const integrations = await getStudioIntegrations(input.organizationId)
      return { integrations }
    }),

  /**
   * Get Stripe OAuth URL
   *
   * Generates OAuth URL for connecting Standard Stripe account.
   * User will be redirected to Stripe to authorize connection.
   *
   * SECURITY: Requires integrations:update (owner only for financial access)
   */
  getStripeOAuthUrl: organizationProcedure({
    requirePermission: 'integrations:update',
  })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Use platform API URL for OAuth callback (not tied to any specific subdomain)
      const platformApiUrl = process.env.PLATFORM_API_URL || process.env.NEXT_PUBLIC_APP_URL
      const redirectUri = `${platformApiUrl}/api/stripe/oauth/callback`

      const url = await getStandardAccountOAuthUrl(
        input.organizationId,
        redirectUri
      )

      return { url }
    }),

  /**
   * Connect Standard account (OAuth callback handler)
   *
   * Exchanges OAuth authorization code for Stripe account ID.
   * Called from OAuth callback route after user authorizes.
   *
   * Requires: integrations:update permission
   */
  connectStandardAccount: organizationProcedure({
    requirePermission: 'integrations:update',
  })
    .input(
      z.object({
        organizationId: z.string(),
        code: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await connectStandardAccount(input.code, input.organizationId)
      return result
    }),

  /**
   * Get Standard account status
   *
   * Returns connection status for Stripe Standard account.
   *
   * Requires: integrations:read permission
   */
  getStandardAccountStatus: organizationProcedure({
    requirePermission: 'integrations:read',
  })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const status = await getStandardAccountStatus(input.organizationId)
      return status
    }),

  /**
   * Disconnect Standard account
   *
   * Revokes OAuth access and disconnects Stripe account.
   * WARNING: This is destructive and cannot be undone.
   *
   * Requires: integrations:update permission
   */
  disconnectStandardAccount: organizationProcedure({
    requirePermission: 'integrations:update',
  })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input }) => {
      await disconnectStandardAccount(input.organizationId)

      return {
        success: true,
        message: 'Standard account disconnected successfully',
      }
    }),

  /**
   * Get Express dashboard link
   *
   * Generates Stripe dashboard login link for viewing financial data.
   * For Standard accounts, creates a login link to connected account.
   * Link expires in 5 minutes.
   *
   * SECURITY: Requires integrations:update (financial data access)
   * WHY: Dashboard shows sensitive financial data (balance, payouts, transfers)
   * Only users who can manage integrations should access this.
   */
  getExpressDashboardLink: organizationProcedure({
    requirePermission: 'integrations:update',
  })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      // Get connected account ID from service
      const stripeConnectedAccountId = await getStripeConnectedAccountId(input.organizationId)

      if (!stripeConnectedAccountId) {
        throw new Error('No connected Stripe account found')
      }

      // Create login link for Standard account
      const loginLink = await stripe.accounts.createLoginLink(
        stripeConnectedAccountId
      )

      return { url: loginLink.url }
    }),

  /**
   * Get connected account restrictions
   *
   * Checks if the connected Stripe account has any restrictions or pending requirements.
   * Returns dashboard URL if action is needed.
   *
   * Requires: integrations:read permission
   */
  getAccountRestrictions: organizationProcedure({
    requirePermission: 'integrations:read',
  })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return await getConnectedAccountRestrictions(input.organizationId)
    }),
})
