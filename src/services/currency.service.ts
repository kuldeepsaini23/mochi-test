/**
 * Currency Service - Organization Currency Source of Truth
 *
 * WHY: Centralized currency logic to ensure consistency across the application
 * HOW: Fetches currency from organization's connected Stripe account
 *
 * This service provides the single source of truth for organization currency.
 * The Stripe account's default currency is used for all monetary operations
 * (products, payments, invoices, UI displays).
 *
 * CACHING STRATEGY:
 * - Server-side: Uses React cache() for request-level deduplication
 * - Client-side: CurrencyProvider stores in context, tRPC uses React Query caching
 * - Currency rarely changes (only when Stripe account is connected/disconnected)
 *
 * USAGE:
 * - Product creation (src/services/product.service.ts)
 * - Currency Provider (src/components/providers/currency-provider.tsx)
 * - Payment processing (src/services/payment.service.ts)
 * - Any component needing organization currency
 *
 * SOURCE OF TRUTH KEYWORDS: OrganizationCurrency, StripeCurrency, CurrencyService
 */

import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/config'
import {
  CurrencyInfo,
  DEFAULT_CURRENCY,
  getCurrencyInfo,
} from '@/constants/currencies'
import { formatCurrency } from '@/lib/utils'

/**
 * Result type for getOrganizationCurrency function
 * Contains all currency-related information for an organization
 */
export interface OrganizationCurrencyInfo {
  /** ISO 4217 lowercase currency code (e.g., 'usd', 'eur', 'gbp') */
  currency: string
  /** Full currency information (symbol, name, decimals) */
  currencyInfo: CurrencyInfo
  /** ISO 3166-1 alpha-2 country code of the Stripe account (e.g., 'US', 'GB') */
  country: string | null
  /** Whether the organization has a connected Stripe account */
  hasStripeConnected: boolean
}

/**
 * Internal function to fetch organization currency from database.
 * Wrapped with React cache() for request-level deduplication.
 */
async function fetchOrganizationCurrency(
  organizationId: string
): Promise<OrganizationCurrencyInfo> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      stripeConnectedAccountId: true,
      stripeAccountCountry: true,
      stripeAccountCurrency: true,
    },
  })

  if (!organization) {
    throw new Error(`Organization not found: ${organizationId}`)
  }

  // Determine if Stripe is connected (has account ID and currency)
  const hasStripeConnected = Boolean(
    organization.stripeConnectedAccountId && organization.stripeAccountCurrency
  )

  // Use Stripe account currency or fall back to default
  const currency = organization.stripeAccountCurrency || DEFAULT_CURRENCY

  return {
    currency,
    currencyInfo: getCurrencyInfo(currency),
    country: organization.stripeAccountCountry,
    hasStripeConnected,
  }
}

/**
 * Get the currency for an organization based on their Stripe account.
 *
 * This is the SOURCE OF TRUTH for organization currency.
 * The currency is determined by the connected Stripe account's default currency.
 *
 * CACHING: Uses React cache() for request-level deduplication.
 * Multiple calls with the same organizationId within a single request
 * will only hit the database once.
 *
 * FALLBACK BEHAVIOR:
 * - If no Stripe account connected: Returns DEFAULT_CURRENCY ('usd')
 * - If Stripe account has no currency set: Returns DEFAULT_CURRENCY ('usd')
 *
 * @param organizationId - The organization ID to get currency for
 * @returns OrganizationCurrencyInfo with currency details
 * @throws Error if organization not found
 *
 * @example
 * ```ts
 * const { currency, currencyInfo, hasStripeConnected } = await getOrganizationCurrency(orgId)
 *
 * if (hasStripeConnected) {
 *   console.log(`Organization uses ${currencyInfo.name} (${currencyInfo.symbol})`)
 * } else {
 *   console.log('No Stripe connected, using default USD')
 * }
 * ```
 */
export const getOrganizationCurrency = cache(fetchOrganizationCurrency)

/**
 * Validate that a currency matches the organization's Stripe account currency.
 *
 * Used to enforce currency consistency when creating products/prices.
 * Throws an error if the provided currency doesn't match the organization's currency.
 *
 * @param organizationId - The organization ID to validate against
 * @param currency - The currency code to validate (case-insensitive)
 * @throws Error if currency doesn't match organization's currency
 *
 * @example
 * ```ts
 * // This will throw if org uses EUR but 'usd' is passed
 * await validateOrganizationCurrency(orgId, 'usd')
 *
 * // This will pass if org uses EUR
 * await validateOrganizationCurrency(orgId, 'eur')
 * ```
 */
export async function validateOrganizationCurrency(
  organizationId: string,
  currency: string
): Promise<void> {
  const { currency: orgCurrency, hasStripeConnected } = await getOrganizationCurrency(organizationId)

  // Normalize for comparison (both should be lowercase)
  const normalizedInput = currency.toLowerCase()
  const normalizedOrg = orgCurrency.toLowerCase()

  if (normalizedInput !== normalizedOrg) {
    throw new Error(
      `Currency mismatch: Product currency (${normalizedInput.toUpperCase()}) ` +
        `does not match organization's Stripe currency (${normalizedOrg.toUpperCase()}). ` +
        (hasStripeConnected
          ? 'All prices must use your connected Stripe account currency.'
          : 'Connect a Stripe account to use a different currency.')
    )
  }
}

/**
 * Get organization currency with formatted display string.
 * Convenience function for UI display purposes.
 *
 * @param organizationId - The organization ID
 * @returns Object with currency code and formatted display name
 *
 * @example
 * ```ts
 * const { displayName } = await getOrganizationCurrencyDisplay(orgId)
 * // displayName: "US Dollar ($)"
 * ```
 */
export async function getOrganizationCurrencyDisplay(organizationId: string): Promise<{
  currency: string
  displayName: string
  symbol: string
  hasStripeConnected: boolean
}> {
  const { currency, currencyInfo, hasStripeConnected } =
    await getOrganizationCurrency(organizationId)

  return {
    currency,
    displayName: `${currencyInfo.name} (${currencyInfo.symbol})`,
    symbol: currencyInfo.symbol,
    hasStripeConnected,
  }
}

/**
 * Format a price amount using the organization's currency.
 *
 * @param organizationId - The organization ID
 * @param amountInSmallestUnit - Amount in smallest currency unit (e.g., cents)
 * @param locale - Optional locale for formatting (default: 'en-US')
 * @returns Formatted currency string (e.g., '$10.00', '€10,00')
 *
 * @example
 * ```ts
 * const formatted = await formatOrganizationPrice(orgId, 1050)
 * // formatted: "$10.50" (if org uses USD)
 * ```
 */
export async function formatOrganizationPrice(
  organizationId: string,
  amountInSmallestUnit: number,
  locale: string = 'en-US'
): Promise<string> {
  const { currency } = await getOrganizationCurrency(organizationId)
  return formatCurrency(amountInSmallestUnit, currency)
}

/**
 * Batch get currency info for multiple organizations.
 * Optimized for bulk operations to avoid N+1 queries.
 *
 * @param organizationIds - Array of organization IDs
 * @returns Map of organization ID to currency info
 *
 * @example
 * ```ts
 * const currencies = await getOrganizationCurrencies(['org1', 'org2'])
 * const org1Currency = currencies.get('org1')?.currency
 * ```
 */
export async function getOrganizationCurrencies(
  organizationIds: string[]
): Promise<Map<string, OrganizationCurrencyInfo>> {
  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationIds } },
    select: {
      id: true,
      stripeConnectedAccountId: true,
      stripeAccountCountry: true,
      stripeAccountCurrency: true,
    },
  })

  const result = new Map<string, OrganizationCurrencyInfo>()

  for (const org of organizations) {
    const hasStripeConnected = Boolean(org.stripeConnectedAccountId && org.stripeAccountCurrency)
    const currency = org.stripeAccountCurrency || DEFAULT_CURRENCY

    result.set(org.id, {
      currency,
      currencyInfo: getCurrencyInfo(currency),
      country: org.stripeAccountCountry,
      hasStripeConnected,
    })
  }

  return result
}
