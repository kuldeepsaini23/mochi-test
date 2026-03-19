'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchIcon, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { MemberList } from './member-list'
import { OwnershipCard } from './ownership-card'
import { Card, CardContent } from '@/components/ui/card'
import { SectionHeader } from '../global/section-header'
import { Sheet } from '@/components/ui/sheet'
import { MemberSheetContent } from './member-sheet-content'
import { ManageRoleSheetContent } from './manage-role-sheet-content'
import { getPermissionGroups } from '@/lib/better-auth/permission-helpers'
import type { OrganizationMember } from './ownership-card'
import type { OrganizationRole } from './role-command-selector'
import { trpc } from '@/trpc/react-provider'
import { usePermission } from '@/hooks/use-permission'
import { permissions } from '@/lib/better-auth/permissions'
import { TeamLoading } from './team-loading'

interface MemberManagerProps {
  organizationId: string
}

export function MemberManager({
  organizationId,
}: MemberManagerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null)
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<OrganizationRole | null>(null)
  const [isManageRoleSheetOpen, setIsManageRoleSheetOpen] = useState(false)

  // Fetch real members from API (data is prefetched server-side)
  const {
    data: members = [],
    isLoading,
    error,
  } = trpc.organization.getOrganizationMembers.useQuery({ organizationId })

  const utils = trpc.useUtils()

  // Permission check for managing roles
  const canManageRoles = usePermission(
    organizationId,
    permissions.MEMBER_UPDATE
  )

  // Remove member mutation with optimistic updates
  const removeMemberMutation = trpc.organization.removeMember.useMutation({
    onMutate: async ({ memberId }) => {
      // Cancel ongoing queries to prevent overwriting optimistic update
      await utils.organization.getOrganizationMembers.cancel({ organizationId })

      // Save current data for rollback
      const previousMembers = utils.organization.getOrganizationMembers.getData({
        organizationId,
      })

      // Optimistically update UI - remove member immediately
      utils.organization.getOrganizationMembers.setData(
        { organizationId },
        (old) => {
          if (!old) return old
          return old.filter((member) => member.id !== memberId)
        }
      )

      return { previousMembers }
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousMembers) {
        utils.organization.getOrganizationMembers.setData(
          { organizationId },
          context.previousMembers
        )
      }

      // Handle structured errors
      const errorData =
        err && typeof err === 'object' && 'data' in err ? err.data : null
      const errorCause =
        errorData &&
        typeof errorData === 'object' &&
        'cause' in errorData &&
        errorData.cause &&
        typeof errorData.cause === 'object'
          ? errorData.cause
          : null

      if (
        errorCause &&
        'errorCode' in errorCause &&
        errorCause.errorCode === 'INSUFFICIENT_PERMISSIONS'
      ) {
        toast.error("You don't have permission to remove members", {
          description:
            'Contact your organization owner to grant you the member:delete permission.',
        })
      } else if (
        errorCause &&
        'errorCode' in errorCause &&
        errorCause.errorCode === 'VALIDATION_ERROR' &&
        'message' in errorCause &&
        typeof errorCause.message === 'string'
      ) {
        toast.error(errorCause.message || 'Failed to remove member')
      } else {
        toast.error('Failed to remove member')
      }
    },
    onSuccess: (data, variables) => {
      toast.success('Member has been removed')
    },
    onSettled: () => {
      // Always refetch after mutation (success or error) to sync with server
      utils.organization.getOrganizationMembers.invalidate({ organizationId })
    },
  })

  const handleEditMember = (member: OrganizationMember) => {
    setEditingMember(member)
    setIsEditSheetOpen(true)
  }

  const handleCloseEditSheet = () => {
    setIsEditSheetOpen(false)
    setTimeout(() => setEditingMember(null), 300)
  }

  const handleRemoveMember = (memberId: string) => {
    removeMemberMutation.mutate({
      organizationId,
      memberId,
    })
  }

  const handleOpenCreateRole = () => {
    setEditingRole(null)
    setIsManageRoleSheetOpen(true)
  }

  const handleCloseManageRoleSheet = () => {
    setIsManageRoleSheetOpen(false)
    setTimeout(() => setEditingRole(null), 300)
  }

  // Separate owner from regular members
  const owner = members.find(
    (member) =>
      member.role === 'owner' ||
      member.role === 'owner' ||
      member.role === 'client-owner'
  )

  const regularMembers = members.filter(
    (member) =>
      member.role !== 'owner' &&
      member.role !== 'owner' &&
      member.role !== 'client-owner'
  )

  const filteredMembers = regularMembers.filter((member) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      member.user.name.toLowerCase().includes(query) ||
      member.user.email.toLowerCase().includes(query)
    )
  })

  // Only show skeleton on first load (no cached data)
  if (isLoading && members.length === 0) {
    return <TeamLoading />
  }

  if (error && members.length === 0) {
    // Check if it's a permission error
    const errorData = error as { data?: { cause?: { errorCode?: string } } }
    const errorCause = errorData?.data?.cause
    const isPermissionError =
      errorCause?.errorCode === 'INSUFFICIENT_PERMISSIONS'

    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive font-medium">
            {isPermissionError
              ? "You don't have permission to view team members"
              : 'Failed to load members'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {isPermissionError
              ? 'Contact your organization owner to grant you the "member:read" permission.'
              : 'Please try again later.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Edit Member Sheet - Self-contained */}
      <Sheet
        open={isEditSheetOpen}
        onOpenChange={setIsEditSheetOpen}
      >
        <MemberSheetContent
          permissionGroups={getPermissionGroups()}
          editingMember={editingMember}
          onClose={handleCloseEditSheet}
          organizationId={organizationId}
        />
      </Sheet>

      {/* Manage Role Sheet */}
      <Sheet
        open={isManageRoleSheetOpen}
        onOpenChange={setIsManageRoleSheetOpen}
      >
        <ManageRoleSheetContent
          editingRole={editingRole}
          onClose={handleCloseManageRoleSheet}
          organizationId={organizationId}
        />
      </Sheet>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column - Team Members */}
        <div className="md:col-span-2 space-y-6">
          {/* Header Section */}
          <SectionHeader
            title="Team Members"
            description="Manage team member access and permissions"
          />

          {/* Search Bar and Manage Roles Button */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            {canManageRoles && (
              <Button
                variant="outline"
                onClick={handleOpenCreateRole}
                className="gap-2 h-10"
              >
                <ShieldCheck className="h-4 w-4" />
                Manage Roles
              </Button>
            )}
          </div>

          {/* Members List (includes pending invitations) */}
          <MemberList
            members={filteredMembers}
            onRemoveMember={handleRemoveMember}
            onEditMember={handleEditMember}
          />
        </div>

        {/* Right Column - Owner */}
        <div className="md:col-span-1 space-y-6">
          {/* Header Section */}
          <SectionHeader
            title="Organization Owner"
            description="Primary organization administrator"
          />

          {/* Owner Card */}
          <OwnershipCard owner={owner} />
        </div>
      </div>
    </>
  )
}
