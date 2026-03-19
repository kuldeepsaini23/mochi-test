'use client'

/**
 * Email Builder Variable Picker — Re-export + Email-Specific Helpers
 *
 * The VariablePicker component now lives at @/components/global/variable-picker.tsx
 * as the single source of truth for the entire app.
 *
 * This file re-exports it for backward compatibility and provides email-specific
 * helper components (VariablePreview, TextWithVariables) that are only used
 * within the email builder context.
 *
 * SOURCE OF TRUTH KEYWORDS: VariablePicker, VariablePreview, TextWithVariables
 */

import { VariablePicker as GlobalVariablePicker } from '@/components/global/variable-picker'

// ============================================================================
// RE-EXPORT — Single source of truth
// ============================================================================

export { GlobalVariablePicker as VariablePicker }
export type { VariablePickerProps } from '@/components/global/variable-picker'

// ============================================================================
// VARIABLE PREVIEW COMPONENT
// Renders text with variables highlighted as pills (email-builder-specific)
// ============================================================================

interface VariablePreviewProps {
  text: string
}

/**
 * Renders text with variables highlighted as pills.
 * Shows the variable path as styled pill indicators.
 */
export function VariablePreview({ text }: VariablePreviewProps) {
  if (!text) return null

  /** Parse text and replace {{variables}} with styled pills */
  const parts = text.split(/(\{\{[^}]+\}\})/g)

  return (
    <span>
      {parts.map((part, index) => {
        if (part.match(/^\{\{[^}]+\}\}$/)) {
          const variableName = part.slice(2, -2)
          return (
            <span
              key={index}
              className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-primary/10 text-primary text-xs font-mono"
            >
              {variableName}
            </span>
          )
        }
        return <span key={index}>{part}</span>
      })}
    </span>
  )
}

// ============================================================================
// TEXT WITH VARIABLES COMPONENT
// Input wrapper that shows variable pills in preview (email-builder-specific)
// ============================================================================

interface TextWithVariablesProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onInsertVariable?: (variable: string) => void
}

/**
 * Text input that shows variable pills in preview below.
 * Includes a variable picker button for easy insertion.
 */
export function TextWithVariables({
  value,
  onChange,
  placeholder,
  onInsertVariable,
}: TextWithVariablesProps) {
  const handleInsert = (variable: string) => {
    onChange(value + variable)
    onInsertVariable?.(variable)
  }

  const hasVariables = value.includes('{{')

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GlobalVariablePicker onInsert={handleInsert} />
      </div>
      {hasVariables && (
        <div className="p-2 rounded bg-muted/50 text-sm">
          <span className="text-[10px] text-muted-foreground block mb-1">Preview:</span>
          <VariablePreview text={value} />
        </div>
      )}
    </div>
  )
}
