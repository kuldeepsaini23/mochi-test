/**
 * ============================================================================
 * FORM SUBMITTED TRIGGER CONFIG
 * ============================================================================
 *
 * Configuration form for the "Form Submitted" trigger.
 * Allows selecting which form to watch for submissions.
 *
 * SOURCE OF TRUTH: FormSubmittedTriggerConfig
 */

'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { FormSubmittedTriggerConfig as FormSubmittedConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// TYPES
// ============================================================================

interface TriggerFormSubmittedConfigProps {
  config: FormSubmittedConfig
  onChange: (config: FormSubmittedConfig) => void
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TriggerFormSubmittedConfig({
  config,
  onChange,
}: TriggerFormSubmittedConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { forms, isLoading } = useAutomationBuilderData(organizationId)

  /** Handle form selection — updates both formId and formName for display */
  const handleFormChange = (formId: string) => {
    if (formId === 'any') {
      onChange({ ...config, formId: undefined, formName: undefined })
    } else {
      const form = forms.find((f) => f.id === formId)
      onChange({ ...config, formId, formName: form?.name })
    }
  }

  return (
    <div className="space-y-4">
      {/* Form — inline row */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium shrink-0">Form</span>
        <div className="flex-1 flex justify-end">
          <Select
            value={config.formId ?? 'any'}
            onValueChange={handleFormChange}
            disabled={isLoading}
          >
            <SelectTrigger className="h-9 w-auto min-w-[140px] rounded-xl bg-accent dark:bg-background/20 border-0 text-sm gap-2">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-muted-foreground text-sm">Loading...</span>
                </div>
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any form</SelectItem>
              {forms.map((form) => (
                <SelectItem key={form.id} value={form.id}>
                  {form.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Available data — compact pills */}
      <div>
        <span className="text-sm font-medium">Available data</span>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {['form.name', 'submissionData.*', 'lead.email', 'lead.firstName'].map((v) => (
            <code key={v} className="text-[11px] px-2 py-1 bg-accent dark:bg-background/20 rounded-lg text-muted-foreground">
              {`{{trigger.${v}}}`}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}
