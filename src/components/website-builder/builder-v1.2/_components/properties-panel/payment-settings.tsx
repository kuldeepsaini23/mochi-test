/**
 * ============================================================================
 * PAYMENT SETTINGS PANEL - Select and configure payment products
 * ============================================================================
 *
 * SOURCE OF TRUTH: Payment Element Settings
 *
 * Settings panel for the Payment element in the Website Builder.
 * Allows users to select a product and price for the payment form.
 *
 * FEATURES:
 * - Dropdown to select from active products
 * - Dropdown to select from available prices for the product
 * - Shows product name, price, and billing type
 * - Updates element with selected product ID, price ID, and cached info
 *
 * IMPORTANT:
 * - Only ACTIVE products are shown (products that are ready to accept payments)
 * - Products are fetched from the organization's products list
 * - Uses Redux dispatch directly (like FormSettingsPanel)
 *
 * ============================================================================
 */

'use client'

import { CreditCard, AlertCircle, Loader2, Package, DollarSign, FlaskConical, ExternalLink, FileText, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { useBuilderContextSafe } from '../../_lib/builder-context'
import { useAppDispatch, useAppSelector, updateElement, selectPageInfos } from '../../_lib'
import type { PaymentElement } from '../../_lib/types'
import { PropertySection, InputGroupControl, ToggleControl } from './controls'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

// ============================================================================
// TYPES
// ============================================================================

interface PaymentSettingsPanelProps {
  /** The payment element being configured */
  element: PaymentElement
}


/**
 * Helper function to format billing type for display.
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

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Payment settings panel for selecting which product/price to display.
 *
 * USAGE:
 * ```tsx
 * <PaymentSettingsPanel element={selectedPaymentElement} />
 * ```
 */
export function PaymentSettingsPanel({
  element,
}: PaymentSettingsPanelProps) {
  // ========================================================================
  // REDUX & CONTEXT
  // ========================================================================

  const dispatch = useAppDispatch()
  const builderContext = useBuilderContextSafe()
  const organizationId = builderContext?.organizationId

  /**
   * Get all pages for the post-payment redirect page selector.
   * Uses the same pattern as button-settings.tsx for page dropdowns.
   */
  const allPages = useAppSelector(selectPageInfos)

  // ========================================================================
  // DATA FETCHING - Fetch active products for selection
  // ========================================================================

  /**
   * Fetch all active products from the organization.
   * Only active products can be used for payments.
   */
  const { data: productsData, isLoading: isProductsLoading, error: productsError } = trpc.products.list.useQuery(
    {
      organizationId: organizationId ?? '',
      activeOnly: true,
      pageSize: 100, // Fetch up to 100 products
    },
    {
      enabled: Boolean(organizationId),
    }
  )

  /**
   * Fetch the selected product details to get its prices.
   *
   * FIX: When product changes, we need to refetch immediately.
   * Setting staleTime to 0 ensures the prices update instantly when
   * the user switches products, not after a 10-second delay.
   */
  const { data: selectedProductData, isLoading: isPricesLoading } = trpc.products.getById.useQuery(
    {
      organizationId: organizationId ?? '',
      productId: element.productId,
    },
    {
      enabled: Boolean(organizationId && element.productId),
      staleTime: 0, // Always refetch when productId changes
      refetchOnMount: 'always', // Refetch when component remounts
    }
  )

  // ========================================================================
  // ORDER BUMP DATA FETCHING
  // SOURCE OF TRUTH: OrderBumpProductFetch
  // ========================================================================

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

  // ========================================================================
  // HANDLERS
  // ========================================================================

  /**
   * Handle product selection from dropdown.
   * Updates productId, productName, and resets price selection.
   */
  const handleProductSelect = (productId: string) => {
    // Find the selected product to get its details
    const selectedProduct = productsData?.products.find((p: { id: string; name: string }) => p.id === productId)

    if (selectedProduct) {
      // Update product and reset price selection using Redux
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            // Reset price selection when product changes
            priceId: '',
            priceName: '',
            priceAmount: undefined,
            priceCurrency: undefined,
          },
        })
      )
    } else if (productId === 'none') {
      // Clear product selection
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            productId: '',
            productName: '',
            priceId: '',
            priceName: '',
            priceAmount: undefined,
            priceCurrency: undefined,
          },
        })
      )
    }
  }

  /**
   * Handle price selection from dropdown.
   * Updates priceId, priceName, priceAmount, and priceCurrency.
   */
  const handlePriceSelect = (priceId: string) => {
    if (!selectedProductData?.prices) return

    // Find the selected price to get its details
    const selectedPrice = selectedProductData.prices.find((p: { id: string }) => p.id === priceId)

    if (selectedPrice) {
      // Update price-related properties using Redux
      // Cache trialDays ONLY for RECURRING prices — Stripe has no trial for ONE_TIME/SPLIT
      // SOURCE OF TRUTH: RecurringOnlyTrialGuard
      const pTrialDays = (selectedPrice as { trialDays?: number | null; billingType?: string }).trialDays
      const pBillingType = (selectedPrice as { billingType?: string }).billingType
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            priceId: selectedPrice.id,
            priceName: selectedPrice.name,
            priceAmount: selectedPrice.amount,
            priceCurrency: selectedPrice.currency,
            trialDays: pBillingType === 'RECURRING' && pTrialDays && pTrialDays > 0 ? pTrialDays : 0,
          },
        })
      )
    } else if (priceId === 'none') {
      // Clear price selection (use default/first price)
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            priceId: '',
            priceName: '',
            priceAmount: undefined,
            priceCurrency: undefined,
            trialDays: 0,
          },
        })
      )
    }
  }

  /**
   * Handle test mode toggle.
   * When enabled, the payment element will use Stripe TEST API keys
   * and accept test credit cards (4242 4242 4242 4242).
   */
  const handleTestModeToggle = (enabled: boolean) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          testMode: enabled,
        },
      })
    )
  }

  /**
   * Generic updater for element properties.
   * Used by the "After Payment" redirect settings and order bump config.
   */
  const updateProperty = <K extends keyof PaymentElement>(
    key: K,
    value: PaymentElement[K]
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
  // SOURCE OF TRUTH: OrderBumpHandlers
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
  // RENDER
  // ========================================================================

  // ========================================================================
  // DERIVED VALUES
  // ========================================================================

  const redirectEnabled = element.successRedirectEnabled ?? false
  const redirectType = element.successRedirectType ?? 'page'

  // ========================================================================
  // RENDER
  // ========================================================================

  // No organization context available
  if (!organizationId) {
    return (
      <PropertySection title="Payment Settings" defaultOpen>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>Organization context not available</span>
        </div>
      </PropertySection>
    )
  }

  // Loading products
  if (isProductsLoading) {
    return (
      <PropertySection title="Payment Settings" defaultOpen>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading products...</span>
        </div>
      </PropertySection>
    )
  }

  // Error loading products
  if (productsError) {
    return (
      <PropertySection title="Payment Settings" defaultOpen>
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load products</span>
        </div>
      </PropertySection>
    )
  }

  // Get available products and prices
  const availableProducts = productsData?.products || []
  const availablePrices = selectedProductData?.prices || []

  return (
    <>
      <PropertySection title="Payment Settings" defaultOpen>
        {/* Product Selection Dropdown */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Select Product</label>
          <Select
            value={element.productId || 'none'}
            onValueChange={handleProductSelect}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a product...">
                {element.productId ? (
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="truncate">
                      {element.productName || 'Selected product'}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Select a product...</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* Option to clear selection */}
              <SelectItem value="none">
                <span className="text-muted-foreground">No product selected</span>
              </SelectItem>

              {/* List of active products */}
              {availableProducts.length > 0 ? (
                availableProducts.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <span>{product.name}</span>
                    </div>
                  </SelectItem>
                ))
              ) : (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  No active products available.
                  <br />
                  Create a product first.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Price Selection Dropdown - only shown when product is selected */}
        {element.productId && (
          <div className="space-y-2 mt-4">
            <label className="text-xs text-muted-foreground">Select Price</label>
            {isPricesLoading ? (
              /* Show loading state while prices are being fetched */
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading prices...</span>
              </div>
            ) : (
              <Select
                value={element.priceId || 'none'}
                onValueChange={handlePriceSelect}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a price...">
                    {element.priceId ? (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" />
                        <span className="truncate">
                          {element.priceName || 'Selected price'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Use default price</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* Option to use default price */}
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Use default price</span>
                  </SelectItem>

                  {/* List of available prices */}
                  {availablePrices.length > 0 ? (
                    availablePrices.map((price: {
                      id: string
                      name: string
                      amount: number
                      currency: string
                      billingType: string
                      interval?: string | null
                      trialDays?: number | null
                    }) => (
                      <SelectItem key={price.id} value={price.id}>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-primary" />
                          <span>{price.name}</span>
                          <span className="text-muted-foreground">
                            {formatCurrency(price.amount, price.currency)}
                            {' '}
                            {formatBillingType(price.billingType, price.interval)}
                          </span>
                          {/* Trial badge — ONLY for RECURRING prices. SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
                          {price.billingType === 'RECURRING' && price.trialDays && price.trialDays > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded">
                              {price.trialDays}-day trial
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      No prices available for this product.
                      <br />
                      Add a price to the product.
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Test Mode Toggle */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className={`h-4 w-4 ${element.testMode ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <Label htmlFor="test-mode" className="text-sm font-medium cursor-pointer">
                Test Mode
              </Label>
              {element.testMode && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                  TEST
                </span>
              )}
            </div>
            <Switch
              id="test-mode"
              checked={element.testMode ?? false}
              onCheckedChange={handleTestModeToggle}
            />
          </div>
        </div>
      </PropertySection>

      {/* ================================================================
       * ORDER BUMP SECTION
       * ================================================================
       * SOURCE OF TRUTH: OrderBumpSettings, PaymentOrderBumpConfig
       *
       * Lets the website builder add an order bump checkbox to the
       * payment form. When a customer checks the box, an additional
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
            <Label htmlFor="order-bump-toggle" className="text-sm font-medium cursor-pointer">
              Add order bump
            </Label>
          </div>
          <Switch
            id="order-bump-toggle"
            checked={element.orderBumpEnabled ?? false}
            onCheckedChange={(checked: boolean) => {
              updateProperty('orderBumpEnabled', checked)
            }}
          />
        </div>

        {/* Description when disabled */}
        {!element.orderBumpEnabled && (
          <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md mx-3">
            Show a checkbox on the payment form letting customers add an extra product
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
                                {/* Trial badge for RECURRING bump prices only — SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
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

            {/* Custom Label Input */}
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
            <Label htmlFor="payment-redirect-toggle" className="text-sm font-medium cursor-pointer">
              Redirect after payment
            </Label>
          </div>
          <Switch
            id="payment-redirect-toggle"
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
    </>
  )
}
