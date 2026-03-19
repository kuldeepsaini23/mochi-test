/**
 * ============================================================================
 * UNIFIED PAYMENT ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedPayment, unified-payment, payment-element-unified
 *
 * This component replaces BOTH:
 *   - elements/payment-element.tsx (canvas editor)
 *   - renderers/element-renderers/payment-element-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders CONTENT ONLY -- the payment form (or placeholder states).
 * In canvas mode, the parent `ElementWrapper` handles all editor chrome:
 *   - Selection ring, hover ring, resize handles, labels, dimensions pill
 *   - Pointer events (drag, hover enter/leave)
 *
 * In preview mode, this component wraps content in a positioned container
 * using `computeElementPositionStyles()` and `useElementSizeStyles()`.
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * BOTH MODES:
 *   - tRPC product fetch via products.getById
 *   - Gradient border support via useGradientBorder + GradientBorderOverlay
 *   - Background color and border radius from element.styles
 *   - PAYMENT_FORM_MAX_WIDTH constraint for good checkout UX
 *
 * CANVAS MODE (mode='canvas'):
 *   - organizationId from useBuilderContextSafe()
 *   - Renders PaymentFormPreview (static mock form) -- never real Stripe
 *   - Shows placeholder/loading/error states with mock data
 *   - Content rendered directly -- ElementWrapper handles chrome
 *
 * PREVIEW MODE (mode='preview'):
 *   - organizationId from RenderModeContext OR useBuilderContextSafe()
 *   - Renders functional Stripe PaymentElement + checkout form
 *   - Full payment processing via createEmbeddedCheckoutIntent
 *   - Has success/failure states with retry support
 *   - Self-wrapped in positioned container for page layout
 *
 * ============================================================================
 * WHY PAYMENT FORMS USE AUTO HEIGHT
 * ============================================================================
 *
 * Payment forms should ALWAYS use autoHeight because:
 *   1. Stripe Elements content changes based on payment method selection
 *   2. Fixed height causes content to be cut off
 *   3. Users should not have to manually resize forms when content changes
 *
 * ============================================================================
 */

'use client'

import React, { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Elements,
  PaymentElement as StripePaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import {
  type Appearance,
  type StripeElementsOptions,
  type StripePaymentElementChangeEvent,
} from '@stripe/stripe-js'
import { getStripePromise } from '@/lib/stripe/get-stripe-promise'
import { checkoutSchema, type CheckoutFormData } from '@/lib/stripe/checkout-schema'
import { CreditCard, Check, Loader2, CheckCircle, AlertCircle, FlaskConical } from 'lucide-react'
import type {
  PaymentElement as PaymentElementType,
  BorderConfig,
  Breakpoint,
} from '../../_lib/types'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'
import { resolveNavigationHref } from '../renderers/page-renderer/utils'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'
import { borderConfigToInlineStyles } from '../../_lib/border-utils'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { useBuilderContextSafe } from '../../_lib/builder-context'
import type { BillingType, BillingInterval } from '@/generated/prisma'
import type { PublicReceiptData } from '@/types/receipt'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum width for payment forms.
 * Payment forms look awkward when stretched too wide -- 480px is optimal
 * for checkout UX. This ensures consistent appearance regardless of
 * parent container width.
 * SOURCE OF TRUTH: PAYMENT_FORM_MAX_WIDTH
 */
const PAYMENT_FORM_MAX_WIDTH = 480

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedPayment component.
 *
 * SOURCE OF TRUTH: UnifiedPaymentProps
 *
 * In canvas mode, this component is rendered INSIDE an ElementWrapper which
 * provides all editor chrome. The only prop needed is the element data.
 * In preview mode, the component handles its own positioned wrapper.
 */
interface UnifiedPaymentProps {
  /** The payment element data -- SOURCE OF TRUTH: PaymentElement from types.ts */
  element: PaymentElementType
}

/**
 * Price info type with all billing fields.
 * Used internally by the payment form components.
 * SOURCE OF TRUTH: PaymentPriceInfo
 */
interface PriceInfo {
  id: string
  name: string
  amount: number
  currency: string
  /** SOURCE OF TRUTH: BillingType from Prisma — ONE_TIME, RECURRING, or SPLIT_PAYMENT */
  billingType: BillingType
  /** SOURCE OF TRUTH: BillingInterval from Prisma — MONTH, YEAR, WEEK, DAY */
  interval?: BillingInterval | null
  intervalCount?: number | null
  installments?: number | null
  installmentInterval?: string | null
  features?: Array<{ id: string; name: string }>
  /** Free trial duration in days — when > 0 the checkout uses SetupIntent */
  trialDays?: number | null
}

// CheckoutFormData and checkoutSchema imported from @/lib/stripe/checkout-schema

/**
 * Payment processing state machine.
 * SOURCE OF TRUTH: PaymentState
 */
type PaymentState =
  | { status: 'idle' }
  | { status: 'processing' }
  | { status: 'succeeded' }
  | { status: 'failed'; message: string }

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the display amount for the pay button.
 * For split payments, shows the per-installment amount.
 * SOURCE OF TRUTH: Same logic as pay page utils.ts
 */
function getPaymentAmount(
  amount: number,
  billingType?: string,
  installments?: number
): number {
  if (billingType === 'SPLIT_PAYMENT' && installments) {
    return Math.ceil(amount / installments)
  }
  return amount
}

/**
 * Overloaded version that accepts a PriceInfo object.
 * Used by the preview form components.
 */
function getPaymentAmountFromPrice(price: PriceInfo): number {
  if (price.billingType === 'SPLIT_PAYMENT' && price.installments) {
    return Math.ceil(price.amount / price.installments)
  }
  return price.amount
}

/**
 * Get billing description for display.
 * SOURCE OF TRUTH: Same logic as pay page utils.ts
 */
function getBillingDescription(
  billingType?: string,
  interval?: string | null,
  intervalCount?: number | null,
  installments?: number | null,
  installmentInterval?: string | null,
  amount?: number,
  currency?: string
): string {
  if (!billingType) return ''

  if (billingType === 'ONE_TIME') return 'One-time payment'

  if (billingType === 'RECURRING') {
    const int = interval?.toLowerCase() || 'month'
    const count = intervalCount || 1
    if (count === 1) return `per ${int}`
    return `every ${count} ${int}s`
  }

  if (billingType === 'SPLIT_PAYMENT' && installments && amount !== undefined) {
    const int = installmentInterval?.toLowerCase() || 'month'
    const perPayment = Math.ceil(amount / installments)
    return `${installments} payments of ${formatCurrency(perPayment, currency || 'usd')} / ${int}`
  }

  return ''
}

/**
 * Get billing description from a PriceInfo object.
 * Used by the functional payment form in preview mode.
 */
function getBillingDescriptionFromPrice(price: PriceInfo): string {
  if (price.billingType === 'ONE_TIME') return 'One-time payment'

  if (price.billingType === 'RECURRING') {
    const interval = price.interval?.toLowerCase() || 'month'
    const count = price.intervalCount || 1
    if (count === 1) return `per ${interval}`
    return `every ${count} ${interval}s`
  }

  if (price.billingType === 'SPLIT_PAYMENT' && price.installments) {
    const interval = price.installmentInterval?.toLowerCase() || 'month'
    const perPayment = Math.ceil(price.amount / price.installments)
    return `${price.installments} payments of ${formatCurrency(perPayment, price.currency)} / ${interval}`
  }

  return ''
}

// getStripePromise imported from @/lib/stripe/get-stripe-promise

/**
 * SOURCE OF TRUTH: PaymentFormThemeStyles
 *
 * Theme-based styling configuration for payment form.
 * Used to style the form container, inputs, labels, and Stripe Elements.
 */
interface ThemeStyles {
  containerBg: string
  containerBorder: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  inputFocusBorder: string
  mutedBg: string
  buttonBg: string
  buttonText: string
  successBg: string
  successText: string
  errorBg: string
  errorText: string
  checkColor: string
}

/**
 * Get theme styles based on the selected theme.
 */
function getThemeStyles(theme: 'light' | 'dark'): ThemeStyles {
  if (theme === 'light') {
    return {
      containerBg: '#ffffff',
      containerBorder: '#e5e7eb',
      textPrimary: '#111827',
      textSecondary: '#6b7280',
      textMuted: '#9ca3af',
      inputBg: '#ffffff',
      inputBorder: '#d1d5db',
      inputFocusBorder: '#6366f1',
      mutedBg: 'rgba(107, 114, 128, 0.1)',
      buttonBg: '#3b82f6',
      buttonText: '#ffffff',
      successBg: 'rgba(16, 185, 129, 0.1)',
      successText: '#10b981',
      errorBg: 'rgba(239, 68, 68, 0.1)',
      errorText: '#ef4444',
      checkColor: '#3b82f6',
    }
  }
  return {
    containerBg: '#0a0a0a',
    containerBorder: '#27272a',
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    inputBg: '#18181b',
    inputBorder: '#3f3f46',
    inputFocusBorder: '#6366f1',
    mutedBg: 'rgba(161, 161, 170, 0.1)',
    buttonBg: '#3b82f6',
    buttonText: '#ffffff',
    successBg: 'rgba(16, 185, 129, 0.1)',
    successText: '#10b981',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    errorText: '#ef4444',
    checkColor: '#3b82f6',
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Unified payment element that renders in both canvas and preview modes.
 *
 * CONTENT-ONLY in canvas mode -- the ElementWrapper handles chrome.
 * SELF-WRAPPING in preview mode -- includes positioned container.
 *
 * In canvas: renders a static PaymentFormPreview (mock checkout form).
 * In preview: renders a fully functional Stripe-powered checkout.
 */
export function UnifiedPayment({ element }: UnifiedPaymentProps) {
  const { mode, breakpoint, organizationId: contextOrgId } = useRenderMode()
  const isPreview = mode === 'preview'

  /**
   * Determine the active breakpoint for responsive style resolution.
   * Canvas mode always uses 'desktop' because the builder handles breakpoint
   * switching at a higher level. Preview mode uses the context breakpoint.
   */
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  // ==========================================================================
  // ORGANIZATION ID RESOLUTION
  // ==========================================================================

  /**
   * Resolve organizationId for product data fetching.
   * - Canvas mode: from BuilderContext (always available in editor)
   * - Preview mode: from RenderModeContext (passed by page renderer) OR
   *   BuilderContext (builder preview panel)
   */
  const builderContext = useBuilderContextSafe()
  const organizationId = contextOrgId || builderContext?.organizationId

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  /**
   * Fetch product data when a productId is set.
   * Uses the existing getById tRPC endpoint.
   * Enabled only when both organizationId and productId are available.
   */
  const { data: productData, isLoading: isProductLoading } = trpc.products.getById.useQuery(
    {
      organizationId: organizationId ?? '',
      productId: element.productId,
    },
    {
      enabled: Boolean(organizationId && element.productId),
    }
  )

  /**
   * Fetch organization data for Stripe connected account (preview mode only).
   * Uses getActiveOrganization which works in authenticated builder context.
   *
   * NOTE: For test mode, we don't need the connected account ID since
   * payments go to the platform's test Stripe account instead.
   * Only fetched in preview mode -- canvas doesn't need Stripe connection.
   */
  const { data: orgData } = trpc.organization.getActiveOrganization.useQuery(
    undefined,
    {
      enabled: Boolean(isPreview && organizationId && !element.testMode),
    }
  )

  // ==========================================================================
  // GRADIENT BORDER SUPPORT
  // ==========================================================================

  /**
   * Extract border configuration for gradient border rendering.
   * The __borderConfig is stored as a private property on element.styles.
   * When a gradient border is active, a CSS ::before pseudo-element overlay is injected.
   */
  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ==========================================================================
  // BORDER STYLE COMPUTATION
  // ==========================================================================

  /**
   * Compute theme styles for border fallback and special state overrides.
   * Hoisted here so both canvas and preview modes can use the same border.
   *
   * SOURCE OF TRUTH: PaymentBorderConfig
   */
  const theme = element.theme ?? 'dark'
  const themeStyles = getThemeStyles(theme)

  /**
   * Determine placeholder/error state for canvas border overrides.
   * - Placeholder (no product): dashed muted border
   * - Error (product not found): solid red border
   * - Normal: editable border from borderConfig or theme-aware fallback
   */
  const isPlaceholder = !element.productId
  const hasProductError = !isProductLoading && !!element.productId && !productData

  /** Build border styles from editable borderConfig or theme-aware fallback */
  const baseBorderStyles = borderConfig
    ? borderConfigToInlineStyles(borderConfig)
    : { border: `1px solid ${themeStyles.containerBorder}` }

  // ==========================================================================
  // CONTENT STYLE COMPUTATION
  // ==========================================================================

  /**
   * Content styles for the payment form container.
   * Used in canvas mode. Border comes from the editable borderConfig,
   * overridden for placeholder/error states (dashed/red).
   */
  const contentStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    minHeight: 'fit-content',
    backgroundColor: element.styles?.backgroundColor as string ?? 'transparent',
    borderRadius: element.styles?.borderRadius as number ?? 8,
    overflow: 'hidden',
    ...(isPlaceholder
      ? { border: `1px dashed ${themeStyles.textMuted}` }
      : hasProductError
        ? { border: `1px solid #ef4444` }
        : baseBorderStyles),
  }

  // ==========================================================================
  // CANVAS MODE -- Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  if (!isPreview) {
    return (
      <div className={gradientBorder.className || undefined} style={contentStyle}>
        {/* Gradient border overlay -- injects CSS for ::before pseudo-element */}
        {gradientBorder.isActive && (
          <GradientBorderOverlay
            elementId={element.id}
            borderConfig={borderConfig}
            borderRadius={contentStyle.borderRadius}
          />
        )}
        <CanvasPaymentContent
          element={element}
          productData={productData}
          isProductLoading={isProductLoading}
        />
      </div>
    )
  }

  // ==========================================================================
  // PREVIEW MODE -- Positioned wrapper with functional Stripe form
  // ==========================================================================

  /**
   * In preview mode, the payment element needs its own positioned wrapper for layout.
   * Each element renderer is responsible for its own position/size in the page.
   * The page-renderer does NOT provide a positioned container.
   */
  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    autoWidthDefault: false,
    autoHeightDefault: true, // Payment forms default to auto height
  })

  /**
   * Preview container styles -- combines position, size, and payment-specific styles.
   *
   * MOBILE RESPONSIVENESS:
   * - maxWidth constrains form width while allowing shrinking on smaller screens
   * - On mobile breakpoint, uses 100% width to fill the container
   *
   * FLEX CONTAINER COMPATIBILITY:
   * - minWidth: 0 is CRITICAL for flex items to shrink below their content width
   * - Without it, the payment element would expand to its content size and overflow
   */
  const isMobile = activeBreakpoint === 'mobile'
  const isAutoWidth = sizeStyles.width === '100%'
  const containerStyle: React.CSSProperties = {
    ...positionStyles,
    // On mobile, always use 100% width to prevent overflow
    width: isMobile || isAutoWidth ? '100%' : sizeStyles.width,
    // Constrain payment forms to a reasonable max width for better UX
    maxWidth: isAutoWidth ? PAYMENT_FORM_MAX_WIDTH : '100%',
    // CRITICAL: Allow flex shrinking below content width
    minWidth: 0,
    // Height from size computation
    height: sizeStyles.height,
    minHeight: sizeStyles.minHeight,
    backgroundColor: element.styles?.backgroundColor as string ?? 'transparent',
    borderRadius: element.styles?.borderRadius as number ?? 8,
    overflow: sizeStyles.height === 'auto' ? 'visible' : 'hidden',
    /** Editable border from properties panel — same as canvas mode */
    ...baseBorderStyles,
  }

  return (
    <div data-payment-element-id={element.id} style={containerStyle}>
      <PreviewPaymentContent
        element={element}
        organizationId={organizationId!}
        connectedAccountId={orgData?.stripeConnectedAccountId}
        productData={productData}
        isProductLoading={isProductLoading}
        breakpoint={activeBreakpoint}
      />
    </div>
  )
}

// ============================================================================
// CANVAS PAYMENT CONTENT - Static preview for the builder
// ============================================================================

/**
 * Props for the canvas-mode payment content renderer.
 */
interface CanvasPaymentContentProps {
  element: PaymentElementType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  productData: any
  isProductLoading: boolean
}

/**
 * Renders the payment form content for canvas mode.
 * Always shows a static PaymentFormPreview -- never real Stripe Elements.
 * Handles all placeholder/loading/error states with mock data.
 */
function CanvasPaymentContent({ element, productData, isProductLoading }: CanvasPaymentContentProps) {
  const theme = element.theme ?? 'dark'

  // No product selected - show preview with mock data
  if (!element.productId) {
    return (
      <PaymentFormPreview
        productName="Sample Product"
        priceName="Standard Plan"
        priceAmount={9900}
        priceCurrency="usd"
        billingType="ONE_TIME"
        features={[
          { id: '1', name: 'Feature One' },
          { id: '2', name: 'Feature Two' },
        ]}
        isPlaceholder={true}
        theme={theme}
        testMode={element.testMode}
      />
    )
  }

  // Product loading - show form structure with loading state
  if (isProductLoading) {
    return (
      <PaymentFormPreview
        productName={element.productName || 'Loading...'}
        priceName={element.priceName}
        priceAmount={element.priceAmount}
        priceCurrency={element.priceCurrency}
        billingType="ONE_TIME"
        features={[]}
        isLoading={true}
        theme={theme}
        testMode={element.testMode}
      />
    )
  }

  // Product not found - show with error indication
  if (!productData) {
    return (
      <PaymentFormPreview
        productName={element.productName || 'Product not found'}
        priceName={element.priceName}
        priceAmount={element.priceAmount}
        priceCurrency={element.priceCurrency}
        billingType="ONE_TIME"
        features={[]}
        hasError={true}
        theme={theme}
        testMode={element.testMode}
      />
    )
  }

  // Find the selected price with all details
  const selectedPrice = element.priceId
    ? productData.prices?.find((p: { id: string }) => p.id === element.priceId)
    : productData.prices?.[0]

  // Render the payment form preview styled like the live pay page
  return (
    <PaymentFormPreview
      productName={productData.name}
      priceName={selectedPrice?.name}
      priceAmount={selectedPrice?.amount}
      priceCurrency={selectedPrice?.currency}
      billingType={selectedPrice?.billingType}
      interval={selectedPrice?.interval}
      intervalCount={selectedPrice?.intervalCount}
      installments={selectedPrice?.installments}
      installmentInterval={selectedPrice?.installmentInterval}
      features={selectedPrice?.features || []}
      theme={theme}
      testMode={element.testMode}
      orderBumpEnabled={element.orderBumpEnabled}
      orderBumpProductName={element.orderBumpProductName}
      orderBumpPriceAmount={element.orderBumpPriceAmount}
      orderBumpPriceCurrency={element.orderBumpPriceCurrency}
      orderBumpLabel={element.orderBumpLabel}
      orderBumpBadgeText={element.orderBumpBadgeText}
      orderBumpBillingType={element.orderBumpBillingType}
      orderBumpBillingInterval={element.orderBumpBillingInterval}
      orderBumpIntervalCount={element.orderBumpIntervalCount}
      orderBumpTrialDays={element.orderBumpTrialDays}
      trialDays={element.trialDays}
    />
  )
}

// ============================================================================
// PREVIEW PAYMENT CONTENT - Functional Stripe checkout
// ============================================================================

/**
 * Props for the preview-mode payment content renderer.
 */
interface PreviewPaymentContentProps {
  element: PaymentElementType
  organizationId: string
  connectedAccountId?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  productData: any
  isProductLoading: boolean
  breakpoint: Breakpoint
}

/**
 * Renders the payment form content for preview mode.
 * Handles placeholder states and delegates to PaymentFormWrapper
 * for the fully functional Stripe checkout experience.
 */
function PreviewPaymentContent({
  element,
  organizationId,
  connectedAccountId,
  productData,
  isProductLoading,
  breakpoint,
}: PreviewPaymentContentProps) {
  const autoHeight = element.autoHeight !== false

  // No product selected - show placeholder
  if (!element.productId) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: autoHeight ? 100 : '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          /* Theme-aware placeholder text color for canvas */
          color: 'var(--muted-foreground)',
          padding: '24px',
        }}
      >
        <CreditCard className="w-12 h-12 text-muted-foreground/40 mb-2" />
        <span style={{ fontSize: 14 }}>Payment not configured</span>
      </div>
    )
  }

  // Loading product
  if (isProductLoading) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: autoHeight ? 100 : '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          /* Theme-aware placeholder text color for canvas loading state */
          color: 'var(--muted-foreground)',
          padding: '24px',
        }}
      >
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Product not found
  if (!productData) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: autoHeight ? 100 : '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          color: '#ef4444',
          padding: '24px',
        }}
      >
        <CreditCard className="w-12 h-12 text-destructive/40 mb-2" />
        <span style={{ fontSize: 14 }}>Product not found</span>
        <span style={{ fontSize: 12, marginTop: 4 }}>{element.productName || element.productId}</span>
      </div>
    )
  }

  // Find the selected price or use first price
  const selectedPrice = element.priceId
    ? productData.prices?.find((p: { id: string }) => p.id === element.priceId)
    : productData.prices?.[0]

  if (!selectedPrice) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: autoHeight ? 100 : '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          color: '#ef4444',
          padding: '24px',
        }}
      >
        <CreditCard className="w-12 h-12 text-destructive/40 mb-2" />
        <span style={{ fontSize: 14 }}>No price available</span>
      </div>
    )
  }

  // Render functional Stripe payment form
  return (
    <PaymentFormWrapper
      organizationId={organizationId}
      connectedAccountId={connectedAccountId}
      product={productData}
      price={selectedPrice}
      theme={element.theme ?? 'dark'}
      breakpoint={breakpoint}
      testMode={element.testMode}
      successRedirectEnabled={element.successRedirectEnabled}
      successRedirectType={element.successRedirectType}
      successRedirectPageSlug={element.successRedirectPageSlug}
      successRedirectUrl={element.successRedirectUrl}
      successRedirectNewTab={element.successRedirectNewTab}
      /* Order bump configuration — passed through to the payment form */
      orderBumpEnabled={element.orderBumpEnabled}
      orderBumpProductId={element.orderBumpProductId}
      orderBumpPriceId={element.orderBumpPriceId}
      orderBumpLabel={element.orderBumpLabel}
      orderBumpBadgeText={element.orderBumpBadgeText}
      orderBumpProductName={element.orderBumpProductName}
      orderBumpPriceAmount={element.orderBumpPriceAmount}
      orderBumpPriceCurrency={element.orderBumpPriceCurrency}
      orderBumpBillingType={element.orderBumpBillingType}
      orderBumpBillingInterval={element.orderBumpBillingInterval}
      orderBumpIntervalCount={element.orderBumpIntervalCount}
      /* Free trial configuration — cached from price selection */
      trialDays={element.trialDays}
      orderBumpTrialDays={element.orderBumpTrialDays}
    />
  )
}

// ============================================================================
// PAYMENT FORM PREVIEW - Static mock form for canvas builder
// ============================================================================

interface PaymentFormPreviewProps {
  productName: string
  priceName?: string
  priceAmount?: number
  priceCurrency?: string
  billingType?: string
  /** Recurring interval (MONTH, YEAR, etc.) */
  interval?: string | null
  /** Number of intervals between charges */
  intervalCount?: number | null
  /** Number of installments for split payment */
  installments?: number | null
  /** Interval for split payment installments */
  installmentInterval?: string | null
  features?: Array<{ id: string; name: string }>
  /** When true, shows placeholder styling indicating no product selected */
  isPlaceholder?: boolean
  /** When true, shows loading indicator */
  isLoading?: boolean
  /** When true, shows error styling */
  hasError?: boolean
  /**
   * SOURCE OF TRUTH: PaymentFormTheme
   * Theme for the payment form appearance.
   * - 'dark': Dark background with light text
   * - 'light': Light background with dark text
   */
  theme?: 'light' | 'dark'
  /**
   * SOURCE OF TRUTH: PaymentTestMode
   * When true, displays a test mode indicator showing that this payment
   * element will use Stripe test keys and accept test credit cards.
   */
  testMode?: boolean

  // ========================================================================
  // ORDER BUMP PREVIEW — SOURCE OF TRUTH: OrderBumpPreviewProps
  // ========================================================================
  /** Whether order bump is enabled */
  orderBumpEnabled?: boolean
  /** Product name for the bump */
  orderBumpProductName?: string
  /** Price amount in cents for the bump */
  orderBumpPriceAmount?: number
  /** Currency for the bump price */
  orderBumpPriceCurrency?: string
  /** Custom label for the bump */
  orderBumpLabel?: string
  /** Custom badge text */
  orderBumpBadgeText?: string
  /** Billing type of the bump */
  orderBumpBillingType?: 'ONE_TIME' | 'RECURRING'
  /** Billing interval for RECURRING bumps */
  orderBumpBillingInterval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
  /** Interval count for RECURRING bumps */
  orderBumpIntervalCount?: number
  /** Trial days for the bump */
  orderBumpTrialDays?: number
  /** Trial days for the main price */
  trialDays?: number
}

/**
 * Preview component for the payment form in the builder.
 * Styled to match the pay page checkout form exactly.
 *
 * Supports all billing types:
 * - ONE_TIME: Shows full amount
 * - RECURRING: Shows amount with interval (e.g., "/month")
 * - SPLIT_PAYMENT: Shows per-installment amount with "1/X" indicator
 */
function PaymentFormPreview({
  productName,
  priceName,
  priceAmount,
  priceCurrency = 'usd',
  billingType,
  interval,
  intervalCount,
  installments,
  installmentInterval,
  features = [],
  isPlaceholder = false,
  isLoading = false,
  hasError = false,
  theme = 'dark',
  testMode = false,
  orderBumpEnabled,
  orderBumpProductName,
  orderBumpPriceAmount,
  orderBumpPriceCurrency,
  orderBumpLabel,
  orderBumpBadgeText,
  orderBumpBillingType,
  orderBumpBillingInterval,
  orderBumpIntervalCount,
  orderBumpTrialDays,
  trialDays,
}: PaymentFormPreviewProps) {
  /**
   * Theme-based styling configuration.
   * Light theme uses explicit light colors for backgrounds and dark colors for text.
   * Dark theme uses explicit dark colors for backgrounds and light colors for text.
   */
  const themeStyles = getThemeStyles(theme)

  /**
   * Calculate the display amount for the button.
   * For split payments, this is the per-installment amount.
   */
  const displayAmount = priceAmount !== undefined
    ? getPaymentAmount(priceAmount, billingType, installments ?? undefined)
    : 0

  /**
   * Get billing description for display under the price.
   */
  const billingDescription = getBillingDescription(
    billingType,
    interval,
    intervalCount,
    installments,
    installmentInterval,
    priceAmount,
    priceCurrency
  )

  /**
   * Check if this is a split payment for button display.
   */
  const isSplitPayment = billingType === 'SPLIT_PAYMENT'

  return (
    <div
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        backgroundColor: themeStyles.containerBg,
        borderRadius: '8px',
      }}
    >
      {/* Test Mode badge - shown when testMode is enabled */}
      {testMode && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: '4px',
            padding: '2px 8px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            color: '#f59e0b',
          }}
        >
          <FlaskConical className="w-3 h-3" />
          <span>Test</span>
        </div>
      )}

      {/* Placeholder indicator */}
      {isPlaceholder && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: themeStyles.mutedBg,
            borderRadius: '6px',
            fontSize: '12px',
            color: themeStyles.textMuted,
          }}
        >
          <CreditCard className="w-4 h-4" />
          <span>Select a product in Settings to customize</span>
        </div>
      )}

      {/* Error indicator */}
      {hasError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#ef4444',
          }}
        >
          <CreditCard className="w-4 h-4" />
          <span>Product not found - please select a different product</span>
        </div>
      )}

      {/* Product Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3
          style={{
            fontSize: '18px',
            fontWeight: 600,
            margin: 0,
            color: isPlaceholder ? themeStyles.textMuted : themeStyles.textPrimary,
          }}
        >
          {productName}
        </h3>
        {priceName && (
          <p style={{ margin: 0, fontSize: '14px', color: themeStyles.textSecondary }}>
            {priceName}
          </p>
        )}
        {priceAmount !== undefined && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/**
              * Amount display — trial shows ONLY for RECURRING/SPLIT_PAYMENT.
              * ONE_TIME prices never show trial even if trialDays is set in the DB.
              * SOURCE OF TRUTH: RecurringOnlyTrialGuard
              */}
            {(billingType === 'RECURRING' || billingType === 'SPLIT_PAYMENT') && trialDays && trialDays > 0 ? (
              <>
                <div
                  style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: isPlaceholder ? themeStyles.textMuted : themeStyles.textPrimary,
                  }}
                >
                  {trialDays}-day free trial
                </div>
                <p style={{ margin: 0, fontSize: '14px', color: themeStyles.textSecondary }}>
                  then {formatCurrency(priceAmount, priceCurrency)}
                  {billingType === 'RECURRING' && interval && (
                    <span>/{interval.toLowerCase()}</span>
                  )}
                </p>
              </>
            ) : (
              <>
                <div
                  style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: isPlaceholder ? themeStyles.textMuted : themeStyles.textPrimary,
                  }}
                >
                  {formatCurrency(priceAmount, priceCurrency)}
                  {billingType === 'RECURRING' && interval && (
                    <span style={{ fontSize: '14px', fontWeight: 400, color: themeStyles.textSecondary, marginLeft: '4px' }}>
                      /{interval.toLowerCase()}
                    </span>
                  )}
                </div>
                {/* Billing description (e.g., "3 payments of $33.00 / month") */}
                {billingDescription && billingType !== 'ONE_TIME' && (
                  <p style={{ margin: 0, fontSize: '14px', color: themeStyles.textSecondary }}>
                    {billingDescription}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Features */}
      {features.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {features.map((feature) => (
            <div
              key={feature.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: isPlaceholder ? themeStyles.textMuted : themeStyles.textPrimary,
              }}
            >
              <Check style={{ width: '16px', height: '16px', color: themeStyles.checkColor }} />
              <span>{feature.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mock Form Fields - matches checkout-form.tsx styling */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: 500, margin: 0, color: themeStyles.textPrimary }}>
          Contact
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: themeStyles.textPrimary }}>
              First Name
            </label>
            <div
              style={{
                height: '40px',
                padding: '0 12px',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.inputBorder}`,
                backgroundColor: themeStyles.inputBg,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span style={{ color: themeStyles.textMuted, fontSize: '14px' }}>John</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: themeStyles.textPrimary }}>
              Last Name
            </label>
            <div
              style={{
                height: '40px',
                padding: '0 12px',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.inputBorder}`,
                backgroundColor: themeStyles.inputBg,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span style={{ color: themeStyles.textMuted, fontSize: '14px' }}>Doe</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '14px', fontWeight: 500, color: themeStyles.textPrimary }}>
            Email
          </label>
          <div
            style={{
              height: '40px',
              padding: '0 12px',
              borderRadius: '6px',
              border: `1px solid ${themeStyles.inputBorder}`,
              backgroundColor: themeStyles.inputBg,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span style={{ color: themeStyles.textMuted, fontSize: '14px' }}>john@example.com</span>
          </div>
        </div>
      </div>

      {/* Mock Payment Element */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: 500, margin: 0, color: themeStyles.textPrimary }}>
          Payment
        </h4>
        <div
          style={{
            padding: '16px',
            borderRadius: '6px',
            border: `1px solid ${themeStyles.inputBorder}`,
            backgroundColor: themeStyles.mutedBg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CreditCard style={{ width: '20px', height: '20px', color: themeStyles.textMuted }} />
            <span style={{ fontSize: '14px', color: themeStyles.textMuted }}>
              Card details will appear here
            </span>
          </div>
        </div>
      </div>

      {/* Mock Order Bump — static preview matching the live form's design.
          Shows when an order bump product + price is configured. */}
      {orderBumpEnabled && orderBumpPriceAmount && orderBumpPriceAmount > 0 && (
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px',
            paddingTop: '20px',
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
            {orderBumpBadgeText || 'Recommended'}
          </div>

          {/* Static toggle — always shown in "off" state on canvas */}
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

          {/* Bump label and description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: themeStyles.textPrimary,
              lineHeight: '20px',
            }}>
              {orderBumpLabel ||
                `Add ${orderBumpProductName ?? 'product'} for ${formatCurrency(
                  orderBumpPriceAmount,
                  orderBumpPriceCurrency ?? 'usd'
                )}`}
            </span>
            <span style={{
              fontSize: '13px',
              color: themeStyles.textSecondary,
              lineHeight: '18px',
            }}>
              {/* Bump trial ONLY shown for RECURRING bumps — SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
              {orderBumpBillingType === 'RECURRING' && orderBumpTrialDays && orderBumpTrialDays > 0
                ? `${orderBumpTrialDays}-day free trial, then `
                : ''}
              {orderBumpBillingType === 'RECURRING' && orderBumpBillingInterval
                ? `Subscription add-on — per ${orderBumpIntervalCount && orderBumpIntervalCount > 1
                    ? `${orderBumpIntervalCount} ${orderBumpBillingInterval.toLowerCase()}s`
                    : orderBumpBillingInterval.toLowerCase()}`
                : 'One-time add-on'}
            </span>
          </div>
        </div>
      )}

      {/* Mock Submit Button - shows installment info for split payments */}
      <button
        type="button"
        disabled
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
          gap: '4px',
          backgroundColor: isLoading ? 'rgba(59, 130, 246, 0.7)' : '#3b82f6',
          color: '#ffffff',
          opacity: 0.9,
          cursor: 'not-allowed',
        }}
      >
        {isLoading ? (
          <>
            <div
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                borderTopColor: '#ffffff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ marginLeft: '8px' }}>Loading...</span>
          </>
        ) : (
          <>
            {/* Button text — trial only for RECURRING/SPLIT. SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
            {(billingType === 'RECURRING' || billingType === 'SPLIT_PAYMENT') && trialDays && trialDays > 0
              ? `Start ${trialDays}-day free trial`
              : `Pay ${formatCurrency(displayAmount, priceCurrency)}`}
            {/* Show installment indicator for split payments (e.g., "1/4") — split never has trial */}
            {isSplitPayment && installments && (
              <span style={{ marginLeft: '4px', fontSize: '14px', opacity: 0.8 }}>
                1/{installments}
              </span>
            )}
          </>
        )}
      </button>

      {/* Security Note */}
      <p style={{ margin: 0, fontSize: '12px', textAlign: 'center', color: themeStyles.textMuted }}>
        Your payment is secured by Stripe. We never store your payment details.
      </p>
    </div>
  )
}

// ============================================================================
// PAYMENT FORM WRAPPER - Wraps the form with Stripe Elements (preview only)
// ============================================================================

interface PaymentFormWrapperProps {
  organizationId: string
  connectedAccountId?: string | null
  product: {
    id: string
    name: string
    description?: string | null
  }
  price: PriceInfo
  /** Theme for the payment form appearance */
  theme: 'light' | 'dark'
  /** Breakpoint for responsive layout */
  breakpoint: Breakpoint
  /**
   * SOURCE OF TRUTH: PaymentTestMode
   * When true, uses Stripe TEST API keys and accepts test credit cards.
   */
  testMode?: boolean
  /** Whether post-payment redirect is enabled */
  successRedirectEnabled?: boolean
  /** Redirect destination type: 'page' (website page) or 'url' (custom URL) */
  successRedirectType?: 'page' | 'url'
  /** Slug of the website page to redirect to */
  successRedirectPageSlug?: string
  /** Custom URL to redirect to */
  successRedirectUrl?: string
  /** Whether to open the custom URL in a new tab */
  successRedirectNewTab?: boolean

  // ========================================================================
  // ORDER BUMP — SOURCE OF TRUTH: OrderBumpFormProps, OrderBumpBillingType
  // Supports ONE_TIME and RECURRING bumps (SPLIT_PAYMENT excluded).
  // ========================================================================
  /** Whether order bump is enabled for this payment element */
  orderBumpEnabled?: boolean
  /** Product ID for the order bump */
  orderBumpProductId?: string
  /** Price ID for the order bump */
  orderBumpPriceId?: string
  /** Custom checkbox label */
  orderBumpLabel?: string
  /** Custom badge text above the order bump card */
  orderBumpBadgeText?: string
  /** Cached product name for display */
  orderBumpProductName?: string
  /** Cached price in cents for display */
  orderBumpPriceAmount?: number
  /** Cached currency for formatting */
  orderBumpPriceCurrency?: string
  /** Billing type of the bump price (ONE_TIME or RECURRING) */
  orderBumpBillingType?: 'ONE_TIME' | 'RECURRING'
  /** Billing interval for RECURRING bumps */
  orderBumpBillingInterval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
  /** Interval count for RECURRING bumps */
  orderBumpIntervalCount?: number

  // ========================================================================
  // FREE TRIAL — SOURCE OF TRUTH: PaymentFormWrapperTrialProps
  // ========================================================================
  /** Free trial days for the main price. When > 0, uses SetupIntent flow. */
  trialDays?: number
  /** Free trial days for the order bump price. */
  orderBumpTrialDays?: number
}

/**
 * Wraps the checkout form with Stripe Elements provider.
 * Configures the Stripe appearance theme and payment element options.
 */
function PaymentFormWrapper({
  organizationId,
  connectedAccountId,
  product,
  price,
  theme,
  breakpoint,
  testMode,
  successRedirectEnabled,
  successRedirectType,
  successRedirectPageSlug,
  successRedirectUrl,
  successRedirectNewTab,
  orderBumpEnabled,
  orderBumpProductId,
  orderBumpPriceId,
  orderBumpLabel,
  orderBumpBadgeText,
  orderBumpProductName,
  orderBumpPriceAmount,
  orderBumpPriceCurrency,
  orderBumpBillingType,
  orderBumpBillingInterval,
  orderBumpIntervalCount,
  trialDays,
  orderBumpTrialDays,
}: PaymentFormWrapperProps) {
  const stripePromise = useMemo(
    () => getStripePromise(connectedAccountId, testMode),
    [connectedAccountId, testMode]
  )

  /**
   * Get theme styles for both Stripe Elements and the form.
   * Uses the element's theme (not the website's theme) for independent control.
   */
  const themeStyles = useMemo(() => getThemeStyles(theme), [theme])
  const isDark = theme === 'dark'

  /**
   * Stripe Elements appearance configuration.
   * Styles the payment method input fields to match the form theme.
   */
  const appearance: Appearance = useMemo(
    () => ({
      theme: isDark ? 'night' : 'stripe',
      variables: {
        colorPrimary: '#6366f1',
        colorBackground: isDark ? '#0a0a0a' : '#ffffff',
        colorText: isDark ? '#fafafa' : '#111827',
        colorTextSecondary: isDark ? '#a1a1aa' : '#6b7280',
        colorTextPlaceholder: '#71717a',
        colorDanger: '#dc2626',
        colorInputBackground: isDark ? '#18181b' : '#ffffff',
        colorInputBorder: isDark ? '#3f3f46' : '#d1d5db',
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
        '.Block': {
          backgroundColor: isDark ? '#18181b' : '#ffffff',
          border: `1px solid ${isDark ? '#3f3f46' : '#d1d5db'}`,
        },
      },
    }),
    [isDark]
  )

  /**
   * Stripe Elements mode selection.
   *
   * SOURCE OF TRUTH: ElementsPaymentMethodTypes, PaymentElementModeSelection
   *
   * MODE RULES (must match backend intent type):
   * - 'setup': ALL prices are trial (main + bump if enabled) → SetupIntent
   * - 'subscription': Any RECURRING/SPLIT or any trial item → PaymentIntent in sub mode
   * - 'payment': All ONE_TIME, no trial → PaymentIntent
   *
   * Server-side uses automatic_payment_methods: { enabled: true } — no explicit
   * paymentMethodTypes needed here. Stripe Elements picks up all enabled methods
   * (cards, Apple Pay, Google Pay, Link, etc.) from the PaymentIntent/SetupIntent.
   */
  /**
   * Trial is ONLY valid for RECURRING or SPLIT_PAYMENT billing types.
   * Stripe does not natively support trials on one-time purchases.
   * SOURCE OF TRUTH: RecurringOnlyTrialGuard
   */
  const mainIsRecurringOrSplit = price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT'
  const mainIsTrial = Boolean(mainIsRecurringOrSplit && trialDays && trialDays > 0)
  const bumpIsTrial = Boolean(orderBumpEnabled && orderBumpBillingType === 'RECURRING' && orderBumpTrialDays && orderBumpTrialDays > 0)
  const bumpIsActive = Boolean(orderBumpEnabled && orderBumpPriceId)
  const isSubscription = mainIsRecurringOrSplit
  const bumpIsSubscription = orderBumpBillingType === 'RECURRING'
  const displayAmount = getPaymentAmountFromPrice(price)

  /**
   * Determine if ALL components of this checkout are trial:
   * - Main price must be RECURRING/SPLIT with trial
   * - If order bump is active, it must also be RECURRING with trial
   */
  const allTrial = mainIsTrial && (!bumpIsActive || bumpIsTrial)

  /**
   * Determine if ANY component needs subscription mode:
   * - Main is recurring/split
   * - Bump is recurring
   * NOTE: Trial no longer forces subscription mode for ONE_TIME prices.
   */
  const needsSubscriptionMode = isSubscription || bumpIsSubscription

  /**
   * No explicit paymentMethodTypes — server-side automatic_payment_methods
   * controls which methods appear (cards, Apple Pay, Google Pay, Link, etc.).
   */
  const elementsOptions: StripeElementsOptions = allTrial
    ? { mode: 'setup', currency: price.currency, appearance }
    : {
        mode: needsSubscriptionMode ? 'subscription' : 'payment',
        amount: displayAmount,
        currency: price.currency,
        appearance,
      }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <PaymentForm
        organizationId={organizationId}
        product={product}
        price={price}
        theme={theme}
        themeStyles={themeStyles}
        breakpoint={breakpoint}
        testMode={testMode}
        successRedirectEnabled={successRedirectEnabled}
        successRedirectType={successRedirectType}
        successRedirectPageSlug={successRedirectPageSlug}
        successRedirectUrl={successRedirectUrl}
        successRedirectNewTab={successRedirectNewTab}
        orderBumpEnabled={orderBumpEnabled}
        orderBumpProductId={orderBumpProductId}
        orderBumpPriceId={orderBumpPriceId}
        orderBumpLabel={orderBumpLabel}
        orderBumpBadgeText={orderBumpBadgeText}
        orderBumpProductName={orderBumpProductName}
        orderBumpPriceAmount={orderBumpPriceAmount}
        orderBumpPriceCurrency={orderBumpPriceCurrency}
        orderBumpBillingType={orderBumpBillingType}
        orderBumpBillingInterval={orderBumpBillingInterval}
        orderBumpIntervalCount={orderBumpIntervalCount}
        trialDays={trialDays}
        orderBumpTrialDays={orderBumpTrialDays}
      />
    </Elements>
  )
}

// ============================================================================
// PAYMENT FORM - The actual functional checkout form (preview only)
// ============================================================================

interface PaymentFormProps {
  organizationId: string
  product: {
    id: string
    name: string
    description?: string | null
  }
  price: PriceInfo
  /** Theme for the payment form appearance */
  theme: 'light' | 'dark'
  /** Pre-computed theme styles */
  themeStyles: ThemeStyles
  /** Breakpoint for responsive layout */
  breakpoint: Breakpoint
  /**
   * SOURCE OF TRUTH: PaymentTestMode
   * When true, displays test mode indicator and uses test keys for payment.
   */
  testMode?: boolean
  /** Whether post-payment redirect is enabled */
  successRedirectEnabled?: boolean
  /** Redirect destination type: 'page' (website page) or 'url' (custom URL) */
  successRedirectType?: 'page' | 'url'
  /** Slug of the website page to redirect to */
  successRedirectPageSlug?: string
  /** Custom URL to redirect to */
  successRedirectUrl?: string
  /** Whether to open the custom URL in a new tab */
  successRedirectNewTab?: boolean

  // ========================================================================
  // ORDER BUMP — SOURCE OF TRUTH: OrderBumpPaymentFormProps, OrderBumpBillingType
  // Supports ONE_TIME and RECURRING bumps (SPLIT_PAYMENT excluded).
  // ========================================================================
  /** Whether order bump is enabled */
  orderBumpEnabled?: boolean
  /** Product ID for the order bump */
  orderBumpProductId?: string
  /** Price ID for the order bump */
  orderBumpPriceId?: string
  /** Custom checkbox label */
  orderBumpLabel?: string
  /** Custom badge text above the order bump card */
  orderBumpBadgeText?: string
  /** Cached product name for display */
  orderBumpProductName?: string
  /** Cached price in cents for display */
  orderBumpPriceAmount?: number
  /** Cached currency for formatting */
  orderBumpPriceCurrency?: string
  /** Billing type of the bump price (ONE_TIME or RECURRING) */
  orderBumpBillingType?: 'ONE_TIME' | 'RECURRING'
  /** Billing interval for RECURRING bumps */
  orderBumpBillingInterval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
  /** Interval count for RECURRING bumps (e.g., 2 for "every 2 months") */
  orderBumpIntervalCount?: number

  // ========================================================================
  // FREE TRIAL — SOURCE OF TRUTH: PaymentFormTrialProps
  // ========================================================================
  /** Free trial days for the main price. When > 0, uses confirmSetup instead of confirmPayment. */
  trialDays?: number
  /** Free trial days for the order bump price. */
  orderBumpTrialDays?: number
}

/**
 * Fully functional payment checkout form rendered inside Stripe Elements.
 *
 * Handles:
 * - Contact information collection (first name, last name, email)
 * - Stripe PaymentElement for card/payment method input
 * - Payment intent creation via tRPC createEmbeddedCheckoutIntent
 * - Payment confirmation with Stripe
 * - Success/failure states with retry support
 * - Post-payment redirect (page or URL)
 */
function PaymentForm({
  organizationId,
  product,
  price,
  theme,
  themeStyles,
  breakpoint,
  testMode,
  successRedirectEnabled,
  successRedirectType,
  successRedirectPageSlug,
  successRedirectUrl,
  successRedirectNewTab,
  orderBumpEnabled,
  orderBumpProductId,
  orderBumpPriceId,
  orderBumpLabel,
  orderBumpBadgeText,
  orderBumpProductName,
  orderBumpPriceAmount,
  orderBumpPriceCurrency,
  orderBumpBillingType,
  orderBumpBillingInterval,
  orderBumpIntervalCount,
  trialDays,
  orderBumpTrialDays,
}: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const isDark = theme === 'dark'
  /** Extract basePath for context-aware page redirects (subdomain/custom domain routing). */
  const { basePath } = useRenderMode()

  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentReady, setPaymentReady] = useState(false)
  const [paymentState, setPaymentState] = useState<PaymentState>({ status: 'idle' })

  /**
   * ORDER BUMP STATE
   * SOURCE OF TRUTH: OrderBumpCheckboxState
   * Tracks whether the customer has checked the order bump checkbox.
   * When checked, the bump product is included in the payment.
   */
  const [orderBumpChecked, setOrderBumpChecked] = useState(false)

  /**
   * Whether the order bump should be shown in the form.
   * Requires: enabled + valid product + valid price + valid amount.
   */
  const showOrderBump = Boolean(
    orderBumpEnabled &&
      orderBumpProductId &&
      orderBumpPriceId &&
      orderBumpPriceAmount &&
      orderBumpPriceAmount > 0
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
  })

  const createIntentMutation = trpc.products.createEmbeddedCheckoutIntent.useMutation()

  /**
   * Mutation to complete pending trial subscriptions after main payment succeeds.
   * When the embedded payment has mixed trial states (e.g. main RECURRING with
   * trial + bump RECURRING without trial, or vice versa), the backend splits them:
   * the main subscription handles the immediate-charge items, and this mutation
   * creates separate trial subscriptions using the customer's saved payment method.
   *
   * SOURCE OF TRUTH: EmbeddedTrialSplit, CompleteTrialSubscriptions
   */
  const completeTrialSubs = trpc.payment.completeTrialSubscriptions.useMutation()

  /**
   * Generate an encrypted upsell token after payment succeeds.
   * The token enables one-click upsell buttons on the redirect target page.
   * SOURCE OF TRUTH: UpsellTokenMutation
   */
  const generateUpsellTokenMutation = trpc.products.generateUpsellToken.useMutation()

  /**
   * Track Stripe PaymentElement readiness.
   * The submit button is disabled until the payment method is fully entered.
   */
  const handlePaymentElementChange = (event: StripePaymentElementChangeEvent) => {
    setPaymentReady(event.complete)
    if (!event.complete && event.value.type) {
      setPaymentError(null)
    }
  }

  /**
   * Handle form submission -- creates payment intent and confirms with Stripe.
   *
   * FLOW:
   * 1. Create payment intent via tRPC (backend creates Stripe PaymentIntent/Subscription)
   * 2. Validate payment info with Stripe Elements
   * 3. Confirm payment with Stripe using the client secret
   * 4. Handle success (redirect or show inline message)
   * 5. Handle failure (show error with retry option)
   */
  const onSubmit = async (data: CheckoutFormData) => {
    if (!stripe || !elements) return

    setPaymentState({ status: 'processing' })
    setPaymentError(null)

    try {
      /**
       * Step 1: Create payment intent via tRPC.
       * If the order bump checkbox is checked, include the bump product/price
       * so the backend creates a single PaymentIntent for the combined total.
       * SOURCE OF TRUTH: OrderBumpCheckoutFlow
       */
      const result = await createIntentMutation.mutateAsync({
        organizationId,
        productId: product.id,
        priceId: price.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        testMode: testMode ?? false,
        ...(showOrderBump && orderBumpChecked && orderBumpProductId && orderBumpPriceId
          ? {
              orderBump: {
                productId: orderBumpProductId,
                priceId: orderBumpPriceId,
              },
            }
          : {}),
      })

      if (!result.clientSecret) {
        throw new Error('Payment initialization failed. Please try again.')
      }

      // Step 2: Validate payment info with Stripe Elements
      const { error: submitError } = await elements.submit()
      if (submitError) {
        throw new Error(submitError.message || 'Payment validation failed')
      }

      /**
       * Step 3: Confirm payment with Stripe.
       * Build return_url to match the configured redirect target so that
       * redirect-based flows (3DS, bank redirects) land on the right page.
       */
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
        stripeReturnUrl = `${window.location.origin}/pay/success?transaction_id=${result.transactionId}`
      }

      /**
       * Use confirmSetup for trial subscriptions (SetupIntent),
       * confirmPayment for regular charges (PaymentIntent).
       * The backend signals which flow via result.isTrial.
       */
      const confirmResult = result.isTrial
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
        throw new Error(confirmResult.error.message || 'Payment failed')
      }

      // Payment succeeded -- handle redirect or show success message
      setPaymentState({ status: 'succeeded' })

      /**
       * Complete pending trial subscriptions when the payment element had
       * mixed trial states (main RECURRING with trial + bump RECURRING without, or vice versa).
       * Uses checkoutSessionId to group related transactions.
       *
       * Non-blocking: if trial subscription creation fails, the main payment
       * already succeeded. The customer received their non-trial products.
       *
       * SOURCE OF TRUTH: CheckoutSessionGrouping, CompleteTrialSubscriptions
       */
      const checkoutSessionId = (result as { checkoutSessionId?: string | null }).checkoutSessionId
      const primarySubscriptionId = (result as { subscriptionId?: string }).subscriptionId
      if (checkoutSessionId && primarySubscriptionId) {
        try {
          console.log('[payment] Creating pending trial subscriptions...')
          await completeTrialSubs.mutateAsync({
            checkoutSessionId,
            primarySubscriptionId,
            organizationId,
          })
          console.log('[payment] Trial subscriptions created successfully')
        } catch (trialError) {
          /**
           * Trial sub creation failure should NOT block checkout success.
           * Main payment already succeeded. Log for debugging.
           */
          console.error('[payment] Failed to create trial subscriptions:', trialError)
        }
      }

      /**
       * Write receipt display data to sessionStorage for instant receipt rendering.
       * The receipt element on the target page reads this immediately on mount,
       * avoiding the need to wait for webhook-created DB records.
       * sessionStorage is same-origin only and clears on tab close — secure by design.
       *
       * When an order bump was checked, include it as a second line item
       * so the receipt shows both products. The amount reflects the total paid.
       * SOURCE OF TRUTH: OrderBumpReceiptData
       */
      try {
        /** Build receipt items — main product + optional order bump */
        const receiptItems: PublicReceiptData['items'] = [
          {
            productName: product.name,
            productImage: null,
            priceName: price.name,
            quantity: 1,
            unitAmount: price.amount,
            totalAmount: price.amount,
            billingType: price.billingType as PublicReceiptData['billingType'],
            interval: (price.interval as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR') ?? null,
            intervalCount: price.intervalCount ?? null,
          },
        ]

        /** Add order bump item to receipt if it was checked */
        if (showOrderBump && orderBumpChecked && orderBumpPriceAmount) {
          /**
           * Build bump receipt label based on billing type.
           * RECURRING bumps show interval info, ONE_TIME shows "One-time add-on".
           */
          const bumpPriceName = orderBumpBillingType === 'RECURRING' && orderBumpBillingInterval
            ? `${orderBumpBillingInterval.charAt(0) + orderBumpBillingInterval.slice(1).toLowerCase()}ly subscription`
            : 'One-time add-on'
          receiptItems.push({
            productName: orderBumpProductName ?? 'Add-on',
            productImage: null,
            priceName: bumpPriceName,
            quantity: 1,
            unitAmount: orderBumpPriceAmount,
            totalAmount: orderBumpPriceAmount,
            billingType: orderBumpBillingType ?? 'ONE_TIME',
            interval: orderBumpBillingInterval ?? null,
            intervalCount: orderBumpIntervalCount ?? null,
          })
        }

        /** Calculate total receipt amount (main product + bump if checked) */
        const receiptTotal = showOrderBump && orderBumpChecked
          ? price.amount + (orderBumpPriceAmount ?? 0)
          : price.amount

        const receiptData: PublicReceiptData = {
          paymentId: '',
          paymentNumber: 1,
          paidAt: new Date().toISOString(),
          amount: receiptTotal,
          refundedAmount: 0,
          currency: price.currency,
          billingType: price.billingType as PublicReceiptData['billingType'],
          totalPayments: price.billingType === 'ONE_TIME' ? 1 : (price.billingType === 'SPLIT_PAYMENT' ? (price.installments ?? 1) : 0),
          items: receiptItems,
          createdAt: new Date().toISOString(),
          invoiceAccessToken: null,
        }
        sessionStorage.setItem('mochi_receipt', JSON.stringify(receiptData))
      } catch {
        /* sessionStorage write failure is non-critical — receipt falls back to DB query */
      }

      /**
       * Generate an upsell token after successful payment.
       * The token is appended to the redirect URL so the upsell page
       * can process one-click charges using the customer's stored payment method.
       * Token generation is non-blocking — if it fails, we still redirect normally.
       *
       * SOURCE OF TRUTH: UpsellTokenPostPayment
       */
      let upsellToken: string | null = null
      if (result.transactionId) {
        try {
          const tokenResult = await generateUpsellTokenMutation.mutateAsync({
            transactionId: result.transactionId,
            organizationId,
          })
          upsellToken = tokenResult.token
        } catch {
          /* Token generation failure is non-critical — upsell button will show manual purchase fallback */
        }
      }

      /**
       * Post-payment redirect logic.
       * Appends transactionId and upsellToken as query params so the target page can:
       * - Display transaction details via receipt element
       * - Enable one-click upsell buttons via the upsell token
       * If redirect opens in a new tab, also show the inline success message.
       * If no redirect is configured, the inline success message is shown (default).
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
          if (upsellToken) {
            redirectUrl.searchParams.set('upsellToken', upsellToken)
          }
          window.location.href = redirectUrl.pathname + redirectUrl.search
          return
        } else if (effectiveType === 'url' && successRedirectUrl) {
          const redirectUrl = new URL(successRedirectUrl)
          if (result.transactionId) {
            redirectUrl.searchParams.set('transactionId', result.transactionId)
          }
          if (upsellToken) {
            redirectUrl.searchParams.set('upsellToken', upsellToken)
          }
          if (successRedirectNewTab) {
            window.open(redirectUrl.toString(), '_blank')
            // Keep showing success message in current tab
          } else {
            window.location.href = redirectUrl.toString()
            return
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setPaymentError(errorMessage)
      setPaymentState({ status: 'failed', message: errorMessage })
    }
  }

  const isProcessing = paymentState.status === 'processing'

  // ========================================================================
  // SUCCESS STATE
  // ========================================================================

  if (paymentState.status === 'succeeded') {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: themeStyles.containerBg,
          border: `1px solid ${themeStyles.containerBorder}`,
          borderRadius: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 0',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              height: '64px',
              width: '64px',
              borderRadius: '50%',
              backgroundColor: themeStyles.successBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle style={{ height: '32px', width: '32px', color: themeStyles.successText }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0, color: themeStyles.textPrimary }}>
            Payment Successful
          </h2>
          <p style={{ margin: 0, color: themeStyles.textSecondary, fontSize: '14px' }}>
            Thank you for your purchase. You will receive a confirmation email shortly.
          </p>
        </div>
      </div>
    )
  }

  // ========================================================================
  // FAILED STATE
  // ========================================================================

  if (paymentState.status === 'failed') {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: themeStyles.containerBg,
          border: `1px solid ${themeStyles.containerBorder}`,
          borderRadius: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 0',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              height: '64px',
              width: '64px',
              borderRadius: '50%',
              backgroundColor: themeStyles.errorBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertCircle style={{ height: '32px', width: '32px', color: themeStyles.errorText }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0, color: themeStyles.textPrimary }}>
            Payment Failed
          </h2>
          <p style={{ margin: 0, color: themeStyles.textSecondary, fontSize: '14px' }}>
            {paymentState.message}
          </p>
          <button
            type="button"
            onClick={() => setPaymentState({ status: 'idle' })}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              borderRadius: '6px',
              border: `1px solid ${themeStyles.containerBorder}`,
              backgroundColor: 'transparent',
              color: themeStyles.textPrimary,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // ========================================================================
  // IDLE / CHECKOUT FORM STATE
  // ========================================================================

  /**
   * Calculate the display amount for the button.
   * For split payments, this is the per-installment amount.
   */
  const baseDisplayAmount = getPaymentAmountFromPrice(price)
  const billingDescription = getBillingDescriptionFromPrice(price)
  const isSplitPayment = price.billingType === 'SPLIT_PAYMENT'

  /**
   * Total display amount — includes order bump if checked.
   * The bump amount is added on top of the base product price.
   * SOURCE OF TRUTH: OrderBumpTotalCalculation
   */
  const displayAmount = showOrderBump && orderBumpChecked
    ? baseDisplayAmount + (orderBumpPriceAmount ?? 0)
    : baseDisplayAmount

  /**
   * Input style helper - creates consistent input styling based on theme.
   */
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

  return (
    <div
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        backgroundColor: themeStyles.containerBg,
        border: `1px solid ${themeStyles.containerBorder}`,
        borderRadius: '8px',
      }}
    >
      {/* Test Mode Badge */}
      {testMode && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: '4px',
            padding: '3px 10px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#f59e0b',
          }}
        >
          <FlaskConical style={{ width: '14px', height: '14px', flexShrink: 0 }} />
          <span>Test</span>
        </div>
      )}

      {/* Product Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: themeStyles.textPrimary }}>
          {product.name}
        </h3>
        {price.name && (
          <p style={{ margin: 0, fontSize: '14px', color: themeStyles.textSecondary }}>
            {price.name}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/**
            * Amount display — trial ONLY for RECURRING/SPLIT_PAYMENT prices.
            * ONE_TIME prices never show trial. SOURCE OF TRUTH: RecurringOnlyTrialGuard
            */}
          {(price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT') && trialDays && trialDays > 0 ? (
            <>
              <div style={{ fontSize: '24px', fontWeight: 700, color: themeStyles.textPrimary }}>
                {trialDays}-day free trial
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: themeStyles.textSecondary }}>
                then {formatCurrency(price.amount, price.currency)}
                {price.billingType === 'RECURRING' && price.interval && (
                  <span>/{price.interval.toLowerCase()}</span>
                )}
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: '24px', fontWeight: 700, color: themeStyles.textPrimary }}>
                {formatCurrency(price.amount, price.currency)}
                {price.billingType === 'RECURRING' && price.interval && (
                  <span style={{ fontSize: '14px', fontWeight: 400, color: themeStyles.textSecondary, marginLeft: '4px' }}>
                    /{price.interval.toLowerCase()}
                  </span>
                )}
              </div>
              {billingDescription && price.billingType !== 'ONE_TIME' && (
                <p style={{ margin: 0, fontSize: '14px', color: themeStyles.textSecondary }}>
                  {billingDescription}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Features */}
      {price.features && price.features.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {price.features.map((feature) => (
            <div
              key={feature.id}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: themeStyles.textPrimary }}
            >
              <Check style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
              <span>{feature.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Checkout Form */}
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Contact Information */}
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
                id="firstName"
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
                id="lastName"
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
              id="email"
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

        {/* Payment Element */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: 500, margin: 0, color: themeStyles.textPrimary }}>
            Payment
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <StripePaymentElement
              options={{
                layout: 'tabs',
                business: { name: product.name },
              }}
              onChange={handlePaymentElementChange}
            />
            {paymentError && (
              <p style={{ margin: 0, fontSize: '12px', color: themeStyles.errorText }}>
                {paymentError}
              </p>
            )}
          </div>
        </div>

        {/* ================================================================
            ORDER BUMP CHECKBOX
            ================================================================
            SOURCE OF TRUTH: OrderBumpCheckbox, PaymentOrderBumpUI

            Shows a styled checkbox that lets customers add an additional
            product to their payment before checkout. The bump product
            amount is added to the total when checked.
            ================================================================ */}
        {showOrderBump && (
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '16px',
              paddingTop: '20px',
              borderRadius: '10px',
              border: `1.5px solid ${themeStyles.buttonBg}`,
              backgroundColor: `${themeStyles.buttonBg}0a`,
              boxShadow: `0 1px 3px rgba(0,0,0,${isDark ? '0.2' : '0.06'})`,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={() => setOrderBumpChecked(!orderBumpChecked)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setOrderBumpChecked(!orderBumpChecked)
              }
            }}
          >
            {/* Badge — solid accent pill, high contrast white text.
                This is the primary eye-catcher — uses the theme button color
                so it always matches the business owner's brand. */}
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
              {orderBumpBadgeText || 'Recommended'}
            </div>

            {/* Toggle switch */}
            <div
              style={{
                width: '36px',
                height: '20px',
                minWidth: '36px',
                borderRadius: '10px',
                backgroundColor: orderBumpChecked
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
                  left: orderBumpChecked ? '18px' : '2px',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
                }}
              />
            </div>

            {/* Bump label and description */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: themeStyles.textPrimary,
                lineHeight: '20px',
              }}>
                {orderBumpLabel ||
                  `Add ${orderBumpProductName ?? 'product'} for ${formatCurrency(
                    orderBumpPriceAmount ?? 0,
                    orderBumpPriceCurrency ?? 'usd'
                  )}`}
              </span>
              {/* Bump trial ONLY for RECURRING bumps — SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
              <span style={{
                fontSize: '13px',
                color: themeStyles.textSecondary,
                lineHeight: '18px',
              }}>
                {orderBumpBillingType === 'RECURRING' && orderBumpTrialDays && orderBumpTrialDays > 0
                  ? `${orderBumpTrialDays}-day free trial, then `
                  : ''}
                {orderBumpBillingType === 'RECURRING' && orderBumpBillingInterval
                  ? `Subscription add-on — per ${orderBumpIntervalCount && orderBumpIntervalCount > 1
                      ? `${orderBumpIntervalCount} ${orderBumpBillingInterval.toLowerCase()}s`
                      : orderBumpBillingInterval.toLowerCase()}`
                  : 'One-time add-on'}
              </span>
            </div>
          </div>
        )}

        {/* Submit Button - shows installment info for split payments */}
        <button
          type="submit"
          disabled={!stripe || isProcessing || !paymentReady}
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
            backgroundColor: (!stripe || isProcessing || !paymentReady)
              ? `${themeStyles.buttonBg}80`
              : themeStyles.buttonBg,
            color: themeStyles.buttonText,
            cursor: (!stripe || isProcessing || !paymentReady) ? 'not-allowed' : 'pointer',
          }}
        >
          {isProcessing ? (
            <>
              <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
              Processing...
            </>
          ) : (price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT') && trialDays && trialDays > 0 ? (
            /* Trial button — ONLY for RECURRING/SPLIT. SOURCE OF TRUTH: RecurringOnlyTrialGuard */
            <>Start {trialDays}-day free trial</>
          ) : (
            <>
              Pay {formatCurrency(displayAmount, price.currency)}
              {isSplitPayment && price.installments && (
                <span style={{ marginLeft: '4px', fontSize: '14px', opacity: 0.8 }}>
                  1/{price.installments}
                </span>
              )}
            </>
          )}
        </button>

        {/* Security Note */}
        <p style={{ margin: 0, fontSize: '12px', textAlign: 'center', color: themeStyles.textMuted }}>
          {(price.billingType === 'RECURRING' || price.billingType === 'SPLIT_PAYMENT') && trialDays && trialDays > 0
            ? 'Your card will be saved securely by Stripe. You will not be charged during the trial.'
            : 'Your payment is secured by Stripe. We never store your payment details.'}
        </p>
      </form>
    </div>
  )
}
