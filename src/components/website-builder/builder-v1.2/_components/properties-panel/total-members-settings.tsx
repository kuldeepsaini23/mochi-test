/**
 * ============================================================================
 * TOTAL MEMBERS SETTINGS PANEL
 * ============================================================================
 *
 * Settings panel for configuring PreBuilt total members elements.
 * This social proof component displays stacked avatars with a message.
 *
 * ============================================================================
 * CONFIGURABLE OPTIONS
 * ============================================================================
 *
 * - MESSAGE: The text displayed next to avatars (e.g., "7000+ prodigies worldwide")
 * - TEXT COLOR: Color of the message text
 * - FONT SIZE: Size of the message text
 * - FONT WEIGHT: Weight of the message text
 *
 * NOTE: Avatar images are HARDCODED and not user-editable.
 *
 * ============================================================================
 */

'use client'

import { useCallback } from 'react'
import type { PreBuiltTotalMembersElement, TotalMembersSettings } from '../../_lib/prebuilt'
import {
  PropertySection,
  InputGroupControl,
  ColorPickerControl,
  DropdownControl,
} from './controls'

// ============================================================================
// TYPES
// ============================================================================

interface TotalMembersSettingsPanelProps {
  /** The total members element data */
  element: PreBuiltTotalMembersElement

  /** Callback to update settings */
  onSettingsChange: (settings: TotalMembersSettings) => void
}

// ============================================================================
// FONT WEIGHT OPTIONS
// ============================================================================

const FONT_WEIGHT_OPTIONS = [
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * TotalMembersSettingsPanel
 *
 * Provides controls for customizing the total members social proof element.
 * Only the message text and styling can be changed - avatars are fixed.
 */
export function TotalMembersSettingsPanel({
  element,
  onSettingsChange,
}: TotalMembersSettingsPanelProps) {
  const { settings } = element

  /**
   * Update a single setting value.
   * Merges with existing settings to preserve other values.
   */
  const updateSetting = useCallback(
    <K extends keyof TotalMembersSettings>(
      key: K,
      value: TotalMembersSettings[K]
    ) => {
      onSettingsChange({
        ...settings,
        [key]: value,
      })
    },
    [settings, onSettingsChange]
  )

  return (
    <div className="space-y-4">
      {/* ================================================================
          MESSAGE SECTION
          ================================================================ */}
      <PropertySection title="Message" defaultOpen>
        {/* Message Text */}
        <InputGroupControl
          label="Text"
          value={settings.message}
          onChange={(value) => updateSetting('message', String(value))}
          type="text"
        />

        {/* Text Color */}
        <ColorPickerControl
          label="Text Color"
          value={settings.textColor || '#ffffff'}
          onChange={(color) => updateSetting('textColor', color)}
        />
      </PropertySection>

      {/* ================================================================
          TYPOGRAPHY SECTION
          ================================================================ */}
      <PropertySection title="Typography" defaultOpen={false}>
        {/* Font Size */}
        <InputGroupControl
          label="Font Size"
          value={settings.fontSize || 16}
          onChange={(value) => {
            const size = typeof value === 'number' ? value : parseInt(String(value), 10)
            if (!isNaN(size) && size > 0) {
              updateSetting('fontSize', size)
            }
          }}
          type="number"
          unit="px"
        />

        {/* Font Weight */}
        <DropdownControl
          label="Font Weight"
          value={String(settings.fontWeight || 500)}
          options={FONT_WEIGHT_OPTIONS}
          onChange={(value) => {
            updateSetting('fontWeight', parseInt(value, 10))
          }}
        />
      </PropertySection>

      {/* ================================================================
          AVATARS SECTION
          ================================================================ */}
      <PropertySection title="Avatars" defaultOpen={false}>
        {/* Avatar Border Color */}
        <ColorPickerControl
          label="Border Color"
          value={settings.avatarBorderColor || '#000000'}
          onChange={(color) => updateSetting('avatarBorderColor', color)}
        />
      </PropertySection>

      {/* ================================================================
          INFO NOTE
          ================================================================ */}
      <div className="px-3 py-2 bg-muted/50 rounded-md">
        <p className="text-[11px] text-muted-foreground">
          Avatar images are pre-selected and cannot be changed.
          Only the message text, styling, and avatar border color can be customized.
        </p>
      </div>
    </div>
  )
}
