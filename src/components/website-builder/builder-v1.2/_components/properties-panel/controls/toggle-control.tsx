/**
 * ========================================
 * TOGGLE CONTROL - Properties Panel
 * ========================================
 *
 * Grid cols-3 layout: Label left, Switch right.
 * For boolean properties like visible, locked, etc.
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 */

'use client'

import { Switch } from '@/components/ui/switch'
import { MobileOverrideIndicator } from './mobile-override-indicator'

interface ToggleControlProps {
  /** Label text displayed on the left */
  label: string
  /** Current checked state */
  checked: boolean
  /** Change handler */
  onChange: (checked: boolean) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

export function ToggleControl({
  label,
  checked,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: ToggleControlProps) {
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

      {/* Switch */}
      <div className="col-span-2">
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  )
}
