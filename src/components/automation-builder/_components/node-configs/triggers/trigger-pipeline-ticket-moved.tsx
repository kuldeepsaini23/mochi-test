/**
 * ============================================================================
 * PIPELINE TICKET UPDATED TRIGGER CONFIG
 * ============================================================================
 *
 * Configuration form for the "Ticket Updated" trigger.
 * Allows selecting pipeline, source stage, and target stage.
 *
 * SOURCE OF TRUTH: PipelineTicketMovedTriggerConfig
 */

'use client'

import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Info, Loader2 } from 'lucide-react'
import type { PipelineTicketMovedTriggerConfig as PipelineTicketMovedConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// TYPES
// ============================================================================

interface TriggerPipelineTicketMovedConfigProps {
  config: PipelineTicketMovedConfig
  onChange: (config: PipelineTicketMovedConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TriggerPipelineTicketMovedConfig({
  config,
  onChange,
  errors,
}: TriggerPipelineTicketMovedConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { pipelines, isLoading } = useAutomationBuilderData(organizationId)

  /** Get the selected pipeline to show its stages */
  const selectedPipeline = useMemo(() => {
    return pipelines.find((p) => p.id === config.pipelineId)
  }, [config.pipelineId, pipelines])

  /** Handle pipeline selection — clears stage selections when pipeline changes */
  const handlePipelineChange = (pipelineId: string) => {
    if (pipelineId === 'any') {
      onChange({
        ...config,
        pipelineId: undefined,
        pipelineName: undefined,
        fromStageId: undefined,
        fromStageName: undefined,
        toStageId: undefined,
        toStageName: undefined,
      })
    } else {
      const pipeline = pipelines.find((p) => p.id === pipelineId)
      onChange({
        ...config,
        pipelineId,
        pipelineName: pipeline?.name,
        fromStageId: undefined,
        fromStageName: undefined,
        toStageId: undefined,
        toStageName: undefined,
      })
    }
  }

  /** Handle source stage selection */
  const handleFromStageChange = (stageId: string) => {
    if (stageId === 'any') {
      onChange({ ...config, fromStageId: undefined, fromStageName: undefined })
    } else {
      const lane = selectedPipeline?.lanes.find((l) => l.id === stageId)
      onChange({ ...config, fromStageId: stageId, fromStageName: lane?.name })
    }
  }

  /** Handle target stage selection */
  const handleToStageChange = (stageId: string) => {
    if (stageId === 'any') {
      onChange({ ...config, toStageId: undefined, toStageName: undefined })
    } else {
      const lane = selectedPipeline?.lanes.find((l) => l.id === stageId)
      onChange({ ...config, toStageId: stageId, toStageName: lane?.name })
    }
  }

  /** Shared select trigger classes */
  const selectClasses = 'h-9 w-auto min-w-[140px] rounded-xl bg-accent dark:bg-background/20 border-0 text-sm gap-2'

  return (
    <div className="space-y-4">
      {/* Pipeline — inline row */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium shrink-0">Pipeline</span>
        <div className="flex-1 flex justify-end">
          <Select
            value={config.pipelineId ?? 'any'}
            onValueChange={handlePipelineChange}
            disabled={isLoading}
          >
            <SelectTrigger className={selectClasses}>
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
              <SelectItem value="any">Any pipeline</SelectItem>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stage selections — only shown when a pipeline is selected */}
      {selectedPipeline && (
        <>
          {/* From stage — inline row */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium shrink-0">From</span>
            <div className="flex-1 flex justify-end">
              <Select
                value={config.fromStageId ?? 'any'}
                onValueChange={handleFromStageChange}
              >
                <SelectTrigger className={selectClasses}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any stage</SelectItem>
                  {selectedPipeline.lanes.map((lane) => (
                    <SelectItem key={lane.id} value={lane.id}>
                      {lane.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* To stage — inline row */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium shrink-0">To</span>
            <div className="flex-1 flex justify-end">
              <Select
                value={config.toStageId ?? 'any'}
                onValueChange={handleToStageChange}
              >
                <SelectTrigger className={selectClasses}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any stage</SelectItem>
                  {selectedPipeline.lanes.map((lane) => (
                    <SelectItem key={lane.id} value={lane.id}>
                      {lane.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {/* Lead requirement note — automation actions (send email, tag lead, etc.) need a lead */}
      <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
        <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
          A lead must be attached to the ticket for this automation to run.
          Actions like send email, add tag, etc. require a lead to target.
        </p>
      </div>

      {/* Available data — compact pills */}
      <div>
        <span className="text-sm font-medium">Available data</span>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[
            'ticket.id',
            'ticket.title',
            'ticket.value',
            'fromLane.name',
            'toLane.name',
            'lead.id',
          ].map((v) => (
            <code key={v} className="text-[11px] px-2 py-1 bg-accent dark:bg-background/20 rounded-lg text-muted-foreground">
              {`{{trigger.${v}}}`}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}
