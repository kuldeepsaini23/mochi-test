/**
 * FEATURES ROUTER - Platform Plans, Pricing & Platform Currency
 *
 * Source of truth: feature-gates.ts (plans), platform-currency.service.ts (currency)
 * Fetches Stripe pricing and platform currency for display.
 *
 * SOURCE OF TRUTH KEYWORDS: FeaturesRouter, PlatformPlans, PlatformCurrency
 */

import { createTRPCRouter, baseProcedure } from '../init'
import { PLANS, PLATFORM_CONFIG } from '@/lib/config'
import { stripe } from '@/lib/config' // Use shared Stripe singleton from config

export const featuresRouter = createTRPCRouter({
  /**
   * Get the platform's Stripe account currency.
   *
   * WHY: All platform-level monetary displays (SaaS plan pricing, PAYG costs,
   * wallet top-ups) need to know the platform's currency dynamically instead
   * of hardcoding "$" / "USD".
   *
   * HOW: Delegates to getPlatformCurrency() service which calls Stripe API
   * with React.cache() deduplication. Client-side caching via React Query
   * with staleTime: 30 minutes in PlatformCurrencyProvider.
   *
   * SOURCE OF TRUTH KEYWORDS: getPlatformCurrency, PlatformCurrencyEndpoint
   */
  getPlatformCurrency: baseProcedure.query(async () => {
    const { getPlatformCurrency } = await import('@/services/platform-currency.service')
    const info = await getPlatformCurrency()

    return {
      currency: info.currency,
      symbol: info.currencyInfo.symbol,
      name: info.currencyInfo.name,
      decimals: info.currencyInfo.decimals,
      country: info.country,
    }
  }),

  /**
   * Get all platform plans with Stripe pricing.
   * Also returns the platform currency derived from fetched prices.
   */
  getAvailablePlans: baseProcedure.query(async () => {
    // Collect all price IDs
    const priceIds: string[] = []
    Object.values(PLANS).forEach((plan) => {
      if (plan.stripe.monthly) priceIds.push(plan.stripe.monthly)
      if (plan.stripe.yearly) priceIds.push(plan.stripe.yearly)
    })

    // Fetch prices from Stripe
    const uniquePriceIds = [...new Set(priceIds.filter(Boolean))] as string[]
    const pricePromises = uniquePriceIds.map((id) => stripe.prices.retrieve(id))
    const stripePrices = await Promise.all(pricePromises)

    // Create price map
    const priceMap: Record<string, { amount: number | null; currency: string; interval: string | null }> = {}
    stripePrices.forEach((price) => {
      priceMap[price.id] = {
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval || null,
      }
    })

    /* Derive platform currency from the first available price.
     * All platform plan prices share the same currency (set in Stripe dashboard). */
    const platformCurrency = stripePrices[0]?.currency || 'usd'

    // Map plans with pricing
    const plans = Object.entries(PLANS)
      .filter(([, plan]) => plan.showPlan)
      .map(([key, plan]) => ({
        key,
        name: plan.name,
        description: '',
        icon: plan.icon,
        showPlan: plan.showPlan,
        monthlyPrice: plan.stripe.monthly ? priceMap[plan.stripe.monthly] : null,
        yearlyPrice: plan.stripe.yearly ? priceMap[plan.stripe.yearly] : null,
        trialDays: plan.trialDays,
        isFree: !plan.stripe.monthly && !plan.stripe.yearly,
      }))

    return {
      platformConfig: {
        acceptPaymentForFreePlan: PLATFORM_CONFIG.acceptPaymentForFreePlan,
      },
      plans,
      /** Platform currency code derived from Stripe plan prices */
      platformCurrency,
    }
  }),
})
