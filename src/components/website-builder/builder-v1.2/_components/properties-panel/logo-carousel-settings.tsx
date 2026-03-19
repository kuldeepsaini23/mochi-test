/**
 * ============================================================================
 * LOGO CAROUSEL SETTINGS PANEL
 * ============================================================================
 *
 * Settings panel for configuring PreBuilt logo carousel elements.
 * This social proof component displays a horizontal strip of logos with
 * optional infinite-scroll animation.
 *
 * ============================================================================
 * CONFIGURABLE OPTIONS
 * ============================================================================
 *
 * LOGOS SECTION (defaultOpen):
 *   - Manage logo entries: image URL, alt text, optional link href
 *   - Add / remove individual logos
 *
 * LAYOUT SECTION:
 *   - Logo Size (px), Gap (px), Padding (px), Object Fit (contain | cover)
 *
 * STYLE SECTION:
 *   - Grayscale toggle (professional monochrome look)
 *
 * ANIMATION SECTION:
 *   - Auto Scroll toggle
 *   - Speed (px/s) and Direction (left | right) — visible only when auto scroll is on
 *
 * ============================================================================
 */

'use client'

import { useCallback } from 'react'
import { X, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type {
  PreBuiltLogoCarouselElement,
  LogoCarouselSettings,
  LogoCarouselLogo,
} from '../../_lib/prebuilt'
import { generateLogoId } from '../../_lib/prebuilt'
import {
  PropertySection,
  InputGroupControl,
  DropdownControl,
  ToggleControl,
  ImageBackgroundControl,
} from './controls'

// ============================================================================
// TYPES
// ============================================================================

interface LogoCarouselSettingsPanelProps {
  /** The logo carousel element data */
  element: PreBuiltLogoCarouselElement

  /** Callback to update settings — receives the full merged settings object */
  onSettingsChange: (settings: LogoCarouselSettings) => void
}

// ============================================================================
// OBJECT FIT OPTIONS — controls how logos fit within their bounding box
// ============================================================================

const OBJECT_FIT_OPTIONS = [
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
]

// ============================================================================
// SCROLL DIRECTION OPTIONS — left or right auto-scroll movement
// ============================================================================

const SCROLL_DIRECTION_OPTIONS = [
  { value: 'left', label: 'Scroll Left' },
  { value: 'right', label: 'Scroll Right' },
]

// ============================================================================
// LOGO ENTRY ROW — Renders controls for a single logo in the list
// ============================================================================

interface LogoEntryRowProps {
  /** The logo data to display */
  logo: LogoCarouselLogo
  /** Index in the logos array for display labeling */
  index: number
  /** Callback when a field on this logo changes */
  onUpdate: (logoId: string, field: keyof LogoCarouselLogo, value: string | boolean) => void
  /** Callback to remove this logo from the list */
  onRemove: (logoId: string) => void
}

/**
 * LogoEntryRow
 *
 * Displays a single logo's controls: thumbnail preview, URL input, alt text,
 * and an expandable section for optional href / openInNewTab.
 * The delete button removes the logo from the carousel.
 */
function LogoEntryRow({ logo, index, onUpdate, onRemove }: LogoEntryRowProps) {
  /** Track whether the optional link sub-section is expanded */
  const [linkExpanded, setLinkExpanded] = useState(false)

  return (
    <div className="rounded-md border border-border/50 p-2 space-y-2">
      {/* ---- Header row: preview thumbnail + logo number + delete button ---- */}
      <div className="flex items-center gap-2">
        {/* Small image preview (32x32) — shows the logo or a placeholder bg */}
        <div className="w-8 h-8 rounded bg-muted/50 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {logo.src ? (
            <img
              src={logo.src}
              alt={logo.alt || `Logo ${index + 1}`}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-[9px] text-muted-foreground">No img</span>
          )}
        </div>

        {/* Logo label */}
        <span className="text-xs text-muted-foreground flex-1">
          Logo {index + 1}
        </span>

        {/* Expand/collapse link section toggle */}
        <button
          type="button"
          onClick={() => setLinkExpanded(!linkExpanded)}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
          title={linkExpanded ? 'Collapse link options' : 'Expand link options'}
        >
          {linkExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>

        {/* Delete button — removes this logo entry entirely */}
        <button
          type="button"
          onClick={() => onRemove(logo.id)}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Remove logo"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ---- Logo Image — select from storage or paste a URL ---- */}
      <ImageBackgroundControl
        label="Logo Image"
        value={logo.src}
        onChange={(value) => onUpdate(logo.id, 'src', value)}
      />

      {/* ---- Alt text for accessibility ---- */}
      <InputGroupControl
        label="Alt Text"
        value={logo.alt || ''}
        onChange={(value) => onUpdate(logo.id, 'alt', String(value))}
        type="text"
      />

      {/* ---- Optional link section (collapsed by default) ---- */}
      {linkExpanded && (
        <div className="space-y-2 pt-1 border-t border-border/30">
          {/* Link href — clicking the logo navigates here */}
          <InputGroupControl
            label="Link"
            value={logo.href || ''}
            onChange={(value) => onUpdate(logo.id, 'href', String(value))}
            type="text"
          />

          {/* Open in new tab toggle */}
          <ToggleControl
            label="New Tab"
            checked={logo.openInNewTab ?? false}
            onChange={(checked) => onUpdate(logo.id, 'openInNewTab', checked)}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * LogoCarouselSettingsPanel
 *
 * Provides controls for customizing the logo carousel prebuilt element.
 * All logo management (add, edit, delete) happens here — logos cannot
 * be selected or manipulated directly on the canvas.
 */
export function LogoCarouselSettingsPanel({
  element,
  onSettingsChange,
}: LogoCarouselSettingsPanelProps) {
  const { settings } = element

  // ==========================================================================
  // SETTING UPDATE HELPERS
  // ==========================================================================

  /**
   * Update a single top-level setting value.
   * Merges with existing settings to preserve other values.
   */
  const updateSetting = useCallback(
    <K extends keyof LogoCarouselSettings>(
      key: K,
      value: LogoCarouselSettings[K]
    ) => {
      onSettingsChange({
        ...settings,
        [key]: value,
      })
    },
    [settings, onSettingsChange]
  )

  /**
   * Update a single field on a specific logo entry.
   * Finds the logo by ID and merges the changed field.
   */
  const updateLogo = useCallback(
    (logoId: string, field: keyof LogoCarouselLogo, value: string | boolean) => {
      const updatedLogos = settings.logos.map((logo) =>
        logo.id === logoId ? { ...logo, [field]: value } : logo
      )
      onSettingsChange({
        ...settings,
        logos: updatedLogos,
      })
    },
    [settings, onSettingsChange]
  )

  /**
   * Remove a logo entry from the carousel by its ID.
   */
  const removeLogo = useCallback(
    (logoId: string) => {
      const updatedLogos = settings.logos.filter((logo) => logo.id !== logoId)
      onSettingsChange({
        ...settings,
        logos: updatedLogos,
      })
    },
    [settings, onSettingsChange]
  )

  /**
   * Add a new empty logo entry to the end of the list.
   * Uses generateLogoId() for a unique timestamp-based ID.
   */
  const addLogo = useCallback(() => {
    const newLogo: LogoCarouselLogo = {
      id: generateLogoId(),
      src: '',
      alt: '',
    }
    onSettingsChange({
      ...settings,
      logos: [...settings.logos, newLogo],
    })
  }, [settings, onSettingsChange])

  return (
    <div className="space-y-4">
      {/* ================================================================
          LOGOS SECTION — Manage individual logo entries
          ================================================================ */}
      <PropertySection title="Logos" defaultOpen>
        <div className="space-y-2">
          {/* Render each logo entry as a configurable row */}
          {settings.logos.map((logo, index) => (
            <LogoEntryRow
              key={logo.id}
              logo={logo}
              index={index}
              onUpdate={updateLogo}
              onRemove={removeLogo}
            />
          ))}

          {/* Add Logo button — appends a new empty entry */}
          <button
            type="button"
            onClick={addLogo}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-md border border-dashed border-border/50 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Logo
          </button>
        </div>
      </PropertySection>

      {/* ================================================================
          LAYOUT SECTION — Size, spacing, and object fit
          ================================================================ */}
      <PropertySection title="Layout" defaultOpen={false}>
        {/* Logo Size — width & height of each logo container */}
        <InputGroupControl
          label="Logo Size"
          value={settings.logoSize ?? 100}
          onChange={(value) => {
            const size = typeof value === 'number' ? value : parseInt(String(value), 10)
            if (!isNaN(size) && size > 0) {
              updateSetting('logoSize', size)
            }
          }}
          type="number"
          unit="px"
        />

        {/* Gap — horizontal space between logos */}
        <InputGroupControl
          label="Gap"
          value={settings.gap ?? 20}
          onChange={(value) => {
            const gap = typeof value === 'number' ? value : parseInt(String(value), 10)
            if (!isNaN(gap) && gap >= 0) {
              updateSetting('gap', gap)
            }
          }}
          type="number"
          unit="px"
        />

        {/* Padding — inner spacing of the carousel container */}
        <InputGroupControl
          label="Padding"
          value={settings.padding ?? 20}
          onChange={(value) => {
            const padding = typeof value === 'number' ? value : parseInt(String(value), 10)
            if (!isNaN(padding) && padding >= 0) {
              updateSetting('padding', padding)
            }
          }}
          type="number"
          unit="px"
        />

        {/* Object Fit — how logo images fill their container */}
        <DropdownControl
          label="Object Fit"
          value={settings.objectFit || 'contain'}
          options={OBJECT_FIT_OPTIONS}
          onChange={(value) => {
            updateSetting('objectFit', value as 'contain' | 'cover')
          }}
        />
      </PropertySection>

      {/* ================================================================
          STYLE SECTION — Visual appearance toggles
          ================================================================ */}
      <PropertySection title="Style" defaultOpen={false}>
        {/* Grayscale — applies CSS grayscale filter for a unified professional look */}
        <ToggleControl
          label="Grayscale"
          checked={settings.grayscale ?? true}
          onChange={(checked) => updateSetting('grayscale', checked)}
        />
      </PropertySection>

      {/* ================================================================
          ANIMATION SECTION — Auto-scroll marquee settings
          ================================================================ */}
      <PropertySection title="Animation" defaultOpen={false}>
        {/* Auto Scroll — enables infinite marquee animation */}
        <ToggleControl
          label="Auto Scroll"
          checked={settings.autoScroll ?? false}
          onChange={(checked) => updateSetting('autoScroll', checked)}
        />

        {/* Speed and Direction only visible when auto scroll is enabled */}
        {settings.autoScroll && (
          <>
            {/* Speed — pixels per second the marquee scrolls */}
            <InputGroupControl
              label="Speed"
              value={settings.autoScrollSpeed ?? 50}
              onChange={(value) => {
                const speed = typeof value === 'number' ? value : parseInt(String(value), 10)
                if (!isNaN(speed) && speed > 0) {
                  updateSetting('autoScrollSpeed', speed)
                }
              }}
              type="number"
              unit="px/s"
            />

            {/* Direction — which way the logos scroll */}
            <DropdownControl
              label="Direction"
              value={settings.autoScrollDirection || 'left'}
              options={SCROLL_DIRECTION_OPTIONS}
              onChange={(value) => {
                updateSetting('autoScrollDirection', value as 'left' | 'right')
              }}
            />
          </>
        )}
      </PropertySection>
    </div>
  )
}
