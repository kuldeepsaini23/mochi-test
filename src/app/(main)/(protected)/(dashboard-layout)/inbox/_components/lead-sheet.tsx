'use client'

/**
 * Inbox Lead Sheet Component
 *
 * WHY: Display lead/contact information for the selected message sender in inbox
 * HOW: Uses the self-contained LeadViewer component with hideCommunications
 *
 * DESIGN:
 * - Always visible (not a dialog/sheet)
 * - Hides communications tab (we're already in inbox)
 * - Background matches sidebar for visual consistency
 * - Fully editable - all mutations handled internally by LeadViewer
 * - PERSISTS TAB SELECTION - when switching leads, stays on the same tab
 *
 * SOURCE OF TRUTH: InboxLeadSheet, LeadViewer integration, PersistTabSelection
 */

import { useState } from 'react'
import { User } from 'lucide-react'
import { LeadViewer, type LeadViewerTab } from '@/app/(main)/(protected)/(dashboard-layout)/leads/_components/lead-viewer'

// ============================================================================
// TYPES
// ============================================================================

interface LeadSheetProps {
  /**
   * Lead ID from the selected conversation's sender
   * When null, shows empty state prompting user to select a message
   */
  leadId: string | null
  /**
   * Organization ID for fetching lead data
   * Required to scope the lead query to the correct organization
   */
  organizationId: string
}

/**
 * Available tabs for inbox (excludes communications since we're already in inbox)
 */
type InboxLeadTab = Exclude<LeadViewerTab, 'communications'>

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

/**
 * Empty state when no message is selected
 * WHY: Guides user to select a conversation to view lead info
 */
function EmptyState() {
  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b">
        <span className="text-sm font-medium">Lead Info</span>
      </div>

      {/* Empty state content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <User className="size-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">
            Select a message to view lead details
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LeadSheet({ leadId, organizationId }: LeadSheetProps) {
  /**
   * Persisted tab state - maintains selection when switching between leads
   * WHY: User shouldn't have to re-select their preferred tab every time they click a different message
   * NOTE: This is lifted out of LeadViewer so it persists across lead changes
   */
  const [activeTab, setActiveTab] = useState<InboxLeadTab>('details')

  // Show empty state when no message is selected
  if (!leadId) {
    return <EmptyState />
  }

  /**
   * Use the self-contained LeadViewer component in CONTROLLED mode
   * WHY: By controlling the tab state from here, we persist the tab selection
   *      when the user switches between different leads/conversations
   *
   * Props:
   * - leadId + organizationId: Fetches lead data internally
   * - hideCommunications: We're already in inbox, don't need that tab
   * - activeTab + onTabChange: Controlled tab state for persistence
   *
   * NOTE: No key prop needed - LeadViewer handles lead changes internally
   *       and we WANT state to persist (that's the whole point)
   */
  return (
    <div className="flex flex-col h-full bg-sidebar">
      <LeadViewer
        leadId={leadId}
        organizationId={organizationId}
        hideCommunications={true}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as InboxLeadTab)}
      />
    </div>
  )
}
