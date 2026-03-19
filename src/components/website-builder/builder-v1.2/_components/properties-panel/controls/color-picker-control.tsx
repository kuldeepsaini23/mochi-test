/**
 * ========================================
 * COLOR PICKER CONTROL - Properties Panel
 * ========================================
 *
 * Grid cols-3 layout: Label left, Color swatch right.
 * Opens a popover with the AdvancedColorPicker (canvas-based HSV picker).
 *
 * Features:
 * - Saturation/Brightness 2D canvas
 * - Hue rainbow slider
 * - Opacity slider with checkerboard background
 * - Editable hex + opacity inputs
 * - EyeDropper API integration
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 */

'use client'

import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { BuilderColorPicker } from './builder-color-picker'
import { MobileOverrideIndicator } from './mobile-override-indicator'
import { getColorDisplayText } from '../../../_lib/color-opacity-utils'

interface ColorPickerControlProps {
  /** Label text displayed on the left */
  label: string
  /** Current color value (hex, rgba, or 'transparent') */
  value: string
  /** Change handler — receives hex when opacity is 100%, rgba otherwise */
  onChange: (value: string) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

/**
 * Check if a color value is transparent
 */
function isTransparent(color: string): boolean {
  return color === 'transparent' || color === 'rgba(0,0,0,0)' || color === ''
}

/**
 * Renders a transparent indicator - white square with red diagonal slash
 */
function TransparentSwatch({ className }: { className?: string }) {
  return (
    <div className={`bg-white relative overflow-hidden ${className ?? ''}`}>
      <div className="absolute inset-0">
        <div
          className="absolute bg-destructive"
          style={{
            width: '141%',
            height: '2px',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(45deg)',
          }}
        />
      </div>
    </div>
  )
}

export function ColorPickerControl({
  label,
  value,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: ColorPickerControlProps) {
  const [isOpen, setIsOpen] = useState(false)

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

      {/* Color Swatch + Value Display */}
      <div className="col-span-2 flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            {/* Trigger button — shows current color or transparent indicator */}
            {isTransparent(value) ? (
              <button
                className="w-7 h-7 rounded border border-border hover:border-muted-foreground transition-colors shrink-0 overflow-hidden"
                title="Click to pick color"
              >
                <TransparentSwatch className="w-full h-full" />
              </button>
            ) : (
              <button
                className="w-7 h-7 rounded border border-border hover:border-muted-foreground transition-colors shrink-0"
                style={{ backgroundColor: value }}
                title="Click to pick color"
              />
            )}
          </PopoverTrigger>
          <PopoverContent
            className="w-[300px] p-3"
            side="left"
            align="start"
          >
            {/* Builder-aware color picker with quick presets + saved colors */}
            <BuilderColorPicker
              value={value}
              onChange={onChange}
              showOpacity
            />
          </PopoverContent>
        </Popover>

        {/* Color value text (read-only display) */}
        <span className="text-sm text-muted-foreground truncate">
          {getColorDisplayText(value)}
        </span>
      </div>
    </div>
  )
}
