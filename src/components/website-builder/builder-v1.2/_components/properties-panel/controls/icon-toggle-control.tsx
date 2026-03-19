/**
 * ========================================
 * ICON TOGGLE CONTROL - Properties Panel
 * ========================================
 *
 * Toggle buttons with icons for visual selection.
 * Used for Direction, Justify, Align controls in Layout section.
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 */

'use client'

import { cn } from '@/lib/utils'
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { MobileOverrideIndicator } from './mobile-override-indicator'

interface IconOption {
  value: string
  icon: React.ReactNode
  title: string
}

interface IconToggleControlProps {
  /** Label text displayed on the left */
  label: string
  /** Currently selected value */
  value: string
  /** Available options with icons */
  options: IconOption[]
  /** Change handler */
  onChange: (value: string) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

export function IconToggleControl({
  label,
  value,
  options,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: IconToggleControlProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Label with optional mobile override indicator */}
      <div className="flex items-center gap-1.5 w-16 shrink-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <MobileOverrideIndicator
          hasOverride={hasMobileOverride ?? false}
          onReset={onResetMobileOverride}
        />
      </div>

      {/* Icon buttons - aligned to the right */}
      <div className="flex-1 flex items-center justify-end gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={option.title}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-md transition-colors',
              value === option.value
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
            )}
          >
            {option.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// LAYOUT ICONS - SVG icons for Direction, Justify, and Align controls
// ============================================================================

/**
 * Direction Icons - Horizontal and Vertical flex direction
 */
export const DirectionIcons = {
  horizontal: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Three horizontal bars representing horizontal layout */}
      <rect x="1" y="4" width="4" height="8" rx="1" fill="currentColor" />
      <rect x="6" y="4" width="4" height="8" rx="1" fill="currentColor" />
      <rect x="11" y="4" width="4" height="8" rx="1" fill="currentColor" />
    </svg>
  ),
  vertical: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Three vertical bars representing vertical layout */}
      <rect x="4" y="1" width="8" height="4" rx="1" fill="currentColor" />
      <rect x="4" y="6" width="8" height="4" rx="1" fill="currentColor" />
      <rect x="4" y="11" width="8" height="4" rx="1" fill="currentColor" />
    </svg>
  ),
}

/**
 * Justify Icons - Visual representation of justify-content values
 */
export const JustifyIcons = {
  start: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Items aligned to start */}
      <rect x="1" y="1" width="1" height="14" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="3" y="4" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="7" y="4" width="3" height="8" rx="1" fill="currentColor" />
    </svg>
  ),
  center: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Items centered */}
      <rect x="3" y="4" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="10" y="4" width="3" height="8" rx="1" fill="currentColor" />
    </svg>
  ),
  end: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Items aligned to end */}
      <rect x="14" y="1" width="1" height="14" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="6" y="4" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="10" y="4" width="3" height="8" rx="1" fill="currentColor" />
    </svg>
  ),
  between: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Items with space between */}
      <rect x="1" y="4" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="12" y="4" width="3" height="8" rx="1" fill="currentColor" />
    </svg>
  ),
  evenly: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Items with space evenly */}
      <rect x="2" y="4" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="6.5" y="4" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="11" y="4" width="3" height="8" rx="1" fill="currentColor" />
    </svg>
  ),
}

/**
 * Align Icons - Using lucide-react text alignment icons
 * Maps to align-items CSS values for flexbox alignment
 */
export const AlignIcons = {
  start: <AlignLeft className="w-4 h-4" />,
  center: <AlignCenter className="w-4 h-4" />,
  end: <AlignRight className="w-4 h-4" />,
}
