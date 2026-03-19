/**
 * ============================================================================
 * AUTOMATION BUILDER - MAIN COMPONENT
 * ============================================================================
 *
 * The main automation builder component that combines all subcomponents.
 * Uses React Flow for the node-based canvas.
 *
 * LAYOUT:
 * ┌────────────────────────────────────────────────────────┐
 * │                       NAVBAR                            │
 * │ [Back] Automation Name    [Build|Activity] [Save][Status]│
 * ├──────────────┬──────────────────────────────┬──────────┤
 * │              │                              │          │
 * │   NODE       │           CANVAS             │ DRAWER   │
 * │   SIDEBAR    │      (React Flow)            │ (Props)  │
 * │              │                              │          │
 * │  Triggers    │                              │          │
 * │  Actions     │                              │          │
 * │  Conditions  │                              │          │
 * │              │                              │          │
 * └──────────────┴──────────────────────────────┴──────────┘
 *
 * SOURCE OF TRUTH: Automation, AutomationBuilderTypes, AutomationBuilderState
 */

'use client'

import { ReactFlowProvider } from '@xyflow/react'
import { AutomationBuilderProvider } from './_lib/automation-builder-context'
import { AutomationBuilderContent } from './_components/automation-builder-content'
import type { AutomationBuilderProps } from './_lib/types'

/**
 * AutomationBuilder - Main entry point for the automation builder.
 *
 * Wraps the builder content with necessary providers:
 * - ReactFlowProvider: For React Flow's internal state
 * - AutomationBuilderProvider: For automation-specific state
 */
export function AutomationBuilder(props: AutomationBuilderProps) {
  return (
    <ReactFlowProvider>
      <AutomationBuilderProvider
        automationId={props.automationId}
        organizationId={props.organizationId}
        initialAutomation={props.initialAutomation}
      >
        <AutomationBuilderContent {...props} />
      </AutomationBuilderProvider>
    </ReactFlowProvider>
  )
}
