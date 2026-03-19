/**
 * ============================================================================
 * FORM RENDERER - SINGLE SOURCE OF TRUTH
 * ============================================================================
 *
 * This is the ONE AND ONLY component for rendering forms everywhere.
 * Uses shadcn Form pattern for validation + native HTML elements for styles.
 *
 * VALIDATION PATTERN (shadcn):
 * - Form, FormField, FormItem, FormControl, FormMessage
 * - React Hook Form + Zod for validation
 * - FormMessage automatically displays errors
 *
 * STYLING PATTERN (native HTML):
 * - Native HTML elements (input, textarea, select) inside FormControl
 * - All styles are inline from the form schema
 * - No Tailwind classes that would override our custom styles
 *
 * USAGE:
 * - Form builder edit mode (disabled inputs)
 * - Form builder preview mode
 * - Public form page
 * - Embedded forms (iframe, Webflow, etc.)
 */

'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Star, Upload, CalendarIcon, Clock, Check } from 'lucide-react'
import { format } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { trpc } from '@/trpc/react-provider'
import type { FormSchema, FormElement, FormStyles } from './_lib/types'

// Shared components - SOURCE OF TRUTH for phone and country inputs
// These are the SAME components used in lead sheet, ensuring data format consistency
import { PhoneNumberInput } from '@/components/shared/phone-input'
import { CountrySelect } from '@/components/shared/country-select'
// Country helper for ElementDisplay preview mode
import { getCountryByCode } from '@/constants/countries'

// Lead session hook for sticky forms (prefilling, identification)
// SOURCE OF TRUTH KEYWORDS: LeadSession, StickyForm, FormPrefill
import { useLeadSession } from '@/hooks/use-lead-session'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'

// ============================================================================
// TYPES
// ============================================================================

export interface FormRendererProps {
  schema: FormSchema
  /**
   * The form ID - required for submission.
   * Without this, the form cannot submit (used in disabled/preview modes).
   */
  formId?: string
  /**
   * Organization ID - required for lead session (sticky forms).
   * When provided, enables:
   * - Auto-prefilling form fields for returning visitors
   * - Lead identification on form submission
   * SOURCE OF TRUTH KEYWORDS: LeadSession, StickyForm
   */
  organizationId?: string
  /**
   * Optional callback fired after successful submission.
   * The form handles submission internally via tRPC - this is for additional custom behavior.
   */
  onSubmitSuccess?: (data: Record<string, unknown>) => void
  showCanvas?: boolean
  className?: string
  /** External loading state override */
  isLoading?: boolean
  /** If true, inputs are disabled (for edit mode in builder) */
  disabled?: boolean

  // ========================================================================
  // WEBSITE BUILDER REDIRECT OVERRIDES
  // SOURCE OF TRUTH: PostSubmissionRedirect override from FormElement
  // ========================================================================
  // These props are passed from the website builder's form element renderer.
  // When set, they take priority over the form schema's own redirectUrl.

  /** When TRUE, redirect the user after successful form submission */
  successRedirectEnabled?: boolean
  /** 'page' = website page by slug, 'url' = custom external URL */
  successRedirectType?: 'page' | 'url'
  /** The slug of the target page within the website */
  successRedirectPageSlug?: string
  /** A custom external URL to redirect to */
  successRedirectUrl?: string
  /** Whether to open the custom URL in a new tab (only for 'url' type) */
  successRedirectNewTab?: boolean
}

// ============================================================================
// ZOD SCHEMA BUILDER
// ============================================================================

function buildZodSchema(elements: FormElement[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const element of elements) {
    if (['heading', 'paragraph', 'divider', 'spacer', 'submit', 'hidden'].includes(element.type)) {
      continue
    }
    shape[element.name] = buildFieldSchema(element)
  }

  return z.object(shape)
}

function buildFieldSchema(element: FormElement): z.ZodTypeAny {
  let schema: z.ZodTypeAny

  switch (element.type) {
    case 'email':
      schema = element.required
        ? z.string().min(1, { message: `${element.label} is required` }).email({ message: 'Please enter a valid email address' })
        : z.string().email({ message: 'Please enter a valid email address' }).optional().or(z.literal(''))
      break
    case 'url':
      schema = element.required
        ? z.string().min(1, { message: `${element.label} is required` }).url({ message: 'Please enter a valid URL' })
        : z.string().url({ message: 'Please enter a valid URL' }).optional().or(z.literal(''))
      break
    case 'number':
    case 'slider':
    case 'rating':
      schema = element.required
        ? z.coerce.number({ message: `${element.label} must be a number` })
        : z.coerce.number().optional()
      break
    case 'checkbox':
      schema = element.required
        ? z.boolean().refine((val) => val === true, { message: `${element.label} must be checked` })
        : z.boolean().optional()
      break
    case 'checkboxGroup':
    case 'multiselect':
      schema = element.required
        ? z.array(z.string()).min(1, { message: 'Please select at least one option' })
        : z.array(z.string()).optional()
      break
    case 'select':
    case 'radio':
      schema = element.required
        ? z.string().min(1, { message: `${element.label} is required` })
        : z.string().optional()
      break
    default:
      schema = element.required
        ? z.string().min(1, { message: `${element.label} is required` })
        : z.string().optional()
      break
  }

  // Apply additional validation rules
  for (const rule of element.validation) {
    if (!rule.enabled) continue
    const message = rule.message || `${element.label} is invalid`

    if (schema instanceof z.ZodString) {
      switch (rule.type) {
        case 'minLength':
          schema = schema.min(Number(rule.value) || 0, { message })
          break
        case 'maxLength':
          schema = schema.max(Number(rule.value) || 255, { message })
          break
        case 'pattern':
          if (typeof rule.value === 'string') {
            /** Guard against ReDoS: reject overly long regex patterns */
            if (rule.value.length > 500) break
            try { schema = schema.regex(new RegExp(rule.value), { message }) } catch {}
          }
          break
      }
    }
    if (schema instanceof z.ZodNumber) {
      switch (rule.type) {
        case 'min':
          schema = schema.min(Number(rule.value) || 0, { message })
          break
        case 'max':
          schema = schema.max(Number(rule.value) || 999999, { message })
          break
      }
    }
  }

  return schema
}

function getDefaultValues(elements: FormElement[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const element of elements) {
    if (['heading', 'paragraph', 'divider', 'spacer', 'submit'].includes(element.type)) continue
    if (element.defaultValue !== undefined) {
      values[element.name] = element.defaultValue
    } else {
      switch (element.type) {
        case 'checkbox': values[element.name] = false; break
        case 'checkboxGroup':
        case 'multiselect': values[element.name] = []; break
        case 'number':
        case 'slider':
        case 'rating': values[element.name] = undefined; break
        default: values[element.name] = ''
      }
    }
  }
  return values
}

// ============================================================================
// STYLE HELPERS - All inline styles from form schema
// ============================================================================

function getLabelStyles(styles: FormStyles): React.CSSProperties {
  return {
    color: styles.labelColor,
    fontSize: styles.labelFontSize,
    fontWeight: styles.labelFontWeight,
    marginBottom: styles.labelMarginBottom,
    display: 'block',
  }
}

function getInputStyles(styles: FormStyles, disabled: boolean, hasError?: boolean): React.CSSProperties {
  return {
    backgroundColor: styles.inputBackgroundColor,
    border: `${styles.inputBorderWidth} solid ${hasError ? styles.errorColor : styles.inputBorderColor}`,
    borderRadius: styles.inputBorderRadius,
    padding: styles.inputPadding,
    fontSize: styles.inputFontSize,
    color: styles.inputTextColor,
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    cursor: disabled ? 'not-allowed' : 'text',
    opacity: disabled ? 0.85 : 1,
    boxSizing: 'border-box' as const,
  }
}

function getHelpTextStyles(styles: FormStyles): React.CSSProperties {
  return {
    color: styles.helpTextColor,
    fontSize: styles.helpTextFontSize,
    marginTop: '4px',
  }
}

function getErrorStyles(styles: FormStyles): React.CSSProperties {
  return {
    color: styles.errorColor,
    fontSize: styles.errorFontSize || '14px',
    marginTop: '4px',
  }
}

function getButtonStyles(styles: FormStyles, disabled: boolean): React.CSSProperties {
  return {
    backgroundColor: styles.buttonBackgroundColor,
    color: styles.buttonTextColor,
    borderRadius: styles.buttonBorderRadius,
    padding: styles.buttonPadding,
    fontSize: styles.buttonFontSize,
    fontWeight: styles.buttonFontWeight,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    transition: 'background-color 0.2s',
  }
}



// ============================================================================
// OPTION VALUE → LABEL RESOLVER
// ============================================================================

/**
 * Resolves internal option values (e.g. "option_1") to their human-readable labels
 * (e.g. "THis?") before submission data is stored.
 *
 * Only transforms option-based elements: select, multiselect, radio, checkboxGroup.
 * All other element types pass through unchanged.
 *
 * SOURCE OF TRUTH KEYWORDS: ResolveOptionLabels, SubmissionValueResolver
 */
const OPTION_BASED_TYPES = new Set(['select', 'multiselect', 'radio', 'checkboxGroup'])

function resolveOptionValuesToLabels(
  data: Record<string, unknown>,
  elements: FormElement[]
): Record<string, unknown> {
  // Build a lookup: elementName → Map<optionValue, optionLabel>
  const optionLookups = new Map<string, Map<string, string>>()
  for (const element of elements) {
    if (OPTION_BASED_TYPES.has(element.type) && element.options) {
      const valueToLabel = new Map<string, string>()
      for (const opt of element.options) {
        valueToLabel.set(opt.value, opt.label)
      }
      optionLookups.set(element.name, valueToLabel)
    }
  }

  // Transform the submitted data
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const lookup = optionLookups.get(key)
    if (!lookup) {
      // Not an option-based field — keep as-is
      resolved[key] = value
      continue
    }

    if (Array.isArray(value)) {
      // multiselect / checkboxGroup — resolve each value in the array
      resolved[key] = value.map((v) =>
        typeof v === 'string' ? (lookup.get(v) ?? v) : v
      )
    } else if (typeof value === 'string') {
      // select / radio — resolve the single value
      resolved[key] = lookup.get(value) ?? value
    } else {
      resolved[key] = value
    }
  }

  return resolved
}

// ============================================================================
// FIELD RENDERERS - shadcn Form pattern + native HTML elements
// ============================================================================

interface FieldProps {
  element: FormElement
  styles: FormStyles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any
  disabled: boolean
  /** Whether this field is loading lead session data (shows shimmer animation) */
  isLoadingLeadField?: boolean
}

/**
 * Text Input Field - Uses native <input> with inline styles
 * Supports browser autofill via the autocomplete attribute from element.props.
 * Shows shimmer animation when loading lead session data.
 */
function TextInputField({ element, styles, form, disabled, isLoadingLeadField }: FieldProps) {
  // Determine input type based on element type
  const inputType = element.type === 'phone' ? 'tel' :
                    element.type === 'password' ? 'password' :
                    element.type === 'number' ? 'number' : 'text'

  // Get autocomplete attribute from element props for browser autofill support
  // This enables the browser to suggest/fill saved user data automatically
  const autocomplete = element.props.autocomplete as string | undefined

  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <div style={{ position: 'relative' }}>
              <input
                type={inputType}
                placeholder={isLoadingLeadField ? 'Loading...' : element.placeholder}
                disabled={disabled || isLoadingLeadField}
                autoComplete={autocomplete}
                style={getInputStyles(styles, disabled || !!isLoadingLeadField, !!fieldState.error)}
                {...field}
              />
              {/* Shimmer overlay when loading lead session data */}
              {isLoadingLeadField && (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: styles.inputBorderRadius,
                      background: `linear-gradient(90deg, transparent 0%, ${styles.inputBorderColor}30 50%, transparent 100%)`,
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s infinite',
                      pointerEvents: 'none',
                    }}
                  />
                  <style>{`
                    @keyframes shimmer {
                      0% { background-position: 200% 0; }
                      100% { background-position: -200% 0; }
                    }
                  `}</style>
                </>
              )}
            </div>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Phone Input Field - Uses shared PhoneNumberInput component
 *
 * SOURCE OF TRUTH: Uses the SAME PhoneNumberInput component as the lead sheet,
 * ensuring phone numbers are stored in E.164 format (e.g., +14155551234).
 * Passes formStyles prop to apply form builder styling while maintaining
 * consistent functionality and data format.
 * Shows shimmer animation when loading lead session data.
 */
function PhoneInputField({ element, styles, form, disabled, isLoadingLeadField }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <div style={{ position: 'relative' }}>
              {/* Show shimmer overlay when loading lead session data */}
              {isLoadingLeadField && (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: styles.inputBorderRadius,
                      background: `linear-gradient(90deg, ${styles.inputBackgroundColor} 0%, ${styles.inputBorderColor}40 50%, ${styles.inputBackgroundColor} 100%)`,
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s infinite',
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  />
                  <style>{`
                    @keyframes shimmer {
                      0% { background-position: 200% 0; }
                      100% { background-position: -200% 0; }
                    }
                  `}</style>
                </>
              )}
              {/* Shared phone input component - same as lead sheet with form builder styles */}
              <PhoneNumberInput
                value={field.value || ''}
                onChange={field.onChange}
                disabled={disabled || isLoadingLeadField}
                placeholder={isLoadingLeadField ? 'Loading...' : element.placeholder}
                error={fieldState.error?.message}
                formStyles={{
                  inputBackgroundColor: styles.inputBackgroundColor,
                  inputBorderColor: styles.inputBorderColor,
                  inputBorderWidth: styles.inputBorderWidth,
                  inputBorderRadius: styles.inputBorderRadius,
                  inputPadding: styles.inputPadding,
                  inputFontSize: styles.inputFontSize,
                  inputTextColor: styles.inputTextColor,
                  inputPlaceholderColor: styles.inputPlaceholderColor,
                  errorColor: styles.errorColor,
                }}
              />
            </div>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Country Select Field - Uses shared CountrySelect component
 *
 * SOURCE OF TRUTH: Uses the SAME CountrySelect component as the lead sheet,
 * ensuring country codes are stored in ISO 3166-1 alpha-2 format (e.g., 'US', 'GB').
 * Passes formStyles prop to apply form builder styling while maintaining
 * consistent functionality and data format.
 */
function CountrySelectField({ element, styles, form, disabled }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            {/* Shared country select component - same as lead sheet with form builder styles */}
            <CountrySelect
              value={field.value || ''}
              onValueChange={field.onChange}
              disabled={disabled}
              placeholder={element.placeholder || 'Select country'}
              error={fieldState.error?.message}
              formStyles={{
                inputBackgroundColor: styles.inputBackgroundColor,
                inputBorderColor: styles.inputBorderColor,
                inputBorderWidth: styles.inputBorderWidth,
                inputBorderRadius: styles.inputBorderRadius,
                inputPadding: styles.inputPadding,
                inputFontSize: styles.inputFontSize,
                inputTextColor: styles.inputTextColor,
                inputPlaceholderColor: styles.inputPlaceholderColor,
                errorColor: styles.errorColor,
              }}
            />
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Textarea Field - Uses native <textarea> with inline styles
 */
function TextareaField({ element, styles, form, disabled }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <textarea
              placeholder={element.placeholder}
              rows={element.props.rows || 4}
              disabled={disabled}
              style={{
                ...getInputStyles(styles, disabled, !!fieldState.error),
                resize: 'vertical',
                minHeight: '80px',
              }}
              {...field}
            />
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Select Field - Uses native <select> with inline styles
 */
function SelectField({ element, styles, form, disabled }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <select
              disabled={disabled}
              style={{
                ...getInputStyles(styles, disabled, !!fieldState.error),
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 12px center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '16px',
                paddingRight: '40px',
              }}
              {...field}
            >
              <option value="">{element.placeholder || 'Select an option'}</option>
              {element.options?.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Radio Field - Uses native radio inputs with inline styles
 */
function RadioField({ element, styles, form, disabled }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {element.options?.map((option) => (
                <label
                  key={option.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    color: styles.inputTextColor,
                    fontSize: styles.inputFontSize,
                  }}
                >
                  <input
                    type="radio"
                    value={option.value}
                    checked={field.value === option.value}
                    onChange={() => field.onChange(option.value)}
                    disabled={disabled}
                    style={{ accentColor: styles.buttonBackgroundColor }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Checkbox Field - Uses native checkbox with inline styles
 */
function CheckboxField({ element, styles, form, disabled }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormControl>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: styles.inputTextColor,
                fontSize: styles.inputFontSize,
              }}
            >
              <input
                type="checkbox"
                checked={field.value || false}
                onChange={(e) => field.onChange(e.target.checked)}
                disabled={disabled}
                style={{
                  marginTop: '2px',
                  accentColor: styles.buttonBackgroundColor,
                }}
              />
              <span>
                {element.label}
                {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
              </span>
            </label>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={{ ...getHelpTextStyles(styles), marginLeft: '24px' }}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Checkbox Group Field
 */
function CheckboxGroupField({ element, styles, form, disabled }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {element.options?.map((option) => {
                const values = (field.value as string[]) || []
                const isChecked = values.includes(option.value)
                return (
                  <label
                    key={option.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      color: styles.inputTextColor,
                      fontSize: styles.inputFontSize,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          field.onChange([...values, option.value])
                        } else {
                          field.onChange(values.filter((v) => v !== option.value))
                        }
                      }}
                      disabled={disabled}
                      style={{ accentColor: styles.buttonBackgroundColor }}
                    />
                    {option.label}
                  </label>
                )
              })}
            </div>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Date Field - Uses shadcn Calendar (only UI component that needs it)
 */
function DateField({ element, styles, form, disabled }: FieldProps) {
  const [open, setOpen] = useState(false)

  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => {
        const dateValue = field.value ? new Date(field.value) : undefined
        return (
          <FormItem style={{ marginBottom: 0 }}>
            <FormLabel style={getLabelStyles(styles)}>
              {element.label}
              {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
            </FormLabel>
            <Popover open={disabled ? false : open} onOpenChange={setOpen}>
              <PopoverTrigger asChild disabled={disabled}>
                <FormControl>
                  <button
                    type="button"
                    disabled={disabled}
                    style={{
                      ...getInputStyles(styles, disabled, !!fieldState.error),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      textAlign: 'left',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span style={{ color: dateValue ? styles.inputTextColor : styles.inputPlaceholderColor }}>
                      {dateValue ? format(dateValue, 'PPP') : (element.placeholder || 'Select a date')}
                    </span>
                    <CalendarIcon style={{ width: '16px', height: '16px', opacity: 0.5 }} />
                  </button>
                </FormControl>
              </PopoverTrigger>
              {/* z-[10001] ensures date picker appears above PreviewOverlay (z-[9999]) */}
              <PopoverContent className="w-auto p-0 z-[10001]" align="start">
                <Calendar
                  mode="single"
                  selected={dateValue}
                  onSelect={(date) => {
                    field.onChange(date ? format(date, 'yyyy-MM-dd') : '')
                    setOpen(false)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {element.helpText && !fieldState.error && (
              <FormDescription style={getHelpTextStyles(styles)}>
                {element.helpText}
              </FormDescription>
            )}
            <FormMessage style={getErrorStyles(styles)} />
          </FormItem>
        )
      }}
    />
  )
}

/**
 * Time Field - Uses native time input
 */
function TimeField({ element, styles, form, disabled }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <div style={{ position: 'relative' }}>
              <input
                type="time"
                disabled={disabled}
                style={{
                  ...getInputStyles(styles, disabled, !!fieldState.error),
                  paddingRight: '40px',
                }}
                {...field}
              />
              <Clock
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '16px',
                  height: '16px',
                  opacity: 0.5,
                  pointerEvents: 'none',
                }}
              />
            </div>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Rating Field - Star rating
 */
function RatingField({ element, styles, form, disabled }: FieldProps) {
  const [hover, setHover] = useState(0)
  const maxRating = element.props.maxRating || 5

  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <div style={{ display: 'flex', gap: '4px' }}>
              {Array.from({ length: maxRating }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && field.onChange(i + 1)}
                  onMouseEnter={() => !disabled && setHover(i + 1)}
                  onMouseLeave={() => !disabled && setHover(0)}
                  style={{
                    padding: '4px',
                    background: 'none',
                    border: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Star
                    style={{
                      width: '24px',
                      height: '24px',
                      fill: (hover || field.value) > i ? '#facc15' : 'transparent',
                      color: (hover || field.value) > i ? '#facc15' : styles.inputBorderColor,
                      transition: 'all 0.15s',
                    }}
                  />
                </button>
              ))}
            </div>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * Slider Field - Uses native range input
 */
function SliderField({ element, styles, form, disabled }: FieldProps) {
  const min = element.props.sliderMin ?? 0
  const max = element.props.sliderMax ?? 100
  const step = element.props.sliderStep ?? 1

  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={field.value ?? (min + max) / 2}
                onChange={(e) => field.onChange(Number(e.target.value))}
                disabled={disabled}
                style={{
                  flex: 1,
                  accentColor: styles.buttonBackgroundColor,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              />
              {element.props.showValue && (
                <span style={{
                  width: '48px',
                  textAlign: 'right',
                  fontSize: styles.inputFontSize,
                  fontWeight: '500',
                  color: styles.inputTextColor,
                }}>
                  {field.value ?? (min + max) / 2}
                </span>
              )}
            </div>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

/**
 * File Field - Native file input with custom styling
 */
function FileField({ element, styles, form, disabled }: FieldProps) {
  return (
    <FormField
      control={form.control}
      name={element.name}
      render={({ field: { onChange, value, ...field }, fieldState }) => (
        <FormItem style={{ marginBottom: 0 }}>
          <FormLabel style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </FormLabel>
          <FormControl>
            <div
              style={{
                border: `2px dashed ${fieldState.error ? styles.errorColor : styles.inputBorderColor}`,
                borderRadius: styles.inputBorderRadius,
                padding: '24px',
                textAlign: 'center',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.7 : 1,
                backgroundColor: styles.inputBackgroundColor,
              }}
            >
              <input
                {...field}
                type="file"
                accept={element.props.accept}
                multiple={element.props.multiple}
                disabled={disabled}
                onChange={(e) => onChange(e.target.files ? Array.from(e.target.files) : [])}
                style={{ display: 'none' }}
                id={`file-${element.id}`}
              />
              <label
                htmlFor={`file-${element.id}`}
                style={{ display: 'block', cursor: disabled ? 'not-allowed' : 'pointer' }}
              >
                <Upload style={{ width: '32px', height: '32px', margin: '0 auto 8px', color: styles.helpTextColor }} />
                <p style={{ color: styles.helpTextColor, fontSize: styles.inputFontSize }}>
                  {element.placeholder || 'Click to upload'}
                </p>
              </label>
            </div>
          </FormControl>
          {element.helpText && !fieldState.error && (
            <FormDescription style={getHelpTextStyles(styles)}>
              {element.helpText}
            </FormDescription>
          )}
          <FormMessage style={getErrorStyles(styles)} />
        </FormItem>
      )}
    />
  )
}

// ============================================================================
// LAYOUT ELEMENTS (No validation)
// ============================================================================

function HeadingElement({ element, styles }: { element: FormElement; styles: FormStyles }) {
  const level = element.props.headingLevel || 'h2'
  const sizeMap: Record<string, string> = { h1: '30px', h2: '24px', h3: '20px', h4: '18px', h5: '16px', h6: '14px' }
  const weightMap: Record<string, string> = { h1: '700', h2: '600', h3: '600', h4: '500', h5: '500', h6: '500' }
  const style: React.CSSProperties = {
    color: styles.labelColor,
    fontSize: sizeMap[level] || sizeMap.h2,
    fontWeight: weightMap[level] || weightMap.h2,
    margin: 0,
  }
  switch (level) {
    case 'h1': return <h1 style={style}>{element.label}</h1>
    case 'h3': return <h3 style={style}>{element.label}</h3>
    case 'h4': return <h4 style={style}>{element.label}</h4>
    case 'h5': return <h5 style={style}>{element.label}</h5>
    case 'h6': return <h6 style={style}>{element.label}</h6>
    default: return <h2 style={style}>{element.label}</h2>
  }
}

function ParagraphElement({ element, styles }: { element: FormElement; styles: FormStyles }) {
  return (
    <p style={{ color: styles.helpTextColor, fontSize: styles.inputFontSize, lineHeight: '1.6', margin: 0 }}>
      {element.label}
    </p>
  )
}

function DividerElement({ styles }: { styles: FormStyles }) {
  return <hr style={{ border: 'none', borderTop: `1px solid ${styles.inputBorderColor}`, margin: 0 }} />
}

function SpacerElement({ element }: { element: FormElement }) {
  return <div style={{ height: element.props.height || '24px' }} />
}

function SubmitElement({ element, styles, disabled, isLoading }: { element: FormElement; styles: FormStyles; disabled: boolean; isLoading?: boolean }) {
  const buttonText = element.props.buttonText || element.label || 'Submit'
  return (
    <button
      type="submit"
      disabled={disabled || isLoading}
      style={{
        ...getButtonStyles(styles, disabled || !!isLoading),
        width: element.props.buttonFullWidth ? '100%' : 'auto',
      }}
    >
      {isLoading ? 'Submitting...' : buttonText}
    </button>
  )
}

function HiddenElement({ element, styles, disabled }: { element: FormElement; styles: FormStyles; disabled: boolean }) {
  // In edit mode, show a visual indicator
  if (disabled) {
    return (
      <div
        style={{
          padding: '12px',
          backgroundColor: styles.inputBackgroundColor,
          borderRadius: styles.inputBorderRadius,
          border: `2px dashed ${styles.inputBorderColor}`,
        }}
      >
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: styles.helpTextColor }}>
          Hidden: {element.name} {element.defaultValue ? `= ${String(element.defaultValue)}` : ''}
        </span>
      </div>
    )
  }
  return <input type="hidden" name={element.name} defaultValue={element.defaultValue as string} />
}

// ============================================================================
// ELEMENT DISPATCHER
// ============================================================================

function renderElement(
  element: FormElement,
  styles: FormStyles,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any,
  disabled: boolean,
  isLoading?: boolean,
  /** Whether this specific field is loading lead session data (shows shimmer) */
  isLoadingLeadField?: boolean
) {
  const props = { element, styles, form, disabled, isLoadingLeadField }

  switch (element.type) {
    // Text input types (including name and address fields with browser autofill)
    case 'text':
    case 'firstName':
    case 'lastName':
    case 'email':
    case 'password':
    case 'url':
    case 'number':
    // Address text elements - use TextInputField with autocomplete attributes
    case 'address':
    case 'address2':
    case 'city':
    case 'state':
    case 'zipCode':
      return <TextInputField {...props} />

    // Phone - Uses specialized PhoneNumberInput for E.164 format (SOURCE OF TRUTH)
    case 'phone':
      return <PhoneInputField {...props} />

    // Country - Uses specialized CountrySelect with searchable dropdown (SOURCE OF TRUTH)
    case 'country':
      return <CountrySelectField {...props} />

    case 'textarea':
      return <TextareaField {...props} />
    case 'select':
    case 'multiselect':
      return <SelectField {...props} />
    case 'radio':
      return <RadioField {...props} />
    case 'checkbox':
      return <CheckboxField {...props} />
    case 'checkboxGroup':
      return <CheckboxGroupField {...props} />
    case 'date':
      return <DateField {...props} />
    case 'time':
      return <TimeField {...props} />
    case 'rating':
      return <RatingField {...props} />
    case 'slider':
      return <SliderField {...props} />
    case 'file':
    case 'image':
      return <FileField {...props} />
    case 'heading':
      return <HeadingElement element={element} styles={styles} />
    case 'paragraph':
      return <ParagraphElement element={element} styles={styles} />
    case 'divider':
      return <DividerElement styles={styles} />
    case 'spacer':
      return <SpacerElement element={element} />
    case 'submit':
      return <SubmitElement element={element} styles={styles} disabled={disabled} isLoading={isLoading} />
    case 'hidden':
      return <HiddenElement element={element} styles={styles} disabled={disabled} />
    default:
      return <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px' }}>Unknown: {element.type}</div>
  }
}

// ============================================================================
// DISPLAY-ONLY ELEMENT RENDERER (for edit mode - no form binding)
// ============================================================================

/**
 * Renders a single form element for display purposes only.
 * Used in edit mode where we don't need form validation/binding.
 * Uses the SAME styles as FormRenderer for visual consistency.
 */
export function ElementDisplay({
  element,
  styles,
}: {
  element: FormElement
  styles: FormStyles
}) {
  switch (element.type) {
    // Text inputs - display only (includes name and address fields with browser autofill)
    case 'text':
    case 'firstName':
    case 'lastName':
    case 'email':
    case 'password':
    case 'url':
    case 'number':
    // Address text elements
    case 'address':
    case 'address2':
    case 'city':
    case 'state':
    case 'zipCode': {
      const inputType = element.type === 'password' ? 'password' :
                        element.type === 'number' ? 'number' : 'text'
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <input
            type={inputType}
            placeholder={element.placeholder}
            disabled
            style={getInputStyles(styles, true)}
            defaultValue={element.defaultValue as string}
          />
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )
    }

    // Phone - Display with phone icon indicator (SOURCE OF TRUTH - E.164 format)
    case 'phone': {
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {/* Country code selector preview */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0 12px',
                backgroundColor: styles.inputBackgroundColor,
                border: `${styles.inputBorderWidth} solid ${styles.inputBorderColor}`,
                borderRight: 'none',
                borderRadius: `${styles.inputBorderRadius} 0 0 ${styles.inputBorderRadius}`,
                color: styles.inputTextColor,
                fontSize: '14px',
              }}
            >
              <span>🌐</span>
              <span style={{ color: styles.inputPlaceholderColor }}>▼</span>
            </div>
            <input
              type="tel"
              placeholder={element.placeholder || 'Enter phone number'}
              disabled
              style={{
                ...getInputStyles(styles, true),
                borderRadius: `0 ${styles.inputBorderRadius} ${styles.inputBorderRadius} 0`,
                flex: 1,
              }}
              defaultValue={element.defaultValue as string}
            />
          </div>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )
    }

    // Country - Display with flag and dropdown indicator (SOURCE OF TRUTH - country codes)
    case 'country': {
      const selectedCountry = element.defaultValue ? getCountryByCode(element.defaultValue as string) : null
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <div
            style={{
              ...getInputStyles(styles, true),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'not-allowed',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selectedCountry ? (
                <>
                  <span style={{ fontSize: '18px' }}>{selectedCountry.flag}</span>
                  <span>{selectedCountry.name}</span>
                </>
              ) : (
                <span style={{ color: styles.inputPlaceholderColor }}>
                  {element.placeholder || 'Select country'}
                </span>
              )}
            </span>
            <span style={{ color: styles.inputPlaceholderColor }}>▼</span>
          </div>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )
    }

    case 'textarea':
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <textarea
            placeholder={element.placeholder}
            rows={element.props.rows || 4}
            disabled
            style={{ ...getInputStyles(styles, true), resize: 'vertical', minHeight: '80px' }}
            defaultValue={element.defaultValue as string}
          />
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )

    case 'select':
    case 'multiselect':
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <select
            disabled
            style={{
              ...getInputStyles(styles, true),
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 12px center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '16px',
              paddingRight: '40px',
            }}
          >
            <option value="">{element.placeholder || 'Select an option'}</option>
            {element.options?.map((option) => (
              <option key={option.id} value={option.value}>{option.label}</option>
            ))}
          </select>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )

    case 'radio':
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {element.options?.map((option) => (
              <label key={option.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'not-allowed', color: styles.inputTextColor, fontSize: styles.inputFontSize }}>
                <input type="radio" disabled style={{ accentColor: styles.buttonBackgroundColor }} />
                {option.label}
              </label>
            ))}
          </div>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )

    case 'checkbox':
      return (
        <div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'not-allowed', color: styles.inputTextColor, fontSize: styles.inputFontSize }}>
            <input type="checkbox" disabled style={{ marginTop: '2px', accentColor: styles.buttonBackgroundColor }} />
            <span>
              {element.label}
              {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
            </span>
          </label>
          {element.helpText && <p style={{ ...getHelpTextStyles(styles), marginLeft: '24px' }}>{element.helpText}</p>}
        </div>
      )

    case 'checkboxGroup':
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {element.options?.map((option) => (
              <label key={option.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'not-allowed', color: styles.inputTextColor, fontSize: styles.inputFontSize }}>
                <input type="checkbox" disabled style={{ accentColor: styles.buttonBackgroundColor }} />
                {option.label}
              </label>
            ))}
          </div>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )

    case 'date':
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <button
            type="button"
            disabled
            style={{ ...getInputStyles(styles, true), display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', cursor: 'not-allowed' }}
          >
            <span style={{ color: styles.inputPlaceholderColor }}>{element.placeholder || 'Select a date'}</span>
            <CalendarIcon style={{ width: '16px', height: '16px', opacity: 0.5 }} />
          </button>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )

    case 'time':
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <div style={{ position: 'relative' }}>
            <input type="time" disabled style={{ ...getInputStyles(styles, true), paddingRight: '40px' }} />
            <Clock style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', opacity: 0.5, pointerEvents: 'none' }} />
          </div>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )

    case 'rating': {
      const maxRating = element.props.maxRating || 5
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {Array.from({ length: maxRating }).map((_, i) => (
              <button key={i} type="button" disabled style={{ padding: '4px', background: 'none', border: 'none', cursor: 'not-allowed' }}>
                <Star style={{ width: '24px', height: '24px', fill: 'transparent', color: styles.inputBorderColor }} />
              </button>
            ))}
          </div>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )
    }

    case 'slider': {
      const min = element.props.sliderMin ?? 0
      const max = element.props.sliderMax ?? 100
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input type="range" min={min} max={max} disabled style={{ flex: 1, accentColor: styles.buttonBackgroundColor, cursor: 'not-allowed' }} />
            {element.props.showValue && (
              <span style={{ width: '48px', textAlign: 'right', fontSize: styles.inputFontSize, fontWeight: '500', color: styles.inputTextColor }}>{(min + max) / 2}</span>
            )}
          </div>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )
    }

    case 'file':
    case 'image':
      return (
        <div>
          <label style={getLabelStyles(styles)}>
            {element.label}
            {element.required && <span style={{ color: styles.errorColor, marginLeft: '4px' }}>*</span>}
          </label>
          <div style={{ border: `2px dashed ${styles.inputBorderColor}`, borderRadius: styles.inputBorderRadius, padding: '24px', textAlign: 'center', cursor: 'not-allowed', opacity: 0.7, backgroundColor: styles.inputBackgroundColor }}>
            <Upload style={{ width: '32px', height: '32px', margin: '0 auto 8px', color: styles.helpTextColor }} />
            <p style={{ color: styles.helpTextColor, fontSize: styles.inputFontSize }}>{element.placeholder || 'Click to upload'}</p>
          </div>
          {element.helpText && <p style={getHelpTextStyles(styles)}>{element.helpText}</p>}
        </div>
      )

    case 'heading':
      return <HeadingElement element={element} styles={styles} />

    case 'paragraph':
      return <ParagraphElement element={element} styles={styles} />

    case 'divider':
      return <DividerElement styles={styles} />

    case 'spacer':
      return <SpacerElement element={element} />

    case 'submit':
      return <SubmitElement element={element} styles={styles} disabled={true} />

    case 'hidden':
      return <HiddenElement element={element} styles={styles} disabled={true} />

    default:
      return <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px' }}>Unknown: {element.type}</div>
  }
}

// ============================================================================
// MAIN FORM RENDERER
// ============================================================================

export function FormRenderer({
  schema,
  formId,
  organizationId,
  onSubmitSuccess,
  showCanvas = true,
  className,
  isLoading: externalLoading = false,
  disabled = false,
  successRedirectEnabled,
  successRedirectType,
  successRedirectPageSlug,
  successRedirectUrl,
  successRedirectNewTab,
}: FormRendererProps) {
  const { styles, elements } = schema

  // Next.js router for smooth client-side navigation (internal page redirects)
  const router = useRouter()

  // ========================================================================
  // INTERNAL STATE - Form handles its own submission state
  // ========================================================================

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  // ========================================================================
  // LEAD SESSION - Sticky forms for returning visitors
  // ========================================================================
  // When organizationId is provided, enables:
  // - Auto-prefilling email, firstName, lastName, phone fields
  // - Lead identification on form submission
  // SOURCE OF TRUTH KEYWORDS: LeadSession, StickyForm, FormPrefill

  const leadSession = useLeadSession(organizationId || '')

  // Find field names for lead-related fields (email, firstName, lastName, phone)
  // These will be auto-prefilled and used for lead identification
  // SOURCE OF TRUTH: FormElementType in _lib/types.ts defines these element types
  const leadFieldNames = useMemo(() => {
    const fieldNames: {
      email?: string
      firstName?: string
      lastName?: string
      phone?: string
    } = {}

    for (const element of elements) {
      // Match by element type directly
      // The form builder has dedicated types: 'email', 'phone', 'firstName', 'lastName'
      if (element.type === 'email' && !fieldNames.email) {
        fieldNames.email = element.name
      }
      if (element.type === 'phone' && !fieldNames.phone) {
        fieldNames.phone = element.name
      }
      if (element.type === 'firstName' && !fieldNames.firstName) {
        fieldNames.firstName = element.name
      }
      if (element.type === 'lastName' && !fieldNames.lastName) {
        fieldNames.lastName = element.name
      }

      // Fallback: Match by common field name patterns for generic 'text' type fields
      // This handles cases where users create text fields named "first_name" etc.
      const nameLower = element.name.toLowerCase()
      if (
        element.type === 'text' &&
        !fieldNames.firstName &&
        (nameLower.includes('firstname') || nameLower.includes('first_name') || nameLower === 'first')
      ) {
        fieldNames.firstName = element.name
      }
      if (
        element.type === 'text' &&
        !fieldNames.lastName &&
        (nameLower.includes('lastname') || nameLower.includes('last_name') || nameLower === 'last')
      ) {
        fieldNames.lastName = element.name
      }
    }

    return fieldNames
  }, [elements])

  // Create a Set of lead field names for quick lookup when rendering
  // Used to determine which fields should show loading shimmer
  const leadFieldNameSet = useMemo(() => {
    const set = new Set<string>()
    if (leadFieldNames.email) set.add(leadFieldNames.email)
    if (leadFieldNames.firstName) set.add(leadFieldNames.firstName)
    if (leadFieldNames.lastName) set.add(leadFieldNames.lastName)
    if (leadFieldNames.phone) set.add(leadFieldNames.phone)
    return set
  }, [leadFieldNames])

  // Determine if we're currently loading lead session data
  // Only show loading state if organizationId is provided and session is loading
  const isLoadingLeadSession = Boolean(organizationId) && leadSession.isLoading

  // ========================================================================
  // tRPC MUTATION - Single entry point for all form submissions
  // ========================================================================

  const submitFormMutation = trpc.forms.submitForm.useMutation()

  // ========================================================================
  // FORM SETUP
  // ========================================================================

  const zodSchema = useMemo(() => buildZodSchema(elements), [elements])

  const form = useForm<z.infer<typeof zodSchema>>({
    resolver: zodResolver(zodSchema),
    defaultValues: getDefaultValues(elements),
    mode: 'onSubmit',
  })

  // ========================================================================
  // LEAD SESSION PREFILL - Auto-fill fields for returning visitors
  // ========================================================================
  // When a lead session is identified, prefill their known data into the form
  // This only happens once when the lead is first identified

  useEffect(() => {
    // Skip if no lead session, no organization, or disabled mode
    if (!organizationId || !leadSession.isIdentified || !leadSession.lead || disabled) {
      return
    }

    // Prefill each lead field if it exists in the form and has a value
    const { lead } = leadSession

    if (leadFieldNames.email && lead.email) {
      form.setValue(leadFieldNames.email, lead.email)
    }
    if (leadFieldNames.firstName && lead.firstName) {
      form.setValue(leadFieldNames.firstName, lead.firstName)
    }
    if (leadFieldNames.lastName && lead.lastName) {
      form.setValue(leadFieldNames.lastName, lead.lastName)
    }
    if (leadFieldNames.phone && lead.phone) {
      form.setValue(leadFieldNames.phone, lead.phone)
    }
  }, [
    organizationId,
    leadSession.isIdentified,
    leadSession.lead,
    leadFieldNames,
    form,
    disabled,
  ])

  /**
   * Internal submission handler.
   * Calls the tRPC endpoint and handles success/redirect internally.
   * Also identifies the lead for sticky forms (when organizationId is provided).
   * This is the ONLY place form submission logic should live.
   * SOURCE OF TRUTH KEYWORDS: FormSubmission, LeadSession, StickyForm
   */
  const handleInternalSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      // Can't submit without formId
      if (!formId) {
        console.warn('FormRenderer: Cannot submit - no formId provided')
        return
      }

      setIsSubmitting(true)

      try {
        // Resolve option-based values (select, radio, checkboxGroup, multiselect)
        // from internal IDs (e.g. "option_1") to human-readable labels (e.g. "THis?")
        const resolvedData = resolveOptionValuesToLabels(data, elements)

        // Submit to tRPC endpoint with resolved labels
        await submitFormMutation.mutateAsync({
          formId,
          data: resolvedData,
        })

        // ====================================================================
        // LEAD SESSION IDENTIFICATION
        // ====================================================================
        // After successful submission, identify the lead for sticky forms
        // This creates a session cookie for returning visitor recognition
        // Only runs if organizationId is provided and we have an email field

        if (organizationId && leadFieldNames.email) {
          const email = data[leadFieldNames.email]

          if (typeof email === 'string' && email.includes('@')) {
            // Build identification options from form data
            const identifyOptions: {
              firstName?: string
              lastName?: string
              phone?: string
              source?: string
            } = {
              source: 'form', // Track that this session came from a form
            }

            // Extract first name if present
            if (leadFieldNames.firstName && data[leadFieldNames.firstName]) {
              identifyOptions.firstName = String(data[leadFieldNames.firstName])
            }

            // Extract last name if present
            if (leadFieldNames.lastName && data[leadFieldNames.lastName]) {
              identifyOptions.lastName = String(data[leadFieldNames.lastName])
            }

            // Extract phone if present
            if (leadFieldNames.phone && data[leadFieldNames.phone]) {
              identifyOptions.phone = String(data[leadFieldNames.phone])
            }

            // Identify the lead (creates session, stores cookie)
            // This runs in the background - we don't await or block the success flow
            leadSession.identify(email, identifyOptions).then((result) => {
              if (!result.success) {
                // Log but don't block the user experience
                console.warn('FormRenderer: Lead session identification failed:', result.error)
              }
            })
          }
        }

        // ====================================================================
        // WEBSITE BUILDER REDIRECT OVERRIDE
        // ====================================================================
        // When the form is embedded via the website builder with redirect enabled,
        // these override props take priority over the form schema's own redirectUrl.

        /**
         * Post-submission redirect logic.
         * If redirect is configured, navigate the user to the target page/URL.
         * If the redirect opens in a new tab, also show the inline success message.
         * If no redirect is configured, the inline success message is shown (default).
         * Same pattern as checkout-renderer.tsx post-payment redirect.
         */
        if (successRedirectEnabled) {
          if (successRedirectType === 'page' && successRedirectPageSlug) {
            // Smooth client-side navigation to an internal website page (no full reload)
            router.push(successRedirectPageSlug)
            return
          } else if (successRedirectType === 'url' && successRedirectUrl) {
            if (successRedirectNewTab) {
              window.open(successRedirectUrl, '_blank')
              // Keep showing success message in current tab
            } else {
              window.location.href = successRedirectUrl
              return
            }
          }
        }

        // Fallback: check for redirect URL in form schema settings
        if (schema.settings?.redirectUrl) {
          window.location.href = schema.settings.redirectUrl
          return
        }

        // Show success state
        setIsSubmitted(true)
        trackEvent(CLARITY_EVENTS.FORM_SUBMITTED)

        // Fire optional callback for additional custom behavior
        onSubmitSuccess?.(data)
      } catch (error) {
        // Surface the server error message to the user
        const errorMessage =
          error instanceof Error ? error.message : 'Something went wrong. Please try again.'
        console.error('Form submission error:', errorMessage)
        alert(errorMessage)
      } finally {
        setIsSubmitting(false)
      }
    },
    [formId, submitFormMutation, elements, schema.settings?.redirectUrl, onSubmitSuccess, organizationId, leadFieldNames, leadSession, successRedirectEnabled, successRedirectType, successRedirectPageSlug, successRedirectUrl, successRedirectNewTab, router]
  )

  const handleSubmit = form.handleSubmit(async (data) => {
    if (!disabled) {
      await handleInternalSubmit(data as Record<string, unknown>)
    }
  })

  // Combined loading state (internal submission + external override)
  const isLoading = isSubmitting || externalLoading

  // ========================================================================
  // SUCCESS STATE - Show success message after submission
  // ========================================================================

  if (isSubmitted) {
    return (
      <div
        className={className}
        style={{
          backgroundColor: showCanvas ? styles.canvasColor : 'transparent',
          minHeight: showCanvas ? '100vh' : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            backgroundColor: styles.backgroundColor,
            padding: styles.padding,
            borderRadius: styles.borderRadius,
            maxWidth: styles.maxWidth,
            width: '100%',
            fontFamily: styles.fontFamily,
            textAlign: 'center',
          }}
        >
          {/* Success icon */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Check style={{ width: '32px', height: '32px', color: 'white' }} />
          </div>

          {/* Success message */}
          <h2
            style={{
              fontSize: '24px',
              fontWeight: '600',
              color: styles.labelColor,
              marginBottom: '8px',
            }}
          >
            Thank You!
          </h2>
          <p
            style={{
              color: styles.helpTextColor,
              fontSize: styles.inputFontSize,
            }}
          >
            {schema.settings?.successMessage || 'Your submission has been received.'}
          </p>
        </div>
      </div>
    )
  }

  if (elements.length === 0) {
    return (
      <div
        className={className}
        style={{
          backgroundColor: showCanvas ? styles.canvasColor : 'transparent',
          minHeight: showCanvas ? '100vh' : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{
          backgroundColor: styles.backgroundColor,
          padding: styles.padding,
          borderRadius: styles.borderRadius,
          maxWidth: styles.maxWidth,
          width: '100%',
          fontFamily: styles.fontFamily,
          textAlign: 'center',
        }}>
          <p style={{ color: styles.helpTextColor }}>This form has no elements yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{
        backgroundColor: showCanvas ? styles.canvasColor : 'transparent',
        minHeight: showCanvas ? '100vh' : 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: showCanvas ? '24px' : 0,
      }}
    >
      <Form {...form}>
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{
            backgroundColor: styles.backgroundColor,
            padding: styles.padding,
            borderRadius: styles.borderRadius,
            maxWidth: styles.maxWidth,
            width: '100%',
            fontFamily: styles.fontFamily,
            marginTop: showCanvas ? '24px' : 0,
          }}
        >
          {elements.map((element) => {
            // Determine if this specific field should show loading state
            // Only lead fields (email, firstName, lastName, phone) show shimmer when loading
            const isLoadingLeadField = isLoadingLeadSession && leadFieldNameSet.has(element.name)

            return (
              <div key={element.id} style={{ marginBottom: styles.elementSpacing }}>
                {renderElement(element, styles, form, disabled, isLoading, isLoadingLeadField)}
              </div>
            )
          })}
        </form>
      </Form>
    </div>
  )
}
