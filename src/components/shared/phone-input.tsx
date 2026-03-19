'use client'

/**
 * Phone Number Input Component - SOURCE OF TRUTH
 *
 * This is the ONE component for phone input used everywhere:
 * - Lead sheet (uses default shadcn styling)
 * - Form builder (passes formStyles for inline style overrides)
 *
 * Stores phone numbers in E.164 format (e.g., +14155551234).
 * Features international country code selector with flags.
 */

import React from 'react'
import { ChevronDownIcon, PhoneIcon } from 'lucide-react'
import * as RPNInput from 'react-phone-number-input'
import flags from 'react-phone-number-input/flags'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Form builder styles interface - matches FormStyles from form builder types.
 * Optional - when provided, overrides default shadcn styling with inline styles.
 */
interface FormBuilderStyles {
  inputBackgroundColor?: string
  inputBorderColor?: string
  inputBorderWidth?: string
  inputBorderRadius?: string
  inputPadding?: string
  inputFontSize?: string
  inputTextColor?: string
  inputPlaceholderColor?: string
  inputFocusBorderColor?: string
  errorColor?: string
}

interface PhoneNumberInputProps {
  value: string
  onChange: (value: string) => void
  id?: string
  label?: string
  error?: string
  placeholder?: string
  disabled?: boolean
  /**
   * Optional form builder styles for inline style overrides.
   * When provided, applies inline styles instead of default Tailwind classes.
   */
  formStyles?: FormBuilderStyles
}

/**
 * Ensure phone number is in E.164 format (starts with +).
 * E.164 is the international standard for phone number storage.
 */
function toE164(phone: string): string {
  if (!phone) return ''
  if (phone.startsWith('+')) return phone
  return `+${phone}`
}

export function PhoneNumberInput({
  value,
  onChange,
  id,
  label,
  error,
  placeholder = 'Enter phone number',
  disabled = false,
  formStyles,
}: PhoneNumberInputProps) {
  const e164Value = toE164(value)

  return (
    <div className={formStyles ? '' : 'space-y-2'}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <RPNInput.default
        className={formStyles ? '' : 'flex rounded-md shadow-xs'}
        style={formStyles ? { display: 'flex' } : undefined}
        international
        flagComponent={(props) => (
          <FlagComponent {...props} formStyles={formStyles} />
        )}
        countrySelectComponent={(props) => (
          <CountrySelectDropdown {...props} formStyles={formStyles} disabled={disabled} />
        )}
        inputComponent={(props) => (
          <PhoneInputComponent {...props} formStyles={formStyles} disabled={disabled} />
        )}
        id={id}
        placeholder={placeholder}
        value={e164Value || undefined}
        onChange={(newValue) => onChange(newValue ?? '')}
        disabled={disabled}
      />
      {error && (
        <p
          className={formStyles ? '' : 'text-sm text-destructive'}
          style={formStyles ? { color: formStyles.errorColor, fontSize: '14px', marginTop: '4px' } : undefined}
        >
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Phone input text field component.
 * Uses shadcn Input by default, or inline styles when formStyles is provided.
 */
const PhoneInputComponent = ({
  className,
  formStyles,
  disabled,
  ...props
}: React.ComponentProps<'input'> & { formStyles?: FormBuilderStyles; disabled?: boolean }) => {
  if (formStyles) {
    // Form builder mode: use native input with inline styles
    return (
      <input
        data-slot="phone-input"
        disabled={disabled}
        style={{
          flex: 1,
          backgroundColor: formStyles.inputBackgroundColor,
          border: `${formStyles.inputBorderWidth || '1px'} solid ${formStyles.inputBorderColor}`,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: formStyles.inputBorderRadius,
          borderBottomRightRadius: formStyles.inputBorderRadius,
          padding: formStyles.inputPadding,
          fontSize: formStyles.inputFontSize,
          color: formStyles.inputTextColor,
          marginLeft: '-1px',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.85 : 1,
        }}
        {...props}
      />
    )
  }

  // Lead sheet mode: use shadcn Input
  return (
    <Input
      data-slot="phone-input"
      className={cn(
        '-ms-px rounded-s-none shadow-none focus-visible:z-10',
        className
      )}
      disabled={disabled}
      {...props}
    />
  )
}

PhoneInputComponent.displayName = 'PhoneInput'

type CountrySelectDropdownProps = {
  disabled?: boolean
  value: RPNInput.Country
  onChange: (value: RPNInput.Country) => void
  options: { label: string; value: RPNInput.Country | undefined }[]
  formStyles?: FormBuilderStyles
}

/**
 * Country code selector dropdown for phone input.
 * Uses shadcn styling by default, or inline styles when formStyles is provided.
 */
const CountrySelectDropdown = ({
  disabled,
  value,
  onChange,
  options,
  formStyles,
}: CountrySelectDropdownProps) => {
  const handleSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as RPNInput.Country)
  }

  if (formStyles) {
    // Form builder mode: use inline styles
    return (
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          alignSelf: 'stretch',
          backgroundColor: formStyles.inputBackgroundColor,
          border: `${formStyles.inputBorderWidth || '1px'} solid ${formStyles.inputBorderColor}`,
          borderTopLeftRadius: formStyles.inputBorderRadius,
          borderBottomLeftRadius: formStyles.inputBorderRadius,
          borderRight: 'none',
          padding: '0 8px 0 12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.85 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <FlagComponent country={value} countryName={value} formStyles={formStyles} />
          <span style={{ color: formStyles.inputPlaceholderColor, fontSize: '12px' }}>
            <ChevronDownIcon size={14} />
          </span>
        </div>
        <select
          disabled={disabled}
          value={value || ''}
          onChange={handleSelect}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          aria-label="Select country"
        >
          <option value="">Select a country</option>
          {options
            .filter((x) => x.value)
            .map((option, i) => (
              <option key={option.value ?? `empty-${i}`} value={option.value}>
                {option.label} {option.value && `+${RPNInput.getCountryCallingCode(option.value)}`}
              </option>
            ))}
        </select>
      </div>
    )
  }

  // Lead sheet mode: use Tailwind classes
  return (
    <div className="relative inline-flex items-center self-stretch rounded-s-md border border-input bg-background py-2 ps-3 pe-2 text-muted-foreground transition-[color,box-shadow] outline-none focus-within:z-10 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent hover:text-foreground has-disabled:pointer-events-none has-disabled:opacity-50 has-aria-invalid:border-destructive/60 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40">
      <div
        className="inline-flex items-center gap-1"
        aria-hidden="true"
      >
        <FlagComponent
          country={value}
          countryName={value}
          aria-hidden="true"
        />
        <span className="text-muted-foreground/80">
          <ChevronDownIcon
            size={16}
            aria-hidden="true"
          />
        </span>
      </div>
      <select
        disabled={disabled}
        value={value}
        onChange={handleSelect}
        className="absolute inset-0 text-sm opacity-0"
        aria-label="Select country"
      >
        <option
          key="default"
          value=""
        >
          Select a country
        </option>
        {options
          .filter((x) => x.value)
          .map((option, i) => (
            <option
              key={option.value ?? `empty-${i}`}
              value={option.value}
            >
              {option.label}{' '}
              {option.value &&
                `+${RPNInput.getCountryCallingCode(option.value)}`}
            </option>
          ))}
      </select>
    </div>
  )
}

/**
 * Flag component for displaying country flags.
 */
const FlagComponent = ({
  country,
  countryName,
  formStyles,
}: RPNInput.FlagProps & { formStyles?: FormBuilderStyles }) => {
  const Flag = country ? flags[country] : null

  if (formStyles) {
    // Form builder mode
    return (
      <span
        style={{
          width: '20px',
          overflow: 'hidden',
          borderRadius: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Flag ? (
          <Flag title={countryName} />
        ) : (
          <PhoneIcon size={16} style={{ color: formStyles.inputPlaceholderColor }} />
        )}
      </span>
    )
  }

  // Lead sheet mode
  return (
    <span className="w-5 overflow-hidden rounded-sm">
      {Flag ? (
        <Flag title={countryName} />
      ) : (
        <PhoneIcon
          size={16}
          aria-hidden="true"
        />
      )}
    </span>
  )
}

// Export the country from phone number for use elsewhere
export { parsePhoneNumber, getCountryCallingCode } from 'react-phone-number-input'
export type { Country as PhoneCountry } from 'react-phone-number-input'
