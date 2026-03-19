'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { MoreHorizontalIcon, RefreshCw, Mail, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { permissions } from '@/lib/better-auth/permissions'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import type { OrganizationMember } from './ownership-card'

interface MemberListProps {
  members: OrganizationMember[]
  onRemoveMember: (memberId: string) => void
  onEditMember: (member: OrganizationMember) => void
}

export function MemberList({
  members,
  onRemoveMember,
  onEditMember,
}: MemberListProps) {
  // Track which invitation is being processed (for loading states)
  const [processingInvitationId, setProcessingInvitationId] = useState<string | null>(null)

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  /**
   * Get active organization using centralized hook
   * This respects domain-first approach and returns correct permissions
   */
  const { activeOrganization: activeOrg, hasPermission } = useActiveOrganization()

  // Permission checks using the hasPermission helper from the hook
  const canUpdateMembers = hasPermission(permissions.MEMBER_UPDATE)
  const canDeleteMembers = hasPermission(permissions.MEMBER_DELETE)
  const canCancelInvitations = hasPermission(permissions.INVITATION_CANCEL)
  const canResendInvitations = hasPermission(permissions.INVITATION_CREATE)

  // Cancel invitation mutation
  const cancelInvitationMutation = trpc.organization.cancelInvitation.useMutation({
    onSuccess: () => {
      toast.success('Invitation cancelled')
      // Invalidate members cache to refresh the list
      if (activeOrg?.id) {
        utils.organization.getOrganizationMembers.invalidate({ organizationId: activeOrg.id })
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to cancel invitation')
    },
    onSettled: () => {
      setProcessingInvitationId(null)
    },
  })

  // Resend invitation mutation
  const resendInvitationMutation = trpc.organization.resendInvitation.useMutation({
    onSuccess: () => {
      toast.success('Invitation resent successfully')
      // Invalidate members cache since invitation ID changes
      if (activeOrg?.id) {
        utils.organization.getOrganizationMembers.invalidate({ organizationId: activeOrg.id })
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to resend invitation')
    },
    onSettled: () => {
      setProcessingInvitationId(null)
    },
  })

  /**
   * Handle cancel invitation
   * Calls the real tRPC mutation to cancel the invitation
   */
  const handleCancelInvitation = async (invitationId: string) => {
    if (!activeOrg?.id) return
    setProcessingInvitationId(invitationId)
    cancelInvitationMutation.mutate({
      organizationId: activeOrg.id,
      invitationId,
    })
  }

  /**
   * Handle resend invitation
   * Creates a new invitation with fresh expiration and sends a new email
   */
  const handleResendInvitation = async (invitationId: string) => {
    if (!activeOrg?.id) return
    setProcessingInvitationId(invitationId)
    resendInvitationMutation.mutate({
      organizationId: activeOrg.id,
      invitationId,
    })
  }

  // Check if any mutation is in progress for a specific invitation
  const isProcessing = (invitationId: string) => processingInvitationId === invitationId

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No members found</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {members.map((member) => {
        const isPending = member.isPending === true
        const isOwner =
          member.role === 'owner' ||
          member.role === 'owner' ||
          member.role === 'client-owner'

        // Get permissions from the enriched permissions field
        const permissions = member.permissions || []

        const initials = member.user.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)

        return (
          <div
            key={member.id}
            className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar className="size-10 shrink-0">
                <AvatarImage
                  src={member.user.image || undefined}
                  alt={member.user.name}
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {member.user.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {member.user.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {isPending ? (
                <>
                  {member.roleName && (
                    <Badge variant="secondary" className="hidden sm:inline-flex">
                      {member.roleName}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Pending
                  </Badge>
                </>
              ) : isOwner ? (
                <Badge variant="secondary" className="bg-muted">
                  Owner
                </Badge>
              ) : member.roleName ? (
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {member.roleName}
                </Badge>
              ) : permissions.length > 0 ? (
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {permissions.length}{' '}
                  {permissions.length === 1 ? 'permission' : 'permissions'}
                </Badge>
              ) : (
                <Badge variant="outline" className="hidden sm:inline-flex">
                  No permissions
                </Badge>
              )}

              {isPending ? (
                // Only show actions if user has permission to manage invitations
                (canResendInvitations || canCancelInvitations) ? (
                  <AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          disabled={isProcessing(member.invitationId!)}
                        >
                          {isProcessing(member.invitationId!) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontalIcon className="h-4 w-4" />
                          )}
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canResendInvitations && (
                          <DropdownMenuItem
                            onClick={() => handleResendInvitation(member.invitationId!)}
                            disabled={isProcessing(member.invitationId!)}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Resend invitation
                          </DropdownMenuItem>
                        )}
                        {canCancelInvitations && (
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={isProcessing(member.invitationId!)}
                            >
                              Cancel invitation
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel invitation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to cancel the invitation for{' '}
                          <strong>{member.user.email}</strong>? They will no longer
                          be able to accept this invitation.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isProcessing(member.invitationId!)}>
                          Keep invitation
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleCancelInvitation(member.invitationId!)}
                          disabled={isProcessing(member.invitationId!)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isProcessing(member.invitationId!) ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Cancelling...
                            </>
                          ) : (
                            'Cancel Invitation'
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null
              ) : (
                // Only show actions if user has permission to manage members
                (canUpdateMembers || canDeleteMembers) ? (
                  <AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                        >
                          <MoreHorizontalIcon className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdateMembers && (
                          <DropdownMenuItem onClick={() => onEditMember(member)}>
                            Edit permissions
                          </DropdownMenuItem>
                        )}
                        {canDeleteMembers && (
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem className="text-destructive focus:text-destructive">
                              Remove member
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove member?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove{' '}
                          <strong>{member.user.name}</strong> ({member.user.email})
                          from your organization? They will lose access to all
                          organization resources.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onRemoveMember(member.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remove Member
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
