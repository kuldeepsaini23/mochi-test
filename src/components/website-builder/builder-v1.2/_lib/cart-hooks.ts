/**
 * ============================================================================
 * CART HOOKS — Typed Redux Hooks for Per-Website Cart Store
 * ============================================================================
 *
 * SOURCE OF TRUTH: Cart Hooks, CartDispatch, CartSelector, Cart Context
 *
 * Custom React-Redux hooks bound to the CartReduxContext. This isolates the
 * cart store from the builder Redux store — both can coexist without
 * conflicting because they use different React contexts.
 *
 * SAFE OUTSIDE PROVIDER:
 * All hooks gracefully return defaults when called outside a CartProvider
 * (e.g., in the builder canvas mode or BreakpointMobileFrame where no
 * CartProvider exists). This prevents "could not find react-redux context"
 * crashes in components that render in both canvas and preview modes.
 *
 * USAGE:
 *   const items = useCartSelector(selectCartItems)
 *   const dispatch = useCartDispatch()
 *   dispatch(cartActions.addItem({ ... }))
 *
 * Or use the convenience hooks:
 *   const items = useCartItems()
 *   const { addItem, removeItem } = useCartActions()
 *
 * ============================================================================
 */

'use client'

import { createContext, useContext, useMemo } from 'react'
import {
  createDispatchHook,
  createSelectorHook,
  type ReactReduxContextValue,
} from 'react-redux'
import {
  cartActions,
  selectCartItems,
  selectIsCartOpen,
  selectCartHydrated,
  selectStockLimits,
  selectCartItemCount,
  selectTotalPriceInCents,
  selectHasRecurringItems,
  selectHasOneTimeItems,
  selectCheckoutMode,
  selectHasCartItems,
  formatCartPrice,
  type CartRootState,
  type CartItem,
  type CartItemBillingType,
  type CartItemBillingInterval,
  type CartStockLimit,
} from './cart-slice'

// ============================================================================
// CUSTOM CONTEXT
// ============================================================================

/**
 * Separate React-Redux context for the cart store.
 * This ensures the cart Provider + hooks don't collide with the builder's
 * existing Redux store (which uses the default ReactReduxContext).
 *
 * SOURCE OF TRUTH: CartReduxContext
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CartReduxContext = createContext<ReactReduxContextValue<any> | null>(null)

// ============================================================================
// INTERNAL HOOKS (used only when provider is present)
// ============================================================================

/**
 * Internal dispatch/selector hooks bound to CartReduxContext.
 * These THROW when used outside a Provider — only call them
 * after confirming useCartContext() returns true.
 */
const useCartDispatchInternal = createDispatchHook(CartReduxContext)
const useCartSelectorInternal: <T>(selector: (state: CartRootState) => T) => T =
  createSelectorHook(CartReduxContext) as <T>(selector: (state: CartRootState) => T) => T

// ============================================================================
// CONTEXT CHECK
// ============================================================================

/**
 * Returns true if a CartProvider is present in the component tree.
 * Used internally to guard all hooks — when false, hooks return safe defaults
 * instead of crashing with "could not find react-redux context value".
 */
function useCartContext(): boolean {
  const ctx = useContext(CartReduxContext)
  return ctx !== null
}

// ============================================================================
// PUBLIC TYPED HOOKS
// ============================================================================

/**
 * Typed dispatch hook bound to the cart store.
 * Returns null when called outside a CartProvider.
 */
export function useCartDispatch() {
  const hasProvider = useCartContext()
  if (!hasProvider) return null
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCartDispatchInternal()
}

/**
 * Typed selector hook bound to the cart store.
 * Returns the fallback value when called outside a CartProvider.
 */
export function useCartSelector<T>(selector: (state: CartRootState) => T, fallback?: T): T {
  const hasProvider = useCartContext()
  if (!hasProvider) return fallback as T
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCartSelectorInternal(selector)
}

// ============================================================================
// CONVENIENCE HOOKS — Match the old Zustand API for easy migration
// ============================================================================

/**
 * Returns all cart items from the current website's cart.
 * Returns [] when outside a CartProvider (canvas mode).
 * Replaces: useCartStore((state) => state.items)
 */
export function useCartItems(): CartItem[] {
  return useCartSelector(selectCartItems, [])
}

/**
 * Returns total item count (sum of quantities).
 * Returns 0 when outside a CartProvider.
 * Replaces: useCartItemCount()
 */
export function useCartItemCount(): number {
  return useCartSelector(selectCartItemCount, 0)
}

/**
 * Returns true if cart has at least one item.
 * Returns false when outside a CartProvider.
 * Replaces: useHasCartItems()
 */
export function useHasCartItems(): boolean {
  return useCartSelector(selectHasCartItems, false)
}

/**
 * Returns true once the cart has been hydrated from localStorage.
 * Returns TRUE when outside a CartProvider — there's nothing to hydrate,
 * so components should skip the skeleton and show empty state instead
 * of loading forever.
 * Replaces: useCartHydrated()
 */
export function useCartHydrated(): boolean {
  return useCartSelector(selectCartHydrated, true)
}

/**
 * No-op action dispatchers returned when there's no CartProvider.
 * All functions silently do nothing — prevents crashes in canvas mode
 * while keeping the same API shape.
 */
const NOOP_ACTIONS = {
  addItem: (_item: Omit<CartItem, 'quantity'>) => { /* no-op outside provider */ },
  removeItem: (_id: string) => { /* no-op */ },
  updateQuantity: (_id: string, _quantity: number) => { /* no-op */ },
  clearCart: () => { /* no-op */ },
  openCart: () => { /* no-op */ },
  closeCart: () => { /* no-op */ },
  setStockLimits: (_limits: Record<string, CartStockLimit>) => { /* no-op */ },
  syncItemMetadata: (_stripePriceId: string, _metadata: {
    name?: string
    image?: string | null
    priceInCents?: number
    currency?: string
    billingType?: CartItemBillingType
    billingInterval?: CartItemBillingInterval
    intervalCount?: number
    trialDays?: number
  }) => { /* no-op */ },
  formatPrice: formatCartPrice,
} as const

/**
 * Returns memoized action dispatchers — drop-in replacement for the
 * old Zustand store action selectors.
 *
 * Returns no-op functions when called outside a CartProvider (canvas mode).
 * This prevents crashes while keeping the same API shape for consumers.
 *
 * USAGE:
 *   const { addItem, removeItem, updateQuantity, clearCart } = useCartActions()
 *   addItem({ id, name, ... })
 *   removeItem('item-id')
 *   updateQuantity('item-id', 3)
 *
 * Replaces:
 *   const addItem = useCartStore((s) => s.addItem)
 *   const removeItem = useCartStore((s) => s.removeItem)
 */
export function useCartActions() {
  const dispatch = useCartDispatch()

  return useMemo(() => {
    /** No CartProvider — return safe no-op actions */
    if (!dispatch) return NOOP_ACTIONS

    return {
      /** Add item to cart or increment quantity if exists. Opens cart sheet. */
      addItem: (item: Omit<CartItem, 'quantity'>) =>
        dispatch(cartActions.addItem(item)),

      /** Remove item from cart by ID */
      removeItem: (id: string) =>
        dispatch(cartActions.removeItem(id)),

      /** Update item quantity. Removes if quantity <= 0. */
      updateQuantity: (id: string, quantity: number) =>
        dispatch(cartActions.updateQuantity({ id, quantity })),

      /** Clear all items from cart */
      clearCart: () =>
        dispatch(cartActions.clearCart()),

      /** Open the cart sheet slide-out */
      openCart: () =>
        dispatch(cartActions.openCart()),

      /** Close the cart sheet slide-out */
      closeCart: () =>
        dispatch(cartActions.closeCart()),

      /** Set stock limits map from backend validation */
      setStockLimits: (limits: Record<string, CartStockLimit>) =>
        dispatch(cartActions.setStockLimits(limits)),

      /** Sync fresh metadata onto an existing cart item by stripePriceId */
      syncItemMetadata: (stripePriceId: string, metadata: {
        name?: string
        image?: string | null
        priceInCents?: number
        currency?: string
        billingType?: CartItemBillingType
        billingInterval?: CartItemBillingInterval
        intervalCount?: number
        trialDays?: number
      }) =>
        dispatch(cartActions.syncItemMetadata({ stripePriceId, metadata })),

      /**
       * Format price for display.
       * Note: This is a pure function (not a dispatch), included here
       * for API compatibility with the old Zustand store's formatPrice.
       */
      formatPrice: formatCartPrice,
    }
  }, [dispatch])
}

// ============================================================================
// RE-EXPORTS — so consumers can import everything from cart-hooks
// ============================================================================

export {
  selectCartItems,
  selectIsCartOpen,
  selectCartHydrated,
  selectStockLimits,
  selectCartItemCount,
  selectTotalPriceInCents,
  selectHasRecurringItems,
  selectHasOneTimeItems,
  selectCheckoutMode,
  selectHasCartItems,
  formatCartPrice,
}
