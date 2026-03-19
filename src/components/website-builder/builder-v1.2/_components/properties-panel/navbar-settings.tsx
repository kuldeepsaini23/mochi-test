/**
 * ============================================================================
 * NAVBAR SETTINGS PANEL
 * ============================================================================
 *
 * Settings panel for configuring PreBuilt navbar elements.
 * This is the ONLY way users can modify navbar content - direct manipulation
 * of children is not allowed.
 *
 * ============================================================================
 * SECTIONS
 * ============================================================================
 *
 * 1. LOGO - Type, logo image (storage/URL), logo size slider, text, link
 * 2. NAVIGATION LINKS - Add, remove, reorder, link to pages, text color
 * 3. CTA BUTTON - Label, URL, variant, background color, text color
 * 4. STICKY - Enable/disable, shadow on scroll
 * 5. MOBILE MENU - Drawer side, colors (background, text, hamburger icon)
 *
 * ============================================================================
 * PAGE LINKING
 * ============================================================================
 *
 * Links can be connected to internal pages from the website.
 * When a navbar is dropped, it auto-populates with existing page links.
 * Users can switch between page links and custom URLs.
 *
 * ============================================================================
 */

'use client'

import { useCallback } from 'react'
import { Plus, Trash2, GripVertical, ExternalLink, Link2, FileText, AlignLeft, AlignCenter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '../../_lib/store'
import { selectPageInfos } from '../../_lib/canvas-slice'
import type { PreBuiltNavbarElement, NavbarLink, NavbarSettings } from '../../_lib/prebuilt'
import { generateLinkId } from '../../_lib/prebuilt'
import {
  PropertySection,
  InputGroupControl,
  ToggleControl,
  DropdownControl,
  ColorPickerControl,
  SliderInputControl,
  ImageSourceControl,
} from './controls'

// ============================================================================
// TYPES
// ============================================================================

interface NavbarSettingsPanelProps {
  /** The navbar element data */
  element: PreBuiltNavbarElement

  /** Callback to update settings */
  onSettingsChange: (settings: NavbarSettings) => void
}

// ============================================================================
// LINK ITEM COMPONENT
// ============================================================================

interface LinkItemProps {
  link: NavbarLink
  index: number
  onUpdate: (index: number, updates: Partial<NavbarLink>) => void
  onRemove: (index: number) => void
  /** Available pages for page linking dropdown */
  availablePages: Array<{ id: string; name: string; slug: string }>
}

/**
 * Single link item in the navigation links list.
 * Uses a compact, well-structured layout that fits within the panel bounds.
 *
 * Supports two modes:
 * 1. Page Link - connects to an internal page (shows dropdown)
 * 2. Custom URL - user enters any URL directly
 */
function LinkItem({ link, index, onUpdate, onRemove, availablePages }: LinkItemProps) {
  /**
   * Whether this link is connected to an internal page.
   * When true, show page selector. When false, show URL input.
   */
  const isPageLink = !!link.pageId

  /**
   * Handle switching between page link and custom URL modes.
   */
  const handleModeToggle = () => {
    if (isPageLink) {
      // Switch to custom URL mode - clear pageId, keep current href
      onUpdate(index, { pageId: undefined })
    } else {
      // Switch to page link mode - select first page if available
      if (availablePages.length > 0) {
        const firstPage = availablePages[0]
        onUpdate(index, {
          pageId: firstPage.id,
          href: firstPage.slug,
          label: firstPage.name,
        })
      }
    }
  }

  /**
   * Handle page selection from dropdown.
   */
  const handlePageChange = (pageId: string) => {
    const page = availablePages.find((p) => p.id === pageId)
    if (page) {
      onUpdate(index, {
        pageId: page.id,
        href: page.slug,
        label: page.name,
      })
    }
  }

  return (
    <div className="group rounded-lg border border-border bg-card overflow-hidden">
      {/* Header row - drag handle, label, remove button */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
        {/* Drag handle */}
        <div className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition-colors">
          <GripVertical className="h-3.5 w-3.5" />
        </div>

        {/* Label input - takes remaining space */}
        <input
          type="text"
          value={link.label}
          onChange={(e) => onUpdate(index, { label: e.target.value })}
          placeholder="Link Label"
          className="flex-1 min-w-0 px-2 py-1 text-xs font-medium bg-transparent border-0 focus:outline-none focus:ring-0"
        />

        {/* Remove button */}
        <button
          onClick={() => onRemove(index)}
          className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors rounded"
          title="Remove link"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Content row - link type toggle and URL/page selector */}
      <div className="px-2 py-2 space-y-2">
        {/* Link mode toggle and input in a single row */}
        <div className="flex items-center gap-1.5">
          {/* Mode toggle button */}
          <button
            type="button"
            onClick={handleModeToggle}
            className={cn(
              'shrink-0 p-1.5 rounded transition-colors',
              isPageLink
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            title={isPageLink ? 'Linked to page (click for custom URL)' : 'Custom URL (click for page link)'}
          >
            {isPageLink ? (
              <FileText className="h-3 w-3" />
            ) : (
              <Link2 className="h-3 w-3" />
            )}
          </button>

          {/* Page selector or URL input - fills remaining space */}
          {isPageLink ? (
            <select
              value={link.pageId || ''}
              onChange={(e) => handlePageChange(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary truncate"
            >
              {availablePages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={link.href}
              onChange={(e) => onUpdate(index, { href: e.target.value })}
              placeholder="/url or https://..."
              className="flex-1 min-w-0 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          )}

          {/* New tab indicator */}
          {link.openInNewTab && (
            <div className="shrink-0 p-1 text-muted-foreground/60" title="Opens in new tab">
              <ExternalLink className="h-3 w-3" />
            </div>
          )}
        </div>

        {/* Open in new tab toggle - compact */}
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={link.openInNewTab || false}
            onChange={(e) => onUpdate(index, { openInNewTab: e.target.checked })}
            className="h-3 w-3 rounded border-border"
          />
          Open in new tab
        </label>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Complete settings panel for PreBuilt navbar elements.
 */
export function NavbarSettingsPanel({
  element,
  onSettingsChange,
}: NavbarSettingsPanelProps) {
  const { settings } = element

  // =========================================================================
  // GET AVAILABLE PAGES FROM REDUX
  // =========================================================================

  /**
   * Get all pages from the store.
   * These are used for the page link dropdown in each LinkItem.
   * Users can link navbar items to internal pages.
   */
  const pageInfos = useAppSelector(selectPageInfos)

  /**
   * Transform page infos to the format expected by LinkItem.
   * Each page has: id, name, slug (URL path).
   */
  const availablePages = pageInfos.map((page) => ({
    id: page.id,
    name: page.name,
    slug: page.slug,
  }))

  // =========================================================================
  // SETTINGS UPDATE HELPERS
  // =========================================================================

  /**
   * Update a nested settings value.
   */
  const updateSettings = useCallback(
    <K extends keyof NavbarSettings>(
      key: K,
      value: NavbarSettings[K]
    ) => {
      onSettingsChange({
        ...settings,
        [key]: value,
      })
    },
    [settings, onSettingsChange]
  )

  /**
   * Update logo settings.
   */
  const updateLogo = useCallback(
    (updates: Partial<NavbarSettings['logo']>) => {
      updateSettings('logo', {
        ...settings.logo,
        ...updates,
      })
    },
    [settings.logo, updateSettings]
  )

  /**
   * Update sticky settings.
   */
  const updateSticky = useCallback(
    (updates: Partial<NavbarSettings['sticky']>) => {
      updateSettings('sticky', {
        ...settings.sticky,
        ...updates,
      })
    },
    [settings.sticky, updateSettings]
  )

  /**
   * Update mobile menu settings.
   */
  const updateMobileMenu = useCallback(
    (updates: Partial<NavbarSettings['mobileMenu']>) => {
      updateSettings('mobileMenu', {
        ...settings.mobileMenu,
        ...updates,
      })
    },
    [settings.mobileMenu, updateSettings]
  )

  /**
   * Update CTA button settings.
   */
  const updateCta = useCallback(
    (updates: Partial<NonNullable<NavbarSettings['ctaButton']>> | null) => {
      if (updates === null) {
        // Remove CTA button
        const { ctaButton: _, ...rest } = settings
        onSettingsChange(rest as NavbarSettings)
      } else if (settings.ctaButton) {
        // Update existing CTA
        updateSettings('ctaButton', {
          ...settings.ctaButton,
          ...updates,
        })
      } else {
        // Create new CTA with defaults
        updateSettings('ctaButton', {
          label: 'Get Started',
          href: '#',
          variant: 'primary',
          ...updates,
        })
      }
    },
    [settings, updateSettings, onSettingsChange]
  )

  // =========================================================================
  // LINK MANAGEMENT
  // =========================================================================

  /**
   * Add a new link to the navigation.
   */
  const handleAddLink = useCallback(() => {
    const newLink: NavbarLink = {
      id: generateLinkId(),
      label: 'New Link',
      href: '#',
    }
    updateSettings('links', [...settings.links, newLink])
  }, [settings.links, updateSettings])

  /**
   * Update a specific link.
   */
  const handleUpdateLink = useCallback(
    (index: number, updates: Partial<NavbarLink>) => {
      const newLinks = [...settings.links]
      newLinks[index] = { ...newLinks[index], ...updates }
      updateSettings('links', newLinks)
    },
    [settings.links, updateSettings]
  )

  /**
   * Remove a link.
   */
  const handleRemoveLink = useCallback(
    (index: number) => {
      const newLinks = settings.links.filter((_, i) => i !== index)
      updateSettings('links', newLinks)
    },
    [settings.links, updateSettings]
  )

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div>
      {/* ================================================================
          LAYOUT SECTION — Simple toggle buttons for logo position
          ================================================================ */}
      <PropertySection title="Layout" defaultOpen>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Logo Position</label>
          <div className="flex gap-1.5">
            {/* Logo Left toggle — icon shows logo on the left side */}
            <button
              type="button"
              onClick={() => updateSettings('layout', 'logo-left')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors border',
                (settings.layout || 'logo-left') === 'logo-left'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              <AlignLeft className="h-3.5 w-3.5" />
              Left
            </button>
            {/* Logo Center toggle — icon shows logo centered */}
            <button
              type="button"
              onClick={() => updateSettings('layout', 'logo-center')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors border',
                settings.layout === 'logo-center'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              <AlignCenter className="h-3.5 w-3.5" />
              Center
            </button>
          </div>
        </div>
      </PropertySection>

      {/* ================================================================
          LOGO SECTION
          ================================================================ */}
      <PropertySection title="Logo" defaultOpen>
        {/* Logo Type */}
        <DropdownControl
          label="Type"
          value={settings.logo.type}
          options={[
            { value: 'text', label: 'Text Only' },
            { value: 'image', label: 'Image Only' },
            { value: 'both', label: 'Image + Text' },
          ]}
          onChange={(val) => updateLogo({ type: val as 'text' | 'image' | 'both' })}
        />

        {/* Logo Text (if text or both) */}
        {(settings.logo.type === 'text' || settings.logo.type === 'both') && (
          <InputGroupControl
            label="Text"
            value={settings.logo.text || ''}
            onChange={(val) => updateLogo({ text: String(val) })}
            type="text"
          />
        )}

        {/* Logo Image — uses ImageSourceControl for storage/URL selection (if image or both) */}
        {(settings.logo.type === 'image' || settings.logo.type === 'both') && (
          <ImageSourceControl
            label="Logo Image"
            value={settings.logo.imageUrl || ''}
            onChange={(val) => updateLogo({ imageUrl: val })}
          />
        )}

        {/* Logo Size — slider to control the logo image height (if image or both) */}
        {(settings.logo.type === 'image' || settings.logo.type === 'both') && (
          <SliderInputControl
            label="Logo Size"
            value={settings.logo.logoSize ?? 32}
            onChange={(val) => updateLogo({ logoSize: val })}
            min={16}
            max={120}
            step={1}
            unit="px"
          />
        )}

        {/* Logo Link */}
        <InputGroupControl
          label="Link"
          value={settings.logo.href}
          onChange={(val) => updateLogo({ href: String(val) })}
          type="text"
        />
      </PropertySection>

      {/* ================================================================
          NAVIGATION LINKS SECTION
          ================================================================ */}
      <PropertySection title="Navigation Links" defaultOpen>
        {/* Links list - contained within panel bounds */}
        <div className="space-y-2 mb-3">
          {settings.links.map((link, index) => (
            <LinkItem
              key={link.id}
              link={link}
              index={index}
              onUpdate={handleUpdateLink}
              onRemove={handleRemoveLink}
              availablePages={availablePages}
            />
          ))}

          {settings.links.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
              No navigation links yet.
            </div>
          )}
        </div>

        {/* Add Link Button */}
        <button
          onClick={handleAddLink}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2',
            'text-xs font-medium text-muted-foreground',
            'border border-dashed border-border rounded-lg',
            'hover:border-primary hover:text-primary transition-colors'
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Link
        </button>

        {/* Links Text Color - applies to all navigation links */}
        <div className="mt-4 pt-4 border-t border-border">
          <ColorPickerControl
            label="Links Color"
            value={settings.linksTextColor || '#000000'}
            onChange={(val) => updateSettings('linksTextColor', val)}
          />
        </div>
      </PropertySection>

      {/* ================================================================
          CTA BUTTON SECTION
          ================================================================ */}
      <PropertySection title="CTA Button" defaultOpen={false}>
        {/* Enable/Disable CTA */}
        <ToggleControl
          label="Show CTA"
          checked={!!settings.ctaButton}
          onChange={(val) => {
            if (val) {
              updateCta({})
            } else {
              updateCta(null)
            }
          }}
        />

        {/* CTA Settings (if enabled) */}
        {settings.ctaButton && (
          <>
            <InputGroupControl
              label="Label"
              value={settings.ctaButton.label}
              onChange={(val) => updateCta({ label: String(val) })}
              type="text"
            />

            {/* CTA Link — same page-link / custom-URL toggle as navigation links */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Link</label>
              <div className="flex items-center gap-1.5">
                {/* Mode toggle: page link vs custom URL */}
                <button
                  type="button"
                  onClick={() => {
                    if (settings.ctaButton?.pageId) {
                      /* Switch to custom URL — clear pageId */
                      updateCta({ pageId: undefined })
                    } else if (availablePages.length > 0) {
                      /* Switch to page link — select first page */
                      const firstPage = availablePages[0]
                      updateCta({ pageId: firstPage.id, href: firstPage.slug })
                    }
                  }}
                  className={cn(
                    'shrink-0 p-1.5 rounded transition-colors',
                    settings.ctaButton?.pageId
                      ? 'bg-primary/10 text-primary hover:bg-primary/20'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                  title={settings.ctaButton?.pageId ? 'Linked to page (click for custom URL)' : 'Custom URL (click for page link)'}
                >
                  {settings.ctaButton?.pageId ? (
                    <FileText className="h-3 w-3" />
                  ) : (
                    <Link2 className="h-3 w-3" />
                  )}
                </button>

                {/* Page selector or URL input */}
                {settings.ctaButton?.pageId ? (
                  <select
                    value={settings.ctaButton.pageId}
                    onChange={(e) => {
                      const page = availablePages.find((p) => p.id === e.target.value)
                      if (page) updateCta({ pageId: page.id, href: page.slug })
                    }}
                    className="flex-1 min-w-0 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary truncate"
                  >
                    {availablePages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={settings.ctaButton?.href || ''}
                    onChange={(e) => updateCta({ href: e.target.value })}
                    placeholder="/url or https://..."
                    className="flex-1 min-w-0 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                )}
              </div>
            </div>

            <DropdownControl
              label="Variant"
              value={settings.ctaButton.variant}
              options={[
                { value: 'primary', label: 'Primary' },
                { value: 'secondary', label: 'Secondary' },
                { value: 'outline', label: 'Outline' },
              ]}
              onChange={(val) =>
                updateCta({ variant: val as 'primary' | 'secondary' | 'outline' })
              }
            />

            <ToggleControl
              label="Open in New Tab"
              checked={settings.ctaButton.openInNewTab || false}
              onChange={(val) => updateCta({ openInNewTab: val })}
            />

            {/* CTA Colors Section */}
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <ColorPickerControl
                label="Background"
                value={settings.ctaButton.backgroundColor || '#3b82f6'}
                onChange={(val) => updateCta({ backgroundColor: val })}
              />
              <ColorPickerControl
                label="Text Color"
                value={settings.ctaButton.textColor || '#ffffff'}
                onChange={(val) => updateCta({ textColor: val })}
              />
            </div>
          </>
        )}
      </PropertySection>

      {/* ================================================================
          STICKY SECTION
          ================================================================ */}
      <PropertySection title="Sticky Behavior" defaultOpen={false}>
        <ToggleControl
          label="Sticky"
          checked={settings.sticky.enabled}
          onChange={(val) => updateSticky({ enabled: val })}
        />

        {settings.sticky.enabled && (
          <ToggleControl
            label="Shadow on Scroll"
            checked={settings.sticky.showShadowOnScroll || false}
            onChange={(val) => updateSticky({ showShadowOnScroll: val })}
          />
        )}
      </PropertySection>

      {/* ================================================================
          MOBILE MENU SECTION
          ================================================================ */}
      <PropertySection title="Mobile Menu" defaultOpen={false}>
        {/* Drawer Side */}
        <DropdownControl
          label="Drawer Side"
          value={settings.mobileMenu?.drawerSide || 'right'}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(val) => updateMobileMenu({ drawerSide: val as 'left' | 'right' })}
        />

        {/* Mobile dropdown color overrides — when not set, inherits from main navbar.
            SOURCE OF TRUTH: MobileMenuBackgroundColor, MobileMenuTextColor */}
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <ColorPickerControl
            label="Dropdown Background"
            value={settings.mobileMenu?.backgroundColor || ''}
            onChange={(val) => updateMobileMenu({ backgroundColor: val })}
          />
          <ColorPickerControl
            label="Dropdown Text"
            value={settings.mobileMenu?.textColor || ''}
            onChange={(val) => updateMobileMenu({ textColor: val })}
          />
          <p className="text-[10px] text-muted-foreground">
            Leave empty to inherit colors from main navbar settings.
          </p>
        </div>
      </PropertySection>
    </div>
  )
}
