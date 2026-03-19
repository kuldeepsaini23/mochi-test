'use client'

/**
 * Plan Selector
 *
 * Displays available subscription plans with dynamic Stripe pricing.
 * Plans are prefetched on server with pricing included.
 */

import { useId } from 'react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { trpc } from '@/trpc/react-provider'
import * as LucideIcons from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface PlanSelectorProps {
  billingInterval: 'monthly' | 'yearly'
  value: string
  onChange: (planKey: string) => void
  disabled?: boolean
  hideTrialBadges?: boolean // Hide trial badges if user has used trial before
}

type PriceData = {
  amount: number | null
  currency: string
  interval: string | null
} | null

type Plan = {
  key: string
  name: string
  description: string
  icon: string
  showPlan: boolean
  monthlyPrice: PriceData
  yearlyPrice: PriceData
  trialDays: number
  isFree: boolean
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Get dynamic Lucide icon component by name */
function getIcon(iconName: string) {
  type LucideIconsType = typeof LucideIcons
  const Icon = (LucideIcons as LucideIconsType)[iconName as keyof LucideIconsType]
  return (Icon as typeof LucideIcons.Circle) || LucideIcons.Circle
}

/** Format price display based on billing interval */
function formatPriceDisplay(
  plan: Plan,
  billingInterval: 'monthly' | 'yearly',
  hideTrialBadges: boolean = false
): React.ReactElement | null {
  // Free plan
  if (plan.isFree) {
    return (
      <div className="flex flex-col items-end">
        <span className="text-2xl font-bold">Free</span>
      </div>
    )
  }

  const price = billingInterval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice

  // No price data
  if (!price || price.amount === null) {
    return null
  }

  const formattedAmount = formatCurrency(price.amount, price.currency)
  const intervalLabel = price.interval === 'month' ? '/mo' : price.interval === 'year' ? '/yr' : ''

  // Show trial pricing only if user hasn't used trial before
  if (plan.trialDays > 0 && !hideTrialBadges) {
    return (
      <div className="flex flex-col items-end">
        <span className="text-2xl font-bold">Free</span>
        <span className="text-xs text-muted-foreground">for {plan.trialDays} days</span>
        <span className="text-xs text-muted-foreground">then {formattedAmount}{intervalLabel}</span>
      </div>
    )
  }

  // Regular pricing (or trial already used)
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold">{formattedAmount}</span>
      <span className="text-sm text-muted-foreground">{intervalLabel}</span>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PlanSelector({
  billingInterval,
  value,
  onChange,
  disabled = false,
  hideTrialBadges = false,
}: PlanSelectorProps) {
  const id = useId()

  // Fetch plans with prices (prefetched on server - instant!)
  const { data } = trpc.features.getAvailablePlans.useQuery()
  const plans = (data?.plans || []) as Plan[]

  // Mark middle plan as "Popular"
  const popularPlanIndex = Math.floor(plans.length / 2)

  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="text-sm leading-none font-medium text-foreground">Choose plan</legend>

      <RadioGroup className="gap-4 flex flex-col" value={value} onValueChange={onChange}>
        {plans.map((plan, index) => {
          const isPopular = index === popularPlanIndex
          const hasTrial = plan.trialDays > 0 && !hideTrialBadges
          const Icon = getIcon(plan.icon)
          const priceDisplay = formatPriceDisplay(plan, billingInterval, hideTrialBadges)

          return (
            <div
              key={`${id}-${plan.key}`}
              className="relative flex items-center gap-4 border-2 border-muted rounded-lg p-4 outline-none has-data-[state=checked]:border-border has-data-[state=checked]:bg-muted transition-all hover:bg-muted/50"
            >
              <RadioGroupItem
                id={`${id}-${plan.key}`}
                value={plan.key}
                className="sr-only after:absolute after:inset-0"
                aria-describedby={`${id}-${plan.key}-details`}
              />

              <div
                className="flex items-center gap-4 flex-1 cursor-pointer"
                onClick={() => onChange(plan.key)}
              >
                {/* Icon */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>

                {/* Plan Name & Description */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="font-semibold cursor-pointer" htmlFor={`${id}-${plan.key}`}>
                      {plan.name}
                    </Label>
                    {isPopular && <Badge className="text-xs">Popular</Badge>}
                    {hasTrial && (
                      <Badge variant="secondary" className="text-xs">
                        {plan.trialDays}-day trial
                      </Badge>
                    )}
                  </div>
                  {plan.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                  )}
                </div>

                {/* Price */}
                <div id={`${id}-${plan.key}-details`} className="shrink-0 text-right">
                  {priceDisplay}
                </div>
              </div>
            </div>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
