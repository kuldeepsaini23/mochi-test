/**
 * Platform Currency Service - Platform-Level Currency Source of Truth
 *
 * WHY: The platform Stripe account determines what currency SaaS plans,
 * PAYG pricing, and wallet top-ups are denominated in. Without this,
 * all platform-level prices hardcode "$" / "USD" which breaks for
 * non-US deployments.
 *
 * HOW: Fetches the platform Stripe account's default_currency and country
 * via the Stripe API, then caches the result per-request with React.cache().
 *
 * MIRRORS: src/services/currency.service.ts (org-level equivalent)
 *
 * CACHING STRATEGY:
 * - Server-side: React cache() for request-level deduplication
 * - Client-side: PlatformCurrencyProvider uses tRPC + React Query (staleTime: 30min)
 * - Currency almost never changes (only if Stripe account region changes)
 *
 * SOURCE OF TRUTH KEYWORDS: PlatformCurrency, PlatformStripeCurrency, PlatformCurrencyService
 */

import 'server-only'
import { cache } from 'react'
import { stripe } from '@/lib/config/stripe'
import {
  DEFAULT_CURRENCY,
  getCurrencyInfo,
  type CurrencyInfo,
} from '@/constants/currencies'

/**
 * Result type for getPlatformCurrency function.
 * Contains all currency-related information for the platform Stripe account.
 *
 * SOURCE OF TRUTH KEYWORDS: PlatformCurrencyInfo
 */
export interface PlatformCurrencyInfo {
  /** ISO 4217 lowercase currency code (e.g., 'usd', 'eur', 'gbp') */
  currency: string
  /** Full currency information (symbol, name, decimals) */
  currencyInfo: CurrencyInfo
  /** ISO 3166-1 alpha-2 country code of the platform Stripe account (e.g., 'US', 'GB') */
  country: string | null
}

/**
 * Internal function to fetch the platform Stripe account's currency.
 * Uses stripe.accounts.retrieve() with no ID which returns the platform account.
 *
 * WHY: The platform's Stripe account has a default_currency set based on
 * the country it was created in. All platform plan prices are in this currency.
 */
async function fetchPlatformCurrency(): Promise<PlatformCurrencyInfo> {
  try {
    /* Retrieve the platform's own Stripe account (no account ID = self) */
    const account = await stripe.accounts.retrieve()

    const currency = account.default_currency?.toLowerCase() || DEFAULT_CURRENCY
    const country = account.country || null

    return {
      currency,
      currencyInfo: getCurrencyInfo(currency),
      country,
    }
  } catch (error) {
    /* Graceful fallback — if Stripe is unreachable, default to USD
     * rather than crashing the entire page load */
    console.error('[PlatformCurrency] Failed to fetch Stripe account, using default:', error)
    return {
      currency: DEFAULT_CURRENCY,
      currencyInfo: getCurrencyInfo(DEFAULT_CURRENCY),
      country: null,
    }
  }
}

/**
 * Get the platform's Stripe account currency.
 *
 * This is the SOURCE OF TRUTH for platform-level currency (SaaS plan pricing,
 * PAYG costs, wallet top-ups, and any non-organization monetary display).
 *
 * CACHING: Wrapped with React.cache() so multiple calls within a single
 * server request only hit the Stripe API once.
 *
 * @returns PlatformCurrencyInfo with currency details
 *
 * @example
 * ```ts
 * const { currency, currencyInfo } = await getPlatformCurrency()
 * // currency: 'eur'
 * // currencyInfo: { code: 'eur', symbol: '€', name: 'Euro', decimals: 2 }
 * ```
 *
 * SOURCE OF TRUTH KEYWORDS: getPlatformCurrency, PlatformStripeCurrencyFetch
 */
export const getPlatformCurrency = cache(fetchPlatformCurrency)
