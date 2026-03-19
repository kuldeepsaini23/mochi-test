/**
 * Lead Manager Component
 * Main wrapper for leads management with tabs
 *
 * PERMISSIONS: Receives permission flags from parent
 */

'use client'

import { LeadsTab } from './leads-tab'
import { SectionHeader } from '@/components/global/section-header'

interface LeadManagerProps {
  organizationId: string
  onRegisterOpenDialog?: (openFn: () => void) => void
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

export function LeadManager({
  organizationId,
  onRegisterOpenDialog,
  canCreate,
  canUpdate,
  canDelete,
}: LeadManagerProps) {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <SectionHeader
        title="Leads"
        description="Manage your contacts and leads"
      />

      {/* Leads Tab */}
      <LeadsTab
        organizationId={organizationId}
        onRegisterOpenDialog={onRegisterOpenDialog}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </div>
  )
}
