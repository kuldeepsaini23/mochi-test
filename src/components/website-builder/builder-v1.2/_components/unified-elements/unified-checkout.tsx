/**
 * ============================================================================
 * UNIFIED CHECKOUT ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedCheckout, unified-checkout, checkout-element-unified
 *
 * This component replaces BOTH:
 *   - elements/checkout-element.tsx (canvas editor mock preview)
 *   - renderers/element-renderers/checkout-renderer.tsx (preview/published real checkout)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * In canvas mode, the component renders CONTENT ONLY:
 *   - A mock checkout preview with sample cart items, contact form fields,
 *     and a payment section placeholder. The parent `ElementWrapper` handles
 *     all editor chrome (selection ring, hover ring, resize handles, labels).
 *
 * In preview mode, the component renders a FULLY FUNCTIONAL checkout:
 *   - Reads from Redux cart store for real cart items
 *   - Quantity adjustments and item removal
 *   - Native Stripe Payment Element integration
 *   - Contact info form with validation
 *   - Success/failure states with optional redirect
 *   - Test mode support (Stripe test keys)
 *   - Skeleton loading while cart hydrates
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * CANVAS MODE (mode='canvas'):
 *   - Static mock UI showing checkout layout with sample data
 *   - No Redux cart store, no Stripe, no form validation
 *   - Theme-aware styling (light/dark)
 *   - Test mode badge if enabled
 *
 * PREVIEW MODE (mode='preview'):
 *   - Full Stripe checkout flow with Payment Element
 *   - Real cart items from Redux store
 *   - Contact form with zod validation
 *   - Payment intent creation via tRPC
 *   - Success/error states
 *   - Post-payment redirect support
 *   - Responsive layout (two-column desktop, stacked mobile)
 *   - Empty cart state
 *   - Skeleton loading states
 *
 * ============================================================================
 */

'use client'

import React, { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { type Appearance, type StripeElementsOptions, type StripePaymentElementChangeEvent } from '@stripe/stripe-js'
import { getStripePromise } from '@/lib/stripe/get-stripe-promise'
import { checkoutSchema, type CheckoutFormData } from '@/lib/stripe/checkout-schema'
import type { Breakpoint, CheckoutElement, BorderConfig } from '../../_lib/types'
import { borderConfigToInlineStyles } from '../../_lib/border-utils'
import { getPropertyValue } from '../../_lib'
import {
  computeElementPositionStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'
import { resolveNavigationHref } from '../renderers/page-renderer/utils'
import {
  useCartItems,
  useCartHydrated,
  useCartActions,
  useCartSelector,
  selectTotalPriceInCents,
  formatCartPrice,
} from '../../_lib/cart-hooks'
import { useCartValidation } from '../../_lib/use-cart-validation'
import { type ThemeStyles, getThemeStyles } from '../../_lib/cart-theme'
import { useBuilderContextSafe } from '../../_lib/builder-context'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import {
  Package,
  Loader2,
  ShoppingCart,
  Minus,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  FlaskConical,
  CreditCard,
} from 'lucide-react'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import type { PublicReceiptData } from '@/types/receipt'
import { CartSummaryContent } from '../ecommerce/cart-summary-content'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedCheckout component.
 *
 * SOURCE OF TRUTH: UnifiedCheckoutProps
 *
 * In canvas mode, this component is rendered INSIDE an ElementWrapper which
 * provides all editor chrome. Only the element data is needed.
 * In preview mode, the component handles its own positioned wrapper.
 */
interface UnifiedCheckoutProps {
  /** The checkout element data -- SOURCE OF TRUTH: CheckoutElement from types.ts */
  element: CheckoutElement
}

// CheckoutFormData and checkoutSchema imported from @/lib/stripe/checkout-schema

// ============================================================================
// THEME STYLES - Imported from shared utility
// SOURCE OF TRUTH: CartThemeStyles in cart-theme.ts
// ============================================================================
// ThemeStyles and getThemeStyles imported from '../../_lib/cart-theme'

// ============================================================================
// MOCK DATA - Sample cart items for canvas visualization
// SOURCE OF TRUTH: UnifiedCheckoutMockCartItems
// ============================================================================

/**
 * Billing types used in mock cart items.
 * Matches the real cart store billing types.
 */
type MockBillingType = 'ONE_TIME' | 'RECURRING'

/** Billing intervals for subscription items. */
type MockBillingInterval = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

/** Mock cart item structure for the canvas preview. */
interface MockCartItem {
  name: string
  price: number
  quantity: number
  billingType: MockBillingType
  billingInterval?: MockBillingInterval
  intervalCount?: number
}

/** Sample cart items demonstrating both one-time and subscription products. */
const MOCK_CART_ITEMS: MockCartItem[] = [
  { name: 'Premium Subscription', price: 4999, quantity: 1, billingType: 'RECURRING', billingInterval: 'MONTH', intervalCount: 1 },
  { name: 'Standard Item', price: 2999, quantity: 2, billingType: 'ONE_TIME' },
]

/**
 * Formats a billing interval for display (e.g., "/month", "/year").
 * Only used in the canvas mock since the real formatBillingInterval
 * comes from the cart store in preview mode.
 */
function formatMockBillingInterval(interval?: MockBillingInterval, count?: number): string {
  if (!interval) return ''
  const countPrefix = count && count > 1 ? `/${count} ` : '/'
  switch (interval) {
    case 'DAY':
      return count && count > 1 ? `${countPrefix}days` : '/day'
    case 'WEEK':
      return count && count > 1 ? `${countPrefix}weeks` : '/week'
    case 'MONTH':
      return count && count > 1 ? `${countPrefix}months` : '/mo'
    case 'YEAR':
      return count && count > 1 ? `${countPrefix}years` : '/yr'
    default:
      return ''
  }
}

// getStripePromise imported from @/lib/stripe/get-stripe-promise

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified checkout element that renders in both canvas and preview modes.
 *
 * CANVAS: Renders a static mock checkout preview with sample data.
 * PREVIEW: Renders a fully functional Stripe checkout with real cart items.
 *
 * In canvas mode, the parent ElementWrapper handles all editor chrome.
 * In preview mode, the component wraps itself with positioned layout.
 */
export function UnifiedCheckout({ element }: UnifiedCheckoutProps) {
  const { mode, breakpoint, organizationId, isBreakpointFrame } = useRenderMode()
  const isPreview = mode === 'preview'

  /**
   * Determine the active breakpoint for responsive style resolution.
   * Canvas mode always uses 'desktop' because the builder handles breakpoint
   * switching at a higher level. Preview mode uses the context breakpoint.
   */
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  /** Get theme config from element, default to dark. */
  const theme = element.theme ?? 'dark'
  const themeStyles = getThemeStyles(theme)

  // ==========================================================================
  // CANVAS MODE -- Render mock checkout preview (ElementWrapper handles chrome)
  // Also used for BreakpointMobileFrame — it's a design reference view, not a
  // functional checkout. Show mock cart data so designers see realistic content.
  // ==========================================================================

  if (!isPreview || isBreakpointFrame) {
    return <CheckoutCanvasContent element={element} theme={theme} themeStyles={themeStyles} />
  }

  // ==========================================================================
  // PREVIEW MODE -- Full functional checkout with positioning
  // ==========================================================================

  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)

  /**
   * For checkout, we use custom sizing because checkout uses maxWidth
   * instead of fixed width, and always uses autoHeight.
   */
  const isMobile = activeBreakpoint === 'mobile'
  const autoWidth = !isRoot && (getPropertyValue<boolean>(element, 'autoWidth', activeBreakpoint, element.autoWidth ?? false) ?? false)
  const autoHeight = getPropertyValue<boolean>(element, 'autoHeight', activeBreakpoint, element.autoHeight ?? true) ?? true
  const width = getPropertyValue<number>(element, 'width', activeBreakpoint, element.width)
  const height = getPropertyValue<number>(element, 'height', activeBreakpoint, element.height)
  const CHECKOUT_MAX_WIDTH = 800

  const wrapperStyle: React.CSSProperties = {
    ...positionStyles,
    width: isMobile || autoWidth ? '100%' : width,
    maxWidth: autoWidth ? CHECKOUT_MAX_WIDTH : '100%',
    minWidth: 0,
    height: autoHeight ? 'auto' : height,
    minHeight: autoHeight ? 'fit-content' : undefined,
  }

  return (
    <div
      data-checkout-renderer
      data-element-id={element.id}
      style={wrapperStyle}
    >
      <CheckoutPreviewContent
        element={element}
        organizationId={organizationId}
        theme={theme}
        themeStyles={themeStyles}
        breakpoint={activeBreakpoint}
        isMobile={isMobile}
      />
    </div>
  )
}

// ============================================================================
// CANVAS CONTENT -- Static mock checkout preview
// ============================================================================

/**
 * Renders the checkout mock UI for the canvas editor.
 * Shows sample cart items, contact form placeholders, and payment section.
 * No real functionality -- purely visual preview of the checkout layout.
 */
function CheckoutCanvasContent({
  element,
  theme,
  themeStyles,
}: {
  element: CheckoutElement
  theme: 'light' | 'dark'
  themeStyles: ThemeStyles
}) {
  /** Calculate mock total from sample items. */
  const mockSubtotal = MOCK_CART_ITEMS.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  /**
   * Read border config from element styles for editable border support.
   * Falls back to the original hardcoded border if not configured (legacy elements).
   *
   * SOURCE OF TRUTH: CheckoutCanvasBorderConfig
   */
  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const borderStyles = borderConfig
    ? borderConfigToInlineStyles(borderConfig)
    : { border: `1px solid ${themeStyles.containerBorder}` }

  /**
   * Content container styles for the two-panel checkout layout.
   * Uses flex-wrap to automatically stack panels on narrow widths.
   */
  const contentStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    minHeight: 'fit-content',
    backgroundColor: themeStyles.containerBg,
    borderRadius: 8,
    ...borderStyles,
    overflow: 'visible',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
  }

  return (
    <>
      {/* Test Mode Badge -- sits above the form container */}
      {element.testMode && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            marginBottom: 6,
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            color: '#f59e0b',
          }}
        >
          <FlaskConical className="w-3 h-3" />
          <span>Test Mode</span>
        </div>
      )}

      {/* Checkout Content Container -- two-panel layout */}
      <div style={contentStyle}>
        {/* Payment Section (Left Side) -- mock form fields */}
        <div
          style={{
            flex: '1 1 300px',
            minWidth: 0,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {/* Contact Section -- mock inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h4 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: themeStyles.textPrimary }}>
              Contact
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: themeStyles.textPrimary }}>
                  First Name
                </label>
                <div
                  style={{
                    height: 40,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    backgroundColor: themeStyles.inputBg,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: themeStyles.textMuted, fontSize: 14 }}>John</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: themeStyles.textPrimary }}>
                  Last Name
                </label>
                <div
                  style={{
                    height: 40,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    backgroundColor: themeStyles.inputBg,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: themeStyles.textMuted, fontSize: 14 }}>Doe</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: themeStyles.textPrimary }}>
                Email
              </label>
              <div
                style={{
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 6,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  backgroundColor: themeStyles.inputBg,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: themeStyles.textMuted, fontSize: 14 }}>john@example.com</span>
              </div>
            </div>
          </div>

          {/* Payment Section -- Stripe placeholder */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h4 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: themeStyles.textPrimary }}>
              Payment
            </h4>
            <div
              style={{
                padding: 16,
                borderRadius: 6,
                border: `1px solid ${themeStyles.inputBorder}`,
                backgroundColor: themeStyles.mutedBg,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CreditCard style={{ width: 20, height: 20, color: themeStyles.textMuted }} />
                <span style={{ fontSize: 14, color: themeStyles.textMuted }}>
                  Card details will appear here
                </span>
              </div>
            </div>
          </div>

          {/* Submit Button — uses theme button colors to match payment element */}
          <button
            type="button"
            disabled
            style={{
              width: '100%',
              height: 44,
              borderRadius: 6,
              border: 'none',
              fontWeight: 500,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: themeStyles.buttonBg,
              color: themeStyles.buttonText,
              opacity: 0.9,
              cursor: 'not-allowed',
            }}
          >
            Pay {formatCurrency(mockSubtotal)}
          </button>

          {/* Security Note */}
          <p style={{ margin: 0, fontSize: 12, textAlign: 'center', color: themeStyles.textMuted }}>
            Your payment is secured by Stripe. We never store your payment details.
          </p>
        </div>

        {/* Cart Section (Right Side) -- mock order summary */}
        <div
          style={{
            flex: '1 1 300px',
            minWidth: 0,
            padding: 24,
            backgroundColor: themeStyles.cartBg,
            borderLeft: `1px solid ${themeStyles.containerBorder}`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
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
            {element.cartHeading ?? 'Order Summary'}
          </div>

          {/* Cart Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {MOCK_CART_ITEMS.map((item, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: index < MOCK_CART_ITEMS.length - 1 ? `1px solid ${themeStyles.containerBorder}` : 'none',
                }}
              >
                {/* Product Image placeholder */}
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
                  }}
                >
                  <Package style={{ width: 20, height: 20, color: themeStyles.textMuted }} />
                </div>

                {/* Product Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Name and Subscription Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: themeStyles.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.3,
                      }}
                    >
                      {item.name}
                    </div>
                    {/* Subscription badge */}
                    {item.billingType === 'RECURRING' && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 10,
                          fontWeight: 500,
                          padding: '2px 6px',
                          borderRadius: 4,
                          backgroundColor: theme === 'dark' ? 'rgba(250, 250, 250, 0.1)' : 'rgba(23, 23, 23, 0.08)',
                          color: themeStyles.textSecondary,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        <RefreshCw style={{ width: 10, height: 10 }} />
                        Subscription
                      </span>
                    )}
                  </div>
                  {/* Quantity Stepper -- static in canvas */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginTop: 6,
                      border: `1px solid ${themeStyles.containerBorder}`,
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: themeStyles.textSecondary,
                      }}
                    >
                      <Minus style={{ width: 12, height: 12 }} />
                    </div>
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
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: themeStyles.textSecondary,
                      }}
                    >
                      <Plus style={{ width: 12, height: 12 }} />
                    </div>
                  </div>
                </div>

                {/* Price with billing interval suffix for subscriptions */}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: themeStyles.textPrimary,
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 2,
                  }}
                >
                  <span>{formatCurrency(item.price * item.quantity)}</span>
                  {item.billingType === 'RECURRING' && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 400,
                        color: themeStyles.textSecondary,
                      }}
                    >
                      {formatMockBillingInterval(item.billingInterval, item.intervalCount)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: `1px solid ${themeStyles.containerBorder}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: themeStyles.textSecondary }}>Subtotal</span>
              <span style={{ fontSize: 14, color: themeStyles.textPrimary }}>
                {formatCurrency(mockSubtotal)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: themeStyles.textSecondary }}>Shipping</span>
              <span style={{ fontSize: 14, color: themeStyles.textSecondary }}>Free</span>
            </div>
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
              <span style={{ fontSize: 14, fontWeight: 500, color: themeStyles.textPrimary }}>
                Total
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: themeStyles.textPrimary }}>
                {formatCurrency(mockSubtotal)}
              </span>
            </div>
            {/* Mixed cart billing info */}
            <p
              style={{
                margin: 0,
                marginTop: 12,
                fontSize: 12,
                color: themeStyles.textMuted,
                lineHeight: 1.4,
              }}
            >
              One-time items and first subscription payment will be charged together.
            </p>

            {/* Mock Order Bump — static preview in canvas mode */}
            {element.orderBumpEnabled && element.orderBumpPriceAmount && element.orderBumpPriceAmount > 0 && (
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
                }}
              >
                {/* Badge */}
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
                  {element.orderBumpBadgeText || 'Recommended'}
                </div>

                {/* Static toggle — off state */}
                <div
                  style={{
                    width: '36px',
                    height: '20px',
                    minWidth: '36px',
                    borderRadius: '10px',
                    backgroundColor: themeStyles.inputBorder,
                    position: 'relative',
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
                      left: '2px',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
                    }}
                  />
                </div>

                {/* Label and subtitle */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: themeStyles.textPrimary, lineHeight: '20px' }}>
                    {element.orderBumpLabel ||
                      `Add ${element.orderBumpProductName ?? 'product'} for ${formatCurrency(
                        element.orderBumpPriceAmount,
                        element.orderBumpPriceCurrency ?? 'usd'
                      )}`}
                  </span>
                  <span style={{ fontSize: '13px', color: themeStyles.textSecondary, lineHeight: '18px' }}>
                    {element.orderBumpBillingType === 'RECURRING' && element.orderBumpBillingInterval
                      ? `Subscription add-on — per ${element.orderBumpBillingInterval.toLowerCase()}`
                      : 'One-time add-on'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// PREVIEW CONTENT -- Full functional checkout with Stripe integration
// ============================================================================

/**
 * Props for the preview content sub-component.
 * Contains all the data needed for the functional checkout.
 */
interface CheckoutPreviewContentProps {
  element: CheckoutElement
  organizationId?: string
  theme: 'light' | 'dark'
  themeStyles: ThemeStyles
  breakpoint: Breakpoint
  isMobile: boolean
}

/**
 * Renders the checkout element in preview/published mode.
 * Displays payment form on left, cart items on right.
 * Uses native Stripe Payment Element for on-site checkout.
 */
function CheckoutPreviewContent({
  element,
  organizationId: propOrgId,
  theme,
  themeStyles,
  breakpoint,
  isMobile,
}: CheckoutPreviewContentProps) {
  /**
   * Try to get organizationId from BuilderContext if not passed via RenderModeContext.
   */
  const builderContext = useBuilderContextSafe()
  const effectiveOrgId = propOrgId || builderContext?.organizationId

  /**
   * Redux cart store subscriptions.
   * useCartItems/useCartHydrated/useCartActions are typed Redux hooks.
   * formatCartPrice is a pure function (no hook needed).
   */
  const items = useCartItems()
  const isHydrated = useCartHydrated()
  const { updateQuantity } = useCartActions()

  /**
   * Validate cart items against the backend on mount.
   * Auto-removes deleted products/prices and reports stock warnings.
   *
   * SOURCE OF TRUTH: CheckoutCartValidation
   */
  const { validationMessage, stockReducedMessage, stockWarnings, stockLimits } = useCartValidation(effectiveOrgId, items)

  /** Compute total from Redux cart state via memoized selector. */
  const totalPriceInCents = useCartSelector(selectTotalPriceInCents)

  /**
   * Trial analysis — distinguish between ALL-trial carts and mixed carts.
   *
   * SOURCE OF TRUTH: CartTrialAnalysis, RecurringOnlyTrialGuard
   *
   * CRITICAL: Trials are ONLY valid for RECURRING billing type.
   * Stripe does not natively support trials on one-time purchases.
   * ONE_TIME items with trialDays set in the DB are ignored here.
   *
   * - allItemsAreTrial: EVERY item is RECURRING with a trial — nothing charged today.
   * - hasTrialItems: AT LEAST one RECURRING item has a trial (informational display).
   * - nonTrialTotal: The amount actually due today (sum of non-trial items only).
   */
  const hasTrialItems = items.some(
    (item) => item.billingType === 'RECURRING' && item.trialDays && item.trialDays > 0
  )
  const allItemsAreTrial = items.length > 0 && items.every(
    (item) => item.billingType === 'RECURRING' && item.trialDays && item.trialDays > 0
  )

  /** Max trial days across RECURRING trial items — used for informational text only. */
  const maxTrialDays = items.reduce(
    (max, item) =>
      item.billingType === 'RECURRING' && item.trialDays ? Math.max(max, item.trialDays) : max,
    0
  )

  /**
   * Whether all RECURRING trial items share the same trial period.
   *
   * SOURCE OF TRUTH: CartTrialPeriodUniformity, RecurringOnlyTrialGuard
   *
   * When true → we can confidently say "X-day free trial" in one message.
   * When false → items have different trial periods (e.g., 7 and 14 days),
   * so we show per-item trial badges and a generic "free trial" message.
   */
  const allSameTrialPeriod = (() => {
    const trialDayValues = items
      .filter((item) => item.billingType === 'RECURRING' && item.trialDays && item.trialDays > 0)
      .map((item) => item.trialDays)
    return new Set(trialDayValues).size <= 1
  })()

  /**
   * Sum of non-trial items — this is what actually gets charged today.
   * Only RECURRING items with trialDays are considered trial ($0 upfront).
   * ONE_TIME items are always charged regardless of trialDays.
   */
  const nonTrialTotal = items.reduce(
    (sum, item) =>
      item.billingType === 'RECURRING' && item.trialDays && item.trialDays > 0
        ? sum
        : sum + item.priceInCents * item.quantity,
    0
  )

  /** Order bump state — tracks whether the customer has toggled the bump on */
  const [orderBumpChecked, setOrderBumpChecked] = useState(false)

  /**
   * "Due Today" amount — what the customer is ACTUALLY charged right now.
   *
   * SOURCE OF TRUTH: CheckoutDueTodayAmount
   *
   * Starts with nonTrialTotal (only non-trial cart items).
   * Adds order bump ONLY if bump is checked AND bump is NOT a trial.
   * If all items are trials (including bump), this will be 0.
   */
  const bumpHasTrial = element.orderBumpTrialDays && element.orderBumpTrialDays > 0
  const bumpChargeToday = orderBumpChecked && element.orderBumpPriceAmount && !bumpHasTrial
    ? element.orderBumpPriceAmount
    : 0
  const dueTodayAmount = nonTrialTotal + bumpChargeToday

  /**
   * Display total for the button — includes ALL items (trial + non-trial + bump).
   * This shows the full value of the order, not just what's charged today.
   * The "Due Today" row separately shows what's actually charged.
   */
  const displayTotal = totalPriceInCents
    + (orderBumpChecked && element.orderBumpPriceAmount ? element.orderBumpPriceAmount : 0)

  /** Determine if the order bump should be shown based on element configuration */
  const showOrderBump = Boolean(
    element.orderBumpEnabled &&
      element.orderBumpProductId &&
      element.orderBumpPriceId &&
      element.orderBumpPriceAmount &&
      element.orderBumpPriceAmount > 0
  )

  /** Checkout autoHeight -- always true by default to prevent content cutoff. */
  const autoHeight = getPropertyValue<boolean>(element, 'autoHeight', breakpoint, element.autoHeight ?? true) ?? true

  /** Get currency from first cart item, default to USD. */
  const currency = items[0]?.currency ?? 'USD'

  /**
   * Read border config from element styles for editable border support.
   * Falls back to the original hardcoded border if not configured (legacy elements).
   *
   * SOURCE OF TRUTH: CheckoutPreviewBorderConfig
   */
  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const borderStyles = borderConfig
    ? borderConfigToInlineStyles(borderConfig)
    : { border: `1px solid ${themeStyles.containerBorder}` }

  /**
   * Content container styles -- theme-aware with responsive layout.
   * Desktop: two-column (payment left, cart right)
   * Mobile: single-column stacked (cart top, payment bottom)
   */
  const contentStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    minHeight: autoHeight ? 'fit-content' : '100%',
    backgroundColor: themeStyles.containerBg,
    borderRadius: 8,
    ...borderStyles,
    overflow: autoHeight ? 'visible' : 'auto',
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    flexWrap: 'wrap',
  }

  /**
   * Empty cart state -- only shown AFTER hydration confirms there are truly no items.
   * Before hydration, skeletons are shown to match the expected layout.
   */
  if (isHydrated && items.length === 0) {
    return (
      <div style={contentStyle}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 48,
            textAlign: 'center',
          }}
        >
          <ShoppingCart style={{ width: 64, height: 64, color: themeStyles.textMuted, marginBottom: 16 }} />
          <h2 style={{ fontSize: 24, fontWeight: 600, color: themeStyles.textPrimary, marginBottom: 8 }}>
            {element.emptyCartMessage ?? 'Your cart is empty'}
          </h2>
          <p style={{ fontSize: 14, color: themeStyles.textSecondary }}>
            Add items to your cart to see them here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Test Mode Badge */}
      {element.testMode && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            marginBottom: 8,
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#f59e0b',
          }}
        >
          <FlaskConical style={{ width: '14px', height: '14px', flexShrink: 0 }} />
          <span>Test Mode</span>
        </div>
      )}

      {/* Cart Validation Warning — shown when stale items were removed or stock issues found */}
      {/* Removed items banner — products/prices that no longer exist */}
      {validationMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            marginBottom: 8,
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#b45309',
          }}
        >
          <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          <span>{validationMessage}</span>
        </div>
      )}

      {/* Stock reduced banner — quantities auto-capped to available stock */}
      {stockReducedMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            marginBottom: 8,
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#b45309',
          }}
        >
          <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          <span>{stockReducedMessage}</span>
        </div>
      )}

      {/* Out-of-stock warnings — items with zero stock remaining */}
      {stockWarnings.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '10px 14px',
            marginBottom: 8,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#dc2626',
          }}
        >
          {stockWarnings.map((w) => (
            <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle style={{ width: '14px', height: '14px', flexShrink: 0 }} />
              <span>&ldquo;{w.name}&rdquo; is out of stock{w.availableQuantity > 0 ? ` (${w.availableQuantity} available)` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div style={contentStyle}>
        {/* Payment Section (Left on Desktop, Bottom on Mobile) */}
        <div
          style={{
            flex: isMobile ? '1 1 auto' : '1 1 300px',
            width: isMobile ? '100%' : 'auto',
            minWidth: 0,
            padding: 24,
            order: isMobile ? 2 : 1,
          }}
        >
          {isHydrated ? (
            <CheckoutPaymentWrapper
              organizationId={effectiveOrgId}
              totalPriceInCents={totalPriceInCents}
              displayTotal={displayTotal}
              currency={currency}
              theme={theme}
              themeStyles={themeStyles}
              breakpoint={breakpoint}
              payButtonText={element.payButtonText}
              testMode={element.testMode}
              successRedirectEnabled={element.successRedirectEnabled}
              successRedirectType={element.successRedirectType}
              successRedirectPageSlug={element.successRedirectPageSlug}
              successRedirectUrl={element.successRedirectUrl}
              successRedirectNewTab={element.successRedirectNewTab}
              orderBumpChecked={orderBumpChecked}
              orderBumpStripePriceId={element.orderBumpStripePriceId}
              orderBumpBillingType={element.orderBumpBillingType}
              orderBumpProductName={element.orderBumpProductName}
              orderBumpPriceAmount={element.orderBumpPriceAmount}
              orderBumpPriceCurrency={element.orderBumpPriceCurrency}
              allItemsAreTrial={allItemsAreTrial}
              allSameTrialPeriod={allSameTrialPeriod}
              maxTrialDays={maxTrialDays}
              dueTodayAmount={dueTodayAmount}
            />
          ) : (
            <PaymentSectionSkeleton themeStyles={themeStyles} isMobile={isMobile} />
          )}
        </div>

        {/* Cart Section (Right on Desktop, Top on Mobile) */}
        {element.showCartSummary !== false && (
          <div
            style={{
              flex: isMobile ? '1 1 auto' : '1 1 300px',
              width: isMobile ? '100%' : 'auto',
              minWidth: 0,
              padding: isMobile ? '20px 24px' : 24,
              backgroundColor: themeStyles.cartBg,
              borderLeft: isMobile ? 'none' : `1px solid ${themeStyles.containerBorder}`,
              borderBottom: isMobile ? `1px solid ${themeStyles.containerBorder}` : 'none',
              order: isMobile ? 1 : 2,
            }}
          >
            {isHydrated ? (
              /**
               * SOURCE OF TRUTH: CartSummaryContent — shared cart summary UI component.
               * Renders items, totals, billing messages, and order bump for checkout.
               * See cart-summary-content.tsx for full implementation.
               */
              <CartSummaryContent
                items={items}
                currency={currency}
                themeStyles={themeStyles}
                theme={theme}
                stockLimits={stockLimits}
                heading={element.cartHeading}
                allowQuantityChange={element.allowQuantityChange}
                showRemoveButton={false}
                showShipping={true}
                maxItemsHeight={isMobile ? 180 : 'none'}
                orderBump={{
                  show: showOrderBump,
                  checked: orderBumpChecked,
                  onToggle: () => setOrderBumpChecked(!orderBumpChecked),
                  productName: element.orderBumpProductName,
                  priceAmount: element.orderBumpPriceAmount,
                  priceCurrency: element.orderBumpPriceCurrency,
                  billingType: element.orderBumpBillingType,
                  billingInterval: element.orderBumpBillingInterval,
                  intervalCount: element.orderBumpIntervalCount,
                  trialDays: element.orderBumpTrialDays,
                  label: element.orderBumpLabel,
                  badgeText: element.orderBumpBadgeText,
                }}
                onUpdateQuantity={updateQuantity}
                formatPrice={formatCartPrice}
              />
            ) : (
              <CartSectionSkeleton themeStyles={themeStyles} />
            )}
          </div>
        )}
      </div>

      {/* Keyframes for spinner and skeleton pulse animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  )
}

// ============================================================================
// SKELETON COMPONENTS -- Match the real layout 1:1 for seamless transition
// ============================================================================

/** Reusable skeleton bar style builder -- theme-aware with pulse animation */
function skeletonBar(
  themeStyles: ThemeStyles,
  w: string | number,
  h: number,
  radius = 6
): React.CSSProperties {
  return {
    width: w,
    height: h,
    borderRadius: radius,
    backgroundColor: themeStyles.mutedBg,
    animation: 'skeletonPulse 1.5s ease-in-out infinite',
  }
}

/**
 * Skeleton for the payment form section (left side).
 * Mimics: Contact heading -> name fields -> email -> Payment heading -> card area -> button.
 */
function PaymentSectionSkeleton({
  themeStyles,
  isMobile,
}: {
  themeStyles: ThemeStyles
  isMobile: boolean
}) {
  const bar = (w: string | number, h: number, r?: number) =>
    skeletonBar(themeStyles, w, h, r)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Contact heading */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={bar(80, 18)} />
        {/* First name / Last name row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={bar(72, 14)} />
            <div style={bar('100%', 40)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={bar(68, 14)} />
            <div style={bar('100%', 40)} />
          </div>
        </div>
        {/* Email */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={bar(42, 14)} />
          <div style={bar('100%', 40)} />
        </div>
      </div>

      {/* Payment heading + Stripe element area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={bar(80, 18)} />
        <div style={bar('100%', 130)} />
      </div>

      {/* Pay button */}
      <div style={bar('100%', 44)} />

      {/* Security note */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={bar(260, 12)} />
      </div>
    </div>
  )
}

/**
 * Skeleton for the cart summary section (right side).
 * Mimics: Order Summary heading -> 2 cart items -> subtotal/shipping/total.
 */
function CartSectionSkeleton({ themeStyles }: { themeStyles: ThemeStyles }) {
  const bar = (w: string | number, h: number, r?: number) =>
    skeletonBar(themeStyles, w, h, r)

  /** Single skeleton cart item -- image + text lines + price */
  const SkeletonItem = ({ showBorder }: { showBorder: boolean }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: showBorder
          ? `1px solid ${themeStyles.containerBorder}`
          : 'none',
      }}
    >
      <div style={bar(48, 48, 8)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={bar('70%', 14)} />
        <div style={bar('40%', 12)} />
      </div>
      <div style={bar(52, 14)} />
    </div>
  )

  return (
    <div>
      <div style={bar(110, 13)} />
      <div style={{ marginTop: 8 }}>
        <SkeletonItem showBorder />
        <SkeletonItem showBorder={false} />
      </div>
      <div
        style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: `1px solid ${themeStyles.containerBorder}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={bar(60, 14)} />
          <div style={bar(50, 14)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={bar(55, 14)} />
          <div style={bar(30, 14)} />
        </div>
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
          <div style={bar(45, 16)} />
          <div style={bar(72, 18)} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CHECKOUT PAYMENT WRAPPER - Sets up Stripe Elements context
// ============================================================================

interface CheckoutPaymentWrapperProps {
  organizationId?: string
  totalPriceInCents: number
  /** Total including order bump — used for button text display only */
  displayTotal: number
  currency: string
  theme: 'light' | 'dark'
  themeStyles: ThemeStyles
  breakpoint: Breakpoint
  payButtonText?: string
  testMode?: boolean
  successRedirectEnabled?: boolean
  successRedirectType?: 'page' | 'url'
  successRedirectPageSlug?: string
  successRedirectUrl?: string
  successRedirectNewTab?: boolean

  // ========================================================================
  // ORDER BUMP — passed from CheckoutPreviewContent when bump is checked
  // ========================================================================
  /** Whether the customer has toggled the order bump on */
  orderBumpChecked?: boolean
  /** Stripe price ID for the bump item */
  orderBumpStripePriceId?: string
  /** Billing type of the bump */
  orderBumpBillingType?: 'ONE_TIME' | 'RECURRING'
  /** Product name for the bump (used in checkout items) */
  orderBumpProductName?: string
  /** Price amount in cents */
  orderBumpPriceAmount?: number
  /** Currency code */
  orderBumpPriceCurrency?: string

  // ========================================================================
  // FREE TRIAL — passed from CheckoutPreviewContent for button text
  // ========================================================================
  /** True ONLY when every cart item is a trial — nothing charged today */
  allItemsAreTrial?: boolean
  /** Whether all trial items share the same trial period (for button text clarity) */
  allSameTrialPeriod?: boolean
  /** Max trial days across all items (for display in button text) */
  maxTrialDays?: number
  /**
   * Actual amount due today in cents — excludes trial items and trial bumps.
   * Used for button text so the customer sees what they actually pay.
   *
   * SOURCE OF TRUTH: CheckoutDueTodayAmount
   */
  dueTodayAmount?: number
}

/**
 * Wrapper that sets up Stripe Elements context for the payment form.
 * Fetches the org's stripeConnectedAccountId so that Stripe Elements
 * communicates with the correct connected account.
 *
 * SOURCE OF TRUTH: CheckoutPaymentWrapper, CartStripeElements
 */
function CheckoutPaymentWrapper({
  organizationId,
  totalPriceInCents,
  displayTotal,
  currency,
  theme,
  themeStyles,
  breakpoint,
  payButtonText,
  testMode,
  successRedirectEnabled,
  successRedirectType,
  successRedirectPageSlug,
  successRedirectUrl,
  successRedirectNewTab,
  orderBumpChecked,
  orderBumpStripePriceId,
  orderBumpBillingType,
  orderBumpProductName,
  orderBumpPriceAmount,
  orderBumpPriceCurrency,
  allItemsAreTrial,
  allSameTrialPeriod,
  maxTrialDays,
  dueTodayAmount,
}: CheckoutPaymentWrapperProps) {
  /** Get cart items from Redux store and check for recurring items. */
  const items = useCartItems()
  const hasRecurringItems = useMemo(
    () => items.some((item) => item.billingType === 'RECURRING'),
    [items]
  )

  /**
   * Fetch the org's Stripe connected account ID.
   * In live mode, Stripe Elements MUST be initialized with the connected account.
   * In test mode, we skip this (payments go to platform's test account).
   */
  const { data: orgInfo } = trpc.payment.getCheckoutOrgInfo.useQuery(
    { organizationId: organizationId! },
    { enabled: Boolean(organizationId) && !testMode }
  )
  const connectedAccountId = testMode ? null : orgInfo?.stripeConnectedAccountId ?? null

  /** Initialize Stripe promise with connected account for live mode. */
  const stripePromise = useMemo(
    () => getStripePromise(connectedAccountId, testMode),
    [connectedAccountId, testMode]
  )

  /** Check if we have a valid org to proceed. */
  if (!organizationId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: themeStyles.textMuted }}>
        <AlertCircle style={{ width: 48, height: 48, margin: '0 auto 12px', opacity: 0.5 }} />
        <p>Checkout not configured. Please contact site owner.</p>
      </div>
    )
  }

  /**
   * In live mode, wait for the connected account ID before mounting Stripe Elements.
   * Without it, the Payment Element would connect to the wrong Stripe account.
   */
  if (!testMode && !orgInfo) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Loader2 style={{ width: 24, height: 24, color: themeStyles.textMuted, animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  const isDark = theme === 'dark'

  /** Stripe Elements appearance — matches the payment element's indigo/blue theme. */
  const appearance: Appearance = {
    theme: isDark ? 'night' : 'stripe',
    variables: {
      colorPrimary: '#6366f1',
      colorBackground: isDark ? '#0a0a0a' : '#ffffff',
      colorText: isDark ? '#fafafa' : '#111827',
      colorTextSecondary: isDark ? '#a1a1aa' : '#6b7280',
      colorTextPlaceholder: '#71717a',
      colorDanger: '#dc2626',
      borderRadius: '8px',
      spacingUnit: '4px',
      spacingGridRow: '16px',
    },
    rules: {
      '.Input': {
        border: `1px solid ${isDark ? '#3f3f46' : '#d1d5db'}`,
        backgroundColor: isDark ? '#18181b' : '#ffffff',
        boxShadow: 'none',
        padding: '10px 12px',
      },
      '.Input:focus': {
        border: '1px solid #6366f1',
        boxShadow: '0 0 0 1px #6366f1',
      },
      '.Input--invalid': {
        border: '1px solid #dc2626',
      },
      '.Label': {
        color: isDark ? '#fafafa' : '#111827',
        fontWeight: '500',
        fontSize: '14px',
        marginBottom: '6px',
      },
      '.Tab': {
        border: `1px solid ${isDark ? '#3f3f46' : '#d1d5db'}`,
        backgroundColor: isDark ? '#18181b' : '#ffffff',
      },
      '.Tab:hover': {
        backgroundColor: isDark ? '#27272a' : '#f4f4f5',
      },
      '.Tab--selected': {
        border: '1px solid #6366f1',
        backgroundColor: isDark ? '#18181b' : '#ffffff',
      },
    },
  }

  /**
   * Stripe Elements mode selection.
   *
   * SOURCE OF TRUTH: CheckoutElementsMode, RecurringOnlyTrialGuard
   *
   * MODE RULES:
   * - 'setup': ALL items are RECURRING with trial — nothing to charge today.
   * - 'subscription': Any RECURRING item present (with or without trial).
   * - 'payment': All items are ONE_TIME — simple PaymentIntent.
   *
   * CRITICAL: Trials only apply to RECURRING items. ONE_TIME items never
   * trigger setup mode regardless of trialDays value in the DB.
   */
  const allTrialInCart = items.length > 0 && items.every(
    (item) => item.billingType === 'RECURRING' && item.trialDays && item.trialDays > 0
  )

  /**
   * No explicit paymentMethodTypes — server-side automatic_payment_methods
   * controls which methods appear (cards, Apple Pay, Google Pay, Link, etc.).
   *
   * SOURCE OF TRUTH: ElementsPaymentMethodTypes
   */
  const elementsOptions: StripeElementsOptions = allTrialInCart
    ? { mode: 'setup', currency: currency.toLowerCase(), appearance }
    : {
        mode: hasRecurringItems ? 'subscription' : 'payment',
        amount: totalPriceInCents,
        currency: currency.toLowerCase(),
        appearance,
      }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <CheckoutPaymentForm
        organizationId={organizationId}
        totalPriceInCents={totalPriceInCents}
        displayTotal={displayTotal}
        currency={currency}
        themeStyles={themeStyles}
        breakpoint={breakpoint}
        payButtonText={payButtonText}
        testMode={testMode}
        successRedirectEnabled={successRedirectEnabled}
        successRedirectType={successRedirectType}
        successRedirectPageSlug={successRedirectPageSlug}
        successRedirectUrl={successRedirectUrl}
        successRedirectNewTab={successRedirectNewTab}
        orderBumpChecked={orderBumpChecked}
        orderBumpStripePriceId={orderBumpStripePriceId}
        orderBumpBillingType={orderBumpBillingType}
        orderBumpProductName={orderBumpProductName}
        orderBumpPriceAmount={orderBumpPriceAmount}
        orderBumpPriceCurrency={orderBumpPriceCurrency}
        allItemsAreTrial={allItemsAreTrial}
        allSameTrialPeriod={allSameTrialPeriod}
        maxTrialDays={maxTrialDays}
        dueTodayAmount={dueTodayAmount}
      />
    </Elements>
  )
}

// ============================================================================
// CHECKOUT PAYMENT FORM - Native Stripe Payment Element
// ============================================================================

interface CheckoutPaymentFormProps {
  organizationId: string
  totalPriceInCents: number
  /** Total including order bump — used for button text display only */
  displayTotal: number
  currency: string
  themeStyles: ThemeStyles
  breakpoint: Breakpoint
  payButtonText?: string
  testMode?: boolean
  successRedirectEnabled?: boolean
  successRedirectType?: 'page' | 'url'
  successRedirectPageSlug?: string
  successRedirectUrl?: string
  successRedirectNewTab?: boolean

  // ========================================================================
  // ORDER BUMP — included in checkout items when checked
  // ========================================================================
  orderBumpChecked?: boolean
  orderBumpStripePriceId?: string
  orderBumpBillingType?: 'ONE_TIME' | 'RECURRING'
  orderBumpProductName?: string
  orderBumpPriceAmount?: number
  orderBumpPriceCurrency?: string

  // ========================================================================
  // FREE TRIAL — passed from CheckoutPaymentWrapper for UI display
  // ========================================================================
  /** True ONLY when every cart item is a trial — nothing charged today */
  allItemsAreTrial?: boolean
  /** Whether all trial items share the same trial period (for button text clarity) */
  allSameTrialPeriod?: boolean
  /** Max trial days across all items (for button text / messages) */
  maxTrialDays?: number
  /**
   * Actual amount due today in cents — excludes trial items and trial bumps.
   * Used for button text so the customer sees what they actually pay.
   *
   * SOURCE OF TRUTH: CheckoutFormDueTodayAmount
   */
  dueTodayAmount?: number
}

/** Payment state discriminated union for tracking checkout progress. */
type PaymentState =
  | { status: 'idle' }
  | { status: 'processing' }
  | { status: 'succeeded' }
  | { status: 'failed'; message: string }

/**
 * The actual checkout form with Stripe Payment Element.
 *
 * SOURCE OF TRUTH: CheckoutPaymentForm, CartPaymentForm
 *
 * Flow:
 * 1. User fills contact info
 * 2. User enters payment details in Payment Element
 * 3. On submit: creates intent via tRPC, confirms payment with Stripe
 * 4. Shows success/error state
 */
function CheckoutPaymentForm({
  organizationId,
  totalPriceInCents,
  displayTotal,
  currency,
  themeStyles,
  breakpoint,
  payButtonText,
  testMode,
  successRedirectEnabled,
  successRedirectType,
  successRedirectPageSlug,
  successRedirectUrl,
  successRedirectNewTab,
  orderBumpChecked,
  orderBumpStripePriceId,
  orderBumpBillingType,
  orderBumpProductName,
  orderBumpPriceAmount,
  orderBumpPriceCurrency,
  allItemsAreTrial,
  allSameTrialPeriod,
  maxTrialDays,
  dueTodayAmount,
}: CheckoutPaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  /** Extract basePath for context-aware page redirects (subdomain/custom domain routing). */
  const { basePath } = useRenderMode()

  /** Get cart items and clearCart action from Redux store. */
  const items = useCartItems()
  const { clearCart } = useCartActions()

  /** Check if cart has recurring items. */
  const hasRecurringItems = useMemo(
    () => items.some((item) => item.billingType === 'RECURRING'),
    [items]
  )


  /** Form and payment state. */
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentReady, setPaymentReady] = useState(false)
  const [paymentState, setPaymentState] = useState<PaymentState>({ status: 'idle' })

  /** tRPC mutation to create checkout intent. */
  const createCheckoutIntent = trpc.payment.createCartCheckoutSession.useMutation()

  /**
   * Mutation to complete pending trial subscriptions after main payment succeeds.
   * When the cart has items with different trial periods (e.g. some with trial,
   * some without), the backend splits them: the main subscription handles the
   * non-trial items, and this mutation creates separate trial subscriptions
   * using the customer's saved payment method from the main payment.
   *
   * SOURCE OF TRUTH: CartTrialSplit, CompleteTrialSubscriptions
   */
  const completeTrialSubs = trpc.payment.completeTrialSubscriptions.useMutation()

  /** React Hook Form setup. */
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
  })

  /** Track Payment Element readiness. */
  const handlePaymentElementChange = (event: StripePaymentElementChangeEvent) => {
    setPaymentReady(event.complete)
    if (!event.complete && event.value.type) {
      setPaymentError(null)
    }
  }

  /** Format currency for display in the payment button. */
  const formatPaymentCurrency = (amount: number, curr: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount / 100)
  }

  /**
   * Handle form submission.
   *
   * FLOW:
   * 1. Create checkout intent via tRPC (returns clientSecret)
   * 2. Submit payment element to validate
   * 3. Confirm payment with Stripe
   * 4. Handle success/error
   */
  const onSubmit = async (data: CheckoutFormData) => {
    if (!stripe || !elements) {
      console.error('[checkout] Stripe not initialized! stripe=', !!stripe, 'elements=', !!elements)
      setPaymentError('Payment system not ready. Please refresh and try again.')
      return
    }

    setPaymentState({ status: 'processing' })
    setPaymentError(null)

    try {
      /** Build cart items for the checkout intent. */
      const checkoutItems = items.map((item) => ({
        stripePriceId: item.stripePriceId,
        quantity: item.quantity,
        billingType: (item.billingType ?? 'ONE_TIME') as 'ONE_TIME' | 'RECURRING',
        name: item.name,
        priceInCents: item.priceInCents,
        currency: item.currency,
      }))

      /** Append order bump as an additional cart item when customer checked it */
      if (orderBumpChecked && orderBumpStripePriceId && orderBumpPriceAmount) {
        checkoutItems.push({
          stripePriceId: orderBumpStripePriceId,
          quantity: 1,
          billingType: (orderBumpBillingType ?? 'ONE_TIME') as 'ONE_TIME' | 'RECURRING',
          name: orderBumpProductName ?? 'Add-on',
          priceInCents: orderBumpPriceAmount,
          currency: orderBumpPriceCurrency ?? currency,
        })
      }

      /** Step 1: Create checkout intent via tRPC. */
      console.log('[checkout] Creating intent...', { organizationId, items: checkoutItems.length, testMode })
      const result = await createCheckoutIntent.mutateAsync({
        organizationId,
        items: checkoutItems,
        customer: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
        },
        testMode: testMode ?? false,
      })
      console.log('[checkout] Intent created:', { type: result.type, hasSecret: !!result.clientSecret })

      if (!result.clientSecret) {
        throw new Error('Payment initialization failed. Please try again.')
      }

      /** Step 2: Validate payment info with Stripe Elements. */
      console.log('[checkout] Submitting payment element...')
      const { error: submitError } = await elements.submit()
      if (submitError) {
        console.error('[checkout] Element submit error:', submitError)
        throw new Error(submitError.message || 'Payment validation failed')
      }

      /**
       * Step 3: Confirm payment with Stripe.
       * Build return_url to match the configured redirect target so that
       * redirect-based flows (3DS, bank redirects) land on the right page.
       */
      console.log('[checkout] Confirming payment with Stripe...')
      const effectiveType = successRedirectType ?? 'page'
      let stripeReturnUrl: string
      if (successRedirectEnabled && effectiveType === 'page' && successRedirectPageSlug) {
        const resolvedPath = resolveNavigationHref(successRedirectPageSlug, basePath)
        const url = new URL(resolvedPath, window.location.origin)
        if (result.transactionId) url.searchParams.set('transactionId', result.transactionId)
        stripeReturnUrl = url.toString()
      } else if (successRedirectEnabled && effectiveType === 'url' && successRedirectUrl) {
        const url = new URL(successRedirectUrl)
        if (result.transactionId) url.searchParams.set('transactionId', result.transactionId)
        stripeReturnUrl = url.toString()
      } else {
        const fallbackUrl = new URL(`${window.location.origin}${window.location.pathname}`)
        fallbackUrl.searchParams.set('checkout', 'success')
        if (result.transactionId) fallbackUrl.searchParams.set('transactionId', result.transactionId)
        stripeReturnUrl = fallbackUrl.toString()
      }

      /**
       * Use confirmSetup for trial subscriptions (SetupIntent),
       * confirmPayment for regular charges (PaymentIntent).
       * The backend signals which flow via result.isTrial.
       */
      const confirmResult = (result as { isTrial?: boolean }).isTrial
        ? await stripe.confirmSetup({
            elements,
            clientSecret: result.clientSecret,
            confirmParams: {
              return_url: `${stripeReturnUrl}${stripeReturnUrl.includes('?') ? '&' : '?'}trial=true`,
            },
            redirect: 'if_required',
          })
        : await stripe.confirmPayment({
            elements,
            clientSecret: result.clientSecret,
            confirmParams: {
              return_url: stripeReturnUrl,
              payment_method_data: {
                billing_details: {
                  name: `${data.firstName} ${data.lastName}`,
                  email: data.email,
                },
              },
            },
            redirect: 'if_required',
          })

      if (confirmResult.error) {
        console.error('[checkout] Stripe confirm error:', confirmResult.error)
        throw new Error(confirmResult.error.message || 'Payment failed')
      }

      /**
       * Check confirmation status.
       * confirmSetup returns setupIntent, confirmPayment returns paymentIntent.
       * Both have a .status field to check success.
       */
      const isTrialConfirm = (result as { isTrial?: boolean }).isTrial
      if (isTrialConfirm) {
        /** SetupIntent confirmation — succeeded means card was saved for trial */
        const siStatus = (confirmResult as { setupIntent?: { status: string } }).setupIntent?.status
        console.log('[checkout] Setup confirmed:', { siStatus })
        if (siStatus === 'succeeded') {
          clearCart()
          setPaymentState({ status: 'succeeded' })
          trackEvent(CLARITY_EVENTS.PAYMENT_COMPLETED)
        } else {
          throw new Error('Trial setup failed. Please try again.')
        }
      } else {
        /** PaymentIntent confirmation — standard payment flow */
        const piStatus = (confirmResult as { paymentIntent?: { status: string; id: string } }).paymentIntent?.status
        console.log('[checkout] Payment confirmed:', { piStatus })
        if (piStatus === 'succeeded' || piStatus === 'processing' || piStatus === 'requires_capture') {
          clearCart()
          setPaymentState({ status: 'succeeded' })
          trackEvent(CLARITY_EVENTS.PAYMENT_COMPLETED)
        } else {
          console.warn('[checkout] Unexpected PI status after confirm:', piStatus, confirmResult)
          if (!piStatus) {
            throw new Error('Payment confirmation failed. Please try again.')
          }
          /** For active statuses, treat as success (Stripe handles next steps). */
          clearCart()
          setPaymentState({ status: 'succeeded' })
        }
      }

      /**
       * Step 4: Complete pending trial subscriptions if the cart had items
       * with different trial periods that needed separate Stripe subscriptions.
       *
       * Uses checkoutSessionId to group related transactions from the same cart.
       * The backend uses this to find the primary subscription and create trial subs.
       *
       * Non-blocking: if trial subscription creation fails, the main payment
       * already succeeded and the customer received their non-trial products.
       *
       * SOURCE OF TRUTH: CheckoutSessionGrouping, CompleteTrialSubscriptions
       */
      const checkoutSessionId = (result as { checkoutSessionId?: string | null }).checkoutSessionId
      const primarySubscriptionId = (result as { subscriptionId?: string }).subscriptionId
      if (checkoutSessionId && primarySubscriptionId) {
        try {
          console.log('[checkout] Creating pending trial subscriptions...')
          await completeTrialSubs.mutateAsync({
            checkoutSessionId,
            primarySubscriptionId,
            organizationId,
          })
          console.log('[checkout] Trial subscriptions created successfully')
        } catch (trialError) {
          /**
           * Trial subscription creation failure should NOT block the checkout success.
           * The main payment already went through. Log the error for debugging.
           */
          console.error('[checkout] Failed to create trial subscriptions:', trialError)
        }
      }

      /**
       * Write receipt display data to sessionStorage for instant receipt rendering.
       * The receipt element on the target page reads this immediately on mount,
       * avoiding the need to wait for webhook-created DB records.
       * sessionStorage is same-origin only and clears on tab close — secure by design.
       */
      try {
        const totalAmount = items.reduce((sum, item) => sum + item.priceInCents * item.quantity, 0)
        const hasRecurring = items.some((item) => item.billingType === 'RECURRING')
        const receiptData: PublicReceiptData = {
          paymentId: '',
          paymentNumber: 1,
          paidAt: new Date().toISOString(),
          amount: totalAmount,
          refundedAmount: 0,
          currency: items[0]?.currency?.toLowerCase() ?? 'usd',
          billingType: hasRecurring ? 'RECURRING' : 'ONE_TIME',
          totalPayments: hasRecurring ? 0 : 1,
          items: items.map((item) => ({
            productName: item.name,
            productImage: item.image ?? null,
            priceName: item.name,
            quantity: item.quantity,
            unitAmount: item.priceInCents,
            totalAmount: item.priceInCents * item.quantity,
            billingType: (item.billingType ?? 'ONE_TIME') as 'ONE_TIME' | 'RECURRING',
            interval: (item.billingInterval as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR') ?? null,
            intervalCount: item.intervalCount ?? null,
          })),
          createdAt: new Date().toISOString(),
          invoiceAccessToken: null,
        }
        sessionStorage.setItem('mochi_receipt', JSON.stringify(receiptData))
      } catch {
        /* sessionStorage write failure is non-critical — receipt falls back to DB query */
      }

      /**
       * Post-payment redirect logic.
       * Appends transactionId as a query param so the target page (e.g. a receipt element)
       * can look up and display the transaction details.
       */
      if (successRedirectEnabled) {
        if (effectiveType === 'page' && successRedirectPageSlug) {
          /**
           * Use resolveNavigationHref to correctly prepend basePath for
           * subdomain/custom domain routing (e.g. "/mysite" + "/thank-you").
           */
          const resolvedPath = resolveNavigationHref(successRedirectPageSlug, basePath)
          const redirectUrl = new URL(resolvedPath, window.location.origin)
          if (result.transactionId) {
            redirectUrl.searchParams.set('transactionId', result.transactionId)
          }
          window.location.href = redirectUrl.pathname + redirectUrl.search
          return
        } else if (effectiveType === 'url' && successRedirectUrl) {
          const redirectUrl = new URL(successRedirectUrl)
          if (result.transactionId) {
            redirectUrl.searchParams.set('transactionId', result.transactionId)
          }
          if (successRedirectNewTab) {
            window.open(redirectUrl.toString(), '_blank')
          } else {
            window.location.href = redirectUrl.toString()
            return
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      console.error('[checkout] FAILED:', errorMessage, err)
      setPaymentError(errorMessage)
      setPaymentState({ status: 'failed', message: errorMessage })
    }
  }

  const isProcessing = paymentState.status === 'processing'

  /** Success state -- show confirmation message. */
  if (paymentState.status === 'succeeded') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: themeStyles.successBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <CheckCircle style={{ width: 32, height: 32, color: themeStyles.successText }} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 600, color: themeStyles.textPrimary, marginBottom: 8 }}>
          Payment Successful!
        </h3>
        <p style={{ fontSize: 14, color: themeStyles.textSecondary, margin: 0 }}>
          Thank you for your purchase. You will receive a confirmation email shortly.
        </p>
      </div>
    )
  }

  /** Input style helper for consistent form field styling. */
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '40px',
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '6px',
    border: `1px solid ${themeStyles.inputBorder}`,
    backgroundColor: themeStyles.inputBg,
    color: themeStyles.textPrimary,
    outline: 'none',
  }

  /**
   * Determine button text based on cart composition.
   *
   * SOURCE OF TRUTH: CheckoutButtonText
   *
   * - All items are trials → "Start X-day free trial" (nothing charged)
   * - Mixed cart (some trial, some paid) → show actual dueTodayAmount
   * - No trials → show displayTotal (full order value incl. order bump)
   */
  const effectiveAmount = dueTodayAmount ?? displayTotal
  /**
   * Button text — trial-period-aware.
   * When all items are trial with SAME period → "Start X-day free trial"
   * When all items are trial with DIFFERENT periods → "Start free trial" (no misleading number)
   */
  const buttonText = payButtonText
    ? payButtonText
    : allItemsAreTrial
      ? allSameTrialPeriod
        ? `Start ${maxTrialDays}-day free trial`
        : 'Start free trial'
      : hasRecurringItems
        ? `Subscribe ${formatPaymentCurrency(effectiveAmount, currency)}`
        : `Pay ${formatPaymentCurrency(effectiveAmount, currency)}`

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Contact Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: 500, margin: 0, color: themeStyles.textPrimary }}>
          Contact
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: breakpoint === 'mobile' ? '1fr' : '1fr 1fr', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: themeStyles.textPrimary }}>
              First Name
            </label>
            <input
              {...register('firstName')}
              placeholder="John"
              disabled={isProcessing}
              style={{
                ...inputStyle,
                borderColor: errors.firstName ? themeStyles.errorText : themeStyles.inputBorder,
              }}
            />
            {errors.firstName && (
              <p style={{ margin: 0, fontSize: '12px', color: themeStyles.errorText }}>
                {errors.firstName.message}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: themeStyles.textPrimary }}>
              Last Name
            </label>
            <input
              {...register('lastName')}
              placeholder="Doe"
              disabled={isProcessing}
              style={{
                ...inputStyle,
                borderColor: errors.lastName ? themeStyles.errorText : themeStyles.inputBorder,
              }}
            />
            {errors.lastName && (
              <p style={{ margin: 0, fontSize: '12px', color: themeStyles.errorText }}>
                {errors.lastName.message}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '14px', fontWeight: 500, color: themeStyles.textPrimary }}>
            Email
          </label>
          <input
            type="email"
            {...register('email')}
            placeholder="john@example.com"
            disabled={isProcessing}
            style={{
              ...inputStyle,
              borderColor: errors.email ? themeStyles.errorText : themeStyles.inputBorder,
            }}
          />
          {errors.email && (
            <p style={{ margin: 0, fontSize: '12px', color: themeStyles.errorText }}>
              {errors.email.message}
            </p>
          )}
        </div>
      </div>

      {/* Payment Section -- Stripe Payment Element */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: 500, margin: 0, color: themeStyles.textPrimary }}>
          Payment
        </h4>
        <PaymentElement
          onChange={handlePaymentElementChange}
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {/* Error Display */}
      {paymentError && (
        <div
          style={{
            padding: '12px',
            backgroundColor: themeStyles.errorBg,
            borderRadius: '6px',
            color: themeStyles.errorText,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          {paymentError}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isProcessing || !paymentReady || items.length === 0}
        style={{
          width: '100%',
          height: '44px',
          borderRadius: '6px',
          border: 'none',
          fontWeight: 500,
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          backgroundColor: (isProcessing || !paymentReady || items.length === 0)
            ? `${themeStyles.buttonBg}80`
            : themeStyles.buttonBg,
          color: themeStyles.buttonText,
          cursor: (isProcessing || !paymentReady || items.length === 0) ? 'not-allowed' : 'pointer',
        }}
      >
        {isProcessing ? (
          <>
            <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
            Processing...
          </>
        ) : (
          buttonText
        )}
      </button>

      {/* Security Note */}
      <p style={{ margin: 0, fontSize: '12px', textAlign: 'center', color: themeStyles.textMuted }}>
        Your payment is secured by Stripe. We never store your payment details.
      </p>
    </form>
  )
}
