/**
 * ============================================================================
 * UNIFIED BUTTON ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedButton, unified-button, button-element-unified
 *
 * This component replaces BOTH:
 *   - elements/button-element.tsx (canvas editor)
 *   - renderers/element-renderers/button-element-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders CONTENT ONLY -- visual button styling, icon, and label.
 * In canvas mode, the parent `ElementWrapper` handles all editor chrome:
 *   - Selection ring, hover ring, resize handles, labels, dimensions pill
 *   - Pointer events (drag, hover enter/leave)
 *
 * In preview mode, this component wraps content in the appropriate link tag
 * for navigation (external <a>, internal Next.js <Link>, or plain <div>).
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * BOTH MODES:
 *   - Google Font loading via GoogleFontsService
 *   - computeButtonContentStyles for visual rendering (single source of truth)
 *   - Gradient border support via useGradientBorder + GradientBorderOverlay
 *   - Icon + label rendering with before/after icon positioning
 *   - Button variants: primary, secondary, outline, ghost
 *
 * CANVAS MODE (mode='canvas'):
 *   - No link wrapping (clicks are drag gestures, not navigation)
 *   - No CMS row context (editor doesn't render live CMS data)
 *   - Content rendered as a plain <div>
 *
 * PREVIEW MODE (mode='preview'):
 *   - Action-based link wrapping (static link, dynamic CMS link, or none)
 *   - External links -> <a> tag
 *   - Internal links -> Next.js <Link> for client-side navigation
 *   - Dynamic links use useCmsRowContext() for CMS row ID
 *   - resolveNavigationHref for context-aware routing with basePath
 *
 * ============================================================================
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ButtonElement, BorderConfig, Breakpoint } from '../../_lib/types'
import { computeButtonContentStyles, getStyleValue } from '../../_lib'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'
import { GoogleFontsService } from '../../_lib/google-fonts-service'
import { IconRenderer } from '@/lib/icons'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'
import { useCmsRowContext } from '../../_lib/cms-row-context'
import { resolveNavigationHref } from '../renderers/page-renderer/utils'
import { trpc } from '@/trpc/react-provider'
import { formatCurrency } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedButton component.
 *
 * SOURCE OF TRUTH: UnifiedButtonProps
 *
 * In canvas mode, this component is rendered INSIDE an ElementWrapper which
 * provides all editor chrome. The only prop needed is the element data.
 * In preview mode, the component handles its own wrapper (link or div).
 */
interface UnifiedButtonProps {
  /** The button element data -- SOURCE OF TRUTH: ButtonElement from types.ts */
  element: ButtonElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified button element that renders in both canvas and preview modes.
 *
 * CONTENT-ONLY in canvas mode -- the ElementWrapper handles chrome.
 * SELF-WRAPPING in preview mode -- includes link tag when button has an action.
 *
 * Uses computeButtonContentStyles as the single source of truth for all visual
 * styles including variant overrides, typography, gradients, borders, and effects.
 */
export function UnifiedButton({ element }: UnifiedButtonProps) {
  const { mode, breakpoint, basePath, pageSlugColumns } = useRenderMode()
  const isPreview = mode === 'preview'

  /**
   * Determine the active breakpoint for responsive style resolution.
   * Canvas mode always uses 'desktop' because the builder handles breakpoint
   * switching at a higher level. Preview mode uses the context breakpoint.
   */
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  // ==========================================================================
  // GOOGLE FONT LOADING
  // ==========================================================================

  /**
   * Load the button's font when the element mounts or font family changes.
   *
   * MIGRATION NOTE: Typography has moved from element properties to styles.
   * We check both for backwards compatibility:
   *   - New location: element.styles.fontFamily
   *   - Legacy location: element.fontFamily (deprecated)
   */
  const fontFamily = getStyleValue<string>(
    element,
    'fontFamily',
    activeBreakpoint,
    element.fontFamily ?? 'Inter'
  )

  useEffect(() => {
    if (fontFamily) {
      GoogleFontsService.loadFont(fontFamily)
    }
  }, [fontFamily])

  // ==========================================================================
  // CONTENT STYLE COMPUTATION
  // ==========================================================================

  /**
   * Compute visual styles via the shared utility (single source of truth).
   * This ensures canvas and preview rendering match exactly.
   * Handles variant overrides, typography, gradients, borders, and effects.
   */
  const contentStyle = computeButtonContentStyles(element, { breakpoint: activeBreakpoint })

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
  // BUTTON CONTENT RENDERER (shared between all modes)
  // ==========================================================================

  /**
   * Renders the inner button content: icon + label with flexbox layout.
   * This is identical for canvas and preview modes -- only the outer wrapper differs.
   */
  const renderButtonContent = () => (
    <div
      data-element-content={element.id}
      className={gradientBorder.className || undefined}
      style={{
        ...contentStyle,
        /* Flexbox layout for icon + label centering */
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        /* Gap between icon and label (0 if no icon present) */
        gap: element.icon ? 6 : 0,
        /* Kill transition in canvas — prevents content lagging behind
           handles/selection ring during drag and resize at any zoom level. */
        ...(!isPreview ? { transition: 'none' } : {}),
      }}
    >
      {/* Gradient border overlay -- injects CSS for ::before pseudo-element */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={contentStyle.borderRadius}
        />
      )}

      {/* Icon BEFORE label (default position) */}
      {element.icon && element.iconPosition !== 'after' && (
        <IconRenderer
          name={element.icon}
          style={{
            width: element.iconSize ?? 16,
            height: element.iconSize ?? 16,
            flexShrink: 0,
          }}
        />
      )}

      {/* Button label text */}
      {element.label}

      {/* Icon AFTER label */}
      {element.icon && element.iconPosition === 'after' && (
        <IconRenderer
          name={element.icon}
          style={{
            width: element.iconSize ?? 16,
            height: element.iconSize ?? 16,
            flexShrink: 0,
          }}
        />
      )}
    </div>
  )

  // ==========================================================================
  // CANVAS MODE -- Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  if (!isPreview) {
    return renderButtonContent()
  }

  // ==========================================================================
  // PREVIEW MODE -- Positioned wrapper with link element
  // ==========================================================================

  /**
   * In preview mode, the button needs its own positioned wrapper for layout.
   * Each element renderer is responsible for its own position/size in the page.
   * The page-renderer does NOT provide a positioned container.
   */
  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <div
      data-button-renderer
      data-element-id={element.id}
      style={{
        ...positionStyles,
        ...sizeStyles,
      }}
    >
      <PreviewButtonWrapper
        element={element}
        basePath={basePath}
      >
        {renderButtonContent()}
      </PreviewButtonWrapper>
    </div>
  )
}

// ============================================================================
// PREVIEW BUTTON WRAPPER - Link resolution for published mode
// ============================================================================

/**
 * Props for the preview wrapper sub-component.
 *
 * Separated to keep the main component clean and avoid calling hooks
 * conditionally (useCmsRowContext is only meaningful in preview mode).
 */
interface PreviewButtonWrapperProps {
  /** Button element data for resolving action configuration */
  element: ButtonElement
  /** Base path for link resolution (e.g., '/webprodigies' or '') */
  basePath?: string
  /** The rendered button content to wrap */
  children: React.ReactNode
}

/**
 * Wraps button content in the appropriate link element based on action type.
 *
 * ACTION TYPES:
 *   - 'link': Static URL -- uses resolveNavigationHref for basePath-aware routing
 *   - 'page-link': Internal page -- navigates to page slug via basePath-aware routing
 *   - 'dynamic-link': CMS-driven URL -- builds URL from CMS row context + target slug
 *   - 'one-click-upsell': Charges stored payment method via encrypted token
 *   - 'none' / undefined: No link -- renders as a plain <div>
 *
 * LINK ELEMENT SELECTION:
 *   - External URLs (http/https) -> <a> tag with optional target="_blank"
 *   - Internal URLs -> Next.js <Link> for client-side navigation
 *   - One-click-upsell -> Clickable <div> with processing states
 *   - No URL -> plain <div>
 */
function PreviewButtonWrapper({ element, basePath = '', children }: PreviewButtonWrapperProps) {
  /**
   * Access CMS row context for dynamic link resolution.
   * Returns null values when not inside a SmartCMS List or Dynamic Page.
   */
  const cmsContext = useCmsRowContext()

  /** Fresh slug column map from render context — used for 3-tier slug resolution */
  const { pageSlugColumns } = useRenderMode()

  /**
   * Check if this button is a one-click-upsell action.
   * Handled separately because it uses onClick, not href navigation.
   */
  const action = element.action
  const isUpsellAction = action?.type === 'one-click-upsell'

  /**
   * For upsell buttons, render the UpsellButtonWrapper which handles
   * token reading, payment processing, and loading/success/error states.
   * SOURCE OF TRUTH: UpsellButtonActionHandler
   */
  if (isUpsellAction && action) {
    return (
      <UpsellButtonWrapper
        action={action}
        basePath={basePath}
      >
        {children}
      </UpsellButtonWrapper>
    )
  }

  /**
   * Resolve the action URL based on the button's action configuration.
   *
   * STATIC LINK: Uses resolveNavigationHref for context-aware routing
   *   - Custom domains: basePath="" so href stays as-is
   *   - Subdomains: basePath="/domain" so href gets prefixed
   *   - External/hash links returned unchanged
   *
   * DYNAMIC LINK: Builds URL from CMS row context
   *   - Requires both a CMS row (from context) and a target page slug (from config)
   *   - URL pattern: {basePath}/{targetPageSlug}/{rowId}
   */
  const resolveActionHref = (): string | null => {
    if (!action || action.type === 'none') {
      return null
    }

    if (action.type === 'link') {
      const resolved = resolveNavigationHref(action.href, basePath)
      return resolved === '#' ? null : resolved
    }

    /**
     * PAGE LINK: Navigate to an internal website page.
     * Uses the stored pageSlug, routed through resolveNavigationHref
     * for basePath-aware routing (subdomain vs custom domain).
     */
    if (action.type === 'page-link') {
      if (!action.pageSlug) return null
      return resolveNavigationHref(action.pageSlug, basePath)
    }

    if (action.type === 'dynamic-link') {
      if (!cmsContext?.row || !action.targetPageSlug) {
        return null
      }
      // Strip leading slash from slug — PageInfo slugs are stored as "/blog" but
      // we already prepend "/" in the template literal, avoiding double slashes
      const cleanSlug = action.targetPageSlug.startsWith('/') ? action.targetPageSlug.slice(1) : action.targetPageSlug
      /**
       * Use slug column value for SEO-friendly URLs when configured.
       * 3-tier resolution: context pageSlugColumns (fresh DB) → cached element value → row ID.
       * SOURCE OF TRUTH: ButtonTargetPageSlugColumn, DynamicButtonSlug, PageSlugColumnsMap
       */
      const contextSlugCol = action.targetPageId ? pageSlugColumns?.[action.targetPageId] : undefined
      const resolvedSlugCol = contextSlugCol || action.targetPageSlugColumn
      const slugColumnValue = resolvedSlugCol
        ? String(cmsContext.row.values[resolvedSlugCol] || '')
        : ''
      const rowIdentifier = slugColumnValue || cmsContext.row.id
      return `${basePath}/${cleanSlug}/${encodeURIComponent(rowIdentifier)}`
    }

    /* Future action types (popup, scroll) don't use href navigation */
    return null
  }

  const actionHref = resolveActionHref()
  const openInNewTab = element.action?.openInNewTab ?? false
  const isExternalLink = actionHref?.startsWith('http://') || actionHref?.startsWith('https://')

  /* External link -- render as <a> tag for proper browser handling */
  if (actionHref && isExternalLink) {
    return (
      <a
        href={actionHref}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noopener noreferrer' : undefined}
        aria-label={element.ariaLabel || undefined}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        {children}
      </a>
    )
  }

  /* Internal link -- render as Next.js <Link> for client-side navigation */
  if (actionHref) {
    return (
      <Link
        href={actionHref}
        target={openInNewTab ? '_blank' : undefined}
        aria-label={element.ariaLabel || undefined}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        {children}
      </Link>
    )
  }

  /* No action or non-navigating action -- render content directly */
  return <>{children}</>
}

// ============================================================================
// ONE-CLICK UPSELL BUTTON WRAPPER
// ============================================================================

/**
 * Upsell payment processing states.
 * SOURCE OF TRUTH: UpsellButtonState
 */
type UpsellState =
  | { status: 'idle' }
  | { status: 'processing' }
  | { status: 'succeeded' }
  | { status: 'failed'; message: string }

/**
 * Props for the UpsellButtonWrapper component.
 */
interface UpsellButtonWrapperProps {
  /** The button action configuration containing upsell product/price IDs */
  action: ButtonElement['action']
  /** Base path for routing context */
  basePath?: string
  /** The rendered button content */
  children: React.ReactNode
}

/**
 * Handles one-click upsell payment processing when the button is clicked.
 *
 * SOURCE OF TRUTH: UpsellButtonWrapper, OneClickUpsellHandler
 *
 * FLOW:
 * 1. Reads upsellToken from URL query parameters (set by the payment redirect)
 * 2. On button click, calls processUpsellPayment tRPC endpoint
 * 3. The server decrypts the token, retrieves the stored payment method,
 *    and charges the customer without requiring new payment details
 * 4. Shows success or error state to the customer
 *
 * SECURITY:
 * - Token is read from URL params (set by server, not editable by user)
 * - Payment method comes from encrypted server-side token, never from client
 * - Token expires after 15 minutes
 * - Server validates product ownership and price validity
 */
function UpsellButtonWrapper({ action, children }: UpsellButtonWrapperProps) {
  const searchParams = useSearchParams()
  const [upsellState, setUpsellState] = useState<UpsellState>({ status: 'idle' })

  /** Read the upsell token from URL query params (set by post-payment redirect) */
  const upsellToken = searchParams.get('upsellToken')

  /** tRPC mutation for processing the upsell payment */
  const processUpsellMutation = trpc.products.processUpsellPayment.useMutation()

  /** Get the upsell product/price IDs from the button action config */
  const upsellProductId = action?.upsellProductId
  const upsellPriceId = action?.upsellPriceId
  const upsellProductName = action?.upsellProductName
  const upsellPriceAmount = action?.upsellPriceAmount
  const upsellPriceCurrency = action?.upsellPriceCurrency

  /**
   * Handle upsell button click — calls the server to charge the stored payment method.
   * This is the "one click" part — no payment form, just a single API call.
   */
  const handleUpsellClick = useCallback(async () => {
    if (!upsellToken || !upsellProductId || !upsellPriceId) return
    if (upsellState.status === 'processing' || upsellState.status === 'succeeded') return

    setUpsellState({ status: 'processing' })

    try {
      const result = await processUpsellMutation.mutateAsync({
        token: upsellToken,
        productId: upsellProductId,
        priceId: upsellPriceId,
      })

      if (result.success) {
        setUpsellState({ status: 'succeeded' })

        /**
         * Write upsell item to sessionStorage so the receipt element can
         * include it. We append to existing receipt data if present.
         */
        try {
          const existingReceipt = sessionStorage.getItem('mochi_receipt')
          if (existingReceipt && upsellPriceAmount) {
            const receiptData = JSON.parse(existingReceipt)
            receiptData.items.push({
              productName: upsellProductName ?? 'Upsell',
              productImage: null,
              priceName: 'One-click upsell',
              quantity: 1,
              unitAmount: upsellPriceAmount,
              totalAmount: upsellPriceAmount,
              billingType: 'ONE_TIME',
              interval: null,
              intervalCount: null,
            })
            receiptData.amount += upsellPriceAmount
            sessionStorage.setItem('mochi_receipt', JSON.stringify(receiptData))
          }
        } catch {
          /* sessionStorage update failure is non-critical */
        }
      } else {
        setUpsellState({
          status: 'failed',
          message: result.error ?? 'Upsell payment failed. Please try again.',
        })
      }
    } catch (err) {
      setUpsellState({
        status: 'failed',
        message: err instanceof Error ? err.message : 'An error occurred processing the upsell',
      })
    }
  }, [
    upsellToken,
    upsellProductId,
    upsellPriceId,
    upsellProductName,
    upsellPriceAmount,
    upsellState.status,
    processUpsellMutation,
  ])

  /** No token available — button can't process upsell. Show disabled state. */
  if (!upsellToken) {
    return (
      <div
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'block',
          opacity: 0.5,
          cursor: 'not-allowed',
        }}
        title="Upsell offer not available — complete a purchase first"
      >
        {children}
      </div>
    )
  }

  /** Show success state after the upsell purchase completes */
  if (upsellState.status === 'succeeded') {
    return (
      <div
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'block',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 24px',
            borderRadius: '8px',
            backgroundColor: '#10b981',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '16px',
            gap: '8px',
          }}
        >
          <span>&#10003;</span> Added to your order!
        </div>
      </div>
    )
  }

  /** Show error state with retry option */
  if (upsellState.status === 'failed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div
          onClick={handleUpsellClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleUpsellClick() }}
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'block',
            cursor: 'pointer',
          }}
        >
          {children}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: '#ef4444',
            textAlign: 'center',
          }}
        >
          {upsellState.message}
        </p>
      </div>
    )
  }

  /**
   * Default state — clickable button that triggers the upsell payment.
   * Shows a loading spinner overlay when processing.
   */
  return (
    <div
      onClick={handleUpsellClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleUpsellClick() }}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        cursor: upsellState.status === 'processing' ? 'wait' : 'pointer',
        position: 'relative',
      }}
    >
      {children}
      {/* Processing overlay — shows a subtle loading state without replacing the button content */}
      {upsellState.status === 'processing' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 'inherit',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              borderTopColor: '#ffffff',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
    </div>
  )
}
