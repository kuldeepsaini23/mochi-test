/**
 * Organization Settings Router
 *
 * WHY: Manage organization settings (name, slug, custom domain, etc.)
 * HOW: Uses organizationProcedure with permission checks
 *
 * ARCHITECTURE:
 * - Requires organization-settings:read permission to view
 * - Requires organization-settings:update permission to modify
 * - Returns instant data from getUserOrganizations cache when possible
 */

import { z } from 'zod'
import { createTRPCRouter, organizationProcedure } from '../init'
import { TRPCError } from '@trpc/server'
import { withBooleanFeature } from '@/trpc/procedures/feature-gates'
import { getOrganizationCurrency } from '@/services/currency.service'
import { getCurrencyInfo, DEFAULT_CURRENCY } from '@/constants/currencies'
import {
  getOrganizationSettings,
  updateOrganizationInfo,
  updateOrganizationCustomDomain,
  removeOrganizationCustomDomain,
  updateOrganizationLogo,
  updateOrganizationRectangleLogo,
} from '@/services/organization.service'

export const organizationSettingsRouter = createTRPCRouter({
  /**
   * Get organization settings
   *
   * PERMISSION: organization-settings:read
   * CACHE BEHAVIOR:
   * - Server: Single DB query per request (React cache)
   * - Client: Set staleTime: Infinity, manual invalidation after updates
   */
  getOrganizationSettings: organizationProcedure({
    requirePermission: 'organization-settings:read',
  })
    .input(
      z.object({
        organizationId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const organization = await getOrganizationSettings(input.organizationId)

      if (!organization) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        })
      }

      return { ...organization, address: null as string | null, contactEmail: null as string | null }
    }),

  /**
   * Get organization currency info
   *
   * Returns the currency configuration for the organization based on their
   * connected Stripe account. This is the SOURCE OF TRUTH for all monetary
   * operations in the organization.
   *
   * PERMISSION: organization-settings:read
   * CACHE BEHAVIOR:
   * - Server: Uses React cache() for request-level deduplication
   * - Client: Set staleTime to a high value (e.g., 5 minutes) since currency
   *   rarely changes. Invalidate manually after Stripe connect/disconnect.
   *
   * SOURCE OF TRUTH KEYWORDS: OrganizationCurrency, CurrencyEndpoint
   */
  getCurrency: organizationProcedure({
    requirePermission: 'organization-settings:read',
  })
    .input(
      z.object({
        organizationId: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        // Use the cached currency service (React cache() for request dedup)
        const currencyInfo = await getOrganizationCurrency(input.organizationId)

        return {
          currency: currencyInfo.currency,
          symbol: currencyInfo.currencyInfo.symbol,
          name: currencyInfo.currencyInfo.name,
          decimals: currencyInfo.currencyInfo.decimals,
          country: currencyInfo.country,
          hasStripeConnected: currencyInfo.hasStripeConnected,
        }
      } catch {
        // Fallback to default if organization not found (shouldn't happen with auth)
        const defaultInfo = getCurrencyInfo(DEFAULT_CURRENCY)
        return {
          currency: DEFAULT_CURRENCY,
          symbol: defaultInfo.symbol,
          name: defaultInfo.name,
          decimals: defaultInfo.decimals,
          country: null,
          hasStripeConnected: false,
        }
      }
    }),

  /**
   * Update basic organization info (name, slug)
   *
   * PERMISSION: organization-settings:update
   */
  updateOrganizationInfo: organizationProcedure({
    requirePermission: 'organization-settings:update',
  })
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1, 'Name is required').max(100).optional(),
        slug: z
          .string()
          .min(1, 'Slug is required')
          .max(50)
          .regex(
            /^[a-z0-9-]+$/,
            'Slug must be lowercase alphanumeric with hyphens only'
          )
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { organizationId, ...data } = input

      const result = await updateOrganizationInfo(organizationId, data)

      if (result.conflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Slug is already taken',
        })
      }

      return {
        success: true,
        organization: result.organization,
      }
    }),

  /**
   * Update custom domain
   *
   * PERMISSION: organization-settings:update
   */
  updateCustomDomain: organizationProcedure({
    requirePermission: 'organization-settings:update',
  })
    .input(
      z.object({
        organizationId: z.string(),
        domain: z.string().min(1, 'Domain is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      /* Feature gate checked at handler level: boolean feature check with custom error message.
       * Procedure-level requireFeature only supports limit-type checks (increment=1).
       * Boolean features like custom_domain need requireBooleanFeature which doesn't exist yet. */
      await withBooleanFeature(ctx, input.organizationId, 'custom_domain', 'Custom domains require a paid plan. Please upgrade to set a custom domain.')

      // Validate domain format (basic validation)
      const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i
      if (!domainRegex.test(input.domain)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid domain format',
        })
      }

      const result = await updateOrganizationCustomDomain(input.organizationId, input.domain)

      if (result.conflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Domain is already in use by another organization',
        })
      }

      return {
        success: true,
        organization: result.organization,
        message: 'Custom domain updated. Verification pending.',
      }
    }),

  /**
   * Remove custom domain
   *
   * PERMISSION: organization-settings:update
   */
  removeCustomDomain: organizationProcedure({
    requirePermission: 'organization-settings:update',
  })
    .input(
      z.object({
        organizationId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const updatedOrg = await removeOrganizationCustomDomain(input.organizationId)

      return {
        success: true,
        organization: updatedOrg,
      }
    }),

  /**
   * Update organization logo (square)
   *
   * WHY: Update the square logo for the organization
   * PERMISSION: organization-settings:update
   *
   * SOURCE OF TRUTH: Organization.logo field
   */
  updateLogo: organizationProcedure({
    requirePermission: 'organization-settings:update',
  })
    .input(
      z.object({
        organizationId: z.string(),
        logo: z.string().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const updatedOrg = await updateOrganizationLogo(input.organizationId, input.logo)

      return {
        success: true,
        organization: updatedOrg,
      }
    }),

  /**
   * Update organization rectangle logo (wide)
   *
   * WHY: Update the rectangle/wide logo for the organization
   * PERMISSION: organization-settings:update
   *
   * SOURCE OF TRUTH: Organization.rectangleLogo field
   */
  updateRectangleLogo: organizationProcedure({
    requirePermission: 'organization-settings:update',
  })
    .input(
      z.object({
        organizationId: z.string(),
        rectangleLogo: z.string().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const updatedOrg = await updateOrganizationRectangleLogo(input.organizationId, input.rectangleLogo)

      return {
        success: true,
        organization: updatedOrg,
      }
    }),
})
