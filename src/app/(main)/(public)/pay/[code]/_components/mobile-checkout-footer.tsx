/**
 * Mobile Checkout Footer
 *
 * Sticky footer shown on mobile when a price is selected
 * Allows user to proceed to payment form
 */

'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Price } from './types'
import { formatCurrency, getPaymentAmount } from './utils'

interface MobileCheckoutFooterProps {
  price: Price
  onContinue: () => void
}

export function MobileCheckoutFooter({ price, onContinue }: MobileCheckoutFooterProps) {
  const buttonAmount = getPaymentAmount(price)
  const isSplitPayment = price.billingType === 'SPLIT_PAYMENT'
  /** Trial display ONLY for RECURRING/SPLIT — SOURCE OF TRUTH: RecurringOnlyTrialGuard */
  const isRecurringOrSplit = price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT'
  const hasTrial = Boolean(isRecurringOrSplit && price.trialDays && price.trialDays > 0)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-t" />

      {/* Content */}
      <div className="relative px-4 py-4 safe-area-inset-bottom">
        <div className="flex items-center justify-between gap-4">
          <div>
            {/**
             * Trial prices show "X-Day Free Trial" as the headline,
             * non-trial show the currency amount.
             */}
            <div className="text-lg font-semibold">
              {hasTrial
                ? `${price.trialDays}-Day Free Trial`
                : (
                  <>
                    {formatCurrency(buttonAmount, price.currency)}
                    {isSplitPayment && price.installments && (
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        1/{price.installments}
                      </span>
                    )}
                  </>
                )
              }
            </div>
            <div className="text-sm text-muted-foreground">{price.name}</div>
          </div>
          <Button size="lg" onClick={onContinue} className="px-6">
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
