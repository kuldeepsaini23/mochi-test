/**
 * ============================================================================
 * COLOR PICKER — Popover wrapper around AdvancedColorPicker
 * ============================================================================
 *
 * A reusable color picker trigger that shows the AdvancedColorPicker (canvas-based
 * HSV picker) inside a popover. Renders as a button with a color swatch preview.
 *
 * Used by tags-input and other components that need a simple value+onChange
 * color picker without a label/layout wrapper.
 *
 * SOURCE OF TRUTH KEYWORDS: ColorPicker, AdvancedColorPickerWrapper
 * ============================================================================
 */

'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { AdvancedColorPicker } from '@/components/ui/advanced-color-picker'

/**
 * Quick preset colors shown inside the AdvancedColorPicker.
 * Matches the website builder's preset palette for a consistent experience.
 */
const QUICK_COLORS = [
  'transparent',
  '#FFFFFF',
  '#000000',
  '#6B7280',
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
]

interface ColorPickerProps {
  /** Current color value (hex, rgba, or 'transparent') */
  value: string
  /** Called when color changes */
  onChange: (color: string) => void
  /** Disable the trigger button */
  disabled?: boolean
  /** Additional className for the trigger button */
  className?: string
}

/**
 * Returns a display string for the current color value.
 * Handles hex, rgba, transparent, and empty/undefined gracefully.
 */
function getDisplayText(color: string | undefined | null): string {
  if (!color || color === 'transparent' || color === 'rgba(0,0,0,0)' || color === '') {
    return 'None'
  }
  /* For hex values, show uppercase */
  if (color.startsWith('#')) {
    return color.toUpperCase()
  }
  /* For rgba values, show shortened form */
  return color
}

/**
 * Whether the color represents a transparent/empty value.
 */
function isTransparent(color: string | undefined | null): boolean {
  return !color || color === 'transparent' || color === 'rgba(0,0,0,0)' || color === ''
}

export function ColorPicker({
  value,
  onChange,
  disabled = false,
  className,
}: ColorPickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start gap-2', className)}
        >
          {/* Color swatch preview */}
          {isTransparent(value) ? (
            <div className="h-4 w-4 rounded-full border border-border bg-white relative overflow-hidden shrink-0">
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
          ) : (
            <div
              className="h-4 w-4 rounded-full border border-border shrink-0"
              style={{ backgroundColor: value }}
            />
          )}
          <span className="flex-1 text-left font-mono text-xs truncate">
            {getDisplayText(value)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" align="start">
        <AdvancedColorPicker
          value={value || '#000000'}
          onChange={onChange}
          showOpacity
          quickColors={QUICK_COLORS}
        />
      </PopoverContent>
    </Popover>
  )
}
