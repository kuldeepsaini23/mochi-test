/**
 * ============================================================================
 * CREATE PIPELINE TICKET ACTION CONFIG
 * ============================================================================
 *
 * Configuration form for the "Create Pipeline Ticket" action.
 * Allows selecting pipeline, stage, and ticket details.
 *
 * SOURCE OF TRUTH: CreatePipelineTicketActionConfig
 */

'use client'

import { useMemo, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { VariablePicker } from '@/components/global/variable-picker'
import { useAutomationVariables } from '../../../_lib/use-automation-variables'
import type { CreatePipelineTicketActionConfig as CreateTicketConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// TYPES
// ============================================================================

interface ActionCreatePipelineTicketConfigProps {
  config: CreateTicketConfig
  onChange: (config: CreateTicketConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionCreatePipelineTicketConfig({
  config,
  onChange,
  errors,
}: ActionCreatePipelineTicketConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { pipelines, isLoading } = useAutomationBuilderData(organizationId)
  const variableProps = useAutomationVariables()

  /** Refs for inserting variables at cursor position */
  const titleInputRef = useRef<HTMLInputElement>(null)
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const valueInputRef = useRef<HTMLInputElement>(null)

  /**
   * Get the selected pipeline.
   */
  const selectedPipeline = useMemo(() => {
    return pipelines.find((p) => p.id === config.pipelineId)
  }, [config.pipelineId, pipelines])

  /**
   * Handle pipeline selection change.
   */
  const handlePipelineChange = (pipelineId: string) => {
    const pipeline = pipelines.find((p) => p.id === pipelineId)
    onChange({
      ...config,
      pipelineId,
      pipelineName: pipeline?.name,
      stageId: undefined,
      stageName: undefined,
    })
  }

  /**
   * Handle stage selection change.
   */
  const handleStageChange = (stageId: string) => {
    const lane = selectedPipeline?.lanes.find((l) => l.id === stageId)
    onChange({
      ...config,
      stageId,
      stageName: lane?.name,
    })
  }

  /**
   * Insert variable at cursor position in title input.
   */
  const handleInsertTitleVariable = (variable: string) => {
    const input = titleInputRef.current
    const currentValue = config.titleTemplate ?? ''
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

  /**
   * Insert variable at cursor position in description textarea.
   */
  const handleInsertDescriptionVariable = (variable: string) => {
    const textarea = descriptionTextareaRef.current
    const currentValue = config.descriptionTemplate ?? ''
    if (textarea) {
      const start = textarea.selectionStart ?? currentValue.length
      const end = textarea.selectionEnd ?? currentValue.length
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
      onChange({ ...config, descriptionTemplate: newValue })
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, descriptionTemplate: currentValue + variable })
    }
  }

  /**
   * Insert variable at cursor position in value input.
   */
  const handleInsertValueVariable = (variable: string) => {
    const input = valueInputRef.current
    const currentValue = config.valueTemplate ?? ''
    if (input) {
      const start = input.selectionStart ?? currentValue.length
      const end = input.selectionEnd ?? currentValue.length
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
      onChange({ ...config, valueTemplate: newValue })
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      onChange({ ...config, valueTemplate: currentValue + variable })
    }
  }

  return (
    <div className="space-y-4">
      {/* Pipeline selection */}
      <div className="space-y-2">
        <Label htmlFor="pipeline-select">Pipeline</Label>
        <Select
          value={config.pipelineId ?? ''}
          onValueChange={handlePipelineChange}
          disabled={isLoading}
        >
          <SelectTrigger id="pipeline-select">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading pipelines...</span>
              </div>
            ) : (
              <SelectValue placeholder="Select a pipeline" />
            )}
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.pipelineId && (
          <p className="text-xs text-red-500">{errors.pipelineId}</p>
        )}
      </div>

      {/* Stage selection */}
      {selectedPipeline && (
        <div className="space-y-2">
          <Label htmlFor="stage-select">Stage</Label>
          <Select
            value={config.stageId ?? ''}
            onValueChange={handleStageChange}
          >
            <SelectTrigger id="stage-select">
              <SelectValue placeholder="Select a stage" />
            </SelectTrigger>
            <SelectContent>
              {selectedPipeline.lanes.map((lane) => (
                <SelectItem key={lane.id} value={lane.id}>
                  {lane.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.stageId && (
            <p className="text-xs text-red-500">{errors.stageId}</p>
          )}
        </div>
      )}

      {/* Ticket title */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="title-template">Ticket Title</Label>
          <VariablePicker onInsert={handleInsertTitleVariable} organizationId={variableProps.organizationId} categories={variableProps.categories} />
        </div>
        <Input
          ref={titleInputRef}
          id="title-template"
          value={config.titleTemplate ?? ''}
          onChange={(e) => onChange({ ...config, titleTemplate: e.target.value })}
          placeholder="New opportunity from {{lead.fullName}}"
        />
        <p className="text-xs text-muted-foreground">
          Supports variables like <code className="bg-muted px-1 rounded">{'{{lead.fullName}}'}</code>
        </p>
      </div>

      {/* Ticket description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="description-template">Description (optional)</Label>
          <VariablePicker onInsert={handleInsertDescriptionVariable} organizationId={variableProps.organizationId} categories={variableProps.categories} />
        </div>
        <Textarea
          ref={descriptionTextareaRef}
          id="description-template"
          value={config.descriptionTemplate ?? ''}
          onChange={(e) => onChange({ ...config, descriptionTemplate: e.target.value })}
          placeholder="Lead source: {{lead.source}}..."
          rows={3}
        />
      </div>

      {/* Ticket value */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="value-template">Value (optional)</Label>
          <VariablePicker onInsert={handleInsertValueVariable} organizationId={variableProps.organizationId} categories={variableProps.categories} />
        </div>
        <Input
          ref={valueInputRef}
          id="value-template"
          value={config.valueTemplate ?? ''}
          onChange={(e) => onChange({ ...config, valueTemplate: e.target.value })}
          placeholder="1000 or {{trigger.submissionData.budget}}"
        />
        <p className="text-xs text-muted-foreground">
          The monetary value of this ticket/deal.
        </p>
      </div>
    </div>
  )
}
