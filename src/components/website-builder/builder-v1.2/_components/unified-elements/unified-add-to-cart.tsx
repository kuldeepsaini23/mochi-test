/**
 * ============================================================================
 * UNIFIED ADD TO CART ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedAddToCart, unified-add-to-cart, add-to-cart-element-unified
 *
 * This component replaces BOTH:
 *   - elements/add-to-cart-button-element.tsx (canvas editor)
 *   - renderers/element-renderers/add-to-cart-button-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders CONTENT ONLY -- the styled button with icon + label.
 * In canvas mode, the parent `ElementWrapper` handles all editor chrome:
 *   - Selection ring, hover ring, resize handles, labels, dimensions pill
 *   - Pointer events (drag, hover enter/leave)
 *
 * In preview mode, this component wraps content in a <button> element with
 * the useAddToCart hook wired to the onClick handler. The button is disabled
 * and styled accordingly when not in a valid CMS context.
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * BOTH MODES:
 *   - Google Font loading via GoogleFontsService
 *   - computeAddToCartButtonContentStyles for visual rendering (single source of truth)
 *   - Gradient border support via useGradientBorder + GradientBorderOverlay
 *   - Icon + label rendering with before/after icon positioning
 *   - Button variants: primary, secondary, outline, ghost
 *
 * CANVAS MODE (mode='canvas'):
 *   - Content rendered as a plain <div> (no click action)
 *   - CMS context error indicator when inside a non-store SmartCMS list
 *   - No add-to-cart functionality (editor-only, not live)
 *
 * PREVIEW MODE (mode='preview'):
 *   - Wrapped in <button> with useAddToCart hook for real cart functionality
 *   - Cursor changes to 'pointer' when valid, 'not-allowed' when invalid
 *   - Opacity hint for disabled state (0.7 opacity when no valid CMS context)
 *   - Positioned wrapper with computeElementPositionStyles + useElementSizeStyles
 *
 * ============================================================================
 */

'use client'

import { useEffect } from 'react'
import type {
  AddToCartButtonElement,
  BorderConfig,
  Breakpoint,
} from '../../_lib/types'
import { computeAddToCartButtonContentStyles, getStyleValue } from '../../_lib'
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
import { useAddToCart } from '../../_lib/use-add-to-cart'
import { AlertCircle } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedAddToCart component.
 *
 * SOURCE OF TRUTH: UnifiedAddToCartProps
 *
 * In canvas mode, this component is rendered INSIDE an ElementWrapper which
 * provides all editor chrome. The only prop needed is the element data.
 * In preview mode, the component handles its own positioned wrapper and
 * cart action via the useAddToCart hook.
 */
interface UnifiedAddToCartProps {
  /** The add-to-cart button element data -- SOURCE OF TRUTH: AddToCartButtonElement from types.ts */
  element: AddToCartButtonElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified add-to-cart button element that renders in both canvas and preview modes.
 *
 * CONTENT-ONLY in canvas mode -- the ElementWrapper handles chrome.
 * SELF-WRAPPING in preview mode -- includes a <button> tag with cart action.
 *
 * Uses computeAddToCartButtonContentStyles as the single source of truth for all
 * visual styles including variant overrides, typography, gradients, borders, and effects.
 */
export function UnifiedAddToCart({ element }: UnifiedAddToCartProps) {
  const { mode, breakpoint } = useRenderMode()
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
   * Uses getStyleValue for responsive-aware style resolution with 'Inter' fallback.
   */
  const fontFamily = getStyleValue<string>(
    element,
    'fontFamily',
    activeBreakpoint,
    'Inter'
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
  const contentStyle = computeAddToCartButtonContentStyles(element, {
    breakpoint: activeBreakpoint,
  })

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
        /* Kill transition in canvas -- prevents content lagging behind
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

      {/* Trial info subtitle for standalone products with a free trial configured.
          Shows a small "(X-day trial)" hint next to the label so customers know
          about the trial period before adding to cart. */}
      {element.standaloneTrialDays && element.standaloneTrialDays > 0 && (
        <span style={{
          fontSize: element.iconSize ? Math.max(element.iconSize - 4, 10) : 11,
          fontWeight: 400,
          opacity: 0.75,
          whiteSpace: 'nowrap',
        }}>
          ({element.standaloneTrialDays}-day trial)
        </span>
      )}

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

  /**
   * In canvas mode, we render ONLY the button content and an optional CMS
   * context error indicator. The parent ElementWrapper handles all editor
   * chrome (selection ring, hover, resize handles, labels, drag).
   */
  if (!isPreview) {
    return (
      <>
        {renderButtonContent()}
        {/* CMS context error indicator rendered by a sub-component to
            safely call the useCmsRowContext hook (hooks must be unconditional).
            Passes element to check standalone config before showing error. */}
        <CanvasContextErrorIndicator element={element} />
      </>
    )
  }

  // ==========================================================================
  // PREVIEW MODE -- Positioned wrapper with cart action button
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
      data-add-to-cart-renderer
      data-element-id={element.id}
      style={{
        ...positionStyles,
        ...sizeStyles,
      }}
    >
      <PreviewAddToCartWrapper element={element}>
        {renderButtonContent()}
      </PreviewAddToCartWrapper>
    </div>
  )
}

// ============================================================================
// CANVAS CONTEXT ERROR INDICATOR - CMS validation for canvas mode
// ============================================================================

/**
 * Renders a red error badge when the add-to-cart button is inside a SmartCMS
 * List that is NOT connected to a store table AND has no standalone config.
 *
 * ERROR DISPLAY LOGIC (3-tier aware):
 * - If NOT in any CMS context AND has standalone config: DON'T show error
 *   The button will use the standalone product data.
 * - If NOT in any CMS context AND no standalone config: DON'T show error
 *   The button is in canvas design mode — user can configure via settings panel.
 * - If IN a CMS context (row exists) but missing stripe_price_id AND no standalone config: SHOW error
 *   The button is inside a SmartCMS List but the table is not a store.
 * - If IN a CMS context with stripe_price_id: DON'T show error
 *   Valid CMS configuration.
 *
 * Extracted as a separate component so the useCmsRowContext hook can be called
 * unconditionally (React hook rules), while the parent conditionally renders
 * the error indicator only in canvas mode.
 */
function CanvasContextErrorIndicator({ element }: { element: AddToCartButtonElement }) {
  const cmsContext = useCmsRowContext()

  /** Check if we're inside a CMS context (has actual row data) */
  const isInCmsContext = cmsContext?.row !== null

  /** Check if standalone product is configured on the element */
  const hasStandaloneConfig = Boolean(element.standaloneStripePriceId)

  /**
   * Only show error if:
   *   - In CMS context but lacking stripe_price_id, AND
   *   - No standalone config to fall back on
   */
  const showContextError = isInCmsContext
    && !cmsContext?.row?.values?.stripe_price_id
    && !hasStandaloneConfig

  if (!showContextError) return null

  return (
    <div
      title="Configure a product in settings or use inside a SmartCMS List connected to a Store"
      style={{
        position: 'absolute',
        top: -8,
        right: -8,
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ef4444',
        borderRadius: '50%',
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <AlertCircle
        style={{
          width: 12,
          height: 12,
          color: '#ffffff',
        }}
      />
    </div>
  )
}

// ============================================================================
// PREVIEW ADD TO CART WRAPPER - Cart action for published mode
// ============================================================================

/**
 * Props for the preview wrapper sub-component.
 *
 * Separated to keep the main component clean and avoid calling hooks
 * conditionally (useAddToCart is only meaningful in preview mode).
 */
interface PreviewAddToCartWrapperProps {
  /** Add-to-cart button element data for resolving cart action */
  element: AddToCartButtonElement
  /** The rendered button content to wrap */
  children: React.ReactNode
}

/**
 * Wraps button content in a <button> element with add-to-cart functionality.
 *
 * Uses the useAddToCart hook with 3-tier resolution:
 *   1. CMS context — reads product data from CMS row (SmartCMS list or dynamic page)
 *   2. Standalone config — reads product data from element props (settings panel)
 *   3. Disabled — no valid source, button shows disabled state
 *
 * When neither source is available, the button is disabled with reduced opacity
 * and a 'not-allowed' cursor to indicate configuration is needed.
 */
function PreviewAddToCartWrapper({ element, children }: PreviewAddToCartWrapperProps) {
  /**
   * Pass element to enable standalone mode resolution (Tier 2).
   * The hook checks CMS context first, then falls back to element's standalone fields.
   * Also returns isOutOfStock for inventory-aware rendering.
   */
  const { hasValidContext, handleAddToCart, isOutOfStock } = useAddToCart(element)

  /**
   * Button is disabled when there's no valid product source OR
   * when the product is out of stock (tracked, depleted, no backorders).
   */
  const isDisabled = !hasValidContext || isOutOfStock

  return (
    <>
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={isDisabled}
        style={{
          /* Reset default button styles so content styles take over */
          border: 'none',
          background: 'none',
          padding: 0,
          margin: 0,
          width: '100%',
          height: '100%',
          /* Visual feedback for valid/invalid/out-of-stock state */
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.5 : 1,
          display: 'block',
        }}
      >
        {children}
      </button>

    </>
  )
}
