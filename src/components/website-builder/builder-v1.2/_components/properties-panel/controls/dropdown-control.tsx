/**
 * ========================================
 * DROPDOWN CONTROL - Properties Panel
 * ========================================
 *
 * Grid cols-3 layout: Label left, Select dropdown right.
 * For selecting from a list of options.
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 */

'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MobileOverrideIndicator } from './mobile-override-indicator'

interface DropdownOption {
  value: string
  label: string
}

interface DropdownControlProps {
  /** Label text displayed on the left */
  label: string
  /** Currently selected value */
  value: string
  /** Available options */
  options: DropdownOption[]
  /** Change handler */
  onChange: (value: string) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

export function DropdownControl({
  label,
  value,
  options,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: DropdownControlProps) {
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

      {/* Select Dropdown */}
      <div className="col-span-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-7 bg-muted border-none text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-sm">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
