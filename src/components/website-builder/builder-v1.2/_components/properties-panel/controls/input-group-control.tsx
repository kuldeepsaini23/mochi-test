/**
 * ========================================
 * INPUT GROUP CONTROL - Properties Panel
 * ========================================
 *
 * Grid cols-3 layout: Label left, Input+icon+unit right.
 * Consistent with design system.
 *
 * When `hasMobileOverride` is true, shows a blue indicator that
 * expands to a reset button on hover (via MobileOverrideIndicator).
 */

'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LucideIcon } from 'lucide-react'
import { MobileOverrideIndicator } from './mobile-override-indicator'

interface InputGroupControlProps {
  /** Label text displayed on the left */
  label: string
  /** Current value */
  value: number | string
  /** Change handler */
  onChange: (value: number | string) => void
  /** Unit suffix (e.g., "px", "%") */
  unit?: string
  /** Available units for dropdown */
  units?: string[]
  /** Handler when unit changes */
  onUnitChange?: (unit: string) => void
  /** Optional icon component */
  icon?: LucideIcon
  /** Input type */
  type?: 'number' | 'text'
  /** Minimum value for number inputs - can be negative for properties like margin, letter-spacing */
  min?: number
  /** Maximum value for number inputs */
  max?: number
  /** Disabled state */
  disabled?: boolean
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

export function InputGroupControl({
  label,
  value,
  onChange,
  unit,
  units,
  onUnitChange,
  icon: Icon,
  type = 'number',
  min,
  max,
  disabled,
  hasMobileOverride,
  onResetMobileOverride,
}: InputGroupControlProps) {
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

      {/* Input + Icon + Unit */}
      <div className="col-span-2 flex items-center gap-1">
        {/* Optional icon */}
        {Icon && (
          <div className="h-7 w-7 flex items-center justify-center bg-muted rounded shrink-0">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}

        {/* Input field */}
        <Input
          type={type}
          value={value}
          onChange={(e) => {
            if (type === 'number') {
              const numValue = Number(e.target.value)
              // Skip NaN values (happens when typing "-" alone) to allow smooth negative number entry
              if (!isNaN(numValue)) {
                onChange(numValue)
              }
            } else {
              onChange(e.target.value)
            }
          }}
          disabled={disabled}
          min={min}
          max={max}
          className="flex-1 h-7 bg-muted border-none text-sm px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />

        {/* Unit dropdown or static text */}
        {units && onUnitChange ? (
          <Select value={unit} onValueChange={onUnitChange}>
            <SelectTrigger className="w-14 h-7 bg-muted border-none text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u} value={u} className="text-sm">
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : unit ? (
          <span className="text-xs text-muted-foreground w-6 text-center shrink-0">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  )
}
