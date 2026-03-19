'use client'

/**
 * Billing Interval Selector
 *
 * Lets users choose between monthly and yearly billing.
 * Shows pricing and savings badge for yearly option.
 */

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { formatCurrency } from '@/lib/utils'

interface BillingIntervalSelectorProps {
  value: 'monthly' | 'yearly'
  onChange: (value: 'monthly' | 'yearly') => void
  monthlyPrice: number
  yearlyPrice: number
  savingsPercentage: number
  trialDays: number
  /** ISO 4217 currency code from Stripe plan prices (e.g., 'usd', 'eur') */
  currency?: string
}

export function BillingIntervalSelector({
  value,
  onChange,
  monthlyPrice,
  yearlyPrice,
  savingsPercentage,
  trialDays,
  currency,
}: BillingIntervalSelectorProps) {
  const hasTrial = trialDays > 0

  return (
    <div className="space-y-3">
      <Label className="text-base font-medium">Billing Interval</Label>

      <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-2 gap-4">
        {/* Monthly Option */}
        <div>
          <RadioGroupItem value="monthly" id="monthly" className="peer sr-only" />
          <Label
            htmlFor="monthly"
            className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
          >
            <span className="text-sm font-semibold">Monthly</span>
            {hasTrial ? (
              <>
                <span className="text-2xl font-bold mt-2">Free</span>
                <span className="text-xs text-muted-foreground mt-1">for {trialDays} days</span>
                <span className="text-xs text-muted-foreground">then {formatCurrency(monthlyPrice, currency)}/mo</span>
              </>
            ) : (
              <>
                <span className="text-2xl font-bold mt-2">
                  {monthlyPrice > 0 ? formatCurrency(monthlyPrice, currency) : '-'}
                </span>
                <span className="text-xs text-muted-foreground mt-1">per month</span>
              </>
            )}
          </Label>
        </div>

        {/* Yearly Option */}
        <div>
          <RadioGroupItem value="yearly" id="yearly" className="peer sr-only" />
          <Label
            htmlFor="yearly"
            className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer relative"
          >
            {/* Savings Badge */}
            {savingsPercentage > 0 && (
              <span className="absolute -top-2 -right-2 bg-green-700 text-white text-xs font-bold px-2 py-1 rounded-full">
                Save {savingsPercentage}%
              </span>
            )}

            <span className="text-sm font-semibold">Yearly</span>
            {hasTrial ? (
              <>
                <span className="text-2xl font-bold mt-2">Free</span>
                <span className="text-xs text-muted-foreground mt-1">for {trialDays} days</span>
                <span className="text-xs text-muted-foreground">then {formatCurrency(yearlyPrice, currency)}/yr</span>
              </>
            ) : (
              <>
                <span className="text-2xl font-bold mt-2">
                  {yearlyPrice > 0 ? (
                    <>
                      {formatCurrency(Math.round(yearlyPrice / 12), currency)}
                      <span className="text-sm font-normal">/mo</span>
                    </>
                  ) : (
                    '-'
                  )}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {yearlyPrice > 0 ? `Billed ${formatCurrency(yearlyPrice, currency)} yearly` : 'Annual billing'}
                </span>
              </>
            )}
          </Label>
        </div>
      </RadioGroup>
    </div>
  )
}
