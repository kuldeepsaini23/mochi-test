'use client'

/**
 * Country Select Component - SOURCE OF TRUTH
 *
 * This is the ONE component for country selection used everywhere:
 * - Lead sheet (uses default shadcn styling)
 * - Form builder (passes formStyles for inline style overrides)
 *
 * Stores ISO 3166-1 alpha-2 country codes (e.g., 'US', 'GB').
 * Features searchable dropdown grouped by continent.
 */

import { Fragment, useId, useState } from 'react'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { countries, getCountryByCode } from '@/constants/countries'

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

interface CountrySelectProps {
  value: string
  onValueChange: (value: string) => void
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

export function CountrySelect({
  value,
  onValueChange,
  id,
  label,
  error,
  placeholder = 'Select country',
  disabled = false,
  formStyles,
}: CountrySelectProps) {
  const generatedId = useId()
  const inputId = id || generatedId
  const [open, setOpen] = useState<boolean>(false)

  const selectedCountry = value ? getCountryByCode(value) : null

  // Build inline styles when formStyles is provided (for form builder)
  const triggerStyle: React.CSSProperties | undefined = formStyles
    ? {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: formStyles.inputBackgroundColor,
        border: `${formStyles.inputBorderWidth || '1px'} solid ${formStyles.inputBorderColor}`,
        borderRadius: formStyles.inputBorderRadius,
        padding: formStyles.inputPadding,
        fontSize: formStyles.inputFontSize,
        color: selectedCountry ? formStyles.inputTextColor : formStyles.inputPlaceholderColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.85 : 1,
        fontWeight: 'normal',
      }
    : undefined

  return (
    <div className={formStyles ? '' : 'space-y-2'}>
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <Popover open={disabled ? false : open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {formStyles ? (
            // Form builder mode: use button with inline styles
            <button
              type="button"
              id={inputId}
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              style={triggerStyle}
            >
              {selectedCountry ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>
                    {selectedCountry.flag}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedCountry.name}
                  </span>
                </span>
              ) : (
                <span style={{ color: formStyles.inputPlaceholderColor }}>{placeholder}</span>
              )}
              <ChevronDownIcon
                size={16}
                style={{ flexShrink: 0, color: formStyles.inputPlaceholderColor }}
                aria-hidden="true"
              />
            </button>
          ) : (
            // Lead sheet mode: use shadcn Button with Tailwind classes
            <Button
              id={inputId}
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="w-full justify-between border-input bg-background px-3 font-normal outline-offset-0 outline-none hover:bg-background focus-visible:outline-[3px]"
            >
              {selectedCountry ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-lg leading-none">
                    {selectedCountry.flag}
                  </span>
                  <span className="truncate">
                    {selectedCountry.name}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
              <ChevronDownIcon
                size={16}
                className="shrink-0 text-muted-foreground/80"
                aria-hidden="true"
              />
            </Button>
          )}
        </PopoverTrigger>
        {/*
         * z-[10001] ensures the dropdown appears above the website builder PreviewOverlay (z-[9999]).
         * Without this, the popover renders behind the overlay since default is z-50.
         */}
        <PopoverContent
          className="w-full min-w-[var(--radix-popper-anchor-width)] border-input p-0 z-[10001]"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search country..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              {countries.map((group) => (
                <Fragment key={group.continent}>
                  <CommandGroup heading={group.continent}>
                    {group.items.map((country) => (
                      <CommandItem
                        key={country.code}
                        value={country.name}
                        onSelect={() => {
                          onValueChange(country.code)
                          setOpen(false)
                        }}
                      >
                        <span className="text-lg leading-none">
                          {country.flag}
                        </span>{' '}
                        {country.name}
                        {value === country.code && (
                          <CheckIcon size={16} className="ml-auto" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Fragment>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
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
