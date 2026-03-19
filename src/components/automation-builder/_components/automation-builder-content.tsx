/**
 * ============================================================================
 * AUTOMATION BUILDER CONTENT
 * ============================================================================
 *
 * The main content component that renders the builder UI.
 * Contains navbar, sidebar, canvas, and drawer.
 *
 * WHY SEPARATE FROM MAIN COMPONENT:
 * - Allows providers to be set up before accessing context
 * - Cleaner separation of provider setup and UI rendering
 *
 * SOURCE OF TRUTH: AutomationBuilderState
 */

'use client'

import { useCallback } from 'react'
import { useAutomationBuilder } from '../_lib/automation-builder-context'
import { AutomationNavbar } from './navbar'
import { NodeSidebar } from './node-sidebar'
import { AutomationCanvas } from './automation-canvas'
import { PropertiesDrawer } from './properties-drawer'
import { RunHistoryPanel } from './run-history'
import { cn } from '@/lib/utils'
import type { AutomationBuilderProps, Automation, AutomationStatus } from '../_lib/types'

// ============================================================================
// COMPONENT
// ============================================================================

type AutomationBuilderContentProps = Pick<AutomationBuilderProps, 'organizationId' | 'automationId' | 'slug' | 'initialAutomation' | 'onSave' | 'onStatusChange' | 'onSlugChange' | 'onClose'>

export function AutomationBuilderContent({
  organizationId,
  automationId,
  slug,
  initialAutomation,
  onSave,
  onStatusChange,
  onSlugChange,
  onClose,
}: AutomationBuilderContentProps) {
  const {
    state,
    dispatch,
    canUndo,
    canRedo,
    actions,
  } = useAutomationBuilder()

  /**
   * Build automation object from current state.
   * Used by both manual save and auto-save.
   */
  const buildAutomation = useCallback((): Automation => {
    return {
      id: state.id,
      organizationId,
      name: state.name,
      description: state.description,
      status: state.status,
      schema: state.schema,
      createdAt: initialAutomation?.createdAt ?? new Date(),
      updatedAt: new Date(),
      stats: initialAutomation?.stats ?? {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
      },
    }
  }, [state, organizationId, initialAutomation])

  /**
   * Handle saving the automation.
   * Called by both manual save button and auto-save.
   */
  const handleSave = useCallback(async () => {
    if (!onSave) return
    const automation = buildAutomation()
    await onSave(automation)
    dispatch({ type: 'MARK_SAVED' })
  }, [buildAutomation, onSave, dispatch])

  /**
   * Handle status changes (activate, pause, etc.)
   */
  const handleStatusChange = useCallback(async (status: AutomationStatus) => {
    if (!onStatusChange) return
    await onStatusChange(status)
    dispatch({ type: 'SET_STATUS', payload: { status } })
  }, [onStatusChange, dispatch])

  /**
   * Handle closing the builder.
   * Shows confirmation if there are unsaved changes.
   */
  const handleClose = useCallback(() => {
    if (state.isDirty) {
      // In production, show a confirmation dialog
      const confirmClose = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      )
      if (!confirmClose) return
    }
    onClose?.()
  }, [state.isDirty, onClose])

  return (
    <div className={cn(
      'flex h-full p-3 overflow-hidden transition-colors duration-300',
      state.selection.selectedNodeId
        ? 'dark:bg-sidebar/80 bg-background'
        : 'bg-accent dark:bg-muted/50'
    )}>
      {/* Main area — rounded canvas window with floating navbar */}
      <div className="relative flex-1 min-w-0 rounded-3xl overflow-hidden">
        {state.activeTab === 'build' ? (
          <>
            <AutomationCanvas />
            <NodeSidebar />
          </>
        ) : (
          <RunHistoryPanel automationId={state.id} organizationId={organizationId} />
        )}

        {/* Floating navbar — overlays the canvas like a toolbar */}
        <AutomationNavbar
          name={state.name}
          slug={slug}
          status={state.status}
          activeTab={state.activeTab}
          isDirty={state.isDirty}
          schema={state.schema}
          autoSaveEnabled={state.autoSaveEnabled}
          canUndo={canUndo}
          canRedo={canRedo}
          onAutoSaveChange={actions.setAutoSave}
          onNameChange={actions.setName}
          onSlugChange={onSlugChange}
          onTabChange={actions.setActiveTab}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
          onUndo={actions.undo}
          onRedo={actions.redo}
          onClose={handleClose}
        />
      </div>

      {/* Inline properties panel — slides in as a rounded right column */}
      <PropertiesDrawer />
    </div>
  )
}
