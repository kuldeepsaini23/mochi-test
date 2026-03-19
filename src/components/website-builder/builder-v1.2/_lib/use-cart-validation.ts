/**
 * ============================================================================
 * USE CART VALIDATION HOOK
 * ============================================================================
 *
 * SOURCE OF TRUTH: CartValidation, UseCartValidation, StockLimits
 *
 * Validates cart items against the backend to detect:
 * - Deleted products/prices (removed from store after purchase was added to cart)
 * - Out-of-stock items (inventory depleted since item was added)
 * - Over-quantity items (user added more than available stock)
 * - Low stock items (inventory at or below threshold)
 *
 * SMART STOCK BEHAVIOR:
 * - Items with deleted prices/products → auto-removed from cart
 * - Items with 0 stock → shown as out-of-stock warning (NOT removed)
 * - Items where quantity > available stock but stock > 0 → auto-capped
 *   to available quantity with a user-friendly message
 * - Items at or below low-stock threshold → flagged for "Low stock" badge
 *
 * Returns a `stockLimits` map so the UI can disable the + button at max.
 * null value in stockLimits means inventory is NOT tracked (unlimited).
 *
 * ============================================================================
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { trpc } from '@/trpc/react-provider'
import { useCartHydrated, useCartActions } from './cart-hooks'
import type { CartItem, CartStockLimit } from './cart-slice'

/**
 * Per-item stock limit info for the UI.
 *
 * SOURCE OF TRUTH: StockLimitEntry
 */
export interface StockLimitEntry {
  /** Max quantity allowed. null = not tracked (unlimited). */
  maxQuantity: number | null
  /** Whether this item has low stock (at or below threshold). */
  lowStock: boolean
}

/**
 * Result shape for the cart validation hook.
 *
 * SOURCE OF TRUTH: CartValidationResult
 */
export interface CartValidationResult {
  /** User-friendly message when items were removed from cart (null = all items valid) */
  validationMessage: string | null
  /** User-friendly message when quantities were auto-reduced (null = no changes) */
  stockReducedMessage: string | null
  /** Items that are completely out of stock — shown as warnings, NOT auto-removed */
  stockWarnings: Array<{ name: string; availableQuantity: number }>
  /**
   * Map of stripePriceId → stock limit for each item.
   * Used by the UI to disable + button and show low-stock indicators.
   * null maxQuantity means inventory is NOT tracked (unlimited).
   *
   * SOURCE OF TRUTH: StockLimitsMap
   */
  stockLimits: Map<string, StockLimitEntry>
  /** Whether validation query is still loading */
  isValidating: boolean
}

/**
 * Validates cart items against the database and auto-removes stale entries.
 * Also returns stock limits for quantity capping in the UI.
 *
 * SOURCE OF TRUTH: UseCartValidation, CartItemValidationHook
 *
 * Called when the checkout element mounts and whenever items change.
 * The backend returns availableQuantity for ALL items (not just invalid ones)
 * so the UI can proactively cap the + button before the user even tries checkout.
 *
 * EDGE CASE HANDLED: Another customer buys the last units between the time
 * this customer added to cart and checkout. Instead of removing the item:
 * - If stock > 0 but < requested quantity → auto-cap and show message
 * - If stock = 0 → show out-of-stock warning (customer can wait or remove)
 *
 * @param organizationId - The org whose store owns these products
 * @param items - Current cart items from the Redux cart selector
 */
export function useCartValidation(
  organizationId: string | undefined,
  items: CartItem[]
): CartValidationResult {
  const isHydrated = useCartHydrated()
  const { removeItem, updateQuantity, setStockLimits: setStoreStockLimits, syncItemMetadata } = useCartActions()

  /**
   * Ref that always holds the latest cart items from the parent's selector.
   * Used inside the validation useEffect to read current items WITHOUT adding
   * `items` to the dependency array (which would cause an infinite loop since
   * the effect itself mutates items via removeItem/updateQuantity/syncItemMetadata).
   */
  const itemsRef = useRef(items)
  itemsRef.current = items

  /** Track which stripePriceIds we've already processed to prevent duplicate removals/caps. */
  const processedRef = useRef<Set<string>>(new Set())

  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [stockReducedMessage, setStockReducedMessage] = useState<string | null>(null)
  const [stockWarnings, setStockWarnings] = useState<Array<{ name: string; availableQuantity: number }>>([])
  const [stockLimits, setStockLimits] = useState<Map<string, StockLimitEntry>>(new Map())

  /**
   * Build the query input from current cart items.
   * Only include stripePriceId and quantity — the backend doesn't need more.
   */
  const queryItems = items.map((item) => ({
    stripePriceId: item.stripePriceId,
    quantity: item.quantity,
  }))

  /**
   * Call the validateCartItems tRPC query.
   * Enabled only when: cart has items, org exists, and store is hydrated from localStorage.
   */
  const { data: validationResults, isLoading } = trpc.payment.validateCartItems.useQuery(
    { organizationId: organizationId ?? '', items: queryItems },
    {
      enabled: items.length > 0 && !!organizationId && isHydrated,
      /** Don't refetch on window focus — one check per mount is enough */
      refetchOnWindowFocus: false,
      /** Stale immediately so it refetches if items change */
      staleTime: 0,
    }
  )

  /**
   * Process validation results:
   * 1. Remove items with deleted prices/products
   * 2. Auto-cap quantities that exceed available stock
   * 3. Build stock limits map for the UI
   * 4. Collect out-of-stock warnings
   * 5. Sync fresh pricing metadata from DB source of truth
   *
   * IMPORTANT: This effect depends ONLY on `validationResults` (not `items`).
   * Cart items are read via `itemsRef.current` snapshot inside the effect
   * to avoid an infinite re-render loop: syncItemMetadata/updateQuantity/removeItem
   * all mutate the items array, which would re-trigger this effect if `items` were
   * in the dependency array.
   *
   * Uses processedRef to avoid processing the same item twice on re-renders.
   * This effect runs whenever validationResults changes (i.e., after the query returns).
   */
  useEffect(() => {
    if (!validationResults || validationResults.length === 0) return

    /**
     * Read cart items from the ref snapshot — NOT from the `items` prop directly.
     * This prevents the infinite loop: effect mutates items → items change →
     * effect re-runs → mutates items again → crash.
     * The ref always holds the latest value from the parent's Redux selector.
     */
    const currentItems = itemsRef.current

    const removedNames: string[] = []
    const cappedNames: string[] = []
    const warnings: Array<{ name: string; availableQuantity: number }> = []
    const limits = new Map<string, StockLimitEntry>()

    for (const result of validationResults) {
      /** Build stock limits map for ALL items — the UI needs this regardless of validity. */
      limits.set(result.stripePriceId, {
        maxQuantity: result.availableQuantity,
        lowStock: result.lowStock,
      })

      /** Skip items we've already processed (prevents double-removal on re-renders). */
      if (processedRef.current.has(result.stripePriceId)) continue

      if (!result.valid) {
        processedRef.current.add(result.stripePriceId)

        if (result.reason === 'price_not_found' || result.reason === 'product_deleted') {
          /**
           * Find the cart item by stripePriceId and remove it.
           * The cart store's removeItem takes the item ID, not the stripePriceId,
           * so we need to look up the matching cart item.
           */
          const cartItem = currentItems.find((item) => item.stripePriceId === result.stripePriceId)
          if (cartItem) {
            removeItem(cartItem.id)
            removedNames.push(cartItem.name)
          }
        } else if (result.reason === 'out_of_stock') {
          const cartItem = currentItems.find((item) => item.stripePriceId === result.stripePriceId)
          if (!cartItem) continue

          if (result.availableQuantity !== null && result.availableQuantity > 0) {
            /**
             * SMART STOCK REDUCTION: Stock exists but is less than requested quantity.
             * Don't remove the item — auto-cap to available quantity and notify the user.
             * This prevents frustrating item removal when there's still some stock left.
             */
            updateQuantity(cartItem.id, result.availableQuantity)
            cappedNames.push(`"${cartItem.name}" (reduced to ${result.availableQuantity})`)
          } else {
            /**
             * Completely out of stock (0 remaining).
             * Show as warning but do NOT remove — the customer might want to wait.
             */
            warnings.push({
              name: cartItem.name,
              availableQuantity: result.availableQuantity ?? 0,
            })
          }
        }
      } else if (result.reason === 'ok') {
        /**
         * Item is valid, but check if the cart quantity exceeds available stock.
         * This handles the case where stock reduced between adding and checkout.
         * availableQuantity is null when inventory isn't tracked (no cap needed).
         */
        if (result.availableQuantity !== null) {
          const cartItem = currentItems.find((item) => item.stripePriceId === result.stripePriceId)
          if (cartItem && cartItem.quantity > result.availableQuantity) {
            processedRef.current.add(result.stripePriceId)
            updateQuantity(cartItem.id, result.availableQuantity)
            cappedNames.push(`"${cartItem.name}" (reduced to ${result.availableQuantity})`)
          }
        }
      }
    }

    /** Update stock limits — both local state (for this hook's return) and cart store (for cart sheet). */
    setStockLimits(limits)

    /**
     * Write stock limits to the cart store so the cart sheet can read them
     * without needing its own validation query or organizationId.
     *
     * SOURCE OF TRUTH: CartStoreStockLimitsSync
     */
    const storeRecord: Record<string, CartStockLimit> = {}
    limits.forEach((entry, key) => { storeRecord[key] = entry })
    setStoreStockLimits(storeRecord)

    /**
     * Sync fresh pricing metadata from the DB source of truth.
     * This overwrites stale cart data (from add-to-cart time) with current
     * values from the actual Product/ProductPrice tables.
     * Eliminates data drift between CMS and standalone add-to-cart paths.
     *
     * SOURCE OF TRUTH: CartMetadataSync, PricingSourceOfTruth
     */
    for (const result of validationResults) {
      if (result.productName !== undefined) {
        syncItemMetadata(result.stripePriceId, {
          name: result.productName,
          image: result.productImage ?? null,
          priceInCents: result.priceInCents,
          currency: result.currency,
          billingType: result.billingType,
          billingInterval: result.billingInterval ?? undefined,
          intervalCount: result.intervalCount ?? undefined,
          trialDays: result.trialDays ?? undefined,
        })
      }
    }

    /** Build user-friendly removal message. */
    if (removedNames.length > 0) {
      const itemWord = removedNames.length === 1 ? 'item' : 'items'
      setValidationMessage(
        `${removedNames.length} ${itemWord} removed from your cart — no longer available`
      )
    }

    /** Build user-friendly stock-reduced message. */
    if (cappedNames.length > 0) {
      setStockReducedMessage(
        `Stock has changed: ${cappedNames.join(', ')}. Quantities adjusted to available stock.`
      )
    }

    if (warnings.length > 0) {
      setStockWarnings(warnings)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- items intentionally excluded:
  // We read items via itemsRef.current inside the effect to prevent infinite loops.
  // This effect must only re-run when validationResults changes (new query response),
  // NOT when items change from our own mutations (syncItemMetadata, updateQuantity, removeItem).
  }, [validationResults, removeItem, updateQuantity, setStoreStockLimits, syncItemMetadata])

  return {
    validationMessage,
    stockReducedMessage,
    stockWarnings,
    stockLimits,
    isValidating: isLoading,
  }
}
