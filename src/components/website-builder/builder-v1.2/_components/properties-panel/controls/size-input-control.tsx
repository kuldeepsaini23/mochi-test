/**
 * ========================================
 * SIZE INPUT CONTROL - Properties Panel
 * ========================================
 *
 * Combined Width/Height input with link button to sync values.
 * Layout: Label | Link Icon | W input | H input
 * When linked, both values stay the same.
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 */

'use client'

import { useState } from 'react'
import { Link2, Unlink2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MobileOverrideIndicator } from './mobile-override-indicator'

interface SizeInputControlProps {
  /** Label text displayed on the left */
  label: string
  /** Current width value */
  width: number
  /** Current height value */
  height: number
  /** Change handler for width */
  onWidthChange: (value: number) => void
  /** Change handler for height */
  onHeightChange: (value: number) => void
  /** Whether width input is disabled */
  widthDisabled?: boolean
  /** Whether height input is disabled */
  heightDisabled?: boolean
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

export function SizeInputControl({
  label,
  width,
  height,
  onWidthChange,
  onHeightChange,
  widthDisabled = false,
  heightDisabled = false,
  hasMobileOverride,
  onResetMobileOverride,
}: SizeInputControlProps) {
  // Track whether width and height are linked (same value)
  const [isLinked, setIsLinked] = useState(false)

  /**
   * Handle width change - if linked, set height to same value.
   * Ignores NaN values to allow smooth typing of negative numbers.
   */
  const handleWidthChange = (newWidth: number) => {
    // Skip NaN values (happens when typing "-" alone)
    if (isNaN(newWidth)) return
    const rounded = Math.round(newWidth)
    onWidthChange(rounded)
    if (isLinked) {
      onHeightChange(rounded)
    }
  }

  /**
   * Handle height change - if linked, set width to same value.
   * Ignores NaN values to allow smooth typing of negative numbers.
   */
  const handleHeightChange = (newHeight: number) => {
    // Skip NaN values (happens when typing "-" alone)
    if (isNaN(newHeight)) return
    const rounded = Math.round(newHeight)
    onHeightChange(rounded)
    if (isLinked) {
      onWidthChange(rounded)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Label with optional mobile override indicator */}
      <div className="flex items-center gap-1.5 w-10 shrink-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <MobileOverrideIndicator
          hasOverride={hasMobileOverride ?? false}
          onReset={onResetMobileOverride}
        />
      </div>

      {/* Link/Unlink button */}
      <button
        type="button"
        onClick={() => setIsLinked(!isLinked)}
        className={cn(
          'p-1.5 rounded transition-colors shrink-0',
          isLinked
            ? 'text-primary bg-primary/10 hover:bg-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        )}
        title={isLinked ? 'Unlink dimensions' : 'Link dimensions'}
      >
        {isLinked ? (
          <Link2 className="h-3.5 w-3.5" />
        ) : (
          <Unlink2 className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Width input */}
      <div className="flex-1 flex items-center gap-1 bg-muted rounded-md px-2">
        <span className="text-xs text-muted-foreground">W</span>
        <Input
          type="number"
          value={Math.round(width)}
          onChange={(e) => handleWidthChange(Number(e.target.value))}
          disabled={widthDisabled}
          className="h-7 bg-transparent! border-none text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Height input */}
      <div className="flex-1 flex items-center gap-1 bg-muted rounded-md px-2">
        <span className="text-xs text-muted-foreground">H</span>
        <Input
          type="number"
          value={Math.round(height)}
          onChange={(e) => handleHeightChange(Number(e.target.value))}
          disabled={heightDisabled}
          className="h-7 bg-transparent! border-none text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </div>
  )
}
