'use client'

/**
 * Upgrade Modal & Reusable Upgrade Content Component
 *
 * SOURCE OF TRUTH KEYWORDS: UpgradeModal, UpgradeContent, PlanUpgrade, BillingChange, PricingCard
 *
 * WHY: Handle plan upgrades/downgrades with a fullscreen pricing UI
 *
 * DESIGN: Fullscreen modal with pricing card grid (step 1) → Payment (step 2) → Success (step 3)
 * UpgradeContent is extracted as a standalone component so it can be reused anywhere in the app.
 *
 * IMPORTANT: All plan data comes from the SOURCE OF TRUTH feature-gates config.
 * No hardcoded plan info — everything is derived from PLANS and FEATURES constants.
 */

import {
  useState,
  useEffect,
  useMemo,
  Fragment,
  type CSSProperties,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { trpc } from '@/trpc/react-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  CreditCard,
  Check,
  X,
  Plus,
  Heart,
  ChevronLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AddPaymentMethodDialog } from '@/app/(main)/(protected)/(dashboard-layout)/settings/_components/add-payment-method-dialog'
import confetti from 'canvas-confetti'
import { formatCurrency, cn } from '@/lib/utils'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'
import {
  FEATURES,
  PLANS,
  UNLIMITED,
  KEY_FEATURES,
  PLAN_ORDER,
  FEATURE_CATEGORIES,
  TIER_SPECIFIC_PRICING,
  getTierSpecificCost,
  getNextPlan,
  type PlanKey,
  type FeatureKey,
  type PaygFeatureKey,
} from '@/lib/config/feature-gates'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the reusable UpgradeContent component
 * SOURCE OF TRUTH: UpgradeContentProps
 *
 * WHY: Extracted so the pricing UI can be embedded anywhere — not just in a modal
 */
type UpgradeContentProps = {
  organizationId: string
  /** Called when user wants to dismiss/close the content (optional for standalone usage) */
  onClose?: () => void
}

/**
 * Props for the fullscreen UpgradeModal wrapper
 * SOURCE OF TRUTH: UpgradeModalProps
 */
type UpgradeModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
}

type UpgradeStep = 'select-plan' | 'payment' | 'success'

type Plan = {
  key: string
  name: string
  description: string
  icon: string
  showPlan: boolean
  monthlyPrice: {
    amount: number | null
    currency: string
    interval: string | null
  } | null
  yearlyPrice: {
    amount: number | null
    currency: string
    interval: string | null
  } | null
  trialDays: number
  isFree: boolean
}

type BillingInterval = 'monthly' | 'yearly'

type UserScenario =
  | 'free_to_paid'
  | 'free_to_trial'
  | 'trial_to_paid'
  | 'paid_upgrade'
  | 'paid_downgrade'
  | 'paid_same'

// ============================================================================
// FEATURE DISPLAY HELPERS
// ============================================================================

/**
 * Get display-friendly features for a plan
 * WHY: Transform the raw PLANS.features into a displayable list
 *
 * @param planKey - The plan key to get features for
 * @returns Array of feature objects with name, value, and whether it's included
 */
function getPlanFeatures(planKey: PlanKey) {
  const plan = PLANS[planKey]
  if (!plan) return []

  const features: Array<{
    key: string
    name: string
    value: number | boolean
    displayValue: string
    isIncluded: boolean
    featureType: 'boolean' | 'limit' | 'percentage'
    isUnlimited: boolean
    /**
     * For percentage features: indicates if this is a "good" value
     * WHY: 0% fee is better than 10% fee, helps UI show comparison correctly
     */
    isOptimal?: boolean
  }> = []

  const featureDefinitions = FEATURES.organization

  for (const [key, value] of Object.entries(plan.features)) {
    const definition =
      featureDefinitions[key as keyof typeof featureDefinitions]
    if (!definition) continue

    // Skip PAYG features from the display list (they're always available)
    if (definition.type === 'payg') continue

    let displayValue = ''
    let isIncluded = false
    let isUnlimited = false
    let isOptimal = false
    const featureType = definition.type as 'boolean' | 'limit' | 'percentage'

    if (definition.type === 'limit') {
      if (value === UNLIMITED) {
        displayValue = '∞'
        isIncluded = true
        isUnlimited = true
      } else if (typeof value === 'number' && value > 0) {
        displayValue = value.toString()
        isIncluded = true
      } else {
        displayValue = '0'
        isIncluded = false
      }
    } else if (definition.type === 'boolean') {
      isIncluded = value === true
      displayValue = ''
    } else if (definition.type === 'percentage') {
      /**
       * Percentage features display as "X%" format
       * WHY: Users need to see transaction fees clearly
       * HOW: Convert decimal to percentage (0.10 → 10%)
       * NOTE: Math.round fixes floating point precision (0.07 * 100 = 7.000000000000001)
       */
      const percentValue =
        typeof value === 'number' ? Math.round(value * 100) : 0
      displayValue = `${percentValue}%`
      isIncluded = true
      isOptimal =
        'lowerIsBetter' in definition &&
        definition.lowerIsBetter &&
        percentValue === 0
    }

    features.push({
      key,
      name: definition.name,
      value,
      displayValue,
      isIncluded,
      featureType,
      isUnlimited,
      isOptimal,
    })
  }

  // Sort: included features first, then by name
  return features.sort((a, b) => {
    if (a.isIncluded && !b.isIncluded) return -1
    if (!a.isIncluded && b.isIncluded) return 1
    return a.name.localeCompare(b.name)
  })
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Corner cross positions — only the 4 outer edges of the pricing grid.
 *
 * WHY: Crosses mark where the dashed borders meet the container boundary,
 * giving the grid a clean "crosshair corner" aesthetic. Internal column
 * boundaries don't get crosses — keeps the look minimal.
 *
 * Returns: [0%, 100%] on both top and bottom edges (4 corners total)
 */
const CORNER_POSITIONS = [0, 100] as const

// ============================================================================
// CUSTOM DASHED BORDER STYLES
// ============================================================================

/**
 * Custom dash color — uses color-mix for semi-transparent border color.
 * WHY: CSS border-dashed produces tiny, barely visible dashes. These
 * background-gradient dashes give us full control over length, gap, and thickness.
 */
const DASH_COLOR = 'color-mix(in srgb, var(--color-border) 50%, transparent)'

/**
 * Cell dashes — bottom edge (horizontal) + right edge (vertical)
 * WHY: Creates the internal grid lines between pricing cards.
 * Outer edges are handled by extending overlay elements (see render).
 */
const cellDashStyle: CSSProperties = {
  backgroundImage: [
    `repeating-linear-gradient(to right, ${DASH_COLOR} 0 10px, transparent 10px 20px)`,
    `repeating-linear-gradient(to bottom, ${DASH_COLOR} 0 10px, transparent 10px 20px)`,
  ].join(', '),
  backgroundSize: '100% 1.5px, 1.5px 100%',
  backgroundPosition: 'bottom left, top right',
  backgroundRepeat: 'no-repeat',
}

// ============================================================================
// KEY FEATURE HELPERS
// ============================================================================

type FeatureDisplayItem = ReturnType<typeof getPlanFeatures>[number]

/**
 * Get only the KEY features for a plan (the decision-changing highlights)
 *
 * SOURCE OF TRUTH: KEY_FEATURES from feature-gates.ts controls which features appear
 *
 * WHY: Pricing cards should only show the top differentiators. The full list
 * goes in the comparison table below the cards.
 */
function getKeyPlanFeatures(planKey: PlanKey): FeatureDisplayItem[] {
  const allFeatures = getPlanFeatures(planKey)
  return KEY_FEATURES.map((key) =>
    allFeatures.find((f) => f.key === key),
  ).filter((f): f is FeatureDisplayItem => f !== undefined)
}

/**
 * Get the name of the previous plan in the tier order
 *
 * WHY: Used for the "Everything in X, plus" pattern on pricing cards.
 * Each non-free plan inherits features from the plan below it.
 */
function getPreviousPlanName(planKey: string): string | null {
  const idx = PLAN_ORDER.indexOf(planKey as PlanKey)
  if (idx <= 0) return null
  const prevKey = PLAN_ORDER[idx - 1]
  return PLANS[prevKey]?.name ?? null
}

// ============================================================================
// LOADING SKELETONS
// ============================================================================

/**
 * Reusable skeleton block — a static rounded placeholder bar
 * WHY: No shimmer/pulse animation — just a solid muted block matching the mockup style
 */
function Skel({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={cn('rounded bg-muted', className)}
      style={style}
    />
  )
}

/**
 * PricingCardSkeleton — Static skeleton matching the PricingCard layout
 *
 * SOURCE OF TRUTH KEYWORDS: PricingCardSkeleton, PlanCardSkeleton
 *
 * WHY: Prevents layout shift while plans load from Stripe. Each skeleton
 * mirrors the real card's vertical rhythm (name, description, price, button, features).
 */
function PricingCardSkeleton() {
  return (
    <div className="flex flex-col p-6 sm:p-7 h-full">
      {/* Plan name */}
      <Skel className="h-5 w-24" />
      {/* Description */}
      <Skel className="h-3 w-40 mt-2" />
      {/* Badge row */}
      <Skel className="h-4 w-16 mt-2 rounded-full" />
      {/* Price block */}
      <div className="mt-6 mb-6">
        <Skel className="h-10 w-32" />
        <Skel className="h-3 w-20 mt-2" />
      </div>
      {/* CTA button */}
      <Skel className="h-9 w-full rounded-full mb-6" />
      {/* Feature lines */}
      <div className="space-y-3 flex-1">
        <Skel className="h-3 w-44" />
        {[75, 60, 80, 50, 70].map((w, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5"
          >
            <Skel className="h-4 w-4 shrink-0 rounded-sm" />
            <Skel
              className="h-3"
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * ComparisonTableSkeleton — Static skeleton for the categorized feature comparison table
 *
 * SOURCE OF TRUTH KEYWORDS: ComparisonTableSkeleton, FeatureTableSkeleton
 *
 * WHY: Shows placeholder rows grouped into 3 representative categories
 * while real plan data loads. Uses the same right-fade mask as the cards.
 */
function ComparisonTableSkeleton() {
  /** 3 skeleton categories with varying row counts */
  const categories = [{ rows: 4 }, { rows: 3 }, { rows: 2 }]

  return (
    <div className="w-full">
      <Skel className="h-7 w-56 mx-auto mb-10" />

      <div className="space-y-10">
        {categories.map((cat, ci) => (
          <div key={ci}>
            {/* Category header — label + column placeholders */}
            <div className="flex items-end gap-6 pb-2">
              <Skel className="h-4 w-28 shrink-0" />
              <div className="flex-1 flex gap-6">
                {[1, 2, 3, 4].map((c) => (
                  <div
                    key={c}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <Skel className="h-3 w-14" />
                    <Skel className="h-0.5 w-full" />
                  </div>
                ))}
              </div>
            </div>
            {/* Feature rows */}
            {Array.from({ length: cat.rows }).map((_, ri) => (
              <div
                key={ri}
                className="flex items-center gap-6 border-b border-border/30 py-3.5"
              >
                <Skel
                  className="h-3 shrink-0"
                  style={{ width: `${100 + ri * 20}px` }}
                />
                <div className="flex-1 flex gap-6">
                  {[1, 2, 3, 4].map((c) => (
                    <div
                      key={c}
                      className="flex-1 flex justify-center"
                    >
                      <Skel className="h-3 w-10" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Horizontal right-fade mask style
 *
 * WHY: Mimics MarqueeFade but horizontally — content fades to transparent on the
 * right edge, implying more cards/columns are loading beyond the visible area.
 * Uses the same mask-image technique as MarqueeFade.
 */
const rightFadeMask: CSSProperties = {
  maskImage: 'linear-gradient(to right, black 0%, black 65%, transparent 100%)',
  WebkitMaskImage:
    'linear-gradient(to right, black 0%, black 65%, transparent 100%)',
}

// ============================================================================
// FEATURE COMPARISON TABLE — Reusable categorized component
// ============================================================================

type FeatureComparisonTableProps = {
  /** Plan keys to show as columns (uses PLAN_ORDER if not provided) */
  planKeys?: PlanKey[]
}

/**
 * Format a PAYG per-unit cost for display using the platform currency symbol.
 *
 * WHY: PAYG costs vary in precision ($0.02, $0.015, $0.0008) so we need
 * smart formatting that shows enough decimal places without trailing zeros.
 * The currency symbol comes from the platform's Stripe account (not hardcoded).
 *
 * @param cost - Cost in display units (e.g., 0.02 for $0.02)
 * @param currencySymbol - Currency symbol from platform Stripe account (e.g., '$', '€')
 */
function formatPaygCost(cost: number, currencySymbol: string = '$'): string {
  if (cost === 0) return 'Free'
  const str = cost.toString()
  const decimals = str.includes('.') ? str.split('.')[1].length : 0
  return `${currencySymbol}${cost.toFixed(Math.max(2, decimals))}`
}

/**
 * Get the display cell value for a feature in a given plan.
 *
 * WHY: Each cell needs different rendering based on feature type.
 * Handles limit, boolean, percentage, and payg features.
 *
 * @param featureKey - The feature to look up
 * @param planKey - The plan tier to get the value for
 * @param currencySymbol - Platform currency symbol for PAYG cost formatting
 */
function getCellValue(featureKey: FeatureKey, planKey: PlanKey, currencySymbol: string = '$') {
  const plan = PLANS[planKey]
  if (!plan) return { display: '-', isIncluded: false, isOptimal: false }

  const value = plan.features[featureKey as keyof typeof plan.features]
  const definition = FEATURES.organization[featureKey]

  /* PAYG features show per-unit cost from TIER_SPECIFIC_PRICING */
  if (definition.type === 'payg') {
    const paygKey = featureKey as PaygFeatureKey
    if (paygKey in TIER_SPECIFIC_PRICING) {
      const cost = getTierSpecificCost(paygKey, planKey)
      return {
        display: formatPaygCost(cost, currencySymbol),
        isIncluded: true,
        isOptimal: cost === 0,
      }
    }
    return { display: '-', isIncluded: false, isOptimal: false }
  }

  if (definition.type === 'limit') {
    if (value === UNLIMITED)
      return { display: 'Unlimited', isIncluded: true, isOptimal: false }
    if (typeof value === 'number' && value > 0)
      return {
        display: value.toLocaleString(),
        isIncluded: true,
        isOptimal: false,
      }
    return { display: '-', isIncluded: false, isOptimal: false }
  }

  if (definition.type === 'boolean') {
    return {
      display: value === true ? 'check' : 'dash',
      isIncluded: value === true,
      isOptimal: false,
    }
  }

  if (definition.type === 'percentage') {
    const percentValue = typeof value === 'number' ? Math.round(value * 100) : 0
    const isOptimal =
      'lowerIsBetter' in definition &&
      definition.lowerIsBetter &&
      percentValue === 0
    return { display: `${percentValue}%`, isIncluded: true, isOptimal }
  }

  return { display: '-', isIncluded: false, isOptimal: false }
}

/**
 * FeatureComparisonTable — Categorized feature comparison matrix
 *
 * SOURCE OF TRUTH KEYWORDS: FeatureComparisonTable, FeatureMatrix, PlanComparison
 *
 * WHY: Shows every feature grouped by category (from FEATURE_CATEGORIES) with
 * plan columns. Each category has its own header row with plan names, followed
 * by feature rows — matching the SaaS comparison table pattern.
 *
 * DESIGN: Clean minimal layout. Category headers with plan names and colored
 * underlines for paid plans. Feature rows with subtle bottom borders.
 * PAYG category at the bottom shows per-unit pricing.
 *
 * REUSABLE: Can be imported and rendered standalone on any page.
 */
export function FeatureComparisonTable({
  planKeys,
}: FeatureComparisonTableProps) {
  /** Get platform currency symbol for PAYG cost formatting */
  const { symbol: platformSymbol } = usePlatformCurrency()

  /** Determine which plans to display as columns */
  const columns =
    planKeys ??
    (PLAN_ORDER.filter((k) => PLANS[k]?.showPlan !== false) as PlanKey[])

  /** Grid template — first column is the feature name, rest are plan columns */
  const gridStyle = {
    gridTemplateColumns: `minmax(180px, 1.5fr) repeat(${columns.length}, 1fr)`,
  }

  return (
    <div className="w-full">
      <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-10 text-center">
        Compare plans & features
      </h3>

      {/* Scrollable on mobile */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px] space-y-10">
          {FEATURE_CATEGORIES.map((category) => (
            <div key={category.name}>
              {/* Category header — name + plan names with colored underlines */}
              <div
                className="grid items-end pb-0"
                style={gridStyle}
              >
                <span className="text-sm font-semibold text-foreground pb-2">
                  {category.name}
                </span>
                {columns.map((planKey) => (
                  <div
                    key={planKey}
                    className="text-center pb-0"
                  >
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        planKey === 'free' ? 'text-foreground' : 'text-primary',
                      )}
                    >
                      {PLANS[planKey]?.name}
                    </span>
                    {/* Colored underline — primary for paid, subtle for free */}
                    <div
                      className={cn(
                        'h-0.5 mt-2',
                        planKey === 'free' ? 'bg-border' : 'bg-primary/60',
                      )}
                    />
                  </div>
                ))}
              </div>

              {/* Feature rows for this category */}
              {category.features.map((featureKey) => {
                const definition = FEATURES.organization[featureKey]
                if (!definition) return null

                return (
                  <div
                    key={featureKey}
                    className="grid items-center border-b border-border/30"
                    style={gridStyle}
                  >
                    {/* Feature name */}
                    <span className="text-sm text-foreground/80 py-3.5">
                      {definition.name}
                    </span>

                    {/* Plan cells */}
                    {columns.map((planKey) => {
                      const cell = getCellValue(featureKey, planKey, platformSymbol)
                      return (
                        <div
                          key={planKey}
                          className="text-center py-3.5 text-sm"
                        >
                          {cell.display === 'check' ? (
                            <Check className="h-4 w-4 text-foreground mx-auto" />
                          ) : cell.display === 'dash' ? (
                            <span className="text-muted-foreground">-</span>
                          ) : cell.display === '-' ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span
                              className={cn(
                                'font-medium',
                                cell.isOptimal
                                  ? 'text-green-500'
                                  : 'text-foreground',
                              )}
                            >
                              {cell.display}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PRICING CARD COMPONENT
// ============================================================================

type PricingCardProps = {
  plan: Plan
  /** Only the KEY decision-changing features to show on the card */
  keyFeatures: FeatureDisplayItem[]
  /** Name of the previous tier for "Everything in X, plus" pattern */
  previousPlanName: string | null
  isSelected: boolean
  isCurrentPlan: boolean
  isCurrentlyOnTrial: boolean
  isPopular: boolean
  priceDisplay: { main: string; sub: string }
  billingInterval: BillingInterval
  savings: number
  /** Selects this plan visually for comparison */
  onSelect: () => void
  /** Selects this plan AND proceeds to payment step */
  onProceed: () => void
}

/**
 * PricingCard — Boxy pricing card with code-font pricing
 *
 * SOURCE OF TRUTH KEYWORDS: PricingCard, PlanCard, KeyFeatureCard
 *
 * WHY: Shows only the top differentiators from KEY_FEATURES. Non-free plans
 * include an "All {previous plan} features plus..." header so users understand
 * feature inheritance without duplicating the full list.
 *
 * DESIGN: Flat boxy card (no rounding) that lives inside a dotted grid container.
 * Monospace font for pricing. Active state has a rounded overlay with bottom
 * gradient + noise texture. CTA button is outlined by default, filled when active.
 */
function PricingCard({
  plan,
  keyFeatures,
  previousPlanName,
  isSelected,
  isCurrentPlan,
  isCurrentlyOnTrial,
  isPopular: _isPopular,
  priceDisplay,
  billingInterval,
  savings,
  onSelect,
  onProceed,
}: PricingCardProps) {
  const isFreePlan = plan.isFree
  const hasTrial = plan.trialDays > 0

  /** Whether the CTA button should allow proceeding to payment */
  const canProceed = !isFreePlan && !(isCurrentPlan && !isCurrentlyOnTrial)

  return (
    <div
      onClick={onSelect}
      className="relative flex flex-col cursor-pointer h-full"
    >
      {/*
       * Active state: Background + rounded border overlay
       * WHY: Covers the dotted grid borders with a solid rounded container
       * to make the selected card visually "pop" from the grid.
       */}
      {isSelected && (
        <div className="absolute -inset-px rounded-2xl border border-border bg-card z-0" />
      )}

      {/*
       * Active state: Bottom gradient with SVG noise texture
       * WHY: Creates the cloudy/ethereal glow effect from the mockup.
       * The gradient fades from primary color upward, and the noise adds grain.
       */}
      {isSelected && (
        <div className="absolute -inset-px rounded-2xl overflow-hidden pointer-events-none z-5">
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-primary/20 via-primary/5 to-transparent" />
          <svg
            className="absolute inset-x-0 bottom-0 w-full h-2/3 mix-blend-soft-light"
            style={{ opacity: 0.12 }}
            aria-hidden="true"
          >
            <rect
              width="100%"
              height="100%"
              filter="url(#pricing-noise)"
            />
          </svg>
        </div>
      )}

      {/* Card content — sits above the gradient overlay */}
      <div className="relative z-10 flex flex-col flex-1 p-6 sm:p-7">
        {/* Plan name */}
        <h3 className="font-semibold text-lg tracking-tight">{plan.name}</h3>

        {/* Plan description */}
        {plan.description && (
          <p className="text-sm text-muted-foreground mt-1">
            {plan.description}
          </p>
        )}

        {/* Status badges row */}
        <div className="flex items-center gap-2 mt-2 min-h-[22px]">
          {hasTrial && !isFreePlan && (
            <Badge
              variant="secondary"
              className="text-[10px] px-2 py-0.5"
            >
              {plan.trialDays}-day trial
            </Badge>
          )}
          {isCurrentPlan && isCurrentlyOnTrial && (
            <Badge
              variant="secondary"
              className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-600 border-amber-500/20"
            >
              Current Trial
            </Badge>
          )}
          {isCurrentPlan && !isCurrentlyOnTrial && !isFreePlan && (
            <Badge
              variant="secondary"
              className="text-[10px] px-2 py-0.5 bg-green-500/10 text-green-600 border-green-500/20"
            >
              Current Plan
            </Badge>
          )}
        </div>

        {/* Price — monospace/code-style font to match boxy aesthetic */}
        <div className="mt-6 mb-6">
          <div className="font-mono text-4xl font-bold tracking-tight">
            {isFreePlan ? (
              <>
                <span className="text-2xl align-baseline">$ </span>0.00
              </>
            ) : (
              priceDisplay.main
            )}
          </div>
          {isFreePlan ? (
            <p className="text-sm text-muted-foreground mt-1">Free forever</p>
          ) : (
            priceDisplay.sub && (
              <p className="text-sm text-muted-foreground mt-1">
                {priceDisplay.sub}
              </p>
            )
          )}

          {/* Yearly savings badge */}
          {billingInterval === 'yearly' && savings > 0 && !isFreePlan && (
            <Badge
              variant="secondary"
              className="mt-2 text-[10px] bg-green-500/10 text-green-500 border-green-500/20"
            >
              Save {savings}%
            </Badge>
          )}
        </div>

        {/* CTA Button — outlined by default, filled when active (matching mockup) */}
        <Button
          onClick={(e) => {
            e.stopPropagation()
            if (canProceed) onProceed()
          }}
          disabled={!canProceed}
          variant={isSelected && canProceed ? 'default' : 'outline'}
          className={cn(
            'w-full mb-6 rounded-full',
            isSelected &&
              canProceed &&
              'bg-foreground text-background hover:bg-foreground/90',
          )}
        >
          {isCurrentPlan && !isCurrentlyOnTrial
            ? 'Current Plan'
            : isCurrentPlan && isCurrentlyOnTrial
              ? 'Current Trial'
              : isFreePlan
                ? 'Included'
                : 'Get started \u2192'}
        </Button>

        {/* Key features checklist */}
        <div className="space-y-3 flex-1">
          {previousPlanName && (
            <p className="text-sm text-muted-foreground">
              All {previousPlanName} features plus...
            </p>
          )}

          {keyFeatures.map((feature) => (
            <div
              key={feature.key}
              className={cn(
                'flex items-center gap-2.5 text-sm',
                !feature.isIncluded && 'opacity-40',
              )}
            >
              <Check
                className={cn(
                  'h-4 w-4 shrink-0',
                  feature.isIncluded ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <span className="flex-1">
                {feature.featureType === 'limit' && feature.isIncluded && (
                  <span className="font-medium">
                    {feature.isUnlimited
                      ? 'Unlimited'
                      : feature.displayValue}{' '}
                  </span>
                )}
                {feature.name}
                {feature.featureType === 'percentage' && (
                  <span
                    className={cn(
                      'font-medium',
                      feature.isOptimal && 'text-green-500',
                    )}
                  >
                    {': '}
                    {feature.displayValue}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// UPGRADE CONTENT — REUSABLE STANDALONE COMPONENT
// ============================================================================

/**
 * UpgradeContent — The core pricing/upgrade UI extracted for reuse
 *
 * SOURCE OF TRUTH KEYWORDS: UpgradeContent, PlanSelection, PricingGrid
 *
 * WHY: Extracted from UpgradeModal so it can be embedded anywhere in the app
 * (settings page, dashboard banner, standalone route, etc.) without needing
 * the Dialog wrapper.
 *
 * HOW: Contains all state, queries, mutations, and UI for the 3-step flow:
 *   Step 1: Plan selection grid with pricing cards
 *   Step 2: Billing interval + payment method selection
 *   Step 3: Success celebration with onboarding CTA
 *
 * IMPORTANT: All plan/feature data sourced from feature-gates.ts (SOURCE OF TRUTH).
 */
export function UpgradeContent({
  organizationId,
  onClose,
}: UpgradeContentProps) {
  const [currentStep, setCurrentStep] = useState<UpgradeStep>('select-plan')
  const [selectedPlan, setSelectedPlan] = useState<string>('')
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>('monthly')
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] =
    useState<string>('')
  const [isAddingCard, setIsAddingCard] = useState(false)
  const [countdown, setCountdown] = useState<number>(5)

  /**
   * School pride confetti spray effect from both bottom corners
   * WHY: Celebrate successful upgrade with a delightful animation
   */
  const fireConfetti = () => {
    const end = Date.now() + 0.5 * 1000

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 1 },
        startVelocity: 100,
        scalar: 1.7,
      })

      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 1 },
        startVelocity: 100,
        scalar: 1.7,
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }

    frame()
  }

  // ============================================================================
  // DATA FETCHING — All queries for plan, tier, trial, and payment data
  // ============================================================================

  /** Fetch available plans with Stripe pricing */
  const { data: plansData, isLoading: isLoadingPlans } =
    trpc.features.getAvailablePlans.useQuery(undefined, {
      enabled: !!organizationId,
    })

  /** Fetch user's current tier and subscription status */
  const { data: tierData } = trpc.usage.getTier.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      staleTime: Infinity,
      gcTime: Infinity,
    },
  )

  /** Fetch free trial history (organization-based) */
  const { data: trialHistory } = trpc.payment.getFreeTrialHistory.useQuery(
    { organizationId },
    { enabled: !!organizationId },
  )

  /** Check user's trial status based on card fingerprints */
  const { data: userTrialStatus } =
    trpc.payment.getUserTrialStatus.useQuery(undefined)

  /** Fetch payment methods — only when on the payment step to avoid unnecessary calls */
  const { data: paymentMethodsData, isLoading: isLoadingPaymentMethods } =
    trpc.payment.getPaymentMethods.useQuery(
      { organizationId },
      { enabled: !!organizationId && currentStep === 'payment' },
    )

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const utils = trpc.useUtils()

  /** Upgrade/downgrade mutation with cache invalidation on success */
  const upgradeMutation = trpc.payment.upgradeOrganization.useMutation({
    onSuccess: async (data) => {
      // Only show success for confirmed subscription states.
      // 'active' = payment confirmed, 'trialing' = trial started (no charge yet).
      // 'incomplete' means payment is still pending — don't celebrate prematurely.
      if (data.status === 'active' || data.status === 'trialing') {
        setCurrentStep('success')
        fireConfetti()
        setCountdown(5)
      } else if (data.status === 'incomplete') {
        // With 'error_if_incomplete', this should rarely happen — only if Stripe
        // needs additional authentication (3D Secure, etc.). Show a clear message.
        toast.error('Payment could not be completed. Please try a different card or contact support.')
        return
      }

      // Invalidate ALL relevant caches so the UI reflects the new plan immediately
      await Promise.all([
        utils.usage.getTier.invalidate({ organizationId }),
        utils.usage.getUsageMetrics.invalidate({ organizationId }),
        utils.organization.getUserOrganizations.invalidate(),
      ])
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to upgrade plan')
    },
  })

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const currentTier = (tierData?.tier || 'free') as PlanKey
  const isCurrentlyOnTrial = tierData?.isOnTrial || false
  const currentBillingInterval = tierData?.billingInterval || null

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Auto-select the next plan when component mounts
   * WHY: Users opening the upgrade UI likely want to upgrade to the next tier
   */
  useEffect(() => {
    if (tierData && !selectedPlan) {
      const nextPlan = getNextPlan(currentTier)
      if (nextPlan) {
        setSelectedPlan(nextPlan)
      }
    }
  }, [tierData, currentTier, selectedPlan])

  /** Set default payment method when data loads */
  useEffect(() => {
    if (
      paymentMethodsData?.defaultPaymentMethodId &&
      !selectedPaymentMethodId
    ) {
      setSelectedPaymentMethodId(paymentMethodsData.defaultPaymentMethodId)
    }
  }, [paymentMethodsData, selectedPaymentMethodId])

  /** Countdown timer on success step — auto-refresh when it hits 0 */
  useEffect(() => {
    if (currentStep === 'success' && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            window.location.reload()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [currentStep, countdown])

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /** Validate and submit the upgrade mutation */
  const handleUpgrade = () => {
    if (!selectedPaymentMethodId) {
      toast.error('Please select a payment method')
      return
    }

    if (
      selectedPlan !== 'starter' &&
      selectedPlan !== 'pro' &&
      selectedPlan !== 'enterprise'
    ) {
      toast.error('Please select a valid plan')
      return
    }

    upgradeMutation.mutate({
      organizationId,
      planKey: selectedPlan,
      billingInterval,
      paymentMethodId: selectedPaymentMethodId,
    })
  }

  /**
   * Handle clicking a card's CTA button — selects the plan and proceeds to payment
   * WHY: Single-click flow from plan selection to payment for a smooth UX
   */
  const handlePlanProceed = (planKey: string) => {
    setSelectedPlan(planKey)
    setCurrentStep('payment')
  }

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  /**
   * Determine user scenario for contextual copy
   * WHY: Different messaging based on user's current state
   */
  const userScenario = useMemo<UserScenario>(() => {
    const isOnTrial = tierData?.isOnTrial || false

    const hasUsedTrialBefore =
      trialHistory?.hasUsedFreeTrial ||
      userTrialStatus?.hasUsedTrialBefore ||
      false

    if (isOnTrial) return 'trial_to_paid'
    if (currentTier === 'free') {
      // Free plan users already committed to free during onboarding —
      // they don't get a trial, upgrading always means paying.
      return 'free_to_paid'
    }

    if (selectedPlan === currentTier) return 'paid_same'

    const tierOrder = ['starter', 'pro', 'enterprise']
    const currentIndex = tierOrder.indexOf(currentTier)
    const selectedIndex = tierOrder.indexOf(selectedPlan)

    if (selectedIndex > currentIndex) return 'paid_upgrade'
    if (selectedIndex < currentIndex) return 'paid_downgrade'

    return 'paid_same'
  }, [
    tierData,
    selectedPlan,
    plansData,
    trialHistory,
    userTrialStatus,
    currentTier,
  ])

  /** Get dynamic copy based on scenario */
  const getModalCopy = () => {
    switch (userScenario) {
      case 'free_to_trial':
        return {
          title: 'Start Your Free Trial',
          description:
            'Choose a plan and start your free trial. No charges until trial ends.',
          ctaButton: 'Start Free Trial',
        }
      case 'free_to_paid':
        return {
          title: 'Upgrade Your Plan',
          description: 'Unlock powerful features to grow your business',
          ctaButton: 'Upgrade Now',
        }
      case 'trial_to_paid':
        return {
          title: 'Complete Your Subscription',
          description: 'Continue enjoying premium features after your trial',
          ctaButton: 'Complete Subscription',
        }
      case 'paid_upgrade':
        return {
          title: 'Upgrade Your Plan',
          description: 'Get more features and higher limits',
          ctaButton: 'Upgrade Plan',
        }
      case 'paid_same':
        return {
          title: 'Change Billing Interval',
          description: 'Switch between monthly and yearly billing',
          ctaButton: 'Update Billing',
        }
      default:
        return {
          title: 'Choose Your Plan',
          description: 'Select a plan that works for you',
          ctaButton: 'Continue',
        }
    }
  }

  /**
   * Filter and prepare plans for display
   * WHY: Include Free plan for comparison but strip trials when not eligible.
   * Trials are stripped when:
   * 1. User has used a trial before (fraud prevention)
   * 2. User is already on the free plan (they committed to free — upgrade means pay)
   * Memoized to prevent recalculation on every render
   */
  const filteredPlans = useMemo<Plan[]>(() => {
    if (!plansData?.plans) return []

    const hasUsedTrialBefore =
      trialHistory?.hasUsedFreeTrial ||
      userTrialStatus?.hasUsedTrialBefore ||
      false

    // Users on the free plan already chose free during onboarding —
    // they skipped the trial opportunity, so upgrading should require payment.
    const isOnFreePlan = currentTier === 'free' && !isCurrentlyOnTrial
    const shouldStripTrials = hasUsedTrialBefore || isOnFreePlan

    return (plansData.plans as Plan[]).map((plan) => {
      if (shouldStripTrials && plan.trialDays > 0) {
        return { ...plan, trialDays: 0 }
      }
      return plan
    })
  }, [plansData, trialHistory, userTrialStatus, currentTier, isCurrentlyOnTrial])

  /**
   * Memoized KEY features per plan (used by pricing cards)
   * WHY: Cards only display the top decision-changing features from KEY_FEATURES.
   * The full feature list is rendered separately in the FeatureComparisonTable.
   */
  const allKeyFeatures = useMemo(() => {
    const features: Record<string, FeatureDisplayItem[]> = {}
    filteredPlans.forEach((plan) => {
      features[plan.key] = getKeyPlanFeatures(plan.key as PlanKey)
    })
    return features
  }, [filteredPlans])

  const currentPlan = filteredPlans.find((p) => p.key === selectedPlan)
  const modalCopy = getModalCopy()

  const paymentMethods = paymentMethodsData?.paymentMethods || []
  const hasPaymentMethods = paymentMethods.length > 0

  /** Determine which billing intervals should be available */
  const getAvailableIntervals = (): { monthly: boolean; yearly: boolean } => {
    if (
      selectedPlan === currentTier &&
      currentBillingInterval &&
      !isCurrentlyOnTrial
    ) {
      return {
        monthly: currentBillingInterval === 'yearly',
        yearly: currentBillingInterval === 'monthly',
      }
    }
    return { monthly: true, yearly: true }
  }

  const availableIntervals = getAvailableIntervals()

  /** Format price display for plan cards */
  const getPlanPriceDisplay = (plan: Plan) => {
    const price =
      billingInterval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice
    if (!price || price.amount === null) return { main: '-', sub: '' }

    const hasTrial = plan.trialDays > 0

    if (billingInterval === 'monthly') {
      if (hasTrial) {
        return {
          main: 'Free',
          sub: `for ${plan.trialDays} days, then ${formatCurrency(price.amount, price.currency)}/mo`,
        }
      }
      return {
        main: formatCurrency(price.amount, price.currency),
        sub: '/month',
      }
    } else {
      const monthlyEquivalent = Math.round(price.amount / 12)
      if (hasTrial) {
        return {
          main: 'Free',
          sub: `for ${plan.trialDays} days, then ${formatCurrency(monthlyEquivalent, price.currency)}/mo`,
        }
      }
      return {
        main: `${formatCurrency(monthlyEquivalent, price.currency)}/mo`,
        sub: `Billed ${formatCurrency(price.amount, price.currency)} annually`,
      }
    }
  }

  /** Format price for billing interval radio cards in step 2 */
  const formatIntervalPrice = (plan: Plan, interval: BillingInterval) => {
    const price = interval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice
    if (!price || price.amount === null) return null

    const hasTrial = plan.trialDays > 0

    if (interval === 'monthly') {
      return {
        main: hasTrial ? 'Free' : formatCurrency(price.amount, price.currency),
        sub: hasTrial
          ? `for ${plan.trialDays} days, then ${formatCurrency(price.amount, price.currency)}/mo`
          : 'per month',
      }
    } else {
      const monthlyEquivalent = Math.round(price.amount / 12)
      return {
        main: hasTrial
          ? 'Free'
          : `${formatCurrency(monthlyEquivalent, price.currency)}/mo`,
        sub: hasTrial
          ? `for ${plan.trialDays} days, then billed ${formatCurrency(price.amount, price.currency)} annually`
          : `Billed ${formatCurrency(price.amount, price.currency)} annually`,
      }
    }
  }

  /** Calculate yearly savings percentage for a plan */
  const calculateSavings = (plan: Plan): number => {
    if (!plan.monthlyPrice?.amount || !plan.yearlyPrice?.amount) return 0
    const monthlyTotal = plan.monthlyPrice.amount * 12
    const yearlyTotal = plan.yearlyPrice.amount
    const savings = monthlyTotal - yearlyTotal
    return Math.round((savings / monthlyTotal) * 100)
  }

  /** Max savings across all paid plans — shown in the billing toggle */
  const maxSavings = useMemo(() => {
    return filteredPlans.reduce((max, plan) => {
      if (plan.isFree) return max
      return Math.max(max, calculateSavings(plan))
    }, 0)
  }, [filteredPlans])

  /** Get selected plan name for display in step 2/3 */
  const selectedPlanName = selectedPlan
    ? PLANS[selectedPlan as PlanKey]?.name || selectedPlan
    : ''

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      {/* Add Payment Method Dialog — rendered as sibling to avoid nested dialog issues */}
      <AddPaymentMethodDialog
        open={isAddingCard}
        onOpenChange={(open) => {
          setIsAddingCard(open)
          if (!open && currentStep === 'payment') {
            utils.payment.getPaymentMethods.invalidate({ organizationId })
          }
        }}
        organizationId={organizationId}
      />

      <div className="flex flex-col h-full w-full bg-background overflow-hidden">
        {/* ================================================================
         * STEP 1: PLAN SELECTION — Fullscreen pricing card grid
         * ================================================================ */}
        {currentStep === 'select-plan' && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Close button — top right */}
            {onClose && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Centered content container — max-w-5xl keeps everything tight */}
            <div className="flex-1 flex flex-col items-center w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
              {/* Header — title + description */}
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {modalCopy.title}
                </h2>
                <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-md mx-auto">
                  {modalCopy.description}
                </p>
              </div>

              {/* Billing interval toggle — pill-shaped switcher */}
              <div className="inline-flex items-center bg-muted/50 rounded-full p-1 border border-border/50 mb-8 sm:mb-10">
                <button
                  onClick={() => setBillingInterval('monthly')}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium transition-all',
                    billingInterval === 'monthly'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingInterval('yearly')}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all',
                    billingInterval === 'yearly'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Yearly
                  {maxSavings > 0 && (
                    <span className="text-xs font-semibold text-green-500">
                      -{maxSavings}%
                    </span>
                  )}
                </button>
              </div>

              {/* Plan cards grid — AnimatePresence crossfades skeleton → real content */}
              <AnimatePresence mode="wait">
              {isLoadingPlans ? (
                <motion.div
                  key="pricing-skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full space-y-10"
                >
                  {/*
                   * Skeleton pricing cards with right-side fade
                   * WHY: Prevents layout shift and suggests more cards loading
                   * HOW: Skeleton cards in a grid, masked with a horizontal
                   * fade-to-transparent on the right (MarqueeFade style)
                   */}
                  <div style={rightFadeMask}>
                    <div className="grid gap-0 w-full grid-cols-1 md:grid-cols-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          style={cellDashStyle}
                        >
                          <PricingCardSkeleton />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Skeleton comparison table with same right fade */}
                  <div style={rightFadeMask}>
                    <ComparisonTableSkeleton />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="pricing-loaded"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="w-full"
                >
                  {/*
                   * SVG noise filter definition — rendered once in the DOM.
                   * Active pricing cards reference this filter by ID for
                   * the grain texture in their gradient overlay.
                   */}
                  <svg
                    className="absolute w-0 h-0 overflow-hidden"
                    aria-hidden="true"
                  >
                    <defs>
                      <filter
                        id="pricing-noise"
                        x="0%"
                        y="0%"
                        width="100%"
                        height="100%"
                      >
                        <feTurbulence
                          type="fractalNoise"
                          baseFrequency="0.65"
                          numOctaves="3"
                          stitchTiles="stitch"
                        />
                      </filter>
                    </defs>
                  </svg>

                  {/*
                   * Dotted border grid container with "+" intersection signs
                   *
                   * DESIGN: Outer container provides top + left dotted borders.
                   * Each card cell provides right + bottom dotted borders.
                   * This creates a seamless grid where borders never double up.
                   * Plus signs are positioned at every column boundary on both
                   * the top and bottom edges.
                   */}
                  <div className="relative w-full">
                    {/*
                     * Outer edge dashes — extend 14px past the container so they
                     * overshoot at the corners where the crosses sit.
                     * WHY: background-image is clipped to the element, so we use
                     * absolutely-positioned thin elements that bleed outside.
                     */}
                    <span
                      className="absolute -left-3.5 -right-3.5 top-0 -translate-y-1/2 pointer-events-none z-1"
                      style={{
                        height: '1.5px',
                        backgroundImage: `repeating-linear-gradient(to right, ${DASH_COLOR} 0 10px, transparent 10px 20px)`,
                      }}
                    />
                    <span
                      className="absolute -left-3.5 -right-3.5 bottom-0 translate-y-1/2 pointer-events-none z-1"
                      style={{
                        height: '1.5px',
                        backgroundImage: `repeating-linear-gradient(to right, ${DASH_COLOR} 0 10px, transparent 10px 20px)`,
                      }}
                    />
                    <span
                      className="absolute left-0 -top-3.5 -bottom-3.5 -translate-x-1/2 pointer-events-none z-1"
                      style={{
                        width: '1.5px',
                        backgroundImage: `repeating-linear-gradient(to bottom, ${DASH_COLOR} 0 10px, transparent 10px 20px)`,
                      }}
                    />
                    <span
                      className="absolute right-0 -top-3.5 -bottom-3.5 translate-x-1/2 pointer-events-none z-1"
                      style={{
                        width: '1.5px',
                        backgroundImage: `repeating-linear-gradient(to bottom, ${DASH_COLOR} 0 10px, transparent 10px 20px)`,
                      }}
                    />

                    {/* Corner crosses — at the 4 outer corners where edges meet */}
                    {CORNER_POSITIONS.map((pct) => (
                      <Fragment key={pct}>
                        <span
                          className="absolute top-0 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
                          style={{ left: `${pct}%` }}
                        >
                          <span className="block relative w-7 h-7">
                            <span className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2 bg-muted-foreground/25" />
                            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-muted-foreground/25" />
                          </span>
                        </span>
                        <span
                          className="absolute bottom-0 -translate-x-1/2 translate-y-1/2 z-20 pointer-events-none"
                          style={{ left: `${pct}%` }}
                        >
                          <span className="block relative w-7 h-7">
                            <span className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2 bg-muted-foreground/25" />
                            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-muted-foreground/25" />
                          </span>
                        </span>
                      </Fragment>
                    ))}

                    {/* Cards grid — gap-0 for seamless dotted border grid */}
                    <div
                      className={cn(
                        'grid gap-0 w-full',
                        'grid-cols-1 md:grid-cols-2',
                        filteredPlans.length >= 4
                          ? 'xl:grid-cols-4'
                          : filteredPlans.length === 3
                            ? 'lg:grid-cols-3'
                            : 'lg:grid-cols-2',
                      )}
                    >
                      {filteredPlans.map((plan, index) => (
                        <div
                          key={plan.key}
                          style={cellDashStyle}
                        >
                          <PricingCard
                            plan={plan}
                            keyFeatures={allKeyFeatures[plan.key] || []}
                            previousPlanName={getPreviousPlanName(plan.key)}
                            isSelected={selectedPlan === plan.key}
                            isCurrentPlan={plan.key === currentTier}
                            isCurrentlyOnTrial={isCurrentlyOnTrial}
                            isPopular={
                              index === Math.floor(filteredPlans.length / 2)
                            }
                            priceDisplay={getPlanPriceDisplay(plan)}
                            billingInterval={billingInterval}
                            savings={calculateSavings(plan)}
                            onSelect={() => setSelectedPlan(plan.key)}
                            onProceed={() => handlePlanProceed(plan.key)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Full feature comparison table — inside the animated wrapper */}
                  {filteredPlans.length > 0 && (
                    <div className="w-full mt-10 sm:mt-14">
                      <FeatureComparisonTable
                        planKeys={filteredPlans
                          .filter((p) => p.showPlan !== false)
                          .map((p) => p.key as PlanKey)}
                      />
                    </div>
                  )}
                </motion.div>
              )}
              </AnimatePresence>

              {/* Bottom action bar — Continue button for keyboard/accessibility users */}
              <div className="mt-8 sm:mt-10 flex items-center gap-3">
                {onClose && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="text-muted-foreground"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    const intervals = getAvailableIntervals()
                    if (intervals.monthly && !intervals.yearly) {
                      setBillingInterval('monthly')
                    } else if (intervals.yearly && !intervals.monthly) {
                      setBillingInterval('yearly')
                    }
                    setCurrentStep('payment')
                  }}
                  disabled={!selectedPlan || currentPlan?.isFree}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
         * STEP 2: PAYMENT — Billing interval + payment method selection
         * Centered in fullscreen with max-width container
         * ================================================================ */}
        {currentStep === 'payment' && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Close button — top right */}
            {onClose && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Centered payment content */}
            <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12">
              <div className="w-full max-w-lg">
                {/* Back button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentStep('select-plan')}
                  className="w-fit mb-4 -ml-2 text-muted-foreground"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back to Plans
                </Button>

                {/* Header */}
                <div className="mb-8">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                    Payment Details
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentPlan &&
                      `Complete your ${
                        userScenario === 'paid_downgrade'
                          ? 'plan change'
                          : 'upgrade'
                      } to ${currentPlan.name}`}
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Billing Interval Selection */}
                  {currentPlan && !currentPlan.isFree && (
                    <div className="space-y-3">
                      <Label className="text-base font-medium">
                        Billing Interval
                      </Label>
                      {availableIntervals.monthly &&
                      availableIntervals.yearly ? (
                        <RadioGroup
                          value={billingInterval}
                          onValueChange={(v) =>
                            setBillingInterval(v as BillingInterval)
                          }
                          className="grid grid-cols-2 gap-4"
                        >
                          <div>
                            <RadioGroupItem
                              value="monthly"
                              id="upgrade-monthly"
                              className="peer sr-only"
                            />
                            <Label
                              htmlFor="upgrade-monthly"
                              className="flex flex-col items-center justify-between p-4 rounded-2xl cursor-pointer transition-all duration-200 bg-card border border-border/50 peer-data-[state=checked]:border-primary/60 peer-data-[state=checked]:shadow-lg peer-data-[state=checked]:shadow-primary/10 hover:border-primary/30"
                            >
                              <span className="text-sm font-semibold">
                                Monthly
                              </span>
                              <span className="text-2xl font-bold mt-2">
                                {
                                  formatIntervalPrice(currentPlan, 'monthly')
                                    ?.main
                                }
                              </span>
                              <span className="text-xs text-muted-foreground mt-1 text-center">
                                {
                                  formatIntervalPrice(currentPlan, 'monthly')
                                    ?.sub
                                }
                              </span>
                            </Label>
                          </div>

                          <div>
                            <RadioGroupItem
                              value="yearly"
                              id="upgrade-yearly"
                              className="peer sr-only"
                            />
                            <Label
                              htmlFor="upgrade-yearly"
                              className="relative flex flex-col items-center justify-between p-4 rounded-2xl cursor-pointer transition-all duration-200 bg-card border border-border/50 peer-data-[state=checked]:border-primary/60 peer-data-[state=checked]:shadow-lg peer-data-[state=checked]:shadow-primary/10 hover:border-primary/30"
                            >
                              {calculateSavings(currentPlan) > 0 && (
                                <span className="absolute -top-2 -right-2 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                  Save {calculateSavings(currentPlan)}%
                                </span>
                              )}
                              <span className="text-sm font-semibold">
                                Yearly
                              </span>
                              <span className="text-2xl font-bold mt-2">
                                {
                                  formatIntervalPrice(currentPlan, 'yearly')
                                    ?.main
                                }
                              </span>
                              <span className="text-xs text-muted-foreground mt-1 text-center">
                                {
                                  formatIntervalPrice(currentPlan, 'yearly')
                                    ?.sub
                                }
                              </span>
                            </Label>
                          </div>
                        </RadioGroup>
                      ) : (
                        /* Single interval card — when only one option is available */
                        <div className="relative p-4 rounded-2xl bg-card border border-primary/60 shadow-lg shadow-primary/10">
                          {availableIntervals.yearly &&
                            calculateSavings(currentPlan) > 0 && (
                              <span className="absolute -top-2 -right-2 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                Save {calculateSavings(currentPlan)}%
                              </span>
                            )}
                          <div className="text-center">
                            <p className="text-sm font-semibold mb-2">
                              {availableIntervals.monthly
                                ? 'Monthly'
                                : 'Yearly'}{' '}
                              Billing
                            </p>
                            <p className="text-2xl font-bold">
                              {availableIntervals.monthly
                                ? formatIntervalPrice(currentPlan, 'monthly')
                                    ?.main
                                : formatIntervalPrice(currentPlan, 'yearly')
                                    ?.main}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {availableIntervals.monthly
                                ? formatIntervalPrice(currentPlan, 'monthly')
                                    ?.sub
                                : formatIntervalPrice(currentPlan, 'yearly')
                                    ?.sub}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment Methods */}
                  {isLoadingPaymentMethods ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : hasPaymentMethods ? (
                    <div className="space-y-3">
                      <Label className="text-base font-medium">
                        Payment Method
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Select the card to use for this transaction
                      </p>

                      <div className="space-y-2">
                        {paymentMethods.map((pm) => {
                          const isDefault =
                            pm.id === paymentMethodsData?.defaultPaymentMethodId
                          const isSelected = pm.id === selectedPaymentMethodId
                          const brandName = pm.brand?.toUpperCase() || 'CARD'

                          return (
                            <div
                              key={pm.id}
                              onClick={() => setSelectedPaymentMethodId(pm.id)}
                              className={cn(
                                'group relative flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all duration-200',
                                'bg-card border',
                                isSelected
                                  ? 'border-primary/60 shadow-lg shadow-primary/10'
                                  : 'border-border/50 hover:border-primary/30',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-muted/50">
                                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium">
                                      {brandName} •••• {pm.last4}
                                    </p>
                                    {isDefault && (
                                      <Badge
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        Default
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Expires {pm.expMonth}/{pm.expYear}
                                  </p>
                                </div>
                              </div>

                              {isSelected && (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => setIsAddingCard(true)}
                      >
                        <Plus className="h-4 w-4" />
                        Add New Payment Method
                      </Button>
                    </div>
                  ) : (
                    /* Empty state — no payment methods on file */
                    <div className="space-y-3">
                      <Label className="text-base font-medium">
                        Payment Method
                      </Label>
                      <div className="flex flex-col items-center justify-center py-8 text-center rounded-2xl bg-muted/20 border border-dashed border-border">
                        <CreditCard className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium">
                          No payment methods on file
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Add a payment method to continue
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => setIsAddingCard(true)}
                      >
                        <Plus className="h-4 w-4" />
                        Add Payment Method
                      </Button>
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="mt-8 pt-6 border-t border-border/50">
                  <div className="flex gap-3 justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => setCurrentStep('select-plan')}
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleUpgrade}
                      disabled={
                        !selectedPaymentMethodId || upgradeMutation.isPending
                      }
                      className="gap-2"
                    >
                      {upgradeMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          {modalCopy.ctaButton}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
         * STEP 3: SUCCESS — Celebration with onboarding CTA
         * ================================================================ */}
        {currentStep === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
            <div className="w-full max-w-md text-center">
              {/* Celebration icon */}
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-6">
                <Heart className="h-8 w-8 text-primary fill-primary" />
              </div>

              {/* Success copy */}
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                {userScenario === 'trial_to_paid'
                  ? 'Subscription Complete!'
                  : `Welcome to ${selectedPlanName}!`}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {userScenario === 'trial_to_paid'
                  ? 'Your subscription is now active. Continue enjoying all features!'
                  : userScenario === 'paid_downgrade'
                    ? 'Your plan has been updated. Changes will reflect on your next billing cycle.'
                    : "Your upgrade is complete. Let's get you set up!"}
              </p>

              {/* Countdown refresh notice */}
              <div className="mt-6 px-4 py-3 bg-muted/50 rounded-xl border border-border/50">
                <p className="text-sm text-muted-foreground">
                  Refreshing your dashboard with new metrics in{' '}
                  <span className="font-bold text-primary">{countdown}</span>{' '}
                  second{countdown !== 1 ? 's' : ''}...
                </p>
              </div>

              {/* Get Started button */}
              <Button
                onClick={() => window.location.reload()}
                className="w-full mt-6"
              >
                Get Started
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ============================================================================
// UPGRADE MODAL — Fullscreen Dialog wrapper
// ============================================================================

/**
 * UpgradeModal — Fullscreen dialog that wraps UpgradeContent
 *
 * SOURCE OF TRUTH KEYWORDS: UpgradeModal, FullscreenPricing
 *
 * WHY: Provides the Dialog shell (overlay, portal, accessibility) around the
 * reusable UpgradeContent component. Takes the entire viewport so the user
 * can focus on plan selection without distractions.
 *
 * HOW: Overrides default Dialog sizing to fill the screen. The UpgradeContent
 * component handles all internal state, queries, and rendering.
 */
export function UpgradeModal({
  open,
  onOpenChange,
  organizationId,
}: UpgradeModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          /* Override default Dialog positioning and sizing for fullscreen */
          'top-0! left-0! right-0! bottom-0! translate-x-0! translate-y-0!',
          'max-w-none! sm:max-w-none! max-h-none!',
          'w-screen! h-dvh!',
          'rounded-none! border-0! p-0! gap-0! shadow-none!',
          'bg-background',
        )}
      >
        {/* Hidden accessible title/description for screen readers */}
        <DialogHeader className="sr-only">
          <DialogTitle>Upgrade Plan</DialogTitle>
          <DialogDescription>
            Choose a plan to upgrade your organization
          </DialogDescription>
        </DialogHeader>

        <UpgradeContent
          organizationId={organizationId}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
