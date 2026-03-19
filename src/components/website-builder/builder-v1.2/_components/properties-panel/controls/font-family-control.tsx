/**
 * ============================================================================
 * FONT FAMILY CONTROL — Properties Panel Wrapper for FontFamilyPicker
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: FontFamilyControl, FontFamilyControlProps
 *
 * WHY: Thin wrapper that adds the properties panel chrome (label, grid layout,
 * mobile override indicator) around the shared FontFamilyPicker dropdown.
 * All font logic lives in FontFamilyPicker — this component is purely layout.
 *
 * HOW: grid-cols-3 layout with label on the left and FontFamilyPicker on the
 * right, matching the standard properties panel control pattern.
 *
 * USAGE:
 * ```tsx
 * <FontFamilyControl
 *   label="Font"
 *   value="Inter"
 *   onChange={(font) => handleFontChange(font)}
 * />
 * ```
 */

'use client'

import { FontFamilyPicker } from './font-family-picker'
import { MobileOverrideIndicator } from './mobile-override-indicator'

// ============================================================================
// TYPES
// ============================================================================

interface FontFamilyControlProps {
  /** Label text displayed on the left */
  label: string
  /** Currently selected font family */
  value: string
  /** Change handler - receives the font family name */
  onChange: (fontFamily: string) => void
  /** Disabled state */
  disabled?: boolean
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Properties panel font selector — label + mobile override + shared dropdown.
 * Delegates all font logic to FontFamilyPicker (zero code drift).
 */
export function FontFamilyControl({
  label,
  value,
  onChange,
  disabled,
  hasMobileOverride,
  onResetMobileOverride,
}: FontFamilyControlProps) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      {/* Label with optional mobile override indicator */}
      <div className="col-span-1 flex items-center gap-1.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <MobileOverrideIndicator
          hasOverride={hasMobileOverride ?? false}
          onReset={onResetMobileOverride}
        />
      </div>

      {/* Font Selector — shared picker in sidebar variant */}
      <div className="col-span-2">
        <FontFamilyPicker
          value={value}
          onChange={onChange}
          disabled={disabled}
          variant="sidebar"
        />
      </div>
    </div>
  )
}
