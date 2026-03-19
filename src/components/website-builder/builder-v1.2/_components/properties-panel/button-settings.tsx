/**
 * ============================================================================
 * BUTTON SETTINGS SECTION - Action Configuration for Button Elements
 * ============================================================================
 *
 * SOURCE OF TRUTH: Button element action settings in the Properties Panel
 *
 * Renders the Settings tab content for button elements, allowing users to
 * configure what happens when the button is clicked.
 *
 * ============================================================================
 * ACTION TYPES
 * ============================================================================
 *
 * 1. NONE: No action (default)
 * 2. LINK: Navigate to a manually-entered URL (external or arbitrary path)
 * 3. PAGE LINK: Navigate to an internal website page (selected from pages list)
 * 4. DYNAMIC PAGE LINK: Navigate to a dynamic page with CMS row context
 * 5. ONE CLICK UPSELL: Process a one-click upsell payment using a secure token
 * 6. POPUP: Show a popup (future)
 * 7. SCROLL: Scroll to a section (future)
 *
 * ============================================================================
 * PAGE LINKS vs MANUAL LINKS
 * ============================================================================
 *
 * The "Navigate" action type shows a toggle between:
 * - Page icon (FileText) → select an internal website page from a dropdown
 * - Link icon (Link2) → enter any URL manually
 *
 * This mirrors the navbar link pattern for a consistent builder UX.
 * When a page is selected, href is auto-populated from the page's slug
 * and pageId tracks the internal association.
 *
 * ============================================================================
 * ONE CLICK UPSELL
 * ============================================================================
 *
 * The "One Click Upsell" action type shows product/price selectors.
 * When clicked in preview mode, it reads a secure upsell token from URL params
 * and processes a one-click charge using the customer's existing payment method.
 *
 * SECURITY: Payment intent/method data is NEVER stored client-side.
 * A short-lived, one-time-use UpsellToken is created server-side after
 * initial payment and passed via URL params to the upsell page.
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { FileText, Link2, ExternalLink, Package, DollarSign, Loader2, Zap } from 'lucide-react'
import { PropertySection, DropdownControl, ToggleControl } from './controls'
import { useAppDispatch, useAppSelector, updateElement, selectPageInfos } from '../../_lib'
import type { ButtonElement, ButtonAction } from '../../_lib/types'
import { cn, formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { useBuilderContextSafe } from '../../_lib/builder-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ButtonSettingsSectionProps {
  element: ButtonElement
}

/**
 * Helper to format billing type label for price display.
 * Used in the upsell product/price dropdowns.
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
 * Renders button action settings in the Settings tab.
 * Allows configuring click behavior: navigate (page or URL), dynamic link,
 * one-click upsell, etc.
 *
 * SOURCE OF TRUTH: ButtonSettingsSection, ButtonActionSettings
 */
export function ButtonSettingsSection({ element }: ButtonSettingsSectionProps) {
  const dispatch = useAppDispatch()
  const builderContext = useBuilderContextSafe()
  const organizationId = builderContext?.organizationId

  /**
   * Get all pages for page selection and dynamic page filtering.
   * allPages: every page in the website (for page-link).
   * dynamicPages: only pages with cmsTableId (for dynamic-link).
   */
  const allPages = useAppSelector(selectPageInfos)
  const dynamicPages = allPages.filter((page) => page.cmsTableId)

  /**
   * Current action configuration.
   * Defaults to { type: 'none' } if not set.
   */
  const action = element.action ?? { type: 'none' as const }

  /**
   * Whether the current "Navigate" action is in page-link mode vs manual URL.
   * Used to toggle between page selector and URL input.
   */
  const isPageMode = action.type === 'page-link'
  const isLinkMode = action.type === 'link'
  const isNavigateAction = isPageMode || isLinkMode

  // ========================================================================
  // UPSELL DATA FETCHING
  // ========================================================================

  /**
   * Fetch active products for the upsell product selector.
   * Only fetched when the action type is 'one-click-upsell'.
   */
  const { data: upsellProductsData, isLoading: isUpsellProductsLoading } =
    trpc.products.list.useQuery(
      {
        organizationId: organizationId ?? '',
        activeOnly: true,
        pageSize: 100,
      },
      {
        enabled: Boolean(organizationId && action.type === 'one-click-upsell'),
      }
    )

  /**
   * Fetch the selected upsell product's prices.
   * Only fetched when an upsell product is selected.
   */
  const { data: upsellPricesData, isLoading: isUpsellPricesLoading } =
    trpc.products.getById.useQuery(
      {
        organizationId: organizationId ?? '',
        productId: action.upsellProductId ?? '',
      },
      {
        enabled: Boolean(
          organizationId &&
            action.type === 'one-click-upsell' &&
            action.upsellProductId
        ),
        staleTime: 0,
        refetchOnMount: 'always',
      }
    )

  // ========================================================================
  // HANDLERS
  // ========================================================================

  /**
   * Update the action configuration on the element.
   * Merges updates with the current action.
   */
  const updateAction = (updates: Partial<ButtonAction>) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          action: {
            ...action,
            ...updates,
          },
        },
      })
    )
  }

  /**
   * Handle top-level action type change.
   * Resets type-specific fields when switching between action categories.
   */
  const handleActionTypeChange = (newType: string) => {
    const typedNewType = newType as ButtonAction['type']

    /**
     * When switching to "Navigate", default to page-link mode if pages exist,
     * otherwise fall back to manual URL mode.
     */
    if (typedNewType === 'page-link') {
      if (allPages.length > 0) {
        const firstPage = allPages[0]
        dispatch(
          updateElement({
            id: element.id,
            updates: {
              action: {
                type: 'page-link',
                pageId: firstPage.id,
                pageSlug: firstPage.slug,
                openInNewTab: action.openInNewTab,
              },
            },
          })
        )
      } else {
        dispatch(
          updateElement({
            id: element.id,
            updates: {
              action: {
                type: 'link',
                href: '',
                openInNewTab: action.openInNewTab,
              },
            },
          })
        )
      }
      return
    }

    /**
     * When switching to "One Click Upsell", reset navigation fields
     * and initialize upsell-specific fields as empty.
     */
    if (typedNewType === 'one-click-upsell') {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            action: {
              type: 'one-click-upsell',
              upsellProductId: undefined,
              upsellPriceId: undefined,
              upsellProductName: undefined,
              upsellPriceAmount: undefined,
              upsellPriceCurrency: undefined,
            },
          },
        })
      )
      return
    }

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          action: {
            type: typedNewType,
            href: typedNewType === 'link' ? (action.href ?? '') : undefined,
            pageId: undefined,
            pageSlug: undefined,
            targetPageSlug: typedNewType === 'dynamic-link' ? action.targetPageSlug : undefined,
            openInNewTab: action.openInNewTab,
          },
        },
      })
    )
  }

  /**
   * Toggle between page-link and manual link modes within "Navigate".
   * Mirrors the navbar LinkItem toggle pattern.
   */
  const handleNavigateModeToggle = () => {
    if (isPageMode) {
      /* Switch to manual URL mode — preserve href from page slug */
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            action: {
              type: 'link',
              href: action.pageSlug ?? '',
              pageId: undefined,
              pageSlug: undefined,
              openInNewTab: action.openInNewTab,
            },
          },
        })
      )
    } else {
      /* Switch to page-link mode — auto-select the first page */
      if (allPages.length > 0) {
        const firstPage = allPages[0]
        dispatch(
          updateElement({
            id: element.id,
            updates: {
              action: {
                type: 'page-link',
                pageId: firstPage.id,
                pageSlug: firstPage.slug,
                href: undefined,
                openInNewTab: action.openInNewTab,
              },
            },
          })
        )
      }
    }
  }

  /**
   * Handle page selection from the page dropdown.
   * Updates pageId and pageSlug to track the selected page.
   */
  const handlePageSelect = (pageId: string) => {
    const page = allPages.find((p) => p.id === pageId)
    if (page) {
      updateAction({
        pageId: page.id,
        pageSlug: page.slug,
      })
    }
  }

  /**
   * Handle upsell product selection.
   * Updates upsellProductId and cached name, resets price selection.
   */
  const handleUpsellProductSelect = (productId: string) => {
    const product = upsellProductsData?.products.find(
      (p: { id: string; name: string }) => p.id === productId
    )
    if (product) {
      updateAction({
        upsellProductId: product.id,
        upsellProductName: product.name,
        /* Reset price when product changes */
        upsellPriceId: undefined,
        upsellPriceAmount: undefined,
        upsellPriceCurrency: undefined,
      })
    } else if (productId === 'none') {
      updateAction({
        upsellProductId: undefined,
        upsellProductName: undefined,
        upsellPriceId: undefined,
        upsellPriceAmount: undefined,
        upsellPriceCurrency: undefined,
      })
    }
  }

  /**
   * Handle upsell price selection.
   * Updates upsellPriceId and cached amount/currency.
   */
  const handleUpsellPriceSelect = (priceId: string) => {
    if (!upsellPricesData?.prices) return
    const price = upsellPricesData.prices.find(
      (p: { id: string }) => p.id === priceId
    )
    if (price) {
      updateAction({
        upsellPriceId: price.id,
        upsellPriceAmount: price.amount,
        upsellPriceCurrency: price.currency,
      })
    } else if (priceId === 'none') {
      updateAction({
        upsellPriceId: undefined,
        upsellPriceAmount: undefined,
        upsellPriceCurrency: undefined,
      })
    }
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <>
    <PropertySection title="Button Action" defaultOpen>
      {/* Action Type Selector — top-level action category */}
      <DropdownControl
        label="On Click"
        value={isNavigateAction ? 'page-link' : action.type}
        options={[
          { value: 'none', label: 'None' },
          { value: 'page-link', label: 'Navigate' },
          { value: 'dynamic-link', label: 'Dynamic Page Link' },
          { value: 'one-click-upsell', label: 'One Click Upsell' },
          // Future: { value: 'popup', label: 'Show Popup' },
          // Future: { value: 'scroll', label: 'Scroll To' },
        ]}
        onChange={handleActionTypeChange}
      />

      {/* ================================================================
          NAVIGATE ACTION — Page link or manual URL with toggle
          ================================================================ */}
      {isNavigateAction && (
        <div className="space-y-2.5 mt-1">
          {/* Mode toggle + input in a compact inline row */}
          <div className="flex items-center gap-1.5">
            {/* Page / URL mode toggle button */}
            <button
              type="button"
              onClick={handleNavigateModeToggle}
              className={cn(
                'shrink-0 p-1.5 rounded transition-colors',
                isPageMode
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              title={
                isPageMode
                  ? 'Linked to page (click for custom URL)'
                  : 'Custom URL (click for page link)'
              }
            >
              {isPageMode ? (
                <FileText className="h-3.5 w-3.5" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Page selector dropdown OR manual URL input */}
            {isPageMode ? (
              <select
                value={action.pageId || ''}
                onChange={(e) => handlePageSelect(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary truncate"
              >
                {allPages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={action.href ?? ''}
                onChange={(e) => updateAction({ href: e.target.value })}
                placeholder="/page-url or https://..."
                className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            )}

            {/* New tab indicator icon */}
            {action.openInNewTab && (
              <div className="shrink-0 p-1 text-muted-foreground/60" title="Opens in new tab">
                <ExternalLink className="h-3 w-3" />
              </div>
            )}
          </div>

          {/* Mode hint — tells user they can switch */}
          <p className="text-[10px] text-muted-foreground leading-tight px-0.5">
            {isPageMode
              ? 'Linked to a website page. Click the icon to enter a custom URL instead.'
              : 'Enter any URL. Click the icon to link to a website page instead.'}
          </p>

          {/* Open in New Tab toggle */}
          <ToggleControl
            label="Open in New Tab"
            checked={action.openInNewTab ?? false}
            onChange={(val) => updateAction({ openInNewTab: val })}
          />
        </div>
      )}

      {/* ================================================================
          DYNAMIC PAGE LINK — CMS-powered page with row context
          ================================================================ */}
      {action.type === 'dynamic-link' && (
        <>
          {dynamicPages.length > 0 ? (
            <DropdownControl
              label="Target Page"
              value={action.targetPageSlug ?? '__none__'}
              options={[
                { value: '__none__', label: 'Select a page...' },
                ...dynamicPages.map((page) => ({
                  value: page.slug.replace(/^\//, ''),
                  label: page.name,
                })),
              ]}
              onChange={(val) => {
                /**
                 * When selecting a dynamic page, also cache its cmsSlugColumnSlug
                 * so the button URL uses SEO-friendly slugs in preview/published mode.
                 */
                const selectedPage = dynamicPages.find((p) => p.slug.replace(/^\//, '') === val)
                updateAction({
                  targetPageId: val === '__none__' ? undefined : selectedPage?.id,
                  targetPageSlug: val === '__none__' ? undefined : val,
                  targetPageSlugColumn: selectedPage?.cmsSlugColumnSlug ?? undefined,
                })
              }}
            />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md">
              No dynamic pages found. Create a page and connect it to a CMS table first.
            </div>
          )}
          <p className="px-1 text-[10px] text-muted-foreground leading-tight">
            When inside a SmartCMS List, clicking navigates to the selected page with the
            current row&apos;s data.
          </p>

          {/* Open in New Tab toggle for dynamic links */}
          <ToggleControl
            label="Open in New Tab"
            checked={action.openInNewTab ?? false}
            onChange={(val) => updateAction({ openInNewTab: val })}
          />
        </>
      )}

      {/* ================================================================
          ONE CLICK UPSELL — Product/Price selector for upsell offers
          ================================================================

          After a customer completes a payment, they can be redirected to
          an upsell page. This button charges the selected product using
          a secure server-side token (NOT localStorage).

          SECURITY: The UpsellToken stores the Stripe customer ID and
          payment method server-side. The client only sees an opaque token
          in the URL params that expires after 30 minutes.
          ================================================================ */}
      {action.type === 'one-click-upsell' && (
        <div className="space-y-3 mt-1">
          {/* Upsell info banner */}
          <div className="flex items-start gap-2 px-3 py-2 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md">
            <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              One-click purchase using the customer&apos;s payment method from their
              previous transaction. Place this button on a page that customers
              are redirected to after payment.
            </span>
          </div>

          {/* Upsell Product Selector */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Upsell Product</label>
            {isUpsellProductsLoading ? (
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading products...</span>
              </div>
            ) : (
              <Select
                value={action.upsellProductId ?? 'none'}
                onValueChange={handleUpsellProductSelect}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a product...">
                    {action.upsellProductId ? (
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <span className="truncate">
                          {action.upsellProductName || 'Selected product'}
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
                  {(upsellProductsData?.products ?? []).map(
                    (product: { id: string; name: string }) => (
                      <SelectItem key={product.id} value={product.id}>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          <span>{product.name}</span>
                        </div>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Upsell Price Selector — shown when product is selected */}
          {action.upsellProductId && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Upsell Price</label>
              {isUpsellPricesLoading ? (
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading prices...</span>
                </div>
              ) : (
                <Select
                  value={action.upsellPriceId ?? 'none'}
                  onValueChange={handleUpsellPriceSelect}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a price...">
                      {action.upsellPriceId ? (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-primary" />
                          <span className="truncate">
                            {action.upsellPriceAmount
                              ? formatCurrency(
                                  action.upsellPriceAmount,
                                  action.upsellPriceCurrency ?? 'usd'
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
                    {(upsellPricesData?.prices ?? []).map(
                      (price: {
                        id: string
                        name: string
                        amount: number
                        currency: string
                        billingType: string
                        interval?: string | null
                      }) => (
                        <SelectItem key={price.id} value={price.id}>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-primary" />
                            <span>{price.name}</span>
                            <span className="text-muted-foreground">
                              {formatCurrency(price.amount, price.currency)}{' '}
                              {formatBillingType(price.billingType, price.interval)}
                            </span>
                          </div>
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Security note */}
          <p className="px-1 text-[10px] text-muted-foreground leading-tight">
            The payment method from the customer&apos;s original transaction is stored
            securely on the server. No payment data is exposed to the browser.
          </p>
        </div>
      )}
    </PropertySection>

    {/* ================================================================
        SEO / ACCESSIBILITY — Aria label for screen readers
        SOURCE OF TRUTH: ButtonAriaLabel, AccessibleButtonLabel
        ================================================================ */}
    <PropertySection title="SEO" defaultOpen>
      <div className="space-y-1.5 px-1">
        <label className="text-xs font-medium text-muted-foreground">Aria Label</label>
        <input
          type="text"
          value={element.ariaLabel || ''}
          onChange={(e) =>
            dispatch(
              updateElement({
                id: element.id,
                updates: { ariaLabel: e.target.value || undefined },
              })
            )
          }
          placeholder={element.label || 'Button'}
          className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p className="text-[10px] text-muted-foreground">
          Describes the button for screen readers when the label isn&apos;t descriptive enough.
        </p>
      </div>
    </PropertySection>
    </>
  )
}
