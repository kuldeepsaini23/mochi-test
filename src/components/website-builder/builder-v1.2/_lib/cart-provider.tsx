/**
 * ============================================================================
 * CART PROVIDER — Per-Website Redux Store with localStorage Persistence
 * ============================================================================
 *
 * SOURCE OF TRUTH: CartProvider, Per-Website Cart Isolation, Cart Persistence
 *
 * Creates an isolated Redux store for each website, scoped by a unique
 * website identifier (typically the subdomain). This prevents the critical
 * cross-website cart contamination bug where users visiting different
 * websites would see each other's cart items.
 *
 * HOW IT WORKS:
 * 1. On mount, creates a fresh Redux store for the cart slice
 * 2. Hydrates cart items from localStorage using key `mochi-cart-${websiteIdentifier}`
 * 3. Subscribes to store changes and persists items back to localStorage
 * 4. Provides the store via a custom React-Redux context (CartReduxContext)
 *    that doesn't conflict with the builder's main Redux store
 *
 * USAGE:
 *   // In published page layout:
 *   <CartProvider websiteIdentifier={domain}>
 *     <PageContent />
 *     <CartSheet />
 *   </CartProvider>
 *
 *   // In builder preview:
 *   <CartProvider websiteIdentifier={websiteSubdomain}>
 *     <PreviewContent />
 *   </CartProvider>
 *
 * ============================================================================
 */

'use client'

import { useRef, useEffect, type ReactNode } from 'react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { cartSlice, cartActions } from './cart-slice'
import { CartReduxContext } from './cart-hooks'

// ============================================================================
// STORE FACTORY
// ============================================================================

/** Creates a new cart Redux store instance. Each website gets its own. */
function createCartStore() {
  return configureStore({
    reducer: { cart: cartSlice.reducer },
    /**
     * Disable DevTools serialization checks for cart store —
     * cart data is plain serializable objects, but the checks
     * add overhead we don't need for a simple cart.
     */
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })
}

type CartStore = ReturnType<typeof createCartStore>

// ============================================================================
// STORAGE KEY HELPER
// ============================================================================

/**
 * Build the localStorage key for a specific website's cart.
 * Each website gets its own isolated storage slot.
 */
function getStorageKey(websiteIdentifier: string): string {
  return `mochi-cart-${websiteIdentifier}`
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface CartProviderProps {
  /**
   * Unique identifier for the website — used to scope localStorage.
   * On published pages, this is the domain/subdomain from the URL.
   * In builder preview, this is the website's subdomain.
   */
  websiteIdentifier: string
  children: ReactNode
}

/**
 * Wraps children with an isolated, per-website cart Redux store.
 *
 * Creates a new store on mount, hydrates from localStorage, and
 * persists changes back. Uses CartReduxContext to avoid conflicting
 * with the builder's main Redux store.
 */
export function CartProvider({ websiteIdentifier, children }: CartProviderProps) {
  /**
   * Store ref — persists across re-renders but resets when websiteIdentifier changes.
   * We track which websiteIdentifier the store was created for so we can
   * create a new store if the user navigates to a different website.
   */
  const storeRef = useRef<{ store: CartStore; identifier: string } | null>(null)

  if (!storeRef.current || storeRef.current.identifier !== websiteIdentifier) {
    storeRef.current = { store: createCartStore(), identifier: websiteIdentifier }
  }

  const store = storeRef.current.store

  /**
   * Hydrate from localStorage on mount, and subscribe to persist changes.
   *
   * HYDRATION: Reads the per-website storage key and dispatches hydrateCart
   * with the saved items (or empty array if nothing is stored / parse fails).
   *
   * PERSISTENCE: Subscribes to store changes and writes items to localStorage
   * on every state update (only after hydration to avoid overwriting with []).
   */
  useEffect(() => {
    const storageKey = getStorageKey(websiteIdentifier)

    /* --- Hydrate --- */
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        const items = Array.isArray(parsed?.items) ? parsed.items : []
        store.dispatch(cartActions.hydrateCart(items))
      } else {
        store.dispatch(cartActions.hydrateCart([]))
      }
    } catch {
      store.dispatch(cartActions.hydrateCart([]))
    }

    /* --- Persist on changes --- */
    const unsubscribe = store.subscribe(() => {
      const { items, hydrated } = store.getState().cart
      /** Only persist after hydration to avoid overwriting saved data with [] */
      if (hydrated) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ items }))
        } catch {
          /* localStorage full or unavailable — silently fail */
        }
      }
    })

    return unsubscribe
  }, [websiteIdentifier, store])

  return (
    <Provider store={store} context={CartReduxContext}>
      {children}
    </Provider>
  )
}
