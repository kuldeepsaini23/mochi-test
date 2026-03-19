/**
 * ============================================================================
 * UNIFIED PREBUILT SIDEBAR - Single Component for Canvas + Preview Modes
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedPreBuiltSidebar, unified-prebuilt-sidebar,
 * sidebar-layout, sidebar-navigation
 *
 * This component replaces the old split pattern of:
 *   - prebuilt-elements/prebuilt-sidebar.tsx (canvas-only)
 *   - renderers/page-renderer/prebuilt-sidebar-renderer.tsx (preview-only)
 *
 * It renders the prebuilt sidebar element in BOTH modes using `useRenderMode()`:
 *
 *   CANVAS MODE:
 *   - Returns ONLY the inner content (sidebar panel + inset area).
 *   - ElementWrapper handles all editor chrome (selection ring, hover ring,
 *     resize handles, labels, dimension pill).
 *   - Sidebar panel is non-interactive (pointerEvents: none on children).
 *   - Inset area receives children that can be interacted with.
 *   - No mobile drawer or collapsible behavior — always expanded for editing.
 *
 *   PREVIEW MODE:
 *   - Self-contained wrapper with full positioning.
 *   - Root: absolute; inside parent: fixed (fills viewport); mobile frame: relative.
 *   - Links are interactive: Next.js <Link> for client-side navigation.
 *   - Mobile drawer with hamburger trigger via @container queries.
 *   - Dynamic active link state from URL pathname.
 *   - Container query scoping for responsive sidebar hide/show.
 *
 *   SHARED (both modes):
 *   - Sidebar panel: logo, nav links (with active/hover state), footer.
 *   - Two-part flexbox layout: sidebar (left, fixed width) + inset (right, flex 1).
 *   - Settings-driven configuration from PreBuiltSidebarElement.settings.
 *
 * ============================================================================
 * KEY ARCHITECTURE — TWO PARTS
 * ============================================================================
 *
 * 1. SIDEBAR PANEL (left side):
 *    - Fixed navigation panel with logo, links, and optional footer.
 *    - NOT user-editable — configuration via Settings panel only.
 *    - Width is configurable via settings.appearance.width.
 *
 * 2. SIDEBAR INSET (right side):
 *    - Content area where users CAN drop elements.
 *    - Receives children prop from canvas.tsx or page-renderer.tsx.
 *    - Acts like a protected frame — cannot be deleted.
 *
 * ============================================================================
 * RENDER PROP ELIMINATION
 * ============================================================================
 *
 * The old preview renderer used a `renderElement` callback to avoid circular
 * imports. The unified version accepts `children` directly — the parent
 * (canvas.tsx or page-renderer.tsx) renders the inset frame's children and
 * passes them as a React children prop, just like UnifiedFrame and UnifiedLink.
 *
 * ============================================================================
 */

'use client'

import React, { memo, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import NextImage from 'next/image'
import type { PreBuiltSidebarElement, SidebarLink } from '../../_lib/prebuilt'
import { useRenderMode } from '../../_lib'
import { IconRenderer } from '@/lib/icons'
import { resolveNavigationHref } from '../renderers/page-renderer/utils'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedPreBuiltSidebar component.
 *
 * SOURCE OF TRUTH: UnifiedPreBuiltSidebarProps
 *
 * Both canvas and preview modes receive the same props. The component uses
 * useRenderMode() internally to decide which rendering path to take.
 */
export interface UnifiedPreBuiltSidebarProps {
  /** The sidebar element data from the element tree */
  element: PreBuiltSidebarElement
  /** Whether this element is a root element (directly on canvas, no parent) */
  isRoot?: boolean
  /**
   * Children elements to render inside the inset area.
   * In canvas mode, these come from canvas.tsx rendering the inset frame.
   * In preview mode, these come from page-renderer.tsx rendering child elements.
   */
  children?: React.ReactNode
}

// ============================================================================
// SHARED HELPER: Extract current page slug from URL
// ============================================================================

/**
 * Extract current page slug from URL pathname for dynamic active link state.
 *
 * URL patterns:
 * - Canvas editor: /{domainName}/{slug}/edit
 * - Live site: /{domainName}/{slug} or /{slug}
 *
 * Returns the slug portion of the URL (without leading slash).
 * Falls back to empty string if unable to parse.
 */
function getCurrentPageSlug(): string {
  if (typeof window === 'undefined') return ''

  try {
    const pathname = window.location.pathname
    const segments = pathname.split('/').filter(Boolean)

    if (segments.length >= 2) {
      // Check if last segment is 'edit' (canvas mode)
      const isEditMode = segments[segments.length - 1] === 'edit'
      // The slug is the second-to-last segment in edit mode, or last segment otherwise
      const slugIndex = isEditMode ? segments.length - 2 : segments.length - 1
      return segments[slugIndex] || ''
    }

    // Single segment — might be the slug directly
    if (segments.length === 1) {
      return segments[0] || ''
    }

    return ''
  } catch {
    return ''
  }
}

// ============================================================================
// SHARED HELPER: Check if a link matches the current page slug
// ============================================================================

/**
 * Check if a sidebar link matches the current page slug.
 * Compares the link's href against the current URL.
 *
 * @param link - The sidebar link to check
 * @param currentSlug - The current page slug from URL
 * @returns true if the link should be shown as active
 */
function isLinkActive(link: SidebarLink, currentSlug: string): boolean {
  if (!currentSlug) return false

  // Remove leading/trailing slashes for comparison
  const linkSlug = link.href?.replace(/^\/|\/$/g, '') || ''

  // Direct slug match
  if (linkSlug === currentSlug) return true

  // Check if href ends with the slug (handles /dashboard/overview matching 'overview')
  if (linkSlug.endsWith(`/${currentSlug}`)) return true

  // Check if slug starts with link path (handles 'dashboard' matching '/dashboard/settings')
  if (currentSlug.startsWith(linkSlug) && linkSlug !== '') return true

  return false
}

// ============================================================================
// SHARED HOOK: URL-based active slug tracking with popstate + polling
// ============================================================================

/**
 * Hook to track current page slug for dynamic active link state.
 * Listens for popstate events (back/forward) and polls for URL changes
 * (catches history.pushState and history.replaceState in SPA navigation).
 */
function useCurrentSlug(): string {
  const [currentSlug, setCurrentSlug] = useState<string>('')

  useEffect(() => {
    // Initial slug on mount
    setCurrentSlug(getCurrentPageSlug())

    // Listen for popstate (back/forward navigation)
    const handlePopState = () => {
      setCurrentSlug(getCurrentPageSlug())
    }

    window.addEventListener('popstate', handlePopState)

    // Poll for URL changes every 500ms — catches programmatic navigation
    // (history.pushState/replaceState) that doesn't fire popstate
    let lastUrl = window.location.href
    const urlCheckInterval = setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href
        setCurrentSlug(getCurrentPageSlug())
      }
    }, 500)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      clearInterval(urlCheckInterval)
    }
  }, [])

  return currentSlug
}

// ============================================================================
// SHARED SUBCOMPONENT: Sidebar Logo
// ============================================================================

/**
 * Sidebar Logo — shared between canvas and preview modes.
 *
 * In canvas mode, renders as a plain div (non-interactive).
 * In preview mode, renders as an anchor tag for navigation.
 *
 * @param settings - The sidebar settings containing logo configuration
 * @param isCanvasMode - Whether rendering in canvas (editor) mode
 * @param basePath - Base path for resolving internal links (preview only)
 */
function SidebarLogo({
  settings,
  isCanvasMode,
  basePath,
}: {
  settings: PreBuiltSidebarElement['settings']
  isCanvasMode: boolean
  basePath?: string
}) {
  const { logo, appearance } = settings

  /** Shared styles between both modes */
  const sharedStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '16px 16px 24px 16px',
    color: logo.textColor || appearance.textColor || 'inherit',
    borderBottom: `1px solid ${appearance.borderColor || '#e5e5e5'}`,
    marginBottom: 16,
  }

  /** Shared logo content (image + text).
   *  Image height is driven by logo.logoSize (user-controlled slider), defaulting to 28px. */
  const logoContent = (
    <>
      {/* Image logo — Next Image for optimized loading.
          Height is driven by logo.logoSize (user-controlled slider), defaulting to 28px. */}
      {(logo.type === 'image' || logo.type === 'both') && logo.imageUrl && (
        <NextImage
          src={logo.imageUrl}
          alt={logo.text || 'Logo'}
          width={0}
          height={logo.logoSize ?? 28}
          sizes="200px"
          style={{ height: logo.logoSize ?? 28, width: 'auto', objectFit: 'contain' }}
        />
      )}
      {/* Text logo */}
      {(logo.type === 'text' || logo.type === 'both') && logo.text && (
        <span style={{ fontSize: 18, fontWeight: 600 }}>
          {logo.text}
        </span>
      )}
    </>
  )

  /**
   * Canvas mode: non-interactive div with disabled pointer events.
   * Users configure the logo through the Settings panel, not by clicking.
   */
  if (isCanvasMode) {
    return (
      <div style={{ ...sharedStyle, pointerEvents: 'none', userSelect: 'none' }}>
        {logoContent}
      </div>
    )
  }

  /**
   * Preview mode: clickable anchor tag with resolved navigation href.
   * Links to the configured logo.href (usually home page).
   */
  return (
    <a
      href={resolveNavigationHref(logo.href, basePath)}
      style={{ ...sharedStyle, textDecoration: 'none' }}
    >
      {logoContent}
    </a>
  )
}

// ============================================================================
// SHARED SUBCOMPONENT: Sidebar Navigation Links
// ============================================================================

/**
 * Sidebar Navigation Links — vertical list of nav items and separators.
 *
 * CANVAS MODE:
 * - Non-interactive (pointerEvents: none) — visual only.
 * - Hover effects disabled.
 * - Links rendered as plain divs.
 *
 * PREVIEW MODE:
 * - Interactive with hover effects and transitions.
 * - Links rendered as Next.js <Link> for client-side navigation.
 * - Active state determined dynamically from URL.
 *
 * SHARED:
 * - Dynamic active link detection from URL pathname.
 * - Configurable colors: linksTextColor, activeLinkColor, hoverLinkColor.
 * - Separator items with uppercase styling.
 * - Configurable gap between link items via linksGap.
 */
function SidebarNavLinks({
  settings,
  isCanvasMode,
  basePath,
}: {
  settings: PreBuiltSidebarElement['settings']
  isCanvasMode: boolean
  basePath?: string
}) {
  const {
    links,
    linksTextColor,
    linksGap = 4,
    activeLinkColor,
    activeLinkBackgroundColor,
    hoverLinkColor,
    hoverLinkBackgroundColor,
    appearance,
  } = settings

  /** Resolved link color — configured links color, or sidebar text color */
  const linkColor = linksTextColor || appearance.textColor || 'inherit'

  /** Track hovered link for hover effects (only active in preview mode) */
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)

  /** Track current page slug for dynamic active state */
  const currentSlug = useCurrentSlug()

  return (
    <nav
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: linksGap,
        padding: '0 12px',
        // Canvas: non-interactive. Preview: interactive.
        pointerEvents: isCanvasMode ? 'none' : 'auto',
        userSelect: isCanvasMode ? 'none' : undefined,
      }}
    >
      {links.map((link, index) => {
        // ================================================================
        // SEPARATOR ITEM — group title/divider (same in both modes)
        // ================================================================
        if (link.type === 'separator') {
          return (
            <div
              key={link.id}
              style={{
                marginTop: index > 0 ? 12 : 0,
                padding: '8px 10px 4px 10px',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: linkColor,
                opacity: 0.5,
                cursor: 'default',
              }}
            >
              {link.label}
            </div>
          )
        }

        // ================================================================
        // LINK ITEM — navigation link with active/hover state
        // ================================================================
        const isActive = isLinkActive(link, currentSlug)
        const isHovered = hoveredLinkId === link.id && !isActive

        // Determine colors based on state: active > hover > default
        let currentColor = linkColor
        let currentBgColor = 'transparent'
        let currentOpacity = 0.8

        if (isActive) {
          currentColor = activeLinkColor || '#3b82f6'
          currentBgColor = activeLinkBackgroundColor || 'rgba(59, 130, 246, 0.1)'
          currentOpacity = 1
        } else if (isHovered) {
          currentColor = hoverLinkColor || linkColor
          currentBgColor = hoverLinkBackgroundColor || 'rgba(0, 0, 0, 0.05)'
          currentOpacity = 1
        }

        /** Shared link item style between canvas and preview modes */
        const linkItemStyle: React.CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 10px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          color: currentColor,
          backgroundColor: currentBgColor,
          opacity: currentOpacity,
          transition: 'background-color 150ms ease, color 150ms ease, opacity 150ms ease',
          cursor: isCanvasMode ? 'default' : 'pointer',
        }

        /** Shared link content: icon + label */
        const linkContent = (
          <>
            <IconRenderer
              name={link.icon || 'home'}
              size={18}
              style={{ flexShrink: 0 }}
            />
            <span>{link.label}</span>
          </>
        )

        /**
         * Canvas mode: render as plain div (non-interactive).
         * No hover handlers since pointerEvents: none is set on parent.
         */
        if (isCanvasMode) {
          return (
            <div key={link.id} style={linkItemStyle}>
              {linkContent}
            </div>
          )
        }

        /**
         * Preview mode: render as Next.js Link for client-side navigation.
         * Hover handlers enable dynamic hover color feedback.
         */
        return (
          <Link
            key={link.id}
            href={resolveNavigationHref(link.href, basePath)}
            target={link.openInNewTab ? '_blank' : undefined}
            rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
            onMouseEnter={() => setHoveredLinkId(link.id)}
            onMouseLeave={() => setHoveredLinkId(null)}
            style={{ ...linkItemStyle, textDecoration: 'none' }}
          >
            {linkContent}
          </Link>
        )
      })}
    </nav>
  )
}

// ============================================================================
// SHARED SUBCOMPONENT: Sidebar Footer
// ============================================================================

/**
 * Sidebar Footer — optional footer at the bottom of the sidebar panel.
 * Renders identically in both canvas and preview modes.
 * Returns null if no footer text is configured.
 */
function SidebarFooter({
  settings,
}: {
  settings: PreBuiltSidebarElement['settings']
}) {
  const { footer, appearance } = settings

  if (!footer?.text) return null

  return (
    <div
      style={{
        marginTop: 'auto',
        padding: 16,
        borderTop: `1px solid ${appearance.borderColor || '#e5e5e5'}`,
        fontSize: 12,
        color: footer.textColor || appearance.textColor || 'inherit',
        opacity: 0.6,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {footer.text}
    </div>
  )
}

// ============================================================================
// PREVIEW-ONLY SUBCOMPONENT: Mobile Drawer Trigger + Drawer
// ============================================================================

/**
 * Mobile trigger button and slide-in drawer for sidebar navigation.
 *
 * ONLY rendered in preview mode — canvas mode always shows the desktop layout.
 *
 * Uses @container queries (injected by parent) to show/hide based on container width.
 * When container width < mobileBreakpoint, the trigger appears and the sidebar
 * panel hides (via display: none from @container query).
 *
 * In explicit mobile breakpoint view (breakpoint='mobile'), always shown.
 *
 * The drawer is a fixed-position panel that slides in from the left when opened.
 * It replicates the full sidebar navigation (logo, links, footer) for mobile.
 *
 * CSS SPEC NOTE: position:fixed elements inside transformed containers
 * position relative to that transformed ancestor, not the viewport.
 * This means the drawer stays within the preview frame bounds.
 */
function SidebarMobileDrawer({
  settings,
  isMobileView,
  basePath,
}: {
  settings: PreBuiltSidebarElement['settings']
  isMobileView: boolean
  basePath?: string
}) {
  const {
    appearance,
    links,
    linksTextColor,
    activeLinkColor,
    activeLinkBackgroundColor,
    hoverLinkColor,
    hoverLinkBackgroundColor,
    logo,
    footer,
  } = settings

  const linkColor = linksTextColor || appearance.textColor || '#1a1a1a'
  const drawerWidth = Math.min(280, appearance.width || 256)

  /** Drawer open/close state */
  const [isOpen, setIsOpen] = useState(false)

  /** Hover tracking for drawer nav links */
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)

  /** Active slug tracking for drawer nav links */
  const currentSlug = useCurrentSlug()

  return (
    <>
      {/* ================================================================
          MOBILE TRIGGER BUTTON
          Absolutely positioned to overlay the inset content area.
          Controlled by @container query CSS and explicit isMobileView.
          ================================================================ */}
      <div
        data-sidebar-mobile-trigger
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          // Explicit mobile view: always shown. Otherwise @container query controls visibility.
          display: isMobileView ? 'block' : 'none',
          zIndex: 50,
        }}
      >
        <button
          onClick={() => setIsOpen(true)}
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: appearance.backgroundColor || '#ffffff',
            border: `1px solid ${appearance.borderColor || '#e5e5e5'}`,
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          {/* Hamburger icon SVG */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke={appearance.textColor || '#1a1a1a'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* ================================================================
          BACKDROP OVERLAY — darkened background behind the open drawer.
          Clicking anywhere on the backdrop closes the drawer.
          ================================================================ */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 998,
          }}
        />
      )}

      {/* ================================================================
          DRAWER PANEL — slides in from the left.
          Contains full sidebar navigation: logo, links, footer.
          Uses the SAME colors as the main sidebar for visual consistency.
          ================================================================ */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: drawerWidth,
          backgroundColor: appearance.backgroundColor || '#ffffff',
          color: appearance.textColor || '#1a1a1a',
          borderRight: `1px solid ${appearance.borderColor || '#e5e5e5'}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 999,
          overflow: 'auto',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.2s ease-out',
        }}
      >
        {/* Close button (top-right of drawer) */}
        <button
          onClick={() => setIsOpen(false)}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 6,
          }}
        >
          {/* X close icon SVG */}
          <svg
            width="20"
            height="20"
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

        {/* Drawer Logo Section */}
        <a
          href={resolveNavigationHref(logo.href, basePath)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '16px 16px 24px 16px',
            textDecoration: 'none',
            color: logo.textColor || appearance.textColor || 'inherit',
            borderBottom: `1px solid ${appearance.borderColor || '#e5e5e5'}`,
            marginBottom: 16,
          }}
        >
          {/* Mobile drawer logo image — uses same logoSize as desktop for consistency */}
          {(logo.type === 'image' || logo.type === 'both') && logo.imageUrl && (
            <NextImage
              src={logo.imageUrl}
              alt={logo.text || 'Logo'}
              width={0}
              height={logo.logoSize ?? 28}
              sizes="200px"
              style={{ height: logo.logoSize ?? 28, width: 'auto' }}
            />
          )}
          {(logo.type === 'text' || logo.type === 'both') && logo.text && (
            <span style={{ fontSize: 18, fontWeight: 600 }}>
              {logo.text}
            </span>
          )}
        </a>

        {/* Drawer Navigation Links with active/hover state */}
        <nav
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '0 12px',
            flex: 1,
          }}
        >
          {links.map((link, index) => {
            // Separator items
            if (link.type === 'separator') {
              return (
                <div
                  key={link.id}
                  style={{
                    marginTop: index > 0 ? 12 : 0,
                    padding: '8px 10px 4px 10px',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: linkColor,
                    opacity: 0.5,
                    cursor: 'default',
                  }}
                >
                  {link.label}
                </div>
              )
            }

            // Link items with active/hover state
            const isActive = isLinkActive(link, currentSlug)
            const isHovered = hoveredLinkId === link.id && !isActive

            let currentColor = linkColor
            let currentBgColor = 'transparent'

            if (isActive) {
              currentColor = activeLinkColor || '#3b82f6'
              currentBgColor = activeLinkBackgroundColor || 'rgba(59, 130, 246, 0.1)'
            } else if (isHovered) {
              currentColor = hoverLinkColor || linkColor
              currentBgColor = hoverLinkBackgroundColor || 'rgba(0, 0, 0, 0.05)'
            }

            return (
              <a
                key={link.id}
                href={resolveNavigationHref(link.href, basePath)}
                target={link.openInNewTab ? '_blank' : undefined}
                rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
                onMouseEnter={() => setHoveredLinkId(link.id)}
                onMouseLeave={() => setHoveredLinkId(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: 'none',
                  color: currentColor,
                  backgroundColor: currentBgColor,
                  transition: 'background-color 150ms ease, color 150ms ease',
                  cursor: 'pointer',
                }}
              >
                <IconRenderer
                  name={link.icon || 'home'}
                  size={18}
                  style={{ flexShrink: 0 }}
                />
                <span>{link.label}</span>
              </a>
            )
          })}
        </nav>

        {/* Drawer Footer */}
        {footer?.text && (
          <div
            style={{
              marginTop: 'auto',
              padding: 16,
              borderTop: `1px solid ${appearance.borderColor || '#e5e5e5'}`,
              fontSize: 12,
              color: footer.textColor || appearance.textColor || 'inherit',
              opacity: 0.6,
            }}
          >
            {footer.text}
          </div>
        )}
      </div>
    </>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Unified PreBuilt Sidebar — renders in both canvas and preview modes.
 *
 * CANVAS MODE:
 * Returns content only — the two-part layout (sidebar panel + inset area).
 * ElementWrapper handles all editor chrome (selection ring, hover, resize).
 * Sidebar panel children are non-interactive (pointerEvents: none).
 * Inset area receives children that can be interacted with.
 *
 * PREVIEW MODE:
 * Self-contained wrapper with full positioning and responsive behavior.
 * Root: absolute positioned at element.x/y.
 * Inside parent (published): fixed position filling viewport.
 * Mobile breakpoint frame: relative position with auto height.
 * Container queries hide sidebar panel and show mobile trigger on narrow widths.
 * Links are interactive with Next.js client-side navigation.
 */
export const UnifiedPreBuiltSidebar = memo(function UnifiedPreBuiltSidebar({
  element,
  isRoot: isRootProp,
  children,
}: UnifiedPreBuiltSidebarProps) {
  const { mode, breakpoint, basePath } = useRenderMode()
  const isCanvasMode = mode === 'canvas'

  const { settings, styles } = element
  const { appearance, mobile } = settings

  /** Sidebar panel width from settings (default 256px) */
  const sidebarWidth = appearance.width || 256

  /** Whether this is a root element (no parent) */
  const isRoot = isRootProp ?? element.parentId === null

  // ========================================================================
  // CANVAS MODE — Return content only, ElementWrapper handles chrome
  // ========================================================================

  if (isCanvasMode) {
    return <SidebarCanvasContent element={element} sidebarWidth={sidebarWidth}>{children}</SidebarCanvasContent>
  }

  // ========================================================================
  // PREVIEW MODE — Self-contained wrapper with positioning
  // ========================================================================

  /**
   * Check if we're in explicit mobile view (breakpoint='mobile').
   * When true, force mobile layout directly without relying on container queries.
   */
  const isMobileView = breakpoint === 'mobile'

  /**
   * Mobile breakpoint threshold — when container width is below this,
   * the sidebar panel hides and mobile trigger appears.
   */
  const mobileBreakpoint = mobile?.breakpoint || 768

  /** Whether this element is inside a parent (not root) */
  const isInsideParent = !isRoot

  /**
   * Generate unique class name for this sidebar instance.
   * Used for scoped @container CSS rules so multiple sidebars don't conflict.
   */
  const sidebarClassName = `sidebar-${element.id.replace(/[^a-zA-Z0-9]/g, '')}`

  /**
   * Special case: sidebar inside a parent frame AND in mobile breakpoint view.
   * Uses relative positioning (not fixed) so the sidebar stays within the
   * breakpoint preview frame. Height is 'auto' to grow with content.
   */
  const isInMobileBreakpointFrame = isInsideParent && isMobileView

  /**
   * WRAPPER POSITIONING LOGIC:
   * - isRoot (canvas root): position absolute at element.x/y
   * - Mobile breakpoint frame: position relative (stays inside frame)
   * - Published/preview: position fixed (fills viewport)
   */
  const wrapperStyle: React.CSSProperties = {
    position: isRoot ? 'absolute' : (isInMobileBreakpointFrame ? 'relative' : 'fixed'),
    left: isRoot ? element.x : (isInMobileBreakpointFrame ? undefined : 0),
    top: isRoot ? element.y : (isInMobileBreakpointFrame ? undefined : 0),
    right: (!isRoot && !isInMobileBreakpointFrame) ? 0 : undefined,
    bottom: (!isRoot && !isInMobileBreakpointFrame) ? 0 : undefined,
    width: isRoot ? element.width : '100%',
    height: isRoot ? element.height : (isInMobileBreakpointFrame ? 'auto' : undefined),
    minHeight: isInMobileBreakpointFrame ? 200 : undefined,
    /**
     * In mobile breakpoint frames, the sidebar is a flow child (position: relative)
     * inside the page's flex column layout. flex: 1 ensures it stretches to fill
     * the full page height instead of collapsing to content height (hamburger + inset).
     * Without this, the page background shows as white space below the sidebar.
     */
    ...(isInMobileBreakpointFrame ? { flex: 1 } : {}),
    display: element.visible ? 'flex' : 'none',
    flexDirection: 'row',
    alignItems: 'stretch',
    // Container query context — enables @container CSS rules for responsive behavior
    containerType: 'inline-size' as React.CSSProperties['containerType'],
    zIndex: element.order,
    ...styles,
  }

  /**
   * Sidebar panel styles (left side).
   * Full height, fixed width, hidden when explicitly in mobile view.
   * @container query also hides it when container width < mobileBreakpoint.
   */
  const sidebarPanelStyle: React.CSSProperties = {
    width: sidebarWidth,
    minWidth: sidebarWidth,
    height: '100%',
    display: isMobileView ? 'none' : 'flex',
    flexDirection: 'column',
    backgroundColor: appearance.backgroundColor || '#ffffff',
    color: appearance.textColor || '#1a1a1a',
    borderRight: `1px solid ${appearance.borderColor || '#e5e5e5'}`,
    overflow: 'hidden',
    flexShrink: 0,
  }

  /**
   * Inset area styles (right side).
   * Flex container so child frame can stretch to fill height.
   * Height is 'auto' in mobile breakpoint frame to grow with content.
   *
   * Background color from settings.inset fills the entire inset area
   * so there's no white gap at the bottom when child content is shorter
   * than the viewport. SOURCE OF TRUTH: SidebarInsetBackground
   */
  const insetStyle: React.CSSProperties = {
    flex: 1,
    height: isInMobileBreakpointFrame ? 'auto' : '100%',
    minHeight: isInMobileBreakpointFrame ? 200 : undefined,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    position: 'relative',
    backgroundColor: settings.inset?.backgroundColor || undefined,
  }

  return (
    <div
      className={sidebarClassName}
      data-prebuilt-sidebar-renderer
      data-element-id={element.id}
      style={wrapperStyle}
    >
      {/* ================================================================
          CONTAINER QUERY CSS — Responsive sidebar show/hide
          Uses @container queries so sidebar responds to its OWN width,
          not the browser viewport. Essential when inside preview frames
          or breakpoint containers with different widths.
          ================================================================ */}
      <style>{`
        @container (max-width: ${mobileBreakpoint - 1}px) {
          .${sidebarClassName} [data-sidebar-panel] {
            display: none !important;
          }
          .${sidebarClassName} [data-sidebar-mobile-trigger] {
            display: flex !important;
          }
        }
        @container (min-width: ${mobileBreakpoint}px) {
          .${sidebarClassName} [data-sidebar-mobile-trigger] {
            display: none !important;
          }
        }
      `}</style>

      {/* Mobile trigger + drawer (preview mode only) */}
      <SidebarMobileDrawer
        settings={settings}
        isMobileView={isMobileView}
        basePath={basePath}
      />

      {/* ================================================================
          SIDEBAR PANEL (LEFT) — Navigation
          Hidden via @container query when container is narrow.
          In explicit mobile view, hidden directly via style.
          ================================================================ */}
      <div
        data-sidebar-panel
        style={sidebarPanelStyle}
      >
        <SidebarLogo settings={settings} isCanvasMode={false} basePath={basePath} />
        <SidebarNavLinks settings={settings} isCanvasMode={false} basePath={basePath} />
        <SidebarFooter settings={settings} />
      </div>

      {/* ================================================================
          SIDEBAR INSET (RIGHT) — Content Area
          Children are rendered inside the inset by the parent
          (page-renderer.tsx passes them as React children).
          ================================================================ */}
      <div
        data-sidebar-inset
        style={insetStyle}
      >
        {children}
      </div>
    </div>
  )
})

// ============================================================================
// CANVAS-ONLY SUBCOMPONENT: Content layout for canvas mode
// ============================================================================

/**
 * Canvas-mode content layout for the sidebar.
 *
 * Returns ONLY the two-part layout (sidebar panel + inset area) without
 * any wrapper positioning or editor chrome. ElementWrapper handles:
 * - Selection ring / hover ring
 * - Resize handles
 * - Element label
 * - Dimension pill
 * - Pointer events for drag/selection
 *
 * The sidebar panel has pointerEvents: none on children so they can't be
 * independently selected. The inset area has pointerEvents: auto so the
 * child frame element can receive interactions (selection, drop, etc).
 */
function SidebarCanvasContent({
  element,
  sidebarWidth,
  children,
}: {
  element: PreBuiltSidebarElement
  sidebarWidth: number
  children?: React.ReactNode
}) {
  const { settings } = element
  const { appearance } = settings

  return (
    <div
      data-prebuilt-type="sidebar"
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        /**
         * Use minHeight: inherit so this content div picks up the minHeight
         * set on the ElementWrapper (which matches the parent page height).
         * height: auto lets the sidebar grow when inner content exceeds the
         * page height. align-items defaults to 'stretch' in flex-row, so
         * both the sidebar panel and inset will fill this container's height.
         *
         * SOURCE OF TRUTH: SidebarPageMinHeightSync
         */
        minHeight: 'inherit',
      }}
    >
      {/* ================================================================
          SIDEBAR PANEL (LEFT) — Non-editable navigation
          pointerEvents on the panel itself allows the parent
          ElementWrapper to handle drag/select on the sidebar.
          No explicit height — align-items: stretch (flex default) makes
          this panel match the container's height automatically.
          ================================================================ */}
      <div
        data-sidebar-panel
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: appearance.backgroundColor || '#ffffff',
          color: appearance.textColor || '#1a1a1a',
          borderRight: `1px solid ${appearance.borderColor || '#e5e5e5'}`,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <SidebarLogo settings={settings} isCanvasMode={true} />
        <SidebarNavLinks settings={settings} isCanvasMode={true} />
        <SidebarFooter settings={settings} />
      </div>

      {/* ================================================================
          SIDEBAR INSET (RIGHT) — Container for the editable content frame
          pointerEvents: auto so children (the inset FrameElement) can
          receive their own pointer events for selection/dragging.
          cursor: default prevents the grab cursor from showing over
          the inset area (grab is for the sidebar wrapper, not inset).
          ================================================================ */}
      <div
        data-sidebar-inset
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          position: 'relative',
          pointerEvents: 'auto',
          cursor: 'default',
          /** Inset background fills the entire area so no white gap shows
           *  when child content is shorter than the sidebar height */
          backgroundColor: settings.inset?.backgroundColor || undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ============================================================================
// CANVAS HELPER HOOK — Provides sizing metadata for ElementWrapper
// ============================================================================

/**
 * Hook to compute canvas-specific values for the sidebar's ElementWrapper.
 *
 * SOURCE OF TRUTH: UnifiedPreBuiltSidebarMeta, sidebar-canvas-meta
 *
 * Used by the canvas wrapper (CanvasPreBuiltSidebarElement) to compute
 * values that get passed to ElementWrapper:
 * - sizeStyles: { width, height } for the wrapper element
 * - dimensionLabel: "1440 x 900" etc. for the dimensions pill
 * - wrapperOverrides: visibility, lock styles
 *
 * USAGE:
 * ```tsx
 * const sidebarMeta = useUnifiedPreBuiltSidebarMeta(element)
 *
 * <ElementWrapper
 *   element={element}
 *   sizeStyleOverrides={sidebarMeta.sizeStyles}
 *   dimensionLabel={sidebarMeta.dimensionLabel}
 *   wrapperStyleOverrides={sidebarMeta.wrapperOverrides}
 * >
 *   <UnifiedPreBuiltSidebar element={element}>{insetChildren}</UnifiedPreBuiltSidebar>
 * </ElementWrapper>
 * ```
 */
export function useUnifiedPreBuiltSidebarMeta(element: PreBuiltSidebarElement) {
  return useMemo(() => {
    /**
     * Sidebar dimensions — same pattern as the page element:
     * height: auto so the sidebar grows with inner content, minHeight
     * ensures it never shrinks below the configured element height.
     * Width fills parent when inside one, otherwise uses pixel value.
     *
     * SOURCE OF TRUTH: SidebarCanvasHeight, SidebarPreviewConsistency
     */
    const isInsideParent = element.parentId !== null

    const sizeStyles: React.CSSProperties = {
      width: isInsideParent ? '100%' : element.width,
      height: 'auto',
      minHeight: element.height,
    }

    /**
     * Build dimension label for the blue pill shown below selected elements.
     * Format: "{width} x {height}"
     */
    const dimensionLabel = `${Math.round(element.width)} \u00D7 ${Math.round(element.height)}`

    /**
     * Wrapper overrides for canvas — visibility only.
     * The sidebar stays in normal flow so its ElementWrapper box (and
     * selection ring) grows with inner content. Absolute positioning
     * would constrain the height to the containing block via inset: 0,
     * preventing the sidebar from growing beyond that.
     */
    const wrapperOverrides: React.CSSProperties = {
      ...(element.visible === false ? { display: 'none' as const } : {}),
    }

    return {
      sizeStyles,
      dimensionLabel,
      wrapperOverrides,
    }
  }, [element])
}
