/**
 * ============================================================================
 * CHECKOUT SETTINGS SECTION - Configuration for Checkout Elements
 * ============================================================================
 *
 * SOURCE OF TRUTH: Checkout Element Settings in Properties Panel
 *
 * Renders the Settings tab content for Checkout elements.
 * Allows configuring theme, headings, and text options.
 *
 * The checkout element uses a FIXED two-column layout (payment on left,
 * cart on right) that automatically wraps on mobile devices using CSS flexbox.
 *
 * ============================================================================
 * SETTINGS
 * ============================================================================
 *
 * 1. Theme - light or dark mode (like payment element)
 * 2. Cart Heading - heading text for the cart section
 * 3. Payment Heading - heading text for the payment section
 * 4. Pay Button Text - text for the checkout button
 * 5. Empty Cart Message - message shown when cart is empty
 * 6. Show Cart Summary - toggle for cart summary visibility
 * 7. Allow Quantity Change - toggle for quantity controls
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { PropertySection, InputGroupControl, ToggleControl } from './controls'
import { useAppDispatch, useAppSelector, updateElement, selectPageInfos } from '../../_lib'
import type { CheckoutElement } from '../../_lib/types'
import { Sun, Moon, FlaskConical, ExternalLink, FileText, ShoppingBag, Package, DollarSign, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { useBuilderContextSafe } from '../../_lib/builder-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface CheckoutSettingsSectionProps {
  element: CheckoutElement
}

/**
 * Helper function to format billing type for display.
 * Converts internal billing type enum to a user-friendly label.
 */
function formatBillingType(billingType: string, interval?: string | null): string {
  switch (billingType) {
    case 'ONE_TIME':
      return 'One-time'
    case 'RECURRING':
      return interval ? `per ${interval}` : 'Recurring'
    case 'SPLIT_PAYMENT':
      return 'Split payment'
    default:
      return billingType
  }
}

/**
 * Renders Checkout element settings in the Settings tab.
 * Allows configuring layout, headings, and behavior options.
 */
export function CheckoutSettingsSection({ element }: CheckoutSettingsSectionProps) {
  const dispatch = useAppDispatch()

  /** Access organization context for product/price queries */
  const builderContext = useBuilderContextSafe()
  const organizationId = builderContext?.organizationId

  /**
   * Get all pages for the post-payment redirect page selector.
   * Uses the same pattern as button-settings.tsx for page dropdowns.
   */
  const allPages = useAppSelector(selectPageInfos)

  // ========================================================================
  // DATA FETCHING - Fetch active products for order bump selection
  // SOURCE OF TRUTH: CheckoutOrderBumpProductFetch
  // ========================================================================

  /**
   * Fetch all active products from the organization.
   * Used by the order bump product selector dropdown.
   */
  const { data: productsData } = trpc.products.list.useQuery(
    {
      organizationId: organizationId ?? '',
      activeOnly: true,
      pageSize: 100,
    },
    {
      enabled: Boolean(organizationId),
    }
  )

  /**
   * Fetch the order bump product's prices when an order bump product is selected.
   * This lets us show available prices in the order bump price selector.
   * ONE_TIME and RECURRING prices are supported; SPLIT_PAYMENT is excluded.
   */
  const { data: orderBumpProductData, isLoading: isOrderBumpPricesLoading } =
    trpc.products.getById.useQuery(
      {
        organizationId: organizationId ?? '',
        productId: element.orderBumpProductId ?? '',
      },
      {
        enabled: Boolean(organizationId && element.orderBumpProductId),
        staleTime: 0,
        refetchOnMount: 'always',
      }
    )

  /**
   * Update element properties.
   */
  const updateProperty = <K extends keyof CheckoutElement>(
    key: K,
    value: CheckoutElement[K]
  ) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { [key]: value },
      })
    )
  }

  // ========================================================================
  // ORDER BUMP HANDLERS
  // SOURCE OF TRUTH: CheckoutOrderBumpHandlers
  // ========================================================================

  /**
   * Handle order bump product selection.
   * Updates the order bump product ID and cached name, resets price
   * and all billing-related fields so stale data doesn't persist.
   */
  const handleOrderBumpProductSelect = (productId: string) => {
    const selectedProduct = productsData?.products.find(
      (p: { id: string; name: string }) => p.id === productId
    )
    if (selectedProduct) {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            orderBumpProductId: selectedProduct.id,
            orderBumpProductName: selectedProduct.name,
            /* Reset price and billing fields when product changes */
            orderBumpPriceId: undefined,
            orderBumpPriceAmount: undefined,
            orderBumpPriceCurrency: undefined,
            orderBumpBillingType: undefined,
            orderBumpBillingInterval: undefined,
            orderBumpIntervalCount: undefined,
            orderBumpStripePriceId: undefined,
          },
        })
      )
    } else if (productId === 'none') {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            orderBumpProductId: undefined,
            orderBumpProductName: undefined,
            orderBumpPriceId: undefined,
            orderBumpPriceAmount: undefined,
            orderBumpPriceCurrency: undefined,
            orderBumpBillingType: undefined,
            orderBumpBillingInterval: undefined,
            orderBumpIntervalCount: undefined,
            orderBumpStripePriceId: undefined,
          },
        })
      )
    }
  }

  /**
   * Handle order bump price selection.
   * Updates the order bump price ID, cached amount/currency, and billing
   * fields (billingType, interval, intervalCount, stripePriceId).
   * For RECURRING prices the interval fields are populated; for ONE_TIME
   * they are cleared so the checkout logic can distinguish billing types.
   */
  const handleOrderBumpPriceSelect = (priceId: string) => {
    if (!orderBumpProductData?.prices) return
    const selectedPrice = orderBumpProductData.prices.find(
      (p: { id: string }) => p.id === priceId
    ) as {
      id: string
      name: string
      amount: number
      currency: string
      billingType: string
      interval?: string | null
      intervalCount?: number | null
      stripePriceId?: string | null
      trialDays?: number | null
    } | undefined

    if (selectedPrice) {
      const isRecurring = selectedPrice.billingType === 'RECURRING'
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            orderBumpPriceId: selectedPrice.id,
            orderBumpPriceAmount: selectedPrice.amount,
            orderBumpPriceCurrency: selectedPrice.currency,
            /* Cache billing type so checkout knows how to charge */
            orderBumpBillingType: selectedPrice.billingType as 'ONE_TIME' | 'RECURRING',
            /* Interval fields only apply to RECURRING prices */
            orderBumpBillingInterval: isRecurring && selectedPrice.interval
              ? (selectedPrice.interval as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR')
              : undefined,
            orderBumpIntervalCount: isRecurring && selectedPrice.intervalCount
              ? selectedPrice.intervalCount
              : undefined,
            orderBumpStripePriceId: selectedPrice.stripePriceId ?? undefined,
            /* Cache trial days ONLY for RECURRING bumps — SOURCE OF TRUTH: RecurringOnlyTrialGuard */
            orderBumpTrialDays: isRecurring && selectedPrice.trialDays && selectedPrice.trialDays > 0
              ? selectedPrice.trialDays
              : 0,
          },
        })
      )
    } else if (priceId === 'none') {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            orderBumpPriceId: undefined,
            orderBumpPriceAmount: undefined,
            orderBumpPriceCurrency: undefined,
            orderBumpBillingType: undefined,
            orderBumpBillingInterval: undefined,
            orderBumpIntervalCount: undefined,
            orderBumpStripePriceId: undefined,
            orderBumpTrialDays: 0,
          },
        })
      )
    }
  }

  // ========================================================================
  // DERIVED VALUES
  // ========================================================================

  /** Available products for the order bump selector */
  const availableProducts = productsData?.products ?? []

  const theme = element.theme ?? 'dark'
  const redirectEnabled = element.successRedirectEnabled ?? false
  const redirectType = element.successRedirectType ?? 'page'

  return (
    <>
      {/* Appearance Section - Theme toggle (like payment element) */}
      <PropertySection title="Appearance" defaultOpen>
        {/* Theme Toggle - Light/Dark mode */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm text-foreground">Theme</span>
          <div className="flex items-center gap-1 bg-muted rounded-md p-1">
            <button
              type="button"
              onClick={() => updateProperty('theme', 'light')}
              className={`p-1.5 rounded transition-colors ${
                theme === 'light'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Light mode"
            >
              <Sun className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => updateProperty('theme', 'dark')}
              className={`p-1.5 rounded transition-colors ${
                theme === 'dark'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Dark mode"
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Show Cart Summary */}
        <ToggleControl
          label="Show Cart Summary"
          checked={element.showCartSummary ?? true}
          onChange={(checked: boolean) => updateProperty('showCartSummary', checked)}
        />

        {/* Allow Quantity Change */}
        <ToggleControl
          label="Allow Quantity Adjustment"
          checked={element.allowQuantityChange ?? true}
          onChange={(checked: boolean) => updateProperty('allowQuantityChange', checked)}
        />
      </PropertySection>

      {/* Text Content Section */}
      <PropertySection title="Text Content" defaultOpen>
        {/* Cart Heading */}
        <InputGroupControl
          label="Cart Heading"
          value={element.cartHeading ?? 'Your Cart'}
          onChange={(val) => updateProperty('cartHeading', String(val))}
          type="text"
        />

        {/* Payment Heading */}
        <InputGroupControl
          label="Payment Heading"
          value={element.paymentHeading ?? 'Payment'}
          onChange={(val) => updateProperty('paymentHeading', String(val))}
          type="text"
        />

        {/* Pay Button Text */}
        <InputGroupControl
          label="Button Text"
          value={element.payButtonText ?? 'Complete Purchase'}
          onChange={(val) => updateProperty('payButtonText', String(val))}
          type="text"
        />

        {/* Empty Cart Message */}
        <InputGroupControl
          label="Empty Cart Message"
          value={element.emptyCartMessage ?? 'Your cart is empty'}
          onChange={(val) => updateProperty('emptyCartMessage', String(val))}
          type="text"
        />
      </PropertySection>

      {/* Stripe Mode Section - Test mode toggle like payment element */}
      <PropertySection title="Stripe Mode" defaultOpen>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <FlaskConical className={`h-4 w-4 ${element.testMode ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <Label htmlFor="checkout-test-mode" className="text-sm font-medium cursor-pointer">
              Test Mode
            </Label>
            {element.testMode && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                TEST
              </span>
            )}
          </div>
          <Switch
            id="checkout-test-mode"
            checked={element.testMode ?? false}
            onCheckedChange={(checked: boolean) => updateProperty('testMode', checked)}
          />
        </div>
        {element.testMode && (
          <div className="px-3 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md mx-3 mb-2">
            Test mode is active. Uses Stripe test keys — accepts test cards (4242 4242 4242 4242).
            Disable before publishing for real payments.
          </div>
        )}
      </PropertySection>

      {/* ================================================================
       * ORDER BUMP SECTION
       * ================================================================
       * SOURCE OF TRUTH: CheckoutOrderBumpSettings, CheckoutOrderBumpConfig
       *
       * Lets the website builder add an order bump checkbox to the
       * checkout form. When a customer checks the box, an additional
       * product is included in their payment (e.g., "Add warranty for $9.99").
       *
       * ONE_TIME and RECURRING prices are supported for order bumps.
       * SPLIT_PAYMENT prices are excluded because partial-pay bumps
       * are not compatible with a single checkout flow.
       * ================================================================ */}
      <PropertySection title="Order Bump" defaultOpen={element.orderBumpEnabled}>
        {/* Order Bump Enable Toggle */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className={`h-4 w-4 ${element.orderBumpEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
            <Label htmlFor="checkout-order-bump-toggle" className="text-sm font-medium cursor-pointer">
              Add order bump
            </Label>
          </div>
          <Switch
            id="checkout-order-bump-toggle"
            checked={element.orderBumpEnabled ?? false}
            onCheckedChange={(checked: boolean) => {
              updateProperty('orderBumpEnabled', checked)
            }}
          />
        </div>

        {/* Description when disabled */}
        {!element.orderBumpEnabled && (
          <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md mx-3">
            Show a checkbox on the checkout form letting customers add an extra product
            before checkout (e.g., &quot;Add warranty for $9.99&quot;).
          </div>
        )}

        {/* Order Bump Configuration — shown when enabled */}
        {element.orderBumpEnabled && (
          <div className="space-y-3 px-3 pt-1">
            {/* Order Bump Product Selector */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Bump Product</label>
              <Select
                value={element.orderBumpProductId ?? 'none'}
                onValueChange={handleOrderBumpProductSelect}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a product...">
                    {element.orderBumpProductId ? (
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <span className="truncate">
                          {element.orderBumpProductName || 'Selected product'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select a product...</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">No product selected</span>
                  </SelectItem>
                  {availableProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <span>{product.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order Bump Price Selector — shown when product is selected */}
            {element.orderBumpProductId && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Bump Price</label>
                {isOrderBumpPricesLoading ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading prices...</span>
                  </div>
                ) : (
                  <Select
                    value={element.orderBumpPriceId ?? 'none'}
                    onValueChange={handleOrderBumpPriceSelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a price...">
                        {element.orderBumpPriceId ? (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-primary" />
                            <span className="truncate">
                              {element.orderBumpPriceAmount
                                ? formatCurrency(
                                    element.orderBumpPriceAmount,
                                    element.orderBumpPriceCurrency ?? 'usd'
                                  )
                                : 'Selected price'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Select a price...</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">Select a price...</span>
                      </SelectItem>
                      {/* Filter out SPLIT_PAYMENT — bumps support ONE_TIME and RECURRING */}
                      {(orderBumpProductData?.prices ?? [])
                        .filter(
                          (price: { billingType: string }) =>
                            price.billingType !== 'SPLIT_PAYMENT'
                        )
                        .map(
                          (price: {
                            id: string
                            name: string
                            amount: number
                            currency: string
                            billingType: string
                            interval?: string | null
                            intervalCount?: number | null
                            stripePriceId?: string | null
                            trialDays?: number | null
                          }) => (
                            <SelectItem key={price.id} value={price.id}>
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4 text-primary" />
                                <span>{price.name}</span>
                                <span className="text-muted-foreground">
                                  {formatCurrency(price.amount, price.currency)}
                                  {' '}
                                  ({formatBillingType(price.billingType, price.interval)})
                                </span>
                                {/* Trial badge ONLY for RECURRING bump prices — SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
                                {price.billingType === 'RECURRING' && price.trialDays && price.trialDays > 0 && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded">
                                    {price.trialDays}-day trial
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          )
                        )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Custom Label and Badge Text Inputs — shown when product is selected */}
            {element.orderBumpProductId && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Checkbox Label</label>
                  <input
                    type="text"
                    value={
                      element.orderBumpLabel ??
                      (element.orderBumpProductName && element.orderBumpPriceAmount
                        ? `Add ${element.orderBumpProductName} for ${formatCurrency(
                            element.orderBumpPriceAmount,
                            element.orderBumpPriceCurrency ?? 'usd'
                          )}`
                        : '')
                    }
                    onChange={(e) => updateProperty('orderBumpLabel', e.target.value)}
                    placeholder="Add product for $9.99"
                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Text shown next to the checkbox. Leave empty for default.
                  </p>
                </div>

                {/* Badge text — customizable text for the badge above the order bump card */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Badge Text</label>
                  <input
                    type="text"
                    value={element.orderBumpBadgeText ?? 'Recommended'}
                    onChange={(e) => updateProperty('orderBumpBadgeText', e.target.value)}
                    placeholder="Recommended"
                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Badge label shown above the order bump card.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </PropertySection>

      {/* ================================================================
       * AFTER PAYMENT SECTION
       * ================================================================
       * Controls what happens after a successful payment.
       * Default: show inline success message.
       * Optional: redirect to a page in this website or a custom URL.
       * ================================================================ */}
      <PropertySection title="After Payment" defaultOpen>
        {/* Redirect Toggle */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <ExternalLink className={`h-4 w-4 ${redirectEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
            <Label htmlFor="checkout-redirect-toggle" className="text-sm font-medium cursor-pointer">
              Redirect after payment
            </Label>
          </div>
          <Switch
            id="checkout-redirect-toggle"
            checked={redirectEnabled}
            onCheckedChange={(checked: boolean) => {
              updateProperty('successRedirectEnabled', checked)
              /** Persist the default redirect type ('page') when enabling for the first time. */
              if (checked && !element.successRedirectType) {
                updateProperty('successRedirectType', 'page')
              }
            }}
          />
        </div>

        {/* Redirect description when disabled */}
        {!redirectEnabled && (
          <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md mx-3">
            Shows a success message after payment. Enable to redirect users to a page or URL instead.
          </div>
        )}

        {/* Redirect Options - shown when toggle is ON */}
        {redirectEnabled && (
          <div className="space-y-3 px-3 pt-1">
            {/* Destination Type Selector - tab-style buttons */}
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
              <button
                type="button"
                onClick={() => updateProperty('successRedirectType', 'page')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  redirectType === 'page'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Website Page
              </button>
              <button
                type="button"
                onClick={() => updateProperty('successRedirectType', 'url')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  redirectType === 'url'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Custom URL
              </button>
            </div>

            {/* Page Selector - shown when redirectType is 'page' */}
            {redirectType === 'page' && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Select Page</label>
                {allPages.length > 0 ? (
                  <Select
                    value={element.successRedirectPageSlug ?? '__none__'}
                    onValueChange={(val) => updateProperty('successRedirectPageSlug', val === '__none__' ? undefined : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a page...">
                        {element.successRedirectPageSlug ? (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="truncate">
                              {allPages.find((p) => p.slug === element.successRedirectPageSlug)?.name ?? element.successRedirectPageSlug}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Select a page...</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">Select a page...</span>
                      </SelectItem>
                      {allPages.map((page) => (
                        <SelectItem key={page.id} value={page.slug}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span>{page.name}</span>
                            <span className="text-muted-foreground text-xs">{page.slug}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="py-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3">
                    No pages found. Add pages to your website first.
                  </div>
                )}
              </div>
            )}

            {/* Custom URL Input - shown when redirectType is 'url' */}
            {redirectType === 'url' && (
              <div className="space-y-3">
                <InputGroupControl
                  label="URL"
                  value={element.successRedirectUrl ?? ''}
                  onChange={(val) => updateProperty('successRedirectUrl', String(val))}
                  type="text"
                />
                <ToggleControl
                  label="Open in New Tab"
                  checked={element.successRedirectNewTab ?? false}
                  onChange={(checked) => updateProperty('successRedirectNewTab', checked)}
                />
              </div>
            )}
          </div>
        )}
      </PropertySection>

      {/* Info Section - Explains the element's purpose */}
      <PropertySection title="How It Works" defaultOpen={false}>
        <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md space-y-2">
          <p>
            This element displays the shopping cart contents and handles payment processing.
          </p>
          <p>
            <strong>Required:</strong> Works with Add to Cart buttons to collect cart items.
          </p>
          <p>
            <strong>Checkout Flow:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Customer reviews cart items</li>
            <li>Customer adjusts quantities if needed</li>
            <li>Customer enters payment details</li>
            <li>Payment is processed securely on-site</li>
            <li>Confirmation shown on completion</li>
          </ol>
        </div>
      </PropertySection>
    </>
  )
}
