/**
 * Price Input Component
 *
 * WHY: Consistent currency input across the application
 * HOW: Input with currency symbol prefix, formats to cents internally
 *
 * USAGE:
 * <PriceInput
 *   value={amountInCents}
 *   onChange={(cents) => setAmount(cents)}
 *   currency="usd"
 * />
 */

'use client'

import { forwardRef, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getCurrencySymbol } from '@/constants/currencies'

interface PriceInputProps {
  value?: number // Amount in cents
  onChange?: (valueInCents: number) => void
  currency?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}

export const PriceInput = forwardRef<HTMLInputElement, PriceInputProps>(
  (
    {
      value,
      onChange,
      currency = 'usd',
      placeholder = '0.00',
      disabled = false,
      className,
      id,
    },
    ref
  ) => {
    // Display value as dollars (from cents)
    const [displayValue, setDisplayValue] = useState(() => {
      if (value === undefined || value === 0) return ''
      return (value / 100).toFixed(2)
    })

    // Sync display value when external value changes
    useEffect(() => {
      if (value === undefined || value === 0) {
        setDisplayValue('')
      } else {
        const formatted = (value / 100).toFixed(2)
        // Only update if different to avoid cursor jumping
        if (parseFloat(displayValue || '0') !== value / 100) {
          setDisplayValue(formatted)
        }
      }
    }, [value])

    const currencySymbol = getCurrencySymbol(currency)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value

      // Allow empty input
      if (input === '') {
        setDisplayValue('')
        onChange?.(0)
        return
      }

      // Only allow numbers and one decimal point
      const sanitized = input.replace(/[^0-9.]/g, '')

      // Prevent multiple decimal points
      const parts = sanitized.split('.')
      let formatted = parts[0]
      if (parts.length > 1) {
        // Limit to 2 decimal places
        formatted += '.' + parts[1].slice(0, 2)
      }

      setDisplayValue(formatted)

      // Convert to cents
      const dollars = parseFloat(formatted) || 0
      const cents = Math.round(dollars * 100)
      onChange?.(cents)
    }

    const handleBlur = () => {
      // Format on blur to ensure proper decimal places
      if (displayValue && displayValue !== '') {
        const dollars = parseFloat(displayValue) || 0
        setDisplayValue(dollars.toFixed(2))
      }
    }

    return (
      <div className={cn('relative', className)}>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
          {currencySymbol}
        </span>
        <Input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-7"
        />
      </div>
    )
  }
)

PriceInput.displayName = 'PriceInput'
