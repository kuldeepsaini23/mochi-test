/**
 * ============================================================================
 * ADD TO CART BUTTON SETTINGS SECTION - Configuration for Add to Cart Elements
 * ============================================================================
 *
 * SOURCE OF TRUTH: Add to Cart button element settings in the Properties Panel
 *
 * Renders the Settings tab content for Add to Cart button elements.
 * Supports two modes:
 *
 *   1. CMS Mode — button inside a SmartCMS List or dynamic page, product data
 *      comes from the CMS row automatically (no settings needed).
 *   2. Standalone Mode — user picks a product + price from dropdowns, data is
 *      stored on the element itself (standalone* fields).
 *
 * ============================================================================
 * SETTINGS
 * ============================================================================
 *
 * 1. Label text — What the button says (default: "Add to Cart")
 * 2. Variant — primary, secondary, outline, ghost
 * 3. Standalone Product — Product + price picker for standalone mode
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { Package, DollarSign, Loader2, AlertCircle, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { useBuilderContextSafe } from '../../_lib/builder-context'
import { PropertySection, InputGroupControl, DropdownControl } from './controls'
import { useAppDispatch, updateElement } from '../../_lib'
import type { AddToCartButtonElement } from '../../_lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ============================================================================
// TYPES
// ============================================================================

interface AddToCartButtonSettingsSectionProps {
  element: AddToCartButtonElement
}

/**
 * Inline type for prices returned by the products.getById query.
 *
 * SOURCE OF TRUTH: Price shape from products tRPC router — matches the Prisma
 * Price model fields used in the product picker UI.
 */
interface PriceOption {
  id: string
  name: string
  amount: number
  currency: string
  billingType: string
  interval?: string | null
  intervalCount?: number | null
  stripePriceId?: string | null
  /** Free trial duration in days — cached from the Prisma Price model */
  trialDays?: number | null
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format billing type for display in the price dropdown.
 * e.g. "ONE_TIME" → "One-time", "RECURRING" + "MONTH" → "per MONTH"
 */
function formatBillingType(billingType: string, interval?: string | null): string {
  switch (billingType) {
    case 'ONE_TIME':
      return 'One-time'
    case 'RECURRING':
      return interval ? `per ${interval.toLowerCase()}` : 'Recurring'
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
 * Renders Add to Cart button settings in the Settings tab.
 *
 * Allows configuring:
 *   - Label and variant (appearance)
 *   - Standalone product + price picker (for use outside CMS context)
 *
 * The product picker follows the same pattern as PaymentSettingsPanel —
 * fetches products via tRPC, shows product/price select dropdowns,
 * and writes all standalone fields to the element in a single dispatch.
 */
export function AddToCartButtonSettingsSection({ element }: AddToCartButtonSettingsSectionProps) {
  const dispatch = useAppDispatch()
  const builderContext = useBuilderContextSafe()
  const organizationId = builderContext?.organizationId

  // ========================================================================
  // ELEMENT UPDATER
  // ========================================================================

  /**
   * Generic updater for element properties.
   */
  const updateProperty = <K extends keyof AddToCartButtonElement>(
    key: K,
    value: AddToCartButtonElement[K]
  ) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { [key]: value },
      })
    )
  }

  // ========================================================================
  // DATA FETCHING — Products and prices for standalone picker
  // ========================================================================

  /**
   * Fetch all active products from the organization.
   * Same pattern as PaymentSettingsPanel.
   */
  const { data: productsData, isLoading: isProductsLoading } = trpc.products.list.useQuery(
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
   * Fetch the selected product details to get available prices.
   * Only runs when a standalone product is selected.
   */
  const { data: selectedProductData, isLoading: isPricesLoading } = trpc.products.getById.useQuery(
    {
      organizationId: organizationId ?? '',
      productId: element.standaloneProductId ?? '',
    },
    {
      enabled: Boolean(organizationId && element.standaloneProductId),
      staleTime: 0,
      refetchOnMount: 'always',
    }
  )

  // ========================================================================
  // HANDLERS
  // ========================================================================

  /**
   * Handle product selection from dropdown.
   * Sets the product ID/name and resets any previously selected price.
   */
  const handleProductSelect = (productId: string) => {
    const availableProducts = productsData?.products || []

    if (productId === 'none') {
      // Clear all standalone fields
      handleClearProduct()
      return
    }

    const selectedProduct = availableProducts.find(
      (p: { id: string; name: string }) => p.id === productId
    )

    if (selectedProduct) {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            standaloneProductId: selectedProduct.id,
            standaloneProductName: selectedProduct.name,
            // Reset price when product changes
            standaloneStripePriceId: undefined,
            standalonePriceInCents: undefined,
            standaloneCurrency: undefined,
            standaloneBillingType: undefined,
            standaloneBillingInterval: undefined,
            standaloneIntervalCount: undefined,
            standaloneTrialDays: undefined,
          },
        })
      )
    }
  }

  /**
   * Handle price selection from dropdown.
   * Populates ALL standalone fields in one dispatch — this is the data
   * that useAddToCart reads when in standalone mode.
   */
  const handlePriceSelect = (priceId: string) => {
    if (!selectedProductData?.prices) return

    if (priceId === 'none') {
      // Reset price fields but keep product selected
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            standaloneStripePriceId: undefined,
            standalonePriceInCents: undefined,
            standaloneCurrency: undefined,
            standaloneBillingType: undefined,
            standaloneBillingInterval: undefined,
            standaloneIntervalCount: undefined,
            standaloneTrialDays: undefined,
          },
        })
      )
      return
    }

    const selectedPrice = selectedProductData.prices.find(
      (p: PriceOption) => p.id === priceId
    )

    if (selectedPrice) {
      /**
       * Resolve the Stripe price ID — some price models store it directly
       * on the price object, others require looking at different fields.
       */
      const stripePriceId = selectedPrice.stripePriceId || selectedPrice.id

      /** Map billing type to the supported cart types (ONE_TIME or RECURRING) */
      const billingType: 'ONE_TIME' | 'RECURRING' =
        selectedPrice.billingType === 'RECURRING' ? 'RECURRING' : 'ONE_TIME'

      dispatch(
        updateElement({
          id: element.id,
          updates: {
            standaloneStripePriceId: stripePriceId,
            standaloneProductName: element.standaloneProductName,
            standaloneProductImage: (selectedProductData as Record<string, unknown>).image as string | undefined,
            standalonePriceInCents: selectedPrice.amount,
            standaloneCurrency: selectedPrice.currency,
            standaloneBillingType: billingType,
            standaloneBillingInterval: billingType === 'RECURRING'
              ? (selectedPrice.interval as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | undefined)
              : undefined,
            standaloneIntervalCount: billingType === 'RECURRING'
              ? (selectedPrice.intervalCount ?? 1)
              : undefined,
            /** Cache trial days ONLY for RECURRING — Stripe has no trial for ONE_TIME. SOURCE OF TRUTH: RecurringOnlyTrialGuard */
            standaloneTrialDays: billingType === 'RECURRING' && selectedPrice.trialDays && selectedPrice.trialDays > 0
              ? selectedPrice.trialDays
              : undefined,
          },
        })
      )
    }
  }

  /**
   * Clear all standalone product configuration — resets the button
   * to require CMS context for functionality.
   */
  const handleClearProduct = () => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          standaloneProductId: undefined,
          standaloneProductName: undefined,
          standaloneProductImage: undefined,
          standaloneStripePriceId: undefined,
          standalonePriceInCents: undefined,
          standaloneCurrency: undefined,
          standaloneBillingType: undefined,
          standaloneBillingInterval: undefined,
          standaloneIntervalCount: undefined,
          standaloneTrialDays: undefined,
        },
      })
    )
  }

  // ========================================================================
  // DERIVED VALUES
  // ========================================================================

  const availableProducts = productsData?.products || []
  const availablePrices = (selectedProductData?.prices || []) as PriceOption[]
  const hasStandaloneConfig = Boolean(element.standaloneStripePriceId)

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <>
      {/* ================================================================
          Button Content Section — Label + Variant
          ================================================================ */}
      <PropertySection title="Button Content" defaultOpen>
        <InputGroupControl
          label="Label"
          value={element.label ?? 'Add to Cart'}
          onChange={(val) => updateProperty('label', String(val))}
          type="text"
        />

        <DropdownControl
          label="Variant"
          value={element.variant ?? 'primary'}
          options={[
            { value: 'primary', label: 'Primary' },
            { value: 'secondary', label: 'Secondary' },
            { value: 'outline', label: 'Outline' },
            { value: 'ghost', label: 'Ghost' },
          ]}
          onChange={(val) => updateProperty('variant', val as AddToCartButtonElement['variant'])}
        />
      </PropertySection>

      {/* ================================================================
          Standalone Product Section — Product + Price picker
          Only shown when builder context is available (has organizationId).
          ================================================================ */}
      {organizationId && (
        <PropertySection title="Standalone Product" defaultOpen>
          {/* Loading products state */}
          {isProductsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading products...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Product selection dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Product</label>
                <Select
                  value={element.standaloneProductId || 'none'}
                  onValueChange={handleProductSelect}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a product...">
                      {element.standaloneProductId ? (
                        <div className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-primary" />
                          <span className="truncate text-xs">
                            {element.standaloneProductName || 'Selected product'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Select a product...</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">No product</span>
                    </SelectItem>
                    {availableProducts.length > 0 ? (
                      availableProducts.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex items-center gap-2">
                            <Package className="h-3.5 w-3.5 text-primary" />
                            <span>{product.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-xs text-muted-foreground text-center">
                        No active products available.
                        <br />
                        Create a product first.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Price selection dropdown — shown when product is selected */}
              {element.standaloneProductId && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Price</label>
                  {isPricesLoading ? (
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Loading prices...</span>
                    </div>
                  ) : (
                    <Select
                      value={element.standaloneStripePriceId || 'none'}
                      onValueChange={handlePriceSelect}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a price...">
                          {element.standaloneStripePriceId ? (
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-3.5 w-3.5 text-primary" />
                              <span className="truncate text-xs">
                                {element.standalonePriceInCents != null
                                  ? formatCurrency(element.standalonePriceInCents, element.standaloneCurrency || 'usd')
                                  : 'Selected price'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">Select a price...</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">No price selected</span>
                        </SelectItem>
                        {availablePrices.length > 0 ? (
                          availablePrices.map((price) => (
                            <SelectItem key={price.id} value={price.id}>
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-3.5 w-3.5 text-primary" />
                                <span>{price.name}</span>
                                <span className="text-muted-foreground text-xs">
                                  {formatCurrency(price.amount, price.currency)}
                                  {' '}
                                  {formatBillingType(price.billingType, price.interval)}
                                </span>
                                {/* Trial badge — ONLY for RECURRING prices. SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
                                {price.billingType === 'RECURRING' && price.trialDays && price.trialDays > 0 && (
                                  <span className="text-emerald-600 text-[10px]">
                                    {price.trialDays}d trial
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <div className="p-2 text-xs text-muted-foreground text-center">
                            No prices available for this product.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Summary card — shows selected product + price when configured */}
              {hasStandaloneConfig && (
                <div className="flex items-start justify-between gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/10">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs font-medium truncate">
                      {element.standaloneProductName || 'Product'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {element.standalonePriceInCents != null
                        ? formatCurrency(element.standalonePriceInCents, element.standaloneCurrency || 'usd')
                        : 'Price not set'}
                      {element.standaloneBillingType === 'RECURRING' && element.standaloneBillingInterval && (
                        <span> / {element.standaloneBillingInterval.toLowerCase()}</span>
                      )}
                      {/* Trial badge in summary — ONLY for RECURRING. SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
                      {element.standaloneBillingType === 'RECURRING' && element.standaloneTrialDays && element.standaloneTrialDays > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {' \u00b7 '}{element.standaloneTrialDays}-day free trial
                        </span>
                      )}
                    </p>
                  </div>
                  {/* Clear button */}
                  <button
                    type="button"
                    onClick={handleClearProduct}
                    className="flex-shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Clear product selection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </PropertySection>
      )}

      {/* ================================================================
          Info Section — Explains how the button works with both modes
          ================================================================ */}
      <PropertySection title="How It Works" defaultOpen={false}>
        <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md space-y-2">
          <p>
            This button adds a product to the shopping cart when clicked.
          </p>
          <p>
            <strong>Option 1:</strong> Place inside a SmartCMS List connected to a Store table.
            The button automatically uses the product data from the current CMS row.
          </p>
          <p>
            <strong>Option 2:</strong> Select a product above to use the button standalone —
            no CMS list required.
          </p>
          <p className="text-[11px] opacity-70">
            When both are available, CMS context takes priority over standalone config.
          </p>
        </div>
      </PropertySection>
    </>
  )
}
