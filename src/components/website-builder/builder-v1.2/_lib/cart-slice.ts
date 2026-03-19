/**
 * ============================================================================
 * CART REDUX SLICE — Per-Website Shopping Cart State
 * ============================================================================
 *
 * SOURCE OF TRUTH: Cart State, CartItem, Shopping Cart, E-commerce Cart
 *
 * Redux Toolkit slice for managing shopping cart state. Each website gets
 * its own isolated store instance via CartProvider, preventing cross-site
 * cart contamination. A user visiting Website A and Website B will have
 * completely separate carts scoped by the website's domain.
 *
 * REPLACES: The previous global Zustand store (cart-store.ts) which shared
 * a single cart across ALL websites — a security and data integrity issue.
 *
 * PERSISTENCE: Cart items are persisted to localStorage per-website.
 * The CartProvider handles hydration and persistence automatically.
 * Only `items` are persisted — UI state (isOpen) and ephemeral data
 * (stockLimits, hydrated) reset on each page load.
 *
 * ============================================================================
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { formatCurrency } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Billing type for a cart item — determines Stripe checkout mode.
 * SOURCE OF TRUTH: CartItemBillingType
 */
export type CartItemBillingType = 'ONE_TIME' | 'RECURRING'

/**
 * Billing interval for recurring cart items.
 * SOURCE OF TRUTH: CartItemBillingInterval
 */
export type CartItemBillingInterval = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

/**
 * Single item in the shopping cart.
 *
 * SOURCE OF TRUTH: CartItem
 *
 * Contains all data needed to display the item in the cart UI and to
 * create a Stripe checkout session. The stripePriceId is the key link
 * to Stripe's pricing system.
 */
export interface CartItem {
  /** Unique identifier (typically the CMS row ID or `standalone_${stripePriceId}`) */
  id: string
  /** Display name of the product */
  name: string
  /** Product image URL — null when no image is set */
  image?: string | null
  /** Price in cents (e.g., 1999 = $19.99) */
  priceInCents: number
  /** Number of this item in the cart */
  quantity: number
  /** Stripe price ID — used for checkout session creation */
  stripePriceId: string
  /** Currency code (e.g., 'usd', 'EUR') */
  currency: string
  /** Whether this is a one-time purchase or recurring subscription */
  billingType: CartItemBillingType
  /** Billing interval for recurring items (ignored for ONE_TIME) */
  billingInterval?: CartItemBillingInterval
  /** Interval count — e.g., 2 for "every 2 months" (ignored for ONE_TIME) */
  intervalCount?: number
  /**
   * Free trial days for this item.
   * When > 0, the checkout uses Stripe SetupIntent (confirmSetup) instead of
   * PaymentIntent (confirmPayment). The customer is not charged until the
   * trial period ends.
   */
  trialDays?: number
}

/**
 * Per-item stock limit stored in the cart.
 * Written by useCartValidation, read by both checkout and cart sheet.
 *
 * SOURCE OF TRUTH: CartStockLimit
 */
export interface CartStockLimit {
  /** Max quantity allowed. null = inventory not tracked (unlimited). */
  maxQuantity: number | null
  /** True when tracked inventory is at or below the low-stock threshold. */
  lowStock: boolean
}

/**
 * Payload for the syncItemMetadata action — updates stale cart item data
 * with fresh values from the backend.
 */
interface SyncMetadataPayload {
  stripePriceId: string
  metadata: {
    name?: string
    image?: string | null
    priceInCents?: number
    currency?: string
    billingType?: CartItemBillingType
    billingInterval?: CartItemBillingInterval
    intervalCount?: number
    trialDays?: number
  }
}

// ============================================================================
// STATE
// ============================================================================

interface CartState {
  /** Cart items array */
  items: CartItem[]
  /** Whether the cart sheet slide-out is open */
  isOpen: boolean
  /**
   * Stock limits per stripePriceId — populated by useCartValidation after
   * backend check. Used by cart sheet and checkout to disable the + button
   * at max stock and show "Low stock" indicators.
   *
   * NOT persisted to localStorage — ephemeral per session, refreshed on
   * checkout mount.
   *
   * SOURCE OF TRUTH: CartStockLimitsState
   */
  stockLimits: Record<string, CartStockLimit>
  /**
   * Whether the cart has been hydrated from localStorage.
   * Components should show a skeleton while this is false,
   * and only show "Your cart is empty" when true AND items is empty.
   */
  hydrated: boolean
}

const initialState: CartState = {
  items: [],
  isOpen: false,
  stockLimits: {},
  hydrated: false,
}

// ============================================================================
// SLICE
// ============================================================================

export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    /**
     * Hydrate cart items from localStorage on initial mount.
     * Called by CartProvider after reading the per-website storage key.
     */
    hydrateCart(state, action: PayloadAction<CartItem[]>) {
      state.items = action.payload
      state.hydrated = true
    },

    /**
     * Add item to cart or increment quantity if it already exists.
     * Automatically opens the cart sheet to give visual feedback.
     */
    addItem(state, action: PayloadAction<Omit<CartItem, 'quantity'>>) {
      const existing = state.items.find((item) => item.id === action.payload.id)
      if (existing) {
        existing.quantity += 1
      } else {
        state.items.push({ ...action.payload, quantity: 1 } as CartItem)
      }
      state.isOpen = true
    },

    /** Remove item from cart entirely by its ID */
    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== action.payload)
    },

    /** Update item quantity. Removes item if quantity drops to 0 or below. */
    updateQuantity(state, action: PayloadAction<{ id: string; quantity: number }>) {
      const { id, quantity } = action.payload
      if (quantity <= 0) {
        state.items = state.items.filter((item) => item.id !== id)
      } else {
        const item = state.items.find((i) => i.id === id)
        if (item) item.quantity = quantity
      }
    },

    /** Clear all items from cart */
    clearCart(state) {
      state.items = []
    },

    /** Open the cart sheet slide-out */
    openCart(state) {
      state.isOpen = true
    },

    /** Close the cart sheet slide-out */
    closeCart(state) {
      state.isOpen = false
    },

    /**
     * Set stock limits for all cart items after backend validation.
     * Replaces the entire stockLimits map.
     */
    setStockLimits(state, action: PayloadAction<Record<string, CartStockLimit>>) {
      state.stockLimits = action.payload
    },

    /**
     * Sync fresh product/pricing metadata from backend validation.
     * Silently updates fields without changing quantity or opening cart.
     * Only overwrites fields that are explicitly provided (not undefined).
     *
     * SOURCE OF TRUTH: CartStoreMetadataSync, SyncItemMetadata
     */
    syncItemMetadata(state, action: PayloadAction<SyncMetadataPayload>) {
      const { stripePriceId, metadata } = action.payload
      const item = state.items.find((i) => i.stripePriceId === stripePriceId)
      if (!item) return

      if (metadata.name !== undefined) item.name = metadata.name
      if (metadata.image !== undefined) item.image = metadata.image
      if (metadata.priceInCents !== undefined) item.priceInCents = metadata.priceInCents
      if (metadata.currency !== undefined) item.currency = metadata.currency
      if (metadata.billingType !== undefined) item.billingType = metadata.billingType
      if (metadata.billingInterval !== undefined) item.billingInterval = metadata.billingInterval
      if (metadata.intervalCount !== undefined) item.intervalCount = metadata.intervalCount
      if (metadata.trialDays !== undefined) item.trialDays = metadata.trialDays
    },
  },
})

/** Export all action creators for dispatch */
export const cartActions = cartSlice.actions

// ============================================================================
// ROOT STATE TYPE
// ============================================================================

/**
 * Root state shape for the per-website cart store.
 * Used by selectors and typed hooks.
 */
export interface CartRootState {
  cart: CartState
}

// ============================================================================
// SELECTORS
// ============================================================================

/** All items in the cart */
export const selectCartItems = (state: CartRootState) => state.cart.items

/** Whether the cart sheet is currently open */
export const selectIsCartOpen = (state: CartRootState) => state.cart.isOpen

/** Whether the cart has been hydrated from localStorage */
export const selectCartHydrated = (state: CartRootState) => state.cart.hydrated

/** Stock limits map — keyed by stripePriceId */
export const selectStockLimits = (state: CartRootState) => state.cart.stockLimits

/** Total number of items (sum of all quantities) */
export const selectCartItemCount = (state: CartRootState) =>
  state.cart.items.reduce((total, item) => total + item.quantity, 0)

/** Total price in cents (sum of price * quantity for all items) */
export const selectTotalPriceInCents = (state: CartRootState) =>
  state.cart.items.reduce((total, item) => total + item.priceInCents * item.quantity, 0)

/** Whether the cart contains any recurring/subscription items */
export const selectHasRecurringItems = (state: CartRootState) =>
  state.cart.items.some((item) => item.billingType === 'RECURRING')

/** Whether the cart contains any one-time items */
export const selectHasOneTimeItems = (state: CartRootState) =>
  state.cart.items.some((item) => item.billingType === 'ONE_TIME')

/**
 * Determines the Stripe Checkout mode based on cart contents.
 * SOURCE OF TRUTH: StripeCheckoutModeLogic
 *
 * If ANY item is a subscription (RECURRING), we must use 'subscription' mode.
 * Stripe allows mixing one-time and recurring items only in subscription mode.
 * One-time items in subscription mode are charged on the first invoice.
 */
export const selectCheckoutMode = (state: CartRootState): 'payment' | 'subscription' =>
  state.cart.items.some((item) => item.billingType === 'RECURRING') ? 'subscription' : 'payment'

/** Whether the cart has at least one item */
export const selectHasCartItems = (state: CartRootState) => state.cart.items.length > 0

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format billing interval for display.
 * SOURCE OF TRUTH: Billing Interval Display Formatter
 *
 * @param interval - The billing interval (DAY, WEEK, MONTH, YEAR)
 * @param count - The interval count (e.g., 2 for "every 2 months")
 * @returns Formatted string like "/month", "/year", "every 2 weeks"
 */
export function formatBillingInterval(
  interval?: CartItemBillingInterval,
  count: number = 1
): string {
  if (!interval) return ''

  const intervalMap: Record<CartItemBillingInterval, { singular: string; plural: string }> = {
    DAY: { singular: 'day', plural: 'days' },
    WEEK: { singular: 'week', plural: 'weeks' },
    MONTH: { singular: 'month', plural: 'months' },
    YEAR: { singular: 'year', plural: 'years' },
  }

  const { singular, plural } = intervalMap[interval]

  if (count === 1) return `/${singular}`

  return `/every ${count} ${plural}`
}

/**
 * Format price for display (converts cents to currency string).
 * Delegates to the shared formatCurrency utility from @/lib/utils.
 */
export function formatCartPrice(priceInCents: number, currency = 'USD'): string {
  return formatCurrency(priceInCents, currency)
}
