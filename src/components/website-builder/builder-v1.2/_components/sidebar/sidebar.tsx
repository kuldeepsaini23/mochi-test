/**
 * ============================================================================
 * COLLAPSIBLE SIDEBAR - Horizontal icon bar with panel below
 * ============================================================================
 *
 * A two-part sidebar design that saves canvas space:
 *
 * STRUCTURE:
 * 1. Icon Rail (always visible) - Horizontal bar with tab icons at the top
 * 2. Panel (expandable) - Full content panel that appears BELOW icons on hover/pin
 *
 * BEHAVIOR:
 * - Default: Only icon rail visible (slim horizontal bar)
 * - Hover over icon: Panel expands below to show content
 * - Click icon: Pins the panel open (stays visible)
 * - Click pinned icon again: Unpins (back to hover mode)
 *
 * SINGLE PANEL DESIGN:
 * - Only ONE panel can be visible at a time (no overlapping panels)
 * - When hovering different tabs, the panel content switches instantly
 * - When pinned, the panel stays open until explicitly unpinned
 *
 * ============================================================================
 */

'use client'

import React, { useState, useCallback, useRef } from 'react'
import { ElementSection } from './element-section'
import { ElementGrid } from './element-grid'
import { SidebarItem } from './sidebar-item'
import { PagesPanel } from './pages-panel'
import { LayersPanel } from './layers-panel'
import { LocalComponentsPanel } from './local-components-panel'
import {
  Box,
  Type,
  Plus,
  Layers,
  FileStack,
  Pin,
  PinOff,
  LayoutTemplate,
  ShoppingCart,
  Award,
  Navigation,
  CreditCard,
  PanelBottom,
} from 'lucide-react'
import { getPreBuiltByCategory } from '../../_lib/prebuilt'
import { cn } from '@/lib/utils'
import { useBuilderContext } from '../../_lib/builder-context'

// ============================================================================
// TYPES
// ============================================================================

interface SidebarProps {
  /** Optional callback when an element is clicked to be added */
  onAddElement?: (elementType: string) => void
}

type TabId = 'insert' | 'layers' | 'assets' | 'pages'

interface TabConfig {
  id: TabId
  label: string
  icon: React.ReactNode
}

// ============================================================================
// TAB CONFIGURATION
// ============================================================================

const TABS: TabConfig[] = [
  { id: 'insert', label: 'Insert', icon: <Plus className="h-5 w-5" /> },
  { id: 'layers', label: 'Layers', icon: <Layers className="h-5 w-5" /> },
  { id: 'assets', label: 'Components', icon: <Box className="h-5 w-5" /> },
  { id: 'pages', label: 'Pages', icon: <FileStack className="h-5 w-5" /> },
]

// ============================================================================
// PANEL CONTENT COMPONENT - Renders the content for the active tab
// ============================================================================

/** SOURCE OF TRUTH: SidebarElementItem — Unified element item for all sidebar sections */
interface SidebarElementItem {
  id: string
  label: string
  illustration: string
  elementType: string
  description: string
  /** For prebuilt elements: the prebuilt type (e.g., 'prebuilt-navbar') */
  prebuiltType?: string
  /** For prebuilt elements: the variant (e.g., 'navbar-minimal') */
  variantId?: string
}

interface PanelContentProps {
  activeTab: TabId
  isPinned: boolean
  onPinToggle: () => void
  onAddElement?: (elementType: string) => void
  layoutElements: SidebarElementItem[]
  basicElements: SidebarElementItem[]
  /** Navigation elements — prebuilt navbars, sidebars, etc. */
  navigationElements: SidebarElementItem[]
  /** Social proof elements — logo carousels, total members, etc. */
  socialProofElements: SidebarElementItem[]
  /** E-commerce elements — only shown when enableEcommerce is true */
  ecommerceElements?: SidebarElementItem[]
  /** Payment elements — standalone payment form */
  paymentElements?: SidebarElementItem[]
  /** Footer template elements — composed from frames, not hardcoded prebuilt */
  footerElements: SidebarElementItem[]
  /** Whether e-commerce is enabled for this website */
  enableEcommerce?: boolean
}

function PanelContent({
  activeTab,
  isPinned,
  onPinToggle,
  onAddElement,
  layoutElements,
  basicElements,
  navigationElements,
  socialProofElements,
  ecommerceElements,
  paymentElements,
  footerElements,
  enableEcommerce,
}: PanelContentProps) {
  return (
    <>
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <span className="font-medium text-sm">
          {TABS.find((t) => t.id === activeTab)?.label}
        </span>
        <button
          onClick={onPinToggle}
          className={cn(
            'w-7 h-7 rounded flex items-center justify-center transition-colors',
            isPinned
              ? 'bg-primary/20 text-primary'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
          title={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
        >
          {isPinned ? (
            <PinOff className="h-3.5 w-3.5" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Panel Content - scrollable area (hidden scrollbar for cleaner look) */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-muted/30 scrollbar-hide">
        {/* INSERT TAB */}
        {activeTab === 'insert' && (
          <div className="px-3 py-3">
            {/* Layout Section */}
            <ElementSection
              title="Layout"
              icon={<LayoutTemplate className="h-4 w-4" />}
            >
              <ElementGrid columns={2}>
                {layoutElements.map((item) => (
                  <SidebarItem
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    illustration={item.illustration}
                    elementType={item.elementType}
                    description={item.description}
                    onClick={() => onAddElement?.(item.elementType)}
                  />
                ))}
              </ElementGrid>
            </ElementSection>

            {/* Basic Elements Section */}
            <ElementSection
              title="Basic Elements"
              icon={<Type className="h-4 w-4" />}
            >
              <ElementGrid columns={2}>
                {basicElements.map((item) => (
                  <SidebarItem
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    illustration={item.illustration}
                    elementType={item.elementType}
                    description={item.description}
                    onClick={() => onAddElement?.(item.elementType)}
                  />
                ))}
              </ElementGrid>
            </ElementSection>

            {/* Navigation Section — Prebuilt navbars and sidebars */}
            {navigationElements.length > 0 && (
              <ElementSection
                title="Navigation"
                icon={<Navigation className="h-4 w-4" />}
              >
                <ElementGrid columns={2}>
                  {navigationElements.map((item) => (
                    <SidebarItem
                      key={item.id}
                      id={item.id}
                      label={item.label}
                      illustration={item.illustration}
                      elementType={item.elementType}
                      description={item.description}
                      prebuiltType={item.prebuiltType}
                      variantId={item.variantId}
                      onClick={() => onAddElement?.(item.elementType)}
                    />
                  ))}
                </ElementGrid>
              </ElementSection>
            )}

            {/* Footer Section — Frame-based footer templates (not prebuilt) */}
            {footerElements.length > 0 && (
              <ElementSection
                title="Footer"
                icon={<PanelBottom className="h-4 w-4" />}
              >
                <ElementGrid columns={2}>
                  {footerElements.map((item) => (
                    <SidebarItem
                      key={item.id}
                      id={item.id}
                      label={item.label}
                      illustration={item.illustration}
                      elementType={item.elementType}
                      description={item.description}
                      onClick={() => onAddElement?.(item.elementType)}
                    />
                  ))}
                </ElementGrid>
              </ElementSection>
            )}

            {/* Social Proof Section — Logo carousels, total members, trust badges */}
            <ElementSection
              title="Social Proof"
              icon={<Award className="h-4 w-4" />}
            >
              <ElementGrid columns={2}>
                {socialProofElements.map((item) => (
                  <SidebarItem
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    illustration={item.illustration}
                    elementType={item.elementType}
                    description={item.description}
                    prebuiltType={item.prebuiltType}
                    variantId={item.variantId}
                    onClick={() => onAddElement?.(item.elementType)}
                  />
                ))}
              </ElementGrid>
            </ElementSection>

            {/* E-commerce Section — Cart, Add to Cart, Checkout (conditional) */}
            {enableEcommerce && ecommerceElements && ecommerceElements.length > 0 && (
              <ElementSection
                title="E-commerce"
                icon={<ShoppingCart className="h-4 w-4" />}
              >
                <ElementGrid columns={2}>
                  {ecommerceElements.map((item) => (
                    <SidebarItem
                      key={item.id}
                      id={item.id}
                      label={item.label}
                      illustration={item.illustration}
                      elementType={item.elementType}
                      description={item.description}
                      onClick={() => onAddElement?.(item.elementType)}
                    />
                  ))}
                </ElementGrid>
              </ElementSection>
            )}

            {/* Payment Section — Always visible, not gated behind e-commerce */}
            {paymentElements && paymentElements.length > 0 && (
              <ElementSection
                title="Payment"
                icon={<CreditCard className="h-4 w-4" />}
              >
                <ElementGrid columns={2}>
                  {paymentElements.map((item) => (
                    <SidebarItem
                      key={item.id}
                      id={item.id}
                      label={item.label}
                      illustration={item.illustration}
                      elementType={item.elementType}
                      description={item.description}
                      onClick={() => onAddElement?.(item.elementType)}
                    />
                  ))}
                </ElementGrid>
              </ElementSection>
            )}
          </div>
        )}

        {/* LAYERS TAB */}
        {activeTab === 'layers' && <LayersPanel />}

        {/* COMPONENTS TAB */}
        {activeTab === 'assets' && <LocalComponentsPanel />}

        {/* PAGES TAB */}
        {activeTab === 'pages' && <PagesPanel />}
      </div>
    </>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Sidebar({ onAddElement }: SidebarProps) {
  // Get builder context for e-commerce status
  const { enableEcommerce } = useBuilderContext()

  // The pinned tab (persists when not hovering)
  const [pinnedTab, setPinnedTab] = useState<TabId | null>(null)

  // The currently displayed tab (changes on hover)
  const [displayedTab, setDisplayedTab] = useState<TabId>('insert')

  // Whether the panel is visible (from hover or pin)
  const [isPanelVisible, setIsPanelVisible] = useState(false)

  // Ref to track if we're hovering over the sidebar area (icon bar or panel)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Ref for close timeout (to add small delay when leaving)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ========================================
  // LAYOUT ELEMENTS
  // ========================================
  const layoutElements: SidebarElementItem[] = [
    {
      id: 'sidebar-frame-basic',
      label: 'Frame',
      illustration: 'frame',
      elementType: 'frame',
      description: 'Basic container frame',
    },
    {
      id: 'sidebar-frame-circle',
      label: 'Circle Frame',
      illustration: 'circle-frame',
      elementType: 'circle-frame',
      description: 'Rounded frame container',
    },
  ]

  // ========================================
  // BASIC ELEMENTS
  // ========================================
  const basicElements: SidebarElementItem[] = [
    {
      id: 'sidebar-element-text',
      label: 'Text',
      illustration: 'text',
      elementType: 'text',
      description: 'Add text with Google Fonts',
    },
    {
      id: 'sidebar-element-rich-text',
      label: 'Rich Text',
      illustration: 'rich-text',
      elementType: 'rich-text',
      description: 'Rich text with formatting, lists, and more',
    },
    {
      id: 'sidebar-element-image',
      label: 'Image',
      illustration: 'image',
      elementType: 'image',
      description: 'Image element (coming soon)',
    },
    {
      id: 'sidebar-element-video',
      label: 'Video',
      illustration: 'video',
      elementType: 'video',
      description: 'Video or Loom embed',
    },
    {
      id: 'sidebar-element-button',
      label: 'Button',
      illustration: 'button',
      elementType: 'button',
      description: 'Button element (coming soon)',
    },
    {
      id: 'sidebar-element-form',
      label: 'Form',
      illustration: 'form',
      elementType: 'form',
      description: 'Embed a form from Form Builder',
    },
    {
      id: 'sidebar-element-icon',
      label: 'Icon',
      illustration: 'icon',
      elementType: 'icon',
      description: 'Icon element (coming soon)',
    },
    {
      id: 'sidebar-element-smartcms-list',
      label: 'CMS List',
      illustration: 'smartcms-list',
      elementType: 'smartcms-list',
      description: 'Dynamic list from CMS data',
    },
    {
      id: 'sidebar-element-ecommerce-carousel',
      label: 'Product Gallery',
      illustration: 'ecommerce-carousel',
      elementType: 'ecommerce-carousel',
      description: 'Product image carousel',
    },
    {
      id: 'sidebar-element-faq',
      label: 'FAQ',
      illustration: 'faq',
      elementType: 'faq',
      description: 'Collapsible Q&A accordion',
    },
    {
      id: 'sidebar-element-list',
      label: 'List',
      illustration: 'list',
      elementType: 'list',
      description: 'Bulleted list with custom icons',
    },
    {
      id: 'sidebar-element-sticky-note',
      label: 'Sticky Note',
      illustration: 'sticky-note',
      elementType: 'sticky-note',
      description: 'Editable post-it note',
    },
    {
      id: 'sidebar-element-timer',
      label: 'Timer',
      illustration: 'timer',
      elementType: 'timer',
      description: 'Countdown timer with expiry actions',
    },
  ]

  // ========================================
  // NAVIGATION ELEMENTS — Built from prebuilt registry (navbar, sidebar)
  // ========================================
  const navigationElements: SidebarElementItem[] = getPreBuiltByCategory('navigation').flatMap(
    (def) =>
      def.variants.map((variant) => ({
        id: `prebuilt-${def.type}-${variant.id}`,
        label: variant.label,
        illustration: def.type.replace('prebuilt-', ''), // 'navbar' or 'sidebar'
        elementType: 'prebuilt',
        description: def.label,
        prebuiltType: def.type,
        variantId: variant.id,
      }))
  )

  // ========================================
  // SOCIAL PROOF ELEMENTS — Basic + prebuilt (logo carousel, total members)
  // ========================================
  const socialProofPreBuiltItems: SidebarElementItem[] = getPreBuiltByCategory(
    'social-proof'
  ).flatMap((def) =>
    def.variants.map((variant) => ({
      id: `prebuilt-${def.type}-${variant.id}`,
      label: variant.label,
      illustration: def.type.replace('prebuilt-', ''), // 'total-members'
      elementType: 'prebuilt',
      description: def.label,
      prebuiltType: def.type,
      variantId: variant.id,
    }))
  )

  /** Logo carousel is now a prebuilt element — auto-registered via registry's social-proof category */
  const socialProofElements: SidebarElementItem[] = [...socialProofPreBuiltItems]

  // ========================================
  // E-COMMERCE ELEMENTS (only shown when enableEcommerce is true)
  // ========================================
  const ecommerceElements: SidebarElementItem[] = [
    {
      id: 'sidebar-element-cart',
      label: 'Cart',
      illustration: 'cart',
      elementType: 'cart',
      description: 'Opens shopping cart sheet',
    },
    {
      id: 'sidebar-element-add-to-cart',
      label: 'Add to Cart',
      illustration: 'add-to-cart',
      elementType: 'add-to-cart-button',
      description: 'Add products to shopping cart',
    },
    {
      id: 'sidebar-element-checkout',
      label: 'Checkout',
      illustration: 'checkout',
      elementType: 'checkout',
      description: 'Cart display and payment',
    },
  ]

  // ========================================
  // PAYMENT ELEMENTS — Standalone payment form (separate from e-commerce)
  // ========================================
  const paymentElements: SidebarElementItem[] = [
    {
      id: 'sidebar-element-payment',
      label: 'Payment Form',
      illustration: 'payment',
      elementType: 'payment',
      description: 'Single product payment form',
    },
    {
      id: 'sidebar-element-receipt',
      label: 'Receipt',
      illustration: 'receipt',
      elementType: 'receipt',
      description: 'Payment confirmation receipt',
    },
  ]

  // ========================================
  // FOOTER ELEMENTS — Frame-based templates (not prebuilt)
  // These create a tree of frames + text when dropped on canvas
  // ========================================
  const footerElements: SidebarElementItem[] = [
    {
      id: 'sidebar-footer-simple-dark',
      label: 'Simple Dark',
      illustration: 'footer-simple-dark',
      elementType: 'frame',
      description: 'Dark centered copyright',
    },
    {
      id: 'sidebar-footer-simple-light',
      label: 'Simple Light',
      illustration: 'footer-simple-light',
      elementType: 'frame',
      description: 'Light centered copyright',
    },
    {
      id: 'sidebar-footer-columns-dark',
      label: 'Columns Dark',
      illustration: 'footer-columns-dark',
      elementType: 'frame',
      description: 'Dark multi-column footer',
    },
    {
      id: 'sidebar-footer-columns-light',
      label: 'Columns Light',
      illustration: 'footer-columns-light',
      elementType: 'frame',
      description: 'Light multi-column footer',
    },
  ]

  // ========================================
  // HANDLERS
  // ========================================

  /**
   * Handle clicking a tab icon - toggles pin state for that tab.
   */
  const handleTabClick = useCallback(
    (tabId: TabId) => {
      if (tabId === pinnedTab) {
        // Clicking the pinned tab unpins it
        setPinnedTab(null)
        setIsPanelVisible(false)
      } else {
        // Pin this tab
        setPinnedTab(tabId)
        setDisplayedTab(tabId)
        setIsPanelVisible(true)
      }
    },
    [pinnedTab]
  )

  /**
   * Handle hovering over a tab - show panel with that tab's content.
   * Always shows the hovered tab's content (even if another tab is pinned).
   */
  const handleTabHover = useCallback(
    (tabId: TabId) => {
      // Clear any pending close timeout
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }

      // Show panel and display this tab's content
      setIsPanelVisible(true)
      setDisplayedTab(tabId)
    },
    []
  )

  /**
   * Handle mouse leaving the icon bar.
   * If pinned, revert to pinned tab. If not pinned, hide panel.
   * Uses a small delay to allow moving to the panel without closing.
   */
  const handleIconBarMouseLeave = useCallback(() => {
    // Add small delay before closing/reverting to allow moving to panel
    closeTimeoutRef.current = setTimeout(() => {
      if (pinnedTab) {
        // Revert to pinned tab content
        setDisplayedTab(pinnedTab)
      } else {
        // No pinned tab, hide panel
        setIsPanelVisible(false)
      }
    }, 150)
  }, [pinnedTab])

  /**
   * Handle mouse entering the icon bar.
   * Cancel any pending close timeout.
   */
  const handleIconBarMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  /**
   * Handle mouse entering the panel content.
   * Cancel any pending close timeout so panel stays open while interacting.
   */
  const handlePanelMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  /**
   * Handle mouse leaving the panel content.
   * If pinned, keep panel visible. If not pinned, hide panel.
   */
  const handlePanelMouseLeave = useCallback(() => {
    // If pinned, panel stays open - just revert to pinned tab content
    if (pinnedTab) {
      setDisplayedTab(pinnedTab)
    } else {
      // Not pinned, hide panel when leaving
      setIsPanelVisible(false)
    }
  }, [pinnedTab])

  /**
   * Toggle pin state for the currently displayed tab.
   */
  const handlePinToggle = useCallback(() => {
    if (pinnedTab) {
      // Unpin
      setPinnedTab(null)
      setIsPanelVisible(false)
    } else {
      // Pin the currently displayed tab
      setPinnedTab(displayedTab)
    }
  }, [pinnedTab, displayedTab])

  // ========================================
  // RENDER
  // ========================================

  return (
    <div
      ref={sidebarRef}
      className="absolute left-10 top-20 z-[9999] flex flex-col items-start gap-2"
    >
      {/* ================================================================
          ICON RAIL - Horizontal bar at top with tab icons
          Hovering shows the panel, clicking pins it
          Mouse events are on this element to detect when user leaves icons
          ================================================================ */}
      <div
        onMouseEnter={handleIconBarMouseEnter}
        onMouseLeave={handleIconBarMouseLeave}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          padding: '8px 10px',
          backgroundColor: 'var(--background)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)',
        }}
      >
        {TABS.map((tab) => {
          const isDisplayed = displayedTab === tab.id && isPanelVisible
          const isPinned = pinnedTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              onMouseEnter={() => handleTabHover(tab.id)}
              title={isPinned ? `${tab.label} (pinned - click to unpin)` : tab.label}
              style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDisplayed ? 'var(--accent)' : 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                color: isDisplayed ? 'var(--foreground)' : 'var(--muted-foreground)',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseOver={(e) => {
                if (!isDisplayed) {
                  e.currentTarget.style.backgroundColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--foreground)'
                }
              }}
              onMouseOut={(e) => {
                if (!isDisplayed) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--muted-foreground)'
                }
              }}
            >
              {tab.icon}
              {/* Small pin dot indicator when this tab is pinned */}
              {isPinned && (
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ================================================================
          CONTENT PANEL - Single panel that shows active tab content
          Only visible when hovering or pinned
          Has its own mouse handlers to keep panel open while interacting
          ================================================================ */}
      {isPanelVisible && (
        <div
          className="w-72 max-h-[calc(100vh-200px)] p-0 bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-xl flex flex-col"
          onMouseEnter={handlePanelMouseEnter}
          onMouseLeave={handlePanelMouseLeave}
        >
          <PanelContent
            activeTab={displayedTab}
            isPinned={pinnedTab !== null}
            onPinToggle={handlePinToggle}
            onAddElement={onAddElement}
            layoutElements={layoutElements}
            basicElements={basicElements}
            navigationElements={navigationElements}
            socialProofElements={socialProofElements}
            ecommerceElements={ecommerceElements}
            paymentElements={paymentElements}
            footerElements={footerElements}
            enableEcommerce={enableEcommerce}
          />
        </div>
      )}
    </div>
  )
}
