/**
 * Variable Interpolation Utility
 *
 * Replaces {{variable.path}} patterns in templates with actual values.
 *
 * Features:
 * - Dot notation: {{lead.firstName}}
 * - Nested paths: {{lead.customData.fieldSlug}}
 * - Array auto-first: {{lead.transaction.amount}} gets transactions[0].amount
 * - Formatters: {{lead.cltv|currency}}, {{lead.createdAt|date}}
 * - Defaults: {{lead.phone|'N/A'}}
 * - Safe: Never throws, returns empty string for missing values
 *
 * Syntax:
 * - Basic: {{path.to.value}}
 * - With formatter: {{path.to.value|formatter}}
 * - With default: {{path.to.value|'default value'}}
 * - Combined: {{path.to.value|formatter|'default'}}
 */

import type { VariableContext, VariableFormatter, ParsedVariable } from './types'
// Use client-safe format utils to avoid pulling in server-side dependencies
import { formatCurrency, formatDate } from './format-utils'

// ============================================================================
// MAIN INTERPOLATION FUNCTION
// ============================================================================

/**
 * Interpolate variables in a template string.
 *
 * Replaces all {{variable.path}} patterns with their values from context.
 * Safe by design - never throws, missing values become empty strings.
 *
 * @param template - Template string with {{variable}} patterns
 * @param context - Variable context containing all data
 * @returns Interpolated string with variables replaced
 *
 * @example
 * interpolate('Hello {{lead.firstName}}!', context)
 * // => 'Hello John!'
 *
 * @example
 * interpolate('Paid: {{lead.transaction.paidAmountFormatted}}', context)
 * // => 'Paid: $99.00'
 *
 * @example
 * interpolate('Phone: {{lead.phone|\'Not provided\'}}', context)
 * // => 'Phone: Not provided' (if phone is empty)
 */
export function interpolate(template: string, context: VariableContext): string {
  if (!template) return ''

  // Match {{...}} patterns, including nested content
  const variablePattern = /\{\{([^}]+)\}\}/g

  return template.replace(variablePattern, (match, expression: string) => {
    try {
      const parsed = parseVariableExpression(expression.trim())
      const value = resolveValue(parsed.segments, context)
      return formatValue(value, parsed.formatter, parsed.defaultValue)
    } catch {
      // Never throw - return empty string on any error
      return ''
    }
  })
}

// ============================================================================
// EXPRESSION PARSING
// ============================================================================

/**
 * Parse a variable expression into its components.
 *
 * Handles:
 * - lead.firstName
 * - lead.cltv|currency
 * - lead.phone|'N/A'
 * - lead.createdAt|date|'Unknown'
 */
function parseVariableExpression(expression: string): ParsedVariable {
  // Split by | to separate path from formatter/default
  const parts = expression.split('|').map(p => p.trim())

  const path = parts[0]
  const segments = path.split('.')

  let formatter: VariableFormatter | undefined
  let defaultValue: string | undefined

  // Process additional parts (formatter and/or default)
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]

    // Check if it's a quoted default value
    if (isQuotedString(part)) {
      defaultValue = unquoteString(part)
    } else if (isValidFormatter(part)) {
      formatter = part as VariableFormatter
    }
  }

  return { path, segments, formatter, defaultValue }
}

/**
 * Check if a string is a quoted default value.
 */
function isQuotedString(value: string): boolean {
  return (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  )
}

/**
 * Remove quotes from a string.
 */
function unquoteString(value: string): string {
  if (isQuotedString(value)) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Check if a string is a valid formatter name.
 */
function isValidFormatter(value: string): boolean {
  const validFormatters: VariableFormatter[] = [
    'currency',
    'date',
    'datetime',
    'time',
    'uppercase',
    'lowercase',
    'capitalize',
    'number',
    'percent',
  ]
  return validFormatters.includes(value as VariableFormatter)
}

// ============================================================================
// VALUE RESOLUTION
// ============================================================================

/**
 * Resolve a value from context using path segments.
 *
 * Smart features:
 * - Handles null/undefined gracefully
 * - Auto-indexes arrays (gets first element)
 * - Supports nested objects
 */
function resolveValue(segments: string[], context: VariableContext): unknown {
  let current: unknown = context

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined
    }

    // Handle array access - if current is array and segment is not a number, get first element
    if (Array.isArray(current)) {
      const index = parseInt(segment, 10)
      if (!isNaN(index)) {
        // Explicit index access: segments like "0", "1", etc.
        current = current[index]
      } else {
        // Auto-first: get first element then access property
        const firstElement = current[0]
        if (firstElement === null || firstElement === undefined) {
          return undefined
        }
        current = (firstElement as Record<string, unknown>)[segment]
      }
    } else if (typeof current === 'object') {
      // Object property access
      current = (current as Record<string, unknown>)[segment]
    } else {
      // Can't traverse further
      return undefined
    }
  }

  return current
}

// ============================================================================
// VALUE FORMATTING
// ============================================================================

/**
 * Format a value for output.
 *
 * Applies formatter if specified, then default if value is empty.
 * Always returns a string.
 */
function formatValue(
  value: unknown,
  formatter?: VariableFormatter,
  defaultValue?: string
): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return defaultValue ?? ''
  }

  // Handle arrays - join with comma
  if (Array.isArray(value)) {
    const stringValue = value.map(v => String(v)).join(', ')
    return stringValue || defaultValue || ''
  }

  // Convert to string for processing
  let result = String(value)

  // Apply formatter if specified
  if (formatter) {
    result = applyFormatter(value, formatter)
  }

  // Return default if result is empty
  if (result === '' && defaultValue !== undefined) {
    return defaultValue
  }

  return result
}

/**
 * Apply a formatter to a value.
 */
function applyFormatter(value: unknown, formatter: VariableFormatter): string {
  switch (formatter) {
    case 'currency': {
      // Assume value is in cents if it's a number
      const numValue = typeof value === 'number' ? value : parseFloat(String(value))
      if (isNaN(numValue)) return String(value)
      return formatCurrency(numValue, 'usd')
    }

    case 'date': {
      return formatDate(String(value), 'date')
    }

    case 'datetime': {
      return formatDate(String(value), 'datetime')
    }

    case 'time': {
      return formatDate(String(value), 'time')
    }

    case 'uppercase': {
      return String(value).toUpperCase()
    }

    case 'lowercase': {
      return String(value).toLowerCase()
    }

    case 'capitalize': {
      const str = String(value)
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
    }

    case 'number': {
      const numValue = typeof value === 'number' ? value : parseFloat(String(value))
      if (isNaN(numValue)) return String(value)
      return new Intl.NumberFormat('en-US').format(numValue)
    }

    case 'percent': {
      const numValue = typeof value === 'number' ? value : parseFloat(String(value))
      if (isNaN(numValue)) return String(value)
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(numValue / 100)
    }

    default:
      return String(value)
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract all variable paths from a template.
 *
 * Useful for validation or dependency tracking.
 *
 * @param template - Template string to analyze
 * @returns Array of variable paths found in template
 *
 * @example
 * extractVariables('Hello {{lead.firstName}}, your balance is {{lead.cltv|currency}}')
 * // => ['lead.firstName', 'lead.cltv']
 */
export function extractVariables(template: string): string[] {
  if (!template) return []

  const variablePattern = /\{\{([^}]+)\}\}/g
  const variables: string[] = []

  let match: RegExpExecArray | null
  while ((match = variablePattern.exec(template)) !== null) {
    const expression = match[1].trim()
    const path = expression.split('|')[0].trim()
    if (!variables.includes(path)) {
      variables.push(path)
    }
  }

  return variables
}

/**
 * Validate that all variables in a template can be resolved.
 *
 * @param template - Template string to validate
 * @param context - Variable context to validate against
 * @returns Array of invalid variable paths (empty if all valid)
 */
export function validateVariables(template: string, context: VariableContext): string[] {
  const variables = extractVariables(template)
  const invalid: string[] = []

  for (const variable of variables) {
    const segments = variable.split('.')
    const value = resolveValue(segments, context)
    if (value === undefined) {
      invalid.push(variable)
    }
  }

  return invalid
}

/**
 * Preview a template with the given context.
 *
 * Returns both the interpolated result and any missing variables.
 *
 * @param template - Template string
 * @param context - Variable context
 * @returns Preview result with interpolated text and missing variables
 */
export function previewTemplate(
  template: string,
  context: VariableContext
): { result: string; missingVariables: string[] } {
  const result = interpolate(template, context)
  const missingVariables = validateVariables(template, context)

  return { result, missingVariables }
}
