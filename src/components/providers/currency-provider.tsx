'use client'

/**
 * Currency Provider - Global Currency Context for Organization
 *
 * WHY: Provides consistent currency information throughout the application.
 * HOW: Fetches currency once via tRPC with React Query caching, stores in context.
 *
 * CACHING STRATEGY:
 * - Uses tRPC/React Query with staleTime: 5 minutes (currency rarely changes)
 * - Cached data persists across page navigations
 * - Manual invalidation after Stripe connect/disconnect events
 *
 * USAGE:
 * ```tsx
 * // In any component
 * const { currency, symbol, formatCurrency } = useCurrency()
 * const price = formatCurrency(1050) // "$10.50"
 * ```
 *
 * SOURCE OF TRUTH KEYWORDS: CurrencyProvider, CurrencyContext, useCurrency
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
 * Currency context value available to all consumers
 */
interface CurrencyContextValue {
  /** ISO 4217 lowercase currency code (e.g., 'usd', 'eur', 'gbp') */
  currency: string
  /** Full currency information (symbol, name, decimals) */
  currencyInfo: CurrencyInfo
  /** Currency symbol for display (e.g., '$', '€', '£') */
  symbol: string
  /** Whether the organization has a connected Stripe account */
  hasStripeConnected: boolean
  /** Whether currency data is still loading */
  isLoading: boolean
  /** ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB') */
  country: string | null
  /**
   * Format an amount in cents to a display string (for Stripe/non-wallet amounts)
   * @param amountInCents - Amount in smallest currency unit
   * @param locale - Optional locale for formatting (default: 'en-US')
   * @returns Formatted string (e.g., '$10.50', '€10,50')
   */
  formatCurrency: (amountInCents: number, locale?: string) => string
  /**
   * Format a wallet amount in millicents to a display string
   * WHY: Wallet uses millicents (1000 = $1.00) for sub-cent pricing accuracy
   * @param amountInMillicents - Wallet amount in millicents
   * @returns Formatted string (e.g., '$10.00', '$0.015')
   */
  formatWalletAmount: (amountInMillicents: number) => string
  /** Invalidate and refetch currency data (call after Stripe connect/disconnect) */
  refetch: () => void
}

// ============================================================================
// CONTEXT
// ============================================================================

/**
 * Default context value used when no provider is present.
 * Falls back to USD with a warning-level formatCurrency.
 */
const defaultCurrencyInfo = getCurrencyInfo(DEFAULT_CURRENCY)

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  currencyInfo: defaultCurrencyInfo,
  symbol: defaultCurrencyInfo.symbol,
  hasStripeConnected: false,
  isLoading: true,
  country: null,
  formatCurrency: (amount) => globalFormatCurrency(amount, DEFAULT_CURRENCY),
  formatWalletAmount: (amount) => globalFormatWalletAmount(amount, DEFAULT_CURRENCY),
  refetch: () => {
    console.warn('CurrencyProvider not mounted, refetch is a no-op')
  },
})

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface CurrencyProviderProps {
  /** Organization ID to fetch currency for */
  organizationId: string
  /** Child components */
  children: ReactNode
}

/**
 * Currency Provider Component
 *
 * Fetches and caches organization currency data, providing it to all children
 * via React context. Uses tRPC with React Query for efficient caching.
 *
 * @example
 * ```tsx
 * // In your layout
 * <CurrencyProvider organizationId={org.id}>
 *   <YourApp />
 * </CurrencyProvider>
 * ```
 */
export function CurrencyProvider({ organizationId, children }: CurrencyProviderProps) {
  // Fetch currency with tRPC - cached for 5 minutes
  // staleTime prevents unnecessary refetches, currency rarely changes
  const {
    data: currencyData,
    isLoading,
    refetch,
  } = trpc.organizationSettings.getCurrency.useQuery(
    { organizationId },
    {
      // Currency rarely changes - keep data fresh for 5 minutes
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Keep previous data while refetching
      placeholderData: (previousData) => previousData,
      // Retry on failure
      retry: 2,
      // Don't refetch on window focus (currency doesn't change that often)
      refetchOnWindowFocus: false,
    }
  )

  // Memoize the currency info to prevent unnecessary re-renders
  const currencyInfo = useMemo(() => {
    if (currencyData) {
      return getCurrencyInfo(currencyData.currency)
    }
    return defaultCurrencyInfo
  }, [currencyData])

  // Memoize the format function for Stripe/non-wallet amounts (cents)
  const formatCurrency = useCallback(
    (amountInCents: number, _locale: string = 'en-US') => {
      const code = currencyData?.currency || DEFAULT_CURRENCY
      return globalFormatCurrency(amountInCents, code)
    },
    [currencyData?.currency]
  )

  // Memoize the wallet format function for wallet amounts (millicents)
  const formatWalletAmount = useCallback(
    (amountInMillicents: number) => {
      const code = currencyData?.currency || DEFAULT_CURRENCY
      return globalFormatWalletAmount(amountInMillicents, code)
    },
    [currencyData?.currency]
  )

  // Memoize refetch callback
  const handleRefetch = useCallback(() => {
    refetch()
  }, [refetch])

  // Memoize the entire context value
  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency: currencyData?.currency || DEFAULT_CURRENCY,
      currencyInfo,
      symbol: currencyData?.symbol || defaultCurrencyInfo.symbol,
      hasStripeConnected: currencyData?.hasStripeConnected || false,
      isLoading,
      country: currencyData?.country || null,
      formatCurrency,
      formatWalletAmount,
      refetch: handleRefetch,
    }),
    [currencyData, currencyInfo, isLoading, formatCurrency, formatWalletAmount, handleRefetch]
  )

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access currency context
 *
 * @returns Currency context value with formatting utilities
 * @throws Warning if used outside CurrencyProvider (falls back to USD)
 *
 * @example
 * ```tsx
 * function PriceDisplay({ amountInCents }: { amountInCents: number }) {
 *   const { formatCurrency, symbol, isLoading } = useCurrency()
 *
 *   if (isLoading) return <Skeleton />
 *
 *   return <span>{formatCurrency(amountInCents)}</span>
 * }
 * ```
 */
export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext)
  return context
}

/**
 * Hook to get just the format function (lighter weight)
 *
 * @returns Memoized format function
 *
 * @example
 * ```tsx
 * function Price({ cents }: { cents: number }) {
 *   const formatCurrency = useFormatCurrency()
 *   return <span>{formatCurrency(cents)}</span>
 * }
 * ```
 */
export function useFormatCurrency(): (amountInCents: number, locale?: string) => string {
  const { formatCurrency } = useCurrency()
  return formatCurrency
}

/**
 * Hook to get currency symbol
 *
 * @returns Currency symbol (e.g., '$', '€', '£')
 *
 * @example
 * ```tsx
 * function PriceInput() {
 *   const symbol = useCurrencySymbol()
 *   return <span className="prefix">{symbol}</span>
 * }
 * ```
 */
export function useCurrencySymbol(): string {
  const { symbol } = useCurrency()
  return symbol
}
