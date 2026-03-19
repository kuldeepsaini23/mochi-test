/**
 * Lead Sheet Component
 * Sheet that opens on the right side when clicking a lead
 *
 * DATA FETCHING MODES:
 * 1. Pass full `lead` object (for leads page which already has the data)
 * 2. Pass `leadId` + `organizationId` only (for pipeline - LeadViewer fetches internally)
 *
 * SELF-CONTAINED:
 * - LeadViewer handles all mutations internally
 * - No need to pass update handlers - component manages its own state
 * - Optional callbacks for external sync (e.g., leads page list cache)
 *
 * SOURCE OF TRUTH: LeadSheet, LeadViewer, PipelineLeadSheet
 */

'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { LeadViewer } from './lead-viewer'
import type { LeadWithRelations } from './leads-table'

/**
 * Props for when full lead data is provided externally (e.g., leads page)
 */
interface LeadSheetWithDataProps {
  lead: LeadWithRelations | null
  leadId?: never
  organizationId?: never
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Optional callback for external sync (e.g., update leads list cache)
   * WHY: Leads page may want to sync optimistic updates with its list
   */
  onUpdate?: (data: Record<string, unknown>) => void
  onTagsChange?: (tags: LeadWithRelations['tags']) => void
  isUpdating?: boolean
  defaultTab?: 'details' | 'custom-data' | 'communications' | 'activity' | 'transactions'
}

/**
 * Props for when only leadId is provided (e.g., pipeline)
 * LeadViewer will fetch lead data internally
 */
interface LeadSheetByIdProps {
  lead?: never
  leadId: string
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: (data: Record<string, unknown>) => void
  onTagsChange?: (tags: LeadWithRelations['tags']) => void
  isUpdating?: boolean
  defaultTab?: 'details' | 'custom-data' | 'communications' | 'activity' | 'transactions'
}

type LeadSheetProps = LeadSheetWithDataProps | LeadSheetByIdProps

export function LeadSheet(props: LeadSheetProps) {
  const {
    open,
    onOpenChange,
    onUpdate,
    onTagsChange,
    isUpdating,
    defaultTab,
  } = props

  /**
   * Determine which mode we're in based on props
   * WHY: Leads page passes full lead, pipeline passes just leadId
   */
  const hasLeadData = 'lead' in props && props.lead !== undefined
  const hasLeadId = 'leadId' in props && props.leadId !== undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col border-border/40"
      >
        {/* Custom header with close button */}
        <SheetHeader className="sr-only">
          <SheetTitle>Lead Details</SheetTitle>
        </SheetHeader>

        {/* Lead Viewer - Self-contained, handles all mutations internally */}
        {hasLeadData ? (
          // Mode 1: Full lead data provided (leads page)
          <LeadViewer
            lead={props.lead!}
            onUpdate={onUpdate}
            onTagsChange={onTagsChange}
            isUpdating={isUpdating}
            defaultTab={defaultTab}
          />
        ) : hasLeadId ? (
          // Mode 2: Only leadId provided (pipeline) - LeadViewer fetches internally
          <LeadViewer
            leadId={props.leadId}
            organizationId={props.organizationId}
            onUpdate={onUpdate}
            onTagsChange={onTagsChange}
            isUpdating={isUpdating}
            defaultTab={defaultTab}
          />
        ) : (
          // Fallback: No lead data - show empty state
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">No lead selected</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
