/**
 * ============================================================================
 * ACTION NODE COMPONENT
 * ============================================================================
 *
 * Node component for action types (blue header).
 * Actions perform operations as part of the workflow.
 *
 * FEATURES:
 * - Target handle at top (receives connections)
 * - Source handle at bottom (can connect to next node)
 * - Shows action configuration preview
 *
 * SOURCE OF TRUTH: ActionNodeData
 */

'use client'

import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './base-node'
import { formatDelay } from '../../_lib/utils'
import type { ActionNodeData } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

type ActionNodeType = Node<ActionNodeData & Record<string, unknown>, 'action'>

// ============================================================================
// COMPONENT
// ============================================================================

export const ActionNode = memo(function ActionNode({
  data,
  selected,
}: NodeProps<ActionNodeType>) {
  const typedData = data as ActionNodeData

  return (
    <BaseNode
      data={typedData}
      selected={selected ?? false}
      showTargetHandle={true}
      showSourceHandle={true}
    >
      {/* Action-specific content */}
      <ActionPreview data={typedData} />
    </BaseNode>
  )
})

// ============================================================================
// ACTION PREVIEW
// ============================================================================

function ActionPreview({ data }: { data: ActionNodeData }) {
  const { config } = data

  switch (config.type) {
    case 'send_email': {
      const emailMode = config.mode ?? 'template'
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {emailMode === 'template' ? (
            config.emailTemplateName ? (
              <div>Template: {config.emailTemplateName}</div>
            ) : (
              <span className="text-amber-600">Select a template</span>
            )
          ) : (
            config.subject ? (
              <div className="truncate">Subject: {config.subject}</div>
            ) : (
              <span className="text-amber-600">Write email body</span>
            )
          )}
          {config.fromEmail && <div className="opacity-75">From: {config.fromEmail}</div>}
        </div>
      )
    }

    case 'add_tag':
      return (
        <div className="text-xs text-muted-foreground">
          {config.tags && config.tags.length > 0 ? (
            <span>{config.tags.map((t) => t.name).join(', ')}</span>
          ) : (
            <span className="text-amber-600">Select tags</span>
          )}
        </div>
      )

    case 'remove_tag':
      return (
        <div className="text-xs text-muted-foreground">
          {config.tags && config.tags.length > 0 ? (
            <span>{config.tags.map((t) => t.name).join(', ')}</span>
          ) : (
            <span className="text-amber-600">Select tags</span>
          )}
        </div>
      )

    case 'create_pipeline_ticket':
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {config.pipelineName && <div>Pipeline: {config.pipelineName}</div>}
          {config.stageName && <div>Stage: {config.stageName}</div>}
          {(!config.pipelineId || !config.stageId) && (
            <span className="text-amber-600">Select pipeline & stage</span>
          )}
        </div>
      )

    case 'update_pipeline_ticket':
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {config.pipelineName && <div>Pipeline: {config.pipelineName}</div>}
          {config.toStageName && <div>To: {config.toStageName}</div>}
          {(!config.pipelineId || !config.toStageId) && (
            <span className="text-amber-600">Select pipeline & stage</span>
          )}
        </div>
      )

    case 'wait_delay':
      return (
        <div className="text-xs text-muted-foreground">
          Wait {formatDelay(config.delayAmount, config.delayUnit)}
        </div>
      )

    default:
      return (
        <div className="text-xs text-muted-foreground">
          {data.description}
        </div>
      )
  }
}
