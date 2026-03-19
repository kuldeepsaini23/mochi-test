/**
 * ============================================================================
 * WAIT DELAY ACTION CONFIG
 * ============================================================================
 *
 * Configuration form for the "Wait/Delay" action.
 * Allows specifying how long to pause the automation.
 *
 * SOURCE OF TRUTH: WaitDelayActionConfig
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
import type { WaitDelayActionConfig as WaitDelayConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Available time units for delay */
const TIME_UNITS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
] as const

// ============================================================================
// TYPES
// ============================================================================

interface ActionWaitDelayConfigProps {
  config: WaitDelayConfig
  onChange: (config: WaitDelayConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionWaitDelayConfig({
  config,
  onChange,
  errors,
}: ActionWaitDelayConfigProps) {
  /** Handle delay amount change */
  const handleAmountChange = (value: string) => {
    const amount = parseInt(value, 10)
    if (!isNaN(amount) && amount >= 0) {
      onChange({ ...config, delayAmount: amount })
    }
  }

  /** Handle delay unit change */
  const handleUnitChange = (unit: string) => {
    onChange({ ...config, delayUnit: unit as WaitDelayConfig['delayUnit'] })
  }

  return (
    <div className="space-y-4">
      {/* Duration — inline row with amount + unit */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Duration</span>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            value={config.delayAmount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="h-9 w-24 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
          />
          <Select value={config.delayUnit} onValueChange={handleUnitChange}>
            <SelectTrigger className="h-9 flex-1 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_UNITS.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(errors?.delayAmount || errors?.delayUnit) && (
          <p className="text-xs text-destructive">
            {errors?.delayAmount ?? errors?.delayUnit}
          </p>
        )}
      </div>
    </div>
  )
}
