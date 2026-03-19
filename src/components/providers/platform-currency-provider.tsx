'use client'

/**
 * Platform Currency Provider - Global Currency Context for Platform-Level Pricing
 *
 * WHY: The platform Stripe account determines the currency for SaaS plan pricing,
 * PAYG costs, wallet top-ups, and any non-organization monetary display. Without
 * this provider, all platform-level prices hardcode "$" / "USD" which breaks
 * for non-US deployments.
 *
 * MIRRORS: src/components/providers/currency-provider.tsx (org-level equivalent)
 *
 * DIFFERENCES FROM ORG PROVIDER:
 * - No organizationId prop needed (platform is global)
 * - Longer staleTime (30 min vs 5 min — platform currency almost never changes)
 * - Mounted in (main)/layout.tsx (covers onboarding, dashboard, settings, etc.)
 *
 * CACHING STRATEGY:
 * - Uses tRPC/React Query with staleTime: 30 minutes
 * - Cached data persists across page navigations
 * - Graceful fallback to USD while loading
 *
 * USAGE:
 * ```tsx
 * const { currency, symbol, formatCurrency } = usePlatformCurrency()
 * const price = formatCurrency(9900) // "€99" (if platform uses EUR)
 * ```
 *
 * SOURCE OF TRUTH KEYWORDS: PlatformCurrencyProvider, PlatformCurrencyContext, usePlatformCurrency
 */

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { trpc } from '@/trpc/react-provider'
import {
  getCurrencyInfo,
  DEFAULT_CURRENCY,
  type CurrencyInfo,
} from '@/constants/currencies'
import { formatCurrency as globalFormatCurrency, formatWalletAmount as globalFormatWalletAmount } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Platform currency context value available to all consumers.
 *
 * SOURCE OF TRUTH KEYWORDS: PlatformCurrencyContextValue
 */
interface PlatformCurrencyContextValue {
  /** ISO 4217 lowercase currency code (e.g., 'usd', 'eur', 'gbp') */
  currency: string
  /** Full currency information (symbol, name, decimals) */
  currencyInfo: CurrencyInfo
  /** Currency symbol for display (e.g., '$', '€', '£') */
  symbol: string
  /** Whether currency data is still loading */
  isLoading: boolean
  /** ISO 3166-1 alpha-2 country code of platform Stripe account */
  country: string | null
  /**
   * Format an amount in cents to a display string using the platform currency.
   * @param amountInCents - Amount in smallest currency unit
   * @returns Formatted string (e.g., '$10.50', '€10,50')
   */
  formatCurrency: (amountInCents: number) => string
  /**
   * Format a wallet amount in millicents to a display string.
   * WHY: Wallet uses millicents (1000 = $1.00) for sub-cent pricing accuracy.
   * @param amountInMillicents - Wallet amount in millicents
   * @returns Formatted string (e.g., '$10.00', '$0.015')
   */
  formatWalletAmount: (amountInMillicents: number) => string
}

// ============================================================================
// CONTEXT
// ============================================================================

/** Default currency info used before data loads or if provider is missing */
const defaultCurrencyInfo = getCurrencyInfo(DEFAULT_CURRENCY)

const PlatformCurrencyContext = createContext<PlatformCurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  currencyInfo: defaultCurrencyInfo,
  symbol: defaultCurrencyInfo.symbol,
  isLoading: true,
  country: null,
  formatCurrency: (amount) => globalFormatCurrency(amount, DEFAULT_CURRENCY),
  formatWalletAmount: (amount) => globalFormatWalletAmount(amount, DEFAULT_CURRENCY),
})

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface PlatformCurrencyProviderProps {
  children: ReactNode
}

/**
 * Platform Currency Provider Component
 *
 * Fetches and caches the platform Stripe account's currency, providing it
 * to all children via React context. Uses tRPC with React Query for caching.
 *
 * Mount this in src/app/(main)/layout.tsx to cover all platform-level pages
 * (onboarding, dashboard, settings, etc.).
 *
 * @example
 * ```tsx
 * // In (main)/layout.tsx
 * <PlatformCurrencyProvider>
 *   {children}
 * </PlatformCurrencyProvider>
 * ```
 */
export function PlatformCurrencyProvider({ children }: PlatformCurrencyProviderProps) {
  /* Fetch platform currency via tRPC — heavily cached because it almost never changes */
  const {
    data: currencyData,
    isLoading,
  } = trpc.features.getPlatformCurrency.useQuery(undefined, {
    staleTime: 30 * 60 * 1000, // 30 minutes — platform currency rarely changes
    placeholderData: (previousData) => previousData,
    retry: 2,
    refetchOnWindowFocus: false,
  })

  /* Memoize the currency info to prevent unnecessary re-renders */
  const currencyInfo = useMemo(() => {
    if (currencyData) {
      return getCurrencyInfo(currencyData.currency)
    }
    return defaultCurrencyInfo
  }, [currencyData])

  /* Format function for Stripe amounts (cents) using platform currency */
  const formatCurrency = useCallback(
    (amountInCents: number) => {
      const code = currencyData?.currency || DEFAULT_CURRENCY
      return globalFormatCurrency(amountInCents, code)
    },
    [currencyData?.currency]
  )

  /* Format function for wallet amounts (millicents) using platform currency */
  const formatWalletAmount = useCallback(
    (amountInMillicents: number) => {
      const code = currencyData?.currency || DEFAULT_CURRENCY
      return globalFormatWalletAmount(amountInMillicents, code)
    },
    [currencyData?.currency]
  )

  /* Memoize the entire context value */
  const value = useMemo<PlatformCurrencyContextValue>(
    () => ({
      currency: currencyData?.currency || DEFAULT_CURRENCY,
      currencyInfo,
      symbol: currencyData?.symbol || defaultCurrencyInfo.symbol,
      isLoading,
      country: currencyData?.country || null,
      formatCurrency,
      formatWalletAmount,
    }),
    [currencyData, currencyInfo, isLoading, formatCurrency, formatWalletAmount]
  )

  return (
    <PlatformCurrencyContext.Provider value={value}>
      {children}
    </PlatformCurrencyContext.Provider>
  )
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access platform currency context.
 *
 * Returns the platform's Stripe account currency with formatting utilities.
 * Falls back to USD if provider isn't mounted or data is loading.
 *
 * @example
 * ```tsx
 * function PlanPrice({ amountInCents }: { amountInCents: number }) {
 *   const { formatCurrency, symbol } = usePlatformCurrency()
 *   return <span>{formatCurrency(amountInCents)}</span>
 * }
 * ```
 *
 * SOURCE OF TRUTH KEYWORDS: usePlatformCurrency
 */
export function usePlatformCurrency(): PlatformCurrencyContextValue {
  return useContext(PlatformCurrencyContext)
}

/**
 * Hook to get just the platform currency symbol.
 *
 * @returns Currency symbol (e.g., '$', '€', '£')
 *
 * SOURCE OF TRUTH KEYWORDS: usePlatformCurrencySymbol
 */
export function usePlatformCurrencySymbol(): string {
  const { symbol } = usePlatformCurrency()
  return symbol
}
