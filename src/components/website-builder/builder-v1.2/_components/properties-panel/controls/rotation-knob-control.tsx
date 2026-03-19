/**
 * ========================================
 * ROTATION KNOB CONTROL - Properties Panel
 * ========================================
 *
 * SOURCE OF TRUTH: Rotation control with circular dial UI
 *
 * A music player-style knob control for setting element rotation.
 * Users can click and drag to rotate, or enter a precise value.
 *
 * Features:
 * - Circular dial that rotates with value
 * - Click and drag to rotate
 * - Visual indicator line showing current angle
 * - Text input for precise value entry
 * - Mobile override support
 *
 * ========================================
 */

'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { RotateCcw } from 'lucide-react'
import { MobileOverrideIndicator } from './mobile-override-indicator'

interface RotationKnobControlProps {
  /** Current rotation value in degrees (-180 to 180) */
  value: number
  /** Change handler */
  onChange: (value: number) => void
  /** Disabled state */
  disabled?: boolean
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

/**
 * Normalizes an angle to the -180 to 180 range.
 * This ensures angles wrap correctly when dragging past 180/-180.
 */
function normalizeAngle(angle: number): number {
  // First normalize to 0-360 range
  let normalized = angle % 360
  if (normalized < 0) normalized += 360

  // Convert to -180 to 180 range
  if (normalized > 180) {
    normalized -= 360
  }

  return Math.round(normalized)
}

export function RotationKnobControl({
  value,
  onChange,
  disabled,
  hasMobileOverride,
  onResetMobileOverride,
}: RotationKnobControlProps) {
  /**
   * Reference to the knob element for position calculations.
   */
  const knobRef = useRef<HTMLDivElement>(null)

  /**
   * Track dragging state and starting angle for smooth rotation.
   */
  const [isDragging, setIsDragging] = useState(false)
  const startAngleRef = useRef(0)
  const startValueRef = useRef(0)

  /**
   * Calculate angle from pointer position relative to knob center.
   * Returns angle in degrees where 0 = top, positive = clockwise.
   */
  const getAngleFromPointer = useCallback((clientX: number, clientY: number): number => {
    if (!knobRef.current) return 0

    const rect = knobRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const deltaX = clientX - centerX
    const deltaY = clientY - centerY

    // atan2 gives angle from positive X axis, we want from negative Y (top)
    // Subtract 90 degrees to make 0 point upward
    let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90

    return angle
  }, [])

  /**
   * Handle pointer down - start tracking rotation.
   */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return
      e.preventDefault()

      setIsDragging(true)
      startAngleRef.current = getAngleFromPointer(e.clientX, e.clientY)
      startValueRef.current = value

      // Capture pointer for tracking outside element
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [disabled, getAngleFromPointer, value]
  )

  /**
   * Handle pointer move - update rotation based on drag delta.
   */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || disabled) return

      const currentAngle = getAngleFromPointer(e.clientX, e.clientY)
      const angleDelta = currentAngle - startAngleRef.current

      // Calculate new value based on delta from start
      const newValue = normalizeAngle(startValueRef.current + angleDelta)

      onChange(newValue)
    },
    [isDragging, disabled, getAngleFromPointer, onChange]
  )

  /**
   * Handle pointer up - stop tracking.
   */
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      setIsDragging(false)
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    },
    []
  )

  /**
   * Handle direct input value change.
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = parseInt(e.target.value, 10)
      if (isNaN(inputValue)) return

      // Clamp to valid range
      const clamped = Math.max(-180, Math.min(180, inputValue))
      onChange(clamped)
    },
    [onChange]
  )

  /**
   * Reset rotation to 0.
   */
  const handleReset = useCallback(() => {
    onChange(0)
  }, [onChange])

  /**
   * Knob size constants.
   */
  const KNOB_SIZE = 32
  const INDICATOR_LENGTH = 10

  return (
    <div className="grid grid-cols-3 gap-2 items-center py-1">
      {/* Label with mobile override indicator */}
      <div className="col-span-1 flex items-center gap-1.5">
        <MobileOverrideIndicator
          hasOverride={hasMobileOverride ?? false}
          onReset={onResetMobileOverride}
        />
        <span className="text-xs text-muted-foreground select-none">Rotation</span>
      </div>

      {/* Knob and input */}
      <div className="col-span-2 flex items-center gap-3">
        {/* Circular knob */}
        <div
          ref={knobRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`
            relative flex-shrink-0 rounded-full cursor-grab
            border border-border/60 bg-background
            transition-shadow duration-150
            ${isDragging ? 'cursor-grabbing shadow-md ring-2 ring-primary/30' : 'hover:border-border'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          style={{
            width: KNOB_SIZE,
            height: KNOB_SIZE,
          }}
        >
          {/* Center dot */}
          <div
            className="absolute rounded-full bg-muted-foreground/30"
            style={{
              width: 4,
              height: 4,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Rotation indicator line */}
          <div
            className="absolute bg-primary rounded-full transition-transform duration-75"
            style={{
              width: 2,
              height: INDICATOR_LENGTH,
              left: '50%',
              top: 3,
              transformOrigin: `50% ${KNOB_SIZE / 2 - 3}px`,
              transform: `translateX(-50%) rotate(${value}deg)`,
            }}
          />

          {/* Tick marks at 0, 90, 180, -90 */}
          {[0, 90, 180, -90].map((tick) => (
            <div
              key={tick}
              className="absolute bg-muted-foreground/20 rounded-full"
              style={{
                width: 1,
                height: 3,
                left: '50%',
                top: 1,
                transformOrigin: `50% ${KNOB_SIZE / 2 - 1}px`,
                transform: `translateX(-50%) rotate(${tick}deg)`,
              }}
            />
          ))}
        </div>

        {/* Value input */}
        <div className="flex items-center gap-1 flex-1">
          <Input
            type="number"
            value={value}
            onChange={handleInputChange}
            min={-180}
            max={180}
            step={1}
            disabled={disabled}
            className="h-7 text-xs w-16 px-2 text-center"
          />
          <span className="text-xs text-muted-foreground">°</span>
        </div>

        {/* Reset button - only show when not at 0 */}
        {value !== 0 && !disabled && (
          <button
            type="button"
            onClick={handleReset}
            className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            title="Reset to 0°"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
