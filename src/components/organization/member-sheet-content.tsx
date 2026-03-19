'use client'

/**
 * Member Sheet Content Component
 *
 * Provides a slide-out sheet for inviting new members or editing
 * existing member permissions in an organization.
 *
 * REFACTOR: Uses useActiveOrganization hook for organization context
 * and permission checking instead of manual account lookup.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PermissionSwitches } from './permission-switches'
import {
  Loader2,
  Copy,
  Check,
  Lock,
  LockOpen,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  RoleCommandSelector,
  type OrganizationRole,
} from './role-command-selector'
import type { OrganizationMember } from './ownership-card'
import { trpc } from '@/trpc/react-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Toggle } from '@/components/ui/toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import {
  permissions as permissionConstants,
  DEFAULT_ADMIN_PERMISSIONS,
} from '@/lib/better-auth/permissions'

interface PermissionGroup {
  resource: string
  label: string
  description: string
  actions: string[]
}

interface MemberSheetContentProps {
  permissionGroups: PermissionGroup[]
  editingMember?: OrganizationMember | null
  onClose?: () => void
  organizationId?: string // Organization ID for invitations
}

export function MemberSheetContent({
  permissionGroups,
  editingMember,
  onClose,
  organizationId,
}: MemberSheetContentProps) {
  const [email, setEmail] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [originalPermissions, setOriginalPermissions] = useState<string[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [selectedGlobalRole, setSelectedGlobalRole] =
    useState<OrganizationRole | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [invitationLink, setInvitationLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isRoleLocked, setIsRoleLocked] = useState(true)
  const [originalRole, setOriginalRole] = useState<string | null>(null)

  /**
   * Get active organization from the centralized hook.
   * WHY: This respects subdomain/custom domain context for multi-tenant support.
   * The hasPermission function checks permissions against the active organization.
   */
  const {
    activeOrganization,
    hasPermission,
    isLoading: isLoadingActiveOrg,
  } = useActiveOrganization()

  /**
   * Use provided organizationId prop or fall back to active organization.
   * WHY: Some contexts may pass an explicit organizationId, otherwise use
   * the domain-aware active organization.
   */
  const orgId = organizationId || activeOrganization?.id

  /**
   * Permission check for member:update.
   * WHY: Uses hasPermission from the hook for the active organization,
   * but if an explicit organizationId prop was passed, we need to
   * check against that org instead (which requires keeping the hook's logic).
   *
   * NOTE: When organizationId prop is passed, the hasPermission from hook
   * still checks against the ACTIVE org. This is correct for most use cases
   * where the sheet is opened in the context of the active org.
   */
  const hasUpdatePermission = hasPermission(permissionConstants.MEMBER_UPDATE)

  // tRPC mutations
  const inviteMemberMutation = trpc.organization.inviteMember.useMutation()
  const updateMemberMutation =
    trpc.organization.updateMemberPermissions.useMutation()
  const updateRoleMutation =
    trpc.organization.updateOrganizationRolePermissions.useMutation()
  const utils = trpc.useUtils()

  // Fetch organization roles for role selector
  const { data: rolesData } = trpc.organization.getOrganizationRoles.useQuery(
    { organizationId: orgId! },
    { enabled: !!orgId }
  )

  useEffect(() => {
    if (editingMember) {
      setEmail(editingMember.user.email)
      const memberIsOwner =
        editingMember.role === 'owner' ||
        editingMember.role === 'owner' ||
        editingMember.role === 'client-owner'
      setIsOwner(memberIsOwner)
      setOriginalRole(editingMember.role)

      // Check if this is a custom role (has "custom-" prefix)
      const isCustomRole = editingMember.role.startsWith('custom-')

      // Reset lock state when opening sheet
      // Custom roles should NOT be locked (they're editable)
      // Reusable roles should be locked by default
      setIsRoleLocked(!isCustomRole)

      if (memberIsOwner) {
        setPermissions([])
        setOriginalPermissions([])
        setSelectedGlobalRole(null)
      } else {
        // Use the enriched permissions array from the member object
        const cleanPermissions = (editingMember.permissions || []).filter(
          (p) => !p.startsWith('organization:')
        )

        setPermissions(cleanPermissions)
        setOriginalPermissions(cleanPermissions)

        // IMPORTANT: Custom roles should NOT set selectedGlobalRole
        // They should be treated as custom permissions (selectedGlobalRole = null)
        if (isCustomRole) {
          setSelectedGlobalRole(null)
        } else {
          // Try to find matching role from organization roles (only for reusable roles)
          const matchingRole = rolesData?.find(
            (role) => role.role === editingMember.role
          )

          if (matchingRole) {
            setSelectedGlobalRole(matchingRole)
          } else {
            setSelectedGlobalRole(null)
          }
        }
      }
    } else {
      // Inviting new member - prepopulate with Admin permissions as helpful default
      setEmail('')
      setPermissions([...DEFAULT_ADMIN_PERMISSIONS])
      setOriginalPermissions([...DEFAULT_ADMIN_PERMISSIONS])
      setIsOwner(false)
      setSelectedGlobalRole(null)
      setIsRoleLocked(true)
      setOriginalRole(null)
    }
  }, [editingMember, rolesData])

  const handlePermissionsChange = useCallback((newPermissions: string[]) => {
    setPermissions(newPermissions)
  }, [])

  const handleRoleSelect = useCallback(
    (role: OrganizationRole | null) => {
      if (!role) {
        // Custom permissions selected - reset to original member permissions
        setSelectedGlobalRole(null)
        setPermissions(originalPermissions)
        return
      }

      setSelectedGlobalRole(role)

      // Special handling for admin preset role
      if (role.role === 'admin' || role.id === 'admin') {
        setPermissions([...DEFAULT_ADMIN_PERMISSIONS])
        return
      }

      // Convert permission object to array of "resource:action" strings
      const permissionArray: string[] = []
      const permObj =
        typeof role.permission === 'string'
          ? JSON.parse(role.permission)
          : role.permission

      for (const [resource, actions] of Object.entries(permObj)) {
        if (Array.isArray(actions)) {
          for (const action of actions) {
            permissionArray.push(`${resource}:${action}`)
          }
        }
      }
      setPermissions(permissionArray)
    },
    [originalPermissions]
  )

  const handleCreateNewRole = useCallback((roleName: string) => {
    // This will be used when saving the member
    setSelectedGlobalRole({
      id: 'new',
      organizationId: '',
      role: roleName,
      permission: {},
      createdAt: new Date(),
    } as OrganizationRole)
  }, [])

  const handleCloseSheet = () => {
    setEmail('')
    setPermissions([])
    setOriginalPermissions([])
    setIsOwner(false)
    setSelectedGlobalRole(null)
    setInvitationLink(null)
    setCopied(false)
    onClose?.()
  }

  /**
   * Copy invitation link to clipboard
   *
   * WHY: Sheet component has focus trap that can interfere with clipboard API
   * HOW: Blur active element first, use textarea fallback for reliability
   */
  const handleCopyInviteLink = () => {
    if (!invitationLink) return

    // Blur any focused element first (helps with Sheet focus trap)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    // Small delay to let blur take effect
    setTimeout(() => {
      // Create textarea outside any portal/focus trap
      const textarea = document.createElement('textarea')
      textarea.value = invitationLink
      textarea.setAttribute('readonly', '')

      // Position it to bypass focus traps
      textarea.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 2em;
        height: 2em;
        padding: 0;
        border: none;
        outline: none;
        box-shadow: none;
        background: transparent;
        opacity: 0;
        z-index: 99999;
      `

      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      textarea.setSelectionRange(0, textarea.value.length)

      let success = false
      try {
        success = document.execCommand('copy')
      } catch {
        success = false
      }

      document.body.removeChild(textarea)

      if (success) {
        setCopied(true)
        toast.success('Invitation link copied to clipboard!')
        setTimeout(() => setCopied(false), 2000)
      } else {
        // Try Clipboard API as final fallback
        navigator.clipboard?.writeText(invitationLink)
          .then(() => {
            setCopied(true)
            toast.success('Invitation link copied to clipboard!')
            setTimeout(() => setCopied(false), 2000)
          })
          .catch(() => toast.error('Failed to copy link'))
      }
    }, 50)
  }

  const handleSaveMember = async () => {
    if (!editingMember && !email) {
      toast.error('Please enter an email address')
      return
    }

    if (!isOwner && permissions.length === 0) {
      toast.error('Please select at least one permission')
      return
    }

    // SECURITY: Prevent inviting as owner
    if (isOwner) {
      toast.error(
        'Cannot invite users as owner. Organization owners must be set during organization creation.'
      )
      return
    }

    if (!orgId) {
      toast.error(
        'No active organization found. Please ensure you have an organization.'
      )
      return
    }

    try {
      setIsProcessing(true)

      // Determine role format
      let role: string
      if (isOwner) {
        role = 'owner'
      } else if (selectedGlobalRole) {
        if (selectedGlobalRole.id === 'new' || selectedGlobalRole.id === 'admin') {
          // New named role OR admin role - create as reusable role
          // Format: "role-name|||["permissions"]"
          role = `${selectedGlobalRole.role}|||${JSON.stringify(permissions)}`
        } else {
          // Existing global role - use role name directly
          role = selectedGlobalRole.role
        }
      } else {
        // Custom permissions - auto-generated role
        role = JSON.stringify(permissions)
      }

      if (editingMember) {
        // Check permission
        if (!hasUpdatePermission) {
          toast.error('You do not have permission to update members', {
            description:
              'Contact your organization owner to grant you the member:update permission.',
            duration: 5000,
          })
          return
        }

        /**
         * Determine if we should update the role definition vs the member assignment
         *
         * We should ONLY update the role definition (affects ALL users with this role) when:
         * 1. A reusable role is selected (not 'new' or 'admin' preset)
         * 2. The role exists in the database (not just a preset)
         * 3. The role is explicitly unlocked by the user
         * 4. The user is NOT switching from a different role (originalRole matches selectedRole)
         *
         * In all other cases, we update the member's individual role assignment.
         */
        const isActualDatabaseRole =
          selectedGlobalRole &&
          selectedGlobalRole.id !== 'new' &&
          selectedGlobalRole.id !== 'admin' &&
          rolesData?.some((r) => r.id === selectedGlobalRole.id)

        // Check if user is switching roles (different from original)
        const isSwitchingRoles = originalRole !== selectedGlobalRole?.role

        // Only update role definition if:
        // - It's an actual database role
        // - Role is explicitly unlocked
        // - User is NOT switching to a different role (they're editing the current role)
        const shouldUpdateRoleDefinition =
          isActualDatabaseRole && !isRoleLocked && !isSwitchingRoles

        if (shouldUpdateRoleDefinition) {
          // Update the OrganizationRole table (affects all users with this role)
          await updateRoleMutation.mutateAsync({
            organizationId: orgId!,
            roleId: selectedGlobalRole.id,
            permissions,
          })

          toast.success(
            `Role "${selectedGlobalRole.role}" updated successfully. All members with this role now have the updated permissions.`,
            {
              duration: 5000,
            }
          )
        } else {
          // Update member's individual role assignment
          // This handles: custom roles, switching roles, new roles, admin preset
          await updateMemberMutation.mutateAsync({
            organizationId: orgId!,
            memberId: editingMember.id,
            role,
            permissions,
          })

          toast.success(
            `Member ${editingMember.user.email} updated successfully`
          )
        }

        // Invalidate queries to refresh member list
        await utils.organization.invalidate()

        // Close sheet
        handleCloseSheet()
      } else {
        // Invite new member
        const mutationInput = {
          organizationId: orgId!, // Safe because we checked above
          email,
          role,
        }

        const result = await inviteMemberMutation.mutateAsync(mutationInput)

        // Store invitation link to show to user (since email is mocked)
        setInvitationLink(result.invitationLink)

        // Show success message with copy link button
        const roleDisplay =
          selectedGlobalRole?.id === 'new'
            ? `with role "${selectedGlobalRole.role}"`
            : 'successfully'

        toast.success(
          `Member ${email} invited ${roleDisplay}! Copy the invitation link below to share.`,
          { duration: 5000 }
        )

        // Invalidate queries to refresh member list
        await utils.organization.invalidate()

        // Don't close sheet yet - show invitation link
      }
    } catch (err: unknown) {
      // Handle tRPC errors with structured error causes
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

      // Check if this is an INSUFFICIENT_PERMISSIONS error
      if (
        errorCause &&
        'errorCode' in errorCause &&
        errorCause.errorCode === 'INSUFFICIENT_PERMISSIONS'
      ) {
        const required =
          'required' in errorCause && Array.isArray(errorCause.required)
            ? errorCause.required.join(', ')
            : 'required' in errorCause && errorCause.required
              ? String(errorCause.required)
              : 'unknown permission'

        toast.error(`You don't have the required permissions: ${required}`, {
          description:
            errorCause && 'message' in errorCause
              ? String(errorCause.message)
              : 'Contact your organization owner to grant you the necessary permissions.',
          duration: 5000,
        })
      } else {
        // Generic error handling
        toast.error(
          err instanceof Error
            ? err.message
            : `Failed to ${editingMember ? 'update' : 'invite'} member`
        )
      }
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <SheetContent className="w-full sm:max-w-md overflow-y-auto p-6">
      <SheetHeader className="p-0">
        <SheetTitle className="text-xl">
          {editingMember ? 'Edit Member' : 'Invite Member'}
        </SheetTitle>
        <SheetDescription className="text-sm">
          {editingMember
            ? 'Update permissions for this member'
            : 'Invite a new member to your organization with custom permissions'}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6">
        {/* Email Input - Only for new members */}
        {!editingMember && (
          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-sm font-medium"
            >
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="member@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isProcessing}
              className="h-11"
            />
          </div>
        )}

        {/* Show member info when editing */}
        {editingMember && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-1">
            <p className="text-sm font-medium">{editingMember.user.name}</p>
            <p className="text-sm text-muted-foreground">
              {editingMember.user.email}
            </p>
          </div>
        )}

        {/* Role Selector - Command Component */}
        {!isOwner && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Role & Permissions</Label>
              {/* Lock toggle - only show when editing an actual database role (not preset, not switching) */}
              {editingMember &&
                selectedGlobalRole &&
                selectedGlobalRole.id !== 'new' &&
                selectedGlobalRole.id !== 'admin' &&
                rolesData?.some((r) => r.id === selectedGlobalRole.id) &&
                originalRole === selectedGlobalRole.role && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        pressed={!isRoleLocked}
                        onPressedChange={(pressed) => setIsRoleLocked(!pressed)}
                        variant="outline"
                        size="sm"
                        aria-label="Toggle role lock"
                        disabled={isProcessing || !hasUpdatePermission}
                      >
                        {isRoleLocked ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <LockOpen className="h-4 w-4" />
                        )}
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {isRoleLocked
                          ? 'Unlock role to edit'
                          : 'Lock role to prevent editing'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
            </div>

            {/* Alert message when editing role definition (affects all users) */}
            {editingMember &&
              selectedGlobalRole &&
              selectedGlobalRole.id !== 'new' &&
              selectedGlobalRole.id !== 'admin' &&
              rolesData?.some((r) => r.id === selectedGlobalRole.id) &&
              !isRoleLocked &&
              originalRole === selectedGlobalRole.role && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Role update will apply to everyone with this role. To change
                    permissions for only this user, select &apos;Custom
                    Permissions&apos; from the dropdown and set new permissions.
                  </AlertDescription>
                </Alert>
              )}

            {/* Info message when editing custom role */}
            {editingMember &&
              originalRole?.startsWith('custom-') &&
              !selectedGlobalRole && (
                <Alert>
                  <AlertDescription className="text-xs">
                    This member has a custom role with individual permissions.
                    Changes will only affect this member. You can also switch to
                    a reusable role from the dropdown below.
                  </AlertDescription>
                </Alert>
              )}

            <RoleCommandSelector
              selectedRole={selectedGlobalRole}
              onRoleSelect={handleRoleSelect}
              onCreateNewRole={handleCreateNewRole}
              currentPermissions={permissions}
              organizationId={orgId}
              disabled={isProcessing || !hasUpdatePermission}
            />
            <p className="text-xs text-muted-foreground">
              Search for saved roles, create new reusable roles, or set custom
              permissions
            </p>
          </div>
        )}

        {/* Permissions Section */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Permissions</Label>
            <p className="text-xs text-muted-foreground">
              {isOwner
                ? 'Organization owners have full access to all operations'
                : editingMember
                  ? 'Select specific permissions for this member'
                  : 'Admin permissions are pre-selected as a starting point. Customize as needed or select a different role above.'}
            </p>
          </div>

          <div className="rounded-lg">
            <div className="">
              <PermissionSwitches
                onPermissionsChange={handlePermissionsChange}
                initialPermissions={permissions}
                isOwner={isOwner}
                disabled={
                  isProcessing ||
                  !hasUpdatePermission ||
                  (!!selectedGlobalRole && isRoleLocked) ||
                  selectedGlobalRole?.role === 'admin'
                }
                permissionGroups={permissionGroups}
              />
            </div>
          </div>

          {selectedGlobalRole?.role === 'admin' && (
            <p className="text-xs text-muted-foreground italic">
              Admin role permissions are preset and cannot be modified. Clear the
              role selection to customize permissions.
            </p>
          )}

          {selectedGlobalRole && selectedGlobalRole.role !== 'admin' && isRoleLocked && (
            <p className="text-xs text-muted-foreground italic">
              Permissions are locked while using a saved role.{' '}
              {editingMember
                ? 'Unlock the role to edit, or clear the role selection to customize permissions.'
                : 'Clear the role selection to customize permissions.'}
            </p>
          )}
        </div>

        {/* Invitation Link (shown after successful invitation) */}
        {invitationLink && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Invitation Link</Label>
              <p className="text-xs text-muted-foreground">
                Email is not configured yet. Share this link with the invitee to
                accept the invitation.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={invitationLink}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyInviteLink}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          {!invitationLink ? (
            <>
              <Button
                variant="outline"
                onClick={handleCloseSheet}
                disabled={isProcessing}
                className="flex-1 h-11"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveMember}
                disabled={Boolean(
                  isProcessing ||
                    isLoadingActiveOrg ||
                    !orgId ||
                    (editingMember && hasUpdatePermission === false)
                )}
                className="flex-1 h-11"
              >
                {isProcessing && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingMember ? 'Save Changes' : 'Invite Member'}
              </Button>
            </>
          ) : (
            <Button
              onClick={handleCloseSheet}
              className="flex-1 h-11"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </SheetContent>
  )
}
