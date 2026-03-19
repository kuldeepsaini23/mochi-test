/**
 * ============================================================================
 * TRIGGER NODE COMPONENT
 * ============================================================================
 *
 * Node component for trigger types (amber/yellow header).
 * Triggers are the starting points of automations.
 *
 * FEATURES:
 * - No target handle (triggers are always first)
 * - Source handle at bottom
 * - Shows trigger configuration preview
 *
 * SOURCE OF TRUTH: TriggerNodeData
 */

'use client'

import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './base-node'
import type { TriggerNodeData } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

type TriggerNodeType = Node<TriggerNodeData & Record<string, unknown>, 'trigger'>

// ============================================================================
// COMPONENT
// ============================================================================

export const TriggerNode = memo(function TriggerNode({
  data,
  selected,
}: NodeProps<TriggerNodeType>) {
  const typedData = data as TriggerNodeData

  return (
    <BaseNode
      data={typedData}
      selected={selected ?? false}
      showTargetHandle={false}
      showSourceHandle={true}
    >
      {/* Trigger-specific content */}
      <TriggerPreview data={typedData} />
    </BaseNode>
  )
})

// ============================================================================
// TRIGGER PREVIEW
// ============================================================================

function TriggerPreview({ data }: { data: TriggerNodeData }) {
  const { config } = data

  switch (config.type) {
    case 'form_submitted':
      return (
        <div className="text-xs text-muted-foreground">
          {config.formName ? (
            <span>Form: {config.formName}</span>
          ) : (
            <span className="text-amber-600">Select a form</span>
          )}
        </div>
      )

    case 'pipeline_ticket_moved':
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {config.pipelineName && <div>Pipeline: {config.pipelineName}</div>}
          {config.toStageName && <div>To: {config.toStageName}</div>}
          {!config.pipelineName && (
            <span className="text-amber-600">Select a pipeline</span>
          )}
        </div>
      )

    /* Show selected product/price on the node card instead of generic description */
    case 'payment_completed':
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {config.productName ? (
            <>
              <div>Product: {config.productName}</div>
              {config.priceName && <div>Price: {config.priceName}</div>}
            </>
          ) : (
            <span>Any payment</span>
          )}
        </div>
      )

    /* Trial started — show product/price filter or "Any trial subscription" */
    case 'trial_started':
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {config.productName ? (
            <>
              <div>Product: {config.productName}</div>
              {config.priceName && <div>Price: {config.priceName}</div>}
            </>
          ) : (
            <span>Any trial subscription</span>
          )}
        </div>
      )

    /* Subscription renewed — show product/price filter or "Any subscription renewal" */
    case 'subscription_renewed':
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {config.productName ? (
            <>
              <div>Product: {config.productName}</div>
              {config.priceName && <div>Price: {config.priceName}</div>}
            </>
          ) : (
            <span>Any subscription renewal</span>
          )}
        </div>
      )

    /* Subscription cancelled — show product/price filter or "Any subscription cancellation" */
    case 'subscription_cancelled':
      return (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {config.productName ? (
            <>
              <div>Product: {config.productName}</div>
              {config.priceName && <div>Price: {config.priceName}</div>}
            </>
          ) : (
            <span>Any subscription cancellation</span>
          )}
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
