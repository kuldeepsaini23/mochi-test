/**
 * ============================================================================
 * CART SHEET - Shopping Cart Slide-out Panel
 * ============================================================================
 *
 * SOURCE OF TRUTH: Cart Sheet UI, Shopping Cart Display, E-commerce Cart UI
 *
 * A slide-out panel that displays the shopping cart contents.
 * Uses shadcn Sheet component for the slide-out behavior.
 * Delegates cart item rendering, totals, and billing messages to the
 * shared CartSummaryContent component.
 *
 * ============================================================================
 * FEATURES
 * ============================================================================
 *
 * - Shows cart items with image, name, price, quantity (via CartSummaryContent)
 * - Quantity controls (increment/decrement)
 * - Remove item button
 * - Subtotal and total display
 * - Checkout button (navigates to basePath + /checkout)
 * - Empty cart state
 *
 * ============================================================================
 * STATE MANAGEMENT
 * ============================================================================
 *
 * Uses Redux cart store for:
 * - Reading cart items
 * - Updating quantities
 * - Removing items
 * - Tracking open/close state
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCartItems, useCartItemCount, useCartHydrated, useCartSelector, useCartActions, selectIsCartOpen, selectStockLimits, formatCartPrice } from '../../_lib/cart-hooks'
import { resolveNavigationHref } from '../renderers/page-renderer/utils'
import { ShoppingBag } from 'lucide-react'
import { CartSummaryContent } from './cart-summary-content'
import { getThemeStyles } from '../../_lib/cart-theme'

/**
 * Props for the CartSheet component.
 * SOURCE OF TRUTH: CartSheetProps, ShoppingCartSheet
 */
interface CartSheetProps {
  /**
   * Base path for constructing navigation URLs.
   * Uses resolveNavigationHref for context-aware routing:
   * - Custom domains: basePath="" → /checkout
   * - Subdomains: basePath="/domain" → /domain/checkout
   */
  basePath?: string

  /**
   * The actual slug of the website's checkout e-commerce page.
   * Different websites may have different checkout page slugs
   * (e.g., 'checkout', 'checkout-1234567890' if slug collision occurred).
   * Falls back to 'checkout' if not provided.
   *
   * SOURCE OF TRUTH: CheckoutPageSlug, CartCheckoutNavigation
   */
  checkoutSlug?: string | null

  /**
   * Optional navigation callback for preview mode.
   * When provided, the checkout button calls this instead of router.push(),
   * allowing the preview overlay to handle page switching within the builder.
   * Published pages do NOT pass this prop — their navigation is unaffected.
   *
   * SOURCE OF TRUTH: PreviewCartNavigation, PreviewNavigation
   */
  onNavigate?: (slug: string) => void

  /** Theme for styling — defaults to 'dark' for slide-out panels */
  theme?: 'light' | 'dark'
}

/**
 * Cart Sheet component - displays shopping cart in a slide-out panel.
 * Automatically opens when items are added to cart.
 */
export function CartSheet({ basePath, checkoutSlug, onNavigate, theme = 'dark' }: CartSheetProps) {
  const router = useRouter()

  /**
   * Subscribe to cart store state.
   * Billing analysis selectors (hasRecurringItems, hasTrialItems, etc.) are
   * computed internally by CartSummaryContent — no longer needed here.
   */
  const items = useCartItems()
  const isHydrated = useCartHydrated()
  const isOpen = useCartSelector(selectIsCartOpen)
  const { closeCart, updateQuantity, removeItem } = useCartActions()
  /** Stock limits from validation — used to cap + button and show low-stock indicators. */
  const stockLimits = useCartSelector(selectStockLimits)
  const totalItems = useCartItemCount()

  /** Theme-aware color palette for CartSummaryContent inline styles */
  const themeStyles = getThemeStyles(theme)

  /**
   * Handle checkout navigation.
   * Closes cart and navigates to the website's actual checkout page.
   * Uses the checkoutSlug prop to find the correct page — different websites
   * may have different checkout slugs (e.g., 'checkout-1234567890' if collision).
   * Falls back to 'checkout' if no slug provided.
   *
   * PREVIEW MODE: When onNavigate is provided (builder preview), calls it
   * instead of router.push() so the preview overlay can switch pages
   * within the builder without leaving the editor.
   *
   * SOURCE OF TRUTH: CartCheckoutNavigation, CheckoutPageSlug, PreviewCartNavigation
   */
  const handleCheckout = () => {
    closeCart()
    const slug = checkoutSlug || 'checkout'

    /* In preview mode, navigate within the builder instead of doing a real route change */
    if (onNavigate) {
      onNavigate(slug)
      return
    }

    const checkoutUrl = resolveNavigationHref(slug, basePath)
    router.push(checkoutUrl)
  }

  const currency = items[0]?.currency ?? 'USD'

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      {/* z-[10003] ensures cart sheet renders above preview overlay (z-[9999]) */}
      {/**
       * SheetContent uses inline styles for ALL colors to prevent browser
       * light/dark mode from overriding the fixed theme palette.
       * Tailwind theme classes (bg-background, text-foreground, border-border, etc.)
       * flip based on the user's system preference — we need deterministic colors.
       *
       * SOURCE OF TRUTH: CartSheetFixedTheme
       */}
      <SheetContent
        className="flex flex-col w-full sm:max-w-[420px] gap-0 !z-[10003]"
        overlayClassName="!z-[10002]"
        style={{ backgroundColor: themeStyles.cartBg, color: themeStyles.textPrimary, borderColor: themeStyles.containerBorder }}
      >
        {/* Header — compact with item count on the right */}
        <SheetHeader
          className="px-5 pb-4"
          style={{ borderBottom: `1px solid ${themeStyles.containerBorder}` }}
        >
          <SheetTitle
            className="flex items-center gap-2 text-base"
            style={{ color: themeStyles.textPrimary }}
          >
            <ShoppingBag className="h-5 w-5" />
            Shopping Cart
            {totalItems > 0 && (
              <span
                className="ml-auto text-xs font-normal"
                style={{ color: themeStyles.textMuted }}
              >
                {totalItems} {totalItems === 1 ? 'item' : 'items'}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* Scrollable items area — only items scroll, footer is pinned to bottom */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!isHydrated ? (
            /**
             * Skeleton loading state — matches the real cart item layout.
             * Shown while Redux cart store hydrates from localStorage.
             * Prevents the brief "empty cart" flash on page load.
             * Uses inline styles to avoid Tailwind theme flipping.
             */
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex gap-4 p-3 rounded-lg"
                  style={{
                    border: `1px solid ${themeStyles.containerBorder}`,
                    backgroundColor: themeStyles.cartBg,
                  }}
                >
                  {/* Image skeleton */}
                  <div
                    className="h-20 w-20 flex-shrink-0 rounded-md animate-pulse"
                    style={{ backgroundColor: themeStyles.mutedBg }}
                  />
                  {/* Text skeletons */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2 py-1">
                    <div className="h-4 w-3/4 rounded animate-pulse" style={{ backgroundColor: themeStyles.mutedBg }} />
                    <div className="h-3 w-1/2 rounded animate-pulse" style={{ backgroundColor: themeStyles.mutedBg }} />
                    <div className="h-7 w-24 rounded animate-pulse mt-auto" style={{ backgroundColor: themeStyles.mutedBg }} />
                  </div>
                  {/* Price skeleton */}
                  <div className="h-4 w-14 rounded animate-pulse mt-1" style={{ backgroundColor: themeStyles.mutedBg }} />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            /**
             * Empty cart state — only shown after hydration confirms no items.
             */
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <ShoppingBag className="h-16 w-16 mb-4" style={{ color: themeStyles.textMuted, opacity: 0.4 }} />
              <h3 className="font-medium text-lg mb-2" style={{ color: themeStyles.textPrimary }}>Your cart is empty</h3>
              <p className="text-sm" style={{ color: themeStyles.textSecondary }}>
                Add items to your cart to see them here.
              </p>
            </div>
          ) : (
            /**
             * Cart items, totals, billing messages, and checkout button —
             * all rendered by the shared CartSummaryContent component.
             * No heading prop (the Sheet has its own SheetTitle header).
             * No orderBump (cart sheet is pre-checkout).
             *
             * SOURCE OF TRUTH: CartSheetCartSummaryIntegration
             */
            <CartSummaryContent
              renderSection="items"
              items={items}
              currency={currency}
              themeStyles={themeStyles}
              theme={theme}
              stockLimits={stockLimits}
              allowQuantityChange={true}
              showRemoveButton={true}
              showShipping={false}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeItem}
              formatPrice={formatCartPrice}
            />
          )}
        </div>

        {/**
         * Sticky footer — totals and checkout button pinned to bottom of sheet.
         * Separated from the scrollable items area so it remains visible
         * regardless of how many items are in the cart.
         *
         * SOURCE OF TRUTH: CartSheetStickyFooter
         */}
        {isHydrated && items.length > 0 && (
          <div
            className="mt-auto px-5 py-5"
            style={{ borderTop: `1px solid ${themeStyles.containerBorder}` }}
          >
            <CartSummaryContent
              renderSection="footer"
              items={items}
              currency={currency}
              themeStyles={themeStyles}
              theme={theme}
              stockLimits={stockLimits}
              showShipping={false}
              checkoutButton={{
                label: 'Proceed to Checkout',
                onClick: handleCheckout,
              }}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeItem}
              formatPrice={formatCartPrice}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
