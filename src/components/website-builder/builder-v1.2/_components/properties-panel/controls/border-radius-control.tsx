/**
 * ============================================================================
 * BORDER RADIUS CONTROL - Figma-Style Corner Radius Editor
 * ============================================================================
 *
 * A user-friendly control for editing border-radius values on all four corners.
 * Mirrors the UX pattern established by SpacingControl.
 *
 * UX DESIGN:
 * - LINKED MODE (default): Single input applies to all 4 corners
 * - UNLINKED MODE: Four clearly labeled inputs (TL, TR, BR, BL)
 * - Toggle between modes with a prominent link/unlink button
 *
 * FIGMA BEHAVIOR:
 * - User explicitly controls linked/unlinked state via button click
 * - No auto-linking when values happen to match
 * - Corners arranged in clockwise order: TL → TR → BR → BL
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 *
 * ============================================================================
 */

'use client'

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Link, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileOverrideIndicator } from './mobile-override-indicator'

// ============================================================================
// TYPES
// ============================================================================

/** Values for all four corners (clockwise: TL, TR, BR, BL) */
export interface BorderRadiusValues {
  topLeft: number
  topRight: number
  bottomRight: number
  bottomLeft: number
}

interface BorderRadiusControlProps {
  /** Label displayed on the left (e.g., "Rounded Corners") */
  label: string
  /** Current values for all four corners */
  values: BorderRadiusValues
  /** Callback when values change - receives all 4 values */
  onChange: (values: BorderRadiusValues) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if all four corner values are the same (linked state)
 */
function areValuesLinked(values: BorderRadiusValues): boolean {
  return (
    values.topLeft === values.topRight &&
    values.topRight === values.bottomRight &&
    values.bottomRight === values.bottomLeft
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BorderRadiusControl({
  label,
  values,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: BorderRadiusControlProps) {
  /**
   * Track whether values are linked (all corners equal) or unlinked (individual corners).
   *
   * FIGMA BEHAVIOR: The linked state is controlled ONLY by user clicking the link/unlink button.
   * We do NOT auto-link when values happen to become equal - that would be frustrating UX.
   * The user explicitly chooses their editing mode.
   *
   * Initial state is determined by whether incoming values are all equal.
   */
  const [isLinked, setIsLinked] = useState(() => areValuesLinked(values))

  /**
   * Handle value change when linked - applies to all 4 corners
   */
  const handleLinkedChange = useCallback(
    (value: number) => {
      onChange({
        topLeft: value,
        topRight: value,
        bottomRight: value,
        bottomLeft: value,
      })
    },
    [onChange]
  )

  /**
   * Handle individual corner change when unlinked
   */
  const handleCornerChange = useCallback(
    (corner: keyof BorderRadiusValues, value: number) => {
      onChange({ ...values, [corner]: value })
    },
    [onChange, values]
  )

  /**
   * Toggle between linked and unlinked modes
   */
  const toggleLinked = useCallback(() => {
    setIsLinked((prev) => !prev)
  }, [])

  // Shared input styling
  const inputClass = cn(
    'h-7 bg-muted border-none text-sm px-2 text-center',
    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
  )

  return (
    <div className="grid grid-cols-3 gap-2 items-start">
      {/* Label with optional mobile override indicator */}
      <div className="col-span-1 flex items-center gap-1.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <MobileOverrideIndicator
          hasOverride={hasMobileOverride ?? false}
          onReset={onResetMobileOverride}
        />
      </div>

      {/* Input area */}
      <div className="col-span-2">
        {isLinked ? (
          /* ================================================================
             LINKED MODE - Single input with link button
             ================================================================ */
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={values.topLeft}
              onChange={(e) => handleLinkedChange(Number(e.target.value))}
              className={cn(inputClass, 'flex-1')}
              placeholder="0"
              min={0}
            />
            <span className="text-xs text-muted-foreground">px</span>
            {/* Link button - click to unlink and show all 4 corners */}
            <button
              onClick={toggleLinked}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded',
                'bg-muted text-primary border border-primary/30',
                'hover:bg-primary/10 transition-colors'
              )}
              title="Linked: All corners equal. Click to edit each corner individually."
            >
              <Link className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          /* ================================================================
             UNLINKED MODE - Four corner inputs arranged like a box
             Layout matches corner positions visually:
             [TL] [TR]
             [BL] [BR]
             ================================================================ */
          <div className="space-y-1.5">
            {/* Top row: Top-Left and Top-Right with unlink button */}
            <div className="flex items-center gap-1">
              {/* Top-Left input */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/70 w-4">TL</span>
                <Input
                  type="number"
                  value={values.topLeft}
                  onChange={(e) => handleCornerChange('topLeft', Number(e.target.value))}
                  className={cn(inputClass, 'flex-1')}
                  placeholder="0"
                  min={0}
                />
              </div>
              {/* Top-Right input */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/70 w-4">TR</span>
                <Input
                  type="number"
                  value={values.topRight}
                  onChange={(e) => handleCornerChange('topRight', Number(e.target.value))}
                  className={cn(inputClass, 'flex-1')}
                  placeholder="0"
                  min={0}
                />
              </div>
              {/* Unlink button */}
              <button
                onClick={toggleLinked}
                className={cn(
                  'h-7 w-7 flex items-center justify-center rounded',
                  'bg-muted text-muted-foreground border border-border',
                  'hover:text-foreground hover:border-muted-foreground transition-colors'
                )}
                title="Unlinked: Each corner independent. Click to link all corners."
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Bottom row: Bottom-Left and Bottom-Right */}
            <div className="flex items-center gap-1">
              {/* Bottom-Left input */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/70 w-4">BL</span>
                <Input
                  type="number"
                  value={values.bottomLeft}
                  onChange={(e) => handleCornerChange('bottomLeft', Number(e.target.value))}
                  className={cn(inputClass, 'flex-1')}
                  placeholder="0"
                  min={0}
                />
              </div>
              {/* Bottom-Right input */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/70 w-4">BR</span>
                <Input
                  type="number"
                  value={values.bottomRight}
                  onChange={(e) => handleCornerChange('bottomRight', Number(e.target.value))}
                  className={cn(inputClass, 'flex-1')}
                  placeholder="0"
                  min={0}
                />
              </div>
              {/* Spacer to match button width */}
              <div className="w-7" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
