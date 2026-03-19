/**
 * ============================================================================
 * CART SUMMARY CONTENT — Shared Cart UI Component
 * ============================================================================
 *
 * SOURCE OF TRUTH: CartSummaryContent, CartSummaryUI, SharedCartDisplay
 *
 * Single source of truth component for rendering cart items, totals, billing
 * messages, order bump, and checkout button. Used by:
 *
 * 1. UnifiedCheckout — the checkout element's right-side cart summary panel
 * 2. CartSheet — the slide-out cart drawer
 *
 * This eliminates duplicated cart UI logic between these two consumers.
 * ALL inline styles match the checkout element's original design exactly.
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import Image from 'next/image'
import { Package, RefreshCw, Minus, Plus, Trash2 } from 'lucide-react'
import type { CartItem, CartStockLimit } from '../../_lib/cart-slice'
import { formatBillingInterval } from '../../_lib/cart-slice'
import type { ThemeStyles } from '../../_lib/cart-theme'
import type { StockLimitEntry } from '../../_lib/use-cart-validation'
import { formatCurrency } from '@/lib/utils'

/**
 * Order bump configuration — only the checkout element uses this section.
 *
 * SOURCE OF TRUTH: CartSummaryOrderBumpConfig
 */
interface OrderBumpConfig {
  /** Whether to show the order bump section */
  show: boolean
  /** Whether the order bump toggle is checked */
  checked: boolean
  /** Callback when the toggle is clicked */
  onToggle: () => void
  /** Product name for the bump */
  productName?: string
  /** Price amount in cents */
  priceAmount?: number
  /** Price currency code */
  priceCurrency?: string
  /** Billing type for the bump product */
  billingType?: 'ONE_TIME' | 'RECURRING'
  /** Billing interval for recurring bump */
  billingInterval?: string
  /** Interval count for recurring bump */
  intervalCount?: number
  /** Free trial days for the bump product */
  trialDays?: number
  /** Custom label for the bump toggle */
  label?: string
  /** Badge text above the bump card */
  badgeText?: string
}

/**
 * Checkout button configuration — only the cart sheet uses this section.
 *
 * SOURCE OF TRUTH: CartSummaryCheckoutButtonConfig
 */
interface CheckoutButtonConfig {
  /** Custom button label — defaults to 'Proceed to Checkout' */
  label?: string
  /** Callback when the checkout button is clicked */
  onClick: () => void
}

/**
 * Props for the CartSummaryContent component.
 *
 * SOURCE OF TRUTH: CartSummaryContentProps
 *
 * Designed to accept data from either checkout or cart sheet consumers,
 * using optional feature flags to toggle sections on/off.
 */
interface CartSummaryContentProps {
  /** Cart items from Redux cart store */
  items: CartItem[]
  /** Currency code for formatting — falls back to first item's currency or 'USD' */
  currency: string
  /** Theme colors for inline styling */
  themeStyles: ThemeStyles
  /** Light or dark theme — needed for order bump box shadow */
  theme: 'light' | 'dark'
  /** Stock limits for quantity capping and low-stock indicators */
  stockLimits: Map<string, StockLimitEntry> | Record<string, CartStockLimit>
  /** Optional heading text — defaults to 'Order Summary'. Pass null/undefined to hide. */
  heading?: string | null
  /** Whether quantity +/- controls are shown — default true */
  allowQuantityChange?: boolean
  /** Whether to show a remove (trash) button per item — default false */
  showRemoveButton?: boolean
  /** Whether to show the shipping row — default true */
  showShipping?: boolean
  /** Max height for items container — number in px or 'none'. Default 'none'. */
  maxItemsHeight?: number | 'none'
  /** Order bump configuration — only checkout uses this */
  orderBump?: OrderBumpConfig
  /** Checkout button — only cart sheet uses this */
  checkoutButton?: CheckoutButtonConfig
  /**
   * Which section to render — enables layout splitting for sticky footer in cart sheet.
   * 'all' (default): renders everything as a single block (used by checkout element).
   * 'items': renders heading + item list only (scrollable section in cart sheet).
   * 'footer': renders totals, billing messages, order bump, and checkout button only (sticky section).
   *
   * SOURCE OF TRUTH: CartSummaryRenderSection
   */
  renderSection?: 'all' | 'items' | 'footer'
  /** Callback when quantity changes — handles both increment and decrement */
  onUpdateQuantity: (itemId: string, quantity: number) => void
  /** Callback to remove an item — only needed when showRemoveButton is true */
  onRemoveItem?: (itemId: string) => void
  /** Price formatting function from the cart store */
  formatPrice: (cents: number, currency: string) => string
}

/**
 * Shared cart summary component — renders cart items, totals, billing messages,
 * order bump, and checkout button with configurable sections.
 *
 * SOURCE OF TRUTH: CartSummaryContent, CartSummaryUI
 *
 * All inline styles are copied exactly from the UnifiedCheckout element
 * to maintain pixel-perfect visual parity.
 */
export function CartSummaryContent({
  items,
  currency,
  themeStyles,
  theme,
  stockLimits,
  heading = 'Order Summary',
  allowQuantityChange = true,
  showRemoveButton = false,
  showShipping = true,
  maxItemsHeight = 'none',
  orderBump,
  checkoutButton,
  onUpdateQuantity,
  onRemoveItem,
  formatPrice,
  renderSection = 'all',
}: CartSummaryContentProps) {
  // ================================================================
  // BILLING ANALYSIS — determines what messages to show
  // SOURCE OF TRUTH: CartBillingAnalysis
  // ================================================================
  const hasRecurringItems = items.some((item) => item.billingType === 'RECURRING')
  const hasOneTimeItems = items.some((item) => item.billingType === 'ONE_TIME')
  const isMixedCart = hasRecurringItems && hasOneTimeItems

  // ================================================================
  // TRIAL ANALYSIS — controls trial-specific messaging
  // SOURCE OF TRUTH: CartTrialAnalysis
  // ================================================================
  const hasTrialItems = items.some((item) => item.trialDays && item.trialDays > 0)
  const allItemsAreTrial =
    items.length > 0 && items.every((item) => item.trialDays && item.trialDays > 0)
  const allSameTrialPeriod = (() => {
    const trialDayValues = items
      .filter((item) => item.trialDays && item.trialDays > 0)
      .map((item) => item.trialDays)
    return new Set(trialDayValues).size <= 1
  })()
  const maxTrialDays = items.reduce(
    (max, item) => Math.max(max, item.trialDays ?? 0),
    0
  )

  // ================================================================
  // PRICE CALCULATIONS — totals and due-today amounts
  // SOURCE OF TRUTH: CartPriceCalculations
  // ================================================================
  const totalPriceInCents = items.reduce(
    (sum, item) => sum + item.priceInCents * item.quantity,
    0
  )
  const nonTrialTotal = items.reduce(
    (sum, item) =>
      item.trialDays && item.trialDays > 0
        ? sum
        : sum + item.priceInCents * item.quantity,
    0
  )

  // Order bump impact on due-today amount
  const bumpHasTrial = orderBump?.trialDays && orderBump.trialDays > 0
  const bumpChargeToday =
    orderBump?.checked && orderBump?.priceAmount && !bumpHasTrial
      ? orderBump.priceAmount
      : 0
  const dueTodayAmount = nonTrialTotal + bumpChargeToday

  /**
   * Stock limits normalization — accepts both Map (from useCartValidation)
   * and Record (from cart store) formats.
   *
   * SOURCE OF TRUTH: CartStockLimitResolver
   */
  const getStockLimit = (
    stripePriceId: string
  ): StockLimitEntry | CartStockLimit | undefined => {
    if (stockLimits instanceof Map) return stockLimits.get(stripePriceId)
    return (stockLimits as Record<string, CartStockLimit>)[stripePriceId]
  }

  /** Controls which sections to render — see renderSection prop docs */
  const showItems = renderSection === 'all' || renderSection === 'items'
  const showFooter = renderSection === 'all' || renderSection === 'footer'

  return (
    <>
      {/* ================================================================
          HEADING — configurable, defaults to 'Order Summary'
          ================================================================ */}
      {showItems && heading !== null && heading !== undefined && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: themeStyles.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 16,
          }}
        >
          {heading}
        </div>
      )}

      {/* ================================================================
          CART ITEMS LIST — product rows with image, name, badges, stepper
          SOURCE OF TRUTH: CartItemsList
          ================================================================ */}
      {showItems && <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          maxHeight: maxItemsHeight === 'none' ? 'none' : maxItemsHeight,
          overflowY: maxItemsHeight === 'none' ? 'visible' : 'auto',
        }}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 0',
              borderBottom:
                index < items.length - 1
                  ? `1px solid ${themeStyles.containerBorder}`
                  : 'none',
            }}
          >
            {/* Product Image — 48x48 with Package fallback */}
            <div
              style={{
                width: 48,
                height: 48,
                backgroundColor: themeStyles.mutedBg,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  style={{ objectFit: 'cover' }}
                  sizes="48px"
                />
              ) : (
                <Package
                  style={{ width: 20, height: 20, color: themeStyles.textMuted }}
                />
              )}
            </div>

            {/* Product Details — name, badges, quantity stepper */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Name + Low Stock Badge Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: themeStyles.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.3,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {item.name}
                </div>
                {/* Low stock indicator — shown when tracked inventory is at or below threshold */}
                {getStockLimit(item.stripePriceId)?.lowStock && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#dc2626',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    *Low stock
                  </span>
                )}
              </div>

              {/* Billing Type Badge — shown for subscription items */}
              {item.billingType === 'RECURRING' && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                    padding: '2px 6px',
                    backgroundColor: `${themeStyles.textPrimary}10`,
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 500,
                    color: themeStyles.textSecondary,
                  }}
                >
                  <RefreshCw style={{ width: 10, height: 10 }} />
                  Subscription
                  {formatBillingInterval(item.billingInterval, item.intervalCount)}
                </div>
              )}

              {/* Trial badge — shown when cart item has a free trial */}
              {item.trialDays && item.trialDays > 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                    padding: '2px 6px',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#10b981',
                  }}
                >
                  {item.trialDays}-day free trial
                </div>
              )}

              {/* Quantity Stepper — capped by available stock from validation */}
              {allowQuantityChange &&
                (() => {
                  /**
                   * Determine if the + button should be disabled.
                   * stockLimit.maxQuantity is null when inventory is NOT tracked (unlimited).
                   * When tracked, disable + if current quantity >= available stock.
                   *
                   * SOURCE OF TRUTH: QuantityStepperStockCap
                   */
                  const stockLimit = getStockLimit(item.stripePriceId)
                  const atMaxStock =
                    stockLimit?.maxQuantity !== null &&
                    stockLimit?.maxQuantity !== undefined &&
                    item.quantity >= stockLimit.maxQuantity

                  return (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginTop: 6,
                        gap: showRemoveButton ? 8 : 0,
                      }}
                    >
                      {/* +/- stepper */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          border: `1px solid ${themeStyles.containerBorder}`,
                          borderRadius: 4,
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQuantity(item.id, item.quantity - 1)
                          }
                          style={{
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: themeStyles.textSecondary,
                          }}
                        >
                          <Minus style={{ width: 12, height: 12 }} />
                        </button>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: themeStyles.textPrimary,
                            padding: '0 8px',
                            borderLeft: `1px solid ${themeStyles.containerBorder}`,
                            borderRight: `1px solid ${themeStyles.containerBorder}`,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={atMaxStock}
                          onClick={() => {
                            if (!atMaxStock) {
                              onUpdateQuantity(item.id, item.quantity + 1)
                            }
                          }}
                          style={{
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: atMaxStock ? 'not-allowed' : 'pointer',
                            color: atMaxStock
                              ? `${themeStyles.textSecondary}50`
                              : themeStyles.textSecondary,
                            opacity: atMaxStock ? 0.4 : 1,
                          }}
                          title={
                            atMaxStock
                              ? `Only ${stockLimit?.maxQuantity} available`
                              : undefined
                          }
                        >
                          <Plus style={{ width: 12, height: 12 }} />
                        </button>
                      </div>

                      {/* Remove button — shown when showRemoveButton is true (cart sheet) */}
                      {showRemoveButton && onRemoveItem && (
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          style={{
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: themeStyles.textMuted,
                            transition: 'color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#dc2626'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = themeStyles.textMuted
                          }}
                          title="Remove item"
                        >
                          <Trash2 style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                    </div>
                  )
                })()}
            </div>

            {/* Price — with recurring interval suffix for subscriptions */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: themeStyles.textPrimary,
                whiteSpace: 'nowrap',
                textAlign: 'right',
              }}
            >
              {formatPrice(item.priceInCents * item.quantity, item.currency)}
              {item.billingType === 'RECURRING' && (
                <span
                  style={{
                    fontWeight: 400,
                    color: themeStyles.textSecondary,
                  }}
                >
                  {formatBillingInterval(item.billingInterval, item.intervalCount)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>}

      {/* ================================================================
          TOTALS SECTION — subtotal, shipping, total/due-today
          SOURCE OF TRUTH: CartTotalsSection
          ================================================================ */}
      {showFooter && <div
        style={{
          marginTop: showItems ? 16 : 0,
          paddingTop: showItems ? 16 : 0,
          borderTop: showItems ? `1px solid ${themeStyles.containerBorder}` : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Subtotal row */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, color: themeStyles.textSecondary }}>
            Subtotal
          </span>
          <span style={{ fontSize: 14, color: themeStyles.textPrimary }}>
            {formatPrice(totalPriceInCents, currency)}
          </span>
        </div>

        {/* Shipping row — hidden when showShipping is false */}
        {showShipping && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: themeStyles.textSecondary }}>
              Shipping
            </span>
            <span style={{ fontSize: 14, color: themeStyles.textSecondary }}>
              Free
            </span>
          </div>
        )}

        {/* Total / Due Today row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 12,
            marginTop: 4,
            borderTop: `1px solid ${themeStyles.containerBorder}`,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: themeStyles.textPrimary,
            }}
          >
            {hasTrialItems || hasRecurringItems ? 'Due Today' : 'Total'}
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: themeStyles.textPrimary,
            }}
          >
            {formatPrice(dueTodayAmount, currency)}
          </span>
        </div>

        {/* ================================================================
            BILLING & TRIAL EXPLANATION MESSAGES — trial-aware.
            SOURCE OF TRUTH: CheckoutBillingMessages, TrialAwareBillingInfo

            PRIORITY ORDER (mutually exclusive branches):
            1. ALL items are trial -> nothing charged today, show trial message only
            2. SOME items are trial -> explain which are charged today vs deferred
            3. NO trials -> standard mixed/subscription/one-time messages

            SECURITY: Messages MUST accurately reflect what Stripe charges.
            ================================================================ */}
        {(() => {
          /**
           * CASE 1: ALL items have free trials — $0 due today.
           * No "charged together" message — nothing is charged.
           * Show trial-specific messaging based on period uniformity.
           */
          if (allItemsAreTrial) {
            return (
              <p
                style={{
                  fontSize: 12,
                  color: '#10b981',
                  margin: 0,
                  marginTop: 4,
                  fontWeight: 500,
                }}
              >
                {allSameTrialPeriod
                  ? `${maxTrialDays}-day free trial — you won't be charged until the trial ends.`
                  : 'Each item has its own trial period. Your card will be saved and billing begins when each trial ends.'}
              </p>
            )
          }

          /**
           * CASE 2: SOME items have trials, others don't — partial charge today.
           * Explain that non-trial items are charged now, trial items are deferred.
           */
          if (hasTrialItems) {
            return (
              <>
                <p
                  style={{
                    fontSize: 12,
                    color: themeStyles.textMuted,
                    margin: 0,
                    marginTop: 4,
                  }}
                >
                  Non-trial items are charged today.
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: '#10b981',
                    margin: 0,
                    marginTop: 4,
                    fontWeight: 500,
                  }}
                >
                  Trial items start billing when their trial ends.
                </p>
              </>
            )
          }

          /**
           * CASE 3: NO trials — standard billing messages.
           */
          return (
            <>
              {isMixedCart && (
                <p
                  style={{
                    fontSize: 12,
                    color: themeStyles.textMuted,
                    margin: 0,
                    marginTop: 4,
                  }}
                >
                  One-time items and first subscription payment charged together.
                </p>
              )}
              {hasRecurringItems && !hasOneTimeItems && (
                <p
                  style={{
                    fontSize: 12,
                    color: themeStyles.textMuted,
                    margin: 0,
                    marginTop: 4,
                  }}
                >
                  You&apos;ll be charged recurring based on each
                  subscription&apos;s billing cycle.
                </p>
              )}
            </>
          )
        })()}
      </div>}

      {/* ================================================================
          ORDER BUMP — shown inside the cart summary when configured.
          SOURCE OF TRUTH: CheckoutOrderBumpUI
          Uses the same card design as the payment element's order bump.
          Only the checkout element passes this prop.
          ================================================================ */}
      {showFooter && orderBump?.show && (
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px',
            paddingTop: '20px',
            marginTop: '16px',
            borderRadius: '10px',
            border: `1.5px solid ${themeStyles.buttonBg}`,
            backgroundColor: `${themeStyles.buttonBg}0a`,
            boxShadow: `0 1px 3px rgba(0,0,0,${theme === 'dark' ? '0.2' : '0.06'})`,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onClick={() => orderBump.onToggle()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              orderBump.onToggle()
            }
          }}
        >
          {/* Badge pill — solid accent color, white text */}
          <div
            style={{
              position: 'absolute',
              top: '-11px',
              right: '14px',
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: themeStyles.buttonBg,
              fontSize: '11px',
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.3px',
              boxShadow: `0 2px 6px ${themeStyles.buttonBg}40`,
            }}
          >
            {orderBump.badgeText || 'Recommended'}
          </div>

          {/* Toggle switch — animated knob */}
          <div
            style={{
              width: '36px',
              height: '20px',
              minWidth: '36px',
              borderRadius: '10px',
              backgroundColor: orderBump.checked
                ? themeStyles.buttonBg
                : themeStyles.inputBorder,
              position: 'relative',
              transition: 'background-color 0.2s ease',
              marginTop: '2px',
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: '#fff',
                position: 'absolute',
                top: '2px',
                left: orderBump.checked ? '18px' : '2px',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
              }}
            />
          </div>

          {/* Bump label and description */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flex: 1,
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: themeStyles.textPrimary,
                lineHeight: '20px',
              }}
            >
              {orderBump.label ||
                `Add ${orderBump.productName ?? 'product'} for ${formatCurrency(
                  orderBump.priceAmount ?? 0,
                  orderBump.priceCurrency ?? 'usd'
                )}`}
            </span>
            <span
              style={{
                fontSize: '13px',
                color: themeStyles.textSecondary,
                lineHeight: '18px',
              }}
            >
              {orderBump.trialDays && orderBump.trialDays > 0
                ? `${orderBump.trialDays}-day free trial, then `
                : ''}
              {orderBump.billingType === 'RECURRING' && orderBump.billingInterval
                ? `Subscription add-on — per ${
                    orderBump.intervalCount && orderBump.intervalCount > 1
                      ? `${orderBump.intervalCount} ${orderBump.billingInterval.toLowerCase()}s`
                      : orderBump.billingInterval.toLowerCase()
                  }`
                : 'One-time add-on'}
            </span>
          </div>
        </div>
      )}

      {/* ================================================================
          CHECKOUT BUTTON — only shown in the cart sheet consumer.
          Full-width button with accent background color.
          SOURCE OF TRUTH: CartSummaryCheckoutButton
          ================================================================ */}
      {showFooter && checkoutButton && (
        <button
          type="button"
          onClick={checkoutButton.onClick}
          style={{
            width: '100%',
            height: 48,
            marginTop: 16,
            backgroundColor: theme === 'dark' ? '#ffffff' : '#1d1d1f',
            color: theme === 'dark' ? '#1d1d1f' : '#ffffff',
            border: 'none',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            cursor: 'pointer',
            transition: 'opacity 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          {checkoutButton.label || 'Proceed to Checkout'}
        </button>
      )}
    </>
  )
}
