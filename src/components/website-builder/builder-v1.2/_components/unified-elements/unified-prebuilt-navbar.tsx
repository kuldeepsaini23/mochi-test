/**
 * ============================================================================
 * UNIFIED PREBUILT NAVBAR - Single Component for Canvas + Preview Modes
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedPreBuiltNavbar, unified-prebuilt-navbar,
 *   prebuilt-navbar-unified, navbar-rendering
 *
 * This component replaces BOTH:
 *   - prebuilt-elements/prebuilt-navbar.tsx (canvas editor — non-interactive preview)
 *   - renderers/page-renderer/prebuilt-navbar-renderer.tsx (preview/published — fully functional)
 *
 * ============================================================================
 * ARCHITECTURE — Unified Renderer Pattern
 * ============================================================================
 *
 * ONE component handles both rendering contexts via `useRenderMode()`:
 *
 *   CANVAS MODE ('canvas'):
 *   - Non-interactive navbar preview — all children have pointerEvents: none
 *   - No mobile menu interaction (hamburger is non-functional)
 *   - No link navigation (links are just text labels)
 *   - Cart button is non-interactive (just shows the icon)
 *   - Returns CONTENT ONLY — parent ElementWrapper handles chrome
 *     (selection ring, hover ring, resize handles, drag, labels)
 *
 *   PREVIEW MODE ('preview'):
 *   - Fully interactive — links navigate via Next.js Link component
 *   - Logo is clickable, routes via resolveNavigationHref()
 *   - Mobile menu works (hamburger toggles dropdown sheet)
 *   - Cart button opens cart sheet with item count badge
 *   - CTA button is clickable and navigates
 *   - Self-contained wrapper with full positioning styles
 *
 *   SHARED (both modes):
 *   - @container CSS queries for responsive desktop/mobile layout
 *   - Logo rendering (text, image, or both)
 *   - Link layout (horizontal desktop, stacked mobile)
 *   - CTA button styling with variant defaults
 *   - Settings-driven configuration from PreBuiltNavbarElement
 *
 * ============================================================================
 * RESPONSIVE BEHAVIOR — Container-Based, NOT Viewport-Based
 * ============================================================================
 *
 * Uses @container queries so the navbar responds to its own width, not
 * the browser viewport. This is essential when the navbar is inside frames
 * or preview breakpoint containers in the canvas editor.
 *
 *   Desktop (>= mobileMenu.breakpoint or breakpoint='desktop'):
 *   - Shows logo, horizontal links, CTA button, cart button
 *
 *   Mobile (< mobileMenu.breakpoint or breakpoint='mobile'):
 *   - Shows logo, hamburger menu button
 *   - In canvas: hamburger is non-functional (layout-only)
 *   - In preview: hamburger opens full-height dropdown
 *
 * ============================================================================
 */

'use client'

import React, { memo, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import NextImage from 'next/image'
import { cn } from '@/lib/utils'
import { IconRenderer } from '@/lib/icons'
import type {
  PreBuiltNavbarElement,
  NavbarLink,
} from '../../_lib/prebuilt'
import { useRenderMode } from '../../_lib/render-mode-context'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { getStyleValue } from '../../_lib/style-utils'
import { resolveNavigationHref } from '../renderers/page-renderer/utils'
import { useCartActions, useCartItemCount } from '../../_lib/cart-hooks'
import { effectsConfigToCSS } from '../../_lib/effect-utils'
import { borderConfigToInlineStyles, hasGradientBorder } from '../../_lib/border-utils'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'
import type { EffectsConfig, BorderConfig } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedPreBuiltNavbar component.
 *
 * SOURCE OF TRUTH: UnifiedPreBuiltNavbarProps
 *
 * Minimal prop surface — mode-specific data comes from useRenderMode().
 * Canvas-specific chrome (selection ring, hover, resize, drag) is handled
 * by the parent ElementWrapper in canvas mode.
 */
export interface UnifiedPreBuiltNavbarProps {
  /** The navbar element data — from Redux in canvas, from page data in preview */
  element: PreBuiltNavbarElement

  /**
   * Whether this is a root element (directly on canvas, no parent).
   * Controls positioning mode: root = absolute, nested = relative.
   * Also controls width behavior: root = fixed, nested = 100%.
   */
  isRoot?: boolean
}

// ============================================================================
// VARIANT DEFAULTS — CTA button color fallbacks by variant
// ============================================================================

/**
 * Variant-based color defaults for the CTA button.
 * Used as fallbacks when the user hasn't set custom colors.
 * Shared between canvas and preview modes for consistency.
 */
const CTA_VARIANT_DEFAULTS: Record<string, { bg: string; text: string }> = {
  primary: { bg: '#3b82f6', text: 'white' },
  secondary: { bg: 'rgba(255,255,255,0.1)', text: 'inherit' },
  outline: { bg: 'transparent', text: 'inherit' },
}

// ============================================================================
// SHARED SUB-COMPONENTS — Used by both canvas and preview modes
// ============================================================================

/**
 * Desktop navigation links — horizontal layout, hidden on narrow containers.
 *
 * Uses @container queries so the links respond to the navbar's own width,
 * not the browser viewport. This ensures correct behavior when the navbar
 * is inside a frame or preview breakpoint container.
 *
 * In CANVAS mode: Links are non-interactive text spans (pointerEvents: none).
 * In PREVIEW mode: Links are clickable Next.js Link components with hover effects.
 *
 * The isMobileView flag is an optimization for preview mode — when the
 * breakpoint context says 'mobile', we skip rendering entirely instead of
 * relying on CSS to hide it.
 */
function NavbarDesktopLinks({
  links,
  breakpoint,
  linksTextColor,
  isCanvas,
  isMobileView,
  basePath,
  uniqueId,
}: {
  links: NavbarLink[]
  breakpoint: number
  linksTextColor?: string
  isCanvas: boolean
  isMobileView: boolean
  basePath?: string
  uniqueId: string
}) {
  if (isMobileView) return null

  const className = `navbar-desktop-links-${uniqueId}`

  return (
    <nav
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        ...(isCanvas ? { pointerEvents: 'none' as const, userSelect: 'none' as const } : {}),
      }}
    >
      {/* Container query — hides desktop links when CONTAINER is narrow */}
      <style>{`
        @container (max-width: ${breakpoint - 1}px) {
          .${className} { display: none !important; }
        }
      `}</style>

      {links.map((link) =>
        isCanvas ? (
          /* CANVAS: Non-interactive span — just shows the label text */
          <span
            key={link.id}
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: linksTextColor || 'inherit',
              opacity: 0.8,
            }}
          >
            {link.label}
          </span>
        ) : (
          /* PREVIEW: Clickable Next.js Link with hover opacity effect */
          <Link
            key={link.id}
            href={resolveNavigationHref(link.href, basePath)}
            target={link.openInNewTab ? '_blank' : undefined}
            rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: linksTextColor || 'inherit',
              textDecoration: 'none',
              opacity: 0.8,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.8'
            }}
          >
            {link.label}
          </Link>
        )
      )}
    </nav>
  )
}

/**
 * CTA Button — call-to-action button displayed in the navbar.
 *
 * In CANVAS mode: Rendered as a non-interactive button (no navigation).
 * In PREVIEW mode: Rendered as an anchor tag that navigates.
 *
 * The isMobileView flag hides the CTA on mobile in preview mode — the CTA
 * moves into the mobile dropdown instead. In canvas mode, @container queries
 * handle the hiding automatically.
 *
 * Colors fall back to variant-based defaults (CTA_VARIANT_DEFAULTS) when
 * the user hasn't set custom colors in the settings panel.
 */
function NavbarCtaButton({
  cta,
  isCanvas,
  isMobileView,
  breakpoint,
  basePath,
  uniqueId,
}: {
  cta: PreBuiltNavbarElement['settings']['ctaButton']
  isCanvas: boolean
  isMobileView: boolean
  breakpoint: number
  basePath?: string
  uniqueId: string
}) {
  if (!cta) return null

  /* In explicit mobile view (preview mode), skip rendering — it's in the dropdown */
  if (!isCanvas && isMobileView) return null

  const defaults = CTA_VARIANT_DEFAULTS[cta.variant] || CTA_VARIANT_DEFAULTS.primary

  /** Shared button styles — identical between canvas and preview */
  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    backgroundColor: cta.backgroundColor || defaults.bg,
    color: cta.textColor || defaults.text,
    border: cta.variant === 'outline' ? '1px solid currentColor' : 'none',
    textDecoration: 'none',
  }

  const className = `navbar-cta-${uniqueId}`

  if (isCanvas) {
    /**
     * CANVAS MODE: Non-interactive wrapper with @container hide.
     * The outer div handles the container query hiding, inner button shows the label.
     */
    return (
      <div
        className={className}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <style>{`
          @container (max-width: ${breakpoint - 1}px) {
            .${className} { display: none !important; }
          }
        `}</style>
        <button style={buttonStyle}>
          {cta.label}
        </button>
      </div>
    )
  }

  /**
   * PREVIEW MODE: Clickable anchor tag with navigation.
   * The @container query hides it on narrow containers (mobile layout
   * shows the CTA in the mobile dropdown instead).
   */
  return (
    <a
      href={resolveNavigationHref(cta.href, basePath)}
      target={cta.openInNewTab ? '_blank' : undefined}
      rel={cta.openInNewTab ? 'noopener noreferrer' : undefined}
      className={className}
      style={buttonStyle}
    >
      <style>{`
        @container (max-width: ${breakpoint - 1}px) {
          .${className} { display: none !important; }
        }
      `}</style>
      {cta.label}
    </a>
  )
}

/**
 * Cart button — displays a shopping bag icon in the navbar.
 *
 * In CANVAS mode: Non-interactive icon display (shows layout only).
 * In PREVIEW mode: Clickable button that opens the cart sheet + shows item count.
 *
 * Only rendered when e-commerce is enabled for the website AND settings.showCartButton
 * is not explicitly false (default is true).
 *
 * SOURCE OF TRUTH: Uses linksTextColor from main navbar settings for icon color.
 */
function NavbarCartButton({
  linksTextColor,
  breakpoint,
  isCanvas,
  isMobileView,
  showCartButton,
  uniqueId,
}: {
  linksTextColor?: string
  breakpoint: number
  isCanvas: boolean
  isMobileView: boolean
  showCartButton?: boolean
  uniqueId: string
}) {
  /**
   * Redux cart hooks — called unconditionally to follow React rules of hooks.
   * In canvas mode these values are unused (the button is non-interactive),
   * but we still call them to prevent hook ordering violations.
   */
  const { openCart } = useCartActions()
  /** Reactive item count — re-renders when cart items change (e.g., validation removes stale items). */
  const totalItems = useCartItemCount()

  /* Don't render if cart button is disabled in settings */
  if (showCartButton === false) return null

  /* In explicit mobile view (preview mode), hide — cart moves to mobile dropdown */
  if (!isCanvas && isMobileView) return null

  const className = `navbar-cart-${uniqueId}`

  if (isCanvas) {
    /**
     * CANVAS MODE: Non-interactive cart icon with container-query hiding.
     * Just shows the shopping bag icon for layout preview purposes.
     */
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          borderRadius: 6,
          color: linksTextColor || 'currentColor',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <style>{`
          @container (max-width: ${breakpoint - 1}px) {
            .${className} { display: none !important; }
          }
        `}</style>
        <IconRenderer
          name="shopping-bag"
          style={{ width: 20, height: 20 }}
        />
      </div>
    )
  }

  /**
   * PREVIEW MODE: Clickable button that opens the cart sheet.
   * Shows item count inline next to the icon when items exist.
   */
  return (
    <button
      className={className}
      onClick={openCart}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        borderRadius: 6,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: linksTextColor || 'currentColor',
        position: 'relative',
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.7'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1'
      }}
    >
      <style>{`
        @container (max-width: ${breakpoint - 1}px) {
          .${className} { display: none !important; }
        }
      `}</style>
      <IconRenderer
        name="shopping-bag"
        style={{ width: 20, height: 20 }}
      />
      {/* Inline item count — compact display next to the icon */}
      {totalItems > 0 && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            opacity: 0.9,
            marginLeft: 4,
          }}
        >
          {totalItems > 9 ? '9+' : totalItems}
        </span>
      )}
    </button>
  )
}

/**
 * Mobile menu button — hamburger icon that toggles the mobile dropdown.
 *
 * Uses @container queries to only show when the navbar container is narrow
 * (below the mobileMenu.breakpoint). This is container-based, not viewport-based.
 *
 * In CANVAS mode: Non-interactive — just shows the hamburger layout.
 * In PREVIEW mode: Clickable — toggles the mobile dropdown via onToggle callback.
 *
 * SOURCE OF TRUTH: Uses linksTextColor from main navbar settings for icon color.
 */
function NavbarMobileMenuButton({
  isOpen,
  onToggle,
  isCanvas,
  isMobileView,
  breakpoint,
  linksTextColor,
  uniqueId,
}: {
  isOpen: boolean
  onToggle?: () => void
  isCanvas: boolean
  isMobileView: boolean
  breakpoint: number
  linksTextColor?: string
  uniqueId: string
}) {
  const className = `navbar-mobile-btn-${uniqueId}`

  return (
    <button
      className={cn(
        className,
        /* Canvas mode: prevent all pointer interaction */
        isCanvas && 'pointer-events-none'
      )}
      onClick={!isCanvas ? onToggle : undefined}
      style={{
        padding: 8,
        /* In explicit mobile view, force-show the button via inline display */
        display: isMobileView ? 'flex' : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        cursor: isCanvas ? 'default' : 'pointer',
        color: linksTextColor || 'currentColor',
      }}
    >
      {/* Container query — hides hamburger when CONTAINER is wide (desktop layout) */}
      <style>{`
        @container (min-width: ${breakpoint}px) {
          .${className} { display: none !important; }
        }
      `}</style>

      {/* Toggle between X (close) and hamburger (open) SVG icons */}
      {isOpen ? (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      )}
    </button>
  )
}

// ============================================================================
// PREVIEW-ONLY SUB-COMPONENT — Mobile Sheet (Slide-out Panel)
// ============================================================================

/**
 * Mobile menu sheet — PREVIEW MODE ONLY.
 *
 * Slides in from the RIGHT side of the viewport as a full-height panel,
 * similar to how a sidebar or cart sheet works. This replaces the old
 * dropdown approach which caused issues with overflow clipping and
 * positioning relative to sticky/fixed navbars.
 *
 * WHY SHEET OVER DROPDOWN:
 * - Dropdowns positioned below sticky navbars have z-index/clipping issues
 * - Sheet pattern is a well-established mobile UX (like iOS/Android nav drawers)
 * - Full-height panel gives more room for links, CTA, and cart
 * - Backdrop overlay provides clear visual separation from page content
 *
 * Uses explicit mobileMenu color settings when provided.
 * Falls back to inheriting from the main navbar for visual consistency:
 * - Background: mobileMenu.backgroundColor → navbar styles.backgroundColor → #1a1a1a
 * - Text: mobileMenu.textColor → linksTextColor → styles.color → #ffffff
 */
function NavbarMobileSheet({
  isOpen,
  onClose,
  settings,
  navbarStyles,
  basePath,
  enableEcommerce,
}: {
  isOpen: boolean
  onClose: () => void
  settings: PreBuiltNavbarElement['settings']
  navbarStyles?: React.CSSProperties
  basePath?: string
  enableEcommerce: boolean
}) {
  const { links, ctaButton, linksTextColor, showCartButton } = settings

  /** Redux cart store for mobile cart button */
  const { openCart } = useCartActions()
  /** Reactive item count — re-renders when cart items change (e.g., validation removes stale items). */
  const totalItems = useCartItemCount()

  /**
   * Resolve sheet colors with 3-tier fallback:
   * 1. Explicit mobileMenu color settings (user-defined overrides)
   * 2. Inherited from main navbar styles (backgroundColor / linksTextColor)
   * 3. Dark defaults (#1a1a1a / #ffffff) so the sheet is always readable
   *
   * IMPORTANT: 'transparent' is a truthy string, so we explicitly check for it.
   * A transparent sheet is unusable — users see through it to the page content.
   * SOURCE OF TRUTH: MobileMenuBackgroundColor, MobileMenuTextColor
   */
  const mobileMenuBg = settings.mobileMenu?.backgroundColor
  const mobileMenuText = settings.mobileMenu?.textColor
  const rawBg = navbarStyles?.backgroundColor as string | undefined
  const sheetBg =
    (mobileMenuBg && mobileMenuBg !== 'transparent' ? mobileMenuBg : null) ??
    (rawBg && rawBg !== 'transparent' ? rawBg : null) ??
    '#1a1a1a'
  const sheetText =
    (mobileMenuText && mobileMenuText !== 'transparent' ? mobileMenuText : null) ??
    (linksTextColor || (navbarStyles?.color as string) || '#ffffff')

  /**
   * MOUNT/UNMOUNT LIFECYCLE — Keeps the sheet in the DOM during the exit
   * animation so users see a smooth reverse slide instead of an instant flash.
   *
   * `isOpen` = parent wants the sheet open/closed (intent).
   * `isMounted` = sheet is actually in the DOM (includes exit animation time).
   * `isClosing` = sheet is playing the exit animation before unmounting.
   *
   * Flow: open → isMounted=true, isClosing=false
   *       close → isClosing=true, wait for animation → isMounted=false
   */
  const [isMounted, setIsMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Exit animation duration in ms — matches the CSS animation timing below */
  const EXIT_DURATION = 300

  useEffect(() => {
    if (isOpen) {
      /* Opening: mount immediately, clear any pending close timer */
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current)
        closingTimerRef.current = null
      }
      setIsClosing(false)
      setIsMounted(true)
    } else if (isMounted) {
      /* Closing: start exit animation, unmount after it finishes */
      setIsClosing(true)
      closingTimerRef.current = setTimeout(() => {
        setIsMounted(false)
        setIsClosing(false)
        closingTimerRef.current = null
      }, EXIT_DURATION)
    }

    return () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Trigger close animation when user taps backdrop or close button */
  const handleClose = useCallback(() => {
    if (!isClosing) onClose()
  }, [isClosing, onClose])

  /**
   * Sheet animation keyframes — injected once per render.
   *
   * SLIDE-IN uses a spring-like cubic-bezier curve:
   * cubic-bezier(0.32, 0.72, 0, 1) — fast launch, gentle deceleration with
   * a slight overshoot feel. Matches the motion style used by iOS/Apple sheets.
   *
   * SLIDE-OUT uses cubic-bezier(0.4, 0, 0.6, 1) — symmetric ease-in-out
   * that feels like the panel is being pulled back into its resting position.
   *
   * BACKDROP fades in faster than the sheet slides so the darkened background
   * is already settling by the time the panel arrives.
   */
  const animationStyles = `
    @keyframes navbarSheetSlideIn {
      0%   { transform: translateX(100%); opacity: 0; }
      40%  { opacity: 1; }
      100% { transform: translateX(0); opacity: 1; }
    }
    @keyframes navbarSheetSlideOut {
      0%   { transform: translateX(0); opacity: 1; }
      60%  { opacity: 1; }
      100% { transform: translateX(100%); opacity: 0; }
    }
    @keyframes navbarSheetBackdropIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes navbarSheetBackdropOut {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
  `

  /* Don't render anything when fully unmounted */
  if (!isMounted) return null

  return (
    <>
      <style>{animationStyles}</style>

      {/* Backdrop overlay — semi-transparent dark layer, clicking closes the sheet.
          Uses inset:0 instead of viewport units so it fills the containing block,
          whether that's the browser viewport (published pages) or the phone frame
          (preview mode where transform: translateZ(0) creates a containing block). */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          animation: isClosing
            ? `navbarSheetBackdropOut ${EXIT_DURATION}ms cubic-bezier(0.4, 0, 0.6, 1) forwards`
            : 'navbarSheetBackdropIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
        }}
      />

      {/* Sheet panel — slides in from the right, full height of containing block.
          Uses top/right/bottom for right-alignment, and percentage width
          so it respects the containing block (phone frame in preview,
          viewport on published pages). */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '80%',
          maxWidth: 380,
          backgroundColor: sheetBg,
          zIndex: 10001,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          animation: isClosing
            ? `navbarSheetSlideOut ${EXIT_DURATION}ms cubic-bezier(0.4, 0, 0.6, 1) forwards`
            : 'navbarSheetSlideIn 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards',
          /**
           * Subtle left border for visual separation from backdrop.
           * Uses the text color at low opacity so it adapts to any theme.
           */
          borderLeft: `1px solid ${sheetText}15`,
        }}
      >
        {/* Sheet header — close button at top right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '16px 20px',
          }}
        >
          <button
            onClick={handleClose}
            aria-label="Close menu"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: `${sheetText}10`,
              border: 'none',
              cursor: 'pointer',
              color: sheetText,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${sheetText}20`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = `${sheetText}10`
            }}
          >
            {/* X icon for close */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Sheet content — navigation links, cart button, and CTA */}
        <div
          style={{
            padding: '0 24px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flex: 1,
          }}
        >
          {/* Mobile Navigation Links — stacked vertically with dividers */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {links.map((link) => (
              <Link
                key={link.id}
                href={resolveNavigationHref(link.href, basePath)}
                target={link.openInNewTab ? '_blank' : undefined}
                rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
                onClick={handleClose}
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: sheetText,
                  textDecoration: 'none',
                  padding: '14px 0',
                  borderBottom: `1px solid ${sheetText}15`,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.7'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile Cart Button — only when e-commerce is enabled */}
          {enableEcommerce && showCartButton !== false && (
            <button
              onClick={() => {
                openCart()
                handleClose()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                marginTop: 16,
                padding: '14px 16px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                textDecoration: 'none',
                textAlign: 'center',
                backgroundColor: 'transparent',
                color: sheetText,
                border: `1px solid ${sheetText}30`,
                cursor: 'pointer',
                transition: 'opacity 0.2s',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.7'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              <IconRenderer
                name="shopping-bag"
                style={{ width: 18, height: 18 }}
              />
              <span>
                Cart
                {totalItems > 0 && ` (${totalItems > 9 ? '9+' : totalItems})`}
              </span>
            </button>
          )}

          {/* Mobile CTA Button — full-width action button */}
          {ctaButton && (
            <Link
              href={resolveNavigationHref(ctaButton.href, basePath)}
              target={ctaButton.openInNewTab ? '_blank' : undefined}
              rel={ctaButton.openInNewTab ? 'noopener noreferrer' : undefined}
              onClick={handleClose}
              style={{
                marginTop: 24,
                padding: '14px 16px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: 'none',
                textAlign: 'center',
                backgroundColor: ctaButton.backgroundColor || '#3b82f6',
                color: ctaButton.textColor || 'white',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              {ctaButton.label}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}

// ============================================================================
// SHARED LOGO RENDERER
// ============================================================================

/**
 * Logo sub-component — renders logo image, text, or both.
 *
 * In CANVAS mode: Rendered as a non-interactive div (no navigation).
 * In PREVIEW mode: Rendered as a clickable anchor tag that routes home.
 *
 * Uses the logo.textColor setting, falling back to 'inherit'.
 */
function NavbarLogo({
  settings,
  isCanvas,
  basePath,
}: {
  settings: PreBuiltNavbarElement['settings']
  isCanvas: boolean
  basePath?: string
}) {
  const { logo } = settings

  /** Shared content — image and/or text logo */
  const logoContent = (
    <>
      {/* Image logo — rendered when type is 'image' or 'both'.
          Height is driven by logo.logoSize (user-controlled slider), defaulting to 32px.
          Uses Next Image for optimized loading (WebP conversion, caching). */}
      {(logo.type === 'image' || logo.type === 'both') && logo.imageUrl && (
        <NextImage
          src={logo.imageUrl}
          alt={logo.text || 'Logo'}
          width={0}
          height={logo.logoSize ?? 32}
          sizes="200px"
          priority
          style={{ height: logo.logoSize ?? 32, width: 'auto', objectFit: 'contain' }}
        />
      )}

      {/* Text logo — rendered when type is 'text' or 'both' */}
      {(logo.type === 'text' || logo.type === 'both') && logo.text && (
        <span style={{ fontSize: 20, fontWeight: 600 }}>
          {logo.text}
        </span>
      )}
    </>
  )

  /** Shared styles for the logo wrapper */
  const sharedStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: logo.textColor || 'inherit',
  }

  if (isCanvas) {
    /**
     * CANVAS MODE: Non-interactive div wrapper.
     * pointerEvents: none prevents any click/hover interaction.
     */
    return (
      <div
        style={{
          ...sharedStyle,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {logoContent}
      </div>
    )
  }

  /**
   * PREVIEW MODE: Clickable anchor that navigates to the logo href.
   * Uses resolveNavigationHref to handle basePath-aware routing.
   */
  return (
    <a
      href={resolveNavigationHref(logo.href, basePath)}
      style={{
        ...sharedStyle,
        textDecoration: 'none',
      }}
    >
      {logoContent}
    </a>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Unified PreBuilt Navbar Component
 *
 * Renders a complete, responsive navigation bar in both canvas editor and
 * preview/published modes. The rendering mode is determined internally via
 * `useRenderMode()` — never passed as a prop.
 *
 * CANVAS MODE: Returns content only (no wrapper with position/size styles).
 *   The parent ElementWrapper handles all editor chrome and positioning.
 *
 * PREVIEW MODE: Returns a self-contained wrapper with full position and
 *   size styles, interactive links, functional mobile menu, and cart button.
 */
export const UnifiedPreBuiltNavbar = memo(function UnifiedPreBuiltNavbar({
  element,
  isRoot: isRootProp,
}: UnifiedPreBuiltNavbarProps) {
  const { mode, breakpoint, basePath, enableEcommerce, isBreakpointFrame } = useRenderMode()
  const isCanvas = mode === 'canvas'

  const { settings, styles } = element

  /**
   * Mobile menu state — only functional in preview mode.
   * In canvas mode, the hamburger is non-interactive but we still call
   * useState to follow React rules of hooks (consistent hook ordering).
   */
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  /**
   * Determine if we're in mobile view based on breakpoint context.
   * When true in preview mode, we render mobile layout directly
   * instead of relying on @container queries.
   */
  const isMobileView = breakpoint === 'mobile'

  /**
   * Mobile breakpoint threshold from settings (default 768px).
   * Used by @container queries and mobile menu button visibility.
   */
  const mobileBreakpoint = settings.mobileMenu?.breakpoint || 768

  /**
   * Determine root status from prop or element data.
   * Root elements use absolute positioning; nested use relative.
   * Also affects width: root = fixed, nested = 100%.
   */
  const isRoot = isRootProp ?? (element.parentId === null)

  /**
   * Unique ID for CSS class names to prevent collisions between multiple navbars.
   * Uses the element's unique ID which is stable across re-renders.
   */
  const uniqueId = element.id.replace(/[^a-zA-Z0-9]/g, '')

  /**
   * Navbar height for mobile dropdown positioning.
   * Falls back to 60px if element.height is undefined.
   */
  const navbarHeight = element.height || 60

  // ========================================================================
  // LAYOUT MODE — Determines the visual arrangement of logo, links, and CTA
  // ========================================================================

  /**
   * 'logo-left' (default): Logo left, links center, CTA right
   * 'logo-center': Links left, logo centered, CTA right
   *
   * For 'logo-center' we swap which section holds the logo vs links and
   * give the left/right sections flex:1 so the logo is truly centered.
   */
  const layout = settings.layout || 'logo-left'
  const isCenteredLogo = layout === 'logo-center'

  // ========================================================================
  // CONTENT RENDERING — Shared navbar body (used in both modes)
  // ========================================================================

  /**
   * Content styles — the inner navbar appearance.
   * This is the actual visual bar with flexbox layout.
   *
   * BOTH modes spread element.styles so user-set properties (borderRadius,
   * boxShadow, border, backgroundColor, padding, etc.) are applied consistently.
   * Canvas clips overflow; preview keeps it visible for cart badges & dropdowns.
   */
  const effectsConfig = (styles as Record<string, unknown>)?.__effects as EffectsConfig | undefined
  const effectsStyles = effectsConfigToCSS(effectsConfig)

  /**
   * Extract border config from styles.__borderConfig.
   * Borders are stored as a structured config (per-side style/width/color)
   * and must be converted to inline CSS via borderConfigToInlineStyles().
   * Without this, spreading `...styles` just copies the raw __borderConfig
   * object which React ignores as a CSS property.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const borderConfig = (styles as any)?.__borderConfig as BorderConfig | undefined
  const borderStyles = borderConfig ? borderConfigToInlineStyles(borderConfig) : {}
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  const contentStyle: React.CSSProperties = isCanvas
    ? {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...styles,
        ...effectsStyles,
        ...borderStyles,
        /* Strip margin — it belongs on the outer wrapper, not the inner content.
           Without this, margin pushes content inward like padding. */
        margin: undefined,
        overflow: 'hidden',
        /* Gradient borders use a ::before pseudo-element that needs position:relative */
        ...(gradientBorder.isActive ? { position: 'relative' as const } : {}),
      }
    : {
        ...styles,
        ...effectsStyles,
        ...borderStyles,
        /* Strip margin — applied on the outer wrapper via positionStyles */
        margin: undefined,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: styles?.padding || '0 24px',
        backgroundColor: styles?.backgroundColor || 'transparent',
        color: styles?.color || 'inherit',
        overflow: 'visible',
        /* Gradient borders use a ::before pseudo-element that needs position:relative */
        ...(gradientBorder.isActive ? { position: 'relative' as const } : {}),
      }

  /** CSS class names for layout sections — used by @container queries */
  const leftSectionClass = `navbar-left-${uniqueId}`
  const centerSectionClass = `navbar-center-${uniqueId}`
  const rightSectionClass = `navbar-right-${uniqueId}`

  /**
   * The navbar content — stable 3-column flex layout.
   *
   * BOTH layouts use the same flex strategy:
   *   LEFT (flex:1) — CENTER (flexShrink:0) — RIGHT (flex:1)
   *
   * This guarantees the center column is ALWAYS truly centered regardless
   * of how much content is in left vs right (e.g., removing CTA won't shift things).
   *
   * LOGO-LEFT:  [Logo] ---- [Links] ---- [CTA + Cart + Hamburger]
   * LOGO-CENTER: [Links] ---- [Logo] ---- [CTA + Cart + Hamburger]
   *
   * On mobile (below breakpoint), the layout collapses to:
   *   [Logo] ---- [Hamburger]
   *   Links and CTA hide via @container queries.
   */
  const navbarContent = (
    <div style={contentStyle}>
      {/* @container queries for mobile collapse.
          LOGO-LEFT mobile: hide center (links), left stays (logo), right stays (hamburger).
          LOGO-CENTER mobile: hide left (links), center shows logo, right stays (hamburger).
          Both layouts converge to: [Logo] --- [Hamburger] on mobile. */}
      <style>{`
        @container (max-width: ${mobileBreakpoint - 1}px) {
          ${isCenteredLogo
            ? `
          .${leftSectionClass} { display: none !important; }
          .${centerSectionClass} { flex: 0 0 auto !important; }
          `
            : `
          .${leftSectionClass} { flex: 0 0 auto !important; }
          .${centerSectionClass} { display: none !important; }
          `
          }
          .${rightSectionClass} { flex: 0 0 auto !important; }
        }
      `}</style>

      {/* LEFT SECTION — Logo (logo-left) or Links (logo-center).
          Always flex:1 so center column stays perfectly centered regardless
          of how many items are in left vs right. */}
      <div
        className={leftSectionClass}
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          minWidth: 0,
          justifyContent: 'flex-start',
        }}
      >
        {isCenteredLogo ? (
          <NavbarDesktopLinks
            links={settings.links}
            breakpoint={mobileBreakpoint}
            linksTextColor={settings.linksTextColor}
            isCanvas={isCanvas}
            isMobileView={isMobileView}
            basePath={basePath}
            uniqueId={uniqueId}
          />
        ) : (
          <NavbarLogo settings={settings} isCanvas={isCanvas} basePath={basePath} />
        )}
      </div>

      {/* CENTER SECTION — Links (logo-left) or Logo (logo-center).
          Always flexShrink:0 so it keeps its natural size while left/right
          absorb remaining space equally. This guarantees true centering. */}
      <div
        className={centerSectionClass}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {isCenteredLogo ? (
          <NavbarLogo settings={settings} isCanvas={isCanvas} basePath={basePath} />
        ) : (
          <NavbarDesktopLinks
            links={settings.links}
            breakpoint={mobileBreakpoint}
            linksTextColor={settings.linksTextColor}
            isCanvas={isCanvas}
            isMobileView={isMobileView}
            basePath={basePath}
            uniqueId={uniqueId}
          />
        )}
      </div>

      {/* RIGHT SECTION — CTA + Cart + Mobile hamburger (both layouts).
          Always flex:1 to match left section and keep center truly centered. */}
      <div
        className={rightSectionClass}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 1,
          minWidth: 0,
          justifyContent: 'flex-end',
        }}
      >
        {(isCanvas ? enableEcommerce && settings.showCartButton !== false : !!enableEcommerce) && (
          <NavbarCartButton
            linksTextColor={settings.linksTextColor}
            breakpoint={mobileBreakpoint}
            isCanvas={isCanvas}
            isMobileView={isMobileView}
            showCartButton={settings.showCartButton}
            uniqueId={uniqueId}
          />
        )}
        <NavbarCtaButton
          cta={settings.ctaButton}
          isCanvas={isCanvas}
          isMobileView={isMobileView}
          breakpoint={mobileBreakpoint}
          basePath={basePath}
          uniqueId={uniqueId}
        />
        {settings.links.length > 0 && (
          <NavbarMobileMenuButton
            isOpen={isMobileMenuOpen}
            onToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isCanvas={isCanvas}
            isMobileView={isMobileView}
            breakpoint={mobileBreakpoint}
            linksTextColor={settings.linksTextColor}
            uniqueId={uniqueId}
          />
        )}
      </div>

      {/* Gradient border overlay — renders ::before pseudo-element for gradient borders */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={contentStyle.borderRadius}
        />
      )}
    </div>
  )

  // ========================================================================
  // HOOKS — Called unconditionally before any early returns (React rules)
  // ========================================================================

  /**
   * Compute position and size styles for the preview wrapper.
   * Called unconditionally (React hook rules) but only used in preview mode.
   */
  const positionStyles = computeElementPositionStyles(element, isRoot, breakpoint)
  const sizeStyles = useElementSizeStyles(element, breakpoint)

  /**
   * Read sticky settings from the navbar element.
   * When enabled (default: true), the navbar uses position: fixed
   * to pin at the top in preview/published mode.
   *
   * DISABLED in BreakpointMobileFrame — that's a canvas reference view,
   * not a real scrollable viewport. Fixed positioning would escape the frame.
   */
  const isSticky = (settings.sticky?.enabled ?? true) && !isBreakpointFrame

  // ========================================================================
  // CANVAS MODE — Return content only, ElementWrapper handles chrome
  // ========================================================================

  if (isCanvas) {
    /**
     * In canvas mode, return just the navbar content.
     * The parent ElementWrapper provides:
     *   - Position styles (absolute/relative, left/top, transform, zIndex)
     *   - Canvas interaction overrides (opacity, cursor, isolation)
     *   - Selection/hover ring overlay
     *   - Resize handles
     *   - Element name label and dimensions pill
     *   - Drag/hover event handlers
     *
     * containerType is set on ElementWrapper's wrapper div via sizeStyleOverrides
     * to enable @container queries inside this content.
     */
    return navbarContent
  }

  // ========================================================================
  // PREVIEW MODE — Self-contained wrapper with full positioning
  // ========================================================================

  return (
    <div
      data-element-id={element.id}
      data-prebuilt="navbar"
      style={{
        /**
         * Spread all position + size styles first so user properties are preserved.
         * Then override only the fixed-positioning properties when sticky is enabled.
         */
        ...positionStyles,
        ...sizeStyles,
        containerType: 'inline-size' as const,
        /**
         * FIXED POSITIONING — Overrides only position-specific properties.
         *
         * When sticky is enabled, pin to top of the containing block with
         * position: fixed. The spread above keeps height and all other styles.
         * transform: 'none' prevents centering transforms from offsetting the bar.
         *
         * SOURCE OF TRUTH: NavbarFixedCSS, NavbarStickyFix
         */
        ...(isSticky
          ? {
              /**
               * STICKY POSITIONING — Pins navbar to top while scrolling.
               *
               * position: sticky is the ONLY CSS approach that works inside
               * container-type: inline-size ancestors. position: fixed gets
               * trapped by container-type (behaves like absolute, doesn't
               * stay fixed during scroll).
               *
               * top: Uses the element's margin-top so the navbar sticks with
               * the same visual offset the user configured.
               *
               * SOURCE OF TRUTH: NavbarStickyCSS, NavbarStickyFix
               */
              position: 'sticky' as const,
              top: getStyleValue<string>(element, 'margin', breakpoint)?.split(' ')[0] ?? 0,
              zIndex: 9999,
            }
          : { zIndex: 9999 }),
      }}
    >
      {/* Main navbar content */}
      {navbarContent}

      {/* Mobile sheet — slides in from the right as a full-height panel.
          Uses fixed positioning so it's independent of navbar's sticky/overflow behavior.
          Only rendered in preview mode (canvas has no interactive mobile menu). */}
      <NavbarMobileSheet
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        settings={settings}
        navbarStyles={contentStyle}
        basePath={basePath}
        enableEcommerce={enableEcommerce ?? false}
      />
    </div>
  )
})

// ============================================================================
// CANVAS HELPER — Provides sizeStyleOverrides for ElementWrapper
// ============================================================================

/**
 * Hook to compute the size style overrides that ElementWrapper needs
 * when wrapping a UnifiedPreBuiltNavbar component in canvas mode.
 *
 * Prebuilt navbars have specific size behavior:
 * - Width: 100% when inside a parent, fixed pixel width when root
 * - Height: Fixed pixel height (navbars don't auto-grow)
 * - containerType: 'inline-size' is required for @container queries
 *
 * USAGE:
 * ```tsx
 * const navbarMeta = useUnifiedPreBuiltNavbarMeta(element)
 *
 * <ElementWrapper
 *   element={element}
 *   sizeStyleOverrides={navbarMeta.sizeStyles}
 *   ...
 * >
 *   <UnifiedPreBuiltNavbar element={element} />
 * </ElementWrapper>
 * ```
 */
export function useUnifiedPreBuiltNavbarMeta(element: PreBuiltNavbarElement) {
  /**
   * Compute size styles for the navbar element.
   * useElementSizeStyles already handles autoWidth (fill → '100%', fixed → pixel width),
   * so we pass the result through without overriding width.
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop')

  return {
    sizeStyles: {
      ...sizeStyles,
      /**
       * containerType: 'inline-size' enables @container CSS queries.
       * This MUST be set on the ElementWrapper's outer div so the
       * navbar's internal @container rules respond to the wrapper width.
       */
      containerType: 'inline-size' as const,
    },
  }
}
