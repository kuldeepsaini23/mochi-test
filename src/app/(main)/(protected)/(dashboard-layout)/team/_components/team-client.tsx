'use client'

/**
 * Team Page Client Component - Active Organization Pattern
 *
 * WHY: Displays team management interface for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSION CHECK:
 * - Owners have full access
 * - Members need MEMBER_READ permission to view team page
 *
 * Search Keywords: SOURCE OF TRUTH, TEAM PAGE, ACTIVE ORGANIZATION
 */

import { ContentLayout } from '@/components/global/content-layout'
import { InviteMemberButton } from '@/components/organization/invite-member-button'
import { MemberManager } from '@/components/organization/member-manager'
import { TeamLoading } from '@/components/organization/team-loading'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'

export function TeamClient() {
  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Permission check for viewing team members
   * Uses hook's hasPermission helper (owners have full access)
   */
  const hasAccess = hasPermission(permissions.MEMBER_READ)

  // Show skeleton only on first load when no cached data exists
  if (isLoading && !activeOrganization) {
    return (
      <ContentLayout headerActions={<InviteMemberButton />}>
        <TeamLoading />
      </ContentLayout>
    )
  }

  // No organization found - user has no org membership
  if (!activeOrganization) {
    return (
      <ContentLayout headerActions={<InviteMemberButton />}>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </ContentLayout>
    )
  }

  // User lacks permission to view team members
  if (!hasAccess) {
    return (
      <ContentLayout headerActions={<InviteMemberButton />}>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view team members
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                member:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // User has access - render the full team management interface
  return (
    <ContentLayout headerActions={<InviteMemberButton />}>
      <MemberManager organizationId={organizationId} />
    </ContentLayout>
  )
}
