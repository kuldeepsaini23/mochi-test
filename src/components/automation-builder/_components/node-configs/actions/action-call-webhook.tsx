/**
 * ============================================================================
 * ACTION: CALL WEBHOOK CONFIG
 * ============================================================================
 *
 * Configuration panel for the Call Webhook action node.
 * Allows users to configure HTTP requests to external URLs.
 *
 * FEATURES:
 * - URL input with variable support
 * - HTTP method selection (GET, POST, PUT, PATCH, DELETE)
 * - Content type for request body
 * - JSON body editor with variable support
 * - Custom headers support
 * - Interactive variable picker for inserting dynamic values
 *
 * SOURCE OF TRUTH: CallWebhookActionConfig from types.ts
 */

'use client'

import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { VariablePicker } from '@/components/global/variable-picker'
import { useAutomationVariables } from '../../../_lib/use-automation-variables'
import type { CallWebhookActionConfig as CallWebhookConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'

// ============================================================================
// CONSTANTS
// ============================================================================

/** HTTP methods available for webhooks */
const HTTP_METHODS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
] as const

/** Content types for request body */
const CONTENT_TYPES = [
  { value: 'application/json', label: 'JSON (application/json)' },
  { value: 'application/x-www-form-urlencoded', label: 'Form URL Encoded' },
] as const

// ============================================================================
// TYPES
// ============================================================================

interface ActionCallWebhookConfigProps {
  config: CallWebhookConfig
  onChange: (config: CallWebhookConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionCallWebhookConfig({
  config,
  onChange,
  errors,
}: ActionCallWebhookConfigProps) {
  const variableProps = useAutomationVariables()
  const [newHeaderKey, setNewHeaderKey] = useState('')
  const [newHeaderValue, setNewHeaderValue] = useState('')

  /** Refs for inserting variables at cursor position */
  const urlInputRef = useRef<HTMLInputElement>(null)
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null)
  const headerValueInputRef = useRef<HTMLInputElement>(null)

  /** Insert variable at cursor position in URL input */
  const handleInsertUrlVariable = (variable: string) => {
    const input = urlInputRef.current
    if (input) {
      const start = input.selectionStart ?? config.url.length
      const end = input.selectionEnd ?? config.url.length
      const newValue = config.url.slice(0, start) + variable + config.url.slice(end)
      onChange({ ...config, url: newValue })
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, url: config.url + variable })
    }
  }

  /** Insert variable at cursor position in body textarea */
  const handleInsertBodyVariable = (variable: string) => {
    const textarea = bodyTextareaRef.current
    const currentBody = config.bodyTemplate ?? ''
    if (textarea) {
      const start = textarea.selectionStart ?? currentBody.length
      const end = textarea.selectionEnd ?? currentBody.length
      const newValue = currentBody.slice(0, start) + variable + currentBody.slice(end)
      onChange({ ...config, bodyTemplate: newValue })
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, bodyTemplate: currentBody + variable })
    }
  }

  /** Insert variable at cursor position in header value input */
  const handleInsertHeaderVariable = (variable: string) => {
    const input = headerValueInputRef.current
    if (input) {
      const start = input.selectionStart ?? newHeaderValue.length
      const end = input.selectionEnd ?? newHeaderValue.length
      const newValue = newHeaderValue.slice(0, start) + variable + newHeaderValue.slice(end)
      setNewHeaderValue(newValue)
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      setNewHeaderValue(newHeaderValue + variable)
    }
  }

  /** Add a custom header to the config */
  const handleAddHeader = () => {
    if (!newHeaderKey.trim()) return
    onChange({
      ...config,
      headers: {
        ...config.headers,
        [newHeaderKey]: newHeaderValue,
      },
    })
    setNewHeaderKey('')
    setNewHeaderValue('')
  }

  /** Remove a custom header from the config */
  const handleRemoveHeader = (key: string) => {
    const newHeaders = { ...config.headers }
    delete newHeaders[key]
    onChange({
      ...config,
      headers: Object.keys(newHeaders).length > 0 ? newHeaders : undefined,
    })
  }

  /** Only POST/PUT/PATCH have request bodies */
  const methodHasBody = ['POST', 'PUT', 'PATCH'].includes(config.method)

  return (
    <div className="space-y-4">
      {/* URL with variable picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">URL</span>
          <VariablePicker onInsert={handleInsertUrlVariable} organizationId={variableProps.organizationId} categories={variableProps.categories} />
        </div>
        <Input
          ref={urlInputRef}
          type="url"
          placeholder="https://api.example.com/webhook"
          value={config.url}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          className={`h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm ${errors?.url ? 'ring-1 ring-destructive/30' : ''}`}
        />
        {errors?.url && (
          <p className="text-xs text-destructive">{errors.url}</p>
        )}
      </div>

      {/* HTTP Method */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Method</span>
        <Select
          value={config.method}
          onValueChange={(m) => onChange({ ...config, method: m as CallWebhookConfig['method'] })}
        >
          <SelectTrigger className={`h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm ${errors?.method ? 'ring-1 ring-destructive/30' : ''}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((method) => (
              <SelectItem key={method.value} value={method.value}>
                {method.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.method && (
          <p className="text-xs text-destructive">{errors.method}</p>
        )}
      </div>

      {/* Content Type (only for methods with body) */}
      {methodHasBody && (
        <div className="space-y-2">
          <span className="text-sm font-medium">Content type</span>
          <Select
            value={config.contentType ?? 'application/json'}
            onValueChange={(ct) => onChange({ ...config, contentType: ct as CallWebhookConfig['contentType'] })}
          >
            <SelectTrigger className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Request Body (only for methods with body) */}
      {methodHasBody && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Body</span>
            <VariablePicker onInsert={handleInsertBodyVariable} organizationId={variableProps.organizationId} categories={variableProps.categories} />
          </div>
          <Textarea
            ref={bodyTextareaRef}
            placeholder={`{
  "leadId": "{{lead.id}}",
  "email": "{{lead.email}}"
}`}
            value={config.bodyTemplate ?? ''}
            onChange={(e) => onChange({ ...config, bodyTemplate: e.target.value || undefined })}
            rows={5}
            className="rounded-xl bg-accent dark:bg-background/20 border-0 text-sm font-mono"
          />
        </div>
      )}

      {/* Custom Headers */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Headers</span>

        {/* Existing headers */}
        {config.headers && Object.entries(config.headers).length > 0 && (
          <div className="space-y-2">
            {Object.entries(config.headers).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <Input
                  value={key}
                  disabled
                  className="h-9 flex-1 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm opacity-70"
                />
                <Input
                  value={value}
                  disabled
                  className="h-9 flex-1 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm opacity-70"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => handleRemoveHeader(key)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add new header row */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Header name"
            value={newHeaderKey}
            onChange={(e) => setNewHeaderKey(e.target.value)}
            className="h-9 flex-1 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
          />
          <Input
            ref={headerValueInputRef}
            placeholder="Value"
            value={newHeaderValue}
            onChange={(e) => setNewHeaderValue(e.target.value)}
            className="h-9 flex-1 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleAddHeader}
            disabled={!newHeaderKey.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex justify-end">
          <VariablePicker onInsert={handleInsertHeaderVariable} organizationId={variableProps.organizationId} categories={variableProps.categories} />
        </div>
      </div>

      {/* Security note — restyled to match design system */}
      <div className="p-3 bg-accent dark:bg-background/20 rounded-xl">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Security:</span> Avoid including sensitive credentials directly in the request body. Use headers for authentication.
        </p>
      </div>
    </div>
  )
}
