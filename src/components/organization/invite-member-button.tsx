'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Plus } from 'lucide-react'
import { MemberSheetContent } from './member-sheet-content'
import { getPermissionGroups } from '@/lib/better-auth/permission-helpers'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'
import { useActiveOrganization } from '@/hooks/use-active-organization'

/**
 * Invite Member Button Component
 *
 * WHY: Provides a button to invite new team members with feature gate checking.
 * HOW: Uses the FeatureGate component to wrap the trigger button — FeatureGate
 *      intercepts clicks when at the team_seats limit and shows the upgrade modal
 *      internally, so no manual upgrade modal state is needed here.
 *
 * NOTE: We use a controlled Sheet (no SheetTrigger) because FeatureGate returns
 *       a Fragment wrapper, which is incompatible with SheetTrigger's asChild prop.
 *       Instead, the Button's onClick opens the sheet, and FeatureGate intercepts
 *       that click when the limit is reached.
 */
export function InviteMemberButton() {
  const [isOpen, setIsOpen] = useState(false)

  /**
   * Get active organization using centralized hook.
   * This respects domain-first approach and returns correct permissions.
   */
  const { hasPermission } = useActiveOrganization()

  /** Check permission to invite members using the hook's helper */
  const canInviteMembers = hasPermission(permissions.INVITATION_CREATE)

  /** Close handler passed to the sheet content */
  const handleClose = () => {
    setIsOpen(false)
  }

  /** Hide button entirely if user doesn't have invite permission */
  if (!canInviteMembers) {
    return null
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {/* FeatureGate wraps the button and intercepts clicks at limit */}
      <FeatureGate feature="team_seats.limit">
        <Button className="gap-2" onClick={() => setIsOpen(true)}>
          <Plus className="h-4 w-4" />
          Invite Member
        </Button>
      </FeatureGate>

      <MemberSheetContent
        permissionGroups={getPermissionGroups()}
        editingMember={null}
        onClose={handleClose}
      />
    </Sheet>
  )
}
