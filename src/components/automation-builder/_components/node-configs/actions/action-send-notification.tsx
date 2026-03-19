/**
 * ============================================================================
 * SEND NOTIFICATION ACTION CONFIG
 * ============================================================================
 *
 * Configuration form for the "Send Notification" action.
 * Sends an internal notification to team members.
 *
 * FEATURES:
 * - Title and body with variable support
 * - Channel selection (in-app, email, or both)
 * - Interactive variable picker for inserting dynamic values
 *
 * SOURCE OF TRUTH: SendNotificationActionConfig
 */

'use client'

import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VariablePicker } from '@/components/global/variable-picker'
import { useAutomationVariables } from '../../../_lib/use-automation-variables'
import type { SendNotificationActionConfig as SendNotificationConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Available notification channels */
const NOTIFICATION_CHANNELS = [
  { value: 'in_app', label: 'In-App Only' },
  { value: 'email', label: 'Email Only' },
  { value: 'both', label: 'Both In-App & Email' },
] as const

// ============================================================================
// TYPES
// ============================================================================

interface ActionSendNotificationConfigProps {
  config: SendNotificationConfig
  onChange: (config: SendNotificationConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionSendNotificationConfig({
  config,
  onChange,
  errors,
}: ActionSendNotificationConfigProps) {
  const variableProps = useAutomationVariables()

  /** Refs for inserting variables at cursor position */
  const titleInputRef = useRef<HTMLInputElement>(null)
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null)

  /** Insert variable at cursor position in title input */
  const handleInsertTitleVariable = (variable: string) => {
    const input = titleInputRef.current
    const currentValue = config.titleTemplate
    if (input) {
      const start = input.selectionStart ?? currentValue.length
      const end = input.selectionEnd ?? currentValue.length
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
      onChange({ ...config, titleTemplate: newValue })
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, titleTemplate: currentValue + variable })
    }
  }

  /** Insert variable at cursor position in body textarea */
  const handleInsertBodyVariable = (variable: string) => {
    const textarea = bodyTextareaRef.current
    const currentValue = config.bodyTemplate
    if (textarea) {
      const start = textarea.selectionStart ?? currentValue.length
      const end = textarea.selectionEnd ?? currentValue.length
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
      onChange({ ...config, bodyTemplate: newValue })
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, bodyTemplate: currentValue + variable })
    }
  }

  return (
    <div className="space-y-4">
      {/* Notification Title */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Title</span>
          <VariablePicker onInsert={handleInsertTitleVariable} organizationId={variableProps.organizationId} categories={variableProps.categories} />
        </div>
        <Input
          ref={titleInputRef}
          type="text"
          placeholder="e.g., New Lead Activity"
          value={config.titleTemplate}
          onChange={(e) => onChange({ ...config, titleTemplate: e.target.value })}
          className={`h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm ${errors?.titleTemplate ? 'ring-1 ring-destructive/30' : ''}`}
        />
        {errors?.titleTemplate && (
          <p className="text-xs text-destructive">{errors.titleTemplate}</p>
        )}
      </div>

      {/* Notification Body */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Message</span>
          <VariablePicker onInsert={handleInsertBodyVariable} organizationId={variableProps.organizationId} categories={variableProps.categories} />
        </div>
        <Textarea
          ref={bodyTextareaRef}
          placeholder="e.g., {{lead.fullName}} has completed a payment"
          value={config.bodyTemplate}
          onChange={(e) => onChange({ ...config, bodyTemplate: e.target.value })}
          rows={3}
          className={`rounded-xl bg-accent dark:bg-background/20 border-0 text-sm ${errors?.bodyTemplate ? 'ring-1 ring-destructive/30' : ''}`}
        />
        {errors?.bodyTemplate && (
          <p className="text-xs text-destructive">{errors.bodyTemplate}</p>
        )}
      </div>

      {/* Notification Channel */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Channel</span>
        <Select
          value={config.channel ?? 'in_app'}
          onValueChange={(ch) => onChange({ ...config, channel: ch as SendNotificationConfig['channel'] })}
        >
          <SelectTrigger className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTIFICATION_CHANNELS.map((channel) => (
              <SelectItem key={channel.value} value={channel.value}>
                {channel.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
