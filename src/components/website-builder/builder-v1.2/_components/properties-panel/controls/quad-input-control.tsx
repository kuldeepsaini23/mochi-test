/**
 * ========================================
 * QUAD INPUT CONTROL - Properties Panel
 * ========================================
 *
 * Grid cols-3 layout: Label left, 2x2 input grid right.
 * Used for border radius, border width, etc.
 * Features a center link button to sync all values.
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 */

'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Link } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileOverrideIndicator } from './mobile-override-indicator'

interface QuadValues {
  top: number
  right: number
  bottom: number
  left: number
}

interface QuadInputControlProps {
  /** Label text displayed on the left */
  label: string
  /** Current values for all four sides */
  values: QuadValues
  /** Change handler */
  onChange: (values: QuadValues) => void
  /** Custom labels for each position (default: TL, TR, BR, BL) */
  labels?: {
    top: string
    right: string
    bottom: string
    left: string
  }
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

export function QuadInputControl({
  label,
  values,
  onChange,
  labels = { top: 'TL', right: 'TR', bottom: 'BR', left: 'BL' },
  hasMobileOverride,
  onResetMobileOverride,
}: QuadInputControlProps) {
  // Check if all values are the same to determine initial link state
  const [isLinked, setIsLinked] = useState(
    values.top === values.right &&
      values.right === values.bottom &&
      values.bottom === values.left
  )

  // Update link state when values change externally
  useEffect(() => {
    const allSame =
      values.top === values.right &&
      values.right === values.bottom &&
      values.bottom === values.left
    if (allSame !== isLinked) {
      setIsLinked(allSame)
    }
  }, [values])

  /**
   * Handle individual value change.
   * When linked, updates all four values to match.
   * Ignores NaN values to allow smooth typing of negative numbers.
   */
  const handleChange = (
    key: 'top' | 'right' | 'bottom' | 'left',
    value: number
  ) => {
    // Skip NaN values (happens when typing "-" alone)
    if (isNaN(value)) return

    if (isLinked) {
      // Sync all values when linked
      onChange({
        top: value,
        right: value,
        bottom: value,
        left: value,
      })
    } else {
      // Update only the changed value
      onChange({ ...values, [key]: value })
    }
  }

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

      {/* 2x2 Input Grid with Center Link Button */}
      <div className="col-span-2 relative">
        <div className="grid grid-cols-2 gap-1">
          {/* Top Left */}
          <Input
            type="number"
            value={values.top}
            onChange={(e) => handleChange('top', Number(e.target.value))}
            className="h-7 bg-muted border-none text-sm px-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder={labels.top}
          />
          {/* Top Right */}
          <Input
            type="number"
            value={values.right}
            onChange={(e) => handleChange('right', Number(e.target.value))}
            className="h-7 bg-muted border-none text-sm px-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder={labels.right}
          />
          {/* Bottom Left */}
          <Input
            type="number"
            value={values.bottom}
            onChange={(e) => handleChange('bottom', Number(e.target.value))}
            className="h-7 bg-muted border-none text-sm px-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder={labels.bottom}
          />
          {/* Bottom Right */}
          <Input
            type="number"
            value={values.left}
            onChange={(e) => handleChange('left', Number(e.target.value))}
            className="h-7 bg-muted border-none text-sm px-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder={labels.left}
          />
        </div>

        {/* Center Link Button */}
        <button
          onClick={() => setIsLinked(!isLinked)}
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'h-5 w-5 flex items-center justify-center rounded bg-background border transition-colors',
            isLinked
              ? 'text-primary border-primary/50'
              : 'text-muted-foreground border-border hover:border-muted-foreground'
          )}
          title={isLinked ? 'Unlink values' : 'Link all values'}
        >
          <Link className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
