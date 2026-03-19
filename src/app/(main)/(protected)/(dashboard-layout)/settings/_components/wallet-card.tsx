'use client'

/**
 * Wallet Card Component - Self-contained card with balance, actions, and info
 *
 * DESIGN: Clean dark card with all wallet info in one place
 * - Balance displayed at bottom left
 * - Payment method info at top right
 * - Add Funds button at bottom right
 * - Auto top-up note at top left
 *
 * SOURCE OF TRUTH: WalletCard, WalletPaymentMethod, CurrencyProvider
 */

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getCurrencyInfo, DEFAULT_CURRENCY } from '@/constants/currencies'

export interface WalletPaymentMethod {
  brand: string | null
  last4: string
}

interface WalletCardProps {
  balance: number
  currency?: string
  paymentMethod?: WalletPaymentMethod | null
  isLoading?: boolean
  className?: string
  onAddFunds?: () => void
}

/**
 * Format wallet balance using centralized currency constants
 * WHY: Shows balance rounded to 2 decimal places for accuracy (e.g., $12.50)
 */
function formatBalance(amount: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function getBrandDisplay(brand: string | null): string {
  if (!brand) return 'Card'
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

export function WalletCard({
  balance,
  currency = 'USD',
  paymentMethod,
  isLoading = false,
  className,
  onAddFunds,
}: WalletCardProps) {
  const isNegative = balance < 0
  const formattedBalance = formatBalance(balance, currency)

  return (
    <div
      className={cn(
        'relative w-[320px] h-[200px] bg-zinc-900 rounded-2xl p-5',
        className
      )}
    >
      {/* Beta test mode notice at top left */}
      <div className="absolute top-5 left-5">
        <p className="text-[10px] text-amber-400/80 max-w-[160px] leading-tight">
          Auto top-up is disabled — Mochi is in Alpha release.
        </p>
      </div>

      {/* Payment method info at top right */}
      <div className="absolute top-5 right-5">
        {isLoading ? (
          <div className="h-4 w-16 bg-zinc-700 animate-pulse rounded" />
        ) : paymentMethod ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white">
              {getBrandDisplay(paymentMethod.brand)}
            </span>
            <span className="text-xs text-zinc-400">
              •••• {paymentMethod.last4}
            </span>
          </div>
        ) : (
          <span className="text-xs text-zinc-500">No card linked</span>
        )}
      </div>

      {/* Balance display at bottom left */}
      <div className="absolute bottom-5 left-5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-8 w-24 bg-zinc-700 animate-pulse rounded" />
            <div className="h-3 w-16 bg-zinc-700 animate-pulse rounded" />
          </div>
        ) : (
          <>
            <p
              className={cn(
                'text-3xl font-semibold tracking-tight',
                isNegative ? 'text-red-400' : 'text-white'
              )}
            >
              {formattedBalance}
            </p>
            <p className="text-xs text-zinc-500 mt-1">Total Balance</p>
          </>
        )}
      </div>

      {/* Add Funds button disabled during beta test mode */}
      <div className="absolute bottom-5 right-5">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-1.5 bg-zinc-800 text-zinc-500 border-0 cursor-not-allowed opacity-50"
          disabled
          title="Top-ups disabled in test mode"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Funds
        </Button>
      </div>
    </div>
  )
}
