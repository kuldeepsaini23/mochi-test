/**
 * Price Selector Component
 *
 * Radio-button style price selection with animated accordion for features
 */

'use client'

import { CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Price } from './types'
import { formatCurrency, getBillingDescription } from './utils'

interface PriceSelectorProps {
  prices: Price[]
  selectedPriceId: string
  onSelect: (priceId: string) => void
}

export function PriceSelector({ prices, selectedPriceId, onSelect }: PriceSelectorProps) {
  if (prices.length === 1) {
    return <SinglePriceDisplay price={prices[0]} />
  }

  return (
    <div className="space-y-3">
      {prices.map((price) => {
        const isSelected = selectedPriceId === price.id

        return (
          <button
            key={price.id}
            onClick={() => onSelect(price.id)}
            className={cn(
              'w-full text-left rounded-xl border-2 transition-all duration-300 ease-out overflow-hidden',
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            <div className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full border-2 transition-all duration-200',
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/40'
                    )}
                  >
                    {isSelected && (
                      <div className="h-full w-full flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium">
                      {price.name}
                    </div>
                    {/**
                      * Billing description: trial ONLY for RECURRING/SPLIT prices.
                      * ONE_TIME prices never show trial info even if trialDays is set.
                      * SOURCE OF TRUTH: RecurringOnlyTrialGuard
                      */}
                    <div className="text-sm text-muted-foreground">
                      {(price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT') && price.trialDays && price.trialDays > 0
                        ? `Then ${formatCurrency(price.amount, price.currency)}${getBillingDescription(price) ? ` ${getBillingDescription(price)}` : ''}`
                        : getBillingDescription(price) || null
                      }
                    </div>
                  </div>
                </div>
                {/**
                  * Multi-price card: trial headline ONLY for RECURRING/SPLIT.
                  * ONE_TIME always shows currency amount.
                  * SOURCE OF TRUTH: RecurringOnlyTrialGuard
                  */}
                <div className="text-xl font-semibold">
                  {(price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT') && price.trialDays && price.trialDays > 0
                    ? `${price.trialDays}-Day Free Trial`
                    : formatCurrency(price.amount, price.currency)
                  }
                </div>
              </div>
            </div>

            {/* Animated features accordion - ONLY features, no payment schedule */}
            {price.features.length > 0 && (
              <div
                className={cn(
                  'grid transition-all duration-500 ease-out',
                  isSelected ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}
              >
                <div className="overflow-hidden">
                  <div
                    className={cn(
                      'px-4 pb-4 pt-0 space-y-2 transition-all duration-500',
                      isSelected ? 'opacity-100' : 'opacity-0'
                    )}
                    style={{
                      maskImage: isSelected
                        ? 'none'
                        : 'linear-gradient(to bottom, black 0%, transparent 100%)',
                      WebkitMaskImage: isSelected
                        ? 'none'
                        : 'linear-gradient(to bottom, black 0%, transparent 100%)',
                    }}
                  >
                    {price.features.map((feature) => (
                      <div
                        key={feature.id}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span>{feature.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Single price display (no selection needed).
 * Trial headline ONLY for RECURRING/SPLIT prices.
 * ONE_TIME prices never show trial. SOURCE OF TRUTH: RecurringOnlyTrialGuard
 */
function SinglePriceDisplay({ price }: { price: Price }) {
  const isRecurringOrSplit = price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT'
  const hasTrial = Boolean(isRecurringOrSplit && price.trialDays && price.trialDays > 0)
  const billingDesc = getBillingDescription(price)

  return (
    <div className="space-y-4">
      {hasTrial ? (
        <>
          {/* Trial headline — prominent free trial callout */}
          <div className="text-4xl font-semibold">
            {price.trialDays}-Day Free Trial
          </div>
          {/* Post-trial billing info */}
          <p className="text-muted-foreground">
            Then {formatCurrency(price.amount, price.currency)}
            {billingDesc && <> {billingDesc}</>}
          </p>
        </>
      ) : (
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-semibold">
            {formatCurrency(price.amount, price.currency)}
          </span>
          {billingDesc && (
            <span className="text-muted-foreground">{billingDesc}</span>
          )}
        </div>
      )}

      {price.features.length > 0 && (
        <div className="space-y-2">
          {price.features.map((feature) => (
            <div
              key={feature.id}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>{feature.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
