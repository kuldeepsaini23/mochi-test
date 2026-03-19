/**
 * ========================================
 * BUTTON GROUP CONTROL - Properties Panel
 * ========================================
 *
 * Grid cols-3 layout: Label left, Button group right.
 * For toggling between options (e.g., Auto/Fill, Stack/Grid).
 */

'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ButtonOption {
  value: string
  label: string
}

interface ButtonGroupControlProps {
  /** Label text displayed on the left */
  label: string
  /** Currently selected value */
  value: string
  /** Available options */
  options: ButtonOption[]
  /** Change handler */
  onChange: (value: string) => void
  /** Number of columns for buttons */
  columns?: 2 | 3 | 4
}

export function ButtonGroupControl({
  label,
  value,
  options,
  onChange,
  columns = 2,
}: ButtonGroupControlProps) {
  const gridClass =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-3'
        : 'grid-cols-4'

  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      {/* Label */}
      <div className="col-span-1">
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>

      {/* Button group */}
      <div className={cn('col-span-2 grid gap-1', gridClass)}>
        {options.map((option) => (
          <Button
            key={option.value}
            onClick={() => onChange(option.value)}
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 text-xs font-medium',
              value === option.value
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted hover:bg-muted/80'
            )}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
