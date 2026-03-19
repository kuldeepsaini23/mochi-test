/**
 * ============================================================================
 * SEND EMAIL ACTION CONFIG
 * ============================================================================
 *
 * Configuration form for the "Send Email" action.
 * Supports two modes via a segmented toggle:
 *
 * TEMPLATE MODE:
 * - Select from pre-built email templates
 * - Shows a scaled visual preview of the template (BlockPreview)
 * - "Edit Template" opens TemplateEditorDialog for inline editing
 * - Optional subject override with variable support
 *
 * BODY MODE:
 * - Write a plain-text email directly
 * - Subject and body fields with variable picker support
 * - Variables are interpolated at execution time via interpolate()
 *
 * Both modes share: fromEmail (required), fromName (optional).
 * Recipient is auto-resolved from context (lead.email).
 *
 * SOURCE OF TRUTH: SendEmailActionConfig
 */

'use client'

import { useRef, useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
import { Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { VariablePicker } from '@/components/global/variable-picker'
import { BlockPreview, getBackgroundStyle } from '@/components/email-builder/_lib/block-preview'
import { DEFAULT_EMAIL_SETTINGS } from '@/types/email-templates'
import { TemplateEditorDialog } from '@/app/(main)/(protected)/(dashboard-layout)/marketing/email-templates/_components/template-editor-dialog'
import { useAutomationVariables } from '../../../_lib/use-automation-variables'
import type { SendEmailActionConfig as SendEmailConfig, SendEmailMode } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Email width used for scaling the template preview */
const EMAIL_PREVIEW_WIDTH = 600

// ============================================================================
// TYPES
// ============================================================================

interface ActionSendEmailConfigProps {
  config: SendEmailConfig
  onChange: (config: SendEmailConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionSendEmailConfig({
  config,
  onChange,
  errors,
}: ActionSendEmailConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { emailTemplates, isLoading } = useAutomationBuilderData(organizationId)
  const variableProps = useAutomationVariables()
  const utils = trpc.useUtils()

  /** Current mode — defaults to 'template' for backward compat */
  const mode: SendEmailMode = config.mode ?? 'template'

  /** Template editor dialog state */
  const [editorOpen, setEditorOpen] = useState(false)

  /** Ref for the preview container — used to calculate responsive scale */
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(0.35)

  /** Refs for cursor-position variable insertion */
  const subjectInputRef = useRef<HTMLInputElement>(null)
  const subjectOverrideRef = useRef<HTMLInputElement>(null)
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Fetch the full template (with blocks + emailSettings) for the preview.
   * Only fires when we have a selected template in template mode.
   */
  const templateQuery = trpc.emailTemplates.getById.useQuery(
    { organizationId, templateId: config.emailTemplateId ?? '' },
    {
      enabled: mode === 'template' && !!config.emailTemplateId && !!organizationId,
      staleTime: 30_000,
    }
  )

  /**
   * Calculate preview scale based on container width.
   * Same pattern as TemplatePreviewCard — scales the 600px email to fit.
   */
  useEffect(() => {
    const updateScale = () => {
      if (previewContainerRef.current) {
        const containerWidth = previewContainerRef.current.offsetWidth
        const newScale = Math.min((containerWidth - 8) / EMAIL_PREVIEW_WIDTH, 0.35)
        setPreviewScale(Math.max(newScale, 0.2))
      }
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  /** Merge emailSettings with defaults for the preview */
  const previewSettings = useMemo(() => ({
    ...DEFAULT_EMAIL_SETTINGS,
    ...templateQuery.data?.emailSettings,
  }), [templateQuery.data?.emailSettings])

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  /** Switch between template and body mode */
  const handleModeChange = (newMode: SendEmailMode) => {
    onChange({ ...config, mode: newMode })
  }

  /** Handle template selection — store id + name for display */
  const handleTemplateChange = (templateId: string) => {
    const template = emailTemplates.find((t) => t.id === templateId)
    onChange({
      ...config,
      emailTemplateId: templateId,
      emailTemplateName: template?.name,
    })
  }

  /** Insert variable at cursor in the subject override input (template mode) */
  const handleInsertSubjectOverrideVariable = (variable: string) => {
    const input = subjectOverrideRef.current
    const currentValue = config.subjectOverride ?? ''
    if (input) {
      const start = input.selectionStart ?? currentValue.length
      const end = input.selectionEnd ?? currentValue.length
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
      onChange({ ...config, subjectOverride: newValue })
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, subjectOverride: currentValue + variable })
    }
  }

  /** Insert variable at cursor in the subject input (body mode) */
  const handleInsertSubjectVariable = (variable: string) => {
    const input = subjectInputRef.current
    const currentValue = config.subject ?? ''
    if (input) {
      const start = input.selectionStart ?? currentValue.length
      const end = input.selectionEnd ?? currentValue.length
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
      onChange({ ...config, subject: newValue })
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, subject: currentValue + variable })
    }
  }

  /** Insert variable at cursor in the body textarea */
  const handleInsertBodyVariable = (variable: string) => {
    const textarea = bodyTextareaRef.current
    const currentValue = config.body ?? ''
    if (textarea) {
      const start = textarea.selectionStart ?? currentValue.length
      const end = textarea.selectionEnd ?? currentValue.length
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
      onChange({ ...config, body: newValue })
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, body: currentValue + variable })
    }
  }

  /** After saving template in the editor dialog, refetch preview and list */
  const handleEditorSave = () => {
    setEditorOpen(false)
    templateQuery.refetch()
    utils.emailTemplates.list.invalidate()
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Mode toggle — uses exact shadcn TabsList / TabsTrigger classes */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Email type</span>
        <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
          <button
            type="button"
            className={cn(
              'inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow]',
              mode === 'template'
                ? 'bg-background text-foreground shadow-sm dark:text-foreground dark:border-input dark:bg-input/30'
                : 'text-foreground dark:text-muted-foreground'
            )}
            onClick={() => handleModeChange('template')}
          >
            Template
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow]',
              mode === 'body'
                ? 'bg-background text-foreground shadow-sm dark:text-foreground dark:border-input dark:bg-input/30'
                : 'text-foreground dark:text-muted-foreground'
            )}
            onClick={() => handleModeChange('body')}
          >
            Email Body
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* TEMPLATE MODE                                                     */}
      {/* ================================================================ */}
      {mode === 'template' && (
        <>
          {/* Template dropdown */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Template</span>
            <Select
              value={config.emailTemplateId ?? ''}
              onValueChange={handleTemplateChange}
              disabled={isLoading}
            >
              <SelectTrigger className={cn(
                'h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm',
                errors?.emailTemplateId && 'ring-1 ring-destructive/30'
              )}>
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-muted-foreground text-sm">Loading...</span>
                  </div>
                ) : (
                  <SelectValue placeholder="Select a template" />
                )}
              </SelectTrigger>
              <SelectContent>
                {emailTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors?.emailTemplateId && (
              <p className="text-xs text-destructive">{errors.emailTemplateId}</p>
            )}
          </div>

          {/* Template preview — shows the actual email blocks scaled down */}
          {config.emailTemplateId && (
            <div className="space-y-2">
              {templateQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : templateQuery.data?.content && templateQuery.data.content.length > 0 ? (
                <div
                  ref={previewContainerRef}
                  className="relative rounded-xl border border-border/50 overflow-hidden"
                >
                  {/* Scaled preview — exact same pattern as TemplatePreviewCard */}
                  <div
                    className="relative aspect-[3/4] overflow-hidden"
                    style={getBackgroundStyle(previewSettings.bodyBackgroundColor)}
                  >
                    {/* Absolute-positioned scaling wrapper — centers via translateX(-50%) */}
                    <div
                      className="absolute left-1/2 top-0"
                      style={{
                        width: `${EMAIL_PREVIEW_WIDTH}px`,
                        transform: `translateX(-50%) scale(${previewScale})`,
                        transformOrigin: 'top center',
                      }}
                    >
                      {/* Email container with settings-driven background */}
                      <div
                        className="shadow-sm"
                        style={{
                          width: `${EMAIL_PREVIEW_WIDTH}px`,
                          minHeight: '500px',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          ...getBackgroundStyle(
                            previewSettings.containerBackgroundColor,
                            previewSettings.containerBackgroundGradient
                          ),
                          borderRadius: `${previewSettings.containerBorderRadius}px`,
                          padding: `${previewSettings.containerPadding}px`,
                        }}
                      >
                        <div className="space-y-3">
                          {templateQuery.data.content.map((block) => (
                            <BlockPreview key={block.id} block={block} isPreviewMode />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Bottom fade gradient — matches body background */}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
                      style={{
                        background: `linear-gradient(to top, ${previewSettings.bodyBackgroundColor}, transparent)`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {/* Edit template button */}
              {templateQuery.data && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl h-8 text-xs gap-1.5"
                  onClick={() => setEditorOpen(true)}
                >
                  <Pencil className="h-3 w-3" />
                  Edit Template
                </Button>
              )}
            </div>
          )}

          {/* Subject override with variable picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Subject override</span>
              <VariablePicker
                onInsert={handleInsertSubjectOverrideVariable}
                organizationId={variableProps.organizationId}
                categories={variableProps.categories}
              />
            </div>
            <Input
              ref={subjectOverrideRef}
              value={config.subjectOverride ?? ''}
              onChange={(e) => onChange({ ...config, subjectOverride: e.target.value })}
              placeholder="Leave blank to use template subject"
              className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
            />
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* BODY MODE                                                         */}
      {/* ================================================================ */}
      {mode === 'body' && (
        <>
          {/* Subject with variable picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Subject</span>
              <VariablePicker
                onInsert={handleInsertSubjectVariable}
                organizationId={variableProps.organizationId}
                categories={variableProps.categories}
              />
            </div>
            <Input
              ref={subjectInputRef}
              value={config.subject ?? ''}
              onChange={(e) => onChange({ ...config, subject: e.target.value })}
              placeholder="Enter email subject"
              className={cn(
                'h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm',
                errors?.subject && 'ring-1 ring-destructive/30'
              )}
            />
            {errors?.subject && (
              <p className="text-xs text-destructive">{errors.subject}</p>
            )}
          </div>

          {/* Body textarea with variable picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Body</span>
              <VariablePicker
                onInsert={handleInsertBodyVariable}
                organizationId={variableProps.organizationId}
                categories={variableProps.categories}
              />
            </div>
            <Textarea
              ref={bodyTextareaRef}
              value={config.body ?? ''}
              onChange={(e) => onChange({ ...config, body: e.target.value })}
              placeholder="Write your email here... Use {{lead.firstName}} for variables"
              rows={6}
              className={cn(
                'rounded-xl bg-accent dark:bg-background/20 border-0 text-sm min-h-[120px]',
                errors?.body && 'ring-1 ring-destructive/30'
              )}
            />
            {errors?.body && (
              <p className="text-xs text-destructive">{errors.body}</p>
            )}
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* SHARED FIELDS (both modes)                                        */}
      {/* ================================================================ */}

      {/* From email (required) */}
      <div className="space-y-2">
        <span className="text-sm font-medium">From email</span>
        <Input
          type="email"
          value={config.fromEmail ?? ''}
          onChange={(e) => onChange({ ...config, fromEmail: e.target.value })}
          placeholder="noreply@yourdomain.com"
          className={cn(
            'h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm',
            errors?.fromEmail && 'ring-1 ring-destructive/30'
          )}
        />
        {errors?.fromEmail && (
          <p className="text-xs text-destructive">{errors.fromEmail}</p>
        )}
      </div>

      {/* From name (required) */}
      <div className="space-y-2">
        <span className="text-sm font-medium">From name</span>
        <Input
          value={config.fromName ?? ''}
          onChange={(e) => onChange({ ...config, fromName: e.target.value })}
          placeholder="e.g. Acme Support"
          className={cn(
            'h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm',
            errors?.fromName && 'ring-1 ring-destructive/30'
          )}
        />
        {errors?.fromName && (
          <p className="text-xs text-destructive">{errors.fromName}</p>
        )}
      </div>

      {/* Template Editor Dialog — portaled to document.body to escape sidebar stacking context */}
      {mode === 'template' && templateQuery.data && typeof document !== 'undefined' && createPortal(
        <TemplateEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          template={templateQuery.data as Parameters<typeof TemplateEditorDialog>[0]['template']}
          onSave={handleEditorSave}
          onClose={() => setEditorOpen(false)}
        />,
        document.body
      )}
    </div>
  )
}
