/**
 * ========================================
 * SLIDER INPUT CONTROL - Properties Panel
 * ========================================
 *
 * A custom minimal slider with a compact text input.
 *
 * Design features:
 * - Thick minimal slider track with subtle rounded corners
 * - Small rectangular handle (not a round circle) for modern look
 * - Text input on the right for precise value entry
 * - Grid cols-3 layout: Label left, Slider + Input right
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 */

'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MobileOverrideIndicator } from './mobile-override-indicator'

interface SliderInputControlProps {
  /** Label text displayed on the left */
  label: string
  /** Current value */
  value: number
  /** Change handler */
  onChange: (value: number) => void
  /** Minimum value (default: 0) - can be negative for properties like margin, letter-spacing */
  min?: number
  /** Maximum value (default: 200) */
  max?: number
  /** Step increment (default: 1) */
  step?: number
  /** Unit suffix (e.g., "px") */
  unit?: string
  /** Disabled state */
  disabled?: boolean
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

export function SliderInputControl({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
  step = 1,
  unit,
  disabled,
  hasMobileOverride,
  onResetMobileOverride,
}: SliderInputControlProps) {
  // Track for the slider element
  const trackRef = useRef<HTMLDivElement>(null)

  // Local state for dragging
  const [isDragging, setIsDragging] = useState(false)

  /**
   * Calculate the percentage position of the handle based on current value.
   * This determines how far along the track the handle should be rendered.
   */
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))

  /**
   * Convert a mouse/touch position to a slider value.
   * Takes the x coordinate and calculates what value it corresponds to
   * based on the track width and min/max range.
   */
  const positionToValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return value

      const rect = trackRef.current.getBoundingClientRect()
      const x = clientX - rect.left
      const percent = Math.min(1, Math.max(0, x / rect.width))
      const rawValue = min + percent * (max - min)

      // Round to nearest step
      const steppedValue = Math.round(rawValue / step) * step
      return Math.min(max, Math.max(min, steppedValue))
    },
    [min, max, step, value]
  )

  /**
   * Handle mouse down on the slider track.
   * Starts dragging and immediately updates value to click position.
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return
      e.preventDefault()
      setIsDragging(true)
      const newValue = positionToValue(e.clientX)
      onChange(newValue)
    },
    [disabled, positionToValue, onChange]
  )

  /**
   * Handle mouse movement during drag.
   * Only active when isDragging is true.
   */
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newValue = positionToValue(e.clientX)
      onChange(newValue)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    // Attach listeners to document for smooth dragging even outside the element
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, positionToValue, onChange])

  /**
   * Handle direct input change from the text field.
   * Validates and clamps the value to min/max range.
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = Number(e.target.value)
      if (!isNaN(inputValue)) {
        const clampedValue = Math.min(max, Math.max(min, inputValue))
        onChange(clampedValue)
      }
    },
    [min, max, onChange]
  )

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

      {/* Slider + Input */}
      <div className="col-span-2 flex items-center gap-2">
        {/* Custom Minimal Slider */}
        <div
          ref={trackRef}
          onMouseDown={handleMouseDown}
          className={cn(
            'relative flex-1 h-6 cursor-pointer select-none',
            'flex items-center',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {/* Track background - thick minimal design with subtle rounding */}
          <div
            className="absolute inset-y-1.5 left-0 right-0 rounded-[4px]"
            style={{ backgroundColor: 'var(--accent)' }}
          />

          {/* Filled portion of the track */}
          <div
            className="absolute inset-y-1.5 left-0 rounded-[4px]"
            style={{
              width: `${percentage}%`,
              backgroundColor: 'var(--muted-foreground)',
            }}
          />

          {/* Handle - small rectangle instead of circle for minimal modern look */}
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 transition-shadow',
              isDragging && 'shadow-lg'
            )}
            style={{
              left: `calc(${percentage}% - 4px)`,
              width: '8px',
              height: '14px',
              backgroundColor: '#ffffff',
              borderRadius: '2px',
            }}
          />
        </div>

        {/* Compact input field for precise value entry */}
        <div className="flex items-center shrink-0">
          <Input
            type="number"
            value={value}
            onChange={handleInputChange}
            disabled={disabled}
            className="w-12 h-6 bg-muted border-none text-xs px-1.5 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && (
            <span className="text-[10px] text-muted-foreground ml-0.5 shrink-0">
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
