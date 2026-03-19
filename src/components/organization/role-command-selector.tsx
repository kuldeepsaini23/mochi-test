'use client'

import { useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Check,
  ChevronDown,
  Plus,
  ShieldCheckIcon,
  Loader2,
  AlertCircle,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { trpc } from '@/trpc/react-provider'
import {
  RESERVED_ROLE_NAMES,
  RESERVED_ROLE_PREFIXES,
  DEFAULT_ADMIN_PERMISSIONS,
} from '@/lib/better-auth/permissions'

// Organization role type from database
// Note: createdAt comes as string from API (JSON serialization)
export interface OrganizationRole {
  id: string
  organizationId: string
  role: string
  permission: Record<string, string[]> | string
  createdAt: Date | string
}

interface RoleCommandSelectorProps {
  selectedRole: OrganizationRole | null
  onRoleSelect: (role: OrganizationRole | null) => void
  onCreateNewRole: (roleName: string) => void
  currentPermissions: string[]
  organizationId?: string
  disabled?: boolean
  /** Standalone mode - used for role management without member context */
  standalone?: boolean
  /** Callback when role is saved in standalone mode */
  onRoleSaved?: () => void
}

export function RoleCommandSelector({
  selectedRole,
  onRoleSelect,
  onCreateNewRole,
  currentPermissions,
  organizationId,
  disabled = false,
  standalone = false,
  onRoleSaved,
}: RoleCommandSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isCreatingRole, setIsCreatingRole] = useState(false)
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)
  const [roleToDelete, setRoleToDelete] = useState<{
    id: string
    name: string
  } | null>(null)

  // Fetch real roles from API
  const { data: rolesData } = trpc.organization.getOrganizationRoles.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  )

  // Mutations
  const utils = trpc.useUtils()

  const deleteRoleMutation = trpc.organization.deleteOrganizationRole.useMutation({
    onSuccess: () => {
      utils.organization.getOrganizationRoles.invalidate()
      toast.success('Role deleted successfully')
    },
    onError: (error) => {
      const errorMessage =
        error.message || 'Failed to delete role. The role may be in use.'
      toast.error(errorMessage)
    },
  })

  const createRoleMutation = trpc.organization.createOrganizationRole.useMutation({
    onSuccess: () => {
      utils.organization.getOrganizationRoles.invalidate()
      onRoleSaved?.()
    },
    onError: (error) => {
      // Error handling done in handleCreateRole
    },
  })

  // Filter out custom roles (those with "custom-" prefix) - they shouldn't appear in dropdown
  // Custom roles are per-member and should only be shown when editing that specific member
  const globalRoles = (rolesData || []).filter(
    (role) => !role.role.startsWith('custom-')
  )

  // Check if admin role already exists in saved roles
  const adminRoleExists = globalRoles.some(role => role.role === 'admin')

  // Validate role name for reserved keywords
  const validateRoleName = (
    name: string
  ): { isValid: boolean; error?: string } => {
    const normalized = name.trim().toLowerCase().replace(/\s+/g, '-')

    // Check reserved names
    if (
      RESERVED_ROLE_NAMES.includes(
        normalized as (typeof RESERVED_ROLE_NAMES)[number]
      )
    ) {
      return {
        isValid: false,
        error: `"${normalized}" is a reserved role name`,
      }
    }

    // Check reserved prefixes
    for (const prefix of RESERVED_ROLE_PREFIXES) {
      if (normalized.startsWith(prefix)) {
        return {
          isValid: false,
          error: `Role names cannot start with "${prefix}"`,
        }
      }
    }

    return { isValid: true }
  }

  // Check if search term has validation errors
  const searchValidation = search.trim() ? validateRoleName(search) : { isValid: true }

  // Check if current permissions match the Admin preset (even if not yet in DB)
  const matchesAdminPreset =
    !adminRoleExists &&
    currentPermissions.length === DEFAULT_ADMIN_PERMISSIONS.length &&
    DEFAULT_ADMIN_PERMISSIONS.every((p) => currentPermissions.includes(p))

  // Track if current permissions match any existing role
  const matchingRole = matchesAdminPreset
    ? {
        id: 'admin',
        organizationId: organizationId || '',
        role: 'admin',
        permission: {},
        createdAt: new Date(),
      }
    : globalRoles.find((role) => {
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

        // Check if permissions match exactly
        if (permissionArray.length !== currentPermissions.length) return false
        return permissionArray.every((p) => currentPermissions.includes(p))
      })

  const handleSelect = (role: OrganizationRole | null) => {
    onRoleSelect(role)
    setOpen(false)
  }

  const handleCreateRole = async () => {
    if (search.trim() && currentPermissions.length > 0) {
      const normalizedName = search.trim().toLowerCase().replace(/\s+/g, '-')

      // Validate role name
      const validation = validateRoleName(search)
      if (!validation.isValid) {
        toast.error(validation.error || 'Invalid role name')
        return
      }

      setIsCreatingRole(true)

      try {
        if (standalone) {
          // STANDALONE MODE: Create role in database immediately
          await createRoleMutation.mutateAsync({
            organizationId: organizationId!,
            roleName: search.trim(),
            permissions: currentPermissions,
          })

          toast.success(`Role "${search.trim()}" created successfully!`, {
            description: 'You can now assign this role to team members.',
          })
          setOpen(false)
          setSearch('')
        } else {
          // MEMBER MODE: Prepare role for member assignment
          const createdRole: OrganizationRole = {
            id: 'new',
            organizationId: organizationId || '',
            role: normalizedName,
            permission: {},
            createdAt: new Date(),
          }

          toast.success(
            `Role "${normalizedName}" prepared. Save the member to create the role.`
          )
          setOpen(false)
          setSearch('')

          // Notify parent component about the new role
          onCreateNewRole(normalizedName)
          await new Promise((resolve) => setTimeout(resolve, 100))
          onRoleSelect(createdRole)
        }
      } catch (error) {
        // Handle tRPC errors
        const errorData =
          error && typeof error === 'object' && 'data' in error ? error.data : null
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
          'message' in errorCause &&
          typeof errorCause.message === 'string'
        ) {
          toast.error(errorCause.message)
        } else {
          toast.error(
            error instanceof Error
              ? error.message
              : `Failed to ${standalone ? 'create' : 'prepare'} role`
          )
        }
      } finally {
        setIsCreatingRole(false)
      }
    }
  }

  const handleSelectAdminRole = async () => {
    if (standalone) {
      // STANDALONE MODE: Create admin role in database immediately
      setIsCreatingRole(true)
      try {
        await createRoleMutation.mutateAsync({
          organizationId: organizationId!,
          roleName: 'admin',
          permissions: [...DEFAULT_ADMIN_PERMISSIONS],
        })

        toast.success('Admin role created successfully!', {
          description: 'You can now assign this role to team members.',
        })
        setOpen(false)
      } catch (error) {
        // Handle errors
        const errorData =
          error && typeof error === 'object' && 'data' in error ? error.data : null
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
          'message' in errorCause &&
          typeof errorCause.message === 'string'
        ) {
          toast.error(errorCause.message)
        } else {
          toast.error(error instanceof Error ? error.message : 'Failed to create admin role')
        }
      } finally {
        setIsCreatingRole(false)
      }
    } else {
      // MEMBER MODE: Select admin role for member assignment
      const adminRole: OrganizationRole = {
        id: 'admin',
        organizationId: organizationId || '',
        role: 'admin',
        permission: {},
        createdAt: new Date(),
      }
      onRoleSelect(adminRole)
      setOpen(false)
    }
  }

  const getDisplayValue = () => {
    if (selectedRole?.role) {
      const displayName = getRoleDisplayName(selectedRole.role)
      return displayName
    }
    if (matchingRole?.role && !selectedRole) {
      const displayName = getRoleDisplayName(matchingRole.role)
      return `${displayName} (auto-detected)`
    }
    return 'Custom Role'
  }

  // Helper to extract display name from role
  // Format: "admin" → "Admin"
  // Format: "orgId_role-name" → "role-name"
  const getRoleDisplayName = (roleName: string): string => {
    if (roleName === 'admin') {
      return 'Admin'
    }
    // Extract role name after org prefix (if any)
    const displayName = roleName.split('_')[1] || roleName
    // Capitalize first letter
    return displayName.charAt(0).toUpperCase() + displayName.slice(1)
  }

  // Check if admin role is selected
  const isAdminRole = selectedRole?.role === 'admin' || selectedRole?.id === 'admin'

  const handleDeleteRole = (
    e: React.MouseEvent,
    roleId: string,
    roleName: string
  ) => {
    e.stopPropagation() // Prevent selecting the role when clicking delete

    // Check if it's a reserved role (check the actual role name, not display name)
    if (
      RESERVED_ROLE_NAMES.includes(
        roleName as (typeof RESERVED_ROLE_NAMES)[number]
      )
    ) {
      const displayName = getRoleDisplayName(roleName)
      toast.error(`Cannot delete reserved role "${displayName}"`)
      return
    }

    // Open confirmation dialog
    const displayName = getRoleDisplayName(roleName)
    setRoleToDelete({
      id: roleId,
      name: displayName,
    })
  }

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return

    setDeletingRoleId(roleToDelete.id)

    try {
      await deleteRoleMutation.mutateAsync({
        organizationId: organizationId!,
        roleId: roleToDelete.id,
      })

      // If the deleted role was selected, clear the selection
      if (selectedRole?.id === roleToDelete.id) {
        onRoleSelect(null)
      }
    } finally {
      setDeletingRoleId(null)
      setRoleToDelete(null)
    }
  }

  return (
    <>
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-11"
          disabled={disabled || isCreatingRole}
        >
          <div className="flex items-center gap-2 truncate">
            {isCreatingRole ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : selectedRole ? (
              <ShieldCheckIcon size={15} />
            ) : null}
            <span className="truncate">
              {isCreatingRole ? 'Creating role...' : getDisplayValue()}
            </span>
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search roles or create new..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() && currentPermissions.length > 0 ? (
                <div className="py-6 text-center">
                  {!searchValidation.isValid ? (
                    <div className="px-4">
                      <div className="flex items-center justify-center gap-2 text-destructive mb-2">
                        <AlertCircle className="h-4 w-4" />
                        <p className="text-sm font-medium">Invalid role name</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {searchValidation.error}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-3">
                        No role found with name &quot;{search}&quot;
                      </p>
                      <Button
                        size="sm"
                        onClick={handleCreateRole}
                        disabled={isCreatingRole}
                        className="gap-2"
                      >
                        {isCreatingRole ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        {isCreatingRole
                          ? 'Creating...'
                          : `Create "${search.toLowerCase().replace(/\s+/g, '-')}" role`}
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {currentPermissions.length === 0
                    ? 'Select permissions first to create a role'
                    : 'No roles found'}
                </p>
              )}
            </CommandEmpty>

            {/* Default Roles - only show if not already created */}
            {!adminRoleExists && (
              <CommandGroup heading="Built-in Roles">
                <CommandItem value="admin" onSelect={handleSelectAdminRole}>
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      isAdminRole ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Admin</p>
                      <Badge variant="secondary" className="text-xs">
                        Built-in
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Full permissions except billing &amp; integrations
                    </p>
                  </div>
                </CommandItem>
              </CommandGroup>
            )}

            {/* Custom Permissions Option */}
            <CommandSeparator />
            <CommandGroup heading="Custom">
              <CommandItem
                value="custom-permissions"
                onSelect={() => handleSelect(null)}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    !selectedRole && !matchingRole ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div className="flex-1">
                  <p className="font-medium">Custom Permissions</p>
                  <p className="text-xs text-muted-foreground">
                    Set permissions manually
                  </p>
                </div>
              </CommandItem>
            </CommandGroup>

            {/* Existing Global Roles */}
            {globalRoles.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Saved Roles">
                  {globalRoles.map((role) => {
                    if (!role?.role) return null

                    const displayName = getRoleDisplayName(role.role)
                    const isSelected = selectedRole?.id === role.id
                    const isMatching = matchingRole?.id === role.id
                    const isReserved = RESERVED_ROLE_NAMES.includes(
                      role.role as (typeof RESERVED_ROLE_NAMES)[number]
                    )
                    const isDeleting = deletingRoleId === role.id
                    const isAdminSavedRole = role.role === 'admin'

                    return (
                      <CommandItem
                        key={role.id}
                        value={displayName}
                        onSelect={() => handleSelect(role)}
                        className="group"
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 shrink-0',
                            isSelected || (isMatching && !selectedRole)
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{displayName}</p>
                            {isAdminSavedRole && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                Built-in
                              </Badge>
                            )}
                            {isMatching && !selectedRole && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                Auto-detected
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {
                              Object.keys(
                                typeof role.permission === 'string'
                                  ? JSON.parse(role.permission)
                                  : role.permission
                              ).length
                            }{' '}
                            resource groups
                          </p>
                        </div>
                        {!isReserved && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 ml-2 shrink-0 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity"
                            onClick={(e) => handleDeleteRole(e, role.id, role.role)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}

            {/* Create New Role */}
            {search.trim() &&
              currentPermissions.length > 0 &&
              searchValidation.isValid &&
              search.toLowerCase().trim() !== 'admin' &&
              !globalRoles.some(
                (r) =>
                  getRoleDisplayName(r.role).toLowerCase() ===
                  search.toLowerCase().replace(/\s+/g, '-')
              ) && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Create New">
                    <CommandItem
                      onSelect={handleCreateRole}
                      disabled={isCreatingRole}
                    >
                      {isCreatingRole ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">
                          {isCreatingRole
                            ? 'Creating role...'
                            : `Create "${search.toLowerCase().replace(/\s+/g, '-')}"`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Save current permissions as reusable role
                        </p>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>

    {/* Delete Role Confirmation Dialog */}
    <AlertDialog
      open={!!roleToDelete}
      onOpenChange={(open) => !open && setRoleToDelete(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Role?</AlertDialogTitle>
          <AlertDialogDescription>
            This is a destructive action. All members assigned to the &quot;
            {roleToDelete?.name}&quot; role will lose their access. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!deletingRoleId}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDeleteRole}
            disabled={!!deletingRoleId}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deletingRoleId ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}
