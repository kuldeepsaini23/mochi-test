/**
 * ============================================================================
 * UNIFIED CART ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedCart, unified-cart, cart-element-unified
 *
 * This component replaces BOTH:
 *   - elements/cart-element.tsx (canvas editor)
 *   - renderers/element-renderers/cart-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders CONTENT ONLY -- the styled button with cart icon,
 * optional label, and item count badge.
 * In canvas mode, the parent `ElementWrapper` handles all editor chrome:
 *   - Selection ring, hover ring, resize handles, labels, dimensions pill
 *   - Pointer events (drag, hover enter/leave)
 *
 * In preview mode, this component wraps content in a <button> element that
 * opens the shopping cart sheet via the Redux cart store on click.
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * BOTH MODES:
 *   - Google Font loading via GoogleFontsService
 *   - computeCartContentStyles for visual rendering (single source of truth)
 *   - Gradient border support via useGradientBorder + GradientBorderOverlay
 *   - Icon + optional label rendering with before/after icon positioning
 *   - Button variants: primary, secondary, outline, ghost
 *   - Default icon: 'shopping-bag', default icon size: 20
 *
 * CANVAS MODE (mode='canvas'):
 *   - Content rendered as a plain <div> (clicks are drag gestures)
 *   - No cart store interaction (editor-only, not live)
 *   - No item count badge (no live cart data on canvas)
 *
 * PREVIEW MODE (mode='preview'):
 *   - Wrapped in <button> with onClick -> openCart() from Zustand store
 *   - Shows cart item count badge when cart has items
 *   - Hydration-safe: badge only renders after client mount (useEffect)
 *   - Positioned wrapper with computeElementPositionStyles + useElementSizeStyles
 *
 * ============================================================================
 */

'use client'

import { useEffect, useState } from 'react'
import type {
  CartElement,
  BorderConfig,
  Breakpoint,
} from '../../_lib/types'
import { computeCartContentStyles, getStyleValue } from '../../_lib'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'
import { GoogleFontsService } from '../../_lib/google-fonts-service'
import { IconRenderer } from '@/lib/icons'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'
import { useCartActions, useCartItemCount } from '../../_lib/cart-hooks'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedCart component.
 *
 * SOURCE OF TRUTH: UnifiedCartProps
 *
 * In canvas mode, this component is rendered INSIDE an ElementWrapper which
 * provides all editor chrome. The only prop needed is the element data.
 * In preview mode, the component handles its own positioned wrapper and
 * cart sheet toggle via Zustand cart store.
 */
interface UnifiedCartProps {
  /** The cart element data -- SOURCE OF TRUTH: CartElement from types.ts */
  element: CartElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified cart button element that renders in both canvas and preview modes.
 *
 * CONTENT-ONLY in canvas mode -- the ElementWrapper handles chrome.
 * SELF-WRAPPING in preview mode -- includes a <button> tag to open the cart sheet.
 *
 * Uses computeCartContentStyles as the single source of truth for all visual
 * styles including variant overrides, typography, gradients, borders, and effects.
 */
export function UnifiedCart({ element }: UnifiedCartProps) {
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
  const contentStyle = computeCartContentStyles(element, {
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
  // CART ICON DEFAULTS
  // ==========================================================================

  /**
   * Cart element defaults to 'shopping-bag' icon at 20px size.
   * These differ from regular buttons which have no default icon.
   */
  const icon = element.icon ?? 'shopping-bag'
  const iconSize = element.iconSize ?? 20

  // ==========================================================================
  // BUTTON CONTENT RENDERER (shared between all modes)
  // ==========================================================================

  /**
   * Renders the inner button content: icon + optional label with flexbox layout.
   * The cart element is icon-primary -- the label is optional and empty by default.
   * Gap between icon and label only applies when label text exists.
   *
   * @param itemCountBadge - Optional React node for the cart item count badge.
   *   Only provided in preview mode after client hydration.
   */
  const renderButtonContent = (itemCountBadge?: React.ReactNode) => (
    <div
      data-element-content={element.id}
      className={gradientBorder.className || undefined}
      style={{
        ...contentStyle,
        /* Flexbox layout for icon + label centering */
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        /* Gap only when label text is present */
        gap: element.label ? 6 : 0,
        /* Relative positioning for potential badge absolute positioning */
        position: 'relative',
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
      {icon && element.iconPosition !== 'after' && (
        <IconRenderer
          name={icon}
          style={{
            width: iconSize,
            height: iconSize,
            flexShrink: 0,
          }}
        />
      )}

      {/* Button label (optional -- empty by default for cart button) */}
      {element.label && element.label}

      {/* Icon AFTER label */}
      {icon && element.iconPosition === 'after' && (
        <IconRenderer
          name={icon}
          style={{
            width: iconSize,
            height: iconSize,
            flexShrink: 0,
          }}
        />
      )}

      {/* Cart item count badge -- only rendered in preview mode after mount */}
      {itemCountBadge}
    </div>
  )

  // ==========================================================================
  // CANVAS MODE -- Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  /**
   * In canvas mode, render ONLY the button content with no cart badge.
   * The parent ElementWrapper provides all editor chrome (selection, hover,
   * resize handles, labels, drag handlers).
   */
  if (!isPreview) {
    return renderButtonContent()
  }

  // ==========================================================================
  // PREVIEW MODE -- Positioned wrapper with cart sheet toggle
  // ==========================================================================

  /**
   * In preview mode, the button needs its own positioned wrapper for layout.
   * Each element renderer is responsible for its own position/size in the page.
   * The page-renderer does NOT provide a positioned container.
   */
  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    /* Cart buttons default to auto-sizing (content-driven) */
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  return (
    <div
      data-cart-renderer
      data-element-id={element.id}
      style={{
        ...positionStyles,
        ...sizeStyles,
      }}
    >
      <PreviewCartWrapper
        element={element}
        iconSize={iconSize}
        renderButtonContent={renderButtonContent}
      />
    </div>
  )
}

// ============================================================================
// PREVIEW CART WRAPPER - Cart sheet toggle for published mode
// ============================================================================

/**
 * Props for the preview cart wrapper sub-component.
 *
 * Separated to keep the main component clean and avoid calling Redux cart store
 * hooks conditionally (cart hooks are only meaningful in preview mode).
 */
interface PreviewCartWrapperProps {
  /** Cart element data */
  element: CartElement
  /** Icon size for scaling the badge font size */
  iconSize: number
  /** Render function for button content, accepts optional badge node */
  renderButtonContent: (itemCountBadge?: React.ReactNode) => React.ReactNode
}

/**
 * Wraps cart button content in a <button> element that opens the cart sheet.
 *
 * HYDRATION SAFETY:
 * The cart item count differs between server (0) and client (from localStorage).
 * To prevent hydration mismatches, we track a `mounted` state and only render
 * the item count badge after the component has mounted on the client.
 *
 * Uses Redux cart store for:
 * - openCart() -- opens the shopping cart sheet/drawer
 * - useCartItemCount() -- returns total item count for the badge
 */
function PreviewCartWrapper({
  iconSize,
  renderButtonContent,
}: PreviewCartWrapperProps) {
  /**
   * Track if component has mounted to prevent hydration mismatch.
   * Cart count differs between server (0) and client (localStorage).
   */
  const [mounted, setMounted] = useState(false)

  /**
   * Access cart store to open the cart sheet and get item count.
   */
  const { openCart } = useCartActions()
  /** Reactive item count — re-renders when cart items change (e.g., validation removes stale items). */
  const totalItems = useCartItemCount()

  /** Set mounted flag on client for hydration-safe badge rendering */
  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * Cart item count badge -- only rendered after client mount.
   * Shows the count next to the icon. Caps at "9+" for visual clarity.
   */
  const itemCountBadge =
    mounted && totalItems > 0 ? (
      <span
        style={{
          fontSize: iconSize * 0.65,
          fontWeight: 500,
          opacity: 0.9,
          marginLeft: 4,
        }}
      >
        {totalItems > 9 ? '9+' : totalItems}
      </span>
    ) : null

  return (
    <button
      type="button"
      onClick={openCart}
      style={{
        /* Reset default button styles so content styles take over */
        border: 'none',
        background: 'none',
        padding: 0,
        margin: 0,
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        display: 'block',
      }}
    >
      {renderButtonContent(itemCountBadge)}
    </button>
  )
}
