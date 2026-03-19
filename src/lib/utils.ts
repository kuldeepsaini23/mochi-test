import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getCurrencyInfo } from '@/constants/currencies'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * CURRENCY FORMATTING UTILITY — SINGLE SOURCE OF TRUTH
 *
 * SOURCE OF TRUTH: formatCurrency, CurrencyDisplay, PriceFormatting
 *
 * Every price displayed anywhere in the app (server-side AND client-side)
 * MUST go through this function so the user always sees exactly what they're charged.
 *
 * Rules:
 * - Currency-aware decimals (USD=2, JPY=0, BHD=3) via getCurrencyInfo()
 * - Smart rounding: hides trailing zeros for whole numbers ($50 not $50.00)
 * - Shows decimals when present ($49.99)
 * - Uses Intl.NumberFormat for proper locale-aware symbols
 *
 * @param amountInCents - Amount in smallest currency unit (cents for USD, yen for JPY)
 * @param currency - ISO 4217 currency code (default: 'USD')
 * @returns Formatted currency string (e.g., "$49.99" or "$50" or "¥1,000")
 */
export function formatCurrency(
  amountInCents: number,
  currency: string = 'USD'
): string {
  const info = getCurrencyInfo(currency)
  const divisor = Math.pow(10, info.decimals)
  const amount = amountInCents / divisor

  /** Smart rounding: whole numbers get no decimals, fractional get full precision */
  const isWholeNumber = amount % 1 === 0

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: info.code.toUpperCase(),
    minimumFractionDigits: isWholeNumber ? 0 : info.decimals,
    maximumFractionDigits: info.decimals,
  }).format(amount)
}

/**
 * WALLET AMOUNT FORMATTING — Millicents to display string
 *
 * SOURCE OF TRUTH: formatWalletAmount, WalletDisplayFormatting
 *
 * WHY: Wallet stores amounts in MILLICENTS (1000 = $1.00) instead of cents,
 *      because sub-cent PAYG pricing ($0.015, $0.008) needs integer precision.
 *      This function handles the millicent-to-display conversion.
 *
 * HOW: Divides by 1000 (not 100 like formatCurrency) and formats.
 *
 * NOTE: Use formatCurrency() for Stripe amounts (still in cents).
 *       Use formatWalletAmount() for wallet balances and transactions.
 *
 * @param amountInMillicents - Amount in millicents (1000 = $1.00)
 * @param currency - ISO 4217 currency code (default: 'USD')
 * @returns Formatted currency string (e.g., "$15.00", "$0.02")
 */
export function formatWalletAmount(
  amountInMillicents: number,
  currency: string = 'USD'
): string {
  const info = getCurrencyInfo(currency)
  const amount = amountInMillicents / 1000
  const isWholeNumber = amount % 1 === 0
  /** Show 3 decimals when sub-cent precision exists ($0.015, $0.008), otherwise 2 ($50.08) */
  const hasSubCentPrecision = !isWholeNumber && Math.round(amount * 1000) % 10 !== 0

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: info.code.toUpperCase(),
    minimumFractionDigits: isWholeNumber ? 0 : 2,
    maximumFractionDigits: hasSubCentPrecision ? 3 : info.decimals,
  }).format(amount)
}
