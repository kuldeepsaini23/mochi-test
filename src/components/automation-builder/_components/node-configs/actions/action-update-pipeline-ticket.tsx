/**
 * ============================================================================
 * UPDATE PIPELINE TICKET ACTION CONFIG
 * ============================================================================
 *
 * Configuration form for the "Update Pipeline Ticket" action.
 * Allows selecting the target stage for the ticket.
 *
 * SOURCE OF TRUTH: UpdatePipelineTicketActionConfig
 */

'use client'

import { useMemo } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { UpdatePipelineTicketActionConfig as UpdateTicketConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// TYPES
// ============================================================================

interface ActionUpdatePipelineTicketConfigProps {
  config: UpdateTicketConfig
  onChange: (config: UpdateTicketConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionUpdatePipelineTicketConfig({
  config,
  onChange,
  errors,
}: ActionUpdatePipelineTicketConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { pipelines, isLoading } = useAutomationBuilderData(organizationId)

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
      toStageId: undefined,
      toStageName: undefined,
    })
  }

  /**
   * Handle stage selection change.
   */
  const handleStageChange = (stageId: string) => {
    const lane = selectedPipeline?.lanes.find((l) => l.id === stageId)
    onChange({
      ...config,
      toStageId: stageId,
      toStageName: lane?.name,
    })
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
        {errors?.pipelineId ? (
          <p className="text-xs text-red-500">{errors.pipelineId}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Select the pipeline containing the ticket to update.
          </p>
        )}
      </div>

      {/* Target stage selection */}
      {selectedPipeline && (
        <div className="space-y-2">
          <Label htmlFor="stage-select">Move to Stage</Label>
          <Select
            value={config.toStageId ?? ''}
            onValueChange={handleStageChange}
          >
            <SelectTrigger id="stage-select">
              <SelectValue placeholder="Select target stage" />
            </SelectTrigger>
            <SelectContent>
              {selectedPipeline.lanes.map((lane) => (
                <SelectItem key={lane.id} value={lane.id}>
                  {lane.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.toStageId && (
            <p className="text-xs text-red-500">{errors.toStageId}</p>
          )}
        </div>
      )}

      {/* Preview */}
      {config.pipelineId && config.toStageId && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-xs font-medium mb-1">This action will:</p>
          <p className="text-xs text-muted-foreground">
            Move the ticket to &quot;<span className="font-medium">{config.toStageName}</span>&quot;
            in the <span className="font-medium">{config.pipelineName}</span> pipeline.
          </p>
        </div>
      )}

      {/* Available data — shows users what variables this action can reference */}
      <div className="p-3 bg-muted/50 rounded-lg">
        <p className="text-xs font-medium mb-2">Available data:</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li><code className="bg-muted px-1 rounded">{'{{lead.id}}'}</code> - Lead ID</li>
          <li><code className="bg-muted px-1 rounded">{'{{lead.fullName}}'}</code> - Lead full name</li>
          <li><code className="bg-muted px-1 rounded">{'{{ticket.id}}'}</code> - Ticket ID (from trigger/earlier action)</li>
          <li><code className="bg-muted px-1 rounded">{'{{ticket.name}}'}</code> - Ticket name</li>
          <li><code className="bg-muted px-1 rounded">{'{{trigger.*}}'}</code> - Trigger data</li>
        </ul>
      </div>

      {/* Note about context */}
      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
        <p className="text-xs text-amber-600 dark:text-amber-400">
          <strong>Note:</strong> This action requires that the automation was triggered by a pipeline ticket event,
          or that a ticket was created earlier in the workflow.
        </p>
      </div>
    </div>
  )
}
