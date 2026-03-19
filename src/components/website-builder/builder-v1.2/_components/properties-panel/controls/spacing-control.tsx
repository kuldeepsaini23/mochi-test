/**
 * ============================================================================
 * SPACING CONTROL - Intuitive Box Model Editor
 * ============================================================================
 *
 * A clear, user-friendly control for editing padding/margin values.
 *
 * UX DESIGN:
 * - LINKED MODE (default): Single input applies to all 4 sides
 * - UNLINKED MODE: Four clearly labeled inputs (Top, Right, Bottom, Left)
 * - Toggle between modes with an obvious link/unlink button
 *
 * The link button is prominent and uses the same pattern as other controls.
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

/** Values for all four sides */
interface SpacingValues {
  top: number
  right: number
  bottom: number
  left: number
}

interface SpacingControlProps {
  /** Label displayed on the left (e.g., "Padding", "Margin") */
  label: string
  /** Current values for all four sides */
  values: SpacingValues
  /** Callback when values change - receives all 4 values */
  onChange: (values: SpacingValues) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if all four values are the same (linked state)
 */
function areValuesLinked(values: SpacingValues): boolean {
  return (
    values.top === values.right &&
    values.right === values.bottom &&
    values.bottom === values.left
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SpacingControl({
  label,
  values,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: SpacingControlProps) {
  /**
   * Track whether values are linked (all sides equal) or unlinked (individual sides).
   *
   * FIGMA BEHAVIOR: The linked state is controlled ONLY by user clicking the link/unlink button.
   * We do NOT auto-link when values happen to become equal - that would be frustrating UX.
   * The user explicitly chooses their editing mode.
   *
   * Initial state is determined by whether incoming values are all equal.
   */
  const [isLinked, setIsLinked] = useState(() => areValuesLinked(values))

  /**
   * Handle value change when linked - applies to all 4 sides.
   * Ignores NaN values to allow smooth typing of negative numbers.
   */
  const handleLinkedChange = useCallback(
    (value: number) => {
      // Skip NaN values (happens when typing "-" alone)
      if (isNaN(value)) return
      onChange({ top: value, right: value, bottom: value, left: value })
    },
    [onChange]
  )

  /**
   * Handle individual side change when unlinked.
   * Ignores NaN values to allow smooth typing of negative numbers.
   */
  const handleSideChange = useCallback(
    (side: keyof SpacingValues, value: number) => {
      // Skip NaN values (happens when typing "-" alone)
      if (isNaN(value)) return
      onChange({ ...values, [side]: value })
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
              value={values.top}
              onChange={(e) => handleLinkedChange(Number(e.target.value))}
              className={cn(inputClass, 'flex-1')}
              placeholder="0"
            />
            {/* Link button - click to unlink and show all 4 sides */}
            <button
              onClick={toggleLinked}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded',
                'bg-muted text-primary border border-primary/30',
                'hover:bg-primary/10 transition-colors'
              )}
              title="Linked: All sides equal. Click to edit each side individually."
            >
              <Link className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          /* ================================================================
             UNLINKED MODE - Four labeled inputs with unlink button
             ================================================================ */
          <div className="space-y-1.5">
            {/* Top row: Top input centered with unlink button */}
            <div className="flex items-center gap-1">
              {/* Spacer to center the top input */}
              <div className="w-[52px]" />
              {/* Top input */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/70 w-3">T</span>
                <Input
                  type="number"
                  value={values.top}
                  onChange={(e) => handleSideChange('top', Number(e.target.value))}
                  className={cn(inputClass, 'flex-1')}
                  placeholder="0"
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
                title="Unlinked: Each side independent. Click to link all sides."
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Middle row: Left and Right inputs */}
            <div className="flex items-center gap-1">
              {/* Left input */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/70 w-3">L</span>
                <Input
                  type="number"
                  value={values.left}
                  onChange={(e) => handleSideChange('left', Number(e.target.value))}
                  className={cn(inputClass, 'flex-1')}
                  placeholder="0"
                />
              </div>
              {/* Right input */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/70 w-3">R</span>
                <Input
                  type="number"
                  value={values.right}
                  onChange={(e) => handleSideChange('right', Number(e.target.value))}
                  className={cn(inputClass, 'flex-1')}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Bottom row: Bottom input centered */}
            <div className="flex items-center gap-1">
              {/* Spacer */}
              <div className="w-[52px]" />
              {/* Bottom input */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/70 w-3">B</span>
                <Input
                  type="number"
                  value={values.bottom}
                  onChange={(e) => handleSideChange('bottom', Number(e.target.value))}
                  className={cn(inputClass, 'flex-1')}
                  placeholder="0"
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
