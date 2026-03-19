/**
 * ============================================================================
 * USE ADD TO CART HOOK
 * ============================================================================
 *
 * SOURCE OF TRUTH: Add to Cart Logic, Cart Item Creation, E-commerce Add to Cart
 *
 * Shared hook for adding products to cart. Supports a 3-tier resolution:
 *
 *   1. CMS Context (highest priority) — reads product data from the CMS row
 *      context provided by a SmartCMS List or dynamic page CmsRowProvider.
 *   2. Standalone Config — reads product data stored directly on the element
 *      (set via the product picker in the settings panel).
 *   3. Disabled — neither CMS context nor standalone config found; button
 *      cannot add anything to the cart.
 *
 * ============================================================================
 * CMS ROW DATA STRUCTURE (Store Tables)
 * ============================================================================
 *
 * Store CMS tables have these columns:
 * - product_name: Product name text
 * - product_image: Product image URL
 * - price_name: Price tier name
 * - price_amount: Price in dollars (number)
 * - currency: Currency code (e.g., 'USD')
 * - billing_type: ONE_TIME, RECURRING, etc.
 * - billing_interval: DAY, WEEK, MONTH, YEAR (for subscriptions)
 * - interval_count: Number (e.g., 2 for "every 2 months")
 * - stripe_price_id: Stripe price ID for checkout
 *
 * ============================================================================
 */

import { useCmsRowContext } from './cms-row-context'
import { useCartActions } from './cart-hooks'
import type { CartItemBillingType, CartItemBillingInterval } from './cart-slice'
import type { AddToCartButtonElement } from './types'

/**
 * Return type for useAddToCart hook.
 *
 * SOURCE OF TRUTH: UseAddToCartReturn
 */
export interface UseAddToCartReturn {
  /** Whether the button has a valid product source (CMS context OR standalone config) */
  hasValidContext: boolean
  /** Handler to add the resolved product to cart */
  handleAddToCart: () => void
  /** Whether the product is out of stock (tracked, zero quantity, no backorders) */
  isOutOfStock: boolean
}

/**
 * Hook for adding products to cart with 3-tier resolution.
 *
 * SOURCE OF TRUTH: useAddToCart Hook, Standalone Add-to-Cart, 3-Tier Cart Resolution
 *
 * Resolution order:
 *   1. CMS context → reads product data from CMS row (SmartCMS list or dynamic page)
 *   2. Standalone config → reads product data from element props (set in settings panel)
 *   3. Disabled → no valid source found, button won't function
 *
 * @param element - Optional element data for standalone mode resolution
 * @returns Object with hasValidContext boolean and handleAddToCart function
 */
export function useAddToCart(element?: AddToCartButtonElement): UseAddToCartReturn {
  const cmsContext = useCmsRowContext()
  const { addItem } = useCartActions()

  // ========================================================================
  // TIER 1: CMS Context — SmartCMS list or dynamic page with store table
  // ========================================================================
  const hasCmsContext = Boolean(cmsContext?.row?.values?.stripe_price_id)

  // ========================================================================
  // TIER 2: Standalone Config — product/price configured on element itself
  // ========================================================================
  const hasStandaloneConfig = Boolean(element?.standaloneStripePriceId)

  /** Button is usable if EITHER source provides product data */
  const hasValidContext = hasCmsContext || hasStandaloneConfig

  // ========================================================================
  // STOCK RESOLUTION
  // ========================================================================
  //
  // SOURCE OF TRUTH: Add-to-Cart Stock Resolution, Inventory Check
  //
  // Resolves inventory state from CMS context (Tier 1) or standalone config
  // (Tier 2). A product is considered out of stock when:
  //   - Inventory tracking is enabled (trackInventory === true)
  //   - Available quantity is zero or below (inventoryQuantity <= 0)
  //   - Backorders are NOT allowed (allowBackorder !== true)
  // ========================================================================

  /** Resolve inventory fields — CMS context takes priority over standalone */
  const trackInventory = hasCmsContext && cmsContext?.row
    ? Boolean(cmsContext.row.values.track_inventory)
    : Boolean(element?.standaloneTrackInventory)

  /**
   * Read raw inventory quantity from hidden _inventory_quantity_raw field.
   * The visible inventory_quantity field is now a display string ("No Stock", "5", "").
   * Falls back to inventory_quantity for legacy rows that haven't been re-synced.
   */
  const inventoryQuantity = hasCmsContext && cmsContext?.row
    ? Number(cmsContext.row.values._inventory_quantity_raw ?? cmsContext.row.values.inventory_quantity ?? 0)
    : Number(element?.standaloneInventoryQuantity || 0)

  const allowBackorder = hasCmsContext && cmsContext?.row
    ? Boolean(cmsContext.row.values.allow_backorder)
    : Boolean(element?.standaloneAllowBackorder)

  /**
   * Product is out of stock when tracking is on, quantity is depleted,
   * and backorders are not permitted.
   */
  const isOutOfStock = trackInventory && inventoryQuantity <= 0 && !allowBackorder

  /**
   * Handle click — add product to cart using the first available source.
   *
   * Priority: CMS context > Standalone config > no-op (disabled).
   * Blocks the action entirely when the product is out of stock.
   */
  const handleAddToCart = () => {
    // ------------------------------------------------------------------
    // Stock guard — prevent adding out-of-stock items to cart
    // ------------------------------------------------------------------
    if (isOutOfStock) {
      console.warn('[useAddToCart] Cannot add to cart — product is out of stock')
      return
    }

    // ------------------------------------------------------------------
    // Tier 1: CMS row context (highest priority — data from live CMS table)
    // ------------------------------------------------------------------
    if (hasCmsContext && cmsContext?.row) {
      const row = cmsContext.row
      const values = row.values

      const productName = String(values.product_name || 'Unknown Product')
      const productImage = values.product_image as string | null
      const currency = String(values.currency || 'USD')
      const stripePriceId = String(values.stripe_price_id)

      /**
       * Read raw price in cents from hidden _price_cents (new format).
       * Falls back to price_amount * 100 for legacy rows that stored raw dollar amounts.
       */
      const rawPriceCents = values._price_cents as number | undefined
      const priceInCents = rawPriceCents != null
        ? rawPriceCents
        : Math.round(Number(values.price_amount || 0) * 100)

      /**
       * Extract billing type — defaults to ONE_TIME.
       * SPLIT_PAYMENT is not supported in cart checkout.
       */
      const rawBillingType = String(values.billing_type || 'ONE_TIME')
      const billingType: CartItemBillingType =
        rawBillingType === 'RECURRING' ? 'RECURRING' : 'ONE_TIME'

      /** Billing interval for recurring subscriptions */
      const rawInterval = values.billing_interval as string | undefined
      const billingInterval: CartItemBillingInterval | undefined =
        rawInterval && ['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(rawInterval)
          ? (rawInterval as CartItemBillingInterval)
          : undefined

      /** Interval count — defaults to 1 */
      const intervalCount = Number(values.interval_count || 1)

      /**
       * Read raw trial days from hidden _trial_days_raw field.
       * The visible trial_days field is now a display string ("7 days", "").
       * Falls back to trial_days for legacy rows that haven't been re-synced.
       */
      const trialDays = Number(values._trial_days_raw ?? values.trial_days ?? 0)

      addItem({
        id: row.id,
        name: productName,
        image: productImage || null,
        priceInCents,
        currency: currency,
        stripePriceId: stripePriceId,
        billingType: billingType,
        billingInterval: billingType === 'RECURRING' ? billingInterval : undefined,
        intervalCount: billingType === 'RECURRING' ? intervalCount : undefined,
        trialDays: trialDays > 0 ? trialDays : undefined,
      })
      return
    }

    // ------------------------------------------------------------------
    // Tier 2: Standalone config (product data stored on element itself)
    // ------------------------------------------------------------------
    if (hasStandaloneConfig && element) {
      addItem({
        id: `standalone_${element.standaloneStripePriceId}`,
        name: element.standaloneProductName || 'Product',
        image: element.standaloneProductImage || null,
        priceInCents: element.standalonePriceInCents || 0,
        currency: element.standaloneCurrency || 'usd',
        stripePriceId: element.standaloneStripePriceId!,
        billingType: element.standaloneBillingType || 'ONE_TIME',
        billingInterval: element.standaloneBillingType === 'RECURRING'
          ? element.standaloneBillingInterval
          : undefined,
        intervalCount: element.standaloneBillingType === 'RECURRING'
          ? element.standaloneIntervalCount
          : undefined,
        /** Pass trial days from standalone config if available */
        trialDays: element.standaloneTrialDays && element.standaloneTrialDays > 0
          ? element.standaloneTrialDays
          : undefined,
      })
      return
    }

    // ------------------------------------------------------------------
    // Tier 3: No valid source — log warning and do nothing
    // ------------------------------------------------------------------
    console.warn('[useAddToCart] Cannot add to cart — no CMS context and no standalone config')
  }

  return {
    hasValidContext,
    handleAddToCart,
    isOutOfStock,
  }
}
